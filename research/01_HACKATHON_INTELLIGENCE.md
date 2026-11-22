# 01 — Hackathon Intelligence Report: Atlassian Codegeist 2026

**Prepared:** 2026-11-22 (all sources accessed 2026-11-22 unless stated)
**Status labels used:** **Verified** (read in an official source) · **Supported** (credible secondary evidence) · **Hypothesis** · **Unverified** · **Not feasible**

---

## 1. Competition overview (Verified)

| Item | Value | Source |
|---|---|---|
| Name | Codegeist 2026: Build with context. Ship with confidence. | [Devpost landing](https://codegeist2026.devpost.com/) |
| Sponsor | Atlassian Pty Ltd (Sydney) | [Official rules §2](https://codegeist2026.devpost.com/rules) |
| Administrator | Devpost, Inc. | Rules §2 |
| Registration + submission period | **Tue 27 Oct 2026 09:00 PT → Tue 22 Dec 2026 12:00 PT** | Rules §1 |
| Judging period | Tue 5 Jan 2027 13:00 PT → Wed 3 Feb 2027 17:00 PT | Rules §1 |
| Winners announced | On or around Mon 15 Feb 2027 09:00 PT | Rules §1 |
| Registered participants | **4,732** (Devpost counter, 2026-11-22) | Devpost landing |
| Project gallery | Not yet published | [Gallery](https://codegeist2026.devpost.com/project-gallery) |

**Time remaining (computed):** from Sun 22 Nov 2026 to Tue 22 Dec 2026 12:00 PT = **30 calendar days**. The app must also keep working through **3 Feb 2027**, when judging ends. That affects dev-site expiry, LLM model retirement and Preview API changes (see §8).

### The challenge statement (paraphrased; Verified)
Atlassian describes the Teamwork Graph as "associative memory for your organization" linking goals, work, people, decisions and outcomes. Entrants should build a Forge app that uses that context to help teams ship with confidence. Three example patterns are given:
1. surfacing the right knowledge at the right moment;
2. connecting work across silos;
3. turning organisational data into a decision that actually moves work forward.

## 2. Mandatory project requirements (Verified, Rules §4)

1. **Build on Atlassian Forge.** The app must "run on Atlassian Forge".
2. **Integrate with at least one** of Jira, Confluence, Jira Service Management, Bitbucket, Teamwork Graph or Rovo.
3. **Enter exactly one category** (the Sponsor may reassign it).
4. **Functionality:** the app must install in a judge's test environment via an installation link, run consistently, and behave as shown in the video and description.
5. **New or existing:** either new and unpublished before 27 Oct 2026, or, if it existed before, **updated/rebuilt on Forge after the period started**, with a Forge manifest and at least one Forge module.
6. **Third-party integrations** must be authorised under their licences.
7. **Original work, solely owned** by the entrant. Open source is allowed if the submission builds on it and complies with its licence. Contractors are allowed if the work and ideas remain the entrant's own.
8. **No financial or preferential support** from Atlassian or Devpost.
9. **English** materials, or English translations.

## 3. Submission requirements (Verified)

| Requirement | Detail |
|---|---|
| Installation link | Created via Forge "Start sharing your app" ([docs](https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app)). Must be **"Sharing"**, not "Sharing within organization", or outside judges cannot install. Requires a **production** deployment. The installing user must be a **site admin**. |
| Configuration instructions | "Detailed instructions must be provided for all configuration steps" and any integrations. |
| Demo video | **Under 5 minutes** (judges need not watch past 5:00). Must show the project working on its intended platform. **Public on YouTube.** No unlicensed third-party trademarks or music. |
| Text description | Features and functionality. |
| Technology explanation | How the project meets the main technology requirement. |
| Category + bonus selection | Plus any bonus-prize write-up or materials. |
| Devpost form | Complete before 22 Dec 2026 12:00 PT. Drafts can be saved. No edits after the deadline. |

**Practical prerequisite (Supported):** setting Forge distribution to *Sharing* requires a **privacy policy URL** in the developer console. Many entrants host theirs in a public GitHub repo ([example](https://github.com/vinit1009/forge-app-policies)).

**Multiple submissions:** allowed, but each must be "unique and substantially different".

## 4. Categories (Verified)

| Category | Official framing |
|---|---|
| **Apps for Software Teams** | "Give dev teams the context to ship with confidence. Think smarter code reviews, deployment awareness, issue triage that actually understands what matters." |
| **Apps for Business Teams** | "Give business teams the context to act decisively. Help colleagues in marketing, sales, HR, finance, support, or legal move faster with the right information in front of them." |
| **Apps for Specialized Industries** | "Give experts in healthcare, finance, manufacturing, automotive, or other fields the context to do their best work. Turn insider knowledge into solutions built for your world." |

## 5. Prize structure (Verified, Rules §8)

| Prize | Amount | Quantity | Notes |
|---|---|---|---|
| 1st place | $15,000 + 2 TEAM 2027 (AMER) tickets + blog recognition + signed Atlassian Williams Racing swag | **3 (one per category)** | Travel not included |
| 2nd place | $8,000 + possible blog feature | 3 (one per category) | |
| 3rd place | $5,000 + possible blog feature | 3 (one per category) | |
| Best Agents (Rovo / assignable agents) | $1,500 | 6 | Forge app with `rovo:agent`, `rovo:agentConnector`, or reusable `rovo:skill` + action modules that other agents can invoke |
| Best app with Atlassian MCP | $1,500 | 6 | Forge app exposing tools via the Atlassian MCP server using **`rovo:mcp`**. Can be combined with open-source skill.md files. |
| Best Teamwork Graph integration | $1,500 | 6 | Connects data into the graph and/or consumes data from the TWG API |
| Best Marketplace-published app | $1,500 | 6 | Listed on the Marketplace or submitted for listing (link to listing or review ticket) |
| Participation swag | Swag pack | 300 | First come, first served; max 4 per submission |

**Multiple-prize rules:** one submission can win **at most one grand prize and one bonus prize**. Entering several bonus tracks raises the odds of winning one bonus, but cannot win more than one.

## 6. Judging (Verified, Rules §6)

**Stage One, pass/fail:** does the project "reasonably fit the theme" and "reasonably apply the required APIs/SDKs"?

**Stage Two, five equally weighted criteria (20% each):**

| Criterion | Official question |
|---|---|
| Technological Implementation | "Does the app feel like a genuine, working, non-trivial implementation when tested, not just a shallow wrapper or a single hardcoded demo path?" |
| Design | "Does the project deliver a complete, coherent product experience — not just a technical proof of concept?" |
| Potential Impact | "Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?" |
| Innovation / Idea | "How creative and novel is the concept and does the project differ from existing concepts?" |
| Presentation | "Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow?" |

**Tie-break order:** Technological Implementation → Design → Potential Impact → Innovation → Presentation. Implementation quality is the first tie-breaker.

**Judges:** "a qualified panel"; may be Atlassian employees or third parties; one or more rounds.

## 7. Bonus-prize technical requirements (Verified against Forge docs)

| Bonus | What must be in the manifest / code | Status of underlying tech |
|---|---|---|
| Agents | `rovo:agent` (+ `action`), or `rovo:agentConnector`, or `rovo:skill` + `action` | `rovo:skill` = **Preview** ([docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/)). `rovo:agent` and `action` status not stated on their pages. `rovo:agentConnector` requires an external A2A 1.0 JSON-RPC server, Jira only ([docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/)). |
| MCP | `rovo:mcp` with `tools:` listing action keys (max 50, one module per app) | **Preview.** External MCP access is **off by default** and must be enabled per installation by an admin in Atlassian Administration → Connected apps. Endpoint `https://mcp.atlassian.com/forge/<appId>`. OAuth 2.1; runs with the user's permissions ([docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)). |
| Teamwork Graph | Consume via TWG GraphQL API (curated queries or persisted Cypher), or ingest via a connector (`graph:connector`-family modules) | TWG API **Preview since 15 Oct 2026**. Raw runtime Cypher no longer allowed. Per-object-type scopes. **Org-admin install required.** Calls **as user only**. Jira or Confluence host apps only. An app "can either call the API or provide a custom connector, but not both". See §9. |
| Marketplace | Listing or review ticket | Apps **submitted for listing, or with a licence in the manifest, cannot be shared by link** ([docs](https://developer.atlassian.com/platform/forge/distribute-your-apps/)). A separate unlicensed copy would be needed for judges. |

## 8. Environment provided to entrants (Verified, [Resources page](https://codegeist2026.devpost.com/resources))

- `forge site provision` creates a **free, pre-configured development site** with Jira, Confluence, JSM, **Rovo Enterprise**, Studio and **seeded demo data**, valid for **90 days**. One active provisioned site per developer.
- Node.js 20+ and Forge CLI.
- **Forge LLMs are optional** and "not turned on by default". Codegeist **does not provide credits**. "Many AI-powered use cases can be built with Rovo instead."
- Help: Atlassian Developer Community, tag `codegeist-2026`.

**Date implication:** a site provisioned on 22 Nov 2026 expires around 20 Feb 2027, after judging ends (3 Feb). A site provisioned before ~5 Nov would expire during judging. Judges use their own environments, but our demo site and video recording depend on ours.

## 9. Platform capability verification (summary; detail in 05_TECHNICAL_FEASIBILITY.md)

| Capability | Status | Key constraints | Source |
|---|---|---|---|
| Forge functions | GA | Sync (UI resolvers, actions, web triggers): 55 s. Async events / scheduled triggers: up to **900 s** with `timeoutSeconds`. Memory 512 MB default, 1 GB max. Front-end request payload 500 KB. | [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) |
| Forge KVS / Custom Entity Store | GA | Key/value plus queryable entities | [Storage](https://developer.atlassian.com/platform/forge/storage/) |
| Forge SQL | Available (GA status not labelled on page; widely used) | 1 GiB prod per install; 200 tables; SELECT timeout 5 s; no foreign keys | [SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/) |
| Forge Object Store | Preview | Binary objects | Storage page |
| Jira product events | GA | issue created/updated/deleted/assigned/commented, worklog, issuelink, attachment… `filter.expression`, `ignoreSelf` | [Events](https://developer.atlassian.com/platform/forge/events-reference/product_events/) |
| Confluence events | GA | `created:page`, `updated:page`, live-doc events, labels, comments, tasks… | [Confluence events](https://developer.atlassian.com/platform/forge/events-reference/confluence/) |
| Jira workflow validator | **Preview** | Company-managed projects only. Expression- or function-based. | [Module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/) |
| Forge LLMs (`@forge/llm`) | GA per third-party reports. The API reference page does not state a stage. | **No free allowance: every token is billed to the app developer.** Adding the `llm` module is a major version upgrade, so admins must approve. Tool calling supported. Models include `claude-sonnet-5` (retires no sooner than 30 Jun 2027) and `claude-opus-5` (no sooner than 24 Jul 2027). **`claude-haiku-4-5` retirement "no sooner than 15 Oct 2026" has already passed; do not depend on it.** | [API ref](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/), [Models](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/), [Pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/) |
| Rovo agents | Available | Usable in chat side panel, `/ai` editor toolbar and Automation. **Automation-triggered agents won't invoke CREATE/UPDATE/DELETE/TRIGGER actions.** Inputs are LLM-generated: authorise with `context.accountId`, not inputs. Action response limit documented as 5 MB, but practitioners report failures at ~1.1 MB and a ~20 s practical timeout. | [Agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/), [Action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/), [practitioner report](https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc) |
| Rovo availability | Paid only (no free tier) | Included on the provisioned Codegeist dev site (Rovo Enterprise). Judges' sites: **Unverified**, probably available. | Resources page; practitioner report |
| `requestTeamworkGraph` (bridge) | **Preview (11 Nov 2026)** | Front-end calls TWG as the current user | [Changelog](https://developer.atlassian.com/platform/forge/changelog/) |

## 10. Discrepancies between sources

| # | Discrepancy | Resolution |
|---|---|---|
| 1 | Landing page: MCP bonus for "a Forge app exposing an MCP server". Rules: "exposes tools via the Atlassian MCP server **using the rovo:mcp module**". Resources page: "Rovo MCP server". | **Rules prevail** (Rules §11). Use `rovo:mcp`. A self-hosted MCP server outside Forge would probably not qualify. |
| 2 | Landing/rules mention "rovo:skill and **rovo:action** modules". The Forge manifest module is named **`action`**. | Naming slip. Use `action` + `rovo:skill`. |
| 3 | Landing shows "20%" per criterion; rules say "equally weighted". | Consistent. |
| 4 | Older TWG pages ("Ways to integrate", "Limitations") still describe EAP rules (test orgs only, broad `read:graph:jira` scope). The changelog says Preview since 15 Oct 2026 with per-object scopes. | Follow the **changelog and scopes page**. Treat the older pages as stale. Verify during a Week 1 spike. |
| 5 | Practitioner reports say Rovo action responses fail at ~1.1 MB and ~20 s, versus documented 5 MB / 55 s. | Design for the **practical limits**: small payloads, precomputed results. |

## 11. Risks and uncertainties that could disqualify or weaken us

| Risk | Severity | Mitigation |
|---|---|---|
| Judge cannot install (wrong distribution mode, missing privacy URL, org-admin requirement from TWG scopes) | **Critical** | Use "Sharing". Publish privacy policy and terms. Test the install on a **second, clean site** before submitting. State the org-admin requirement in the instructions. |
| App depends on configuration the judge won't do | High | One-click "Load sample data" seeder. Every advanced setup step (workflow validator, MCP external access) is optional, with the core value visible without it. |
| Preview APIs change during judging (TWG, `rovo:mcp`, `rovo:skill`, workflow validator) | Medium | Graceful degradation: TWG-powered panels fail soft. Monitor the changelog weekly until 3 Feb 2027. |
| LLM model retired during judging | Medium | Pin `claude-sonnet-5` (not Haiku 4.5). Model ID in config. Deterministic fallback path. |
| LLM cost billed to us during judging | Low–Medium | Per-installation daily screening cap. Cache by content hash. Deterministic pre-filter. |
| "Shallow wrapper / single hardcoded path" perception | High | Real event-driven pipeline, deterministic rules engine, editable data model, works on any project the judge chooses. |
| Idea convergence (many entrants build the same thing) | **High** (observed, see 04) | Choose an idea validated as uncrowded. Differentiate on depth and domain authenticity. |
| Video over 5:00 or unclear | Medium | Script to ~4:15. Show the working product in the first 30 s. |

## 12. What past winners tell us (Codegeist 2025, Verified)

Source: [Meet the Winners of Codegeist 2025](https://www.atlassian.com/blog/development/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition)

| Category | 1st | 2nd | 3rd |
|---|---|---|---|
| Software Teams | Secure Notes for Jira (sensitive context with access controls + audit) | Sherlock Sync (living docs from code) | AI Backlog for Jira |
| Business Teams | Frank. (HR/people info with permissions, onboarding, Rovo) | Sidekick4All (Jira ↔ calendars) | File Field Cloud |
| Specialized Industries | FleetOps (fleet incident reporting) | YardMaster (yard/logistics ops) | Compliant Workflows for Jira |

**Observations (our interpretation):**
- Winners were **practical, focused, complete products** solving a concrete operational problem, not the most technically flamboyant AI.
- **Trust, permissions, audit and compliance** themes won in more than one category (Secure Notes, Frank., Compliant Workflows).
- "Best Rovo Apps" winners overlapped heavily with category winners: good products also used Rovo well.
- The Specialized Industries winners were comparatively simple operational apps, which suggests (Hypothesis) less saturated competition there.

## 13. Strategic interpretation: what a winning 2026 submission must demonstrate

1. **A specific person with a specific, expensive problem**, shown in a believable scenario ("legal reviewer", "quality engineer"), not "teams" in general.
2. **Context is the product.** The app's output must change because of organisational context (who, what was decided, what exists, what happened before). Generic LLM text is not enough.
3. **A decision that moves work forward.** End in a concrete action (gate, routed review, created task, updated record), with a human approving consequential steps.
4. **Non-trivial, inspectable engineering.** Event-driven processing, a real data model, deterministic logic where correctness matters, AI where language understanding matters, an audit trail.
5. **Complete product feel.** Onboarding, empty states, settings, error states, seed data, consistent Atlassian design (Atlaskit/UI Kit).
6. **Testable by a stranger in 10 minutes.** Installation link plus seeded scenario plus clear instructions.
7. **A distinct idea.** With 4,700+ participants and AI-assisted ideation, the obvious ideas are being built dozens of times (see 04). Novelty now has to be **validated**, not assumed.
8. **Theme vocabulary used honestly.** Use Teamwork Graph, Rovo and MCP where they add value, not as decoration.

## 14. Official source links

- Devpost landing: https://codegeist2026.devpost.com/
- Official rules: https://codegeist2026.devpost.com/rules
- Resources: https://codegeist2026.devpost.com/resources
- Updates: https://codegeist2026.devpost.com/updates
- Forge distribution: https://developer.atlassian.com/platform/forge/distribute-your-apps/
- Rovo modules index: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-index/
- Rovo MCP: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- Rovo skill: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/
- Rovo agent connector: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/
- Teamwork Graph: https://developer.atlassian.com/platform/teamwork-graph/
- TWG limitations: https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/
- Forge changelog: https://developer.atlassian.com/platform/forge/changelog/
- Forge LLM API / models / pricing: see §9 links
- Invocation limits: https://developer.atlassian.com/platform/forge/limits-invocation/
- Codegeist 2025 winners: see §12 link
