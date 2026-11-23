// Measures the built Custom UI bundles (raw and gzip) per surface. Run after `vite build`.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../frontend/dist/', import.meta.url).pathname;
const report = {};
for (const surface of ['panel', 'desk']) {
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); });
  walk(join(dist, surface));
  const rows = files.map((f) => { const b = readFileSync(f); return { file: relative(join(dist, surface), f), raw: b.length, gzip: gzipSync(b, { level: 9 }).length }; });
  const sum = (ext) => rows.filter((r) => r.file.endsWith(ext)).reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 });
  // Initial = what index.html loads up front (entry script + modulepreload + stylesheets) and their static imports.
  const html = readFileSync(join(dist, surface, 'index.html'), 'utf8');
  const initial = new Set([...html.matchAll(/(?:src|href)="\.\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]));
  const queue = [...initial].filter((f) => f.endsWith('.js'));
  while (queue.length) {
    const f = queue.pop();
    const src = readFileSync(join(dist, surface, f), 'utf8');
    for (const m of src.matchAll(/(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([^"']+\.js)["']/g)) {
      const dep = join(f.split('/').slice(0, -1).join('/'), m[1]);
      if (!initial.has(dep)) { initial.add(dep); queue.push(dep); }
    }
  }
  const init = rows.filter((r) => initial.has(r.file)).reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 });
  report[surface] = { initialFiles: [...initial], initial: init, files: rows.length, js: sum('.js'), css: sum('.css'), total: rows.reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 }), rows };
}
writeFileSync(join(dist, 'bundle-report.json'), JSON.stringify(report, null, 2));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
for (const [s, r] of Object.entries(report)) process.stdout.write(`${s}: INITIAL ${kb(r.initial.raw)} (gzip ${kb(r.initial.gzip)}) [${r.initialFiles.join(', ')}] · all ${r.files} files · JS ${kb(r.js.raw)} (gzip ${kb(r.js.gzip)}) · CSS ${kb(r.css.raw)} (gzip ${kb(r.css.gzip)}) · total gzip ${kb(r.total.gzip)}\n`);

// Budgets (FRONTEND_ARCHITECTURE; initial gzip). Exceeding one fails the build (and CI).
const BUDGET_GZIP = { panel: 200 * 1024, desk: 400 * 1024 };
const over = Object.entries(BUDGET_GZIP).filter(([s, max]) => report[s].initial.gzip > max);
if (over.length) {
  for (const [s, max] of over) process.stderr.write(`Bundle budget exceeded: ${s} initial gzip ${kb(report[s].initial.gzip)} > ${kb(max)}\n`);
  process.exit(1);
}
