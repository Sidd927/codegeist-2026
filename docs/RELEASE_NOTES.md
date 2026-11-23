# Article25 1.0.0: release notes

**Privacy review that actually enforces the decision.** This is the Codegeist 2026 release: a Forge app for Jira.

*This file is also the body of the GitHub Release `v1.0.0`. The release is created on the commit that is deployed to production; until then, this describes `main`.*

## What's in it
- **Detect.**
  - New and changed work items are checked in the background.
  - A versioned rules engine sets the outcome, and every finding quotes the exact words it is based on.
  - Optional AI-assisted extraction (Atlassian's Forge LLM) can add findings, but only with verbatim quotes, within a daily limit and a spending cap per installation.
  - Each result says whether it was AI-assisted or rule-based.
- **Review and decide.**
  - An Inbox and a margin-style review workspace.
  - Four decisions: approve, approve with conditions, request information, reject.
  - Each decision is bound to the exact text the reviewer saw.
  - Separation of duties is on by default.
- **Enforce.**
  - The *Article25 privacy gate* is a Jira workflow validator for any transition, with **Monitoring** (records what it would block) and **Enforcing** (blocks, failing closed).
  - Approvals are invalidated when the text gains new privacy signals, or when an edit after an AI-assisted approval could only be checked rule-based.
  - Verified coverage shows which transitions carry the gate.
- **Record, verify and recover.**
  - Ed25519-signed decision records in a hash chain.
  - Whole-record verification, and a signed archive anyone can verify offline (`app/scripts/verify-archive.mjs`).
  - A verified two-step restore after a reinstall.
- **Get started.** A live setup checklist for administrators that never claims protection the workflow scan didn't find.

## Permissions
- Read-only Jira scopes: `read:jira-work`, `read:jira-user` and `read:workflow:jira`.
- The Forge LLM module, for the optional AI-assisted checks.
- No egress: no external network access.
- Data is stored in Forge SQL. Work-item text is never stored or logged; only excerpts of 120 characters or fewer.

## Quality
- 204 backend tests, 89 UI tests with axe accessibility checks, and 24 real-browser colour-contrast checks (Atlassian light and dark tokens).
- Lint, a permission-freeze guard and bundle budgets, all in CI.
- Live testing on a development site with synthetic data, including uninstall → reinstall → restore → verify in an isolated environment. See `submission/FINAL_VERIFICATION_REPORT.md`.

## Known limitations
- **Rule-based checks have limited recall**, and they are labelled as such. AI-assisted checks find more, but no accuracy claim is made: the evaluation set is small and synthetic.
- **Restoring an older, genuine archive** after an uninstall cannot be detected. Restored approvals still count only for unchanged text.
- **The gate controls only the transitions an administrator protects.** Get started and Settings show which ones.
- **Screening is assistive.** It doesn't replace a privacy professional's judgement or give legal advice.

## Install
- **Judges:** `docs/JUDGE_INSTALL.md` (the installation link is added there when the production release is shared).
- **Developers:** the *Develop and run* section of the README.
