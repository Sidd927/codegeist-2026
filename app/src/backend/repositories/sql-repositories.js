// SQL repositories. Every state transition is ONE conditional statement (INSERT IGNORE or
// UPDATE ... WHERE <precondition>) whose affectedRows tells the caller whether it won. Forge SQL
// does not document multi-statement transactions, so correctness never relies on them.
import sql from '@forge/sql';

const affected = (r) => r?.rows?.affectedRows ?? 0;
const run = (text, ...params) => sql.prepare(text).bindParams(...params).execute();
const one = async (text, ...params) => (await run(text, ...params)).rows?.[0] ?? null;
const many = async (text, ...params) => (await run(text, ...params)).rows ?? [];
const placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');

export const SCREENING_STATES = Object.freeze({ QUEUED: 'QUEUED', SCREENING: 'SCREENING', SCREENED: 'SCREENED', FAILED: 'SCREENING_FAILED' });

export const workItems = {
  /** Record an event for an issue; returns the new request sequence. Creates the row if needed. */
  async recordEvent({ issueId, issueKey, projectKey, now, contentChange }) {
    const ins = await run(
      'INSERT IGNORE INTO work_items (issue_id, issue_key, project_key, state, request_seq, last_event_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      issueId, issueKey, projectKey, SCREENING_STATES.QUEUED, now, now, now,
    );
    if (affected(ins) === 0) {
      await run(
        `UPDATE work_items SET request_seq = request_seq + 1, issue_key = ?, project_key = ?, last_event_at = ?, updated_at = ?,
           state = CASE WHEN ? = 1 AND state IN ('SCREENED', 'SCREENING_FAILED') THEN 'QUEUED' ELSE state END
         WHERE issue_id = ?`,
        issueKey, projectKey, now, now, contentChange ? 1 : 0, issueId,
      );
    }
    return (await one('SELECT request_seq FROM work_items WHERE issue_id = ?', issueId))?.request_seq ?? 1;
  },

  /** Manual re-check, rate-limited by a conditional update. Returns true if accepted. */
  async requestManual({ issueId, issueKey, projectKey, now, minIntervalMs }) {
    await run(
      'INSERT IGNORE INTO work_items (issue_id, issue_key, project_key, state, request_seq, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      issueId, issueKey, projectKey, SCREENING_STATES.QUEUED, now, now,
    );
    const r = await run(
      `UPDATE work_items SET manual_request_at = ?, request_seq = request_seq + 1, updated_at = ?,
         state = CASE WHEN state IN ('SCREENED', 'SCREENING_FAILED') THEN 'QUEUED' ELSE state END,
         attempts = CASE WHEN state = 'SCREENING_FAILED' THEN 0 ELSE attempts END
       WHERE issue_id = ? AND (manual_request_at IS NULL OR manual_request_at < ?)`,
      now, now, issueId, now - minIntervalMs,
    );
    return affected(r) === 1;
  },

  /** Take an exclusive, expiring lease. Returns the row as claimed, or null if another worker holds it. */
  async claim({ issueId, token, now, leaseMs }) {
    const r = await run(
      `UPDATE work_items SET lease_token = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?,
         state = CASE WHEN state IN ('QUEUED', 'SCREENING_FAILED') THEN 'SCREENING' ELSE state END
       WHERE issue_id = ? AND (lease_until IS NULL OR lease_until < ?)`,
      token, now + leaseMs, now, issueId, now,
    );
    if (affected(r) !== 1) return null;
    return one('SELECT * FROM work_items WHERE issue_id = ? AND lease_token = ?', issueId, token);
  },

  /** Publish a result only if we still hold the lease. Returns false if the lease was lost. */
  async finalize({ issueId, token, screeningId, fp, outcome, seqAtClaim, now }) {
    const r = await run(
      `UPDATE work_items SET outcome = ?, screening_id = ?, screened_fp = ?, processed_seq = GREATEST(processed_seq, ?),
         state = CASE WHEN request_seq > ? THEN 'QUEUED' ELSE 'SCREENED' END,
         lease_token = NULL, lease_until = NULL, attempts = 0, last_error = NULL, version = version + 1, updated_at = ?
       WHERE issue_id = ? AND lease_token = ?`,
      outcome, screeningId, fp, seqAtClaim, seqAtClaim, now, issueId, token,
    );
    return affected(r) === 1;
  },

  /** Release after a failure. terminal → SCREENING_FAILED (visible, never "clean"); otherwise stays queued for retry. */
  async fail({ issueId, token, code, terminal, now }) {
    const r = await run(
      `UPDATE work_items SET state = ?, last_error = ?, lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE issue_id = ? AND lease_token = ?`,
      terminal ? SCREENING_STATES.FAILED : SCREENING_STATES.QUEUED, code, now, issueId, token,
    );
    return affected(r) === 1;
  },

  async release({ issueId, token, now }) {
    await run('UPDATE work_items SET lease_token = NULL, lease_until = NULL, updated_at = ? WHERE issue_id = ? AND lease_token = ?', now, issueId, token);
  },

  get: (issueId) => one('SELECT * FROM work_items WHERE issue_id = ?', issueId),

  /** Work item + its current screening in ONE query (panel/workspace hot path). */
  async getView(issueId) {
    const r = await one(
      `SELECT w.*, s.screening_id AS s_id, s.outcome AS s_outcome, s.mode AS s_mode, s.model AS s_model, s.result AS s_result, s.quality AS s_quality,
              s.pipeline_version AS s_pipeline_version, s.ai_status AS s_ai_status, s.created_at AS s_created_at
       FROM work_items w LEFT JOIN screenings s ON s.screening_id = w.screening_id WHERE w.issue_id = ?`,
      issueId,
    );
    if (!r) return { row: null, screening: null };
    const screening = r.s_id
      ? { screening_id: r.s_id, outcome: r.s_outcome, mode: r.s_mode, model: r.s_model, result: JSON.parse(r.s_result), quality: JSON.parse(r.s_quality), pipeline_version: r.s_pipeline_version, ai_status: r.s_ai_status, created_at: r.s_created_at }
      : null;
    return { row: r, screening };
  },

  async listByOutcomes(outcomes, states, limit) {
    return many(
      `SELECT issue_id, issue_key, project_key, state, outcome, screening_id, updated_at FROM work_items
       WHERE (outcome IN (${placeholders(outcomes.length)}) AND state = 'SCREENED') OR state IN (${placeholders(states.length)})
       ORDER BY updated_at ASC LIMIT ${Number(limit) | 0}`,
      ...outcomes, ...states,
    );
  },

  /** Rows whose processing appears stuck: queued/screening, not updated recently, no live lease. */
  listStuck: ({ olderThan, now, limit }) =>
    many(
      `SELECT issue_id, issue_key, project_key, attempts FROM work_items
       WHERE state IN ('QUEUED', 'SCREENING') AND updated_at < ? AND (lease_until IS NULL OR lease_until < ?)
       ORDER BY updated_at ASC LIMIT ${Number(limit) | 0}`,
      olderThan, now,
    ),

  async markFailedIfStuck({ issueId, code, now }) {
    const r = await run(
      `UPDATE work_items SET state = 'SCREENING_FAILED', last_error = ?, updated_at = ?
       WHERE issue_id = ? AND state IN ('QUEUED', 'SCREENING') AND (lease_until IS NULL OR lease_until < ?)`,
      code, now, issueId, now,
    );
    return affected(r) === 1;
  },

  async touch({ issueId, now }) {
    await run('UPDATE work_items SET updated_at = ? WHERE issue_id = ?', now, issueId);
  },

  countByState: () => many('SELECT state, COUNT(*) AS n FROM work_items GROUP BY state'),

  async remove(issueId) {
    await run('DELETE FROM work_items WHERE issue_id = ?', issueId);
  },
};

export const screenings = {
  async insert(s) {
    const r = await run(
      `INSERT IGNORE INTO screenings (screening_id, issue_id, fp, pipeline_version, mode, model, outcome, result, quality, ai_status, tokens_in, tokens_out, model_ms, total_ms, queue_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.screeningId, s.issueId, s.fp, s.pipelineVersion, s.mode, s.model ?? null, s.outcome, JSON.stringify(s.result), JSON.stringify(s.quality),
      s.aiStatus ?? null, s.tokensIn ?? null, s.tokensOut ?? null, s.modelMs ?? null, s.totalMs ?? null, s.queueMs ?? null, s.createdAt,
    );
    return affected(r) === 1;
  },
  async get(screeningId) {
    const row = await one('SELECT * FROM screenings WHERE screening_id = ?', screeningId);
    return row ? { ...row, result: JSON.parse(row.result), quality: JSON.parse(row.quality) } : null;
  },
  async getMany(ids) {
    if (!ids.length) return [];
    const rows = await many(`SELECT screening_id, outcome, mode, result FROM screenings WHERE screening_id IN (${placeholders(ids.length)})`, ...ids);
    return rows.map((r) => ({ ...r, result: JSON.parse(r.result) }));
  },
  async removeForIssue(issueId) {
    await run('DELETE FROM screenings WHERE issue_id = ?', issueId);
  },
};

export const usage = {
  /** Atomically reserve one AI call within the daily budget. */
  async reserveAiCall({ day, budget }) {
    await run('INSERT IGNORE INTO usage_daily (day) VALUES (?)', day);
    const r = await run('UPDATE usage_daily SET llm_calls = llm_calls + 1 WHERE day = ? AND llm_calls < ?', day, budget);
    return affected(r) === 1;
  },
  async record({ day, fallback, tokensIn = 0, tokensOut = 0 }) {
    await run('INSERT IGNORE INTO usage_daily (day) VALUES (?)', day);
    await run('UPDATE usage_daily SET screenings = screenings + 1, fallbacks = fallbacks + ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE day = ?', fallback ? 1 : 0, tokensIn, tokensOut, day);
  },
  get: (day) => one('SELECT * FROM usage_daily WHERE day = ?', day),
};

/** Hard AI spend cap in micro-USD, enforced atomically (reserve worst case first, then settle). */
export const spend = {
  async reserve({ micros, capMicros }) {
    await run("INSERT IGNORE INTO ai_spend (scope) VALUES ('total')");
    const r = await run("UPDATE ai_spend SET micros = micros + ?, calls = calls + 1 WHERE scope = 'total' AND micros + ? <= ?", micros, micros, capMicros);
    return affected(r) === 1;
  },
  async adjust({ deltaMicros }) {
    if (deltaMicros) await run("UPDATE ai_spend SET micros = GREATEST(0, micros + ?) WHERE scope = 'total'", deltaMicros);
  },
  get: () => one("SELECT micros, calls FROM ai_spend WHERE scope = 'total'"),
};

// ---------------------------------------------------------------------------------------------
// M3 REVIEW. Decisions and assignments are APPEND-ONLY: there is no UPDATE or DELETE path for them.
// Each write is one INSERT IGNORE keyed by (issue_id, seq) plus a unique request_id, so concurrent or
// repeated submissions resolve atomically: exactly one insert for a given position wins.

const parseDecision = (r) =>
  r && {
    ...r,
    seq: Number(r.seq),
    decided_at: Number(r.decided_at),
    conditions: JSON.parse(r.conditions ?? '[]'),
    questions: JSON.parse(r.questions ?? '[]'),
    signal_set: JSON.parse(r.signal_set ?? '{}'),
    detail: r.detail ? JSON.parse(r.detail) : null,
  };
const parseAssignment = (r) => r && { ...r, seq: Number(r.seq), assigned_at: Number(r.assigned_at) };

export const decisions = {
  async insert(d) {
    const r = await run(
      `INSERT IGNORE INTO decisions (issue_id, seq, decision_id, request_id, kind, decision, rationale, conditions, questions, decided_by, decided_at,
         screening_id, fp, pipeline_version, outcome, signal_set, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.issueId, d.seq, d.decisionId, d.requestId, d.kind, d.decision, d.rationale ?? null, JSON.stringify(d.conditions ?? []), JSON.stringify(d.questions ?? []),
      d.decidedBy ?? null, d.decidedAt, d.screeningId, d.fp, d.pipelineVersion, d.outcome ?? null, JSON.stringify(d.signalSet ?? {}), d.detail ? JSON.stringify(d.detail) : null,
    );
    return affected(r) === 1;
  },
  latest: async (issueId) => parseDecision(await one('SELECT * FROM decisions WHERE issue_id = ? ORDER BY seq DESC LIMIT 1', issueId)),
  list: async (issueId) => (await many('SELECT * FROM decisions WHERE issue_id = ? ORDER BY seq ASC', issueId)).map(parseDecision),
  byRequest: async (requestId) => parseDecision(await one('SELECT * FROM decisions WHERE request_id = ?', requestId)),
  /** Decisions without a chain record (partial failure between insert and anchoring). */
  unanchored: async (limit) =>
    (await many(`SELECT d.* FROM decisions d LEFT JOIN chain c ON c.decision_id = d.decision_id WHERE c.decision_id IS NULL ORDER BY d.decided_at ASC LIMIT ${Number(limit) | 0}`)).map(parseDecision),
};

export const assignments = {
  async insert(a) {
    const r = await run(
      'INSERT IGNORE INTO assignments (issue_id, seq, assignee, assigned_by, assigned_at, request_id) VALUES (?, ?, ?, ?, ?, ?)',
      a.issueId, a.seq, a.assignee ?? null, a.assignedBy, a.assignedAt, a.requestId,
    );
    return affected(r) === 1;
  },
  latest: async (issueId) => parseAssignment(await one('SELECT * FROM assignments WHERE issue_id = ? ORDER BY seq DESC LIMIT 1', issueId)),
  list: async (issueId) => (await many('SELECT * FROM assignments WHERE issue_id = ? ORDER BY seq ASC', issueId)).map(parseAssignment),
  byRequest: async (requestId) => parseAssignment(await one('SELECT * FROM assignments WHERE request_id = ?', requestId)),
};

export const chain = {
  head: () => one('SELECT seq, record_hash FROM chain ORDER BY seq DESC LIMIT 1'),
  async insert({ seq, decisionId, record, recordHash, createdAt }) {
    const r = await run('INSERT IGNORE INTO chain (seq, decision_id, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?)', seq, decisionId, JSON.stringify(record), recordHash, createdAt);
    return affected(r) === 1;
  },
  byDecision: async (decisionId) => {
    const r = await one('SELECT seq, record FROM chain WHERE decision_id = ?', decisionId);
    return r ? { seq: Number(r.seq), record: JSON.parse(r.record) } : null;
  },
  all: async (limit = 5000) => (await many(`SELECT record FROM chain ORDER BY seq ASC LIMIT ${Number(limit) | 0}`)).map((r) => JSON.parse(r.record)),
  /** Records for a set of decisions (one statement; used by the workspace history). */
  forDecisions: async (ids) => {
    const clean = ids.filter((x) => /^[0-9a-f]{64}$/.test(String(x))).slice(0, 200);
    if (!clean.length) return [];
    return (await many(`SELECT seq, decision_id, record FROM chain WHERE decision_id IN (${placeholders(clean.length)})`, ...clean)).map((r) => ({ seq: Number(r.seq), decisionId: r.decision_id, record: JSON.parse(r.record) }));
  },
};

/** Inbox candidates with their latest decision and assignment (grouped derived tables, one statement). */
export async function inboxCandidates({ projectKey = null, outcome = null, limit = 300 }) {
  const where = ["(w.outcome IN ('NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY') OR d.decision IS NOT NULL OR w.state IN ('QUEUED', 'SCREENING', 'SCREENING_FAILED'))"];
  const params = [];
  if (projectKey) {
    where.push('w.project_key = ?');
    params.push(projectKey);
  }
  if (outcome) {
    where.push('w.outcome = ?');
    params.push(outcome);
  }
  const rows = await many(
    `SELECT w.issue_id, w.issue_key, w.project_key, w.state, w.outcome, w.screening_id, w.screened_fp, w.updated_at, w.created_at,
            d.decision AS d_decision, d.fp AS d_fp, d.seq AS d_seq, d.decided_at AS d_at, d.detail AS d_detail,
            a.assignee AS a_assignee, a.seq AS a_seq
     FROM work_items w
     LEFT JOIN (SELECT issue_id, MAX(seq) AS max_seq FROM decisions GROUP BY issue_id) dm ON dm.issue_id = w.issue_id
     LEFT JOIN decisions d ON d.issue_id = dm.issue_id AND d.seq = dm.max_seq
     LEFT JOIN (SELECT issue_id, MAX(seq) AS max_seq FROM assignments GROUP BY issue_id) am ON am.issue_id = w.issue_id
     LEFT JOIN assignments a ON a.issue_id = am.issue_id AND a.seq = am.max_seq
     WHERE ${where.join(' AND ')}
     ORDER BY w.updated_at ASC LIMIT ${Number(limit) | 0}`,
    ...params,
  );
  return rows.map((r) => ({
    ...r,
    updated_at: Number(r.updated_at),
    latest: r.d_decision ? { decision: r.d_decision, fp: r.d_fp, seq: Number(r.d_seq), decided_at: Number(r.d_at), carried: r.d_detail ? JSON.parse(r.d_detail)?.carried ?? null : null } : null,
    assignee: r.a_assignee ?? null,
  }));
}

// ---- M4 ENFORCE ----------------------------------------------------------------------------------

/** Append-only admin settings. The latest row per setting is the value; each row is an audit event. */
export const settingsEvents = {
  latest: (setting) => one('SELECT setting, seq, value, changed_by, changed_at, note FROM settings_events WHERE setting = ? ORDER BY seq DESC LIMIT 1', setting),
  history: (setting, limit = 20) => many(`SELECT setting, seq, value, changed_by, changed_at, note FROM settings_events WHERE setting = ? ORDER BY seq DESC LIMIT ${Number(limit) | 0}`, setting),
  async insert({ setting, seq, value, changedBy, changedAt, requestId, note }) {
    const r = await run('INSERT IGNORE INTO settings_events (setting, seq, value, changed_by, changed_at, request_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)', setting, seq, value, changedBy, changedAt, requestId, note ?? null);
    return affected(r) === 1;
  },
  byRequest: (requestId) => one('SELECT setting, seq, value, changed_by, changed_at, note FROM settings_events WHERE request_id = ?', requestId),
};

export const gateEvents = {
  async insert(e) {
    await run(
      `INSERT INTO gate_events (at, issue_id, project_key, from_status, to_status, mode, verdict, reason, policy_version, decision_seq, content_ref, ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.at, e.issueId ?? null, e.projectKey ?? null, e.from ?? null, e.to ?? null, e.mode, e.verdict, e.reason, e.policyVersion, e.decisionSeq ?? null, e.contentRef ?? null, e.ms ?? null,
    );
  },
  recent: (limit = 20) => many(`SELECT id, at, issue_id, project_key, from_status, to_status, mode, verdict, reason, policy_version, decision_seq, content_ref, ms FROM gate_events ORDER BY at DESC LIMIT ${Number(limit) | 0}`),
  forIssue: (issueId, limit = 10) => many(`SELECT id, at, issue_id, project_key, from_status, to_status, mode, verdict, reason, policy_version, decision_seq, content_ref, ms FROM gate_events WHERE issue_id = ? ORDER BY at DESC LIMIT ${Number(limit) | 0}`, issueId),
  summary: (since) => many('SELECT verdict, COUNT(*) AS n FROM gate_events WHERE at >= ? GROUP BY verdict', since),
};

const decisionCols = (p) =>
  ['issue_id', 'seq', 'decision_id', 'kind', 'decision', 'rationale', 'conditions', 'questions', 'decided_by', 'decided_at', 'screening_id', 'fp', 'pipeline_version', 'outcome', 'detail']
    .map((c) => `${p}.${c} AS ${p}_${c}`).join(', ');
const pickDecision = (r, p) =>
  r[`${p}_decision_id`]
    ? parseDecision(Object.fromEntries(['issue_id', 'seq', 'decision_id', 'kind', 'decision', 'rationale', 'conditions', 'questions', 'decided_by', 'decided_at', 'screening_id', 'fp', 'pipeline_version', 'outcome', 'detail'].map((c) => [c, r[`${p}_${c}`]])))
    : null;

/**
 * Everything the gate needs for one issue in ONE statement: the work item, the latest decision,
 * the latest human decision, both signed chain records, and the current gate mode.
 * Statement-level consistency: no interleaving write can produce a mixed snapshot.
 */
export async function gateSnapshot(issueId, now = Date.now()) {
  const r = await one(
    `SELECT w.issue_id AS w_issue_id, w.project_key AS w_project_key, w.state AS w_state, w.outcome AS w_outcome, w.screening_id AS w_screening_id, w.screened_fp AS w_screened_fp,
            ${decisionCols('d')}, ${decisionCols('h')},
            cd.record AS cd_record, ch.record AS ch_record,
            g.value AS g_mode, g.seq AS g_seq,
            (SELECT le.outcome FROM ledger_events le WHERE le.type = 'restore' ORDER BY le.at DESC, le.id DESC LIMIT 1) AS r_outcome,
            (SELECT COUNT(*) FROM recovery_sessions rs WHERE rs.used_at IS NULL AND rs.expires_at > ?) AS r_open
     FROM (SELECT 1 AS one) base
     LEFT JOIN work_items w ON w.issue_id = ?
     LEFT JOIN (SELECT MAX(seq) AS max_seq FROM decisions WHERE issue_id = ?) dm ON 1 = 1
     LEFT JOIN decisions d ON d.issue_id = ? AND d.seq = dm.max_seq
     LEFT JOIN (SELECT MAX(seq) AS max_seq FROM decisions WHERE issue_id = ? AND kind = 'human') hm ON 1 = 1
     LEFT JOIN decisions h ON h.issue_id = ? AND h.seq = hm.max_seq
     LEFT JOIN chain cd ON cd.decision_id = d.decision_id
     LEFT JOIN chain ch ON ch.decision_id = h.decision_id
     LEFT JOIN (SELECT MAX(seq) AS max_seq FROM settings_events WHERE setting = 'gate.mode') gm ON 1 = 1
     LEFT JOIN settings_events g ON g.setting = 'gate.mode' AND g.seq = gm.max_seq`,
    now, issueId, issueId, issueId, issueId, issueId,
  );
  if (!r) throw new Error('gate snapshot returned no row');
  const record = (x) => (x ? JSON.parse(x) : null);
  return {
    item: r.w_issue_id ? { issue_id: r.w_issue_id, project_key: r.w_project_key, state: r.w_state, outcome: r.w_outcome, screening_id: r.w_screening_id, screened_fp: r.w_screened_fp } : null,
    latest: pickDecision(r, 'd'),
    latestHuman: pickDecision(r, 'h'),
    latestRecord: record(r.cd_record),
    humanRecord: record(r.ch_record),
    mode: r.g_mode ?? null,
    modeSeq: r.g_seq === null || r.g_seq === undefined ? 0 : Number(r.g_seq),
    // M5: a restore that stopped part-way, or one being verified right now, closes the gate.
    restore: r.r_outcome === 'failed_partial' ? 'incomplete' : Number(r.r_open ?? 0) > 0 ? 'in_progress' : null,
  };
}

/** Lightweight dependency probe for the health check (all gate tables reachable). */
export const gateTablesReachable = () => one('SELECT (SELECT COUNT(*) FROM settings_events) AS s, (SELECT COUNT(*) FROM gate_events WHERE at > 0 LIMIT 1) AS g, (SELECT COUNT(*) FROM chain) AS c');

// ---- M5 RECORD & RECOVERY ------------------------------------------------------------------------
const parseKey = (r) => r && { kid: r.kid, alg: r.alg, publicKey: r.public_key, registeredAt: r.registered_at, selfSig: r.self_sig };
const parseSuccession = (r) => r && { fromKid: r.from_kid, toKid: r.to_kid, at: r.at, toSig: r.to_sig, fromSig: r.from_sig ?? null };
const parseCheckpoint = (r) => r && { siteId: null, seq: Number(r.seq), hash: r.hash, kid: r.kid, at: r.at, purpose: r.purpose, sig: r.sig };

export const recordKeys = {
  all: async () => (await many('SELECT kid, alg, public_key, registered_at, self_sig FROM record_keys ORDER BY registered_at ASC')).map(parseKey),
  async insert(k) {
    const r = await run('INSERT IGNORE INTO record_keys (kid, alg, public_key, registered_at, self_sig) VALUES (?, ?, ?, ?, ?)', k.kid, k.alg, k.publicKey, k.registeredAt, k.selfSig);
    return affected(r) === 1;
  },
};

export const keySuccessions = {
  all: async () => (await many('SELECT from_kid, to_kid, at, to_sig, from_sig FROM key_successions')).map(parseSuccession),
  async insert(s) {
    const r = await run('INSERT IGNORE INTO key_successions (from_kid, to_kid, at, to_sig, from_sig) VALUES (?, ?, ?, ?, ?)', s.fromKid, s.toKid, s.at, s.toSig, s.fromSig ?? null);
    return affected(r) === 1;
  },
};

/** Trust material for the gate: registry + successions in one statement. */
export async function trustMaterial() {
  const rows = await many(
    `SELECT 'k' AS t, kid AS a, alg AS b, public_key AS c, registered_at AS d, self_sig AS e, NULL AS f FROM record_keys
     UNION ALL SELECT 's' AS t, from_kid, to_kid, at, to_sig, from_sig, NULL FROM key_successions`,
  );
  return {
    registry: rows.filter((r) => r.t === 'k').map((r) => ({ kid: r.a, alg: r.b, publicKey: r.c, registeredAt: r.d, selfSig: r.e })),
    successions: rows.filter((r) => r.t === 's').map((r) => ({ fromKid: r.a, toKid: r.b, at: r.c, toSig: r.d, fromSig: r.e ?? null })),
  };
}

export const checkpoints = {
  all: async () => (await many('SELECT seq, hash, kid, at, purpose, sig FROM checkpoints ORDER BY seq ASC, id ASC')).map(parseCheckpoint),
  async insert(c) {
    const r = await run('INSERT IGNORE INTO checkpoints (seq, hash, kid, at, purpose, sig) VALUES (?, ?, ?, ?, ?, ?)', c.seq, c.hash, c.kid, c.at, c.purpose, c.sig);
    return affected(r) === 1;
  },
};

export const ledgerEvents = {
  async insert(e) {
    await run('INSERT INTO ledger_events (at, type, actor, outcome, head_seq, digest, summary) VALUES (?, ?, ?, ?, ?, ?, ?)', e.at, e.type, e.actor ?? null, e.outcome, e.headSeq ?? null, e.digest ?? null, e.summary ? JSON.stringify(e.summary) : null);
  },
  latest: async (type) => {
    const r = await one('SELECT id, at, type, actor, outcome, head_seq, digest, summary FROM ledger_events WHERE type = ? ORDER BY at DESC, id DESC LIMIT 1', type);
    return r && { ...r, at: Number(r.at), head_seq: r.head_seq === null ? null : Number(r.head_seq), summary: r.summary ? JSON.parse(r.summary) : null };
  },
  recent: async (limit = 10) => (await many(`SELECT id, at, type, actor, outcome, head_seq, digest, summary FROM ledger_events ORDER BY at DESC, id DESC LIMIT ${Number(limit) | 0}`)).map((r) => ({ ...r, at: Number(r.at), head_seq: r.head_seq === null ? null : Number(r.head_seq), summary: r.summary ? JSON.parse(r.summary) : null })),
};

export const recoverySessions = {
  async insert(s) {
    await run('INSERT INTO recovery_sessions (token_hash, actor, digest, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', s.tokenHash, s.actor, s.digest, s.createdAt, s.expiresAt);
  },
  /** Atomically consume a session: succeeds once, for the same actor, before expiry. */
  async consume({ tokenHash, actor, now }) {
    const r = await run('UPDATE recovery_sessions SET used_at = ? WHERE token_hash = ? AND actor = ? AND used_at IS NULL AND expires_at > ?', now, tokenHash, actor, now);
    if (affected(r) !== 1) return null;
    return one('SELECT token_hash, actor, digest, created_at, expires_at, used_at FROM recovery_sessions WHERE token_hash = ?', tokenHash);
  },
  /** Invalidate all open sessions (a new verification supersedes older ones). */
  expireAll: (now) => run('UPDATE recovery_sessions SET expires_at = ? WHERE used_at IS NULL AND expires_at > ?', now, now),
  active: (now) => one('SELECT COUNT(*) AS n FROM recovery_sessions WHERE used_at IS NULL AND expires_at > ?', now).then((r) => Number(r?.n ?? 0) > 0),
};

/** Counts that decide whether the decision store is empty (restore is only allowed into an empty store). */
export const storeCounts = () => one('SELECT (SELECT COUNT(*) FROM decisions) AS decisions, (SELECT COUNT(*) FROM chain) AS chain, (SELECT COUNT(*) FROM assignments) AS assignments');

/** Full export reads (ordered). */
export const exportReads = {
  chain: async () => (await many('SELECT seq, record FROM chain ORDER BY seq ASC')).map((r) => JSON.parse(r.record)),
  decisions: async () => (await many('SELECT * FROM decisions ORDER BY issue_id ASC, seq ASC')).map(parseDecision),
  assignments: async () => (await many('SELECT * FROM assignments ORDER BY issue_id ASC, seq ASC')).map(parseAssignment),
  settings: async () => many('SELECT setting, seq, value, changed_by, changed_at, request_id, note FROM settings_events ORDER BY setting ASC, seq ASC'),
};

/** Restore writes (each INSERT IGNORE: idempotent and resumable). Returns true when inserted. */
export const restoreWrites = {
  async chain(record) {
    const r = await run('INSERT IGNORE INTO chain (seq, decision_id, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?)', record.seq, record.decisionId, JSON.stringify(record), record.hash, Date.parse(record.decidedAt) || 0);
    return affected(r) === 1;
  },
  async decision(d) {
    const r = await run(
      `INSERT IGNORE INTO decisions (issue_id, seq, decision_id, request_id, kind, decision, rationale, conditions, questions, decided_by, decided_at, screening_id, fp, pipeline_version, outcome, signal_set, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.issue_id, d.seq, d.decision_id, d.request_id, d.kind, d.decision, d.rationale ?? null, JSON.stringify(d.conditions ?? []), JSON.stringify(d.questions ?? []),
      d.decided_by ?? null, d.decided_at, d.screening_id, d.fp, d.pipeline_version, d.outcome ?? null, JSON.stringify(d.signal_set ?? {}), d.detail ? JSON.stringify(d.detail) : null,
    );
    return affected(r) === 1;
  },
  async assignment(a) {
    const r = await run('INSERT IGNORE INTO assignments (issue_id, seq, assignee, assigned_by, assigned_at, request_id) VALUES (?, ?, ?, ?, ?, ?)', a.issue_id, a.seq, a.assignee ?? null, a.assigned_by, a.assigned_at, a.request_id);
    return affected(r) === 1;
  },
  async setting(s) {
    const r = await run('INSERT IGNORE INTO settings_events (setting, seq, value, changed_by, changed_at, request_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)', s.setting, s.seq, s.value, s.changed_by, s.changed_at, s.request_id, s.note ?? null);
    return affected(r) === 1;
  },
};

/** Retention: delete gate events older than `before` (bounded batch). */
export const purgeGateEvents = async (before, limit = 1000) => affected(await run(`DELETE FROM gate_events WHERE at < ? LIMIT ${Number(limit) | 0}`, before));

export const transfers = {
  async put({ transferId, idx, kind, actor, data, createdAt }) {
    const r = await run('INSERT IGNORE INTO transfer_chunks (transfer_id, idx, kind, actor, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', transferId, idx, kind, actor, data, createdAt);
    return affected(r) === 1;
  },
  get: (transferId, idx) => one('SELECT transfer_id, idx, kind, actor, data, created_at FROM transfer_chunks WHERE transfer_id = ? AND idx = ?', transferId, idx),
  meta: (transferId) => one('SELECT COUNT(*) AS n, MIN(actor) AS actor, MAX(actor) AS actor2, MIN(kind) AS kind, MIN(created_at) AS created_at FROM transfer_chunks WHERE transfer_id = ?', transferId),
  all: async (transferId) => many('SELECT idx, data FROM transfer_chunks WHERE transfer_id = ? ORDER BY idx ASC', transferId),
  purge: async (before) => affected(await run('DELETE FROM transfer_chunks WHERE created_at < ? LIMIT 2000', before)),
};

/** The public register: decisions newest first with their anchor (record version and key id). */
export const registerRows = async (limit = 500) =>
  (await many(
    `SELECT d.issue_id, d.seq, d.kind, d.decision, d.decided_by, d.decided_at, d.fp, d.outcome, d.decision_id, c.seq AS chain_seq, c.record AS chain_record
     FROM decisions d LEFT JOIN chain c ON c.decision_id = d.decision_id
     ORDER BY d.decided_at DESC, d.issue_id ASC, d.seq DESC LIMIT ${Number(limit) | 0}`,
  )).map((r) => {
    const rec = r.chain_record ? JSON.parse(r.chain_record) : null;
    return { issue_id: String(r.issue_id), seq: Number(r.seq), kind: r.kind, decision: r.decision, decided_by: r.decided_by, decided_at: Number(r.decided_at), fp: r.fp, outcome: r.outcome, decision_id: r.decision_id, chainSeq: r.chain_seq === null ? null : Number(r.chain_seq), recordVersion: rec?.v ?? null, kid: rec?.kid ?? null };
  });
