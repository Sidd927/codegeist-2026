// M4 ENFORCE tests: the gate policy (pure) and the validator path through the REAL screening,
// review, desk and gate services over in-memory repositories. Synthetic data only. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { evaluateGate, verifyDecisionRecord, applyMode, analyseCoverage, REASONS, jiraMessage, GATE_POLICY_VERSION } from '../src/core/gate.js';
import { canonical, buildRecord, genesis } from '../src/core/chain-core.js';
import { decisionIdOf } from '../src/core/review.js';
import { AppError, ErrorCode } from '../src/backend/lib/errors.js';
import { world, decision, adf, KEY, REV1, REV2, REPORTER, OUTSIDER, ADMIN, APPROVE, codeOf, nextRid, newRecordKey } from './world.mjs';

const FP = 'a'.repeat(64);
const FP2 = 'b'.repeat(64);
// Legacy (v2, HMAC) records are verified with the legacy key; v3 records with trusted public keys.
const SIGN = { siteId: 'site-test', keys: new Map(), hmacKey: KEY };
const ALLOWING = Object.entries(REASONS).filter(([, r]) => r.allow).map(([k]) => k);

/** A signed decision row + chain record, exactly as the review service would store them. */
function signedDecision(over = {}, { key = KEY, siteId = 'site-test', seq = 1 } = {}) {
  const row = { issue_id: '10001', seq: 1, kind: 'human', decision: 'APPROVED', rationale: 'Proportionate as described.', conditions: [], questions: [], decided_by: REV1, decided_at: 1000, screening_id: 's1', fp: FP, pipeline_version: 'p', outcome: 'REVIEW_REQUIRED', detail: null, ...over };
  row.decision_id = decisionIdOf({ issueId: row.issue_id, seq: row.seq, kind: row.kind, decision: row.decision, rationale: row.rationale, conditions: row.conditions, questions: row.questions, decidedBy: row.decided_by, decidedAt: row.decided_at, screeningId: row.screening_id, fp: row.fp, pipelineVersion: row.pipeline_version, outcome: row.outcome });
  const record = buildRecord(key, { siteId, seq, prevHash: genesis(siteId), decisionId: row.decision_id, issueKey: row.issue_id, state: row.decision, conditions: row.conditions, decidedBy: row.decided_by ?? 'system', decidedAt: new Date(row.decided_at).toISOString() });
  return { row, record };
}
const ITEM = (over = {}) => ({ issue_id: '10001', project_key: 'SHOP', state: 'SCREENED', outcome: 'REVIEW_REQUIRED', screening_id: 's1', screened_fp: FP, ...over });
const gate = (s) => evaluateGate({ currentFp: FP, inScope: true, signing: SIGN, latest: null, latestHuman: null, latestRecord: null, humanRecord: null, ...s });

// ================================================================= pure policy
test('policy: only a verified human APPROVED decision on the current text can allow', () => {
  assert.deepEqual(ALLOWING.sort(), ['ALLOW_APPROVED', 'ALLOW_APPROVED_CARRIED']);
  const { row, record } = signedDecision();
  assert.deepEqual(gate({ item: ITEM(), latest: row, latestHuman: row, latestRecord: record, humanRecord: record }), { allow: true, reason: 'ALLOW_APPROVED', status: 'APPROVED', decisionSeq: 1 });
});

test('policy matrix: every non-approved state blocks with its own reason (no screening, checks, automatic results, decisions, changes)', () => {
  const cases = [
    ['never screened', { item: null }, 'NOT_SCREENED'],
    ['queued', { item: ITEM({ state: 'QUEUED', outcome: null, screened_fp: null }) }, 'CHECK_IN_PROGRESS'],
    ['screening', { item: ITEM({ state: 'SCREENING', outcome: null, screened_fp: null }) }, 'CHECK_IN_PROGRESS'],
    ['failed', { item: ITEM({ state: 'SCREENING_FAILED', outcome: null }) }, 'CHECK_FAILED'],
    ['review required', { item: ITEM({ outcome: 'REVIEW_REQUIRED' }) }, 'REVIEW_REQUIRED'],
    ['DPIA likely', { item: ITEM({ outcome: 'DPIA_LIKELY' }) }, 'REVIEW_REQUIRED'],
    ['needs info', { item: ITEM({ outcome: 'NEEDS_INFO' }) }, 'REVIEW_REQUIRED'],
    ['automatic CLEAR is not a human decision', { item: ITEM({ outcome: 'CLEAR' }) }, 'NO_REVIEW_DECISION'],
    ['known processing is not a human decision', { item: ITEM({ outcome: 'INVENTORY_UPDATE' }) }, 'NO_REVIEW_DECISION'],
    ['text edited, no decision, not yet re-checked', { item: ITEM({ screened_fp: FP2 }) }, 'CHECK_IN_PROGRESS'],
  ];
  for (const [name, s, reason] of cases) {
    const r = gate(s);
    assert.equal(r.allow, false, name);
    assert.equal(r.reason, reason, name);
  }
  for (const d of ['REJECTED', 'NEEDS_MORE_INFORMATION', 'APPROVED_WITH_CONDITIONS']) {
    const { row, record } = signedDecision({ decision: d, conditions: d === 'APPROVED_WITH_CONDITIONS' ? ['Mask inputs'] : [], questions: d === 'NEEDS_MORE_INFORMATION' ? ['Where is it hosted?'] : [] });
    const r = gate({ item: ITEM(), latest: row, latestHuman: row, latestRecord: record, humanRecord: record });
    assert.deepEqual([r.allow, r.reason], [false, { REJECTED: 'REJECTED', NEEDS_MORE_INFORMATION: 'NEEDS_MORE_INFORMATION', APPROVED_WITH_CONDITIONS: 'CONDITIONS_OUTSTANDING' }[d]], d);
  }
});

test('policy: approvals do not cover changed text (pending re-check, invalidated, changed since a decision)', () => {
  const { row, record } = signedDecision();
  // Edited after approval; the re-check has not finished.
  assert.equal(evaluateGate({ item: ITEM(), latest: row, latestHuman: row, latestRecord: record, humanRecord: record, currentFp: FP2, inScope: true, signing: SIGN }).reason, 'CHANGED_RECHECKING');
  // Material change recorded by the system.
  const inv = signedDecision({ seq: 2, kind: 'system', decision: 'APPROVAL_INVALIDATED', rationale: null, decided_by: null, fp: FP2, detail: { basedOnSeq: 1 } }).row;
  assert.equal(gate({ item: ITEM({ screened_fp: FP2 }), latest: inv, latestHuman: row, currentFp: FP2 }).reason, 'APPROVAL_INVALIDATED');
  // A rejection is not carried over to new text.
  const rej = signedDecision({ decision: 'REJECTED' }).row;
  assert.equal(gate({ item: ITEM({ screened_fp: FP2 }), latest: rej, latestHuman: rej, currentFp: FP2 }).reason, 'CHANGED_SINCE_DECISION');
});

test('policy: a system carry-over allows only when it carries a verified human APPROVED decision', () => {
  const human = signedDecision();
  const carry = signedDecision({ seq: 2, kind: 'system', decision: 'APPROVAL_RECONFIRMED', rationale: null, decided_by: null, fp: FP2, detail: { basedOnSeq: 1, carried: 'APPROVED' } }, { seq: 2 });
  const s = { item: ITEM({ screened_fp: FP2 }), latest: carry.row, latestHuman: human.row, latestRecord: carry.record, humanRecord: human.record, currentFp: FP2 };
  assert.equal(gate(s).reason, 'ALLOW_APPROVED_CARRIED');
  // Carried conditions still need confirmation.
  const awc = signedDecision({ decision: 'APPROVED_WITH_CONDITIONS', conditions: ['Mask inputs'] });
  const carryAwc = signedDecision({ seq: 2, kind: 'system', decision: 'APPROVAL_RECONFIRMED', rationale: null, decided_by: null, fp: FP2, conditions: ['Mask inputs'], detail: { carried: 'APPROVED_WITH_CONDITIONS' } }, { seq: 2 });
  assert.equal(gate({ ...s, latest: carryAwc.row, latestHuman: awc.row, latestRecord: carryAwc.record, humanRecord: awc.record }).reason, 'CONDITIONS_OUTSTANDING');
  // Inconsistent: a carry-over claiming APPROVED while the latest human decision is a rejection.
  const rej = signedDecision({ decision: 'REJECTED' });
  assert.equal(gate({ ...s, latestHuman: rej.row, humanRecord: rej.record }).reason, 'INCONSISTENT_RECORD');
  // Inconsistent: the latest human decision is newer than the carry-over.
  assert.equal(gate({ ...s, latestHuman: { ...human.row, seq: 3 } }).reason, 'INCONSISTENT_RECORD');
  // A tampered carry-over record blocks.
  assert.equal(gate({ ...s, latestRecord: { ...carry.record, state: 'APPROVED' } }).reason, 'RECORD_INVALID');
  // A missing human record blocks (pending anchor).
  assert.equal(gate({ ...s, humanRecord: null }).reason, 'RECORD_PENDING');
});

test('policy: record integrity — edited row, forged/mismatched record, wrong key, cross-site record, missing key', () => {
  const { row, record } = signedDecision();
  assert.equal(verifyDecisionRecord(row, record, SIGN), null);
  assert.equal(verifyDecisionRecord({ ...row, decision: 'APPROVED', rationale: 'edited later' }, record, SIGN), 'RECORD_INVALID');
  assert.equal(verifyDecisionRecord({ ...row, decided_by: 'acc-someone-else' }, record, SIGN), 'RECORD_INVALID');
  assert.equal(verifyDecisionRecord(row, null, SIGN), 'RECORD_PENDING');
  assert.equal(verifyDecisionRecord(row, { ...record, state: 'REJECTED' }, SIGN), 'RECORD_INVALID');
  assert.equal(verifyDecisionRecord(row, signedDecision({}, { key: 'another-key' }).record, SIGN), 'RECORD_INVALID');
  assert.equal(verifyDecisionRecord(row, signedDecision({}, { siteId: 'other-site' }).record, SIGN), 'RECORD_INVALID');
  // A self-consistent forgery: valid row hash, record re-signed with the wrong key.
  const forged = { ...record, sig: createHmac('sha256', 'guess').update(canonical(record)).digest('hex') };
  assert.equal(verifyDecisionRecord(row, forged, SIGN), 'RECORD_INVALID');
  assert.equal(verifyDecisionRecord(row, record, { siteId: 'site-test', keys: new Map(), hmacKey: null }), 'SIGNING_NOT_CONFIGURED');
  assert.equal(verifyDecisionRecord(row, record, { siteId: null, keys: new Map(), hmacKey: KEY }), 'SIGNING_NOT_CONFIGURED');
  assert.equal(gate({ item: ITEM(), latest: row, latestHuman: row, latestRecord: record, humanRecord: record, signing: { siteId: null, keys: new Map(), hmacKey: null } }).reason, 'SIGNING_NOT_CONFIGURED');
});

test('policy: unknown or inconsistent inputs fail closed', () => {
  const { row, record } = signedDecision();
  assert.equal(gate({ item: ITEM(), currentFp: 'not-a-fingerprint' }).reason, 'UNKNOWN_STATE');
  assert.equal(gate({ item: ITEM(), currentFp: undefined }).reason, 'UNKNOWN_STATE');
  assert.equal(gate({ item: ITEM(), inScope: false }).reason, 'OUT_OF_SCOPE');
  assert.equal(gate({ item: ITEM(), latest: { ...row, decision: 'APPROVED_BY_MAGIC' }, latestHuman: row }).allow, false);
  // Latest APPROVED but no latest human row → inconsistent.
  assert.equal(gate({ item: ITEM(), latest: row, latestHuman: null, latestRecord: record }).reason, 'INCONSISTENT_RECORD');
  // Latest APPROVED row claims to be a system record.
  assert.equal(gate({ item: ITEM(), latest: { ...row, kind: 'system' }, latestHuman: row, latestRecord: record, humanRecord: record }).reason, 'INCONSISTENT_RECORD');
  // A row from another issue cannot authorise this one (decision id binds the issue).
  assert.equal(gate({ item: ITEM(), latest: { ...row, issue_id: '99999' }, latestHuman: { ...row, issue_id: '99999' }, latestRecord: record, humanRecord: record }).reason, 'RECORD_INVALID');
  for (const reason of Object.keys(REASONS)) assert.match(jiraMessage(reason), /^Article25: .{20,}/);
  assert.equal(jiraMessage('NOT_A_REASON'), jiraMessage('UNKNOWN_STATE'));
});

test('modes: monitor never blocks and records would_*; enforce blocks exactly when the policy blocks', () => {
  assert.deepEqual(applyMode('monitor', { allow: false }), { result: true, verdict: 'would_block' });
  assert.deepEqual(applyMode('monitor', { allow: true }), { result: true, verdict: 'would_allow' });
  assert.deepEqual(applyMode('enforce', { allow: false }), { result: false, verdict: 'block' });
  assert.deepEqual(applyMode('enforce', { allow: true }), { result: true, verdict: 'allow' });
});

// ================================================================= coverage analysis
const ST = [{ statusReference: 's-todo', name: 'To Do' }, { statusReference: 's-ip', name: 'In Progress' }, { statusReference: 's-done', name: 'Done' }];
// Real shape observed live (Jira stores Forge lambda validators under this ruleKey).
const APP = 'a2030a0d-5fd0-4ace-8ff5-7cdbfdba0cd1';
const ENV = '00000000-0000-4000-8000-000000000001'; // synthetic environment id
const GATE_RULE = { ruleKey: 'forge:expression-validator', parameters: { key: `ari:cloud:ecosystem::extension/${APP}/${ENV}/static/article25-gate`, id: 'r1', config: '' } };
const OTHER_RULE = { ruleKey: 'system:check-permission', parameters: {} };
const isGate = (r) => String(r.parameters?.key ?? '').endsWith('/static/article25-gate');
const wf = (transitions, scope = { type: 'GLOBAL' }) => ({ id: 'wf1', name: 'Software workflow', scope, transitions });

test('coverage: covered transition, global bypass gap, initial transition ignored, other workflows ignored', () => {
  const t = (id, type, to, from, validators = []) => ({ id, name: `T${id}`, type, toStatusReference: to, links: from.map((f) => ({ fromStatusReference: f })), validators });
  const complete = analyseCoverage([wf([t(1, 'INITIAL', 's-todo', []), t(11, 'DIRECTED', 's-ip', ['s-todo'], [GATE_RULE, OTHER_RULE]), t(21, 'DIRECTED', 's-done', ['s-ip'])])], ST, isGate);
  assert.equal(complete.length, 1);
  assert.deepEqual([complete[0].coverage, complete[0].protectedStatuses, complete[0].covered[0].from, complete[0].gaps], ['complete', ['In Progress'], ['To Do'], []]);
  const gaps = analyseCoverage([wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [GATE_RULE]), t(31, 'GLOBAL', 's-ip', [])])], ST, isGate);
  assert.deepEqual([gaps[0].coverage, gaps[0].gaps[0].from, gaps[0].gaps[0].to], ['partial', ['Any status'], 'In Progress']);
  assert.deepEqual(analyseCoverage([wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [OTHER_RULE])])], ST, isGate), []);
  const tm = analyseCoverage([wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [GATE_RULE])], { type: 'PROJECT', project: { id: '10500' } })], ST, isGate);
  assert.deepEqual(tm[0].scope, { type: 'team-managed', projectId: '10500' });
  assert.deepEqual(analyseCoverage(undefined, undefined, isGate), []);
});

// ================================================================= integration: validator path
const payload = (key, from = '1', to = '3') => ({ issue: { key }, configuration: null, transition: { from: { id: from }, to: { id: to }, modifiedFields: {} } });
async function setMode(w, mode) {
  const cur = await w.desk(ADMIN).gateOverview(ADMIN);
  return w.desk(ADMIN).setGateMode({ mode, expectedSeq: cur.health.mode.seq, requestId: nextRid() }, ADMIN);
}
const validate = (w, key, over) => w.gateFor(null, over).validateDetailed(payload(key));

test('monitor is the default: nothing is blocked, would_block is recorded with reason and policy version', async () => {
  const w = await world();
  await w.screen(10001);
  const r = await validate(w, 'SHOP-1');
  assert.deepEqual(r, { outcome: { result: true }, reason: 'REVIEW_REQUIRED' });
  const [ev] = w.fake.gev;
  assert.deepEqual([ev.mode, ev.verdict, ev.reason, ev.policy_version, ev.issue_id, ev.from_status, ev.to_status], ['monitor', 'would_block', 'REVIEW_REQUIRED', GATE_POLICY_VERSION, '10001', '1', '3']);
  assert.equal(w.fake.dec.length, 0); // monitoring never creates decisions or approvals
});

test('enforce: blocks without approval, allows after approval, blocks again after a material edit, allows after re-approval', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  let r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'REVIEW_REQUIRED']);
  assert.match(r.outcome.errorMessage, /^Article25: This work item needs a privacy review/);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome, r.reason], [{ result: true }, 'ALLOW_APPROVED']);
  // Edit: until the re-check finishes, the approval does not cover the new text.
  w.issues[10001].description = adf('Record checkout sessions and segment shoppers who abandon carts containing prescription items. Send shopper email addresses to Twilio for follow-up texts.');
  assert.equal((await validate(w, 'SHOP-1')).reason, 'CHANGED_RECHECKING');
  await w.screen(10001); // material → APPROVAL_INVALIDATED
  r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'APPROVAL_INVALIDATED']);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
  assert.deepEqual(w.fake.gev.map((e) => e.verdict), ['block', 'allow', 'block', 'block', 'allow']);
});

test('enforce: non-material edit after approval stays allowed (carried over, record verified)', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', APPROVE);
  w.issues[10001].summary = 'Add session replay to the checkout flow with ReplayCloud';
  await w.screen(10001);
  assert.deepEqual(await validate(w, 'SHOP-1'), { outcome: { result: true }, reason: 'ALLOW_APPROVED_CARRIED' });
});

test('enforce: conditions block until a reviewer confirms them with Approve; rejection and requests for information block', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate once inputs are masked.', conditions: ['Mask all form inputs'] });
  let r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'CONDITIONS_OUTSTANDING']);
  await decision(w, REV2, 'SHOP-1', { decision: 'APPROVED', rationale: 'Conditions confirmed met: inputs are masked in the release build.' });
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ALLOW_APPROVED');
  await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'New evidence: recordings include prescriptions.' });
  assert.equal((await validate(w, 'SHOP-1')).reason, 'REJECTED');
  await decision(w, REV1, 'SHOP-1', { decision: 'NEEDS_MORE_INFORMATION', rationale: 'Hosting region unknown.', questions: ['Where is the data hosted?'] });
  r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'NEEDS_MORE_INFORMATION']);
});

test('enforce: tampered decision rows or chain records, and unanchored approvals, never authorise', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'Not proportionate for health data.' });
  w.fake.dec[0].decision = 'APPROVED'; // database tampering: rejection rewritten as approval
  assert.equal((await validate(w, 'SHOP-1')).reason, 'RECORD_INVALID');
  w.fake.dec[0].decision = 'REJECTED';
  const w2 = await world();
  await w2.screen(10001);
  await setMode(w2, 'enforce');
  await decision(w2, REV1, 'SHOP-1', APPROVE);
  const rec = JSON.parse(w2.fake.chn[0].record);
  w2.fake.chn[0].record = JSON.stringify({ ...rec, decidedBy: 'acc-someone-else' });
  assert.equal((await validate(w2, 'SHOP-1')).reason, 'RECORD_INVALID');
  // Partial failure: approval stored but not anchored → blocked until the reconciler repairs it.
  const w3 = await world();
  await w3.screen(10001);
  await setMode(w3, 'enforce');
  w3.fake.failures.chainInsert = true;
  await decision(w3, REV1, 'SHOP-1', APPROVE);
  assert.equal((await validate(w3, 'SHOP-1')).reason, 'RECORD_PENDING');
  w3.fake.failures.chainInsert = false;
  await w3.reviewFor(null).repairChain();
  assert.equal((await validate(w3, 'SHOP-1')).reason, 'ALLOW_APPROVED');
});

test('missing signing key or unknown site never bypasses the gate', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', APPROVE);
  assert.equal((await validate(w, 'SHOP-1', { settings: { ...w.settings, signingKey: null, recordKey: null } })).reason, 'SIGNING_NOT_CONFIGURED');
  assert.equal((await validate(w, 'SHOP-1', { siteId: null })).reason, 'SIGNING_NOT_CONFIGURED');
  assert.equal((await validate(w, 'SHOP-1', { siteId: 'another-site' })).reason, 'RECORD_INVALID');
  // The record key replaced WITHOUT a handover (no previous key, no adopted predecessor): old approvals are not trusted.
  assert.equal((await validate(w, 'SHOP-1', { settings: { ...w.settings, recordKey: newRecordKey() } })).reason, 'RECORD_KEY_UNTRUSTED');
  // A legacy-mode deployment (HMAC only) cannot verify Ed25519 records it does not trust either.
  assert.equal((await validate(w, 'SHOP-1', { settings: { ...w.settings, recordKey: null } })).outcome.result, false);
});

test('infrastructure failures block even in monitor mode (mode unknown) and are audited when possible', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  w.fake.failures.gateSnapshot = true; // SQL unavailable
  let r = await validate(w, 'SHOP-1');
  assert.deepEqual([r.outcome.result, r.reason], [false, 'SYSTEM_UNAVAILABLE']);
  w.fake.failures.gateSnapshot = false;
  w.fake.failures.schemaMissing = true; // migration not applied
  assert.equal((await validate(w, 'SHOP-1')).reason, 'SYSTEM_UNAVAILABLE');
  w.fake.failures.schemaMissing = false;
  w.fake.failures.gateSnapshotDelayMs = 200; // SQL timeout
  r = await validate(w, 'SHOP-1', { deadlineMs: 50 });
  assert.deepEqual([r.outcome.result, r.reason], [false, 'TIMEOUT']);
  w.fake.failures.gateSnapshotDelayMs = 0;
  w.jiraFailure.current = new AppError(ErrorCode.UPSTREAM_UNAVAILABLE); // Jira down
  assert.equal((await validate(w, 'SHOP-1')).reason, 'SYSTEM_UNAVAILABLE');
  w.jiraFailure.current = new AppError(ErrorCode.NOT_FOUND); // issue deleted / not readable by the app
  assert.equal((await validate(w, 'SHOP-1')).reason, 'ISSUE_UNAVAILABLE');
  w.jiraFailure.current = new TypeError('unexpected'); // any other function failure
  assert.equal((await validate(w, 'SHOP-1')).reason, 'SYSTEM_UNAVAILABLE');
  w.jiraFailure.current = null;
  assert.ok(w.fake.gev.every((e) => e.verdict === 'block' && e.mode === 'unknown'));
});

test('a failing audit write never changes the verdict (allow stays allow, block stays block)', async () => {
  const w = await world();
  await w.screen(10001);
  await w.screen(10002);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', APPROVE);
  w.fake.failures.gateEventsInsert = true;
  assert.deepEqual((await validate(w, 'SHOP-1')).outcome, { result: true });
  assert.equal((await validate(w, 'HR-7')).outcome.result, false);
});

test('invalid issue context is refused without touching data', async () => {
  const w = await world();
  await setMode(w, 'enforce');
  for (const bad of [undefined, null, {}, { issue: {} }, { issue: { key: '' } }, { issue: { key: "SHOP-1' OR 1=1" } }, { issue: { key: '../SHOP-1' } }, { issue: { key: 'SHOP-0' } }]) {
    const r = await w.gateFor(null).validateDetailed(bad);
    assert.deepEqual([r.outcome.result, r.reason], [false, 'INVALID_CONTEXT']);
  }
  // Transition ids are only recorded when numeric.
  await w.gateFor(null).validateDetailed({ issue: { key: 'SHOP-1' }, transition: { from: { id: 'x; drop' }, to: { id: '3' } } });
  assert.deepEqual([w.fake.gev.at(-1).from_status, w.fake.gev.at(-1).to_status], [null, '3']);
});

test('unknown stored mode is treated as enforce (strictest)', async () => {
  const w = await world();
  await w.screen(10001);
  w.fake.sev.push({ setting: 'gate.mode', seq: 1, value: 'disabled', changed_by: ADMIN, changed_at: 1, request_id: 'seed-weird', note: null });
  assert.equal((await validate(w, 'SHOP-1')).outcome.result, false);
});

test('duplicate validator executions and bulk transitions: each issue is judged on its own, with no side effects', async () => {
  const w = await world();
  await w.screen(10001);
  await w.screen(10002);
  await setMode(w, 'enforce');
  await decision(w, REV1, 'SHOP-1', APPROVE);
  const decisionsBefore = w.fake.dec.length;
  const results = await Promise.all(['SHOP-1', 'HR-7', 'SHOP-1', 'HR-7', 'SHOP-1', 'HR-7'].map((k) => validate(w, k)));
  assert.deepEqual(results.map((r) => r.outcome.result), [true, false, true, false, true, false]);
  assert.equal(w.fake.dec.length, decisionsBefore);
  assert.equal(w.fake.gev.length, 6);
});

test('an out-of-scope project with a protected transition blocks (configuration conflict)', async () => {
  const w = await world();
  await w.screen(10001);
  await setMode(w, 'enforce');
  const r = await validate(w, 'SHOP-1', { settings: { ...w.settings, isProjectInScope: () => false } });
  assert.deepEqual([r.outcome.result, r.reason], [false, 'OUT_OF_SCOPE']);
});

test('gate events are content-free and separate from decisions', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  const before = w.fake.dec.length;
  await validate(w, 'SHOP-1');
  assert.equal(w.fake.dec.length, before);
  const json = JSON.stringify(w.fake.gev);
  for (const s of ['session replay', 'prescription', 'ReplayCloud', REV1, REPORTER, 'acc-']) assert.equal(json.includes(s), false, s);
  assert.equal(w.fake.gev[0].content_ref.length, 16);
});

// ================================================================= admin: mode, SoD, health
test('only Jira administrators can view the gate overview or change the mode or separation of duties', async () => {
  const w = await world();
  for (const who of [REV1, OUTSIDER, null]) {
    await assert.rejects(w.desk(who).gateOverview(who), codeOf('NOT_AUTHORISED'));
    await assert.rejects(w.desk(who).setGateMode({ mode: 'enforce', expectedSeq: 0, requestId: nextRid() }, who), codeOf('NOT_AUTHORISED'));
    await assert.rejects(w.desk(who).setSeparationOfDuties({ value: 'off', expectedSeq: 0, requestId: nextRid() }, who), codeOf('NOT_AUTHORISED'));
  }
  assert.equal(w.fake.sev.length, 0);
});

test('mode changes are audited, optimistic and idempotent; invalid values are refused', async () => {
  const w = await world();
  const d = w.desk(ADMIN);
  await assert.rejects(d.setGateMode({ mode: 'off', expectedSeq: 0, requestId: nextRid() }, ADMIN), codeOf('INVALID_INPUT'));
  await assert.rejects(d.setGateMode({ mode: 'enforce', expectedSeq: 0, requestId: 'x' }, ADMIN), codeOf('INVALID_INPUT'));
  const rid = nextRid();
  const [a, b] = await Promise.all([d.setGateMode({ mode: 'enforce', expectedSeq: 0, requestId: rid, note: 'Pilot on test projects' }, ADMIN), d.setGateMode({ mode: 'enforce', expectedSeq: 0, requestId: rid }, ADMIN)]);
  assert.deepEqual([a.status, b.status].sort(), ['changed', 'unchanged']);
  // A concurrent change based on an old view loses with CONFLICT (no silent overwrite).
  await assert.rejects(d.setGateMode({ mode: 'monitor', expectedSeq: 0, requestId: nextRid() }, ADMIN), codeOf('CONFLICT'));
  await d.setGateMode({ mode: 'monitor', expectedSeq: 1, requestId: nextRid() }, ADMIN);
  const o = await d.gateOverview(ADMIN);
  assert.deepEqual(o.modeHistory.map((h) => [h.value, h.seq]), [['monitor', 2], ['enforce', 1]]);
  assert.equal(o.modeHistory[1].note, 'Pilot on test projects');
  assert.equal(JSON.stringify(o).includes(ADMIN), false); // names only, no account ids
});

test('separation of duties is an audited admin switch (default on)', async () => {
  const w = await world();
  w.members.push({ accountId: REPORTER, displayName: 'Reporter', active: true });
  await w.screen(10001);
  await assert.rejects(decision(w, REPORTER, 'SHOP-1', APPROVE), codeOf('SOD_BLOCKED'));
  const cur = (await w.desk(ADMIN).gateOverview(ADMIN)).separationOfDuties;
  assert.deepEqual([cur.value, cur.isDefault], ['on', true]);
  await w.desk(ADMIN).setSeparationOfDuties({ value: 'off', expectedSeq: 0, requestId: nextRid(), note: 'Single-reviewer team' }, ADMIN);
  assert.equal((await decision(w, REPORTER, 'SHOP-1', APPROVE)).status, 'recorded');
  const o = await w.desk(ADMIN).gateOverview(ADMIN);
  assert.deepEqual(o.separationOfDutiesHistory.map((h) => h.value), ['off']);
  // An unreadable setting is treated as ON (strict).
  w.fake.failures.settingsRead = true;
  assert.equal(await w.reviewFor(null).separationOfDutiesOn(), true);
});

test('health: never claims protection without verified coverage and working dependencies', async () => {
  const w = await world();
  const d = w.desk(ADMIN);
  let h = (await d.gateOverview(ADMIN)).health;
  assert.deepEqual([h.overall, h.coverage.status, h.checks.database, h.checks.signing, h.mode.mode, h.mode.isDefault], ['not_protected', 'none', 'ok', 'configured', 'monitor', true]);
  const t = (id, type, to, from, validators = []) => ({ id, name: `T${id}`, type, toStatusReference: to, links: from.map((f) => ({ fromStatusReference: f })), validators });
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [GATE_RULE]), t(31, 'GLOBAL', 's-ip', [])])], statuses: ST };
  h = (await d.gateOverview(ADMIN)).health;
  assert.deepEqual([h.overall, h.coverage.workflows[0].gaps[0].from[0]], ['gaps', 'Any status']);
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [GATE_RULE])])], statuses: ST };
  assert.equal((await d.gateOverview(ADMIN)).health.overall, 'monitoring');
  await setMode(w, 'enforce');
  assert.equal((await d.gateOverview(ADMIN)).health.overall, 'enforcing');
  // Rules from another app (e.g. the Stage 1 spike) or another module are not counted.
  const otherApp = { ruleKey: 'forge:expression-validator', parameters: { key: `ari:cloud:ecosystem::extension/a6a87625-08ce-466e-9322-016c9af89fa8/${ENV}/static/article25-gate` } };
  const otherModule = { ruleKey: 'forge:expression-validator', parameters: { key: `ari:cloud:ecosystem::extension/${APP}/${ENV}/static/a25-validator-lambda` } };
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [otherApp, otherModule, { ruleKey: 'article25-gate' }])])], statuses: ST };
  assert.equal((await w.gateFor(ADMIN, { appId: APP }).health()).coverage.status, 'none');
  w.workflowFixture.current = Object.assign(new AppError(ErrorCode.NOT_AUTHORISED), { status: 403 });
  h = (await d.gateOverview(ADMIN)).health;
  assert.deepEqual([h.overall, h.coverage.status, h.coverage.error], ['unknown', 'unknown', 'not_permitted']);
  w.fake.failures.schemaMissing = true;
  h = (await d.gateOverview(ADMIN)).health;
  assert.deepEqual([h.overall, h.checks.database], ['not_ready', 'migration_missing']);
  w.fake.failures.schemaMissing = false;
  h = await w.gateFor(ADMIN, { settings: { ...w.settings, signingKey: null, recordKey: null } }).health();
  assert.deepEqual([h.overall, h.checks.signing], ['not_ready', 'missing']);
});

test('workspace and panel show the gate preview and this issue\'s recent checks; previews record nothing', async () => {
  const w = await world();
  await w.screen(10001);
  let ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws.gate.mode, ws.gate.allow, ws.gate.reason], ['monitor', false, 'REVIEW_REQUIRED']);
  assert.equal(w.fake.gev.length, 0);
  await validate(w, 'SHOP-1');
  ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws.gate.recent.length, ws.gate.recent[0].verdict, ws.gate.recent[0].to], [1, 'would_block', 'In Progress']);
  const panel = await w.desk(REV1).panelState({ id: '10001' }, REV1);
  assert.equal(panel.gate.reason, 'REVIEW_REQUIRED');
  // A user who cannot browse the issue gets no gate information.
  await assert.rejects(w.desk(OUTSIDER).workspace('HR-7', OUTSIDER), codeOf('NOT_FOUND'));
});
