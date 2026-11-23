# Approval validity across AI-assisted and rule-based checks: investigation and fix

**Date:** 24 Nov 2026. **Status:** a genuine defect, fixed, tested.

**The guarantee under test:** a human approval covers exactly the text, and the review conditions, under which it was granted. AI availability, spending limits and fallbacks must not weaken it.

## 1. The code path
When an approved work item's text changes:
1. The Jira trigger queues a re-check. `screening.js processJob` re-reads the item as the app and fingerprints the text.
2. `extract()` decides the check mode. If AI is unavailable, over the daily limit or spending cap, or returns invalid output, the check is **rule-based** (`mode: 'rules'`, pipeline version ending `.noai`), and labelled.
3. `notifyCompleted` → `review.js onScreeningCompleted({ issueId, screening })`:
   - If the latest decision is not an approval, or the **fingerprint is unchanged**, it returns `no_change`. Unchanged text never alters an approval.
   - Otherwise it compares the approval's stored signal set with the new screening's (`core/review.js materialChange`):
     - anything privacy-relevant added, or a more severe outcome → `APPROVAL_INVALIDATED`;
     - otherwise → `APPROVAL_RECONFIRMED` (carried over).
4. The gate (`services/gate.js`) fingerprints the **current** text and evaluates `core/gate.js evaluateGate`, which uses `deriveReviewStatus`. It allows only:
   - a verified human `APPROVED` for that exact fingerprint; or
   - a verified system carry-over of one.

## 2. Original behaviour, and why it was a defect
Step 3 never considered **how thoroughly** the edited text was checked.

**The failing case:**
- The approval was granted on an AI-assisted check.
- The edit was then checked rule-based, because AI was unavailable or over a limit.
- The edit added personal data in words the rules lexicon cannot see.

**What happened:** the signal sets matched, the approval was **carried over**, and the enforcing gate allowed the transition.

**Reproduced by test** for all four fallback causes:
- AI unavailable;
- spending cap used up;
- daily limit reached;
- invalid AI output.

In each, the edit *"Also note which neighbourhood each shopper lives in…"* (location data) produced `APPROVAL_RECONFIRMED` before the fix.

**Why this is a defect, not a design choice:**
- Rule-based checks are documented to have much lower recall: on the M2 held-out set, rules-only missed 4 sensitive items that the hybrid caught.
- Carrying an approval over on the strength of a weaker check than the reviewer relied on lets AI *unavailability* silently preserve an approval that needed renewed human review.

## 3. What was already safe (unchanged, now proven by tests)
| Situation | Why it is safe | Evidence |
|---|---|---|
| Same text, re-checked in another mode (either direction) | Approvals are bound to the text fingerprint; `onScreeningCompleted` returns `no_change` | `approval-validity.test.mjs`: "unchanged text re-checked in another mode…", "rule-based approval, AI comes back…" |
| Text edited, re-check not finished or failing | The gate compares the **current** text's fingerprint; the approval does not cover it (`PENDING_RECHECK` → `CHANGED_RECHECKING`) | "edit whose re-check fails or has not run…"; gate tests |
| A new human decision | `decide()` requires the screening and fingerprint the reviewer saw to equal the current ones (`STALE_EVIDENCE` otherwise) | review-service tests |
| AI-assisted re-check of an AI-assisted approval | New signals invalidate; harmless edits carry over | "…paraphrased new data checked AI-assisted…", "no unnecessary invalidation…" |
| AI approving, overriding or creating decisions | No code path: human decisions need a reviewer in context. System records only follow an existing human approval, and only invalidate or carry over. The rules floor always runs, so AI can add signals but never remove them | "AI never approves…", "AI cannot override a human rejection…"; pipeline tests |
| Gate consistency | A carry-over allows only if it carries a verified human `APPROVED` with an earlier sequence number | gate policy tests |

## 4. The change (smallest robust correction)
**Rule:** a carry-over now needs **both**:
- no material change; and
- a re-check **at least as thorough** as the check the human approval was based on.

**Code:**
- `core/review.js`:
  - `checkedWithAi(pipelineVersion)`: an AI-assisted version ends in `<extractor>:<model>`, a rule-based one in `.noai`; unknown is treated as not AI;
  - `recheckVerdict(...)`: `invalidate = material || (approvedWithAi && !recheckedWithAi)`.
- `services/review.js onScreeningCompleted`:
  - finds the **human** approval being carried (the latest decision itself, or the last human decision before a carry-over chain);
  - takes its check mode from its stored pipeline version; if that approval can't be found, it is treated as AI-assisted (fail safe; the gate already refuses such a state).

**What changes:**

| Approval basis → re-check | Before | After |
|---|---|---|
| AI-assisted → AI-assisted | Material: invalidate; else carry over | **Same** |
| AI-assisted → rule-based | Material: invalidate; **else carry over** | **Invalidate** (`detail.reason: LESS_THOROUGH_RECHECK`, `detail.recheck: {approvedWith: 'ai', checkedWith: 'rules'}`) |
| Rule-based → rule-based (incl. AI switched off, the development default) | Material: invalidate; else carry over | **Same** |
| Rule-based → AI-assisted | Material: invalidate; else carry over | **Same** |
| Unchanged text, any mode | No record | **Same** |

**Meaning and record:**
- No existing decision changes meaning. Decisions are append-only; the human approval stays as recorded.
- The new outcome is an ordinary, signed `APPROVAL_INVALIDATED` system record. The gate's message is unchanged: *"…needs a new privacy review, so the earlier approval no longer applies."*
- Carry-overs written before this change stay in the history as they were. If the text changes again, the new rule applies.

**Visible to reviewers:** the decision history explains the reason: *"The approval was based on AI-assisted checks, but the edited text could only be checked rule-based, which can miss new personal data. A reviewer needs to look at it again."*

**Cost:**
- While AI is unavailable or over a limit, an edit to an AI-approved item needs a reviewer, even when the edit is harmless.
- This only happens when the text changed **and** AI could not check it. It is the fail-closed choice the product makes elsewhere.
- Nothing changes for installations without AI.

## 5. Tests
**`test/approval-validity.test.mjs`** (15, new). Real screening → review → gate services; the LLM transport is mocked, with no billable calls:
- 4 × AI-assisted approval + edit re-checked rule-based (unavailable, spending cap, daily limit, invalid output) → invalidated, gate closed, human can re-approve;
- AI → AI: material change invalidated; harmless edit carried over;
- carry-over chain: AI approval → AI carry-over → rule-based re-check → invalidated;
- rule-based → rule-based carried over (AI enabled but down; and AI off entirely);
- rule-based → AI-assisted with new data → invalidated;
- same text in either mode → approval unchanged;
- re-check not run or failing → gate blocks;
- AI never approves; AI cannot override a rejection.

**`test/review.test.mjs`** (+2): `checkedWithAi` against real pipeline versions; the `recheckVerdict` truth table.

**`frontend/src/review.test.jsx`** (+1): the history explains the reason.

**`test/world.mjs`**: an optional mocked AI transport for the shared integration world. Existing tests are unchanged.

**Results:** `npm run check` passes: 204 backend, 89 UI, 24 contrast, lint, permission guard, build, budgets. CI: see the commit's GitHub Actions runs (recorded in the final report).

## 6. Release readiness of the guarantee
- With this change, no path lets AI availability, a spending or daily limit, or a fallback weaken the binding between a human approval and the exact text and review conditions it was granted under.
- Live verification of the AI-assisted paths remains automated-only, because development AI stays off by your rule.
