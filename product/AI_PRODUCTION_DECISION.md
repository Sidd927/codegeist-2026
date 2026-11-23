# AI in production: decision memo

**Date:** 23 Nov 2026 · **Decision owner:** you (billable)

> **DECISION (23 Nov 2026): Option A, hybrid with a hard spend cap, approved by the owner.**
> - The per-installation dollar cap is **still to be named** (recommended $10, about 3,800 checks; $5 is about 1,900).
> - Nothing is configured yet. Production still has no variables, and development keeps AI **off**.
> - The variables are set together with the production deploy (runbook §1.3), after the deploy is approved.
> - The `llm` module stays in the manifest for the scope freeze.

**Recommendation:** ship the **hybrid** (AI-assisted extraction plus the deterministic rules floor) in production for the judging period, behind a hard spend cap. Use a **$10 cap** and **300 screenings a day**. If you don't approve a spend, ship **rules-only**, and make the demo and judge guide use texts the rules floor catches (already done). Either way, the panel tells the user honestly which mode produced each result.

## 1. The three policies
| | Rules-only | AI-assisted (model output decides) | **Hybrid (built)** |
|---|---|---|---|
| What runs | Lexicon + patterns → rules engine | Model output becomes the result | Model **extracts** signals; each must quote the text verbatim or it is discarded. The versioned rules engine sets the outcome; the rules floor still runs |
| Who sets the outcome | Rules engine | Model | **Rules engine** (the model never sets the outcome) |
| Failure mode | Misses paraphrase and implied data | Hallucinated or unquoted findings | Falls back to rules-only on timeout, invalid output, budget or cap, labelled "Rule-based (limited recall)" |
| Status in code | Built, default | **Not built** (rejected by design) | Built; validated live in development |

AI-only is not an option: it was rejected at design time because an unquoted or invented finding can't be verified by a reviewer. The real choice is rules-only versus hybrid.

## 2. Evidence (M2 §10; synthetic, single-author labels, directional only)
Measured through the **real product pipeline** (trigger → queue → AI → quote verifier → rules → SQL) on 34 synthetic work items.

| Set | Configuration | Escalation precision | Escalation recall | Exact outcome | Sensitive-data misses |
|---|---|---|---|---|---|
| Dev (n=22) | Rules-only | 1.00 | 0.93 | 0.59 | 0 |
| Dev (n=22) | **Hybrid, Haiku 5.5** | 1.00 | 0.93 | **0.73** | 0 |
| Held-out (n=12) | Rules-only | n/a | **0.00** | 0.00 | **4** |
| Held-out (n=12) | **Hybrid, Haiku 5.5** | 1.00 | **0.89** | **0.83** | **0** |

**Integrity:**
- 34 of 34 tool calls completed.
- **0 quotes rejected** by the verifier; 1 item dropped by schema validation.
- Model latency p50 3.5 s (range 1.9–5.7 s); processing p50 5.8 s.

**Cost:** **$0.0026 per screening (p50)** with Haiku 5.5. The M2 runs cost $0.40 in total.

**Interpretation:**
- On text written the way the floor's lexicon expects (dev set), rules-only does nearly as well.
- On **held-out, paraphrased** text it found **no** escalations and missed four sensitive-data cases that the hybrid caught.
- That is exactly the situation a judge creates when they type their own work item.
- n=34 synthetic items is far too small for any public accuracy claim; the submission makes none.

**Known rules-floor precision issue** (seen while preparing the film): a capitalised, sentence-initial verb that matches a vendor name ("Segment shoppers…") is read as a vendor. The hybrid is expected to correct this, but that hasn't been measured. Recorded as a limitation, not fixed: changing the lexicon changes the pipeline version and forces a re-check of every item.

## 3. Cost and controls (already implemented)
**Controls:**
- **Hard cap:** `A25_AI_SPEND_CAP_USD`. The worst-case cost is reserved atomically before each call, then settled to the actual token cost. The default of 0 means no calls.
- **Daily budget:** `A25_AI_DAILY_BUDGET`, with an atomic per-installation counter. Over budget, screening falls back to rules-only.
- **Fingerprint reuse:** unchanged text never triggers a second call. A manual re-check is limited to once a minute per item.

**What the recommended limits buy:**
- At $0.0026 per screening, **$10 ≈ 3,800 screenings**. The cap is per installation in the code; Forge LLM usage is billed to the app vendor (you) across all installations.
- With N judge installations, the worst case is N × $10. **Set the cap to what you're willing to pay per site.** $5 already covers about 1,900 screenings per site, far more than a judge will create.

## 4. Privacy implications
**Where the text goes:**
- With AI on, the work item's summary and description are sent to **Forge LLM**. That model is hosted by Atlassian (Claude via Atlassian's platform), so **no external egress**: the app declares no `external.fetch` permissions.
- The prompt treats the text as data, inside delimiters with an injection guard.
- Only quote-verified findings, with excerpts of 120 characters or fewer, are stored. The full text is not stored.

**Still to confirm before publication:**
- Forge LLM's data-retention and training terms. They are listed as an open item in `docs/privacy-policy-review.md`.
- The privacy policy must state AI processing explicitly if it's enabled (the draft has both variants).

**Other implications:**
- **The `llm` module is in the manifest either way.** Keeping it lets you switch AI on later without a new major version and re-consent. Removing it would make "AI never used" provable to installers, at the cost of no AI later in judging.

## 5. Reliability
- Every failure path (timeout, invalid output, budget, cap, model unavailable) falls back to rules-only. The fallback is labelled, never presented as a clean result, and tested (`pipeline.test`, `review-service.test`).
- AI output can add findings but **cannot** approve anything. The gate depends only on a human decision bound to the exact text.

## 6. Options for you
| Option | What I do after approval | Cost exposure |
|---|---|---|
| **A. Hybrid, capped (recommended)** | Set the production variables to `A25_AI_ENABLED=true`, model `claude-haiku-5-5`, `A25_AI_DAILY_BUDGET=300`, `A25_AI_SPEND_CAP_USD=<your number>`, then deploy (runbook §4) | Up to the cap × installations |
| B. Rules-only | Set `A25_AI_ENABLED=false` and `A25_AI_SPEND_CAP_USD=0` explicitly; keep the `llm` module | $0 |
| C. Rules-only, `llm` module removed | Remove `llm` from the manifest before the scope freeze | $0; AI can't be enabled during judging without re-consent |
