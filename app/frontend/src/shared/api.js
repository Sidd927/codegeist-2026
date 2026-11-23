// Typed wrappers around Forge `invoke`. Every resolver returns { ok, data } | { ok: false, error }.
// The frontend renders results; it never makes authoritative decisions.
import { invoke } from '@forge/bridge';

export class ClientError extends Error {
  constructor({ code = 'INTERNAL', message = 'Something went wrong in Article25. Try again.', retryable = true, fields = null } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.fields = fields && typeof fields === 'object' ? fields : null;
  }
}

let lastInvokeMs = null;
export const getLastInvokeMs = () => lastInvokeMs;

export async function call(key, payload) {
  const t0 = performance.now();
  let res;
  try {
    res = await invoke(key, payload);
  } catch {
    throw new ClientError({ code: 'UPSTREAM_UNAVAILABLE', message: "Couldn't reach Article25. Check your connection and try again.", retryable: true });
  } finally {
    lastInvokeMs = Math.round(performance.now() - t0);
  }
  if (!res || typeof res !== 'object') throw new ClientError();
  if (res.ok) return res.data;
  throw new ClientError(res.error);
}

export const api = {
  appContext: () => call('getAppContext'),
  panelState: () => call('getPanelState'),
  workspace: (issueKey) => call('getWorkspace', { issueKey }),
  inbox: (filters) => call('getInbox', filters),
  reviewers: (query) => call('getReviewers', { query }),
  assign: (payload) => call('assignReview', payload),
  decide: (payload) => call('recordDecision', payload),
  verifyRecord: (issueKey) => call('verifyRecord', { issueKey }),
  gateOverview: () => call('getGateOverview'),
  setupStatus: () => call('getSetupStatus'),
  setGateMode: (payload) => call('setGateMode', payload),
  setSeparationOfDuties: (payload) => call('setSeparationOfDuties', payload),
  recordStatus: () => call('getRecordStatus'),
  verifyLedger: () => call('verifyLedger'),
  exportArchive: () => call('exportArchive'),
  transferChunk: (payload) => call('getTransferChunk', payload),
  uploadArchiveChunk: (payload) => call('uploadArchiveChunk', payload),
  beginRestore: (payload) => call('beginRestore', payload),
  confirmRestore: (payload) => call('confirmRestore', payload),
  adoptPreviousKey: (payload) => call('adoptPreviousKey', payload),
  decisionRecord: (payload) => call('getDecisionRecord', payload),
  register: (filters) => call('getRegister', filters),
  settingsOverview: () => call('getSettingsOverview'),
  rescreen: (issueKey) => call('requestRescreen', issueKey ? { issueKey } : {}),
  applySchema: () => call('applySchema'),
  reportMetrics: (surface, metrics) => call('reportClientMetrics', { surface, metrics }).catch(() => undefined),
};

/** Idempotency key for one user action (retries and double clicks reuse it). */
export function newRequestId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 32 hex characters for a transfer id (uploads are chunked: requests are limited to 500 KB). */
export function newTransferId() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
