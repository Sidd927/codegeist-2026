// Evidence gate between extraction and rules. Every quote-bearing signal must verify against the
// screened text; unverified signals are rejected (and counted), never passed to the rules engine.
import { verifyQuote, excerptOf, normaliseWithMap } from '../evidence.js';

const QUOTED_LISTS = ['categories', 'criteria', 'recipients', 'transfers', 'retention', 'purposes', 'negations'];

/**
 * @param {object} signals   output of validateExtraction(...).signals
 * @param {{text:string, segments:object[]}} screening
 * @returns {{ signals: object, rejected: {list:string, reason:string}[] }}
 */
export function verifySignals(signals, { text, segments }) {
  const normalised = normaliseWithMap(text);
  const rejected = [];
  const out = { ...signals };
  for (const list of QUOTED_LISTS) {
    out[list] = (signals[list] ?? []).flatMap((item) => {
      const v = verifyQuote(text, segments, item.quote, normalised);
      if (!v.ok) {
        rejected.push({ list, reason: v.reason });
        return [];
      }
      const { quote: _model, ...rest } = item; // the model's string is discarded; the source text is authoritative
      return [{ ...rest, evidence: { start: v.start, end: v.end, source: v.source, excerpt: excerptOf(text, v.start, v.end) } }];
    });
  }
  return { signals: out, rejected };
}
