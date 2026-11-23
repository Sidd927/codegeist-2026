# M3 — REVIEW: Results

**Milestone:** M3 Review ("production-quality reviewer experience") · **Branch:** `milestone-m3-review` (stacked on `milestone-m2-detect`) · **Date:** 22–23 Nov 2026
**Environment:** development only (`article25`, dev install on the demo site, app version 5). **AI stayed disabled for the whole milestone; no billable AI calls; no production deploy. The Jira workflow gate is not active.**

## 1. Definition-of-completion checklist
| Requirement (M3 brief) | Status | Evidence |
|---|---|---|
| Reviewer inbox with real items: key, summary, project, outcome, review status, reviewer, age | ✅ | §5 live run; `desk.inbox` |
| Filters (status view, outcome, project, reviewer), urgency + age ordering, pagination | ✅ | server-side; tests in `review-service.test.mjs`, `foundation.test.jsx` |
| Empty, loading, error, permission states; route to the workspace | ✅ | UI tests; live |
| Never expose issues the user cannot browse; server-side filtering; minimal requests | ✅ | as-user JQL visibility check; one SQL statement for candidates + one for the visible page's screenings |
| Margin workspace: actual text, highlights from server offsets, numbered findings with exact quotes | ✅ (M2) + kept | live (AS-78 before/after edit) |
| Why each finding was detected; AI vs rule provenance | ✅ (M2) + kept | "Found by AI · quote verified" / "Found by rules" |
| Purpose, categories, recipients, retention, transfers when supported by evidence | ✅ | "What the text says" (verified quotes only; honest "not assessed by the rule-based check") |
| Uncertainty / missing info; inspect in Jira; stale findings; no highlight reuse on changed text | ✅ | open questions; highlights hidden when the text changed; new highlights after re-screen (live) |
| Authorised reviewer assignment, reassignment, inactive reviewers, history; no Teamwork Graph dependency | ✅ | reviewer-group strategy; live assignment; inactive handling (tests) |
| Four decisions with required content; authorised reviewers only; invalid input rejected | ✅ | all four recorded live; refusals live (§5.3) |
| Duplicate + concurrency protection; identity, time, evidence fingerprint, screening version recorded; immutable history | ✅ | append-only `INSERT IGNORE`; live CONFLICT; signed chain verified live |
| Evidence-locked approval: fingerprint binding, material-change detection, stale approvals, automatic re-review | ✅ | live `APPROVAL_INVALIDATED` and `APPROVAL_RECONFIRMED` |
| Workflow gate **not** activated | ✅ | no workflow modules in the manifest; `FEATURES.gate = false` |
| Security / reliability tests (§4) | ✅ | 118 backend + 47 frontend tests, all passing |
| Frontend quality: ADS tokens, light/dark, keyboard, a11y, narrow widths, budgets | ✅ | axe checks in tests; narrow-width live screenshots; budgets in §7 |
| Live dev end-to-end: screened issue → inbox → assign → review → decision → history | ✅ | §5 |
| No billable AI, AI disabled, no production deploy | ✅ | `A25_AI_ENABLED=false` throughout; every live screening logged `mode: rules, aiStatus: not_enabled` |

## 2. What was built
**Core (`app/src/core/review.js`, pure, unit-tested)**
- Decision validation for the four outcomes:
  - the rationale is required on every decision (10–2,000 characters);
  - Approve with conditions needs at least one condition; Request more information needs at least one question;
  - items are 3–300 characters, with at most 10 and no duplicates;
  - lists that don't belong to the chosen outcome are **rejected, not silently dropped**.
- `decisionIdOf`: a SHA-256 over every bound field (issue, sequence, kind, decision, rationale, conditions, questions, decider, time, screening ID, content fingerprint, pipeline version, outcome). Editing any stored field breaks the ID.
- `signalSetOf` / `materialChange`: a change is material if it adds a data category, a risk criterion, a recipient or a transfer, or if it raises the outcome severity.
- `deriveReviewStatus`: the review status is **derived** from the latest decision plus the current content, never stored separately. An approval covers only the exact text it was given for; once the text changes it shows `PENDING_RECHECK` until the re-check concludes.
- The decision hash chain (`chain-core.js`) is a byte-identical port of the verified Stage 1 spike, with HMAC-SHA256 signatures and site binding.

**Persistence (Forge SQL, migrations v005–v007)**
- `decisions`, `assignments` and `chain`: all append-only. Every write is one `INSERT IGNORE` at `expectedSeq + 1` with a unique request ID, so there are no transactions to half-apply.
- A decision row is never updated or deleted, including when the Jira issue is deleted (accountability).

**Review service (`services/review.js`): every rule enforced on the server.** Decision checks run in this order:
1. Input validation, returning field codes.
2. The actor must be in the reviewer group. This fails closed and is cached per invocation.
3. The signing key must be present; otherwise the server returns `NOT_CONFIGURED` and records no unsigned decision.
4. An as-user Jira read proves the actor can browse the issue.
5. Separation of duties: the actor must not be the issue's reporter or assignee.
6. Idempotency by request ID.
7. The **evidence binding**: the screening ID, stored fingerprint and *current* text fingerprint must all match.
8. The optimistic sequence check.
9. A single INSERT, then anchoring in the signed chain.

Supporting behaviour:
- **System records:** after any re-screen, the pipeline hook appends `APPROVAL_INVALIDATED` (material) or `APPROVAL_RECONFIRMED` (non-material, carrying conditions forward). These are idempotent per screening.
- **Partial failure:** a decision stored but not yet anchored shows as `pending_anchor`, and the five-minute reconciler repairs it.
- **Verify:** checks the chain's signatures and links, recomputes each row's decision ID, and matches each row to its chain record.

**Desk services and resolvers**
- Resolvers: `getInbox` (filters), `getWorkspace` (review block), `getReviewers` (name search), `assignReview`, `recordDecision` and `verifyRecord`.
- The acting user always comes from the Forge context.
- Account IDs are returned **only to reviewers**, who need them to assign; everyone else sees names only.
- Reporter and assignee IDs used for separation of duties never leave the server.

**Frontend**
- **Inbox:** a worklist table with labelled stacked rows below 720 px. It has views, filters, summary numbers that act as filters, and pagination; filters persist when you return from a review.
- **Workspace decision zone:** review status, reviewer (assign to me, search, unassign) and the decision form. The form only appears when the server allows deciding, and otherwise says why. It includes:
  - a two-step reject;
  - field errors that clear on edit;
  - a "Reload the latest state" button after a conflict or stale evidence;
  - the evidence-binding note (content reference).
- **History:** human and system records, newest first, with what was new, any outcome escalation and the content reference; reviewers can verify the record.
- **Margin:** the new "What the text says" summary.
- **Issue panel:** a compact review summary that says when the system carried an approval over.
- **Settings:** a review section with the reviewer group, whether you are a reviewer, separation of duties and record signing.

## 3. Design decisions and discrepancies with the Stage 2 blueprint
| Blueprint | M3 | Why |
|---|---|---|
| `CHANGES_REQUESTED` | `NEEDS_MORE_INFORMATION` (≥1 question) | The M3 brief's vocabulary; asking precise questions is what reviewers actually do first; it does not read as a rejection |
| Stored review state machine | Status **derived** from append-only decisions + current fingerprint | Forge SQL has single-statement atomicity only; a derived status cannot be left half-updated |
| `STALE`, `RECONFIRMED` states | System decisions `APPROVAL_INVALIDATED`, `APPROVAL_RECONFIRMED` in the same append-only log and signed chain | One immutable history for people and the system |
| Rationale optional (FR-R5) | Rationale required on every decision | A decision without a reason is not useful evidence |
| Reviewer list from group membership | **Name search** filtered to active reviewer-group members | `GET /group/member` needs `manage:jira-configuration` (admin-level, includes writes; verified in Atlassian's OpenAPI spec). Not requested. `read:jira-user` covers search, groups-of-user and bulk names |
| Settings "active reviewers" count | "You are / are not a reviewer" | The count needs the admin scope above |
| `IMPLEMENTATION_ROADMAP` named `ROADMAP.md` in the brief | Updated `IMPLEMENTATION_ROADMAP.md` | Actual file name |
| Requester shown in inbox (FR-R3) | Not shown | Identifier minimisation; the reviewer opens the issue in Jira if needed |

## 4. Tests (all passing; synthetic data only)
| Suite | Tests | Covers |
|---|---|---|
| `test/review.test.mjs` | 9 | validation, decision-ID binding, materiality, derived status |
| `test/chain.test.mjs` | 21 | ported chain: tampering, deletion, reordering, cross-site replay, checkpoints, receipts |
| `test/review-service.test.mjs` | 23 | **integration**: the real rules-only screening pipeline with the review and desk services over INSERT-IGNORE fakes (see below) |
| `test/backend.test.mjs` | 21 | logger (incl. new content-free error facts), envelopes, validation, desk access |
| `test/core.test.mjs`, `test/pipeline.test.mjs` | 23 + 21 | M2 detection (unchanged, still passing) |
| `frontend/src/foundation.test.jsx` | 31 | panel, workspace, inbox (filters, pagination, states), navigation; axe |
| `frontend/src/review.test.jsx` | 16 | decision form, assignment search, history, verify; axe |

The `review-service.test.mjs` integration suite covers:
- the full path: screened → inbox → assign → decide → history → verify;
- all four outcomes;
- **unauthorised** users (non-reviewer, missing actor, reviewer-group lookup failure → fails closed);
- **cross-project / no access** (NOT_FOUND, nothing written, nothing leaked in the inbox);
- separation of duties, including when it is switched off;
- a missing signing key;
- assignment rules, inactive reviewers, and the reviewer search filter;
- **identifier leakage**;
- **malformed input**, including injection-shaped strings;
- **duplicate** submissions and **concurrent** decisions;
- **stale evidence** and forged bindings;
- **material and non-material** changes after approval, and a rejection that is not carried over;
- **SQL failure**;
- **partial failure** with repair;
- **audit integrity**: an edited row or an edited chain record is detected.

## 5. Live end-to-end verification (development, demo site, AI off)
Synthetic issues **AS-78** and **AS-79** were created for this run, labelled `a25-synthetic` with fictional text.
To test approvals without breaking separation of duties, each issue's reporter was set to a seeded demo account (`field-demo-bot`).

### 5.1 Happy path
| Step | Result |
|---|---|
| Create AS-78 and AS-79 | Screened automatically from the issue trigger in rules mode (`aiStatus: not_enabled`): AS-78 → DPIA likely, AS-79 → Review required |
| Inbox | Listed both with chips, outcome, status "Awaiting review", age; counts and the reviewer filter shown for a reviewer |
| Assign AS-78 to me | `review.assigned`; reviewer shown; history entry |
| Validation | An empty submission showed "Add at least one condition." / "Write at least 10 characters." |
| Approve with conditions (AS-78) | Recorded and **anchored** (`reason: anchored`); status "Approved with conditions, for this exact text" |
| Verify record | "Record verified: signatures and chain are intact and match these decisions." |

### 5.2 Evidence-locked approval
| Step | Result |
|---|---|
| **Material edit** to AS-78 (added contact details and Twilio) | Re-screened about 3.6 s after the edit; the system appended **`APPROVAL_INVALIDATED`**; the workspace showed "Approval invalidated", with what is new since the approval (contact details, combining datasets, shared with Twilio); the form re-opened, bound to the new content reference; new highlights came from the new screening |
| **Non-material edit** to AS-79 after an Approve ("every month" → "once a month") | **`APPROVAL_RECONFIRMED`**; status stayed Approved; the panel said "Approval carried over to the edited text" (after the panel fix) |

### 5.3 Refusals (server-side, from an already-open form)
| Attack / race | Result |
|---|---|
| **Separation of duties**: form opened while a demo account was the reporter, then the reporter was switched to the acting user; a confirmed Reject was submitted | Refused: "You can't decide on a work item you reported or are assigned to." Nothing recorded |
| **Stale evidence**: description edited behind the open form, then submitted | Refused with `STALE_EVIDENCE` ("being checked"); nothing recorded |
| **Concurrency**: the second tab recorded a Reject; the stale first tab submitted Request more information (twice) | Both refused with `CONFLICT`; the Reject was not overwritten; after a reload, Request more information was recorded |
| **Non-reviewer**: the dev reviewer group was temporarily pointed at a group the user is not in (then restored), and a decision and an assignment were submitted from the open view | Both refused with `NOT_AUTHORISED`; a fresh load showed a read-only history and no controls |

All four human outcomes and both system outcomes were recorded live:

| Issue | Recorded live |
|---|---|
| AS-78 | Approve with conditions → `APPROVAL_INVALIDATED` → Reject → Request more information |
| AS-79 | Approve → `APPROVAL_RECONFIRMED` |

The inbox views matched: needs attention went 6 → 4, Info requested showed AS-78, and Decided showed AS-79.

### 5.4 Not verified live (and why)
- **Duplicate submission with the same request ID.** The UI disables the button while sending, so it cannot fire twice. The resolver is not callable from outside the app's cross-origin iframe. Idempotency is covered by the unique `request_id` key and the integration tests.
- **Inactive-reviewer assignment and the separation-of-duties switch-off.** Covered by tests only, because the demo site has no inactive reviewer accounts.

### 5.5 M2 still works
Screening from live events (create, edit), re-screening, the panel and highlights were all exercised again, and M2 AI-era results still render (e.g. AS-8, an M2 AI-assisted result with its verified "Transfer to Philippines" chip).

## 6. Defects found by the live run (all fixed and re-verified)
1. **Inbox failed in production SQL** (`SQL_EXECUTION_ERROR`). Correlated `MAX(seq)` subqueries inside `JOIN … ON` are not accepted by Forge SQL; the fakes could not catch this. Rewritten as grouped derived tables in one statement.
2. **Reviewer listing returned 401.** `/group/member` needs `manage:jira-configuration`. Redesigned as name search, avoiding a new admin-level scope.
3. **Silent failure paths.** Lookups that fail closed were swallowed without a log. They now log content-free warnings. Unexpected resolver errors log the error class, platform code, DB errno and a letters-only message kind, with no identifiers or values (unit-tested).
4. **UX:**
   - the stacked inbox layout was broken by obsolete M2 CSS;
   - the conflict recovery was a small link that was easy to miss, so it became a "Reload the latest state" button;
   - stale field errors persisted while editing;
   - the panel showed a system carry-over as if it were a person's approval;
   - recipient names showed lower-cased in invalidation notes;
   - the "Waiting" column was misleading for decided items, so it became "Age".

## 7. Performance and budgets
| Measure (live, development) | Value |
|---|---|
| `getInbox` (6 attention items, as-user JQL visibility) | 0.82–1.48 s (n = 5) |
| `getWorkspace` | 0.93–1.50 s (n = 4) |
| `recordDecision` (incl. as-user read, binding check, insert, chain anchor) | 1.51–1.72 s (n = 2 recorded) |
| `assignReview` | 1.41 s |
| Screening (rules mode) | 1.98–2.53 s; edit → system record ≈ 3.6 s |
| Bundle, initial gzip | panel **189.1 KB** (budget 200; M2 187.0), desk **201.6 KB** (budget 400; M2 194.3) |

## 8. Security and privacy review
- **Authorisation:**
  - every write and every review read runs as-user plus a server-side reviewer check;
  - the frontend's `canDecide` / `canAssign` flags are only hints; each was bypassed live with an already-open form and refused by the server.
- **Least privilege:**
  - one scope was added (`read:jira-user`), with a documented purpose;
  - `manage:jira-configuration` was deliberately **not** requested.
- **Identifiers:**
  - account IDs reach the browser only for reviewers;
  - reporter and assignee IDs never leave the server;
  - logs carry only numeric issue IDs, codes, counts and timings (verified in the live logs);
  - the M3 docs name only the demo bot.
- **Integrity:**
  - decisions are append-only, signed with HMAC and hash-chained, with a per-row decision ID;
  - tampering with either a row or a chain record is detected (tests);
  - verify was run live.
- **Secrets:**
  - `A25_SIGNING_KEY` is an encrypted development variable, generated locally and never printed;
  - production has no key and fails closed.
- **No mock approvals:** there is no test control in the product, and every live decision is marked "Synthetic test decision" in its rationale.

## 9. Known limitations
- **Inbox scale:**
  - candidates are capped at the 300 oldest by update time, then filtered for visibility;
  - the visibility check is one JQL call per 100 IDs;
  - larger sites need keyset pagination in SQL (M8/M10).
- **Single reviewer group:** the separation-of-duties toggle is an environment setting; the audited admin toggle is M8.
- **Reviewer search** returns at most 20 people per query (by design).
- **Synthetic decisions stay in the dev database.** Decisions are kept even if their Jira issue is deleted (accountability). AS-78 and AS-79 still exist; see §11.
- **The demo site has a single reviewer**, so multi-reviewer flows were simulated with two tabs of the same user.
- **Inherited from M2:** the rule-based check cannot assess transfers or retention, and the UI says so.
- Decided items show the age since the work item's last change, not since the decision.

## 10. Commits (branch `milestone-m3-review`)
- `core:` review domain + verified chain port
- `backend:` persistence, assignment, evidence-locked decisions
- `backend:` inbox, workspace and decision resolvers
- `test:` authorisation, concurrency, stale evidence, audit integrity
- `backend:` inbox chips, verified purposes, assign-to-me
- `frontend:` inbox, decision workspace, history
- `backend:` live-run fixes
- `frontend:` reviewer search picker + live-run fixes
- `docs:` this file and blueprint amendments

## 11. What M4 (ENFORCE) needs
1. A **Jira workflow validator** (`jira:workflowValidator`, lambda) that reads only app-owned SQL state and allows a transition only if `deriveReviewStatus(...).approvedForContent` is true, or the status is `NOT_REQUIRED`/out of scope per policy. It must **fail closed** on errors, unknown or missing state, screening in progress, and stale or changed content.
2. A pure **gate policy** `policy.gate(status, settings) → {allow, reasonCode}`, tested exhaustively (every derived status × policy option), with one-sentence actionable messages per reason.
3. **Monitor mode:** allow but log `would_block`, with a banner; the admin switch is audited.
4. **Live tests in both project types** (company-managed and team-managed) on the demo site, including bulk transitions (Q7) and the approve → material-edit → blocked path.
5. **Gate events** in the audit trail, and a gate-health indicator (validator present on the configured transitions).
6. **Scope review:** check whether the validator needs new scopes or modules, which would mean a major version and re-consent, so ask first. Then prepare the scope freeze (planned 4 Dec).
7. **Open items carried from M3:**
   - an audited admin toggle for separation of duties;
   - keyset pagination for large inboxes;
   - a decision to delete the synthetic issues AS-78 and AS-79 (their decisions stay in the dev ledger either way).
