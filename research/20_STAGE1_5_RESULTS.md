# 20 — Stage 1.5 Results: Conditions C1–C3

**Date:** 2026-11-22 · **Site:** one-atlas-psvy.atlassian.net · **App:** `article25-core-spike` (multi-app: Jira required, Confluence optional) · **Data:** synthetic only
**Status (updated 2026-11-22, after C3b):** C2 ✅ PASSED · C3 ✅ PASSED, **recovery integrity (hash chain + authorised recovery) ✅ PASSED**, see `22_RECOVERY_RESULTS.md` · **C1 ⏳ PREPARED, NOT RUN** (needs user actions, see below and `23_STAGE15_FINAL_DECISION.md`)

> **Verified vs. outstanding at a glance**
> - ✅ Verified with evidence: C2 atomic storage and concurrency; C3 uninstall wipe + signed backup; C3b hash chain (21/21 unit tests, 13 live checks incl. TOCTOU, stale nonce, modify/delete/truncate/reorder/replay/empty, authorised restore, gate before and after).
> - ✅ Done (desk review, not a test): privacy-policy review (`docs/privacy-policy-review.md`), revised draft policy (unpublished), draft judge install guide (unrehearsed).
> - ⏳ Outstanding: the C1 judge-install rehearsal on a clean second site; production redeploy with chain code; public privacy-policy URL; Distribution = Sharing. All need the user's approval or action.

---

## C2 — Atomic storage (PASSED)

### Design implemented (`src/db.js`)
- **Forge SQL** (`sql` module, `engine: mysql`; adding it = major version upgrade).
- `decisions` table: append-only, `decision_id` **PRIMARY KEY**, `INSERT IGNORE` → `affectedRows = 0` means duplicate (idempotent no-op).
- `review_state` table: one row per work item, **optimistic concurrency** (`UPDATE … WHERE issue_key = ? AND version = ?`, retry ≤ 8). **Monotonic by decision time:** an older decision arriving late cannot roll state back.
- `counters`: atomic `UPDATE … SET value = value + ?`.
- The validator now reads `review_state` from SQL.

### Finding: don't run migrations on the request path
The first version called `migrationRunner.run()` lazily on every cold start. Under parallel load, **22–29 of 58 calls failed** with `ForgeSQLAPIError: Limits for the current installation have been exceeded (RATE_LIMIT_EXCEEDED)`, stack in `executeDDL ← MigrationRunner.list`. Migrations use the **DDL API, limited to 25 requests/minute per installation** (Forge SQL limits). **Fix:** migrations run only from an `avi:forge:installed:app` / `avi:forge:upgraded:app` trigger and an explicit admin action. Verified: the install trigger logged `applied: [v001_decisions, v002_review_state, v003_counters]`.

### Concurrency test (58 browser-initiated invokes, in waves of 10 truly parallel calls; all 58 succeeded)
| Check | Expected | Result |
|---|---|---|
| Naive KVS read-modify-write counter (old pattern) | 15 | **11**: 4 lost updates; race reproduced |
| SQL atomic counter | 15 | **15** ✅ |
| Duplicate decisionId `CONC-1:d0` (7 attempts) | 1 row | **1 inserted, 6 "dup-rejected" by PRIMARY KEY** ✅ |
| Distinct decisions on one work item | 12 rows | **12** ✅ |
| review_state version progression | monotonic, conflicts resolved | versions 1→11. **2 optimistic conflicts retried** (`r1`). **1 late decision correctly did not roll state back.** Final state = latest decision ✅ |
| Decisions on 10 different work items | 10 | **10** ✅ |

## C3 — Durability and recovery (PASSED, residual risk noted)

### Design implemented (`src/mirror.js`, `src/review.js`)
1. Every decision `{decisionId, issueKey, state, conditions, decidedBy, decidedAt}` is **signed with HMAC-SHA256** using `A25_SIGNING_KEY`, an **encrypted Forge environment variable** (app environment-level, not installation-level). The key was generated with `openssl rand`, never printed or written to disk. Production has its own key.
2. The decision is written to SQL (authoritative) and **appended to a Confluence content property** `article25-decisions` on the customer-owned register page (optimistic concurrency via property version, retry on 409). The issue property is display-only.
3. **Rebuild:** read the property, verify each signature, re-insert verified decisions through the same idempotent `recordDecision`, and report rejected records.

### Test sequence and results
| Step | Result |
|---|---|
| Reviewer approves **A25C-1** (panel) | SQL `inserted:true, v1`; mirror `propertyVersion:1`; signature `23664453b3…`; issue property 200 |
| Reviewer approves **AS-2** with conditions | SQL v1; mirrored (property v2) |
| **Tamper as an ordinary user via REST:** add forged `AS-1 APPROVED` (fake signature) and rewrite AS-2's conditions | **HTTP 200.** Content properties are user-writable, which confirms the need for signatures. |
| **Uninstall** the app (single multi-app installation) | Uninstalled |
| Env var after uninstall | `A25_SIGNING_KEY` **still present** (encrypted) ✅ |
| Reinstall Jira (required) + Confluence (optional) | New installation `19bd416b…`; install trigger re-applied **all 3 migrations** on an empty DB, so **Forge SQL data is also wiped on uninstall** |
| Gate before rebuild | A25C-1 → In Progress: **400 "no privacy review recorded"** (approval lost, as expected) |
| **Rebuild from mirror** | `found:3, restored:1, rejected:2`: AS-2 (edited conditions) and AS-1 (forged), both **"signature mismatch"** ✅ |
| Gate after rebuild | **A25C-1 → 204, In Progress** ✅ · **AS-1 → 400, blocked** (forgery not honoured) ✅ |

### Residual risks and follow-ups
- **Record deletion / rollback:** per-record signatures don't detect removal of a *later* record (e.g. deleting a REJECTED to resurface an older APPROVED). Mitigation: a **hash chain** (each record signs the previous record's hash) detects middle deletions. Tail truncation still needs an external anchor, so rebuilds must be **DPO-confirmed** with a visible diff.
  - **→ Resolved in C3b (2026-11-22):** hash chain plus signed checkpoints (Confluence page-version messages) plus signed receipts (Jira issue properties), with an authorised two-step recovery. Verified live: deleting the REJECTED tail is detected by both anchors and nothing is restored (`22_RECOVERY_RESULTS.md` T3). Remaining limit: a *consistent* rollback by a Confluence space admin who also edits the receipts (22 §5).
  - The v1 mirror (`article25-decisions`, `src/mirror.js`) is superseded by `article25-chain` and must not ship.
- **Legitimate-but-edited records** (AS-2) are rejected by design; the product must show them as "needs re-confirmation".
- **Property size:** one JSON property per page holds the whole list. Shard by period/project for large registers (limit untested).
- **Key rotation:** rotating `A25_SIGNING_KEY` invalidates old signatures. Support key IDs (`kid`) and keep old keys for verification.
- **Uninstall procedure (to document for customers/judges):** (1) export decisions; (2) remove the Article25 validator from workflows *or* accept that gated transitions block; (3) uninstall; (4) after reinstall, run "Rebuild from register" and review rejected records.

## C1 — Judge-install rehearsal (PENDING)
Done so far:
- Production deployment of `article25-core-spike` (v2.0.0, "eligible for Runs on Atlassian"), with its own encrypted signing key.
- Draft privacy policy: `docs/privacy-policy.md` (needs a public URL before Distribution = Sharing).

Needs the user:
1. A **second, clean Atlassian Cloud site** (free developer site) to act as the judge's site.
2. Approval to publish the privacy policy at a public URL (e.g. push `docs/privacy-policy.md` to the public GitHub repo), or another URL.
3. Approval to set the app's **Distribution to "Sharing"** in the developer console. Anyone with the link could then install it.

Then: install via link on the clean site (org/site admin), connect Confluence, add the validator, run block → approve → allow, publish the register, and record any friction a judge would hit.

### C1 preparation (2026-11-22, read-only checks; nothing changed in production)
| Item | Verified state | Evidence |
|---|---|---|
| Production environment | Exists (`85eccf93…`). Last deploy **major version 2** at 09:24, i.e. **before** the hash chain (dev is major 3, v3.5.0). **Production must be redeployed before C1.** | `forge environments list`, `forge deploy list` |
| Production signing key | `A25_SIGNING_KEY` present, encrypted (value never displayed) | `forge variables list -e production` |
| Production installations | **None.** Only the development installation `59e18718…` exists. | `forge install list` |
| Scopes (8) | `read:jira-work`, `write:jira-work`, `read:jira-user`, `storage:app`, `search:confluence`, `read:page:confluence`, `write:page:confluence`, `read:space:confluence`. No Teamwork Graph scopes, so **site admin** install is enough (no org admin). | `manifest.yml` |
| Lint | `forge lint` → "No issues found" | CLI |
| Multi-app compatibility | `jira: required`, `confluence: optional` (Preview). Install order verified via CLI only: Jira, then Confluence. **Not verified:** how the *sharing link* offers the Confluence connection. | CLI install logs |
| Privacy policy | Reviewed against the code, revised draft written (`docs/privacy-policy.md`, unpublished). **Blockers before publishing:** private contact address, removal of payload logging, legal review items. | `docs/privacy-policy-review.md` |
| Public URL host | `github.com/Sidd927/codegeist-2026` is **public** with issues enabled; branch `stage1-research-and-spikes` has **not been pushed**. | `gh repo view` (read-only) |
| Judge instructions | Draft written, **unrehearsed** | `docs/JUDGE_INSTALL.md` |
| Build readiness | The spike is **not** the judge build: it contains test-only controls (tamper button, simulate hook, insecure expression validator, v1 mirror) and verbose payload logging. | Code review |
