// Stage 1.5 / C2: atomic storage on Forge SQL.
// - decisions: append-only, decision_id PRIMARY KEY -> duplicates rejected by the database (idempotency).
// - review_state: one row per work item, optimistic concurrency via version column.
// - counters: atomic increments.
import sql, { migrationRunner } from '@forge/sql';

// IMPORTANT (Stage 1.5 finding): migrationRunner uses the DDL API, limited to 25 requests/min per installation.
// Never call it on the request path. It runs from install/upgrade triggers and an explicit admin action only.
export async function ensureSchema() {
  const applied = await migrationRunner
    .enqueue('v001_decisions', `CREATE TABLE IF NOT EXISTS decisions (
        decision_id VARCHAR(191) PRIMARY KEY,
        issue_key VARCHAR(64) NOT NULL,
        state VARCHAR(32) NOT NULL,
        conditions TEXT,
        decided_by VARCHAR(128) NOT NULL,
        decided_at VARCHAR(40) NOT NULL,
        signature VARCHAR(128),
        source VARCHAR(32) NOT NULL DEFAULT 'live'
      )`)
    .enqueue('v002_review_state', `CREATE TABLE IF NOT EXISTS review_state (
        issue_key VARCHAR(64) PRIMARY KEY,
        state VARCHAR(32) NOT NULL,
        decision_id VARCHAR(191) NOT NULL,
        decided_by VARCHAR(128) NOT NULL,
        decided_at VARCHAR(40) NOT NULL,
        version INT NOT NULL
      )`)
    .enqueue('v003_counters', `CREATE TABLE IF NOT EXISTS counters (name VARCHAR(64) PRIMARY KEY, value DOUBLE NOT NULL)`)
    .enqueue('v004_chain', `CREATE TABLE IF NOT EXISTS chain (
        seq INT PRIMARY KEY,
        decision_id VARCHAR(191) NOT NULL UNIQUE,
        issue_key VARCHAR(64) NOT NULL,
        record TEXT NOT NULL,
        record_hash VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`)
    .enqueue('v005_audit', `CREATE TABLE IF NOT EXISTS audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        at VARCHAR(40) NOT NULL, actor VARCHAR(128) NOT NULL, action VARCHAR(64) NOT NULL, result VARCHAR(32) NOT NULL, detail TEXT
      )`)
    .run();
  return { applied };
}

const affected = (r) => r?.rows?.affectedRows ?? 0;

// Returns { inserted: bool, reviewVersion, retries }.
export async function recordDecision(d) {
  const ins = await sql
    .prepare('INSERT IGNORE INTO decisions (decision_id, issue_key, state, conditions, decided_by, decided_at, signature, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bindParams(d.decisionId, d.issueKey, d.state, JSON.stringify(d.conditions ?? []), d.decidedBy, d.decidedAt, d.signature ?? null, d.source ?? 'live')
    .execute();
  if (affected(ins) === 0) return { inserted: false, reason: 'duplicate decisionId (rejected by PRIMARY KEY)' };

  // Optimistic concurrency on review_state. Only move forward in time (decided_at) so late/replayed decisions can't roll state back.
  for (let retries = 0; retries < 8; retries++) {
    const cur = await sql.prepare('SELECT version, decided_at FROM review_state WHERE issue_key = ?').bindParams(d.issueKey).execute();
    const row = cur.rows[0];
    if (!row) {
      const r = await sql
        .prepare('INSERT IGNORE INTO review_state (issue_key, state, decision_id, decided_by, decided_at, version) VALUES (?, ?, ?, ?, ?, 1)')
        .bindParams(d.issueKey, d.state, d.decisionId, d.decidedBy, d.decidedAt)
        .execute();
      if (affected(r) === 1) return { inserted: true, reviewVersion: 1, retries };
      continue; // someone else inserted first; retry as update
    }
    if (row.decided_at > d.decidedAt) return { inserted: true, reviewVersion: row.version, retries, stateUnchanged: 'newer decision already applied' };
    const u = await sql
      .prepare('UPDATE review_state SET state = ?, decision_id = ?, decided_by = ?, decided_at = ?, version = version + 1 WHERE issue_key = ? AND version = ?')
      .bindParams(d.state, d.decisionId, d.decidedBy, d.decidedAt, d.issueKey, row.version)
      .execute();
    if (affected(u) === 1) return { inserted: true, reviewVersion: row.version + 1, retries };
  }
  return { inserted: true, reviewUpdate: 'FAILED after retries' };
}

export async function getReviewState(issueKey) {
  const r = await sql.prepare('SELECT issue_key, state, decision_id, decided_by, decided_at, version FROM review_state WHERE issue_key = ?').bindParams(issueKey).execute();
  return r.rows[0] ?? null;
}

export async function listDecisions(issueKey) {
  const r = issueKey
    ? await sql.prepare('SELECT * FROM decisions WHERE issue_key = ? ORDER BY decided_at').bindParams(issueKey).execute()
    : await sql.executeRaw('SELECT * FROM decisions ORDER BY decided_at');
  return r.rows;
}

export async function increment(name, by) {
  await sql.prepare('INSERT IGNORE INTO counters (name, value) VALUES (?, 0)').bindParams(name).execute();
  await sql.prepare('UPDATE counters SET value = value + ? WHERE name = ?').bindParams(by, name).execute();
  const r = await sql.prepare('SELECT value FROM counters WHERE name = ?').bindParams(name).execute();
  return r.rows[0]?.value;
}

export async function resetTestData(prefix) {
  await sql.prepare('DELETE FROM decisions WHERE issue_key LIKE ?').bindParams(`${prefix}%`).execute();
  await sql.prepare('DELETE FROM review_state WHERE issue_key LIKE ?').bindParams(`${prefix}%`).execute();
  await sql.prepare('DELETE FROM counters WHERE name LIKE ?').bindParams(`${prefix}%`).execute();
}
