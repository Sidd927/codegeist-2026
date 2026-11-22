// Application services for the panel and the desk. Orchestration over injected adapters so they can
// be unit-tested without Forge. Security rules:
//  - every read of findings is preceded by an AS-USER Jira check (screening itself runs as the app);
//  - nothing returns account IDs, emails or display names;
//  - nothing here makes or simulates a privacy decision.
import { AppError, ErrorCode } from '../lib/errors.js';
import { FEATURES, APP_VERSION } from '../lib/config.js';
import { adfToBlocks } from '../../core/text.js';
import { buildScreeningText } from '../../core/screening-text.js';
import { severityOf } from '../../core/rules.js';
import { presentScreening } from './presenter.js';
import * as validate from '../lib/validate.js';

const INBOX_LIMIT = 200;
const OPEN_OUTCOMES = ['NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY'];
const OPEN_STATES = ['QUEUED', 'SCREENING', 'SCREENING_FAILED'];
const VIEW_FILTER = {
  pending: (r) => r.state === 'SCREENED' && ['REVIEW_REQUIRED', 'DPIA_LIKELY'].includes(r.outcome),
  'needs-info': (r) => r.state === 'SCREENED' && r.outcome === 'NEEDS_INFO',
  stale: () => false, // "changed since approval" needs decisions (M3/M4)
  'all-open': () => true,
};

export function createDeskServices({ jira, config, log, repos, screening, settings }) {
  async function safeIsAdmin() {
    try {
      return await jira.isJiraAdmin();
    } catch (e) {
      log.warn({ evt: 'admin-check.failed', code: e?.code ?? 'INTERNAL', status: e?.status });
      return false; // fail closed
    }
  }

  const aiActive = () => settings.aiEnabled && screening.aiAvailable === true;

  async function loadScreening(issueId, currentFp) {
    const row = await repos.workItems.get(String(issueId));
    const s = row?.screening_id ? await repos.screenings.get(row.screening_id) : null;
    return presentScreening(row, s, currentFp);
  }

  return {
    async appContext() {
      return {
        product: 'Article25',
        version: APP_VERSION,
        environment: { name: config.name, label: config.label },
        features: FEATURES,
        screening: { ai: aiActive() ? 'on' : 'off' },
        roles: { jiraAdmin: await safeIsAdmin() },
      };
    },

    /** Issue panel: issue from the Forge context; findings only after an as-user read succeeds. */
    async panelState(extensionIssue) {
      const id = validate.issueId(extensionIssue?.id);
      let doc;
      try {
        doc = await jira.getIssueDocument(id);
      } catch (e) {
        if (e?.code === ErrorCode.NOT_FOUND) return { access: 'denied', issue: null, screening: null, features: FEATURES };
        throw e;
      }
      if (!settings.isProjectInScope(doc.projectKey)) return { access: 'granted', issue: { id: doc.id, key: doc.key, projectKey: doc.projectKey }, screening: { state: 'OUT_OF_SCOPE', result: null }, features: FEATURES };
      const currentFp = buildScreeningText(doc).fingerprint;
      return { access: 'granted', issue: { id: doc.id, key: doc.key, projectKey: doc.projectKey }, screening: await loadScreening(doc.id, currentFp), features: FEATURES, ai: aiActive() ? 'on' : 'off' };
    },

    /** Review workspace (Margin): current text as the reviewer sees it + the latest screening. */
    async workspace(rawKey) {
      const key = validate.issueKey(rawKey);
      const doc = await jira.getIssueDocument(key);
      const { blocks, truncated } = adfToBlocks(doc.description);
      const current = buildScreeningText(doc);
      const view = settings.isProjectInScope(doc.projectKey) ? await loadScreening(doc.id, current.fingerprint) : { state: 'OUT_OF_SCOPE', result: null };
      // Highlights are only valid against exactly the text that was screened.
      const marksValid = view.result && !['RESCREEN_REQUIRED', 'SCREENING'].includes(view.state) && view.state !== 'SCREENING_FAILED';
      return {
        issue: { id: doc.id, key: doc.key, summary: doc.summary, status: doc.status, statusCategory: doc.statusCategory, projectKey: doc.projectKey, projectName: doc.projectName, issueType: doc.issueType },
        document: { summary: doc.summary, blocks, truncated },
        screening: { ...view, marksValid: Boolean(marksValid) },
        decision: { available: false, reason: view.result ? 'DECISIONS_NOT_ENABLED' : 'NOT_SCREENED' },
        features: FEATURES,
        ai: aiActive() ? 'on' : 'off',
      };
    },

    /** Reviewer inbox: only work items the caller can see in Jira; titles come from that as-user search. */
    async inbox(rawView) {
      const view = validate.inboxView(rawView);
      const rows = await repos.workItems.listByOutcomes(OPEN_OUTCOMES, OPEN_STATES, INBOX_LIMIT);
      const visible = rows.length ? await jira.visibleIssues(rows.map((r) => r.issue_id)) : new Map();
      const open = rows.filter((r) => visible.has(String(r.issue_id)));
      const screenings = await repos.screenings.getMany(open.map((r) => r.screening_id).filter(Boolean));
      const byId = new Map(screenings.map((s) => [s.screening_id, s]));
      const now = Date.now();
      const items = open
        .filter(VIEW_FILTER[view])
        .map((r) => {
          const s = byId.get(r.screening_id);
          const chips = (s?.result?.findings ?? []).filter((f) => f.severity === 'high' || f.isNew || f.kind === 'external_sharing').slice(0, 3).map((f) => ({ kind: f.kind, signal: f.signal }));
          return { issueId: String(r.issue_id), key: visible.get(String(r.issue_id)).key, summary: visible.get(String(r.issue_id)).summary, state: r.state === 'SCREENED' ? r.outcome : r.state === 'SCREENING_FAILED' ? 'SCREENING_FAILED' : 'SCREENING', mode: s?.mode ?? null, chips, findingCount: s?.result?.findings?.length ?? 0, updatedAt: r.updated_at };
        })
        .sort((a, b) => severityOf(b.state) - severityOf(a.state) || a.updatedAt - b.updatedAt);
      const counts = {
        pending: open.filter(VIEW_FILTER.pending).length,
        dpiaLikely: open.filter((r) => r.state === 'SCREENED' && r.outcome === 'DPIA_LIKELY').length,
        needsInfo: open.filter(VIEW_FILTER['needs-info']).length,
        oldestPendingMs: open.filter(VIEW_FILTER.pending).reduce((m, r) => Math.max(m, now - r.updated_at), 0) || null,
      };
      return { enabled: true, view, items, counts, ai: aiActive() ? 'on' : 'off' };
    },

    /** Manual re-check: the caller must be able to browse the issue; rate-limited per item. */
    async requestRescreen({ extensionIssue, issueKey }) {
      const target = extensionIssue?.id ? validate.issueId(extensionIssue.id) : validate.issueKey(issueKey);
      const doc = await jira.getIssueDocument(target); // as-user browse check
      const r = await screening.requestManual({ issueId: String(doc.id), issueKey: doc.key, projectKey: doc.projectKey });
      return { status: r.status };
    },

    /** Settings overview (Jira admins only, checked server-side). */
    async settingsOverview() {
      if (!(await safeIsAdmin())) throw new AppError(ErrorCode.NOT_AUTHORISED, 'Settings are available to Jira administrators.');
      const counts = Object.fromEntries((await repos.workItems.countByState()).map((r) => [r.state, Number(r.n)]));
      const usage = await repos.usage.get(new Date().toISOString().slice(0, 10));
      return {
        environment: { name: config.name, label: config.label },
        version: APP_VERSION,
        sections: [
          { key: 'scope', status: settings.scopeProjects.length ? 'configured' : 'all-projects' },
          { key: 'people', status: 'not-configured' },
          { key: 'inventory', status: 'not-configured' },
          { key: 'ai', status: aiActive() ? 'on' : 'off' },
          { key: 'register', status: 'not-connected' },
          { key: 'gate', status: 'not-added' },
        ],
        screening: {
          ai: aiActive() ? 'on' : 'off',
          aiModel: aiActive() ? settings.aiModel : null,
          dailyAiBudget: settings.dailyAiBudget,
          scopeProjects: settings.scopeProjects,
          countsByState: counts,
          today: { screenings: Number(usage?.screenings ?? 0), aiCalls: Number(usage?.llm_calls ?? 0), ruleBased: Number(usage?.fallbacks ?? 0) },
        },
      };
    },
  };
}
