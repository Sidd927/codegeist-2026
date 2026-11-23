# 02 — Real-World Problem Discovery

**Prepared:** 2026-11-22 · Sources accessed 2026-11-22
**Labels:** **Verified** (primary source read) · **Supported** (credible secondary source) · **Hypothesis** (plausible, weak or no direct evidence) · **Unverified**
**Rule followed:** no invented statistics. Where a widely repeated number has unclear provenance, it is flagged.

---

## Part A — What Atlassian is really trying to achieve (Part 2 of the brief)

### A1. The theme behind "Build with context. Ship with confidence."
Atlassian's 2026 framing has three moving parts:

1. **Teamwork Graph as organisational memory.** Atlassian calls it "associative memory for your organization". It connects goals, work, people, decisions and outcomes ([Devpost](https://codegeist2026.devpost.com/)). Technically it is a unified, permission-aware object/relationship layer over Jira, Confluence, Loom, Goals/Projects, Teams, Compass and third-party connectors. It is queried through curated GraphQL fields and persisted Cypher ([TWG docs](https://developer.atlassian.com/platform/teamwork-graph/)).
2. **AI needs context to act.** "AI can think. But knowing what to do – really knowing – takes context." Rovo (search, chat, agents, Studio) consumes the graph. Forge apps can extend it with actions, skills, MCP tools and connectors.
3. **Confidence means fewer surprises at the moment of action.** The challenge stresses the right knowledge at the right moment, connecting silos, and data becoming a decision.

### A2. Why the underlying problem is real (Verified)
- Atlassian's *State of Teams 2025* surveyed 12,000 knowledge workers and 200 Fortune 1000 executives. It reports that leaders and teams spend about **25% of their time searching for answers**, and that difficulty finding information is the #1 barrier to moving fast. **56%** say the only way to get information is to ask someone or schedule a meeting. **1 in 2** say teams often unknowingly duplicate work. Only **7%** of executives feel confident they know how each team's work supports the biggest goals ([Atlassian blog](https://www.atlassian.com/blog/state-of-teams-2025), [PDF](https://atlassianblog.wpengine.com/wp-content/uploads/2025/03/the-state-of-teams-2025.pdf)). *Caveat: vendor-run survey.*

### A3. What makes Teamwork Graph different from "a database or knowledge graph"
- **Permission-aware by construction.** Queries run as the user (`asUser` only), so results respect what that user can see. A homegrown index cannot easily guarantee this.
- **Cross-product canonical identities** (ARIs) for users, teams, work items, pages, goals and projects, plus third-party objects via connectors (PRs, deployments, builds, feature flags, documents, deals…).
- **Typed relationships**: canonical, activity, logical and inferred ([Relationships](https://developer.atlassian.com/platform/teamwork-graph/relationships/)).
- **Practical constraints (Verified):** Preview API, curated queries return at most 25 rows per page, per-object scopes, practitioner-reported rate limiting around ~128 calls / 20 s, no background (app-identity) access.

### A4. "If a company already has Jira, Confluence and Rovo, what remains unsolved?"
Rovo is excellent at **pull**: you ask, it answers. It already **pushes** in some native workflows: duplicate detection on create, similar work items, related Confluence content, Rovo Ops incident investigation, auto-drafted post-incident reviews, JSM AI change-risk assessment and deployment gating, Code Reviewer checking PRs against acceptance criteria (see 04). What remains:

1. **Domain-specific judgement that requires a rulebook.** Examples: privacy law, quality-system rules, accessibility standards, safety procedures. A general assistant does not know your organisation's obligations, inventory and thresholds, and cannot apply them deterministically and auditably.
2. **Obligations triggered by ordinary work.** A ticket is written for one purpose (ship a feature) but creates obligations for another function (legal, quality, security, accessibility). The second function never sees it in time.
3. **Records that must stay true.** Registers (processing inventories, risk files, conformance reports) drift from reality because nobody connects them to the stream of work that changes reality.
4. **Evidence of the decision itself.** Regulators and customers increasingly ask, "show me you assessed this before you did it." Native AI features produce suggestions, not governed records.

**Implication:** the richest opportunities sit where **ordinary Jira/Confluence work silently creates an obligation for a specialist function**, and where the specialist needs context plus rules plus an auditable decision.

### A5. What makes an app a meaningful Atlassian extension rather than an external product
- The **trigger** is Atlassian work (issue created, page published, transition attempted).
- The **context** comes from Atlassian objects and relationships (issues, pages, links, people, teams, goals).
- The **action** lands back in Atlassian (panel, gate, task, page, agent answer).
- It respects Atlassian permissions and keeps data on the platform ("Runs on Atlassian").

---

## Part B — Problem catalogue (24 problems)

Each problem uses the same fields: Industry · User · Workflow · Pain · Workaround · Why tools fall short · Evidence · Consequence · Atlassian opportunity · AI/automation opportunity · Sources · Confidence.

---

### P1. Personal-data risk is created in the backlog and discovered too late (privacy-by-design failure)
- **Industry:** Cross-industry (any organisation processing personal data: SaaS, fintech, healthtech, e-commerce, HR tech).
- **Target user:** Data Protection Officer (DPO), privacy counsel, privacy engineer. Secondary: product managers.
- **Workflow:** A PM writes an epic or PRD ("add phone-number login via Twilio", "add session replay", "use purchase history to personalise offers"). Engineers build it. Privacy finds out at launch review, from a customer questionnaire, or after an incident.
- **Pain:** Privacy teams cannot read every ticket. PMs don't know which changes matter (new data category, new vendor, profiling, children's data, cross-border transfer). DPIAs are triggered late or never.
- **Workaround:** Manual intake forms ("fill this privacy questionnaire if your feature touches personal data"), launch checklists, periodic backlog sweeps, enterprise GRC suites.
- **Why tools fall short:** Intake depends on self-reporting by people who don't recognise the trigger. Enterprise suites (OneTrust etc.) can integrate with Jira but rely on configured triggers and questionnaires, and are priced for large enterprises (pricing not public).
- **Evidence (Verified unless noted):**
  - ISACA *State of Privacy 2026* (1,800+ respondents): **"not practicing privacy by design" cited as a cause of privacy failures by 50%**, up from 41% in 2025. Only **58%** always or frequently practise privacy by design (down from 62%). **Median privacy staff size fell from 8 to 5** ([ISACA press](https://www.isaca.org/about-us/newsroom/press-releases/2025/63-percent-of-privacy-professionals-find-their-jobs--more-stressful-now-than-five-years-ago), [Infosecurity Magazine](https://www.infosecurity-magazine.com/news/data-privacy-teams-staffing/); the 2026 figures come from search-result summaries of the ISACA release, **Supported**).
  - IAPP *Privacy Governance Report 2024*: PIAs and privacy-by-design are the **#3 strategic priority (30%)**. **80%** of privacy pros have been given additional responsibilities, 68% of those for AI governance ([IAPP](https://iapp.org/resources/article/privacy-governance-report), via [Privacy108](https://privacy108.com.au/insights/iapp-privacy-governance-report-2024-australian-perspective/), **Supported**).
  - **Legal triggers:** GDPR Art. 25 (data protection by design) and Art. 35 (DPIA). EDPB-endorsed WP248 rev.01 lists **nine high-risk criteria**: "in most cases… a processing meeting two criteria would require a DPIA" ([WP248 text](https://www.headlesslaw.com/gdpr/level-3/guidelines/edpb-wp248-dpia)). **California CCPA regulations effective 1 Jan 2026** require a risk assessment *before* initiating significant-risk processing. Attestations and summaries are due to CalPrivacy by **1 Apr 2028**, signed by an executive under penalty of perjury ([CPPA announcement](https://www.cppa.ca.gov/announcements/2025/20250923.html), [White & Case](https://www.whitecase.com/insight-alert/cppa-finalizes-rules-admt-risk-assessments-and-cybersecurity-audits-requirements), [BHFS](https://www.bhfs.com/insight/risk-assessments-under-the-new-ccpa-regulations-commence-jan-1-2026/)).
  - GDPR enforcement: about **€1.2 billion in fines in 2025**, €7.1 billion cumulative since May 2018 ([DLA Piper Jan 2026](https://www.dlapiper.com/en/insights/publications/2026/01/dla-piper-gdpr-fines-and-data-breach-survey-january-2026)).
- **Consequence:** Rework late in delivery, launch delays, regulatory exposure, fines, loss of enterprise deals (security/privacy questionnaires), executive attestation risk under CCPA.
- **Atlassian opportunity:** Epics, PRDs, vendor decisions and launch plans already live in Jira and Confluence. DPO intake often runs through JSM. Records of processing are often Confluence tables ([BDQ example](https://www.bdq.cloud/blog/posts/2018/february/gdpr-serving-up-a-solution-with-jira-service-desk-and-confluence)).
- **AI/automation:** Extract data categories, vendors, purposes and processing patterns from free text with evidence quotes. Deterministic rules (WP248, CCPA triggers, inventory diff) decide the outcome. Route to the DPO, gate the workflow, update the register.
- **Confidence:** **High** that the problem exists and is growing. **Medium** on the exact share of features that slip through (no direct measurement found).

### P2. Records of processing (ROPA) go stale
- **Industry:** Cross-industry. **User:** DPO / privacy ops.
- **Workflow:** GDPR Art. 30 requires a record of processing activities. Typically a spreadsheet or Confluence table reviewed annually.
- **Pain:** Every new feature, vendor or data flow can change the record. Nobody connects the record to the work that changes it.
- **Workaround:** Annual interviews with system owners. Manual inventory tools (e.g. Unicis RPA for Jira, [Marketplace](https://marketplace.atlassian.com/apps/1228855/unicis-record-processing-activities-rpa-for-jira)). Code-scanning data-mapping tools (Privado, Relyance, Ethyca Fides; **Supported**, vendor claims not inspected).
- **Why tools fall short:** Manual inventories aren't event-driven. Code scanners see code, not plans, so they find issues after the fact and miss non-code processing (vendors, manual exports).
- **Evidence:** Legal requirement (**Verified**, GDPR Art. 30; Atlassian's own [Jira ROPA page](https://confluence.atlassian.com/gdpr/jira-records-of-processing-activities-949250242.html)). Staleness as a pain point: **Hypothesis**, supported by practitioner commentary but not measured.
- **Consequence:** Inaccurate answers to regulators and DSARs. Audit findings.
- **Atlassian opportunity / AI:** Same pipeline as P1. Each approved screening proposes a versioned ROPA delta.
- **Confidence:** Medium.

### P3. Privacy teams are understaffed relative to the change rate
- **Industry:** Cross-industry. **User:** CPO/DPO.
- **Evidence:** ISACA 2025: technical privacy roles understaffed per **46%**, legal/compliance per **38%**. 2026 median team size **5** (**Supported**, see P1). IAPP: **80%** with added duties (**Supported**).
- **Pain / consequence:** Review queues, rubber-stamping, missed triggers.
- **Opportunity:** Triage automation that lets a 1–5 person privacy team cover hundreds of engineers. Only escalate what needs a human.
- **Confidence:** High.

### P4. Information-retrieval tax on knowledge workers
- **Industry:** Cross-industry. **User:** Everyone.
- **Evidence:** State of Teams 2025 (see A2) (**Verified**, vendor survey). Stack Overflow Developer Survey 2024: **61%** of developers spend more than 30 minutes a day searching for answers; **30%** say knowledge silos hit productivity 10+ times a week; **3 in 4** answer questions they've answered before ([SO 2024](https://survey.stackoverflow.co/2024/professional-developers), **Verified**).
- **Why tools fall short:** Rovo search addresses retrieval. The residual problem is *knowing to ask*.
- **Opportunity:** Proactive surfacing at the moment of work. Note: heavily targeted by native Rovo features and dozens of entrants (see 04).
- **Confidence:** High (problem). Low (differentiation).

### P5. Decisions are lost, relitigated or contradicted
- **Industry:** Software, product, business. **User:** Eng leads, PMs, architects.
- **Evidence:** McKinsey (survey of 1,228 managers, fielded 2018, published 2019): managers spend **37%** of their time on decisions, and **61%** say most of that time is used ineffectively ([McKinsey](https://www.mckinsey.com/capabilities/people-and-organization/our-insights/decision-making-in-the-age-of-urgency), **Verified**). Practitioner essays describe relitigating and contradicting decisions ([Tek42](https://tek42.io/blog/architecture-decision-records/), [Fabric](https://fabric.so/blog/your-codebase-is-documented-your-decisions-arent), **Supported/anecdotal**). A "26% of teams have formal ADR process" figure attributed to JetBrains appears in a DEV post but was **not verified**.
- **Native coverage:** Confluence Decision macro and decision log, Loom→Jira decision mapping (27 Jul 2026), Rovo "what did we decide…".
- **Confidence:** Medium (problem). **Very low differentiation** (≈20 Codegeist repos, see 04).

### P6. Repeat incidents and unfinished postmortem actions
- **Industry:** Software/IT ops. **User:** SRE, incident managers.
- **Evidence:** Dimensional Research (2022, 300+ on-call practitioners): **48% of production incidents are "straightforward and repetitive"**. Cited secondhand by [odd.fyi](https://odd.fyi/blog/article/incident-post-mortems-that-change-nothing-the-ritual-of-blameless-accountability/); **Supported**. Widely repeated "30–60% of action items never closed" figures have **no traceable methodology**, so they are not used here. Atlassian's 2024 State of Incident Management: post-mortems near-universal, only **22%** practise blameless ones (**Supported**).
- **Native coverage:** Rovo Ops similar incidents, PIR drafting, AI change risk (JSM Premium).
- **Confidence:** Medium. Low differentiation.

### P7. Procedures exist but aren't followed (operational outages)
- **Industry:** Data centres, IT ops, regulated operations.
- **Evidence:** Uptime Institute *Annual Outage Analysis 2025*: about 40% of organisations had a major human-error outage in three years. **85%** of those stem from staff failing to follow procedures or from flawed procedures. The share caused by not following procedures **rose 10 percentage points** year on year. **54%** say their last serious outage cost more than $100k; **1 in 5** more than $1M ([Uptime press release](https://uptimeinstitute.com/about-ui/press-releases/uptime-announces-annual-outage-analysis-report-2025), **Verified**).
- **Opportunity:** Procedure-aware gating (note: "Canon", "Gammes" Codegeist entries exist).
- **Confidence:** High (problem). Medium (Atlassian fit).

### P8. AI-accelerated delivery is reducing stability
- **Industry:** Software. **User:** Eng managers, platform teams.
- **Evidence:** DORA 2024: each **25% increase in AI adoption** is associated with an estimated **7.2% reduction in delivery stability** and a 1.5% reduction in throughput. 75.9% use AI for some work. Over a third report little or no trust in AI-generated code (secondary write-ups of the DORA report, e.g. [The New Stack](https://thenewstack.io/dora-2024-ai-and-platform-engineering-fall-short/); **Supported**).
- **Opportunity:** Give AI coding agents organisational guardrails (e.g. via `rovo:mcp`).
- **Confidence:** High (trend). Crowded (agent firewalls, context packs).

### P9. Release go/no-go decisions lack consolidated evidence
- **Industry:** Software. **User:** Release managers.
- **Evidence:** Practitioner pain; **Hypothesis**-level quantification. **Native:** JSM AI risk assessment (GA, Premium/Enterprise) and deployment gating ([Atlassian community](https://community.atlassian.com/forums/Jira-Service-Management-articles/AI-Risk-Assessment-is-now-generally-available-in-J/ba-p/3214684)).
- **Confidence:** Medium. **Extremely crowded** (~18 repos).

### P10. CAPA failures in medical-device and regulated manufacturing quality
- **Industry:** Medical devices, pharma, regulated manufacturing. **User:** Quality engineers, QA/RA managers.
- **Workflow:** Nonconformance or complaint → CAPA decision → investigation/RCA → actions → effectiveness check.
- **Evidence:** CAPA (21 CFR 820.100) is the **most-cited medical-device FDA 483 observation**, consistently across FY2022–FY2024. FY2025: **279** device 483 observations under 820.100(a) (10.5% of device citations) ([analysis](https://meddeviceguide.com/blog/fda-medical-device-warning-letter-trends-2024-2026-enforcement-analysis-guide), [Medical Device Academy](https://medicaldeviceacademy.com/tag/21-cfr-820-compliance/); **Supported**, derived from FDA's public data). QMSR (ISO 13485-aligned) carries CAPA forward.
- **Workaround:** eQMS suites (MasterControl, Veeva, ETQ, Qualio, Greenlight Guru), Jira-based QMS (SoftComply, Qity).
- **Consequence:** 483s, warning letters, recalls.
- **Confidence:** High (problem). **Crowded in Jira** (Qity Quality Events with a Rovo RCA agent, Clearlane CAPA, plus Codegeist "recurrence-radar" and "clean-point").

### P11. Recurring quality problems hidden across silos (NCRs, complaints, supplier issues)
- **Industry:** Manufacturing, automotive, med device.
- **Evidence:** ASQ rule of thumb: quality-related costs run **15–20% of sales** for many companies, up to 40% for poor performers (attributed to ASQ; it is a **rule of thumb, not survey data**) ([discussion](https://reliamag.com/articles/cost-of-poor-quality-scrap-rework-returns/)). Vendors (ComplianceQuest CQ.AI) market AI trend detection for this ([CQ](https://www.compliancequest.com/blog/why-capas-keep-missing-the-real-root-cause/)), which suggests demand exists.
- **Confidence:** Medium.

### P12. Product recalls at record scale
- **Evidence:** Sedgwick: **3,295 recalls** across five US sectors in 2025, with defective units up 26% to **858 million**. Medical-device recall units exceeded **490 million** (2nd-highest in 20 years). H1 2026 units **941.2 million**, on pace to pass 1 billion ([Claims Journal](https://www.claimsjournal.com/news/national/2026/02/26/335885.htm), [Risk & Insurance](https://riskandinsurance.com/2025-product-recalls-increase-amid-shifting-us-regulatory-landscape/); **Supported**).
- **Use:** Consequence evidence for quality/traceability problems.
- **Confidence:** High.

### P13. Automotive warranty cost
- **Evidence:** US-based manufacturers accrued **$31.0B** in warranty in 2024; the vehicle sector was 67% ($20.9B). Ford paid **$5.83B** in claims in 2024 ([Warranty Week](https://www.warrantyweek.com/archive/ww20250403.html), **Supported**).
- **Atlassian fit:** Weak. Warranty analytics live in PLM/ERP/QMS, not Jira.
- **Confidence:** High (problem). Low (fit).

### P14. Lessons-learned systems don't get used
- **Industry:** Aerospace, engineering, any project organisation.
- **Evidence:** NASA OIG IG-12-012 (Mar 2012): "NASA program and project managers rarely consult or contribute to LLIS". Only **12 of 28** PMs contributed. The system was called "not user friendly… outdated… generally unhelpful" ([NASA OIG](https://oig.nasa.gov/wp-content/uploads/2024/02/IG-12-012.pdf), **Verified**).
- **Insight:** Passive repositories fail. Knowledge must be **pushed into the workflow at the moment of decision**. This principle shapes our product design.
- **Confidence:** High.

### P15. Workforce turnover erodes operational knowledge (manufacturing)
- **Evidence:** Deloitte & The Manufacturing Institute (Apr 2024): US manufacturing may need **3.8M** workers 2024–2033, with **1.9M** potentially unfilled ([Deloitte](https://www2.deloitte.com/us/en/pages/about-deloitte/articles/press-releases/us-manufacturing-could-need-new-employees-by-2033.html), **Verified**). The link to *knowledge loss* is a **Hypothesis**.
- **Confidence:** Medium.

### P16. Security debt accumulates
- **Industry:** Software. **User:** AppSec, eng managers.
- **Evidence:** Veracode SoSS 2025 (~1.3M apps): flaw fix half-life rose to **252 days**. **50%** of organisations carry critical security debt, **70%** of it from third-party code ([BusinessWire](https://www.businesswire.com/news/home/20250227022178/en/Veracode-Reveals-Half-of-Organizations-Burdened-by-Critical-Security-Debt-with-70-Stemming-from-Third-party-Code-and-the-Software-Supply-Chain), **Supported**).
- **Crowding:** Several Codegeist security-triage apps ("bastion", "verdict-triage-copilot", "patchline").
- **Confidence:** High (problem). Medium (differentiation).

### P17. Plans are systematically optimistic (planning fallacy)
- **Industry:** All project work, software included.
- **Evidence:** Flyvbjerg & Gardner (*How Big Things Get Done*, 2023): of about 16,000 major projects, **47.9%** on budget, **8.5%** on budget and on time, **0.5%** on budget, time and benefits ([summary](https://thoughteconomics.com/te-quotes/bent-flyvbjerg-only-8-5-of-projects-meet-or-exceed-their-time-and-budget-e/), **Supported**). Caveat: these are megaprojects, so applying the numbers to software epics is an extrapolation. Reference-class forecasting is the method Flyvbjerg advocates.
- **Existing tools:** Throughput-based Monte Carlo Marketplace apps (55 Degrees, Clearlane Forecast, Broken Build); Empirical Forecasting (per-developer cycle-time sampling) ([Marketplace](https://marketplace.atlassian.com/apps/1237176/empirical-forecasting)).
- **Confidence:** High (general). Medium (software-epic specifics).

### P18. Accessibility conformance claims are outdated or unsupported
- **Industry:** B2B SaaS, public-sector suppliers, e-commerce.
- **User:** Product/accessibility leads, sales engineers, legal.
- **Workflow:** Enterprise and public buyers request an ACR/VPAT. Teams update a Word/Excel ACR occasionally.
- **Evidence:** WebAIM Million 2026: **95.9%** of top 1M home pages have detectable WCAG 2 failures (up from 94.8%), averaging **56.1 errors** per page ([summary](https://whatisada.com/blog/webaim-million-2026-analysis), **Supported**). The European Accessibility Act has applied since **28 Jun 2025**. Enforcement so far is mostly orders, plus first court judgments in France in 2026 (e.g. a Caen order with daily penalties) ([enforcement summary](https://www.allaccessible.org/blog/european-accessibility-act-one-year-on-2026-enforcement-update), **Supported**). EN 301 549 v4.1.1 (incorporating WCAG 2.2) is expected to be cited around 16 Dec 2026 (**Supported**, single source).
- **Existing tools:** Deque Axe Auditor/Monitor ACR generation, Level Access (services-led), **Remediator** (Jira Marketplace app generating ACRs from Jira data) ([Marketplace](https://marketplace.atlassian.com/apps/1235887/remediator-create-vpat-documents-from-your-data-in-jira)).
- **Confidence:** High (problem). Medium (differentiation).

### P19. Clinical handoff communication failures
- **Industry:** Healthcare. **User:** Clinicians, nursing leadership.
- **Evidence:** Joint Commission Sentinel Event Alert 58 (Sept 2017) on inadequate hand-off communication. The "80% of serious medical errors involve handoff miscommunication" figure is widely attributed to it, but the exact sentence **could not be confirmed** in the alert text (**Supported with caveat**) ([SEA 58 PDF](https://digitalassets.jointcommission.org/api/public/content/a05e74ef89484e2084b6511189b73a99?v=279f39cc)).
- **Atlassian fit:** **Poor.** Clinical handoffs happen in EHRs, and patient data in Jira is inappropriate. Rejected on safety and privacy grounds.
- **Confidence:** Medium (problem). Not pursued.

### P20. Regulated-software traceability burden (IEC 62304, ISO 14971, design controls)
- **Evidence:** Ketryx, a lifecycle platform layered on Jira and GitHub, has raised **>$55M** and claims use at 3–4 of the top 5 medtech companies ([SiliconANGLE](https://siliconangle.com/2025/09/04/ketryx-raises-39m-help-medical-device-makers-ship-safer-products-faster/), **Supported**). That is market validation for regulated work running on Jira.
- **Crowding:** Qity Design Control, R4J, Xray, plus ~6 Codegeist traceability repos.
- **Confidence:** High (problem). Low (differentiation).

### P21. Work disconnected from goals
- **Evidence:** State of Teams 2025: **7%** of executives feel confident they know how each team's work supports top goals (**Verified**, vendor survey).
- **Native coverage:** Atlassian Goals/Projects, Focus. Codegeist "vigie".
- **Confidence:** Medium.

### P22. Duplicate and overlapping work across teams
- **Evidence:** State of Teams 2025: **1 in 2** say teams often unknowingly work on the same tasks (**Verified**, vendor survey).
- **Native coverage:** Rovo duplicate detection and similar work items ([Atlassian support](https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-jira-software/)).
- **Confidence:** High (problem). Low (differentiation).

### P23. Customer promises vs. engineering reality (support → engineering)
- **Workflow:** Support agents promise fix dates. Engineering plans change. Nobody tells the customer.
- **Evidence:** **Hypothesis** (no quantitative source found).
- **Crowding:** "promise-keeper", "kept", "promise-ledger", "ripple-guard" Codegeist repos.
- **Confidence:** Low–medium.

### P24. Accountability for cloud cost changes (FinOps)
- **Workflow:** Cost anomalies are hard to attribute to the change, team and ticket that caused them.
- **Evidence:** **Hypothesis** for this analysis (FinOps Foundation surveys exist but were not inspected).
- **Atlassian fit:** Partial. Cost data is external, needs credentials or connectors, and is hard for judges to test.
- **Confidence:** Low.

---

## Part C — Cross-cutting insights for idea generation

1. **The highest-value gaps are "obligations created by ordinary work".** Privacy (P1–P3), accessibility (P18), quality (P10–P11), security (P16), procedures (P7). Each has a specialist function, a rulebook and a register, and each is blind to the Jira/Confluence stream that changes reality.
2. **Passive repositories fail; just-in-time intervention works** (P14 NASA LLIS). Products must act at the moment of work: a panel on the ticket, a gate on a transition, an answer inside the agent the user is already using.
3. **Specialist teams are shrinking while change accelerates** (P3, P8). Triage automation that reliably escalates *only* what matters is the economic core.
4. **Regulation increasingly requires before-the-fact assessments with evidence** (CCPA risk assessments, GDPR DPIA, EAA, FDA QMSR). That creates demand for **auditable decision records**, not just AI suggestions.
5. **Native Atlassian AI is covering generic context surfacing quickly** (P4, P5, P6, P9, P22). Building there means competing with the platform owner and with dozens of entrants.
