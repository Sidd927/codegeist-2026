# M5 — RECORD & RECOVERY: Results

Branch `milestone-m5-record`, stacked on `milestone-m4-enforce` (draft PR #6). Development only, AI off, synthetic data only. Date: 23 Nov 2026.

**Status in one line:** Article25 now keeps a publicly verifiable, Ed25519-signed decision record. An admin can export it as a signed archive, an auditor can check it offline without Jira, and it can be restored after an uninstall with an honest result. The Confluence register is **BLOCKED**: it needs two new Confluence scopes, which require your approval (§19).

---

## 1. Executive summary

**What M5 had to solve.** Before M5, the decision record could be *checked* but not *kept*:

- Uninstalling Article25 soft-deletes all its Forge SQL data, and a reinstall starts empty. Stage 1 observed this twice.
- After that, previously approved work is blocked again, with no way back.
- The M2–M4 records were signed with an HMAC key. Only someone holding that secret could verify them, so nobody outside the app could check the history independently.

**What M5 delivers (hybrid architecture, no new permission scopes).**

1. **Ed25519 signed records (ledger v3).** These continue the existing v2 HMAC hash chain without rewriting it.
   - Anyone with the public key can verify every new record.
   - The legacy prefix becomes publicly verifiable through one signed attestation checkpoint.
2. **A trusted-key lifecycle.** Keys are self-signed and registered. Rotation is a signed succession statement, co-signed by the old key when it is available.
   - Trust is anchored **only** in keys held in encrypted Forge environment variables. A key written straight into the database is never trusted (tested).
   - After a key loss, an admin can adopt the previous key only by typing its exact fingerprint.
3. **Signed archive export, the customer-held copy.**
   - It contains every decision, record, key, succession, checkpoint, assignment and setting change, under a signed digest.
   - It is transferred in chunks, within Forge's invoke limits.
4. **Independent offline verifier.** `node scripts/verify-archive.mjs <file> --fingerprint "<pinned fingerprint>"` uses Node's crypto module only and needs no Jira access and no secret.
5. **Two-step restore into an empty store.** An admin verifies, then confirms with a single-use, user-bound, 10-minute token.
   - The archive is verified again at confirmation, and the write order keeps the gate closed until the restore completes.
   - An interrupted restore can be resumed.
   - Every result is classified: `restored_verified`, `restored_with_pending`, `restored_mismatch` or `failed_partial`.
   - Every restored work item is re-screened, so an approval only stands if the text is unchanged.
6. **Gate hardening.** Two new fail-closed reasons:
   - `RESTORE_INCOMPLETE`: an interrupted or in-progress restore blocks protected transitions.
   - `RECORD_KEY_UNTRUSTED`: a record signed by a key that is not trusted blocks.
7. **UX.**
   - A new **Record** page lists every decision on visible work items, with its signature and backup status.
   - Review history shows each decision's signature, and reviewers can download a signed copy of a single decision record.
   - Settings has a new **Decision record and recovery** section: keys, fingerprint to pin, integrity, backup freshness, restore, removal guidance and the external register status.
8. **Retention.** Gate events are purged after 30 days (an M4 carry-over), and transfer chunks after 1 hour. Decisions are never purged.

**Evidence.**
- Backend: **169/169 tests pass** (25 new).
- UI: **69/69 pass** (11 new, with axe accessibility checks).
- Lint and copy lint are clean, and Forge lint is clean.
- Bundles: panel 193.1 KB gzip (budget 200), desk 211.8 KB gzip (budget 400).
- Live on dev: upgrade from v2, verify, export, offline verify, tamper and truncation rejection, v3 decisions, mixed-chain verification, the Record page and backup-gap warnings (§14).

**What is not done.**
- The Confluence register is BLOCKED on scope approval (§19).
- A live uninstall → reinstall → restore was **not** run on dev, because it would destroy the M3–M5 evidence. It is covered by integration tests and the Stage 1.5 live precedent (§14).

---

## 2. Problem and architecture decisions

### 2.1 Baseline (verified at the start of M5)

| Area | State found |
|---|---|
| M4 CI (PR #6) | **Green**: run 45102917044 passed lint, 144 backend tests, UI tests, build and budgets |
| Branch stack | `main` ← M3 (#5, draft) ← M4 (#6, draft). M5 is branched from the M4 head `7254fbb` |
| Record integrity | v2 hash chain, HMAC-SHA256 signed with `A25_SIGNING_KEY`. Tamper evidence inside the app is sound, but **only a secret-holder can verify it** |
| Durability | **None outside Forge SQL.** Uninstall soft-deletes it (documented, and observed in Stage 1) |
| Key lifecycle | None. Rotating the HMAC key made every old approval unverifiable, so the gate blocked them (M3 test "rotated key") |
| Gate events | No retention (M4 known limitation) |
| Confluence | A Stage 1 spike proved page create, update and versioning, but it needed `read:page`/`write:page:confluence`, a Confluence installation and multi-app mode. **None of these is in the product manifest** |

**Must be preserved:**
- the fail-closed gate;
- binding to the content fingerprint;
- separation of duties;
- append-only decisions;
- the `request_id` idempotency;
- no account IDs for non-reviewers;
- minimum scopes.

### 2.2 Platform facts that drive the design

| Fact | Source | Status |
|---|---|---|
| Uninstall soft-deletes Forge hosted storage, including SQL. Recovery is only via Atlassian support, within the retention window | [Forge data lifecycle](https://developer.atlassian.com/platform/forge/storage-reference/hosted-storage-data-lifecycle/) | Documented. **Observed twice** in Stage 1 (research 17 F12, 22) |
| A reinstall gets a new installation ID and starts with empty storage | Same | Documented and observed |
| Encrypted environment variables survive an uninstall (they belong to the app environment, not the installation) | Stage 1 observation | Observed |
| There is no reliable "uninstalled" hook for exporting data. `preUninstall` allows about 55 s, product API calls may fail, and there is nowhere to send data without egress or new scopes | Forge lifecycle docs | Documented. **A pre-uninstall export is therefore designed as an explicit admin step, not a hook** |
| Custom UI `invoke`: request ≤ 500 KB, response ≤ 5 MB | [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) | Documented. **Transfers are chunked** (export 1 M characters, upload 100 K characters per call) |
| Calling Confluence needs Confluence scopes and the app installed in Confluence. Shared storage between the Jira and Confluence installations needs multi-app compatibility (preview), and such apps can be listed as paid only | Stage 1 research 13 and 17 | Observed in the spike |
| Adding a scope is a major version and needs admin re-consent on every installed site | Stage 1 research 16 | Observed |

### 2.3 Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Move to Ed25519 (v3) for new records and keep v2 as an attested prefix**; no rewrite of history | Public-key verification is the only way an external party can verify without a secret. Rewriting v2 would break the chain the gate already trusts |
| D2 | **Anchor trust only in environment-variable keys.** The database may hold public keys, but they are trusted only through a chain of signed successions from an anchor | Someone with SQL write access, a malicious archive or a future bug must not be able to introduce a key |
| D3 | **The primary durable copy is a signed archive held by the customer**, plus an offline verifier | It needs no new scopes, is verifiable without Jira, has no egress and costs nothing. It is the only design that is not BLOCKED |
| D4 | **Restore only into an empty store, in two steps, with a re-verify at confirmation** | Prevents merging or forking histories. The Stage 1.5 pattern was hardened (single use, user binding, digest binding) |
| D5 | **Gate-safe restore order and a `RESTORE_INCOMPLETE` gate reason** | A partial restore must never let a transition through |
| D6 | **Re-screen every restored work item** | Text may have changed while the app was absent, so approvals bind to the current text again or are invalidated |
| D7 | **Confluence register: designed, BLOCKED on scopes.** When approved it is a read-only *view* plus an extra anchor, never a source of truth | It needs new scopes (approval boundary 1) and multi-app mode (EAP, paid listing only) |

---

## 3. Alternatives considered

| Option | Durability across uninstall | Integrity and independent verification | Permissions | Complexity and cost | Demo fit | Verdict |
|---|---|---|---|---|---|---|
| **A. Confluence register only** | Good: Confluence page history survives | Weak alone: a page can be edited, and space admins can delete versions (Stage 1.5 S9) | +2 Confluence scopes, a Confluence install and multi-app mode | Medium. Multi-app is EAP, paid-listing only | Very visible | Not alone: it is not a trust anchor |
| **B. Signed archive and offline verifier** | Good, if the customer keeps the file | **Strong:** Ed25519 with a pinned fingerprint, checked offline | **None new** | Low, $0 | Good (verify on screen, tamper live) | **Chosen as the core** |
| **C. Hybrid: B plus Confluence view and anchor** | Best | Strong: B, plus an extra copy held off the app | +2 scopes | Medium | Best | **Target**, with the Confluence half BLOCKED |
| D. Jira issue properties or comments as receipts | Survives uninstall | Weak: editors can overwrite properties (Stage 1 Spike C proved this) | `write:jira-work` (new) | Low | Low | Rejected (insecure and needs a scope) |
| E. External storage (S3 or similar) by egress | Good | Strong, with object lock | Egress permission plus a third-party service; billing | High; data leaves Atlassian | Low | Rejected (new consent, data residency, billable) |
| F. Atlassian support restore of soft-deleted data | Only within the retention window | Atlassian's copy | None | Support ticket; not self-service | None | Documented as a last resort only |
| G. `preUninstall` hook export | Unreliable (about 55 s, APIs may fail) | — | Needs a destination (A or E) anyway | — | — | Rejected as the mechanism; an explicit admin export comes first |

---

## 4. Data model

New Forge SQL migrations. They are additive and idempotent, and they run through the existing migration runner.

| Migration | Table | Purpose | Key constraints |
|---|---|---|---|
| v010 | `record_keys` | Public key registry: kid, alg, public key, registered at, self-signature | PK `kid` |
| v011 | `key_successions` | from kid → to kid, `toSig`, optional `fromSig` | PK `(from_kid, to_kid)` |
| v012 | `checkpoints` | Signed heads (`attestation`, export heads) | UNIQUE `(seq, purpose, kid)` |
| v013 | `ledger_events` | Admin audit: export, verify, restore check, restore, with outcome, head seq, digest and a summary of counts | Append-only |
| v014 | `recovery_sessions` | Restore tokens: **SHA-256 hash only**, actor, digest, expiry, used at | PK `token_hash`; consumed atomically by `UPDATE … WHERE used_at IS NULL AND expires_at > ?` |
| v015 | `transfer_chunks` | Chunked export and upload: transfer id, index, kind, actor, data | PK `(transfer_id, idx)`; immutable; purged after 1 h |

The existing tables are unchanged in shape: `decisions`, `chain`, `assignments` and `settings_history`. The `chain` table now holds v2 and v3 records in one sequence.

---

## 5. Record format

**v3 chain record**, signed over a canonical string of every field:

```
{ v: 3, siteId, seq, prevHash, decisionId, issueId, state, conditions, decidedBy, decidedAt, kid, sig, hash }
hash = sha256(canonicalV3(record) | sig)
decisionId = sha256 over the decision row: issueId, seq, kind, decision, rationale, conditions,
             questions, decidedBy, decidedAt, screeningId, fp (content fingerprint), pipelineVersion, outcome
```

How the 14 required fields are covered:

| # | Field | Where it is held |
|---|---|---|
| 1 | Record identifier | `siteId` and `seq`; `decisionId` |
| 2 | Site and work item | `siteId`; `issueId` (stable numeric ID, not the renameable key) |
| 3 | Outcome | `state`; `decision` in the row |
| 4 | Reviewer | `decidedBy` (account ID; never shown to non-reviewers) |
| 5 | Timestamp | `decidedAt` |
| 6 | Content fingerprint | `fp`, bound through `decisionId` |
| 7 | Screening and pipeline version | `screeningId`, `pipelineVersion` and `outcome`, bound through `decisionId` |
| 8 | Evidence references | The `screeningId` points to the stored screening (evidence spans) |
| 9 | Conditions | `conditions` (signed) |
| 10 | Invalidation and reconfirmation | System decisions (`APPROVAL_INVALIDATED`, `APPROVAL_RECONFIRMED`) are chain records of their own |
| 11 | Signed-record reference | `seq`, `kid` and `hash` (shown in History and on the Record page) |
| 12 | Verification status | Computed on demand (Verify), never stored as a claim |
| 13 | Archive version | `format: article25-record-archive` and `formatVersion: 1` |
| 14 | Register sync status | "In backup" (included in the last export). Confluence sync status is BLOCKED |

**Archive**, `article25-record-archive` v1:

```
{ format, formatVersion, siteId, createdAt, appVersion, keys[], successions[], records[], checkpoints[],
  decisions[], assignments[], settings[], head: {seq, hash}, counts,
  digest = sha256(stableStringify(body)), signature: { kid, sig over (siteId, digest, kid) } }
```

`stableStringify` sorts keys and drops undefined values, so the digest survives a JSON round trip (this was a bug found and fixed in M5).

**Single decision bundle**, `article25-decision-record` v1, for reviewers: `{ siteId, decision row, record, publicKey: {kid, alg, publicKey, fingerprint} }`.

---

## 6. Signature and verification model

- **Keys.** Ed25519, PKCS#8 DER in the encrypted variable `A25_RECORD_SIGNING_KEY`. The optional `A25_RECORD_SIGNING_KEY_PREVIOUS` is used for a handover.
  - `kid = 'k' + sha256(SPKI)[0:16]`.
  - The fingerprint is the full SHA-256 of the SPKI, in groups of four hex characters. It is shown in Settings so it can be pinned outside Jira.
- **Trust resolution** (`trustedKeys`):
  1. Start from the anchor keys only: the environment-variable key(s), or the fingerprint an auditor pinned.
  2. Walk backwards through successions. Each one must be signed by the newer, trusted key and name an existing registered key.
  3. A missing `fromSig` (key loss) is reported as "not endorsed by predecessor".
  4. The walk is bounded at 10 rounds.
- **Verifying a chain** (`verifyLedger`) checks:
  - sequence numbers are contiguous from 1;
  - every `prevHash` links to the previous record (seq 1 links to `genesis(siteId)`);
  - there are no replays;
  - each hash recomputes;
  - each v3 signature comes from a trusted key and the right site;
  - v2 signatures are checked with the HMAC key, **or, without it**, the v2 prefix is accepted only up to a trusted `attestation` checkpoint, and its hash links are verified to that signed head;
  - a checkpoint beyond the head means truncation, and a checkpoint hash mismatch means a rewrite.
- **Gate check per decision** (`verifyDecisionRecord`): the record exists, matches the decision row (`decisionMatchesRecord`), and its signature verifies. The failure reasons are `RECORD_PENDING` (no record yet), `RECORD_INVALID` (mismatch, bad hash or bad signature) and `RECORD_KEY_UNTRUSTED`.
- **Archive verification** (`verifyArchive`): digest, archive signature by a trusted key, full ledger verification, and every record matched to its decision row.
  - A record whose decision row is missing is **refused** (no resurrection of older approvals).
  - Decisions without a record count as `pending` (status `complete_with_pending`).
- **Offline verifier.** [`app/scripts/verify-archive.mjs`](../app/scripts/verify-archive.mjs) pins the fingerprint and prints VALID or NOT VALID, with the head, counts, how the legacy prefix was verified, and the key history.

**What a signature proves:**
- the record was produced by a key that chains back to the pinned key;
- it has not been altered;
- its position in the sequence is fixed.

**What it does not prove:**
- that no later records exist (see "rollback" in §11);
- anything about the legal correctness of the decision.

---

## 7. Recovery architecture

### Scenario 1: Normal operation

The reviewer decides. The decision row and the v3 chain record are written; anchoring is unchanged from M3 and still idempotent on `request_id`.

- History shows "Signed record · Ed25519 · kid".
- Verify checks the whole record.
- The Record page shows "In backup: Not yet" until the next export, and Settings warns "N records are not in any exported archive".

### Scenario 2: External register unavailable

The gate **never depends** on an external register. It reads Forge SQL and the environment-variable keys only, so an outage cannot make an invalid approval pass, and cannot block a valid one.

- For the archive: if a call to the export resolver fails, the UI shows the error and does not claim success.
- Export status is recorded only when the server has built the archive. The UI says it "cannot see whether you saved the file" (browsers may block downloads silently, which was observed live).
- The design for Confluence outages is in §9.

### Scenario 3: Partial synchronisation

- **Decision committed, chain record not written** (crash between the two). The gate blocks it as pending (`RECORD_PENDING`). The reconciler (`repairChain`) anchors it idempotently: `decisionId` is unique in `chain`, so a retry cannot duplicate it.
- **Upload or export interrupted.** Chunks are keyed by `(transfer_id, idx)` and are immutable. A re-sent chunk with identical data is accepted; a different one is refused. Assembly requires every index.
- **Restore interrupted.** Writes are idempotent (INSERT IGNORE on natural keys), and a `failed_partial` event is logged. The gate reports `RESTORE_INCOMPLETE`. Verifying the **same** archive again (same digest) is allowed to resume, even though the store is no longer empty.
- **Acknowledgement lost after a successful restore.** Re-running confirm with a used token fails with CONFLICT (single use). Status shows `restored_verified`, so nothing is applied twice.

### Scenario 4: Uninstall

See §8. Export is an explicit, guided admin step. Settings states plainly what an uninstall does.

### Scenario 5: Reinstall

The admin opens Settings → Restore, then uploads or pastes the archive. Article25 verifies it and shows a report:

- status;
- head;
- counts;
- pending decisions;
- how the legacy records were verified;
- the key history;
- errors and warnings.

The admin confirms within 10 minutes. The outcome is then:

| Outcome | Meaning | Gate |
|---|---|---|
| `restored_verified` | The store now verifies and matches the archive exactly (count and head hash) | Normal. Re-screening re-binds approvals to the current text |
| `restored_with_pending` | As above, but some decisions in the archive had no record yet | Pending decisions stay blocked (`RECORD_PENDING`) until the reconciler anchors them |
| `restored_mismatch` | Writes finished, but the stored chain does not match the archive's head | Each decision is still checked individually. The admin sees the mismatch |
| `failed_partial` | Stopped part-way | **All protected transitions blocked** (`RESTORE_INCOMPLETE`) until the restore is resumed |
| Refused (nothing written) | Tampered, wrong site, untrusted signer, non-empty store, changed between verify and confirm, expired or reused token, not an admin | Unchanged |

The other cases the brief lists:
- **External register unavailable:** not applicable, because the archive is local.
- **Missing signing key:** Restore needs the record key or the legacy key (NOT_CONFIGURED otherwise).
- **Failed signature verification:** the archive is refused, and its errors are listed.
- **Records that cannot be reconstructed:** decision row missing → refused.

### Scenario 6: Key loss or rotation

| Case | What happens | Old approvals |
|---|---|---|
| **Rotation with handover** (old key moved to `…_PREVIOUS`) | `ensureKeys` registers the new key and writes a succession co-signed by both keys | Stay trusted (tested) |
| **Key loss** (new key, old key gone) | A succession is signed by the new key only and marked "not endorsed by predecessor". The gate blocks old v3 approvals with `RECORD_KEY_UNTRUSTED` | Blocked until an admin **types the exact fingerprint** of the previous key, which they must hold from their pinned record. Adoption is audited |
| **Key replaced in the database** | Never trusted | Blocked (tested) |
| **Legacy HMAC key lost** | The v2 prefix stays verifiable through the signed `attestation` checkpoint, written once when the record key is set up and only if the legacy history verifies | Verifiable |

Article25 never invents a replacement key that could verify old signatures.

---

## 8. Uninstall and reinstall behaviour

**Before an uninstall.** This guidance is in Settings, under "If Article25 is removed".

1. Export a signed archive and store it outside Jira.
2. Keep the fingerprint you pinned.
3. Remove the Article25 rule from your workflows. **While the app is missing, Jira blocks every transition that carries the Article25 validator**: fail closed, observed in Stage 1.

**During an uninstall.** No hook is relied on. Pending queue jobs are lost with the installation. Encrypted environment variables (the signing keys) survive, because they belong to the app environment.

**After a reinstall.**
- The store is empty: Record shows no decisions, and gated work is blocked as not reviewed.
- An admin restores the archive (§7). Every restored work item is re-screened, so if the text changed while the app was absent, the approval is **invalidated, not silently reused** (tested).

**Installing on a different site.**
- The archive is bound to `siteId`, and a cross-site restore is refused (tested).
- The offline verifier still works for auditors on any machine.

---

## 9. Confluence integration (designed; BLOCKED)

**Status: BLOCKED. It needs new scopes (approval boundary 1), plus a Confluence installation and multi-app compatibility.** Settings shows "Decision register: Not connected", and the feature flag `register: false`. Nothing is half-built in the product.

**Design (for approval):**
- A read-only Confluence page per site, in an admin-chosen space. Its banner reads "Generated by Article25. Do not edit; verify with the signed archive".
- Rows carry: work item, outcome, reviewer display name (no account IDs), date, content reference, kid, and seq/hash.
- **Idempotent publish.** The register state lives in the same store, so multi-app mode is needed. Each entry is keyed by `decisionId`.
  - Publishing skips when the content hash is unchanged.
  - On HTTP 409, refetch once and retry with `version = current + 1`.
  - Manual edits (version drift) are **never overwritten**: publishing stops and the admin is told.
- **Outbox.** Each chain record queues a `register_outbox(decisionId, state, attempts, last_error, next_at)` row.
  - Retries back off exponentially, and HTTP 429 `Retry-After` is honoured.
  - After N failures the status becomes "failed, retry", shown in Settings with a Retry button.
- **Signed checkpoint in the page-version message.** This is an extra anchor outside the app.
- **Gate independence.** The gate never reads Confluence. The register is never a second source of truth, and "published to Confluence" never means "verified".
- **Restore source.** Restore from Confluence is allowed only through the same `verifyArchive` path. The page carries the archive as an attachment, which requires the attachment write capability of `write:page:confluence`; this needs to be confirmed at spike time.

The Stage 1 spike (research 17) already showed create/update/versioning, 409 handling, deduplication of duplicate titles and idempotent replay **in multi-app mode**.

---

## 10. Permission requirements

| Capability | Scopes | Status |
|---|---|---|
| Everything in M5 (ledger v3, archive, restore, Record page, retention) | Existing: `read:jira-work`, `read:jira-user`, `read:workflow:jira` | **No new scope added** |
| Confluence register | `read:page:confluence`, `write:page:confluence`; possibly `read:space:confluence` for a space picker | **Approval needed** (§19) |
| Admin/secret material | Encrypted environment variables (developer-controlled) | Production key generation needs approval (boundary 6) |

`manifest.yml` is unchanged in M5.

---

## 11. Security analysis

| Threat | Control | Evidence |
|---|---|---|
| Record or row tampering (in SQL or in an archive) | Hash chain, Ed25519 signatures, `decisionId` binding, archive digest and signature | `ledger.test` (every field, reorder, delete, replay, truncate, rewrite); live: a REJECTED → APPROVED edit was NOT VALID |
| Attacker-signed archive | The signer must chain to an anchor | `ledger.test`, `record.test` |
| Key injected into the database | Trust only from environment-variable anchors through signed successions | `record.test` "a key inserted directly into the database is never trusted" |
| Cross-site restore | `siteId` in every record, checkpoint and archive statement | `record.test` |
| Resurrecting an older approval by dropping a rejection | A record without its decision row is refused. Chain continuity prevents dropping a middle record | `ledger.test` |
| Restore TOCTOU (archive swapped between verify and confirm) | Token bound to the digest and re-verified at confirmation | `record.test` |
| Token replay or theft | Only the SHA-256 is stored; single use (atomic UPDATE); 10 min expiry; bound to the actor | `record.test` |
| Concurrent decision during restore | `decide` returns CONFLICT while a recovery session is active; `anchor` refuses too | `record.test` |
| Partial restore lets work through | Gate-safe write order plus `RESTORE_INCOMPLETE` | `record.test` "interrupted restore" |
| Unauthorised access | Export, restore, status, verify and adopt are Jira-admin only. Single records are reviewer only, after an as-user read of the work item. Transfer chunks are readable only by the exporting admin | `record.test` |
| Cross-project leakage on the Record page | Rows are filtered to work items the viewer can see (as-user read). Account IDs are shown only to reviewers | `record.test` "register" |
| Private key exposure | Keys are never returned. Status and exports carry public keys and fingerprints only | `record.test` "no private key material" |
| Personal information in logs | Logs carry event names, counts and codes only, never decision text, account IDs or archive content | Code review, live `forge logs` |
| **Rollback to an older genuine archive** (accepted risk) | Restore only into an empty store, by an admin. The report shows `createdAt` and head seq. Re-screening invalidates approvals whose text changed | **Not detectable without an external append-only anchor.** The Confluence checkpoint would narrow this, but a space admin could still remove it (Stage 1.5 S9) |
| Archive confidentiality | The archive includes decision text and reviewer account IDs, and the UI says so | The customer must store it securely (§18) |

**Security defects found and fixed during M5:**
1. An interrupted restore let a gated transition (SHOP-1, test) through. Fixed with `RESTORE_INCOMPLETE`.
2. The archive digest changed after a JSON round trip (undefined keys). Fixed in `stableStringify`.
3. The export UI claimed "downloaded" when the browser had silently blocked it. Fixed with honest wording and copy/text fallbacks.

**Live finding (M4 behaviour, confirmed in M5).** During the deploy window, before the migrations ran, the gate blocked an *approved* transition with `SYSTEM_UNAVAILABLE`, even in monitor mode. It healed itself once the migrations applied. This is fail-closed and correct, but it is an operational note (§18).

---

## 12. Failure handling

| Failure | Behaviour | User-visible state |
|---|---|---|
| No record key configured | `mode: 'none'`; decisions refused (NOT_CONFIGURED) | Settings: signing not configured |
| Only the legacy HMAC key | `mode: 'v2'`; works as in M4 | Settings: Legacy |
| SQL error during a decision | Nothing recorded; error shown (M3) | Error toast; retry is safe |
| Chain anchoring failed | Gate `RECORD_PENDING`; reconciler repairs | Record page: "Pending" |
| Export resolver error | No export event recorded | Error message |
| Download or clipboard blocked by the browser | Nothing claimed | "Copy archive" / "Show archive text" fallbacks; specific `copyBlocked` message |
| Upload chunk missing or altered | Assembly refused | Error; re-upload |
| Archive invalid | Report lists the errors; **no restore button** | Error list |
| Restore stops part-way | `failed_partial` event; gate closed | Settings: restore incomplete; resume by verifying the same archive |
| Key lost | `RECORD_KEY_UNTRUSTED` on old v3 approvals | Settings: untrusted previous key, with "Adopt" by fingerprint |
| Request size limits | Chunking (≤ 200 export chunks of 1 M characters, uploads of 100 K) | Progress through the chunks |
| Migration not yet applied after a deploy | Gate `SYSTEM_UNAVAILABLE` (fail closed); reconciler applies the migrations | Transitions blocked briefly |

---

## 13. Automated test results

`npm run check`: lint (ESLint plus copy lint) ✅, backend `node --test` **169/169** ✅, UI Vitest **69/69** ✅, production builds and budgets ✅. `forge lint` ✅.

**New pure tests ([`test/ledger.test.mjs`](../app/test/ledger.test.mjs), 9):**
- key loading and kid/fingerprint derivation;
- trust only from anchors and signed successions;
- v3 field, key and site tampering;
- mixed v2/v3 chains, with and without the legacy key (attestation);
- deletion, reordering, replay, truncation and rewrite;
- archive JSON round trip and pending decisions;
- every archive tampering case, attacker-signed archives and cross-site restore;
- a missing decision row (no resurrection);
- the offline verifier (pinned fingerprint, legacy prefix, rotation history).

**New service tests ([`test/record.test.mjs`](../app/test/record.test.mjs), 16):**
- normal operation;
- upgrade from v2;
- export → wipe → reinstall → verified restore → re-check → the gate allows again, and the rejection is not resurrected;
- text edited while uninstalled → the approval is invalidated;
- refusals: non-empty store, non-admin, tampered, foreign-site and attacker-signed archives;
- session single use, expiry, actor binding and swapped archive;
- decisions refused during restore;
- interrupted restore → gate closed → resume;
- rotation with handover;
- key loss → adopt by fingerprint;
- key injected into the database;
- chunked transfers (exporter-only reads, immutable uploads);
- Record page visibility and account-ID filtering;
- single-record download verified with the public key alone;
- no private key material in status or exports;
- retention.

**Adapted tests:** `gate.test`, `review-service.test` and `backend.test` now use the v3 trust shape. The "rotated key" test now asserts `RECORD_KEY_UNTRUSTED`.

**New UI tests ([`frontend/src/record.test.jsx`](../app/frontend/src/record.test.jsx), 11, axe on the main views):**
- the Record list, with its empty, error and pagination states;
- Settings record section;
- verify;
- chunked export without claiming a download;
- the restore flow: upload → report → explicit confirmation;
- an invalid archive offers no restore;
- adoption by typed fingerprint;
- loading and error states;
- the History signature line and download (reviewers only).

---

## 14. Live validation results (development, AI off, synthetic projects A25GC and A25GT only)

| # | Check | Result |
|---|---|---|
| 1 | Deploy M5 (minor, no scope change) and upgrade from v2 | ✅ Migrations applied by the reconciler. **Observed:** before that, the gate blocked an approved transition with `SYSTEM_UNAVAILABLE` (fail closed), then healed |
| 2 | The existing v2 approval A25GT-1 still passes the gate after the upgrade | ✅ Allowed |
| 3 | Verify the whole record (11 legacy records) | ✅ "verified"; legacy attested by a signed checkpoint |
| 4 | Export a signed archive | ✅ `article25-record-…-seq11.json` saved (18.3 KB) |
| 5 | Offline verification with the pinned fingerprint | ✅ VALID, complete; legacy verified by checkpoint |
| 6 | Tampered copy (one decision REJECTED → APPROVED) | ✅ NOT VALID |
| 7 | Truncated copy | ✅ NOT VALID (checkpoint beyond head) |
| 8 | A new decision after the upgrade (A25GT-1, synthetic) | ✅ v3 record; History shows "Signed record · Ed25519 · k12a2e901fcc4f382" |
| 9 | Record page | ✅ Lists all decisions. The v3 record shows Ed25519 with its kid and "In backup: Not yet"; legacy records show "Legacy (HMAC) · Yes" |
| 10 | Backup-gap warning | ✅ Settings: "1 record is not in any exported archive" |
| 11 | Verify the mixed v2 + v3 chain (12 records) | ✅ "Verified: every signature, link and decision matches" |
| 12 | Export the mixed chain | ✅ Server export up to record 12; Settings updated to "every record" ([evidence](m5-evidence/02-record-settings-verified-and-exported.jpg)) |
| 13 | Single decision record download | ⚠️ Resolver `getDecisionRecord` returned OK, but **the browser pane did not save the file**. The UI raised no error, because downloads cannot be observed from the iframe |
| 14 | Offline verification of the mixed-chain export | ⚠️ **Not done live.** The browser pane stopped saving downloads after the first one, and the cross-origin iframe text could not be read. Covered by `ledger.test` (mixed chain plus verifier) |
| 15 | Live uninstall → reinstall → restore | ❌ **Not run.** It would wipe the dev store, including M3–M5 evidence (approval boundary 2: destructive). Covered by `record.test` and by Stage 1.5's live uninstall/restore of the same pattern (research 22). A safe option is a separate Forge environment (§17) |
| 16 | Confluence publication, outages and retries | ⛔ BLOCKED (scopes) |
| 17 | Gate still enforced | ✅ Unchanged in M4 tests. Live gate events after the upgrade were allowed and blocked as expected |

**Clean-up:**
- A25GT-2 was moved back to To Do. It had been moved to In Progress in monitor mode during check 1.
- Gate mode is Monitoring and AI is Off.
- No synthetic issue or record was deleted.

**Evidence:** [`m5-evidence/01-record-settings-before-backup.jpg`](m5-evidence/01-record-settings-before-backup.jpg), [`m5-evidence/02-record-settings-verified-and-exported.jpg`](m5-evidence/02-record-settings-verified-and-exported.jpg). Screens showing user names were not saved.

---

## 15. Performance measurements

**Live (development, `forge logs`):**

| Resolver | Time |
|---|---|
| `verifyLedger` (12 records) | 280 ms |
| `exportArchive` (11 records) | 392 ms |
| `getTransferChunk` | 138 ms |
| `getRecordStatus` | 359 ms average (n = 3) |
| `recordDecision` (with v3 signing) | 723 ms |
| `getDecisionRecord` | 841 ms |

**Local benchmark** of the pure ledger code (Apple M5, Node 24.22):

| Decisions | Sign (per record) | Verify the whole archive | Archive size |
|---|---|---|---|
| 100 | 0.04 ms | 7 ms | 108 KB |
| 1,000 | 0.02 ms | 53 ms | 1.07 MB |
| 5,000 | 0.02 ms | 257 ms | 5.35 MB |

About 1.07 KB per decision before assignments and settings. Verification is linear. At 5,000 decisions an export is 6 chunks.

**Bundles:** panel 193.1 KB gzip (M4: 191.0; +2.1 KB, mostly shared copy strings), desk 211.8 KB gzip (M4: 205.9). The panel now has 6.9 KB of headroom under its budget: a risk for future panel features.

---

## 16. Known limitations

- **Confluence register:** BLOCKED (§19).
- **Rollback to an older genuine archive** cannot be detected (§11).
- **Export and verify are single invocations.** Untested above 5,000 decisions locally. The Forge invocation time limit makes very large stores (an estimated ≥ 50,000) a risk; streaming or paged verification is deferred.
- **The Record page shows the latest 500 decisions** (25 per page). Keyset pagination is deferred.
- **The customer must keep the archive.** Article25 cannot see whether the file was saved. It shows the export time and the records not yet exported.
- **Restore is allowed to any Jira administrator.** A separate recovery group and dual control (a second admin approving) are deferred. The Settings "People" summary used to mention a recovery group; M5 corrected it to say restore is limited to Jira administrators.
- **There is no automatic or scheduled export.** It needs an external destination, which means new scopes or egress.
- **A key-loss adoption relies on the admin holding the previous fingerprint** from outside Jira.
- **Live verification of the single-record download and the mixed-chain export file** was limited by the test browser (§14).

---

## 16b. Final audit amendment (23 Nov 2026)
Full details: [FINAL_READINESS_AUDIT.md](FINAL_READINESS_AUDIT.md) §5–§6.
- **Live reinstall/restore: done.** It ran in an isolated custom development environment (`recovery`) on the same site, with its own key and the development key's public half as an anchor.
  - export → offline `VALID` → uninstall → reinstall (all 15 migrations re-applied, empty record) → restore (*Restored and verified*, 1.2–1.5 s) → whole-chain *verified* → automatic re-check → gate preview.
  - Result: the Ed25519 approval of unchanged text *would be allowed*; the pre-M5 approval *would be blocked* (no legacy key in that environment).
  - A one-character tampered archive was refused live.
  - The recovery installation was removed afterwards. Development was not touched except for one more export.
- **Defects found and fixed (with regression tests):**
  - no restore-in-progress marker, so signatures and decisions could interleave with restored history;
  - a rejected confirm masked a partial restore and reopened the gate;
  - archives signed by a retired or lost key could never be restored → `A25_RECORD_TRUSTED_KEYS`;
  - large restores could not finish within Forge's 25 s limit → batched, resumable rounds;
  - unlabelled gate reasons;
  - misleading "not backed up" after a restore.
- **Scenario 6 (key loss) amendment.** In production one key signs every site, so the vendor fixes a key loss once by listing the old public key. Per-site adoption remains available.
- **§19 (Confluence register):** closed. The owner chose the archive-only design.
- **§15 benchmark:** superseded by the committed `npm run bench`. On Apple M5 with Node 24.22, verifying 5,000 decisions takes 223 ms and the archive is 6.2 MB.
- **Deploy incident (§11):** root cause and fix in the audit, §9. Monitor mode no longer blocks on evaluation failures, and the schema self-heals within seconds.

## 17. Deferred work (prioritised)

| Priority | Item | Why deferred |
|---|---|---|
| P1 | Confluence register (outbox, view, checkpoint anchor) | Scope approval (§19) |
| P1 | Live reinstall/restore rehearsal in a **separate** Forge environment (for example `staging`) with its own synthetic project | Needs a second installation; keeps dev evidence intact |
| P2 | Recovery group and dual control for restore and key adoption | Product decision on who holds recovery rights |
| P2 | Paged export and verification for large stores | Not needed below about 50,000 decisions |
| P3 | Record page keyset pagination and filters (by project, outcome, key) | Usability at scale |
| P3 | Scheduled export reminder (for example, the Overview nudges when the backup is more than 30 days old) | Low risk; next UX pass |

**Product maturity review of the M1–M4 backlog**, ranked by user impact, security risk and competition relevance:

| Rank | Item | Impact | Security | Competition | Decision |
|---|---|---|---|---|---|
| 1 | Clean-site installation rehearsal | High | Medium (consent, defaults) | **High**: judges install it | **M8, first.** Needs a clean site |
| 2 | Production permissions and scope freeze | High | High | High | M8. Approval at scope freeze (now also covers Confluence, §19) |
| 3 | Recovery and operational documentation | High | Medium | Medium | **Done in M5** (§18) |
| 4 | Gate event retention and purging | Medium | Medium (data minimisation) | Low | **Done in M5** (30 days) |
| 5 | Multiple real reviewers (separation of duties live) | High | High | Medium | Needs a second licensed user (your action) |
| 6 | Panel live rendering check | Medium | Low | High (demo) | M8 demo polish |
| 7 | Automation-triggered transitions through the gate | Medium | **Medium**: automation must not bypass | Medium | Verify live in M8. Validators apply to every transition, but this is not tested with Automation |
| 8 | Live duplicate-submission check | Low | Low (covered by `request_id` plus tests) | Low | Keep deferred |
| 9 | Inbox beyond 300 candidates | Medium at scale | Low | Low | M10 (keyset pagination) |
| 10 | Workflow health beyond 1,000 workflows | Low | Low | Low | M10 |
| 11 | JSM support | Low for the MVP | Low | Low | Post-competition |

---

## 18. Operational instructions

**Configure signing (per environment; never commit keys).**

```bash
# generate locally without printing the private key; paste only into forge variables
node -e "const {generateKeyPairSync}=require('crypto');process.stdout.write(generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))" > /tmp/a25-key && \
  forge variables set --encrypt -e <env> A25_RECORD_SIGNING_KEY "$(cat /tmp/a25-key)" && rm /tmp/a25-key
```

Then open Settings → Decision record and recovery, and **record the fingerprint outside Jira** (password manager or audit file).

**Rotate the key (planned).**
1. Set the old value as `A25_RECORD_SIGNING_KEY_PREVIOUS`.
2. Set the new key as `A25_RECORD_SIGNING_KEY`.
3. Deploy. The reconciler registers the new key and writes a co-signed succession.
4. Pin the new fingerprint.
5. Remove `…_PREVIOUS` after the next export.

**Lost key.** Set a new key. Old approvals then block (`RECORD_KEY_UNTRUSTED`). In Settings, adopt the previous key by typing its pinned fingerprint.

**Back up.** Settings → Download signed archive. If the browser blocks the download, use Copy archive or Show archive text and save the text as a `.json` file. Store it securely: it contains decision text and reviewer account IDs. Back up regularly, and always before an uninstall.

**Audit offline.**

```bash
node scripts/verify-archive.mjs article25-record-YYYY-MM-DD-seqN.json --fingerprint "<pinned fingerprint>"
```

**Before an uninstall.**
1. Export.
2. Remove the Article25 rule from your workflows: otherwise Jira blocks those transitions.
3. Uninstall.

**After a reinstall.**
1. Check that the same signing variables are present (they survive an uninstall).
2. Settings → Restore → upload or paste the archive.
3. Read the report, then confirm within 10 minutes.
4. If the restore stops, verify the same archive again to resume. Transitions stay blocked until then.

**Deploying upgrades.** The gate blocks protected transitions for the minutes before new migrations apply (fail closed). Deploy outside working hours, or open Article25 once after deploying to trigger the migrations.

---

## 19. Approval dependencies

### 19.1 Confluence register: approval request (BLOCKED)

**Why it is needed.** It adds a durable, human-readable copy of every decision that lives outside the app's storage. It is visible to auditors in Confluence and adds an extra signed anchor. The signed archive already delivers recoverability. Confluence adds visibility and a second copy that does not depend on someone keeping a file.

| Option | Scopes added | Other requirements | Consequences |
|---|---|---|---|
| **A. Defer: archive only (current)** | None | None | No re-consent. Durability depends on admins exporting. No Confluence view |
| **B. Confluence register, narrowest** | `read:page:confluence`, `write:page:confluence` | Install in Confluence; **multi-app compatibility (preview)**; admin selects an existing space and page by ID (no space listing) | Major version and re-consent on every site. Marketplace listing **paid only** while multi-app is in preview. Confluence page restrictions are the customer's responsibility |
| C. As B, plus a space picker | B + `read:space:confluence` | As B | One more read scope, for convenience only |

**Recommendation: A now, B at the scope freeze, only if you want the Confluence view in the demo.**
- Option B is the narrowest working set (proved in the Stage 1 spike).
- Option C adds a scope only for convenience, which the brief asks us to avoid.
- Because of the multi-app preview and the paid-listing constraint, decide before the clean-site rehearsal: adding scopes after judges install forces a major-version re-consent.

**What I need from you:** "approve B", "approve C" or "keep A". Nothing has been added to the manifest.

### 19.2 Other approvals

| Item | Boundary | Status |
|---|---|---|
| Production record signing key (generate, store, pin the fingerprint) | 6 | Not done; needed before a production deploy |
| Production deploy of M3–M5 | 5 | Not done |
| Live uninstall/reinstall rehearsal on dev | 2 (destructive) | Not done. Recommended in a separate environment instead (P1, §17) |
| Deleting synthetic data (AS-78, AS-79, A25GC, A25GT) | Brief rule | Kept |

---

## Acceptance criteria (Part 12)

| Requirement | Status | Evidence |
|---|---|---|
| Architecture | ✅ Complete | §2–3 |
| Decision register | ✅ In-app register (Record page, signed records, single-record bundle). **Confluence publication BLOCKED** | §5, §14 rows 8–9; §19 |
| Integrity | ✅ Complete | Offline verifier VALID live; tampered and truncated copies NOT VALID live; `ledger.test` |
| Recovery | ✅ Export live; restore verified by integration tests. **Live reinstall not run** (destructive) | §7, §14 rows 4–5, 15 |
| Idempotency | ✅ Complete | `decisionId`/`request_id` uniqueness, INSERT IGNORE restore, immutable chunks, single-use tokens; tests |
| Security | ✅ Complete | §11; 25 new tests |
| Failure handling | ✅ For the archive, chain and restore. Confluence outage handling designed, **BLOCKED** | §12; `record.test` interrupted restore |
| UX | ✅ Complete | Record page, History, Settings; axe tests; live screenshots |
| Regression | ✅ Complete | 169/169 backend, 69/69 UI |
| Development validation | ⚠️ Partial | §14: 12 checks passed; 2 limited by the test browser; reinstall not run; Confluence BLOCKED |
| Documentation | ✅ Complete | This document; roadmap and blueprint amendments |
| GitHub | ✅ Draft PR against `milestone-m4-enforce`, audited | See the PR |
