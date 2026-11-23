# 22 — C3 Recovery Integrity: Hash Chain + Authorised Recovery

**Date:** 2026-11-22 · **Site:** <dev-site>.atlassian.net (demo, synthetic data only) · **App:** `article25-core-spike`, development env, v3.5.0 · **Installation:** `59e18718…` (after the uninstall/reinstall in this test)
**Result: ✅ C3 recovery integrity PASSED.** 21/21 unit tests and 13 live checks passed. **One residual risk is documented and accepted** (§5).

Evidence sources: `forge logs` entries with `"evidence":"recoveryVerify|recoveryConfirm|chainExport"`, in-app audit log rows 1–6 and 30002–30008, REST responses quoted below, and `node --test test/chain.test.mjs` output.

---

## 1. What was built (`spikes/article25-core-spike/src/chain-core.js`, `src/chain.js`)
**Record (v2):** `{v, siteId, seq, prevHash, decisionId, issueKey, state, conditions, decidedBy, decidedAt, sig, hash}`
- `sig = HMAC-SHA256(A25_SIGNING_KEY, canonical(record))`. Only the app can produce it; the key is an encrypted Forge env var and is never logged.
- `hash = SHA-256(canonical + "|" + sig)`. The next record's `prevHash` must equal it, and seq 1 links to `genesis = SHA-256("article25-genesis|" + cloudId)`.
- Total order comes from SQL `chain(seq PRIMARY KEY, decision_id UNIQUE)`, with `INSERT IGNORE` plus retry on seq contention.

**Three independent anchors**, written after every decision:
1. Full history: Confluence content property `article25-chain` on the register page. This is customer-owned and user-editable, so it is never trusted without verification.
2. Signed **checkpoint** `{siteId, seq, hash, sig}` in the Confluence **page-version message**. Version messages cannot be edited; versions can only be deleted by space admins.
3. Signed **receipt** `{issueKey, seq, hash, sig}` in the Jira issue property `article25-review` of the decided work item.

**Verification (`verifyHistory`)** rejects the history on *any* of:
- wrong version or site (cross-site replay);
- seq ≠ position;
- broken `prevHash`;
- bad signature or bad hash;
- duplicate decisionId or record (replay);
- a valid checkpoint beyond the head (truncation), or a checkpoint hash mismatch (rewrite);
- a receipt with a bad signature, for a missing work item, newer than the history, or with a hash mismatch.

`complete` additionally requires at least one valid checkpoint.

**Restore policy (`restorePlan`):** approvals are offered **only if valid AND complete**. Otherwise `approvalsToRestore = []`, and the backup's claims are shown as `untrustedClaims`.

**Authorised two-step recovery:**
- **Verify:**
  - requires membership of `article25-recovery-admins` (checked from Forge context accountId);
  - runs only when the local chain is empty;
  - clears any older pending verification;
  - verifies and audits;
  - if restorable, issues a single-use nonce (10 min, bound to user and page).
- **Confirm:**
  - checks group, nonce, user, page and expiry;
  - **consumes the nonce**, re-checks that the store is empty, and **re-verifies** (TOCTOU), requiring an unchanged head hash;
  - inserts chain and decisions, then writes `review_state` **last** (the gate stays closed until that point);
  - on any error, deletes `review_state`, chain and recovered decisions, so the gate fails closed;
  - audits the outcome.

## 2. Unit tests — `node --test test/chain.test.mjs` → **21 pass, 0 fail**
| ID | Scenario | Expected | Result |
|---|---|---|---|
| S0 | Valid complete history | valid, complete, AS-1 latest = REJECTED | ✅ |
| S1 / S2 | Modified state (REJECTED→APPROVED) / modified conditions | invalid (signature) | ✅ |
| S3 | Modified record re-hashed without key | invalid | ✅ |
| S4 / S5 | Middle record deleted (with / without anchors) | invalid (seq / prevHash) | ✅ |
| S6 | Tail truncation, checkpoints present | invalid ("beyond history head") | ✅ |
| S7 | Tail truncation, receipts only | invalid ("later decision missing") | ✅ |
| S8 | Tail truncation, **all anchors removed** | valid but **not complete** → not restorable | ✅ |
| S9 | Tail truncation with **anchors consistently rolled back** | **valid + complete (NOT detected)**; residual risk asserted | ✅ (documents limit) |
| S10 | Reordered records | invalid | ✅ |
| S11 | Replayed duplicate | invalid ("replay") | ✅ |
| S12 | Cross-site replay (valid chain from another site) | invalid ("cross-site") | ✅ |
| S13 / S14 | Forged record (other key) / forged tail append | invalid | ✅ |
| S15 | Empty history while receipts exist | invalid | ✅ |
| S16 | Forged checkpoint / receipt anchors | ignored (checkpoint) / invalid (receipt) | ✅ |
| S17 | Genesis tampered | invalid | ✅ |
| S18 | Restore plan on valid history | only latest approvals (AS-1 excluded) | ✅ |
| S19 | Restore plan on tampered history | no approvals; forged claim in `untrustedClaims` | ✅ |
| S20 | Restore plan on valid-but-incomplete history | not restorable | ✅ |

## 3. Live test on the demo site
**Setup:** decisions recorded through the issue panel produced chain seq 1–4. Every write returned property 200, checkpoint 200 and receipt 200.

| seq | Work item | Decision | hash (prefix) |
|---|---|---|---|
| 1 | A25C-1 | APPROVED | 93491fbce8 |
| 2 | AS-1 | APPROVED | 8377819de1 |
| 3 | AS-2 | APPROVED_WITH_CONDITIONS (2 conditions) | 6f72d19586 |
| 4 | AS-1 | **REJECTED** (supersedes seq 2) | 37df3a30a1 |

| # | Check | Observed result | Verdict |
|---|---|---|---|
| L1 | Append + anchors on each decision | `appended:true, seq:n`, all three anchors 200 | ✅ |
| L2 | Chain export before uninstall | `count:4`, head seq 4 `37df3a30a189378b` | ✅ |
| L3 | Recovery verify **without** group membership | `authorised:false` "requires membership of 'article25-recovery-admins'" | ✅ |
| L4 | Recovery verify by authorised user with non-empty store | refused "local chain is not empty (4 records)" | ✅ |
| — | Uninstall → reinstall (Jira required + Confluence) | install trigger applied **all 5 migrations** to an empty DB (SQL wiped) | ✅ |
| — | Gate after wipe, before recovery | A25C-1, AS-1, AS-2 → **400** "no privacy review recorded" (fails closed) | ✅ |
| L5 | Verify intact backup | `valid:true, complete:true`, 4 checkpoints, 3 receipts; approvalsToRestore = A25C-1 APPROVED, AS-2 APPROVED_WITH_CONDITIONS (AS-1 correctly excluded) | ✅ |
| L6 | **TOCTOU:** verify OK → ordinary user edits backup (HTTP 200) → confirm | `restored:false` "backup changed or became invalid since verification" | ✅ |
| T1 | **Modified:** AS-1 seq 4 REJECTED→APPROVED | invalid: seq 4 signature invalid + stored hash mismatch | ✅ |
| T2 | **Middle deletion:** seq 2 removed | invalid: seq gap, prevHash break, 3 checkpoint mismatches | ✅ |
| T3 | **Tail truncation:** seq 4 (the REJECTED) removed so the old AS-1 APPROVED resurfaces | invalid: "checkpoint seq 4 beyond history head 3" **and** "receipt for AS-1 attests seq 4 … later decision missing" | ✅ |
| T4 | **Reorder:** seq 2 ↔ 3 | invalid: seq / prevHash errors, checkpoint mismatches | ✅ |
| T5 | **Replay:** old AS-1 APPROVED re-appended as seq 5 | invalid: signature, hash, "decisionId … appears twice (replayed record)" | ✅ |
| T6 | **Emptied backup** (`records: []`) | invalid: 4 × "checkpoint seq n beyond history head 0" | ✅ |
| — | After T1–T6: chain export / gate | `count:0`; all three transitions still **400** (nothing restored) | ✅ |
| L7 | Hardening deployed (v3.5.0); tampered verify | `approvalsToRestore: []`, forged claim listed under `untrustedClaims` | ✅ |
| L8 | **Stale nonce:** verify OK (N1) → tamper → verify fails (clears N1) → restore backup → confirm with N1 | `restored:false` "no matching, unexpired verification by this user" | ✅ |
| L9 | **Authorised restore:** verify (N2) → confirm | `restored:true, records:4, workItems:3`, head `37df3a30…` = original | ✅ |
| — | Gate after restore | A25C-1 → **204**; AS-2 → **204**; **AS-1 → 400 "state is REJECTED"** (old approval not resurrected) | ✅ |
| L9b | Re-use of consumed nonce N2 | `restored:false` (single-use) | ✅ |
| L10 | Continuity: new decision after restore | seq 5 appended, `prevHash` = restored seq-4 hash; anchors 200 | ✅ |
| L11 | Audit log | every verify/confirm (ok and rejected) recorded with actor, result and errors | ✅ |

## 4. Findings during live testing (fixed)
1. **A failed verify did not clear an older pending nonce.** That allowed a later confirm with a stale nonce once the backup was put back. The confirm was still safe because it re-verifies, but it was not intended. **Fixed:** verify clears pending state first, and confirm consumes the nonce before anything else (L8 verifies this).
2. **Invalid reports listed "approvalsToRestore"** taken from the forged history, which is misleading for an operator. **Fixed:** `restorePlan()` returns none unless valid and complete, and lists claims under `untrustedClaims` (S19, L7).
3. **Confirm did not bind the nonce to the verifying user.** **Fixed:** `p.by === accountId`.
4. Confirm now re-checks that the local store is empty.

## 5. Residual risks and limits (not fixed; accepted for the hackathon, to state honestly)
| Risk | Detail | Mitigation now | Possible future work |
|---|---|---|---|
| **Consistent rollback** (S9) | A user who is Confluence **space admin** (to delete page versions) *and* can edit work-item properties can roll back the property, delete the newer checkpoint versions, and restore older receipts. The older history then verifies as complete. | Requires space-admin rights and coordinated edits in two products. Recovery needs a recovery-admin, two steps and audit. The verify report shows head seq and decisions for a human check. | An external append-only anchor outside the customer's control (not available without egress). Or the latest head mirrored to a second space with different admins. |
| **Receipts only checked for work items named in the backup** | Seen live in T6: receipts = 0. Checkpoints still caught it. | Checkpoints cover whole-history truncation. | Index receipts with `jira:entityProperty` and enumerate them via JQL. |
| **Audit log is wiped on uninstall** | It lives in Forge SQL. | Recovery-time audit is enough for the spike. | Also write audit entries to the Confluence page history. |
| **Key rotation** | Rotating `A25_SIGNING_KEY` invalidates old records. | Do not rotate during judging. | Key IDs (`kid`) plus a verification key ring. |
| **Property size** | The whole history is in one content property. | Fine for judging volumes (size limit untested). | Shard by period. |
| **Recovery page is user-supplied** | Recovery reads the page ID given in the request. | Only recovery-admins can call it, and the page must contain validly signed history for *this* site. | Bind to the configured register page. |

## 6. Verdict
The user's C3 requirements are met:

| Requirement | Status |
|---|---|
| Every decision linked to its predecessor | ✅ (`prevHash`, live L10) |
| Modified, deleted, reordered and replayed records detected | ✅ (unit S1–S17; live T1–T5) |
| Complete chain verified before restoring | ✅ (verify + re-verify at confirm, L6) |
| Incomplete or invalid histories rejected; never restore from an incomplete backup | ✅ (S8, S20, T3, T6) |
| Authorised recovery action | ✅ (group + nonce + two-step, L3, L8, L9b) |
| Fail-closed gate preserved | ✅ (400 before recovery and after every rejected attempt; `review_state` written last) |

The one remaining gap is the space-admin consistent-rollback case (§5). It is documented, not detected.
