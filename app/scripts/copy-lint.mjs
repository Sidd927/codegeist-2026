// Fails the build if user-facing copy makes claims Article25 must never make (NFR-11, UX_DESIGN_SPEC §7).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [/\bcompliant\b/i, /\bcompliance guaranteed\b/i, /\blegal advice\b/i, /\bguarantee[sd]?\b/i, /\bapproved by ai\b/i];
const ROOTS = ['frontend/src'];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx|json)$/.test(name) && !/\.test\./.test(name)) files.push(p);
  }
};
ROOTS.forEach(walk);

const hits = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('copy-lint-allow')) return;
    for (const re of BANNED) if (re.test(line)) hits.push(`${f}:${i + 1}: ${re}`);
  });
}
if (hits.length) {
  process.stderr.write(`Copy lint failed:\n${hits.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Copy lint: ${files.length} file(s) clean.\n`);
