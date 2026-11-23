// Forge resolver entry point. Thin layer: build per-invocation dependencies from the Forge context,
// call a service, and return a structured envelope. Identity and environment come only from
// `context`, never from the client payload.
import Resolver from '@forge/resolver';
import { createJiraAdapter } from './backend/adapters/jira.js';
import { createDeskServices } from './backend/services/desk.js';
import { configFor } from './backend/lib/config.js';
import { log } from './backend/lib/logger.js';
import { ok, toEnvelope } from './backend/lib/errors.js';
import * as validate from './backend/lib/validate.js';

const resolver = new Resolver();

function servicesFor(context) {
  const config = configFor(context?.environmentType);
  return { config, services: createDeskServices({ jira: createJiraAdapter({ timeoutMs: config.upstreamTimeoutMs }), config, log }) };
}

function define(key, fn) {
  resolver.define(key, async ({ payload, context }) => {
    const t0 = Date.now();
    const { config, services } = servicesFor(context);
    try {
      const data = await fn({ payload: payload ?? {}, context, services, config });
      log.info({ evt: 'resolver.ok', resolver: key, ms: Date.now() - t0, env: config.name });
      return ok(data);
    } catch (e) {
      const envelope = toEnvelope(e);
      log[envelope.error.code === 'INTERNAL' ? 'error' : 'warn']({ evt: 'resolver.failed', resolver: key, code: envelope.error.code, status: e?.status, ms: Date.now() - t0, env: config.name });
      return envelope;
    }
  });
}

define('getAppContext', ({ services }) => services.appContext());
define('getPanelState', ({ services, context }) => services.panelState(context?.extension?.issue));
define('getWorkspace', ({ services, payload }) => services.workspace(payload.issueKey));
define('getInbox', ({ services, payload }) => services.inbox(payload.view));
define('getSettingsOverview', ({ services }) => services.settingsOverview());

// Content-free client performance telemetry: fixed metric names and numbers only.
define('reportClientMetrics', ({ payload, config }) => {
  const { surface, metrics } = validate.clientMetrics(payload);
  for (const [metric, value] of Object.entries(metrics)) log.info({ evt: 'client.metric', surface, metric, value, env: config.name });
  return { recorded: Object.keys(metrics).length };
});

export const handler = resolver.getDefinitions();
