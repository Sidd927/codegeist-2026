// Spike C2: lambda workflow validator reading app-only KVS state.
// Payload (per docs): { issue: { key }, configuration, transition: { from, to, modifiedFields } }
// Must return { result: boolean, errorMessage?: string }.
import { kvs } from '@forge/kvs';
import { getReview, PASSING } from './review';

export const run = async (payload) => {
  const t0 = Date.now();
  const issueKey = payload?.issue?.key;
  try {
    // Test hook: simulate storage failure to observe fail-open vs fail-closed behaviour.
    const sim = await kvs.get('spike:simulate');
    if (sim === 'throw') throw new Error('Simulated validator failure');
    if (sim === 'timeout') await new Promise((r) => setTimeout(r, 60_000));

    const review = await getReview(issueKey);
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ spike: 'C2', issueKey, from: payload?.transition?.from?.id, to: payload?.transition?.to?.id, state: review?.state ?? null, kvsMs: ms }));
    if (!review) {
      return { result: false, errorMessage: `Article25: no privacy review recorded for ${issueKey}. Request a review before starting development.` };
    }
    if (PASSING.has(review.state)) return { result: true };
    return { result: false, errorMessage: `Article25: privacy review state is ${review.state}. An authorised reviewer must approve before this transition.` };
  } catch (e) {
    // Fail CLOSED on our side: any error blocks the transition with an explanatory message.
    console.log(JSON.stringify({ spike: 'C2', issueKey, error: String(e), ms: Date.now() - t0 }));
    return { result: false, errorMessage: 'Article25: review state could not be verified (temporary error). Try again or contact your privacy team.' };
  }
};
