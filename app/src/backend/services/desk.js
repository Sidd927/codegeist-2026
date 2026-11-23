// Application services for the panel and the desk. Orchestration over injected adapters so they can
// be unit-tested without Forge. Security rules:
//  - every read of findings or review data is preceded by an AS-USER Jira check;
//  - account ids leave the server only for reviewers (who need them to assign); others see names only;
//  - all review rules (who may decide/assign, binding, concurrency) live in services/review.js.
import { AppError, ErrorCode } from '../lib/errors.js';
import { FEATURES, APP_VERSION } from '../lib/config.js';
import { adfToBlocks } from '../../core/text.js';
import { buildScreeningText } from '../../core/screening-text.js';
import { severityOf } from '../../core/rules.js';
import { deriveReviewStatus, STATUS_URGENCY, ATTENTION } from '../../core/review.js';
import { presentScreening } from './presenter.js';
import * as validate from '../lib/validate.js';

const PAGE_SIZE = 25;
const VIEW_FILTER = {
  attention: (s) => ATTENTION.has(s),
  awaiting: (s) => s === 'AWAITING_REVIEW',
  changed: (s) => ['APPROVAL_STALE', 'CHANGED_SINCE_DECISION', 'PENDING_RECHECK'].includes(s),
  'needs-info': (s) => s === 'NEEDS_MORE_INFORMATION',
  decided: (s) => ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED'].includes(s),
  all: () => true,
};

export function createDeskServices({ jira, config, log, repos, screening, settings, review }) {
  async function safeIsAdmin() {
    try {
      return await jira.isJiraAdmin();
    } catch (e) {
      log.warn({ evt: 'admin-check.failed', code: e?.code ?? 'INTERNAL', status: e?.status });
      return false; // fail closed
    }
  }
  const aiActive = () => settings.aiEnabled && screening.aiAvailable === true;

  /** As-user read and the stored screening in parallel; SQL data is only used after the read succeeds. */
  async function readWithScreening(idOrKey, storedIssueId) {
    const viewP = storedIssueId ? repos.workItems.getView(String(storedIssueId)) : null;
    viewP?.catch(() => undefined);
    const doc = await jira.getIssueDocument(idOrKey);
    const stored = viewP ? await viewP : await repos.workItems.getView(String(doc.id));
    return { doc, stored };
  }

  async function peopleMap(ids) {
    try {
      return await jira.usersBulk(ids.filter(Boolean));
    } catch (e) {
      log.warn({ evt: 'people.lookup.failed', code: e?.code ?? 'INTERNAL', status: e?.status });
      return new Map(); // names are cosmetic; never block on them
    }
  }
  const person = (people, id, withId) => (id ? { ...(withId ? { id } : {}), name: people.get(id)?.displayName || 'Unknown user', active: people.get(id)?.active ?? null } : null);

  function presentDecision(d, people, withId) {
    return {
      seq: d.seq,
      kind: d.kind,
      decision: d.decision,
      rationale: d.rationale ?? null,
      conditions: d.conditions ?? [],
      questions: d.questions ?? [],
      decidedBy: d.kind === 'human' ? person(people, d.decided_by, withId) : null,
      decidedAt: d.decided_at,
      outcome: d.outcome,
      contentRef: String(d.fp).slice(0, 8), // short evidence-binding reference (not personal data)
      detail: d.detail ? { carried: d.detail.carried ?? null, added: d.detail.added ?? {}, escalated: d.detail.escalated ?? false, from: d.detail.from ?? null, to: d.detail.to ?? null } : null,
    };
  }

  async function reviewBlock(doc, stored, view, actorId) {
    const isReviewer = await review.isReviewer(actorId);
    const currentFp = buildScreeningText(doc).fingerprint;
    const r = await review.reviewOf(doc.id, { item: stored.row, currentFp });
    const people = await peopleMap([...r.decisions.map((d) => d.decided_by), ...r.assignments.flatMap((a) => [a.assignee, a.assigned_by])]);
    const sameContent = Boolean(stored.row && stored.row.state === 'SCREENED' && stored.row.screened_fp === currentFp && view.result);
    let decideReason = null;
    if (!isReviewer) decideReason = 'NOT_REVIEWER';
    else if (!settings.signingKey) decideReason = 'NOT_CONFIGURED';
    else if (settings.separationOfDuties && (doc.reporterId === actorId || doc.assigneeId === actorId)) decideReason = 'SOD';
    else if (!sameContent) decideReason = view.state === 'SCREENING' ? 'CHECKING' : 'STALE_EVIDENCE';
    return {
      status: r.status.status,
      approvedForContent: r.status.approvedForContent,
      latestSeq: r.latestSeq,
      assignmentSeq: r.assignmentSeq,
      assignee: person(people, r.assignee, isReviewer),
      decisions: r.decisions.map((d) => presentDecision(d, people, isReviewer)).reverse(),
      assignments: r.assignments.map((a) => ({ seq: a.seq, assignee: person(people, a.assignee, isReviewer), assignedBy: person(people, a.assigned_by, isReviewer), assignedAt: a.assigned_at })).reverse(),
      binding: sameContent ? { screeningId: stored.row.screening_id, fp: stored.row.screened_fp } : null,
      permissions: { isReviewer, canDecide: decideReason === null, decideReason, canAssign: isReviewer },
    };
  }

  return {
    async appContext(actorId) {
      const [jiraAdmin, reviewer] = await Promise.all([safeIsAdmin(), review.isReviewer(actorId)]);
      return { product: 'Article25', version: APP_VERSION, environment: { name: config.name, label: config.label }, features: FEATURES, screening: { ai: aiActive() ? 'on' : 'off' }, roles: { jiraAdmin, reviewer } };
    },

    /** Issue panel: screening + a compact review summary, after an as-user read. */
    async panelState(extensionIssue, actorId) {
      const id = validate.issueId(extensionIssue?.id);
      let doc;
      let stored;
      try {
        ({ doc, stored } = await readWithScreening(id, id));
      } catch (e) {
        if (e?.code === ErrorCode.NOT_FOUND) return { access: 'denied', issue: null, screening: null, features: FEATURES };
        throw e;
      }
      const issue = { id: doc.id, key: doc.key, projectKey: doc.projectKey };
      if (!settings.isProjectInScope(doc.projectKey)) return { access: 'granted', issue, screening: { state: 'OUT_OF_SCOPE', result: null }, features: FEATURES };
      const view = presentScreening(stored.row, stored.screening, buildScreeningText(doc).fingerprint);
      const rb = await reviewBlock(doc, stored, view, actorId);
      return { access: 'granted', issue, screening: view, review: { status: rb.status, assignee: rb.assignee ? { name: rb.assignee.name } : null, latest: rb.decisions[0] ?? null }, features: FEATURES, ai: aiActive() ? 'on' : 'off' };
    },

    /** Review workspace (Margin): current text, latest screening, and the review. */
    async workspace(rawKey, actorId) {
      const key = validate.issueKey(rawKey);
      const { doc, stored } = await readWithScreening(key, null);
      const { blocks, truncated } = adfToBlocks(doc.description);
      const view = settings.isProjectInScope(doc.projectKey) ? presentScreening(stored.row, stored.screening, buildScreeningText(doc).fingerprint) : { state: 'OUT_OF_SCOPE', result: null };
      const marksValid = view.result && !['SCREENING', 'SCREENING_FAILED'].includes(view.state) && view.reason !== 'content_changed';
      return {
        issue: { id: doc.id, key: doc.key, summary: doc.summary, status: doc.status, statusCategory: doc.statusCategory, projectKey: doc.projectKey, projectName: doc.projectName, issueType: doc.issueType },
        document: { summary: doc.summary, blocks, truncated },
        screening: { ...view, marksValid: Boolean(marksValid) },
        review: view.state === 'OUT_OF_SCOPE' ? null : await reviewBlock(doc, stored, view, actorId),
        features: FEATURES,
        ai: aiActive() ? 'on' : 'off',
      };
    },

    /**
     * Reviewer inbox. One SQL statement for candidates (with latest decision/assignment), one as-user
     * JQL visibility check per 100 candidates, status derived in memory, then filter/sort/paginate.
     */
    async inbox(raw, actorId) {
      const f = validate.inboxFilters(raw);
      const candidates = await repos.inboxCandidates({ projectKey: f.project, outcome: f.severity });
      const visible = candidates.length ? await jira.visibleIssues(candidates.map((r) => r.issue_id)) : new Map();
      const now = Date.now();
      const rows = candidates
        .filter((r) => visible.has(String(r.issue_id)))
        .map((r) => ({ r, status: deriveReviewStatus(r, r.latest).status }));
      const counts = {
        attention: rows.filter((x) => ATTENTION.has(x.status)).length,
        awaiting: rows.filter((x) => x.status === 'AWAITING_REVIEW').length,
        changed: rows.filter((x) => VIEW_FILTER.changed(x.status)).length,
        dpiaLikely: rows.filter((x) => ATTENTION.has(x.status) && x.r.outcome === 'DPIA_LIKELY').length,
        mine: actorId ? rows.filter((x) => ATTENTION.has(x.status) && x.r.assignee === actorId).length : 0,
        oldestAttentionMs: rows.filter((x) => ATTENTION.has(x.status)).reduce((m, x) => Math.max(m, now - x.r.updated_at), 0) || null,
      };
      const projects = [...new Set(rows.map((x) => x.r.project_key))].sort();
      const filtered = rows
        .filter((x) => VIEW_FILTER[f.view](x.status))
        .filter((x) => (f.assignee === 'any' ? true : f.assignee === 'unassigned' ? !x.r.assignee : f.assignee === 'me' ? x.r.assignee === actorId : x.r.assignee === f.assignee))
        .sort((a, b) => STATUS_URGENCY[a.status] - STATUS_URGENCY[b.status] || severityOf(b.r.outcome) - severityOf(a.r.outcome) || a.r.updated_at - b.r.updated_at);
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(f.page, pages);
      const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const isReviewer = await review.isReviewer(actorId);
      const [people, scr] = await Promise.all([peopleMap(slice.map((x) => x.r.assignee)), slice.length ? repos.screenings.getMany(slice.map((x) => x.r.screening_id).filter(Boolean)) : []]);
      const byId = new Map(scr.map((s) => [s.screening_id, s]));
      const items = slice.map(({ r, status }) => ({
        issueId: String(r.issue_id),
        key: visible.get(String(r.issue_id)).key,
        summary: visible.get(String(r.issue_id)).summary,
        projectKey: r.project_key,
        outcome: r.outcome,
        screeningState: r.state,
        reviewStatus: status,
        assignee: person(people, r.assignee, isReviewer),
        ageMs: now - r.updated_at,
        // Why it is here: up to three of the most important verified signals (kind + label, no quotes).
        chips: (byId.get(r.screening_id)?.result?.findings ?? []).filter((f) => f.severity === 'high' || f.isNew || f.kind === 'external_sharing').slice(0, 3).map((f) => ({ kind: f.kind, signal: f.signal })),
        findingCount: byId.get(r.screening_id)?.result?.findings?.length ?? 0,
        mode: byId.get(r.screening_id)?.mode ?? null,
      }));
      return { filters: f, items, total, page, pages, pageSize: PAGE_SIZE, counts, projects, ai: aiActive() ? 'on' : 'off', isReviewer };
    },

    /** Reviewer search for assignment (reviewers only): active group members matching a name. */
    async reviewers(rawQuery, actorId) {
      if (!(await review.isReviewer(actorId))) throw new AppError(ErrorCode.NOT_AUTHORISED);
      const query = validate.personQuery(rawQuery);
      return { group: settings.reviewerGroup, reviewers: await review.reviewers(query) };
    },

    assign: async (payload, actorId) => review.assign({ actorId, issueKey: validate.issueKey(payload?.issueKey), assigneeId: payload?.assigneeId === 'me' ? actorId : payload?.assigneeId ?? null, expectedSeq: payload?.expectedSeq, requestId: payload?.requestId }),

    decide: async (payload, actorId) =>
      review.decide({ actorId, issueKey: validate.issueKey(payload?.issueKey), input: payload?.input, screeningId: validate.hex64(payload?.screeningId), fp: validate.hex64(payload?.fp), expectedSeq: payload?.expectedSeq, requestId: payload?.requestId }),

    /** Integrity of the decision record for one issue (reviewers only). */
    async verifyRecord(rawKey, actorId) {
      if (!(await review.isReviewer(actorId))) throw new AppError(ErrorCode.NOT_AUTHORISED);
      const doc = await jira.getIssueDocument(validate.issueKey(rawKey));
      return review.verify(doc.id);
    },

    /** Manual re-check: the caller must be able to browse the issue; rate-limited per item. */
    async requestRescreen({ extensionIssue, issueKey }) {
      const target = extensionIssue?.id ? validate.issueId(extensionIssue.id) : validate.issueKey(issueKey);
      const doc = await jira.getIssueDocument(target);
      const r = await screening.requestManual({ issueId: String(doc.id), issueKey: doc.key, projectKey: doc.projectKey });
      return { status: r.status };
    },

    /** Settings overview (Jira admins only, checked server-side). */
    async settingsOverview(actorId) {
      if (!(await safeIsAdmin())) throw new AppError(ErrorCode.NOT_AUTHORISED, 'Settings are available to Jira administrators.');
      const counts = Object.fromEntries((await repos.workItems.countByState()).map((r) => [r.state, Number(r.n)]));
      const usage = await repos.usage.get(new Date().toISOString().slice(0, 10));
      // Group membership is checked per person (read:jira-user); listing all members would need an
      // admin-level scope, so the overview reports whether the caller is a reviewer instead of a count.
      const youAreReviewer = await review.isReviewer(actorId);
      return {
        environment: { name: config.name, label: config.label },
        version: APP_VERSION,
        sections: [
          { key: 'scope', status: settings.scopeProjects.length ? 'configured' : 'all-projects' },
          { key: 'people', status: youAreReviewer ? 'configured' : 'not-verified' },
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
        review: {
          reviewerGroup: settings.reviewerGroup,
          youAreReviewer,
          separationOfDuties: settings.separationOfDuties,
          recordSigning: settings.signingKey ? 'configured' : 'missing',
        },
      };
    },
  };
}
