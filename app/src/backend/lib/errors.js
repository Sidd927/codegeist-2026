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
  INTERNAL: 'Something went wrong in Article25. Try again.',
};

const RETRYABLE = new Set([ErrorCode.UPSTREAM_UNAVAILABLE, ErrorCode.INTERNAL]);

export class AppError extends Error {
  constructor(code, message) {
    super(message ?? DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.INTERNAL);
    this.code = ErrorCode[code] ? code : ErrorCode.INTERNAL;
  }
}

export const ok = (data) => ({ ok: true, data });

export function toEnvelope(err) {
  const code = err instanceof AppError ? err.code : ErrorCode.INTERNAL;
  const message = err instanceof AppError ? err.message : DEFAULT_MESSAGES.INTERNAL;
  // Field-level validation codes (e.g. { rationale: 'rationale_too_short' }) are returned for forms.
  const fields = err instanceof AppError && err.fields && typeof err.fields === 'object' ? Object.fromEntries(Object.entries(err.fields).filter(([k, v]) => /^[a-z]{1,20}$/.test(k) && /^[a-z_]{1,40}$/.test(String(v)))) : undefined;
  return { ok: false, error: { code, message, retryable: RETRYABLE.has(code), ...(fields ? { fields } : {}) } };
}
