# Article25 — Codegeist 2026 Judging Strategy

**Stage 2** · 2026-11-22 · Official rules read on 22 Nov 2026 at https://codegeist2026.devpost.com/rules

## 1. Rules that shape the product (verified)
| Rule | Implication |
|---|---|
| Submission period ends **Tue 22 Dec 2026, 12:00 PT**; judging runs 5 Jan – 3 Feb 2027 | Submit 21 Dec; keep the app, model and sites working until 3 Feb |
| Stage One is pass/fail: fits the theme and "reasonably applies the required APIs/SDKs" | Forge app integrating Jira + Confluence (+ TWG): clearly met |
| Five **equally weighted** criteria; tie-break order: Tech → Design → Impact → Innovation → Presentation | Implementation quality and product completeness decide close calls |
| Must install via an **installation link** in a judge's test environment, "run consistently", and behave as shown | Clean-site rehearsals ×2; no hidden setup; the sample scenario |
| Video **< 5 minutes**, public on YouTube, no third-party trademarks or copyrighted music without permission | Script to ≤ 4:30; fictional company; no brand logos except as needed to show Atlassian products |
| "Detailed instructions … for all configuration steps" | Judge guide covers the gate setup for both project types |
| Bonus prizes: Agents (`rovo:agent`/`rovo:skill`/`rovo:action`), MCP (`rovo:mcp`), **Teamwork Graph** ("connects data into the graph and/or consumes data from the TWG API"), Marketplace | At most one grand prize + one bonus per submission |
| Category: Business Teams names **legal** explicitly | Our category (rationale in [PRODUCT_VISION.md §10](PRODUCT_VISION.md)) |
| Original work, solely owned; third-party data authorised | Synthetic data only; MIT/OSS dependencies licensed; ADS packages under Atlassian's licence for Forge apps |

## 2. Scorecard: honest status today vs. target at submission
Scores 1–10. "Today" is the state of the evidence (Stage 1/1.5 spikes and this blueprint), **not** a product. The target assumes the MVP acceptance criteria pass.

| Criterion | Official question (abridged) | Today | Target | What earns it | Biggest weakness to close |
|---|---|---|---|---|---|
| **Technological Implementation** | Genuine, working, non-trivial; not a wrapper or a single hardcoded path | 5 (strong spikes; no product) | **8–9** | Event-driven pipeline; verified-evidence AI extraction; deterministic versioned rules; lambda gate that fails closed; claim/finalise decisions; signed hash-chain ledger with Confluence anchors; authorised recovery; works on **any** project the judge picks | Install reliability on a clean site (C1); performance of the Custom UI panel |
| **Design** | Complete, coherent product, not a proof of concept | 2 (spike harness UIs) | **8** | One coherent loop; the *Margin* annotated-evidence workspace; Get started in ≤ 10 min; every state designed; native ADS look in light and dark | The UI must actually be built and polished; risk of running out of time on states |
| **Potential Impact** | Credible, specific case for a real problem and audience, shown by what's demonstrated | 6 (research-backed problem) | **8** | A specific persona (privacy lead, team of 1–5); regulatory drivers (GDPR Art. 25/35, CCPA risk assessments from 1 Jan 2026); demonstrated detection → enforced decision → record; honest metrics from our test set | No real-customer validation; metrics come from a synthetic set |
| **Innovation / Idea** | Creative, novel, differs from existing concepts | 7 | **8–9** | Plan-time detection with no self-reporting; **evidence-locked approval that re-locks on scope creep**; "model proposes, rules decide, human approves"; tamper-evident customer-owned record | Judges may assume "OneTrust/Guard does this". The video must draw the distinction in about 15 seconds. |
| **Presentation** | Video shows it end-to-end; who, what, why; easy to follow | 3 (not started) | **8** | A 4:30 story built on one realistic scenario; the product on screen within the first 20 s; the signature re-lock moment; clear install instructions | Recording quality and pacing; avoiding domain jargon overload |

**Expected total at target:** ~40/50. **Main uncertainty:** the Design and Presentation execution in the final two weeks, plus C1.

## 3. Bonus prizes: decision
| Bonus | Decision | Reasoning |
|---|---|---|
| **Teamwork Graph** | **Enter if D2 = keep.** The integration is the *declared purpose* (work item → Atlassian Goal), shown to the reviewer. | Consumes TWG data **[VERIFIED E7]** for a reason intrinsic to privacy review (purpose limitation and proportionality). Small, honest and visible in the core workflow. **Cost:** org-admin consent at install. D2 at the C1 rehearsal decides whether that friction is acceptable for judges. If dropped, we don't enter, and we don't add other TWG features for points. |
| Best Agents (Rovo) | **Not in MVP** | Would bring back a chat/self-reporting surface. Untested modules. Not core to the loop. Possible Later: a Rovo skill exposing approved-inventory lookups. |
| Best app with MCP | **Not in MVP** | `rovo:mcp` is Preview and admin-enabled per installation **[DOCS]**; judges are unlikely to configure an external agent. Later: "is this SDK approved?" for coding agents. |
| Marketplace | **No** | Listing blocks link-sharing (doc 01 §7); partner and review overhead |

**How the product shows meaningful use of Atlassian context (in the write-up):**
1. **Jira work items:** the text and change events are the trigger, and the workflow is the enforcement point.
2. **The organisation's approved inventory:** what's new vs. approved.
3. **Atlassian Goals via Teamwork Graph:** the declared purpose of the work.
4. **Confluence:** the customer-owned record.

Every one of these changes the outcome or the decision quality; none is decoration.

## 4. Demo video plan (≤ 4:30)
| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | **Hook:** "Every privacy failure starts as an ordinary ticket." | Priya types SHOP-42; within seconds the panel shows "DPIA likely" with quoted evidence |
| 0:20–0:45 | Problem + who it's for | Maya's situation: a team of one; intake forms nobody fills in; one line of regulatory context (Art. 25, CCPA risk assessments) |
| 0:45–1:30 | **Detect** | Panel: numbered quotes, "New vendor: ReplayCloud", "New for SHOP: behavioural data", "How this was decided" (rules, not the model, decide). The benign ticket shows "No review needed" (precision). |
| 1:30–1:50 | **Enforce** | Transition blocked with the exact message |
| 1:50–2:50 | **Review & decide** | Inbox → workspace: annotated document with margin notes; declared purpose (goal); approve with 3 conditions; separation of duties visible |
| 2:50–3:20 | **Record** | Confluence register updates; "Record verified ✓"; page history checkpoint |
| 3:20–3:55 | **Signature moment: scope creep** | Priya adds "share segments with AdReach" → item re-locks as "Changed since approval" with a before/after diff |
| 3:55–4:15 | Trust and resilience | AI off → rule-based mode labelled; monitor mode banner; "nothing leaves Atlassian" |
| 4:15–4:30 | Close | "Article25: privacy review at the speed of your backlog." Install in 10 minutes. |

**Production notes:**
- Record on the demo site with the seeded fictional company.
- Use captions.
- Use no third-party music unless it is licensed royalty-free with written permission.
- Show no real names or emails; the demo accounts use fictional names.
- **[UNVERIFIED]** whether we can create additional demo user accounts. If not, show the separation-of-duties rule with the reporter set to a second account, or narrate it.

## 5. Devpost submission content
| Field | Source |
|---|---|
| Title / tagline | "Article25: the privacy review desk inside Jira" / "Privacy review at the speed of your backlog." |
| Description | Narrative in [PRODUCT_VISION.md §11](PRODUCT_VISION.md), revised to match the build |
| How it uses the technology | Modules, pipeline and context from [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) §2–§3, plus the four context sources (§3 above) |
| Install instructions | `docs/JUDGE_INSTALL.md`, rewritten after rehearsal #2. It covers: site-admin (and org-admin if TWG) requirement; Get started; gate steps for both project types; the sample scenario; expected timings |
| Bonus write-up | TWG: query shape, why purpose matters, failure handling, screenshots |
| Impact claims | Only regulatory facts with sources, and our measured numbers labelled "on our 64-ticket synthetic test set". No "saves N hours", "prevents fines" or "compliant". |
| Privacy policy | Published URL (after legal-review decision; `docs/privacy-policy-review.md`) |

## 6. Biggest remaining weaknesses (ranked) and mitigations
| # | Weakness | Impact on criteria | Mitigation |
|---|---|---|---|
| 1 | **Nothing is built yet.** 25 dev-days of Must work in 25 days | All | Strict scope; Should items only if ahead; a cut order defined ([MVP_SCOPE.md §1](MVP_SCOPE.md)) |
| 2 | **Clean-site install unverified** (multi-app + llm + validator + maybe TWG) | Tech (pass/fail risk) | C1 in week 1; fallback to Jira-only with an in-app register view (doc 19 §4) |
| 3 | **Gate requires a manual workflow edit** by the judge | Design, Tech | Get started step with exact instructions + live health check; the product still delivers value (panel, inbox, decisions, register) if the judge skips it |
| 4 | **AI quality on real-world text unproven** (n = 34, single labeller) | Impact, Tech | Extend to ≥ 64 incl. injection and terse tickets; report honestly; precision-first rules; rule trace visible |
| 5 | **Synthetic-only impact story** | Impact | Use concrete regulatory drivers and the persona; demonstrate measurable in-product signals (coverage, blocked transitions, decision time on seeded data) without extrapolating |
| 6 | **Preview dependencies** (validator, multi-app, TWG) changing before 3 Feb | Tech | Weekly changelog checks; fail-soft TWG; validator fail-closed documented |
| 7 | **Model retirement or availability** during judging | Tech | Model in settings; fallback mode; prefer the 5.5 models listed by `list()` |
| 8 | **"Isn't this Guard Detect / OneTrust?"** | Innovation | One explicit contrast slide in the video; the comparison table in the description |
