# Devpost submission: Article25 (copy-ready draft, NOT submitted)

Written against the **Codegeist 2026 official rules**, read on 23 Nov 2026:
- deadline **22 Dec 2026, 12:00 PT**;
- video under 5 minutes, **public on YouTube**;
- an installation link is required;
- five equally weighted criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation.

Items in **[brackets]** need your input before submission.

---

## Positioning (decided)
| Candidate | Verdict |
|---|---|
| **"Article25: Privacy review that actually enforces the decision."** | **Chosen.** Names what is unique (enforcement) and what it is (privacy review). Concrete, not AI-hype |
| "Privacy by design, enforced in Jira" | Strong, but "privacy by design" is a legal term of art and reads like a compliance claim |
| "Evidence-locked privacy approvals for Jira" | Precise, but jargon on first read |
| "The privacy gate for Jira" | Undersells the evidence, decision and record |

Position Article25 as **a complete privacy-governance workflow inside Jira**, not an AI scanner. The AI is optional and never decides.

## Project title
**Article25**

## Tagline (Devpost "elevator pitch", 200 characters or fewer)
Privacy review that actually enforces the decision: evidence-backed screening, human approval bound to the exact text, a Jira workflow gate, and a signed record anyone can verify.

## Category
**Apps for Software Teams** (recommended).
- The category asks for apps that "give dev teams the context to ship with confidence… issue triage that actually understands what matters".
- Article25 triages every work item for privacy impact, and gates the development workflow until the right decision exists.
- Its primary users are software teams and the privacy reviewers embedded with them.

*Considered:*
- *Business Teams:* privacy and legal reviewers are business users, but the product lives in the software delivery workflow.
- *Specialized Industries:* not industry-specific.

## Bonus prizes: eligibility
| Bonus | Eligible? | Reason |
|---|---|---|
| Rovo agents (`rovo:agent`, `rovo:agentConnector`, `rovo:skill`/`rovo:action`) | **No** | No Rovo modules. We won't add one just to qualify |
| Atlassian MCP (`rovo:mcp`) | **No** | No MCP module |
| Teamwork Graph | **No** | It neither writes to nor reads from the Teamwork Graph API (evaluated in Stage 2 and dropped) |
| Marketplace published or submitted | **Not yet** | Eligible only if you submit a Marketplace listing (a vendor account, a listing and a privacy policy URL) **[YOU decide]** |

**Recommendation:** select no bonus unless the Marketplace listing is actually submitted before the deadline.

## "How does your project meet the main technology requirement?" (Forge + Atlassian product)
Article25 is a Forge app (Node.js 24 runtime) that integrates deeply with **Jira**:

| Forge module | What it does |
|---|---|
| `jira:issuePanel` | The *Article25 privacy* panel on every work item |
| `jira:globalPage` | The review desk: Overview with Get started, Inbox, review workspace, Record, Settings |
| `jira:workflowValidator` | The *Article25 privacy gate*, added to any transition in Jira's workflow editor |
| `trigger` | Created, updated and deleted work-item events; app lifecycle |
| `consumer` + `scheduledTrigger` | Asynchronous screening and a 5-minute reconciler |
| `sql` | All data in Forge SQL |
| `llm` | Optional, Atlassian-hosted Forge LLM extraction |

- **Scopes:** read-only Jira only (`read:jira-work`, `read:jira-user`, `read:workflow:jira`).
- **Egress:** no external network access; no external services.

---

## Short description (gallery card)
Article25 checks new and changed Jira work items for planned processing of personal data and shows the exact words behind every finding. Privacy reviewers decide in a margin-style workspace. A Jira workflow gate lets work proceed only when a reviewer has approved the current text. Every decision is signed into a tamper-evident record that anyone can verify offline.

## Full description

### The problem
**Where the privacy decisions really happen.** Most privacy-relevant product decisions start as an ordinary Jira work item: "add session replay to checkout", "send shopper emails to an SMS vendor", "export payroll data to a new provider".

**What goes wrong:**
- **Reviews are optional.** Nothing in the workflow requires a privacy review, so it depends on someone remembering.
- **Reviews are informal.** An approval is an email or a comment, not bound to what was actually approved.
- **Approvals go stale.** When the work item changes (new data, a new recipient), yesterday's "yes" still looks valid.
- **There is no trustworthy record** of who decided what, about which version of the text.

Article 25 of the GDPR asks for data protection *by design and by default*. In practice, design happens in Jira, and the review sits outside it.

### Who it's for
- **Software teams** who want to ship without a privacy surprise at the end.
- **Privacy, security and legal reviewers** who need to see what changed and decide quickly.
- **Jira administrators** who need a control they can switch on gradually and prove is working.

### What it does
1. **Detect.** Every created or edited work item in scope is checked in the background.
   - A versioned rules engine sets the outcome: *Review required*, *DPIA likely* and others.
   - Every finding quotes the exact words it is based on, so a reviewer never has to trust an unexplained flag.
   - Optional AI extraction (Atlassian's Forge LLM) must also quote verbatim, or its finding is discarded.
   - Each result says whether it is rule-based or AI-assisted.
2. **Review.** Reviewers get an Inbox and a margin-style workspace: the text on the left, the evidence in the margin, the "what's new" chips, and assignment to a reviewer.
3. **Decide.** Approve, approve with conditions, request more information, or reject.
   - Each decision is bound to the **exact text** the reviewer saw (a content fingerprint), with optimistic concurrency.
   - **Separation of duties** (on by default, audited) stops people deciding on their own work. The UI explains the exact restriction and the next step.
4. **Enforce.** Administrators add the *Article25 privacy gate* to any Jira workflow transition.
   - **Monitoring** records what the gate would block; **Enforcing** blocks.
   - The gate allows a transition only if a human approval covers the **current** text and its signed record verifies. Anything uncertain fails closed, with a clear message in Jira.
   - Settings verifies which transitions really carry the gate, for this environment.
5. **Invalidate.** If the text changes after approval, Article25 re-checks it.
   - New privacy signals (for example contact data or a new recipient) automatically invalidate the approval, and the gate closes.
   - Harmless edits carry the approval over, with a recorded explanation.
6. **Record and recover.**
   - Every decision is an **Ed25519-signed record in a hash chain**.
   - Administrators verify the whole history and export a **signed archive**. Anyone can verify it **offline with only a public key**.
   - After an uninstall (which deletes Forge data), a two-step, verified **restore** rebuilds the record into a fresh installation. Every work item is re-checked, so only approvals of unchanged text count.
7. **Get started.** A live checklist tells an administrator exactly what is configured and what isn't, and never claims protection that the workflow scan didn't find.

### How we built it (technical implementation)
- **Forge-native, no egress.**
  - Custom UI (React 18) for the panel and the desk.
  - Resolvers, triggers, a queue consumer and a scheduled reconciler in Node.js 24.
  - Forge SQL with 15 additive migrations.
  - A Jira workflow validator (lambda) that reads one SQL snapshot and verifies signatures inside a deadline.
- **A deterministic core.** Rules, review state, gate policy and ledger are pure modules with no Forge imports, exhaustively unit-tested. The desk and the gate use the same status function, so they cannot disagree.
- **Evidence integrity.** Quotes are verified against the source text. Excerpts are 120 characters or fewer, and the full text is never stored.
- **Trust model.**
  - Signing keys live in encrypted Forge environment variables; trust is never derived from database contents.
  - Key rotation uses signed successions.
  - Retired keys stay trusted through their *public* halves.
  - A restore lock keeps the gate closed during an incomplete restore. Restores resume in rounds within Forge's 25-second limit.
- **Reliability.**
  - Fail closed when enforcing; Monitoring never blocks.
  - Self-healing schema migrations, with a "setting up" state for the first minute after install.
  - Content-free, allow-listed logging.
- **Performance and accessibility.**
  - Initial bundles: 81 KB (panel) and 101 KB (desk), gzip.
  - Colour contrast is checked in **real Chromium** against Atlassian's light and dark design tokens, in CI.

### Testing (evidence in the repository)
**Automated** (all in CI on every push):
- 183 backend tests;
- 87 UI tests with axe accessibility checks;
- 24 real-browser contrast checks;
- lint, copy lint and bundle budgets.

**Live** on a development site, with synthetic data:
- screening;
- the four decisions;
- separation of duties;
- stale-evidence and concurrency refusals;
- gate blocking and allowing in company- and team-managed projects;
- approval invalidation;
- export and offline verification;
- tamper detection;
- **uninstall → reinstall → restore → verify → re-check** in an isolated Forge environment;
- the Get started first run.

**AI quality** on 34 synthetic items: directional only, no public accuracy claim.

### Innovation: what's different
- **Approval bound to the exact text.** An approval that silently outlives the work it approved is the core failure of today's reviews. Article25 makes approvals expire on material change, automatically.
- **Enforcement, not reminders.** A real Jira workflow gate with a safe Monitoring → Enforcing rollout and verified coverage.
- **Evidence over opinion.** Every finding quotes the text, and AI can add findings but never decides.
- **A record you don't have to trust us for.** Signed, chained, exportable, verifiable offline, and recoverable after a reinstall.

### Potential impact
- Jira is where software work is planned, so every team that ships features touching personal data faces this problem, whatever its regulator.
- Article25 turns an informal, after-the-fact review into one that is part of the workflow, evidence-based and enforceable. That reduces the risk of shipping unreviewed processing, and of relying on stale approvals.
- *We make no claims about users, adoption or accuracy; Article25 is a new hackathon project.*

### Design
- **One coherent product.** The issue panel for requesters, a review desk for reviewers, and Settings with Get started for administrators.
- **Native look.** Atlassian Design System tokens throughout: native light and dark themes, accessible, responsive.
- **Honest UI.** Every state says what it knows: "Would be blocked (monitoring, not blocking)", "Rule-based check (limited recall)", "Article25 is setting up".

### Privacy and security
- **Read-only Jira access and no external services.** Data stays in Forge SQL.
- **Minimal data.** Short excerpts only; work-item text is never stored or logged.
- **Server-side access checks.** Administrator and reviewer permissions are checked on every request. Separation of duties is on by default.
- **Integrity.** Signed records; fail-closed enforcement.
- **Known limitation:** restoring an older genuine archive after an uninstall cannot be detected. Restored approvals still only count for unchanged text.
- Privacy policy: [PUBLIC URL].

### What's next
- A Marketplace listing.
- Per-project gate policies.
- An inventory of approved vendors, so "new vendor" signals are richer.
- Dual control for restores.

### Built with
Atlassian Forge (Custom UI, Jira issue panel, global page, workflow validator, triggers, queues, scheduled trigger, Forge SQL, Forge LLM), React, Node.js, Ed25519 (Node crypto), Vite, Vitest, Playwright, axe-core.

## Demo video
- **YouTube (public):** [LINK]
- **Title:** "Article25: privacy review that actually enforces the decision (Codegeist 2026)"
- **Description:** "A 4-minute end-to-end demo of Article25 for Jira, built on Atlassian Forge. Synthetic data; product footage captured from the app. Narration is a synthetic voice."
- **Captions:** upload `submission/video/article25-demo.en.srt`.

## Installation link and judge instructions
- **Installation link:** [SHARING LINK: generated after the production deploy with Sharing]
- **Instructions:** paste `docs/JUDGE_INSTALL.md` (rehearsed in isolation; to be re-run on a clean site).
- **Permissions shown at install:**
  - `read:jira-work`: read work-item text to screen it and to check the gate;
  - `read:jira-user`: reviewer-group membership and names;
  - `read:workflow:jira`: show which transitions carry the gate;
  - plus Forge LLM (only used if AI is switched on).

## Repository
[GitHub URL, public or shared with judges, your choice] · README explains setup, architecture, operation and verification.
