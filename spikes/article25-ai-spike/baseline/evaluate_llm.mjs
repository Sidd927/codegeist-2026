// Score LLM-extracted signals with the SAME style of deterministic outcome rules used by the baseline.
// Usage: node baseline/evaluate_llm.mjs results/llm_results.jsonl
import { readFileSync } from 'node:fs';
import { screen } from './screen.mjs';

const ROOT = new URL('../', import.meta.url);
const gold = Object.fromEntries(['tickets', 'heldout'].flatMap((f) => JSON.parse(readFileSync(new URL(`dataset/${f}.json`, ROOT), 'utf8')).tickets.map((t) => [t.id, t])));
const rows = readFileSync(process.argv[2] ?? new URL('results/llm_results.jsonl', ROOT), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const ORDER = ['CLEAR', 'INVENTORY_UPDATE', 'NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY'];
const SENSITIVE = new Set(['health', 'biometric', 'special_other', 'children']);
const SYSTEM_CATS = new Set(['contact', 'identity', 'financial']); // same synthetic "existing system" as baseline register
const APPROVED = ['stripe', 'workday'];

// Deterministic rules over extracted signals (LLM never chooses the outcome).
export function rulesFromSignals({ categories = [], criteria = [], vendors = [] }) {
  const cats = [...new Set(categories)];
  const sens = cats.filter((c) => SENSITIVE.has(c));
  const crit = new Set(criteria);
  if (sens.length) crit.add('c4_sensitive');
  if (cats.includes('children')) crit.add('c7_vulnerable');
  const unapproved = vendors.filter((v) => !APPROVED.some((a) => v.toLowerCase().includes(a)));
  if (!cats.length && !vendors.length && !crit.size) return 'CLEAR';
  if (sens.length && (crit.size >= 2 || cats.includes('children'))) return 'DPIA_LIKELY';
  if (crit.size >= 2) return 'DPIA_LIKELY';
  if (sens.length) return 'REVIEW_REQUIRED';
  if (unapproved.length) return 'REVIEW_REQUIRED';
  if (cats.some((c) => !SYSTEM_CATS.has(c)) || crit.size === 1) return 'REVIEW_REQUIRED';
  if (!cats.length) return 'NEEDS_INFO';
  return 'INVENTORY_UPDATE';
}

const esc = (o) => ORDER.indexOf(o) >= ORDER.indexOf('REVIEW_REQUIRED');
function metrics(preds) { // preds: [{id, outcome, categories, sensitiveFlag}]
  const out = {};
  for (const subset of ['dev', 'heldout', 'all']) {
    const ps = preds.filter((p) => subset === 'all' || (subset === 'dev' ? p.id.startsWith('T') : p.id.startsWith('H')));
    let tp = 0, fp = 0, fn = 0, ftp = 0, ffp = 0, ffn = 0, exact = 0, ctp = 0, cfp = 0, cfn = 0; const sensFN = [], escFN = [], escFP = [];
    for (const p of ps) {
      const g = gold[p.id].gold;
      const gE = esc(g.outcome), pE = esc(p.outcome);
      if (gE && pE) tp++; else if (!gE && pE) { fp++; escFP.push(p.id); } else if (gE && !pE) { fn++; escFN.push(p.id); }
      const gF = g.outcome !== 'CLEAR', pF = p.outcome !== 'CLEAR';
      if (gF && pF) ftp++; else if (!gF && pF) ffp++; else if (gF && !pF) ffn++;
      if (g.outcome === p.outcome) exact++;
      const gc = new Set(g.categories), pc = new Set(p.categories);
      for (const c of pc) gc.has(c) ? ctp++ : cfp++;
      for (const c of gc) if (!pc.has(c)) cfn++;
      if (g.sensitive && !p.categories.some((c) => SENSITIVE.has(c))) sensFN.push(p.id);
    }
    const r = (a, b) => (b ? +(a / b).toFixed(3) : null);
    out[subset] = { n: ps.length, escPrecision: r(tp, tp + fp), escRecall: r(tp, tp + fn), flagPrecision: r(ftp, ftp + ffp), flagRecall: r(ftp, ftp + ffn), exact: r(exact, ps.length), catPrecision: r(ctp, ctp + cfp), catRecall: r(ctp, ctp + cfn), sensitiveFN: sensFN, escalationFN: escFN, escalationFP: escFP };
  }
  return out;
}

const report = {};
// Baselines on the same tickets
for (const [label, opts] of [['baseline-0.1', {}], ['baseline-0.2-failsafe', { failSafe: true }]]) {
  report[label] = metrics(Object.values(gold).map((t) => { const r = screen(t, undefined, opts); return { id: t.id, outcome: r.outcome, categories: r.categories }; }));
}
const groups = {};
for (const r of rows) (groups[`${r.model}#${r.pass}`] ??= []).push(r);
const perTicketOutcomes = {};
for (const [k, rs] of Object.entries(groups)) {
  const preds = rs.map((r) => ({ id: r.id, outcome: rulesFromSignals(r), categories: r.categories }));
  preds.forEach((p) => ((perTicketOutcomes[p.id] ??= {})[k] = p.outcome));
  report[k] = { ...metrics(preds), droppedEvidenceItems: rs.reduce((a, r) => a + r.droppedEvidence.length, 0), callsWithDropped: rs.filter((r) => r.droppedEvidence.length).length, toolCalled: rs.filter((r) => r.toolCalled).length, n: rs.length };
}
// Consistency across the 3 Sonnet passes
const sonnetKeys = Object.keys(groups).filter((k) => k.startsWith('claude-sonnet-5-5#'));
let agree = 0; const disagree = [];
for (const [id, o] of Object.entries(perTicketOutcomes)) { const v = sonnetKeys.map((k) => o[k]); if (new Set(v).size === 1) agree++; else disagree.push(`${id}:${v.join('/')}`); }
report.sonnetConsistency = { ticketsAllPassesSameOutcome: agree, of: Object.keys(perTicketOutcomes).length, disagreements: disagree };
report.perTicket = Object.fromEntries(Object.entries(perTicketOutcomes).sort().map(([id, o]) => [id, { gold: gold[id].gold.outcome, ...o, baseline: screen(gold[id]).outcome }]));
console.log(JSON.stringify(report, null, 1));
