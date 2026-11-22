# 11 — Stage 1 Spike Plan: Article25

**Prepared:** 2026-11-22 · **Owner:** engineering · **Scope:** technical validation only (no product build)
All proof-of-concept code lives under `spikes/`. Synthetic data only. No billable LLM calls without explicit approval.

---

## 0. Repository audit summary (before any change)

| Item | Finding |
|---|---|
| Remote | `https://github.com/Sidd927/codegeist-2026` (branch `main`, one commit `f45568b Initial commit`) |
| Tracked files | `README.md` only |
| Uncommitted | `research/` (10 deliverables, untracked, **not committed**) |
| Code | None (no app, no `package.json`, no manifest) |
| Architecture diagrams | Mermaid diagram in `research/07_SYSTEM_ARCHITECTURE.md` §2 |

### Research claims re-verified against current official docs (2026-11-22)

| Claim in research | Re-verification | Status |
|---|---|---|
| `jira:workflowValidator` is Preview | [Module page](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/) still says Preview | ✅ Confirmed |
| Validator works **only** in company-managed projects (05 §0, 07, 08 W6) | **Incorrect.** The module now has a `projectTypes` property accepting `company-managed` and/or `team-managed` (default company-managed). | ❌ **Corrected:** team-managed is configurable (to be tested) |
| Gate via an **expression validator reading an issue entity property** is the preferred design (05, 07) | Jira expressions can read `issue.properties['key']` ([type reference](https://developer.atlassian.com/cloud/jira/platform/jira-expressions-type-reference/)). **But** issue entity properties are generally writable through the REST API by users who can edit the issue, so a property-only approval could be forged by any editor. | ⚠️ **Design risk:** must be tested (Spike C). The authoritative state probably has to live in app-only storage. |
| Expression validator fails closed if the app is uninstalled | Docs: an expression "evaluates to false if … the app is uninstalled". Lambda behaviour on unavailability **not documented**. | ✅ for expressions; lambda to test |
| Lambda validator payload contains `issue.key`, `configuration`, `transition` | Confirmed (docs). Whether the lambda can read Forge storage is **not documented**. | To test |
| TWG API: Preview, `asUser` only, per-object scopes, org-admin grant, raw Cypher unavailable to new apps | Confirmed ([call the API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/), [scopes](https://developer.atlassian.com/platform/teamwork-graph/scopes/)). Backend method is `api.asUser().requestTeamworkGraph(...)`; frontend is `requestTeamworkGraph` from `@forge/bridge`. Echo query documented. | ✅ Confirmed |
| TWG scope names (07 §4.2 marked "Unverified") | Verified: `read:graph:issue:jira`, `read:graph:page:confluence`, `read:graph:user:atlassian`, `read:graph:team:atlassian`, `read:graph:goal:atlassian` all exist. Missing scopes **fail silently** (empty rows). | ✅ Confirmed |
| `forge site provision` creates the dev site (01 §8) | The Devpost resources page says so. The current getting-started page uses `forge install --demo-site`, and the CLI has a `forge site` command group ("manage demo sites"). | ✅ Both paths exist; verify at run time |
| Forge LLM: no free allowance | [Pricing page](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/) (verified in research) | ✅ (re-check in Spike D) |
| Node version (not stated in research) | Forge CLI 15.1.0 requires Node `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` (npm `engines`); docs say LTS 22/24 | ➕ New fact |

---

## 1. Objectives (what each spike must decide)

| Spike | Decision it informs | Exit evidence |
|---|---|---|
| **A** Foundation | Can we create, deploy and install a Forge app with a working frontend→resolver round trip? | Installed module renders; resolver response shown |
| **B** Jira + Confluence | Can the app read and write the work and documents Article25 needs, with minimal scopes? | Real API responses for a synthetic issue and policy page; property, comment, task created |
| **C** Workflow validator | **Can we actually gate a transition on an authorised, tamper-resistant review state?** (most critical) | Transition blocked when unreviewed, allowed after approval; storage approaches compared; failure modes observed |
| **D** AI | Is Forge LLM available, at what cost, and is AI extraction worth including versus a deterministic baseline? | Availability + cost estimate; deterministic baseline built and evaluated on synthetic set; LLM evaluation run **only after approval** |
| **E** Teamwork Graph | Does TWG work for us at all, and does it add real context? | Echo query response; one curated query with real objects; or formal deferral with reasons |
| **F** Privacy register | Can we create/update a Confluence register idempotently with traceability? | One full create→update cycle; retry produces no duplicates |

## 2. Prerequisites

| Prerequisite | Status at start | Action |
|---|---|---|
| Node 22.23.4+ / 24.22.1+ | System Node 26.4.0 (**unsupported**) | Installed keg-only Homebrew `node@24` 24.22.3. Default node untouched. Commands run with `PATH=/opt/homebrew/opt/node@24/bin:$PATH`. |
| Forge CLI | Not installed | Installed `@forge/cli@15.1.0` (install scripts inspected; `keytar` prebuilt loads; analytics postinstall and `cloudflared` download skipped) |
| Forge auth | Not logged in | **User action:** `forge login` with a scoped API token (Forge). Token never handled by the assistant. |
| Dev site with Jira + Confluence + JSM + Rovo | Unknown | `forge site` / `forge install --demo-site` after login |
| Org-admin rights on dev site | Unknown | Expected for the developer-provisioned site; verify in admin.atlassian.com |
| Company-managed + team-managed Jira projects | To create | Create `A25C` (company-managed) and `A25T` (team-managed) projects |
| Second clean site (install test) | Not needed in Stage 1 | Deferred to Stage 8 |

## 3. Technical assumptions under test

1. A Forge resolver can call Jira REST (`asApp`, `asUser`) and Confluence REST v2 with documented scopes.
2. A Forge app can write an issue entity property and Jira expressions can read it.
3. A regular Jira user with "Edit issues" can **also** overwrite that property via REST (the tampering hypothesis).
4. A lambda (`function`) workflow validator can read Forge KVS within its execution budget.
5. A lambda validator blocks the transition when it returns `{result:false}` and shows `errorMessage`.
6. The validator can be configured on a team-managed workflow when `projectTypes` includes `team-managed`.
7. When the app is uninstalled or the lambda errors, the transition fails closed (not documented for lambda).
8. Forge LLM can be enabled on our account; models listed in docs are callable; tool calling returns structured JSON.
9. TWG echo works after org-admin scope grant; a curated query returns objects for the current user.
10. Confluence page create/update via REST v2 increments versions and can be made idempotent using an app-stored mapping plus version checks.

## 4. Test procedures (summary; details in result docs 12–17)

### A — Foundation
`forge create` (UI Kit Jira template) → `forge deploy` (development) → `forge install` (Jira) → open issue → panel shows value returned by resolver (timestamp + app context).

### B — Integration
Create synthetic issue ("Implement a customer analytics dashboard that collects customer location, purchase history and behavioural information.") and synthetic Confluence privacy policy page (approved vs. prohibited uses). Resolvers: get issue (fields, labels, type, status, comments, project), set property `article25.review`, add comment, create linked review task; Confluence CQL search, get page body (ADF/storage), extract text, create page, update page.

### C — Validator (most critical)
Two validators in one app, same states (`NOT_REVIEWED`, `REVIEW_REQUIRED`, `APPROVED`, `APPROVED_WITH_CONDITIONS`, `REJECTED`):
- **C1 expression validator** reading issue property `article25-review`.
- **C2 lambda validator** reading app-only **Forge KVS** key `review:<issueKey>` (and logging latency).
Test matrix per validator: missing state, each of the 5 states, tampering attempt (user edits property via REST), app uninstalled (if safe to do at the end), lambda throws, KVS unreachable (simulated), company-managed vs. team-managed. Enforcement point: transition `Ready for Development → In Progress` (custom status `Ready for Dev` added to test workflow).

### D — AI
1. Read the official LLM API reference and pricing; inspect account/enablement **without** making billable calls. 2. Build 10+ synthetic tickets covering the 10 categories requested, with a hand-labelled gold standard. 3. Build the deterministic baseline (lexicon, vendor dictionary, rules) and evaluate it locally (no egress, zero cost). 4. Prepare the LLM evaluation harness and a cost estimate. **Run it only after explicit approval.**

### E — Teamwork Graph
Separate spike app (to keep TWG scopes away from the other spikes). Scopes: `read:graph:user:atlassian`, `read:graph:team:atlassian`, `read:graph:issue:jira`, `read:graph:goal:atlassian`, `read:graph:page:confluence`. Echo query from frontend and backend, then one curated query (e.g. teams of current user, or goals of a work item).

### F — Register
Approve a synthetic screening with conditions → create register page (first run) → update (second decision) → re-deliver the same event (retry) → assert no duplicate rows and version history increments exactly once per real change.

## 5. Acceptance criteria
As defined in the brief §13 and repeated per spike in docs 12–17. A spike is only marked **VERIFIED** with captured command output or API responses.

## 6. Cost considerations

| Item | Cost |
|---|---|
| Forge functions, KVS, SQL, UI modules | Within free allowances for spike volumes ([Forge pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/)) |
| Demo/dev site | Free (90 days) |
| **Forge LLM** | **Billable from the first token, no free tier.** Estimate in doc 15. **Blocked pending approval.** |
| Rovo | Included on Codegeist dev site (Rovo Enterprise); not used in Stage 1 |

## 7. Dependencies and order
`login → A → B → C (+F share the same app) → E (separate app) → D (offline baseline anytime; LLM call after approval)`.
C depends on B (issue property write, KVS write path). F depends on B (Confluence write). E is independent but needs org-admin consent.

## 8. Spike app layout

| Directory | Purpose |
|---|---|
| `spikes/article25-forge-foundation/` | Spike A (minimal panel + resolver) |
| `spikes/article25-core-spike/` | Spikes B, C, F (integration, validators, register), separated by module and resolver namespaces |
| `spikes/article25-twg-spike/` | Spike E (TWG scopes isolated) |
| `spikes/article25-ai-spike/` | Spike D (synthetic dataset, deterministic baseline, LLM harness not executed without approval) |
