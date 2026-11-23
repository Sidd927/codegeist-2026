# Article25 — Product Requirements

**Stage 2** · 2026-11-22 · Strategy: [PRODUCT_VISION.md](PRODUCT_VISION.md) · Priorities and acceptance criteria: [MVP_SCOPE.md](MVP_SCOPE.md)

IDs are stable and referenced by the other documents. Priority: **M** = Must (MVP), **S** = Should, **L** = Later. Status: **[VERIFIED]** in a spike, **[PROPOSED]** not yet built.

## 1. Glossary
| Term | Meaning |
|---|---|
| **Work item** | A Jira issue in an in-scope project |
| **Screening** | One evaluation of a work item's current content: extraction (AI or rules), evidence verification, inventory diff, rules outcome |
| **Signal** | An extracted fact with a verbatim evidence quote: data category, WP248 criterion, vendor/recipient, data subject, change type |
| **Outcome** | Deterministic screening result: `CLEAR` < `INVENTORY_UPDATE` < `NEEDS_INFO` < `REVIEW_REQUIRED` < `DPIA_LIKELY` (from doc 15) |
| **Inventory** | What the organisation has already approved: vendors (site-wide) and data categories per project |
| **Decision** | A human reviewer's act: `APPROVED`, `APPROVED_WITH_CONDITIONS`, `CHANGES_REQUESTED`, `REJECTED` |
| **Review state** | The work item's current governance state (see [DATA_AND_SECURITY_MODEL.md §2](DATA_AND_SECURITY_MODEL.md)) |
| **Gate** | The Article25 Jira workflow validator on a configured transition |
| **Ledger** | The append-only, signed hash chain of decisions |
| **Register** | The Confluence page (owned by the customer) that publishes the ledger and its backup |
| **Material change** | A re-screening of an approved item that adds a category, vendor or criterion, or raises the outcome severity |

## 2. Functional requirements

### 2.1 Screening (detect)
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-S1 | Screen in-scope work items automatically on **create** and on **change of summary or description**, with no user action. | M | trigger [VERIFIED] |
| FR-S2 | Extract signals with Forge LLM via tool calling (`tool_choice: auto`). Every signal must carry a verbatim quote, and quotes not found in the source text are **dropped** and counted. | M | [VERIFIED] 170/170 tool use, 0 invalid quotes |
| FR-S3 | Treat work-item text as data: a delimited prompt plus an injection guard. The LLM never sets the outcome. | M | [PROPOSED]; injection cases added to the eval set |
| FR-S4 | Compute the outcome with a **versioned deterministic rules engine** (WP248 two-criteria rule, sensitive categories, children, unapproved vendors, new categories, open questions about third parties or transfers, change-type down-weighting). | M | baseline rules [VERIFIED]; doc 15 §7.3 fixes [PROPOSED] |
| FR-S5 | Diff signals against the inventory: **new vendor** (not approved) and **new data category for this project**. | M | [VERIFIED] in spike rules; inventory store [PROPOSED] |
| FR-S6 | Fallback: if AI is off, unavailable, over the cost cap or failing, screen with the rule-based extractor and label the result "Rule-based (limited recall)". The outcome is never CLEAR on fallback unless explicitly negated (fail-safe variant). | M | [VERIFIED] fail-safe variant |
| FR-S7 | Cache by content fingerprint: an unchanged fingerprint must not trigger a second LLM call. | M | [PROPOSED] |
| FR-S8 | Atomic per-installation daily AI budget (screenings/day). Over budget → fallback (FR-S6) plus an admin-visible notice. | M | atomic SQL counter [VERIFIED pattern] |
| FR-S9 | Manual **Re-screen** from the panel or workspace (rate-limited per item). | M | [PROPOSED] |
| FR-S10 | Screening latency target: result visible ≤ 30 s after create (p90). | M | LLM median 3.5 s [VERIFIED] |
| FR-S11 | Screen linked Confluence specs (PRDs) as additional context. | L | — |

### 2.2 Review (route and decide)
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-R1 | Outcomes `REVIEW_REQUIRED` and `DPIA_LIKELY` (and others per gate policy, FR-A3) put the work item in **Pending review** automatically. No request step for the PM. | M | [PROPOSED] |
| FR-R2 | `NEEDS_INFO` shows the open questions to the requester. The item waits for clarification: an edit triggers a re-screen, or the requester can **Send to reviewer anyway**. | M | [PROPOSED] |
| FR-R3 | **Inbox** lists pending items with outcome, what's new, age, project and requester, sorted by severity, then age. Filters: outcome, project, age. | M | [PROPOSED] |
| FR-R4 | **Review workspace** shows: work-item text with highlighted evidence linked to findings; findings grouped by type; inventory diff; rule trace (rule IDs, version); open questions; screening mode/model; decision history. | M | [PROPOSED] |
| FR-R5 | Decisions: `APPROVED`, `APPROVED_WITH_CONDITIONS` (≥1 condition required), `CHANGES_REQUESTED` (message required), `REJECTED` (rationale required). An optional rationale goes on every decision. | M | states [VERIFIED] in spike |
| FR-R6 | Only members of the configured **reviewer group** may decide, checked server-side from `context.accountId` on every decision. | M | [VERIFIED] |
| FR-R7 | **Separation of duties:** the decider must not be the work item's reporter or assignee (on by default; an admin may disable it, and that change is audited). | M | [PROPOSED] |
| FR-R8 | **Optimistic concurrency:** a decision carries the screening ID and review version it was made against. If either changed, reject it with "This item changed while you were reviewing" and reload. | M | optimistic SQL [VERIFIED] |
| FR-R9 | **Declared purpose** from a linked Atlassian Goal (Teamwork Graph, as the reviewer), shown in the workspace, with graceful degradation. | S | TWG goal traversal [VERIFIED]; org-admin install [UNVERIFIED for judges] |
| FR-R10 | Conditions can optionally create **linked Jira tasks** (idempotent). | S | review-task creation [VERIFIED] |
| FR-R11 | On approval, the reviewer may **add the new vendor/categories to the inventory** in the same action. | S | [PROPOSED] |
| FR-R12 | Reviewer assignment, SLAs, notifications. | L | — |

### 2.3 Enforce (gate)
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-G1 | A lambda workflow validator reads **only app-owned SQL state** and allows a transition only if the item is in-scope-cleared. **[VERIFIED: lambda + app storage; issue-property gate rejected as insecure]** | M | doc 14 |
| FR-G2 | **Fail closed:** errors, missing state, unscreened items, screening in progress, pending, changes requested, rejected and stale items are blocked, each with a specific, actionable message (≤ 1 sentence + where to go). | M | fail-closed [VERIFIED] |
| FR-G3 | **Evidence-locked approval:** a decision stores the content fingerprint and signal set it approved. A material change on re-screening sets the state to `STALE` and re-routes to review. A non-material change keeps the approval and records the new fingerprint, attributed to the system. | M | [PROPOSED] |
| FR-G4 | The validator records each evaluation (project, transition, result, reason code; **no content**) for gate health and metrics. | M | [PROPOSED] |
| FR-G5 | **Gate health:** Settings shows, per in-scope project, whether the validator has been seen evaluating and when. | M | [PROPOSED]; no extra scope needed |
| FR-G6 | **Monitor mode** (admin kill-switch): the validator allows but records "would have blocked". The switch is audited and shown as a banner to reviewers and admins. | M | [PROPOSED] |
| FR-G7 | Works in company-managed and team-managed projects. | M | [VERIFIED] |

### 2.4 Record (ledger, register, recovery)
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-L1 | Every decision is appended to the signed hash chain (HMAC-SHA256 record signature, SHA-256 links, per-site genesis) in the same logical operation as the state change. | M | [VERIFIED] |
| FR-L2 | Publish to the **Confluence register**: a human-readable table of decisions, the chain backup as a content property, a signed checkpoint per decision in the page-version message, and a signed receipt in the work item's issue property. | M | [VERIFIED] |
| FR-L3 | Publishing is retried asynchronously. A Confluence failure never blocks or reverts a decision, and the backlog is visible to admins. | M | [PROPOSED] |
| FR-L4 | **Ledger integrity status:** verify the local chain on demand and show "Verified · N decisions · head #seq". | M | [VERIFIED] verifier |
| FR-L5 | **Authorised recovery** after reinstall: two steps (verify → confirm), recovery-admin group, empty store only, single-use user-bound nonce, re-verification at confirm, all-or-nothing, review state written last, audited. | M | [VERIFIED] (doc 22) |
| FR-L6 | Content-free **audit log** of administrative and security actions (settings changes, monitor mode, recovery, SoD override). | M | [VERIFIED] audit table |
| FR-L7 | Decision export (CSV/JSON). | S | [PROPOSED] |
| FR-L8 | Receipts indexed via `jira:entityProperty` for full-site enumeration at recovery. | L | doc 22 §5 |

### 2.5 Administration and onboarding
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-A1 | **Get started** checklist on first open: reviewers group, projects in scope, inventory (or sample), register location, gate setup with live health, try it. Progress persists. | M | [PROPOSED] |
| FR-A2 | **Scope:** select in-scope projects. Out-of-scope projects are never screened and the gate allows. | M | [PROPOSED] |
| FR-A3 | **Gate policy** (site-wide in MVP): which outcomes require a human decision (default: `REVIEW_REQUIRED`, `DPIA_LIKELY`; option: all personal-data outcomes), and whether `NEEDS_INFO` blocks (default: yes). | M | [PROPOSED] |
| FR-A4 | **AI settings:** AI on/off, daily budget, model (one of the active models from `list()`; default `claude-haiku-5-5`). | M | models [VERIFIED] 22 Nov |
| FR-A5 | **Inventory editor:** approved vendors (site-wide), known data categories per project. | M | [PROPOSED] |
| FR-A6 | **Sample scenario:** load a sample inventory and, with explicit confirmation, create 3 sample work items (benign, review-required, DPIA-likely) in a chosen in-scope project. | M | issue create [VERIFIED] |
| FR-A7 | Reviewer group and recovery group are configurable, and the existence of each group is validated. | M | [PROPOSED] |
| FR-A8 | Settings require Jira **Administer** global permission, checked server-side for the calling user. | M | [PROPOSED]; permission check [UNVERIFIED] scope |

### 2.6 Work-item panel (requester surface)
| ID | Requirement | P | Basis |
|---|---|---|---|
| FR-P1 | Shows: status header (outcome or review state, plus gate effect), a one-line "why", top findings with quotes, what's new vs. the inventory, open questions, decision and conditions if decided, and the screening mode. | M | [PROPOSED] |
| FR-P2 | Findings are shown only if the viewer can browse the issue (`asUser` check), because screening runs as the app. | M | [PROPOSED] |
| FR-P3 | Actions: **Re-screen**, **Send to reviewer anyway** (NEEDS_INFO), **Open in review desk** (reviewers only). | M | [PROPOSED] |
| FR-P4 | Never shows other work items' data or inventory internals beyond the diff relevant to this item. | M | [PROPOSED] |

## 3. Non-functional requirements
| ID | Requirement | Target |
|---|---|---|
| NFR-1 Security | Server-side authorisation for every mutating resolver; identity only from `context.accountId`; zero trust in payload identity or state | All resolvers; tested |
| NFR-2 Fail-closed | Any gate error → block; any partial restore → clear state | Tested (unit + live) |
| NFR-3 Privacy | No work-item text in logs. Stored excerpts ≤ 120 chars with emails, phone numbers and card-like numbers redacted. Full text never stored. Screening data purged on issue delete. | Code review + test |
| NFR-4 Egress | Zero external egress ("Runs on Atlassian" eligible) | Every deploy |
| NFR-5 Performance | Panel first content ≤ 1.5 s p50 (cached state); inbox ≤ 2 s for 200 pending items; validator ≤ 500 ms p95 | Measured in rehearsal |
| NFR-6 Reliability | Idempotent triggers and consumers (fingerprint + job key); decisions transactional; publishing retryable | Tested |
| NFR-7 Accessibility | WCAG 2.2 AA for all app UI; keyboard-complete; contrast via ADS tokens; light and dark themes | Audit before freeze |
| NFR-8 Installability | Judge installs via the sharing link as a site admin, then completes Get started in ≤ 10 min **[UNVERIFIED → C1]** | Clean-site rehearsal |
| NFR-9 Scope freeze | Manifest scopes and modules frozen before production sharing (a scope change forces a major version and re-consent) **[VERIFIED behaviour]** | Freeze date in roadmap |
| NFR-10 Cost | AI cost per screening ≤ $0.01; daily budget enforced atomically | [VERIFIED] ~$0.002 (Haiku 5.5) |
| NFR-11 Honest UX copy | Never "compliant", "legal advice" or "guaranteed". AI-derived items labelled as such. | Copy review |
| NFR-12 Durability window | Works through judging (until 3 Feb 2027): model ID configurable; Preview APIs fail soft | Monitor the changelog weekly |

## 4. Constraints and assumptions
- One developer, about 29 calendar days to 22 Dec 2026, 12:00 PT ([IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)).
- Forge platform only. Multiple-app compatibility (Jira required, Confluence optional) is **Preview** **[VERIFIED working on the dev site]**.
- Workflow validator module is Preview **[VERIFIED working]**. The gate needs an admin to add it to a workflow (a manual step, documented and health-checked).
- Teamwork Graph needs org-admin installation and runs as the user only **[VERIFIED]**. Team lookup fails (403) and is **not used**.
- Synthetic data only, in development and in demos.
