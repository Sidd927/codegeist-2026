// Forge entry point for the jira:workflowValidator lambda (module key: article25-gate).
// Jira passes { issue: { key }, configuration, transition: { from, to, modifiedFields } } and no
// user identity, so the gate reads as the app. The service never throws; this wrapper also
// guarantees a fail-closed answer if construction itself fails.
import { createGateService, environmentIdOf } from '../services/gate.js';
import { createJiraAdapter } from '../adapters/jira.js';
import * as repos from '../repositories/sql-repositories.js';
import { configFor, settingsFromEnv } from '../lib/config.js';
import { log } from '../lib/logger.js';
import { jiraMessage } from '../../core/gate.js';
import { siteIdOf, requestMigration, buildLedger } from './events.js';

const shapeOf = (o) => (o && typeof o === 'object' ? Object.keys(o).sort().join('.').slice(0, 64) : typeof o);

export function buildGate(context, overrides = {}) {
  const config = configFor(context?.environmentType);
  const siteId = siteIdOf(context, null);
  const settings = settingsFromEnv();
  return createGateService({
    repos,
    jira: createJiraAdapter({ timeoutMs: Math.min(config.upstreamTimeoutMs, 5000) }),
    log,
    settings,
    siteId,
    ledger: buildLedger(siteId),
    appId: 'a2030a0d-5fd0-4ace-8ff5-7cdbfdba0cd1',
    environmentId: environmentIdOf(context),
    ...overrides,
  });
}

export async function gateValidator(payload, context) {
  try {
    // Content-free discovery of the (partly undocumented) invocation shape: key names only.
    log.info({ evt: 'gate.invoked', shape: shapeOf(payload), reason: shapeOf(context) });
    const gate = buildGate(context);
    const { outcome, reason } = await gate.validateDetailed(payload);
    if (reason === 'SYSTEM_UNAVAILABLE') requestMigration().catch(() => undefined); // self-heal if the schema is behind (idempotent)
    return outcome;
  } catch (e) {
    log.error({ evt: 'gate.fatal', code: e?.code ?? 'INTERNAL', errName: e?.name });
    return { result: false, errorMessage: jiraMessage('SYSTEM_UNAVAILABLE') };
  }
}
