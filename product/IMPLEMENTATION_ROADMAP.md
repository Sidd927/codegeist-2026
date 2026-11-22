# Article25 — Implementation Roadmap

**Stage 2** · 2026-11-22 · Scope: [MVP_SCOPE.md](MVP_SCOPE.md) · Deadline: **Tue 22 Dec 2026, 12:00 PT** (submission). The app must keep working through judging, until **3 Feb 2027**.

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
