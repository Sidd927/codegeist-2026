// Structured error handling (SYSTEM_ARCHITECTURE §9).
// Every resolver returns { ok: true, data } or { ok: false, error: { code, message, retryable } }.
// Messages are user-safe; they never echo upstream bodies or work-item content.

export const ErrorCode = Object.freeze({
  NOT_AUTHORISED: 'NOT_AUTHORISED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  NOT_AVAILABLE_YET: 'NOT_AVAILABLE_YET',
  CONFLICT: 'CONFLICT', // someone else changed the review first (optimistic concurrency)
  STALE_EVIDENCE: 'STALE_EVIDENCE', // the reviewed screening/content is no longer current
  SOD_BLOCKED: 'SOD_BLOCKED', // separation of duties
  NOT_CONFIGURED: 'NOT_CONFIGURED', // a required server-side setting (e.g. signing key) is missing
  SETTING_UP: 'SETTING_UP', // first minutes after install/upgrade: the database schema is being applied
  INTERNAL: 'INTERNAL',
});

const DEFAULT_MESSAGES = {
  NOT_AUTHORISED: "You don't have permission to do this.",
  NOT_FOUND: "This work item doesn't exist or you can't view it.",
  INVALID_INPUT: 'The request was not valid.',
  UPSTREAM_UNAVAILABLE: 'Jira did not respond in time. Try again.',
  NOT_AVAILABLE_YET: 'This part of Article25 is not switched on yet.',
  CONFLICT: 'Someone else updated this review a moment ago. Reload to see the latest state.',
  STALE_EVIDENCE: 'The work item changed since these findings were produced. Re-check it before deciding.',
  SOD_BLOCKED: "You can't decide on a work item you reported or are assigned to.",
  NOT_CONFIGURED: 'Article25 is not fully configured to record decisions. Ask your Jira administrator.',
  SETTING_UP: 'Article25 is finishing its setup on this site. This takes about a minute; try again shortly.',
  INTERNAL: 'Something went wrong in Article25. Try again.',
};

const RETRYABLE = new Set([ErrorCode.UPSTREAM_UNAVAILABLE, ErrorCode.INTERNAL, ErrorCode.SETTING_UP]);

/** A Forge SQL error that means the schema has not been applied yet (fresh install or pending migration). */
// Forge SQL may report only "Unknown SQL execution error" in `message`, with details in `suggestion`
// or `context`; MySQL's ER_NO_SUCH_TABLE is errno 1146.
export const isSchemaMissing = (e) => {
  let ctx = '';
  try {
    ctx = e?.context ? JSON.stringify(e.context) : '';
  } catch {
    ctx = '';
  }
  const text = `${e?.message ?? e ?? ''} ${e?.suggestion ?? ''} ${ctx}`;
  return /doesn'?t exist|no such table|unknown table|\b1146\b/i.test(text);
};
/** Any Forge SQL execution failure: worth queueing the (idempotent, cheap when current) migration. */
export const isSqlExecutionError = (e) => e?.code === 'SQL_EXECUTION_ERROR' || isSchemaMissing(e);

export class AppError extends Error {
  constructor(code, message) {
    super(message ?? DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.INTERNAL);
    this.code = ErrorCode[code] ? code : ErrorCode.INTERNAL;
  }
}

export const ok = (data) => ({ ok: true, data });

export function toEnvelope(err) {
  const code = err instanceof AppError ? err.code : isSchemaMissing(err) ? ErrorCode.SETTING_UP : ErrorCode.INTERNAL;
  const message = err instanceof AppError ? err.message : DEFAULT_MESSAGES[code];
  // Field-level validation codes (e.g. { rationale: 'rationale_too_short' }) are returned for forms.
  const fields = err instanceof AppError && err.fields && typeof err.fields === 'object' ? Object.fromEntries(Object.entries(err.fields).filter(([k, v]) => /^[a-z]{1,20}$/.test(k) && /^[a-z_]{1,40}$/.test(String(v)))) : undefined;
  return { ok: false, error: { code, message, retryable: RETRYABLE.has(code), ...(fields ? { fields } : {}) } };
}
