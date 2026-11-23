# Article25: Final Readiness Audit (after M1–M5)

**Date:** 23 Nov 2026 · **Branch:** `milestone-m5-record` (draft PR #7, stacked on M4) · **Environment used:** development only

**Boundaries kept for the whole audit:**
- Production was not touched; nothing was merged and nothing was force-pushed.
- No new scopes were added. AI stayed **off**, and the development gate stayed in **Monitoring**.

**Verdict.** Article25 is ready to move from milestone development into **competition preparation**, but it is **not release-ready**.

What is solid:
- The core loop (detect → review → decide → enforce → record) works on development and is well tested. The recovery promise has now been demonstrated live in an isolated environment.
- This audit found and fixed **eleven real defects**, two of them fail-open paths in M5's restore, each with a regression test.

What blocks release is not code but things only you can do:
- a production deploy with a sharing link;
- a clean-site rehearsal of the judge path;
- a production signing key;
- a published privacy policy;
- a decision on AI in production.

These and the remaining product work are in §13–§14.

Evidence labels used throughout:

| Label | Meaning |
|---|---|
| **LIVE** | Observed on a real Jira Cloud site with the deployed app during this audit or a milestone run (source named) |
| **AUTO** | Covered by automated tests only (named test file) |
| **UNVERIFIED** | Neither; an assumption or a documented limitation |

---

## 1. How this audit was done
1. **Repository, branches, PRs #1–#7, CI.** Read the CI job logs for PR #7 line by line, and ran the same checks locally.
2. **M5 code review.** Read every M5 source file (`core/ledger.js`, `services/ledger.js`, the gate, restore, repositories, UI) looking for failures the existing tests could not expose.
   - Each suspected defect was **reproduced by a failing test first**. I ran the new tests against the pre-fix source; 6 of 7 failed there. The 7th is the attacker case, which must pass before and after.
   - Then the defect was fixed and the whole suite run again.
3. **Live recovery scenario** in a newly created, isolated Forge environment (§5).
4. **Live product walk-through** of the desk, Settings, Record page, review workspace and issue view, as a first-time user would see them (§10).
5. **Documents:**
   - the requirements, architecture, security model, roadmap and all five results documents;
   - all 11 committed evidence screenshots, checked for names (none);
   - the README and the judge install guide.

## 2. Actual state of every milestone
| Milestone | Branch / PR | CI | Live status (development) | Notes |
|---|---|---|---|---|
| Stage 1/1.5 research + spikes | `stage1-research-and-spikes` · #1 draft → `main` | no workflow yet | n/a | Historical; `backup/stage1-before-redaction` is local only and was not pushed |
| Stage 2 blueprint | `stage2-product-blueprint` · #2 draft | no workflow yet | n/a | Original decisions kept; amended in place with dated labels |
| M1 Foundation | `stage3-product-foundation` · #3 draft | no workflow yet | ✅ | Panel p50 1.45 s vs 1.5 s budget (at risk) |
| M2 Detect | `milestone-m2-detect` · #4 draft | no workflow yet | ✅ | Rule-based floor has low recall; AI validated at $0.40 |
| M3 Review | `milestone-m3-review` · #5 draft | no workflow yet | ✅ | See §6.4 for one undocumented test mis-step |
| M4 Enforce | `milestone-m4-enforce` · #6 draft | ✅ 2 runs green | ✅ | Monitor-mode outage behaviour changed in this audit (§9) |
| M5 Record & Recovery | `milestone-m5-record` · #7 draft | ✅ green before this audit; re-run on push (§4) | ✅, now including a live restore (§5) | 11 defects fixed in this audit |

- `main` still holds only the initial commit. The seven PRs form one stack, and none has been merged.
- The CI workflow was introduced in M4, which is why PRs #1–#5 report no checks. Their code is contained in #6 and #7, which do run CI.

## 3. What is live-tested, automated-tested or unverified
| Capability | Evidence |
|---|---|
| Screening on create/edit (rules mode), quotes verified | **LIVE** (M2, M3, and again this audit: re-checks after restore) |
| AI extraction | **LIVE** in M2 only ($0.40, then switched off); **AUTO** fallbacks |
| Inbox, workspace evidence highlighting, four decisions, assignment | **LIVE** (M3; workspace re-inspected this audit) |
| Separation of duties, stale-evidence and concurrency refusals | **LIVE** (M3 §5.3) · **AUTO** |
| Evidence-locked approval (invalidate / reconfirm) | **LIVE** (M3, M4) · **AUTO** |
| Gate: enforce blocks/allows on real transitions, both project types | **LIVE** (M4) |
| Gate: monitor mode does not block when the evaluation fails | **AUTO** (`gate.test` "monitor mode never blocks…"). The M5 incident it fixes was **LIVE** |
| Gate coverage counts only this environment's rules | **LIVE** (this audit: the recovery install showed "Not protected" and development showed "Complete") · **AUTO** |
| Ed25519 signing, mixed v2/v3 chain verification | **LIVE** (M5; verified again this audit in a second environment) |
| Signed export + independent offline verification | **LIVE** (this audit: seq-12 archive → `VALID and complete`) |
| Tampered archive refused | **LIVE** (this audit: one character inserted → digest and signature errors, no restore offered) · **AUTO** |
| Uninstall deletes the app's data | **LIVE** (this audit: the reinstall reapplied all 15 migrations and the record was empty) |
| Restore → verify chain → re-check → gate | **LIVE** (this audit, twice; §5) |
| Restore trust via a retired key's **public** half | **LIVE** (this audit) · **AUTO** |
| Approval with unverifiable legacy record → blocked with an honest reason | **LIVE** (this audit) · **AUTO** |
| First-minute "setting up" self-heal | **LIVE** (this audit: migration applied 3.5 s after the first request) · **AUTO** |
| Interrupted / killed restore stays fail-closed and resumes | **AUTO** only (a live kill would need fault injection in Forge) |
| Single-use, user-bound, expiring restore token; swapped archive refused | **AUTO** only |
| Large restores in resumable rounds | **AUTO** only (needs ≥ 2,500 synthetic decisions on a site) |
| Key rotation with handover; key-loss adoption by fingerprint | **AUTO** only |
| Text edited while uninstalled → approval invalidated after restore | **AUTO** only (a live run would alter shared synthetic evidence) |
| Automation-triggered transitions, JSM projects, old workflow editor | **UNVERIFIED** (M4 §limits) |
| Multi-reviewer flows with real separate accounts | **UNVERIFIED** (one human account on the demo site) |
| Judge install path on a clean site, sharing link, production | **UNVERIFIED** (not done; release blocker) |
| Colour contrast (axe in jsdom cannot compute it) | **UNVERIFIED** formally; checked by eye only |

## 4. PR and CI status
- **PR #7 CI (run 45131632415 and the push run before it): green.**
  - Steps: lint + copy lint; 169 backend tests; 69 UI tests including axe; production build; bundle budgets.
  - Nothing was skipped.
- **The same checks locally after this audit:** 178 backend and 70 UI tests pass; lint and copy lint are clean; `forge lint` reports no issues.
- Every warning in the CI log was investigated. None is a defect in Article25.

  | Warning | Finding | Action |
  |---|---|---|
  | `npm audit`: 7 moderate (backend), 8 incl. 5 high (frontend) | Backend: `glob`/`minimatch` inside `@forge/manifest`, used only to parse the manifest, never with user input. Frontend: `prosemirror-view` paste XSS, pulled in by `@forge/bridge` → `@atlaskit/adf-schema`, but **absent from the shipped bundles** (checked `dist/`) | Accepted and documented. The "fix" npm offers downgrades `@forge/bridge`/`@forge/events` to older majors (breaking). Re-check when Forge publishes updates |
  | `MODULE_TYPELESS_PACKAGE_JSON` in tests | Node reparses ESM files; costs a few ms per test file | Not changed: adding `"type": "module"` changes Forge bundling and needs its own deploy test (P3) |
  | jsdom "Not implemented: navigation / canvas getContext" | Download-anchor clicks and axe's contrast probe in jsdom | Harmless noise, **but it means axe's colour-contrast rule never runs in CI** (§10) |
  | `iframe-resizer` install script not approved | Transitive dependency of `@forge/bridge`; Forge injects its own resizer | None (documented since M1) |
  | `npm warn ERESOLVE` React 16 peer | Atlaskit transitive peer range | None |
- The audit commits are pushed to `milestone-m5-record`, which re-runs CI on PR #7.

## 5. M5 recovery validation (the outstanding scenario)
**Isolation.** No isolated environment existed: the only installation was development. I checked the options before creating one.
- Plain (non-Connect) Forge apps can be installed on one site from several environments. Custom development environments are free, and each installation has its own storage and SQL.
- Article25 only *reads* Jira, so a second installation cannot touch the development installation or Jira data.
- Its validator is not attached to any workflow, so it cannot block anything.

I created a custom development environment **`recovery`** and gave it:
- its **own** freshly generated signing key (piped, never printed);
- the development key's **public** half as a trusted anchor;
- AI explicitly off, with a $0 cap.

It was installed on the development site; the development installation was never uninstalled or modified by the test. The recovery installation was **uninstalled at the end**; the empty environment is kept for re-runs.

| # | Step (from the brief) | Result | Evidence |
|---|---|---|---|
| 1 | Export a signed archive | Exported from development (12 records: 11 legacy HMAC + 1 Ed25519; 12 decisions, 1 assignment, 4 setting changes) | **LIVE** |
| 2 | Verify it independently | `verify-archive.mjs --fingerprint <pinned>` → **VALID and complete**; legacy prefix verified by the signed checkpoint | **LIVE** (offline, no Jira) |
| 3 | Uninstall | Recovery installation uninstalled with `forge uninstall -e recovery` | **LIVE** |
| 4 | Reinstall in an isolated environment | Reinstalled; **all 15 migrations re-applied; record empty** ("No decisions yet"). Confirms that uninstalling deletes app data | **LIVE** |
| — | Gate before restore | A25GT-1: *Would be blocked: Article25 has not checked this work item yet* (fail closed) | **LIVE** |
| 5 | Restore the archive | Verification report *Valid and complete*, dev key **Trusted** (through its public key only). Confirm → **Restored and verified** (`confirmRestore` 1.2–1.5 s). Activity shows *Restore · in progress* → *restored verified* | **LIVE** (done twice: before and after the reinstall) |
| 6 | Verify the entire chain | *12 signed records · verified: every signature, link and decision matches* | **LIVE** |
| 7 | Re-screen restored issues | Restored work items re-checked automatically (findings recomputed; "Approved, for this exact text") | **LIVE** |
| 8 | Only valid approvals of unchanged text pass | A25GT-1 (Ed25519 approval, text unchanged): *Would be allowed*. A25GC-1 (pre-M5 HMAC approval; no legacy key in this environment): *Would be blocked: older format whose verification key is not configured*. Rejected / needs-information items stay blocked | **LIVE** (gate preview; same evaluation code as the validator, in Monitoring). A real Jira transition through the recovery validator was **not** exercised (it was not attached to a workflow, by design) |
| 9 | Interrupted restores stay fail-closed | Failure, killed invocation and rejected-confirm cases keep the gate closed and refuse decisions and signatures; resuming completes. **Two fail-open paths were found and fixed** (§6.1, F1–F2) | **AUTO** (`audit.test`, `record.test`) |
| 10 | Tampering, invalid signatures, replay | Live: one inserted character → refused. Auto: forged key, foreign site, truncated, edited, re-ordered, swapped archive, token reuse and expiry, restore into a non-empty store. **Rollback to an older genuine archive** remains an accepted, documented risk (§6.2) | **LIVE** + **AUTO** |

**Not covered live:**
- killing a restore mid-write;
- a 5,000-decision restore;
- key rotation or loss on a live site;
- editing text during an uninstall.

The reasons are in §3. They are automated-tested only.

## 6. Security and cryptographic audit
### 6.1 Defects found and fixed in this audit
| # | Severity | Defect | How it could happen | Fix (commit) | Regression test |
|---|---|---|---|---|---|
| F1 | **High** (fail-open) | Nothing marked a restore as running once its token was consumed, so signing and decisions could interleave with restored history | A reviewer decides, or the 5-minute reconciler repairs the chain, while `confirmRestore` is writing. New records take sequence numbers the restore needs; the chain is permanently broken | `in_progress` marker before any write; gate, `anchor`, `repairChain`, `decide`, `assign` and system decisions all refuse until a final outcome (`2bece76`) | `audit.test` "killed mid-write" |
| F2 | **High** (fail-open) | A rejected confirm was logged as the *latest restore* and masked a `failed_partial` | After a partial restore, confirm with a swapped upload → logged `rejected` → gate reopened over a half-restored record, and the restore could no longer be resumed | Logged as `restore_rejected` (own type) (`2bece76`) | `audit.test` "rejected confirm…" |
| F3 | **High** (recovery) | An archive signed by a rotated-out or lost key could never be restored | Trust came only from *private* keys in environment variables. After a rotation (previous key removed) or a loss, plus a reinstall (succession records deleted), every older archive was refused | `A25_RECORD_TRUSTED_KEYS`: **public** keys of retired keys as anchors (same authority, the app environment; no secret kept alive) (`2bece76`) | `audit.test` "rotation AND reinstall"; attacker keys still refused |
| F4 | Medium (liveness) | A killed restore (Forge 25 s limit) left no state | Invocation killed between writes → no `failed_partial` → gate not flagged | Covered by F1's marker. A marker older than 60 s is resumable, a younger one is refused as "still running" (`2bece76`) | `audit.test` "killed mid-write" |
| F5 | Medium (liveness) | Large restores could never finish | ~200 ms per SQL statement → 5,000 decisions ≈ 40 s, over the 25 s limit, and each resume re-sent every row | 50-row multi-row inserts. Rounds stop cleanly after 18 s; resumed rounds skip rows already written (`2bece76`, `612fa68`) | `audit.test` "batched", "resumable rounds" |
| F6 | Medium (availability) | **Monitor mode blocked transitions** whenever the evaluation failed: the M5 deploy incident | The snapshot SQL read the new M5 tables before their migration ran → error → mode unknown → block, on a site that had chosen *not* to block | On failure, re-read only the stored mode (M4 table). Monitor → allow and record `would_block`; enforce or unreadable → block (`63814e8`) | `gate.test` "monitor mode never blocks…" and the fail-closed test |
| F7 | Medium (honesty) | Gate coverage counted **another environment's** validator as this installation's | Found live: the recovery installation reported the development workflows as "Complete" | Match the environment id from the Forge context (`dd3ed4b`) | `gate.test` coverage |
| F8 | Medium (first run) | Every screen failed for ~40 s after install, with a generic error | Found live: resolvers ran before the lifecycle event applied the schema | Missing tables → retryable `SETTING_UP` ("Article25 is setting up"); any SQL error queues the idempotent migration; measured live: schema applied 3.5 s after the first request (`435206a`) | `backend.test` envelope; `record.test` UI |
| F9 | Low (honesty) | A pre-M5 approval without its legacy key was reported as "Record signing not configured" | Legacy HMAC key missing in an environment (found live) | New reason `RECORD_LEGACY_UNVERIFIABLE` (`2bece76`) | `audit.test` |
| F10 | Low (UI) | Gate reasons `RESTORE_INCOMPLETE` and `RECORD_KEY_UNTRUSTED` had no label, so the panel and the gate log would show raw codes | — | Labels added, plus a test that **every** gate reason has one (`b7a941d`) | `audit.test` |
| F11 | Low (UI) | An unfinished restore was not flagged in Settings; after a restore, the restored records were reported as "not in any exported archive" | — | Red "A restore did not finish" message; restored head counts as backed up (`b7a941d`, `3728eda`) | `record.test` (UI), `audit.test` |

### 6.2 Review by area
- **Ed25519 signing and verification.**
  - Node `crypto` with PKCS#8/SPKI DER; the key type is checked (`ed25519` only).
  - Verification never throws.
  - Every signed statement is a JSON array with a **domain tag and version** (`a25-record`, `a25-key`, `a25-succession`, `a25-checkpoint`, `a25-archive`) and the **site id**, so a signature cannot be reused across statement types or sites.
  - The 64-bit `kid` is an identifier, not a security boundary: signatures are always checked with the *anchored* public key, so a kid collision gains nothing.
  - ✅ No defect.
- **Legacy HMAC compatibility.**
  - Timing-safe comparison.
  - The attestation checkpoint is written only if the legacy history verifies with the HMAC key at that moment.
  - The archive and the offline verifier accept the legacy prefix through that signed checkpoint.
  - **The gate does not:** it checks one record at a time and still needs the legacy key. It now blocks with an honest reason (F9).
  - Production will have no legacy records, provided the record key is configured before the first decision.
- **Key registration, rotation, predecessor trust.**
  - Registrations are self-signed for possession, but trust never comes from the database.
  - Successions are signed by the trusted newer key; `endorsedByPredecessor` honestly reports a missing old-key signature.
  - Adoption needs the typed fingerprint and an already-registered key, and registry entries come only from this app or from a verified archive.
  - New: retired **public** anchors (F3).
  - **Observation:** Forge environment variables are per *environment*, so in production one vendor key signs every site's records. A lost key is therefore a vendor incident. The M5 per-site "adopt by fingerprint" flow puts it on each customer admin, whereas the public-anchor variable fixes it once for all sites.
- **Archive canonicalisation and integrity.**
  - Stable serialisation (sorted keys; `undefined` skipped as JSON does); the digest covers counts and head; the signature binds site, digest and kid.
  - Duplicate JSON keys and `__proto__` are harmless: verifier and restorer both work on the *parsed* object, and writes pick named fields only.
  - ✅ No defect.
- **Replay and rollback.**
  - Cross-site replay: refused.
  - Token replay: refused (single use).
  - Restore into a non-empty store: refused.
  - **Rollback to an older genuine archive cannot be detected after an uninstall.** A rejection made after that archive could then be lost. The approval comes back only if the text is still exactly what was approved, because every restored item is re-checked.
  - Mitigations: the UI warns "an older archive restores older decisions: check the export date", and the verifier prints the creation time and head.
  - **Accepted risk** (no state survives an uninstall to compare with).
- **Restore nonce.**
  - 192-bit random, stored hashed, bound to the admin, single-use through an atomic conditional update, valid 10 minutes.
  - A new verification expires older sessions; the digest is re-verified at confirm.
  - ✅ No defect.
- **Offline verification.**
  - Same core code, pinned fingerprint anchor, no network.
  - Gap: the tool lives in this repository; judges and customers need it published as a standalone download (P2).
- **Recovery after missing or corrupted state.**
  - Edited rows → `RECORD_INVALID`; missing records → `RECORD_PENDING` (gate blocks), and chain verification reports the gap.
  - Minor edge: the empty-store check ignores settings history, so if an admin changes a setting on a fresh install *before* restoring, the restored settings history can differ from the archive. Undetected, low impact; documented.
- **Authorisation.**
  - Export, restore, verify, status and adoption require a Jira admin on every call.
  - Single-record downloads are reviewer-only; the Record page lists only items the caller can browse.
  - Unchanged since M5; ✅.

### 6.3 Privacy
- Archives contain reviewers' account ids and decision text; the UI says so.
- Transfer chunks are purged after 1 hour, gate events after 30 days. Decisions are never purged (accountability).
- New files in this audit contain no secrets, account ids, site names or environment ids (diff scanned). The 11 committed screenshots show no personal names.

### 6.4 Evidence integrity note (M3)
The permanent development record contains an *Approved* decision on AS-79 whose rationale reads *"Live separation-of-duties test: this submission should be refused by the server."*
- Cause: the M3 session's request to make the acting user the reporter **failed with HTTP 400**, so the reporter remained the demo account. Separation of duties correctly did not apply, and the approval was legitimately recorded.
- M3 then repeated the test correctly, and it was refused (M3 §5.3).
- This is not a product defect. It is an undocumented test mis-step, recorded here because the append-only record cannot (and must not) be edited.

## 7. Outstanding requirements and deferred work
**Must-have requirements that are not met** (from [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)):

| Requirement | State | Impact |
|---|---|---|
| FR-A1 Get-started checklist | Not built. The Overview shows a setup summary only | Judges must follow the written guide |
| FR-A2 Scope, FR-A4 AI settings, FR-A7 reviewer group: **admin UI** | Environment variables only. In production these are set by the vendor for all sites | Customers cannot choose the scope or group; the group must be named `article25-reviewers` |
| FR-A5 Inventory editor, FR-R11 add to inventory | Not built; "new vendor / new category" signals are inactive | Weaker "what's new" story |
| FR-A6 Sample scenario | Not built (it would need `write:jira-work`) | Judges create their own work item |
| FR-P3 "Send to reviewer anyway" (NEEDS_INFO) | Not built | Minor |
| FR-L2/L3 Confluence register | **Closed: archive-only design** (owner decision, 23 Nov) | None; the Record page plus signed archives replace it |
| NFR performance | Panel p50 1.45 s against a 1.5 s budget. Cold start 5–14 s (measured live this audit after deploy/install) | First impression risk |

**Deferred from M3–M5, still open:**
- inbox and Record keyset pagination;
- recovery group and dual control;
- paged export above ~50,000 decisions;
- per-project or per-transition gate policy;
- opt-in automatic clearance for AI-mode CLEAR;
- a multi-reviewer test with real accounts;
- keyboard shortcuts;
- a formal contrast audit;
- automation and JSM transitions.

## 8. Requirements versus behaviour: amendments made
Labelled *Final audit amendment (23 Nov 2026)* sections were added; nothing was rewritten:
- `PRODUCT_REQUIREMENTS.md`: FR-L2/L3 closed by the archive-only decision; FR-L5 live-verified; new FR-L11 (retired public anchors); FR-G6 monitor-mode behaviour.
- `DATA_AND_SECURITY_MODEL.md`: vendor-wide key model, retired anchors, restore lock.
- `M4_ENFORCE_RESULTS.md`, `M5_RECORD_RESULTS.md`: superseded limitations and live recovery results.
- `IMPLEMENTATION_ROADMAP.md`: progress and the next steps.
- `docs/JUDGE_INSTALL.md`: rewritten. The Stage 2 draft listed write and Confluence permissions, a register page and a recovery group that do not exist, and its trial flow would fail for a single judge.
- `README.md`: written; it was two lines.

## 9. Deployment, migration and rollback
**What happened in M5.** For a few minutes after the deploy, the gate blocked an approved item on a monitor-mode site.
- The gate's one-statement snapshot also reads the M5 tables (`ledger_events`, `recovery_sessions`).
- Until the lifecycle-triggered migration ran, that statement failed, the stored mode could not be read, and the gate blocked.

**Now:**
1. Monitor mode never blocks, even when the evaluation fails (F6).
2. The first resolver request, gate call or reconciler run that hits a missing table queues the migration; it was measured live at about 3.5 s (F8).
3. Enforcing sites still fail closed during that window, which is correct.

**Safe deployment procedure (production):**
1. `npm run check` locally; CI green on the release commit; tag it.
2. Deploy the same commit to a **non-production** environment installed on a test site. Open Settings and confirm:
   - *Article25 database: Working*;
   - *Record signing: Configured*;
   - coverage lists the expected workflows;
   - *Verify the whole record* passes.
3. Deploy to production at a low-traffic time. If the release adds migrations, open Settings (or use **Apply database schema**) within a minute, and confirm *Working* before announcing.
4. **Never** change scopes after judges install. A scope change forces re-consent on every site, and the scope freeze is 4 Dec.
5. **Never** rotate signing keys in the same step as a code deploy. Rotate separately and verify the record after each step.

**Rollback:**
- Redeploy the previous tagged commit. Forge has no in-place rollback; the deployment is replaced.
- All 15 migrations are additive (`CREATE TABLE IF NOT EXISTS`), so older code runs on the newer schema.
- **Do not roll back below M5** once Ed25519 records exist: pre-M5 code cannot verify v3 records, and enforcing sites would block every approval (fail closed, but an outage).
- **Do not roll back while a restore is incomplete:** pre-audit code does not know the `in_progress` marker.

## 10. Product experience and visual quality
Assessed live, as a first-time judge would see it.

**Strengths:**
- **A consistent Atlassian look** (Atlaskit, design tokens, light and dark).
- **The review workspace is the standout:** numbered evidence marks in the text, quoted findings, and a plain-language gate explanation.
- **Every state is honest:** "Would be blocked… has not checked this work item yet", "older format… cannot be checked", "Restored and verified".
- **Tables turn into stacked cards** in narrow panes.
- **Empty and error states exist everywhere.**
- **The copy is precise and free of compliance claims** (enforced by copy lint).

**Weaknesses, in order of impact:**

| # | Issue | Status |
|---|---|---|
| U1 | **Cold start 5–14 s** for the desk's first content after an install or deploy; panel p50 at budget | Open. Measure on production; consider trimming the initial desk bundle (212 KB gzip) and deferring Settings sections |
| U2 | The first minute after install showed a red error | **Fixed** (F8): blue "Article25 is setting up" with retry |
| U3 | **Discoverability:** the panel was titled "Privacy" among other apps' panels and sits behind the apps icon | **Title fixed** ("Article25 privacy"). The guide explains where to find it |
| U4 | **Single-judge friction:** separation of duties refuses a judge's own test item | Guide fixed. *Recommended:* show admins an inline hint on the refusal (P1) |
| U5 | Settings advertised unbuilt features ("What is already approved", "Decision register · Not connected", "not available in this version") | **Fixed:** only real sections, honest copy |
| U6 | Status lozenges truncated ("Would be allowed (monitoring, not b…") | **Fixed** |
| U7 | Settings is one long page; restore uses a native file input and a large textarea | Open (P2): split it into tabs (Gate · Record · Review · Checks) |
| U8 | "Approved" review status next to a gate that blocks (legacy record): readable only from the reason text | Acceptable; the reason explains it |
| U9 | No keyboard shortcuts; contrast not formally audited (axe contrast cannot run in jsdom) | Open (P2): run axe in a real browser (Playwright) once |
| U10 | Inbox and Record pages cap at 300 and 500 items | Fine for judging; open for scale |

**Bundle budget.** The panel is at 193.4 KB of 200 KB gzip, leaving 6.6 KB. The UX fixes cost about 0.3 KB. Any panel feature must be weighed against this; the desk has ample room (212 KB of 400 KB).

## 11. Performance and budgets (reproducible)
| Measure | Value | How |
|---|---|---|
| Ledger verify, 5,000 / 10,000 decisions | 223 ms / 442 ms (Apple M5, Node 24.22) | `npm run bench -- 5000 10000` (added in this audit) |
| Archive size, 5,000 decisions (synthetic) | 6.2 MB | same |
| Live `verifyLedger` (12 records) | 253–280 ms | Forge logs, M5 and this audit |
| Live restore of 12 decisions (`confirmRestore`) | 1.2–1.5 s | Forge logs (recovery environment) |
| Live first-request-to-schema after install | 3.5 s | Forge logs |
| Desk first content: warm / cold | 1.1 s / 5.5–14 s | client metric `firstContentMs` |
| Bundles (gzip, initial) | panel **193.4 KB** / 200; desk **212.1 KB** / 400 | `npm run build:ui` (enforced in CI) |
| Tests | 178 backend · 70 UI (incl. axe) | `npm run check` |

The M5 document reported 257 ms and 5.35 MB for 5,000 decisions from an uncommitted script. Those figures are superseded by the reproducible ones above, which use slightly different synthetic content.

## 12. Repository and documentation integrity
- Every milestone has a results document with live evidence and limitations. Deviations are labelled amendments, so the original decisions stay visible.
- `README.md` now explains what the product is, its architecture, how to develop, configure, operate and verify it, and indexes the documents.
- **Secrets and identifiers:**
  - no private keys in the repository (key material only ever piped into `forge variables`);
  - the audit diff and the new documents contain no account ids, site names or environment ids;
  - screenshots show no names.
  - Note: the app id is in `manifest.yml` and `handlers/gate.js` by necessity; it is not a secret.
- **Authorship:** every commit is authored by Siddhant Patil, with no co-author trailers.

## 13. Release blockers
Genuine blockers: without these, judges cannot use the product or the submission is invalid. **Each needs you.**

| # | Blocker | Owner | By |
|---|---|---|---|
| B1 | **Production deploy + Distribution → Sharing** (install link). Production holds an early build (deployed 22 Nov) and is not installed anywhere | You approve; I execute | Before the scope freeze, **Fri 4 Dec** |
| B2 | **Final scopes frozen** in production: `read:jira-work`, `read:jira-user`, `read:workflow:jira` plus the `llm` module (Confluence dropped) | You approve | **4 Dec** |
| B3 | **Production record signing key** generated in production and its fingerprint pinned. I must not generate production keys | You | Before B1 goes live |
| B4 | **Clean-site rehearsal** of the judge path (`docs/JUDGE_INSTALL.md`), timed, with fixes | You provide a clean site; I run and fix | 30 Nov – 1 Dec, and again 15–16 Dec |
| B5 | **AI in production: decide.** Without AI the rule-based floor has low recall (M2: held-out escalation recall 0.00), so a judge's own text may be missed. With AI, set a production budget and spend cap (billable) | You decide | Before the rehearsal |
| B6 | **Privacy policy URL** and a contact email (Sharing requires them) | You | Before B1 |
| B7 | Demo video, Devpost submission, approval to merge the PR stack into `main` | You | 17–21 Dec |

**No code defect found in this audit remains open as a blocker.**

## 14. Prioritised completion roadmap
**P0: blockers (dates in §13).** B1–B7.

**P1: high-impact product work before the code freeze (17 Dec):**
1. **Get-started checklist on the Overview** (FR-A1, desk-only, no new scope). It shows:
   - whether the reviewer group exists and you are in it;
   - whether signing is configured;
   - whether the gate is on any transition, and its mode;
   - the AI mode;
   - and a "try it" step.

   Each line gets a fix link. This is the biggest judge-experience lever.
2. **An inline admin hint when separation of duties refuses a decision**, pointing to Settings (U4).
3. **Cold-start measurement on production and a bundle trim** of the desk entry: lazy-load the Settings sub-sections and the Record page (U1).
4. **Publish the offline verifier** as a standalone file with the release, and link it from Settings.
5. **Re-run the isolated recovery test** after the production deploy, using the `recovery` environment (kept; empty).

**P2: worthwhile improvements:**
- Settings split into tabs (U7);
- a real-browser axe contrast pass (U9);
- a scheduled "backup is old" nudge;
- a multi-reviewer live test with a second account;
- Record and Inbox keyset pagination.

**P3: optional or post-competition:**
- recovery group and dual control;
- per-project gate policy;
- inventory editor (FR-A5);
- admin UI for scope and group (needs per-site settings storage);
- `"type": "module"`;
- keyboard shortcuts.

**Explicitly not recommended:**
- reviving the Confluence register (decided);
- adding `write:jira-work` for samples (scope cost greater than value);
- any feature that grows the panel bundle by more than ~3 KB.

## 15. State left behind
| Item | State |
|---|---|
| Development installation | Deployed with this audit's code; gate **Monitoring**; AI **off**; data intact (no restore was run there; only an export was added) |
| `recovery` environment | Created; installation **removed**. Holds its own encrypted test key and the development **public** key; no data |
| Production, staging | Untouched |
| Branch `milestone-m5-record` | Audit commits pushed; draft PR #7 updated; **not merged** |
| Local files | The test archive is in a temporary folder outside the repository (`/tmp/a25-recovery-evidence/`, synthetic data and your account id; it can be deleted). The archive `~/Downloads/article25-record-2026-11-23-seq11.json` from M5 is still there. |

Sources consulted for platform limits:
- [Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/) (1 MiB request, 10 s DML timeout, ~200 ms statements observed);
- [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) (25 s resolver);
- [Forge environments](https://developer.atlassian.com/platform/forge/environments-and-versions/);
- the Atlassian community discussion on [multiple environments on one site](https://community.developer.atlassian.com/t/connect-on-forge-with-different-environments/77442).
