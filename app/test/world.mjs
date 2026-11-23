// Shared integration world for M3/M4 tests: the REAL screening pipeline (rules only, no AI), review,
// desk and gate services over in-memory repositories that model Forge SQL's INSERT IGNORE semantics.
// Synthetic data and synthetic account ids only.
import { createFakeRepos } from './fakes.mjs';
import { createScreeningService } from '../src/backend/services/screening.js';
import { createReviewService } from '../src/backend/services/review.js';
import { createDeskServices } from '../src/backend/services/desk.js';
import { createGateService } from '../src/backend/services/gate.js';
import { createLedgerService } from '../src/backend/services/ledger.js';
import { generateKeyPairSync } from 'node:crypto';
import { createLlmAdapter } from '../src/backend/adapters/llm.js';
import { createPricing } from '../src/backend/adapters/pricing.js';
import { configFor, settingsFromEnv } from '../src/backend/lib/config.js';
import { AppError, ErrorCode } from '../src/backend/lib/errors.js';

export const silent = { info() {}, warn() {}, error() {} };
export const adf = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
export const KEY = 'test-signing-key-0123456789abcdef0123456789abcdef';
/** A fresh Ed25519 private key (base64 PKCS#8 DER), in memory only — test runs never persist keys. */
export const newRecordKey = () => generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
export const RECORD_KEY = newRecordKey();
export const REV1 = 'acc-rev-1';
export const REV2 = 'acc-rev-2';
export const INACTIVE = 'acc-rev-old';
export const REPORTER = 'acc-reporter';
export const DEV = 'acc-dev';
export const OUTSIDER = 'acc-outsider';
export const ADMIN = 'acc-admin';

// `chat` (optional): a MOCKED LLM transport, so tests can switch between AI-assisted and rule-based
// checks. No billable calls are ever made. `aiEnv` overrides the AI limits.
export function world({ signingKey = KEY, recordKey = RECORD_KEY, recordKeyPrevious = null, sod = 'on', siteId = 'site-test', chat = null, aiEnv = {} } = {}) {
  const fake = createFakeRepos();
  let now = 1_800_000_000_000;
  const clock = () => now;
  const issues = {
    10001: { key: 'SHOP-1', projectKey: 'SHOP', summary: 'Add session replay to checkout with ReplayCloud', description: adf('Record checkout sessions and segment shoppers who abandon carts containing prescription items.'), reporterId: REPORTER, assigneeId: DEV, hiddenFrom: [] },
    10002: { key: 'HR-7', projectKey: 'HR', summary: 'Export payroll records to the new HR vendor', description: adf('Send employee bank details and medical leave notes to PayrollCo every month.'), reporterId: REPORTER, assigneeId: null, hiddenFrom: [OUTSIDER] },
  };
  const members = [
    { accountId: REV1, displayName: 'Reviewer One', active: true },
    { accountId: REV2, displayName: 'Reviewer Two', active: true },
    { accountId: INACTIVE, displayName: 'Former Reviewer', active: false },
  ];
  const groupCalls = { n: 0 };
  const admins = [ADMIN];
  const workflowFixture = { current: { workflows: [], statuses: [] } };
  const jiraFailure = { current: null }; // set to an error to simulate Jira failures for the gate
  // One Jira adapter per acting user, mirroring Forge's per-invocation asUser() context.
  const jiraFor = (actor) => ({
    async getIssueForScreening(idOrKey) {
      if (jiraFailure.current) throw jiraFailure.current;
      const id = Object.keys(issues).find((k) => k === String(idOrKey) || issues[k].key === String(idOrKey).toUpperCase());
      const i = issues[id];
      if (!i) throw new AppError(ErrorCode.NOT_FOUND);
      return { id, key: i.key, projectKey: i.projectKey, summary: i.summary, description: i.description };
    },
    async getIssueDocument(idOrKey) {
      const id = Object.keys(issues).find((k) => k === String(idOrKey) || issues[k].key === String(idOrKey).toUpperCase());
      const i = issues[id];
      if (!i || i.hiddenFrom.includes(actor)) throw new AppError(ErrorCode.NOT_FOUND);
      return { id, key: i.key, summary: i.summary, description: i.description, status: 'To Do', statusCategory: 'new', projectKey: i.projectKey, projectName: i.projectKey, issueType: 'Task', reporterId: i.reporterId, assigneeId: i.assigneeId };
    },
    async visibleIssues(ids) {
      return new Map(ids.filter((id) => issues[id] && !issues[id].hiddenFrom.includes(actor)).map((id) => [String(id), { key: issues[id].key, summary: issues[id].summary, projectKey: issues[id].projectKey }]));
    },
    async groupsOf(id) {
      groupCalls.n++;
      return members.some((m) => m.accountId === id) ? ['article25-reviewers', 'jira-software-users'] : ['jira-software-users'];
    },
    // Name search returns reviewers AND non-reviewers; the service must filter to the group.
    searchUsers: async (q) => [...members, { accountId: OUTSIDER, displayName: 'Outside Person', active: true }].filter((m) => m.displayName.toLowerCase().includes(q.toLowerCase())).map((m) => ({ ...m })),
    usersBulk: async (ids) => new Map(ids.map((id) => [id, members.find((m) => m.accountId === id) ?? { displayName: `User ${id.slice(-3)}`, active: true }])),
    isJiraAdmin: async () => admins.includes(actor),
    statusName: async (id) => ({ 1: 'To Do', 3: 'In Progress', 10001: 'Done' })[id] ?? null,
    searchWorkflowsWithTransitions: async () => { if (workflowFixture.current instanceof Error) throw workflowFixture.current; return workflowFixture.current; },
  });
  const env = { A25_AI_ENABLED: chat ? 'true' : 'false', ...(chat ? { A25_AI_SPEND_CAP_USD: '5', A25_AI_DAILY_BUDGET: '300' } : {}), ...aiEnv, ...(signingKey ? { A25_SIGNING_KEY: signingKey } : {}), ...(recordKey ? { A25_RECORD_SIGNING_KEY: recordKey } : {}), ...(recordKeyPrevious ? { A25_RECORD_SIGNING_KEY_PREVIOUS: recordKeyPrevious } : {}) };
  // Separation of duties is an audited admin setting (settings_events); seed it directly for tests.
  if (sod === 'off') fake.sev.push({ setting: 'review.separation_of_duties', seq: 1, value: 'off', changed_by: ADMIN, changed_at: 1, request_id: 'seed-sod-off', note: null });
  const settings = settingsFromEnv(env);
  const rescreened = [];
  const ledgerFor = (over = {}) => createLedgerService({ repos: fake.repos, log: silent, clock, settings: over.settings ?? settings, siteId: over.siteId === undefined ? siteId : over.siteId, rescreen: async (id) => rescreened.push(id) });
  const reviewFor = (actor, ledger = ledgerFor()) => createReviewService({ repos: fake.repos, jira: jiraFor(actor), log: silent, clock, settings, siteId, ledger });
  const queue = [];
  const screening = createScreeningService({
    repos: fake.repos, jira: jiraFor(null), llm: createLlmAdapter({ chat, model: 'claude-haiku-5-5', timeoutMs: 1000 }), queue: { push: async (j) => queue.push(j) }, log: silent, clock, settings,
    pricing: createPricing(async () => ({ models: [{ model: 'claude-haiku-5-5', pricing: { inputCreditsPerMillionTokens: 5, outputCreditsPerMillionTokens: 5 } }] })),
    onCompleted: (args) => reviewFor(null).onScreeningCompleted(args),
  });
  // Overrides of settings/siteId rebuild a matching ledger (keys come from settings + site id).
  const gateFor = (actor, over = {}) => createGateService({ repos: fake.repos, jira: jiraFor(actor), log: silent, clock, settings, siteId, ledger: ledgerFor(over), ...over });
  const desk = (actor, over = {}) => {
    const ledger = ledgerFor(over);
    return createDeskServices({ jira: jiraFor(actor), config: configFor('DEVELOPMENT'), log: silent, repos: fake.repos, screening, settings: over.settings ?? settings, review: reviewFor(actor, ledger), gate: gateFor(actor, over), ledger });
  };
  async function screen(id) {
    await screening.onIssueEvent({ issueId: String(id), issueKey: issues[id].key, projectKey: issues[id].projectKey, contentChange: true });
    while (queue.length) await screening.processJob(queue.shift());
    now += 60_000;
  }
  return { fake, issues, members, desk, reviewFor, gateFor, ledgerFor, screen, settings, groupCalls, admins, workflowFixture, jiraFailure, jiraFor, rescreened, siteId, advance: (ms) => (now += ms), clock };
}

let rid = 0;
export const nextRid = () => `req-${Date.now().toString(36)}-${++rid}`;
export async function decision(w, actor, key, input, over = {}) {
  const ws = await w.desk(actor).workspace(key, actor);
  return w.desk(actor).decide({ issueKey: key, input, screeningId: ws.review.binding?.screeningId ?? '0'.repeat(64), fp: ws.review.binding?.fp ?? '0'.repeat(64), expectedSeq: ws.review.latestSeq, requestId: nextRid(), ...over }, actor);
}
export const APPROVE = { decision: 'APPROVED', rationale: 'Proportionate: masking is in place and the vendor DPA is signed.' };
export const codeOf = (code) => (e) => e?.code === code;

