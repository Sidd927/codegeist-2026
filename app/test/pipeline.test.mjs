// Screening pipeline tests (synthetic data; mocked Jira, queue and LLM transport; no billable calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeRepos } from './fakes.mjs';
import { createScreeningService, MAX_ATTEMPTS, LEASE_MS } from '../src/backend/services/screening.js';
import { createLlmAdapter, AI_STATUS } from '../src/backend/adapters/llm.js';
import { settingsFromEnv } from '../src/backend/lib/config.js';
import { createPricing, estimateInputTokens } from '../src/backend/adapters/pricing.js';

// Haiku 5.5 runtime pricing as observed in Stage 1: 5 credits per 1M tokens ($0.50 in / $2.50 out).
const PRICING = createPricing(async () => ({ models: [{ model: 'claude-haiku-5-5', pricing: { inputCreditsPerMillionTokens: 5, outputCreditsPerMillionTokens: 5 } }, { model: 'claude-sonnet-5-5', pricing: { inputCreditsPerMillionTokens: 20, outputCreditsPerMillionTokens: 20 } }] }));
import { AppError, ErrorCode } from '../src/backend/lib/errors.js';

const silent = { info() {}, warn() {}, error() {} };
const adf = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const RISKY = { summary: 'Add session replay to checkout with ReplayCloud', description: adf('Record checkout sessions and segment shoppers who abandon carts containing prescription items.') };
const BENIGN = { summary: 'Fix rounding error in order totals', description: adf('Totals are off by one cent for some currencies. No functional changes otherwise.') };
const toolResponse = (args) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'report_privacy_signals', arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } });
const AI_ARGS = {
  categories: [{ value: 'health', basis: 'implied', evidence_quote: 'prescription items' }, { value: 'behavioural', basis: 'explicit', evidence_quote: 'Record checkout sessions' }],
  criteria: [{ value: 'c3_systematic_monitoring', evidence_quote: 'Record checkout sessions' }, { value: 'c1_scoring_profiling', evidence_quote: 'segment shoppers' }],
  recipients: [{ name: 'ReplayCloud', external: true, evidence_quote: 'ReplayCloud' }],
  transfers: [], retention: [], purposes: [], no_personal_data_statement: [], data_subjects: ['shoppers'], open_questions: [], change_type: 'new_processing',
};

function setup({ issues = { 10001: { key: 'SHOP-1', projectKey: 'SHOP', ...RISKY } }, chat = null, env = {}, jiraHook, model = 'claude-haiku-5-5', fake: givenFake } = {}) {
  const fake = givenFake ?? createFakeRepos();
  let now = 1_800_000_000_000;
  const clock = () => now;
  const advance = (ms) => (now += ms);
  const queue = [];
  const chatCalls = [];
  const jira = {
    async getIssueForScreening(id) {
      await jiraHook?.(id);
      const i = issues[id];
      if (!i) throw new AppError(ErrorCode.NOT_FOUND);
      if (i.fail) throw new AppError(i.fail);
      return { id, key: i.key, projectKey: i.projectKey, summary: i.summary, description: i.description };
    },
  };
  const llm = createLlmAdapter({ chat: chat ? async (req) => (chatCalls.push(req), chat(req)) : null, model, timeoutMs: 1000 });
  const settings = settingsFromEnv({ A25_AI_ENABLED: chat ? 'true' : 'false', A25_AI_SPEND_CAP_USD: '2', A25_AI_MODEL: model, ...env });
  const svc = createScreeningService({ repos: fake.repos, jira, llm, queue: { push: async (j) => queue.push(j) }, log: silent, clock, settings, pricing: PRICING });
  return { svc, fake, queue, issues, advance, chatCalls, clock };
}
const drain = async (s) => {
  const results = [];
  while (s.queue.length) results.push(await s.svc.processJob(s.queue.shift()));
  return results;
};

test('new issue event is queued without blocking, then screened asynchronously with a persisted result', async () => {
  const s = setup();
  const r = await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  assert.deepEqual(r, { status: 'queued', seq: 1 });
  assert.equal(s.fake.items.get('10001').state, 'QUEUED');
  const [done] = await drain(s);
  assert.equal(done.status, 'screened');
  const row = s.fake.items.get('10001');
  assert.equal(row.state, 'SCREENED');
  assert.equal(row.outcome, done.outcome);
  const stored = s.fake.scr.get(row.screening_id);
  assert.equal(stored.mode, 'rules'); // AI not enabled → labelled rule-based
  assert.equal(stored.aiStatus, AI_STATUS.NOT_ENABLED);
  assert.ok(row.screened_fp.length === 64);
});

test('stored screening contains offsets and short redacted excerpts, never the raw description', async () => {
  const s = setup({ issues: { 10001: { key: 'SHOP-1', projectKey: 'SHOP', summary: 'Email jane.doe@example.com about the health questionnaire', description: adf(`${'Long synthetic paragraph. '.repeat(30)}`) } } });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(s);
  const stored = JSON.stringify(s.fake.scr.get(s.fake.items.get('10001').screening_id));
  assert.equal(stored.includes('jane.doe@example.com'), false);
  assert.equal(stored.includes('Long synthetic paragraph. Long synthetic paragraph. Long synthetic paragraph.'), false);
});

test('updated content produces a new screening; an unchanged duplicate event reuses it with no AI call', async () => {
  const s = setup({ chat: async () => toolResponse(AI_ARGS) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(s);
  assert.equal(s.chatCalls.length, 1);
  // duplicate delivery / non-content update
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: false });
  const [dup] = await drain(s);
  assert.equal(dup.status, 'reused');
  assert.equal(s.chatCalls.length, 1);
  assert.equal(s.fake.counters.screeningInserts, 1);
  // real content change
  s.issues[10001].description = adf('Record checkout sessions and send them to AdReach for retargeting.');
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [upd] = await drain(s);
  assert.equal(upd.status, 'screened');
  assert.equal(s.fake.counters.screeningInserts, 2);
  assert.equal(s.chatCalls.length, 2);
});

test('AI result: verified findings only, hallucinated quotes rejected and counted; prompt carries the item as data', async () => {
  const s = setup({ chat: async () => toolResponse({ ...AI_ARGS, categories: [...AI_ARGS.categories, { value: 'biometric', basis: 'explicit', evidence_quote: 'face scans of shoppers' }] }) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [r] = await drain(s);
  assert.equal(r.mode, 'ai');
  assert.equal(r.outcome, 'DPIA_LIKELY');
  const stored = s.fake.scr.get(r.screeningId);
  assert.equal(stored.quality.rejected, 1);
  assert.equal(stored.result.findings.some((f) => f.signal === 'biometric'), false);
  assert.match(s.chatCalls[0].messages[1].content[0].text, /^<ITEM>[\s\S]*<\/ITEM>$/);
  assert.equal(s.chatCalls[0].tool_choice, 'auto');
});

test('malformed AI response falls back to the labelled rule-based floor; never a clean result by default', async () => {
  const s = setup({ chat: async () => ({ choices: [{ message: { content: [{ text: 'Sure! Looks fine to me.' }] } }] }) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [r] = await drain(s);
  assert.equal(r.mode, 'rules');
  assert.equal(r.aiStatus, AI_STATUS.MALFORMED);
  assert.notEqual(r.outcome, 'CLEAR');
});

test('schema-invalid AI arguments (required field missing) are rejected and fall back', async () => {
  const s = setup({ chat: async () => toolResponse({ categories: [] }) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [r] = await drain(s);
  assert.equal(r.aiStatus, AI_STATUS.MALFORMED);
  assert.equal(r.mode, 'rules');
});

test('model failure or timeout falls back; daily AI budget is enforced atomically', async () => {
  const s = setup({ chat: async () => { throw new Error('upstream'); } });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  assert.equal((await drain(s))[0].aiStatus, AI_STATUS.UNAVAILABLE);
  const b = setup({ chat: async () => toolResponse(AI_ARGS), env: { A25_AI_DAILY_BUDGET: '0' } });
  await b.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [r] = await drain(b);
  assert.equal(r.aiStatus, AI_STATUS.OVER_BUDGET);
  assert.equal(b.chatCalls.length, 0);
});

test('benign change in AI mode → CLEAR; same text without AI → never CLEAR (fail-safe)', async () => {
  const ai = setup({ issues: { 2: { key: 'SHOP-2', projectKey: 'SHOP', ...BENIGN } }, chat: async () => toolResponse({ categories: [], criteria: [], recipients: [], transfers: [], open_questions: [], change_type: 'bug_fix' }) });
  await ai.svc.onIssueEvent({ issueId: '2', issueKey: 'SHOP-2', projectKey: 'SHOP', contentChange: true });
  assert.equal((await drain(ai))[0].outcome, 'CLEAR');
  const rules = setup({ issues: { 2: { key: 'SHOP-2', projectKey: 'SHOP', summary: 'Rename internal config flag', description: null } } });
  await rules.svc.onIssueEvent({ issueId: '2', issueKey: 'SHOP-2', projectKey: 'SHOP', contentChange: true });
  assert.equal((await drain(rules))[0].outcome, 'NEEDS_INFO');
});

test('duplicate concurrent jobs: exactly one worker screens; the other backs off', async () => {
  const s = setup({ chat: async () => toolResponse(AI_ARGS) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const job = s.queue.shift();
  const [a, b] = await Promise.all([s.svc.processJob(job), s.svc.processJob({ ...job })]);
  assert.deepEqual([a.status, b.status].sort(), ['busy', 'screened']);
  assert.equal(s.chatCalls.length, 1);
  assert.equal(s.fake.counters.screeningInserts, 1);
});

test('an edit arriving while screening is in progress triggers a follow-up and the newer content wins', async () => {
  let edited = false;
  const s = setup({
    jiraHook: async () => {
      if (edited) return;
      edited = true;
      s.issues[10001].description = adf('Now also share transaction history with Segment.');
      await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
    },
  });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const first = await s.svc.processJob(s.queue.shift());
  assert.equal(first.status, 'screened');
  assert.equal(s.fake.items.get('10001').state, 'QUEUED'); // newer request outstanding
  await drain(s);
  const row = s.fake.items.get('10001');
  assert.equal(row.state, 'SCREENED');
  assert.ok(s.fake.scr.get(row.screening_id).result.findings.some((f) => f.signal === 'Segment'));
});

test('transient failure is retried with backoff, then succeeds; repeated failure ends in a visible SCREENING_FAILED', async () => {
  const s = setup({ issues: { 10001: { key: 'SHOP-1', projectKey: 'SHOP', ...RISKY, fail: ErrorCode.UPSTREAM_UNAVAILABLE } } });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const job = s.queue.shift();
  await assert.rejects(s.svc.processJob(job, { retryCount: 0 }), (e) => e.retryable && e.retryAfter === 20);
  assert.equal(s.fake.items.get('10001').state, 'QUEUED');
  assert.equal(s.fake.items.get('10001').lease_token, null);
  delete s.issues[10001].fail;
  assert.equal((await s.svc.processJob(job, { retryCount: 1 })).status, 'screened');

  const f = setup({ issues: { 10001: { key: 'SHOP-1', projectKey: 'SHOP', ...RISKY, fail: ErrorCode.UPSTREAM_UNAVAILABLE } } });
  await f.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const j = f.queue.shift();
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await assert.rejects(f.svc.processJob(j, { retryCount: i }));
  const last = await f.svc.processJob(j, { retryCount: MAX_ATTEMPTS - 1 });
  assert.equal(last.status, 'failed');
  assert.equal(f.fake.items.get('10001').state, 'SCREENING_FAILED');
  assert.equal(f.fake.items.get('10001').outcome, null); // failure is never presented as a clean result
});

test('partially completed processing: a crashed worker’s lease expires and the reconciler re-queues the item', async () => {
  const s = setup();
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  s.queue.length = 0;
  await s.fake.repos.workItems.claim({ issueId: '10001', token: 'crashed', now: s.clock(), leaseMs: LEASE_MS }); // worker dies here
  assert.deepEqual(await s.svc.reconcile(), { requeued: 0, failed: 0 }); // lease still live
  s.advance(LEASE_MS + 6 * 60_000);
  assert.deepEqual(await s.svc.reconcile(), { requeued: 1, failed: 0 });
  await drain(s);
  assert.equal(s.fake.items.get('10001').state, 'SCREENED');
});

test('a worker that lost its lease cannot overwrite the newer result', async () => {
  const s = setup();
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const { workItems } = s.fake.repos;
  await workItems.claim({ issueId: '10001', token: 'old', now: s.clock(), leaseMs: 10 });
  s.advance(20);
  await workItems.claim({ issueId: '10001', token: 'new', now: s.clock(), leaseMs: LEASE_MS });
  assert.equal(await workItems.finalize({ issueId: '10001', token: 'old', screeningId: 'x', fp: 'f', outcome: 'CLEAR', seqAtClaim: 1, now: s.clock() }), false);
  assert.equal(s.fake.items.get('10001').outcome, null);
});

test('deleted issue (404 at screening time or delete event) removes stored screening data', async () => {
  const s = setup();
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(s);
  await s.svc.onIssueDeleted({ issueId: '10001' });
  assert.equal(s.fake.items.size, 0);
  assert.equal(s.fake.scr.size, 0);
  const g = setup({ issues: {} });
  await g.svc.onIssueEvent({ issueId: '404', issueKey: 'SHOP-9', projectKey: 'SHOP', contentChange: true });
  assert.equal((await drain(g))[0].status, 'deleted');
  assert.equal(g.fake.items.size, 0);
});

test('manual re-check is rate-limited per work item and resets a failed item', async () => {
  const s = setup();
  assert.deepEqual(await s.svc.requestManual({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP' }), { status: 'queued' });
  assert.deepEqual(await s.svc.requestManual({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP' }), { status: 'rate_limited' });
  s.advance(61_000);
  assert.deepEqual(await s.svc.requestManual({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP' }), { status: 'queued' });
});

test('projects outside the configured scope are never screened', async () => {
  const s = setup({ env: { A25_SCOPE_PROJECTS: 'HR' } });
  assert.deepEqual(await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true }), { status: 'out_of_scope' });
  assert.equal(s.queue.length, 0);
  await assert.rejects(s.svc.requestManual({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP' }), (e) => e.code === 'NOT_AVAILABLE_YET');
});

test('screening ids are deterministic per (issue, content, pipeline version): idempotent inserts', async () => {
  const s = setup();
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(s);
  assert.equal(s.fake.scr.size, 1);
});

test('hard spend cap: a call whose worst-case cost exceeds the remaining cap is never made', async () => {
  const s = setup({ chat: async () => toolResponse(AI_ARGS), env: { A25_AI_SPEND_CAP_USD: '0.001' } });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  const [r] = await drain(s);
  assert.equal(r.aiStatus, AI_STATUS.SPEND_CAP); // labelled distinctly from the daily budget
  assert.equal(s.chatCalls.length, 0);
  assert.equal(s.fake.spendState.micros, 0);
});
test('hard spend cap under concurrency: parallel screenings never reserve past the cap', async () => {
  const issues = {};
  for (let i = 0; i < 20; i++) issues[20000 + i] = { key: `SHOP-${i}`, projectKey: 'SHOP', ...RISKY };
  // Worst-case reservation for one RISKY item: one token per character plus prompt, plus max output.
  const one = await PRICING.costMicros('claude-haiku-5-5', estimateInputTokens(RISKY.summary.length + 2 + 94 + 16), 2000);
  const capUsd = ((3 * one + 1) / 1e6).toFixed(6);
  let peak = 0;
  const s = setup({ issues, env: { A25_AI_SPEND_CAP_USD: capUsd }, chat: async () => { await new Promise((r) => setTimeout(r, 15)); return toolResponse(AI_ARGS); } });
  const reserve = s.fake.repos.spend.reserve;
  s.fake.repos.spend.reserve = async (a) => { const ok = await reserve(a); peak = Math.max(peak, s.fake.spendState.micros); return ok; };
  for (const id of Object.keys(issues)) await s.svc.onIssueEvent({ issueId: id, issueKey: issues[id].key, projectKey: 'SHOP', contentChange: true });
  const jobs = s.queue.splice(0);
  const results = await Promise.all(jobs.map((j) => s.svc.processJob(j)));
  const cap = Math.floor(Number(capUsd) * 1e6);
  assert.ok(peak <= cap, `peak reservation ${peak} exceeded cap ${cap}`);
  assert.equal(s.chatCalls.length, 3); // exactly as many calls as the cap can cover at worst case
  assert.equal(results.filter((r) => r.aiStatus === AI_STATUS.SPEND_CAP).length, 17);
  assert.ok(results.every((r) => r.status === 'screened')); // every item is still checked (rule-based)
  assert.ok(s.fake.spendState.micros <= cap);
});
test('daily AI budget under concurrency: exactly the budgeted number of calls are made', async () => {
  const issues = {};
  for (let i = 0; i < 12; i++) issues[30000 + i] = { key: `SHOP-${i}`, projectKey: 'SHOP', ...RISKY };
  const s = setup({ issues, env: { A25_AI_DAILY_BUDGET: '4' }, chat: async () => { await new Promise((r) => setTimeout(r, 10)); return toolResponse(AI_ARGS); } });
  for (const id of Object.keys(issues)) await s.svc.onIssueEvent({ issueId: id, issueKey: issues[id].key, projectKey: 'SHOP', contentChange: true });
  const results = await Promise.all(s.queue.splice(0).map((j) => s.svc.processJob(j)));
  assert.equal(s.chatCalls.length, 4);
  assert.equal(results.filter((r) => r.aiStatus === AI_STATUS.OVER_BUDGET).length, 8);
  assert.equal(results.filter((r) => r.mode === 'ai').length, 4);
});
test('the reservation is an upper bound: one token per character of input', () => {
  assert.equal(estimateInputTokens(0), 1600);
  assert.equal(estimateInputTokens(32000), 33600);
});
test('spend is reserved at worst case, then settled to the actual token cost', async () => {
  const s = setup({ chat: async () => toolResponse(AI_ARGS) });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(s);
  // usage 1200 in / 300 out at Haiku rates: 1200*0.5 + 300*2.5 = 1350 micro-USD
  assert.equal(s.fake.spendState.micros, 1350);
  assert.equal(s.fake.spendState.calls, 1);
});
test('AI disabled when no spend cap is configured, even if the switch is on', async () => {
  const s = setup({ chat: async () => toolResponse(AI_ARGS), env: { A25_AI_SPEND_CAP_USD: '0' } });
  await s.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  assert.equal((await drain(s))[0].aiStatus, AI_STATUS.NOT_ENABLED);
  assert.equal(s.chatCalls.length, 0);
});
test('a different model is never served a reused result from another model', async () => {
  const fake = createFakeRepos();
  const a = setup({ chat: async () => toolResponse(AI_ARGS), fake });
  await a.svc.onIssueEvent({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP', contentChange: true });
  await drain(a);
  const b = setup({ chat: async () => toolResponse(AI_ARGS), fake, model: 'claude-sonnet-5-5' });
  await b.svc.requestManual({ issueId: '10001', issueKey: 'SHOP-1', projectKey: 'SHOP' });
  const [r] = await drain(b);
  assert.equal(r.status, 'screened');
  assert.equal(b.chatCalls.length, 1);
  assert.equal(fake.scr.size, 2);
});
