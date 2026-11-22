import { AppError, ErrorCode } from './errors.js';

// Jira issue keys: project key (uppercase letter followed by letters, digits or underscores) + '-' + number.
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,99}-[1-9]\d{0,9}$/;
const ISSUE_ID = /^\d{1,18}$/;
const INBOX_VIEWS = new Set(['attention', 'awaiting', 'changed', 'needs-info', 'decided', 'all']);
const SEVERITIES = new Set(['any', 'DPIA_LIKELY', 'REVIEW_REQUIRED', 'NEEDS_INFO', 'INVENTORY_UPDATE', 'CLEAR']);
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,99}$/;
const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const HEX64 = /^[0-9a-f]{64}$/;

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
  const v = String(value ?? 'attention');
  if (!INBOX_VIEWS.has(v)) throw new AppError(ErrorCode.INVALID_INPUT);
  return v;
}

/** Inbox filters: every value is from a fixed set or a strict pattern; anything else is rejected. */
export function inboxFilters(raw = {}) {
  const view = inboxView(raw.view);
  const severity = String(raw.severity ?? 'any');
  if (!SEVERITIES.has(severity)) throw new AppError(ErrorCode.INVALID_INPUT);
  const project = String(raw.project ?? 'any');
  if (project !== 'any' && !PROJECT_KEY.test(project)) throw new AppError(ErrorCode.INVALID_INPUT);
  const assignee = String(raw.assignee ?? 'any');
  if (!['any', 'me', 'unassigned'].includes(assignee) && !ACCOUNT_ID.test(assignee)) throw new AppError(ErrorCode.INVALID_INPUT);
  const page = Number(raw.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new AppError(ErrorCode.INVALID_INPUT);
  return { view, severity: severity === 'any' ? null : severity, project: project === 'any' ? null : project, assignee, page };
}

export function hex64(value) {
  const v = String(value ?? '');
  if (!HEX64.test(v)) throw new AppError(ErrorCode.STALE_EVIDENCE);
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

/** Name search for the reviewer picker: 2–50 characters of plain text. */
export function personQuery(value) {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (v.length < 2 || v.length > 50 || /[<>]/.test(v) || [...v].some((c) => c.charCodeAt(0) < 32)) throw new AppError(ErrorCode.INVALID_INPUT, 'Type at least two characters of a name.');
  return v;
}
