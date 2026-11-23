// Forge entry points. Resolvers are thin: build per-invocation dependencies from the Forge context,
// call a service, return a structured envelope. Identity and environment come only from `context`.
import Resolver from '@forge/resolver';
import { createJiraAdapter } from './backend/adapters/jira.js';
import { createDeskServices } from './backend/services/desk.js';
import * as repos from './backend/repositories/sql-repositories.js';
import { buildScreening, buildReview, requestMigration } from './backend/handlers/events.js';
import { buildGate } from './backend/handlers/gate.js';
import { configFor, settingsFromEnv } from './backend/lib/config.js';
import { log, errorFacts } from './backend/lib/logger.js';
import { ok, toEnvelope, AppError, ErrorCode } from './backend/lib/errors.js';
import * as validate from './backend/lib/validate.js';

export { onIssueEvent, onLifecycle, screeningConsumer, maintenanceConsumer, reconcileSchedule } from './backend/handlers/events.js';
export { gateValidator } from './backend/handlers/gate.js';

const resolver = new Resolver();

function servicesFor(context) {
  const config = configFor(context?.environmentType);
  const jira = createJiraAdapter({ timeoutMs: config.upstreamTimeoutMs });
  const settings = settingsFromEnv();
  const siteId = context?.cloudId ? String(context.cloudId) : null;
  const screening = buildScreening(context?.environmentType, siteId);
  const review = buildReview(context?.environmentType, siteId);
  const gate = buildGate(context);
  return { config, jira, services: createDeskServices({ jira, config, log, repos, screening, settings: { ...settings, signingKey: siteId ? settings.signingKey : null }, review, gate }) };
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
      log[envelope.error.code === 'INTERNAL' ? 'error' : 'warn']({ evt: 'resolver.failed', resolver: key, code: envelope.error.code, status: e?.status, ...(envelope.error.code === 'INTERNAL' ? errorFacts(e) : {}), ms: Date.now() - t0, env: deps.config.name });
      return envelope;
    }
  });
}

// The acting user ALWAYS comes from the Forge context, never from the payload.
const actor = (context) => (context?.accountId ? String(context.accountId) : null);
define('getAppContext', ({ services, context }) => services.appContext(actor(context)));
define('getPanelState', ({ services, context }) => services.panelState(context?.extension?.issue, actor(context)));
define('getWorkspace', ({ services, payload, context }) => services.workspace(payload.issueKey, actor(context)));
define('getInbox', ({ services, payload, context }) => services.inbox(payload, actor(context)));
define('getSettingsOverview', ({ services, context }) => services.settingsOverview(actor(context)));
define('getReviewers', ({ services, payload, context }) => services.reviewers(payload.query, actor(context)));
define('assignReview', ({ services, payload, context }) => services.assign(payload, actor(context)));
define('recordDecision', ({ services, payload, context }) => services.decide(payload, actor(context)));
define('verifyRecord', ({ services, payload, context }) => services.verifyRecord(payload.issueKey, actor(context)));
// M4: workflow gate administration (Jira administrators only, checked server-side).
define('getGateOverview', ({ services }) => services.gateOverview());
define('setGateMode', ({ services, payload, context }) => services.setGateMode(payload, actor(context)));
define('setSeparationOfDuties', ({ services, payload, context }) => services.setSeparationOfDuties(payload, actor(context)));
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
