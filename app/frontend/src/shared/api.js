// Typed wrappers around Forge `invoke`. Every resolver returns { ok, data } | { ok: false, error }.
// The frontend renders results; it never makes authoritative decisions.
import { invoke } from '@forge/bridge';

export class ClientError extends Error {
  constructor({ code = 'INTERNAL', message = 'Something went wrong in Article25. Try again.', retryable = true } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
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
  inbox: (view) => call('getInbox', { view }),
  settingsOverview: () => call('getSettingsOverview'),
  rescreen: (issueKey) => call('requestRescreen', issueKey ? { issueKey } : {}),
  applySchema: () => call('applySchema'),
  reportMetrics: (surface, metrics) => call('reportClientMetrics', { surface, metrics }).catch(() => undefined),
};
