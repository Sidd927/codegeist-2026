> **⚠️ DRAFT: NOT PUBLISHED AND NOT LEGALLY REVIEWED.** Rewritten on 23 Nov 2026 to match the app as built. Draft v1 described a Stage 1 prototype with a Confluence register and issue properties; the product has neither, and draft v1 remains in the Git history.
>
> - Items marked **[CONFIRM]** need your input.
> - Items marked **[REVIEW]** need a lawyer or privacy professional.
> - Do not publish until both are resolved.

# Article25: Privacy Policy

_Last updated: [DATE OF PUBLICATION] [CONFIRM]_

**Scope.** This policy covers the Article25 app for Atlassian Jira, built on Atlassian Forge and distributed for Atlassian Codegeist 2026 testing and judging. It covers nothing else.

## Who we are
**The developer.** Article25 is built by an individual developer, Siddhant Patil. It is not offered by a company, and it comes with no service-level commitment.

**Contact for privacy questions and deletion requests:** [PRIVATE CONTACT EMAIL] [CONFIRM]. Please don't send personal data through public issue trackers.

**What the name means.** "Article25" is a product name. It is **not** a statement that the app, or anyone who uses it, complies with GDPR Article 25 or any other law. We hold no security or privacy certifications. [REVIEW: the developer's role (controller, processor or neither) for a Forge app with no external data transfer]

## What the app does
Article25 runs entirely on Atlassian's Forge platform, hosted by Atlassian. It:
- reads the text of new and changed Jira work items, in the projects an administrator has in scope, to look for planned processing of personal data;
- lets members of a Jira group (the reviewer group) record privacy decisions;
- can block workflow transitions that a Jira administrator has chosen to protect, until a reviewer has approved the current text;
- keeps a signed record of decisions that administrators can export and verify.

**Article25 writes nothing to Jira.** Its permissions are read-only:
- `read:jira-work`;
- `read:jira-user`;
- `read:workflow:jira`.

## Data the app processes
| Data | Source | Kept? | Why |
|---|---|---|---|
| Work-item summary and description | Jira | **Not stored.** Read in memory for each check | Screening |
| Work-item tracking: work-item ID and key, project key, processing state and outcome | Jira / derived | Yes, until the work item is deleted | Know what to check and show its state |
| Screening result: outcome, findings with **short excerpts (120 characters or fewer)** of the text that triggered them, a one-way content fingerprint (SHA-256), rule and pipeline versions | Derived | Yes | Explain why a work item was flagged; detect later edits |
| Review decisions: work-item ID, decision, the reviewer's rationale, conditions or questions, the **reviewer's Atlassian account ID**, timestamps, the fingerprint of the reviewed text | Reviewers | Yes | Accountability; workflow protection |
| Reviewer assignments: the assignee's and assigner's account IDs, timestamps | Reviewers | Yes | Routing |
| Signed decision records: decision ID, work-item ID, decision, conditions, the reviewer's account ID, timestamps, signature and chain hash | Derived | Yes | Tamper-evident history |
| Audited settings changes: the administrator's account ID, value, optional note, timestamp | Administrators | Yes | Accountability |
| Workflow-gate checks: work-item ID, project key, transition status IDs, result, reason code, a short content reference (16 hex characters of the fingerprint) | Derived | **30 days** | Show what the gate did |
| Record activity (export, verify, restore, adopting a previous signing key): the administrator's account ID, result, archive digest | Derived | Yes | Accountability |
| Usage counters: per day, the number of checks, AI calls, rule-based checks and tokens; the installation's total AI spend | Derived | Yes | Enforce the daily AI budget and the spending cap. **No text and no account IDs** |
| Archive transfers in progress | Administrators | **1 hour** | Chunked export and restore |
| Group membership and display names of users | Jira | **Not stored.** Read when needed | Permission checks; showing names |
| Workflow configuration | Jira | **Not stored** | Showing which transitions carry the gate |

Please don't put unnecessary personal data in rationales, conditions or questions. They are part of the permanent decision record.

## Where data is stored
**In the app's storage.** All stored data is in **Forge SQL storage for your installation**, hosted by Atlassian. Nothing is stored on your Jira site, in Confluence, or on any server operated by the developer.
- The app has **no external network access**: the manifest declares no egress.
- Atlassian processes data as the platform provider under its own terms: https://www.atlassian.com/legal/privacy-policy.
- We make **no claim about data residency**. [REVIEW]

**In operational logs.** Logs are kept by Atlassian and visible to the developer in Atlassian's developer console, unless your site administrator has turned off developer log access.
- Article25 writes only an allow-listed set of fields: event names, error codes, durations, numeric work-item IDs, outcome codes and counts.
- **It never logs work-item text, rationales or account IDs.**

## AI processing
**In the published build, AI-assisted checks are on, within limits set by the developer:** a daily number of AI checks and a total spending cap per installation, both enforced on the server. If AI is unavailable, over its daily budget or over the cap, screening falls back to deterministic rules only, and the result says so. Administrators see spend against the cap in Settings. [CONFIRM: the published limits, currently 300 checks a day and USD 5 per installation]

**When AI-assisted checks run:**
- work-item text is sent to **Atlassian's Forge LLM service**, which runs within Atlassian's platform, to extract possible privacy signals;
- every signal must quote the text verbatim, or it is discarded;
- a rules engine, not the AI, sets the outcome;
- that processing is governed by Atlassian's terms for Forge LLM [REVIEW: confirm Atlassian's published Forge LLM terms on retention, training and sub-processors before stating anything beyond this];
- each result shows whether it came from AI-assisted or rule-based checks.

## Retention and deletion
- **While installed:** decisions, assignments and signed records are kept for the life of the installation, for accountability. This includes decisions about work items that are later deleted.
- **Deleted work items:** their screening data is removed.
- **Workflow-gate checks:** removed after 30 days.
- **Archive transfers:** removed after 1 hour.
- **Uninstalling Article25 deletes all of its stored data.** We verified this on a test installation.
- **Signed archives** that an administrator downloads are files you control. They contain decisions, rationales and reviewers' account IDs; store and delete them according to your own policies.
- **The record signing key** belongs to the app's Forge environment, held by the developer. It contains no personal data. It lets a restored archive verify after a reinstall.

## Security
**Access:**
- Only Jira administrators can open Settings, change the gate mode or separation of duties, export, verify or restore the record. This is checked on the server for every request.
- Only members of the configured reviewer group can record decisions, also checked on the server. Separation of duties (on by default) stops people from deciding on work items they reported or are assigned to.

**Integrity:**
- Decisions are signed (Ed25519) and chained. Edits, deletions, reordering and replays are detectable.
- Restoring an **older**, genuine archive after an uninstall cannot be detected. Every restored approval is re-checked against the current text of its work item.

**Limits:**
- **The gate fails closed** when enforcing. If Article25 cannot verify an approval, protected transitions are blocked. Transitions that an administrator has not protected are not controlled by Article25.
- **Screening is assistive.** It can miss processing of personal data, or flag it wrongly. It does not replace a privacy professional's judgement.

## Your choices
Site administrators can:
- choose which workflow transitions carry the gate, and switch between Monitoring and Enforcing;
- switch separation of duties off or on (audited);
- export, verify and restore the decision record;
- turn off developer log access in Atlassian administration;
- uninstall the app at any time.

For questions or deletion requests, use the contact above. [REVIEW: the rights and requests wording, jurisdiction]

## Changes
We will update this page and its date if the app's data handling changes.
