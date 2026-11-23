# Production release runbook

**Status (23 Nov 2026):** production has an early build (deployed 22 Nov), **no installations**, **no environment variables**, and no sharing link. Nothing in this runbook has been executed.

Steps marked **[YOU]** need your approval or your own hands:
- production key generation;
- the sharing link;
- spending decisions;
- publishing.

Run everything from `app/` with Node 24 (`export PATH=/opt/homebrew/opt/node@24/bin:$PATH`), signed in with `forge login` (you do the sign-in).

## 0. Preconditions (check before anything else)
| Check | How | Must be |
|---|---|---|
| Release commit | `git log -1` on the branch you will merge | Tagged, CI green (lint incl. the permission-freeze guard, 204 backend, 89 UI, 24 contrast, build, budgets) |
| Scopes frozen | `manifest.yml` → `permissions.scopes` | Exactly `read:jira-work`, `read:jira-user`, `read:workflow:jira`; plus the `llm` module (decision: [AI_PRODUCTION_DECISION.md](AI_PRODUCTION_DECISION.md)) |
| Scope freeze date | Calendar; [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md) §5 | **On or before Fri 4 Dec 2026.** Scope changes after judges install force re-consent |
| Privacy policy URL | [`docs/privacy-policy.md`](../docs/privacy-policy.md), published by you | A public URL (Sharing requires one) **[YOU]** |
| Clean-site rehearsal | [`docs/CLEAN_SITE_REHEARSAL.md`](../docs/CLEAN_SITE_REHEARSAL.md) | Passed on a separate site |

## 1. Production environment variables
Set these before the first production deploy. A deploy without a record key installs fine but cannot record decisions (Get started says *Missing*).

**1.1 Record signing key [YOU].** Generated on your machine, piped straight into Forge, never printed or stored:

```bash
forge variables set --encrypt -e production A25_RECORD_SIGNING_KEY "$(node -e "process.stdout.write(require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))")"
```

**Why this is safe:**
- the key is created inside the `node` process and handed straight to `forge`, which stores it encrypted;
- it is never written to a file, the clipboard or the terminal;
- your shell history keeps only the command text, not the key.

**Two cautions:**
- For the moment the command runs, the key is an argument of the `forge` process. Run it on your own machine, not a shared one.
- Run it **once**. Running it again silently replaces the key, so records signed with the first key would then need its public key in `A25_RECORD_TRUSTED_KEYS` (see §7, key loss).

**Verify without revealing it:**
1. `forge variables list -e production` must list `A25_RECORD_SIGNING_KEY` with the value shown as `****` (encrypted).
2. After the deploy and the first install, *Settings → Decision record and recovery* shows signing as **Configured**, with a key id and fingerprint. *Get started* shows *Sign every decision · Configured*.

Do **not** set `A25_SIGNING_KEY` (legacy HMAC) in production: there are no legacy records there.

**1.2 Pin the fingerprint [YOU].** After the first install, open *Settings → Decision record and recovery*. Copy the key fingerprint into your password manager or audit file. This is what auditors pin with `verify-archive.mjs --fingerprint`.

**1.3 AI.** **Decided: hybrid with a hard cap** (memo §6, option A). Use the commands under "Hybrid" below, with the cap you name. The rules-only commands are kept for reference. Rules-only:

```bash
forge variables set -e production A25_AI_ENABLED false
```

```bash
forge variables set -e production A25_AI_SPEND_CAP_USD 0
```

Hybrid (**decided: $5 cap per installation**; run with the production deploy, after it is approved):

```bash
forge variables set -e production A25_AI_ENABLED true
```

```bash
forge variables set -e production A25_AI_MODEL claude-haiku-5-5
```

```bash
forge variables set -e production A25_AI_DAILY_BUDGET 300
```

```bash
forge variables set -e production A25_AI_SPEND_CAP_USD 5
```

**1.4 Leave unset** (the defaults are correct for judges):
- `A25_REVIEWER_GROUP` (default `article25-reviewers`);
- `A25_SCOPE_PROJECTS` (all projects);
- `A25_RECORD_TRUSTED_KEYS` (only after a key rotation).

**1.5 Verify** (values of encrypted variables show as `****`):

```bash
forge variables list -e production
```

## 2. Deploy
```bash
npm run check && npm run build:ui && forge lint
```

```bash
forge deploy -e production --non-interactive
```

**Migrations:**
- All 15 are additive (`CREATE TABLE IF NOT EXISTS`).
- They are applied by the install/upgrade lifecycle event and self-heal from the first request: measured live at 3.5 s after install.
- Pages show "Article25 is setting up" until they finish.

## 3. Sharing link [YOU]
**Steps** (console labels may differ slightly; nothing here was clicked by the agent):
1. Open [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps) → **Article25** → **Distribution**.
2. Set the distribution status to **Sharing**.
3. Fill in:
   - the app's name and description (from `submission/DEVPOST_FINAL_SUBMISSION.md`, the tagline);
   - the **privacy-policy URL** (published by you);
   - a **contact email** you choose;
   - the data-handling answers (below).
4. Save, then **generate the installation link** for the **production** environment and Jira.
5. Test it signed out of your developer account, on the clean site (§4).
6. Then paste it into the Devpost form and `docs/JUDGE_INSTALL.md`.

The link is a sharing link, not a Marketplace listing: anyone who has it can install. Share it only where the rules require (the Devpost form).

**Data-handling answers:**
- **Personal data:** account ids of reviewers; work-item excerpts of up to 120 characters.
- **Storage:** Forge SQL, hosted by Atlassian.
- **Egress:** none.
- **AI:** Forge LLM, if enabled.

## 4. Post-deploy verification (on the clean site, using the sharing link)
| Step | Expected |
|---|---|
| Install from the link | Three read-only Jira scopes shown; install succeeds |
| *Apps → Article25 → Overview* | Get started: *Sign every decision · Configured*; *Protect a workflow transition · Not protected* |
| Settings → Workflow gate | Database *Working*, signing *Configured*, mode *Monitoring* |
| Create a test work item from the judge guide | The panel shows a result within seconds, labelled by mode |
| Follow `docs/JUDGE_INSTALL.md` end to end | Every step passes, timed |
| Logs | `forge logs -e production --since 30m` shows no `resolver.failed` except `SETTING_UP` in the first minute |

## 5. Monitoring during judging (5 Jan – 3 Feb 2027)
- Daily: `forge logs -e production --since 24h` and grep for `resolver.failed|gate.error|migrations.failed`. The logs are content-free by design.
- Weekly: the developer console's installations and invocation errors.
- If AI is on: watch `costMicros` in the logs, and the *AI spending limit* line in each site's Settings ("$x of $5.00 used"). When a site reaches the cap, its checks continue rule-based, labelled *The AI spending limit for this installation is reached.*

## 6. Rollback
- **Code:** redeploy the previous tagged commit with `forge deploy -e production`.
  - Migrations are additive, so older code runs on the newer schema.
  - **Never** roll back below M5 once Ed25519 records exist: enforcing sites would block every approval (fail closed).
  - **Never** roll back while a restore is incomplete.
- **Variables:** revert with `forge variables set` and redeploy (variables apply on the next deploy).
- **Scopes:** cannot be rolled back silently; any change re-prompts every site. Don't change them after 4 Dec.

## 7. Recovery procedures
- **A customer reinstalls:** Settings → *Restore* with their archive. It is verified, then confirmed within 10 minutes. Large archives restore in resumable rounds.
- **Key rotation (planned):**
  1. Set the new key and move the old one to `A25_RECORD_SIGNING_KEY_PREVIOUS`, then deploy.
  2. Afterwards, remove the previous key and add its **public** key to `A25_RECORD_TRUSTED_KEYS`.
  3. Pin the new fingerprint.
- **Key loss:** set a new key and put the lost key's public key (from any archive, checked against the pinned fingerprint) into `A25_RECORD_TRUSTED_KEYS`. One action fixes it for every site.
- **Incident in enforcing mode:** an admin switches to Monitoring in Settings. The change is audited and immediate; monitoring never blocks.
