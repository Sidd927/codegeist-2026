# M2 — DETECT: Results

**Date:** 2026-11-22 · **Branch:** `milestone-m2-detect` (from `stage3-product-foundation`) · **App:** `article25` v4.x (development only) · **Data:** synthetic only
**Status:** ✅ **M2 complete (development).** The pipeline, persistence, rules, evidence verification and UI states are live on real Jira events, and **AI extraction is validated live**. The `llm` module and a $2 spend cap were approved on 22 Nov; **$0.40 was spent** across 70 calls (§10).

## 1. Definition-of-completion checklist
| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Jira events trigger genuine screening | ✅ live | AS-4/5/6 created → screened in ~3.6 s; updates re-screened; label-only edit skipped (§5) |
| 2 | Asynchronous processing | ✅ live | Trigger records + enqueues only; `@forge/events` consumer does the work (queue wait p50 1.8 s) |
| 3 | Results persist reliably | ✅ live | Forge SQL; Settings shows `SCREENED 4` after create, edit and delete runs; deterministic screening IDs |
| 4 | Duplicate and concurrent events handled | ✅ live + unit | 3 parallel edits → 1 `screened`, 2 `busy`, 1 `reused`; final screening matches Jira's final text |
| 5 | Deterministic rules engine works | ✅ unit + live | 14 ordered rules (`r1.0.0`) + fail-safe; trace and reasons shown in the UI |
| 6 | AI extraction integrated **or** billable dependency documented | ✅ **integrated and validated live** | 70 real Forge LLM calls through the product pipeline: 34 Haiku + 34 Sonnet eval issues, 2 smoke calls; 0 quotes rejected; §10 |
| 7 | All accepted quotations verified against source | ✅ | Verifier on every signal (AI and fallback); 0 fallback quotes rejected over 34 tickets; hallucinated quotes rejected in tests |
| 8 | Real states in panel and Margin desk | ✅ live | Not checked → Checking… → DPIA likely (no reload); Rescreening required (pipeline change); Margin highlights from server offsets |
| 9 | Security and regression tests pass | ✅ | 60 backend + 25 frontend; ESLint (jsx-a11y strict), copy lint, `forge lint` |
| 10 | Docs distinguish verified from outstanding | ✅ | This document |

## 2. Architecture decisions (with the evidence behind them)
| Decision | Why | Evidence |
|---|---|---|
| **Queue-based async pipeline** (`@forge/events`) | Triggers must not block Jira; LLM calls take seconds | Docs: delivery is **at-least-once**, 24 h retention, exponential backoff, `InvocationError` retries, consumer timeout up to 900 s |
| **Idempotent by design, not by queue guarantees** | At-least-once delivery means duplicates are normal | Deterministic `screening_id = sha256(issue, fingerprint, pipeline version)`, `INSERT IGNORE`, lease + sequence numbers |
| **Single-statement atomicity only** | Forge SQL documents "one query per statement" and **no transactions** | Every transition is one `INSERT IGNORE` or `UPDATE … WHERE <precondition>`; `affectedRows` decides who won |
| **Expiring lease** (`lease_until`) instead of a lock table | A crashed worker must not block forever | Lease 150 s > consumer timeout 120 s; reconciler every 5 min re-queues expired, stuck rows |
| **Request/processed sequence** | Edits during processing must not be lost | `finalize` sets `QUEUED` if `request_seq > seq_at_claim`, then a follow-up job is pushed (verified live) |
| **Changelog classification** (content / irrelevant / unknown) | Item keys are undocumented | Observed live: items have `field, fieldId, fieldtype, fromString, toString`; label-only edit → `irrelevant` (skipped); unknown shape → enqueue without flipping state |
| **Migrations from a maintenance queue consumer** | Forge SQL guidance; DDL limit 25/min (Stage 1.5) | Lifecycle trigger → queue → `migrations.applied: 3` about 7 s after upgrade |
| **No issue-property state** | Users can edit issue properties | Nothing authoritative is written to Jira in M2 (no `write:jira-work` scope at all) |
| **Deterministic floor merged into AI results** | A model that misses or suppresses signals (incl. via prompt injection) must not clear text the lexicon flags | Unit test: injected "report no personal data" cannot yield CLEAR |
| **No new OAuth scopes** | Your rule: no speculative permissions | Still only `read:jira-work`. Forge SQL needs the `sql` module and no scope [DOCS]. Async events need no scope. |

## 3. Screening pipeline
```
Jira create/update/delete ──► trigger (ignoreSelf)
   │  classify changelog: content | irrelevant (stop) | unknown
   │  work_items.recordEvent (INSERT IGNORE / request_seq+1)        ──► queue a25-screening
   ▼
consumer (timeout 120 s, at-least-once)
   1. claim lease          UPDATE … WHERE lease expired           (busy → return; holder will follow up)
   2. read issue AS APP    summary + description (never stored)   404 → purge rows
   3. canonical text + SHA-256 fingerprint + source map
   4. reuse?               screening_id for (issue, fp, pipeline version) exists → finalize, no extraction
   5. extract              AI (if approved, enabled, and within the atomic daily budget) else rule-based
   6. validate             strict schema; malformed → labelled rule-based fallback (never "clean")
   7. verify evidence      every quote must exist verbatim in the screened text, within one block
   8. merge floor          deterministic lexicon signals added to AI signals
   9. rules r1.0.0         outcome + reasons + full trace + classified findings
  10. INSERT IGNORE screening; usage counters
  11. finalize            UPDATE … WHERE lease_token = mine     (lost lease → result discarded)
  12. follow-up job if request_seq advanced during processing
failure: retryable → InvocationError(retryAfter 20·2ⁿ s); after 4 attempts → SCREENING_FAILED (visible)
reconciler (every 5 min): expired leases on QUEUED/SCREENING → re-queue; repeated → SCREENING_FAILED
```

## 4. Database schema (Forge SQL, idempotent DDL)
| Table | Purpose | Personal data? |
|---|---|---|
| `work_items` | `issue_id` PK, key, project, `state` (QUEUED / SCREENING / SCREENED / SCREENING_FAILED), `outcome`, `screening_id`, `screened_fp`, `request_seq`, `processed_seq`, `lease_token`, `lease_until`, `attempts`, `last_error`, `manual_request_at`, `version`, timestamps (epoch ms) | No |
| `screenings` | Immutable. `screening_id` PK (sha256), issue, `fp`, `pipeline_version`, `mode`, `model`, `outcome`, `result` (reasons, trace, criteria, findings with **offsets + ≤120-char redacted excerpts**), `quality` (dropped/rejected counts), `ai_status`, tokens, timings | **Minimal:** excerpts, with emails, phone numbers and card-like numbers redacted. **No raw description** (unit-tested). |
| `usage_daily` | AI calls (atomic budget), screenings, fallbacks, tokens per UTC day | No |

**Retention:** a deleted issue triggers removal of its `work_items` and `screenings` rows (verified live with AS-7). Superseded screenings are kept for history in M2; a retention purge is scheduled for the hardening milestone. **Access:** only through resolvers that first perform an as-user Jira read; the inbox shows only issues the caller can see (as-user JQL), using titles from that search.

## 5. Live validation (demo site, development, real Jira events)
| Scenario | Result |
|---|---|
| Migrations on upgrade | `lifecycle.migrate-queued` → `migrations.applied: 3` (≈7 s) |
| New risky item AS-4 | DPIA_LIKELY, 6–7 findings, rule-based mode labelled |
| New item AS-5 with "No functional changes" | CLEAR via **R-NEG** (the only route to CLEAR without AI) |
| New vague item AS-6 | NEEDS_INFO via **R-FALLBACK-LIMITED** (the floor cannot confirm "nothing to review") |
| Label-only edit (AS-5) | `reason: irrelevant`, not queued |
| 3 parallel description edits (AS-6) | 3 events (seq 2–4): 1 `screened`, 2 `busy`, 1 follow-up `reused`. The stored fingerprint equals Jira's final text (the workspace shows the current result, not "rescreening required"). |
| Manual re-check, unchanged text | `screening.reused` (no new screening, no extraction) |
| Pre-existing item AS-1, "Check now" | Not checked → Checking… → DPIA likely, without reload |
| Pipeline version change (fallback f1 → f2) | Old AS-4 result shown as **Rescreening required** ("rules were updated"), highlights still valid; re-check produced the corrected result |
| Delete AS-7 | `trigger.deleted` → rows purged (`SCREENED 4` remains) |
| Logs | Fields ever logged: `count, dbMs, env, evt, issueId, jiraMs, level, metric, mode, ms, outcome, queueMs, reason, resolver, shape, surface, value`. **No content, no account IDs.** |

**Two defects found live and fixed:**
1. The fallback matched "segment shoppers" as the vendor Segment. Vendor names now match case-sensitively, and the fallback version was bumped to f2.
2. Panel latency regressed to 2.07 s. Fixed with one JOIN query in parallel with the as-user read (§7).

## 6. AI extraction
- **Adapter:** `createLlmAdapter({ chat, model })`.
  - `chat` is `@forge/llm` (the `llm` module was approved for development on 22 Nov). Calls also require `A25_AI_ENABLED=true`, a daily call budget, and a **hard spend cap**: the worst-case cost is reserved atomically in `ai_spend` before each call and settled to the actual token cost after (`A25_AI_SPEND_CAP_USD`, default 0 = off).
  - Model default `claude-haiku-5-5` (research doc 15 §7.5), configurable via `A25_AI_MODEL`.
  - `tool_choice: 'auto'` (forced choice is rejected by the 5.5 models [VERIFIED Stage 1]); 25 s timeout.
- **Schema:**
  - **Signal lists** (each with `evidence_quote`):
    - `categories` (11 enums, `basis: explicit|implied`);
    - `criteria` (WP248 c1–c9);
    - `recipients` (`name`, `external`);
    - `transfers`, `retention`, `purposes`, `no_personal_data_statement`.
  - **Other fields:** `data_subjects`, `open_questions` (topic enum), `change_type` (7 enums).
- **Strict validator:**
  - non-object or missing required fields → **malformed** (the whole response is rejected and falls back);
  - unknown enums, wrong types, missing quotes and overflow beyond 12 items → item **dropped and counted**;
  - nothing is repaired.
- **Evidence verification** (server-side, for every quote, from AI or fallback):
  - normalised substring match tolerant of case, whitespace runs, and straight or curly quotes and dashes;
  - returns **original** offsets;
  - the match must lie inside one source block (summary or one description block): traceable;
  - quotes that are too short (<3), too long (>300), missing or unmatched are rejected and counted;
  - the model's own string is discarded and the source text is authoritative.
- **Prompt-injection defences:**
  - the item is delimited as data;
  - the model cannot set outcomes;
  - the deterministic floor is merged in;
  - a "no personal data" statement only clears when no category is found by either source.
- **Mocked tests (no billable calls):** valid tool call, hallucinated quote, malformed text reply, schema-invalid arguments, transport error/timeout, over-budget, benign AI CLEAR, prompt injection.
- **Verified live (§10):** real model behaviour with this schema, quote verification, latency, cost and eval quality.

## 7. Performance (measured live, development, 22 Nov 2026)
| Metric | n | p50 | Range | Note |
|---|---|---|---|---|
| Event → result (queue wait + processing) | 7 | ≈ 3.6 s | 2.4–4.8 s | Target p90 ≤ 30 s: met with a large margin (rule-based; AI adds ~3.5 s, measured in Stage 1) |
| Queue wait (enqueue → start) | 7 | 1,790 ms | 636–2,227 | — |
| Processing (screened) | 7 | 1,824 ms | 1,736–2,594 | — |
| SQL time per screening | 7 | 1,377 ms | 1,249–1,955 | ~7 statements at ~200 ms each: the largest cost |
| Jira read per screening | 7 | 286 ms | 237–479 | — |
| Processing (reused) | 2 | 1,357 ms | 1,345–1,369 | SQL 553–603 ms |
| Model invocation (Haiku 5.5, live) | 34 | 3,550 ms | 1,925–5,676 | AI processing end to end p50 5.8 s (Sonnet: model 3.8 s) |
| `getPanelState` server | — | 534 ms → **~280 ms** | — | After JOIN + parallel read |
| **Panel first content (warm)** | 6 | 2,069 ms → **1,378 ms** | 1,129–1,925 | Budget ≤ 1,500 ms ✅. Cold start after deploy: 6.9 s. |
| Desk first content (warm) | 3 | 1,839 ms | 1,582–5,005 | Small sample |
| Bundle (initial gzip) | — | panel 187.0 KB (+4.3), desk 194.3 KB (+5.7) | — | Budgets 200 / 400 KB ✅ |

## 8. Cost estimate (from verified Forge LLM pricing, research doc 15 §7.1)
Rates:
- **Haiku 5.5:** $0.50 per 1M input tokens and $2.50 per 1M output tokens (5 credits).
- **Sonnet 5.5:** $2 / $10.

The M2 prompt and schema are larger than Stage 1's: an **estimated** ~1,350 input and ~500 output tokens per screening.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Per screening (estimate) | ≈ $0.0019 | ≈ $0.0077 |
| 1,000 screenings | ≈ $1.90 | ≈ $7.70 |
| Proposed M2 validation (34-ticket eval × Haiku + × Sonnet, plus ~40 live dev screenings on Haiku) | ≈ $0.07 + $0.26 + $0.08 ≈ **$0.41** | |

**Controls:**
- fingerprint reuse (no AI call for unchanged text);
- an atomic daily budget (default 200/day per installation);
- AI off unless `A25_AI_ENABLED=true` **and** the module is approved.

## 9. Evaluation (non-billable, product pipeline, `npm run eval`)
| Set | Mode | Esc. precision | Esc. recall | Flag recall | Exact outcome | Sensitive misses |
|---|---|---|---|---|---|---|
| Dev (n=22) | rule-based floor | 1.00 | 0.93 | 1.00 | 0.59 | none |
| **Held-out (n=12)** | rule-based floor | n/a (no escalations) | **0.00** | **1.00** | 0.00 | **H01, H02, H03, H11** |

**Interpretation:**
- The floor on its own cannot detect paraphrased or implied sensitive data. Held-out recall is lower than Stage 1's 0.11 because the product lexicon removed noisy generic terms ("location", "name").
- Its fail-safe works as designed: nothing is wrongly CLEARed, and everything is held at NEEDS_INFO.
- This is the measured reason the AI extractor is required.
- Same caveats as Stage 1: n=34, a single author, synthetic, directional only.

## 10. Live AI validation (approved 22 Nov 2026; cap $2; spent $0.40)
**What was done:**
- **Manifest:** `llm` module added (major version 4 in development; the dev installation was upgraded and re-consented).
- **Development-only variables:** AI on, cap $2, 150 calls/day, model Haiku 5.5. Production has no Article25 variables and no deployment.
- **Method:** the eval ran through the **real product path**. The 34 synthetic tickets were created as `[A25-EVAL …]` Jira issues, and the live trigger → queue → AI → verify → rules → SQL pipeline screened them. Results were scored from **content-free logs** (outcome codes, counts, timings, cost). All 68 eval issues were then deleted: 68/68 purge events, no errors.

**Finding 1: output truncation (fixed).**
- The first smoke call used exactly the 900-token output limit (`tokensOut: 900`), and the truncated tool call failed validation.
- The fail-safe worked: the result was labelled rule-based, "The AI response was invalid and was discarded", and was not clean.
- Fix:
  - output budget raised to 2,000 tokens;
  - prompt asks for minimal quotes and no prose outside the tool call;
  - extractor version `x2`;
  - finish reason now logged (as an enum).
- The re-check then succeeded with `finish: tool_use` and 896 output tokens: the answer genuinely needed about 900.

**Quality (product pipeline, synthetic set, single-author labels: directional only):**
| Set | Configuration | Esc. precision | Esc. recall | Flag recall | Exact outcome | Sensitive misses |
|---|---|---|---|---|---|---|
| Dev (n=22) | Rule-based floor only | 1.00 | 0.93 | 1.00 | 0.59 | 0 |
| Dev (n=22) | **Haiku 5.5 + floor** | **1.00** | **0.93** | 1.00 | **0.73** | 0 |
| Dev (n=22) | Sonnet 5.5 + floor | 1.00 | 0.86 | 1.00 | 0.73 | 0 |
| Held-out (n=12) | Rule-based floor only | n/a | **0.00** | 1.00 | 0.00 | **4** |
| Held-out (n=12) | **Haiku 5.5 + floor** | **1.00** | **0.89** | 1.00 | **0.83** | **0** |
| Held-out (n=12) | Sonnet 5.5 + floor | 1.00 | 0.89 | 1.00 | 0.75 | 0 |

**Mismatches (Haiku):**
- **H09** churn prediction → NEEDS_INFO, gold DPIA_LIKELY. This is the only held-out escalation miss.
- **T05** → REVIEW_REQUIRED, gold DPIA.
- **T03** → NEEDS_INFO, gold REVIEW: rule R-OQ asks who the SMS provider is.
- **T17** → NEEDS_INFO, gold CLEAR: conservative.
- **T04** → NEEDS_INFO, gold INVENTORY_UPDATE.
- **T07, T11, H02** → DPIA, gold REVIEW: more conservative than the labels.

| Integrity and cost | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Calls / tool-call completions | 34 / 34 (`tool_use`) | 34 / 34 |
| Quotes rejected by verifier | **0** | **0** |
| Items dropped by schema validation | 1 | 2 |
| Tokens in / out (p50) | 1,828 / 654 | 1,828 / 562 |
| Model latency p50 (range) | 3.5 s (1.9–5.7) | 3.8 s (1.7–5.2) |
| Processing p50 (queue p50) | 5.8 s (1.1 s) | 5.9 s (0.7 s) |
| **Cost per screening (p50)** | **$0.0026** | $0.0093 |
| Run total | $0.084 | $0.311 |

**Decision:** keep **`claude-haiku-5-5`** as the default. It matches or beats Sonnet 5.5 on this set at about 28% of the cost, consistent with Stage 1. **Total spend** (smoke tests + both runs): **70 calls, $0.4017**, from content-free `costMicros` logs, with the atomic cap of $2.00 never approached.

**Caveats:**
- n=34, synthetic, labels by a single author;
- these are product-pipeline results (AI merged with the deterministic floor), not model-only results;
- an independent, larger labelled set is still needed before any public accuracy claim.

## 11. Security and privacy
- **Logging:** no ticket content in logs. An allow-listed logger, verified on live logs (§5).
- **Responses:** no personal identifiers. Responses contain issue keys, outcomes, findings with redacted excerpts, and titles from as-user search only. Tested: no `accountId` / `email` / `displayName`.
- **Authorisation:**
  - **Server-side:** the panel, workspace and re-check do an as-user read first, and SQL data is withheld on failure (tested). Settings and schema are admin-only. Inbox visibility comes from as-user JQL.
  - **No user-editable approval records:** no Jira writes at all in M2.
- **Failure is never "clean":** failures are `SCREENING_FAILED`; malformed AI output falls back to the labelled floor; the floor never yields CLEAR without explicit negation.
- **Strict validation:**
  - **Issue keys and ids:** validated with regexes.
  - **Model output:** strict schema.
  - **Quotes:** verbatim verification.
  - **Metrics:** numeric only.
  - **Server ranges:** checked again in the UI.
- **Rate and cost limits:** a manual re-check at most once per minute per item (conditional `UPDATE`), an atomic AI budget, and fingerprint reuse.
- **Secrets:** none in source. The `A25_*` settings are non-secret environment variables.

## 12. Known limitations
1. **AI quality** is measured only on 34 synthetic, single-author tickets (§10). No public accuracy claim yet.
2. **The rule-based floor has low precision as well as low recall.** Live example: "health profile" also matched profiling (c1). The AI is expected to disambiguate this; not yet measured.
3. **Transfers, retention and purposes come only from the AI.** The floor cannot detect them (live AS-6 missed "in the Philippines").
4. **SQL latency** dominates processing (~200 ms per statement). Statement batching (e.g. a single upsert for usage) is a hardening item.
5. **No inventory yet** (approved vendors, project categories). R-VENDOR says "no approved-vendor list configured", and R-NEWCAT is inactive until M8.
6. **Settings come from environment variables** (scope, AI switch, budget). The admin UI is M8.
7. **Server-side rate limit** is verified in unit tests. Live, the UI hides Re-check while a check is running, so a second request could not be issued from the UI.
8. **Superseded screenings are not yet purged** (retention job pending). Retention for deleted issues works.
9. **The reconciler is verified in unit tests only**; no live stuck-lease scenario has been forced.
10. **Cold start:** 6.9 s for the panel's first load after deploy.

## 13. Differences from the Stage 2 blueprint
| Blueprint | Implemented | Reason |
|---|---|---|
| `settings` table + admin UI | Environment variables | Admin UI is M8; avoids a half-built settings store |
| Display issue property written after screening | **Not written** | Your M2 rule (no authoritative state in user-editable properties). It would also need `write:jira-work`. |
| `outbox`, `gate_events`, `decisions`, `chain`, `audit` tables | Not created | Later milestones (M3+) |
| Retention purge of superseded screenings (90 days) | Not yet | Hardening milestone |
| AI cost control: daily budget | Daily budget **plus a hard cumulative dollar cap** with atomic reservation | Approval condition for live AI (new) |
| Outcome vocabulary | Unchanged (CLEAR, INVENTORY_UPDATE, NEEDS_INFO, REVIEW_REQUIRED, DPIA_LIKELY + SCREENING_FAILED); display adds `RESCREEN_REQUIRED` | Display-only state |
| AI path | AI **plus** a merged deterministic floor | Prompt-injection and model-miss defence (new) |

## 14. Dependencies for the next milestone (M3: review, decide, ledger)
- **AI is live in development** (Haiku 5.5, $2 cap). Before production: set a production cap and budget deliberately, and freeze the `llm` module with the other scopes.
- **Not re-verified:** the desk's Re-check button refreshing in place after an AI screening. The panel's in-place refresh was verified earlier in M2; a screenshot of the desk after Re-check was stale until reload. Re-test in M3.
- **M3 needs:**
  - `read:jira-user` (reviewer group check);
  - possibly `write:jira-work` (receipts);
  - the decision tables and `chain-core` port.
- Scope freeze **4 Dec** must include `llm`, `read:jira-user`, Confluence scopes and the TWG decision (D2).
