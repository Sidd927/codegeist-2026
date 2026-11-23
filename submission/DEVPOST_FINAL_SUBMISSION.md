# Devpost submission: Article25 (copy for every field, NOT submitted)

Written against the **Codegeist 2026 official rules** (https://codegeist2026.devpost.com/rules), read on 23 Nov 2026:
- deadline **22 Dec 2026, 12:00 PT**;
- a demo video under 5 minutes, **public on YouTube**;
- an **installation link** is required, with setup instructions;
- five equally weighted criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation.

**[Brackets]** mark the four things only you can supply: the install link, the video URL, the privacy-policy URL, and your choices on the category and bonus. Everything else is final copy. Every claim is checked against the code and the evidence in the repository (`submission/FINAL_VERIFICATION_REPORT.md`).

---

## 1. Project name
```
Article25
```

## 2. Elevator pitch / tagline (200 characters or fewer; this one has 176)
```
Privacy review that actually enforces the decision: evidence-backed checks, human approval bound to the exact text, a Jira workflow gate, and a signed record anyone can verify.
```

## 3. Category
**Recommended:** Apps for Software Teams. **[YOU: confirm]**

**Why:**
- Article25 triages every work item for privacy impact, and gates the development workflow until the right decision exists.
- Its users are software teams and the privacy reviewers who work with them.

**Considered:**
- *Business Teams:* the reviewers are business users, but the product lives in the software delivery workflow.
- *Specialized Industries:* not industry-specific.

## 4. Bonus prizes
**Select none.** **[YOU: decide on Marketplace]**

| Bonus | Eligible? | Why |
|---|---|---|
| Rovo agents | No | No Rovo modules; we didn't add one just to qualify |
| Atlassian MCP (`rovo:mcp`) | No | No MCP module |
| Teamwork Graph | No | It neither reads from nor writes to the Teamwork Graph |
| Marketplace published or submitted | Not yet | Only if you submit a Marketplace listing before the deadline |

## 5. Short description (gallery card)
```
Article25 checks new and changed Jira work items for planned processing of personal data, and shows the exact words behind every finding. Reviewers decide in a margin-style workspace. A Jira workflow gate lets work move only when a reviewer has approved the current text. Every decision is signed into a tamper-evident record that anyone can verify offline.
```

## 6. "About the project" (the Devpost story; paste as Markdown)

### Inspiration
Most privacy-relevant product decisions begin as an ordinary Jira work item:
- "add session replay to checkout";
- "send shopper emails to an SMS vendor";
- "export payroll data to a new provider".

Article 25 of the GDPR asks for data protection *by design and by default*. Design happens in Jira, but the privacy review usually happens somewhere else: an email, a comment, a meeting. That gap causes four failures:
- **The review is optional.** Nothing in the workflow requires it.
- **It is informal.** An approval is not tied to what was approved.
- **It goes stale.** When the work changes (new data, a new vendor), yesterday's "yes" still looks valid.
- **There is no trustworthy record** of who decided what, about which version of the text.

We wanted to close that gap inside Jira itself: not another reminder, but a review that the workflow actually enforces.

### What it does
1. **Detect.**
   - Every created or edited work item in scope is checked in the background.
   - A versioned rules engine sets the outcome (for example *Review required* or *DPIA likely*).
   - Every finding quotes the exact words it is based on.
   - AI-assisted extraction (Atlassian's Forge LLM, within a daily limit and a hard spending cap) can add findings, but each one must quote the text verbatim or it is discarded. The rules check always runs too, so AI can add signals but never remove them.
   - Each result says whether it was AI-assisted or rule-based.
2. **Review.** Reviewers get an Inbox and a margin-style workspace:
   - the text on the left, the evidence in the margin;
   - "what's new" since the last review;
   - assignment.
3. **Decide.**
   - Approve, approve with conditions, request information, or reject.
   - Each decision is bound to the **exact text** the reviewer saw, through a content fingerprint, with optimistic concurrency.
   - **Separation of duties** (on by default, audited) stops people deciding on their own work. The UI explains the restriction and the next step.
4. **Enforce.**
   - Administrators add the *Article25 privacy gate* to any Jira workflow transition.
   - **Monitoring** records what it would block; **Enforcing** blocks.
   - The gate allows a move only if a human approval covers the **current** text and its signed record verifies. Anything uncertain fails closed, with a clear message in Jira.
   - Settings verifies which transitions really carry the gate.
5. **Invalidate.** When the text changes, Article25 checks it again.
   - New privacy signals (for example contact data, or a new recipient) invalidate the approval automatically, and the gate closes.
   - Harmless edits keep the approval, with a recorded explanation.
6. **Record and recover.**
   - Every decision is an **Ed25519-signed record in a hash chain**.
   - Administrators verify the whole history and export a **signed archive**. Anyone can verify it **offline with only a public key**.
   - After an uninstall, which deletes a Forge app's data, a two-step verified **restore** rebuilds the record into the new installation and re-checks every work item, so only approvals of unchanged text count.
7. **Get started.** A live checklist tells an administrator exactly what is configured, and never claims protection that the workflow scan didn't find.

### How we built it
- **Forge-native, with no egress.**
  - Custom UI (React 18) for the issue panel and the review desk.
  - Resolvers, triggers, queue consumers and a scheduled reconciler on the Node.js 24 runtime.
  - Forge SQL with 15 additive migrations.
  - A Jira workflow validator that reads one SQL snapshot and verifies signatures within its deadline.
- **A deterministic core.**
  - The rules, review state, gate policy and ledger are pure modules with no Forge imports, exhaustively unit-tested.
  - The desk and the gate share one status function, so they cannot disagree.
- **Evidence integrity.**
  - Every quote is verified against the source text.
  - Stored excerpts are 120 characters or fewer; the work-item text itself is never stored or logged.
- **Trust model.**
  - Signing keys live in encrypted Forge environment variables; trust is never derived from database contents.
  - Key rotation uses signed successions; retired keys stay trusted through their public halves.
  - A restore lock keeps the gate closed until a restore completes. Large restores resume in rounds that fit Forge's time limit.
- **AI with hard limits.**
  - A daily call budget and a cumulative spending cap per installation, both reserved atomically in SQL before each call.
  - Settings shows spend against the cap. Without a cap, no AI call is made.
- **Quality.**
  - 204 backend tests, 89 UI tests with axe accessibility checks, and 24 real-browser colour-contrast checks against Atlassian's light and dark design tokens, all in CI.
  - Lint, copy lint, bundle budgets (81 KB panel, 101 KB desk, gzip), and a permission-freeze guard, also in CI.

### Challenges we ran into
- **Uninstalling a Forge app deletes its data.** So "a record you can trust" needed a signed archive that lives outside the app, and a restore that verifies every record before trusting any of it.
- **Forge's 25-second limit versus large restores.** Restores write in small batches within a time budget and resume safely, with the gate held closed until they finish.
- **Trusting signatures when the database could be edited.** Keys come only from encrypted environment variables. A key inserted directly into the database is never trusted (there is a test for exactly that).
- **AI that sounds right but isn't.** Every AI finding must quote the text verbatim, or it is dropped. The deterministic rules always run as a floor, so a missed or suppressed signal (including by prompt injection in the ticket) can't produce a cleaner result.
- **Honest setup.** Installing an app protects nothing until a workflow transition carries the gate. Getting Get started to say "Not protected" truthfully meant scanning workflows per environment. An audit found that development and production coverage could be confused, and we fixed it.
- **The first minute after install.** Pages could load before the schema existed. They now show "Article25 is setting up" and trigger the migration themselves (measured at 3.5 s).

### Accomplishments that we're proud of
- **Approvals that expire on material change**, automatically, and a real Jira gate that enforces them.
- **A record you don't have to trust us for**: signed, chained, exportable, verifiable offline with one script, and restorable after a reinstall. Tested live: uninstall → reinstall → restore → verify → re-check, in an isolated environment.
- **AI that can only add evidence, never decide**, with spend limits enforced on the server. If AI is unavailable when an approved item is edited, the approval is not carried over on a weaker check: a reviewer looks again.
- **Live-tested** on a development site with synthetic data:
  - screening;
  - all four decisions;
  - separation of duties;
  - stale-evidence and concurrency refusals;
  - the gate blocking and allowing in company- and team-managed projects;
  - invalidation;
  - export, offline verification and tamper detection;
  - recovery;
  - the first-run checklist.

### What we learned
- **The hard part of compliance tooling is not detection; it is making the decision stick.** Binding approvals to the exact text was the idea that made everything else (the gate, invalidation, the record) fall into place.
- **Fail closed, but roll out gently.** Monitoring mode lets teams see what would be blocked before anything is.
- **Say what you don't know.** Labelling every result as AI-assisted or rule-based, showing "limited recall", and refusing to call a workflow "protected" without proof made the product more trustworthy, not less.
- **Forge's constraints are good design pressure:** no egress, time limits, and data deleted on uninstall each pushed us towards a simpler, more verifiable architecture.

### What's next for Article25
- A Marketplace listing.
- Per-project gate policies.
- An inventory of approved vendors, so "new recipient" signals are sharper.
- Dual control for restores.
- A larger, independent evaluation set before any accuracy claim.

## 7. "How does your project meet the main technology requirement?"
```
Article25 is an Atlassian Forge app (Node.js 24 runtime) for Jira. It uses: a jira:issuePanel (the "Article25 privacy" panel on every work item); a jira:globalPage (the review desk: Overview with Get started, Inbox, review workspace, Record, Settings); a jira:workflowValidator (the "Article25 privacy gate", added to any transition in Jira's workflow editor); triggers for work-item and app-lifecycle events; queue consumers and a scheduled trigger for background checks and a 5-minute reconciler; Forge SQL for all data; and the Forge LLM module for optional, capped AI-assisted extraction. Scopes are read-only (read:jira-work, read:jira-user, read:workflow:jira), and the app has no external network access.
```

## 8. Built with
```
atlassian-forge, jira, forge-sql, forge-llm, custom-ui, react, javascript, node.js, ed25519, vite, vitest, playwright, axe-core
```

## 9. Installation link and instructions
- **Installation link:** [SHARING LINK: generated after the approved production deploy with Distribution → Sharing]
- **Setup instructions:** paste the contents of `docs/JUDGE_INSTALL.md` (install, a 5-minute setup, a 3-minute tour, troubleshooting). Or link to it in the repository.
- **Permissions judges will see:**
  - `read:jira-work`: read work-item text to check it, and to check the gate;
  - `read:jira-user`: reviewer-group membership and names;
  - `read:workflow:jira`: show which transitions carry the gate;
  - plus Forge LLM: AI-assisted checks within a daily limit and a spending cap.

## 10. Video demo link
**[YOUTUBE URL: public; see `submission/video/YOUTUBE_UPLOAD_KIT.md`]**

## 11. Repository (optional on Devpost)
https://github.com/Sidd927/codegeist-2026. The repository is **public**.

The finished work is on the stacked PR branches until you merge them. Merge before submitting, so the default branch shows the final code.

## 12. Image gallery (optional)
Use stills from the film:
- `build/article25-thumbnail.png`;
- frames at 0:41 (reveal), 1:30 (review), 2:02 (Jira refusal) and 2:45 (invalidated).

Export them with `ffmpeg -ss <t> -i build/article25-demo-final.mp4 -frames:v 1 still.png`.

## 13. Privacy and honesty notes (keep in mind while editing)
- No claims about users, adoption, certifications, compliance or accuracy.
- "Article25" is a product name, not a claim of GDPR compliance.
- Data stays in Forge SQL; there is no egress; work-item text is never stored or logged.
- **Known limitation:** restoring an older, genuine archive after an uninstall cannot be detected. Restored approvals still count only for unchanged text.
- Privacy policy: [PUBLIC URL]
