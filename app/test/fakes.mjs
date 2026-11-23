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
  const failures = { decisionInsert: false, chainInsert: false, gateSnapshot: false, gateSnapshotDelayMs: 0, gateEventsInsert: false, settingsRead: false, schemaMissing: false, restoreChainAfter: null };
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
    forDecisions: async (ids) => chn.filter((c) => ids.includes(c.decision_id)).map((c) => ({ seq: c.seq, decisionId: c.decision_id, record: JSON.parse(c.record) })),
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
  async function gateSnapshot(issueId, now = Date.now()) {
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
      restore: (() => {
        const last = [...lev].filter((e) => e.type === 'restore').sort((a, b) => b.at - a.at || b.id - a.id)[0];
        if (last?.outcome === 'failed_partial') return 'incomplete';
        return sessions.some((x) => x.used_at === null && x.expires_at > now) ? 'in_progress' : null;
      })(),
    };
  }
  async function gateTablesReachable() {
    if (failures.schemaMissing) throw new Error("Table 'settings_events' doesn't exist");
    if (failures.gateSnapshot) throw new Error('sql unavailable');
    return { s: sev.length, g: gev.length, c: chn.length };
  }

  // ---- M5: keys, successions, checkpoints, ledger events, recovery sessions, transfers ----
  const keys = [];
  const succ = [];
  const cps = [];
  const lev = [];
  const sessions = [];
  const xfer = [];
  const recordKeys = {
    all: async () => clone(keys),
    async insert(k) {
      if (keys.some((x) => x.kid === k.kid)) return false;
      keys.push({ kid: k.kid, alg: k.alg, publicKey: k.publicKey, registeredAt: k.registeredAt, selfSig: k.selfSig });
      return true;
    },
  };
  const keySuccessions = {
    all: async () => clone(succ),
    async insert(x) {
      if (succ.some((y) => y.fromKid === x.fromKid && y.toKid === x.toKid)) return false;
      succ.push({ fromKid: x.fromKid, toKid: x.toKid, at: x.at, toSig: x.toSig, fromSig: x.fromSig ?? null });
      return true;
    },
  };
  const trustMaterial = async () => ({ registry: clone(keys), successions: clone(succ) });
  const checkpoints = {
    all: async () => clone([...cps].sort((a, b) => a.seq - b.seq)).map((c) => ({ ...c, siteId: null })),
    async insert(c) {
      if (cps.some((x) => x.seq === c.seq && x.purpose === c.purpose && x.kid === c.kid)) return false;
      cps.push({ seq: c.seq, hash: c.hash, kid: c.kid, at: c.at, purpose: c.purpose, sig: c.sig });
      return true;
    },
  };
  const ledgerEvents = {
    async insert(e) {
      lev.push({ id: lev.length + 1, at: e.at, type: e.type, actor: e.actor ?? null, outcome: e.outcome, head_seq: e.headSeq ?? null, digest: e.digest ?? null, summary: e.summary ?? null });
    },
    latest: async (type) => clone([...lev].filter((e) => e.type === type).sort((a, b) => b.at - a.at || b.id - a.id)[0] ?? null),
    recent: async (limit = 10) => clone([...lev].sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit)),
  };
  const recoverySessions = {
    async insert(x) {
      sessions.push({ token_hash: x.tokenHash, actor: x.actor, digest: x.digest, created_at: x.createdAt, expires_at: x.expiresAt, used_at: null });
    },
    async consume({ tokenHash, actor, now }) {
      const x = sessions.find((y) => y.token_hash === tokenHash && y.actor === actor && y.used_at === null && y.expires_at > now);
      if (!x) return null;
      x.used_at = now;
      return clone(x);
    },
    async expireAll(now) {
      for (const x of sessions) if (x.used_at === null && x.expires_at > now) x.expires_at = now;
    },
    active: async (now) => sessions.some((x) => x.used_at === null && x.expires_at > now),
  };
  const storeCounts = async () => ({ decisions: dec.length, chain: chn.length, assignments: asg.length });
  const exportReads = {
    chain: async () => [...chn].sort((a, b) => a.seq - b.seq).map((c) => JSON.parse(c.record)),
    decisions: async () => [...dec].sort((a, b) => String(a.issue_id).localeCompare(String(b.issue_id)) || a.seq - b.seq).map(parseD),
    assignments: async () => clone([...asg].sort((a, b) => String(a.issue_id).localeCompare(String(b.issue_id)) || a.seq - b.seq)),
    settings: async () => clone([...sev].sort((a, b) => a.setting.localeCompare(b.setting) || a.seq - b.seq)),
  };
  let restoredChain = 0;
  const restoreWrites = {
    async chain(r) {
      if (failures.restoreChainAfter !== null && restoredChain >= failures.restoreChainAfter) throw new Error('sql unavailable');
      if (chn.some((c) => c.seq === r.seq || c.decision_id === r.decisionId)) return false;
      restoredChain++;
      chn.push({ seq: r.seq, decision_id: r.decisionId, record: JSON.stringify(r), record_hash: r.hash });
      chn.sort((a, b) => a.seq - b.seq);
      return true;
    },
    async decision(d) {
      return decisions.insert({ issueId: d.issue_id, seq: d.seq, decisionId: d.decision_id, requestId: d.request_id, kind: d.kind, decision: d.decision, rationale: d.rationale, conditions: d.conditions, questions: d.questions, decidedBy: d.decided_by, decidedAt: d.decided_at, screeningId: d.screening_id, fp: d.fp, pipelineVersion: d.pipeline_version, outcome: d.outcome, signalSet: d.signal_set, detail: d.detail });
    },
    async assignment(a) {
      return assignments.insert({ issueId: a.issue_id, seq: a.seq, assignee: a.assignee, assignedBy: a.assigned_by, assignedAt: a.assigned_at, requestId: a.request_id });
    },
    async setting(x) {
      return settingsEvents.insert({ setting: x.setting, seq: x.seq, value: x.value, changedBy: x.changed_by, changedAt: x.changed_at, requestId: x.request_id, note: x.note });
    },
  };
  const transfers = {
    async put(x) {
      if (xfer.some((y) => y.transfer_id === x.transferId && y.idx === x.idx)) return false;
      xfer.push({ transfer_id: x.transferId, idx: x.idx, kind: x.kind, actor: x.actor, data: x.data, created_at: x.createdAt });
      return true;
    },
    get: async (id, idx) => clone(xfer.find((y) => y.transfer_id === id && y.idx === idx) ?? null),
    async meta(id) {
      const rows = xfer.filter((y) => y.transfer_id === id);
      if (!rows.length) return { n: 0, actor: null, actor2: null, kind: null, created_at: null };
      const actors = rows.map((y) => y.actor).sort();
      return { n: rows.length, actor: actors[0], actor2: actors.at(-1), kind: rows.map((y) => y.kind).sort()[0], created_at: Math.min(...rows.map((y) => y.created_at)) };
    },
    all: async (id) => clone(xfer.filter((y) => y.transfer_id === id).sort((a, b) => a.idx - b.idx).map((y) => ({ idx: y.idx, data: y.data }))),
    async purge(before) {
      const n = xfer.length;
      for (let i = xfer.length - 1; i >= 0; i--) if (xfer[i].created_at < before) xfer.splice(i, 1);
      return n - xfer.length;
    },
  };
  async function registerRows(limit = 500) {
    return [...dec].sort((a, b) => b.decided_at - a.decided_at || b.seq - a.seq).slice(0, limit).map((d) => {
      const c = chn.find((x) => x.decision_id === d.decision_id);
      const rec = c ? JSON.parse(c.record) : null;
      return { issue_id: String(d.issue_id), seq: d.seq, kind: d.kind, decision: d.decision, decided_by: d.decided_by, decided_at: d.decided_at, fp: d.fp, outcome: d.outcome, decision_id: d.decision_id, chainSeq: c ? c.seq : null, recordVersion: rec?.v ?? null, kid: rec?.kid ?? null };
    });
  }
  async function purgeGateEvents(before) {
    const n = gev.length;
    for (let i = gev.length - 1; i >= 0; i--) if (gev[i].at < before) gev.splice(i, 1);
    return n - gev.length;
  }
  function wipe() {
    // Simulates an uninstall + reinstall: Forge storage is gone (environment variables survive).
    for (const arr of [dec, asg, chn, sev, gev, keys, succ, cps, lev, sessions, xfer]) arr.length = 0;
    items.clear();
    scr.clear();
    restoredChain = 0;
  }
  return {
    repos: { workItems, screenings, usage, spend, decisions, assignments, chain, inboxCandidates, settingsEvents, gateEvents, gateSnapshot, gateTablesReachable, recordKeys, keySuccessions, trustMaterial, checkpoints, ledgerEvents, recoverySessions, storeCounts, exportReads, restoreWrites, transfers, registerRows, purgeGateEvents },
    items, scr, use, counters, spendState, dec, asg, chn, sev, gev, keys, succ, cps, lev, sessions, xfer, failures, wipe,
  };
}
