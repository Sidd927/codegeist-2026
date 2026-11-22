> **⚠️ DRAFT — NOT PUBLISHED AND NOT LEGALLY REVIEWED.** This is a working draft for the Article25 hackathon build. It is not the app's live privacy policy. Items marked [REVIEW] need review by a lawyer or privacy professional before publication. See `docs/privacy-policy-review.md`.

# Article25 — Privacy Policy (hackathon build)

_Last updated: [DATE OF PUBLICATION]. Applies to the Article25 Forge app build distributed for Atlassian Codegeist 2026 testing and judging. It does not describe any other product or service._

## Who we are
Article25 is a hackathon project built by an individual developer, Siddhant Patil. It is not a company product and comes with no service-level commitment.
**Contact (privacy and deletion requests):** [PRIVATE EMAIL ADDRESS — to be provided]. Please don't post personal data in public issue trackers. [REVIEW: developer role (controller/processor) and whether a DPA is needed]

Article25 is a product name. It is **not** a statement that the app or its users comply with GDPR Article 25 or any other law. We hold **no** security or privacy certifications.

## What the app does
Article25 runs on Atlassian Forge and is hosted by Atlassian. It:
- screens newly created Jira work items for signs of personal-data processing;
- records privacy-review decisions made by members of a reviewer group;
- blocks workflow transitions the site admin has chosen to gate until a review is approved; and
- publishes a privacy register and a decision backup to a Confluence page the site admin chooses.

## Data the app processes
| Data | Source | Purpose |
|---|---|---|
| Work-item summary and description of **newly created work items** [product: only in projects you configure] | Jira | Screening. The full text is read in memory and **not stored**. |
| Screening result: outcome, categories, rule IDs, up to 8 short excerpts (≤120 characters each), a one-way content fingerprint (SHA-256) | Derived | Explain why a work item was flagged; detect later edits |
| Review decisions: work-item key, decision, reviewer-entered conditions, reviewer Atlassian account ID, timestamp, decision ID, site ID, signature and hash-chain fields | Reviewers | Gate workflows; keep a tamper-evident decision history |
| Group memberships of the acting user (read only, not stored) | Jira | Check reviewer and recovery-admin permissions |
| Recovery audit entries: account ID, action, result, details | App | Accountability for recovery actions |
| Confluence page content of pages you point the app at | Confluence | Policy lookup and register publishing |

Please don't put personal data into review **conditions**. They are copied to the Confluence backup described below.

## Where data is stored
- **Atlassian Forge storage** for your installation (Forge SQL and Forge key-value storage): screening results, decisions, review state, decision chain, and recovery audit log.
- **On your own site**, readable by anyone with permission to view the page or work item:
  - the Confluence register page you select. Its content property `article25-chain` holds the full decision history (including reviewer account IDs and conditions), and its page history holds signed checkpoints (no names);
  - the Jira issue property `article25-review` on each decided work item (decision, date and a signed receipt).

  Choose a Confluence space whose permissions suit this information.
- **Operational logs** are kept by Atlassian and visible to the developer in Atlassian's developer console, unless your site admin has turned off developer log access. The judge build logs only identifiers, outcomes, counts and timings. [ENGINEERING: must be true before publication; the current spike logs more]

The app sends **no data to servers operated by the developer**, and it has no external network access configured. Atlassian processes data as the platform provider under its own terms: https://www.atlassian.com/legal/privacy-policy. We make no claim about data residency.

## AI processing (optional, off by default) [REVIEW]
If an admin turns AI assistance on, work-item text is sent to Atlassian's Forge LLM service, which runs within Atlassian's platform, to suggest a screening explanation. That processing is governed by Atlassian's terms for Forge LLM. With AI off, screening uses deterministic rules only. [Do not add training, retention or region statements unless Atlassian's published Forge LLM terms confirm them.]

## Retention and deletion
- **Uninstalling the app deletes its Forge storage** (screening results, decisions, review state, decision chain, audit log). We verified this on a test site.
- **Data on your site is not deleted on uninstall.** The register page, its `article25-chain` property and page history, and the `article25-review` issue properties stay until you delete them. This is intentional: it lets an authorised admin restore verified decisions after reinstalling. To remove it, delete the register page (and purge it from the Confluence trash) and remove the issue properties or the work items. A space admin can also delete individual page versions.
- The app's signing key is held by the developer's Forge environment, not on your site. It contains no personal data and is not deleted on uninstall.

## Security
- Reviewer and recovery actions require membership of Jira groups that your admins control (`article25-reviewers`, `article25-recovery-admins`).
- If the app cannot determine an approved review (error, misconfiguration or uninstall), gated transitions are **blocked**, not allowed.
- The Confluence decision backup is **tamper-evident**. Modified, deleted, reordered or replayed records are detected and nothing is restored. A user with Confluence space-admin rights who rolls back the backup *and* its page history *and* the work-item receipts to an earlier consistent state could make an older history appear complete. Recovery therefore requires a recovery-admin, a two-step confirmation and an audit entry.
- Screening is assistive. It can miss things and can flag things wrongly, and it does not replace a privacy professional's review.

## Your choices and requests [REVIEW]
Site admins can disable AI, choose which projects and workflows are gated, choose the register space, turn off developer log access in Atlassian admin settings, and uninstall the app at any time. For questions or deletion requests, use the contact above.

## Changes
We will update this page and its date if the app's data handling changes.
