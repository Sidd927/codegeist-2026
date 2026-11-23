# Article25 — Information Architecture

**Stage 2** · 2026-11-22 · Journeys: [USER_JOURNEYS.md](USER_JOURNEYS.md) · Screens: [UX_DESIGN_SPEC.md](UX_DESIGN_SPEC.md)

## 1. Design principle
One workflow, three places where people already are:
- **the work item**, where the change is written;
- **the review desk**, where the privacy lead decides;
- **Confluence**, where the record lives.

There is no standalone "dashboard". Metrics appear only where they prompt an action (the Inbox summary strip, gate health).

## 2. Surfaces (Forge modules)
| Surface | Module | Audience | Purpose | MVP |
|---|---|---|---|---|
| **Privacy panel** | `jira:issuePanel` (Custom UI) | Everyone who can view the issue | Status, why, evidence, what's new, questions, decision | M |
| **Article25 desk** | `jira:globalPage` (Custom UI, in-app routes) | Reviewers; admins (Settings); read-only for others | Inbox, Review workspace, Decisions ledger, Settings, Get started | M |
| **Admin entry** | `jira:adminPage` → deep-links to Desk › Settings | Jira admins | Discoverability under *Apps → Manage apps* | S |
| **Privacy gate** | `jira:workflowValidator` (lambda) | Everyone transitioning gated work | Enforce the review state | M |
| **Decision register** | Confluence page written by the app (no Confluence UI module required for MVP **[UNVERIFIED: whether multi-app install needs ≥1 Confluence module; resolve on day 1]**) | Anyone with page access; auditors | Customer-owned, readable, verifiable record | M |
| Background | triggers, queue consumer, scheduled trigger | — | Screening, publishing, retention | M |

## 3. Navigation

### 3.1 Desk (global page) route map
```
/                       → redirects to /inbox (reviewer) · /get-started (first run, admin) · /about (others)
/get-started            Setup checklist (admin)                                  [FR-A1]
/inbox                  Pending review (default tab)                             [FR-R3]
/inbox?view=stale|needs-info|rule-based|all-open
/review/:issueKey       Review workspace                                         [FR-R4…R8]
/decisions              Ledger: all decisions, filter by item/project/decider   [FR-L4, L7]
/settings               Settings shell (Jira admins)                             [FR-A2…A8]
  /settings/scope         Projects in scope + gate policy
  /settings/people        Reviewer group, recovery group, separation of duties
  /settings/inventory     Approved vendors · categories per project
  /settings/ai            AI on/off, model, daily budget, usage today
  /settings/register      Confluence space/page, publish backlog, integrity
  /settings/gate          Gate health per project, monitor mode, setup steps
  /settings/recovery      Verify → confirm (recovery admins)
  /settings/audit         Admin audit log
/about                  What Article25 does, your role, privacy notice link
```

### 3.2 Top-level desk navigation (horizontal tabs in the page header)
`Inbox (n)` · `Decisions` · `Settings` (admins only). The tab `Get started` replaces `Inbox` until setup is complete for admins. Reviewers who aren't admins never see Settings.

> **M5 amendment (implemented):** the route is `/record` (tab **Record**), not `/decisions`. The tabs are now `Overview · Inbox · Record · Settings`. `/settings/register` and `/settings/recovery` are combined into one Settings section, **Decision record and recovery** (Jira admins; the recovery group is deferred). The Confluence "View register" link does not exist yet (register BLOCKED on scopes).

### 3.3 Cross-surface links
| From | To | Trigger |
|---|---|---|
| Panel | Desk › Review/:key | "Open in review desk" (reviewers) |
| Desk › Review | Jira issue | Issue key link (new tab) |
| Desk › Decisions | Confluence register | "View register" |
| Validator error message | (text) | Names the panel ("Open the Privacy panel on this work item") |
| Confluence register row | Jira issue | Issue key link |
| Get started › Gate | Jira workflow editor | Documented path (we cannot deep-link reliably; [UNVERIFIED]) |

## 4. Object model (what users see)
```
Project (in scope?) ──< Work item ──< Screening (immutable, per content fingerprint)
                           │              └── Signals (category | criterion | vendor | subject | change-type) + evidence quote
                           │              └── Inventory diff (new vendor, new category)
                           │              └── Outcome + rule trace + mode (AI | rule-based)
                           ├── Review state (current; one per item)
                           └──< Decision (immutable) ── Ledger record (seq, hash) ── Register row / checkpoint / receipt
Inventory: Vendors (site) · Categories (per project)
Settings · Audit events · Gate events (content-free)
```
Naming in the UI:
- *Screening* is shown as "Privacy check".
- *Decision* stays "Decision".
- *Ledger* is shown as "Decision record".
- *Register* stays "Register".

Internal names (`review_state`, `chain`) never appear.

## 5. Roles and permissions
| Capability | Viewer of issue | Requester (reporter/assignee) | Reviewer (group) | Jira admin | Recovery admin (group) |
|---|---|---|---|---|---|
| See panel status line | ✓ | ✓ | ✓ | ✓ | ✓ |
| See findings and quotes | ✓ if they can browse the issue (asUser check) | ✓ | ✓ | ✓ | ✓ |
| Re-screen | ✓ (rate-limited) | ✓ | ✓ | ✓ | — |
| Send to reviewer anyway (NEEDS_INFO) | — | ✓ | ✓ | — | — |
| Open the desk | read-only About | read-only About | ✓ Inbox, Review, Decisions | ✓ all | Settings › Recovery |
| Decide | — | — | ✓ except own items (separation of duties) | only if also a reviewer | — |
| Settings | — | — | — | ✓ | Recovery only |
| Monitor mode on/off | — | — | — | ✓ (audited) | — |
| Restore from backup | — | — | — | — | ✓ (two-step, audited) |

Rules:
- Every check is **server-side** from `context.accountId`; the frontend only hides controls.
- Group checks happen on every call, with no cached authority **[VERIFIED pattern]**.
- Confluence register visibility follows Confluence space permissions (the customer chooses the space; Get started warns about this).

## 6. States shown to users (vocabulary)
States are defined in [DATA_AND_SECURITY_MODEL.md §2](DATA_AND_SECURITY_MODEL.md), which is the single source of truth. Where a state covers several screening outcomes, the label comes from the outcome.

| State (outcome) | Label | Tone (ADS lozenge appearance) | Gate |
|---|---|---|---|
| OUT_OF_SCOPE | Not in scope | default (panel collapsed) | allow |
| NOT_SCREENED | Not checked yet | default | block |
| SCREENING | Checking… | inprogress | block |
| SCREENING_FAILED | Check failed | removed | block |
| CLEARED_AUTO (CLEAR) | No review needed | success | allow |
| CLEARED_AUTO (INVENTORY_UPDATE) | Known processing | default | allow |
| NEEDS_INFO | Needs information | moved | block (policy) |
| PENDING_REVIEW (REVIEW_REQUIRED) | Review required | moved | block |
| PENDING_REVIEW (DPIA_LIKELY) | DPIA likely | removed (bold) | block |
| APPROVED | Approved | success | allow |
| APPROVED_WITH_CONDITIONS | Approved with conditions | success + condition count | allow |
| NEEDS_MORE_INFORMATION (was CHANGES_REQUESTED) | More information requested | moved | block |
| REJECTED | Rejected | removed | block |
| STALE → APPROVAL_STALE | Approval invalidated | removed (bold) | block |
| PENDING_RECHECK (M3) | Changed · re-checking | inprogress | block |
| CHANGED_SINCE_DECISION (M3) | Changed since decision | moved | block |
| AWAITING_REVIEW (M3, = PENDING_REVIEW) | Awaiting review | moved | block |

> M3 amendment: review statuses are derived on the server (`core/review.js`). The gate column is the M4 design; no gate is active yet.
>
> **M4 amendment:** the gate is live (policy `g1`):
> - Every row blocks except a verified human APPROVED decision (direct or carried over) on the current text. CLEAR / INVENTORY_UPDATE **block** on protected transitions, and APPROVED_WITH_CONDITIONS blocks until conditions are confirmed.
> - Gate reason vocabulary: 23 codes, in [M4_ENFORCE_RESULTS.md §4](M4_ENFORCE_RESULTS.md); short labels in the copy deck under `copy.gate.reasons`.
> - Gate verdicts: Allowed, Blocked, Would allow and Would block. The last two only appear in monitoring, which is always labelled "not blocking".

Monitor mode overrides every "block" to "allow + logged", with a banner.
