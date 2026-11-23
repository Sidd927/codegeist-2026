# Article25: P1 Experience, Onboarding and Performance Results

**Date:** 23 Nov 2026 · **Branch:** `milestone-m5-record` (draft PR #7, not merged) · **Environment:** development only

**Boundaries kept:**
- Production was not touched and nothing was merged.
- No new scopes, no paid services; AI stays off; the development gate stays in Monitoring.
- Separation-of-duties enforcement stays server-side and unchanged.

**In one paragraph.**
- A first-time administrator now opens Article25 to a **Get started** checklist. Every line comes from a server-side check made just then, so it can never claim a workflow is protected when it isn't.
- Reviewers who can't decide are told exactly why: separation of duties or group membership, with a next step. The workspace and the issue panel say the same thing.
- Both bundles shrank by **more than half** by dropping four Atlaskit components whose transitive dependencies dominated cold starts.
- Settings no longer loads as a waterfall.
- Colour contrast is now checked **in a real browser** against the real Atlassian themes, in CI, and the check is shown to be able to fail.

## 1. What a first-time judge experienced before
Inspected live and in code before changing anything:

| Moment | Before P1 |
|---|---|
| Open the desk | An explanation of the loop, a fictional example, and a "Setup on this site" card with four facts but no guidance; nothing said what was missing or what to do |
| Configure | Nothing linked to the right place: Settings was one long page, and the user had to find the gate section |
| Protection | The setup card said "Workflow gate: Monitoring". Nothing on the Overview said that installing protects no workflow; that fact lived only in Settings |
| Try to approve your own test item | One sentence: "You reported or are assigned to this work item, so another reviewer must decide." No next step, and no hint that an admin can switch this off for a solo trial. Being outside the reviewer group got a similar bare sentence |
| Issue panel | Silent about why the viewer can't decide |
| Load time | Desk first content p50 **2.6 s**, worst 7.1 s; panel p50 **2.0 s**, worst 6.9 s. Settings fetched gate and record status only after its overview arrived |
| Accessibility | axe ran in jsdom with `color-contrast` **disabled**: contrast had never been checked automatically |

## 2. Get started (administrators)
**Where:** at the top of the Overview, for Jira administrators. It collapses to "Article25 is set up" once the required steps are done; the details stay one click away and are re-checked on every visit.

**Data:** a new admin-only resolver, `getSetupStatus`. It reuses the gate health check, so the coverage shown is the result of the same workflow scan that Settings uses: **only this environment's validator counts** (audit fix F7). It returns no account ids. Nothing is cached, and each value is read on each call.

| Step | Kind | What it shows | Link |
|---|---|---|---|
| Choose who decides | Required | Done if *you* are in the reviewer group. Otherwise "Check the group" with exact instructions. It says honestly that Article25 cannot list group members (no new scope) | — |
| Sign every decision | Required | Configured / older format / missing, explained | — |
| Protect a workflow transition | Required | *Not protected*, with the exact Jira path to add the gate. Or *Protected* (N workflows), *Gaps*, *Unknown* or *Not ready*. Installing is never presented as protection | Workflow gate |
| Choose Monitoring or Enforcing | Required, a choice | The current mode and what it means | Workflow gate |
| Separation of duties | Recommended | On or off, with the solo-trial advice | Review settings (always shown: it is a switch) |
| AI-assisted checks | Recommended | Off means rule-based (fewer signals), switched on by the app operator | — |
| Back up the decision record | Recommended | Not needed yet / N not backed up / backed up | Decision record |
| See it work | — | Four steps, with live progress ("12 decisions recorded…", "The gate ran 25 times in the last 7 days") | Inbox |

**Why this design.**
- One list in the order an administrator must act, with required steps visibly separate from recommended ones. Each status is a word in a lozenge (never colour alone), and the icon is decorative.
- Deep links go to the exact Settings section (`/settings/gate|record|review|checks`) and move focus to that section's heading.
- Non-administrators get **Your role** instead: reviewers get a way to the Inbox; everyone else learns who decides and where to see checks.

## 3. Separation-of-duties guidance
**Server.**
- `decideReason` already distinguished `NOT_REVIEWER` from `SOD`.
- P1 adds `youAre` (`reporter`, `assignee` or `reporter_assignee`). It describes **only the caller's own** relation; the other person's identity is never sent (tested).
- The decision endpoint still refuses with `SOD_BLOCKED` regardless of the UI (tested).

**Workspace.**
- **Separation of duties:** an information message titled *Another reviewer must decide*. It gives:
  - your exact relation;
  - the rule;
  - the next action ("Assign the review to another reviewer…");
  - for **administrators only**, the audited switch with a link to it.
- **Not a reviewer:** a different message, *You can't record decisions*. It names the group and says to ask an administrator. It never mentions separation of duties.

**Panel.** One line, shown only to reviewers it applies to: "You reported this work item, so another reviewer must decide (separation of duties)." Requesters see nothing extra, because the panel has no decision controls.

## 4. Cold-start performance
### 4.1 Causes found (measured, not assumed)
1. **Bundle weight.** Source maps showed the four Atlaskit components we used pulling in feature-flag clients, Statsig analytics, `top-layer`, `popper`, tooltip and motion: well over half of each bundle. On cold loads the browser spent up to 3.9 s before the page was ready.
2. **Platform invoke overhead.** On the client a resolver round trip took ~2.1 s p50 against ~0.4 s of server time: Forge's invoke path and cold function starts. We can't change the platform, only call it fewer times and in parallel.
3. **Waterfalls.**
   - Settings fetched the gate and record sections only after the overview returned.
   - The gate health check ran its four reads in sequence and paged workflows one page at a time.

### 4.2 Changes
| Change | Effect | Correctness |
|---|---|---|
| Replace `@atlaskit/button`, `heading`, `lozenge` and `section-message` with token-styled primitives (`shared/components/ui.jsx`): native elements, same props and semantics, ADS tokens only | Bundles −55% (§6) | Same roles and labels; all 87 jsdom tests unchanged apart from two intended copy updates; contrast verified (§5) |
| Settings starts its three requests together | Gate and record no longer wait for the overview | Each section keeps its own loading and error state |
| Get started fetched in parallel with the app context | No extra waterfall on the Overview | Non-admins get `NOT_AUTHORISED`, treated as "no checklist" |
| Gate health: parallel database, mode, workflow and activity reads; workflow pages after the first fetched in parallel (bounded to 4) when `total` is known | Fewer sequential round trips | **No caching**: every value is fresh on every call |

### 4.3 Before and after (development, live client metrics)
| Measure | Before (24 h, n = 47 desk / 18 panel) | After (n = 14 desk / 6 panel) |
|---|---|---|
| Desk first content, p50 | 2,573 ms | **1,285 ms** |
| Desk first content, worst (cold) | 7,074 ms | **5,442 ms** |
| Desk page ready, cold (`domContentLoaded` p90) | 3,474 ms | **2,420 ms** |
| Panel first content, p50 | 2,045 ms | **1,453 ms** |
| Panel first content, worst (cold) | 6,941 ms | **4,030 ms** |
| `getSettingsOverview` server p50 | 798 ms | 549 ms (now in parallel with the next two) |
| `getGateOverview` server p50 | 1,701 ms | 2,333 ms (n = 4; dominated by the workflow scan and Jira; no longer on the critical path) |
| `getSetupStatus` server p50 (new, deferred) | — | 1,497 ms |

The after-samples are small and were all taken within one hour. Cold starts remain dominated by Forge's function start (client invoke p90 ≈ 2.9 s). The figures are indicative and should be re-measured on production.

## 5. Accessibility, including real colour contrast
- **The gap:** axe's `color-contrast` rule needs layout and a canvas, which jsdom lacks, so it was disabled in every test.
- **The fix:** `src/contrast.browser.test.jsx` runs with Vitest browser mode and Playwright in **headless Chromium**.
  - It loads the app's CSS and the **real ADS token themes** from `@atlaskit/tokens`: light, dark, typography, spacing and shape. These are the same CSS variables Forge injects in Jira.
  - It emulates Jira's host surface behind the transparent panel document.
  - It renders 11 interfaces in **both themes**:
    - every primitive and status lozenge;
    - desk header and Overview;
    - Get started (to do, and set up with collapsed content opened);
    - Inbox and the review workspace;
    - separation-of-duties guidance;
    - the Record page and Settings (overview, gate, record);
    - the issue panel (result, and failed check).
- **Not vacuous:**
  - each screen must have measured text nodes;
  - two negative controls (faint text; dark-theme text on a light surface) must be flagged.
- **Result:** **954 text nodes measured (477 per theme), 0 violations, 0 undetermined.** It runs in `npm run check` and in CI (Chromium installed by Playwright).
- **While building it:** the harness first reported failures in every dark screen. The cause was the panel's transparent document, which in Jira sits on Jira's dark surface. The harness now emulates that host; the app was correct.
- **Other a11y checks kept:**
  - every new component is axe-clean in jsdom;
  - native buttons and `<details>`;
  - deep links move focus to the target heading;
  - status is never shown by colour alone;
  - reduced motion is respected.

## 6. Bundles (hard budgets: panel ≤ 200 KB, desk ≤ 400 KB gzip, initial)
| | Before P1 | After the component swap | Final (with Get started and guidance) |
|---|---|---|---|
| Panel | 193.4 KB | 79.5 KB | **81.4 KB** (headroom 118.6 KB, was 6.6 KB) |
| Desk | 212.1 KB | 97.6 KB | **101.4 KB** |
| Initial JS files | 29 | 5 | 5 |

**Growth found and accepted:** the panel gained 1.9 KB because the shared copy file now also carries the desk-only Get started strings. Splitting copy per surface would recover this and more (P2). It is not worth the churn while the panel has 118 KB of headroom.

**Dependencies:**
- Runtime: four Atlaskit packages **removed**. `@atlaskit/tokens` moved to dev-only (the contrast suite reads its themes).
- Dev only, free and open-source: `@vitest/browser-playwright` 5.1.1 and `playwright` 1.65.1.

## 7. Tests
| Suite | Result |
|---|---|
| Backend (`npm test`) | **183 pass**, including `experience.test.mjs`: setup status truthfulness, coverage per environment, unreadable workflows, backups, your own SoD relation with no other ids, SoD still refused server-side, paging bounds and parallelism |
| UI, jsdom + axe (`npm run test:ui`) | **87 pass**, including `experience.test.jsx`: steps for every status, set-up collapse, actions and deep links, loading and error, role card, SoD vs not-reviewer guidance, panel line, primitives' native semantics |
| Contrast, real Chromium (`npm run test:contrast`) | **24 pass**: 22 screen/theme checks + 2 negative controls |
| Lint, copy lint, `forge lint`, build with budgets | Clean / within budget |

## 8. Live verification (development, AI off, Monitoring)
| Check | Result |
|---|---|
| Overview as an admin | **"Article25 is set up"**, correct for this site: you are a member; signing configured; "2 workflows carry the Article25 gate"; Monitoring; backup "Backed up"; "12 decisions recorded…", "The gate ran 25 times…" |
| Deep link "Open workflow gate" | `/settings/gate`, landing on the Workflow gate section with coverage loaded |
| Workspace on a work item you reported (A25GC-1) | *Another reviewer must decide*, with "You reported this work item", the rule, the next action, and (as an admin) the audited switch link |
| Issue panel on the same item | Titled **Article25 privacy**; the one-line separation-of-duties message |
| Gate preview lozenge | Full text, no truncation |
| Visual parity of the new primitives | Buttons, lozenges and messages render with ADS colours and spacing in Jira, light theme. Dark theme was checked by the contrast suite, not by eye on the site |
| Mode, AI | Still **Monitoring** and **Off** |

**Not verified live:**
- a fresh, unconfigured site showing "Not protected" (covered by tests; the clean-site rehearsal is still a release blocker);
- a non-admin viewing *Your role* (single-account site);
- the dark theme by eye.

## 9. Remaining limitations
- **Reviewer-group existence.** Article25 can only confirm the viewer's own membership. Checking whether the group exists or has members would need a broader scope; the message says so.
- **Cold starts.** Forge function start still dominates the first request after idle (up to ~5 s on the desk). Lighter bundles helped page readiness, not the platform.
- **The coverage scan** takes 1.5–2.5 s of server time on a site with 105 workflows. It is deferred and shown progressively, never cached.
- **Copy split per surface** (P2) and **Settings tabs** (P2) are still open.
- The old `GateSettings` and `RecordSettings` wrapper exports remain for compatibility; Settings now uses the views directly.

## 10. Commits
1. `d216d37` frontend: token-styled primitives (bundles −55%)
2. `0aaf100` backend: setup status, and your own relation for separation-of-duties guidance
3. `9709542` frontend: Get started, separation-of-duties guidance, parallel Settings loading
4. `1d26703` test: real-browser colour-contrast check in CI
5. `e6497b4` backend: faster gate health without caching
6. Docs (this file, roadmap, README, judge guide, frontend architecture amendment)
