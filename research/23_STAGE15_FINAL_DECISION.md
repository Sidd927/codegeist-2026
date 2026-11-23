# 23 — Stage 1.5 Final Decision

**Date:** 2026-11-22 · **Inputs:** `19_STAGE1_GO_NO_GO.md` (CONDITIONAL GO, conditions C1–C3), `20_STAGE1_5_RESULTS.md`, `22_RECOVERY_RESULTS.md`, `docs/privacy-policy-review.md`
**Decision: GO for the product build on the technical conditions (C2, C3). C1 remains OPEN** and must close before submission. It is a distribution and install rehearsal, not a technical-feasibility risk.

## 1. Condition status
| Condition | Status | Evidence | Type |
|---|---|---|---|
| **C2: Atomic storage under concurrency** | ✅ CLOSED | Forge SQL: PK idempotency, optimistic monotonic review state, atomic counters; 58 parallel invokes; KVS race reproduced (11/15) and fixed (15/15) | Verified live |
| **C3: Durability and recovery** | ✅ CLOSED | Uninstall wipes SQL and KVS (verified twice). Signed hash-chain backup on Confluence plus checkpoint and receipt anchors. Authorised two-step recovery. 21/21 unit tests; live T1–T6 tamper cases rejected; TOCTOU and stale nonce refused; authorised restore gives correct gate outcomes (A25C-1 204, AS-2 204, **AS-1 400 REJECTED**). | Verified live + unit |
| **C3 residual: consistent rollback by a space admin** | ⚠️ ACCEPTED RISK | Unit S9 asserts it is undetectable; documented in 22 §5 and in the draft privacy policy's security section | Documented limit |
| **C1: Judge can install via sharing link and complete the core flow** | ⏳ OPEN | Prepared (20 "C1 preparation"; `docs/JUDGE_INSTALL.md`). Not executed: needs a second site, a public policy URL, Distribution = Sharing, and a production redeploy. | Outstanding |
| Privacy policy accuracy | ⚠️ REVIEWED, NOT PUBLISHABLE YET | Draft v1 had 4 inaccuracies (developer-visible logs, data locations, screening scope, public-tracker contact). Draft v2 fixes the wording; 7 items need legal or privacy-professional review. | Desk review |

## 2. What is verified vs. outstanding
**Verified (evidence on file):**
- the gate fails closed (error, uninstall, wiped store);
- SQL atomicity and idempotency;
- uninstall wipe of Forge storage;
- the encrypted env key survives uninstall;
- the hash chain detects modification, deletion, truncation, reordering, replay and cross-site replay (unit), and modification, deletion, truncation, reordering, replay and emptied backup (live);
- recovery is authorised and two-step, with TOCTOU re-verification, single-use user-bound nonces, all-or-nothing restore and an audit trail;
- a restored history continues correctly (seq 5 links to the restored head).

**Not verified (do not claim):**
- install through a sharing link;
- the consent screen as a judge sees it;
- how the multi-app (Preview) Confluence connection appears in link installs;
- behaviour on a clean site with no prior app data;
- production-environment behaviour of the chain code (production is still major version 2);
- the property size limit for large histories;
- Forge LLM data-handling terms;
- data residency.

## 3. Non-negotiables carried into the product build (from this stage)
1. **Remove payload/output logging** before any judge or production install. Forge logs are developer-visible by default (P0, privacy).
2. Ship **only** the lambda validator. No expression/issue-property validator, tamper or simulate controls, or v1 mirror.
3. Port `chain-core.js` unchanged, keep `test/chain.test.mjs` in CI, keep `review_state`-last ordering and fail-closed compensation.
4. Scope screening to configured projects; AI off by default.
5. Bind recovery to the configured register page; index receipts with `jira:entityProperty`.
6. Migrations only from install/upgrade triggers plus an admin action (DDL limit 25/min).

## 4. Remaining C1 actions required from the user (in order)
I will not do any of these without your explicit go-ahead.
1. **Create a second, clean Atlassian Cloud site** (free developer site with Jira + Confluence) to act as the judge's site, and tell me its URL. It needs no app data and no developer-space link.
2. **Provide a private contact email** for the privacy policy (it replaces the public GitHub-issues contact).
3. **Decide the privacy-policy host and approve publishing**, for example pushing `docs/privacy-policy.md` to the public repo `Sidd927/codegeist-2026`, or another URL. Before publishing, either get the ⚖️ items in `docs/privacy-policy-review.md` §3 reviewed, or accept the neutral wording as-is for a hackathon build.
4. **Approve a production deploy** of the current code (`forge deploy -e production`; adds the chain; major version change). Alternatively, wait for the cleaned-up product build. Recommended: **wait**, and rehearse C1 with the first product build, because the spike exposes test controls and verbose logs to judges.
5. **Set Distribution to "Sharing"** in the developer console (`developer.atlassian.com/console/myapps/<app>/distribution`): fill in the privacy-policy URL, the data-handling answers and the contact. This makes the app installable by anyone with the link, which is why it needs your approval. Then send me the install link.
6. **Run the rehearsal on the clean site** (I can drive it in the built-in browser once you're signed in there): install via link → consent → connect Confluence → create groups → set register page → add validator → block → approve → allow → uninstall. Record friction against `docs/JUDGE_INSTALL.md`.

## 5. Stop point
Per instructions, Stage 1.5 stops here. The full product build has **not** started. Nothing has been committed, pushed or published, no production settings were changed, and sharing was not enabled. On the demo site, development-environment test data was created (synthetic decisions, the `article25-recovery-admins` group with the developer as member, and content-property edits on the synthetic register page) and the development installation was reinstalled (new ID `59e18718…`).
