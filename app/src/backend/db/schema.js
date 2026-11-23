// Forge SQL schema for M2. Idempotent DDL only (CREATE ... IF NOT EXISTS), never destructive, as the
// Forge SQL guidance recommends. Timestamps are epoch milliseconds (BIGINT) to avoid time-zone drift.
// No raw Jira text is stored: screenings keep findings with offsets and short redacted excerpts.
import { migrationRunner } from '@forge/sql';

export const MIGRATIONS = [
  [
    'v001_work_items',
    `CREATE TABLE IF NOT EXISTS work_items (
      issue_id VARCHAR(20) PRIMARY KEY,
      issue_key VARCHAR(120) NOT NULL,
      project_key VARCHAR(100) NOT NULL,
      state VARCHAR(24) NOT NULL,
      outcome VARCHAR(24) NULL,
      screening_id CHAR(64) NULL,
      screened_fp CHAR(64) NULL,
      request_seq INT NOT NULL DEFAULT 0,
      processed_seq INT NOT NULL DEFAULT 0,
      lease_token VARCHAR(40) NULL,
      lease_until BIGINT NULL,
      attempts INT NOT NULL DEFAULT 0,
      last_error VARCHAR(40) NULL,
      last_event_at BIGINT NULL,
      manual_request_at BIGINT NULL,
      version INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_work_items_state (state, updated_at)
    )`,
  ],
  [
    'v002_screenings',
    `CREATE TABLE IF NOT EXISTS screenings (
      screening_id CHAR(64) PRIMARY KEY,
      issue_id VARCHAR(20) NOT NULL,
      fp CHAR(64) NOT NULL,
      pipeline_version VARCHAR(60) NOT NULL,
      mode VARCHAR(8) NOT NULL,
      model VARCHAR(60) NULL,
      outcome VARCHAR(24) NOT NULL,
      result MEDIUMTEXT NOT NULL,
      quality MEDIUMTEXT NOT NULL,
      ai_status VARCHAR(40) NULL,
      tokens_in INT NULL,
      tokens_out INT NULL,
      model_ms INT NULL,
      total_ms INT NULL,
      queue_ms INT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_screenings_issue (issue_id, created_at)
    )`,
  ],
  [
    'v003_usage_daily',
    `CREATE TABLE IF NOT EXISTS usage_daily (
      day CHAR(10) PRIMARY KEY,
      llm_calls INT NOT NULL DEFAULT 0,
      fallbacks INT NOT NULL DEFAULT 0,
      screenings INT NOT NULL DEFAULT 0,
      tokens_in BIGINT NOT NULL DEFAULT 0,
      tokens_out BIGINT NOT NULL DEFAULT 0
    )`,
  ],
  [
    'v004_ai_spend',
    `CREATE TABLE IF NOT EXISTS ai_spend (
      scope VARCHAR(16) PRIMARY KEY,
      micros BIGINT NOT NULL DEFAULT 0,
      calls INT NOT NULL DEFAULT 0
    )`,
  ],
];

/** Apply pending migrations. Called only from the migration queue consumer (never per request). */
export async function applyMigrations() {
  let runner = migrationRunner;
  for (const [name, ddl] of MIGRATIONS) runner = runner.enqueue(name, ddl);
  return runner.run(); // returns the names applied in this run (verified in the Stage 1.5 spike)
}
