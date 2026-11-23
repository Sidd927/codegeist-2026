# 10 — Submission & Winning Strategy: Article25

**Prepared:** 2026-11-22. Drafts below must be revised to match **what is actually built and measured**. Never claim a feature or number the app doesn't demonstrate.

---

## 1. Category choice
**Recommended: Apps for Business Teams.**
- The official category text names **legal** explicitly: "help colleagues in … legal move faster with the right information in front of them."
- The primary buyer and decision-maker is the DPO / privacy counsel, a legal-function role.
- Our 222-repo sample shows most entrants building software-team tools (release gates, triage, incident memory, code review). Business Teams is likely less saturated with deep entries (**Hypothesis**).
- **Risk:** judges may see it as a software-team tool. The Sponsor may reassign categories (Rules §4). The product is strong in either. *Alternative:* Software Teams, framed as "shift-left privacy".

## 2. Bonus prizes (a submission can win at most one bonus; enter all that apply)
| Bonus | Qualifies via | Must implement | Evidence to provide | Our strength |
|---|---|---|---|---|
| **Best Agents** | `rovo:agent` + actions (+ `rovo:skill`) | P0 agent; P1 skill | Manifest excerpt, agent screenshots, 20-s video beat, write-up of actions and guardrails | Medium-high (real tools, governed CREATE/UPDATE, DPO-only checks) |
| **Best app with Atlassian MCP** | `rovo:mcp` exposing read-only actions + open-source `skill.md` | P1 | Video beat with a real external client (coding agent stops before adding an unapproved SDK), skill.md link, admin-enablement steps | **High if shipped** (distinct, practical story) |
| **Best Teamwork Graph integration** | Consumes TWG via `requestTeamworkGraph` curated queries | P1 | Which queries, why, and screenshots of reviewer/team/goal context | Medium (supportive, not core) |
| Best Marketplace published app | — | **Skip** | — | Listing blocks link-sharing (needs a separate unlicensed copy), plus partner onboarding and review time |

**Emphasis in write-ups:** MCP (if shipped), then Agents. TWG is positioned honestly as context enrichment.

## 3. What judges should experience (in order)
1. Install via link → Settings → **Load sample privacy program** (≤10 min).
2. Create an epic from the provided text → the panel shows evidence-locked findings and outcome within ~20–40 s.
3. Try "Ready for Dev" → blocked (if the validator is configured), or see the soft-gate banner.
4. Open the DPO Console → decide "Cleared with conditions" → subtasks appear, gate released.
5. Open the Confluence ROPA page → new version with the change highlighted.
6. Ask the Rovo agent: "Which epics added new processors this month?"
7. Create a **benign** epic → `CLEAR` (shows it doesn't flag everything).
8. Optional: toggle AI off → rule-based mode still works.

## 4. How to communicate impact (no unsupported claims)
- **Use only verified context numbers:** ISACA 2026 (PbD failures cited by 50%; median privacy staff 5), CCPA risk assessments required before significant-risk processing since 1 Jan 2026 (attestations due 1 Apr 2028), GDPR fines ≈€1.2B in 2025 (DLA Piper), WP248's two-criteria rule.
- **Our own numbers:** only those measured in-app or on our eval set (e.g. "on our 50-ticket labelled set, precision X / recall Y for review-required outcomes"), clearly described as **our test set, not customer results**.
- **Avoid:** "saves N hours", "prevents fines", "ensures compliance", "legal advice". Say instead: "helps privacy teams find and decide earlier, with evidence".

## 5. How to explain the Atlassian integration
"Article25 runs entirely on Forge (Runs on Atlassian). Jira and Confluence events trigger screening on a Forge queue. Forge LLM extracts evidence-quoted signals. A deterministic rules engine decides. Results are stored in Forge SQL and written to a Jira issue property, which a Jira workflow validator enforces as a gate. DPO decisions create Jira subtasks and republish a versioned Confluence register. A Rovo agent, a reusable Rovo skill and Rovo MCP tools expose the same governed data to Rovo Chat and to external coding agents. Teamwork Graph supplies the requester's team, the epic's goal and suggested reviewers, queried as the current user."

## 6. Differentiation from other teams
- **Distinct problem:** none of the ~220 public Codegeist entries we reviewed address privacy-by-design screening (as of 22 Nov; re-checked weekly).
- **Domain authenticity:** correct concepts (Art. 25/30/35, WP248 criteria, CCPA risk assessments, ROPA, processors vs. controllers), shown in the UI and rule trace.
- **"The model proposes evidence; rules decide; humans approve"**, visibly. Most AI entries ask judges to trust model output.
- **Complete loop:** detection → gate → decision → record → report, not a panel that only comments.

---

## 7. Devpost drafts

**Project title:** Article25: Privacy-by-Design Screening for Jira & Confluence

**Tagline:** Privacy review at the speed of your backlog.

**Elevator description (≈60 words):**
Article25 screens every new epic, story and spec for personal-data impact the moment it's written. It quotes the exact evidence, compares it with your record of processing and approved vendors, applies DPIA and CCPA risk-assessment triggers deterministically, then routes, gates and records the privacy decision in Jira and Confluence before anyone writes code. It runs entirely on Atlassian.

**Problem statement:**
Privacy obligations are created by ordinary product work: a new vendor, a new data field, a personalisation idea. Privacy teams are small (ISACA's 2026 survey reports a median of five staff) and cannot read every ticket. Their intake questionnaires depend on product managers recognising when a change matters. Half of privacy professionals in ISACA's 2026 survey cite not practising privacy by design as a cause of privacy failures. Since 1 January 2026, California requires a risk assessment *before* significant-risk processing begins, and GDPR has long required data protection by design and DPIAs for high-risk processing. Discovering these changes at launch, or never, is expensive and increasingly unlawful.

**Solution:**
Article25 puts a privacy specialist's first pass inside the backlog. When work is created or changed, it reads the ticket and linked specs, extracts the personal-data signals with verbatim evidence, checks them against your register of systems, processing activities and vendors, and applies transparent rules (including WP248's high-risk criteria and CCPA significant-risk triggers). Low-risk changes pass or propose a register update. Higher-risk changes open a prefilled review for the DPO and, optionally, block the workflow until it is cleared. Decisions, conditions and register changes are recorded with an audit trail and published to a versioned Confluence page.

**How we built it (technology):**
Forge (Runs on Atlassian): Jira and Confluence event triggers; async queue consumers; Forge LLM (Claude Sonnet) with tool-calling for structured extraction; an evidence validator that discards any finding whose quote isn't in the source; a versioned, unit-tested rules engine; Forge SQL for the register, screenings, reviews and audit; Jira issue properties plus a Jira workflow validator for gating; Confluence REST for register publishing; Jira global page (Custom UI, React/TypeScript, Atlaskit) and UI Kit issue panel; Rovo agent with governed actions and a reusable Rovo skill; Rovo MCP tools for external coding agents; Teamwork Graph curated queries for team, goal and reviewer context.

**Key features:**
- Automatic, evidence-quoted privacy screening of Jira work (and Confluence PRDs*)
- Register-aware diff: new vendors, new data categories per system
- Deterministic outcomes with a visible rule trace (WP248, CCPA, special categories, children, transfers)
- Workflow gate until privacy clearance
- DPO console: queue, review workspace, decisions with conditions → subtasks
- Versioned Confluence ROPA publishing and full audit log
- Rovo agent "Privacy Partner"; Rovo MCP tools for coding agents*
- Reports: coverage, time-to-decision, CCPA attestation counts*
- Works in rule-based mode if AI is off
(*mark only if shipped)

**Impact statement:**
Article25 is for the privacy professional who has to cover a whole engineering organisation alone, and for the PMs who'd rather know on day one than at launch. It turns privacy-by-design from a questionnaire people forget into a check that happens on every relevant ticket, with evidence the DPO can trust and records that stay current. We don't claim to make anyone compliant. We make the right privacy decision happen earlier, with the context needed to make it well.

**Challenges / what we learned (fill honestly at the end):** e.g. evidence validation, precision tuning, gating via issue properties, Preview APIs.

**What's next:** jurisdiction packs (India DPDP, Australia), EU AI Act screening, code-scanner reconciliation, JSM intake, Marketplace listing.

---

## 8. Demo video outline (target 4:15, hard max 4:50)

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | **Hook:** "This epic just created a legal obligation. Nobody noticed. Except Article25." | Panel turning red on a real epic |
| 0:20–0:45 | **Problem:** small privacy teams, intake forms people forget, CCPA risk assessments since Jan 2026 (cite sources on screen) | Simple title cards with citations |
| 0:45–1:45 | **Screening:** Priya writes CHK-142 (session replay + ReplayCloud + prescription-item segmentation). Findings with highlighted quotes; register diff; rule trace "2 of 9 criteria → DPIA likely" | Issue panel |
| 1:45–2:10 | **Gate:** "Ready for Dev" blocked with a precise message | Transition dialog |
| 2:10–3:00 | **DPO decides:** queue → review workspace (evidence, diff, suggested reviewers from Teamwork Graph) → "Cleared with conditions" → subtasks appear → gate opens | DPO Console |
| 3:00–3:20 | **Record:** Confluence ROPA v14 with highlighted change; audit entry | Confluence page |
| 3:20–3:45 | **Agents:** Rovo "Which epics added new processors?"; (if shipped) coding agent via MCP refuses to add the SDK pending PRIV-37 | Rovo chat; terminal |
| 3:45–4:00 | **Trust:** benign epic → CLEAR; AI off → rule-based mode; "model proposes evidence, rules decide, humans approve" | Quick cuts |
| 4:00–4:15 | **Close:** who it's for, Runs on Atlassian, architecture diagram (2 s), call to action | Diagram + logo |

**Production notes:** record at 1080p+, zoom on evidence highlights, no copyrighted music, no third-party trademarks beyond descriptive use (avoid real vendor logos; "ReplayCloud" is fictional), captions on.

---

## 9. Final quality-control audit (Part 15)

| Check | Status | Notes |
|---|---|---|
| Official competition rules independently verified | ✅ | Rules page read in full (01) |
| Actual category eligibility confirmed | ✅ | Business Teams fits ("legal"); reassignment possible |
| Mandatory Forge requirements confirmed | ✅ | Forge app + Jira/Confluence integration + installation link (Sharing) |
| Important API capabilities verified | ✅ / ⚠️ | Core APIs verified in docs. **LLM enablement, validator expression on issue property, TWG curated queries on our site: spike by 24 Nov** |
| Required permissions identified | ✅ | 05 §1.2, 07 §4.2 (exact granular scope names to confirm with `forge lint`) |
| Preview dependencies identified | ✅ | Validator (fallback), TWG, `rovo:mcp`, `rovo:skill`, `requestTeamworkGraph` (all optional to the core) |
| Real-world problem supported by evidence | ✅ / ⚠️ | Strong context evidence. **No direct measurement of how many features skip review** (stated openly) |
| Existing alternatives investigated | ✅ | 04 (OneTrust, Privado, Relyance, Fides, Unicis, Actonic, Guard Detect) |
| Differentiation established | ✅ | Plan-time, Atlassian-native, rules + evidence + gate + record. 0 Codegeist overlap in sample |
| Technical architecture validated | ⚠️ | Validated on paper against docs. **Not yet built or tested** |
| MVP fits remaining time | ✅ | P0 110–140 h with cut lines (09) |
| AI has a meaningful role | ✅ | Extraction with evidence. Decisions stay deterministic |
| Product can operate without unsupported assumptions | ✅ | Rule-based mode; soft gate; optional TWG/MCP |
| User value is clear | ✅ | Personas and workflows (08) |
| Demonstration is compelling | ✅ | Killer feature + scripted scenario (06 §E4–E5) |
| Submission requirements understood | ✅ | 01 §3; privacy-policy URL needed for Sharing |
| Bonus prize eligibility researched | ✅ | §2 above |
| Major risks have mitigation strategies | ✅ | 01 §11, 09 risk register |

**Unresolved risks (not hidden):**
1. Extraction precision on real-world tickets is unknown until the eval set exists (Stage 4).
2. Judges' sites may lack Rovo (Unverified) → agent features invisible. The core still works.
3. TWG scopes force org-admin install → possible judge friction.
4. Private competing entries can't be ruled out.
5. Legal-domain claims must be reviewed for accuracy (ideally by someone with privacy-law expertise) before the video is final. Present the app as decision support, never legal advice.

## 10. Answers to the brief's ten closing questions
1. **What are we building?** Article25, a Forge app that screens Jira/Confluence work for personal-data impact and routes, gates and records privacy decisions.
2. **Whose problem?** Small privacy/legal teams (DPOs), and the PMs and engineers whose work triggers privacy obligations.
3. **Why important?** Legal duties (GDPR Art. 25/30/35; CCPA risk assessments since 2026), shrinking privacy teams, and PbD failure cited by half of privacy pros.
4. **Why different?** Plan-time, inside Jira, deterministic and evidence-locked, ending in a gate and a record. Competitors scan code later or depend on self-reporting.
5. **Why Atlassian?** The trigger, context and action surfaces are all Jira and Confluence. Runs on Atlassian keeps product plans on the platform.
6. **Can we build it?** Yes. All core APIs are verified, with fallbacks for Preview pieces (05).
7. **Before the deadline?** Yes, with freeze on 15 Dec and submission on 20 Dec, if cut lines are respected (09).
8. **Will someone use it?** Mid-market Atlassian customers with EU/California exposure and small privacy teams. Ongoing value on every new epic.
9. **What will judges remember?** The red "DPIA likely" panel with highlighted quotes, the blocked transition, and the Confluence register updating itself after the DPO's one-click decision.
10. **Why should it win?** It is the theme made concrete: organisational context turned into a confident, accountable decision at the moment of work, in a domain nobody else in the field is serving.
