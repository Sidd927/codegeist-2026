# Article25 — UX Design Specification

**Stage 2** · 2026-11-22 · IA: [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md) · Implementation: [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)

## 1. Experience principles
1. **Evidence first.** Every claim the product makes points to the exact words that caused it. Quotes are the primary UI element, not a detail behind a tooltip.
2. **Show the delta.** Lead with what is *new* compared with what's already approved. Known processing is shown, but quietly.
3. **One decision per screen.** The Review workspace exists to produce one decision. Everything on it either informs that decision or records it.
4. **Calm by default, firm when it matters.** Clear items are near-invisible. Gated items are unambiguous about what is blocked, why, and who can unblock.
5. **Native, then distinctive.** Atlassian Design System tokens, typography and interaction patterns, so it feels like part of Jira. The distinctive layer is the **annotated document**: a legal-review "margin" metaphor (numbered marks in the text, notes in the margin).
6. **Honest machinery.** The AI's role, the rule that fired, the model and the rules version are visible but secondary. Never "compliant", never "approved by AI".

**Design language name:** *Margin*. The work item's text is the page, findings are margin notes, and decisions are signed entries in the record.

## 2. Global patterns
| Pattern | Spec |
|---|---|
| **Evidence mark** | Inline highlight on the quoted span: background `color.background.accent.yellow.subtlest`, a 2px bottom border in the finding's type colour, and a superscript index `[n]` in mono. Hovering or focusing a mark highlights its margin note, and vice versa. Colour is never the only cue: the index number and underline always appear. |
| **Margin note (finding)** | Index badge `[n]` · type icon + label (e.g. "Health data · sensitive") · quote in `font.body.small` italic · "New" lozenge if it appears in the inventory diff · source (Summary/Description) · AI or rule-based glyph. |
| **What's new chips** | Compact tags: `New vendor: ReplayCloud`, `New for SHOP: behavioural data`. Appearance: `color.background.warning` subtle. Clicking scrolls to the margin note. |
| **Outcome header** | Lozenge (state) + one-sentence "why" (≤ 90 chars, generated from the rule trace, e.g. "3 high-risk criteria including health data") + gate effect line. |
| **Rule trace** | Disclosure "How this was decided" → ordered list `R-ID · description · ✓/✗` + `rules v1.2 · model claude-haiku-5-5 · 4.1 s`. Mono for IDs. |
| **Decision record entry** | Ledger line: `#seq` (mono) · decision lozenge · decider avatar + name · relative time · conditions count · hash prefix (mono, 8 chars, copyable). |
| **Gate message** (validator) | `Article25: <state phrase> for <KEY>. <next step>.` Max 2 sentences. No jargon ("DPIA likely" is allowed because it is the domain term). |
| **Confirmation** | Only for consequential or irreversible acts: Reject, Restore, Monitor mode on, Create sample items. Approve is not confirmed (it is the main act; undo = a new decision). |
| **Toasts** | ADS flag, auto-dismiss after 6 s for success; errors persist until dismissed. |
| **Relative time** | "4 min ago", with the absolute timestamp in a tooltip and in the accessible name. |
| **Keyboard** | Inbox: ↑/↓ to move, Enter to open. Workspace: `[` and `]` for previous/next evidence, `A` to approve, `C` for approve with conditions, `R` to request changes. Shortcuts are listed in a "?" popover and never fire inside text inputs. |

## 3. Screen specifications

### 3.1 Privacy panel (Jira issue, `jira:issuePanel`) — FR-P1…P4
**Width context:** 320–720 px (issue view main column), height grows with content (target ≤ 480 px collapsed-state for long findings with "Show all").

```
┌ Privacy ─────────────────────────────────────────── [AI] ┐
│ ● DPIA likely   Pending privacy review                     │
│ 3 high-risk criteria, including health data.               │
│ ⛔ "In Progress" is blocked until a reviewer decides.       │
│                                                            │
│ What's new   [New vendor: ReplayCloud] [New for SHOP: behavioural] │
│                                                            │
│ [1] Health data · sensitive                          New   │
│     "abandon carts containing prescription items"           │
│ [2] Systematic monitoring                                   │
│     "Add session replay to checkout"                        │
│ [3] Vendor: ReplayCloud · not approved               New   │
│     "with ReplayCloud to understand drop-off"               │
│ Show 2 more                                                 │
│                                                            │
│ Questions for the requester (needs-info only)               │
│                                                            │
│ Checked 2 min ago · How this was decided ▸                  │
│ [Open in review desk]  [Re-check]                           │
└────────────────────────────────────────────────────────────┘
```
| State | Content |
|---|---|
| Out of scope | A single line, "Not in Article25 scope", in muted text. Panel collapsed. No actions. |
| Not screened (pre-install items) | "Not checked yet" + **[Check now]**. Gate line: "Gated transitions are blocked until this is checked." |
| Screening | Lozenge "Checking…" + ADS spinner (≤ 30 s expected) + "You can keep working; this updates automatically." The panel polls every 3 s for up to 60 s, then shows "Taking longer than usual · [Refresh]". |
| Check failed | Lozenge "Check failed" + "We couldn't check this work item (3 attempts). Gated transitions stay blocked." + **[Check again]** |
| Clear | A compact single row: ✓ "No review needed" · checked time · AI/rules glyph · "How this was decided ▸". Nothing else. |
| Known processing (INVENTORY_UPDATE) | As Clear, plus "Uses known data: contact, financial" (collapsed). |
| Needs info | Questions as a numbered list + **[Send to reviewer anyway]**. Hint: "Editing the description re-checks automatically." |
| Pending review | As in the mock; reviewers also see **[Open in review desk]**. |
| Decided | Lozenge (Approved / With conditions / Changes requested / Rejected) + decider + time + conditions list (✓ text) + rationale (if any). Findings are collapsed under "What was reviewed". |
| Stale | "Changed since approval" + a "Added since approval" list (new signals with quotes) + the previous decision collapsed. |
| Rule-based mode | An info banner: "Rule-based check (limited recall): AI unavailable." |
| No browse permission | "You don't have permission to view privacy findings for this item." (status lozenge only) |
| Error | ADS section message (error): "Couldn't load privacy status. [Retry]". Gate line: "Gated transitions stay blocked until this is resolved." |

### 3.2 Desk shell (`jira:globalPage`)
- Page header: product name **Article25** + tabs (`Inbox (n)` · `Decisions` · `Settings`) + right side: integrity badge ("Record verified ✓", clickable → Decisions) + monitor-mode banner when active (full-width warning section message above the tabs).
- Max content width 1280 px, centred. Page padding uses `space.300`.

### 3.3 Inbox — FR-R3
```
Article25   Inbox (4)  Decisions  Settings                    Record verified ✓
──────────────────────────────────────────────────────────────────────────────
 Awaiting review 4   DPIA likely 1   Oldest waiting 2 d   Blocked transitions (7 d) 6
 [Pending ▾] [All projects ▾] [Any outcome ▾]                 Search key or text
──────────────────────────────────────────────────────────────────────────────
 ● DPIA likely   SHOP-42  Add session replay to checkout…       Priya · 12 min
                 [New vendor: ReplayCloud] [New for SHOP: behavioural] [+1]
 ● Changed       SHOP-17  Loyalty points for app sign-ups        Leo · 1 h
                 [Added since approval: AdReach]
 ● Review req.   HR-8     Track contractor screen activity       Ana · 2 d
                 [New for HR: employee monitoring]
```
- **Row anatomy:**
  - first line: outcome lozenge · key (mono) · summary (truncated, full in tooltip) · requester avatar + name · age;
  - second line: up to 3 what's-new chips, plus "+n".
- **Sort:** severity (DPIA likely > Changed since approval > Review required > Needs info sent anyway), then age, oldest first.
- **Views:** Pending (default) · Changed since approval · Needs info · Rule-based checks · All open.
- **Summary strip:** 4 numbers, each a filter shortcut. No charts.
- **States:**
  - loading: 6 skeleton rows;
  - empty (setup complete): illustration-free ADS empty state, "Nothing waiting for review. New work items in SHOP, HR are checked automatically." + link "Create sample work items" (admins);
  - empty (setup incomplete): link to Get started;
  - error: section message + Retry;
  - permission denied (not a reviewer): About page with "Ask your Jira admin to add you to *article25-reviewers*".

### 3.4 Review workspace — FR-R4…R11
Three zones at ≥ 1024 px:

```
┌ ← Inbox   SHOP-42  Add session replay to checkout   ● DPIA likely  ⟶ Open in Jira ┐
├───────────────────────────────────────┬─────────────────────────┬───────────────┤
│ DOCUMENT (the work item text)          │ MARGIN (findings)        │ DECISION      │
│ Summary                                │ What's new               │ Outcome        │
│ Add session replay[2] to checkout with │  New vendor ReplayCloud  │ DPIA likely    │
│ ReplayCloud[3] to understand drop-off. │  New for SHOP: behav.    │ 3 criteria     │
│ Description                            │ [1] Health · sensitive   │ (c1, c3, c4)   │
│ … users who abandon carts containing   │     "prescription items" │                │
│ prescription items[1] …                │ [2] Monitoring           │ ( ) Approve    │
│                                        │ [3] Vendor ReplayCloud   │ (•) Approve w/ │
│ Declared purpose (Goal)   [S]          │ Questions (0)            │     conditions │
│ "Increase checkout conversion 5%"      │ How this was decided ▸   │  + condition   │
│                                        │                          │ ( ) Changes    │
│ History                                │                          │ ( ) Reject     │
│ #12 Approved · Maya · 3 d  (prev item) │                          │ Rationale      │
│                                        │                          │ [Record decision]│
└───────────────────────────────────────┴─────────────────────────┴───────────────┘
```
- **Document zone:** the summary and description rendered as plain text from ADF (no images or macros). Evidence marks are inline. The text comes from a fresh `asUser` read, so the reviewer sees the *current* text. If the fingerprint differs from the screened one: banner "Text changed since this check. [Re-check now]", and the decision is disabled until re-checked.
- **Margin zone:**
  - findings ordered: new first, then sensitive, then others;
  - each note is linked to its mark;
  - known processing is collapsed under "Already approved for SHOP (2)".
- **Decision zone (sticky):**
  - radio group with 4 options;
  - the conditions editor (add/remove rows, max 10, 200 chars each) appears for "with conditions";
  - message required for Changes requested and Reject;
  - optional rationale (500 chars);
  - S options: "Add ReplayCloud to approved vendors", "Create Jira tasks for conditions".
  - Primary button text matches the choice ("Approve with 3 conditions").
- **Stale variant:** the margin shows a two-column "Approved before | Added since" diff at the top.
- **Disabled-decision reasons:** shown inline above the button, never silently disabled:
  - "You reported this work item (separation of duties)";
  - "Text changed since check";
  - "Monitor mode is on: decisions are still recorded".
- **After submit:**
  - the button shows a spinner, then a success flag "Decision recorded · #13";
  - the zone switches to the read-only decision with a "Publishing to register…" → "Published ✓" status;
  - **[Next in inbox →]**.
- **Conflict (FR-R8):** modal "This item changed while you were reviewing. Reload to see the latest check." [Reload].

### 3.5 Decisions (ledger) — FR-L4, L7
- Header: integrity card, "Record verified · 27 decisions · head #27 (a1b2c3d4) · checked just now · [Verify again]". When verification fails: error section message, "Record integrity problem: <first error>. Contact your admin." (Shown to everyone; this is a security signal.)
- Table (ADS dynamic table):
  - columns: `#` · Work item · Decision · Decider · When · Conditions · Register (✓ published / ⟳ pending / ! failed);
  - filters: project, decider, decision, date range;
  - 50 per page.
- Row expand: conditions, rationale, screening summary (outcome, mode, rules version), hash prefix, prev-hash prefix.
- Actions (S): **Export CSV**.

### 3.6 Get started (admin, first run) — FR-A1
A vertical checklist with 6 steps. Each step has a status (○ to do · ◐ in progress · ✓ done · ! problem), a one-line value statement, inline controls, and a "Why this matters" disclosure.
1. **Reviewers:** group picker + validate. Creating the group is linked to Jira admin (we don't create groups in MVP).
2. **Projects in scope:** multi-select.
3. **What's already approved:** inventory quick editor, or **[Load sample inventory]**.
4. **Decision register:** Confluence space picker → **[Create register page]**. If Confluence isn't connected, the step shows "Optional: connect Confluence to keep a customer-owned record" with instructions.
5. **Turn on the gate:**
   - tabs for "Company-managed" and "Team-managed", each with numbered steps;
   - live status: "Waiting for first gate evaluation…" → "Gate active in SHOP ✓ (seen 1 min ago)";
   - **[Test with a sample item]**.
6. **Try it:** **[Create sample work items in SHOP]**. The confirm dialog lists the 3 summaries.

When all required steps (1, 2, 5 recommended, 4 optional) are done, a completion state appears: "Article25 is checking new work in SHOP." → [Go to Inbox].

### 3.7 Settings — FR-A2…A8, FR-G5–G6, FR-L5
Left sub-navigation (vertical) + content. One save per section (optimistic concurrency, with a conflict message "Settings were changed by Sam 1 min ago. [Reload]").

| Section | Key controls |
|---|---|
| Scope & policy | Projects multi-select · "Require a human decision for" (radio: Review required & DPIA likely / All personal-data outcomes) · "Block while information is missing" toggle |
| People | Reviewer group · Recovery admin group · Separation of duties toggle (warning when turned off) |
| Inventory | Vendors table (name, status Approved, added by/when, source decision) · Categories per project (checkbox matrix of 11 categories) |
| AI | Toggle · Model select (from `list()`; shows retirement date if provided) · Daily budget (number of checks) · "Today: 37 of 500 checks · 2 rule-based" |
| Register | Space/page · last publish · backlog count · **[Republish now]** · Integrity status |
| Gate | Per-project health table: project · last evaluation · allowed/blocked counts (7 d) · status · setup steps · **Monitor mode** toggle (confirm dialog: "Transitions will be allowed and logged as 'would have blocked'.") |
| Gate (**M4, implemented**) | **Per-workflow verified coverage** instead of per-project: workflow · project type · Complete/Gaps · protected statuses · gated transitions · transitions into a protected status **without** the gate. Also: mode banner (monitoring = dashed information, "NOT blocked"; enforcing = solid danger), overall status, confirmed switch with a reason, dependency checks, recent checks, change history. In the workspace: a **Protected transitions** block (verdict, reason, recent checks); in the panel: a one-line gate state. |
| Recovery | Visible to recovery admins. Two-step flow exactly as verified (doc 22): Verify → report (valid / complete / anchors / approvals to restore / untrusted claims) → Confirm (expires in 10 min) |
| Audit | Read-only list: time · actor · action · result |

### 3.8 About (non-reviewers, non-admins)
What Article25 does (3 lines), your role ("You'll see a Privacy panel on work items in scope"), who your reviewers are (group name), and a privacy notice link.

## 4. State matrix (every data surface)
| Surface | Loading | Empty | Error | Success feedback | Permission-denied |
|---|---|---|---|---|---|
| Panel | skeleton (3 lines) | Out of scope / Not checked | section message + Retry (gate stays blocked) | lozenge change + live update | status only, "no permission to view findings" |
| Inbox | 6 skeleton rows | "Nothing waiting" (+ sample CTA for admins) | section message + Retry | — | About page + how to get access |
| Review | 3-zone skeleton | n/a (404 → "Not found or not in scope") | inline + Retry; conflict modal | flag "Decision recorded #n" + register status | "Only reviewers can decide" (read-only view) |
| Decisions | table skeleton | "No decisions yet" | section message | — | readable by reviewers/admins only |
| Get started | step skeleton | — | per-step error with fix hint | step ✓ animation (reduced-motion aware) | non-admins redirected to About |
| Settings | section skeleton | per-table empty rows with add CTA | inline field errors + section error | flag "Saved" | non-admins: "Settings are available to Jira admins" |
| Recovery | progress steps | "No backup found on the register page" | report with reasons | flag "Restored n decisions" | "Recovery requires membership of <group>" |

## 5. Responsive behaviour
| Width | Panel | Desk |
|---|---|---|
| < 480 px | Single column; findings show quote only (type in label above); actions stacked full-width | — (Jira global pages are rarely this narrow; desk falls back to single column) |
| 480–1023 px | Default panel layout | Review: **2 zones**. Document and Margin as tabs ("Text" / "Findings (5)"), Decision as a sticky bottom sheet (collapsible). Inbox: second line of chips hidden after 2. |
| ≥ 1024 px | — | Review: 3 zones (Document 45%, Margin 30%, Decision 25%, min 280 px). Inbox: full rows. |
| ≥ 1440 px | — | Content capped at 1280 px; extra space as margins |

## 6. Accessibility (WCAG 2.2 AA)
- **Contrast:** use only ADS semantic tokens (contrast-checked by Atlassian in light and dark). Custom aliases map to ADS tokens, never raw hex.
- **Evidence marks:**
  - each is a `<mark>` with `aria-describedby` pointing to its margin note;
  - index numbers are part of the accessible text ("evidence 1 of 3");
  - not colour-only (index + underline).
- **Keyboard:**
  - all actions reachable;
  - visible focus (`color.border.focused`, 2px);
  - shortcut keys optional, documented, disabled in text fields, and remappable later.
- **Focus management:**
  - after recording a decision, focus moves to the success summary;
  - after a modal closes, focus returns to the trigger;
  - route changes move focus to the page `<h1>`.
- **Live regions:**
  - panel status changes ("Checking…" → "DPIA likely") announced politely;
  - errors announced assertively.
- **Forms:**
  - every input labelled;
  - errors linked via `aria-describedby`;
  - conditions list items numbered with remove buttons named "Remove condition 2".
- **Motion:** respects `prefers-reduced-motion`. No essential animation.
- **Language:** plain English, ≤ grade 9 for requester-facing copy. The domain terms "DPIA" and "data category" are kept, with tooltips.
- **Target size:** ≥ 24×24 CSS px for all interactive elements (2.5.8).

## 7. Content style
- Requester-facing copy says what happens and what to do: "A reviewer needs to look at this before development starts." Not "Non-compliant".
- AI attribution: "Found by AI · quote verified". Rule-based: "Found by rules".
- Never "compliant", "approved by AI", "legal advice", "guaranteed".
- The gate message is the shortest copy in the product; draft every variant in the copy deck during implementation (states in [DATA_AND_SECURITY_MODEL.md §2](DATA_AND_SECURITY_MODEL.md)).
