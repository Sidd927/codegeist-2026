// Content-free structured logger (NFR-3, DATA_AND_SECURITY_MODEL §4).
// Forge logs are visible to the developer by default, so only allow-listed fields are ever written.
// Work-item text, quotes, conditions, account IDs and emails must never reach this module.

const ALLOWED_FIELDS = new Set([
  'evt', // event name, e.g. 'resolver.ok'
  'resolver', // resolver key
  'code', // error code from errors.js
  'ms', // duration in milliseconds
  'status', // upstream HTTP status
  'surface', // 'panel' | 'desk'
  'route', // desk route pattern (never the concrete issue key)
  'env', // environment type
  'metric', // client metric name
  'value', // numeric metric value
  'issueId', // numeric Jira issue id (not personal data, not content)
  'count',
  'outcome', // screening outcome code
  'mode', // 'ai' | 'rules'
  'reason', // job reason code
  'shape', // structural key names only (e.g. changelog item keys), never values
  'dbMs', // time spent in SQL statements
  'jiraMs', // time spent reading Jira
  'modelMs', // time spent in the LLM call
  'queueMs', // enqueue → processing start
  'rejected', // count of model quotes rejected by verification
  'dropped', // count of model items dropped by schema validation
  'sensitive', // 1 if a sensitive-data finding exists (code-level metric, no content)
  'tokensIn',
  'tokensOut',
  'costMicros', // AI cost of this call in micro-USD
  'aiStatus', // ok | not_enabled | over_budget | unavailable | malformed_output
]);

const NUMERIC_FIELDS = new Set(['ms', 'status', 'value', 'count', 'dbMs', 'jiraMs', 'modelMs', 'queueMs', 'rejected', 'dropped', 'sensitive', 'tokensIn', 'tokensOut', 'costMicros']);
const SAFE_STRING = /^[A-Za-z0-9_.:\-/]{1,64}$/;

/** Keep only allow-listed fields with safe primitive values. Exported for tests. */
export function sanitise(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (NUMERIC_FIELDS.has(k)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
      continue;
    }
    if (k === 'issueId') {
      if (/^\d{1,18}$/.test(String(v))) out[k] = String(v);
      continue;
    }
    if (typeof v === 'string' && SAFE_STRING.test(v)) out[k] = v;
  }
  return out;
}

function write(level, fields) {
  const line = JSON.stringify({ level, ...sanitise(fields) });
  // eslint-disable-next-line no-console -- the only sanctioned console use in the app
  (level === 'error' ? console.error : console.log)(line);
}

export const log = {
  info: (fields) => write('info', fields),
  warn: (fields) => write('warn', fields),
  error: (fields) => write('error', fields),
};
