// Deterministic, versioned privacy rules engine. Input: VERIFIED signals (see extraction/verify.js).
// Output: outcome + explainable reasons + full rule trace + classified findings.
// The AI never chooses the outcome; it only supplies evidence-checked signals.
import { SENSITIVE } from './extraction/schema.js';

export const RULES_VERSION = 'r1.0.0';

/** Outcome vocabulary (PRODUCT_REQUIREMENTS §1), least to most severe. SCREENING_FAILED is a pipeline state. */
export const OUTCOMES = ['CLEAR', 'INVENTORY_UPDATE', 'NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY'];
export const severityOf = (o) => OUTCOMES.indexOf(o);

const SEVERITY_RANK = { high: 0, medium: 1, low: 2, info: 3 };
const RELEVANT_QUESTION_TOPICS = new Set(['third_party', 'transfer', 'sensitive', 'purpose']);
const NEUTRAL_CHANGES = new Set(['bug_fix', 'refactor', 'configuration']);
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * @param {object} signals  verified signals
 * @param {{ mode: 'ai'|'rules', inventory?: { configured: boolean, approvedVendors: string[], projectCategories: string[] } }} ctx
 */
export function evaluate(signals, { mode, inventory = { configured: false, approvedVendors: [], projectCategories: [] } }) {
  const cats = [...new Set(signals.categories.map((c) => c.value))];
  const sensitive = cats.some((c) => SENSITIVE.has(c));
  const children = cats.includes('children');

  // ---- derived criteria (WP248), each with a stated origin
  const crit = new Map(signals.criteria.map((c) => [c.value, 'extracted']));
  if (sensitive && !crit.has('c4_sensitive')) crit.set('c4_sensitive', 'derived:sensitive-category');
  if (children && !crit.has('c7_vulnerable')) crit.set('c7_vulnerable', 'derived:children');
  if (cats.includes('employee') && crit.has('c3_systematic_monitoring') && !crit.has('c7_vulnerable')) crit.set('c7_vulnerable', 'derived:employee-monitoring');
  if (cats.filter((c) => c !== 'employee').length >= 3 && !crit.has('c6_combining')) crit.set('c6_combining', 'derived:three-or-more-categories');
  // c7 only counts with children or alongside profiling / automated decisions / monitoring (spike rule)
  if (crit.has('c7_vulnerable') && !children && !['c1_scoring_profiling', 'c2_automated_decision', 'c3_systematic_monitoring'].some((c) => crit.has(c))) crit.delete('c7_vulnerable');
  const critCount = crit.size;

  const approved = new Set((inventory.approvedVendors ?? []).map(norm));
  const external = signals.recipients.filter((r) => r.external);
  const unapproved = external.filter((r) => !approved.has(norm(r.name)));
  const newCats = inventory.configured ? cats.filter((c) => !(inventory.projectCategories ?? []).includes(c)) : [];
  const relevantQuestions = signals.openQuestions.filter((q) => RELEVANT_QUESTION_TOPICS.has(q.topic));
  const negated = signals.negations.length > 0;
  const neutral = NEUTRAL_CHANGES.has(signals.changeType);
  const hasData = cats.length > 0;

  // ---- ordered rules: first match decides; every rule is recorded in the trace
  const RULES = [
    { id: 'R-NEG', when: () => negated && !hasData && external.length === 0, outcome: 'CLEAR', params: {} },
    { id: 'R-SENS-2', when: () => sensitive && (critCount >= 2 || children), outcome: 'DPIA_LIKELY', params: { criteria: critCount } },
    { id: 'R-WP248-2', when: () => critCount >= 2, outcome: 'DPIA_LIKELY', params: { criteria: critCount } },
    { id: 'R-SENS', when: () => sensitive, outcome: 'REVIEW_REQUIRED', params: {} },
    { id: 'R-TRANSFER', when: () => hasData && signals.transfers.length > 0, outcome: 'REVIEW_REQUIRED', params: { count: signals.transfers.length } },
    { id: 'R-AUTO-DEC', when: () => crit.has('c2_automated_decision'), outcome: 'REVIEW_REQUIRED', params: {} },
    { id: 'R-VENDOR', when: () => hasData && unapproved.length > 0, outcome: 'REVIEW_REQUIRED', params: { count: unapproved.length, inventoryConfigured: inventory.configured } },
    { id: 'R-OQ', when: () => relevantQuestions.length > 0, outcome: 'NEEDS_INFO', params: { count: relevantQuestions.length } },
    { id: 'R-ONE-CRIT', when: () => hasData && critCount === 1, outcome: 'REVIEW_REQUIRED', params: {} },
    { id: 'R-CRIT-NO-DATA', when: () => !hasData && critCount >= 1, outcome: 'NEEDS_INFO', params: {} },
    { id: 'R-NEWCAT', when: () => newCats.length > 0, outcome: 'REVIEW_REQUIRED', params: { count: newCats.length } },
    { id: 'R-NEUTRAL', when: () => neutral && critCount === 0 && external.length === 0 && signals.transfers.length === 0, outcome: 'CLEAR', params: {} },
    { id: 'R-KNOWN', when: () => hasData, outcome: 'INVENTORY_UPDATE', params: { inventoryConfigured: inventory.configured } },
    { id: 'R-NONE', when: () => true, outcome: 'CLEAR', params: {} },
  ];

  const trace = [];
  let decided = null;
  for (const r of RULES) {
    const fired = !decided && r.when();
    trace.push({ ruleId: r.id, result: decided ? 'skipped' : fired ? 'fired' : 'not_matched' });
    if (fired) decided = r;
  }

  let outcome = decided.outcome;
  const reasons = [{ ruleId: decided.id, outcome, params: decided.params }];
  // Fail-safe: the rule-based extractor has low recall, so its silence is not evidence of "no concern".
  if (mode === 'rules' && outcome === 'CLEAR' && decided.id !== 'R-NEG') {
    outcome = 'NEEDS_INFO';
    reasons.push({ ruleId: 'R-FALLBACK-LIMITED', outcome, params: {} });
    trace.push({ ruleId: 'R-FALLBACK-LIMITED', result: 'fired' });
  }

  return { rulesVersion: RULES_VERSION, outcome, reasons, trace, criteria: [...crit.entries()].map(([value, origin]) => ({ value, origin })), findings: buildFindings(signals, { approved, inventory, hasData }) };
}

function buildFindings(signals, { approved, inventory, hasData }) {
  const f = [];
  const ev = (s) => s.evidence;
  const prov = (s) => s.provenance ?? null;
  for (const c of signals.categories) {
    const isSensitive = SENSITIVE.has(c.value);
    f.push({ kind: isSensitive ? 'sensitive_data' : 'personal_data', signal: c.value, certainty: c.basis === 'implied' ? 'implied' : 'stated', severity: isSensitive ? 'high' : 'low', isNew: inventory.configured && !(inventory.projectCategories ?? []).includes(c.value), evidence: ev(c), provenance: prov(c) });
  }
  for (const c of signals.criteria) {
    const kind = c.value === 'c2_automated_decision' ? 'automated_decision' : c.value === 'c1_scoring_profiling' || c.value === 'c3_systematic_monitoring' ? 'tracking_profiling' : 'risk_criterion';
    f.push({ kind, signal: c.value, certainty: 'possible', severity: kind === 'automated_decision' ? 'high' : 'medium', isNew: false, evidence: ev(c), provenance: prov(c) });
  }
  for (const r of signals.recipients.filter((x) => x.external)) {
    f.push({ kind: 'external_sharing', signal: r.name, certainty: 'stated', severity: 'medium', isNew: !approved.has(norm(r.name)), detail: approved.has(norm(r.name)) ? 'approved' : inventory.configured ? 'not_approved' : 'no_approved_list', evidence: ev(r), provenance: prov(r) });
  }
  for (const t of signals.transfers) f.push({ kind: 'international_transfer', signal: t.destination, certainty: 'stated', severity: 'high', isNew: false, evidence: ev(t), provenance: prov(t) });
  for (const r of signals.retention) f.push({ kind: 'retention', signal: r.period ?? null, certainty: 'stated', severity: 'low', isNew: false, evidence: ev(r), provenance: prov(r) });
  for (const n of signals.negations) f.push({ kind: 'no_personal_data_statement', signal: null, certainty: 'stated', severity: 'info', isNew: false, evidence: ev(n), provenance: prov(n) });
  for (const q of signals.openQuestions) f.push({ kind: 'question', signal: q.topic, certainty: 'question', severity: 'info', isNew: false, question: q.question, evidence: null, provenance: prov(q) });
  if (hasData && signals.purposes.length === 0) f.push({ kind: 'missing_info', signal: 'purpose', certainty: 'question', severity: 'info', isNew: false, evidence: null });

  f.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.evidence?.start ?? 1e9) - (b.evidence?.start ?? 1e9));
  let index = 0;
  return f.map((x, i) => ({ id: `f${i + 1}`, index: x.evidence ? ++index : null, ...x }));
}
