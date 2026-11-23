# 19 — Stage 1 Final Decision: Article25

**Date:** 2026-11-22 · **Deadline:** 2026-12-22 12:00 PT (30 days)
**Evidence:** docs 11–18; spike code in `spikes/`; live tests on <dev-site>.atlassian.net with synthetic data.

## Decision: **CONDITIONAL GO**

The central technical assumptions held up in live tests. **Work requiring privacy review cannot start until an authorised human approves it**, enforced by Jira itself, in both team-managed and company-managed projects. AI extraction turned out to be **necessary and affordable**. Three specific issues must be closed in the first days of the MVP (§4) before the full build is committed. Each affects judge installability or data integrity, so they're not optional polish.

---

## 1. Capability classification

| Capability | Classification | Evidence |
|---|---|---|
| Forge app create/deploy/install, panel + resolver | **VERIFIED** | doc 12 |
| Jira issue read (fields, comments), comment, review task, link, issue property | **VERIFIED** | doc 13 §3.1 |
| Event trigger on issue create → backend screening | **VERIFIED** | doc 13 J1 |
| Confluence space list, page create/read/update, CQL search | **VERIFIED WITH LIMITATIONS** (granular scopes; search lag ~10 s) | doc 13 §3.2 |
| Shared storage across Jira + Confluence | **VERIFIED WITH LIMITATIONS**: only with multiple-app compatibility (Preview); required app can't be changed once installed | doc 13 F-B1–F-B3 |
| Workflow validator gate (lambda + app storage) | **VERIFIED** (team- and company-managed; block → approve → allow; REJECTED blocks; fail closed on error and on uninstall) | doc 14 |
| Workflow validator gate (expression + issue property) | **FAILED (insecure)**: bypassed by an ordinary editor | doc 14 T10 |
| Reviewer authorisation | **VERIFIED** (non-member refused). Separation of duties not implemented. | doc 14 T3 |
| Validator under lambda timeout / bulk transitions / Automation | **UNVERIFIED** | doc 14 §6 |
| Privacy register create/update/version/idempotency/adoption/manual-edit detection | **VERIFIED WITH LIMITATIONS** (concurrency unverified; manual edits overwritten in spike) | doc 17 |
| Data durability across uninstall | **FAILED as-is**: storage wiped; approvals lost | doc 13 F-B4, doc 14 T14 |
| Deterministic screening | **VERIFIED, insufficient** (held-out escalation recall 0.11; 4/4 sensitive misses) | doc 15 §3 |
| Forge LLM availability + structured extraction | **VERIFIED**, **COST DEPENDENT** (~$0.002–0.007 per screening; $1.28 spent of $5 approved) | doc 15 §7 |
| AI extraction quality | **VERIFIED WITH LIMITATIONS** (held-out recall 1.00, 0 sensitive misses, 0 invalid quotes; dev precision 0.81–0.93; n=34, single labeller) | doc 15 §7.2–7.4 |
| Teamwork Graph: echo, work items, goals | **VERIFIED**, **REQUIRES ADMIN ACTION** (org-admin) | doc 16 |
| Teamwork Graph: teams | **FAILED** (teamsV2 403) | doc 16 E5 |
| Teamwork Graph: Confluence objects | **UNVERIFIED** | doc 16 E8 |
| Judge installation via Sharing link (production, clean site, multi-app) | **UNVERIFIED** | not yet tested |
| Rovo agent / MCP | **UNVERIFIED** (out of Stage 1 scope) | — |

## 2. What changes in the architecture (vs. research docs 05/07/08)
| Area | Before (research) | After (evidence) |
|---|---|---|
| Gate | Expression validator on issue property, company-managed only | **Lambda validator reading app-only storage**; both project types; property = display mirror only |
| Installation model | One app installed in Jira (+ Confluence implied) | **Multiple-app compatibility: Jira required, Confluence optional** (single installation, shared storage). Marketplace note: such apps can only be listed as paid. |
| Detection | Deterministic pre-pass + LLM, with deterministic as an adequate fallback | **LLM extraction is the primary detector.** Deterministic rules decide outcomes. The keyword floor is a low-recall fallback only. |
| Model | `claude-sonnet-5` | **`claude-haiku-5-5` or `claude-sonnet-5-5`** (from `list()`). Non-forced `tool_choice`. |
| Durability | Forge SQL as source of truth | SQL/KVS **plus** a customer-owned durable trail (Confluence register history) and **rebuild-from-register** after reinstall |
| Concurrency | Not considered | Atomic writes (KVS transactions / SQL unique keys) for decisions, markers, counters |
| Register publishing | Overwrite on change | Version check on every publish; **don't overwrite manual edits** (block + diff) |
| Teamwork Graph | Owners, teams, goals, reviewers | **Goal context only** (optional). No team features. |
| Admin operations | — | Kill-switch, gate health check, uninstall procedure, separation of duties |

## 3. Technologies
**Use:** Forge (UI Kit for panel; Custom UI or UI Kit for console), `jira:issuePanel`, `jira:globalPage`, `jira:workflowValidator` (lambda), Jira product triggers, `@forge/events` queue consumers (long screening), Forge KVS (gate hot path) + Forge SQL (decision log/register; to validate in MVP week 1), Confluence REST v2 (granular scopes), Forge LLM (`claude-haiku-5-5`/`claude-sonnet-5-5`, tool calling with `auto`), multiple-app compatibility.
**Use cautiously (optional):** Teamwork Graph goal context (org-admin install friction; Preview). Rovo agent (bonus eligibility; untested). `rovo:mcp` (untested).
**Drop:** expression/issue-property gate; Teamwork Graph team features; reliance on Confluence search for page identity; keyword-only screening as a primary detector; Opus-tier models (no measurable gain at higher cost and latency).

## 4. Conditions that must be met before full MVP commitment (target: by 2026-11-25)
| # | Condition | Why it matters | Exit test |
|---|---|---|---|
| **C1** | **Judge-install rehearsal:** deploy the multi-app spike to **production**, enable **Sharing**, install via the link on a **second clean site** (new Atlassian Cloud dev site, not the demo site), connect Confluence, configure the validator, run the gate test | Installability is a pass/fail submission requirement. The multi-app install flow via a link is unverified. | Gate blocks → approve → allows on the clean site, and register publishes |
| **C2** | **Atomic storage design** for decisions, markers, page pointer and counters (KVS `transact` or Forge SQL), plus a 2-writer concurrency test | Lost updates were observed (spend counter); the register is read-modify-write | Two concurrent decisions → both persisted, no duplicates |
| **C3** | **Durability and recovery:** decision mirror to Confluence + "rebuild approvals" + documented uninstall procedure | Uninstall wiped approvals; reinstall re-blocks approved work | After uninstall/reinstall, approvals restored from the register and gated transitions pass |
| C4 (parallel, not blocking) | Independent labelling of ≥100 tickets for the eval | n=34 single-author labels can't support public claims | Metrics recomputed and reported honestly in the submission |
| C5 (parallel) | Re-scan the Codegeist field for privacy-screening entrants | Differentiation assumption (doc 04) | ≤2 credible similar entrants |

If **C1 fails** (e.g. multi-app can't be installed via a Sharing link), the fallback is: a Jira-only app that publishes the register as a **Jira-hosted view** (global page + CSV/JSON export) instead of writing to Confluence. That keeps the gate and AI intact and loses the Confluence register differentiator. Decide by 2026-11-26.

## 5. Answers to the brief's ten closing questions
1. **Successfully implemented:** Forge foundation; Jira/Confluence integration; a lambda workflow gate in both project types; reviewer-authorised review state; a Confluence register with versioning and idempotency; an LLM extraction harness; Teamwork Graph work-item/goal queries.
2. **Actually tested:** everything in §1 marked VERIFIED, on a live site, with logs, API responses and screenshots.
3. **Failed:** the issue-property expression gate (bypassed); per-installation storage without multi-app mode; data durability across uninstall; TWG team hydration (403); deterministic-only screening (recall 0.11).
4. **Uncertain:** judge Sharing-link install with multi-app; validator under load, bulk moves or Automation; concurrency; Confluence-object TWG queries; AI precision on real-world tickets; 5.5-model retirement dates; Rovo/MCP.
5. **Requires admin intervention:** app installation (site admin); TWG scopes (org admin); adding the validator to workflows (project/Jira admin); creating the reviewer group; enabling optional Confluence connection; any scope change (re-consent).
6. **Additional cost:** Forge LLM, about $0.002–0.007 per screening (≈$1.28 spent in Stage 1). Forge compute/storage within free tiers at spike volumes.
7. **Final-product technologies:** see §3 "Use".
8. **Drop:** see §3 "Drop".
9. **Architecture change needed?** Yes: the gate storage model, the installation model, detection strategy, durability/recovery, atomic writes, scope freeze (§2).
10. **Is Article25 still our strongest choice?** **Yes.** The riskiest assumption (a real, tamper-resistant, human-approved development gate) is now proven, which most competing ideas can't claim. AI made the difference between a keyword toy and a credible detector, at negligible cost. The remaining risks are execution and installability (C1–C3), not feasibility. The backup (Living ACR) remains available if C1 fails badly, but nothing found so far justifies switching.

## 6. Recommended immediate next step
Run conditions **C1–C3 as "Stage 1.5" (≈1.5 days)**, then start the MVP per the roadmap (doc 09), revised with §2 above. Do not start UI polish or the Rovo/MCP bonus work until C1 passes.
