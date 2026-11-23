# Article25

**Privacy review that actually enforces the decision.**

**The privacy review desk that lives inside Jira.** Article25 is an Atlassian Forge app built for Codegeist 2026. It checks new and changed Jira work items for planned processing of personal data. It routes the items that need a decision to privacy reviewers. It can stop a protected workflow transition until a reviewer has approved the *current* text. And it keeps a signed record of every decision, which anyone can verify independently.

The loop is **DETECT → REVIEW → DECIDE → ENFORCE → RECORD → VERIFY / RECOVER**.

> **Status (24 Nov 2026): version 1.0.0 is on `main`, which is CI-green. Production release pending.**
> - All milestones (M1–M5) are merged into `main` (PRs #1–#7).
> - The production deploy, the judges' installation link and the public demo video are the remaining release steps: [`submission/RELEASE_CHECKLIST.md`](submission/RELEASE_CHECKLIST.md).
> - What was tested live and what was only tested automatically: [`submission/FINAL_VERIFICATION_REPORT.md`](submission/FINAL_VERIFICATION_REPORT.md).

## For judges
| | |
|---|---|
| **Install and try it (about 10 minutes)** | [`docs/JUDGE_INSTALL.md`](docs/JUDGE_INSTALL.md). Installation link: *added when the production release is shared* |
| **Demo video (3:59)** | *Link added when published* |
| **What it is, in one page** | *What it does* and *Architecture in one page*, below |
| **Check the claims yourself** | *Verify the claims yourself*, below: tests, the offline record verifier |
| **Privacy policy** | [`docs/privacy-policy.md`](docs/privacy-policy.md) (draft until published) |

---

## What it does

| Step | What happens | Where |
|---|---|---|
| **Detect** | Every created or edited work item is screened in the background. Rule-based extraction always runs. AI-assisted extraction (Forge LLM) runs when it is switched on and a spending cap is set (the judging build: on, 300 checks a day, $5 per installation); otherwise checks are rule-based, and each result says which. Every finding quotes the exact words it is based on. A deterministic, versioned rules engine sets the outcome; the AI never does. | Issue panel *Article25 privacy*; desk *Inbox* |
| **Review** | Reviewers (members of a Jira group) see the text with highlighted evidence, findings and what is new. They can assign the work item to a reviewer. | Desk → review workspace |
| **Decide** | Approve, approve with conditions, request more information, or reject. A decision is bound to the exact text the reviewer saw. Separation of duties stops reporters and assignees deciding on their own work items. | Review workspace |
| **Enforce** | A Jira workflow validator, the *Article25 privacy gate*, lets a protected transition through only when a reviewer's approval covers the current text. Edits that add new privacy signals invalidate the approval, and so does an edit that could only be checked rule-based after an AI-assisted approval. The gate runs in **Monitoring** mode (records what it would block) until an admin chooses **Enforcing**. | Jira workflow editor; desk *Settings* |
| **Record** | Every decision is appended to a hash chain of Ed25519-signed records. Admins can verify the whole record, export a signed archive, check that archive offline with only a public key, and restore it after a reinstall. | Desk *Record* and *Settings* |

## Architecture in one page

```
Jira events ──► trigger ──► queue ──► screening consumer ──► Forge SQL (work items, screenings)
                                          │ rules engine (+ optional Forge LLM, quotes verified)
Issue panel / desk (Custom UI, React) ──► resolver ──► services ──► Forge SQL
                                                        │ decisions ──► signed chain (Ed25519, v3)
Jira workflow transition ──► gate-fn (validator) ──► one SQL snapshot + signature check ──► allow / block
Scheduled reconciler (5 min): re-queues stuck checks, signs pending decisions, purges expired data
```

- **Runtime:** Forge, Node.js 24. Custom UI (React 18, styled with Atlassian Design System tokens, light and dark) for the panel and the global page.
- **Storage:** Forge SQL only, via additive migrations applied by the maintenance queue. Article25 writes nothing to Jira.
- **Permissions:** `read:jira-work`, `read:jira-user` (reviewer-group membership, names) and `read:workflow:jira` (read-only: which transitions carry the gate), plus the Forge LLM module. There is no egress and no Confluence access.
- **Trust:** decisions are signed with a key held in an encrypted Forge environment variable.
  - The public key's fingerprint is shown in Settings, so it can be pinned outside Jira.
  - Keys stored in the database are never trusted for that reason alone.
  - Retired keys stay trusted through signed successions, or through their *public* halves listed in `A25_RECORD_TRUSTED_KEYS`.

Design documents: [`product/SYSTEM_ARCHITECTURE.md`](product/SYSTEM_ARCHITECTURE.md) and [`product/DATA_AND_SECURITY_MODEL.md`](product/DATA_AND_SECURITY_MODEL.md). They keep their original decisions, followed by dated amendments.

## Repository

| Path | Contents |
|---|---|
| `app/` | The Forge app: `manifest.yml`, backend (`src/`), Custom UI (`frontend/`), tests (`test/`), scripts |
| `app/src/core/` | Pure logic: rules, review state, gate policy, ledger v3. No Forge imports; exhaustively unit-tested |
| `app/scripts/verify-archive.mjs` | Independent offline verifier for exported archives (Node crypto only) |
| `product/` | Product requirements, architecture, UX, roadmap and per-milestone results with live evidence |
| `research/`, `spikes/` | Stage 1 research and Forge spikes (historical) |
| `docs/` | Judge install guide, clean-site rehearsal, privacy policy (draft), release notes |
| `submission/` | Release checklist, verification report, Devpost copy, demo film sources |

## Develop and run

Requirements: Node 24, the Forge CLI, and an Atlassian Cloud developer site on which you are an admin.

```bash
cd app && npm ci && npm ci --prefix frontend
```

```bash
npm run check
```

`npm run check` runs lint, copy lint, the permission-freeze guard, backend tests, UI tests (including axe), real-browser contrast checks, the production build and the bundle budgets.

Deploy to your own development environment (sign in with `forge login` first):

```bash
npm run build:ui && forge deploy -e development
```

```bash
forge install --site <your-site>.atlassian.net --product jira -e development
```

### Configuration (Forge environment variables)

| Variable | Encrypted | Purpose |
|---|---|---|
| `A25_RECORD_SIGNING_KEY` | yes | Ed25519 private key (base64 PKCS#8 DER) that signs decisions. **Required** to record decisions. |
| `A25_RECORD_SIGNING_KEY_PREVIOUS` | yes | Only during a planned rotation. The previous key co-signs the handover. |
| `A25_RECORD_TRUSTED_KEYS` | no | Public keys (base64 SPKI) of retired record keys. Keeps their archives restorable and their approvals verifiable. |
| `A25_SIGNING_KEY` | yes | Legacy HMAC key. Only verifies records made before Ed25519 signing (pre-M5 development data). |
| `A25_REVIEWER_GROUP` | no | Jira group whose members may decide. Default `article25-reviewers`. |
| `A25_SCOPE_PROJECTS` | no | Comma-separated project keys to screen. Empty means all projects. |
| `A25_AI_ENABLED`, `A25_AI_MODEL`, `A25_AI_DAILY_BUDGET`, `A25_AI_SPEND_CAP_USD` | no | AI extraction. **Off** unless enabled; the spend cap defaults to $0 (no AI calls). The cap and the daily budget are reserved atomically in SQL before each call; Settings shows spend against the cap. Planned production values: on, 300 a day, $5 per installation ([decision](product/AI_PRODUCTION_DECISION.md)). |

Generate a record key without printing it:

```bash
forge variables set --encrypt -e development A25_RECORD_SIGNING_KEY "$(node -e "process.stdout.write(require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))")"
```

Forge environment variables belong to the app **environment**, not to a site. In production, one key signs the records of every installation; each record names its site, so records cannot be moved between sites. Losing that key is therefore a vendor incident; see *Operate* below.

## Operate

- **Gate modes.**
  - *Monitoring* never blocks. If Article25 itself fails, it records "would block".
  - *Enforcing* blocks unless a verified approval covers the current text, and blocks whenever anything cannot be verified (fail closed).
  - Switching mode is an audited admin action in Settings. Settings also shows which workflow transitions carry *this* environment's gate.
- **Backups.** Settings → *Decision record and recovery* → **Download signed archive**. Keep the file outside Jira. Uninstalling Article25 deletes its data; this was confirmed live.
- **Independent verification (no Jira access, no secrets).** From `app/`, run:

  ```bash
  node scripts/verify-archive.mjs <archive.json> --fingerprint "<fingerprint pinned from Settings>"
  ```

- **Restore after a reinstall.**
  - In Settings, upload or paste the archive and check the report. Then confirm within 10 minutes. Restore is allowed only into an empty record.
  - Protected transitions stay blocked until the restore has finished. Large archives are restored in resumable rounds.
  - Every restored work item is checked again, so an approval only counts if the text it approved is unchanged.
- **Key rotation.**
  - *Planned:* set the new key, move the old key to `A25_RECORD_SIGNING_KEY_PREVIOUS`, and deploy. After the handover is recorded, remove the previous private key and add its **public** key to `A25_RECORD_TRUSTED_KEYS`.
  - *Lost key:* set a new key and list the lost key's public key (it is in every archive; check it against your pinned fingerprint) in `A25_RECORD_TRUSTED_KEYS`.
- **Deploying safely.** Run `npm run check`, deploy to a non-production environment first, then check Settings (database *Working*, signing *Configured*, coverage). Schema changes are additive and apply automatically within seconds of the first request. The full procedure and rollback rules are in the [final readiness audit §9](product/FINAL_READINESS_AUDIT.md#9-deployment-migration-and-rollback).

## Verify the claims yourself

| Claim | How to check |
|---|---|
| All tests pass, including colour contrast in real Chromium (light and dark ADS themes); bundles are within budget (panel ≤ 200 KB gzip, desk ≤ 400 KB) | `cd app && npm run check` (CI runs the same on every push; the contrast step needs `npx playwright install chromium` once locally) |
| Ledger performance | `cd app && npm run bench -- 1000 5000 10000` |
| An exported archive is genuine and complete | `node scripts/verify-archive.mjs <file> --fingerprint "<pinned>"` |
| What was tested live, and what was only tested automatically | [`submission/FINAL_VERIFICATION_REPORT.md`](submission/FINAL_VERIFICATION_REPORT.md) §6 and [`docs/CLEAN_SITE_REHEARSAL.md`](docs/CLEAN_SITE_REHEARSAL.md) Part 0 |

## Documentation index

- Product: [vision](product/PRODUCT_VISION.md) · [requirements](product/PRODUCT_REQUIREMENTS.md) · [MVP scope](product/MVP_SCOPE.md) · [journeys](product/USER_JOURNEYS.md) · [UX spec](product/UX_DESIGN_SPEC.md)
- Engineering: [architecture](product/SYSTEM_ARCHITECTURE.md) · [data and security model](product/DATA_AND_SECURITY_MODEL.md) · [frontend](product/FRONTEND_ARCHITECTURE.md) · [roadmap](product/IMPLEMENTATION_ROADMAP.md)
- Results:
  - [P1 experience](product/P1_EXPERIENCE_RESULTS.md)
  - [M1 foundation](product/STAGE3_FOUNDATION_RESULTS.md)
  - [M2 detect](product/M2_DETECT_RESULTS.md)
  - [M3 review](product/M3_REVIEW_RESULTS.md)
  - [M4 enforce](product/M4_ENFORCE_RESULTS.md)
  - [M5 record](product/M5_RECORD_RESULTS.md)
  - [**final readiness audit**](product/FINAL_READINESS_AUDIT.md)
- Judges: [install guide](docs/JUDGE_INSTALL.md) · [clean-site rehearsal](docs/CLEAN_SITE_REHEARSAL.md)
- Release: [**release checklist**](submission/RELEASE_CHECKLIST.md) · [release notes 1.0.0](docs/RELEASE_NOTES.md) · [approval validity](product/APPROVAL_VALIDITY_INVESTIGATION.md) · [final handover](submission/FINAL_HANDOVER.md) · [final verification](submission/FINAL_VERIFICATION_REPORT.md) · [readiness and approvals](product/RELEASE_READINESS.md) · [production runbook](product/PRODUCTION_RUNBOOK.md) · [permissions matrix](product/PERMISSIONS_MATRIX.md) · [AI decision memo](product/AI_PRODUCTION_DECISION.md) · [privacy policy draft](docs/privacy-policy.md)
- Submission: [Devpost draft](submission/DEVPOST_FINAL_SUBMISSION.md) · [checklist](submission/SUBMISSION_CHECKLIST.md) · [demo film notes](submission/video/VIDEO_PRODUCTION_NOTES.md)

Article25 helps teams run their own privacy reviews. It does not give legal advice, and its findings are prompts for a human decision.
