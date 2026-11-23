# Article25 — Implementation Roadmap

**Stage 2** · 2026-11-22 · Scope: [MVP_SCOPE.md](MVP_SCOPE.md) · Deadline: **Tue 22 Dec 2026, 12:00 PT** (submission). The app must keep working through judging, until **3 Feb 2027**.

## 0. Progress (updated 23 Nov 2026, after M5)
| Milestone | Status | Branch / PR (drafts, stacked) | Results |
|---|---|---|---|
| Stage 1/1.5 research + spikes | ✅ Done | `stage1-research-and-spikes` (#1) | `research/` |
| Stage 2 blueprint | ✅ Done | `stage2-product-blueprint` (#2) | this folder |
| M1 Foundation | ✅ Done | `stage3-product-foundation` (#3) | [STAGE3_FOUNDATION_RESULTS.md](STAGE3_FOUNDATION_RESULTS.md) |
| M2 Detect (screening, AI validated at $0.40) | ✅ Done | `milestone-m2-detect` (#4) | [M2_DETECT_RESULTS.md](M2_DETECT_RESULTS.md) |
| M3 Review (inbox, Margin workspace, assignment, four decisions, evidence-locked approval, signed record) | ✅ Done (development) | `milestone-m3-review` (#5) | [M3_REVIEW_RESULTS.md](M3_REVIEW_RESULTS.md) |
| **M4 Enforce** (workflow validator, policy g1, monitor/enforce, audited settings, verified coverage health check, CI) | ✅ **Done (development)** | `milestone-m4-enforce` (#6) | [M4_ENFORCE_RESULTS.md](M4_ENFORCE_RESULTS.md) |
| **M5 Record & Recovery** (Ed25519 ledger v3, trusted-key lifecycle, signed archive + offline verifier, verified restore, Record page, retention) | ✅ **Done (development)**; Confluence register **BLOCKED** on scope approval | `milestone-m5-record` (#7) | [M5_RECORD_RESULTS.md](M5_RECORD_RESULTS.md) |
| **Final readiness audit** (CI, live isolated reinstall/restore, crypto audit, 11 defects fixed, README, judge guide) | ✅ **Done (development)** | `milestone-m5-record` (#7) | [FINAL_READINESS_AUDIT.md](FINAL_READINESS_AUDIT.md) |
| **P1 experience** (Get started, separation-of-duties guidance, bundles −55%, parallel loading, real-browser contrast check in CI) | ✅ **Done (development)** | `milestone-m5-record` (#7) | [P1_EXPERIENCE_RESULTS.md](P1_EXPERIENCE_RESULTS.md) |
| **Competition package** (runbook, AI memo, privacy policy rewrite, clean-site rehearsal, 3:57 demo film from real footage, Devpost draft and checklist) | ✅ **Done** (awaiting your decisions) | `milestone-m5-record` (#7) | [RELEASE_READINESS.md](RELEASE_READINESS.md) |
| Release: production, Sharing, clean site, YouTube, submission | **Needs you**: decisions 1–11 in [RELEASE_READINESS.md §4](RELEASE_READINESS.md#4-decisions-and-actions-that-need-you-in-order) | — | [PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md) |

**Scope changes so far:**
- M3 added `read:jira-user`.
- M4 added `read:workflow:jira` (read-only; approved 23 Nov). `manage:jira-configuration` was rejected.
- Both are in development only. Production gets them at the scope freeze, **with user approval**.
- M5 added **no** scope. The Confluence register needs `read:page:confluence` + `write:page:confluence` (approval request: [M5_RECORD_RESULTS.md §19](M5_RECORD_RESULTS.md)).

**Deferred from M3/M4 (reason → dependency → target):**
| Item | Why deferred | Depends on | Target |
|---|---|---|---|
| Inbox keyset pagination (beyond the 300 oldest candidates) | Not needed for gate correctness | — | M8/M10 |
| Live duplicate-submission check (same request id) | Covered by the unique key + tests; the UI prevents double submits | A second client | M10 |
| Multi-reviewer test with real accounts | The demo site has one reviewer | Clean site + a second user (user action) | C1 rehearsal |
| Opt-in automatic clearance for **AI-mode** CLEAR on protected transitions | Strict by design in g1; needs an explicit admin policy + audit | Admin policy UI | M8 |
| Per-project / per-transition gate policies | One global mode is enough for MVP | Settings UX | Should (post-MVP) |
| ~~`gate_events` retention purge (30 days)~~ | **Done in M5** (reconciler purges after 30 days) | — | — |
| Separation-of-duties change history shown in the UI | Recorded and audited; only the current value is shown | — | M8 |
| Confluence register (outbox, read-only page, checkpoint anchor) | New scopes + multi-app compatibility (preview, paid-listing only) | **User approval before the 4 Dec scope freeze** | M5b / M8 |
| Live uninstall → reinstall → restore rehearsal | Would wipe dev evidence | A separate Forge environment | Before C1 rehearsal |
| Recovery group and dual control for restore | Restore is Jira-admin only today | Product decision | M8 |
| Paged export/verify for very large stores (≳ 50,000 decisions) | Not needed at MVP scale | — | M10 |

**Recommended next (after the final readiness audit, 23 Nov):** the release blockers B1–B7 in [FINAL_READINESS_AUDIT.md §13](FINAL_READINESS_AUDIT.md#13-release-blockers). All of them need you:
- production deploy + Sharing;
- frozen scopes, **4 Dec**;
- a production signing key;
- the clean-site rehearsal;
- the AI-in-production decision;
- the privacy policy URL;
- the submission.

*Update (P1, 23 Nov): items 1–3 below are **done** (Get started; separation-of-duties guidance in the workspace and panel; bundles −55%, parallel loading). A real-browser contrast check was added to CI. Item 4, publishing the standalone verifier, remains open.*

In parallel I can build P1 work that needs no new scope:
1. a Get-started checklist;
2. an inline separation-of-duties hint for admins;
3. a cold-start bundle trim;
4. publishing the standalone verifier.

The Confluence decision is made: **archive only**. The live reinstall/restore is **done** in the isolated `recovery` environment.

> *Historical (after M5, kept for the record):*

**Recommended next (after M5, 23 Nov): M8 onboarding and clean-site rehearsal**, preceded by one decision from you:
1. **Confluence scopes (before the 4 Dec scope freeze):** keep the archive only, or approve `read:page` + `write:page:confluence` for the register (options in [M5_RECORD_RESULTS.md §19](M5_RECORD_RESULTS.md)).
2. **Clean-site rehearsal** is now the highest-impact item (judges install the app): install, configure keys, pin the fingerprint, decide, enforce, export, verify offline.
3. **Live reinstall/restore** in a separate environment, so recovery is demonstrated live without touching dev evidence.

> *Historical (after M4, kept for the record):*

**Recommended next milestone: M5 RECORD.**
1. **It closes the product loop** (DETECT → REVIEW → DECIDE → ENFORCE → **RECORD**). Decisions become a customer-owned, published Confluence register.
2. **It fixes the biggest remaining operational risk.** Stage 1 showed that uninstalling the app loses its storage, and the gate then blocks approved work (fail-closed). Recovery from the register restores approvals.
3. **Its Confluence scopes must be decided before the 4 Dec scope freeze.**

In parallel, the user actions on the critical path remain open: the clean site, the production-deploy approval and the privacy-policy host (§5).

## 1. Calendar and principles
- **Planned internal deadline: submit on Mon 21 Dec**, keeping Tue 22 Dec morning as buffer only.
- **Code freeze: Thu 17 Dec** (end of day). After that, only fixes for defects found in rehearsal.
- **Scope freeze (manifest scopes and modules): Fri 4 Dec.** Any later scope change forces a major version and re-consent **[VERIFIED]**.
- One developer. Each day assumes ~6 focused hours. Effort estimates in [MVP_SCOPE.md §1](MVP_SCOPE.md).
- Branching:
  - `main` stays stable;
  - each phase is built on a `feature/<phase>-<topic>` branch off an integration branch `stage3-mvp`;
  - draft PRs open per milestone;
  - logical commits (backend / frontend / security / docs kept separate).
- **Never trade reliability or security for features.** When the schedule slips, drop Should items first, then reduce polish on Settings, never the gate, ledger or authorisation.

## 2. Phases
The `#` column uses the numbering of the 12 roadmap areas in the Stage 2 brief. Rows are in **execution order**, which differs because of dependencies.

| # | Phase | Contents | Depends on | Dates | Exit criteria |
|---|---|---|---|---|---|
| 1 | **Product foundation** | F0 frontend spike (Q2); register app `article25`; manifest v1 (all modules incl. `llm`; scopes candidate); Vite multi-entry; SQL migrations; logger; CI; resolve Q1, Q3, Q4 | — | Mon 23 – Tue 24 Nov | M1 acceptance criteria met; skeleton deploys to dev and production |
| 3 | **Backend & persistence** (core) | Port `chain-core` + tests; rules v1 with IDs + doc 15 fixes; `policy.gate` + state machine (exhaustive tests); materiality; repositories; settings core (scope, groups, AI, inventory) | 1 | Tue 24 – Wed 25 Nov | Core tests green; eval rules suite in CI |
| 4 | **AI screening** | Trigger (created/updated/deleted, Q5); queue consumer; LLM adapter (haiku-5-5, auto tool choice, timeout/retry); quote verification + redaction; fallback; fingerprint cache; atomic budget | 1, 3 | Wed 25 – Fri 27 Nov | M2 criteria except the eval run |
| 2 | **Core frontend** (part 1) | Design tokens + component primitives; **panel** all states | 1, 4 | Thu 26 – Sat 28 Nov | M3 criteria |
| 6 | **Jira workflow enforcement** | Validator on policy; gate events; monitor mode; live tests in both project types | 3, 4 | Sat 28 – Sun 29 Nov | M6 criteria except material re-lock (needs decisions) |
| 11a | **Clean-site rehearsal (C1)** | Production deploy of the skeleton; Sharing; install on the clean site; connect Confluence; validator; screening; **D2 TWG decision** | 1, 4, 6 + **user actions** | Mon 30 Nov – Tue 1 Dec | Install path documented; friction list; D2 recorded |
| 5 | **Privacy review & approval** | Desk shell + routing; inbox; review workspace (EvidenceDocument, margin, decision form); decision service (claim → record → finalise, SoD, conflicts, reconciler); material re-lock completes M6 | 2, 3, 6 | Tue 1 – Mon 7 Dec | M4, M5 criteria; M6 complete |
| — | **Scope freeze** | Finalise scopes (D2) and modules; production deploy | 11a | **Fri 4 Dec** | Manifest frozen; frozen scope list recorded in the repo |
| 7 | **Confluence register & audit** | Outbox + publisher; register rendering with markers; checkpoints + receipts; integrity badge; Decisions view; audit log | 5 | Mon 7 – Wed 9 Dec | M7 criteria |
| 9 | **Administration & configuration** | Get started; settings sections; inventory editor; sample scenario; gate health UI | 2, 6, 7 | Wed 9 – Fri 11 Dec | M8 criteria |
| 10 | **Security & reliability** | Recovery port (M9); M10 tests; authorisation tests per resolver; bulk-transition test (Q7); performance budgets; a11y audit (axe + keyboard walkthrough) | 5, 7, 9 | Fri 11 – Sun 13 Dec | M9, M10 criteria; NFR-5, NFR-7 measured |
| 8 | **Teamwork Graph context** (S1, if D2 = keep) | Declared-purpose section; failure handling | 5, D2 | Sun 13 Dec (0.5–1 d) | Works on the demo site; hidden on failure |
| — | **Should items** | S3 → S5 → S2 → S6 → S4 (S1 is phase 8), only if all Must criteria are green | Musts | Mon 14 – Tue 15 Dec | Each item's own checks |
| 4b | **AI evaluation run** | Extended synthetic set (≥ 64 incl. injection); billable run **with explicit approval** (expected < $2) | 4 | Mon 14 Dec | Metrics recorded honestly |
| 11b | **Clean-site rehearsal #2** | Full judge path ([USER_JOURNEYS.md J9](USER_JOURNEYS.md)) on the clean site from the sharing link; timed; fix list | all Musts, frozen manifest | Tue 15 – Wed 16 Dec | ≤ 10 min Get started; every J9 step passes |
| — | **Code freeze** | — | — | **Thu 17 Dec EOD** | Tagged release; production deployed |
| 12 | **Demo & Devpost** | Demo world seeded; video script ([CODEGIEST_JUDGING_STRATEGY.md §4](CODEGIEST_JUDGING_STRATEGY.md)); record and edit (≤ 4:30); Devpost text; install instructions; privacy policy published (**user approval**); submit | 11b | Fri 18 – Mon 21 Dec | **Submitted Mon 21 Dec**; Tue 22 morning is buffer only |

## 3. Critical path
```
F0 → M1 foundation → core (policy, rules) → M2 screening → M6 gate → C1 rehearsal (user actions) → D2 → SCOPE FREEZE (4 Dec)
   → M5 review + decisions → M7 ledger/register → M8 onboarding/samples → rehearsal #2 → code freeze (17 Dec) → video → submit (21 Dec)
```
**Float:**
- **0 days** on the critical path between 30 Nov and 4 Dec (C1 depends on user actions);
- ~1 day in week 3 (Should items absorb or release it);
- 1 day before the deadline.

**Biggest schedule risks:**
1. **C1 user actions are late.** Mitigation: request the clean site, sharing approval and policy URL decision now (see §5).
2. **Review workspace complexity (EvidenceDocument).** Mitigation: build the evidence marks first, with fixtures, during phase 2.
3. **Custom UI performance or compatibility (F0 fails).** Mitigation: UI Kit panel fallback; desk stays Custom UI with tokens + primitives only.

## 4. Milestones and pull requests
| Milestone | Date | PR (draft into `stage3-mvp`, then into `main` at release) |
|---|---|---|
| MS1 Foundation + core + screening + panel | Fri 27 Nov | "Foundation, screening pipeline and privacy panel" |
| MS2 Gate live + C1 rehearsal report | Tue 1 Dec | "Workflow gate and clean-site install rehearsal" |
| MS3 Review loop complete (inbox → decision → ledger → register) | Wed 9 Dec | "Review desk, decisions and decision register" |
| MS4 Operable product (onboarding, settings, recovery, security) | Sun 13 Dec | "Onboarding, administration, recovery and security hardening" |
| MS5 Release candidate | Thu 17 Dec | "Release candidate 1.0" → merge `stage3-mvp` into `main` with the user's approval |

## 5. Actions required from the user (with dates)
| Action | Needed by | Why |
|---|---|---|
| ✅ **Done 22 Nov:** approve the Forge `llm` module (dev major version) and a capped AI validation spend (cap $2, **spent $0.40**) | **Tue 24 Nov** | M2 evidence: the deterministic floor alone has held-out escalation recall 0.00 (`product/M2_DETECT_RESULTS.md` §9–§10). M2 cannot complete without live AI validation. |
| Create a second, clean Atlassian Cloud site (Jira + Confluence) | **Sat 28 Nov** | C1 rehearsal |
| Approve the production deploy of the new `article25` app (skeleton) and **Distribution → Sharing** | Mon 30 Nov | C1 needs a production deployment and a sharing link **[DOCS]** |
| Decide the privacy-policy host and provide a private contact email | Mon 30 Nov | Sharing requires a privacy policy URL |
| Approve a billable LLM evaluation run (~$1–2) | Mon 14 Dec | Honest quality metrics |
| Approve publishing the privacy policy and the final production deploy | Thu 17 Dec | Submission |
| Approve merging `stage3-mvp` into `main` | Thu 17 Dec | Stable release branch |
| Record or approve the demo video, and submit on Devpost (your account) | Mon 21 Dec | Submission |

## 6. Weekly checks (every Monday until 3 Feb 2027)
- Forge changelog: validator, multi-app, TWG, Forge LLM model retirements.
- Codegeist field re-scan for privacy entrants (C5).
- Demo site and clean site expiry dates.
