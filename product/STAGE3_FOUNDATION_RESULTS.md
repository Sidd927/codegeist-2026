# Stage 3 — Product Foundation Results

**Date:** 2026-11-22 · **Branch:** `stage3-product-foundation` (from `stage2-product-blueprint`) · **App:** `article25` (new Forge app, `ari:cloud:ecosystem::app/a2030a0d-5fd0-4ace-8ff5-7cdbfdba0cd1`) · **Environment:** development only · **Site:** the existing demo site (new, separate installation; spike installations untouched) · **Data:** synthetic only

## 1. Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| New Forge app deploys | ✅ | `forge deploy -e development` succeeded (v2.0.0 → v2.2.0), "eligible for Runs on Atlassian" each time; `forge lint`: no issues |
| Issue panel renders on a real issue | ✅ | Rendered on AS-1 (light and dark); shows the backend state "Not checked yet" for the context issue |
| Custom UI ↔ backend communication | ✅ | All 6 resolvers called live; server logs `resolver.ok` with durations (§6) |
| Backend identifies the current issue | ✅ | `getPanelState` takes the issue **only from the Forge context** (`context.extension.issue.id`) and verifies browse access with an as-user Jira read |
| Navigation works | ✅ | Overview → Inbox → Review (via key) → Settings; routes appear in the Jira URL (`…/inbox`, `…/review/AS-2`); deep links load directly; the panel's "Open in review desk" navigated the host to `…/review/AS-1` |
| Design system and theme support | ✅ | ADS tokens + 4 `@atlaskit` components; **light and dark verified live** (Jira Theme switched to Dark with your permission and restored to Light; the iframe followed reactively) |
| Follows the Stage 2 UX spec | ✅ (foundation scope) | Margin layout (Document · Margin · Decision) at ≥ 1024 px and tabs below; state vocabulary from IA §6; copy rules; see §4 for deviations |
| No secrets or personal identifiers exposed | ✅ | Resolver responses carry no account IDs, emails or display names (unit-tested); logs contain only allow-listed fields (verified on 82 live log lines: `code, env, evt, level, metric, ms, resolver, status, surface, value`) |
| Lint and tests pass | ✅ | ESLint (incl. jsx-a11y strict) clean; copy lint clean; backend 15/15; frontend 17/17 including axe-core checks |
| Bundle and performance documented | ✅ | §6, §7 (measured, not estimated) |
| Dev isolated from production and spikes | ✅ | New app ID; only development deployments (`forge deploy list`); one development installation `0bd9266b…`; no production deploy, variables or sharing; spike apps unchanged |

## 2. Implemented architecture
```
Jira issue view ──► jira:issuePanel "Privacy" (Custom UI iframe: panel bundle)
Jira Apps menu ──► jira:globalPage "Article25" (Custom UI iframe: desk bundle, routes via view.createHistory)
                         │  @forge/bridge invoke (one resolver function)
                         ▼
               src/index.js  ── define(key, fn): context → services → { ok, data } | { ok:false, error:{code,message,retryable} }
                         │        content-free structured log per call (resolver, ms, env, code)
                         ▼
               services/desk.js  (pure orchestration; FEATURES flags; NOT_SCREENED is the only review state)
                         ▼
               adapters/jira.js  (api.asUser().requestJira, per-environment timeout, status → AppError)
```
- **Security-critical logic is server-side.** The issue identity comes from the Forge context, and admin status comes from a server-side `mypermissions` check (it fails closed). The frontend only renders and hides links.
- **No privacy decision can be made or simulated.** `FEATURES` are all `false`, `review.state` is always `NOT_SCREENED`, the decision controls are disabled with a stated reason, and **no resolver exists that writes anything**.
- **Environment-aware config** (`lib/config.js`): driven by `context.environmentType` (never client input). It sets the upstream timeout and the environment label shown in the desk header ("Development environment"). Production shows no badge.

## 3. Application structure
```
app/
  manifest.yml                 # 2 UI modules, 1 function, 1 scope (§5)
  package.json / eslint.config.mjs / .gitignore
  scripts/copy-lint.mjs        # bans "compliant", "legal advice", "guarantee", "approved by AI"
  scripts/bundle-report.mjs    # initial vs lazy bundle sizes (gzip)
  src/index.js                 # resolver entry (6 resolvers)
  src/core/text.js             # ADF → blocks (ported from spike text.js)
  src/backend/lib/{logger,errors,config,validate}.js
  src/backend/adapters/jira.js
  src/backend/services/desk.js
  test/backend.test.mjs        # 15 tests
  frontend/
    vite.config.js             # one build per Forge resource (A25_ENTRY=panel|desk), base './'
    panel/index.html, desk/index.html, */public/icon.svg
    src/shared/{api,platform,states,useResource,margin}.js
    src/shared/components/{Margin,States}.jsx
    src/shared/styles/{tokens,base,components}.css
    src/shared/copy/en.js      # copy deck
    src/panel/{main,PanelApp}.jsx, panel.css
    src/desk/{main,DeskApp,router}.jsx, desk.css, routes/{Home,Inbox,Review,Settings,NotFound}.jsx
    src/foundation.test.jsx    # 17 tests (+ axe)
```
**Reused from spikes:** `adfToText` logic (extended to block structure). Nothing else; every spike-only control and the evidence logging were left behind.

## 4. Screens implemented
| Surface | Route / module | What it does now | States |
|---|---|---|---|
| **Privacy panel** | `jira:issuePanel` | Status lozenge + explanation for the context issue; honest "checks are not switched on" note; **Open in review desk** | loading skeleton (announced), error + retry, permission denied, NOT_SCREENED |
| **Desk header** | all routes | Product identity, environment badge (non-production), nav with `aria-current`; Settings link only for Jira admins | — |
| **Overview** (entry point) | `/` | Loop explanation (Detect → Record); *your access*; *setup on this site* (true statuses: checks off, no reviewer group, no gate, no register); **Margin example**, labelled "Example only: a fictional work item, not a real review", with no decision controls | loading |
| **Inbox** | `/inbox` | Views (Pending, Changed since approval, Needs information, All open); honest empty state while checks are off; **Open a work item** by key (validated client- and server-side) | loading, error, empty (checks off / no items) |
| **Review workspace (Margin)** | `/review/:key` | Real current text of the work item (as the reviewer) in the Document zone; Margin zone "Not checked yet"; Decision zone with 4 options **disabled** and a visible reason; Open in Jira | loading (3-zone skeleton), not found (invalid / missing / no permission), error + retry; 3 zones ≥ 1024 px, Text/Findings tabs below |
| **Settings** | `/settings` | Six sections with real status (not configured / off / not connected / not added), environment, version | loading, **denied for non-admins (server-side)**, error |
| **Not found** | any other route | Message + back to overview | — |

**Margin components** (`EvidenceDocument`, `MarginNotes`) are complete and tested:
- quote location is case-insensitive, with overlap handling;
- `<mark>` elements carry `aria-describedby` linking to their note, plus a hidden "evidence n of m" label;
- notes are buttons that highlight and scroll to their mark;
- tone underlines distinguish sensitive, vendor and default findings.

They show real findings once the screening milestone supplies them.

## 5. Forge configuration and permissions
| Item | Value |
|---|---|
| Modules | `jira:issuePanel` `privacy-panel` (title "Privacy", bundled icon) · `jira:globalPage` `desk` (title "Article25") · `function` `resolver` |
| Resources | `frontend/dist/panel`, `frontend/dist/desk` (built, git-ignored) |
| Runtime | `nodejs24.x` |
| CSP additions | **None.** Forge's default CSP has no `'unsafe-inline'` for styles; ADS styles are extracted to static CSS by the build, so no exception was needed (verified: the served CSP header + correct rendering) |
| Egress | None |
| Environments | development only; production and staging untouched |

**Scopes: exactly one.**
| Scope | Used by | Why it's needed |
|---|---|---|
| `read:jira-work` | `GET /rest/api/3/issue/{id}?fields=project,issuetype` (panel: confirm the user can browse the context issue) · `GET /rest/api/3/issue/{key}?fields=summary,description,status,project,issuetype` (review workspace text) · `GET /rest/api/3/mypermissions?permissions=ADMINISTER` (server-side Settings access) | All reads, all **as the user**. **Verified live:** the admin check works under this scope alone (Stage 2 open question Q4 resolved). |

**Deliberately not requested yet** (each arrives with the milestone that uses it, before the 4 Dec scope freeze):
- `write:jira-work` (receipts, sample items);
- `read:jira-user` (group checks);
- `storage:app` and the `sql` module (persistence);
- Confluence scopes;
- Teamwork Graph scopes;
- the `llm` module;
- `app.compatibility` (multi-app).

## 6. Performance (measured live; development environment, demo site, 22 Nov 2026)
Measured by the app itself:
- `firstContentMs` = time from iframe navigation start to the first non-loading render;
- `invokeMs` = the browser-side round trip of the first resolver call.

Both are reported through a content-free metrics resolver and read from `forge logs`. Server time is the resolver duration.

| Metric | Cold first load | Warm loads (n) | p50 | Range | Stage 2 budget | Verdict |
|---|---|---|---|---|---|---|
| Panel first content | 4,881 ms | 6 | **1,451 ms** | 1,168–1,908 | ≤ 1,500 ms p50 | ✅ **met, with a 49 ms margin** (p50 incl. the cold load, n=7: 1,563 ms) |
| Panel invoke round trip | 1,510 ms | 6 | 1,428 ms | 1,144–1,884 | — | — |
| Panel DOMContentLoaded | 3,334 ms | 6 | 24 ms | 16–111 | — | — |
| Desk first content | 7,099 ms | 7 | **1,392 ms** | 1,079–2,261 | (inbox ≤ 2 s) | ✅ |
| Desk invoke round trip | 3,578 ms | 7 | 1,281 ms | 945–2,172 | — | — |
| Server: `getPanelState` | — | 7 | 297 ms | 242–438 | — | — |
| Server: `getAppContext` (incl. admin check) | — | 8 | 261 ms | 205–461 | — | — |
| Server: `getWorkspace` | — | 3 | 263 ms | 257–326 | — | — |

**Analysis:**
- **The budget is met, but only just:** a 49 ms margin over six warm samples is not robust.
- **Our bundle is not the bottleneck:** DOMContentLoaded takes about 20 ms once cached, and the panel invoke is about 1.4 s.
- **The Forge invoke round trip is the bottleneck:** about 1.1 s of platform overhead on top of about 0.3 s of server work.
- **UI Kit would not change this:** it makes the same resolver invoke.
- **Cold starts** (first load after deploy or idle) take 4.9–7.1 s.

Mitigations, for the next milestones:
1. Keep exactly one resolver call per surface (already true).
2. Fire the panel's invoke before React mounts (saves a few ms only).
3. Consider showing a cached, last-known state while revalidating, once state exists in storage. That only works after persistence lands.
4. Re-measure in production, where function warm-up behaviour may differ **[UNVERIFIED]**.

## 7. Bundle size (Vite 8 build, `scripts/bundle-report.mjs`)
| Surface | Initial (entry JS + runtime + CSS) | gzip | Budget (gzip) | Lazy chunks |
|---|---|---|---|---|
| Panel | 666.6 KB | **182.7 KB** | ≤ 200 KB ✅ | 26 theme chunks loaded on demand by the theme API (one light or dark set per session) |
| Desk | 692.5 KB | **188.6 KB** | ≤ 400 KB ✅ | same |

## 8. Tests and quality gates
| Gate | Result |
|---|---|
| Backend unit tests (`node --test`) | **15/15**: logger drops non-allow-listed fields (summary, accountId, email, quotes) and unsafe strings; error envelope hides internals; issue-key validation rejects injection; metrics validation; env fallback to production; ADF blocks; panel/workspace/inbox/settings services incl. denied and fail-closed admin check; no identifiers in app context; all features off |
| Frontend tests (Vitest + RTL + axe-core) | **17/17**: Margin helpers; mark ↔ note linkage; state vocabulary fallback; panel loading/NOT_SCREENED/denied/error; workspace disabled decisions + reason, not-found; routes; admin-only nav; server denial in Settings; overview example labelled fictional with no decision controls; inbox empty state and key validation; **0 axe violations** in every rendered state checked |
| ESLint | clean (incl. `jsx-a11y` strict, hooks, and `no-console` everywhere except the logger) |
| Copy lint | clean (20 files) |
| `forge lint` | no issues |
| Live validation | §1 table: 9/9 platform checks |

## 9. Known limitations
1. **The panel meets its 1.5 s p50 budget by only 49 ms** (warm p50 1,451 ms, n=6), because of platform invoke latency (§6). Cold starts are 5–7 s. Treat this as at risk and re-measure in each milestone.
2. **"Open in Jira"** from the workspace uses `router.open` and was **not exercised live** and has no unit test; check it manually in the next milestone.
3. **Contrast** is not testable in jsdom. Dark and light were checked visually live; a formal contrast audit of the custom aliases (evidence marks, chips) is still due (NFR-7).
4. **Navigation uses buttons with `aria-current`**, not anchors: middle-click and open-in-new-tab are unavailable inside the iframe.
5. **Keyboard shortcuts** (`[`/`]`, A/C/R) from the UX spec are not implemented; they depend on real findings and decisions.
6. **Multi-app (Confluence optional) is not declared yet.** Stage 2 Q1 (does connecting Confluence need a Confluence module?) is still open, and so is the assumption that adding optional Confluence later doesn't change the required app.
7. `iframe-resizer`'s postinstall script (a transitive dependency of `@forge/bridge`) is blocked by npm's install-script policy. That is harmless: Forge injects its own resizer.
8. The demo issue AS-1 shows "Unsaved changes" on its description. That predates this stage (a Jira draft) and was not touched.

## 10. Changes from the Stage 2 blueprint (with evidence)
| Blueprint | Implemented | Why |
|---|---|---|
| SQL migrations in the foundation milestone (M1) | **Deferred to M2** | Nothing to persist yet. Adding the `sql` module and its scope now would be speculative (your rule: no speculative permissions). |
| TanStack Query | Minimal `useResource` hook (25 lines) | One call per view and no shared cache needed yet. Saves bundle size; revisit when polling and caching arrive (M2). |
| react-router with custom history | 60-line router over `view.createHistory()` | No dependency; verified live (URL sync, deep links) |
| `@atlaskit` radio/textfield/select/tabs | Native inputs styled with ADS tokens; ADS button, lozenge, heading, section-message | Keeps the panel within its budget; native controls are fully accessible |
| `/` redirects to inbox/get-started/about | `/` is an **Overview** entry point | Your Stage 3 brief asked for a dashboard entry point. It explains the loop and shows true setup status, with **no KPI cards or charts**. |
| `jira:adminPage` (Should) | Not added | Out of milestone scope |
| CSP may need `unsafe-inline` styles | **Not needed** | The build extracts ADS CSS (verified against the served CSP) |

No Stage 2 architecture decision failed in practice. Custom UI + ADS tokens works, including dark mode and routing, and both bundle and panel-latency budgets are met (the latter narrowly, because of platform latency rather than the rendering choice).

## 11. Recommended next milestone: M2 "Detect"
**Goal:** the first real privacy check, end to end on the demo site.
1. **Persistence:** add the `sql` module (and `storage:app` if Forge SQL requires it; verify), with migrations from install/upgrade triggers only, and the `work_items` + `screenings` + `usage` + `settings` tables (DATA_AND_SECURITY_MODEL §1).
2. **Core:** port rules v1 with rule IDs, the doc 15 fixes, `policy` (state machine with exhaustive tests) and materiality. `chain-core` comes in M3.
3. **Pipeline:**
   - created/updated/deleted triggers (`ignoreSelf`);
   - queue consumer;
   - Forge LLM adapter: `claude-haiku-5-5`, `tool_choice: auto`, timeout and one retry;
   - quote verification and redaction;
   - rule-based fallback, fingerprint cache, atomic budget.

   The `llm` module is a major version change, so it needs approval before billable calls. Development testing stays within a capped budget that you approve.
4. **UI:** panel states for Checking / Clear / Needs info / Review required / DPIA likely / Check failed; workspace Margin with real marks; inbox rows. Flip `FEATURES.screening`.
5. **Measure:** screening latency p90 ≤ 30 s, panel re-render after screening, and logs still content-free.

This keeps the C1 clean-site rehearsal on the roadmap date (30 Nov – 1 Dec). It still needs your clean site, the sharing approval and the privacy-policy decision.
