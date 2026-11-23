// Review domain core (pure): decision validation, evidence binding, materiality and the derived
// review status. No Forge imports; exhaustively unit-tested in test/review.test.mjs.
import { createHash } from 'node:crypto';
import { severityOf } from './rules.js';

/** Human decisions (M3). NEEDS_MORE_INFORMATION replaces the blueprint's CHANGES_REQUESTED. */
export const HUMAN_DECISIONS = ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED', 'NEEDS_MORE_INFORMATION'];
/** System records written by the pipeline when an approved work item's content changes. */
export const SYSTEM_DECISIONS = ['APPROVAL_INVALIDATED', 'APPROVAL_RECONFIRMED'];
const APPROVING = new Set(['APPROVED', 'APPROVED_WITH_CONDITIONS', 'APPROVAL_RECONFIRMED']);

/** Outcomes that need a human decision before work proceeds (default policy, FR-A3). */
export const NEEDS_DECISION = new Set(['NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY']);

export const LIMITS = Object.freeze({ rationaleMin: 10, rationaleMax: 2000, itemMin: 3, itemMax: 300, itemsMax: 10 });

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/**
 * Validate and normalise a reviewer's decision input. Never throws.
 * @returns {{ ok: true, value: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateDecisionInput(input) {
  const errors = {};
  const decision = input?.decision;
  if (!HUMAN_DECISIONS.includes(decision)) errors.decision = 'choose_decision';
  const rationale = clean(input?.rationale);
  if (rationale.length < LIMITS.rationaleMin) errors.rationale = 'rationale_too_short';
  else if (rationale.length > LIMITS.rationaleMax) errors.rationale = 'rationale_too_long';

  const list = (name) => {
    const raw = input?.[name];
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) {
      errors[name] = 'invalid_list';
      return [];
    }
    const items = raw.map(clean).filter(Boolean);
    if (items.length > LIMITS.itemsMax) errors[name] = 'too_many_items';
    else if (items.some((x) => x.length < LIMITS.itemMin)) errors[name] = 'item_too_short';
    else if (items.some((x) => x.length > LIMITS.itemMax)) errors[name] = 'item_too_long';
    else if (new Set(items.map((x) => x.toLowerCase())).size !== items.length) errors[name] = 'duplicate_items';
    return items;
  };
  const conditions = list('conditions');
  const questions = list('questions');
  if (decision === 'APPROVED_WITH_CONDITIONS' && !errors.conditions && conditions.length === 0) errors.conditions = 'conditions_required';
  if (decision === 'NEEDS_MORE_INFORMATION' && !errors.questions && questions.length === 0) errors.questions = 'questions_required';
  // Lists that do not belong to the chosen decision are rejected, not silently dropped.
  if (decision !== 'APPROVED_WITH_CONDITIONS' && conditions.length) errors.conditions = 'not_allowed_for_decision';
  if (decision !== 'NEEDS_MORE_INFORMATION' && questions.length) errors.questions = 'not_allowed_for_decision';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { decision, rationale, conditions, questions } };
}

/**
 * Deterministic decision id: binds the decision to the issue, its position in the history, the exact
 * screened content (fingerprint + screening id) and every reviewer-entered field. Recomputing it from
 * a stored row detects any later change to that row.
 */
export function decisionIdOf(d) {
  const canon = JSON.stringify([d.issueId, d.seq, d.kind, d.decision, d.rationale ?? '', d.conditions ?? [], d.questions ?? [], d.decidedBy ?? null, d.decidedAt, d.screeningId, d.fp, d.pipelineVersion, d.outcome]);
  return createHash('sha256').update(canon).digest('hex');
}

/** The privacy-relevant signal set a decision is bound to (for material-change detection). */
export function signalSetOf(result) {
  const findings = result?.findings ?? [];
  const pick = (kinds) => [...new Set(findings.filter((f) => kinds.includes(f.kind)).map((f) => String(f.signal ?? '').toLowerCase()).filter(Boolean))].sort();
  return {
    outcome: result?.outcome ?? null,
    categories: pick(['personal_data', 'sensitive_data']),
    criteria: [...new Set((result?.criteria ?? []).map((c) => c.value))].sort(),
    recipients: pick(['external_sharing']),
    transfers: pick(['international_transfer']),
  };
}

/**
 * Is the new screening a MATERIAL change against the approved signal set?
 * Material = anything privacy-relevant was added, or the outcome became more severe.
 * Removals and identical sets are not material (the approval still covers the processing).
 */
export function materialChange(approved, current) {
  const added = {};
  for (const k of ['categories', 'criteria', 'recipients', 'transfers']) {
    const prev = new Set(approved?.[k] ?? []);
    const extra = (current?.[k] ?? []).filter((x) => !prev.has(x));
    if (extra.length) added[k] = extra;
  }
  const escalated = severityOf(current?.outcome) > severityOf(approved?.outcome);
  return { material: escalated || Object.keys(added).length > 0, added, escalated, from: approved?.outcome ?? null, to: current?.outcome ?? null };
}

/** Was a check AI-assisted? Read from its pipeline version (core/analyse.js `pipelineVersion`):
 *  AI-assisted versions end in `<extractor>:<model>`, rule-based ones in `.noai`. Unknown → false. */
export const checkedWithAi = (pipelineVersion) => typeof pipelineVersion === 'string' && pipelineVersion.includes(':') && !pipelineVersion.endsWith('.noai');

/**
 * What happens to an approval when its work item's text changed and was re-checked.
 * Carry-over needs BOTH: no material change, AND a re-check at least as thorough as the check the
 * human approval was based on. An approval granted on AI-assisted evidence is never carried over by
 * a rule-based re-check (AI unavailable, over its daily limit or spending cap, or invalid output):
 * rule-based checks have lower recall, so new data written in ways the rules cannot see would
 * slip through. Such an edit invalidates the approval and needs a human. A rule-based approval is
 * unaffected (its re-check is as thorough as its basis), and unchanged text never reaches here.
 */
export function recheckVerdict({ approvedSignalSet, current, approvedWithAi, recheckedWithAi }) {
  const m = materialChange(approvedSignalSet, current);
  const lessThorough = approvedWithAi && !recheckedWithAi;
  return { ...m, lessThorough, invalidate: m.material || lessThorough };
}

/**
 * Derived review status. Truth is the append-only decision history plus the current screening;
 * nothing here is stored, so a partially written update cannot leave an inconsistent status.
 *
 * @param {{ state: string, outcome: string|null, screened_fp: string|null } | null} item  work_items row
 * @param {object|null} latest   latest decision row (human or system)
 * @param {string|null} currentFp fingerprint of the text as seen now (null if unknown)
 */
export function deriveReviewStatus(item, latest, currentFp = null) {
  if (!item) return { status: 'NOT_SCREENED', approvedForContent: false };
  const screenedFp = item.screened_fp;
  const textMoved = Boolean(currentFp && screenedFp && currentFp !== screenedFp);
  if (!latest) {
    if (item.state !== 'SCREENED' && !item.outcome) return { status: item.state === 'SCREENING_FAILED' ? 'SCREENING_FAILED' : 'AWAITING_SCREENING', approvedForContent: false };
    return { status: NEEDS_DECISION.has(item.outcome) || item.state === 'SCREENING_FAILED' ? 'AWAITING_REVIEW' : 'NOT_REQUIRED', approvedForContent: false };
  }
  if (latest.decision === 'APPROVAL_INVALIDATED') return { status: 'APPROVAL_STALE', approvedForContent: false };
  const sameContent = latest.fp === screenedFp && !textMoved;
  if (APPROVING.has(latest.decision)) {
    const type = latest.decision === 'APPROVAL_RECONFIRMED' ? latest.carried ?? 'APPROVED' : latest.decision;
    // Content changed but the re-check has not concluded yet: the approval does NOT cover it.
    return sameContent ? { status: type, approvedForContent: true } : { status: 'PENDING_RECHECK', approvedForContent: false };
  }
  return sameContent ? { status: latest.decision, approvedForContent: false } : { status: 'CHANGED_SINCE_DECISION', approvedForContent: false };
}

/** Ordering for the inbox: what needs a reviewer now comes first. */
export const STATUS_URGENCY = {
  APPROVAL_STALE: 0,
  CHANGED_SINCE_DECISION: 1,
  AWAITING_REVIEW: 2,
  PENDING_RECHECK: 3,
  SCREENING_FAILED: 4,
  NEEDS_MORE_INFORMATION: 5,
  AWAITING_SCREENING: 6,
  REJECTED: 7,
  APPROVED_WITH_CONDITIONS: 8,
  APPROVED: 9,
  NOT_REQUIRED: 10,
};
export const ATTENTION = new Set(['APPROVAL_STALE', 'CHANGED_SINCE_DECISION', 'AWAITING_REVIEW', 'PENDING_RECHECK', 'SCREENING_FAILED']);
export const isApprovingDecision = (d) => APPROVING.has(d);
