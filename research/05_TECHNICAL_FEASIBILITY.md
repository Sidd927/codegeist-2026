# 05 — Technical Feasibility Report (Top 5)

**Prepared:** 2026-11-22
**Labels:** **Verified** (official doc read) · **Supported** (credible practitioner report) · **Unverified** (assumption to test in a Week 1 spike) · **Not feasible**
Nothing here has been built, deployed or tested yet. All statements describe planned designs.

---

## 0. Platform facts every design relies on

| Fact | Status | Source |
|---|---|---|
| Async event consumers / scheduled triggers can run up to **900 s** (`timeoutSeconds`). Sync resolvers, actions and web triggers: **55 s**. | Verified | [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) |
| Front-end request payload 500 KB; invocation payload 5 MB; memory default 512 MB, max 1 GB | Verified | same |
| Jira events: issue created/updated/deleted/assigned/commented, issuelink, attachment. `filter.expression`, `ignoreSelf: true`. | Verified | [Product events](https://developer.atlassian.com/platform/forge/events-reference/product_events/) |
| Confluence events: `avi:confluence:created:page`, `avi:confluence:updated:page`, label events (scope `read:confluence-content.summary`) | Verified | [Confluence events](https://developer.atlassian.com/platform/forge/events-reference/confluence/) |
| Forge SQL: 1 GiB per prod install, SELECT timeout 5 s, no FKs, 150 DML/s | Verified | [SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/) |
| Forge LLM: tool calling; `llm` module required; **no free tier** (billed to developer); `claude-sonnet-5` active until at least 30 Jun 2027 | Verified | [LLM API](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/), [models](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/), [pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/) |
| Forge LLMs "not turned on by default" in the CLI. **Exact enablement and billing setup steps for our account: Unverified.** | Unverified | [Devpost note](https://codegeist2026.devpost.com/) |
| Rovo agent: `actions`, `skills`, `prompt`, `conversationStarters`. Automation-triggered agents can't run CREATE/UPDATE/DELETE/TRIGGER actions. | Verified | [rovo:agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/), [action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/) |
| Rovo practical limits: ~20 s and ~1.1 MB before failures | Supported | [practitioner](https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc) |
| `rovo:mcp`: tools = action keys (≤50); external access off by default (admin enables per install); OAuth 2.1; user permissions | Verified | [rovo:mcp](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) |
| `rovo:skill`: SKILL.md + `references/`; tool dependencies must be same-app actions; Preview | Verified | [rovo:skill](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/) |
| TWG API: Preview; curated queries (≤25/page, Relay pagination); persisted Cypher; per-object scopes; **asUser only**; org-admin install; mandatory operation names (`company_operation`); missing scopes can return **empty success** | Verified + Supported | [Changelog](https://developer.atlassian.com/platform/forge/changelog/), [TWG limitations](https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/), [practitioner](https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc) |
| `requestTeamworkGraph` from `@forge/bridge` (frontend, as user): Preview since 11 Nov 2026 | Verified | [Changelog](https://developer.atlassian.com/platform/forge/changelog/) |
| `jira:workflowValidator`: **Preview**; company-managed projects; `expression` **or** `function` | Verified | [Module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/) |
| Confluence ADF has structured nodes (e.g. tables, `decisionItem`) usable for deterministic parsing | Verified | [ADF nodes](https://developer.atlassian.com/platform/framework/adf-builder/reference/nodes/) |
| Jira REST cannot backdate `created` / `resolutiondate` / changelog | Supported (well-known platform behaviour; no official page cited) | — |

---

## 1. C7 Article25: privacy-by-design screening (detailed)

### 1.1 Architecture overview
```
Jira issue created/updated ─┐                       ┌─► Issue panel (UI Kit): findings, evidence, questions, status
Confluence PRD published ───┼─► Trigger fn ─► Queue ─► Screening consumer (≤120 s):
Manual "Screen now" ────────┘   (debounce,          1) context assembly (issue, parent, linked pages, project→system map)
                                content hash)       2) deterministic pre-pass (lexicon, vendor dictionary)
                                                    3) Forge LLM structured extraction (+ verbatim evidence)
                                                    4) evidence validation (quote must exist in source)
                                                    5) rules engine: inventory diff + WP248 + CCPA §7150 triggers
                                                    6) persist (SQL), set issue property, audit event, route review
DPO console (Custom UI global page) ◄──► resolvers ◄──► Forge SQL (register, screenings, reviews, audit)
Workflow validator (expression on issue property) ─ blocks gated transitions until cleared
Rovo agent "Privacy Partner" + rovo:skill + actions ─► same services
rovo:mcp ─► exposes read-only actions to coding agents (Claude Code, Cursor…)
TWG (frontend, as user) ─► suggested reviewers / owning team / goal context
Confluence REST ─► publish versioned ROPA page; create DPIA draft page from template
```

### 1.2 Integration matrix

| Need | Mechanism | Scope(s) | Status |
|---|---|---|---|
| React to new/changed work | `trigger` on `avi:jira:created:issue`, `avi:jira:updated:issue` (`ignoreSelf: true`) | `read:jira-work` | Verified |
| Long-running screening | `@forge/events` Queue + `consumer` with `timeoutSeconds: 120` | — | Verified (limits) |
| Read issue, parent, links, remote links | Jira REST v3 `GET /issue/{key}?expand=renderedFields,changelog`, `/remotelink` | `read:jira-work` | Verified (standard API) |
| Store status for gating and fast reads | Issue entity property `article25` via `PUT /issue/{key}/properties/article25` | `write:jira-work` | Verified (standard API) |
| Gate transitions | `jira:workflowValidator` **expression** reading the issue property | (validator module) | **Preview.** Jira-expression access to issue properties: **Unverified, spike Day 2**. Fallback: function validator reading SQL. |
| Comment / create review task / link | Jira REST `POST /issue`, `/issue/{key}/comment`, `/issueLink` | `write:jira-work` | Verified |
| Issue panel | `jira:issuePanel` (UI Kit) | — | Verified |
| DPO console | `jira:globalPage` (Custom UI, React + TS) | — | Verified |
| Admin settings | `jira:adminPage` | — | Verified |
| Read PRDs / ROPA page | Confluence REST v2 `GET /pages/{id}?body-format=atlas_doc_format`; CQL search v1 | `read:confluence-content.all`, `search:confluence` (granular equivalents may be required) | Verified (APIs). Exact granular scope names: verify with `forge lint`. |
| Publish ROPA / DPIA draft | Confluence REST v2 `POST/PUT /pages` | `write:confluence-content` | Verified |
| PRD events (P1) | `avi:confluence:created:page` / `updated:page` | `read:confluence-content.summary` | Verified |
| AI extraction | `@forge/llm` `chat()` with `tools` (JSON schema) | `llm` module | Verified API; **account enablement Unverified** |
| Persistent data | Forge SQL (+ KVS for settings/cache) | `storage:app` | Verified |
| Rovo agent + skill + actions | `rovo:agent`, `action`, `rovo:skill` | per-action scopes | Verified (skill = Preview) |
| MCP tools | `rovo:mcp` listing read-only actions | — | Preview |
| People/team/goal context | `requestTeamworkGraph` (frontend) with curated queries, e.g. `atlassianUserInTeams`, `jiraWorkItemGoals`, `confluencePageContributors` | `read:graph:user:atlassian`, `read:graph:team:atlassian`, `read:graph:goal:atlassian`, `read:graph:issue:jira`, `read:graph:page:confluence` (exact names **Unverified**) | Preview |
| JSM review intake (P2) | `POST /rest/servicedeskapi/request` | `write:servicedesk-request` | Verified API; optional |

**Bitbucket:** not required. **JSM:** optional (P2). **TWG:** useful for routing and context (not the core). **Rovo:** primary conversational surface and bonus eligibility. **MCP:** strong differentiator for engineers using coding agents.

### 1.3 AI architecture: what is AI vs. deterministic

| Concern | Approach | Why |
|---|---|---|
| Is personal data involved? Which categories, subjects, purposes, vendors, transfers? | **LLM extraction** into a fixed JSON schema, each item with `evidence_quote` and `confidence`; deterministic lexicon pre-pass as a hint and fallback | Natural language is ambiguous. A lexicon alone misses "we'll store their voice notes". |
| Hallucination control | Drop any extracted item whose `evidence_quote` is not found (normalised, fuzzy ≥0.9) in the assembled source text. Cap list sizes. Reject unknown taxonomy values. | Every finding the user sees is traceable to source text. |
| Is the vendor already approved? Is the category new for this system? | **Deterministic** diff against the register (vendor table, processing activities per system) | Must be exact and auditable. |
| Does this need a DPIA / CCPA risk assessment? | **Deterministic, versioned rules**: WP248 criteria count (≥2 → "DPIA likely"; 1 + special category → escalate); CCPA §7150-style significant-risk triggers (sensitive PI, selling/sharing, ADMT for significant decisions…); special categories and children always escalate | Legal thresholds must not be decided by an LLM. Rules are inspectable and testable. |
| Explaining the outcome | Template-based reasons ("Criterion 4: sensitive data — evidence: '…'"). Optional LLM summary clearly labelled. | Clarity without new claims. |
| Drafting a DPIA / ROPA entry | LLM drafts **sections** from validated findings plus template; the DPO edits and approves | Saves time; human remains the author of record. |
| Conversational help | Rovo agent calls our actions (reads stored, validated results) | Keeps answers grounded and fast (<20 s). |

**Is an agent justified?** Yes, for two bounded jobs: (1) PM and DPO Q&A over validated screening and register data; (2) DPO-initiated drafting and creation of review tasks (CREATE actions need explicit confirmation in chat). The **pipeline itself is not an autonomous agent.** It is a deterministic workflow with one AI extraction step. That is a deliberate reliability choice.

**Is RAG needed?** Minimal. Context is assembled deterministically from known links (issue → parent → linked pages → mapped system → register rows), not by vector search. Forge has no native vector store, and none is needed.

**Is a knowledge graph needed?** The register is a small relational model (systems, activities, categories, vendors). TWG supplies people, teams and goals. Building our own graph would be decoration.

**When information is incomplete:** the outcome is **"Needs info"**. The panel asks up to 3 generated clarifying questions (e.g. "Will phone numbers be shared with the SMS vendor?"), and the PM's answers are appended to the context for re-screening.
**When AI is wrong:** users mark findings "not applicable" with a reason (stored, audited, used to tune the lexicon and eval set). The DPO can override any outcome. Every override is logged.

### 1.4 Data flow (screening)
1. Event → trigger function checks the settings scope (project and issue types in scope) and computes a content hash of summary + description + AC. Unchanged → stop.
2. Push job onto the queue (issue key, hash, reason).
3. Consumer assembles context (≤ ~12k tokens): issue fields, parent epic summary/description, up to 3 linked Confluence pages (truncated, headings preserved), project→system mapping, that system's current register rows, and the vendor list.
4. Pre-pass: lexicon hits (≈150 terms across GDPR Art. 4/9 categories), vendor dictionary hits (register + curated list of common processors).
5. LLM call (Sonnet-tier) with a tool schema `report_privacy_signals`. Retry once on schema failure.
6. Validate evidence. Normalise to taxonomy.
7. Rules → outcome ∈ {`CLEAR`, `INVENTORY_UPDATE`, `NEEDS_INFO`, `REVIEW_REQUIRED`, `DPIA_LIKELY`} plus reasons.
8. Persist screening + findings (SQL). Set issue property `{status, outcome, screeningId, rulesVersion}`. Write audit event.
9. If ≥ `REVIEW_REQUIRED`: create or update the review task in the privacy project (idempotent by screeningId), assign the DPO group, link to the source issue.
10. Panel and console read from SQL via resolvers.

### 1.5 Permissions and security
- **App-level:** least privilege. Read-only Confluence except publishing to a configured "Privacy" space.
- **User-level:** the panel shows findings only to users who can see the issue (Forge UI context). DPO console restricted to a configured group, checked server-side in every resolver via `accountId` and group membership. Rovo/MCP actions authorise via `context.accountId` (never LLM inputs) and filter to issues the user can browse (`asUser()` Jira calls for user-facing reads).
- **Data:** stays on Atlassian (Forge SQL, Forge LLM), so the app stays eligible for **Runs on Atlassian**. No external egress.
- **Audit:** append-only `audit_event` rows (who, what, when, before/after) for screenings, overrides, decisions and register changes.

### 1.6 External dependencies
None outside Atlassian. Forge LLM (Atlassian-hosted Claude on Bedrock) carries a cost dependency.

### 1.7 Cost model (estimate)
Per screening ≈ 6k input + 0.8k output tokens. At Sonnet-tier example rates ($3 / $15 per 1M tokens, per Forge pricing page example for Sonnet 4.5) ≈ **$0.03**. 1,000 screenings (dev + judging) ≈ **$30**. Mitigations: content-hash dedupe, scope filters, per-installation daily cap (default 200), deterministic-only mode toggle.

### 1.8 Technical uncertainties (spike list)
| # | Uncertainty | Spike test | Fallback |
|---|---|---|---|
| U1 | Forge LLM enablement/billing on our account | Deploy a hello-world `llm` call on the dev site | Rovo agent does extraction on demand (manual "Analyse with Rovo"); deterministic mode for automatic screening |
| U2 | Validator expression can read the issue property | Expression `issue.properties['article25']?.status == 'CLEARED'` on a company-managed workflow | Function validator reading the property via REST |
| U3 | TWG curated queries and scopes on the provisioned site | One query: `atlassianUserInTeams` for the current user | Hide the TWG panel; derive reviewers from Jira project roles |
| U4 | `rovo:mcp` external access from Claude Code / Cursor | Enable in admin, connect a client | Demonstrate the tool in Rovo Studio instead |
| U5 | Rovo action latency with SQL reads | Time `get-screening` action | Precompute summaries in KVS |
| U6 | Confluence page publish with ADF tables | Publish a ROPA table page | Storage-format body |
| U7 | Install via Sharing link on a second clean site (org admin) | End-to-end install test | — (must pass) |

### 1.9 MVP scope
**P0:** Jira screening pipeline · issue panel · register (systems, activities, vendors, categories) with seed data · rules engine v1 (WP248 + CCPA + special categories + inventory diff) · DPO console (queue, decision, conditions) · issue-property status + workflow validator · ROPA page publish · audit log · Rovo agent with 4 read actions + 1 create action · sample-data loader.
**P1:** Confluence PRD screening · `rovo:mcp` tools · `rovo:skill` · TWG reviewer and goal context · DPIA draft page · CCPA attestation summary · clarifying-questions loop.
**P2:** JSM intake · jurisdiction packs (DPDP, Australia) · AI Act screening pack · code-scanner import · vendor DPA tracking.

### 1.10 Effort, risk, verdict
- **Effort:** P0 ≈ 110–140 focused hours; P1 ≈ 40–60 hours. Fits 30 days for 1–2 developers working consistently with AI coding tools, *if* P1 is cut on schedule.
- **Technical risk:** **Medium.** Every core dependency is GA except the validator (Preview, with a fallback). Extraction precision is the main quality risk, measured with a labelled eval set (see 09).
- **Feasibility verdict:** **FEASIBLE.**

---

## 2. C8 Living ACR (accessibility conformance)

- **Architecture:** Jira issue triggers → classify accessibility issues to WCAG 2.2 success criteria (LLM + label rules) → deterministic roll-up per release (fix version): Supports / Partially Supports / Does Not Support / Not Applicable / Not Evaluated, with remarks → Confluence ACR page (VPAT 2.5 INT-style sections) → regression alerts when a criterion degrades → Rovo agent for sales Q&A.
- **Modules/APIs:** `trigger` (issue events), `jira:issuePanel`, `jira:globalPage`, Confluence REST publish, Forge SQL, `llm`, `rovo:agent`.
- **AI:** classification and remark drafting. Roll-up deterministic.
- **Uncertainties:** VPAT template licensing (ITI provides the template publicly; reproduce structure, not text, unless permitted, **Unverified**), and EN 301 549 mapping depth.
- **MVP:** WCAG 2.2 A/AA taxonomy (≈55 SC), classifier, roll-up, release ACR page, regression alert, agent.
- **Effort:** ≈ 90–120 h. **Risk:** Low–medium. **Verdict:** **FEASIBLE (lowest technical risk of the five).**

## 3. C6 CAPA Signal

- **Architecture:** Quality issue types (NCR, Complaint, CAPA) with custom fields (part, supplier, lot, failure mode) → indexer → similarity (field match + lexical/LLM) → clusters → recurrence-after-closure detection (new event matching a closed CAPA's failure mode within its effectiveness window) → systemic CAPA proposal → agent.
- **Modules:** triggers, issue panel, global page, SQL, LLM, Rovo.
- **Uncertainties:** custom-field setup on judges' sites (the seeder must create fields: needs `manage:jira-configuration`, which is heavier consent). Part 11 expectations.
- **Effort:** ≈ 110 h. **Risk:** Medium. **Verdict:** Feasible technically. **Rejected on differentiation** (04).

## 4. C5 Outside View

- **Architecture:** Scheduled indexer pulls closed epics (JQL) with child counts, dates and changelog (due-date pushes, status regressions, blocked flags, cross-team links) → features → similarity (summary/description text + components + size) → reference class (k nearest) → empirical distribution of actual durations and slip ratios → causes (changelog patterns + LLM summary of blocking comments) → panel on new epic: P50/P80 dates, top causes, "create mitigation tasks".
- **Hard blocker:** **judges' fresh sites have no history, and REST cannot backdate timestamps.** Options: (a) CSV import with dates (manual judge step, high friction); (b) an in-app synthetic history store (weakens "real Atlassian context"); (c) a demo site login for judges (allowed, but the rules still require installation on their own site).
- **Effort:** ≈ 120 h. **Risk:** **High** for judge-testability. **Verdict:** **FEASIBLE to build, RISKY to judge.**

## 5. C9 Device PSIRT

- **Architecture:** SBOM import (CycloneDX JSON attachment) → component store (SQL) → scheduled vulnerability fetch (OSV.dev API via Forge egress, `permissions.external.fetch.backend`) → match by purl/version → triage case (Jira/JSM) with exploitability context, risk scoring and a regulatory decision checklist → agent.
- **Uncertainties:** egress declaration and rate limits for OSV/NVD; correctness of version-range matching; regulatory content accuracy (FDA 524B, UN R155).
- **Effort:** ≈ 150 h. **Risk:** **High** (external data correctness, domain claims). **Verdict:** **Feasible but over-scoped for 30 days.**

---

## 6. Summary

| Candidate | Core dependencies verified? | Preview deps | Judge-testable | Effort (P0) | Tech risk | Verdict |
|---|---|---|---|---|---|---|
| **C7 Article25** | Yes (LLM enablement to spike) | Validator (has fallback), TWG, rovo:mcp, rovo:skill (all optional) | **Yes** | 110–140 h | Medium | **Feasible** |
| C8 Living ACR | Yes | None essential | Yes | 90–120 h | Low–Med | Feasible |
| C6 CAPA Signal | Yes | None essential | Yes (needs field setup) | ~110 h | Medium | Feasible |
| C5 Outside View | Yes | None | **No / weak** | ~120 h | High (judging) | Risky |
| C9 Device PSIRT | Partially (egress, matching) | None | Partial | ~150 h | High | Over-scoped |
