// Backend unit tests (synthetic data only). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitise } from '../src/backend/lib/logger.js';
import { AppError, ErrorCode, toEnvelope, ok } from '../src/backend/lib/errors.js';
import * as validate from '../src/backend/lib/validate.js';
import { configFor, FEATURES } from '../src/backend/lib/config.js';
import { adfToBlocks } from '../src/core/text.js';
import { createDeskServices } from '../src/backend/services/desk.js';

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

function fakeJira({ admin = false, deny = false, adminThrows = false } = {}) {
  return {
    async getIssueIdentity(id) {
      if (deny) throw new AppError(ErrorCode.NOT_FOUND);
      return { id, key: 'SHOP-42', projectKey: 'SHOP' };
    },
    async getIssueDocument(key) {
      if (deny) throw new AppError(ErrorCode.NOT_FOUND);
      return { id: '10042', key, summary: 'Add session replay', description: ADF, status: 'To Do', statusCategory: 'new', projectKey: 'SHOP', projectName: 'Shop', issueType: 'Task' };
    },
    async isJiraAdmin() {
      if (adminThrows) throw new AppError(ErrorCode.UPSTREAM_UNAVAILABLE);
      return admin;
    },
  };
}
const svc = (opts) => createDeskServices({ jira: fakeJira(opts), config: configFor('DEVELOPMENT'), log: silentLog });

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

// ---- services
test('panel state comes from the Forge context issue and is NOT_SCREENED (no decision is invented)', async () => {
  const s = await svc().panelState({ id: '10042', key: 'SHOP-42' });
  assert.equal(s.access, 'granted');
  assert.equal(s.review.state, 'NOT_SCREENED');
  assert.deepEqual(s.review.findings, []);
  assert.equal(JSON.stringify(s).includes('accountId'), false);
});
test('panel denies access when the user cannot browse the issue', async () => {
  const s = await svc({ deny: true }).panelState({ id: '10042' });
  assert.deepEqual([s.access, s.issue, s.review], ['denied', null, null]);
});
test('panel rejects a missing or malformed context issue id', async () => {
  await assert.rejects(svc().panelState(undefined), (e) => e.code === 'INVALID_INPUT');
});
test('workspace returns the current text, no findings, and decisions unavailable', async () => {
  const w = await svc().workspace('shop-42');
  assert.equal(w.issue.key, 'SHOP-42');
  assert.equal(w.document.blocks.length, 3);
  assert.equal(w.decision.available, false);
  assert.equal(w.review.state, 'NOT_SCREENED');
});
test('inbox is empty and reports that checks are not enabled', async () => {
  const i = await svc().inbox('pending');
  assert.deepEqual(i, { enabled: FEATURES.screening, view: 'pending', items: [], counts: null });
  await assert.rejects(svc().inbox('everything'), (e) => e.code === 'INVALID_INPUT');
});
test('settings are refused for non-admins and when the admin check fails (fail closed)', async () => {
  await assert.rejects(svc({ admin: false }).settingsOverview(), (e) => e.code === 'NOT_AUTHORISED');
  await assert.rejects(svc({ adminThrows: true }).settingsOverview(), (e) => e.code === 'NOT_AUTHORISED');
  const s = await svc({ admin: true }).settingsOverview();
  assert.equal(s.sections.length, 6);
});
test('app context reports roles without personal identifiers', async () => {
  const c = await svc({ admin: true }).appContext();
  assert.deepEqual(c.roles, { jiraAdmin: true });
  assert.equal(c.environment.label, 'Development');
  assert.equal(/accountId|email|displayName/.test(JSON.stringify(c)), false);
});
test('all product features that later milestones own are off in this build', () => {
  assert.deepEqual(FEATURES, { screening: false, decisions: false, gate: false, register: false });
});
