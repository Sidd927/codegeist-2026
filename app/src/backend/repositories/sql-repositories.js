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
