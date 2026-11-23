// Evaluate the deterministic baseline against a labelled synthetic set.
// Usage: node baseline/evaluate.mjs dataset/tickets.json [--verbose]
import { readFileSync } from 'node:fs';
import { screen } from './screen.mjs';

const file = process.argv[2] ?? new URL('../dataset/tickets.json', import.meta.url);
const verbose = process.argv.includes('--verbose');
const { tickets } = JSON.parse(readFileSync(file, 'utf8'));
const ORDER = ['CLEAR', 'INVENTORY_UPDATE', 'NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY'];
const escalate = (o) => ORDER.indexOf(o) >= ORDER.indexOf('REVIEW_REQUIRED'); // "needs a human privacy review"
const flagged = (o) => o !== 'CLEAR';

let tp = 0, fp = 0, fn = 0, tn = 0, exact = 0, catTP = 0, catFP = 0, catFN = 0, sensMiss = [], ms = 0;
const rows = [];
for (const t of tickets) {
  const t0 = performance.now();
  const r = screen(t);
  ms += performance.now() - t0;
  const g = t.gold;
  const gE = escalate(g.outcome), pE = escalate(r.outcome);
  if (gE && pE) tp++; else if (!gE && pE) fp++; else if (gE && !pE) fn++; else tn++;
  if (g.outcome === r.outcome) exact++;
  const gc = new Set(g.categories), pc = new Set(r.categories);
  for (const c of pc) gc.has(c) ? catTP++ : catFP++;
  for (const c of gc) if (!pc.has(c)) catFN++;
  if (g.sensitive && !r.sensitive) sensMiss.push(t.id);
  rows.push({ id: t.id, group: t.group, gold: g.outcome, pred: r.outcome, ok: g.outcome === r.outcome ? '✓' : (gE === pE ? '~' : '✗'), cats: r.categories.join(','), goldCats: g.categories.join(','), criteria: r.criteria.join(',') });
  if (verbose) console.log(t.id, r.outcome, r.reasons, r.evidence.map((e) => `${e.kind}:${e.value} «${e.evidence}»`));
}
const p = tp / (tp + fp || 1), rc = tp / (tp + fn || 1);
console.table(rows);
console.log(JSON.stringify({
  n: tickets.length,
  escalation: { tp, fp, fn, tn, precision: +p.toFixed(3), recall: +rc.toFixed(3) },
  exactOutcomeAccuracy: +(exact / tickets.length).toFixed(3),
  categoryMicro: { precision: +(catTP / (catTP + catFP || 1)).toFixed(3), recall: +(catTP / (catTP + catFN || 1)).toFixed(3) },
  sensitiveFalseNegatives: sensMiss,
  avgMsPerTicket: +(ms / tickets.length).toFixed(3),
  costUSD: 0,
}, null, 2));
