// Approval validity across AI-assisted and rule-based checks (final release investigation).
// The guarantee under test: a human approval covers exactly the text, and the review conditions,
// under which it was granted. AI availability, spending limits and fallbacks must not weaken it.
// REAL screening → review → gate services over in-memory repositories; the LLM transport is a
// MOCK (no billable calls). Synthetic data only. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, decision, adf, REV1, ADMIN, APPROVE, nextRid } from './world.mjs';
import { AI_STATUS } from '../src/backend/adapters/llm.js';

const SUMMARY = 'Add session replay to checkout with ReplayCloud';
const BASE = 'Record checkout sessions and segment shoppers who abandon carts containing prescription items.';
// New personal data (where shoppers live = location) written so the rules lexicon cannot see it.
const PARAPHRASE = 'Also note which neighbourhood each shopper lives in for the regional team.';
const HARMLESS = 'Ship it behind the existing feature flag.';

/** A controllable mock of Forge LLM: 'ok' answers with grounded quotes; other modes fail like the real thing. */
function mockAi() {
  const ai = { mode: 'ok', calls: 0 };
  ai.chat = async (req) => {
    ai.calls++;
    if (ai.mode === 'unavailable') throw new Error('upstream unavailable');
    if (ai.mode === 'malformed') return { choices: [{ message: { content: 'not a tool call' } }], usage: { prompt_tokens: 900, completion_tokens: 20 } };
    const text = req.messages[1].content[0].text;
    const args = {
      categories: [{ value: 'health', basis: 'implied', evidence_quote: 'prescription items' }, { value: 'behavioural', basis: 'explicit', evidence_quote: 'Record checkout sessions' }],
      criteria: [{ value: 'c3_systematic_monitoring', evidence_quote: 'Record checkout sessions' }],
      recipients: [{ name: 'ReplayCloud', external: true, evidence_quote: 'ReplayCloud' }],
      transfers: [], retention: [], purposes: [], no_personal_data_statement: [], data_subjects: ['shoppers'], open_questions: [], change_type: 'new_processing',
    };
    if (text.includes(PARAPHRASE)) args.categories.push({ value: 'location', basis: 'implied', evidence_quote: 'which neighbourhood each shopper lives in' });
    return { choices: [{ message: { tool_calls: [{ function: { name: 'report_privacy_signals', arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } };
  };
  return ai;
}

const payload = (key) => ({ issue: { key }, configuration: null, transition: { from: { id: '1' }, to: { id: '3' }, modifiedFields: {} } });
const validate = (w, key) => w.gateFor(null).validateDetailed(payload(key));
async function enforce(w) {
  const cur = await w.desk(ADMIN).gateOverview(ADMIN);
  await w.desk(ADMIN).setGateMode({ mode: 'enforce', expectedSeq: cur.health.mode.seq, requestId: nextRid() }, ADMIN);
}
const decisionsOf = async (w) => w.fake.repos.decisions.list('10001');
const latestOf = async (w) => (await decisionsOf(w)).at(-1);
const lastScreening = (w) => [...w.fake.scr.values()].sort((a, b) => b.createdAt - a.createdAt)[0];

/** Makes the NEXT check rule-based for the given reason, exactly as production would reach it. */
function degrade(w, ai, cause) {
  if (cause === 'unavailable' || cause === 'malformed') ai.mode = cause;
  if (cause === 'spend_cap') w.fake.spendState.micros = 5_000_000; // the installation's $5 is used up
  if (cause === 'daily_limit') for (const u of w.fake.use.values()) u.llm_calls = 300; // today's 300 checks are used up
}
const EXPECTED_STATUS = { unavailable: AI_STATUS.UNAVAILABLE, malformed: AI_STATUS.MALFORMED, spend_cap: AI_STATUS.SPEND_CAP, daily_limit: AI_STATUS.OVER_BUDGET };

/** World with SHOP-1 = the base text, screened AI-assisted, approved by a human, enforcing. */
async function approvedWithAi() {
  const ai = mockAi();
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = SUMMARY;
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  assert.equal(lastScreening(w).mode, 'ai');
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
  return { w, ai };
}

// ---- 1. The reported behaviour, for every way a check can fall back to rules ----------------------
for (const cause of ['unavailable', 'spend_cap', 'daily_limit', 'malformed']) {
  test(`AI-assisted approval + edit checked rule-based (${cause}): never carried over; the gate closes until a human re-reviews`, async () => {
    const { w, ai } = await approvedWithAi();
    degrade(w, ai, cause);
    w.issues[10001].description = adf(`${BASE} ${PARAPHRASE}`);
    // Before the re-check finishes, the approval never covers the edited text.
    assert.equal((await validate(w, 'SHOP-1')).reason, 'CHANGED_RECHECKING');
    await w.screen(10001);
    const s = lastScreening(w);
    assert.deepEqual([s.mode, s.aiStatus], ['rules', EXPECTED_STATUS[cause]]);
    const latest = await latestOf(w);
    assert.equal(latest.kind, 'system');
    assert.equal(latest.decision, 'APPROVAL_INVALIDATED'); // was APPROVAL_RECONFIRMED before the fix
    assert.equal(latest.detail.reason, 'LESS_THOROUGH_RECHECK');
    assert.deepEqual(latest.detail.recheck, { approvedWith: 'ai', checkedWith: 'rules' });
    const r = await validate(w, 'SHOP-1');
    assert.deepEqual([r.outcome.result, r.reason], [false, 'APPROVAL_INVALIDATED']);
    // The human decision itself is untouched (append-only), and a reviewer can approve the new text.
    const human = (await decisionsOf(w)).find((d) => d.kind === 'human');
    assert.equal(human.decision, 'APPROVED');
    await decision(w, REV1, 'SHOP-1', APPROVE);
    assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
  });
}

// ---- 2. AI-assisted re-checks keep working exactly as designed -----------------------------------
test('AI-assisted approval + paraphrased new data checked AI-assisted: invalidated as a material change (new: location)', async () => {
  const { w } = await approvedWithAi();
  w.issues[10001].description = adf(`${BASE} ${PARAPHRASE}`);
  await w.screen(10001);
  const latest = await latestOf(w);
  assert.equal(latest.decision, 'APPROVAL_INVALIDATED');
  assert.deepEqual(latest.detail.added.categories, ['location']);
  assert.equal(latest.detail.reason, undefined); // a material change, not a thoroughness downgrade
  assert.equal((await validate(w, 'SHOP-1')).reason, 'APPROVAL_INVALIDATED');
});

test('no unnecessary invalidation: AI-assisted approval + harmless edit checked AI-assisted stays approved (carried over)', async () => {
  const { w } = await approvedWithAi();
  w.issues[10001].description = adf(`${BASE} ${HARMLESS}`);
  await w.screen(10001);
  assert.equal((await latestOf(w)).decision, 'APPROVAL_RECONFIRMED');
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED_CARRIED');
});

test('a carry-over chain keeps the human basis: AI approval → AI carry-over → rule-based re-check of a further edit is invalidated', async () => {
  const { w, ai } = await approvedWithAi();
  w.issues[10001].description = adf(`${BASE} ${HARMLESS}`);
  await w.screen(10001);
  assert.equal((await latestOf(w)).decision, 'APPROVAL_RECONFIRMED');
  degrade(w, ai, 'unavailable');
  w.issues[10001].description = adf(`${BASE} ${HARMLESS} ${PARAPHRASE}`);
  await w.screen(10001);
  const latest = await latestOf(w);
  assert.deepEqual([latest.decision, latest.detail.reason], ['APPROVAL_INVALIDATED', 'LESS_THOROUGH_RECHECK']);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'APPROVAL_INVALIDATED');
});

// ---- 3. Rule-based approvals keep their designed behaviour (no change for rules-only installs) ----
test('rule-based approval + harmless edit checked rule-based: carried over, exactly as before', async () => {
  const ai = mockAi();
  ai.mode = 'unavailable';
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = SUMMARY;
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  assert.equal(lastScreening(w).mode, 'rules');
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  w.issues[10001].description = adf(`${BASE} ${HARMLESS}`);
  await w.screen(10001);
  const latest = await latestOf(w);
  assert.equal(latest.decision, 'APPROVAL_RECONFIRMED');
  assert.equal(latest.detail.reason, undefined);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED_CARRIED');
});

test('AI switched off entirely (the development default): rule-based approvals carry over harmless edits as before', async () => {
  const w = await world({ sod: 'off' });
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  w.issues[10001].summary = 'Add session replay to the checkout flow with ReplayCloud';
  await w.screen(10001);
  assert.equal((await latestOf(w)).decision, 'APPROVAL_RECONFIRMED');
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED_CARRIED');
});

test('rule-based approval + edit checked AI-assisted: the more thorough check decides (new signals invalidate)', async () => {
  const ai = mockAi();
  ai.mode = 'unavailable';
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = SUMMARY;
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  ai.mode = 'ok';
  w.issues[10001].description = adf(`${BASE} ${PARAPHRASE}`);
  await w.screen(10001);
  const latest = await latestOf(w);
  assert.equal(latest.decision, 'APPROVAL_INVALIDATED');
  assert.deepEqual(latest.detail.added.categories, ['location']);
});

// ---- 4. Same text, different check mode: the approval is bound to the text and stays valid ---------
test('unchanged text re-checked in another mode never touches the approval (exact-content binding)', async () => {
  const { w, ai } = await approvedWithAi();
  degrade(w, ai, 'unavailable');
  const before = (await decisionsOf(w)).length;
  await w.desk(REV1).requestRescreen({ issueKey: 'SHOP-1' });
  await w.screen(10001); // same fingerprint: the AI-assisted result for this exact text is reused
  assert.equal((await decisionsOf(w)).length, before);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
});

test('rule-based approval, AI comes back, unchanged text re-checked AI-assisted: approval unchanged', async () => {
  const ai = mockAi();
  ai.mode = 'unavailable';
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = SUMMARY;
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  ai.mode = 'ok';
  await w.desk(REV1).requestRescreen({ issueKey: 'SHOP-1' });
  await w.screen(10001);
  assert.equal(lastScreening(w).mode, 'ai');
  assert.equal((await decisionsOf(w)).length, 1);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
});

// ---- 5. A failed check never lets an approval cover edited text ----------------------------------
test('edit whose re-check fails or has not run: the gate blocks (current-text fingerprint), whatever the AI state', async () => {
  const { w } = await approvedWithAi();
  w.issues[10001].description = adf(`${BASE} ${PARAPHRASE}`);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'CHANGED_RECHECKING'); // re-check not run yet
  // The re-check fails (the worker cannot read Jira; it will retry): still blocked, nothing written.
  w.jiraFailure.current = new Error('jira down');
  await w.screen(10001).catch(() => undefined);
  w.jiraFailure.current = null;
  assert.equal((await decisionsOf(w)).length, 1);
  const r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'CHANGED_RECHECKING']);
});

// ---- 6. AI never approves, overrides or creates decisions -----------------------------------------
test('AI never approves: AI-assisted checks alone create no decision, and the gate blocks without a human', async () => {
  const ai = mockAi();
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = 'Fix rounding in order totals';
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  await enforce(w);
  assert.ok(ai.calls >= 1);
  assert.equal((await decisionsOf(w)).length, 0);
  const r = await validate(w, 'SHOP-1');
  assert.equal(r.outcome.result, false);
  assert.notEqual(r.reason.startsWith('ALLOW'), true);
});

test('AI cannot override a human rejection or a request for information, whatever it reports', async () => {
  const ai = mockAi();
  const w = await world({ chat: ai.chat, sod: 'off' });
  w.issues[10001].summary = SUMMARY;
  w.issues[10001].description = adf(BASE);
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'Session replay on prescription pages is not acceptable.' });
  w.issues[10001].description = adf(`${BASE} ${HARMLESS}`);
  await w.screen(10001);
  assert.equal((await latestOf(w)).decision, 'REJECTED'); // no system record follows a non-approval
  assert.equal((await validate(w, 'SHOP-1')).outcome.result, false);
});
