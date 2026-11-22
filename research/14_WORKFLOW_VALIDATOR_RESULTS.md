# 14 — Spike C: Jira Workflow Validator Results (most critical spike)

**Date:** 2026-11-22 · **Site:** one-atlas-psvy.atlassian.net · **Data:** synthetic only
**Module:** `jira:workflowValidator` (**Preview**, [docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/))
**Code:** `spikes/article25-core-spike/` (`manifest.yml`, `src/validator.js`, `src/review.js`)

## Verdict
**VERIFIED.** A Jira issue whose privacy review is unresolved **cannot** transition into the gated status, in both **team-managed and company-managed** projects. Once an **authorised reviewer** records `APPROVED` or `APPROVED_WITH_CONDITIONS`, the transition **succeeds**. The gate must be a **lambda validator reading app-only Forge storage**. The expression validator reading an issue entity property was **bypassed by an ordinary editor in a live test** and must not be used.

---

## 1. What was built

### 1.1 Manifest (abridged; full file in the spike)
```yaml
jira:workflowValidator:
  - key: a25-validator-expression        # C1 — tested and REJECTED
    name: Article25 gate (expression / issue property)
    expression: "issue.properties['article25-review'] != null && ['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(issue.properties['article25-review'].state)"
    errorMessage: "Article25 (C1 expression): privacy review not approved for this work item."
    projectTypes: [company-managed, team-managed]
  - key: a25-validator-lambda            # C2 — RECOMMENDED
    name: Article25 gate (lambda / KVS)
    function: validator
    projectTypes: [company-managed, team-managed]
function:
  - key: validator
    handler: validator.run
permissions:
  scopes: [read:jira-work, write:jira-work, read:jira-user, storage:app, ...]
```

### 1.2 Validator (C2) logic: `src/validator.js`
1. Read `payload.issue.key` (the documented payload: `{ issue: {key}, configuration, transition: {from,to,modifiedFields} }`).
2. Test hook: `spike:simulate` KVS flag can force a throw.
3. `kvs.get('review:<issueKey>')` → none → `{result:false, errorMessage:"no privacy review recorded…"}`.
4. State ∈ {APPROVED, APPROVED_WITH_CONDITIONS} → `{result:true}`. Otherwise `{result:false, errorMessage:"…state is <STATE>…"}`.
5. Any exception → **fail closed**: `{result:false, errorMessage:"review state could not be verified (temporary error)…"}`.
6. Structured log `{spike:"C2", issueKey, from, to, state, kvsMs}`.

### 1.3 Review-state storage: `src/review.js`
- **Authoritative:** Forge KVS key `review:<issueKey>` → `{state, conditions, decidedBy, decidedAt, decisionId, version, history[≤50]}`. Only the app can write it.
- **Authorisation:** `APPROVED`, `APPROVED_WITH_CONDITIONS` and `REJECTED` require membership of Jira group `article25-reviewers`, checked server-side with the app's identity (`GET /rest/api/3/user/groups?accountId=<context.accountId>`). The accountId comes from Forge context, never from UI input.
- **Mirror:** issue property `article25-review` = `{state, version, decidedAt}` for display/JQL. **Never trusted for enforcement.**

### 1.4 Configuration steps actually performed
- **Team-managed (AS):** Space settings → Work types → Task → Edit workflow → transition "Any status → In Progress" → Rules → *Validate details* → *Add validate details rule* → Marketplace rules: **article25-core-spike** → "Article25 gate (lambda / KVS)" → "This rule requires no configuration" → Add → **Update workflow** → apply to all work types (Epic, Subtask, Task, Story, Feature, Bug) → "Workflow updated".
- **Company-managed (A25C):** Project settings → Workflows → Edit workflow (new editor) → "Any status → In Progress" → *Validate details* → same rule → Update workflow. Gated transition in practice: **Selected for Development → In Progress** (the brief's "Ready for Development → In Progress").
- Both validators appeared under "Marketplace rules" in **both** editors, so `projectTypes` works as documented.

## 2. Test cases and actual outcomes
Transitions were attempted via `POST /rest/api/3/issue/{key}/transitions` as the signed-in user (exact error text captured). One case was repeated through the Jira UI (status dropdown) to capture the user-visible message.

| # | Project type | Issue | App state (KVS) | Issue property | Validator | Expected | **Actual** |
|---|---|---|---|---|---|---|---|
| T1 | team-managed | AS-2 | REVIEW_REQUIRED | **forged APPROVED** (by user) | C2 | block | **400** "Article25: privacy review state is REVIEW_REQUIRED. An authorised reviewer must approve before this transition." Status stayed To Do |
| T2 | team-managed | AS-1 | *(none)* | none | C2 | block | **400** "Article25: no privacy review recorded for AS-1. Request a review before starting development." |
| T3 | — | AS-2 | non-reviewer tries APPROVED | — | — | refuse | Resolver: `{"ok":false,"error":"User is not in group 'article25-reviewers'"}` |
| T4 | team-managed | AS-2 | **APPROVED** by reviewer (v2) | mirror APPROVED | C2 | allow | **204**, status → **In Progress** |
| T5 | team-managed | AS-2 | APPROVED, **simulated validator exception** | — | C2 | block (fail closed) | **400** "Article25: review state could not be verified (temporary error)…" |
| T6 | team-managed | AS-2 | **REJECTED** (v3) | mirror REJECTED | C2 | block | **400** "…state is REJECTED…" |
| T7 | team-managed | AS-2 | **APPROVED_WITH_CONDITIONS** (v4, 2 conditions) | mirror | C2 | allow | **204**, → In Progress |
| T8 | team-managed (UI) | AS-1 | *(none)* | none | C2 | block, user sees reason | Jira flag **"Transition failed — Article25: no privacy review recorded for AS-1. Request a review before starting development."** Status stayed To Do (screenshot taken) |
| T9 | team-managed | AS-1 | *(none)* | none | **C1** | block | **400** "Article25 (C1 expression): privacy review not approved for this work item." |
| **T10** | team-managed | AS-1 | *(none, no decision at all)* | **forged `{state:"APPROVED"}` by an ordinary editor via REST (201)** | **C1** | should block | **204 → In Progress. BYPASSED.** |
| T11 | company-managed | A25C-1 | *(none)* | none | C2 | block | **400** "…no privacy review recorded for A25C-1…", stayed in Selected for Development |
| T12 | company-managed | A25C-1 | APPROVED by reviewer | mirror | C2 | allow | **204** → In Progress |
| T13 | both | AS-1, A25C-1 (A25C-1 previously approved) | — | — | C2, **app uninstalled** | ? | **400** "The transition failed because we couldn't find validator \"a25-validator-lambda\". Check if the app that provided it is still installed…". **Fails closed (platform)**, blocking even approved work |
| T14 | both | AS-1, A25C-1 | storage **empty after reinstall** | — | C2 (rule kept, app reinstalled in multi-app mode) | block | **400** "no privacy review recorded" for both. Rule re-bound automatically; **prior approval lost** |

**Lambda ↔ storage evidence** (validator logs):
```
{"spike":"C2","issueKey":"AS-2","from":"10000","to":"3","state":"REVIEW_REQUIRED","kvsMs":632}
{"spike":"C2","issueKey":"AS-1","from":"10000","to":"3","state":null,"kvsMs":330}
```
The lambda **can read Forge KVS** (330–632 ms). End-to-end transition latency as seen by the REST client: **1.1–2.5 s**.

## 3. Answers to the brief's 16 questions
| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Can our app register a validator? | Yes: both appear under "Marketplace rules" | VERIFIED |
| 2 | Installed successfully? | Yes (dev env, demo site) | VERIFIED |
| 3 | Configurable via workflow editor? | Yes, in team-managed and company-managed (new editor). "Requires no configuration." | VERIFIED |
| 4 | Runs on the relevant transition? | Yes (Any → In Progress) | VERIFIED |
| 5 | Lambda executes? | Yes (logs) | VERIFIED |
| 6 | Lambda can access Forge storage? | Yes, KVS read 330–632 ms | VERIFIED |
| 7 | Retrieves the review state? | Yes | VERIFIED |
| 8 | Identifies whether review is required? | Yes in the spike (state in KVS). In the product this comes from screening. | VERIFIED (mechanism) |
| 9 | Determines reviewer approval? | Yes: only reviewer-group members can write APPROVED*; validator reads it | VERIFIED |
| 10 | Returns an error message when missing? | Yes: custom text shown in the API response and the Jira UI flag | VERIFIED |
| 11 | Permits after approval? | Yes (T4, T7, T12) | VERIFIED |
| 12 | Company-managed? | Yes (T11, T12) | VERIFIED |
| 13 | Team-managed? | Yes with `projectTypes: [team-managed]` (T1–T10). **Corrects research docs 05/07/08**, which said company-managed only. | VERIFIED |
| 14 | App unavailable? | Simulated exception → our catch fails closed (T5). A platform-level timeout/outage of the lambda was **not** tested. | VERIFIED WITH LIMITATIONS |
| 15 | App uninstalled? | Jira blocks the transition: "couldn't find validator" (T13). Fails closed. | VERIFIED |
| 16 | State cannot be retrieved? | Exception path fails closed (T5). Missing state → blocked with "no review recorded" (T2). | VERIFIED |

## 4. Storage approaches compared

| Approach | Tamper resistance | Latency | Reliability | Permissions | Verdict |
|---|---|---|---|---|---|
| **Issue entity property + expression validator (C1)** | **None.** Any user who can edit the issue can `PUT` the property (T10 bypass). | Fastest (no function invocation) | Fails closed if the app is uninstalled (docs) | `write:jira-work` for the app; but users can also write it | **REJECTED for enforcement.** Use only as a display/JQL mirror. |
| **Forge KVS + lambda validator (C2)** | Only the app writes KVS. Writes gated by server-side reviewer check. | +330–632 ms KVS read; 1–2.5 s per transition overall | Fail-closed on error (ours) and on uninstall (platform). **Data lost on uninstall** (T14). | `storage:app`, `read:jira-work` | **RECOMMENDED** |
| Forge SQL + lambda | Same as KVS | Not measured (SELECT timeout 5 s) | Relational audit/history queries | `storage:app` | Use for audit/history and reporting; KVS (or SQL) for the hot gate lookup. Not tested in Stage 1. |
| Workflow rule configuration | N/A: static per workflow, not per issue | — | — | — | Not suitable for per-issue state |
| Custom field / Forge custom field | Editable by users unless locked; adds field-config burden | — | — | — | Not tested; same tamper class as properties |

## 5. Security notes for the gate
1. **Tampering:** demonstrated that properties are user-writable, so the gate trusts only app storage.
2. **Authorisation:** reviewer check is server-side with the app identity. **Gap:** a reviewer can currently approve their **own** work item (no separation of duties). The product should block `decidedBy == reporter/assignee` or require a second reviewer (configurable).
3. **Audit:** each decision has a version and history in KVS. **Gap:** KVS is wiped on uninstall (T14), so decisions must be mirrored to a customer-owned durable record (Confluence register history and/or Jira comment), plus export.
4. **Fail-closed side effects:** uninstalling the app (T13) or losing storage (T14) **blocks all gated transitions**, including approved ones. The product needs an admin "disable gate" setting, a documented uninstall procedure (remove the rule first), and a "restore approvals from register" recovery path.
5. **Bypass by workflow admins:** project admins can remove the rule or add an ungated transition. Inherent to Jira; the product should detect and report gate configuration drift (health check).

## 6. Limitations and open items
- **Preview module:** may change with shorter deprecation windows.
- **Not tested:** lambda timeout under platform load; bulk transitions (board drag of many cards); transitions triggered by Automation rules; JSM projects; the old workflow editor; a validator on the **create** transition (out of scope: the validator gates transitions, not issue creation/edits).
- **Latency:** 1–2.5 s added per gated transition. Acceptable, but users notice.
- **Enforcement point:** "Ready/Selected for Development → In Progress" worked in both project types. Recommend making the gated destination status configurable per project.

## 7. Recommendation
- **Use the C2 pattern:** lambda validator + app-only storage + server-side reviewer authorisation + issue-property mirror for display.
- **Drop** the expression/issue-property gate.
- Add: separation-of-duties check, durable decision mirror, admin kill-switch, gate health check, and a reinstall recovery path.
- **Fallback if the Preview validator breaks:** soft gate (panel banner + post-transition audit comment + reviewer notification). It's weaker (detects instead of prevents), so present it honestly as such.
