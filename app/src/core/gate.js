// Article25 workflow gate — pure policy (no Forge imports; exhaustively unit-tested).
//
// Central promise: a protected Jira transition proceeds only when a human reviewer's APPROVED
// decision covers the exact current text of the work item and that decision's signed record
// verifies. Everything else — no record, checks in progress or failed, automatic "no concern"
// results, conditions not yet confirmed, rejections, requests for information, invalidated or
// changed approvals, unverifiable records, missing configuration, unknown states — blocks.
//
// The gate never interprets screening results itself: it consumes the review status derived by
// core/review.js (the same function the desk uses), so the desk and the gate cannot disagree.
import { deriveReviewStatus, decisionIdOf } from './review.js';
import { verifyRecordSignature, recordIssueId } from './ledger.js';

export const GATE_POLICY_VERSION = 'g1';
export const GATE_MODES = Object.freeze(['monitor', 'enforce']);
export const DEFAULT_GATE_MODE = 'monitor'; // safest non-blocking default until an admin opts in

/**
 * Every reason the gate can give. `allow` is the ONLY place a transition can be permitted.
 * `message` is shown by Jira when a transition is refused (one sentence + what to do next).
 */
export const REASONS = Object.freeze({
  ALLOW_APPROVED: { allow: true, message: 'A reviewer approved the current text of this work item.' },
  ALLOW_APPROVED_CARRIED: { allow: true, message: 'A reviewer approved this work item; later edits added no new privacy signals, so the approval was carried over.' },

  INVALID_CONTEXT: { allow: false, message: 'Article25 could not identify the work item for this transition. Try again or ask your Jira administrator.' },
  ISSUE_UNAVAILABLE: { allow: false, message: 'Article25 could not read this work item. Try again; if it persists, ask your Jira administrator.' },
  SYSTEM_UNAVAILABLE: { allow: false, message: 'Article25 could not verify the privacy decision right now, so the transition was stopped. Try again in a minute.' },
  TIMEOUT: { allow: false, message: 'Article25 took too long to verify the privacy decision, so the transition was stopped. Try again.' },
  OUT_OF_SCOPE: { allow: false, message: 'This transition is protected by Article25, but this project is not in Article25\'s scope. Ask your Jira administrator to fix the configuration.' },

  NOT_SCREENED: { allow: false, message: 'Article25 has not checked this work item yet. Open the Privacy panel and choose "Check now", then request a review.' },
  CHECK_IN_PROGRESS: { allow: false, message: 'Article25 is checking the latest text of this work item. Try again in a minute.' },
  CHECK_FAILED: { allow: false, message: 'Article25 could not check this work item. Open the Privacy panel and choose "Re-check".' },
  REVIEW_REQUIRED: { allow: false, message: 'This work item needs a privacy review. A reviewer must approve it in Article25 before it can move on.' },
  NO_REVIEW_DECISION: { allow: false, message: 'Article25 found no privacy concern, but this transition requires a reviewer\'s decision. Ask a reviewer to approve it in Article25.' },
  CONDITIONS_OUTSTANDING: { allow: false, message: 'This work item was approved with conditions. A reviewer must confirm the conditions are met (by recording "Approve") before it can move on.' },
  NEEDS_MORE_INFORMATION: { allow: false, message: 'A reviewer asked for more information. Answer their questions in the work item, then ask for a new decision.' },
  REJECTED: { allow: false, message: 'A reviewer rejected the processing described in this work item. It cannot move on unless a reviewer records a new decision.' },
  APPROVAL_INVALIDATED: { allow: false, message: 'The text changed in a way that needs a new privacy review, so the earlier approval no longer applies. Ask a reviewer to review it again.' },
  CHANGED_RECHECKING: { allow: false, message: 'The text changed after the approval and Article25 is re-checking it. Try again in a minute.' },
  CHANGED_SINCE_DECISION: { allow: false, message: 'The text changed after the last decision. Ask a reviewer to review the current text.' },

  SIGNING_NOT_CONFIGURED: { allow: false, message: 'Article25 cannot verify decisions because record signing is not configured. Ask your Jira administrator.' },
  RECORD_PENDING: { allow: false, message: 'The approval is still being recorded. Try again in a minute.' },
  RECORD_INVALID: { allow: false, message: 'The approval record for this work item failed its integrity check, so it cannot be used. Ask your Jira administrator.' },
  RESTORE_INCOMPLETE: { allow: false, message: 'Article25 is restoring its decision record, or a restore stopped part-way. Protected transitions stay blocked until it completes. Ask your Jira administrator.' },
  RECORD_KEY_UNTRUSTED: { allow: false, message: 'The approval was signed with a key Article25 does not trust yet (the signing key changed). Ask your Jira administrator to confirm the previous key in Settings.' },
  INCONSISTENT_RECORD: { allow: false, message: 'Article25 found inconsistent review records for this work item, so the transition was stopped. Ask a reviewer to record a new decision.' },
  UNKNOWN_STATE: { allow: false, message: 'Article25 could not determine the review state of this work item, so the transition was stopped. Ask a reviewer to check it.' },
});

/** Status (core/review.js) → gate reason, for every status that does not need record checks. */
const STATUS_REASON = Object.freeze({
  NOT_SCREENED: 'NOT_SCREENED',
  AWAITING_SCREENING: 'CHECK_IN_PROGRESS',
  SCREENING_FAILED: 'CHECK_FAILED',
  AWAITING_REVIEW: 'REVIEW_REQUIRED',
  NOT_REQUIRED: 'NO_REVIEW_DECISION', // an automatic "no concern" result is not a human decision
  APPROVED_WITH_CONDITIONS: 'CONDITIONS_OUTSTANDING',
  NEEDS_MORE_INFORMATION: 'NEEDS_MORE_INFORMATION',
  REJECTED: 'REJECTED',
  APPROVAL_STALE: 'APPROVAL_INVALIDATED',
  PENDING_RECHECK: 'CHANGED_RECHECKING',
  CHANGED_SINCE_DECISION: 'CHANGED_SINCE_DECISION',
});

/**
 * Verify ONE stored decision against its signed chain record (O(1); the full chain is verified by
 * the desk's "Verify record" and the reconciler). Returns null when valid, otherwise a reason.
 * signing: { siteId, keys: Map(kid → {publicKey}) of TRUSTED keys, hmacKey (legacy v2) }.
 */
export function verifyDecisionRecord(row, record, signing) {
  const { siteId, keys, hmacKey } = signing ?? {};
  if (!siteId || (!hmacKey && !(keys && keys.size))) return 'SIGNING_NOT_CONFIGURED';
  const recomputed = decisionIdOf({
    issueId: row.issue_id, seq: Number(row.seq), kind: row.kind, decision: row.decision, rationale: row.rationale, conditions: row.conditions, questions: row.questions,
    decidedBy: row.decided_by, decidedAt: Number(row.decided_at), screeningId: row.screening_id, fp: row.fp, pipelineVersion: row.pipeline_version, outcome: row.outcome,
  });
  if (recomputed !== row.decision_id) return 'RECORD_INVALID'; // the stored row was edited
  if (!record) return 'RECORD_PENDING'; // inserted but not yet anchored (reconciler repairs)
  const problem = verifyRecordSignature(record, { siteId, keys, hmacKey });
  if (problem === 'unknown_key') return 'RECORD_KEY_UNTRUSTED';
  if (problem === 'legacy_unverifiable') return 'SIGNING_NOT_CONFIGURED';
  if (problem) return 'RECORD_INVALID';
  if (record.decisionId !== row.decision_id || record.state !== row.decision || recordIssueId(record) !== String(row.issue_id)) return 'RECORD_INVALID';
  return null;
}

/**
 * Decide whether a protected transition may proceed.
 * @param {object} s
 * @param {object|null} s.item          work_items row (null: never screened)
 * @param {object|null} s.latest        latest decision row (human or system)
 * @param {object|null} s.latestHuman   latest HUMAN decision row
 * @param {object|null} s.latestRecord  signed chain record of `latest`
 * @param {object|null} s.humanRecord   signed chain record of `latestHuman`
 * @param {string} s.currentFp          fingerprint of the work item's CURRENT text
 * @param {boolean} s.inScope           project is in Article25's scope
 * @param {{siteId:string|null, keys:Map, hmacKey:string|null}} s.signing  trusted keys (core/ledger.js)
 * @returns {{ allow: boolean, reason: string, status: string, decisionSeq: number|null }}
 */
export function evaluateGate({ item, latest, latestHuman, latestRecord, humanRecord, currentFp, inScope, signing, restore = null }) {
  const out = (reason, status, decisionSeq = null) => ({ allow: REASONS[reason]?.allow === true, reason: REASONS[reason] ? reason : 'UNKNOWN_STATE', status, decisionSeq });
  // Never treat a partly restored or in-flight restore as authoritative.
  if (restore) return out('RESTORE_INCOMPLETE', 'RESTORE');
  if (!inScope) return out('OUT_OF_SCOPE', 'OUT_OF_SCOPE');
  if (typeof currentFp !== 'string' || !/^[0-9a-f]{64}$/.test(currentFp)) return out('UNKNOWN_STATE', 'UNKNOWN');

  // Text edited but not yet re-checked and no decision exists: the check result is for old text.
  if (!latest && item && item.screened_fp && item.screened_fp !== currentFp) return out('CHECK_IN_PROGRESS', 'AWAITING_SCREENING');

  const carried = latest?.decision === 'APPROVAL_RECONFIRMED' ? latest?.detail?.carried ?? null : null;
  const { status, approvedForContent } = deriveReviewStatus(item, latest ? { ...latest, carried } : null, currentFp);

  if (status === 'APPROVED' && approvedForContent) {
    // Consistency: the approval must be a human APPROVED decision, directly or carried by the system.
    if (!latestHuman || latestHuman.decision !== 'APPROVED') return out('INCONSISTENT_RECORD', status, latest?.seq ?? null);
    const isCarried = latest.decision === 'APPROVAL_RECONFIRMED';
    if (isCarried && (carried !== 'APPROVED' || Number(latestHuman.seq) >= Number(latest.seq))) return out('INCONSISTENT_RECORD', status, latest.seq);
    if (!isCarried && (latest.kind !== 'human' || Number(latest.seq) !== Number(latestHuman.seq))) return out('INCONSISTENT_RECORD', status, latest.seq);
    // Integrity: the human approval and (if carried) the system carry-over must both verify.
    const humanProblem = verifyDecisionRecord(latestHuman, humanRecord, signing);
    if (humanProblem) return out(humanProblem, status, latestHuman.seq);
    if (isCarried) {
      const carryProblem = verifyDecisionRecord(latest, latestRecord, signing);
      if (carryProblem) return out(carryProblem, status, latest.seq);
    }
    return out(isCarried ? 'ALLOW_APPROVED_CARRIED' : 'ALLOW_APPROVED', status, latest.seq);
  }
  const reason = STATUS_REASON[status];
  return out(reason ?? 'UNKNOWN_STATE', status ?? 'UNKNOWN', latest?.seq ?? null);
}

/** What the gate does with an evaluation in a given mode. */
export function applyMode(mode, evaluation) {
  const enforcing = mode === 'enforce';
  const verdict = enforcing ? (evaluation.allow ? 'allow' : 'block') : evaluation.allow ? 'would_allow' : 'would_block';
  return { result: enforcing ? evaluation.allow : true, verdict };
}

export const jiraMessage = (reason) => `Article25: ${(REASONS[reason] ?? REASONS.UNKNOWN_STATE).message}`;

// ---- workflow coverage (health check) -----------------------------------------------------------

/**
 * Analyse workflows (Jira `workflows/search` with transitions) for Article25 gate coverage.
 * A status is "protected" when at least one transition INTO it carries the Article25 validator.
 * Any other transition into a protected status without the validator is an unprotected path
 * (the most common gap: a global "any status → In Progress" transition).
 */
export function analyseCoverage(workflows, statuses, isGateRule) {
  const statusName = new Map((statuses ?? []).map((s) => [s.statusReference ?? s.id, s.name]));
  const results = [];
  for (const wf of workflows ?? []) {
    const transitions = (wf.transitions ?? []).filter((t) => t.type !== 'INITIAL');
    const covered = transitions.filter((t) => (t.validators ?? []).some(isGateRule));
    if (!covered.length) continue;
    const protectedTargets = new Set(covered.map((t) => t.toStatusReference));
    const describe = (t) => ({
      id: String(t.id),
      name: t.name ?? '',
      type: t.type,
      to: statusName.get(t.toStatusReference) ?? 'Unknown status',
      from: t.type === 'GLOBAL' ? ['Any status'] : (t.links ?? []).map((l) => statusName.get(l.fromStatusReference) ?? 'Unknown status'),
    });
    const gaps = transitions.filter((t) => protectedTargets.has(t.toStatusReference) && !covered.includes(t));
    results.push({
      workflowId: String(wf.id ?? ''),
      name: wf.name ?? '',
      scope: wf.scope?.type === 'PROJECT' ? { type: 'team-managed', projectId: String(wf.scope?.project?.id ?? '') } : { type: 'company-managed' },
      protectedStatuses: [...protectedTargets].map((r) => statusName.get(r) ?? 'Unknown status'),
      covered: covered.map(describe),
      gaps: gaps.map(describe),
      coverage: gaps.length ? 'partial' : 'complete',
    });
  }
  return results;
}
