// Pure composition of one screening: validate → verify evidence → merge deterministic floor → rules.
// In AI mode the rule-based extractor ALWAYS runs as well, and its verified signals are merged in,
// so a model that misses or suppresses a signal (including via prompt injection in the ticket text)
// cannot produce a cleaner outcome than the deterministic lexicon supports.
import { validateExtraction, EXTRACTOR_VERSION } from './extraction/schema.js';
import { verifySignals } from './extraction/verify.js';
import { extractWithRules, FALLBACK_VERSION } from './extraction/fallback.js';
import { evaluate, RULES_VERSION } from './rules.js';
import { TEXT_VERSION } from './screening-text.js';

/** Version of everything that can change a screening result for the same text. */
export function pipelineVersion(mode) {
  return [TEXT_VERSION, RULES_VERSION, FALLBACK_VERSION, mode === 'ai' ? EXTRACTOR_VERSION : 'noai'].join('.');
}

const tag = (signals, provenance) => {
  const out = { ...signals };
  for (const k of ['categories', 'criteria', 'recipients', 'transfers', 'retention', 'purposes', 'negations']) out[k] = (signals[k] ?? []).map((s) => ({ ...s, provenance }));
  out.openQuestions = (signals.openQuestions ?? []).map((q) => ({ ...q, provenance }));
  return out;
};

/** AI signals first; floor signals added where the AI did not report the same value. */
function mergeFloor(ai, floor) {
  const merge = (k, key) => {
    const seen = new Set((ai[k] ?? []).map(key));
    return [...(ai[k] ?? []), ...(floor[k] ?? []).filter((s) => !seen.has(key(s)))];
  };
  return {
    ...ai,
    categories: merge('categories', (s) => s.value),
    criteria: merge('criteria', (s) => s.value),
    recipients: merge('recipients', (s) => s.name.toLowerCase()),
    // Negation is only trusted when BOTH sources agree there is no personal data (see rules R-NEG).
    negations: ai.negations ?? [],
    openQuestions: [...(ai.openQuestions ?? []), ...(floor.openQuestions ?? [])],
    changeType: ai.changeType,
  };
}

/**
 * @param {{ text: string, segments: object[] }} screeningText
 * @param {object|null} raw     raw AI tool arguments (mode 'ai'); ignored in mode 'rules'
 * @param {'ai'|'rules'} mode
 * @returns {{ ok: true, result: object, quality: object } | { ok: false, reason: 'malformed_output', quality: object }}
 */
export function analyse(screeningText, raw, mode, inventory) {
  const floorValidation = validateExtraction(extractWithRules(screeningText.text));
  const floor = tag(verifySignals(floorValidation.signals, screeningText).signals, 'rules');
  const quality = { dropped: 0, droppedReasons: {}, rejected: 0, rejectedReasons: {} };

  let signals = floor;
  if (mode === 'ai') {
    const validation = validateExtraction(raw);
    quality.dropped = validation.dropped.length;
    quality.droppedReasons = countBy(validation.dropped);
    if (validation.malformed) return { ok: false, reason: 'malformed_output', quality };
    const { signals: verified, rejected } = verifySignals(validation.signals, screeningText);
    quality.rejected = rejected.length;
    quality.rejectedReasons = countBy(rejected);
    signals = mergeFloor(tag(verified, 'ai'), floor);
  }
  const result = evaluate(signals, { mode, inventory });
  return { ok: true, result: { ...result, mode, pipelineVersion: pipelineVersion(mode), purposes: signals.purposes, dataSubjects: signals.dataSubjects, changeType: signals.changeType }, quality };
}

function countBy(items) {
  return items.reduce((m, x) => ({ ...m, [`${x.list}:${x.reason}`]: (m[`${x.list}:${x.reason}`] ?? 0) + 1 }), {});
}
