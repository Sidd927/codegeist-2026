# 03 — Initial Idea Portfolio: Generate, Then Destroy

**Prepared:** 2026-11-22

## 0. How this portfolio was built (and a critical finding)

Ideas came from the problem catalogue (02), the platform constraints (01, 05) and the native-feature audit (04). Before scoring, **every idea was checked against the competition actually forming for Codegeist 2026**:

- Using the GitHub API, I collected **222 public repositories** that self-identify as Codegeist 2026 entries or are clearly Forge apps built for it (queries: "codegeist 2026", "codegeist2026", "codegeist forge rovo", plus domain keywords; run 2026-11-22). This is a **sample**: private repos and teams without public code are invisible. Treat counts as lower bounds.
- **Finding:** many teams are converging on the same ideas, in several cases with **identical names**. At least **9 repos are called "Precedent"** and implement decision memory with conflict detection, a Rovo agent, MCP and Teamwork Graph. The likely cause (Hypothesis): many entrants used AI assistants with similar prompts, which produce similar "best ideas". **Any idea an LLM proposes easily should be presumed crowded until checked.**

Observed clusters (lower bounds, from repo names and descriptions):

| Cluster | ≈ public repos | Examples |
|---|---:|---|
| Decision memory / decision–work conflict detection | **~20** | 9× precedent, decision-ledger, decision-drift-guard, decision-catch, decision-receipt, Tether, Accord, anticipate, decided, decision-memory, decision-keeper, premise, loadbearing |
| Release readiness / ship gates / blast radius | **~18** | 6× ShipCheck, ShipGuard ×3, shipsignal, shipscope, shipsure, ship-confidence, releasegate, release-gate, shipgate, blast-radius, rayon-impact |
| Issue/ticket triage agents | **~12** | TriageLens ×3, TriagePilot, TriageMate, triage-guide, triage-copilot, Jira Clarity |
| Incident memory / pre-mortems from history | **~10** | deja-vu, incident-time-machine, incident-context-copilot, hindsight ×2, forewarned, scar-tissue, tripwire, change-suspects, postmortem-pilot |
| Handoffs / bus factor | **~7** | relay ×2, baton, HandoffIQ, handoff-brief, understudy, handover (bus-factor radar) |
| Regulated-software traceability | **~6** | traceguard, tracewell ×2, trace, change-radius, heliotrope |
| AI-agent guardrails / firewalls | **~6** | warden, vetoreview, agent-change-gate, ticket-conductor-safety, permis-forge, keybroker |
| Doc drift / stale knowledge | **~5** | driftcheck, the-page-is-lying, ripple, golden-set, cold-read |
| Standups / sprint health | **~7** | standup-digest, standup-compass, sprint-doctor, sprint-guardian, sprint-scout, sprintlens, sprint-autopsy |
| Customer promises vs. engineering | **~4** | promise-keeper, kept, promise-ledger, ripple-guard |
| Finance / audit evidence | **~6** | closeproof, close-context, tickmark, controlproof, policy-compliance-copilot, recoup |
| Quality / CAPA (specialised) | **~2** | recurrence-radar, clean-point |
| Healthcare ops (specialised) | **~4** | recallradar, imaging-incident-triage, docarion, lab-qc |
| **Privacy-by-design / DPIA / ROPA** | **0 found** | (keyword searches "DPIA", "GDPR", "privacy by design", "ROPA", "personal data" returned no Codegeist entries) |
| **Accessibility conformance reports (ACR/VPAT)** | **0 found** | (only page/portal checkers: clearpage, JSM accessibility checker) |

## 1. Screening rubric used in this document

Quick screen, 1–5 each (5 = best): **Problem** (evidence and severity) · **Distinct** (vs. native features, Marketplace and observed Codegeist entries) · **Context** (does Atlassian context drive the value?) · **Feasible** (30 days, verified APIs) · **Demo** (obvious in 3–4 minutes, judge-testable). Max 25. Survivors need ≥ 18 **and** no disqualifying flaw.

---

## 2. The candidates (18)

Each candidate lists the 18 required fields compactly, then a rejection analysis.

---

### C1. Precedent: decision memory and conflict radar
1. **Pitch:** Harvests decisions (Confluence decision items, ADRs, Jira comments) into a governed ledger and flags new work that contradicts an active decision.
2. **Category:** Software / Business. 3. **Problem:** P5. 4. **User:** Eng leads, PMs. 5. **Use case:** "This epic re-introduces on-prem support, which we decided against in March."
6. **Alternatives:** Confluence Decision macro, Loom→Jira decision mapping, Rovo search, Simple Decision Log (Marketplace, 4 installs), Cloverpop, DecisionLedger AI.
7. **Different:** Proactive conflict detection, supersession blast radius, MCP guardrails for coding agents.
8. **Why Atlassian:** Decisions and work live there. 9. **Forge:** Triggers, issue panel, Confluence ADF parsing (`decisionItem` is a real ADF node, **Verified**), Rovo agent, `rovo:mcp`.
10. **AI:** Semantic conflict judgement. 11. **MVP:** Ledger, harvester, conflict panel, agent. 12. **Complexity:** Medium. 13. **Risks:** False positives, cold start. 14. **Impact:** Moderate, hard to quantify. 15. **Demo:** Strong. 16. **Bonus:** Agents/MCP/TWG. 17. **Long-term:** Moderate.
- **For:** Literally matches the challenge text ("what's already been decided").
- **Against:** **~20 public Codegeist repos build this, 9 with the same name.** Native capture is growing.
- **Technical risk:** Conflict precision. **Product risk:** Low pull for passive logs (4 installs on the closest Marketplace app).
- **Likely judge rejection:** "I've seen this 15 times this round."
- **Screen:** Problem 3 · Distinct **1** · Context 5 · Feasible 4 · Demo 5 = 18. **Disqualifying flaw: saturation. REJECTED.**

### C2. ShipConfidence: release readiness gate
- **Pitch:** Evidence-based go/no-go score for a Jira version (PRs, builds, open blockers, incidents, docs).
- **Alternatives:** **JSM AI risk assessment (GA) + deployment gating (Premium)**, Jira release hub, LinearB, Sleuth.
- **For:** Theme-perfect ("ship with confidence"). **Against:** **~18 repos**, native overlap, the category description literally suggests it ("deployment awareness").
- **Screen:** 3 · **1** · 4 · 4 · 4 = 16. **REJECTED.**

### C3. Scar Tissue: incident learnings pushed to future work
- **Pitch:** Turn postmortem lessons into guardrails surfaced on new tickets and PRs. Verify that action items prevented recurrence.
- **Alternatives:** **Rovo Ops** (similar incidents, PIR drafting), JSM change risk using linked incidents, incident.io, FireHydrant.
- **For:** NASA LLIS lesson (push, don't store). **Against:** ~10 repos (scar-tissue, tripwire, hindsight…). Atlassian is building directly here.
- **Screen:** 3 · 2 · 5 · 4 · 4 = 18. **Flaw: platform owner moving in, plus crowding. REJECTED.**

### C4. Pre-mortem generator for epics
- **Pitch:** At epic kickoff, build a risk register from similar past epics and incidents.
- **Against:** hindsight ×2, forewarned. LLM-generated risk lists feel generic unless grounded in rich history, which judges' sites won't have.
- **Screen:** 3 · 2 · 4 · 3 · 3 = 15. **REJECTED** (merged into C5's evidence base).

### C5. Outside View: reference-class forecasting for epics
1. **Pitch:** When an epic is planned, find the most similar epics your organisation actually shipped, show how long they really took and why they slipped, and propose a calibrated date plus mitigations.
2. **Category:** Software / Business (any project team). 3. **Problem:** P17. 4. **User:** EMs, PMs, PMO. 5. **Use case:** "You estimated 6 weeks; the 9 most similar epics took a median of 11; 6 of 9 slipped waiting on Platform approvals. Add the dependency now."
6. **Alternatives:** Throughput Monte Carlo apps (55 Degrees, Clearlane Forecast, Broken Build), Empirical Forecasting, Jira Plans. Codegeist: due-date-check, atlassian-blackbox.
7. **Different:** Similarity-based reference class at the epic level plus causal slip explanation from changelogs.
8. **Why Atlassian:** Jira history *is* the reference class. 9. **Forge:** Jira search/changelog APIs, issue panel, global page, scheduled indexing in KVS/SQL.
10. **AI:** Similarity (embeddings or lexical), slip-cause summarisation from comments. Statistics are deterministic. 11. **MVP:** Indexer, reference-class panel, forecast distribution, causes, "apply date + create risk items".
12. **Complexity:** Medium-high. 13. **Risks:** Needs history. **REST cannot backdate timestamps**, so judges' fresh sites have no history. Small samples. 14. **Impact:** High if accurate. 15. **Demo:** Very strong. 16. **Bonus:** Agents. 17. **Long-term:** Good (portfolio planning).
- **For:** Grounded in decades of forecasting research. Visually memorable.
- **Against:** Judge-testability is poor without history. Two partial Codegeist analogues.
- **Technical risk:** Demo data requires CSV import with dates. **Product risk:** Accuracy on sparse data.
- **Screen:** 4 · 3 · 4 · 3 · 4 = 18. **SURVIVES to top 5.**

### C6. CAPA Signal: cross-silo recurrence and effectiveness engine (Specialised)
1. **Pitch:** For quality teams running NCRs, complaints and CAPAs in Jira: cluster related events across silos, detect recurrence after CAPA closure (failed effectiveness), and propose one systemic CAPA with evidence.
2. **Category:** Specialized (med device, manufacturing). 3. **Problem:** P10–P12. 4. **User:** Quality engineers, QA/RA. 5. **Use case:** Three NCRs in different departments share a supplier lot. CAPA-104, closed last month, failed.
6. **Alternatives:** MasterControl, Veeva, ETQ, ComplianceQuest CQ.AI (AI trend detection), **Qity Quality Events for Jira** (Rovo RCA agent + TWG, Part 11 e-signatures), Clearlane CAPA (Forge, upcoming), SoftComply.
7. **Different:** Recurrence and effectiveness analytics native to Jira.
8. **Why Atlassian:** Quality events plus engineering work plus SOPs in one graph. 9. **Forge:** Triggers, panels, SQL, Rovo agent.
10. **AI:** Clustering, RCA drafting. 11. **MVP:** Event model, clustering, recurrence detection, CAPA proposal. 12. **Complexity:** Medium. 13. **Risks:** Domain authenticity, Part 11 expectations. 14. **Impact:** High (FDA data). 15. **Demo:** Good. 16. **Bonus:** Agents. 17. **Long-term:** Moderate (competitive).
- **For:** Strongest hard evidence (FDA 483 data). Specialized category may be less crowded.
- **Against:** A credible Forge competitor (Qity) is already listed. Two Codegeist analogues (recurrence-radar does exactly "repeat deviations and CAPAs that didn't work").
- **Screen:** 5 · 2 · 4 · 4 · 4 = 19. **SURVIVES to top 5 (with a differentiation warning).**

### C7. Article25: privacy-by-design screening in the backlog
1. **Pitch:** Every new or changed epic, story and PRD is screened for personal-data impact. Evidence-cited findings are checked against your record of processing and vendor register, deterministic DPIA/CCPA trigger rules decide what needs review, and DPO approvals are routed, gated and recorded.
2. **Category:** Business (legal) or Software. 3. **Problem:** P1–P3. 4. **User:** DPO/privacy counsel (buyer), PMs and engineers (daily users). 5. **Use case:** A PM adds "session replay via a new analytics vendor" to an epic. Article25 flags a new processor not in the register, possible special-category capture, and 2 WP248 criteria, so a DPIA is likely needed. It blocks "Ready for dev", files a prefilled review, and proposes the ROPA update.
6. **Alternatives:** OneTrust (Jira integration, enterprise), TrustArc, Securiti, code-scanning mappers (Privado, Relyance, Fides), Unicis RPA for Jira (manual inventory), Actonic DLP (scrubs PII from Jira data), Atlassian Guard Detect (sensitive data *in content*, not product designs).
7. **Different:** Automatic, event-driven detection at **plan time** inside Jira/Confluence, plus an inventory-aware diff, plus deterministic legal-trigger rules, plus auditable decisions and register updates.
8. **Why Atlassian:** Plans (epics/PRDs), vendor choices, the register (Confluence) and the DPO queue (Jira/JSM) are all there.
9. **Forge:** Jira/Confluence triggers, async queue, issue panel, workflow validator (Preview), global page, Forge SQL, Forge LLM, Rovo agent + skill, `rovo:mcp`, TWG for owners and reviewers.
10. **AI:** Structured extraction with verbatim evidence (LLM). Decisions are deterministic. 11. **MVP:** Screening pipeline, panel, register, review queue, gate, ROPA publish, agent.
12. **Complexity:** Medium-high. 13. **Risks:** Extraction precision, legal-advice perception, judge setup of the gate. 14. **Impact:** Broad: every org handling personal data; CCPA attestations from 2028. 15. **Demo:** Strong and concrete. 16. **Bonus:** Agents, MCP, TWG. 17. **Long-term:** Strong Marketplace fit (privacy budgets exist; mid-market underserved).
- **For:** Uncrowded in Codegeist (0 found). Fresh regulatory driver (CCPA risk assessments live since 1 Jan 2026). Specialist teams shrinking (ISACA). Context is essential.
- **Against:** "Compliance" can feel dry. AI on legal topics invites scepticism.
- **Technical risk:** Extraction accuracy on terse tickets. **Product risk:** False-positive fatigue for PMs.
- **Likely judge rejection:** "Is this legal advice? Will privacy teams trust it?" (answered by deterministic rules, evidence and the DPO deciding).
- **Screen:** 5 · 5 · 5 · 4 · 4 = **23. SURVIVES (top candidate).**

### C8. Living ACR: accessibility conformance from Jira evidence
1. **Pitch:** Maintain a per-release Accessibility Conformance Report whose WCAG 2.2 conformance levels are derived from Jira accessibility issues and audits. Detect regressions in claimed criteria and generate VPAT 2.5-format Confluence pages.
2. **Category:** Business (sales/legal) or Software. 3. **Problem:** P18. 4. **User:** Accessibility lead, sales engineer, legal. 5. **Use case:** A new contrast bug regresses SC 1.4.3 from "Supports" to "Partially supports". The release ACR draft updates and sales sees the current claim.
6. **Alternatives:** Deque Axe Auditor/Monitor, Level Access, **Remediator** (Jira Marketplace ACR generator using custom fields).
7. **Different:** AI mapping of free-text issues to success criteria, regression alerts, release-bound versions, Rovo answers for sales.
8. **Why Atlassian:** Accessibility work is tracked in Jira, ACRs published in Confluence. 9. **Forge:** Triggers, panels, global page, Confluence publish, SQL, Rovo.
10. **AI:** Issue→SC classification, remark drafting. Roll-up is deterministic. 11. **MVP:** SC taxonomy, mapping, roll-up, ACR page, regression alert.
12. **Complexity:** Medium. 13. **Risks:** Narrower audience; Remediator exists. 14. **Impact:** Sales-blocker and legal. 15. **Demo:** Good. 16. **Bonus:** Agents. 17. **Long-term:** Good (EAA, WCAG 2.2).
- **Screen:** 4 · 3 · 4 · 5 · 4 = 20. **SURVIVES to top 5.**

### C9. Device PSIRT: postmarket cybersecurity for regulated devices (Specialised)
1. **Pitch:** Map new CVEs to each device version's SBOM components, assess exploitability and safety impact, and drive the regulatory decision and customer communication workflow in JSM/Jira.
2. **Category:** Specialized (medical devices; automotive UN R155 variant). 3. **Problem:** P16 plus FDA §524B postmarket obligations (**Supported**, not deeply verified here). 4. **User:** Product security / RA. 5. **Use case:** A new OpenSSL CVE affects device firmware 3.2. The app opens a triage case with affected versions, risk scoring and a reporting-decision checklist.
6. **Alternatives:** Finite State, Cybellum, MedCrypt (**Supported**, not inspected). Codegeist: patchline, bastion (generic).
7. **Different:** Jira-native PSIRT with a regulatory decision trail. 8. **Why Atlassian:** JSM for PSIRT intake, Jira for fixes. 9. **Forge:** Scheduled trigger, external fetch (OSV/NVD), Assets or SQL SBOM store, panels.
10. **AI:** Exploitability/context summarisation. 11. **MVP:** SBOM import, CVE matching, triage case. 12. **Complexity:** High. 13. **Risks:** External data, domain depth, safety claims. 14. **Impact:** High but niche. 15. **Demo:** Moderate. 16. **Bonus:** Agents. 17. **Long-term:** Niche, with strong incumbents.
- **Screen:** 4 · 4 · 3 · 3 · 3 = 17. Borderline. **Kept as 5th for deeper analysis** (to test whether a specialised play beats a business play).

### C10. Knowledge-concentration (bus-factor) radar
- **Pitch:** Use TWG to find components or topics where one person holds all the knowledge.
- **Against:** "handover-codegeist: bus-factor radar" exists. TWG rate limits (~128 calls / 20 s reported) make org-wide scans slow. Sensitive "people-risk" framing.
- **Screen:** 3 · 2 · 5 · 2 · 3 = 15. **REJECTED.**

### C11. Context handoff kit (leave / role change)
- **Against:** ~7 repos. Rovo can summarise "my work".
- **Screen:** 3 · 1 · 5 · 4 · 4 = 17. **REJECTED (saturation).**

### C12. Doc-reality drift detector
- **Against:** driftcheck, the-page-is-lying, ripple, golden-set. **Screen:** 3 · 2 · 5 · 3 · 4 = 17. **REJECTED.**

### C13. Goal alignment auditor
- **Against:** Native Atlassian Goals/Projects/Focus. Codegeist "vigie". Executives' problem, so a hard demo. **Screen:** 3 · 2 · 4 · 4 · 3 = 16. **REJECTED.**

### C14. Cross-team commitment ledger
- **Against:** Tether, promise-keeper, kept, ripple-guard. Weak evidence. **Screen:** 2 · 2 · 4 · 4 · 4 = 16. **REJECTED.**

### C15. AI triage agent
- **Against:** Native Rovo features plus ~12 repos. Classic "AI wrapper". **Screen:** 3 · 1 · 3 · 5 · 3 = 15. **REJECTED.**

### C16. SOC 2 / ISO 27001 audit evidence assembler
- **Against:** Vanta and Drata dominate. Codegeist controlproof, tickmark. **Screen:** 3 · 2 · 4 · 4 · 3 = 16. **REJECTED.**

### C17. Hospital device recall matcher
- **Against:** recallradar exists. Hospitals run CMMS, not Jira. Weak Atlassian fit. **Screen:** 4 · 2 · 2 · 4 · 3 = 15. **REJECTED.**

### C18. FinOps cost-change attribution
- **Against:** External billing data and credentials. Judges cannot test without cloud accounts. Weak evidence collected. **Screen:** 3 · 4 · 3 · 2 · 2 = 14. **REJECTED.**

### Also considered and dropped quickly
- **AI-agent action firewall:** ~6 repos (warden, vetoreview…).
- **Clinical handoff tool:** patient data in Jira is unsafe and inappropriate; poor fit.
- **EU AI Act use-case register:** regulatory timeline in flux (Digital Omnibus delay proposals). Better as a P2 "pack" on C7's screening engine than as a standalone.
- **Automotive warranty analytics:** data lives in PLM/ERP, not Jira.

---

## 3. Structured rejection analysis for the strongest rejected ideas

| Idea | Strongest argument for | Strongest argument against | Most serious technical risk | Most serious product risk | Biggest differentiation weakness | Most likely judge rejection | Survive? |
|---|---|---|---|---|---|---|---|
| C1 Precedent | Theme-literal | ~20 clones | Conflict precision | Passive logs have low pull | Identical entries | "Seen it many times" | **No** |
| C2 ShipConfidence | Theme-literal | Native JSM gating | Integrating many signals | Release managers already have JSM | ~18 clones | "JSM does this" | **No** |
| C3 Scar Tissue | NASA lesson | Rovo Ops | History needed | Atlassian roadmap overlap | ~10 clones | "Rovo Ops covers it" | **No** |
| C10 Bus factor | TWG-native | TWG rate limits | Scan cost | People-risk sensitivity | Existing entry | "Creepy / incomplete" | **No** |
| C15 Triage | Easy | Wrapper | None | None | Native + clones | "Shallow wrapper" | **No** |

## 4. Screening scores

| # | Idea | Problem | Distinct | Context | Feasible | Demo | **Total /25** | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| C7 | **Article25 (privacy by design)** | 5 | 5 | 5 | 4 | 4 | **23** | **Survive** |
| C8 | Living ACR (accessibility) | 4 | 3 | 4 | 5 | 4 | **20** | **Survive** |
| C6 | CAPA Signal | 5 | 2 | 4 | 4 | 4 | **19** | **Survive (warning)** |
| C5 | Outside View | 4 | 3 | 4 | 3 | 4 | **18** | **Survive** |
| C9 | Device PSIRT | 4 | 4 | 3 | 3 | 3 | **17** | **Survive as 5th (borderline)** |
| C1 | Precedent | 3 | 1 | 5 | 4 | 5 | 18 | Reject (saturation) |
| C3 | Scar Tissue | 3 | 2 | 5 | 4 | 4 | 18 | Reject (native + saturation) |
| C11 | Handoff kit | 3 | 1 | 5 | 4 | 4 | 17 | Reject |
| C12 | Doc drift | 3 | 2 | 5 | 3 | 4 | 17 | Reject |
| C2 | ShipConfidence | 3 | 1 | 4 | 4 | 4 | 16 | Reject |
| C13 | Goal auditor | 3 | 2 | 4 | 4 | 3 | 16 | Reject |
| C14 | Commitment ledger | 2 | 2 | 4 | 4 | 4 | 16 | Reject |
| C16 | Audit evidence | 3 | 2 | 4 | 4 | 3 | 16 | Reject |
| C4 | Pre-mortems | 3 | 2 | 4 | 3 | 3 | 15 | Reject |
| C10 | Bus factor | 3 | 2 | 5 | 2 | 3 | 15 | Reject |
| C15 | Triage | 3 | 1 | 3 | 5 | 3 | 15 | Reject |
| C17 | Recall matcher | 4 | 2 | 2 | 4 | 3 | 15 | Reject |
| C18 | FinOps | 3 | 4 | 3 | 2 | 2 | 14 | Reject |

**Why C1 and C3 (18 points) are rejected while C5 (18) and C9 (17) survive:** C1 and C3 carry a *disqualifying* flaw (saturation or platform-owner overlap) that no amount of execution fixes. C5's weakness (data history) and C9's (domain depth) are execution risks we can investigate.

## 5. The five survivors (carried into 04–05)

1. **C7 Article25:** privacy-by-design screening (Business / Software)
2. **C8 Living ACR:** accessibility conformance from Jira evidence (Business / Software)
3. **C6 CAPA Signal:** quality recurrence and effectiveness (Specialized)
4. **C5 Outside View:** reference-class forecasting (Software / Business)
5. **C9 Device PSIRT:** regulated-device postmarket cybersecurity (Specialized)

## 6. Meta-lesson recorded for the team
> If an idea came to us easily, it probably came to hundreds of other entrants just as easily. The 2026 field (4,700+ participants, AI-assisted ideation) punishes "obvious-good" ideas. A distinct idea now has to be **verified against the field**, not assumed. Re-check before building (Day 1) and again before submission, since new repos appear daily.
