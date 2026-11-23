# 06 — Judge Simulation, Selection Rubric, Red Team & Final Product Concept

**Prepared:** 2026-11-22
This document covers Parts 8–11 of the brief: official-criteria judge simulation → internal 100-point rubric → red-team of the top 3 → final selection → full concept of the primary recommendation.

---

# PART A — Judge simulation (official criteria, equal 20% weights)

Scores are 1–10 per official criterion, assuming **competent execution of the planned MVP** (not a perfect build). They are judgements, not measurements. ±1 uncertainty on every number.

### C7 Article25 (privacy-by-design screening)
- **Would impress me:** I create an ordinary epic and, within seconds, see specific, quoted evidence ("…store customers' voice notes…" → special-category risk), a new vendor not in the register, and a deterministic "2 of 9 WP248 criteria → DPIA likely". The transition is blocked with a clear message. The DPO approves with conditions that become subtasks, and the Confluence ROPA page updates with a version. It feels like a real programme, not a chatbot.
- **Would disappoint me:** Generic GDPR text. Every ticket flagged. Gate setup that takes 15 minutes. Only works on the demo project.
- **Originality doubts:** "Isn't this OneTrust?" → only if I don't know that OneTrust is enterprise, questionnaire- and trigger-based, and lives outside Jira.
- **Technical-credibility doubts:** "Is the LLM deciding legal outcomes?" → no: rules engine, evidence validation, versioned rules.
- **Why first place:** It solves a fresh, regulated, expensive problem for an underserved audience exactly where work is planned. It uses context (register + work + people) to make a decision that moves work forward, with human approval and an audit trail.
- **Scores:** Tech **8** · Design **8** · Impact **8** · Innovation **8** · Presentation **8** → **40/50**

### C8 Living ACR
- **Impress:** A regression alert the moment a bug undermines a claimed criterion. Release-bound ACR pages.
- **Disappoint:** "Remediator already does ACRs from Jira."
- **Scores:** Tech 7 · Design 8 · Impact 7 · Innovation 6 · Presentation 7 → **35/50**

### C6 CAPA Signal
- **Impress:** Three silos clustered into one systemic CAPA; a failed CAPA detected automatically.
- **Disappoint:** "Qity already ships a Rovo RCA agent, and another entrant built recurrence detection."
- **Scores:** Tech 7 · Design 7 · Impact 8 · Innovation 5 · Presentation 7 → **34/50**

### C5 Outside View
- **Impress:** "You said 6 weeks; your own history says 11" with causes.
- **Disappoint:** I install it and see nothing, because my test site has no history.
- **Scores:** Tech 7 · Design 7 · Impact 7 · Innovation 8 · Presentation 8 → **37/50** *(Tech could drop to 5 if judges can't reproduce it)*

### C9 Device PSIRT
- **Impress:** A new CVE mapped to exact firmware versions with a regulatory decision trail.
- **Disappoint:** Shallow regulatory logic; brittle external feeds.
- **Scores:** Tech 6 · Design 6 · Impact 7 · Innovation 7 · Presentation 6 → **32/50**

> A strong idea with weak implementation is not a winner. C5's innovation score does not offset its testability risk on the first tie-breaker (Technological Implementation).

---

# PART B — Internal 100-point selection rubric (our tool, not the official rubric)

| Dimension (weight) | C7 Article25 | C8 Living ACR | C5 Outside View | C6 CAPA Signal | C9 Device PSIRT |
|---|---:|---:|---:|---:|---:|
| Real-world problem & impact (20) | **17** | 14 | 15 | 16 | 15 |
| Originality & differentiation (15) | **13** | 8 | 11 | 6 | 11 |
| Meaningful Atlassian integration (15) | **13** | 11 | 12 | 11 | 9 |
| Feasibility in time (15) | 12 | **13** | 9 | 11 | 7 |
| Product quality & usability potential (10) | **8** | 8 | 7 | 7 | 6 |
| AI/agent meaningful execution (10) | **8** | 6 | 6 | 7 | 6 |
| Demo & storytelling (10) | 8 | 7 | **9** | 7 | 6 |
| Long-term adoption & commercial (5) | **4** | 4 | 3 | 3 | 3 |
| **TOTAL (100)** | **83** | **71** | **72** | **68** | **63** |

### Score rationale (C7 in full, others summarised)
- **Problem 17/20:** Strong evidence: ISACA (50% cite not practising PbD as a failure cause; median team of 5), CCPA risk assessments in force 1 Jan 2026, WP248 criteria, €1.2B GDPR fines in 2025. Not 20, because there is **no direct measurement** of how many features slip through without review (Hypothesis).
- **Originality 13/15:** 0 Codegeist entrants found; no native or Marketplace equivalent. AI-assisted assessments exist elsewhere (Privado), so the novelty is *placement and method*, not "first AI in privacy".
- **Integration 13/15:** Triggers, panel, validator, global page, Confluence publishing, issue properties, Rovo agent/skill, MCP and TWG all serve a purpose. TWG is supportive rather than central, hence not 15.
- **Feasibility 12/15:** All core APIs verified. LLM enablement and validator expression still need spiking.
- **Product quality 8/10:** Clear personas and surfaces. Risk of complexity in the DPO console.
- **AI 8/10:** AI does what only AI can (language to structured signals with evidence). Rules do the rest. The agent has real tools.
- **Demo 8/10:** Concrete and visual. Privacy can feel dry, so the story must carry it.
- **Commercial 4/5:** Privacy budgets exist; mid-market is underserved; Marketplace distribution fits.
- **C8 (71):** easiest build, but Remediator caps originality. **C5 (72):** best story, worst testability. **C6 (68):** best evidence, crowded wedge. **C9 (63):** over-scoped.

### Confidence assessment
| Candidate | Confidence in score | Biggest uncertainty |
|---|---|---|
| C7 | **Medium-high** | Extraction precision on terse real tickets; whether judges value a "compliance" story |
| C8 | Medium-high | How much Remediator already does beyond its listing |
| C5 | Medium | Judge reproduction |
| C6 | Medium | Private competition in the Specialized category |
| C9 | Low-medium | Regulatory depth needed to be credible |

**No disqualifying weakness for C7.** C5 has a near-disqualifying weakness (testability).

---

# PART C — Red team: top 3 (C7 Article25, C5 Outside View, C8 Living ACR)

## C7 Article25

**A. Skeptical judge: "Another AI chatbot integrated with Jira?"**
No. There is no chat in the core loop. It's an event-driven pipeline with deterministic rules (WP248 criteria counting, CCPA significant-risk triggers, register diffs). It writes an issue property that a workflow validator enforces, routes a review, records the DPO's decision with conditions, and versions the Confluence register. The LLM's only job is turning prose into structured signals **with verbatim evidence that we verify**. Turn the LLM off and the deterministic pre-pass plus register diff still flags new vendors and lexicon hits. *Survives.*

**B. Experienced Atlassian developer: "You can do this with Automation + Rovo."**
Partly true. A Jira Automation rule can call a Rovo agent on issue creation and post a comment. What's missing: (1) Automation-invoked agents **cannot run CREATE/UPDATE actions** (Verified), so no governed write-back; (2) no register to diff against (an agent doesn't know your approved vendors or which categories each system already processes); (3) no deterministic thresholds; (4) no gate tied to the outcome; (5) no audit trail suitable for CCPA attestation counts; (6) no evidence validation. Guard Detect finds PII in content, not processing in plans. *Survives.*

**C. End user (DPO): "I have Jira, Confluence and a questionnaire. Why install this?"**
Because your questionnaire depends on PMs recognising when to fill it in, and ISACA data shows PbD is skipped often. Measurable value: (1) coverage, the % of in-scope epics screened (target 100% versus self-reported); (2) median time from epic creation to privacy decision; (3) DPO minutes per review (prefilled evidence versus blank form); (4) ROPA freshness (days since last delta); (5) CCPA attestation counts generated automatically. These metrics are **instrumented in the app** (reporting tab). *We claim no outcome numbers we haven't measured.*

**D. Technical reviewer: "Your APIs may not be available."**
Dependency chain: triggers (GA) → queue (GA) → SQL (available) → LLM (GA per reports; **enablement spiked on Day 1**, fallback = deterministic mode plus on-demand Rovo analysis) → issue property (GA) → validator (**Preview**, fallback function validator or soft gate) → Confluence publish (GA). Optional: TWG (Preview), `rovo:mcp` (Preview), `rovo:skill` (Preview). All fail soft. The core demo needs **no Preview feature** except the validator, which has a fallback. *Survives.*

**E. Investor: "Would anyone use it after the hackathon?"**
- **Customer:** companies of 50–2,000 employees on Atlassian Cloud with a DPO or privacy counsel (often part-time) and EU or California exposure.
- **Adoption path:** install → map projects to systems → import vendor list and ROPA (CSV/Confluence table) → screen new work only (no backfill needed) → enable the gate on one product line.
- **Ongoing value:** every new epic. Register freshness. Annual CCPA attestation. Customer-questionnaire answers.
- **Monetisation:** Marketplace per-user pricing. Atlassian has a very large Cloud customer base; most handle personal data.
- **Risk:** privacy teams may prefer their GRC suite. Mitigation: export and webhook integrations (P2). *Survives with caveat.*

**F. Competing team with 30 days and the same AI tools:**
They could build "privacy review bot for Jira" in a weekend as a prompt plus comment. They are unlikely to also build the register model, rules engine with WP248/CCPA logic, evidence validation, gating, decision records, versioned Confluence register, attestation report and seeded judge experience. **Domain authenticity** (correct terms, thresholds, real workflow) is the moat for the hackathon. *Survives, but execution depth is mandatory.*

**G. Failure test: the LLM fails mid-demo.**
The pre-pass still flags lexicon hits and unknown vendors, and the register diff still computes. The panel shows "AI analysis unavailable: showing rule-based findings" with outcome `NEEDS_INFO` or `REVIEW_REQUIRED`. The gate, routing, decision, register and audit all still work. **Video plan:** record the primary demo with the LLM, and include a 10-second "resilience" beat (P1). *Survives.*

- **Strongest surviving argument:** a fresh, legally mandated, under-tooled workflow, placed exactly where the triggering work happens, with deterministic accountability.
- **Weakest unresolved argument:** no hard data on what % of features currently skip privacy review.
- **Most dangerous assumption:** that extraction precision on realistic tickets is high enough (target ≥0.85 precision on "review-required" outcomes in our eval set) that PMs don't revolt.
- **Minimum changes to be competitive:** precision-first thresholds; a polished seeded scenario; the gate working on the first try; video under 4:30.
- **Survives: YES.**

## C5 Outside View
- **A:** Not a chatbot. Statistics plus similarity. *Survives.*
- **B:** Monte Carlo apps exist; ours is epic reference class plus causes. *Partially survives.*
- **C:** "Why trust it?" → backtesting on the customer's own history. *Survives if history is rich.*
- **D:** APIs fine; **history data is the blocker** on judges' sites. *Fails the judge-testability part.*
- **E:** PMO buyers exist; accuracy unproven. *Uncertain.*
- **F:** Two related entrants already. *Weakens.*
- **G:** Without AI, the stats still work. *Survives.*
- **Most dangerous assumption:** that judges will import historical CSVs or accept a demo-site login. **Survives only as the "high-innovation alternative".**

## C8 Living ACR
- **A:** Deterministic roll-up plus classification. *Survives.*
- **B:** Remediator generates ACRs from Jira. *Partially fails.* Our wedge (AI mapping, regression alerts) is incremental.
- **C:** Sales-ready ACR always current. *Survives.*
- **D:** All GA. *Survives.*
- **E:** Real B2B demand (procurement, EAA). *Survives.*
- **F:** Easy to replicate. *Weakens.*
- **G:** Without AI, manual mapping still rolls up. *Survives.*
- **Survives as backup: YES** (lowest risk, lower ceiling).

---

# PART D — Final selection

| Role | Choice | One-line reason |
|---|---|---|
| **Primary recommendation** | **Article25: privacy-by-design screening for Jira & Confluence** | Highest overall score (83). Validated white space. Fresh regulatory driver. Context is essential. Testable by judges. |
| **Strong backup** | **Living ACR: accessibility conformance from Jira evidence** | Lowest technical risk, uncrowded in Codegeist, real procurement/EAA demand. The ceiling is capped by Remediator. |
| **High-innovation alternative** | **Outside View: reference-class forecasting for epics** | The most memorable idea, grounded in forecasting research. Judge-testability is the risk to solve. |

**Switch triggers (pre-committed):** abandon Article25 for the backup if, by **26 Nov 2026**, (a) Forge LLM cannot be enabled **and** the deterministic-only experience isn't compelling, or (b) a re-scan reveals ≥3 credible Codegeist entrants building privacy screening.

---

# PART E — Primary recommendation: full product concept

## E1. Product identity
- **Name:** **Article25** (after GDPR Article 25, "data protection by design and by default"). *Alternatives if trademark or clarity checks fail:* "ClearBasis", "Privacy Checkpoint".
- **Tagline:** **"Privacy review at the speed of your backlog."**
- **One-sentence pitch:** Article25 screens every new epic, story and spec in Jira and Confluence for personal-data impact, checks it against your record of processing, applies DPIA and CCPA risk-assessment triggers deterministically, and routes, gates and records the privacy decision before anyone writes code.
- **Category:** Apps for Business Teams (legal), with strong software-team surfaces. *(The Sponsor may reassign; see 10.)*
- **Target users:** DPO / privacy counsel / privacy engineer (decision makers); product managers and engineers (daily touchpoints); compliance leads (reporting).
- **Primary customer:** Atlassian Cloud companies (≈50–2,000 employees) that process EU/UK/California personal data and have a small privacy function.
- **Exact problem:** Ordinary product work silently creates privacy obligations (new data categories, vendors, profiling, transfers). Privacy teams learn too late, records drift, and required assessments are missed or done after the fact.
- **Why it matters:** Legal duty (GDPR Art. 25, 30, 35; CCPA risk assessments since 1 Jan 2026), rising enforcement (€1.2B GDPR fines in 2025), shrinking teams (ISACA median 5), and PbD failures cited by 50% of privacy pros.
- **Why existing products fail:** OneTrust-class suites rely on manual triggers and enterprise budgets. Code scanners act after code exists. Atlassian Guard protects Atlassian content, not product designs. Generic Rovo prompts lack a register, rules, gating and records.
- **Why it's right for Codegeist:** It is the theme in its purest form. Organisational context (plans + register + people) produces a confident decision at the moment of work, and the result is recorded where teams already work.

## E2. Differentiation
- **Genuinely unique:** plan-time detection with an inventory-aware diff and deterministic legal triggers, enforced by a Jira gate and recorded as auditable decisions, entirely on Atlassian.
- **Technically difficult:** reliable structured extraction from messy prose, evidence validation, a versioned rules engine, idempotent event processing, gating via entity properties, and register versioning with Confluence publishing.
- **More than a wrapper:** remove the LLM and you still have the register, diff, rules, gate, workflow and audit. The LLM replaces only the hardest manual step (reading).
- **Why Atlassian is essential:** the trigger (epics/PRDs), the context (links, projects→systems, owners) and the action surface (panel, gate, tasks, Confluence register) all live in Jira and Confluence.
- **Why organisations adopt:** it closes a mandated gap with minimal behaviour change for PMs (they keep writing tickets) and less toil for the DPO.
- **Hard to replace with a chatbot or workflow:** a chatbot only answers when asked and remembers nothing. A plain workflow can't read prose. Neither keeps a register or produces attestation evidence.

## E3. Product functionality

### Surfaces
1. **Issue panel "Privacy check"** (Jira, UI Kit): status chip, outcome, findings grouped (data categories · subjects · purposes · vendors · transfers · high-risk criteria), each with a quoted evidence snippet and source link. Clarifying questions. "Not applicable" feedback. "Request review" button. Gate status.
2. **DPO Console** (Jira global page, Custom UI):
   - **Review queue:** open reviews by outcome and age (SLA), with filters.
   - **Review workspace:** evidence, register diff, rule trace, decision (Cleared / Cleared with conditions / DPIA required / Rejected), conditions → subtasks, DPIA draft button.
   - **Register:** systems, processing activities, data categories, data subjects, vendors/processors, lawful basis, retention, transfers. Version history. CSV import/export. "Publish to Confluence".
   - **Screening log:** every screening, with rule version and outcome.
   - **Reports:** coverage, outcomes, time-to-decision, new vendors/categories by period, **CCPA attestation summary** (number of risk assessments conducted/updated, categories of PI).
   - **Settings:** projects and issue types in scope, project→system mapping, gate statuses, DPO group, LLM on/off, daily cap, jurisdictions enabled.
3. **Confluence:** auto-published, versioned ROPA page; DPIA draft pages from template (P1); PRD byline badge (P1).
4. **Rovo agent "Privacy Partner"** (+ reusable `privacy-screening` skill): PM questions ("What do I need before using a new SMS vendor?"), DPO questions ("Which epics this quarter added new processors?"), drafting and creating reviews (CREATE with confirmation).
5. **MCP tools** (`rovo:mcp`): `screen_proposal`, `lookup_vendor`, `get_system_processing` for engineers' coding agents.

### Core workflows (detail in 08)
Auto-screen on create/update → PM clarifies → DPO decides → gate releases → register updated → Confluence republished → report counts updated.

### Context retrieval
Issue + parent + linked pages + project→system mapping + register rows + vendor list. People/teams/goals via TWG (reviewer suggestions, owning team, goal context on the review).

### Evidence & traceability
Every finding carries `evidence_quote`, `source` (issue field or page section), `confidence` and `ruleIds`. Every decision records approver, timestamp, conditions, rule version and the screening snapshot hash.

### Human approval
Nothing changes the register, publishes a page or clears a gate without a human action. Rovo CREATE/UPDATE actions require chat confirmation. The DPO can override outcomes, and overrides are logged.

### Error handling
LLM failure → rule-based mode banner. Event storms → content-hash dedupe and queue retries. Confluence publish failure → retry with the register still authoritative. Missing permissions → panel explains what's missing. TWG failure → panel section hidden with a note.

### Feature priorities
| P0 (winning MVP) | P1 (high value) | P2 (future) |
|---|---|---|
| Auto-screen Jira epics/stories · evidence-validated findings · register + seed data · rules v1 (WP248, CCPA triggers, special categories, children, transfers, inventory diff) · panel · DPO console (queue, decision, conditions→subtasks) · issue property + validator gate · Confluence ROPA publish · audit log · Rovo agent (read actions + create review) · sample-data loader | Confluence PRD screening + byline · `rovo:mcp` tools + open-source skill.md · `rovo:skill` · TWG reviewers/team/goal context · DPIA draft page · CCPA attestation export · clarifying-question loop · resilience mode UI | JSM intake · DPDP (India), Australia, LGPD packs · EU AI Act screening pack · code-scanner import (Fides/Privado) · vendor DPA tracking · DSAR impact · multi-site |

## E4. The killer feature
### "Evidence-locked privacy gate"
**What the judge sees:** a PM types an ordinary epic. ~20 seconds later the panel shows *"DPIA likely: 2 of 9 high-risk criteria"*. Each criterion is backed by a **highlighted quote from the ticket or linked spec**. A **register diff** shows *new processor: "ReplayCloud" (not in vendor register)* and *new category for System "Checkout": "screen recordings (may include payment data)"*. Moving the epic to *Ready for Dev* is **blocked** with a precise message. The DPO opens the prefilled review, clicks **"Cleared with conditions"** ("mask input fields; 30-day retention"). Two subtasks appear on the epic, the gate opens, and the **Confluence ROPA page republishes as v14** with the new processor row highlighted.

**How it works:** event → queue → extraction with evidence → verification → rules → issue property `article25.status = DPIA_LIKELY` → validator expression denies the transition → DPO decision writes `CLEARED_WITH_CONDITIONS`, creates subtasks, applies the register delta, republishes the page, writes the audit log.

**Why it's credible:** every link in the chain uses verified Forge capabilities. The "intelligence" is inspectable (quotes + rule IDs). It is the full loop from context to decision to action to record.

## E5. Winning demonstration scenario (realistic, seeded data)

**Company:** "Northwind Health Commerce", a fictional mid-size online pharmacy-adjacent retailer (EU + California customers). A health-adjacent setting makes special-category data plausible without real patient data.
**Seed:** register with 6 systems (Checkout, Accounts, Marketing, Support, Analytics, Fulfilment), 14 processing activities, 9 approved vendors; Confluence "Privacy" space with the ROPA page v13; Jira project "CHK" (company-managed, gate on "Ready for Dev"); privacy project "PRIV".

1. **Initial situation:** Priya (PM) creates epic CHK-142: "Session replay on checkout to reduce drop-off", linking a PRD that mentions recording sessions with "ReplayCloud" and "segmenting users who abandon carts with prescription items".
2. **User's problem:** Priya doesn't know this needs privacy review. Diego (DPO) has 3 hours a week for product reviews.
3. **What Article25 retrieves:** issue text + PRD sections + Checkout's register rows + vendor list (+ TWG: Priya's team "Checkout Squad", epic's goal "Increase conversion 5%").
4. **Intelligence:** findings with quotes. New vendor. New category (screen recordings). Possible health-related inference (prescription items → special category) → criteria 4 (sensitive) + 3 (systematic monitoring) + 1 (profiling/segmentation) → **DPIA likely**. CCPA: sensitive PI + possible "sharing" with the vendor → **risk assessment required**.
5. **Action:** gate blocks "Ready for Dev". Review PRIV-37 is created and assigned to Diego with suggested reviewers (from TWG: contributors to the prior Analytics DPIA page).
6. **Improvement:** Diego decides in minutes using the prefilled evidence, adds conditions and starts a DPIA draft (P1). The register and Confluence page update. Priya's epic proceeds the same day with clear conditions.
7. **Final impact (shown honestly):** the Reports tab shows this quarter's coverage (all in-scope epics screened), median time-to-decision for the seeded history, and the CCPA attestation summary auto-counted. A coding agent (Claude Code via MCP) asking "can I add the ReplayCloud SDK?" gets "pending DPIA PRIV-37: conditions not yet cleared" (P1).

**No fabricated live integrations:** all data lives in the judge's own Jira/Confluence after seeding. The MCP demo uses a real external client connection (or is omitted if U4 fails).
