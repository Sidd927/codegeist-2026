// M3 review tests (integration). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, ErrorCode, toEnvelope } from '../src/backend/lib/errors.js';
import { verifyHistory } from '../src/core/chain-core.js';
import { createReviewService } from '../src/backend/services/review.js';
import { world, decision, adf, silent, KEY, REV1, REV2, INACTIVE, REPORTER, DEV, OUTSIDER, APPROVE, codeOf, nextRid } from './world.mjs';

// ---------------------------------------------------------------- end-to-end happy path
test('screened issue → inbox → assignment → decision → history (bound to the exact screened content)', async () => {
  const w = await world();
  await w.screen(10001);
  const inbox = await w.desk(REV1).inbox({ view: 'attention' }, REV1);
  assert.deepEqual(inbox.items.map((i) => [i.key, i.reviewStatus]), [['SHOP-1', 'AWAITING_REVIEW']]);

  const ws0 = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.equal(ws0.review.permissions.canDecide, true);
  const a = await w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 0, requestId: nextRid() }, REV1);
  assert.equal(a.status, 'assigned');

  const r = await decision(w, REV2, 'SHOP-1', APPROVE);
  assert.deepEqual([r.status, r.anchored], ['recorded', true]);
  const ws = await w.desk(REV2).workspace('SHOP-1', REV2);
  assert.deepEqual([ws.review.status, ws.review.approvedForContent, ws.review.decisions.length], ['APPROVED', true, 1]);
  assert.equal(ws.review.decisions[0].decidedBy.name, 'Reviewer Two');
  assert.equal(ws.review.assignee.name, 'Reviewer Two');
  // Stored decision is bound to the screening and content fingerprint the reviewer saw.
  const stored = w.fake.dec[0];
  assert.equal(stored.screening_id, ws0.review.binding.screeningId);
  assert.equal(stored.fp, ws0.review.binding.fp);
  assert.match(stored.pipeline_version, /noai$/);
  assert.equal((await w.desk(REV1).verifyRecord('SHOP-1', REV1)).status, 'verified');
  // Decided items leave the attention queue and appear under "decided".
  assert.equal((await w.desk(REV1).inbox({ view: 'attention' }, REV1)).total, 0);
  assert.equal((await w.desk(REV1).inbox({ view: 'decided' }, REV1)).items[0].reviewStatus, 'APPROVED');
});

test('all four human outcomes are recorded with their required content; history is append-only', async () => {
  const w = await world();
  await w.screen(10001);
  for (const input of [
    { decision: 'NEEDS_MORE_INFORMATION', rationale: 'Recipient region is not stated in the ticket.', questions: ['Where is ReplayCloud data hosted?'] },
    { decision: 'REJECTED', rationale: 'Recording prescription items is not proportionate.' },
    { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate once health items are excluded.', conditions: ['Mask all form inputs', 'Exclude prescription pages'] },
    APPROVE,
  ]) {
    w.advance(1000);
    assert.equal((await decision(w, REV1, 'SHOP-1', input)).status, 'recorded');
  }
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual(ws.review.decisions.map((d) => d.decision), ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED', 'NEEDS_MORE_INFORMATION']);
  assert.deepEqual(ws.review.decisions[3].questions, ['Where is ReplayCloud data hosted?']);
  assert.deepEqual(ws.review.decisions[1].conditions, ['Mask all form inputs', 'Exclude prescription pages']);
  assert.deepEqual(w.fake.dec.map((d) => d.seq), [1, 2, 3, 4]);
  assert.equal(verifyHistory(KEY, 'site-test', await w.fake.repos.chain.all()).valid, true);
});

// ---------------------------------------------------------------- authorisation
test('non-reviewers cannot decide, assign or list reviewers; the frontend flag is not trusted', async () => {
  const w = await world();
  await w.screen(10001);
  const ws = await w.desk(OUTSIDER).workspace('SHOP-1', OUTSIDER);
  assert.deepEqual([ws.review.permissions.canDecide, ws.review.permissions.decideReason], [false, 'NOT_REVIEWER']);
  const binding = (await w.desk(REV1).workspace('SHOP-1', REV1)).review.binding;
  await assert.rejects(w.desk(OUTSIDER).decide({ issueKey: 'SHOP-1', input: APPROVE, ...binding, expectedSeq: 0, requestId: nextRid() }, OUTSIDER), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(OUTSIDER).assign({ issueKey: 'SHOP-1', assigneeId: OUTSIDER, expectedSeq: 0, requestId: nextRid() }, OUTSIDER), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(OUTSIDER).reviewers('rev', OUTSIDER), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(OUTSIDER).verifyRecord('SHOP-1', OUTSIDER), codeOf('NOT_AUTHORISED'));
  // No actor (missing context) is treated as unauthorised, never as a reviewer.
  await assert.rejects(w.desk(null).decide({ issueKey: 'SHOP-1', input: APPROVE, ...binding, expectedSeq: 0, requestId: nextRid() }, null), codeOf('NOT_AUTHORISED'));
  assert.equal(w.fake.dec.length, 0);
});

test('reviewer-group lookup failure fails closed', async () => {
  const w = await world();
  await w.screen(10001);
  const d = w.desk(REV1);
  const review = w.reviewFor(REV1);
  // Simulate Jira being unavailable for the group lookup.
  const broken = createReviewService({ repos: w.fake.repos, jira: { groupsOf: async () => { throw new AppError(ErrorCode.UPSTREAM_UNAVAILABLE); } }, log: silent, settings: w.settings, siteId: 'site-test' });
  assert.equal(await broken.isReviewer(REV1), false);
  assert.equal(await review.isReviewer(REV1), true);
  assert.ok(d);
});

test('cross-project / no-access: a reviewer who cannot browse the issue gets NOT_FOUND and nothing is written', async () => {
  const w = await world();
  w.members.push({ accountId: OUTSIDER, displayName: 'Outside Reviewer', active: true }); // reviewer, but no HR access
  await w.screen(10002);
  await assert.rejects(w.desk(OUTSIDER).workspace('HR-7', OUTSIDER), codeOf('NOT_FOUND'));
  await assert.rejects(w.desk(OUTSIDER).decide({ issueKey: 'HR-7', input: APPROVE, screeningId: 'a'.repeat(64), fp: 'b'.repeat(64), expectedSeq: 0, requestId: nextRid() }, OUTSIDER), codeOf('NOT_FOUND'));
  await assert.rejects(w.desk(OUTSIDER).assign({ issueKey: 'HR-7', assigneeId: REV1, expectedSeq: 0, requestId: nextRid() }, OUTSIDER), codeOf('NOT_FOUND'));
  const inbox = await w.desk(OUTSIDER).inbox({ view: 'all' }, OUTSIDER);
  assert.equal(inbox.total, 0);
  assert.equal(JSON.stringify(inbox).includes('payroll'), false);
  assert.deepEqual([w.fake.dec.length, w.fake.asg.length], [0, 0]);
});

test('separation of duties: the reporter or assignee cannot decide; can be switched off explicitly', async () => {
  const w = await world();
  w.members.push({ accountId: REPORTER, displayName: 'Reporter', active: true }, { accountId: DEV, displayName: 'Dev', active: true });
  await w.screen(10001);
  for (const who of [REPORTER, DEV]) {
    assert.equal((await w.desk(who).workspace('SHOP-1', who)).review.permissions.decideReason, 'SOD');
    await assert.rejects(decision(w, who, 'SHOP-1', APPROVE), codeOf('SOD_BLOCKED'));
  }
  const off = await world({ sod: 'off' });
  off.members.push({ accountId: REPORTER, displayName: 'Reporter', active: true });
  await off.screen(10001);
  assert.equal((await decision(off, REPORTER, 'SHOP-1', APPROVE)).status, 'recorded');
});

test('decisions fail closed without a signing key (no unsigned approvals)', async () => {
  const w = await world({ signingKey: null });
  await w.screen(10001);
  assert.equal((await w.desk(REV1).workspace('SHOP-1', REV1)).review.permissions.decideReason, 'NOT_CONFIGURED');
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE), codeOf('NOT_CONFIGURED'));
  assert.equal(w.fake.dec.length, 0);
});

// ---------------------------------------------------------------- assignment
test('assignment: only active reviewers can be assigned; reassignment and unassignment keep history', async () => {
  const w = await world();
  await w.screen(10001);
  const d = w.desk(REV1);
  await assert.rejects(d.assign({ issueKey: 'SHOP-1', assigneeId: OUTSIDER, expectedSeq: 0, requestId: nextRid() }, REV1), codeOf('INVALID_INPUT'));
  await assert.rejects(d.assign({ issueKey: 'SHOP-1', assigneeId: INACTIVE, expectedSeq: 0, requestId: nextRid() }, REV1), (e) => e.code === 'INVALID_INPUT' && /inactive/.test(e.message));
  await assert.rejects(d.assign({ issueKey: 'SHOP-1', assigneeId: "x' OR 1=1 --", expectedSeq: 0, requestId: nextRid() }, REV1), codeOf('INVALID_INPUT'));
  assert.equal((await d.assign({ issueKey: 'SHOP-1', assigneeId: REV1, expectedSeq: 0, requestId: nextRid() }, REV1)).status, 'assigned');
  assert.equal((await d.assign({ issueKey: 'SHOP-1', assigneeId: REV1, expectedSeq: 1, requestId: nextRid() }, REV1)).status, 'unchanged');
  assert.equal((await d.assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 1, requestId: nextRid() }, REV1)).status, 'assigned');
  assert.equal((await d.assign({ issueKey: 'SHOP-1', assigneeId: null, expectedSeq: 2, requestId: nextRid() }, REV1)).status, 'assigned');
  const ws = await d.workspace('SHOP-1', REV1);
  assert.equal(ws.review.assignee, null);
  assert.deepEqual(ws.review.assignments.map((a) => a.assignee?.name ?? null), [null, 'Reviewer Two', 'Reviewer One']);
  // A stale expectedSeq (someone reassigned meanwhile) is a conflict, never a silent overwrite.
  await assert.rejects(d.assign({ issueKey: 'SHOP-1', assigneeId: REV1, expectedSeq: 1, requestId: nextRid() }, REV1), codeOf('CONFLICT'));
  // Inbox assignee filters.
  await d.assign({ issueKey: 'SHOP-1', assigneeId: REV1, expectedSeq: 3, requestId: nextRid() }, REV1);
  assert.equal((await d.inbox({ view: 'attention', assignee: 'me' }, REV1)).total, 1);
  assert.equal((await d.inbox({ view: 'attention', assignee: 'unassigned' }, REV1)).total, 0);
  assert.equal((await w.desk(REV2).inbox({ view: 'attention', assignee: 'me' }, REV2)).total, 0);
});

test('reviewer search returns only active members of the reviewer group; queries are validated', async () => {
  const w = await world();
  const r = await w.desk(REV1).reviewers('re', REV1); // matches Reviewer One/Two, Former Reviewer, Outside Person
  assert.deepEqual(r.reviewers.map((x) => x.displayName).sort(), ['Reviewer One', 'Reviewer Two']);
  for (const bad of ['', 'a', 'x'.repeat(51), '<script>', undefined]) await assert.rejects(w.desk(REV1).reviewers(bad, REV1), codeOf('INVALID_INPUT'));
});

test('an inactive (former) reviewer still shows in history and no longer has rights', async () => {
  const w = await world();
  await w.screen(10001);
  await w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 0, requestId: nextRid() }, REV1);
  w.members.find((m) => m.accountId === REV2).active = false;
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws.review.assignee.name, ws.review.assignee.active], ['Reviewer Two', false]);
  await assert.rejects(w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 1, requestId: nextRid() }, REV1), codeOf('INVALID_INPUT'));
});

test('account ids are returned to reviewers only; non-reviewers see names', async () => {
  const w = await world();
  await w.screen(10001);
  await w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 0, requestId: nextRid() }, REV1);
  assert.equal(JSON.stringify(await w.desk(OUTSIDER).workspace('SHOP-1', OUTSIDER)).includes('acc-'), false);
  assert.equal(JSON.stringify(await w.desk(OUTSIDER).inbox({ view: 'all' }, OUTSIDER)).includes('acc-'), false);
  assert.equal((await w.desk(REV1).workspace('SHOP-1', REV1)).review.assignee.id, REV2);
  // Reporter/assignee ids used for separation of duties never leave the server.
  const json = JSON.stringify(await w.desk(REV1).workspace('SHOP-1', REV1));
  assert.equal(json.includes(REPORTER) || json.includes(DEV) || json.includes('reporterId'), false);
});

// ---------------------------------------------------------------- input validation
test('malformed decision input is rejected with field codes and never stored', async () => {
  const w = await world();
  await w.screen(10001);
  await assert.rejects(decision(w, REV1, 'SHOP-1', { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'ok' }), (e) => {
    const env = toEnvelope(e);
    assert.deepEqual(env.error.fields, { rationale: 'rationale_too_short', conditions: 'conditions_required' });
    return env.error.code === 'INVALID_INPUT';
  });
  for (const bad of [{ decision: 'APPROVED_FOR_EVER', rationale: 'x'.repeat(30) }, { decision: 'REJECTED', rationale: { $gt: '' } }, { decision: 'APPROVED', rationale: 'Long enough rationale.', questions: ['Why?'] }, null, 'APPROVED']) {
    await assert.rejects(decision(w, REV1, 'SHOP-1', bad), codeOf('INVALID_INPUT'));
  }
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE, { requestId: 'x' }), codeOf('INVALID_INPUT'));
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE, { expectedSeq: -1 }), codeOf('INVALID_INPUT'));
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE, { expectedSeq: '1; DROP TABLE decisions' }), codeOf('INVALID_INPUT'));
  await assert.rejects(decision(w, REV1, 'SHOP-1 OR 1=1', APPROVE), codeOf('INVALID_INPUT'));
  await assert.rejects(w.desk(REV1).decide({ issueKey: 'SHOP-1', input: APPROVE, screeningId: 'not-hex', fp: 'a'.repeat(64), expectedSeq: 0, requestId: nextRid() }, REV1), codeOf('STALE_EVIDENCE'));
  await assert.rejects(w.desk(REV1).inbox({ view: 'attention', project: 'shop; drop' }, REV1), codeOf('INVALID_INPUT'));
  await assert.rejects(w.desk(REV1).inbox({ view: 'attention', page: 0 }, REV1), codeOf('INVALID_INPUT'));
  await assert.rejects(w.desk(REV1).inbox({ view: 'attention', severity: 'EVERYTHING' }, REV1), codeOf('INVALID_INPUT'));
  assert.equal(w.fake.dec.length, 0);
});

// ---------------------------------------------------------------- duplicates and concurrency
test('duplicate submission (same request id) records exactly one decision', async () => {
  const w = await world();
  await w.screen(10001);
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  const payload = { issueKey: 'SHOP-1', input: APPROVE, ...ws.review.binding, expectedSeq: 0, requestId: nextRid() };
  const [a, b] = await Promise.all([w.desk(REV1).decide(payload, REV1), w.desk(REV1).decide(payload, REV1)]);
  assert.deepEqual([a.status, b.status].sort(), ['recorded', 'unchanged']);
  assert.equal((await w.desk(REV1).decide(payload, REV1)).status, 'unchanged');
  assert.equal(w.fake.dec.length, 1);
  assert.equal(w.fake.chn.length, 1);
  // Replaying someone else's request id cannot be used to read or alter their decision.
  await assert.rejects(w.desk(REV2).decide({ ...payload, expectedSeq: 1 }, REV2), codeOf('INVALID_INPUT'));
});

test('concurrent decisions by two reviewers on the same version: exactly one wins, the other gets CONFLICT', async () => {
  const w = await world();
  await w.screen(10001);
  const b = (await w.desk(REV1).workspace('SHOP-1', REV1)).review.binding;
  const results = await Promise.allSettled([
    w.desk(REV1).decide({ issueKey: 'SHOP-1', input: APPROVE, ...b, expectedSeq: 0, requestId: nextRid() }, REV1),
    w.desk(REV2).decide({ issueKey: 'SHOP-1', input: { decision: 'REJECTED', rationale: 'Not proportionate for health data.' }, ...b, expectedSeq: 0, requestId: nextRid() }, REV2),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal(w.fake.dec.length, 1);
  assert.equal(verifyHistory(KEY, 'site-test', await w.fake.repos.chain.all()).valid, true);
});

test('a decision made on an outdated view (someone decided since) is a CONFLICT, not an overwrite', async () => {
  const w = await world();
  await w.screen(10001);
  const ws = await w.desk(REV2).workspace('SHOP-1', REV2);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  await assert.rejects(w.desk(REV2).decide({ issueKey: 'SHOP-1', input: { decision: 'REJECTED', rationale: 'Not proportionate for health data.' }, ...ws.review.binding, expectedSeq: ws.review.latestSeq, requestId: nextRid() }, REV2), codeOf('CONFLICT'));
  assert.equal(w.fake.dec.length, 1);
});

// ---------------------------------------------------------------- evidence-locked approval
test('stale evidence: content edited after the reviewer opened it → STALE_EVIDENCE (nothing recorded)', async () => {
  const w = await world();
  await w.screen(10001);
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  w.issues[10001].description = adf('Record checkout sessions and share them with partners in the United States.');
  await assert.rejects(w.desk(REV1).decide({ issueKey: 'SHOP-1', input: APPROVE, ...ws.review.binding, expectedSeq: 0, requestId: nextRid() }, REV1), codeOf('STALE_EVIDENCE'));
  const ws2 = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws2.review.binding, ws2.review.permissions.decideReason], [null, 'STALE_EVIDENCE']);
  // A forged binding (another screening id) is also refused.
  await w.screen(10001);
  const ws3 = await w.desk(REV1).workspace('SHOP-1', REV1);
  await assert.rejects(w.desk(REV1).decide({ issueKey: 'SHOP-1', input: APPROVE, screeningId: 'f'.repeat(64), fp: ws3.review.binding.fp, expectedSeq: 0, requestId: nextRid() }, REV1), codeOf('STALE_EVIDENCE'));
  assert.equal(w.fake.dec.length, 0);
});

test('material change after approval → approval invalidated automatically and re-review required', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  // Edited but not yet re-screened: approval does not cover the new text.
  w.issues[10001].description = adf('Record checkout sessions and segment shoppers who abandon carts containing prescription items. Send shopper email addresses to Twilio for follow-up texts.');
  assert.deepEqual([(await w.desk(REV1).workspace('SHOP-1', REV1)).review.status, (await w.desk(REV1).workspace('SHOP-1', REV1)).review.approvedForContent], ['PENDING_RECHECK', false]);
  await w.screen(10001);
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws.review.status, ws.review.approvedForContent], ['APPROVAL_STALE', false]);
  const sys = ws.review.decisions[0];
  assert.deepEqual([sys.kind, sys.decision, sys.decidedBy], ['system', 'APPROVAL_INVALIDATED', null]);
  assert.ok(Object.keys(sys.detail.added).length > 0 || sys.detail.escalated);
  assert.deepEqual(sys.detail.added.recipients, ['Twilio']); // shown with the text's own casing
  // It is back in the attention queue, and a new decision binds to the new content.
  assert.equal((await w.desk(REV1).inbox({ view: 'changed' }, REV1)).items[0].reviewStatus, 'APPROVAL_STALE');
  assert.equal((await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'Sharing contact data with Twilio is not covered by the approval.' })).status, 'recorded');
  assert.equal(w.fake.dec.length, 3);
  assert.equal((await w.desk(REV1).verifyRecord('SHOP-1', REV1)).status, 'verified');
});

test('non-material edit after approval → approval re-confirmed for the new content (system record, conditions carried)', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate once health items are excluded.', conditions: ['Exclude prescription pages'] });
  w.issues[10001].summary = 'Add session replay to the checkout flow with ReplayCloud';
  await w.screen(10001);
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.deepEqual([ws.review.status, ws.review.approvedForContent], ['APPROVED_WITH_CONDITIONS', true]);
  assert.deepEqual([ws.review.decisions[0].decision, ws.review.decisions[0].detail.carried, ws.review.decisions[0].conditions], ['APPROVAL_RECONFIRMED', 'APPROVED_WITH_CONDITIONS', ['Exclude prescription pages']]);
  // Re-running the same screening does not append a second system record (idempotent).
  await w.reviewFor(null).onScreeningCompleted({ issueId: '10001', screening: { screeningId: w.fake.items.get('10001').screening_id, fp: w.fake.items.get('10001').screened_fp, outcome: 'REVIEW_REQUIRED', result: {}, pipelineVersion: 'x' } });
  assert.equal(w.fake.dec.length, 2);
});

test('a rejection is not silently carried over: changed content after REJECTED shows CHANGED_SINCE_DECISION', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'Not proportionate for health data.' });
  w.issues[10001].description = adf('Record checkout sessions only; prescription pages are excluded.');
  await w.screen(10001);
  const ws = await w.desk(REV1).workspace('SHOP-1', REV1);
  assert.equal(ws.review.status, 'CHANGED_SINCE_DECISION');
  assert.equal(w.fake.dec.length, 1);
});

// ---------------------------------------------------------------- partial failure and integrity
test('SQL failure on insert surfaces an error and records nothing', async () => {
  const w = await world();
  await w.screen(10001);
  w.fake.failures.decisionInsert = true;
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE));
  assert.equal(w.fake.dec.length, 0);
});

test('partial failure: decision stored but chain anchoring failed → pending_anchor, then repaired by the reconciler', async () => {
  const w = await world();
  await w.screen(10001);
  w.fake.failures.chainInsert = true;
  const r = await decision(w, REV1, 'SHOP-1', APPROVE);
  assert.deepEqual([r.status, r.anchored], ['recorded', false]);
  assert.equal((await w.desk(REV1).verifyRecord('SHOP-1', REV1)).status, 'pending_anchor');
  w.fake.failures.chainInsert = false;
  assert.equal(await w.reviewFor(null).repairChain(), 1);
  assert.equal(await w.reviewFor(null).repairChain(), 0);
  assert.equal((await w.desk(REV1).verifyRecord('SHOP-1', REV1)).status, 'verified');
});

test('audit integrity: editing a stored decision row or a chain record is detected', async () => {
  const w = await world();
  await w.screen(10001);
  await decision(w, REV1, 'SHOP-1', { decision: 'REJECTED', rationale: 'Not proportionate for health data.' });
  w.fake.dec[0].decision = 'APPROVED'; // direct database tampering
  const v = await w.desk(REV1).verifyRecord('SHOP-1', REV1);
  assert.equal(v.status, 'problem');
  assert.ok(v.problems.some((p) => p.problem === 'row_changed'));
  w.fake.dec[0].decision = 'REJECTED';
  const rec = JSON.parse(w.fake.chn[0].record);
  w.fake.chn[0].record = JSON.stringify({ ...rec, state: 'APPROVED' });
  assert.equal((await w.desk(REV1).verifyRecord('SHOP-1', REV1)).status, 'problem');
});

// ---------------------------------------------------------------- inbox
test('inbox: server-side filters, urgency ordering and pagination', async () => {
  const w = await world();
  await w.screen(10001);
  await w.screen(10002);
  const all = await w.desk(REV1).inbox({ view: 'attention' }, REV1);
  assert.equal(all.total, 2);
  assert.deepEqual(all.projects, ['HR', 'SHOP']);
  assert.equal((await w.desk(REV1).inbox({ view: 'attention', project: 'HR' }, REV1)).items[0].key, 'HR-7');
  const sev = all.items[0].outcome;
  assert.ok((await w.desk(REV1).inbox({ view: 'attention', severity: sev }, REV1)).items.every((i) => i.outcome === sev));
  // Approving one moves it out of attention; page beyond the end clamps to the last page.
  await decision(w, REV1, 'SHOP-1', APPROVE);
  const after = await w.desk(REV1).inbox({ view: 'attention', page: 9 }, REV1);
  assert.deepEqual([after.total, after.page, after.pages, after.items[0].key], [1, 1, 1, 'HR-7']);
  assert.equal(after.counts.attention, 1);
});
