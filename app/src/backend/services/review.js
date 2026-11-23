// Review service (M3): reviewer authorisation, assignment, human decisions, evidence-locked approval
// and the decision record. Every rule is enforced here, server-side; the frontend only reflects it.
//
// Concurrency and partial failure (Forge SQL: single-statement atomicity only):
//  - decisions/assignments are single INSERT IGNORE rows at (issue_id, expectedSeq + 1) with a unique
//    request_id → duplicates are idempotent, races resolve to exactly one winner;
//  - review status is DERIVED from the latest decision (core/review.js), so no second write can be
//    left half-applied;
//  - anchoring in the signed chain is idempotent; unanchored decisions are repaired by the reconciler.
import { AppError, ErrorCode } from '../lib/errors.js';
import { validateDecisionInput, decisionIdOf, signalSetOf, recheckVerdict, checkedWithAi, isApprovingDecision, deriveReviewStatus } from '../../core/review.js';
import { buildScreeningText } from '../../core/screening-text.js';
import { createSettingsService } from './settings.js';

const REQUEST_ID = /^[A-Za-z0-9:_-]{8,100}$/;
const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/;

export function createReviewService({ repos, jira, log, clock = () => Date.now(), settings, ledger }) {
  const { decisions, assignments, workItems } = repos;
  const groupCache = new Map();
  const settingsSvc = createSettingsService({ repos, log, clock });

  /** Separation of duties (admin setting, audited; default on). Unreadable setting → on (strict). */
  async function separationOfDutiesOn() {
    try {
      return (await settingsSvc.current('review.separation_of_duties')).value !== 'off';
    } catch (e) {
      log.warn({ evt: 'settings.read.failed', reason: 'review.separation_of_duties', code: e?.code ?? 'INTERNAL' });
      return true;
    }
  }

  async function isReviewer(accountId) {
    if (!accountId || !ACCOUNT_ID.test(accountId)) return false;
    if (!groupCache.has(accountId)) {
      groupCache.set(
        accountId,
        jira
          .groupsOf(accountId)
          .then((g) => g.includes(settings.reviewerGroup))
          .catch((e) => {
            log.warn({ evt: 'reviewer.check.failed', code: e?.code ?? 'INTERNAL', status: e?.status });
            return false; // fail closed
          }),
      );
    }
    return groupCache.get(accountId);
  }

  async function requireReviewer(accountId) {
    if (!(await isReviewer(accountId))) throw new AppError(ErrorCode.NOT_AUTHORISED, `Only members of ${settings.reviewerGroup} can do this.`);
  }

  const requestIdOf = (raw) => {
    const v = String(raw ?? '');
    if (!REQUEST_ID.test(v)) throw new AppError(ErrorCode.INVALID_INPUT);
    return v;
  };
  const expectedSeqOf = (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new AppError(ErrorCode.INVALID_INPUT);
    return n;
  };

  // ---- signed record (delegated to the ledger service, M5) ----------------------------------------
  const anchor = (d) => ledger.anchor(d);
  const restoreState = () => (ledger.restoreState ? ledger.restoreState() : null);
  async function requireNoRestore() {
    if (await restoreState()) throw new AppError(ErrorCode.CONFLICT, 'A restore of the decision record is in progress or did not finish. Try again once your Jira administrator has completed it.');
  }

  async function insertDecision(row) {
    const decisionId = decisionIdOf({
      issueId: row.issueId, seq: row.seq, kind: row.kind, decision: row.decision, rationale: row.rationale, conditions: row.conditions, questions: row.questions,
      decidedBy: row.decidedBy, decidedAt: row.decidedAt, screeningId: row.screeningId, fp: row.fp, pipelineVersion: row.pipelineVersion, outcome: row.outcome,
    });
    const inserted = await decisions.insert({ ...row, decisionId });
    return { inserted, decisionId };
  }

  // ---- assignment ---------------------------------------------------------------------------
  /** Active reviewer-group members matching a name search (at most 20 candidates are checked). */
  async function reviewers(query) {
    const found = await jira.searchUsers(query);
    const checked = await Promise.all(found.filter((u) => u.active && ACCOUNT_ID.test(u.accountId)).map(async (u) => ((await isReviewer(u.accountId)) ? u : null)));
    return checked.filter(Boolean).map((u) => ({ accountId: u.accountId, displayName: u.displayName, active: true }));
  }

  async function assign({ actorId, issueKey, assigneeId, expectedSeq, requestId }) {
    await requireReviewer(actorId);
    const rid = requestIdOf(requestId);
    const exp = expectedSeqOf(expectedSeq);
    const doc = await jira.getIssueDocument(issueKey); // as-user: the actor must be able to see the issue
    const target = assigneeId === null || assigneeId === undefined || assigneeId === '' ? null : String(assigneeId);
    if (target !== null) {
      if (!ACCOUNT_ID.test(target)) throw new AppError(ErrorCode.INVALID_INPUT);
      if (!(await isReviewer(target))) throw new AppError(ErrorCode.INVALID_INPUT, 'That person is not in the reviewer group.');
      const users = await jira.usersBulk([target]);
      if (users.get(target)?.active !== true) throw new AppError(ErrorCode.INVALID_INPUT, 'That reviewer account is inactive.');
    }
    const prior = await assignments.byRequest(rid);
    if (prior) return { status: 'unchanged', assignment: prior };
    await requireNoRestore();
    const latest = await assignments.latest(doc.id);
    if ((latest?.seq ?? 0) !== exp) throw new AppError(ErrorCode.CONFLICT);
    if ((latest?.assignee ?? null) === target) return { status: 'unchanged', assignment: latest };
    const row = { issueId: doc.id, seq: exp + 1, assignee: target, assignedBy: actorId, assignedAt: clock(), requestId: rid };
    if (!(await assignments.insert(row))) {
      const dup = await assignments.byRequest(rid);
      if (dup) return { status: 'unchanged', assignment: dup };
      throw new AppError(ErrorCode.CONFLICT);
    }
    log.info({ evt: 'review.assigned', issueId: doc.id, count: row.seq });
    return { status: 'assigned', assignment: { ...row, issue_id: row.issueId, assigned_by: actorId, assigned_at: row.assignedAt } };
  }

  // ---- decision -----------------------------------------------------------------------------
  /**
   * Record a human decision bound to the exact screened content the reviewer saw.
   * Order of checks: input → reviewer → as-user read → separation of duties → evidence binding →
   * idempotency → optimistic sequence → single INSERT → anchor.
   */
  async function decide({ actorId, issueKey, input, screeningId, fp, expectedSeq, requestId }) {
    const v = validateDecisionInput(input);
    if (!v.ok) throw Object.assign(new AppError(ErrorCode.INVALID_INPUT, 'Some fields need attention.'), { fields: v.errors });
    const rid = requestIdOf(requestId);
    const exp = expectedSeqOf(expectedSeq);
    await requireReviewer(actorId);
    if (ledger.mode === 'none') throw new AppError(ErrorCode.NOT_CONFIGURED); // fail closed: no unsigned decisions
    // While a restore is being verified, applied or is incomplete, new decisions would collide with
    // the restored history (same issue sequence numbers, same chain positions).
    await requireNoRestore();

    const doc = await jira.getIssueDocument(issueKey); // as-user browse check
    if ((await separationOfDutiesOn()) && (doc.reporterId === actorId || doc.assigneeId === actorId)) throw new AppError(ErrorCode.SOD_BLOCKED);

    const prior = await decisions.byRequest(rid); // duplicate submission (double click, retry)
    if (prior) {
      if (prior.issue_id !== doc.id || prior.decided_by !== actorId) throw new AppError(ErrorCode.INVALID_INPUT);
      return { status: 'unchanged', decision: prior };
    }

    const view = await workItems.getView(doc.id);
    const item = view.row;
    const screening = view.screening;
    const currentFp = buildScreeningText(doc).fingerprint;
    if (!item || !screening || item.state !== 'SCREENED') throw new AppError(ErrorCode.STALE_EVIDENCE, 'This work item is being checked. Decide once the check has finished.');
    if (screening.screening_id !== screeningId || item.screened_fp !== fp || currentFp !== item.screened_fp) throw new AppError(ErrorCode.STALE_EVIDENCE);

    const latest = await decisions.latest(doc.id);
    if ((latest?.seq ?? 0) !== exp) throw new AppError(ErrorCode.CONFLICT);

    const row = {
      issueId: doc.id, seq: exp + 1, requestId: rid, kind: 'human', decision: v.value.decision, rationale: v.value.rationale, conditions: v.value.conditions, questions: v.value.questions,
      decidedBy: actorId, decidedAt: clock(), screeningId: screening.screening_id, fp: item.screened_fp, pipelineVersion: screening.pipeline_version, outcome: screening.outcome,
      signalSet: signalSetOf({ ...screening.result, outcome: screening.outcome }), detail: null,
    };
    const { inserted, decisionId } = await insertDecision(row);
    if (!inserted) {
      const dup = await decisions.byRequest(rid);
      if (dup) return { status: 'unchanged', decision: dup };
      throw new AppError(ErrorCode.CONFLICT);
    }
    const stored = await decisions.latest(doc.id);
    const a = await anchor(stored).catch(() => ({ anchored: false, reason: 'error' }));
    log.info({ evt: 'review.decided', issueId: doc.id, outcome: row.decision, count: row.seq, reason: a.anchored ? 'anchored' : a.reason });
    return { status: 'recorded', decision: stored, decisionId, anchored: a.anchored };
  }

  // ---- evidence-locked approval -------------------------------------------------------------
  /**
   * Called by the screening pipeline after a screening completes. If the latest decision approved
   * different content, append a SYSTEM record: APPROVAL_INVALIDATED (material change: re-review
   * required) or APPROVAL_RECONFIRMED (no new privacy signals: approval carried to the new content).
   * Idempotent (request id derives from the approval and the new screening).
   */
  async function onScreeningCompleted({ issueId, screening }) {
    const latest = await decisions.latest(issueId);
    if (!latest || !isApprovingDecision(latest.decision) || latest.fp === screening.fp) return { status: 'no_change' };
    // During a restore, do not append: the restore re-checks every restored work item when it
    // completes, and the gate compares the CURRENT text anyway (a changed text never passes).
    if (await restoreState()) return { status: 'deferred_restore' };
    const current = signalSetOf({ ...screening.result, outcome: screening.outcome });
    // The human approval this one stands on (itself, or the one a carry-over chain carries). Its check
    // mode is the review condition it was granted under. Not found → assume AI-assisted (fail safe).
    const basis = latest.kind === 'human' ? latest : (await decisions.list(issueId)).filter((d) => d.kind === 'human' && d.seq < latest.seq).at(-1) ?? null;
    const approvedWithAi = basis ? checkedWithAi(basis.pipeline_version) : true;
    const m = recheckVerdict({ approvedSignalSet: latest.signal_set, current, approvedWithAi, recheckedWithAi: checkedWithAi(screening.pipelineVersion) });
    // Signal sets compare lower-cased values; show recipients/transfers with the text's own casing.
    const original = (kinds, v) => (screening.result?.findings ?? []).find((f) => kinds.includes(f.kind) && String(f.signal ?? '').toLowerCase() === v)?.signal ?? v;
    if (m.added.recipients) m.added.recipients = m.added.recipients.map((v) => original(['external_sharing'], v));
    if (m.added.transfers) m.added.transfers = m.added.transfers.map((v) => original(['international_transfer'], v));
    const carried = latest.decision === 'APPROVAL_RECONFIRMED' ? latest.detail?.carried ?? 'APPROVED' : latest.decision;
    const row = {
      issueId, seq: latest.seq + 1, requestId: `sys:${issueId}:${latest.seq}:${screening.screeningId}`.slice(0, 100), kind: 'system',
      decision: m.invalidate ? 'APPROVAL_INVALIDATED' : 'APPROVAL_RECONFIRMED', rationale: null, conditions: m.invalidate ? [] : latest.conditions, questions: [],
      decidedBy: null, decidedAt: clock(), screeningId: screening.screeningId, fp: screening.fp, pipelineVersion: screening.pipelineVersion, outcome: screening.outcome,
      signalSet: m.invalidate ? current : latest.signal_set,
      detail: {
        basedOnSeq: latest.seq, carried, added: m.added, escalated: m.escalated, from: m.from, to: m.to,
        ...(m.lessThorough ? { recheck: { approvedWith: 'ai', checkedWith: 'rules' }, ...(m.material ? {} : { reason: 'LESS_THOROUGH_RECHECK' }) } : {}),
      },
    };
    const { inserted } = await insertDecision(row);
    if (!inserted) return { status: 'skipped' }; // already recorded, or a human decided concurrently
    await anchor(await decisions.latest(issueId)).catch(() => undefined);
    log.info({ evt: 'review.system', issueId, outcome: row.decision, count: row.seq });
    return { status: row.decision };
  }

  // ---- record integrity ---------------------------------------------------------------------
  /** Repair partial failures: anchor decisions that were inserted but not chained. Never while a
   *  restore is in progress or incomplete (it would interleave new records with restored history). */
  async function repairChain(limit = 25) {
    if (await restoreState()) return 0;
    let repaired = 0;
    for (const d of await decisions.unanchored(limit)) if ((await anchor(d)).anchored) repaired++;
    return repaired;
  }

  /** Verify the ledger and this issue's decision rows against their signed records. */
  const verify = (issueId) => ledger.verify({ issueId });

  /** Everything the workspace needs about the review of one issue (decisions, assignment, status). */
  async function reviewOf(issueId, { item, currentFp }) {
    const [list, assigns] = await Promise.all([decisions.list(issueId), assignments.list(issueId)]);
    const latest = list.at(-1) ?? null;
    const status = deriveReviewStatus(item, latest ? { ...latest, carried: latest.detail?.carried } : null, currentFp);
    return { status, decisions: list, assignments: assigns, latestSeq: latest?.seq ?? 0, assignmentSeq: assigns.at(-1)?.seq ?? 0, assignee: assigns.at(-1)?.assignee ?? null };
  }

  /** Admin: switch separation of duties (caller verified as Jira administrator). */
  const setSeparationOfDuties = ({ actorId, value, expectedSeq, requestId, note }) => settingsSvc.change({ setting: 'review.separation_of_duties', value, actorId, expectedSeq, requestId, note });
  const separationOfDutiesSetting = () => settingsSvc.current('review.separation_of_duties');
  const separationOfDutiesHistory = () => settingsSvc.history('review.separation_of_duties');

  return { isReviewer, reviewers, assign, decide, onScreeningCompleted, repairChain, verify, reviewOf, separationOfDutiesOn, setSeparationOfDuties, separationOfDutiesSetting, separationOfDutiesHistory };
}
