# M4 — ENFORCE: Results

**Milestone:** M4 Enforce (production-grade Jira workflow enforcement).
**Branch:** `milestone-m4-enforce`, stacked on `milestone-m3-review`. **Dates:** 23 Nov 2026.

**Environment:** development only (`article25`, dev install on the demo site, app version 6 after the approved scope upgrade).
- AI stayed **off** the whole time, with no billable calls.
- **No production deploy; no sharing; main untouched.**
- The gate was tested only on two new synthetic projects. The development gate was left in **monitoring** (non-blocking) mode at the end.

> **Central promise:** a protected Jira transition proceeds only when a human reviewer's APPROVED decision covers the **exact current text** of the work item, and that decision's signed record verifies. The reviewer decides; Article25 enforces.

## 1. Definition of success

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | A real Forge workflow validator, using supported capabilities | ✅ | `jira:workflowValidator` lambda (`article25-gate`); §3 |
| 2 | Decisions come from authoritative Article25 records | ✅ | One SQL snapshot of the work item, decisions and signed chain records; §3.2 |
| 3 | Enforcement blocks unauthorised protected transitions | ✅ live | §7, tests L3, L4 and L8 |
| 4 | Monitor mode records would-block without blocking | ✅ live | L1 |
| 5 | Missing or inconsistent data cannot bypass enforcement | ✅ tests + live | §4; L9 (platform crash and timeout fail closed) |
| 6 | Material edits invalidate authorisation | ✅ live | L5 |
| 7 | Conditions on conditional approvals are handled safely | ✅ live | L6; policy in §5 |
| 8 | The health check accurately identifies coverage | ✅ live | L10 (a real gap was detected, then fixed) |
| 9 | Gate events are auditable | ✅ | `gate_events` and `settings_events`; §6 |
| 10 | Company-managed and team-managed projects tested live | ✅ | A25GC and A25GT |
| 11 | Bulk transitions tested | ✅ live | L7, in both project types |
| 12 | Security, accessibility, frontend and backend checks pass | ✅ | §8: 144 backend + 58 frontend tests, axe, lint, copy lint, Forge lint, build, budgets |
| 13 | Docs and roadmap match the implementation | ✅ | §13 |
| 14 | Security-audited draft PR | ✅ | PR #6 (draft, base `milestone-m3-review`) |
| 15 | Production and sharing untouched | ✅ | No production variables or deployment; sharing not enabled |

## 2. Technical decision record

### 2.1 Candidate approaches

| Approach | Official support | Security | Performance | Verdict |
|---|---|---|---|---|
| **A. Lambda validator (`jira:workflowValidator` + `function`) reading Article25's Forge SQL** | Documented (Preview module). The lambda receives the issue key, configuration and transition. Stage 1 verified it in both project types. | Only the app writes SQL; reviewer and integrity checks happen server-side. | One Jira read and one SQL statement: **~0.23 s median** in-function (live) | **Selected** |
| B. Expression validator over an issue/entity property | Documented | **Bypassed live in Stage 1 (T10):** any editor can write issue properties | Fastest (no function) | Rejected |
| C. Expression validator calling back to the app | Not supported: Jira expressions cannot call Forge functions or SQL | — | — | Not possible |
| D. Post-function or Automation that reverts the status | Post-functions run after the transition commits | Detects rather than prevents, and there is a race window | — | Rejected (detect-only fallback only) |
| E. Workflow condition (hides the transition) | Documented | Conditions cannot explain why, and must also hold for list views | Adds evaluation to every issue view | Rejected for the gate; a possible complement later |

### 2.2 Platform facts established for M4 (live unless stated)

1. **Payload.** The lambda payload contains `issue`, `transition`, `modifiedFields`, `context`, `contextToken` and `user`. That's richer than the documented `{issue, configuration, transition}`; key names only were logged.
2. **Invocation context.** It carries `installContext`, `installation`, `principal` and `workspaceId`, but **no `cloudId`**. The site ID used for record signatures is taken from `installContext`, which makes signatures verify across resolvers and the validator.
3. **How Jira stores the rule.** Jira stores Forge lambda validators as `ruleKey: "forge:expression-validator"`, with `parameters.key = "ari:cloud:ecosystem::extension/<appId>/<envId>/static/<moduleKey>"`. The health check matches this exact identity; it is not documented by Atlassian.
4. **Uncaught exception in the validator:** Jira blocks the transition with "The transition failed because of an error in validator 'Article25 privacy gate'…". **Fails closed** (tested with a temporary experiment build; see L9).
5. **Validator runtime over ~25 s:** Jira blocks after **25.9 s** with the same message; a late "allow" is never applied. **Fails closed.**
6. **App uninstalled:** Jira blocks ("couldn't find validator"). Verified in Stage 1 (T13).
7. **Bulk transitions:** Jira's bulk-transition operation runs the validator **per issue**, moves only the allowed ones, and reports Article25's message for each refused issue.
8. **Workflow reads:** `GET /rest/api/3/workflows/search?expand=values.transitions` returns validators per transition and each workflow's scope (company- or team-managed). It needs **`read:workflow:jira`**, a granular, read-only scope marked Beta in Atlassian's spec. **Approved by the user on 23 Nov 2026.**
9. **Rejected alternative scope:** the classic `manage:jira-configuration`, which includes configuration writes.

### 2.3 Security and performance implications

- **Security.**
  - The validator runs as the app; Jira provides no user context to rely on.
  - The as-app issue read returns only identity and text, used to compute the current fingerprint.
  - Nothing user-supplied is trusted: the issue key is regex-validated, transition IDs are recorded only when numeric, and configuration is ignored.
- **Fail-closed layers.**
  1. Policy: every non-approved state blocks.
  2. Service: any exception, an unknown mode or a 9-second deadline blocks.
  3. Handler: a construction failure blocks.
  4. Platform: a crash or a timeout over 25 s blocks.
- **Performance.**
  - One as-app Jira read, then one SQL statement that joins the work item, the latest decision, the latest human decision, both chain records and the gate mode.
  - Signature verification is O(1) for this issue's record, never a full chain scan.
  - The audit insert has a 1.5-second cap.

### 2.4 Remaining uncertainties

- The module is **Preview**: it is stable, but deprecation windows may be shorter.
- The `read:workflow:jira` scope is marked **Beta** in Atlassian's spec. If it changes, the health check reports "coverage unknown" rather than claiming protection.
- **Not tested:**
  - Automation-rule-triggered transitions (they are expected to run validators like any transition);
  - Jira Service Management projects;
  - the old workflow editor.

## 3. Architecture

### 3.1 Components (all new code in M4 unless noted)

| Component | File | Role |
|---|---|---|
| Gate policy (pure) | `app/src/core/gate.js` | `evaluateGate`, `verifyDecisionRecord`, `applyMode`, `analyseCoverage`, reason catalogue, policy version `g1` |
| Gate service | `app/src/backend/services/gate.js` | Validator path, previews, mode, health |
| Validator entry | `app/src/backend/handlers/gate.js` | `gateValidator` (manifest `gate-fn`); fail-closed wrapper |
| Admin settings | `app/src/backend/services/settings.js` | Append-only audited settings: `gate.mode`, `review.separation_of_duties` |
| Storage | `schema.js` v008 `settings_events`, v009 `gate_events`; `gateSnapshot()` | Content-free events; single-statement snapshot |
| Desk | `services/desk.js`, `index.js` | `getGateOverview`, `setGateMode`, `setSeparationOfDuties`; gate preview in the workspace and panel |
| UI | `desk/settings/GateSettings.jsx`, `desk/review/GatePreview.jsx`, panel `GateLine`, `DecisionForm` confirmation shortcut | §9 |

### 3.2 Validator path

```
Jira transition ─▶ gate-fn (lambda, as app, no user)
  1. issue.key matches ^[A-Z][A-Z0-9_]*-[1-9]\d*$ ?             no  → block INVALID_CONTEXT
  2. Jira GET issue (as app): id, project, summary, description   404 → block ISSUE_UNAVAILABLE
  3. SQL (ONE statement): work_item ⨝ latest decision ⨝ latest human decision
                         ⨝ chain records of both ⨝ latest gate.mode           error → block SYSTEM_UNAVAILABLE
  4. currentFp = fingerprint(current text); evaluateGate(...)      (pure; §4)
  5. mode: enforce → result = allow; monitor → result = true
     (no setting yet → monitor; unknown stored value → enforce)
  6. INSERT gate_events (≤1.5 s; a failure never changes the result)
  The whole of 2–4 runs under a 9 s deadline                       timeout → block TIMEOUT
```

The validator **re-derives** the review status with the same `deriveReviewStatus` the desk uses. It never trusts cached flags, UI state, issue properties or screening outcomes as approvals.

## 4. Policy matrix (policy `g1`)

"Audit" = a `gate_events` row with mode, verdict, reason, policy version, decision sequence and a 16-character content reference. In monitor mode, every row below is **allowed** and recorded as `would_block` / `would_allow`. The exception is the infrastructure rows, which block in both modes because the mode cannot be read.

| State | Enforce | Monitor | Reason code | Message shown in Jira ("Article25: …") | Audit |
|---|---|---|---|---|---|
| Human **APPROVED** on the current text, record verified | allow | allow (`would_allow`) | `ALLOW_APPROVED` | — | yes |
| APPROVED carried over by the system (non-material edit), human + carry records verified | allow | allow | `ALLOW_APPROVED_CARRIED` | — | yes |
| No screening record | block | allow (`would_block`) | `NOT_SCREENED` | Not checked yet → open the panel, Check now | yes |
| Screening pending / in progress | block | allow | `CHECK_IN_PROGRESS` | Being checked → try again in a minute | yes |
| Text edited, no decision, re-check pending | block | allow | `CHECK_IN_PROGRESS` | (same) | yes |
| Screening failed | block | allow | `CHECK_FAILED` | Re-check from the panel | yes |
| Invalid extraction (AI output rejected) | — | — | — | Becomes a **rule-based** result or `SCREENING_FAILED` in the M2 pipeline; then as per those rows | — |
| Rule-based (limited recall) result | — | — | — | Never an approval; the gate needs a human decision in every case | — |
| REVIEW_REQUIRED / NEEDS_INFO / DPIA_LIKELY, no decision | block | allow | `REVIEW_REQUIRED` | Needs a privacy review → a reviewer must approve | yes |
| **CLEAR** or INVENTORY_UPDATE (AI or rules), no decision | block | allow | `NO_REVIEW_DECISION` | No concern found, but this transition needs a reviewer's decision | yes |
| APPROVED_WITH_CONDITIONS (direct or carried) | block | allow | `CONDITIONS_OUTSTANDING` | Approved with conditions → a reviewer must confirm them (record Approve) | yes |
| NEEDS_MORE_INFORMATION | block | allow | `NEEDS_MORE_INFORMATION` | Answer the questions, ask for a new decision | yes |
| REJECTED | block | allow | `REJECTED` | Rejected; needs a new decision | yes |
| Approval invalidated (material change) | block | allow | `APPROVAL_INVALIDATED` | Earlier approval no longer applies → review again | yes |
| Approved, but text changed and re-check pending ("stale content") | block | allow | `CHANGED_RECHECKING` | Re-checking → try again in a minute | yes |
| Rejection / request for information, then text changed | block | allow | `CHANGED_SINCE_DECISION` | Ask a reviewer to review the current text | yes |
| Approval stored but not yet anchored in the signed chain | block | allow | `RECORD_PENDING` | Still being recorded → try again | yes |
| Edited row, forged or mismatched chain record, cross-site record, wrong key | block | allow | `RECORD_INVALID` | Integrity check failed → ask your administrator | yes |
| Signing key or site ID missing | block | allow | `SIGNING_NOT_CONFIGURED` | Signing not configured → ask your administrator | yes |
| Inconsistent records (e.g. a carry-over claiming APPROVED while the latest human decision is REJECTED; a "human" approval stored as a system record) | block | allow | `INCONSISTENT_RECORD` | Ask a reviewer to record a new decision | yes |
| Unknown status, malformed fingerprint | block | allow | `UNKNOWN_STATE` | Could not determine the state | yes |
| Project outside Article25's scope but transition protected | block | allow | `OUT_OF_SCOPE` | Configuration conflict → ask your administrator | yes |
| Issue key missing or invalid | block | **block** | `INVALID_CONTEXT` | Could not identify the work item | yes (mode `unknown`) |
| Jira read: not found / not permitted for the app | block | **block** | `ISSUE_UNAVAILABLE` | Could not read the work item | yes (mode `unknown`) |
| Database unavailable / migration missing / Jira 5xx / unexpected error | block | **block** | `SYSTEM_UNAVAILABLE` | Could not verify right now → try again (a migration is requested) | best effort |
| Internal deadline (9 s) | block | **block** | `TIMEOUT` | Took too long → try again | best effort |
| Function crash or platform timeout (25 s) | block | **block** | (platform) | Jira's own "error in validator" message | Forge logs only |

**Deliberate decisions:**

- **An automatic "no concern" result is not an approval.** CLEAR and INVENTORY_UPDATE block on protected transitions. Admins choose *which* transitions are protected, so teams protect only the ones where a human privacy decision is required. A trusted automatic clearance is deferred (§12).
- **When the mode cannot be read, the gate blocks even if the site is in monitor mode.** An outage must never authorise protected work. Mitigation: Jira lets admins remove the rule; that is documented.
- **An unknown stored mode is treated as `enforce`** (the strictest).

## 5. Conditional approvals

- **M3 model:** an `APPROVED_WITH_CONDITIONS` decision stores 1–10 free-text conditions, bound to the content fingerprint.
- **The problem:** free text cannot be verified automatically.
- **M4 policy:** conditional approval **never** authorises a protected transition. The gate blocks with `CONDITIONS_OUTSTANDING` until a reviewer confirms the conditions are met.
- **How a reviewer confirms:** by recording **Approve** for the *current* text. The workspace offers a **"Confirm conditions are met"** shortcut that prefills Approve with "Conditions confirmed met: (1) …; (2) …". Nothing is sent until the reviewer submits.
  - Separation of duties, record signing and evidence binding all apply, exactly as for any decision.
  - **No new status or decision type was introduced.**
- **Carry-over:** a non-material edit after a conditional approval carries the conditions (`APPROVAL_RECONFIRMED`), so the gate still blocks until confirmation.
- **Limitation:** confirmation is a reviewer's attestation; Article25 does not verify that the conditions were implemented in the product. This is stated in the UI hint and here.

## 6. Transition policy, modes, audit trail and health

### 6.1 Transition policy

- **Protection is explicit and per transition.** A transition is protected **iff** a Jira administrator adds the "Article25 privacy gate" rule to it, in Jira's workflow editor or through the workflow API. Admin transitions such as "→ Backlog" stay unaffected (verified live).
- **Recommended placement:** "start work" transitions (e.g. → In Progress) and/or release transitions (→ Done).
- **Health check.** For every workflow that contains the rule, it lists the **protected statuses** (destinations of gated transitions). It flags **every other transition into a protected status that lacks the rule** as a gap. The classic gap is a global "any status → In Progress" or a rework path.

### 6.2 Modes

- **Monitor** (default, no setting): always allows, and records `would_block` / `would_allow`.
- **Enforce:** blocks per the policy.
- **Changing mode:** Jira administrators only (server-side ADMINISTER check), with:
  - a confirm dialog that explains the impact, plus an optional reason;
  - optimistic concurrency (`expectedSeq`) and an idempotent request ID;
  - the change written as one `INSERT IGNORE` into `settings_events`, so **the change is its own audit record**.
- **UI:** monitoring is always labelled "**NOT blocked**", with a dashed information banner. Enforcing uses a solid danger banner, and the two cannot be confused.

### 6.3 Audit

- **`gate_events`:**
  - time, issue ID, project key;
  - from/to status IDs (numeric only), mode, verdict (`allow`, `block`, `would_allow`, `would_block`), reason code;
  - policy version, decision sequence, 16-character content reference, duration.
  - **No ticket text, names, account IDs, prompts or secrets.** Verified by test and in the live logs.
- **Separate from decisions:** gate events cannot be mistaken for decisions (separate table, no decision rows ever written by the gate; tested).
- **`settings_events`:** setting, sequence, value, changed-by account ID (server-side only; the UI shows names), time, reason.

### 6.4 Health check (`getGateOverview`, admins only)

It reports:
- **Database:** working / migration pending / unavailable.
- **Record signing:** configured / missing.
- **Mode**, with its default flag.
- **Coverage per workflow:**
  - name, project type and coverage status (complete / gaps);
  - protected statuses and covered transitions (with "from" statuses);
  - gaps.
- **Recent gate checks**, with keys only for items the admin can view.
- The 7-day verdict counts and the mode history.

**Overall status:** `not_ready`, `unknown` (workflows could not be read), `not_protected` (no rule anywhere; installation alone protects nothing), `gaps`, `monitoring` or `enforcing`.

**"Stale" configuration** is covered as follows:
- rules from other apps or other modules (e.g. the Stage 1 spike's validators) are **excluded**;
- a protected status reachable without the gate is reported as a gap.

## 7. Live validation (development, demo site, AI off, synthetic projects only)

Two new **isolated** projects were created for M4:

| Project | Type | Workflow | Protected transitions |
|---|---|---|---|
| **A25GC** | company-managed | Own workflow, scheme used only by this project | → In Progress |
| **A25GT** | team-managed | Project-scoped workflow | → In Progress, → Done, later also Rework → In Progress |

Synthetic issues were A25GC-1/2 and A25GT-1/2, all labelled `a25-synthetic`. AS-78 and AS-79 (M3 evidence) were **not touched**. The Stage 1 spike validators on the AS and A25C workflows were left in place and correctly excluded from coverage.

| # | Scenario | Result (observed transition behaviour) | Evidence |
|---|---|---|---|
| L1 | **Monitor** (default): unreviewed items → In Progress in A25GC and A25GT | **204, moved**; `would_block REVIEW_REQUIRED` recorded | logs; `01-settings-monitoring-verified-coverage.jpg` |
| L2 | Admin switches to **enforce** in Settings (confirm + reason) | Mode Enforcing; history shows who, when and why | `02-settings-enforcing.jpg` |
| L3 | **Enforce**, unprotected transitions (→ Backlog, → To Do, A25GC → Done) | **204**, unaffected | REST |
| L3 | **Enforce**, protected, no approval (A25GC → In Progress, A25GT → In Progress, A25GT → Done) | **400**, status unchanged, "This work item needs a privacy review…" | REST; `03-workspace-blocked-needs-review.jpg`; `07-jira-transition-failed-flag.jpg` (Jira UI flag) |
| L4 | Reviewer approves A25GT-1 → In Progress, → Done (two protected transitions) | **204** both (1.33 s / 1.29 s incl. record verification) | `04-workspace-approved-allowed.jpg` |
| L5 | **Material edit** after approval (adds contact data and Twilio) | Immediately: **400** `CHANGED_RECHECKING`; after the re-check: **400** `APPROVAL_INVALIDATED`; **re-approval → 204** | `05-workspace-material-edit-blocked.jpg`, `06-issue-gate-history.jpg` |
| L6 | **Conditions** (A25GC-1, company-managed): Approve with conditions | **400** `CONDITIONS_OUTSTANDING`; "Confirm conditions are met" → Approve → **204** | REST; workspace |
| L6b | **Separation of duties switch** (audited): turned off for L6 (the company-managed project's screen does not allow changing the reporter), then back on | Both changes recorded; the decide form follows the setting | Settings |
| L7 | **Bulk transition** (Jira bulk API) of an approved and an unapproved item, in both projects | Approved moved; unapproved stayed, with Article25's message in the bulk result | REST task results |
| L8 | Developer view: status change in Jira's issue screen | Jira flag "**Transition failed** — Article25: This work item needs a privacy review…"; status unchanged | `07-jira-transition-failed-flag.jpg` |
| L9 | **Platform failure** (temporary experiment build, reverted immediately and redeployed): uncaught exception for an *approved* item; validator stalled 40 s for an *approved* item | Both **400** (crash ~1.3 s; timeout after **25.9 s**). Jira: "error in validator 'Article25 privacy gate'". **No bypass.** Real build restored and re-verified (approved → 204) | REST |
| L10 | **Health accuracy**: added "Rework" (In Review → In Progress) without the gate | Bypass proven (unapproved item reached In Progress via Rework); health showed **Gaps found** naming Rework; gate added to Rework → bypass **blocked (400)** and health **Complete** | `08-health-gap-detected.jpg`, `09-health-gap-fixed-complete.jpg` |
| L11 | Mode switched back to **monitoring** (audited, reason recorded) | Monitoring | logs (`settings.changed → monitor`) |

### Not verified live (and why)

- **Database unavailable / migration missing / signing key missing or rotated / tampered records.** Forcing these on the shared dev database would need product test hooks (not allowed) or destroying the only signing key, which would invalidate the M3 records. They are covered by unit and integration tests (§8). The *platform-level* failure paths (crash, timeout) **were** verified live (L9).
- **Issue panel gate line, visually.** The browser tool could not paint the panel iframe while scrolled. Covered by the frontend test and the `getPanelState` resolver (live OK).
- **Automation-triggered transitions, JSM projects, the old workflow editor:** not exercised.
- **Multiple real reviewers:** the demo site has one reviewer account; separation of duties was exercised with a seeded demo reporter and the audited switch.

## 8. Automated tests (all passing)

| Suite | Tests | M4 coverage |
|---|---|---|
| `app/test/gate.test.mjs` | **26** | Covers:<br>• the policy matrix and record integrity (edited row, forged, mismatched, cross-site, missing or rotated key, unanchored);<br>• inconsistent records and unknown state;<br>• monitor vs enforce;<br>• material and non-material edits, conditions, rejection, requests for information;<br>• SQL unavailable or timeout, missing migration;<br>• Jira down / not found, unexpected errors, audit-write failure;<br>• invalid context and injection-shaped keys, unknown stored mode;<br>• duplicate and bulk executions, out-of-scope configuration;<br>• content-free events, admin-only controls, optimistic and idempotent settings, the audited separation-of-duties switch;<br>• health (none / gaps / complete / unknown / not ready, other-app rules excluded);<br>• previews write no events |
| `app/test/review-service.test.mjs` | 23 | M3, now over the shared `world.mjs` (real pipeline + review + desk + gate) |
| Other backend suites | 95 | M1–M3 (unchanged; all passing) |
| `app/frontend/src/gate.test.jsx` | **11** | Covers:<br>• monitoring labelled as not blocking; coverage, gaps, unknown and not-ready states;<br>• confirmed mode switch (version, request ID, note; waits for the refreshed state);<br>• the enforcing view; workspace and panel previews; unknown mode never shown as allowed;<br>• the conditions shortcut; real Home setup values;<br>• axe accessibility checks |
| Other frontend suites | 47 | M1–M3 |
| **Total** | **144 backend + 58 frontend** | Lint, copy lint, Forge lint and the production build are clean; bundle budgets are enforced |

## 9. User experience

| Audience | What they see |
|---|---|
| **Developer** | Jira's own "Transition failed" flag with Article25's one-sentence reason and next step. The panel shows "Protected transitions: Blocked now" plus the reason. |
| **Reviewer** | A "Protected transitions" block in the decision zone: the mode badge, "Blocked now" or "Allowed now" (or "Would be blocked (monitoring, not blocking)"), the server's reason, and this item's **recent gate checks**. For conditional approvals, "Confirm conditions are met". |
| **Administrator** | Settings → Workflow gate: mode banner, overall status, confirmed switch, dependency checks, per-workflow coverage with gaps called out, recent checks, change history, policy version. Review card: an audited separation-of-duties switch. |
| **Everyone** | Overview shows the real reviewer group and gate mode, and points to Settings for coverage. It never claims protection on its own. |

ADS tokens only. The layout works in light and dark themes, on desktop and at narrow widths (Settings coverage stacks below 600 px). All controls are keyboard-reachable, with labelled fields and status/alert roles, and pass axe checks in tests.

## 10. Performance (live, development)

| Measure | Budget | Measured |
|---|---|---|
| Validator in-function evaluation (n = 22) | ≤ 500 ms p95 | **median 234 ms, p90 336 ms, max 639 ms** (cold) |
| Allow path incl. signed-record verification | — | 210–293 ms warm |
| End-to-end protected transition (REST client) | ≤ 3 s warm | 0.6–1.9 s warm; ~4 s first (cold) call |
| Gate SQL | one statement | one statement (work item + 2 decisions + 2 chain records + mode) |
| `getGateOverview` (health; 105 workflows scanned) | ≤ 3 s | 1.5–1.8 s |
| `getSettingsOverview` | ≤ 2 s | 0.86 s |
| Bundles (initial gzip) | panel ≤ 200 KB, desk ≤ 400 KB (now enforced) | panel **191.0 KB**, desk **205.9 KB** |

## 11. Security review and defects found

| Finding | Severity | Resolution |
|---|---|---|
| Reading workflow configuration would need `manage:jira-configuration` (admin writes) | Design | Asked the user; approved **read-only** `read:workflow:jira` instead |
| The health payload included the account ID of whoever changed the mode | Low (admin-only) | Removed; names only; regression test |
| A mode change confirmed before the refreshed state was shown ("Mode changed." next to the old badge) | Medium (misleading UI for a security control) | Waits for the refresh; the message names the new mode; regression test |
| A Forge rule-identity substring match could count other apps' rules | Medium (could overstate coverage) | Exact parsing of the extension ARI (app ID and module key); test with the real spike-rule shape |
| Home showed stale M1 claims ("Workflow gate: not added", "Reviewer group: not set") | Low | Real values; coverage only in Settings |
| A gap path (Rework) bypassed protection | Configuration (Jira-native) | Detected by the health check; documented as an admin responsibility |
| Bundle budgets were reported but not enforced | Low | `bundle-report.mjs` now fails the build; CI added |
| Platform timeouts/crashes might allow a transition | Critical if true | **Disproved live:** both block (L9) |

Other checks:
- **Branch audit:** no secrets, tokens, account IDs, cloud IDs or emails added; evidence screenshots contain no personal names. See the PR.
- **Logging:** gate logs carry issue IDs, codes and timings only.
- The temporary experiment code was **never committed**.

## 12. M3 carry-over decisions, limitations and deferred work

### 12.1 M3 carry-over

| Item | Decision | Why |
|---|---|---|
| Audited separation-of-duties switch | **Included** | Same append-only settings mechanism as the gate mode; cheap; needed for safe live testing |
| Inbox limited to the 300 oldest candidates | **Deferred (M8/M10)** | Not needed for gate correctness; needs keyset pagination |
| Duplicate decision submissions not verified live | **Deferred** | Still covered by the unique `request_id` and tests. The UI prevents double submits, and a live check would need a second client |
| Multi-reviewer testing with real accounts | **Deferred (clean-site rehearsal)** | Needs a second licensed user |

### 12.2 Known limitations

- **CLEAR is not automatically allowed on protected transitions** (strict by design). Teams must protect only transitions that need a human decision. Opt-in automatic clearance for **AI-mode** CLEAR is deferred.
- **Condition confirmation is an attestation**, not automated verification.
- **Monitor mode still blocks when Article25 cannot read its own configuration** (fail closed).
  - *Final audit amendment (23 Nov 2026):* narrowed. Monitor mode now blocks only if the **mode itself** cannot be read. Any other evaluation failure in monitor mode is allowed and recorded as "would block". See [FINAL_READINESS_AUDIT.md §9](FINAL_READINESS_AUDIT.md#9-deployment-migration-and-rollback).
- **No per-project or per-transition policy:** one global mode, and protection is wherever the rule is placed.
- **Health check limits:**
  - it scans up to 1,000 workflows (20 pages × 50) and doesn't page further;
  - it cannot tell whether a workflow is *assigned* to a project in scope;
  - `read:workflow:jira` is Beta; if it fails, the health check says "unknown".
- **Gate events have no retention purge yet** (planned: 30 days).
- **No rate limiting of validator invocations:** Jira's own rate limits apply.

### 12.3 Remaining user approvals

- **Production:** deploying the scope change (`read:workflow:jira`) at the scope freeze, plus a production signing key.
- **Clean site:** enforcement on a clean-site rehearsal project.
- **Data cleanup:** deleting or keeping synthetic issues AS-78, AS-79, A25GC-1/2 and A25GT-1/2 and test projects A25GC and A25GT. All are kept for now as evidence.

## 13. Documentation updated
- `PRODUCT_REQUIREMENTS.md`: FR-G1…G7 status, M4 amendments.
- `SYSTEM_ARCHITECTURE.md`: §5.2 amended with the implemented validator path, platform facts and scope.
- `DATA_AND_SECURITY_MODEL.md`: v008/v009, settings audit, scope, gate column now live.
- `UX_DESIGN_SPEC.md`, `INFORMATION_ARCHITECTURE.md`: gate UI, reason vocabulary, monitor vs enforce.
- `MVP_SCOPE.md`: M6 acceptance criteria ticked against evidence.
- `IMPLEMENTATION_ROADMAP.md`: progress, deferred items and the next milestone.

## 14. Install and test (development)

1. **Deploy and install.**
   ```bash
   cd app && npm ci && (cd frontend && npm ci) && npm run check
   ```
   ```bash
   forge deploy -e development
   ```
   Then `forge install --upgrade … --confirm-scopes` (major version: `read:workflow:jira`).
2. **Configure prerequisites:**
   - a Jira group `article25-reviewers` (or `A25_REVIEWER_GROUP`);
   - an encrypted `A25_SIGNING_KEY` variable (development only).
3. **Protect a transition.** In a **test** project's workflow, select a transition → Rules → **Validate details** → Marketplace rules → **Article25 privacy gate** → Update workflow.
4. **Check coverage.** Article25 → Settings → **Workflow gate** should list the workflow and the transition. Fix any gaps it reports.
5. **Run in monitoring first.** Transitions are allowed, and "Would block" entries appear in recent checks.
6. **Enforce.** Choose **Start enforcing**, confirm, and give a reason. An unreviewed item is refused with Article25's message.
7. **Approve and edit.** Approve the item in the review workspace and the transition is allowed. Edit the text materially, and it is blocked again until it is re-reviewed.
8. **Uninstalling.** Remove the rule from workflows first: Jira blocks gated transitions if the app is missing.
