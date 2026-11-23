// Backend unit tests (synthetic data only). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitise } from '../src/backend/lib/logger.js';
import { AppError, ErrorCode, toEnvelope, ok } from '../src/backend/lib/errors.js';
import * as validate from '../src/backend/lib/validate.js';
import { configFor, FEATURES, settingsFromEnv } from '../src/backend/lib/config.js';
import { createFakeRepos } from './fakes.mjs';
import { buildScreeningText } from '../src/core/screening-text.js';
import { presentScreening } from '../src/backend/services/presenter.js';
import { pipelineVersion } from '../src/core/analyse.js';
import { adfToBlocks } from '../src/core/text.js';
import { createDeskServices } from '../src/backend/services/desk.js';
import { createReviewService } from '../src/backend/services/review.js';
import { createGateService } from '../src/backend/services/gate.js';
import { createLedgerService } from '../src/backend/services/ledger.js';

const silentLog = { info() {}, warn() {}, error() {} };
const ADF = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goal' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Add session replay to checkout.' }, { type: 'hardBreak' }, { type: 'text', text: 'Second line.' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Record clicks' }] }] }] },
    { type: 'paragraph', content: [] },
  ],
};

function fakeJira({ admin = false, deny = false, adminThrows = false, visible = null, reviewers = [] } = {}) {
  return {
    groupsOf: async (id) => (reviewers.includes(id) ? ['article25-reviewers'] : []),
    searchUsers: async () => reviewers.map((accountId) => ({ accountId, displayName: `Reviewer ${accountId}`, active: true })),
    usersBulk: async (ids) => new Map(ids.map((id) => [id, { displayName: `User ${id}`, active: true }])),
    async getIssueDocument(key) {
      if (deny) throw new AppError(ErrorCode.NOT_FOUND);
      return { id: '10042', key: /^\d+$/.test(key) ? 'SHOP-42' : key, summary: 'Add session replay', description: ADF, status: 'To Do', statusCategory: 'new', projectKey: 'SHOP', projectName: 'Shop', issueType: 'Task' };
    },
    async getIssueForScreening(key) {
      if (deny) throw new AppError(ErrorCode.NOT_FOUND);
      return { id: '10042', key: /^\d+$/.test(key) ? 'SHOP-42' : key, projectKey: 'SHOP', summary: 'Add session replay', description: ADF };
    },
    statusName: async (id) => `Status ${id}`,
    searchWorkflowsWithTransitions: async () => ({ workflows: [], statuses: [] }),
    async visibleIssues(ids) {
      return new Map(ids.filter((id) => !visible || visible.includes(id)).map((id) => [id, { key: `SHOP-${id}`, summary: `Synthetic ${id}`, projectKey: 'SHOP' }]));
    },
    async isJiraAdmin() {
      if (adminThrows) throw new AppError(ErrorCode.UPSTREAM_UNAVAILABLE);
      return admin;
    },
  };
}
const svc = (opts = {}) => {
  const fake = opts.fake ?? createFakeRepos();
  const screening = { aiAvailable: false, requestManual: async () => ({ status: 'queued' }) };
  const jira = fakeJira(opts);
  const settings = settingsFromEnv({});
  const ledger = createLedgerService({ repos: fake.repos, log: silentLog, settings, siteId: 'site-test' });
  const review = createReviewService({ repos: fake.repos, jira, log: silentLog, settings, siteId: 'site-test', ledger });
  const gate = createGateService({ repos: fake.repos, jira, log: silentLog, settings, siteId: 'site-test', ledger });
  return createDeskServices({ jira, config: configFor('DEVELOPMENT'), log: silentLog, repos: fake.repos, screening, settings, review, gate, ledger });
};

// ---- logger: content-free by construction
test('logger drops non-allow-listed fields (summary, accountId, email, quote)', () => {
  const out = sanitise({ evt: 'x', summary: 'Add session replay', accountId: '712020:abc', email: 'a@b.c', quote: 'diabetes', ms: 12.345 });
  assert.deepEqual(out, { evt: 'x', ms: 12.35 });
});
test('logger rejects unsafe strings and non-numeric metrics', () => {
  assert.deepEqual(sanitise({ evt: 'has spaces and text', route: '/review/:key', value: 'NaN', issueId: '10042' }), { route: '/review/:key', issueId: '10042' });
  assert.deepEqual(sanitise({ issueId: 'SHOP-42' }), {});
});

// ---- errors
test('error envelope hides internal error details and marks retryable codes', () => {
  assert.deepEqual(toEnvelope(new Error('db password=secret')), { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong in Article25. Try again.', retryable: true } });
  // Final audit: a missing table (first minutes after install) is a retryable SETTING_UP, not a generic failure,
  // and the raw SQL message is never echoed.
  const setup = toEnvelope(new Error("Table 'article25.decisions' doesn't exist"));
  assert.deepEqual([setup.error.code, setup.error.retryable, /article25\.decisions/.test(setup.error.message)], ['SETTING_UP', true, false]);
  const forgeShape = Object.assign(new Error('Unknown SQL execution error'), { code: 'SQL_EXECUTION_ERROR', context: { debug: { errno: 1146 } } });
  assert.equal(toEnvelope(forgeShape).error.code, 'SETTING_UP');
  assert.equal(toEnvelope(Object.assign(new Error('Unknown SQL execution error'), { code: 'SQL_EXECUTION_ERROR' })).error.code, 'INTERNAL');
  assert.equal(toEnvelope(new AppError(ErrorCode.NOT_AUTHORISED)).error.retryable, false);
  assert.deepEqual(ok({ a: 1 }), { ok: true, data: { a: 1 } });
});

// ---- validation
test('issue key validation accepts real keys and rejects injection attempts', () => {
  assert.equal(validate.issueKey('shop-42'), 'SHOP-42');
  for (const bad of ['', 'SHOP', 'SHOP-0', '../SHOP-1', 'SHOP-1?fields=*', 'SHOP-1 OR 1=1']) assert.throws(() => validate.issueKey(bad), /not a valid work item key/);
});
test('client metrics accept fixed names and finite numbers only', () => {
  assert.deepEqual(validate.clientMetrics({ surface: 'panel', metrics: { firstContentMs: 812, invokeMs: -1, note: 5, domContentLoadedMs: Infinity } }), { surface: 'panel', metrics: { firstContentMs: 812 } });
  assert.throws(() => validate.clientMetrics({ surface: 'admin', metrics: {} }));
});

// ---- environment config
test('unknown environment falls back to production settings', () => {
  assert.equal(configFor('DEVELOPMENT').label, 'Development');
  assert.equal(configFor(undefined).name, 'production');
  assert.equal(configFor('PRODUCTION').label, null);
});

// ---- ADF text
test('adfToBlocks keeps block structure and inline breaks, skips empty paragraphs', () => {
  const { blocks, truncated } = adfToBlocks(ADF);
  assert.equal(truncated, false);
  assert.deepEqual(blocks, [
    { kind: 'heading', text: 'Goal' },
    { kind: 'paragraph', text: 'Add session replay to checkout.\nSecond line.' },
    { kind: 'listItem', text: 'Record clicks' },
  ]);
  assert.deepEqual(adfToBlocks(null).blocks, []);
});

// ---- services (desk): access control and real screening state
const SCREENING_ROW = (fp) => ({ issue_id: '10042', issue_key: 'SHOP-42', project_key: 'SHOP', state: 'SCREENED', outcome: 'REVIEW_REQUIRED', screening_id: 'sid', screened_fp: fp, request_seq: 1, processed_seq: 1, lease_token: null, lease_until: null, attempts: 0, last_error: null, version: 1, created_at: 1, updated_at: 1 });
const SCREENING = { screeningId: 'sid', issueId: '10042', fp: 'x', pipelineVersion: pipelineVersion('rules'), mode: 'rules', outcome: 'REVIEW_REQUIRED', result: { rulesVersion: 'r1.0.0', reasons: [{ ruleId: 'R-SENS', outcome: 'REVIEW_REQUIRED', params: {} }], trace: [], findings: [{ id: 'f1', index: 1, kind: 'sensitive_data', signal: 'health', certainty: 'stated', severity: 'high', isNew: false, provenance: 'rules', evidence: { start: 0, end: 4, source: { field: 'summary', blockIndex: -1, start: 0, end: 4 }, excerpt: 'Add ' } }] }, quality: { rejected: 0, dropped: 0 }, aiStatus: 'not_enabled', createdAt: 5 };
const currentFp = buildScreeningText({ summary: 'Add session replay', description: ADF }).fingerprint;
async function seeded(fp) {
  const fake = createFakeRepos();
  fake.items.set('10042', SCREENING_ROW(fp));
  fake.scr.set('sid', SCREENING);
  return fake;
}

test('panel: issue comes from the Forge context; no row → NOT_SCREENED (no decision is invented)', async () => {
  const s = await svc().panelState({ id: '10042', key: 'SHOP-42' });
  assert.equal(s.access, 'granted');
  assert.equal(s.screening.state, 'NOT_SCREENED');
  assert.equal(/accountId|email|displayName/.test(JSON.stringify(s)), false);
});
test('panel: a stored screening is shown with its outcome and verified findings', async () => {
  const s = await svc({ fake: await seeded(currentFp) }).panelState({ id: '10042' });
  assert.equal(s.screening.state, 'REVIEW_REQUIRED');
  assert.equal(s.screening.result.findings[0].excerpt, 'Add ');
});
test('panel/workspace: changed text since the check → RESCREEN_REQUIRED and highlights disabled', async () => {
  const fake = await seeded('0'.repeat(64));
  assert.equal((await svc({ fake }).panelState({ id: '10042' })).screening.state, 'RESCREEN_REQUIRED');
  const w = await svc({ fake }).workspace('SHOP-42');
  assert.equal(w.screening.state, 'RESCREEN_REQUIRED');
  assert.equal(w.screening.marksValid, false);
});
test('panel: a user who cannot browse the issue gets no screening data at all (unauthorised access)', async () => {
  const s = await svc({ deny: true, fake: await seeded(currentFp) }).panelState({ id: '10042' });
  assert.deepEqual([s.access, s.issue, s.screening], ['denied', null, null]);
});
test('panel rejects a missing or malformed context issue id', async () => {
  await assert.rejects(svc().panelState(undefined), (e) => e.code === 'INVALID_INPUT');
});
test('workspace returns the current text, valid highlights for identical text, and no decision rights for non-reviewers', async () => {
  const w = await svc({ fake: await seeded(currentFp) }).workspace('shop-42');
  assert.equal(w.issue.key, 'SHOP-42');
  assert.equal(w.document.blocks.length, 3);
  assert.equal(w.screening.marksValid, true);
  assert.deepEqual([w.review.permissions.canDecide, w.review.permissions.decideReason, w.review.status], [false, 'NOT_REVIEWER', 'AWAITING_REVIEW']);
});
test('inbox: only issues the caller can see in Jira are returned (invisible ones are dropped)', async () => {
  const fake = createFakeRepos();
  for (const id of ['1', '2', '3']) fake.items.set(id, { ...SCREENING_ROW('x'), issue_id: id, issue_key: `SHOP-${id}`, screening_id: 'sid' });
  fake.scr.set('sid', SCREENING);
  const i = await svc({ fake, visible: ['1', '3'] }).inbox({ view: 'awaiting' }, 'acc-viewer');
  assert.deepEqual(i.items.map((x) => x.issueId).sort(), ['1', '3']);
  assert.equal(i.counts.awaiting, 2);
  assert.equal(JSON.stringify(i).includes('Synthetic 2'), false);
  await assert.rejects(svc().inbox({ view: 'everything' }), (e) => e.code === 'INVALID_INPUT');
});
test('re-check requires as-user access to the issue', async () => {
  await assert.rejects(svc({ deny: true }).requestRescreen({ issueKey: 'SHOP-42' }), (e) => e.code === 'NOT_FOUND');
  assert.deepEqual(await svc().requestRescreen({ issueKey: 'SHOP-42' }), { status: 'queued' });
  await assert.rejects(svc().requestRescreen({ issueKey: 'SHOP-42 OR 1=1' }), (e) => e.code === 'INVALID_INPUT');
});
test('settings are refused for non-admins and when the admin check fails (fail closed)', async () => {
  await assert.rejects(svc({ admin: false }).settingsOverview(), (e) => e.code === 'NOT_AUTHORISED');
  await assert.rejects(svc({ adminThrows: true }).settingsOverview(), (e) => e.code === 'NOT_AUTHORISED');
  const s = await svc({ admin: true }).settingsOverview();
  // Only sections that exist (the unbuilt "What is already approved" placeholder was removed at the final audit).
  assert.deepEqual(s.sections.map((x) => x.key), ['scope', 'people', 'ai', 'record', 'gate']);
  assert.equal(s.screening.ai, 'off');
});
test('app context reports roles without personal identifiers', async () => {
  const c = await svc({ admin: true }).appContext('acc-admin');
  assert.deepEqual(c.roles, { jiraAdmin: true, reviewer: false });
  assert.equal(/accountId|email|displayName/.test(JSON.stringify(c)), false);
});
test('presenter: queued/screening and failed states never present a result as current', () => {
  assert.equal(presentScreening({ state: 'SCREENING', updated_at: 1 }, null).state, 'SCREENING');
  assert.equal(presentScreening({ state: 'SCREENING_FAILED', last_error: 'X' }, null).state, 'SCREENING_FAILED');
  assert.equal(presentScreening({ state: 'SCREENED', screened_fp: 'a' }, null).state, 'NOT_SCREENED');
});
test('screening, decisions and the workflow gate are on; the register stays off until its milestone', () => {
  assert.deepEqual(FEATURES, { screening: true, decisions: true, gate: true, register: false, record: true });
});

test('version-aware: a stored result from an older pipeline version is shown as rescreening required', () => {
  const row = { state: 'SCREENED', screened_fp: 'a' };
  const old = { ...SCREENING, pipelineVersion: 't1.r0.9.0.f1.noai' };
  assert.deepEqual([presentScreening(row, old, 'a').state, presentScreening(row, old, 'a').reason], ['RESCREEN_REQUIRED', 'pipeline_changed']);
  assert.equal(presentScreening(row, SCREENING, 'a').state, 'REVIEW_REQUIRED');
});

test('error facts for logs keep only class, code, errno and letters-only message kind (no identifiers or values)', async () => {
  const { errorFacts } = await import('../src/backend/lib/logger.js');
  const e = Object.assign(new Error("Error 1054 (42S22): Unknown column 'secret_col' in 'field list' for value 'diabetes'"), { name: 'ForgeSQLError', code: 'SQL_EXECUTION_ERROR' });
  const f = sanitise({ evt: 'x', ...errorFacts(e) });
  assert.deepEqual(f, { evt: 'x', errName: 'ForgeSQLError', errCode: 'SQL_EXECUTION_ERROR', errno: 1054, errKind: 'Error_S_Unknown_column' });
  assert.equal(JSON.stringify(f).includes('diabetes') || JSON.stringify(f).includes('secret'), false);
});
