// Forge entry points. Resolvers are thin: build per-invocation dependencies from the Forge context,
// call a service, return a structured envelope. Identity and environment come only from `context`.
import Resolver from '@forge/resolver';
import { createJiraAdapter } from './backend/adapters/jira.js';
import { createDeskServices } from './backend/services/desk.js';
import * as repos from './backend/repositories/sql-repositories.js';
import { buildScreening, requestMigration } from './backend/handlers/events.js';
import { configFor, settingsFromEnv } from './backend/lib/config.js';
import { log } from './backend/lib/logger.js';
import { ok, toEnvelope, AppError, ErrorCode } from './backend/lib/errors.js';
import * as validate from './backend/lib/validate.js';

export { onIssueEvent, onLifecycle, screeningConsumer, maintenanceConsumer, reconcileSchedule } from './backend/handlers/events.js';

const resolver = new Resolver();

function servicesFor(context) {
  const config = configFor(context?.environmentType);
  const jira = createJiraAdapter({ timeoutMs: config.upstreamTimeoutMs });
  const settings = settingsFromEnv();
  const screening = buildScreening(context?.environmentType);
  return { config, jira, services: createDeskServices({ jira, config, log, repos, screening, settings }) };
}

function define(key, fn) {
  resolver.define(key, async ({ payload, context }) => {
    const t0 = Date.now();
    const deps = servicesFor(context);
    try {
      const data = await fn({ payload: payload ?? {}, context, ...deps });
      log.info({ evt: 'resolver.ok', resolver: key, ms: Date.now() - t0, env: deps.config.name });
      return ok(data);
    } catch (e) {
      const envelope = toEnvelope(e);
      log[envelope.error.code === 'INTERNAL' ? 'error' : 'warn']({ evt: 'resolver.failed', resolver: key, code: envelope.error.code, status: e?.status, ms: Date.now() - t0, env: deps.config.name });
      return envelope;
    }
  });
}

define('getAppContext', ({ services }) => services.appContext());
define('getPanelState', ({ services, context }) => services.panelState(context?.extension?.issue));
define('getWorkspace', ({ services, payload }) => services.workspace(payload.issueKey));
define('getInbox', ({ services, payload }) => services.inbox(payload.view));
define('getSettingsOverview', ({ services }) => services.settingsOverview());
// Panel: the issue comes from the Forge context. Desk: a validated key; access is checked as the user.
define('requestRescreen', ({ services, context, payload }) => services.requestRescreen({ extensionIssue: context?.extension?.issue, issueKey: payload.issueKey }));

// Admin only: apply the database schema through the maintenance queue (idempotent DDL).
define('applySchema', async ({ jira }) => {
  if (!(await jira.isJiraAdmin().catch(() => false))) throw new AppError(ErrorCode.NOT_AUTHORISED, 'Only Jira administrators can do this.');
  await requestMigration();
  return { queued: true };
});

// Content-free client performance telemetry: fixed metric names and numbers only.
define('reportClientMetrics', ({ payload, config }) => {
  const { surface, metrics } = validate.clientMetrics(payload);
  for (const [metric, value] of Object.entries(metrics)) log.info({ evt: 'client.metric', surface, metric, value, env: config.name });
  return { recorded: Object.keys(metrics).length };
});

export const handler = resolver.getDefinitions();
