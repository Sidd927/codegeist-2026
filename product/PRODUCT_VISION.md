# Article25 — Product Vision & Strategy

**Stage 2 blueprint** · 2026-11-22 · Status: proposed, for review before Stage 3 (implementation)

## Document set
| Doc | Answers |
|---|---|
| **PRODUCT_VISION.md** (this) | Why this product, for whom, and why it is different |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | What the product must do (functional and non-functional requirements, with IDs) |
| [USER_JOURNEYS.md](USER_JOURNEYS.md) | How each role moves through the product |
| [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md) | Surfaces, navigation, object model, roles and permissions |
| [UX_DESIGN_SPEC.md](UX_DESIGN_SPEC.md) | Screen-by-screen specs, states, responsive behaviour, accessibility |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) | Rendering approach, design tokens, components, layouts |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Forge modules, pipelines, services, reuse/refactor/discard |
| [DATA_AND_SECURITY_MODEL.md](DATA_AND_SECURITY_MODEL.md) | Schema, decision model, authorisation, minimisation, retention, threats |
| [MVP_SCOPE.md](MVP_SCOPE.md) | Must/Should/Later/Out, acceptance criteria, dependency graph |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Dependency-aware schedule to 22 Dec 2026, critical path |
| [CODEGIEST_JUDGING_STRATEGY.md](CODEGIEST_JUDGING_STRATEGY.md) | Criteria scorecard, bonus decision, demo and Devpost plan |

**Evidence tags used throughout:**
- **[VERIFIED]**: proven in a Stage 1 or 1.5 spike on a live site (`research/12`–`23`).
- **[DOCS]**: stated in Atlassian documentation, not tested by us.
- **[PROPOSED]**: a design decision, not yet built.
- **[UNVERIFIED]**: an assumption that must be tested.

Nothing in `spikes/` is product code. Each capability's status is listed in [SYSTEM_ARCHITECTURE.md §1](SYSTEM_ARCHITECTURE.md).

---

## 1. The decision in one paragraph
Article25 should be **the privacy review desk that lives inside Jira**. It reads every new or changed work item for planned personal-data processing and quotes the exact words that triggered each finding. It compares what it finds with what the organisation has already approved, and routes only the work that needs a human to the privacy reviewer. It then **locks the workflow until a named reviewer decides**, and records that decision in a tamper-evident ledger the customer owns in Confluence. The product is one workflow, executed exceptionally well:

> **Detect → Review → Decide → Enforce → Record.**

We are narrowing the Stage 0 concept (doc 06), not replacing it. A full privacy-programme suite (ROPA management, DPIA drafting, CCPA attestations, Rovo agent, MCP tools) is cut from the MVP.

## 2. Who has the problem
| Question | Answer (evidence) |
|---|---|
| **Who experiences it most often?** | **Product managers and engineers** create the triggering work (a new vendor, field or tracking idea) every day without recognising it as privacy-relevant. The **privacy reviewer** experiences the *consequence*: late discovery, or none. (doc 02; ISACA 2026: 50% cite not practising privacy-by-design as a failure cause) |
| **Who buys or adopts?** | The **privacy lead**: a DPO, privacy counsel or privacy engineer, often a team of 1–5 (ISACA median 5). They hold the legal duty (GDPR Art. 25/35; CCPA risk assessments since 1 Jan 2026). The **Jira admin** installs and configures, usually at the privacy lead's request, sometimes with the CISO's backing. |
| **Who uses it daily?** | **Reviewer:** the inbox and review workspace, several times a week. **Requesters (PMs/engineers):** see the Privacy panel on their work items, passively and briefly, only when something is flagged. |
| **Who is the primary persona?** | The privacy reviewer (below). The product succeeds if her review time drops and her coverage rises **without** asking product teams to change how they write tickets. |

### Primary persona: Maya, privacy lead
- **Role:** privacy lead at a ~400-person B2C SaaS company (EU and California customers). Part-time DPO: also handles vendor contracts and security questionnaires.
- **Today:** a Confluence "privacy intake form" that PMs are supposed to fill in "when a change touches personal data". She learns about most changes from release notes, sales questions or incidents. Each review starts with reading a thin ticket, then Slack archaeology.
- **Goals:**
  - see every change that creates new processing, *before* development;
  - spend her time deciding, not discovering;
  - show auditors who decided what, when and why.
- **Frustrations:**
  - self-reporting fails silently;
  - questionnaires are ignored or rubber-stamped;
  - GRC suites are expensive and live outside where work happens;
  - reviews made in chat leave no record.
- **Success:**
  - "I opened my inbox and there were three items, each telling me exactly what's new and quoting the ticket. I approved two with conditions in ten minutes."
  - "The third can't start until I've seen it, and if they quietly change the scope after I approve, I'll know."

### Secondary personas
- **Priya, product manager (requester):**
  - wants to ship without a surprise legal blocker late in the cycle;
  - needs to know early *whether* review is needed and *what* to clarify;
  - must never feel policed by a black box.
- **Sam, Jira administrator:**
  - installs and configures, and adds the gate to workflows;
  - needs setup in under 15 minutes, a health check, and a safe off-switch.

## 3. Problem statement
Ordinary product work silently creates privacy obligations: a new data category, an unapproved vendor, profiling, monitoring, children's data. Small privacy teams cannot read every ticket, and intake questionnaires depend on product teams recognising when a change matters. So assessments are missed or done after the code ships, and the approvals that do happen leave no reliable record. **The gap is not knowledge of the law. It is detection and enforcement at the moment work is planned, in the tool where it is planned.**

## 4. Jobs to be done
| # | When… | I want to… | So that… | Persona |
|---|---|---|---|---|
| J1 | a new or changed work item could involve personal data | be told automatically, with the exact words that matter | I don't depend on people self-reporting | Maya |
| J2 | something is flagged | see only what is **new** compared with what we've already approved | I spend time on real changes, not re-reviewing known processing | Maya |
| J3 | I have made a decision | have it enforced on the workflow and bound to the content I approved | work can't start without approval, and scope creep after approval is caught | Maya |
| J4 | an auditor, customer or regulator asks | show who decided what, when, with which conditions, in a record that can't be silently edited | I can demonstrate accountability (GDPR Art. 5(2)) | Maya |
| J5 | my work item is flagged | understand why and what to clarify, in the work item | I can unblock myself quickly | Priya |
| J6 | I set this up | configure scope, reviewers and the gate quickly, and know it's working | the tool doesn't become another unmaintained control | Sam |

## 5. What already exists, and what is missing
| Existing option | What it does | Why it doesn't do the job |
|---|---|---|
| **Atlassian Guard Detect** | Finds sensitive data *stored in* Jira/Confluence content (DLP) | It protects Atlassian content. It doesn't assess whether a *planned feature* creates new processing for the customer's product. Different job, different buyer. |
| **Rovo agents / Studio** | A user can ask an agent to "review this epic for privacy" | On demand only, so it still relies on self-reporting. No inventory, no deterministic outcome, no gate, no durable decision record. Automation-invoked agents can't run CREATE/UPDATE actions (doc 06 §C.B). |
| **Jira Automation + forms** | Questionnaire on a label or transition | Triggered by people tagging correctly, which is the exact failure mode |
| **OneTrust and similar GRC suites** (Jira connector) | Questionnaire-driven PIA/DPIA, enterprise | Triggered by tags or questionnaires; enterprise pricing; the assessment lives outside Jira |
| **Privado, Relyance, Fides** | Code and runtime scanning; privacy-as-code in CI | Sees processing **after** code exists; needs repo access or annotations |
| **Unicis RPA (Marketplace)** | Manual ROPA inventory in Jira | No detection |
| **Actonic toolkit (Marketplace)** | PII redaction in Jira/Confluence | DLP, a different job |
| **Codegeist 2026 field** | No privacy-by-design entrant in the 222-repo sample (doc 04, 22 Nov) | Re-scan weekly; "none found" ≠ "none exist" |

**Genuinely missing:** *plan-time* detection that needs no self-reporting, shows its evidence, knows what has already been approved, and ends in an **enforced, attributable, tamper-evident human decision**, all inside Atlassian with no data leaving it.

## 6. Product directions considered
| Direction | Value | Feasibility (evidence) | Differentiation | Demo-ability | Verdict |
|---|---|---|---|---|---|
| **A. Privacy review desk + gate + ledger** (selected) | High: closes detection *and* accountability | All core pieces **[VERIFIED]**: lambda gate, LLM extraction, SQL, chain, Confluence | High: the gate + evidence + ledger combination is unique | Very high: block → decide → unblock → re-lock on scope creep | **Select** |
| B. Full privacy-programme suite (doc 06: ROPA, DPIA drafts, CCPA reports, Rovo agent, MCP) | High long-term | Too much for one person in 30 days; Rovo/MCP **[UNVERIFIED]** | Medium: breadth reads as "OneTrust-lite" | Diluted: many shallow screens | Reject for MVP; keep pieces as Later |
| C. Rovo agent "privacy copilot" (chat-first) | Medium | Plausible | Low: judges see "another chatbot" | Medium | Reject. It brings back self-reporting. |
| D. MCP tool that stops coding agents adding unapproved SDKs | Novel | `rovo:mcp` Preview, admin-enabled per install **[DOCS]** | High, but niche | Hard for judges to test | Later (built on A's data) |
| E. DLP-style PII scanner of Jira/Confluence content | Low | Easy | **Overlaps Guard Detect** and Marketplace apps | High | Reject |
| F. Backup concept "Living ACR" (doc 06) | Medium | High | Low: Remediator exists | Medium | Not justified; A's risks are retired |

**Why A beats B:** the judging criteria reward a *complete, coherent product* and a *non-trivial implementation*, not breadth. B spreads one developer across ten modules; A concentrates on the loop where Article25 is defensible and that judges can test in 10 minutes. **Why A beats C/D:** A removes self-reporting, which is the root cause. C reintroduces it, and D only matters once A's approved inventory exists.

## 7. Positioning
- **Category of one, in one line:** *Article25 reviews what you're about to build, not what you've already stored.*
- **Positioning statement:**
  - **For** privacy leads at companies that plan product work in Jira,
  - **who** can't read every ticket and can't rely on teams to self-report,
  - **Article25 is** a privacy review desk inside Jira
  - **that** automatically finds new personal-data processing in work items, with quoted evidence, and enforces a named human decision before development starts.
  - **Unlike** GRC questionnaires or code scanners, it acts at plan time, needs no tagging, keeps the decision bound to the exact content approved, and runs entirely on Atlassian.
- **Tagline:** *Privacy review at the speed of your backlog.*

## 8. Unique value proposition
1. **No self-reporting:** every in-scope work item is screened on create and on change.
2. **Evidence, not opinions:** every finding quotes the ticket verbatim, and quotes are machine-verified against the source. **[VERIFIED: 0 invalid quotes in 170 calls]**
3. **Only what's new:** findings are diffed against the approved inventory (vendors, data categories per project), so reviewers see deltas.
4. **The model proposes, the rules decide, a human approves:** the LLM only extracts signals; a versioned deterministic rules engine sets the outcome; only an authorised reviewer can clear it.
5. **Evidence-locked approval:** a decision is bound to the content fingerprint it approved. A material change after approval re-locks the gate. **[PROPOSED; built on VERIFIED pieces]**
6. **Enforced, not advisory:** a Jira workflow validator blocks the transition, and fails closed on error, missing state or uninstall. **[VERIFIED]**
7. **A record you own and can trust:** decisions form a signed hash chain, published to a Confluence register the customer owns. Tampering, deletion and replay are detected. **[VERIFIED: 21 unit tests + 13 live checks]**
8. **Runs on Atlassian:** no external egress. AI runs on Forge LLM. **[VERIFIED: eligible on every deploy]**

## 9. Competitive differentiation (against the strongest objections)
| Objection | Answer |
|---|---|
| "It's just an LLM prompt on tickets." | Remove the LLM and the inventory diff, rules engine, gate, ledger and register still work (rule-based fallback mode). The LLM replaces the single hardest manual step, reading prose. |
| "Rovo can do this." | Rovo answers when asked. Article25 runs on every change, enforces the outcome in the workflow, and keeps an auditable, tamper-evident record. These are different properties, not prompts. |
| "Isn't this OneTrust?" | OneTrust triggers on tags and questionnaires and lives outside Jira at enterprise prices. Article25 needs no tagging, works at plan time, and is installable by a site admin in minutes. |
| "Gates annoy teams." | Gates apply only to outcomes that need review (configurable). Clear work passes untouched. Requesters see why, with quotes and the questions to answer. Admins have an audited monitor mode. |

## 10. Recommended Codegeist category: **Apps for Business Teams**
- The official text names **legal** explicitly: "help colleagues in … legal move faster with the right information in front of them" (Rules §4, verified 22 Nov 2026).
- The buyer and primary persona (privacy lead) is a legal/compliance function, and the product's value is decision quality and accountability. The software-team surfaces (panel, gate) are how it reaches them.
- **Alternative considered:** *Software Teams* ("issue triage that actually understands what matters"). It fits the gate, but is probably the most crowded category (doc 01 §13), and positioning there makes Article25 look like one more dev-workflow gate. *Specialized Industries* doesn't fit: privacy is cross-industry.
- The sponsor may reassign categories (Rules §4). The pitch works in either.

## 11. Devpost narrative (draft, to be revised to match what is built and measured)
> **Every privacy failure starts as an ordinary ticket.** "Add session replay to checkout." "Send churn scores to our ad partner." Nobody tags it, because nobody realises it matters, and the privacy team finds out at launch, or never.
>
> **Article25 is the privacy review desk that lives inside Jira.** It reads new and changed work items the moment they are written. It quotes the exact sentences that create new personal-data processing and shows only what is **new** compared with what your organisation has already approved. Work that needs a decision lands in the privacy lead's inbox, already summarised. Jira blocks it from starting until a named reviewer approves, rejects or sets conditions. If the scope quietly changes after approval, the gate locks again.
>
> Every decision is written to a **tamper-evident ledger** and published to a Confluence register your organisation owns, so "who approved this, and what exactly did they approve?" always has an answer.
>
> **The model proposes, the rules decide, a human approves.** Article25 runs entirely on Atlassian Forge, using Forge LLM, Forge SQL, Jira workflow validators and Confluence, with no data leaving your Atlassian site.

**Claims we must not make:** "compliant", "prevents fines", "legal advice", "saves N hours" (unmeasured), or any accuracy figure beyond our own labelled test set, which must be described as such ([CODEGIEST_JUDGING_STRATEGY.md §5](CODEGIEST_JUDGING_STRATEGY.md)).

## 12. Long-term direction (not the MVP)
Once the approved inventory exists, it becomes valuable everywhere work is planned or built. Possible extensions:
- screening Confluence specs;
- a Rovo skill ("what has privacy approved for system X?");
- an MCP tool for coding agents ("is this SDK approved?");
- DPIA drafting from the evidence;
- jurisdiction rule packs (CCPA risk assessments, India DPDP).

Each extension reuses the same core: evidence-verified signals → deterministic rules → human decision → ledger. See [MVP_SCOPE.md §3](MVP_SCOPE.md).
