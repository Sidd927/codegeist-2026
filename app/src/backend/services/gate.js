// Workflow gate service (M4 ENFORCE).
//
// Validator path (jira:workflowValidator lambda; no user context is provided by Jira):
//   1. validate the payload's issue key                       → else block INVALID_CONTEXT
//   2. read the issue AS THE APP (identity + current text)     → else block ISSUE_UNAVAILABLE
//   3. ONE SQL statement: work item, latest decision, latest human decision, both signed chain
//      records, gate mode                                       → else block SYSTEM_UNAVAILABLE
//   4. core/gate.js evaluateGate (pure, exhaustively tested) on the CURRENT text fingerprint
//   5. apply the mode: enforce → result = allow; monitor → result = true (would_* recorded)
//   6. append a content-free gate event (failure to record never changes the verdict)
// Everything runs under a deadline well inside Forge's 25 s limit; on timeout → block TIMEOUT.
// Any failure before the mode is known blocks: an outage must never authorise protected work.
import { ErrorCode } from '../lib/errors.js';
import { buildScreeningText } from '../../core/screening-text.js';
import { evaluateGate, applyMode, jiraMessage, analyseCoverage, GATE_POLICY_VERSION, GATE_MODES, DEFAULT_GATE_MODE, REASONS } from '../../core/gate.js';
import { createSettingsService } from './settings.js';

const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,99}-[1-9]\d{0,9}$/;
const STATUS_ID = /^\d{1,20}$/;
export const GATE_MODULE_KEY = 'article25-gate';

class Deadline extends Error {}
const withDeadline = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Deadline()), ms))]);

export function createGateService({ repos, jira, log, clock = () => Date.now(), settings, siteId, deadlineMs = 9000, auditMs = 1500, appId = null }) {
  const signing = { signingKey: settings.signingKey ?? null, siteId: siteId ?? null };

  /** Read and evaluate one issue. Throws on infrastructure failure (callers decide what that means). */
  async function evaluateIssue(issueKey) {
    const doc = await jira.getIssueForScreening(issueKey); // as app: identity + current text
    const snap = await repos.gateSnapshot(String(doc.id));
    const currentFp = buildScreeningText(doc).fingerprint;
    const evaluation = evaluateGate({ ...snap, currentFp, inScope: settings.isProjectInScope(doc.projectKey), signing });
    const mode = GATE_MODES.includes(snap.mode) ? snap.mode : snap.mode === null ? DEFAULT_GATE_MODE : 'enforce'; // unknown stored value → strictest
    return { doc, snap, currentFp, evaluation, mode };
  }

  async function record(event) {
    try {
      await withDeadline(repos.gateEvents.insert(event), auditMs);
    } catch (e) {
      log.warn({ evt: 'gate.audit.failed', issueId: event.issueId ?? undefined, code: e?.code ?? 'INTERNAL' });
    }
  }

  /** The Jira workflow validator. Returns { outcome: { result, errorMessage }, reason }. Never throws. */
  async function validateDetailed(payload) {
    const t0 = clock();
    const key = String(payload?.issue?.key ?? '').toUpperCase();
    const from = STATUS_ID.test(String(payload?.transition?.from?.id ?? '')) ? String(payload.transition.from.id) : null;
    const to = STATUS_ID.test(String(payload?.transition?.to?.id ?? '')) ? String(payload.transition.to.id) : null;
    const block = (reason, extra = {}) => ({ outcome: { result: false, errorMessage: jiraMessage(reason) }, reason, verdict: 'block', mode: 'unknown', ...extra });

    let res;
    if (!ISSUE_KEY.test(key)) res = block('INVALID_CONTEXT');
    else {
      try {
        const { doc, evaluation, mode, currentFp } = await withDeadline(evaluateIssue(key), deadlineMs);
        const applied = applyMode(mode, evaluation);
        res = {
          outcome: applied.result ? { result: true } : { result: false, errorMessage: jiraMessage(evaluation.reason) },
          reason: evaluation.reason, verdict: applied.verdict, mode, issueId: String(doc.id), projectKey: doc.projectKey, decisionSeq: evaluation.decisionSeq, contentRef: currentFp.slice(0, 16),
        };
      } catch (e) {
        if (e instanceof Deadline) res = block('TIMEOUT');
        else if (e?.code === ErrorCode.NOT_FOUND || e?.code === ErrorCode.NOT_AUTHORISED) res = block('ISSUE_UNAVAILABLE');
        else res = block('SYSTEM_UNAVAILABLE');
        log.warn({ evt: 'gate.error', reason: res.reason, code: e?.code ?? 'INTERNAL', errName: e?.name });
      }
    }
    const ms = clock() - t0;
    await record({ at: clock(), issueId: res.issueId ?? null, projectKey: res.projectKey ?? null, from, to, mode: res.mode, verdict: res.verdict, reason: res.reason, policyVersion: GATE_POLICY_VERSION, decisionSeq: res.decisionSeq ?? null, contentRef: res.contentRef ?? null, ms });
    log.info({ evt: 'gate.evaluated', issueId: res.issueId ?? undefined, mode: res.mode, outcome: res.verdict, reason: res.reason, ms });
    return { outcome: res.outcome, reason: res.reason };
  }
  const validate = async (payload) => (await validateDetailed(payload)).outcome;

  /** Read-only preview for the desk and panel ("what would the gate do right now?"). */
  async function preview(issueKey) {
    try {
      const { evaluation, mode } = await withDeadline(evaluateIssue(issueKey), deadlineMs);
      return { mode, allow: evaluation.allow, reason: evaluation.reason, message: REASONS[evaluation.reason].message, policyVersion: GATE_POLICY_VERSION };
    } catch (e) {
      log.warn({ evt: 'gate.preview.failed', code: e?.code ?? 'INTERNAL' });
      return { mode: 'unknown', allow: false, reason: 'SYSTEM_UNAVAILABLE', message: REASONS.SYSTEM_UNAVAILABLE.message, policyVersion: GATE_POLICY_VERSION };
    }
  }

  // ---- admin: mode (append-only audited setting; see services/settings.js) ----------------------
  const settingsSvc = createSettingsService({ repos, log, clock });
  async function currentMode() {
    const c = await settingsSvc.current('gate.mode');
    return { mode: c.value ?? 'enforce', seq: c.seq, isDefault: c.isDefault, changedAt: c.changedAt, changedBy: c.changedBy };
  }
  /** Switch monitor ⇄ enforce. The caller must already be verified as a Jira administrator. */
  const setMode = ({ actorId, mode, expectedSeq, requestId, note }) => settingsSvc.change({ setting: 'gate.mode', value: mode, actorId, expectedSeq, requestId, note });
  const modeHistory = () => settingsSvc.history('gate.mode');

  // ---- admin: health -----------------------------------------------------------------------------
  // Jira stores Forge validators as ruleKey "forge:expression-validator" (also for lambdas) with
  // parameters.key = "ari:cloud:ecosystem::extension/<appId>/<environmentId>/static/<moduleKey>"
  // (observed live, 23 Nov 2026). Match the exact module of THIS app only.
  const EXTENSION = /^ari:cloud:ecosystem::extension\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/static\/([A-Za-z0-9_-]+)$/;
  const isGateRule = (rule) => {
    const m = EXTENSION.exec(String(rule?.parameters?.key ?? ''));
    return Boolean(m) && m[3] === GATE_MODULE_KEY && (!appId || m[1] === appId);
  };

  async function health() {
    const checks = {};
    // Dependencies (never claim "protected" when the validator could not work).
    try {
      await repos.gateTablesReachable();
      checks.database = 'ok';
    } catch (e) {
      checks.database = /doesn'?t exist|no such table|unknown table/i.test(String(e?.message)) ? 'migration_missing' : 'unavailable';
    }
    checks.signing = signing.signingKey && signing.siteId ? 'configured' : 'missing';
    let mode = { mode: 'unknown', seq: 0, isDefault: false, changedAt: null };
    try {
      const m = await currentMode();
      mode = { mode: m.mode, seq: m.seq, isDefault: m.isDefault, changedAt: m.changedAt }; // no account ids in responses
    } catch {
      /* reported as unknown */
    }
    // Coverage: read workflows (read:workflow:jira) and find transitions carrying our validator.
    let coverage = { status: 'unknown', workflows: [], ruleKeysSeen: 0 };
    try {
      const { workflows, statuses } = await jira.searchWorkflowsWithTransitions();
      const analysed = analyseCoverage(workflows, statuses, isGateRule);
      coverage = {
        status: analysed.length === 0 ? 'none' : analysed.some((w) => w.coverage === 'partial') ? 'partial' : 'complete',
        workflows: analysed,
        workflowsScanned: workflows.length,
      };
    } catch (e) {
      log.warn({ evt: 'gate.health.coverage_failed', code: e?.code ?? 'INTERNAL', status: e?.status });
      coverage = { status: 'unknown', workflows: [], error: e?.code === ErrorCode.NOT_AUTHORISED || e?.status === 403 ? 'not_permitted' : 'unavailable' };
    }
    const since = clock() - 7 * 24 * 3600 * 1000;
    let activity = null;
    try {
      const rows = await repos.gateEvents.summary(since);
      activity = Object.fromEntries(rows.map((r) => [r.verdict, Number(r.n)]));
    } catch {
      activity = null;
    }
    const ready = checks.database === 'ok' && checks.signing === 'configured';
    const overall = !ready ? 'not_ready' : coverage.status === 'unknown' ? 'unknown' : coverage.status === 'none' ? 'not_protected' : coverage.status === 'partial' ? 'gaps' : mode.mode === 'enforce' ? 'enforcing' : 'monitoring';
    return { overall, mode, checks, coverage, activity, policyVersion: GATE_POLICY_VERSION, checkedAt: clock() };
  }

  return { validate, validateDetailed, preview, currentMode, setMode, modeHistory, health, evaluateIssue, isGateRule };
}
