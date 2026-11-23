// Forge LLM pricing from the runtime model list (credits per 1M tokens). Forge pricing:
// $0.10 per input credit and $0.50 per output credit (verified in Stage 1, research doc 15 §7.1).
// Unknown models are priced at a conservative Opus tier so the spend cap can never be underestimated.
const FALLBACK = { inputCreditsPerMillionTokens: 50, outputCreditsPerMillionTokens: 50 };

export function createPricing(listModels) {
  let cache = null;
  async function ratesFor(model) {
    if (!cache) {
      try {
        const l = await listModels();
        cache = Object.fromEntries((l?.models ?? []).map((m) => [m.model, m.pricing]));
      } catch {
        cache = {};
      }
    }
    const p = cache[model] ?? FALLBACK;
    // USD per token × 1e6 = micro-USD per token
    return { inMicros: (p.inputCreditsPerMillionTokens ?? 50) * 0.1, outMicros: (p.outputCreditsPerMillionTokens ?? 50) * 0.5 };
  }
  return {
    ratesFor,
    /** Cost in micro-USD for a call (rounded up). */
    async costMicros(model, tokensIn, tokensOut) {
      const r = await ratesFor(model);
      return Math.ceil((tokensIn ?? 0) * r.inMicros + (tokensOut ?? 0) * r.outMicros);
    },
  };
}

/** Input-token upper bound for reservations: one token per character (ordinary text averages 3–4
 *  characters per token), plus the system prompt and tool schema. Over-reserving is harmless (it is
 *  settled to the actual cost right after the call); under-reserving could let the cap be exceeded. */
export const estimateInputTokens = (textChars) => textChars + 1_600;
