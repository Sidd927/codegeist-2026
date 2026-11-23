// Evaluation harness for the PRODUCT screening pipeline (validate → verify → rules), on the
// synthetic Stage 1 dataset (34 tickets, single-author labels; directional only, research doc 15 §7.4).
//
//   node eval/evaluate.mjs                       # rule-based floor only (no AI, no cost)
//   node eval/evaluate.mjs --ai results.jsonl    # score recorded AI tool-call outputs (one JSON per line:
//                                                #   {"id": "<ticket id>", "raw": <tool arguments>})
// Recording AI outputs requires billable Forge LLM calls and therefore explicit approval.
import { readFileSync } from 'node:fs';
import { buildScreeningText } from '../src/core/screening-text.js';
import { analyse } from '../src/core/analyse.js';
import { severityOf } from '../src/core/rules.js';

const DATA = new URL('../../spikes/article25-ai-spike/dataset/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, DATA))).tickets;
const sets = { dev: load('tickets.json'), heldout: load('heldout.json') };
const NOINV = { configured: false, approvedVendors: [], projectCategories: [] };

const aiArg = process.argv.indexOf('--ai');
const aiRaw = aiArg > 0 ? new Map(readFileSync(process.argv[aiArg + 1], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r.raw])) : null;
const mode = aiRaw ? 'ai' : 'rules';

const esc = (o) => severityOf(o) >= severityOf('REVIEW_REQUIRED');
function score(tickets) {
  let tp = 0, fp = 0, fn = 0, flagTp = 0, flagFn = 0, exact = 0, rejected = 0, malformed = 0, n = 0;
  const sensitiveMiss = [];
  for (const t of tickets) {
    const st = buildScreeningText({ summary: t.summary, description: t.description });
    let a = analyse(st, aiRaw?.get(t.id) ?? null, mode, NOINV);
    if (!a.ok) {
      malformed++;
      a = analyse(st, null, 'rules', NOINV);
    }
    n++;
    rejected += a.quality.rejected;
    const got = a.result.outcome;
    const gold = t.gold.outcome;
    if (got === gold) exact++;
    if (esc(gold) && esc(got)) tp++;
    else if (!esc(gold) && esc(got)) fp++;
    else if (esc(gold) && !esc(got)) fn++;
    if (gold !== 'CLEAR') got !== 'CLEAR' ? flagTp++ : flagFn++;
    if (t.gold.sensitive && !a.result.findings.some((f) => f.kind === 'sensitive_data')) sensitiveMiss.push(t.id);
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n, mode, escalationPrecision: tp + fp ? r(tp / (tp + fp)) : null, escalationRecall: tp + fn ? r(tp / (tp + fn)) : null, flagRecall: flagTp + flagFn ? r(flagTp / (flagTp + flagFn)) : null, exactOutcome: r(exact / n), rejectedQuotes: rejected, malformedOutputs: malformed, sensitiveMisses: sensitiveMiss };
}

const out = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, score(v)]));
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
