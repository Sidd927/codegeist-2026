# 04 — Competitive & Market Intelligence (Top 5 Survivors)

**Prepared:** 2026-11-22 · All sources accessed 2026-11-22
**Method:** For each survivor I checked (1) native Atlassian features, (2) the Atlassian Marketplace, (3) external SaaS, (4) open source, and (5) Codegeist 2026 public repos (222-repo sample; see 03 §0). Vendor claims are labelled as such. "Not inspected" means I read only a search summary, not product docs.

---

## 0. Native Atlassian features that shape *every* idea (Verified)

| Native capability | What it does | Plan / status | Source |
|---|---|---|---|
| Rovo duplicate detection on create; "link similar work items"; related Confluence content | Surfaces similar work as you create/edit | Rovo-enabled Jira | [Atlassian support](https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-jira-software/) |
| Rovo Ops (formerly Ops Guide) | Incident investigation, likely root cause, auto-drafted post-incident reviews, similar incidents, suggested responders | JSM + Rovo | [Atlassian guide](https://www.atlassian.com/collections/service/guides/incident-management-aiops), [JSM AI blog](https://www.atlassian.com/blog/announcements/jira-service-management-agentic-ai) |
| JSM AI risk assessment for changes | Risk level, narrative and mitigations from change history and linked incidents | **GA**, JSM Premium/Enterprise | [Community GA post](https://community.atlassian.com/forums/Jira-Service-Management-articles/AI-Risk-Assessment-is-now-generally-available-in-J/ba-p/3214684) |
| JSM deployment gating | Gate CI/CD deployments on change risk | JSM Premium | [JSM ITSM features](https://www.atlassian.com/software/jira/service-management/features/itsm) |
| Code Reviewer (ex-Rovo Dev code review) | Reviews PRs, checks Jira acceptance criteria | Moving to Rovo credits on 3 Dec 2026 | [Atlassian support](https://support.atlassian.com/rovo/docs/activate-code-reviews-in-your-repository/) |
| Loom → Jira decision mapping | Rovo maps meeting decisions/actions to work-item update suggestions | Released 27 Jul 2026; Standard+ with Rovo + Loom AI | [Jira launch notes](https://jirareleases.atlassian.com/announcements/your-meeting-decisions-already-updated-in-jira) |
| Atlassian Guard Detect + classification rules | Detects sensitive data (credentials, financial, identity/PII) **inside Jira/Confluence content**; auto-classifies; full-site scan (Jun 2026) | Guard Premium | [Guard Detect](https://support.atlassian.com/security-and-access-policies/docs/what-is-guard-detect/), [Cloud changes Jun 2026](https://confluence.atlassian.com/cloud/blog/2026/06/atlassian-cloud-changes-jun-1-to-jun-8-2026) |
| Confluence Decision macro / decision log | Inline decisions plus space-level report | All plans | (product feature) |

**Key distinction for the primary idea:** Guard Detect finds personal data *stored in* Atlassian content (DLP). It does **not** assess whether a *planned product feature* creates new personal-data processing for the customer's own product. These are different problems with different buyers (Atlassian admin/security vs. DPO).

---

## 1. Survivor C7: Article25 (privacy-by-design screening)

### Direct competitors (same job: detect and assess privacy impact of planned or changed processing)
| Product | Approach | Strengths | Weaknesses vs. our wedge | Evidence |
|---|---|---|---|---|
| **OneTrust** (PIA/DPIA Automation) | Enterprise GRC. Questionnaire-driven assessments. Event-triggered assessments. **Pre-built Jira connector**. Customer story: a Jira risk tag triggers a 5-question PIA. | Market leader, breadth, templates | Triggers depend on configured tags or questionnaires (self-reporting). Enterprise pricing (not public). Assessment lives outside Jira. | [OneTrust PIA overview](https://my.onetrust.com/s/article/UUID-f5ba6a6d-2ac5-ea2b-5998-3d3bb9ada5e1?language=en_US), [Web.com story](https://www.onetrust.com/customers/web-com/) |
| **Privado.ai** | Code scanning (repos, web, mobile, third-party) builds data maps and ROPA. **"Agentic Assessments"** fill PIAs/DPIAs from documents (Oct 2025). | Ground truth from code; AI assessments | Sees **code**, i.e. after implementation starts. Needs repo access. Separate platform. | [BusinessWire Oct 2025](https://www.businesswire.com/news/home/20251028220929/en/Privado.ai-Launches-AI-Agents-to-Automate-Manual-Privacy-Assessments-and-Data-Maps), [Privado](https://www.privado.ai/platform) |
| **Relyance AI** | Code + contract + runtime data-flow mapping | Lineage to AI models | Same "after code" timing. Enterprise. | [Ethyca comparison (marketing)](https://www.ethyca.com/ethyca-vs-relyance-ai) |
| **Ethyca / Fides** (open-source core) | Privacy-as-code. Policy linting in CI/CD blocks PRs. | Developer-native enforcement | Requires annotating systems in code/YAML. PR-time, not plan-time. Engineering-centric. | [Ethyca comparison (marketing)](https://www.ethyca.com/ethyca-vs-privado-ai) |
| TrustArc, Securiti, Transcend, DataGrail | Privacy management suites | Breadth | Not inspected in depth; generally separate platforms and enterprise pricing | Not inspected |

### Indirect / adjacent
| Product | Relation |
|---|---|
| **Unicis RPA for Jira** (Marketplace) | Manual ROPA inventory in Jira. No detection from work items. ([listing](https://marketplace.atlassian.com/apps/1228855/unicis-record-processing-activities-rpa-for-jira)) |
| **Actonic Data Protection Toolkit** (Marketplace) | Scans and redacts PII stored in Jira/Confluence (DLP). Different job. ([listing](https://marketplace.atlassian.com/apps/1218962/data-protection-and-security-toolkit-for-jira-dlp)) |
| **Atlassian Guard Detect** | Sensitive-data detection in content. Different job (see §0). |
| **Rovo agents / Studio** | A customer could prompt a custom agent to "review this epic for privacy". Without an inventory, rules, gating, routing or audit, that is a one-off opinion, not a programme. |
| Confluence templates (DPIA/ROPA) | Static documents with no linkage to work. |

### Codegeist 2026 overlap
- **None found** for DPIA, GDPR, privacy-by-design, ROPA or personal-data screening (5 keyword searches, plus a scan of 222 repo descriptions).
- Adjacent: "72hours" (breach-notification deadlines in JSM), "citecheck-forge" (legal citation checking), "controlproof" (ISO 27001/SOC 2/NDPA audit readiness), "placard-wiki" (secrets/PII *stored* in Confluence). None screens planned work for privacy impact.
- **Residual risk:** private repos; ideas appearing after 22 Nov. **Re-scan weekly.**

### Underserved needs (gap)
1. **Plan-time detection without self-reporting.** Every competitor either waits for code (Privado, Relyance, Fides) or relies on people to trigger a questionnaire (OneTrust).
2. **Mid-market privacy teams of 1–5 people** (ISACA median 5) who cannot buy or run enterprise GRC.
3. **Assessment evidence where the work lives.** The decision, conditions and approver recorded on the Jira work item and the register in Confluence, ready for CCPA attestation counts.
4. **Data residency of the privacy tool itself.** A "Runs on Atlassian" app means product plans don't get copied to another vendor. That is a real argument for privacy buyers (Hypothesis: buyers value it; consistent with Atlassian's own positioning of the Runs on Atlassian programme).

### Differentiation strategy
- **Position:** "The privacy triage layer for teams that plan in Jira." Complementary to code scanners (we catch it at the epic; they confirm it in code) and a lightweight alternative to OneTrust intake for the mid-market.
- **Moats over time:** a tuned taxonomy and rules library (WP248, CCPA §7150, India DPDP, Australian Privacy Act packs), a vendor/processor dictionary, labelled screening data improving precision, and connectors to code scanners (P2).

---

## 2. Survivor C8: Living ACR (accessibility conformance)

| Competitor | Type | What it does | Weakness vs. our idea | Evidence |
|---|---|---|---|---|
| **Remediator** (Heaps Good Software) | **Direct, Jira Marketplace** | Adds accessibility custom fields. Generates an ACR from a Jira project. v3.10 (May 2025) supports multiple criteria per work item. 508/EN support "coming". | Manual tagging. No AI mapping or regression detection visible on the listing. | [Marketplace](https://marketplace.atlassian.com/apps/1235887/remediator-create-vpat-documents-from-your-data-in-jira) |
| **Deque** (Axe Auditor / Monitor) | Direct (enterprise) | ACR/VPAT generated from audits, with review/approval/versioning. Claims "up to 90% faster" in Monitor. | Separate platform; audit-centric. | [Deque docs](https://docs.deque.com/auditor/2.33/en/vpat-generation-overview/), [blog](https://www.deque.com/blog/how-to-choose-the-right-vpat-approach-for-your-organization/) |
| **Level Access** | Direct (services) | Services-led VPATs. "AI VPAT Previews" not suitable for procurement. | Expensive; slow. | [Level Access](https://client.levelaccess.com/hc/en-us/articles/32558268449431-Level-Access-VPAT-Process) |
| Codegeist: clearpage, JSM accessibility checker | Adjacent | Page/portal checks | Not ACR | GitHub |

**Gap:** a continuously current, release-bound ACR with regression alerts, built from the Jira work stream. **Differentiation weakness:** Remediator already owns "ACR from Jira" on the Marketplace. Our wedge (AI mapping plus regression alerts) is incremental. **Verdict:** viable backup, moderate novelty.

---

## 3. Survivor C6: CAPA Signal (quality recurrence)

| Competitor | Type | Notes | Evidence |
|---|---|---|---|
| **Qity, Quality Events for Jira** | **Direct, Marketplace, Runs on Atlassian** | CAPA, NC, deviations, concessions as Jira work items. Part 11 e-signatures. Automated IQ. Heatmaps and warnings. **Rovo "Root Cause Analysis Assistant" using Teamwork Graph**. Companion Design Control and Safety Risk apps. 17 installs; v3.1.0 (14 Oct 2026). | [Marketplace](https://marketplace.atlassian.com/apps/3669831043/quality-events-for-jira) |
| **Clearlane CAPA** | Direct (Forge, "coming soon") | Containment, root cause, signed action plan, dated effectiveness check | [Clearlane](https://clearlaneapps.com/capa/) |
| **SoftComply eQMS** | Direct (Confluence/Jira) | ISO 13485 / 21 CFR 820 templates, Quality Manager in Jira | [SoftComply](https://softcomply.com/product/eqms/) |
| **ComplianceQuest CQ.AI** | Direct (Salesforce-native) | AI trend detection, recurrence patterns, investigation assistant | [CQ](https://www.compliancequest.com/blog/why-capas-keep-missing-the-real-root-cause/) |
| MasterControl, Veeva, ETQ, Qualio, Greenlight Guru | Incumbent eQMS | Mature; AI claims vary (not inspected) | [SafetyIQ roundup](https://www.safetyiq.com/blog/top-best-capa-corrective-and-preventive-action-software) |
| Codegeist: **recurrence-radar** ("spots repeat deviations and CAPAs that didn't work"), clean-point (8D lead in Rovo) | Direct entrants | Same wedge as ours | GitHub |

**Verdict:** the recurrence/effectiveness wedge **is already claimed** by at least one Codegeist entrant and partially by Qity and CQ. **Low differentiation.**

---

## 4. Survivor C5: Outside View (reference-class forecasting)

| Competitor | Approach | Gap vs. our idea | Evidence |
|---|---|---|---|
| 55 Degrees Portfolio Forecaster, Clearlane Forecast, Broken Build Monte Carlo | Throughput-based Monte Carlo | No similarity-based reference class; no slip causes | [Clearlane Forecast](https://marketplace.atlassian.com/apps/2182518116/clearlane-forecast-monte-carlo-release-dates-for-jira), [55 Degrees](https://www.55degrees.se/blog/post/monte-carlo-simulations-and-forecasting) |
| Empirical Forecasting | Samples per-developer, per-estimate cycle times. Claims "up to 90% less error" in backtests (vendor claim). | Issue-level, not epic reference class | [Marketplace](https://marketplace.atlassian.com/apps/1237176/empirical-forecasting) |
| path-to-prod (OSS Obsidian plugin) | Finds up to 20 comparable tickets per stage plus Monte Carlo | Ticket-level; not Atlassian-native | [GitHub](https://github.com/alex3l3t33/path-to-prod) |
| Jira Plans (native) | Capacity scheduling | No empirical calibration | — |
| Codegeist: due-date-check ("realistic dates from your team's own history"), atlassian-blackbox (Monte Carlo from sprint history), hindsight/forewarned (pre-mortems) | Partial overlap | — | GitHub |

**Gap:** epic-level reference class plus causal explanations plus mitigations. **Weakness:** partial overlap, and the judge-testability problem (05).

---

## 5. Survivor C9: Device PSIRT (regulated postmarket cybersecurity)

| Competitor | Notes | Evidence |
|---|---|---|
| Finite State, Cybellum, MedCrypt | Dedicated device/product security platforms with SBOM and vulnerability management | Not inspected (general market knowledge). Treat as **Unverified** detail. |
| Codegeist: patchline (vuln → affected shipped versions from Jira), bastion (daily CVE sweep), verdict-triage-copilot | Generic vulnerability triage entrants | GitHub |
| JSM (native) | PSIRT intake possible; no SBOM matching | — |

**Gap:** a regulatory decision trail inside Jira/JSM for small device makers. **Weaknesses:** heavy external-data dependency, domain depth, and strong specialist incumbents.

---

## 6. Comparison matrix (five survivors)

| Dimension | **C7 Article25** | C8 Living ACR | C6 CAPA Signal | C5 Outside View | C9 Device PSIRT |
|---|---|---|---|---|---|
| Native Atlassian overlap | **None** (Guard Detect is a different job) | None | None | Low (Plans) | Low |
| Marketplace direct competitors | **None found** (Unicis manual ROPA; Actonic DLP) | **Remediator** | **Qity**, SoftComply; Clearlane soon | Several forecasting apps | None found |
| External SaaS | OneTrust, Privado, Relyance, Fides | Deque, Level Access | CQ, MasterControl, Veeva… | LinearB-type tools | Finite State, Cybellum, MedCrypt |
| Codegeist overlap (sample) | **0** | 0 (ACR) | 2 | 2–4 partial | ~3 generic |
| Our wedge | Plan-time, Atlassian-native, rules + evidence + gate + register | AI mapping + regression | Cross-silo recurrence | Epic reference class + causes | Jira-native regulatory trail |
| Wedge defensibility | **High** for the hackathon; medium long-term (taxonomy, rules and labelled data accrue) | Low–medium | Low | Medium | Medium |
| Market evidence of willingness to pay | Strong (privacy-tech spend; OneTrust/Privado/Relyance funding and customers) | Moderate (VPAT services market) | Strong (eQMS market) | Moderate | Moderate |
| Judge-testable on a fresh site | **Yes** (seeded register + new epic) | Yes | Yes | **Weak** (needs history) | Partial (external feeds) |

## 7. Conclusions carried forward
1. **C7 Article25 has the clearest white space**: no native feature, no Marketplace equivalent, no observed Codegeist entrant, and a fresh regulatory driver (CCPA risk assessments from 1 Jan 2026).
2. **C8** is viable but competes with an existing Marketplace app.
3. **C6** is now crowded in exactly our wedge.
4. **C5** is innovative but hard for judges to test.
5. **C9** is credible but external-data heavy, with strong specialist incumbents.

## 8. Honesty notes
- "None found" ≠ "none exist". Searches cover public sources on 2026-11-22.
- OneTrust, TrustArc, Securiti, Transcend and DataGrail internals were not inspected. Their AI capabilities may overlap more than stated. **Our claim is about placement (plan-time, in Jira, Atlassian-native), not about being the first to use AI in privacy assessments.** Privado already markets AI agents for assessments.
