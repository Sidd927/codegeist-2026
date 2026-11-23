// Permission freeze guard (runs in `npm run lint`, so in CI).
// Adding a scope, egress or a consent-bearing module after the freeze (4 Dec 2026) would make
// every installed site, judges' included, re-approve the app. This fails the build if the
// manifest asks for anything beyond the frozen set. See product/PERMISSIONS_MATRIX.md.
import { readFileSync } from 'node:fs';

const FROZEN_SCOPES = ['read:jira-work', 'read:jira-user', 'read:workflow:jira'];
const FROZEN_MODULE_TYPES = ['jira:issuePanel', 'jira:globalPage', 'jira:workflowValidator', 'trigger', 'consumer', 'scheduledTrigger', 'sql', 'llm', 'function'];

const text = readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8');
const lines = text.split('\n');
const blockOf = (name) => {
  const start = lines.findIndex((l) => l === `${name}:`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
};

const problems = [];
const perms = blockOf('permissions');
const scopes = perms.map((l) => l.match(/^\s+-\s+([a-z:-]+)/)?.[1]).filter(Boolean);
const extra = scopes.filter((s) => !FROZEN_SCOPES.includes(s));
const missing = FROZEN_SCOPES.filter((s) => !scopes.includes(s));
if (extra.length) problems.push(`scopes not in the frozen set: ${extra.join(', ')}`);
if (missing.length) problems.push(`frozen scopes missing (update the matrix if intended): ${missing.join(', ')}`);
for (const key of ['external', 'content']) if (perms.some((l) => new RegExp(`^\\s+${key}:`).test(l))) problems.push(`permissions.${key} is not allowed (no egress, no external content)`);

const moduleTypes = blockOf('modules').map((l) => l.match(/^ {2}([A-Za-z:]+):\s*$/)?.[1]).filter(Boolean);
const extraModules = moduleTypes.filter((m) => !FROZEN_MODULE_TYPES.includes(m));
if (extraModules.length) problems.push(`module types not in the frozen set: ${extraModules.join(', ')}`);

if (problems.length) {
  console.error(`Permission freeze check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Permission freeze: ${scopes.length} scopes and ${moduleTypes.length} module types match the frozen set.`);
