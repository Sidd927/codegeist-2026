// Application services for the panel and the desk. Orchestration over injected adapters so they can
// be unit-tested without Forge. Security rules:
//  - every read of findings or review data is preceded by an AS-USER Jira check;
//  - account ids leave the server only for reviewers (who need them to assign); others see names only;
//  - all review rules (who may decide/assign, binding, concurrency) live in services/review.js.
import { randomBytes } from 'node:crypto';
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

const EXPORT_CHUNK = 1_000_000; // chars per download chunk (≤ ~3 MB UTF-8; responses are limited to 5 MB)
const UPLOAD_CHUNK = 100_000; // chars per upload chunk (≤ ~300 KB UTF-8; requests are limited to 500 KB)
const MAX_CHUNKS = 200;
const TRANSFER_ID = /^[0-9a-f]{32}$/;

export function createDeskServices({ jira, config, log, repos, screening, settings, review, gate, ledger }) {
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

  function presentDecision(d, people, withId, anchors = new Map()) {
    const a = anchors.get(d.decision_id);
    return {
      // Signature status of this decision's record (no key material; kid is a public key id).
      record: a ? { seq: a.seq, format: a.record?.v === 3 ? 'ed25519' : a.record?.v === 2 ? 'legacy' : 'unknown', kid: a.record?.kid ?? null } : null,
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
    const [isReviewer, sodOn] = await Promise.all([review.isReviewer(actorId), review.separationOfDutiesOn()]);
    const currentFp = buildScreeningText(doc).fingerprint;
    const r = await review.reviewOf(doc.id, { item: stored.row, currentFp });
    const [people, anchorRows] = await Promise.all([
      peopleMap([...r.decisions.map((d) => d.decided_by), ...r.assignments.flatMap((a) => [a.assignee, a.assigned_by])]),
      repos.chain.forDecisions(r.decisions.map((d) => d.decision_id)).catch(() => []),
    ]);
    const anchors = new Map(anchorRows.map((x) => [x.decisionId, x]));
    const sameContent = Boolean(stored.row && stored.row.state === 'SCREENED' && stored.row.screened_fp === currentFp && view.result);
    let decideReason = null;
    if (!isReviewer) decideReason = 'NOT_REVIEWER';
    else if (ledger.mode === 'none') decideReason = 'NOT_CONFIGURED';
    else if (sodOn && (doc.reporterId === actorId || doc.assigneeId === actorId)) decideReason = 'SOD';
    else if (!sameContent) decideReason = view.state === 'SCREENING' ? 'CHECKING' : 'STALE_EVIDENCE';
    return {
      status: r.status.status,
      approvedForContent: r.status.approvedForContent,
      latestSeq: r.latestSeq,
      assignmentSeq: r.assignmentSeq,
      assignee: person(people, r.assignee, isReviewer),
      decisions: r.decisions.map((d) => presentDecision(d, people, isReviewer, anchors)).reverse(),
      assignments: r.assignments.map((a) => ({ seq: a.seq, assignee: person(people, a.assignee, isReviewer), assignedBy: person(people, a.assigned_by, isReviewer), assignedAt: a.assigned_at })).reverse(),
      binding: sameContent ? { screeningId: stored.row.screening_id, fp: stored.row.screened_fp } : null,
      permissions: { isReviewer, canDecide: decideReason === null, decideReason, canAssign: isReviewer },
    };
  }

  /** Status id → name (as the user; read:jira-work). Names are cosmetic; failures fall back to null. */
  async function statusNames(ids) {
    const unique = [...new Set(ids.filter((x) => /^\d{1,20}$/.test(String(x ?? ''))))].slice(0, 20);
    const pairs = await Promise.all(unique.map((id) => jira.statusName(id).then((n) => [id, n]).catch(() => [id, null])));
    return new Map(pairs);
  }

  const presentGateEvent = (e, names) => ({
    at: Number(e.at),
    mode: e.mode,
    verdict: e.verdict,
    reason: e.reason,
    to: e.to_status ? names.get(String(e.to_status)) ?? null : null,
    from: e.from_status ? names.get(String(e.from_status)) ?? null : null,
    policyVersion: e.policy_version,
    contentRef: e.content_ref ? String(e.content_ref).slice(0, 8) : null,
  });

  /** The last gate checks for one issue (content-free events; caller already passed an as-user read). */
  async function recentGateChecks(issueId) {
    try {
      const rows = await repos.gateEvents.forIssue(String(issueId), 5);
      const names = await statusNames(rows.flatMap((e) => [e.to_status, e.from_status]));
      return rows.map((e) => presentGateEvent(e, names));
    } catch (e) {
      log.warn({ evt: 'gate.events.read_failed', code: e?.code ?? 'INTERNAL' });
      return [];
    }
  }

  /** Reassemble an upload this admin created (exactly `chunks` parts, 0..n-1) and parse it. */
  async function assembleUpload(payload, actorId) {
    const transferId = String(payload?.transferId ?? '');
    const n = Number(payload?.chunks);
    if (!TRANSFER_ID.test(transferId) || !Number.isInteger(n) || n < 1 || n > MAX_CHUNKS) throw new AppError(ErrorCode.INVALID_INPUT);
    const meta = await repos.transfers.meta(transferId);
    if (Number(meta?.n ?? 0) !== n || meta.actor !== actorId || meta.actor2 !== actorId || meta.kind !== 'upload') throw new AppError(ErrorCode.INVALID_INPUT, 'The upload is incomplete. Upload the archive again.');
    const parts = await repos.transfers.all(transferId);
    if (parts.some((p, i) => Number(p.idx) !== i)) throw new AppError(ErrorCode.INVALID_INPUT, 'The upload is incomplete. Upload the archive again.');
    try {
      return JSON.parse(parts.map((p) => p.data).join(''));
    } catch {
      throw new AppError(ErrorCode.INVALID_INPUT, 'That file is not an Article25 archive.');
    }
  }

  async function requireAdmin() {
    if (!(await safeIsAdmin())) throw new AppError(ErrorCode.NOT_AUTHORISED, 'Only Jira administrators can do this.');
  }

  return {
    async appContext(actorId) {
      const [jiraAdmin, reviewer, gateMode] = await Promise.all([safeIsAdmin(), review.isReviewer(actorId), gate.currentMode().then((m) => m.mode).catch(() => 'unknown')]);
      return { product: 'Article25', version: APP_VERSION, environment: { name: config.name, label: config.label }, features: FEATURES, screening: { ai: aiActive() ? 'on' : 'off' }, roles: { jiraAdmin, reviewer }, reviewerGroup: settings.reviewerGroup, gate: { mode: gateMode }, record: { signing: ledger.mode } };
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
      // The gate preview reads as the app, but only after the as-user read above succeeded.
      const [rb, gatePreview] = await Promise.all([reviewBlock(doc, stored, view, actorId), gate.preview(doc.key)]);
      return { access: 'granted', issue, screening: view, review: { status: rb.status, assignee: rb.assignee ? { name: rb.assignee.name } : null, latest: rb.decisions[0] ?? null }, gate: gatePreview, features: FEATURES, ai: aiActive() ? 'on' : 'off' };
    },

    /** Review workspace (Margin): current text, latest screening, and the review. */
    async workspace(rawKey, actorId) {
      const key = validate.issueKey(rawKey);
      const { doc, stored } = await readWithScreening(key, null);
      const { blocks, truncated } = adfToBlocks(doc.description);
      const view = settings.isProjectInScope(doc.projectKey) ? presentScreening(stored.row, stored.screening, buildScreeningText(doc).fingerprint) : { state: 'OUT_OF_SCOPE', result: null };
      const marksValid = view.result && !['SCREENING', 'SCREENING_FAILED'].includes(view.state) && view.reason !== 'content_changed';
      const inScope = view.state !== 'OUT_OF_SCOPE';
      const [reviewData, gatePreview, gateChecks] = await Promise.all([
        inScope ? reviewBlock(doc, stored, view, actorId) : null,
        inScope ? gate.preview(doc.key) : null,
        inScope ? recentGateChecks(doc.id) : [],
      ]);
      return {
        issue: { id: doc.id, key: doc.key, summary: doc.summary, status: doc.status, statusCategory: doc.statusCategory, projectKey: doc.projectKey, projectName: doc.projectName, issueType: doc.issueType },
        document: { summary: doc.summary, blocks, truncated },
        screening: { ...view, marksValid: Boolean(marksValid) },
        review: reviewData,
        gate: gatePreview ? { ...gatePreview, recent: gateChecks } : null,
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

    // ---- M5: decision record & recovery ---------------------------------------------------------
    /** Record status (admins): signing keys (fingerprints only), head, last export/verify/restore. */
    async recordStatus() {
      await requireAdmin();
      const [st, events] = await Promise.all([ledger.status(), repos.ledgerEvents.recent(10).catch(() => [])]);
      const people = await peopleMap(events.map((e) => e.actor));
      return {
        ...st,
        events: events.map((e) => ({ at: e.at, type: e.type, outcome: e.outcome, headSeq: e.head_seq, by: e.actor ? people.get(e.actor)?.displayName || 'Unknown user' : 'Article25', digest: e.digest ? e.digest.slice(0, 12) : null })),
        // Decided at the final audit: the record stays in Article25 and in signed archives the customer
        // keeps; no Confluence publishing (it would need new scopes and preview multi-app storage).
        externalRegister: { status: 'archive_only' },
      };
    },

    /** Verify the whole ledger and every decision (admins); the result is recorded. */
    async verifyLedger(actorId) {
      await requireAdmin();
      return ledger.verify({ record: true, actor: actorId });
    },

    /** Signed archive export (admins), delivered in chunks. */
    async exportArchive(actorId) {
      await requireAdmin();
      const archive = await ledger.exportArchive({ actor: actorId });
      const text = JSON.stringify(archive);
      const chunks = Math.ceil(text.length / EXPORT_CHUNK);
      if (chunks > MAX_CHUNKS) throw new AppError(ErrorCode.INTERNAL, 'The archive is too large to export in one transfer.');
      const transferId = randomBytes(16).toString('hex');
      const now = Date.now();
      for (let i = 0; i < chunks; i++) await repos.transfers.put({ transferId, idx: i, kind: 'export', actor: actorId, data: text.slice(i * EXPORT_CHUNK, (i + 1) * EXPORT_CHUNK), createdAt: now });
      return { transferId, chunks, bytes: Buffer.byteLength(text), digest: archive.digest, head: archive.head, counts: archive.counts, createdAt: archive.createdAt };
    },

    /** One chunk of an export this admin created. */
    async transferChunk(payload, actorId) {
      await requireAdmin();
      const transferId = String(payload?.transferId ?? '');
      const idx = Number(payload?.idx);
      if (!TRANSFER_ID.test(transferId) || !Number.isInteger(idx) || idx < 0 || idx >= MAX_CHUNKS) throw new AppError(ErrorCode.INVALID_INPUT);
      const row = await repos.transfers.get(transferId, idx);
      if (!row || row.kind !== 'export' || row.actor !== actorId) throw new AppError(ErrorCode.NOT_FOUND, 'This export is not available. Export again.');
      return { idx, data: row.data };
    },

    /** Upload one chunk of an archive to restore (admins). Chunks are immutable once written. */
    async uploadChunk(payload, actorId) {
      await requireAdmin();
      const transferId = String(payload?.transferId ?? '');
      const idx = Number(payload?.idx);
      const data = payload?.data;
      if (!TRANSFER_ID.test(transferId) || !Number.isInteger(idx) || idx < 0 || idx >= MAX_CHUNKS || typeof data !== 'string' || data.length === 0 || data.length > UPLOAD_CHUNK) throw new AppError(ErrorCode.INVALID_INPUT);
      const meta = await repos.transfers.meta(transferId);
      if (Number(meta?.n ?? 0) > 0 && (meta.actor !== actorId || meta.actor2 !== actorId || meta.kind !== 'upload')) throw new AppError(ErrorCode.NOT_AUTHORISED);
      const inserted = await repos.transfers.put({ transferId, idx, kind: 'upload', actor: actorId, data, createdAt: Date.now() });
      if (!inserted) {
        const existing = await repos.transfers.get(transferId, idx);
        if (existing?.data !== data) throw new AppError(ErrorCode.CONFLICT, 'This part of the upload was already received with different content. Start the upload again.');
      }
      return { idx, received: true };
    },

    /** Step 1 of restore: verify the uploaded archive (admins). */
    async beginRestore(payload, actorId) {
      await requireAdmin();
      const archive = await assembleUpload(payload, actorId);
      const r = await ledger.beginRestore({ actor: actorId, archive });
      return { report: r.report, token: r.token, resume: r.resume ?? false };
    },

    /** Step 2 of restore: confirm with the single-use token (admins). */
    async confirmRestore(payload, actorId) {
      await requireAdmin();
      const archive = await assembleUpload(payload, actorId);
      return ledger.confirmRestore({ actor: actorId, token: payload?.token, archive });
    },

    /** After a key LOSS: adopt a previous key as predecessor, bound to its typed fingerprint (admins). */
    async adoptPreviousKey(payload) {
      await requireAdmin();
      const kid = String(payload?.kid ?? '');
      if (!/^k[0-9a-f]{16}$/.test(kid)) throw new AppError(ErrorCode.INVALID_INPUT);
      return ledger.adoptPredecessor({ kid, fingerprint: payload?.fingerprint });
    },

    /** One decision's signed record, for independent verification (reviewers who can see the issue). */
    async decisionRecord(payload, actorId) {
      if (!(await review.isReviewer(actorId))) throw new AppError(ErrorCode.NOT_AUTHORISED);
      const doc = await jira.getIssueDocument(validate.issueKey(payload?.issueKey)); // as-user browse check
      const seq = Number(payload?.seq);
      if (!Number.isInteger(seq) || seq < 1) throw new AppError(ErrorCode.INVALID_INPUT);
      const row = (await repos.decisions.list(doc.id)).find((d) => Number(d.seq) === seq);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'That decision does not exist.');
      return ledger.recordBundle(row);
    },

    /** The decision register: every decision on work items the caller can see, newest first. */
    async register(raw, actorId) {
      const page = Number(raw?.page ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 1000) throw new AppError(ErrorCode.INVALID_INPUT);
      const [rows, st, isReviewer] = await Promise.all([repos.registerRows(500), ledger.status().catch(() => null), review.isReviewer(actorId)]);
      const visible = rows.length ? await jira.visibleIssues([...new Set(rows.map((r) => r.issue_id))]) : new Map();
      const mine = rows.filter((r) => visible.has(r.issue_id));
      const pages = Math.max(1, Math.ceil(mine.length / 25));
      const p = Math.min(page, pages);
      const slice = mine.slice((p - 1) * 25, p * 25);
      const people = await peopleMap(slice.map((r) => r.decided_by));
      const exportedHead = st?.backedUpSeq ?? st?.lastExport?.headSeq ?? 0;
      return {
        items: slice.map((r) => ({
          key: visible.get(r.issue_id).key, summary: visible.get(r.issue_id).summary, seq: r.seq, kind: r.kind, decision: r.decision,
          decidedBy: r.kind === 'human' ? person(people, r.decided_by, isReviewer) : null, decidedAt: r.decided_at, outcome: r.outcome, contentRef: String(r.fp).slice(0, 8),
          record: r.chainSeq ? { seq: r.chainSeq, format: r.recordVersion === 3 ? 'ed25519' : r.recordVersion === 2 ? 'legacy' : 'unknown', kid: r.kid } : null,
          inLastExport: Boolean(r.chainSeq && r.chainSeq <= exportedHead),
        })),
        total: mine.length, page: p, pages,
        signing: st?.signing ?? 'none', lastExport: st?.lastExport ? { at: st.lastExport.at, headSeq: st.lastExport.headSeq } : null, isReviewer,
      };
    },

    /** Workflow gate overview (Jira admins only): health, coverage, mode, recent checks, settings history. */
    async gateOverview() {
      await requireAdmin();
      const [health, events, modeHistory, sod, sodHistory] = await Promise.all([
        gate.health(),
        repos.gateEvents.recent(15).catch(() => null),
        gate.modeHistory().catch(() => []),
        review.separationOfDutiesSetting().catch(() => null),
        review.separationOfDutiesHistory().catch(() => []),
      ]);
      // Issue keys only for work items this admin can see; others are shown without a key.
      const ids = [...new Set((events ?? []).map((e) => e.issue_id).filter(Boolean))];
      const [visible, names] = await Promise.all([ids.length ? jira.visibleIssues(ids).catch(() => new Map()) : new Map(), statusNames((events ?? []).flatMap((e) => [e.to_status, e.from_status]))]);
      const people = await peopleMap([...modeHistory, ...sodHistory].map((h) => h.changedBy));
      const changed = (h) => ({ seq: h.seq, value: h.value, at: h.changedAt, by: people.get(h.changedBy)?.displayName || 'Unknown user', note: h.note });
      return {
        health,
        recent: events === null ? null : events.map((e) => ({ ...presentGateEvent(e, names), issueKey: visible.get(String(e.issue_id))?.key ?? null })),
        modeHistory: modeHistory.map(changed),
        separationOfDuties: sod ? { value: sod.value ?? 'on', seq: sod.seq, isDefault: sod.isDefault } : null,
        separationOfDutiesHistory: sodHistory.map(changed),
      };
    },

    /** Admin: switch the gate between monitor and enforce (audited, optimistic, idempotent). */
    async setGateMode(payload, actorId) {
      await requireAdmin();
      return gate.setMode({ actorId, mode: payload?.mode, expectedSeq: payload?.expectedSeq, requestId: payload?.requestId, note: payload?.note });
    },

    /** Admin: switch separation of duties (audited, optimistic, idempotent). */
    async setSeparationOfDuties(payload, actorId) {
      await requireAdmin();
      return review.setSeparationOfDuties({ actorId, value: payload?.value, expectedSeq: payload?.expectedSeq, requestId: payload?.requestId, note: payload?.note });
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
          { key: 'ai', status: aiActive() ? 'on' : 'off' },
          { key: 'record', status: ledger.mode === 'none' ? 'not-configured' : 'configured' },
          { key: 'gate', status: await gate.currentMode().then((m) => m.mode).catch(() => 'unknown') },
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
          separationOfDuties: await review.separationOfDutiesOn(),
          separationOfDutiesSetting: await review.separationOfDutiesSetting().then((x) => ({ value: x.value ?? 'on', seq: x.seq, isDefault: x.isDefault })).catch(() => null),
          recordSigning: ledger.mode === 'none' ? 'missing' : 'configured',
          recordFormat: ledger.mode,
        },
      };
    },
  };
}
