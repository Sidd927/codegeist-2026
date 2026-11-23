// In-memory repositories with the SAME conditional semantics as src/backend/repositories/sql-repositories.js
// (each method models one atomic SQL statement: INSERT IGNORE or UPDATE ... WHERE <precondition>).
// Used to test pipeline logic; real SQL behaviour is additionally checked live (see M2 results doc).

export function createFakeRepos() {
  const items = new Map();
  const scr = new Map();
  const use = new Map();
  const counters = { screeningInserts: 0 };

  const workItems = {
    async recordEvent({ issueId, issueKey, projectKey, now, contentChange }) {
      const r = items.get(issueId);
      if (!r) {
        items.set(issueId, { issue_id: issueId, issue_key: issueKey, project_key: projectKey, state: 'QUEUED', outcome: null, screening_id: null, screened_fp: null, request_seq: 1, processed_seq: 0, lease_token: null, lease_until: null, attempts: 0, last_error: null, last_event_at: now, manual_request_at: null, version: 0, created_at: now, updated_at: now });
        return 1;
      }
      r.request_seq += 1;
      Object.assign(r, { issue_key: issueKey, project_key: projectKey, last_event_at: now, updated_at: now });
      if (contentChange && ['SCREENED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'QUEUED';
      return r.request_seq;
    },
    async requestManual({ issueId, issueKey, projectKey, now, minIntervalMs }) {
      if (!items.has(issueId)) items.set(issueId, { issue_id: issueId, issue_key: issueKey, project_key: projectKey, state: 'QUEUED', outcome: null, screening_id: null, screened_fp: null, request_seq: 0, processed_seq: 0, lease_token: null, lease_until: null, attempts: 0, last_error: null, manual_request_at: null, version: 0, created_at: now, updated_at: now });
      const r = items.get(issueId);
      if (r.manual_request_at !== null && !(r.manual_request_at < now - minIntervalMs)) return false;
      if (r.state === 'SCREENING_FAILED') r.attempts = 0;
      if (['SCREENED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'QUEUED';
      Object.assign(r, { manual_request_at: now, request_seq: r.request_seq + 1, updated_at: now });
      return true;
    },
    async claim({ issueId, token, now, leaseMs }) {
      const r = items.get(issueId);
      if (!r || !(r.lease_until === null || r.lease_until < now)) return null;
      Object.assign(r, { lease_token: token, lease_until: now + leaseMs, attempts: r.attempts + 1, updated_at: now });
      if (['QUEUED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'SCREENING';
      return { ...r };
    },
    async finalize({ issueId, token, screeningId, fp, outcome, seqAtClaim, now }) {
      const r = items.get(issueId);
      if (!r || r.lease_token !== token) return false;
      Object.assign(r, { outcome, screening_id: screeningId, screened_fp: fp, processed_seq: Math.max(r.processed_seq, seqAtClaim), state: r.request_seq > seqAtClaim ? 'QUEUED' : 'SCREENED', lease_token: null, lease_until: null, attempts: 0, last_error: null, version: r.version + 1, updated_at: now });
      return true;
    },
    async fail({ issueId, token, code, terminal, now }) {
      const r = items.get(issueId);
      if (!r || r.lease_token !== token) return false;
      Object.assign(r, { state: terminal ? 'SCREENING_FAILED' : 'QUEUED', last_error: code, lease_token: null, lease_until: null, updated_at: now });
      return true;
    },
    async release({ issueId, token, now }) {
      const r = items.get(issueId);
      if (r?.lease_token === token) Object.assign(r, { lease_token: null, lease_until: null, updated_at: now });
    },
    get: async (issueId) => (items.has(issueId) ? { ...items.get(issueId) } : null),
    async getView(issueId) {
      const row = items.has(issueId) ? { ...items.get(issueId) } : null;
      const raw = row?.screening_id && scr.has(row.screening_id) ? JSON.parse(JSON.stringify(scr.get(row.screening_id))) : null;
      // Same snake_case shape as the SQL LEFT JOIN in sql-repositories.js.
      const s = raw && { ...raw, screening_id: raw.screeningId, pipeline_version: raw.pipelineVersion, ai_status: raw.aiStatus, created_at: raw.createdAt };
      return { row, screening: s };
    },
    listStuck: async ({ olderThan, now, limit }) => [...items.values()].filter((r) => ['QUEUED', 'SCREENING'].includes(r.state) && r.updated_at < olderThan && (r.lease_until === null || r.lease_until < now)).slice(0, limit).map((r) => ({ ...r })),
    async markFailedIfStuck({ issueId, code, now }) {
      const r = items.get(issueId);
      if (!r || !['QUEUED', 'SCREENING'].includes(r.state) || !(r.lease_until === null || r.lease_until < now)) return false;
      Object.assign(r, { state: 'SCREENING_FAILED', last_error: code, updated_at: now });
      return true;
    },
    async touch({ issueId, now }) {
      if (items.has(issueId)) items.get(issueId).updated_at = now;
    },
    async remove(issueId) {
      items.delete(issueId);
    },
    listByOutcomes: async (outcomes, states, limit) => [...items.values()].filter((r) => (outcomes.includes(r.outcome) && r.state === 'SCREENED') || states.includes(r.state)).slice(0, limit).map((r) => ({ ...r })),
    countByState: async () => Object.entries([...items.values()].reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {})).map(([state, n]) => ({ state, n })),
  };

  const screenings = {
    async insert(s) {
      if (scr.has(s.screeningId)) return false;
      counters.screeningInserts++;
      scr.set(s.screeningId, JSON.parse(JSON.stringify(s)));
      return true;
    },
    get: async (id) => (scr.has(id) ? JSON.parse(JSON.stringify(scr.get(id))) : null),
    getMany: async (ids) => ids.filter((id) => scr.has(id)).map((id) => ({ screening_id: id, ...JSON.parse(JSON.stringify(scr.get(id))) })),
    async removeForIssue(issueId) {
      for (const [k, v] of scr) if (v.issueId === issueId) scr.delete(k);
    },
  };

  const usage = {
    async reserveAiCall({ day, budget }) {
      const u = use.get(day) ?? { llm_calls: 0, fallbacks: 0, screenings: 0 };
      use.set(day, u);
      if (!(u.llm_calls < budget)) return false;
      u.llm_calls++;
      return true;
    },
    async record({ day, fallback }) {
      const u = use.get(day) ?? { llm_calls: 0, fallbacks: 0, screenings: 0 };
      u.screenings++;
      if (fallback) u.fallbacks++;
      use.set(day, u);
    },
    get: async (day) => use.get(day) ?? null,
  };

  const spendState = { micros: 0, calls: 0 };
  const spend = {
    async reserve({ micros, capMicros }) {
      if (spendState.micros + micros > capMicros) return false;
      spendState.micros += micros;
      spendState.calls++;
      return true;
    },
    async adjust({ deltaMicros }) {
      spendState.micros = Math.max(0, spendState.micros + deltaMicros);
    },
    get: async () => ({ ...spendState }),
  };

  // ---- M3: append-only decisions / assignments / chain (INSERT IGNORE on PK + unique keys) ----
  const dec = []; // stored as SQL would store them (JSON columns serialised)
  const asg = [];
  const chn = [];
  const failures = { decisionInsert: false, chainInsert: false, gateSnapshot: false, gateSnapshotDelayMs: 0, gateEventsInsert: false, settingsRead: false, schemaMissing: false };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const parseD = (r) => r && { ...clone(r), conditions: JSON.parse(r.conditions), questions: JSON.parse(r.questions), signal_set: JSON.parse(r.signal_set), detail: r.detail ? JSON.parse(r.detail) : null };
  const decisions = {
    async insert(d) {
      if (failures.decisionInsert) throw new Error('sql unavailable');
      if (dec.some((r) => (r.issue_id === d.issueId && r.seq === d.seq) || r.decision_id === d.decisionId || r.request_id === d.requestId)) return false;
      dec.push({ issue_id: d.issueId, seq: d.seq, decision_id: d.decisionId, request_id: d.requestId, kind: d.kind, decision: d.decision, rationale: d.rationale ?? null, conditions: JSON.stringify(d.conditions ?? []), questions: JSON.stringify(d.questions ?? []), decided_by: d.decidedBy ?? null, decided_at: d.decidedAt, screening_id: d.screeningId, fp: d.fp, pipeline_version: d.pipelineVersion, outcome: d.outcome ?? null, signal_set: JSON.stringify(d.signalSet ?? {}), detail: d.detail ? JSON.stringify(d.detail) : null });
      return true;
    },
    latest: async (issueId) => parseD(dec.filter((r) => r.issue_id === issueId).sort((a, b) => b.seq - a.seq)[0] ?? null),
    list: async (issueId) => dec.filter((r) => r.issue_id === issueId).sort((a, b) => a.seq - b.seq).map(parseD),
    byRequest: async (rid) => parseD(dec.find((r) => r.request_id === rid) ?? null),
    unanchored: async (limit) => dec.filter((r) => !chn.some((c) => c.decision_id === r.decision_id)).slice(0, limit).map(parseD),
  };
  const assignments = {
    async insert(a) {
      if (asg.some((r) => (r.issue_id === a.issueId && r.seq === a.seq) || r.request_id === a.requestId)) return false;
      asg.push({ issue_id: a.issueId, seq: a.seq, assignee: a.assignee ?? null, assigned_by: a.assignedBy, assigned_at: a.assignedAt, request_id: a.requestId });
      return true;
    },
    latest: async (issueId) => clone(asg.filter((r) => r.issue_id === issueId).sort((a, b) => b.seq - a.seq)[0] ?? null),
    list: async (issueId) => clone(asg.filter((r) => r.issue_id === issueId).sort((a, b) => a.seq - b.seq)),
    byRequest: async (rid) => clone(asg.find((r) => r.request_id === rid) ?? null),
  };
  const chain = {
    head: async () => (chn.length ? { seq: chn.at(-1).seq, record_hash: chn.at(-1).record_hash } : null),
    async insert({ seq, decisionId, record, recordHash }) {
      if (failures.chainInsert) throw new Error('sql unavailable');
      if (chn.some((c) => c.seq === seq || c.decision_id === decisionId)) return false;
      chn.push({ seq, decision_id: decisionId, record: JSON.stringify(record), record_hash: recordHash });
      chn.sort((a, b) => a.seq - b.seq);
      return true;
    },
    byDecision: async (id) => {
      const c = chn.find((x) => x.decision_id === id);
      return c ? { seq: c.seq, record: JSON.parse(c.record) } : null;
    },
    all: async () => chn.map((c) => JSON.parse(c.record)),
  };
  async function inboxCandidates({ projectKey = null, outcome = null, limit = 300 }) {
    const out = [];
    for (const w of [...items.values()].sort((a, b) => a.updated_at - b.updated_at)) {
      const d = parseD(dec.filter((r) => r.issue_id === w.issue_id).sort((a, b) => b.seq - a.seq)[0] ?? null);
      const a = asg.filter((r) => r.issue_id === w.issue_id).sort((x, y) => y.seq - x.seq)[0] ?? null;
      if (!(['NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY'].includes(w.outcome) || d || ['QUEUED', 'SCREENING', 'SCREENING_FAILED'].includes(w.state))) continue;
      if (projectKey && w.project_key !== projectKey) continue;
      if (outcome && w.outcome !== outcome) continue;
      out.push({ ...clone(w), latest: d ? { decision: d.decision, fp: d.fp, seq: d.seq, decided_at: d.decided_at, carried: d.detail?.carried ?? null } : null, assignee: a?.assignee ?? null });
    }
    return out.slice(0, limit);
  }

  // ---- M4: settings events (append-only, PK (setting, seq), unique request_id), gate events ----
  const sev = [];
  const gev = [];
  const settingsEvents = {
    async latest(setting) {
      if (failures.settingsRead) throw new Error('sql unavailable');
      return clone(sev.filter((r) => r.setting === setting).sort((a, b) => b.seq - a.seq)[0] ?? null);
    },
    history: async (setting, limit = 20) => clone(sev.filter((r) => r.setting === setting).sort((a, b) => b.seq - a.seq).slice(0, limit)),
    async insert({ setting, seq, value, changedBy, changedAt, requestId, note }) {
      if (sev.some((r) => (r.setting === setting && r.seq === seq) || r.request_id === requestId)) return false;
      sev.push({ setting, seq, value, changed_by: changedBy, changed_at: changedAt, request_id: requestId, note: note ?? null });
      return true;
    },
    byRequest: async (rid) => clone(sev.find((r) => r.request_id === rid) ?? null),
  };
  const gateEvents = {
    async insert(e) {
      if (failures.gateEventsInsert) throw new Error('sql unavailable');
      gev.push({ id: gev.length + 1, at: e.at, issue_id: e.issueId ?? null, project_key: e.projectKey ?? null, from_status: e.from ?? null, to_status: e.to ?? null, mode: e.mode, verdict: e.verdict, reason: e.reason, policy_version: e.policyVersion, decision_seq: e.decisionSeq ?? null, content_ref: e.contentRef ?? null, ms: e.ms ?? null });
    },
    recent: async (limit = 20) => clone([...gev].sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit)),
    forIssue: async (issueId, limit = 10) => clone(gev.filter((e) => e.issue_id === issueId).sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit)),
    summary: async (since) => Object.entries(gev.filter((e) => e.at >= since).reduce((m, e) => ({ ...m, [e.verdict]: (m[e.verdict] ?? 0) + 1 }), {})).map(([verdict, n]) => ({ verdict, n })),
  };
  async function gateSnapshot(issueId) {
    if (failures.gateSnapshotDelayMs) await new Promise((r) => setTimeout(r, failures.gateSnapshotDelayMs));
    if (failures.schemaMissing) throw new Error("Table 'gate_events' doesn't exist");
    if (failures.gateSnapshot) throw new Error('sql unavailable');
    const w = items.get(issueId);
    const mine = dec.filter((r) => r.issue_id === issueId).sort((a, b) => b.seq - a.seq);
    const d = mine[0] ?? null;
    const h = mine.find((r) => r.kind === 'human') ?? null;
    const rec = (row) => (row ? chn.find((c) => c.decision_id === row.decision_id) : null);
    const g = sev.filter((r) => r.setting === 'gate.mode').sort((a, b) => b.seq - a.seq)[0] ?? null;
    return {
      item: w ? { issue_id: w.issue_id, project_key: w.project_key, state: w.state, outcome: w.outcome, screening_id: w.screening_id, screened_fp: w.screened_fp } : null,
      latest: parseD(d), latestHuman: parseD(h),
      latestRecord: rec(d) ? JSON.parse(rec(d).record) : null, humanRecord: rec(h) ? JSON.parse(rec(h).record) : null,
      mode: g?.value ?? null, modeSeq: g ? g.seq : 0,
    };
  }
  async function gateTablesReachable() {
    if (failures.schemaMissing) throw new Error("Table 'settings_events' doesn't exist");
    if (failures.gateSnapshot) throw new Error('sql unavailable');
    return { s: sev.length, g: gev.length, c: chn.length };
  }
  return { repos: { workItems, screenings, usage, spend, decisions, assignments, chain, inboxCandidates, settingsEvents, gateEvents, gateSnapshot, gateTablesReachable }, items, scr, use, counters, spendState, dec, asg, chn, sev, gev, failures };
}
