// Environment-aware configuration. The environment comes from the Forge invocation context
// (context.environmentType: DEVELOPMENT | STAGING | PRODUCTION), never from client input.

const ENVIRONMENTS = {
  DEVELOPMENT: { name: 'development', label: 'Development', upstreamTimeoutMs: 8000 },
  STAGING: { name: 'staging', label: 'Staging', upstreamTimeoutMs: 8000 },
  PRODUCTION: { name: 'production', label: null, upstreamTimeoutMs: 6000 },
};

// Capabilities switched on in this build. Each later milestone flips its own flag after its
// acceptance criteria pass. The frontend reads these flags but never decides anything with them.
export const FEATURES = Object.freeze({
  screening: false, // Milestone 2: automatic privacy checks
  decisions: false, // Milestone 3: reviewer decisions and ledger
  gate: false, // workflow validator
  register: false, // Confluence decision register
});

export const APP_VERSION = '0.1.0';

export function configFor(environmentType) {
  return ENVIRONMENTS[String(environmentType ?? '').toUpperCase()] ?? ENVIRONMENTS.PRODUCTION;
}
