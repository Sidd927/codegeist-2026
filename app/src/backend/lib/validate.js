import { AppError, ErrorCode } from './errors.js';

// Jira issue keys: project key (uppercase letter followed by letters, digits or underscores) + '-' + number.
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,99}-[1-9]\d{0,9}$/;
const ISSUE_ID = /^\d{1,18}$/;
const INBOX_VIEWS = new Set(['pending', 'stale', 'needs-info', 'all-open']);

export function issueKey(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (!ISSUE_KEY.test(v)) throw new AppError(ErrorCode.INVALID_INPUT, 'That is not a valid work item key.');
  return v;
}

export function issueId(value) {
  const v = String(value ?? '');
  if (!ISSUE_ID.test(v)) throw new AppError(ErrorCode.INVALID_INPUT);
  return v;
}

export function inboxView(value) {
  const v = String(value ?? 'pending');
  if (!INBOX_VIEWS.has(v)) throw new AppError(ErrorCode.INVALID_INPUT);
  return v;
}

/** Client metrics: fixed names, finite non-negative numbers only. Nothing else is accepted. */
const METRICS = new Set(['firstContentMs', 'invokeMs', 'domContentLoadedMs']);
const SURFACES = new Set(['panel', 'desk']);
export function clientMetrics(payload) {
  const surface = String(payload?.surface ?? '');
  if (!SURFACES.has(surface)) throw new AppError(ErrorCode.INVALID_INPUT);
  const metrics = {};
  for (const [k, v] of Object.entries(payload?.metrics ?? {})) {
    if (METRICS.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 120000) metrics[k] = v;
  }
  return { surface, metrics };
}
