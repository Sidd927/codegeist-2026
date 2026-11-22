// Rule-based extractor (fail-safe floor when AI is off, unavailable or over budget).
// Ported from spikes/article25-core-spike/src/screen.js (lexicon, WP248 patterns, vendor dictionary,
// negation / change-neutral / vagueness cues). It emits the SAME raw contract as the AI tool call
// so it passes through the same validator and evidence verifier. Its recall is known to be low
// (research doc 15: held-out escalation recall 0.11), so the rules engine never lets a fallback
// result become CLEAR without an explicit negation.

export const FALLBACK_VERSION = 'f1';

const LEXICON = [
  ['contact', ['e-?mail(?: address)?', 'phone(?: number)?', 'mobile(?: number)?', 'postal address', 'home address', 'billing address']],
  ['identity', ['full name', 'billing name', 'first name', 'last name', 'date of birth', 'passport', 'national id']],
  ['identifiers', ['ip address', 'device (?:id|fingerprint)', 'cookie id', 'advertising id', 'user id']],
  ['location', ['gps', 'geolocation', 'geo-?location', 'route history', 'location data', 'customer location', 'user location']],
  ['financial', ['purchase history', 'transaction history', 'order value', 'payment details', 'credit (?:bureau|score|card)', 'income', 'bank account', 'card number']],
  ['behavioural', ['behaviou?ral(?: information| data)?', 'browsing history', 'clickstream', 'session replay', 'session recordings?', 'keystrokes?']],
  ['employee', ['employees?', 'support agents?', 'new hires?', 'payroll', 'performance reviews?', 'contractors?', 'couriers?']],
  ['children', ['child(?:ren)?', 'kids?', 'minors?', 'under 1[3-8]', 'students?']],
  ['health', ['health', 'medical', 'prescriptions?', 'medications?', 'diagnos\\w*', 'mental health', 'disabilit\\w*', 'pregnan\\w*', 'allerg\\w*']],
  ['biometric', ['biometric\\w*', 'facial recognition', 'face (?:id|template|scan)', 'fingerprint scan', 'voice ?print']],
  ['special_other', ['religio\\w*', 'ethnic\\w*', 'racial', 'sexual orientation', 'political opinion', 'trade union', 'genetic', 'criminal record']],
];

const PATTERNS = [
  ['c1_scoring_profiling', ['scor(?:e|es|ing)', 'segment\\w*', 'profil\\w*', 'predict\\w*', 'personali[sz]ed?', 'targeting']],
  ['c2_automated_decision', ['automatically (?:approve|reject|decline|deny)', 'automated decision', 'auto-?(?:approve|reject|decline)', 'no human review']],
  ['c3_systematic_monitoring', ['track(?:s|ing)?', 'monitor(?:s|ing)?', 'session replay', 'recordings?', 'surveillance']],
  ['c5_large_scale', ['all (?:users|customers)', 'millions? of', 'every (?:shopper|customer|user)']],
  ['c8_innovative_tech', ['facial recognition', 'machine learning', 'biometric']],
];

// A small dictionary of commonly used processors (the approved inventory is separate, see rules).
const KNOWN_VENDORS = ['Stripe', 'Segment', 'Mixpanel', 'Twilio', 'Salesforce', 'HubSpot', 'Zendesk', 'Google Analytics', 'Amplitude', 'Intercom', 'Hotjar', 'Freshdesk', 'Braze', 'Workday', 'ReplayCloud'];

const NEGATION = ['no personal data', 'no customer-level data', 'anonymi[sz]ed', 'aggregated data', 'no functional changes'];
const CHANGE_NEUTRAL = ['fix (?:the )?(?:bug|typo|template)', 'refactor\\w*', 'bump\\w*', 'upgrade\\w*', 'rename\\w*'];
const VAGUE = ['tbd', 'to be decided', 'details later', 'more context later'];

function firstMatch(text, terms) {
  for (const t of terms) {
    const m = new RegExp(`\\b(?:${t})\\b`, 'i').exec(text);
    if (m) return m[0]; // verbatim substring of the source text
  }
  return null;
}

/** @returns raw extraction object in the AI tool-call contract */
export function extractWithRules(text) {
  const categories = [];
  for (const [value, terms] of LEXICON) {
    const q = firstMatch(text, terms);
    if (q) categories.push({ value, basis: 'explicit', evidence_quote: q });
  }
  const criteria = [];
  for (const [value, terms] of PATTERNS) {
    const q = firstMatch(text, terms);
    if (q) criteria.push({ value, evidence_quote: q });
  }
  const recipients = [];
  for (const v of KNOWN_VENDORS) {
    const q = firstMatch(text, [v.replace(/ /g, '\\s+')]);
    if (q) recipients.push({ name: v, external: true, evidence_quote: q });
  }
  const negation = firstMatch(text, NEGATION);
  const neutral = firstMatch(text, CHANGE_NEUTRAL);
  const vague = firstMatch(text, VAGUE);
  return {
    categories,
    criteria,
    recipients,
    transfers: [],
    retention: [],
    purposes: [],
    no_personal_data_statement: negation ? [{ evidence_quote: negation }] : [],
    data_subjects: [],
    open_questions: vague ? [{ question: 'The work item says details are still to be decided. What personal data will be processed, and why?', topic: 'purpose' }] : [],
    change_type: neutral ? 'change_existing' : 'unclear',
  };
}
