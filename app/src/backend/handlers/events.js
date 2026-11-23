// Forge event handlers: Jira issue triggers, lifecycle (migrations), queue consumers and the
// scheduled reconciler. Triggers only record + enqueue (fast, never blocking Jira); all screening
// work happens in the queue consumer, which is idempotent because delivery is at-least-once.
import { Queue, InvocationError, InvocationErrorCode } from '@forge/events';
import { chat, list } from '@forge/llm';
import { createPricing } from '../adapters/pricing.js';
import { createJiraAdapter } from '../adapters/jira.js';
import { createLlmAdapter } from '../adapters/llm.js';
import { createScreeningService } from '../services/screening.js';
import { createReviewService } from '../services/review.js';
import { createLedgerService } from '../services/ledger.js';
import * as repos from '../repositories/sql-repositories.js';
import { applyMigrations } from '../db/schema.js';
import { configFor, settingsFromEnv } from '../lib/config.js';
import { log } from '../lib/logger.js';

export const SCREENING_QUEUE = 'a25-screening';
export const MAINTENANCE_QUEUE = 'a25-maintenance';
const screeningQueue = new Queue({ key: SCREENING_QUEUE });
const maintenanceQueue = new Queue({ key: MAINTENANCE_QUEUE });

// Forge LLM transport (the `llm` module is declared in the manifest, approved 22 Nov 2026 for development).
// Calls still require A25_AI_ENABLED=true, a daily call budget and a hard spend cap (settingsFromEnv).
const pricing = createPricing(list);

/** Site (cloud) id for signing, from whichever invocation context carries it. */
export function siteIdOf(context, event) {
  if (context?.cloudId) return String(context.cloudId);
  if (event?.context?.cloudId) return String(event.context.cloudId);
  const m = /site\/([0-9a-f-]{36})/i.exec(String(context?.installContext ?? event?.context?.installContext ?? ''));
  return m ? m[1] : null;
}

/** Ledger (signed record) for this site. Keys are only usable when the site id is known. */
export function buildLedger(siteId) {
  const settings = settingsFromEnv();
  return createLedgerService({
    repos, log, siteId,
    settings: siteId ? settings : { ...settings, signingKey: null, recordKey: null, recordKeyPrevious: null },
    rescreen: (issueId) => maintenanceQueue.push({ body: { type: 'rescreen', issueId: String(issueId) } }),
  });
}

export function buildReview(environmentType, siteId, ledger = buildLedger(siteId)) {
  const config = configFor(environmentType);
  return createReviewService({ repos, jira: createJiraAdapter({ timeoutMs: config.upstreamTimeoutMs }), log, settings: settingsFromEnv(), siteId, ledger });
}

export function buildScreening(environmentType, siteId = null) {
  const config = configFor(environmentType);
  const settings = settingsFromEnv();
  const review = buildReview(environmentType, siteId);
  return createScreeningService({
    onCompleted: (args) => review.onScreeningCompleted(args),
    repos,
    jira: createJiraAdapter({ timeoutMs: config.upstreamTimeoutMs }),
    llm: createLlmAdapter({ chat, model: settings.aiModel, timeoutMs: 25_000 }),
    pricing,
    queue: { push: (body) => screeningQueue.push({ body }) },
    log,
    settings,
  });
}

/** Classify an update's changelog. Item key names are not documented, so be defensive. */
export function classifyChange(event) {
  if (event?.eventType === 'avi:jira:created:issue') return 'content';
  const items = event?.changelog?.items;
  if (!Array.isArray(items) || items.length === 0) return 'unknown';
  const name = (it) => String(it?.fieldId ?? it?.field ?? '').toLowerCase();
  if (items.some((it) => ['summary', 'description'].includes(name(it)))) return 'content';
  return items.every((it) => name(it)) ? 'irrelevant' : 'unknown';
}

const isSchemaMissing = (e) => /doesn'?t exist|no such table|unknown table/i.test(String(e?.message ?? e));

export async function onIssueEvent(event, context) {
  const issueId = String(event?.issue?.id ?? '');
  if (!/^\d{1,18}$/.test(issueId)) return;
  const svc = buildScreening(context?.environmentType, siteIdOf(context, event));
  try {
    if (event.eventType === 'avi:jira:deleted:issue') {
      await svc.onIssueDeleted({ issueId });
      log.info({ evt: 'trigger.deleted', issueId });
      return;
    }
    const kind = classifyChange(event);
    // Log only the SHAPE of the changelog (key names), to verify the undocumented structure. Never values.
    const keys = Object.keys(event?.changelog?.items?.[0] ?? {}).sort().join('.').slice(0, 64);
    log.info({ evt: 'trigger.received', issueId, reason: kind, shape: keys || 'none' });
    if (kind === 'irrelevant') return;
    const issueKey = String(event.issue.key ?? '');
    const projectKey = event.issue.fields?.project?.key ?? issueKey.split('-')[0];
    const r = await svc.onIssueEvent({ issueId, issueKey, projectKey, contentChange: kind === 'content', eventAt: event.timestamp });
    log.info({ evt: 'trigger.queued', issueId, reason: r.status, count: r.seq ?? 0 });
  } catch (e) {
    if (isSchemaMissing(e)) await maintenanceQueue.push({ body: { type: 'migrate' } });
    log.error({ evt: 'trigger.failed', issueId, code: e?.code ?? 'INTERNAL' });
  }
}

export async function onLifecycle(_event, _context) {
  await maintenanceQueue.push({ body: { type: 'migrate' } });
  log.info({ evt: 'lifecycle.migrate-queued' });
}

export async function screeningConsumer(event, context) {
  const job = event?.body ?? {};
  const retryCount = event?.retryContext?.retryCount ?? 0;
  const svc = buildScreening(context?.environmentType, siteIdOf(context, event));
  try {
    const r = await svc.processJob(job, { retryCount });
    log.info({ evt: 'consumer.done', issueId: String(job.issueId ?? ''), reason: r.status, outcome: r.outcome, mode: r.mode, count: retryCount });
    return undefined;
  } catch (e) {
    if (isSchemaMissing(e)) {
      await maintenanceQueue.push({ body: { type: 'migrate' } });
      return new InvocationError({ retryAfter: 60, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
    }
    if (e?.retryable) return new InvocationError({ retryAfter: Math.min(900, e.retryAfter ?? 30), retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
    log.error({ evt: 'consumer.error', issueId: String(job.issueId ?? ''), code: e?.code ?? 'INTERNAL' });
    return new InvocationError({ retryAfter: 60, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
  }
}

export async function maintenanceConsumer(event, context) {
  // After a restore: re-check each restored work item so approvals bind to its CURRENT text again.
  if (event?.body?.type === 'rescreen') {
    const issueId = String(event.body.issueId ?? '');
    if (!/^\d{1,18}$/.test(issueId)) return undefined;
    try {
      const doc = await createJiraAdapter({ timeoutMs: 8000 }).getIssueForScreening(issueId);
      await buildScreening(context?.environmentType, siteIdOf(context, event)).onIssueEvent({ issueId, issueKey: doc.key, projectKey: doc.projectKey, contentChange: true });
    } catch (e) {
      log.warn({ evt: 'rescreen.failed', issueId, code: e?.code ?? 'INTERNAL' }); // deleted issues stay unscreened (gate blocks)
    }
    return undefined;
  }
  if (event?.body?.type !== 'migrate') return undefined;
  try {
    const applied = await applyMigrations();
    log.info({ evt: 'migrations.applied', count: Array.isArray(applied) ? applied.length : 0 });
    return undefined;
  } catch (e) {
    log.error({ evt: 'migrations.failed', code: e?.code ?? 'INTERNAL' });
    return new InvocationError({ retryAfter: 60, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
  }
}

export async function reconcileSchedule(event, context) {
  try {
    const siteId = siteIdOf(context, event);
    const r = await buildScreening(context?.environmentType, siteId).reconcile();
    if (r.requeued || r.failed) log.info({ evt: 'reconcile', count: r.requeued, value: r.failed });
    if (siteId) {
      const ledger = buildLedger(siteId);
      await ledger.ensureKeys().catch((e) => log.warn({ evt: 'reconcile.keys_failed', code: e?.code ?? 'INTERNAL' }));
      const repaired = await buildReview(context?.environmentType, siteId, ledger).repairChain();
      if (repaired) log.info({ evt: 'reconcile.chain', count: repaired });
    }
    // Retention: gate events are operational evidence, kept 30 days (decisions are kept indefinitely).
    const purged = await repos.purgeGateEvents(Date.now() - 30 * 24 * 3600 * 1000).catch(() => 0);
    if (purged) log.info({ evt: 'reconcile.gate_events_purged', count: purged });
    // Archive transfers are temporary (they contain decision data): keep them one hour at most.
    await repos.transfers.purge(Date.now() - 3600 * 1000).catch(() => 0);
  } catch (e) {
    log.error({ evt: 'reconcile.failed', code: e?.code ?? 'INTERNAL' });
  }
}

/** Admin-triggered (and test) entry point to apply migrations through the queue. */
export const requestMigration = () => maintenanceQueue.push({ body: { type: 'migrate' } });
