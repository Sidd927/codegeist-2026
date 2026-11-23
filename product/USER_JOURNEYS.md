# Article25 — User Journeys

**Stage 2** · 2026-11-22
Personas: [PRODUCT_VISION.md §2](PRODUCT_VISION.md) · Screens: [UX_DESIGN_SPEC.md](UX_DESIGN_SPEC.md) · Requirement IDs: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)

Every journey below uses the same core loop: **Detect → Review → Decide → Enforce → Record**. Journeys J1–J4 are the primary product; J5–J9 cover setup, resilience and accountability.

Demo world (synthetic, created by the sample scenario, FR-A6):
- a fictional retailer, "Northwind Outfitters";
- project **SHOP** (checkout and growth work);
- approved vendors **Stripe** and **Zendesk**;
- approved categories for SHOP: contact, identity, financial.

---

## J1. A risky change is caught, decided with conditions, and released (primary)
**Actors:** Priya (PM), Maya (reviewer) · **Requirements:** FR-S1…S5, FR-R1, R3–R8, FR-G1–G2, FR-L1–L2, FR-P1

| # | Who | Action | System response | Surface |
|---|---|---|---|---|
| 1 | Priya | Creates SHOP-42: "Add session replay to checkout with ReplayCloud to understand drop-off. Segment users who abandon carts containing prescription items." | Trigger → screening job queued; the panel shows **"Screening…"** | Jira issue |
| 2 | — | (≈5–15 s) | Extraction returns signals with quotes, verified against the text. Rules: behavioural (new for SHOP), vendor **ReplayCloud** (not approved), health inference, criteria c1 profiling + c3 monitoring + c4 sensitive → **DPIA likely**. State → **Pending review**. | — |
| 3 | Priya | Looks at the panel | Header: **DPIA likely · Pending privacy review**. Three numbered findings with quotes; "New for SHOP: behavioural data · New vendor: ReplayCloud"; gate line: "Moving to *In Progress* is blocked until a reviewer decides." | Panel |
| 4 | Priya | Tries to move SHOP-42 to In Progress | Jira shows the validator message: *"Article25: privacy review pending for SHOP-42 (DPIA likely). Open the Privacy panel for details."* | Jira transition |
| 5 | Maya | Opens Article25 → **Inbox** | The summary strip shows 1 DPIA-likely and the oldest waiting item. SHOP-42 is at the top with its "what's new" chips. | Desk / Inbox |
| 6 | Maya | Opens SHOP-42 | Review workspace: ticket text with highlights [1][2][3]; findings panel; inventory diff; rule trace ("R-SENS-2: sensitive category + 3 criteria → DPIA_LIKELY"); declared purpose from the linked goal (S, if available). | Desk / Review |
| 7 | Maya | Chooses **Approve with conditions**: "Mask all form inputs in recordings", "Exclude sessions with prescription items", "30-day retention". Optionally ticks "Add ReplayCloud to approved vendors" (S). | Server checks: group ✓, separation of duties ✓, screening and version unchanged ✓ → decision recorded → ledger append → state **Approved with conditions** | Desk / Review |
| 8 | — | (async, ≈2–5 s) | Confluence register updated (row + checkpoint version); issue property receipt written; conditions visible on the panel; optional linked tasks created (S). | Confluence, Jira |
| 9 | Priya | Moves SHOP-42 to In Progress | Allowed. The panel shows "Approved with conditions by Maya · 3 conditions". | Jira |

**Success signal:** Maya decided from evidence without asking a single clarifying question, and Priya was never asked to tag anything.

## J2. Scope creep after approval re-locks the gate (the signature moment)
**Requirements:** FR-S1, FR-G3, FR-R1

| # | Who | Action | System response |
|---|---|---|---|
| 1 | Priya | After approval, edits SHOP-42's description: "…and send abandonment segments to AdReach for retargeting." | An update trigger (description changed) causes a re-screen: new vendor **AdReach**, a sharing purpose, criterion c6. **Material change** compared with the approved signal set. |
| 2 | — | | State → **Stale: changed since approval**. Back in Maya's inbox with a diff: "Added since approval: vendor AdReach (quote), purpose: retargeting (quote)". |
| 3 | Priya | Tries the next transition (e.g. In Review) | Blocked: *"Article25: SHOP-42 changed after privacy approval (new vendor: AdReach). A reviewer must re-confirm."* |
| 4 | Maya | Opens the item | The workspace shows a **before/after** of the approved signals and the new ones. She decides again: Changes requested ("AdReach not approved; remove or raise a vendor assessment"). |

**Non-material edit control case:** fixing a typo produces the same signal set, so the approval stays and the ledger notes "re-confirmed by system (fingerprint updated)". No reviewer work is needed.

## J3. Ordinary work passes untouched
| # | Action | Response |
|---|---|---|
| 1 | Priya creates SHOP-43 "Fix rounding error in order totals" | Screening → no personal-data signals and a bug-fix change type → **Clear** |
| 2 | Panel | A compact header: "No privacy review needed · Screened 4 s ago · AI". Collapsed by default, with no other content. |
| 3 | Transition | Allowed. The validator records "allowed: clear". |

**Why it matters:** this demonstrates precision. Judges must see that the product doesn't flag everything.

## J4. Underspecified work: the requester clarifies
**Requirements:** FR-R2, FR-S9

| # | Action | Response |
|---|---|---|
| 1 | Priya creates "Sync customer list to our new SMS provider" | Signals: contact (known), unnamed third party → open question "Which SMS provider is used?" → **Needs info** |
| 2 | Panel | "Needs information before review", with the question and two options: **Edit the description** (re-screens automatically) or **Send to reviewer anyway** |
| 3 | Priya edits: "…using Twilio" | Re-screen: vendor Twilio (not approved) → **Review required** → Maya's inbox |

## J5. Admin setup (first run)
**Actor:** Sam (Jira admin) · **Requirements:** FR-A1–A8, FR-G5

| # | Step | Detail | Target time |
|---|---|---|---|
| 1 | Install | Sharing link → choose site → Jira (required) → consent → optionally connect Confluence | 2 min **[UNVERIFIED → C1]** |
| 2 | Open Article25 | First run shows the **Get started** checklist (6 steps, progress saved) | — |
| 3 | Reviewers | Choose an existing group, or follow the guided link to create `article25-reviewers`. The group is validated. | 1 min |
| 4 | Scope | Select projects | 30 s |
| 5 | Inventory | Enter vendors and categories, or **Load sample inventory** | 30 s |
| 6 | Register | Choose a Confluence space; the app creates the register page | 30 s |
| 7 | Gate | Copy-ready steps for company- and team-managed workflows. **Live health check** turns green once the validator first evaluates. "Test it" link. | 3–5 min |
| 8 | Try it | **Create sample work items** (confirmation dialog listing the 3 items and the target project) | 1 min |

Total target: **≤ 10 minutes** excluding the workflow edit, ≤ 15 including it.

## J6. Auditor question: "Who approved SHOP-42, and what exactly?"
| # | Action | Response |
|---|---|---|
| 1 | Maya opens Desk → **Decisions** | Ledger list filtered to SHOP-42: two decisions (Approved with conditions, then Changes requested after the material change), each with decider, time, conditions, and the screening it was based on. The header shows "Ledger verified · 2 decisions · head #2". |
| 2 | Opens the Confluence register | The same rows, readable by anyone with page access. Page history shows a signed checkpoint per decision. |
| 3 | Exports (S) | CSV of decisions for the audit file |

## J7. Recovery after reinstall
**Actor:** Recovery admin · **Requirements:** FR-L5 · **Evidence:** doc 22 (verified live)

1. After a reinstall, app storage is empty and every gated transition is blocked ("no privacy review recorded"). The gate fails closed.
2. Settings → Recovery → **Verify backup**. The app checks the chain, signatures, checkpoints and receipts, and lists the approvals it would restore.
3. Any tampering → "Backup invalid: nothing can be restored", with the reasons.
4. If valid and complete → **Confirm restore** (single-use, 10 min). The app re-verifies, restores everything at once, writes states last, and audits the action.

## J8. AI unavailable or over budget
1. Forge LLM errors or the daily budget is reached → screening uses the rule-based extractor (fail-safe variant).
2. The panel and workspace label the result "Rule-based screening (limited recall): AI unavailable". Outcome is never Clear unless explicitly negated.
3. When the budget resets or AI recovers, the admin can **Re-screen** affected items (filter "rule-based" in the Inbox).

## J9. The judge's 10-minute path (from the submission instructions)
1. Install via link (site admin) → open **Article25** from Apps.
2. Get started → Load sample inventory → choose a project → **Create sample work items**.
3. Open the Inbox: within about 30 s, two items need review and one is cleared.
4. Open the DPIA-likely item → see the evidence highlights → **Approve with conditions**.
5. Open the work item: the panel shows the decision. (Optional) Add the gate to a workflow (steps provided) → try a pending item → blocked.
6. Edit the approved item to add "share with AdReach" → it re-appears as **Stale** in the Inbox.
7. Open the Confluence register → see the decisions and checkpoints.
