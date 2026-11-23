# Article25 — System Architecture

**Stage 2** · 2026-11-22 · Data and security: [DATA_AND_SECURITY_MODEL.md](DATA_AND_SECURITY_MODEL.md) · Frontend: [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)

## 1. Capability status (what is proven vs. proposed)
| Capability | Status | Evidence | Product implication |
|---|---|---|---|
| Forge app deploy/install, resolvers, Custom UI/UI Kit | **VERIFIED** | doc 12 | Foundation |
| Jira read/write (issue, property, comment, create, link) | **VERIFIED** | doc 13 | Panel, samples, receipts, condition tasks |
| Issue-created trigger → screening | **VERIFIED** | doc 13 J1 | Extend to updated + deleted **[PROPOSED]** |
| Async queue consumer (`@forge/events`) | **VERIFIED** (LLM harness) | doc 15 §7 | Screening jobs, publishing outbox |
| Forge LLM extraction (tool calling `auto`, quote verification) | **VERIFIED** (n=34, synthetic) | doc 15 §7 | Primary detector; quality still to be shown on a larger, independent set (C4) |
| Deterministic rules (baseline + fail-safe) | **VERIFIED**, insufficient alone | doc 15 §3 | Decides outcomes; fallback extractor |
| Lambda workflow validator on app storage; fail-closed | **VERIFIED** (both project types) | doc 14 | The gate |
| Expression/issue-property validator | **FAILED (insecure)** | doc 14 T10 | Discard |
| Forge SQL: PK idempotency, optimistic updates, atomic counters, install-time migrations | **VERIFIED** | doc 20 C2 | Primary store |
| Forge SQL multi-statement transactions | **[UNVERIFIED]** | — | Design does not depend on them (§5.3) |
| Signed hash chain + Confluence anchors + authorised recovery | **VERIFIED** | doc 22 | Ledger + register + recovery |
| Multi-app compatibility (Jira required, Confluence optional) | **VERIFIED on dev site**, Preview | doc 13 | One installation, shared storage |
| Judge install via sharing link (multi-app, clean site) | **[UNVERIFIED]** (C1) | doc 23 | Rehearse in week 1 |
| Teamwork Graph: work item → goal (as user) | **VERIFIED** | doc 16 E7 | Declared-purpose context (Should) |
| Teamwork Graph: teams | **FAILED** (403) | doc 16 E5 | Not used |
| Rovo agent / skill / MCP | **[UNVERIFIED]** | — | Later |
| Validator under bulk transitions / Automation | **[UNVERIFIED]** | doc 14 §6 | Test in hardening |

## 2. Context diagram
```
            ┌──────────────────────── Atlassian site (customer) ────────────────────────┐
            │                                                                            │
 PM edits ─▶│ Jira issue ──avi:jira:created/updated/deleted──▶ Trigger fn                 │
            │                                                   │ enqueue(issueId, fp)   │
            │                                                   ▼                        │
            │                                          Queue consumer: screen            │
            │                              asApp read ◀───────┤  1. fetch + fingerprint │
            │                                                 │  2. cache check (SQL)   │
            │                   Forge LLM (claude-haiku-5-5) ◀─┤  3. extract + verify    │
            │                                                 │  4. rules + diff        │
            │                                                 │  5. persist + state     │
            │                                                 │  6. issue property      │
            │                                                 ▼                         │
            │  Forge SQL (app-only) ◀─────────────── state, screenings, decisions,     │
            │       ▲   ▲                              ledger, inventory, settings       │
            │       │   │                                                               │
 Transition▶│ Workflow validator (lambda) ── read state ─┘   │                           │
            │                                                │                           │
 Reviewer ─▶│ Desk (Custom UI) ──invoke──▶ Resolvers ────────┘── decision ─▶ outbox     │
            │      └─ requestTeamworkGraph (as user) ─▶ TWG: work item → goal           │
            │                                                     │                      │
            │                                   Publisher consumer ▼                     │
            │   Confluence register page ◀── table + content property + checkpoint       │
            │   Jira issue property      ◀── signed receipt (display + anchor)           │
            └────────────────────────────────────────────────────────────────────────────┘
                         No external egress. Runs on Atlassian.
```

## 3. Forge modules (proposed manifest; to be frozen per NFR-9)
| Module | Key | Purpose |
|---|---|---|
| `jira:issuePanel` | `privacy-panel` | Custom UI panel (FR-P*) |
| `jira:globalPage` | `desk` | Custom UI desk with routes (FR-R*, FR-A*, FR-L4) |
| `jira:adminPage` | `admin` | Deep link to Desk › Settings (S) |
| `jira:workflowValidator` | `privacy-gate` | Lambda validator, `projectTypes: [company-managed, team-managed]` |
| `trigger` | `on-issue-event` | `avi:jira:created:issue`, `avi:jira:updated:issue`, `avi:jira:deleted:issue` (`ignoreSelf: true`) |
| `trigger` | `on-lifecycle` | `avi:forge:installed:app`, `avi:forge:upgraded:app` → migrations (verified pattern) |
| `scheduledTrigger` | `housekeeping` | Hourly: publish-outbox retry, stale-lock reconciler, retention purge, integrity self-check |
| `consumer` + queue | `screening-queue`, `publish-queue` | Async jobs (FR-S1, FR-L3) |
| `sql` | `main` (mysql) | Primary store |
| `llm` | `claude` | Forge LLM (must be present from v1 to avoid a later major version) |
| `function` | `resolver`, `validator`, `trigger`, `consumer`, `scheduler` | Handlers |
| Confluence module | `register-byline` or minimal page | **[UNVERIFIED]** whether multi-app needs ≥1 Confluence module; the spike had one. Decide on day 1. |

**Scopes (candidate freeze):**
- `read:jira-work`, `write:jira-work`, `read:jira-user`, `storage:app`;
- `read:page:confluence`, `write:page:confluence`, `read:space:confluence`;
- **TWG decision pending (D2):** `read:graph:issue:jira`, `read:graph:goal:atlassian`. These make org-admin consent mandatory.

Dropped vs. spike:
- `search:confluence` (page IDs are stored);
- all team and page graph scopes.

**App identity:**
- **Register a new Forge app `article25`** for the product: a clean app ID, clean production environment and version history, and none of the spike's test modules or scopes.
- Spike apps stay as they are. The demo-site installations aren't touched.

**Runtime:** `nodejs24.x`. Region: Forge default.

## 4. Backend structure
```
app/src/
  core/                      # pure, deterministic, unit-tested (no Forge imports)
    chain-core.js            # REUSE as-is (+ restorePlan)
    rules/                   # rules engine v1, rule IDs, outcome mapping, versioned
    extraction/schema.js     # tool schema, enums, prompt, quote verification, redaction
    extraction/fallback.js   # rule-based extractor (fail-safe variant)
    materiality.js           # approved signal set vs. new screening → material?
    policy.js                # state machine + gate decision (pure function)
    text.js                  # adfToText, fingerprint (REUSE)
  backend/
    resolvers/               # thin: auth → service → DTO; one aggregate per view
    services/                # screening, decisions, inventory, settings, ledger, register, recovery, samples, gate-health
    repositories/            # SQL access only; prepared statements; optimistic helpers
    adapters/                # jira.js, confluence.js, llm.js (Forge API wrappers with timeouts)
    handlers/                # trigger.js, consumer-screening.js, consumer-publish.js, validator.js, scheduler.js, lifecycle.js
    lib/                     # auth (groups, admin permission, SoD), errors, logger (content-free), ids
  eval/                      # dataset (synthetic), runner for rules + recorded LLM outputs
```
**Layering rules:**
- resolvers never touch SQL directly;
- `core/` has no I/O;
- every external call goes through `adapters/` with a timeout and a typed error.

## 5. Key flows

### 5.1 Screening pipeline (FR-S1…S10)
1. **Trigger** (create / update with `summary` or `description` in the changelog):
   - load settings;
   - if the project is out of scope → stop;
   - enqueue `{issueId, reason}`;
   - for updates, the job key is `issueId:latest`, and the consumer re-reads the issue, so bursts collapse.
2. **Consumer:**
   - (a) `asApp` read summary/description/reporter/assignee/project;
   - (b) `adfToText`, then `fp = sha256(text)`;
   - (c) if a screening with the same `fp` and `rules_version` exists → reuse it (no LLM call);
   - (d) budget check: atomic `UPDATE usage SET n=n+1 WHERE day=? AND n<?`, where affectedRows = 0 means fallback;
   - (e) LLM extract (timeout 20 s, 1 retry), or the fallback extractor;
   - (f) verify quotes (normalised substring), drop and count failures, redact and truncate excerpts to 120 chars;
   - (g) inventory diff;
   - (h) `rules.evaluate(signals, diff, policy)` gives the outcome and trace;
   - (i) insert the screening (immutable);
   - (j) apply the state transition via `policy.onScreening(currentState, screening, lastApprovedSet)`, using an optimistic update on `work_items.version`;
   - (k) write the display issue property (outcome, state; no excerpts);
   - (l) structured log, content-free.
3. **Failure modes:**
   - LLM error → fallback extractor (labelled);
   - Jira read 404 → mark deleted;
   - an unexpected error → the job retries (max 3, then `SCREENING_FAILED`; gate blocks; panel offers Re-check).

### 5.2 Gate evaluation (FR-G1…G7)
Validator handler:
- `issueId` + `projectKey` from the payload;
- read settings (cached per invocation) and the `work_items` row;
- `policy.gate(state, settings)` returns `{allow, reasonCode, message}`;
- if `monitor_mode` → allow, with `wouldBlock` recorded;
- insert a `gate_events` row (best effort; a logging failure never changes the result).

Any exception → block with "Article25 couldn't verify the privacy status. Try again or contact your admin." **[VERIFIED fail-closed pattern]**. Target ≤ 500 ms p95 (one indexed SELECT plus one INSERT).

### 5.3 Decision (FR-R5…R8, FR-L1)
Forge SQL transactions are **[UNVERIFIED]**, so decisions use **ordered, idempotent, reconcilable writes**:
1. **Authorise:**
   - reviewer group;
   - separation of duties: not the reporter or assignee (read `asApp` at decision time);
   - the item is pending, changes-requested or stale.
2. **Claim:**
   ```sql
   UPDATE work_items
   SET version = version + 1, lock_decision_id = ?
   WHERE issue_id = ? AND version = ? AND screening_id = ?
   ```
   affectedRows = 0 means a conflict (FR-R8).
3. Insert the `decisions` row (PK `decision_id`, which includes the claimed version; `INSERT IGNORE` makes it idempotent).
4. `appendToChain` (unique `decision_id`, seq retry) **[VERIFIED]**.
5. **Finalise:**
   ```sql
   UPDATE work_items
   SET state = ?, approved_set = ?, approved_fp = ?, lock_decision_id = NULL
   WHERE issue_id = ? AND lock_decision_id = ?
   ```
6. Enqueue publishing (outbox row + queue push).

**Reconciler** (scheduled, and on read of a locked item older than 60 s):
- decision + chain present → finalise;
- decision without chain → append, then finalise;
- no decision → release the lock.

Until finalisation the item remains **not cleared**, so the gate stays closed. That is fail-closed by construction.

### 5.4 Material-change re-lock (FR-G3)
`materiality.isMaterial(approvedSet, newScreening)` is true when the new screening adds any:
- category;
- vendor;
- WP248 criterion;
- or a higher outcome severity.

| Approved item, new screening is… | Result |
|---|---|
| Material | state → `STALE`; enters the Inbox "Changed since approval" view; gate blocks |
| Not material | state unchanged; the ledger appends a **system** record `RECONFIRMED` (new fingerprint, `decidedBy = system`) so the record shows what text the approval now covers |

### 5.5 Publishing (FR-L2, FR-L3)
- The publisher consumer takes outbox entries in seq order. For each, it runs `publishAnchors` (refactored from `chain.js`):
  1. content property update (409 retry);
  2. page body re-render (decision table + checkpoint footer) with a version message checkpoint;
  3. issue property receipt.
- Status per decision: pending / published / failed (attempts, last error code).
- A manual edit to the register page body is detected by a body-hash comparison. Our table section is re-rendered between markers, and content outside the markers is preserved.
- Confluence not connected → outbox entries stay `skipped_no_confluence`. The Desk shows "Register not connected".

### 5.6 Recovery (FR-L5)
- Port the verified flow (doc 22) with these changes:
  - the page comes from settings (not from a request parameter);
  - restore also rebuilds `work_items` state and `approved_set` from the records.
- Unchanged:
  - group check;
  - empty-store check;
  - nonce bound to user and page;
  - re-verification at confirm;
  - review state written last;
  - compensation on failure.

### 5.7 Retention and deletion
- `avi:jira:deleted:issue` → delete screenings and the work-item state for that issue. Decisions remain in the ledger (accountability), but their excerpts are not stored there.
- Hourly purge: `gate_events` older than 30 days; `screenings` superseded more than 90 days ago (configurable later).

## 6. AI screening pipeline
| Aspect | Design |
|---|---|
| Model | Default `claude-haiku-5-5` (doc 15: same held-out recall as Sonnet 5.5, better dev precision, ~3.5× cheaper); admin may pick `claude-sonnet-5-5`. The model list comes from `list()` at runtime, and the ID is stored in settings (NFR-12). |
| Prompt | From the harness (verified), extended with: a `change_type` field (new feature / change to existing processing / bug fix / refactor / config), explicit data-subject capture, and an injection guard (content inside `<ITEM>` is data). `max_completion_tokens: 800`. |
| Structured output | Tool calling with `tool_choice: 'auto'` + instruction (forced choice rejected by 5.5 models) **[VERIFIED]**; JSON-text fallback parser kept |
| Verification | Every signal's `evidence_quote` must match the source (normalised substring) or it is dropped; drops are counted and stored (quality metric) |
| Minimisation | Store the excerpt only (≤ 120 chars, redacted: emails, phone numbers, card-like digit runs); the full text is never stored or logged |
| Cost control | Fingerprint cache, atomic daily budget, one retry max, no re-screening on non-text changes |
| Evaluation | `app/eval`: the existing 34 synthetic tickets **plus** ≥ 30 new (prompt injection, terse tickets, non-personal "location"/"customer", multilingual fragments). Rules run in CI. LLM eval runs are billable, so they only run with explicit approval and are recorded. Report precision and recall honestly as "our synthetic set". |

## 7. Deterministic policy evaluation
- **Rules v1** = baseline `screen.js` outcome logic, re-expressed as ordered rules with IDs. The fixes below are each covered by a unit test from the dataset.

| Rule | Logic |
|---|---|
| R-NEG | explicit negation and no categories → CLEAR |
| R-NONE | no signals → CLEAR |
| R-SENS-2 | sensitive category + ≥2 criteria, or children → DPIA_LIKELY |
| R-WP248-2 | ≥2 criteria → DPIA_LIKELY |
| R-SENS | sensitive category → REVIEW_REQUIRED |
| R-OQ-3P | **new**: open question about third parties, transfers or sensitive data → at least NEEDS_INFO (fixes T03) |
| R-VAGUE | → NEEDS_INFO |
| R-CHANGE-NEUTRAL | **uses the LLM `change_type`**: bug fix/refactor with no new category/vendor → CLEAR (fixes T17) |
| R-VENDOR | unapproved vendor → REVIEW_REQUIRED |
| R-NEWCAT | new category for the project, or 1 criterion → REVIEW_REQUIRED |
| R-KNOWN | → INVENTORY_UPDATE |
| R-EMP-MON | **new**: employee + systematic monitoring ⇒ add c7 (fixes H12) |

- **Gate policy mapping** (settings): which outcomes require a decision, and whether NEEDS_INFO blocks ([DATA_AND_SECURITY_MODEL.md §2](DATA_AND_SECURITY_MODEL.md)).
- `rules_version` is stored on every screening; a rules change triggers a re-screen only on demand.

## 8. Teamwork Graph: business-goal context (Should, FR-R9)
- **What:**
  - the workspace shows **"Declared purpose"**, the Atlassian Goal(s) linked to the work item (name, status, link);
  - when none is found: "No linked goal found. Purpose isn't stated; consider asking the requester." (We never claim "no goal exists"; doc 16 shows empty ≠ none.)
- **Why it's meaningful, not decorative:**
  - **purpose limitation** is a core privacy principle: processing must serve a specified purpose;
  - a reviewer judging proportionality ("is session replay justified?") needs to know what the work is for;
  - the goal is organisation-level context that Jira text alone doesn't carry.
- **How:**
  - frontend `requestTeamworkGraph` (as the reviewer), with curated query `jiraWorkItemGoals(id: issueARI)`;
  - ARI format: `ari:cloud:jira:<cloudId>:issue/<numericId>` **[VERIFIED]**;
  - always check `errors[]`;
  - hide the section on any failure, with a small note.
- **Not used for:** screening, the gate, or anything in app context (TWG is user-context only), and nothing team-based (403).
- **Cost:** org-admin consent at install **[VERIFIED requirement]**. **Decision D2** at the C1 rehearsal: if a clean-site install with these scopes works for a typical judge (site creator = org admin), keep it; otherwise drop the scopes **before** the production share and keep the UI hidden. The freeze happens on whichever comes first: the D2 outcome or the scope-freeze date.

## 9. Logging, errors, observability
- **Logger:**
  - JSON, `evt` + IDs (issueId numeric, projectKey, screeningId, decisionId) + metrics (ms, tokens, mode, model, outcome, reasonCode);
  - **never** summary/description/quotes/conditions/rationale, and **no account IDs**.
  - Enforced by a logger wrapper that accepts only an allow-listed field set (unit-tested).
- **Resolver error envelope:**
  ```js
  {ok:false, code, message, retryable}
  ```
  Codes: `NOT_AUTHORISED`, `SOD_BLOCKED`, `CONFLICT`, `NOT_IN_SCOPE`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `INVALID_INPUT`, `INTERNAL`. The UI maps codes to copy.
- **Health signals in the product, not in logs:**
  - gate health;
  - publish backlog;
  - rule-based fallback count;
  - budget usage;
  - integrity status.

## 10. Reuse, refactor, replace, discard
| Spike artefact | Decision | Reason |
|---|---|---|
| `core-spike/src/chain-core.js` + `test/chain.test.mjs` | **Reuse as-is** | 21/21 tests; verified live |
| `core-spike/src/chain.js` (append, anchors, harvest, recovery) | **Refactor** | Split into ledger/register/recovery services; page from settings; outbox publishing |
| `core-spike/src/db.js` (migration runner pattern, optimistic update) | **Refactor** | New schema ([DATA_AND_SECURITY_MODEL.md §1](DATA_AND_SECURITY_MODEL.md)); keep install-trigger migrations |
| `core-spike/src/validator.js` | **Refactor** | Keep the fail-closed structure; new policy, gate events, monitor mode; **remove `spike:simulate` hook** |
| `core-spike/src/screen.js` | **Refactor** → `core/rules` + `core/extraction/fallback.js` | Rule IDs, fixes, LLM signals as input |
| `ai-spike/forge-llm-harness` `extract()` + prompt + tool schema | **Refactor** → `core/extraction` + `adapters/llm.js` | Proven prompt/schema; add change_type, redaction |
| `core-spike/src/text.js` | **Reuse** | adfToText, fingerprint |
| `core-spike/src/trigger.js` | **Refactor** | Enqueue only; created/updated/deleted |
| `core-spike/src/review.js` | **Replace** | No SoD, no concurrency claim, no staleness |
| `core-spike/src/register.js` | **Replace** | Renders from the ledger; keep the marker/body-hash idea for manual-edit protection |
| `core-spike/src/mirror.js` (v1 signed mirror) | **Discard** | Superseded by the chain |
| Expression validator (`a25-validator-expression`) | **Discard** | Insecure (bypassed) |
| Tamper/simulate/reset/concurrency/evidence-logging resolvers | **Discard** | Test-only; evidence logging leaks content |
| UI Kit spike frontends | **Discard** | Harnesses, not product UI |
| `twg-spike` queries (E3, E7 shapes) | **Reuse** (E7 only) | Goal traversal |
| `ai-spike/dataset`, `baseline/evaluate*.mjs` | **Reuse** → `app/eval` | Regression suite for rules; extend |
| `forge-foundation` | **Discard** | Reference only |

## 11. Open technical questions (resolve in week 1)
| # | Question | How to resolve | Deadline |
|---|---|---|---|
| Q1 | Does multi-app (Confluence optional) need ≥1 Confluence module to connect? | Deploy the skeleton without one, try the connect step | Day 1 |
| Q2 | `@atlaskit` components in Custom UI: bundle size, theming, compatibility | F0 spike | Day 1–2 |
| Q3 | Validator payload contains the numeric issue ID and project? (spike used key) | Log the payload shape in dev (no content) | Day 2 |
| Q4 | Admin-permission check (`mypermissions?permissions=ADMINISTER`) works under the chosen scopes | Dev test | Day 2 |
| Q5 | `avi:jira:updated:issue` changelog reliably lists summary/description changes; property writes don't loop | Dev test with `ignoreSelf` | Day 3 |
| Q6 | Sharing-link install of multi-app + llm (+ TWG) on a clean site | C1 rehearsal | Day 5–6 |
| Q7 | Validator under bulk transition | Hardening | Week 3 |
