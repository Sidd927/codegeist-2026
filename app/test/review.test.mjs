// Review core tests: validation, evidence binding, materiality, derived status (synthetic data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionInput, decisionIdOf, signalSetOf, materialChange, deriveReviewStatus, STATUS_URGENCY, checkedWithAi, recheckVerdict } from '../src/core/review.js';
import { pipelineVersion } from '../src/core/analyse.js';

test('decision validation: each outcome requires its own content; empty or invalid submissions are rejected', () => {
  assert.deepEqual(validateDecisionInput({}).errors, { decision: 'choose_decision', rationale: 'rationale_too_short' });
  assert.equal(validateDecisionInput({ decision: 'APPROVED', rationale: 'ok' }).errors.rationale, 'rationale_too_short');
  assert.equal(validateDecisionInput({ decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate with masking.' }).errors.conditions, 'conditions_required');
  assert.equal(validateDecisionInput({ decision: 'NEEDS_MORE_INFORMATION', rationale: 'Recipient is not named.' }).errors.questions, 'questions_required');
  assert.equal(validateDecisionInput({ decision: 'APPROVED', rationale: 'Fine as described.', conditions: ['Mask inputs'] }).errors.conditions, 'not_allowed_for_decision');
  assert.equal(validateDecisionInput({ decision: 'DELETE_EVERYTHING', rationale: 'x'.repeat(20) }).errors.decision, 'choose_decision');
  assert.equal(validateDecisionInput({ decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate.', conditions: 'mask' }).errors.conditions, 'invalid_list');
  assert.equal(validateDecisionInput({ decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate.', conditions: ['Mask inputs', 'mask   INPUTS'] }).errors.conditions, 'duplicate_items');
  assert.equal(validateDecisionInput({ decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate.', conditions: Array.from({ length: 11 }, (_, i) => `Condition ${i}`) }).errors.conditions, 'too_many_items');
  assert.equal(validateDecisionInput({ decision: 'REJECTED', rationale: 'x'.repeat(2001) }).errors.rationale, 'rationale_too_long');
});
test('decision validation normalises whitespace and keeps exact reviewer text otherwise', () => {
  const v = validateDecisionInput({ decision: 'APPROVED_WITH_CONDITIONS', rationale: '  Proportionate   with masking. ', conditions: ['  Mask all form inputs  ', '30-day retention'] });
  assert.deepEqual(v, { ok: true, value: { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate with masking.', conditions: ['Mask all form inputs', '30-day retention'], questions: [] } });
});

const D = { issueId: '10001', seq: 1, kind: 'human', decision: 'APPROVED', rationale: 'Proportionate.', conditions: [], questions: [], decidedBy: 'acc-reviewer', decidedAt: 1, screeningId: 's1', fp: 'f1', pipelineVersion: 'p', outcome: 'REVIEW_REQUIRED' };
test('decision id binds every field: changing any bound field changes the id', () => {
  const id = decisionIdOf(D);
  assert.equal(id, decisionIdOf({ ...D }));
  for (const [k, v] of [['fp', 'f2'], ['screeningId', 's2'], ['rationale', 'Changed.'], ['decision', 'REJECTED'], ['decidedBy', 'someone-else'], ['seq', 2], ['conditions', ['x']]]) assert.notEqual(decisionIdOf({ ...D, [k]: v }), id, k);
});

const RESULT = (over = {}) => ({ outcome: 'REVIEW_REQUIRED', criteria: [{ value: 'c3_systematic_monitoring' }], findings: [{ kind: 'personal_data', signal: 'contact' }, { kind: 'external_sharing', signal: 'Twilio' }], ...over });
test('signal set is order-insensitive and case-normalised', () => {
  assert.deepEqual(signalSetOf(RESULT()), { outcome: 'REVIEW_REQUIRED', categories: ['contact'], criteria: ['c3_systematic_monitoring'], recipients: ['twilio'], transfers: [] });
});
test('material change: new vendor, new category, new transfer, new criterion or escalation; removals and rewording are not', () => {
  const base = signalSetOf(RESULT());
  assert.equal(materialChange(base, base).material, false);
  assert.equal(materialChange(base, signalSetOf(RESULT({ findings: [{ kind: 'personal_data', signal: 'contact' }] }))).material, false); // vendor removed
  const vendor = materialChange(base, signalSetOf(RESULT({ findings: [...RESULT().findings, { kind: 'external_sharing', signal: 'AdReach' }] })));
  assert.deepEqual([vendor.material, vendor.added], [true, { recipients: ['adreach'] }]);
  assert.equal(materialChange(base, signalSetOf(RESULT({ findings: [...RESULT().findings, { kind: 'sensitive_data', signal: 'health' }] }))).added.categories[0], 'health');
  assert.equal(materialChange(base, signalSetOf(RESULT({ findings: [...RESULT().findings, { kind: 'international_transfer', signal: 'Philippines' }] }))).material, true);
  assert.equal(materialChange(base, signalSetOf(RESULT({ outcome: 'DPIA_LIKELY' }))).escalated, true);
});

const ITEM = (over = {}) => ({ state: 'SCREENED', outcome: 'REVIEW_REQUIRED', screened_fp: 'f1', ...over });
test('derived status: no decision → awaiting review / not required; screening failure needs attention', () => {
  assert.equal(deriveReviewStatus(ITEM(), null).status, 'AWAITING_REVIEW');
  assert.equal(deriveReviewStatus(ITEM({ outcome: 'CLEAR' }), null).status, 'NOT_REQUIRED');
  assert.equal(deriveReviewStatus(null, null).status, 'NOT_SCREENED');
  assert.equal(deriveReviewStatus(ITEM({ state: 'SCREENING_FAILED', outcome: null }), null).status, 'SCREENING_FAILED');
});
test('evidence-locked approval: an approval only covers the exact content it was made on', () => {
  const approval = { decision: 'APPROVED', fp: 'f1' };
  assert.deepEqual(deriveReviewStatus(ITEM(), approval), { status: 'APPROVED', approvedForContent: true });
  assert.deepEqual(deriveReviewStatus(ITEM({ screened_fp: 'f2' }), approval), { status: 'PENDING_RECHECK', approvedForContent: false });
  assert.deepEqual(deriveReviewStatus(ITEM(), approval, 'f9'), { status: 'PENDING_RECHECK', approvedForContent: false }); // text moved, not yet re-screened
  assert.deepEqual(deriveReviewStatus(ITEM({ screened_fp: 'f2' }), { decision: 'APPROVAL_INVALIDATED', fp: 'f2' }), { status: 'APPROVAL_STALE', approvedForContent: false });
  assert.deepEqual(deriveReviewStatus(ITEM({ screened_fp: 'f2' }), { decision: 'APPROVAL_RECONFIRMED', carried: 'APPROVED_WITH_CONDITIONS', fp: 'f2' }), { status: 'APPROVED_WITH_CONDITIONS', approvedForContent: true });
});
test('non-approving decisions: changed content returns the item to review', () => {
  assert.equal(deriveReviewStatus(ITEM(), { decision: 'NEEDS_MORE_INFORMATION', fp: 'f1' }).status, 'NEEDS_MORE_INFORMATION');
  assert.equal(deriveReviewStatus(ITEM({ screened_fp: 'f2' }), { decision: 'NEEDS_MORE_INFORMATION', fp: 'f1' }).status, 'CHANGED_SINCE_DECISION');
  assert.equal(deriveReviewStatus(ITEM({ screened_fp: 'f2' }), { decision: 'REJECTED', fp: 'f1' }).status, 'CHANGED_SINCE_DECISION');
  assert.equal(deriveReviewStatus(ITEM(), { decision: 'REJECTED', fp: 'f1' }).approvedForContent, false);
});
test('every derivable status has an urgency rank', () => {
  for (const s of ['APPROVAL_STALE', 'CHANGED_SINCE_DECISION', 'AWAITING_REVIEW', 'PENDING_RECHECK', 'SCREENING_FAILED', 'NEEDS_MORE_INFORMATION', 'AWAITING_SCREENING', 'REJECTED', 'APPROVED_WITH_CONDITIONS', 'APPROVED', 'NOT_REQUIRED']) assert.equal(typeof STATUS_URGENCY[s], 'number', s);
});

test('checkedWithAi reads the check mode from real pipeline versions; unknown is not AI', () => {
  assert.equal(checkedWithAi(pipelineVersion('ai', 'claude-haiku-5-5')), true);
  assert.equal(checkedWithAi(pipelineVersion('ai', null)), true);
  assert.equal(checkedWithAi(pipelineVersion('rules')), false);
  for (const v of [null, undefined, '', 'p', 42]) assert.equal(checkedWithAi(v), false);
});
test('recheckVerdict: carry-over needs no material change AND a re-check as thorough as the approval basis', () => {
  const set = { outcome: 'REVIEW_REQUIRED', categories: ['health'], criteria: [], recipients: [], transfers: [] };
  const more = { ...set, categories: ['health', 'location'] };
  const v = (approvedWithAi, recheckedWithAi, current = set) => recheckVerdict({ approvedSignalSet: set, current, approvedWithAi, recheckedWithAi });
  assert.deepEqual([v(true, true).invalidate, v(true, true).lessThorough], [false, false]); // AI → AI, nothing new: carried
  assert.deepEqual([v(false, false).invalidate, v(false, false).lessThorough], [false, false]); // rules → rules: carried (unchanged behaviour)
  assert.deepEqual([v(false, true).invalidate, v(false, true).lessThorough], [false, false]); // rules → AI: more thorough, carried if nothing new
  assert.deepEqual([v(true, false).invalidate, v(true, false).lessThorough, v(true, false).material], [true, true, false]); // AI → rules: never carried
  assert.deepEqual([v(true, true, more).invalidate, v(true, true, more).material], [true, true]);
  assert.deepEqual([v(false, false, more).invalidate, v(false, false, more).material], [true, true]);
});
