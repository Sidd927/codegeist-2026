// Screening pipeline service. Delivery is at-least-once (Forge async events), so every step is
// idempotent and guarded:
//   lease (conditional UPDATE) → re-read issue as app → fingerprint → reuse identical screening
//   → extract (AI or rule-based) → verify evidence → rules → INSERT IGNORE screening
//   → finalize only while holding the lease → follow-up job if newer events arrived.
// No ticket text is logged or stored; only offsets, redacted excerpts and codes.
import { createHash, randomUUID } from 'node:crypto';
import { buildScreeningText } from '../../core/screening-text.js';
import { analyse, pipelineVersion } from '../../core/analyse.js';
import { AI_STATUS } from '../adapters/llm.js';
import { estimateInputTokens } from '../adapters/pricing.js';
import { AppError, ErrorCode } from '../lib/errors.js';

export const LEASE_MS = 150_000; // > consumer timeout (120 s), so a crashed worker's lease expires
export const MAX_ATTEMPTS = 4;
export const RETRY_BASE_SECONDS = 20;
const NO_INVENTORY = { configured: false, approvedVendors: [], projectCategories: [] };

export const screeningIdOf = (issueId, fp, version) => createHash('sha256').update(`${issueId}|${fp}|${version}`).digest('hex');
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * @param {object} deps { repos: {workItems, screenings, usage}, jira, llm, queue, log, clock, settings }
 */
export function createScreeningService({ repos, jira, llm, queue, log, clock = () => Date.now(), settings, pricing, onCompleted = null }) {
  const { workItems, screenings, usage, spend } = repos;
  const versionFor = (mode) => pipelineVersion(mode, mode === 'ai' ? llm.model : null);

  /** Called from the issue trigger: record + enqueue. Must stay fast and never block Jira. */
  async function onIssueEvent({ issueId, issueKey, projectKey, contentChange, eventAt }) {
    if (!settings.isProjectInScope(projectKey)) return { status: 'out_of_scope' };
    const now = clock();
    const seq = await workItems.recordEvent({ issueId, issueKey, projectKey, now, contentChange });
    await queue.push({ issueId, seq, reason: contentChange ? 'content' : 'possible-content', enqueuedAt: now, eventAt: eventAt ?? now });
    return { status: 'queued', seq };
  }

  async function onIssueDeleted({ issueId }) {
    await screenings.removeForIssue(issueId);
    await workItems.remove(issueId);
    return { status: 'deleted' };
  }

  async function requestManual({ issueId, issueKey, projectKey }) {
    if (!settings.isProjectInScope(projectKey)) throw new AppError(ErrorCode.NOT_AVAILABLE_YET, 'This project is not in Article25 scope.');
    const now = clock();
    const accepted = await workItems.requestManual({ issueId, issueKey, projectKey, now, minIntervalMs: settings.manualRescreenIntervalMs });
    if (!accepted) return { status: 'rate_limited' };
    await queue.push({ issueId, seq: null, reason: 'manual', enqueuedAt: now });
    return { status: 'queued' };
  }

  /**
   * AI extraction guarded by (1) the approved module + switch, (2) an atomic daily call budget and
   * (3) a HARD cumulative spend cap: the worst-case cost is reserved atomically before the call and
   * settled to the actual token cost afterwards. Any guard failing → labelled rule-based check.
   */
  async function extract(text) {
    if (!llm.available || !settings.aiEnabled || !settings.aiSpendCapMicros || !pricing || !spend) return { mode: 'rules', aiStatus: AI_STATUS.NOT_ENABLED };
    const withinDaily = await usage.reserveAiCall({ day: dayOf(clock()), budget: settings.dailyAiBudget });
    if (!withinDaily) return { mode: 'rules', aiStatus: AI_STATUS.OVER_BUDGET };
    const reserved = await pricing.costMicros(llm.model, estimateInputTokens(text.length + 16), llm.maxTokens);
    if (!(await spend.reserve({ micros: reserved, capMicros: settings.aiSpendCapMicros }))) return { mode: 'rules', aiStatus: AI_STATUS.SPEND_CAP };
    const r = await llm.extract(text);
    // Settle to the actual cost when usage is reported; otherwise keep the (worst-case) reservation.
    const actual = Number.isFinite(r.usage?.tokensIn) ? await pricing.costMicros(llm.model, r.usage.tokensIn, r.usage.tokensOut ?? 0) : reserved;
    await spend.adjust({ deltaMicros: actual - reserved });
    if (r.status !== AI_STATUS.OK) return { mode: 'rules', aiStatus: r.status, usage: r.usage, modelMs: r.ms, costMicros: actual, finish: r.finish };
    return { mode: 'ai', aiStatus: AI_STATUS.OK, raw: r.raw, usage: r.usage, modelMs: r.ms, costMicros: actual, finish: r.finish };
  }

  /**
   * Process one queued job. Returns a result object; throws only for retryable errors
   * (the consumer converts them into an InvocationError retry).
   */
  async function processJob(job, { retryCount = 0 } = {}) {
    const t0 = clock();
    const timing = { dbMs: 0, jiraMs: 0 };
    const timed = async (bucket, fn) => {
      const s = clock();
      try {
        return await fn();
      } finally {
        timing[bucket] += clock() - s;
      }
    };
    const token = randomUUID();
    const issueId = String(job.issueId);
    const row = await timed('dbMs', () => workItems.claim({ issueId, token, now: t0, leaseMs: LEASE_MS }));
    if (!row) return { status: 'busy' }; // another worker holds the lease; it will pick up newer events
    const seqAtClaim = row.request_seq;

    try {
      let issue;
      try {
        issue = await timed('jiraMs', () => jira.getIssueForScreening(issueId));
      } catch (e) {
        if (e?.code === ErrorCode.NOT_FOUND) {
          await onIssueDeleted({ issueId });
          return { status: 'deleted' };
        }
        throw e;
      }

      const st = buildScreeningText(issue);
      // 1) Identical content already screened with the same pipeline version? Reuse it (no AI call).
      for (const mode of ['ai', 'rules']) {
        const existingId = screeningIdOf(issueId, st.fingerprint, versionFor(mode));
        const existing = await timed('dbMs', () => screenings.get(existingId));
        if (existing && (mode === 'ai' || !settings.aiEnabled || !llm.available)) {
          const ok = await workItems.finalize({ issueId, token, screeningId: existingId, fp: st.fingerprint, outcome: existing.outcome, seqAtClaim, now: clock() });
          if (ok) await notifyCompleted(issueId, { screeningId: existingId, fp: st.fingerprint, outcome: existing.outcome, result: existing.result, pipelineVersion: existing.pipelineVersion ?? existing.pipeline_version });
          await followUpIfNeeded(issueId, seqAtClaim);
          log.info({ evt: 'screening.reused', issueId, outcome: existing.outcome, mode, ms: clock() - t0, queueMs: job.enqueuedAt ? t0 - job.enqueuedAt : undefined, dbMs: timing.dbMs, jiraMs: timing.jiraMs });
          return { status: ok ? 'reused' : 'lease_lost', screeningId: existingId, outcome: existing.outcome };
        }
      }

      // 2) Extract → verify → rules.
      const ex = await extract(st.text);
      let analysis = analyse(st, ex.raw ?? null, ex.mode, NO_INVENTORY, ex.mode === 'ai' ? llm.model : null);
      let aiStatus = ex.aiStatus;
      if (!analysis.ok) {
        // AI output failed validation: fall back to the deterministic floor, labelled, never "clean" by default.
        aiStatus = AI_STATUS.MALFORMED;
        analysis = analyse(st, null, 'rules', NO_INVENTORY);
      }
      const mode = analysis.result.mode;
      const version = versionFor(mode);
      const screeningId = screeningIdOf(issueId, st.fingerprint, version);
      const now = clock();
      await timed('dbMs', () => screenings.insert({
        screeningId, issueId, fp: st.fingerprint, pipelineVersion: version, mode, model: mode === 'ai' ? llm.model : null,
        outcome: analysis.result.outcome, result: { ...analysis.result, truncated: st.truncated }, quality: analysis.quality, aiStatus,
        tokensIn: ex.usage?.tokensIn ?? null, tokensOut: ex.usage?.tokensOut ?? null, modelMs: ex.modelMs ?? null,
        totalMs: now - t0, queueMs: job.enqueuedAt ? t0 - job.enqueuedAt : null, createdAt: now,
      }));
      await timed('dbMs', () => usage.record({ day: dayOf(now), fallback: mode !== 'ai', tokensIn: ex.usage?.tokensIn ?? 0, tokensOut: ex.usage?.tokensOut ?? 0 }));
      const ok = await timed('dbMs', () => workItems.finalize({ issueId, token, screeningId, fp: st.fingerprint, outcome: analysis.result.outcome, seqAtClaim, now }));
      if (ok) await notifyCompleted(issueId, { screeningId, fp: st.fingerprint, outcome: analysis.result.outcome, result: analysis.result, pipelineVersion: version });
      await followUpIfNeeded(issueId, seqAtClaim);
      log.info({
        evt: 'screening.done', issueId, outcome: analysis.result.outcome, mode, aiStatus, ms: clock() - t0, queueMs: job.enqueuedAt ? t0 - job.enqueuedAt : undefined,
        dbMs: timing.dbMs, jiraMs: timing.jiraMs, modelMs: ex.modelMs, count: analysis.result.findings.length,
        rejected: analysis.quality.rejected, dropped: analysis.quality.dropped, sensitive: analysis.result.findings.some((f) => f.kind === 'sensitive_data') ? 1 : 0,
        tokensIn: ex.usage?.tokensIn ?? undefined, tokensOut: ex.usage?.tokensOut ?? undefined, costMicros: ex.costMicros, finish: ex.finish,
      });
      return { status: ok ? 'screened' : 'lease_lost', screeningId, outcome: analysis.result.outcome, mode, aiStatus };
    } catch (e) {
      const code = e?.code ?? 'INTERNAL';
      const terminal = retryCount + 1 >= MAX_ATTEMPTS || code === ErrorCode.NOT_AUTHORISED;
      await workItems.fail({ issueId, token, code: String(code).slice(0, 40), terminal, now: clock() });
      log.warn({ evt: 'screening.failed', issueId, code: String(code), count: retryCount + 1, status: terminal ? 1 : 0 });
      if (terminal) return { status: 'failed', code };
      throw Object.assign(new Error('retryable screening failure'), { retryable: true, retryAfter: RETRY_BASE_SECONDS * 2 ** retryCount });
    }
  }

  /** Evidence-locked approval hook (M3). A failure leaves the derived status at PENDING_RECHECK (safe). */
  async function notifyCompleted(issueId, screening) {
    if (!onCompleted) return;
    try {
      await onCompleted({ issueId, screening });
    } catch (e) {
      log.warn({ evt: 'review.hook.failed', issueId, code: e?.code ?? 'INTERNAL' });
    }
  }

  async function followUpIfNeeded(issueId, seqAtClaim) {
    const latest = await workItems.get(issueId);
    if (latest && latest.request_seq > seqAtClaim) await queue.push({ issueId, seq: latest.request_seq, reason: 'follow-up', enqueuedAt: clock() });
  }

  /** Scheduled: re-enqueue stuck rows; give up (visibly) after repeated attempts. */
  async function reconcile({ staleMs = 5 * 60_000, limit = 25 } = {}) {
    const now = clock();
    const stuck = await workItems.listStuck({ olderThan: now - staleMs, now, limit });
    let requeued = 0;
    let failed = 0;
    for (const r of stuck) {
      if (r.attempts >= MAX_ATTEMPTS * 2) {
        if (await workItems.markFailedIfStuck({ issueId: r.issue_id, code: 'STUCK', now })) failed++;
        continue;
      }
      await workItems.touch({ issueId: r.issue_id, now });
      await queue.push({ issueId: r.issue_id, seq: null, reason: 'reconcile', enqueuedAt: now });
      requeued++;
    }
    return { requeued, failed };
  }

  return { onIssueEvent, onIssueDeleted, requestManual, processJob, reconcile, aiAvailable: llm.available };
}
