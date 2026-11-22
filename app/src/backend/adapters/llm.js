// AI extraction adapter. The LLM transport (`chat`, i.e. @forge/llm) is injected so the adapter is
// testable without billable calls. While `chat` is null (no `llm` module approved in the manifest),
// AI is unavailable and screening uses the deterministic extractor, clearly labelled.
import { SYSTEM_PROMPT, TOOL, toolArgumentsFrom } from '../../core/extraction/schema.js';

export const AI_STATUS = Object.freeze({
  OK: 'ok',
  NOT_ENABLED: 'not_enabled', // no approved LLM module / switch off
  OVER_BUDGET: 'over_budget',
  UNAVAILABLE: 'unavailable', // transport error or timeout
  MALFORMED: 'malformed_output', // no valid tool call / schema violation
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);

/**
 * @param {{ chat: Function|null, model: string, timeoutMs: number, maxTokens?: number }} opts
 */
export function createLlmAdapter({ chat, model, timeoutMs, maxTokens = 2000 }) {
  return {
    available: typeof chat === 'function',
    model,
    maxTokens,
    /** @returns {Promise<{ status: string, raw?: object, usage?: object, ms: number }>} */
    async extract(text) {
      const t0 = Date.now();
      if (typeof chat !== 'function') return { status: AI_STATUS.NOT_ENABLED, ms: 0 };
      let res;
      try {
        res = await withTimeout(
          chat({
            model,
            max_completion_tokens: maxTokens,
            messages: [
              { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
              { role: 'user', content: [{ type: 'text', text: `<ITEM>${text}</ITEM>` }] },
            ],
            tools: [TOOL],
            tool_choice: 'auto', // forced tool choice is rejected by the 5.5 models (verified, research doc 15 §7.1)
          }),
          timeoutMs,
        );
      } catch {
        return { status: AI_STATUS.UNAVAILABLE, ms: Date.now() - t0 };
      }
      const raw = toolArgumentsFrom(res);
      const finish = String(res?.choices?.[0]?.finish_reason ?? res?.choices?.[0]?.stop_reason ?? 'unknown').slice(0, 32);
      const usage = { tokensIn: res?.usage?.prompt_tokens ?? res?.usage?.input_tokens ?? null, tokensOut: res?.usage?.completion_tokens ?? res?.usage?.output_tokens ?? null };
      return raw ? { status: AI_STATUS.OK, raw, usage, finish, ms: Date.now() - t0 } : { status: AI_STATUS.MALFORMED, usage, finish, ms: Date.now() - t0 };
    },
  };
}
