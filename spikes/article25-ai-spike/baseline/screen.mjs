// Article25 Spike D — deterministic screening baseline (no network, no LLM, no deps).
// Pipeline: lexicon + vendor detection -> signals with evidence -> rules -> outcome.
// SYNTHETIC evaluation only. This is a spike, not production code.

export const RULES_VERSION = 'baseline-0.1';

// --- Taxonomy lexicon -------------------------------------------------------
// Each entry: category, sensitive flag, regex list. Regexes are word-bounded, case-insensitive.
const LEXICON = [
  { cat: 'contact', sensitive: false, terms: ['e-?mail(?: address)?', 'phone(?: number)?', 'mobile(?: phone)?(?: number)?', 'postal address', 'home address', 'billing address', 'address'] },
  { cat: 'identity', sensitive: false, terms: ['full name', 'billing name', 'first name', 'last name', 'name', 'date of birth', 'passport', 'national id', 'customer\'?s? situation', 'notes about the customer'] },
  { cat: 'identifiers', sensitive: false, terms: ['ip address', 'device (?:id|fingerprint)', 'cookie id', 'advertising id', 'user id'] },
  { cat: 'location', sensitive: false, terms: ['location', 'gps', 'geolocation', 'geo-?location', 'route history', 'position'] },
  { cat: 'financial', sensitive: false, terms: ['purchase history', 'transaction history', 'order value', 'payment', 'credit (?:bureau|score|card)', 'income', 'bank account', 'card number'] },
  { cat: 'behavioural', sensitive: false, terms: ['behaviou?ral(?: information| data)?', 'browsing', 'clickstream', 'session replay', 'recordings?', 'clicks', 'user signals', 'learning behaviou?r', 'keystroke', 'idle time', 'handle time', 'lesson progress', 'tracking'] },
  { cat: 'employee', sensitive: false, terms: ['employees?', 'support agents?', 'new hires?', 'staff', 'hr\\b', 'payroll', 'performance review', 'low performers', 'couriers?', 'employment status', 'start date', 'department'] },
  { cat: 'children', sensitive: true, terms: ['child(?:ren)?', 'kids?', 'minors?', 'under 1[3-8]', 'students?'] },
  { cat: 'health', sensitive: true, terms: ['health', 'medical', 'prescription', 'medication', 'medicines?', 'diagnos\\w*', 'mental health', 'mood', 'stress levels?', 'disabilit\\w*', 'pregnan\\w*'] },
  { cat: 'biometric', sensitive: true, terms: ['biometric\\w*', 'facial recognition', 'face (?:id|template|scan)', 'fingerprint scan', 'voice ?print'] },
  { cat: 'special_other', sensitive: true, terms: ['religio\\w*', 'ethnic\\w*', 'racial', 'sexual orientation', 'political opinion', 'trade union', 'genetic', 'criminal record'] },
];

// Signals that map to WP248 criteria (numbers per WP248 rev.01 list)
const PATTERNS = {
  c1_scoring_profiling: ['scor(?:e|es|ing)', 'segment\\w*', 'profil\\w*', 'predict\\w*', 'likelihood', 'recommend\\w*', 'personali[sz]ed?', 'target\\w*', 'low performers'],
  c2_automated_decision: ['automatically (?:approve|reject|decline|deny)', 'automatic(?:ally)? decision', 'auto-?(?:approve|reject|decline)', 'no human review', 'approve or reject'],
  c3_systematic_monitoring: ['track\\w*', 'monitor\\w*', 'every \\d+ seconds', 'session replay', 'recordings?', 'keystroke', 'surveillance', 'clickstream'],
  c5_large_scale: ['all (?:users|customers)', 'millions?', 'every (?:shopper|customer|user)', 'each shopper', 'each customer'],
  c6_combining: ['(?:combine|combining|join|match)\\w* (?:datasets?|data)', 'credit bureau', 'from \\w+ (?:and|with) '],
  c7_vulnerable: ['child(?:ren)?', 'kids?', 'minors?', 'under 1[3-8]', 'employees?', 'agents?', 'couriers?', 'patients?'],
  c8_innovative_tech: ['facial recognition', 'face template', 'biometric', 'model that', 'machine learning', '\\bai\\b'],
};

const SHARING = ['share\\w*', 'send\\w* to', 'forward\\w* to', 'sync\\w* .{0,40}from', 'using [A-Z]\\w+', 'from [A-Z]\\w+', 'with [A-Z]\\w+', 'to [A-Z]\\w+'];
const NEGATION = ['no personal data', 'no customer-level data', 'anonymi[sz]ed', 'aggregated', 'no functional changes', 'logic is unchanged', 'already (?:held|used)'];
const CHANGE_NEUTRAL = ['fix (?:the )?(?:bug|template)', 'rotate', 'bump', 'upgrade', 'refactor', 'unchanged', 'already held', 'already used'];
const VAGUE = ['tbd', 'to be decided', 'details later', 'extra notes', 'user signals', 'more context'];

// Vendor dictionary: register (approved) + known processors. In the product this comes from the register.
export const DEFAULT_REGISTER = {
  approvedVendors: ['Stripe', 'Workday'],
  knownVendors: ['Stripe', 'Workday', 'Segment', 'Mixpanel', 'Twilio', 'ReplayCloud', 'PartnerBank', 'CreditCheckCo', 'Salesforce', 'HubSpot', 'Zendesk', 'Google Analytics', 'Amplitude', 'Intercom'],
  // categories already processed per (default) system — used for "new category" diff
  systemCategories: ['contact', 'identity', 'financial'],
};

const rx = (t) => new RegExp(`\\b(?:${t})\\b`, 'i');

function findEvidence(text, term) {
  const m = text.match(new RegExp(`\\b(?:${term})\\b`, 'i'));
  if (!m) return null;
  const i = m.index;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, i - 40)) + 1);
  const end = Math.min(text.length, i + m[0].length + 40);
  return { match: m[0], quote: text.slice(start, end).trim(), offset: i };
}

// opts.failSafe (POST-HOC variant "baseline-0.2-failsafe", added after the held-out run):
// a purely structural change — any WP248 pattern hit, or an unknown capitalised product name after
// an integration verb, can no longer produce CLEAR; minimum outcome becomes NEEDS_INFO.
// No lexicon terms were added (to avoid tuning on the held-out set).
export function screen(ticket, register = DEFAULT_REGISTER, opts = {}) {
  const text = `${ticket.summary}. ${ticket.description}`;
  const signals = [];

  for (const entry of LEXICON) {
    for (const term of entry.terms) {
      const ev = findEvidence(text, term);
      if (ev) { signals.push({ kind: 'category', value: entry.cat, sensitive: entry.sensitive, evidence: ev.quote, match: ev.match }); break; }
    }
  }
  const criteria = [];
  for (const [crit, terms] of Object.entries(PATTERNS)) {
    for (const term of terms) {
      const ev = findEvidence(text, term);
      if (ev) { criteria.push({ kind: 'criterion', value: crit, evidence: ev.quote, match: ev.match }); break; }
    }
  }
  const vendors = [];
  for (const v of register.knownVendors) {
    const ev = findEvidence(text, v.replace(/ /g, '\\s+'));
    if (ev) vendors.push({ kind: 'vendor', value: v, approved: register.approvedVendors.includes(v), evidence: ev.quote });
  }
  // Unknown capitalised vendor-like tokens after sharing verbs ("using X", "with X", "from X")
  const sharingHit = SHARING.some((t) => rx(t).test(text));
  const negated = NEGATION.some((t) => rx(t).test(text));
  const neutralChange = CHANGE_NEUTRAL.some((t) => rx(t).test(text));
  const vague = VAGUE.some((t) => rx(t).test(text));

  // criterion 4 (sensitive data) derived from categories
  const cats = [...new Set(signals.map((s) => s.value))];
  if (signals.some((s) => s.sensitive)) criteria.push({ kind: 'criterion', value: 'c4_sensitive', evidence: signals.find((s) => s.sensitive).evidence });
  // "c7 vulnerable" only counts if it co-occurs with monitoring/profiling/decision OR children
  const critSet = new Set(criteria.map((c) => c.value));
  if (critSet.has('c7_vulnerable') && !cats.includes('children') && !(critSet.has('c3_systematic_monitoring') || critSet.has('c1_scoring_profiling') || critSet.has('c2_automated_decision'))) {
    critSet.delete('c7_vulnerable');
  }
  // "c6 combining": count when >=3 distinct personal categories are named together
  if (cats.filter((c) => c !== 'employee').length >= 3) critSet.add('c6_combining');

  const newCats = cats.filter((c) => !register.systemCategories.includes(c));
  const unapprovedVendors = vendors.filter((v) => !v.approved);
  const criteriaCount = critSet.size;
  const reasons = [];

  let outcome;
  if (negated && cats.length === 0) { outcome = 'CLEAR'; reasons.push('No personal-data terms; explicit negation (aggregated/anonymised/no functional change).'); }
  else if (cats.length === 0 && vendors.length === 0 && !vague) { outcome = 'CLEAR'; reasons.push('No personal-data or vendor signals found.'); }
  else if (signals.some((s) => s.sensitive) && (criteriaCount >= 2 || cats.includes('children'))) { outcome = 'DPIA_LIKELY'; reasons.push(`Sensitive/special category with ${criteriaCount} WP248 criteria.`); }
  else if (criteriaCount >= 2) { outcome = 'DPIA_LIKELY'; reasons.push(`${criteriaCount} WP248 criteria met (two-criteria rule).`); }
  else if (signals.some((s) => s.sensitive)) { outcome = 'REVIEW_REQUIRED'; reasons.push('Sensitive/special category indicated.'); }
  else if (vague) { outcome = 'NEEDS_INFO'; reasons.push('Personal data likely but processing is underspecified.'); }
  else if (neutralChange && unapprovedVendors.length === 0) { outcome = 'CLEAR'; reasons.push('Change to existing processing without new data/vendors.'); }
  else if (unapprovedVendors.length > 0 || (sharingHit && cats.length > 0 && vendors.length > 0)) { outcome = 'REVIEW_REQUIRED'; reasons.push(`Vendor not in register: ${unapprovedVendors.map((v) => v.value).join(', ') || 'sharing detected'}.`); }
  else if (newCats.length > 0 || criteriaCount === 1) { outcome = 'REVIEW_REQUIRED'; reasons.push(`New category for system: ${newCats.join(', ') || '-'}; criteria: ${criteriaCount}.`); }
  else { outcome = 'INVENTORY_UPDATE'; reasons.push('Personal data within existing categories; confirm inventory.'); }

  if (opts.failSafe && outcome === 'CLEAR' && !negated) {
    const unknownProduct = text.match(/\b(?:install|using|use|to|from|into|via|with)\s+([A-Z][a-z]+[A-Z]?\w*)/);
    const knownNonVendor = unknownProduct && ['Node', 'Berlin', 'Leeds', 'Austin'].includes(unknownProduct[1]);
    if (critSet.size > 0 || (unknownProduct && !knownNonVendor)) {
      outcome = 'NEEDS_INFO';
      reasons.push(`Fail-safe: ${critSet.size ? 'risk pattern ' + [...critSet].join(',') : 'possible unregistered product "' + unknownProduct[1] + '"'} without a recognised data category.`);
    }
  }

  return {
    rulesVersion: opts.failSafe ? 'baseline-0.2-failsafe' : RULES_VERSION,
    outcome,
    reasons,
    categories: cats,
    sensitive: signals.some((s) => s.sensitive),
    vendors: vendors.map((v) => v.value),
    criteria: [...critSet],
    evidence: [...signals, ...criteria.filter((c) => critSet.has(c.value)), ...vendors],
  };
}
