# Article25 — Data & Security Model

**Stage 2** · 2026-11-22 · Architecture: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) · Prior assessments: `research/18`, `research/22`, `docs/privacy-policy-review.md`

## 1. Storage schema (Forge SQL, `engine: mysql`)
Migrations run only from install/upgrade triggers and an admin action **[VERIFIED: DDL limit 25/min]**. No foreign keys (Forge SQL limitation **[DOCS]**); integrity is enforced in services.

| Table | Key columns | Purpose | Contains personal data? |
|---|---|---|---|
| `settings` | `k` PK, `v` JSON, `version` | Scope, policy, groups, AI, register page, monitor mode, onboarding progress | Group names only |
| `work_items` | `issue_id` PK, `issue_key`, `project_key`, `state`, `outcome`, `screening_id`, `version`, `lock_decision_id`, `approved_set` JSON, `approved_fp`, `updated_at` | Current governance state (gate reads this) | No |
| `screenings` | `screening_id` PK, `issue_id` (idx), `fp`, `rules_version`, `mode` (ai/rules), `model`, `outcome`, `signals` JSON, `diff` JSON, `open_questions` JSON, `dropped_quotes` int, `tokens_in/out`, `ms`, `created_at` | Immutable screening snapshots | **Yes, minimally:** redacted excerpts ≤ 120 chars |
| `decisions` | `decision_id` PK, `issue_id`, `screening_id`, `decision`, `conditions` JSON, `rationale`, `decided_by`, `decided_at`, `fp`, `signal_set` JSON, `seq` | Append-only decisions | **Yes:** reviewer account ID, free text (conditions, rationale) |
| `chain` | `seq` PK, `decision_id` UNIQUE, `record` JSON, `record_hash` | Signed hash chain **[VERIFIED]** | Reviewer account ID (inside the record) |
| `outbox` | `decision_id` PK, `status`, `attempts`, `last_error_code`, `updated_at` | Publishing state | No |
| `inventory_vendors` | `name_norm` PK, `display_name`, `added_by`, `added_at`, `source_decision_id` | Approved vendors | Account ID of the adder |
| `inventory_categories` | (`project_key`, `category`) PK | Known categories per project | No |
| `gate_events` | `id` PK auto, `issue_id`, `project_key`, `transition_id`, `allowed`, `would_block`, `reason_code`, `at` | Gate health and metrics (30-day retention) | No |
| `usage` | `day` PK, `screenings`, `llm_calls`, `fallbacks`, `tokens_in/out` | Atomic budget counter **[VERIFIED pattern]** | No |
| `audit` | `id` PK auto, `at`, `actor`, `action`, `target`, `result`, `detail` JSON | Admin and security actions **[VERIFIED]** | Actor account ID |

KVS is used only for the recovery nonce (TTL semantics) **[VERIFIED]**. App-environment secret: `A25_SIGNING_KEY` (encrypted Forge variable; separate per environment; never logged) **[VERIFIED]**. M3: created in **development only** (generated locally, never printed). Production has no key, and decisions fail closed (`NOT_CONFIGURED`) without one.

> **M5 amendment (23 Nov 2026):** the recovery token lives in **SQL** (`recovery_sessions`: SHA-256 of the token only, atomic single-use `UPDATE`), not in KVS. New encrypted variables: `A25_RECORD_SIGNING_KEY` (Ed25519 PKCS#8; development only) and the optional `A25_RECORD_SIGNING_KEY_PREVIOUS` for handover. `A25_SIGNING_KEY` (HMAC) is kept to verify legacy v2 records. M5 tables v010–v015 (`record_keys`, `key_successions`, `checkpoints`, `ledger_events`, `recovery_sessions`, `transfer_chunks`) are described in [M5_RECORD_RESULTS.md §4](M5_RECORD_RESULTS.md). Retention: `gate_events` 30 days and `transfer_chunks` 1 hour, both now enforced by the reconciler; decisions and records are never purged. **Exported archives contain decision text and reviewer account IDs**, and the customer must store them securely.

**M3 tables (implemented, migrations v005–v007):**
- `decisions`: append-only, PK `(issue_id, seq)`, unique `decision_id` and `request_id`. Binds `screening_id`, `fp`, `pipeline_version`, `outcome` and `signal_set`; `decided_by` is the account ID or NULL for system records.
- `assignments`: append-only, PK `(issue_id, seq)`, unique `request_id`.
- `chain`: the signed hash chain, PK `seq`, unique `decision_id`.

Every write is a single `INSERT IGNORE` at `expectedSeq + 1`. Duplicates are idempotent, and concurrent writers get exactly one winner.

**M4 tables (implemented, migrations v008–v009):**
- `settings_events` (PK `(setting, seq)`, unique `request_id`): an append-only admin settings log. Settings: `gate.mode` (monitor|enforce, default monitor) and `review.separation_of_duties` (on|off, default on; replaces the M3 environment variable). Each change is its own audit record.
- `gate_events`: content-free validator evaluations (issue ID, project key, numeric status IDs, mode, verdict, reason, policy version, decision sequence, 16-character content reference, ms).

**M4 scope change:** `read:workflow:jira` (granular, **read-only**, Beta in Atlassian's spec), approved by the user on 23 Nov 2026. It is used only by the admin health check, to find which workflow transitions carry the Article25 gate. `manage:jira-configuration` was rejected (it includes configuration writes).

**M3 scope change:** `read:jira-user` was added, used for reviewer-group membership (`/user/groups`), reviewer names (`/user/bulk`) and reviewer search (`/user/search`). Listing group members (`/group/member`) would need the admin-level `manage:jira-configuration`, so that scope was **not** requested.

## 2. Decision model and state machine
**Machine outcome** (per screening): `CLEAR`, `INVENTORY_UPDATE`, `NEEDS_INFO`, `REVIEW_REQUIRED`, `DPIA_LIKELY` (+ `SCREENING_FAILED`).
**Human decisions:** `APPROVED`, `APPROVED_WITH_CONDITIONS`, `NEEDS_MORE_INFORMATION`, `REJECTED`. The system records `APPROVAL_RECONFIRMED` (non-material change) and `APPROVAL_INVALIDATED` (material change), and the recovery record `RESTORED` (audit only), are system-attributed.

> **M3 amendment (2026-11-22, implemented).**
> - `CHANGES_REQUESTED` became `NEEDS_MORE_INFORMATION`: the reviewer must ask at least one specific question. It covers both "change the plan" and "tell me more", without implying the reviewer has rejected the work.
> - `RECONFIRMED` and `STALE` are stored as the system decisions `APPROVAL_RECONFIRMED` and `APPROVAL_INVALIDATED`.
> - The **review status is derived** from the latest decision plus the current content fingerprint (`core/review.js`), not stored separately. That avoids a second write that could be half-applied (Forge SQL has single-statement atomicity only).
> - Derived statuses: `NOT_SCREENED`, `AWAITING_SCREENING`, `SCREENING_FAILED`, `AWAITING_REVIEW`, `NOT_REQUIRED`, `APPROVED`, `APPROVED_WITH_CONDITIONS`, `NEEDS_MORE_INFORMATION`, `REJECTED`, `APPROVAL_STALE`, `PENDING_RECHECK` (text edited, re-check not finished: the approval does **not** cover it) and `CHANGED_SINCE_DECISION`.
> - The gate column below was the M4 design; **no gate is active in M3**.
> - **M4 amendment:** the gate is live, and the policy is stricter than the column below. **Only a verified human APPROVED decision on the current text allows** (`CLEARED_AUTO` / CLEAR does **not** pass a protected transition), and APPROVED_WITH_CONDITIONS blocks until conditions are confirmed. Full matrix: [M4_ENFORCE_RESULTS.md §4](M4_ENFORCE_RESULTS.md).
> - Evidence: [M3_REVIEW_RESULTS.md](M3_REVIEW_RESULTS.md).

**Work-item states and gate effect** (default policy):
| State | Entered when | Gate | Leaves when |
|---|---|---|---|
| `OUT_OF_SCOPE` | project not in scope | **allow** | project added to scope → `NOT_SCREENED` |
| `NOT_SCREENED` | in scope, no screening yet (pre-install items) | **block** ("not checked yet") | screening done |
| `SCREENING` | job queued/running | **block** ("check in progress") | screening done / failed |
| `SCREENING_FAILED` | 3 failed attempts | **block** | re-check succeeds |
| `CLEARED_AUTO` | outcome CLEAR or INVENTORY_UPDATE (policy: no decision required) | **allow** | re-screen with a higher outcome → re-evaluated |
| `NEEDS_INFO` | outcome NEEDS_INFO | **block** (policy toggle; default block) | edit → re-screen, or "send anyway" → `PENDING_REVIEW` |
| `PENDING_REVIEW` | outcome ≥ REVIEW_REQUIRED (policy) | **block** | decision |
| `APPROVED` / `APPROVED_WITH_CONDITIONS` | decision | **allow** | material re-screen → `STALE` |
| `NEEDS_MORE_INFORMATION` (was `CHANGES_REQUESTED`) | decision | **block** | edit → re-screen → `CHANGED_SINCE_DECISION` → new decision (keeps history) |
| `REJECTED` | decision | **block** | new decision by a reviewer (edit + re-screen → `PENDING_REVIEW`) |
| `STALE` | material change after approval | **block** | decision |
| (any) + monitor mode | admin switch | **allow**, logged `would_block` | switch off |

Pure function: `policy.gate(state, settings) → {allow, reasonCode}`. **Unit-tested exhaustively** (every state × policy option). Any unknown state blocks.

**Evidence-locked approval:**
- every approving decision stores `fp` (content fingerprint) and `signal_set` (categories, vendors, criteria, outcome);
- materiality is computed against `signal_set` (SYSTEM_ARCHITECTURE §5.4);
- the ledger records each decision with the `fp` it covered, and each `RECONFIRMED` record.

## 3. Authorisation
| Operation | Check (server-side, every call) |
|---|---|
| Panel read | `asUser` browse check via an issue read; on failure, status only |
| Re-check | browse permission + rate limit (1 / item / 60 s) |
| Send anyway | caller is the reporter or assignee, or a reviewer |
| Decide | reviewer group membership **[VERIFIED pattern]** + separation of duties (not reporter or assignee; toggle audited) + state precondition + optimistic version |
| Settings read/write | Jira global `ADMINISTER` permission for the caller **[UNVERIFIED Q4]** |
| Monitor mode | admin + confirmation + audit + banner |
| Recovery verify/confirm | recovery group **[VERIFIED]** + empty store + nonce bound to user and page + expiry + re-verify |
| Record export, verify, restore, key adoption (**M5**) | Jira administrator (deviation from the recovery group, deferred) + empty store + single-use token (SHA-256 stored) bound to the user and the archive digest + 10 min expiry + re-verify; transfer chunks readable only by the exporting admin |
| Single decision record download (**M5**) | reviewer group + an as-user read of the work item |
| Sample creation | admin + explicit confirmation; creates issues **as the user** (attributable) |
| Validator | platform invocation; reads app SQL only; never trusts issue properties **[VERIFIED]** |

Identity always comes from `context.accountId`; payload identity fields are ignored **[VERIFIED pattern]**. The frontend hides controls but is never trusted.

## 4. Threat model (STRIDE-lite)
| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| Forged approval | Edit the issue property; call a resolver with a forged state or identity | Gate reads app-only SQL; identity from context; group check | **VERIFIED** |
| Self-approval | Reviewer approves their own work | Separation of duties | PROPOSED (test) |
| Approve-then-change | Scope changed after approval | Evidence-locked approval → `STALE` | PROPOSED (live demo test) |
| Ledger tampering | Edit, delete, reorder or replay the Confluence backup | Hash chain + checkpoints + receipts; restore refuses | **VERIFIED** (doc 22) |
| Consistent rollback by a space admin | Roll back backup + versions + receipts together | Residual risk; documented; recovery is two-step and audited | **ACCEPTED** (doc 22 §5) |
| Archive tampering or forged archive (**M5**) | Edit, truncate or re-sign an exported archive; insert a key in SQL | Ed25519 records, archive digest + signature, trust only from environment-variable anchors through signed successions; offline verifier pins the fingerprint | **VERIFIED** (tests; live tamper and truncation NOT VALID) |
| Partial restore lets work through (**M5**) | Crash part-way through a restore | Gate-safe write order + `RESTORE_INCOMPLETE` gate reason; resumable | **VERIFIED** (tests) |
| Rollback to an older genuine archive (**M5**) | Restore an old but valid archive after an uninstall | Empty store only, admin only, report shows the date and head, re-screen invalidates approvals whose text changed | **ACCEPTED** (M5 §11) |
| Key loss or substitution (**M5**) | Lose the record key; swap a key in the database | Old approvals blocked (`RECORD_KEY_UNTRUSTED`) until the previous key is adopted by typed fingerprint; database keys are never trusted | **VERIFIED** (tests) |
| Prompt injection | Ticket text instructs the model | Delimited input; the LLM cannot set the outcome; quotes verified; human decision required to clear | PROPOSED + eval cases |
| Disable the gate | Remove the validator from a workflow; add an ungated transition | Gate health (last seen per project) shown to admins and reviewers; documented limitation | PROPOSED |
| Monitor-mode abuse | Admin turns enforcement off | Audit + persistent banner + register note | PROPOSED |
| Data exposure via panel | Findings shown to users who can't browse the issue | asUser check | PROPOSED |
| Data exposure via logs | Content in Forge logs (developer-visible by default **[DOCS]**) | Allow-listed logger; no text and no account IDs | PROPOSED (P0) |
| Data exposure via register | Confluence page readable by its viewers | Space chosen by the admin; warning in Get started; register shows key, decision, conditions, decider; no excerpts | PROPOSED |
| Cost exhaustion | Mass edits → LLM calls | Fingerprint cache, atomic daily budget, fallback | PROPOSED (pattern verified) |
| Race / lost update | Concurrent decisions or screenings | Optimistic `version`, claim-then-finalise, idempotent keys | **VERIFIED pattern** (C2) |
| Partial failure | Crash between writes | Ordered writes + reconciler; state finalised last (fail closed) | PROPOSED |
| Uninstall / data loss | Storage wiped | Fail-closed gate + authorised recovery | **VERIFIED** |
| Key compromise or rotation | Signing key leaked or rotated | Encrypted env var; rotation invalidates old signatures → `kid` support | LATER (documented) |

## 5. Data minimisation and retention
| Data | Minimisation | Retention |
|---|---|---|
| Work-item text | Read in memory only; never stored or logged | — |
| Evidence excerpts | ≤ 120 chars, redacted (emails, phones, card-like numbers), ≤ 12 per screening | Purged with the issue; superseded screenings purged after 90 days |
| Decisions (conditions, rationale) | Free text by reviewers; UI hint "don't include personal data" | Kept for accountability while installed; register copy is customer-owned |
| Account IDs | Reviewer/decider, audit actor, inventory adder | As above; never in logs or the issue property |
| Gate events | IDs + reason codes only | 30 days |
| Usage | Counts only | 90 days |
| Confluence register | Issue key + decision + conditions + decider + time + hash prefix. **No excerpts and no work-item summaries** (summaries can themselves contain personal data). | Customer-controlled; survives uninstall (disclosed) |
| Issue property `article25-review` | Outcome, state, decision ID, receipt; no excerpts | Customer-controlled |

**AI processing:** text goes to Forge LLM (Atlassian platform; no egress). The policy must not claim training, retention or region terms beyond Atlassian's published terms (`docs/privacy-policy-review.md` #9). AI can be switched off (FR-A4).

## 6. Error handling and fail-safety principles
1. **Gate:** unknown → block.
2. **Decisions:** claim, then record, then finalise. Not finalised → not cleared.
3. **Recovery:** all-or-nothing; states written last; compensation on error **[VERIFIED]**.
4. **Screening:** errors degrade to rule-based (labelled), never to Clear.
5. **Publishing:** a failure never reverts a decision; backlog visible; retried.
6. **User-facing errors:** say what happened, what is still enforced, and what to do.

## 7. Items requiring legal or privacy review before publication
Carried from `docs/privacy-policy-review.md` §3. The product must not ship marketing copy or a policy that asserts:
- compliance;
- certifications;
- data residency;
- Forge LLM training or retention terms;
- a developer controller/processor role.

These claims require review first.
