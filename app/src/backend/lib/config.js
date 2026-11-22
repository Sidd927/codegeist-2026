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
  screening: true, // M2: automatic privacy checks (AI extraction only when approved; see settingsFromEnv)
  decisions: false, // Milestone 3: reviewer decisions and ledger
  gate: false, // workflow validator
  register: false, // Confluence decision register
});

export const APP_VERSION = '0.1.0';

export function configFor(environmentType) {
  return ENVIRONMENTS[String(environmentType ?? '').toUpperCase()] ?? ENVIRONMENTS.PRODUCTION;
}

/**
 * Runtime screening settings from encrypted/plain Forge environment variables (no admin UI yet).
 * - A25_AI_ENABLED=true          AI extraction switch (also requires the approved `llm` module)
 * - A25_AI_DAILY_BUDGET=<n>      max AI calls per installation per UTC day (default 200)
 * - A25_SCOPE_PROJECTS=KEY,KEY   in-scope projects (empty = all projects)
 * - A25_AI_MODEL=<model id>      default claude-haiku-5-5 (research doc 15 §7.5)
 */
export function settingsFromEnv(env = process.env) {
  const scope = String(env.A25_SCOPE_PROJECTS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const budget = Number.parseInt(env.A25_AI_DAILY_BUDGET ?? '200', 10);
  return {
    aiEnabled: env.A25_AI_ENABLED === 'true',
    aiModel: env.A25_AI_MODEL || 'claude-haiku-5-5',
    dailyAiBudget: Number.isFinite(budget) && budget >= 0 ? budget : 200,
    manualRescreenIntervalMs: 60_000,
    scopeProjects: scope,
    isProjectInScope: (projectKey) => scope.length === 0 || scope.includes(String(projectKey ?? '').toUpperCase()),
  };
}
