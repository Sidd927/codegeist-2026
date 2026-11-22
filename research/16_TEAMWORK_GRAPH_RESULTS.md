# 16 — Spike E: Teamwork Graph Results

**Date:** 2026-11-22 · **Site:** one-atlas-psvy.atlassian.net · **Status of TWG API:** Preview
**App:** `article25-twg-spike` (`c19fa884-2c79-47af-9a7c-bb6aea4f1b01`), isolated from the core spike so its org-level scopes don't affect other tests. Code in `spikes/article25-twg-spike/`.
**Data:** queries ran as the signed-in user over seeded demo-site data and our synthetic issues.

## Verdict
**VERIFIED WITH LIMITATIONS.** Connectivity, the echo query, a curated user→work-item query, and work-item→goal traversal all returned real objects from both the frontend bridge and the backend. **Team hydration FAILED** (underlying `teamsV2` service 403). Confluence-object queries were **not tested** (the CLI says the app must also be installed in Confluence for `read:graph:page:confluence`). TWG stays **optional**: useful for goal context, not essential to the core product.

## 1. Setup
| Step | Command / action | Result |
|---|---|---|
| Register | `forge register -s <developer space> -y article25-twg-spike` | registered |
| Scopes | `read:graph:user:atlassian`, `read:graph:team:atlassian`, `read:graph:issue:jira`, `read:graph:goal:atlassian`, `read:graph:page:confluence` (+ later `read:graph:team-type:atlassian`) | `forge lint`: no issues |
| Deploy | `forge deploy -e development` | ✔ Deployed (v2.0.0, "eligible for Runs on Atlassian") |
| Install | `forge install --demo-site --product jira --confirm-scopes` | ✔ installed. CLI: **"We detected your app requires scopes across multiple Atlassian apps. Run forge install … -p Confluence"** (because of the Confluence graph scope) |
| Admin consent | Installed by the site's org admin (the developer account) via CLI with `--confirm-scopes`. No separate consent screen was shown. | Grant worked for this account. **Judges installing via a Sharing link must be org admins** (docs), so this needs verifying in Stage 8. |

## 2. Queries and actual results
All queries used documented curated fields with named operations (`article25_<op>`). No raw Cypher was used.

| # | Query | Path | Result | Latency |
|---|---|---|---|---|
| E1 | `echo(myString:"Hello World!")` | frontend `requestTeamworkGraph` (bridge) | `{"data":{"echo":"Hello World!"}}`. The bridge result is wrapped in `data`; the docs comment shows `{echo:…}`. | 1,140 ms |
| E2 | same | backend `api.asUser().requestTeamworkGraph` | HTTP 200, `data.echo:"Hello World!"`, plus `extensions.request_id` | 303 ms (TWG call), 3.3 s round trip incl. cold start |
| E3 | `atlassianUserAssignedJiraWorkItems(userId:<user ARI>, first:5)` → `JiraWorkItem {key summary webUrl}` | frontend | **1 real object:** `A25C-1` "Track courier GPS location during deliveries (SYNTHETIC)", webUrl, `pageInfo {hasNextPage:false}`. Correct: AS issues are unassigned; A25C-1 was auto-assigned. | 1,009 ms |
| E4 | same | backend asUser | identical object | 857 ms (TWG call) |
| E5 | `atlassianUserInTeams(userId, first:5)` → `AtlassianTeam {id displayName}` | frontend | **FAILED (partial):** 5 edges with `hasNextPage:true` (membership resolves), but **every node null** with error `"The underlying service call failed. The underlying service teamsV2 status code is: 403"` (+ `NullValueInNonNullableField`) | 699 ms |
| E5b | E5 after adding `read:graph:team-type:atlassian` (major version upgrade, reinstall/upgrade) | frontend | **Same 403.** Hypothesis rejected. Root cause unknown (possibly a Preview limitation for app tokens, or the Teams service on the demo site). | 1,650 ms |
| E6 | `jiraWorkItemGoals(id:<issue ARI>)` for AS-2 | frontend | `edges: []`: **ambiguous** (no goal linked vs. missing scope) | 1,445 ms |
| E7 | same for seeded **MC-10** (Goals field = `ari:cloud:townsquare:…:goal/1432b32d…`) | frontend | **1 real goal:** "Launch two new products tailored to international markets by Q4." with its Atlassian Home URL. Proves traversal work item → goal, and that E6 was genuinely "no goal". | 888 ms |
| E8 | Confluence page contributors / page objects | — | **NOT TESTED** (requires the Confluence installation the CLI requested; deferred) | — |

ARI formats that worked: user `ari:cloud:identity::user/<accountId>`; issue `ari:cloud:jira:<cloudId>:issue/<numericIssueId>` (numeric id, not key).

## 3. Characteristics observed
| Topic | Finding |
|---|---|
| User context | Both paths run as the user. Results are limited to what the user can see (docs). No app-context access, so TWG **cannot be used from triggers or validators**. |
| Pagination | Relay `edges/node/pageInfo`. `first` ≤ 25 (docs). |
| Empty vs. missing scope | Indistinguishable in the response (E6 vs E7). The product must never treat "empty" as "none exist". Show "no linked goals found" rather than "this work supports no goal". |
| Error shape | GraphQL `errors[]` alongside `data`, with HTTP 200. Always check `errors`. |
| Scope changes | Adding a scope triggered a **major version upgrade**: `forge deploy` failed with `MAJOR_VERSION_RULE` until `--approve` was given, and installations must be upgraded and re-consented. Avoid scope changes after the submission is shared with judges. |
| Multi-product | A Confluence graph scope makes the CLI ask for a Confluence installation (ties into doc 13 F-B2/F-B3; with multiple-app compatibility this becomes one installation) |
| Latency | 0.3–0.9 s per TWG call (backend), ~0.7–1.7 s via the bridge |

## 4. Usefulness for Article25
| Possible use | Feasible now? | Value |
|---|---|---|
| Show the business goal a work item contributes to in the DPO review ("why does this feature exist?") | **Yes** (E7) | Medium: context for proportionality decisions |
| Suggest reviewers / owning team via team membership | **No** (E5 403) | Use Jira-native fallbacks: project roles, components, `article25-reviewers` group |
| Find prior DPIA page contributors | Untested (E8) | Medium |
| Use in background screening or the gate | **No** (asUser only) | — |

## 5. Bonus-prize implication
"Best apps with Teamwork Graph integration" requires consuming TWG data. E3/E7 already satisfy "consumes data from the TWG API". A **goal-context panel** in the review workspace is a small, honest integration. Don't build team-based features until E5 is resolved.

## 6. Classification
| Capability | Status |
|---|---|
| Authentication / scope grant | VERIFIED (dev site; org-admin developer) · REQUIRES ADMIN ACTION for other sites |
| Echo query | VERIFIED |
| Relevant object query | VERIFIED (work items, goals) |
| Relationship traversal | VERIFIED (user→work item, work item→goal) |
| Team objects | FAILED (teamsV2 403) |
| Confluence objects | UNVERIFIED |
| Make TWG mandatory? | **No.** Keep it optional, with graceful degradation. |
