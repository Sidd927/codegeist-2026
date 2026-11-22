# 08 — Product Workflows: Article25

**Prepared:** 2026-11-22 · Design specification (not implemented)

## Personas
| Persona | Role | Goal | Pain today |
|---|---|---|---|
| **Priya** | Product manager, Checkout Squad | Ship features without surprise blockers | Doesn't know which changes need privacy review; finds out late |
| **Diego** | DPO / privacy counsel (part-time, 1 of 2 privacy staff) | Review what matters, keep records true, sign attestations confidently | Can't read every ticket; reviews arrive late and incomplete; ROPA drifts |
| **Sam** | Backend engineer using a coding agent | Add SDKs and data flows without breaking policy | Doesn't know what's approved; policy lives in a PDF |
| **Avery** | Jira/Confluence site admin | Install and configure safely | Wary of apps that need heavy setup or exfiltrate data |

---

## W1. Install and first-run onboarding (Avery) — P0
1. Avery installs via the Sharing link (org admin, because of TWG scopes) and approves scopes (including the `llm` module).
2. Opens **Article25 → Settings** (admin page). An onboarding checklist appears:
   - a. Choose projects and issue types to screen (default: Epic, Story, Feature in selected projects).
   - b. Map projects → systems (or create systems).
   - c. Choose the DPO group (default: site admins until set).
   - d. Choose the Confluence space for the register (optional).
   - e. AI analysis: **On** (Forge LLM) / **Rule-based only**. Daily cap.
   - f. **Optional gate:** "Add validator to workflow" with copyable instructions and a health check showing whether it is detected on the chosen workflow.
3. **"Load sample privacy program"** creates the register (6 systems, 14 activities, 9 vendors), publishes ROPA v1 to the chosen space, creates 5 sample epics in a chosen project (2 benign, 3 with privacy impact) and a PRIV review project if absent (or uses an existing project).
4. Health panel turns green: triggers active, LLM reachable, Confluence writable, TWG reachable (optional), validator detected (optional).
**Acceptance:** a judge goes from install to first screening in **≤10 minutes** without the gate, ≤15 with it.

## W2. Automatic screening on create/update (system → Priya) — P0
1. Priya creates or edits epic CHK-142.
2. Trigger → in scope? → content hash changed? → enqueue.
3. Panel shows **"Screening… (~20 s)"** with a skeleton.
4. Consumer runs context → pre-pass → LLM → validation → rules → persist → issue property.
5. Panel updates:
   - **Outcome chip:** `CLEAR` (green) · `INVENTORY UPDATE` (blue) · `NEEDS INFO` (yellow) · `REVIEW REQUIRED` (orange) · `DPIA LIKELY` (red).
   - **Why:** criteria met with quotes; register diff (new vendor, new category for system).
   - **Next:** answer questions / review requested (PRIV-37) / conditions to complete.
6. For `CLEAR`, nothing else happens (silent by default; optional comment setting).
**Edge cases:** very short tickets → `NEEDS INFO` with questions. Bulk edits → deduped. Non-English text → LLM handles major languages; quotes are still verified (best effort, flagged as such).

## W3. PM clarification loop — P1
1. Panel shows ≤3 questions (e.g. "Will recordings include form inputs?" Yes / No / Unsure + note).
2. Answers are saved to the screening and appended as `<PM_ANSWERS>` for re-screening.
3. The outcome may drop (e.g. inputs masked → criterion 4 no longer met) or rise.
**Audit:** answers recorded with author and time.

## W4. False-positive feedback — P0
1. Priya clicks **"Not applicable"** on a finding and gives a reason (dropdown + text).
2. The finding is greyed out. The outcome is recomputed with that finding excluded **only if** it isn't a special-category or children finding (those require DPO dismissal).
3. Feedback feeds the eval dataset (export in Reports).

## W5. Review routing and DPO decision (Diego) — P0
1. Outcome ≥ `REVIEW REQUIRED` creates review **PRIV-37** (idempotent), assigned to the DPO group, linked "is privacy review for" CHK-142.
2. Diego opens **DPO Console → Queue** (sorted by outcome severity, then age; SLA badge at 3/5 business days).
3. **Review workspace:**
   - Evidence panel (quotes with source links; dropped-evidence count shown for transparency).
   - Register diff (proposed changes, editable).
   - Rule trace (which rules fired, rules version).
   - Context (P1, TWG): requester's team, the epic's goal, suggested reviewers (contributors to related past DPIA pages).
4. Decision:
   - **Cleared:** register delta applied; gate released.
   - **Cleared with conditions:** conditions become subtasks on CHK-142 (and optionally appended to acceptance criteria); gate released when the subtasks close (P1) or immediately (P0 setting).
   - **DPIA required:** creates a DPIA draft page in Confluence prefilled with validated findings (P1); gate stays blocked until the DPIA review is cleared.
   - **Rejected:** gate blocked; reason posted to the epic.
5. Every decision writes an AuditEvent and RegisterChange (if any).

## W6. Workflow gate — P0 (Preview module; fallback)
1. Priya tries **"Ready for Dev"** on CHK-142.
2. Validator (expression on issue property) evaluates: allowed if outcome ∈ {CLEAR, INVENTORY_UPDATE-confirmed, CLEARED, CLEARED_WITH_CONDITIONS}.
3. Blocked message: *"Privacy review PRIV-37 must be cleared before Ready for Dev (Article25: DPIA likely, 2 high-risk criteria). Open the Privacy check panel for details."*
4. **Fallback (team-managed projects or validator not configured):** soft gate, meaning the panel shows a red "Not cleared" banner and an optional comment on transition (via trigger) records that work moved before clearance (audit), notifying the DPO.

## W7. Register update and Confluence publish — P0
1. On approval, the RegisterChange diff is applied (new vendor row, new category on the activity).
2. **Publish** (auto on change, or manual): the Confluence ROPA page is regenerated (tables per system; "Recently changed" section with links to reviews). The page version increments. The page footer notes "Generated by Article25 — source of truth: Article25 register (vNN)".
3. If manual edits are detected on the page since the last publish (version mismatch), the app warns and offers a "diff and import" path (P2) instead of overwriting silently.

## W8. Rovo conversations — P0 (agent) / P1 (skill)
- **Priya:** "Do I need anything before using ReplayCloud?" → `explain-requirements` → "ReplayCloud isn't in the vendor register. Using it for Checkout would add a new processor and likely new data categories. Request a review; typical conditions: …" (cites register state).
- **Diego:** "Which epics this quarter added new processors?" → `search-register`/screening query → list with links.
- **Diego:** "Create a review for CHK-150" → `create-privacy-review` (CREATE requires confirmation).
- **Boundary:** the agent refuses to give legal conclusions beyond reporting screening outcomes and register facts.

## W9. Coding agent via MCP (Sam) — P1
1. Avery enables external MCP access for Article25 in Atlassian Administration → Connected apps (Verified mechanism).
2. Sam's coding agent connects to `https://mcp.atlassian.com/forge/<appId>` (OAuth 2.1, Sam's permissions).
3. The agent calls `explain-requirements(vendor="ReplayCloud", system="Checkout")` before adding the SDK → "Pending DPIA PRIV-37: not cleared." The agent stops and tells Sam.
4. The open-source `skill.md` teaches third-party agents when to call these tools (e.g. "before adding analytics/telemetry/third-party SDKs").

## W10. Confluence PRD screening — P1
1. A page with label `prd` (configurable) is created or updated in a configured space → screened the same way.
2. Byline badge "Privacy: Review required" opens a panel. A linked epic inherits the PRD findings in its context.

## W11. Reporting and CCPA attestation summary — P1 (core metrics P0)
- **Coverage:** in-scope items created vs. screened (target 100%).
- **Outcomes by period; median time-to-decision; open reviews past SLA.**
- **Register changes:** new vendors and categories.
- **CCPA summary (P1):** count of risk assessments conducted/updated in the period and the categories of personal information involved, matching the submission elements described by counsel summaries of the regulation. Export to CSV / Confluence. Labelled "supporting data, not a legal filing".

## W12. Error and degraded modes — P0
| Situation | User sees |
|---|---|
| LLM disabled/unavailable | "AI analysis unavailable: rule-based findings shown." Outcome computed from lexicon + vendor diff; minimum `NEEDS INFO` if any personal-data hint |
| Screening still running | Skeleton + "usually ~20 s" + refresh |
| User lacks console permission | "Ask your DPO or admin to add you to the privacy reviewers group" |
| TWG unavailable | Reviewer suggestions hidden: "People context unavailable" |
| Daily cap reached | "Daily AI screening limit reached: rule-based screening until tomorrow" (admin can raise it) |
| Publish conflict | "Confluence page was edited manually since last publish. Review before overwriting." |

## W13. Settings — P0
Scope (projects, issue types, PRD labels/spaces) · project→system mapping · DPO group · gate statuses · AI on/off, model, daily cap · jurisdictions (GDPR, CCPA on by default; others P2) · comment on outcome (off/on) · retention period · sample data load/remove.
