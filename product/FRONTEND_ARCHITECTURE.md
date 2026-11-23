# Article25 — Frontend Architecture & Design System

**Stage 2** · 2026-11-22 · UX: [UX_DESIGN_SPEC.md](UX_DESIGN_SPEC.md) · System: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)

## 1. Current state (what exists)
- All spike UIs use **UI Kit** (`render: native`, `@forge/react`): `spikes/article25-core-spike/src/frontend/{panel,page}.jsx` and the TWG/LLM spike pages. They are developer test harnesses (buttons that dump JSON). **No product UI exists and none is reused.**
- **Design resources in this workspace:** none. No `GetDesign.md` or `DESIGN.md` exists in this repository. A separate project on this machine has GetDesign research; we reuse only its *method*:
  - treat the free, MIT-licensed `VoltAgent/awesome-design-md` entries as calibration references, never templates;
  - don't run `npx getdesign` (third-party code execution).
- **Platform facts checked on 22 Nov 2026** [DOCS]:
  - **UI Kit:**
    - renders natively with design tokens enabled automatically;
    - components include Dynamic table, Tabs, Modal, Lozenge, Badge, Section message, Empty state, Spinner, User, Box/Inline/Stack + XCSS, Router (Preview), Popup (Preview) and charts (bar, donut, line, pie);
    - **no DOM access and no HTML**, only `@forge/react` components.
  - **Custom UI:**
    - runs in an iframe under a CSP, so every asset must be bundled, with no external scripts or images;
    - calls the backend through `@forge/bridge` `invoke`;
    - theming is opt-in via `view.theme.enable()` + ADS tokens (`var(--ds-*)` or `@atlaskit/tokens`);
    - resource quota for distributed apps: 75 MB / 250 files per week per production deployment.
  - **Validators** have no UI.

## 2. Rendering approach: decision
| Option | For | Against | Verdict |
|---|---|---|---|
| **UI Kit everywhere** | Native rendering, fastest to load, tokens automatic, built-in table/tabs/charts, least code | **Cannot render the annotated document** (inline highlights linked to margin notes, focus sync, `<mark>` with `aria-describedby`); limited layout control for a 3-zone workspace; router is Preview | Rejected for the desk |
| **Custom UI everywhere** (React + Vite) | Full control for the signature *Margin* experience; one component system and one build; ADS tokens keep it native; testable with standard tools | Iframe load cost; we own bundle size; ADS component compatibility in Custom UI is **[UNVERIFIED]** (docs cover tokens only) | **Selected** |
| Hybrid (UI Kit panel, Custom UI desk) | Panel loads fastest | Two component systems, duplicated components (findings list, lozenges, evidence marks); inconsistent details | **Fallback only**: used if the Custom UI panel misses its performance budget (§8) |

**Decision:** Custom UI for the issue panel and the desk (global page; admin page reuses the desk bundle), with **Atlassian Design System** tokens and a small set of `@atlaskit` components, plus an Article25 "Margin" layer for the annotated document.

**Day-1 verification spike (F0, before any screen is built):**
1. Theming via `view.theme.enable()` works in light and dark.
2. Measure bundle size for the candidate `@atlaskit` set.
3. Measure panel time-to-first-content on the demo site.
4. Check that `view.createHistory()` routing works in the global page.

**Exit:** budgets in §8 met → proceed. Otherwise drop heavy packages and use tokens + primitives, or fall back to a UI Kit panel.

## 3. Stack
| Concern | Choice | Reason |
|---|---|---|
| UI library | React 18 | Required by `@atlaskit`; team familiarity |
| Build | Vite (multi-entry: `panel`, `desk`), `base: './'` | Fast, small output; relative paths required by Forge [DOCS] |
| Language | JavaScript (ESM) with JSDoc types, checked by `tsc --noEmit --checkJs` | Avoids TS build friction in Forge functions [DOCS note]; types still enforced |
| Design system | `@atlaskit/tokens` + `@atlaskit/primitives` (Box/Stack/Inline/xcss) + components: button, lozenge, section-message, modal-dialog, dynamic-table, select, radio, textfield, textarea, toggle, tabs, tooltip, flag, spinner, avatar, empty-state, icon | Native look and accessibility from Atlassian; final set confirmed by F0 |
| Routing (desk) | `view.createHistory()` from `@forge/bridge` + a minimal router (react-router with a custom history) | Deep links into the desk; Forge-managed URL |
| Server state | TanStack Query over a typed `invoke` client | Caching, polling for "Checking…", retries, stale-while-revalidate |
| Local state | React state + reducer for the decision form | No global store needed |
| Teamwork Graph | `requestTeamworkGraph` from `@forge/bridge` (runs as the user) | [VERIFIED] in spike E; Should-have |
| Testing | Vitest + React Testing Library + `vitest-axe` (axe-core) | Unit, component and automated a11y checks |
| Lint/format | ESLint (react, jsx-a11y) + Prettier | a11y lint catches regressions early |

No charting library and no CSS framework (tokens + primitives are sufficient). No custom fonts: ADS font tokens keep typography identical to Jira.

## 4. Visual direction: *Margin*
**Concept:** a privacy review is a close reading of a document, so the product borrows the visual grammar of **legal review**:
- the work item text is the page;
- findings are numbered margin notes;
- decisions are signed entries in a record.

This is the one distinctive element. Everything else is deliberately native Atlassian so the product feels like part of Jira rather than a skinned SaaS dashboard.

**References considered (calibration, not copying):**
| Reference | What we take | What we reject |
|---|---|---|
| Atlassian Design System | Tokens, typography, components, interaction patterns, lozenge semantics | — (foundation) |
| Legal redlining / annotation tools (generic genre) | Numbered marks, margin notes, before/after diffs | Track-changes clutter, red ink everywhere |
| IBM Carbon (via `awesome-design-md` interpretation) | Data density, hairline separators, restraint with colour | IBM Blue, square-everything branding |
| Linear-style inbox (genre) | Dense, keyboard-first rows, severity ordering | Dark-only aesthetic, heavy imitation |
| Git commit / ledger UIs | Mono hash prefixes, sequence numbers for the decision record | Developer jargon in requester-facing views |

**Explicitly avoided:**
- KPI-card dashboards and charts without a decision attached;
- gradients;
- mascots;
- AI "sparkle" decoration (AI provenance is a small, labelled glyph);
- red as the default state colour (red is reserved for blocked, rejected and integrity failure).

## 5. Design tokens
All colours, spacing, typography, radius and elevation come from ADS tokens. Article25 defines **semantic aliases** only (CSS custom properties in `frontend/src/styles/tokens.css`), so a theme change in Jira flows through automatically.

```css
:root {
  /* Evidence (Margin) */
  --a25-mark-bg:            var(--ds-background-accent-yellow-subtlest);
  --a25-mark-bg-active:     var(--ds-background-accent-yellow-subtler);
  --a25-mark-underline-sensitive: var(--ds-border-danger);
  --a25-mark-underline-vendor:    var(--ds-border-discovery);
  --a25-mark-underline-default:   var(--ds-border-accent-yellow);
  --a25-margin-rule:        var(--ds-border);            /* hairline between document and margin */
  --a25-index-fg:           var(--ds-text-subtle);
  /* Delta ("what's new") */
  --a25-new-bg:             var(--ds-background-warning);
  --a25-new-fg:             var(--ds-text-warning);
  /* Provenance */
  --a25-ai-fg:              var(--ds-text-discovery);    /* "Found by AI · quote verified" glyph */
  --a25-rules-fg:           var(--ds-text-subtlest);
  /* Gate */
  --a25-blocked-bg:         var(--ds-background-danger);
  --a25-blocked-fg:         var(--ds-text-danger);
  --a25-allowed-fg:         var(--ds-text-success);
  /* Record */
  --a25-hash-font:          var(--ds-font-family-code);
  --a25-record-rule:        var(--ds-border);
  /* Layout */
  --a25-page-max:           1280px;
  --a25-zone-gap:           var(--ds-space-300);
  --a25-panel-gap:          var(--ds-space-150);
}
```
| Token family | Usage |
|---|---|
| Typography | `font.heading.large` (page title), `font.heading.small` (zone headers), `font.body` (default), `font.body.small` (quotes, metadata), `font.code` (keys, hashes, rule IDs) |
| Spacing | 4px base via `space.050`–`space.400`. Panel uses `space.100`/`space.150`; desk zones use `space.300`. |
| Radius | `border.radius` (default) for cards and inputs; `border.radius.100` for evidence marks; no pill shapes except ADS lozenges/tags |
| Elevation | Flat surfaces (`elevation.surface`); `elevation.surface.raised` only for the sticky decision zone and popovers; no decorative shadows |
| Colour meaning | success = cleared · warning = new/delta · danger = blocked/rejected/integrity failure · discovery = AI provenance · information = rule-based notice · neutral = known/out of scope |

**Light and dark:** `view.theme.enable()` at app start; all aliases resolve per theme; contrast inherited from ADS. Verify evidence-mark contrast in both themes in F0.

## 6. Component inventory
| Component | Built from | Used in | Notes |
|---|---|---|---|
| `StatusHeader` | ADS Lozenge + text + icon | Panel, Review header | Maps state → label/appearance ([IA §6](INFORMATION_ARCHITECTURE.md)) + why line + gate line |
| `GateLine` | text + icon | Panel, Review | Blocked/allowed phrasing per state |
| `DeltaChips` | ADS Tag (custom appearance via aliases) | Panel, Inbox, Review | Click → scroll to finding |
| `EvidenceDocument` | **custom** (`<article>`, `<mark>`) | Review | Inline marks from quote offsets; hover/focus sync; keyboard `[`/`]` |
| `MarginNote` | Box + Stack + Lozenge("New") + provenance glyph | Panel, Review | Linked to `EvidenceDocument` mark via id |
| `FindingsList` | MarginNote list, grouping, "Show n more" | Panel, Review | Order: new → sensitive → others; known collapsed |
| `RuleTrace` | disclosure + ordered list (mono IDs) | Panel, Review | Model, rules version, timing |
| `OpenQuestions` | numbered list | Panel, Review | — |
| `DecisionForm` | ADS Radio group, Textarea, `ConditionsEditor`, Button | Review | Reducer-managed; explicit disabled reasons |
| `ConditionsEditor` | Textfield rows + add/remove | Review | Max 10 × 200 chars |
| `StaleDiff` | two-column list | Panel, Review | "Approved before / Added since" |
| `InboxRow` | custom row in a list (not a table: two-line rows) | Inbox | Keyboard navigable listbox pattern |
| `SummaryStrip` | 4 × stat buttons | Inbox | Each applies a filter |
| `RecordEntry` / `RecordTable` | ADS Dynamic table + mono hash | Decisions | Expandable rows |
| `IntegrityBadge` | icon + text + link | Desk header, Decisions | Verified / checking / problem |
| `SetupChecklist` / `SetupStep` | Stack + status icon + content slot | Get started | Persisted progress |
| `GateHealthTable` | Dynamic table | Settings › Gate, Get started | Live status |
| `InventoryEditor` | table + checkbox matrix | Settings, Get started | — |
| `RecoveryFlow` | stepper + report | Settings › Recovery | Mirrors the verified two-step API |
| `AsyncBoundary` | skeleton / error (Section message + Retry) / empty | All | Standard state handling ([UX §4](UX_DESIGN_SPEC.md)) |
| `Shortcuts` | Popover listing keys | Desk | — |

## 7. Representative layouts
Annotated wireframes are in [UX_DESIGN_SPEC.md §3](UX_DESIGN_SPEC.md):
- **3.1** Panel (single column, 320–720 px);
- **3.3** Inbox (two-line dense rows);
- **3.4** Review workspace (3 zones: Document 45% · Margin 30% · Decision 25%, sticky decision; tabs + bottom sheet under 1024 px).

Layout primitives: CSS grid for the workspace zones (`grid-template-columns: minmax(0,45fr) minmax(0,30fr) minmax(280px,25fr)`), ADS `Stack`/`Inline` inside zones.

## 8. Performance budgets (verified in F0 and again before freeze)
| Metric | Budget |
|---|---|
| Panel JS (gzip) | ≤ 200 KB |
| Desk initial JS (gzip, Inbox route) | ≤ 400 KB; Review/Settings code-split |
| Panel first content (cached state, demo site) | ≤ 1.5 s p50 |
| Inbox render, 200 items | ≤ 2 s |
| Resolver calls per panel load | 1 (single `getPanelState` aggregate) |

Techniques:
- one aggregate resolver per view;
- route-level code splitting;
- icons imported individually;
- no moment/lodash-style heavy utilities;
- TanStack Query cache across desk routes.

## 9. Frontend structure
```
app/frontend/
  vite.config.js            # multi-entry: panel.html, desk.html; base './'
  src/
    panel/main.jsx          # bootstrap: theme.enable, QueryClient, <PanelApp/>
    desk/main.jsx           # bootstrap + router (createHistory)
    desk/routes/{Inbox,Review,Decisions,Settings/*,GetStarted,About}.jsx
    components/             # §6 inventory
    api/client.js           # typed invoke wrappers: one function per resolver
    api/queries.js          # TanStack Query keys/hooks
    styles/tokens.css       # §5 aliases
    copy/                   # all user-facing strings (copy deck; no "compliant")
    a11y/                   # focus helpers, live-region hook
  test/                     # vitest + RTL + vitest-axe
```

## 10. Quality gates
- **Every component:** a story-like test rendering loading/empty/error/success, plus an axe check, with 0 violations required.
- **Keyboard walkthrough checklist** per screen, done before code freeze.
- **Copy lint:** CI grep fails on the banned words "compliant", "legal advice", "guarantee" in `copy/`.
- **Visual review in both themes** before recording the demo.

---

## P1 amendment (23 Nov 2026): Atlaskit components replaced by token-styled primitives
- **The original decision (§2–§3)** was ADS tokens plus a small set of `@atlaskit` components. It stands for tokens. For components it is amended.
- **Measured problem:** `@atlaskit/button`, `heading`, `lozenge` and `section-message` brought in feature-flag clients, analytics, `top-layer`, `popper`, tooltip and motion. Together these were well over half of each bundle; the panel was at 193.4 of 200 KB.
- **Replacement:** `src/shared/components/ui.jsx` provides `Button`, `Heading`, `Lozenge` and `SectionMessage` with the same props, native elements and the same semantics. They are styled only with ADS token variables, so Jira's light and dark themes apply as before.
- **Result:** initial gzip panel 81.4 KB and desk 101.4 KB.
- **Contrast:** checked in real Chromium against the ADS light and dark themes (`src/contrast.browser.test.jsx`, in CI).
- Details: [P1_EXPERIENCE_RESULTS.md](P1_EXPERIENCE_RESULTS.md).
