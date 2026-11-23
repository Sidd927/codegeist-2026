# 12 — Spike A: Forge Foundation Results

**Date:** 2026-11-22 · **Verdict:** **VERIFIED** (create → deploy → install → render → resolver round trip), with the limitations listed in §6.
**Code:** `spikes/article25-forge-foundation/` (official `jira-issue-panel-ui-kit` template, resolver and frontend modified to return verifiable data)

---

## 1. Environment (actual values)

| Item | Value |
|---|---|
| OS | macOS (Darwin 27.0.0), arm64 |
| System Node | v26.4.0. **Not supported** by Forge CLI 15.1.0 (`engines: ^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`) |
| Node used for Forge | **v24.22.3** (Homebrew `node@24`, keg-only; invoked via `PATH=/opt/homebrew/opt/node@24/bin:$PATH`) |
| npm | 11.x (bundled with node@24) |
| Git | 2.54.0 |
| Forge CLI | **15.1.0** (`npm install -g @forge/cli`). npm blocked install scripts by default. Inspected: `keytar` ships a prebuilt binary that loads (keychain works); the `@forge/cli` postinstall is analytics-only (skipped); `cloudflared` is only for `forge tunnel` (skipped). |
| Usage analytics | Disabled (`forge settings set usage-analytics false`) |

## 2. Authentication
- `forge login` was run **by the user** in a terminal tab with a scoped API token (app = Forge). The token was never shown to or handled by the assistant.
- `forge whoami` → `Logged in as Siddhant Patil (siddhantpatil.hak@gmail.com)`, account `712020:406009af-…`.

## 3. Development site
| Item | Value |
|---|---|
| Command | `forge site provision` (first call timed out its watch window: "continuing in the background"; second call returned the site) |
| Site | **https://one-atlas-psvy.atlassian.net** (`one-atlas-psvy`) |
| Status / expiry | active / **2027-02-20** (after judging ends on 2027-02-03) |
| Products observed | Jira (spaces list incl. seeded service projects such as Engineering Support, Facilities, HR); Confluence and Rovo to be confirmed in Spike B |
| User permissions on test project | `ADMINISTER_PROJECTS`, `CREATE_ISSUES`, `EDIT_ISSUES`, `MODIFY_REPORTER`, `BROWSE_PROJECTS` = true (`/rest/api/3/mypermissions`) |
| Org admin | Not yet verified (needed for TWG scopes in Spike E) |

## 4. Application creation, deployment, installation

| Step | Command | Actual result |
|---|---|---|
| Create (1st try, non-TTY) | `forge create -t jira-issue-panel-ui-kit -d article25-forge-foundation -y article25-forge-foundation` | **Failed:** "You are not currently a member of a Developer Space… Prompts can not be meaningfully rendered in non-TTY environments" |
| Create (user terminal) | same command in an interactive terminal | User created Developer Space **`codegeist-2026`** and accepted the Developer Terms (incl. billing for usage above free allowances). App created and registered: `ari:cloud:ecosystem::app/360eedae-4eba-4f4a-aae1-3dd8f8eb0a17`. Environments: production, staging, development. |
| Lint | `forge lint` | `No issues found.` |
| Deploy | `forge deploy -e development --non-interactive` | `✔ Deployed` (version 2.0.0). CLI: "eligible for the Runs on Atlassian program" |
| Install (1st) | `forge install --site one-atlas-psvy.atlassian.net --product jira -e development --non-interactive` | **Failed:** "An unexpected error occurred… request ID b998762a5d4b40868fa93489262f78d5". Also warned: "You are about to install a development app to a production site" (the demo site is treated as a production site). |
| Install (2nd) | `forge install --demo-site --product jira -e development --non-interactive --confirm-scopes --verbose` | `appInstallationTask state: COMPLETE` → `✔ Install in Jira complete!` |
| Verify | `forge install list` | Installation `e7b23f49-…`, development, one-atlas-psvy: Jira, version 2, **Up-to-date** |

Template defaults worth noting: `runtime: nodejs24.x`, `memoryMB: 256`, `architecture: arm64`; dependencies pinned to pre-release `@forge/bridge 7.3.0-next.12`, `@forge/react 12.5.0-next.2`. The product build should pin stable versions.

## 5. Panel rendering and frontend → backend test

**Test issue:** `AS-1` "Implement customer health profile feature" (id 66400), project **Article25 Sandbox (`AS`)**. Synthetic description only (explicitly marked SYNTHETIC; no real personal data).

**Procedure and observations:**
1. Opened AS-1 → issue quick-actions → **Apps** menu listed `article25-forge-foundation` → clicked it.
2. Panel rendered under "Linked work items" with title **article25-forge-foundation [DEV]** and the text "Article25 Spike A: frontend → resolver round trip", then "Calling resolver…".
3. Resolver response displayed (screenshot captured during the session):
```json
{
  "from": "article25-forge-foundation backend resolver",
  "serverTime": "2026-11-22T04:45:48.772Z",
  "node": "v24.22.3",
  "echoedPayload": { "example": "spike-A-payload" },
  "accountId": "712020:406009af-…(redacted)",
  "cloudId": "0ef78c36-…(redacted)",
  "moduleKey": "article25-forge-foundation-hello-world-issue-panel",
  "issueKey": "AS-1",
  "issueType": "Task",
  "projectKey": "AS"
}
```
4. Server-side log (`forge logs -e development --since 15m`):
   `INFO 2026-11-22T04:45:48.775Z 7c19bcf2-… {"spike":"A","issueKey":"AS-1","node":"v24.22.3"}`
   The log timestamp matches `serverTime`, which confirms the response came from the deployed function, not the frontend.
5. **Latency (frontend-measured, includes bridge + invocation):** first load **2,621 ms**, reload **1,994 ms**. After first being added, the panel persists on the issue across reloads.

**Acceptance criteria**
| Criterion | Result |
|---|---|
| Forge application created | ✅ |
| Deploys successfully | ✅ |
| Installation succeeds | ✅ (2nd attempt) |
| Jira module opens | ✅ |
| Frontend communicates with backend | ✅ |
| Backend returns a verified response | ✅ (payload echo + server-only values + matching server log) |
| No unresolved build errors | ✅ (`forge lint` clean) |

## 6. Problems found (actual, not speculative)

| # | Problem | Evidence | Impact | Handling |
|---|---|---|---|---|
| A1 | **Developer Space required** before `forge create`; creation is interactive only | CLI error in non-TTY | Setup step for any new contributor/CI | Done by user; document in onboarding |
| A2 | First `forge install` failed with an opaque server error | request ID `b998762a…` | Flaky install; judges may hit similar | Retry worked. Record request IDs; add "retry install" to judge instructions |
| A3 | **Jira's new Create dialog cannot create a Task in this team-managed project.** It shows "Reporter *" as required, but `reporter` is **not** in the create metadata for AS/Task (`hasReporterOnScreen: false`) → "Field 'reporter' cannot be set… Couldn't create the issue". User has `MODIFY_REPORTER`. | `createmeta` + `mypermissions` responses | Site/project config quirk unrelated to our app. Our sample-data seeder must **not** send `reporter`. Judges using the UI on similar projects may hit it. | Created AS-1 via REST `POST /rest/api/3/issue` as the signed-in user, without `reporter` → **201**. Project config left unchanged. |
| A4 | Project key **`AS` is a reserved JQL word** | `400: 'AS' is a reserved JQL word` | Any JQL built by the app must quote project keys | Always quote keys in JQL |
| A5 | Resolver latency ~2–2.6 s per panel load | Frontend timing | UX: the panel needs skeleton/loading states; batch resolver calls | Design note for MVP |
| A6 | Test project `AS` is **team-managed** (`style: next-gen`) | project API | The validator spike must also cover company-managed (needs a second project) | Create a company-managed project for Spike C |
| A7 | Demo site treated as "production site" by the CLI warning | install output | Cosmetic; development app installs work | None |

## 7. Artefacts
- Code: `spikes/article25-forge-foundation/` (template + modified `src/resolvers/index.js`, `src/frontend/index.jsx`)
- App ID: `360eedae-4eba-4f4a-aae1-3dd8f8eb0a17` · Installation: `e7b23f49-92c7-4140-81de-88097a282d75`
- Synthetic data created on the site: issue `AS-1`
