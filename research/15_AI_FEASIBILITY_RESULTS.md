# 15 — AI Feasibility Results (Spike D)

**Date:** 2026-11-22 · **Data:** synthetic only, no real Jira/Confluence content
**Billable LLM calls:** none at first writing (§1–§6). After explicit user approval (cap $5): **170 calls, ≈ $1.28** (§7, results added later the same day).
> **Read §7 first.** §1–§6 are the pre-approval analysis and are kept unchanged for traceability. Some of their assumptions (model list, pricing, enablement) were corrected by the live run in §7.
**Code:** `spikes/article25-ai-spike/` (`dataset/`, `baseline/`, `forge-llm-harness/`)

---

## 1. Forge LLM: availability, configuration, cost (desk research + harness prepared)

| Question | Finding | Status |
|---|---|---|
| Enabled for our developer account? | Cannot check until `forge login` completes. No documented account-level switch: the `llm` manifest module is declared, and usage is billed to the developer's Forge bill ([pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/)). | **UNVERIFIED** (blocked on auth) |
| Manifest | `modules.llm: - key: …, model: [claude]` (verbatim from the [API reference](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/)) | Verified (docs) |
| Admin permission | Adding the `llm` module (or a new model family) is a **major version upgrade requiring admin approval**. Admins are informed at install. ([overview](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/)) | REQUIRES ADMIN ACTION (at install/upgrade) |
| Structured output | `chat()` accepts `tools` + `tool_choice`, and responses contain `tool_calls[].function.arguments` (`@forge/llm` 1.0.10 README, inspected locally). No JSON-schema `response_format` documented, so tool calling is the structured-output path. | Verified (SDK docs) |
| Invocable from our backend | Yes: `@forge/llm` in any Forge function. Harness uses a resolver (55 s limit) with batching. | Verified (docs); runtime UNVERIFIED |
| Models | Docs list `claude-sonnet-5` (active, retires ≥ 30 Jun 2027), `claude-opus-5`, `claude-opus-4-6/4-7/4-8`, `claude-sonnet-4-5/4-6`, `claude-haiku-4-5` (retirement window opened 15 Oct 2026, so avoid). Harness default: `claude-sonnet-5`, overridable via `A25_MODEL`. `list()` will confirm at runtime. | Docs verified; runtime UNVERIFIED |
| Pricing | Pricing page table: Opus 4.6 = 50 credits/1M; Sonnet 4.5 = 30; Haiku 4.5 = 10. Input credit $0.10, output credit $0.50 → Sonnet 4.5 $3 / $15 per 1M tokens. **No free allowance.** **Sonnet 5 and Opus 5 are not on the pricing table**, so assume tier pricing (Sonnet-tier $3/$15; Opus-tier $5/$25). | COST DEPENDENT |
| Is `list()` billable? | Not documented. Expected to be metadata only (no tokens). Will check the developer-console usage after calling it. | UNVERIFIED |

### Cost estimate for the proposed evaluation (34 synthetic tickets)
| Item | Tokens (est.) | Sonnet-tier | Opus-tier |
|---|---|---|---|
| Per call | ~800 input (system ~110 + tool schema ~600 + item ~90), ~300 output | ~$0.0069 | ~$0.0115 |
| One pass, 34 tickets | ~27k in / ~10k out | **~$0.23** | ~$0.39 |
| Plan: 3 Sonnet passes (consistency) + 1 Opus pass (comparison) | | ~$0.70 | ~$0.39 |
| **Total planned** | | **≈ $1.10** | |
| **Requested approval cap** | | **$5.00** (hard stop) | |

**Guardrails built into the harness:** billable `evaluate` refuses to run unless the environment variable `A25_LLM_APPROVED=true` is set with `forge variables set`. Batches are explicit (ticket IDs listed). `max_completion_tokens: 800`. No real data: the dataset is bundled from synthetic JSON.

---

## 2. Synthetic dataset

| Set | File | N | How built | Caveat |
|---|---|---|---|---|
| Development | `dataset/tickets.json` | 22 | Written and labelled **before** the baseline rules; covers all 10 requested categories (no PD, ordinary, sensitive, location, profiling, third-party sharing, employee, ambiguous, existing-approved, high-risk) plus tricky negatives | Rules were then written while looking at this set, so results on it are **optimistic** |
| Held-out | `dataset/heldout.json` | 12 | Written **after** freezing rules at `baseline-0.1`: paraphrases, implicit sensitive data (diabetes, visual impairment, halal/kosher, ages 10–15), new vendors not in the dictionary, negatives that mention "location"/"customer" | Same single author, so not independent; **too small for statistically meaningful rates** |

Labels: outcome on the scale CLEAR < INVENTORY_UPDATE < NEEDS_INFO < REVIEW_REQUIRED < DPIA_LIKELY, plus categories, sensitive flag and vendors. All labels are single-annotator judgements, not legal determinations.

## 3. Deterministic baseline (`baseline/screen.mjs`, rules `baseline-0.1`)

Lexicon (11 categories, ~120 patterns), WP248-criteria patterns, vendor dictionary + register diff, negation/neutral-change/vagueness cues → ordered outcome rules. Each signal carries a ~80-character evidence excerpt from the source text.

### Results (actual output of `node baseline/evaluate.mjs`)
"Escalation" = outcome ≥ REVIEW_REQUIRED (needs a human privacy review).

| Metric | Dev set (n=22, optimistic) | **Held-out (n=12)** |
|---|---|---|
| Escalation precision | 1.000 (14 TP / 0 FP) | **0.500** (1 TP / 1 FP) |
| Escalation recall | 1.000 (0 FN) | **0.111** (8 FN) |
| Exact outcome accuracy | 0.864 | **0.250** |
| Category micro precision / recall | 0.853 / 1.000 | 0.667 / **0.143** |
| **Sensitive-data false negatives** | none | **H01 (diabetes/insulin), H02 (visual impairment), H03 (halal/kosher → religion), H11 (children aged 10–15)** |
| Processing time | 0.19 ms/ticket | 0.31 ms/ticket |
| Cost | $0 | $0 |

**Held-out failure analysis:**
- **Lexical brittleness:** "blood sugar", "insulin", "visually impaired", "halal", "aged 10 to 15", "screenshot of each contractor's desktop", "likely to cancel", "outsourcing partner in the Philippines": none of these appear in the lexicon. Each is an obvious paraphrase for a human.
- **Unknown vendors:** "Install Hotjar" and "Freshdesk" are not in the dictionary. (Freshdesk was escalated only because "Zendesk" matched.)
- **False positive:** "warehouse location (Berlin, Leeds, Austin)" was treated as personal location data. The baseline has no notion of *whose* data it is.
- **Rule-design bug:** when a risk pattern fired (e.g. "every 15 minutes" monitoring) but no category matched, the outcome fell through to CLEAR.

### Post-hoc structural variant `baseline-0.2-failsafe` (clearly labelled post-hoc)
A structural change only, with no new lexicon terms: any risk-pattern hit or unknown capitalised product name after an integration verb can no longer be CLEAR (minimum NEEDS_INFO). Results (`node baseline/evaluate_failsafe.mjs`), "flagged" = any outcome ≠ CLEAR:

| | Dev | Held-out |
|---|---|---|
| Flag recall | 0.941 | **0.556** |
| Flag precision | 1.000 | 0.833 |

Still misses H03 (religion inferred from halal/kosher), H09 (churn prediction), H10 (offshore transfer) and H11 (children). These are exactly the semantic inferences a keyword system cannot make.

## 4. Conclusion so far (pre-LLM)

1. **Deterministic screening alone is NOT sufficient for Article25's core promise** ("catch it at the epic"). It generalised very poorly to paraphrased tickets and missed 4 of 4 implicit sensitive-data cases on the held-out set. **This reverses an assumption in research doc 05**, which treated the deterministic pre-pass as an adequate fallback.
2. Deterministic logic remains the right tool for **decisions** (register diff, WP248 counting, outcome thresholds, gating) and as a **cheap fail-safe floor**, but not for **detection**.
3. Therefore AI-assisted extraction is likely **essential, not optional**, for product quality. That makes the product **COST DEPENDENT** (Forge LLM, billed per token to us) unless Rovo can perform extraction on demand.
4. The LLM must still be proven: availability on our account, structured output reliability, evidence validity, and recall on implicit sensitive data. **The harness is ready; the run awaits explicit cost approval (cap $5, expected ≈ $1.10).**

## 5. LLM evaluation plan (to run after approval)
1. `list()` → confirm `claude-sonnet-5` is active (record the response; check usage in the console).
2. 3 passes over dev + held-out with Sonnet-tier (consistency: same outcome across passes?), 1 pass with Opus-tier.
3. Per ticket: categories, criteria, vendors, open questions, retention, dropped-evidence count (quotes not found in source), latency, tokens.
4. Feed LLM signals into the **same deterministic outcome rules** and compute the same metrics as §3. Special attention to sensitive false negatives.
5. Report actual numbers here, including failures. With n=34, results are directional only.

## 6. Data protection notes
- Forge LLM is Atlassian-hosted (Bedrock), with no third-party egress from our app. The app remains eligible for Runs on Atlassian ([overview](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/)).
- Requests are moderated like first-party Atlassian AI (high-risk messages blocked). This is relevant: privacy tickets about health or children might trigger moderation, which needs testing.
- No external model providers were evaluated. They would add egress, DPA and terms obligations, and would lose Runs on Atlassian.

---

## 7. LIVE LLM EVALUATION (run after explicit user approval, cap $5)

**App:** `article25-llm-spike` (`49315148-f001-4040-bfc9-b53476bf231d`), development environment, installed on the demo site (Jira).
**Guards:** env var `A25_LLM_APPROVED=true` (set for the run, then **set back to `false` and redeployed**), plus an in-app $4 spend cap.
**Raw data:** `spikes/article25-ai-spike/results/llm_results.jsonl` (170 rows). **Scores:** `results/llm_scores.json` (from `baseline/evaluate_llm.mjs`).

### 7.1 Availability, configuration, cost (corrections to §1)
| Item | Actual finding |
|---|---|
| Enablement | **No account switch needed.** Declaring the `llm` module, deploying and installing was enough. The first call billed to the Developer Space (billing terms accepted at Developer Space creation). |
| Admin approval | Install via CLI with `--confirm-scopes` (site admin). Doc says adding `llm` to an existing app = major version upgrade. Not re-tested. |
| Models (`list()`, runtime) | 11 active: `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-opus-4-6/4-7/4-8`, `claude-sonnet-5`, `claude-opus-5`, **`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`**. The models doc page lists only up to `claude-opus-5`, so `list()` is the source of truth. Retirement dates for the 5.5 models are **unverified**. |
| Runtime pricing (`list()` credits per 1M tokens) | Haiku 4.5: 10 · Sonnet 4.5/4.6: 30 · **Sonnet 5/5.5: 20** · Opus 4.6–5: 50 · **Opus 5.5: 40** · **Haiku 5.5: 5**. At $0.10/input credit and $0.50/output credit (pricing page): Sonnet 5.5 = **$2 in / $10 out** per 1M. |
| Structured output | **Forced `tool_choice` is rejected** by `claude-sonnet-5-5`: `tool_choice: type "tool" and "any" are not supported for this model.` (whole first attempt failed at $0). With `tool_choice: "auto"` plus a system instruction, **170/170 calls used the tool**. A JSON-text fallback exists but was never needed. |
| Spend (sum of per-call usage × runtime price) | Sonnet 5.5 ×3: $0.237 + $0.238 + $0.238 · Opus 5.5: $0.503 · Haiku 5.5: $0.067 · **Total ≈ $1.28.** To confirm against the developer-console bill. |
| Tokens per call | ~1,190 input (incl. tool schema) / ~460 output (Sonnet) → **≈ $0.007 per screening** with Sonnet 5.5, **≈ $0.002** with Haiku 5.5 |
| Latency (per call, median / max) | Sonnet 5.5 **3.4 s** / 5.2 s · Haiku 5.5 3.5 s / 5.4 s · Opus 5.5 5.7 s / 7.9 s |
| Spend-counter race | The in-app cumulative counter under-counted when passes ran concurrently (read-modify-write on one KVS key). This is the same lost-update class as the register (doc 17). **The cap guard is not reliable under concurrency.** Use atomic/transactional counters. |
| Moderation | No calls blocked, including health/children/religion tickets (H01, H03, H11, T05, T19, T22) |

### 7.2 Quality results (same deterministic outcome rules applied to LLM-extracted signals; the LLM never chooses the outcome)
"Escalation" = outcome ≥ REVIEW_REQUIRED. "Flag" = outcome ≠ CLEAR.

**Held-out set (n=12, written after the baseline rules were frozen):**
| Configuration | Esc. precision | **Esc. recall** | Flag recall | Exact outcome | Category recall | **Sensitive FN** |
|---|---|---|---|---|---|---|
| baseline-0.1 (keywords) | 0.50 | **0.11** | 0.22 | 0.25 | 0.14 | **4 (H01, H02, H03, H11)** |
| baseline-0.2-failsafe | 0.50 | 0.11 | 0.56 | 0.25 | 0.14 | 4 |
| Sonnet 5.5 pass 1 / 2 / 3 | 1.00 | **1.00** | 1.00 | 0.75 / 0.83 / 0.83 | 0.93 | **0** |
| Opus 5.5 | 1.00 | **1.00** | 1.00 | 0.83 | 1.00 | **0** |
| Haiku 5.5 | 1.00 | **1.00** | 1.00 | 0.83 | 0.93 | **0** |

**Dev set (n=22; the baseline rules were written against it, so the baseline is optimistic here):**
| Configuration | Esc. precision | Esc. recall | Exact | Escalation FN | Escalation FP |
|---|---|---|---|---|---|
| baseline-0.1 | 1.00 | 1.00 | 0.86 | — | — |
| Sonnet 5.5 (all 3 passes identical) | 0.81 | 0.93 | 0.68 | T03 | T15, T16, T17 |
| Opus 5.5 | 0.87 | 0.93 | 0.68 | T03 | T15, T16 |
| Haiku 5.5 | 0.93 | 0.93 | 0.73 | T03 | T15 |

**Evidence quality:** **0 dropped evidence items in 170 calls.** Every extracted category, criterion and vendor carried a quote that the verifier found verbatim in the source text. Quotes were specific, e.g. `behavioural: «Recordings capture clicks, scrolls and form interactions.»`.

**Consistency (Sonnet 5.5, 3 passes):** same final outcome on **33/34** tickets. The disagreement was H09 (churn prediction): REVIEW_REQUIRED / DPIA_LIKELY / DPIA_LIKELY.

**Open questions:** high quality and relevant, e.g. T03 "Is the SMS sent by a third-party provider? If so, which one?"; T10 "Are form fields … masked or excluded from recordings?".

### 7.3 Error analysis
| Ticket | What happened | Root cause | Fix direction |
|---|---|---|---|
| T03 (missed escalation, all models) | Extracted `contact` correctly and **asked about the unnamed SMS provider**, but the outcome rules treat `contact` as an existing category and ignore open questions → INVENTORY_UPDATE | **Rules gap**, not extraction | Escalate to NEEDS_INFO/REVIEW when open questions concern third parties, transfers or sensitive data |
| T17 (FP, Sonnet only) | Extracted `identifiers` from "password reset email" bug fix | Over-extraction on change-neutral tickets | Add "change type" signal (bug fix / refactor / no new processing) to the schema; rules down-weight |
| T15, T16 (escalated vs. gold NEEDS_INFO) | Vague tickets went to REVIEW_REQUIRED | Conservative; arguably acceptable for privacy | Product decision: is vague + personal data → review or ask? |
| T07, T11, H03 (DPIA_LIKELY vs. gold REVIEW) | Extra WP248 criteria inferred (e.g. combining datasets, profiling) | Criteria extraction is generous | Show criteria as "suggested" for the DPO to confirm; keep the DPIA threshold human-confirmed |
| H12 (REVIEW vs. gold DPIA) | Desktop screenshots of contractors: monitoring found, vulnerability (employees) not always | Under-inference of c7 | Rule: `employee` + `c3_systematic_monitoring` ⇒ add c7 |

### 7.4 Limitations (do not over-read these numbers)
- **n = 34 synthetic tickets** written and labelled by one author (the assistant). The labels are judgements, not legal determinations, and the held-out set is not independent of the author.
- These are **directional** results. Real tickets are terser, messier, multilingual and full of jargon.
- Before any public claim: get an **independent labeller** (ideally someone with privacy expertise) and a larger set (≥100), including real-style tickets from consenting teams or public issue trackers.

### 7.5 Conclusion
1. **AI-assisted extraction is justified, and is in fact necessary** for Article25's detection promise. It moved held-out escalation recall from **0.11 → 1.00** and eliminated the sensitive-data misses (4 → 0), with fully verifiable evidence quotes.
2. Precision is moderate (0.81–0.93 on dev), so a human DPO decision is still needed. That's consistent with the product design (AI proposes signals, rules propose an outcome, a human decides).
3. **Recommended default model: `claude-haiku-5-5` or `claude-sonnet-5-5`.** Haiku 5.5 matched Sonnet on held-out recall, had the best dev precision here, and costs ~3.5× less. With n=34 the difference isn't significant, so evaluate both on a larger independent set. Opus 5.5 offered no measurable gain at ~2× Sonnet's cost and ~1.7× its latency.
4. Keep the **deterministic baseline as a fail-safe floor** (LLM unavailable/cap reached), clearly labelled as low-recall.
5. Cost is not a blocker: **≈ $0.002–0.007 per screening**, so 1,000 judge/demo screenings ≈ $2–7.
6. **Must-fix before MVP:** non-forced tool choice; rules that use open questions; a change-type signal; atomic spend cap; per-ticket content-hash caching.
