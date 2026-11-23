// Decision ledger service (M5 RECORD & RECOVERY).
//
// - anchor(): append a signed record for a stored decision (v3 Ed25519 when A25_RECORD_SIGNING_KEY
//   is configured; legacy v2 HMAC otherwise). Idempotent per decision; retries sequence races.
// - ensureKeys(): register the current public key (self-signed); after a rotation record a signed
//   succession (co-signed by the previous key when A25_RECORD_SIGNING_KEY_PREVIOUS is supplied);
//   attest an existing legacy (v2) prefix with an Ed25519 checkpoint so it becomes publicly verifiable.
// - trust(): trusted keys, derived ONLY from the keys in encrypted environment variables.
// - verifyAll(): verify the whole ledger and every decision row; record the outcome.
// - exportArchive(): signed, complete archive (offline-verifiable with scripts/verify-archive.mjs).
// - beginRestore() / confirmRestore(): authorised two-step restore into an EMPTY store with a
//   single-use, user-bound, short-lived session; re-verification at confirm (TOCTOU); ordered,
//   idempotent, resumable writes; honest classification of the result.
// Callers must have verified that the actor is a Jira administrator.
import { createHash, randomBytes } from 'node:crypto';
import { AppError, ErrorCode } from '../lib/errors.js';
import { APP_VERSION } from '../lib/config.js';
import { buildRecord, genesis } from '../../core/chain-core.js';
import { decisionIdOf } from '../../core/review.js';
import {
  loadSigner, loadPublicKey, registerKey, succession, trustedKeys, keyEntryValid, buildRecordV3, verifyLedger, signCheckpointV3,
  decisionMatchesRecord, buildArchive, verifyArchive, fingerprintOf, recordIssueId,
} from '../../core/ledger.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const SESSION_MS = 10 * 60 * 1000;
// A confirm runs inside one resolver invocation (Forge limit 25 s). An `in_progress` marker older than
// this can only belong to an invocation that was killed; it may then be resumed.
const STALE_RESTORE_MS = 60 * 1000;
const RESTORE_BATCH = 50; // rows per multi-row INSERT IGNORE: ~200 statements for 5,000 decisions, each well under Forge SQL's request size
/** Restore outcomes that leave the record incomplete: the gate stays closed and nothing new is signed. */
export const RESTORE_INCOMPLETE_OUTCOMES = Object.freeze(['in_progress', 'failed_partial']);
const iso = (ms) => new Date(ms).toISOString();

export function createLedgerService({ repos, log, clock = () => Date.now(), settings, siteId, rescreen = async () => undefined }) {
  const signer = siteId ? loadSigner(settings.recordKey) : null;
  const prevSigner = siteId ? loadSigner(settings.recordKeyPrevious) : null;
  const hmacKey = siteId ? settings.signingKey ?? null : null;
  const mode = signer ? 'v3' : hmacKey ? 'v2' : 'none';
  // Retired keys' PUBLIC halves (A25_RECORD_TRUSTED_KEYS): anchors with the same authority as the
  // signing key (the app's environment), without keeping a retired private key alive.
  const retired = siteId ? (settings.recordTrustedKeys ?? []).map(loadPublicKey).filter(Boolean) : [];
  const anchorKeys = () => [...[signer, prevSigner].filter(Boolean).map((s) => ({ publicKey: s.publicKeyB64 })), ...retired.map((k) => ({ publicKey: k.publicKey }))];

  /** Trusted keys: anchored only by keys from the app's environment variables. */
  async function trust() {
    const { registry, successions } = await repos.trustMaterial();
    const anchors = anchorKeys();
    const valid = registry.filter((k) => keyEntryValid(k, siteId));
    return { keys: trustedKeys(valid, successions, { siteId, anchors }), hmacKey, registry: valid, successions };
  }

  let ensured = false;
  /** Idempotent key bookkeeping. Safe to call often; does nothing without a v3 signer. */
  async function ensureKeys() {
    if (!signer || ensured) return { mode };
    const at = iso(clock());
    const { registry, successions } = await repos.trustMaterial();
    if (!registry.some((k) => k.kid === signer.kid)) await repos.recordKeys.insert({ ...registerKey(signer, { siteId, at }) });
    // Rotation: the newest OTHER registered key without a succession to us becomes our predecessor
    // ONLY when its private key is supplied (endorsed handover). After a key loss the admin must
    // explicitly adopt the old key (adoptPredecessor), after checking its fingerprint out of band.
    const others = registry.filter((k) => k.kid !== signer.kid && keyEntryValid(k, siteId));
    if (prevSigner && others.some((k) => k.kid === prevSigner.kid) && !successions.some((s) => s.fromKid === prevSigner.kid && s.toKid === signer.kid)) {
      const prevEntry = others.find((k) => k.kid === prevSigner.kid);
      await repos.keySuccessions.insert(succession(signer, prevEntry, { siteId, at, prevSigner }));
      log.info({ evt: 'ledger.key.rotated', reason: 'endorsed' });
    }
    // Legacy prefix: attest the current head once (makes v2 hash links publicly verifiable).
    const records = await repos.chain.all();
    const legacy = records.filter((r) => r?.v === 2);
    if (legacy.length && hmacKey) {
      const cps = await repos.checkpoints.all();
      const lastLegacy = Math.max(...legacy.map((r) => r.seq));
      if (!cps.some((c) => c.purpose === 'attestation' && c.kid === signer.kid && c.seq >= lastLegacy)) {
        const v = verifyLedger(records, { siteId, keys: (await trust()).keys, hmacKey, checkpoints: [] });
        if (v.valid) {
          const head = records.at(-1);
          await repos.checkpoints.insert(signCheckpointV3(signer, { siteId, seq: head.seq, hash: head.hash, at, purpose: 'attestation' }));
          log.info({ evt: 'ledger.legacy.attested', count: head.seq });
        } else {
          log.warn({ evt: 'ledger.legacy.attest_refused', count: v.errors.length }); // never attest an invalid history
        }
      }
    }
    ensured = true;
    return { mode };
  }

  /** Admin: after a key LOSS, adopt a previously registered key as our predecessor (signed by us). */
  async function adoptPredecessor({ kid, fingerprint }) {
    if (!signer) throw new AppError(ErrorCode.NOT_CONFIGURED);
    const { registry, successions } = await repos.trustMaterial();
    const entry = registry.find((k) => k.kid === kid && keyEntryValid(k, siteId));
    if (!entry || kid === signer.kid) throw new AppError(ErrorCode.INVALID_INPUT, 'That key is not a registered previous key.');
    // The admin must type the fingerprint they have on record: binds the adoption to an out-of-band check.
    if (String(fingerprint ?? '').replace(/\s+/g, '').toLowerCase() !== fingerprintOf(entry.publicKey).replace(/\s+/g, '')) throw new AppError(ErrorCode.INVALID_INPUT, 'The fingerprint does not match that key.');
    if (successions.some((s) => s.fromKid === kid && s.toKid === signer.kid)) return { status: 'unchanged' };
    await repos.keySuccessions.insert(succession(signer, entry, { siteId, at: iso(clock()), prevSigner: null }));
    log.info({ evt: 'ledger.key.adopted', reason: 'unendorsed' });
    return { status: 'adopted' };
  }

  /**
   * Is a restore being verified ('verifying'), being applied or stopped part-way ('incomplete')?
   * While it is, nothing may be signed or decided: it would interleave with the restored history.
   * A rejected confirm (type restore_rejected) wrote nothing and never changes this state.
   */
  async function restoreState() {
    if (await repos.recoverySessions.active(clock())) return 'verifying';
    const last = await repos.ledgerEvents.latest('restore');
    return last && RESTORE_INCOMPLETE_OUTCOMES.includes(last.outcome) ? 'incomplete' : null;
  }

  /** Append the signed record for a stored decision. Idempotent; retries sequence races. */
  async function anchor(d) {
    if (mode === 'none') return { anchored: false, reason: 'no_signing_key' };
    if (await restoreState()) return { anchored: false, reason: 'recovery_in_progress' };
    await ensureKeys();
    const existing = await repos.chain.byDecision(d.decision_id);
    if (existing) return { anchored: true, seq: existing.seq };
    for (let attempt = 0; attempt < 10; attempt++) {
      const head = await repos.chain.head();
      const seq = head ? Number(head.seq) + 1 : 1;
      const base = {
        siteId, seq, prevHash: head ? head.record_hash : genesis(siteId), decisionId: d.decision_id,
        state: d.decision, conditions: d.decision === 'NEEDS_MORE_INFORMATION' ? d.questions : d.conditions,
        decidedBy: d.decided_by ?? 'system', decidedAt: iso(d.decided_at),
      };
      const record = mode === 'v3' ? buildRecordV3(signer, { ...base, issueId: d.issue_id }) : buildRecord(hmacKey, { ...base, issueKey: d.issue_id });
      if (await repos.chain.insert({ seq, decisionId: d.decision_id, record, recordHash: record.hash, createdAt: clock() })) return { anchored: true, seq };
      const raced = await repos.chain.byDecision(d.decision_id);
      if (raced) return { anchored: true, seq: raced.seq };
    }
    return { anchored: false, reason: 'contention' };
  }

  /** Verify the whole ledger and (optionally) the decision rows of one issue. */
  async function verify({ issueId = null, record = false, actor = null } = {}) {
    if (mode === 'none') return { status: 'not_configured' };
    await ensureKeys();
    const [records, cps, t] = await Promise.all([repos.chain.all(), repos.checkpoints.all(), trust()]);
    const v = verifyLedger(records, { siteId, keys: t.keys, hmacKey, checkpoints: cps.map((c) => ({ ...c, siteId })) });
    const recById = new Map(records.map((r) => [r.decisionId, r]));
    const rows = issueId ? await repos.decisions.list(String(issueId)) : await repos.exportReads.decisions();
    const problems = [];
    for (const r of rows) {
      const p = decisionMatchesRecord(r, recById.get(r.decision_id), decisionIdOf);
      if (p) problems.push({ seq: r.seq, issueId: String(r.issue_id), problem: p });
    }
    const hard = problems.filter((p) => p.problem !== 'not_anchored');
    const status = !v.valid || hard.length ? 'problem' : problems.length ? 'pending_anchor' : 'verified';
    const out = {
      status, chainLength: records.length, head: v.head?.seq ?? 0, errors: v.errors.slice(0, 5), problems: problems.slice(0, 20),
      legacy: v.legacy, checkpoints: v.checkpoints, decisionsChecked: rows.length, signing: mode,
    };
    if (record) await repos.ledgerEvents.insert({ at: clock(), type: 'verify', actor, outcome: status, headSeq: out.head, summary: { errors: out.errors.length, problems: problems.length, decisions: rows.length } });
    return out;
  }

  /** Signed export of the complete record (admin). Also writes an export checkpoint. */
  async function exportArchive({ actor }) {
    if (!signer) throw new AppError(ErrorCode.NOT_CONFIGURED, 'Exports need the record signing key (A25_RECORD_SIGNING_KEY).');
    await ensureKeys();
    // Read the chain FIRST: decisions written after this point are either included as "pending
    // anchor" rows or excluded entirely — never a record without its decision.
    const records = await repos.exportReads.chain();
    const [decisions, assignments, settingsRows, t] = await Promise.all([repos.exportReads.decisions(), repos.exportReads.assignments(), repos.exportReads.settings(), trust()]);
    const at = iso(clock());
    if (records.length) await repos.checkpoints.insert(signCheckpointV3(signer, { siteId, seq: records.at(-1).seq, hash: records.at(-1).hash, at, purpose: 'export' }));
    const cps = (await repos.checkpoints.all()).map((c) => ({ ...c, siteId }));
    const recIds = new Set(records.map((r) => r.decisionId));
    // A decision anchored after the chain read must not appear as "pending": drop rows whose
    // record exists now but was not read (they belong to the next export).
    const chainNow = await repos.chain.all();
    const lateAnchored = new Set(chainNow.filter((r) => !recIds.has(r.decisionId)).map((r) => r.decisionId));
    const decisionsIncluded = decisions.filter((d) => !lateAnchored.has(d.decision_id));
    const archive = buildArchive(signer, {
      siteId, createdAt: at, appVersion: APP_VERSION, keys: t.registry, successions: t.successions, records,
      checkpoints: cps.filter((c) => c.seq <= (records.at(-1)?.seq ?? 0)), decisions: decisionsIncluded, assignments, settings: settingsRows,
    });
    await repos.ledgerEvents.insert({ at: clock(), type: 'export', actor, outcome: 'exported', headSeq: archive.head.seq, digest: archive.digest, summary: archive.counts });
    log.info({ evt: 'ledger.exported', count: archive.counts.records });
    return archive;
  }

  async function storeIsEmpty() {
    const c = await repos.storeCounts();
    return Number(c?.decisions ?? 0) === 0 && Number(c?.chain ?? 0) === 0 && Number(c?.assignments ?? 0) === 0;
  }

  const anchorsForArchive = anchorKeys;

  /** Step 1: verify an uploaded archive and open a single-use restore session (empty store only). */
  async function beginRestore({ actor, archive }) {
    if (!signer && !hmacKey) throw new AppError(ErrorCode.NOT_CONFIGURED);
    const resume = await resumableRestore(archive?.digest);
    if (!resume && !(await storeIsEmpty())) throw new AppError(ErrorCode.CONFLICT, 'Restore is only possible into an empty decision record. This site already has decisions.');
    const report = verifyArchive(archive, { siteId, anchors: anchorsForArchive(), hmacKey, decisionIdOf });
    const now = clock();
    await repos.recoverySessions.expireAll(now); // a new verification supersedes any older session
    await repos.ledgerEvents.insert({ at: now, type: 'restore_check', actor, outcome: report.status, headSeq: report.head?.seq ?? null, digest: report.digest ?? null, summary: { errors: report.errors.length, pending: report.pending } });
    if (!report.restorable) return { report, token: null };
    const token = randomBytes(24).toString('hex');
    await repos.recoverySessions.insert({ tokenHash: sha256(token), actor, digest: report.digest, createdAt: now, expiresAt: now + SESSION_MS });
    return { report, token, resume: Boolean(resume) };
  }

  /**
   * A previous restore of THIS archive that stopped part-way may be resumed (idempotent writes):
   * it failed (`failed_partial`), or its invocation was killed (`in_progress` older than a minute).
   * A restore that is running right now cannot be resumed concurrently.
   */
  async function resumableRestore(digest) {
    if (!digest) return false;
    const last = await repos.ledgerEvents.latest('restore');
    if (!last || last.digest !== digest) return false;
    if (last.outcome === 'failed_partial') return true;
    if (last.outcome === 'in_progress') {
      if (clock() - Number(last.at) < STALE_RESTORE_MS) throw new AppError(ErrorCode.CONFLICT, 'This restore is still running. Wait a minute, then verify the archive again.');
      return true;
    }
    return false;
  }

  /** Write rows in batches (multi-row INSERT IGNORE). Returns how many were newly inserted. */
  async function writeBatches(write, rows) {
    let n = 0;
    for (let i = 0; i < rows.length; i += RESTORE_BATCH) n += await write(rows.slice(i, i + RESTORE_BATCH));
    return n;
  }

  /** Step 2: consume the session, re-verify, write in a gate-safe order, classify the result. */
  async function confirmRestore({ actor, token, archive }) {
    const now = clock();
    const session = await repos.recoverySessions.consume({ tokenHash: sha256(String(token ?? '')), actor, now });
    if (!session) throw new AppError(ErrorCode.CONFLICT, 'This restore was not verified by you in the last 10 minutes, or it was already used. Verify the archive again.');
    const report = verifyArchive(archive, { siteId, anchors: anchorsForArchive(), hmacKey, decisionIdOf });
    if (!report.restorable || report.digest !== session.digest) {
      // Its own event type: nothing was written, so it must never mask an incomplete restore.
      await repos.ledgerEvents.insert({ at: now, type: 'restore_rejected', actor, outcome: 'rejected', digest: report.digest ?? null, summary: { reason: 'archive changed or invalid since verification' } });
      throw new AppError(ErrorCode.STALE_EVIDENCE, 'The archive changed or became invalid since it was verified. Nothing was restored.');
    }
    if (!(await storeIsEmpty()) && !(await resumableRestore(report.digest))) throw new AppError(ErrorCode.CONFLICT, 'The decision record is no longer empty. Nothing was restored.');

    // Mark the restore as running BEFORE writing anything. Until a final outcome replaces it, the gate
    // stays closed and nothing new is decided or signed, even if this invocation is killed (timeout).
    await repos.ledgerEvents.insert({ at: clock(), type: 'restore', actor, outcome: 'in_progress', headSeq: report.head.seq, digest: report.digest, summary: { decisions: archive.decisions.length, records: archive.records.length } });

    // Gate-safe order: DECISIONS first (an approval without its record is blocked as pending), then the
    // CHAIN, then keys, checkpoints, assignments and settings. A failure part-way leaves the gate closed.
    const counts = { decisions: 0, records: 0, assignments: 0, settings: 0, keys: 0 };
    try {
      counts.decisions = await writeBatches(repos.restoreWrites.decisions, archive.decisions);
      counts.records = await writeBatches(repos.restoreWrites.chainRecords, archive.records);
      for (const k of archive.keys) if (await repos.recordKeys.insert(k)) counts.keys++;
      for (const s of archive.successions) await repos.keySuccessions.insert(s);
      for (const c of archive.checkpoints) await repos.checkpoints.insert(c);
      counts.assignments = await writeBatches(repos.restoreWrites.assignments, archive.assignments);
      counts.settings = await writeBatches(repos.restoreWrites.settings, archive.settings);
    } catch (e) {
      await repos.ledgerEvents.insert({ at: clock(), type: 'restore', actor, outcome: 'failed_partial', headSeq: report.head.seq, digest: report.digest, summary: { ...counts, code: e?.code ?? 'INTERNAL' } });
      log.error({ evt: 'ledger.restore.failed', code: e?.code ?? 'INTERNAL' });
      throw new AppError(ErrorCode.UPSTREAM_UNAVAILABLE, 'The restore stopped part-way. Protected transitions stay blocked. Verify the same archive again to resume.');
    }
    // Post-condition: what is stored now must verify and match the archive exactly. (`verify` and
    // `anchor` refuse nothing here: verification reads only, and nothing else can sign while the
    // in_progress marker stands.)
    const after = await verify({ record: false });
    const storedRecords = await repos.chain.all();
    const exact = after.status !== 'problem' && storedRecords.length === archive.records.length && storedRecords.at(-1)?.hash === archive.head.hash;
    const outcome = exact ? (report.pending ? 'restored_with_pending' : 'restored_verified') : 'restored_mismatch';
    await repos.ledgerEvents.insert({ at: clock(), type: 'restore', actor, outcome, headSeq: report.head.seq, digest: report.digest, summary: { ...counts, pending: report.pending, legacy: report.legacy?.verifiedBy } });
    log.info({ evt: 'ledger.restored', outcome, count: counts.records });
    // Re-check every restored work item so approvals bind to the CURRENT text again (or are invalidated).
    const issues = [...new Set([...archive.decisions.map((d) => String(d.issue_id)), ...archive.records.map(recordIssueId)])];
    for (const id of issues) await rescreen(id).catch(() => undefined);
    return { outcome, counts, head: report.head, pending: report.pending, rescreenQueued: issues.length };
  }

  /** Status for the admin page (no secrets, no account ids). */
  async function status() {
    const [t, lastExport, lastVerify, lastRestore, counts] = await Promise.all([
      trust(), repos.ledgerEvents.latest('export'), repos.ledgerEvents.latest('verify'), repos.ledgerEvents.latest('restore'), repos.storeCounts(),
    ]);
    const head = await repos.chain.head();
    return {
      signing: mode,
      currentKey: signer ? { kid: signer.kid, fingerprint: fingerprintOf(signer.publicKeyB64) } : null,
      legacyKey: Boolean(hmacKey),
      keys: t.registry.map((k) => ({ kid: k.kid, fingerprint: fingerprintOf(k.publicKey), registeredAt: k.registeredAt, trusted: t.keys.has(k.kid), current: k.kid === signer?.kid, endorsedByPredecessor: t.keys.get(k.kid)?.endorsedByPredecessor ?? null })),
      head: head ? Number(head.seq) : 0,
      counts: { decisions: Number(counts?.decisions ?? 0), records: Number(counts?.chain ?? 0), assignments: Number(counts?.assignments ?? 0) },
      lastExport: lastExport ? { at: lastExport.at, headSeq: lastExport.head_seq, digest: lastExport.digest } : null,
      lastVerify: lastVerify ? { at: lastVerify.at, outcome: lastVerify.outcome, headSeq: lastVerify.head_seq } : null,
      lastRestore: lastRestore ? { at: lastRestore.at, outcome: lastRestore.outcome, headSeq: lastRestore.head_seq } : null,
      restoreIncomplete: Boolean(lastRestore && RESTORE_INCOMPLETE_OUTCOMES.includes(lastRestore.outcome)),
      retiredKeys: retired.map((k) => ({ kid: k.kid, fingerprint: fingerprintOf(k.publicKey) })),
      notInLastExport: head ? Math.max(0, Number(head.seq) - (lastExport?.head_seq ?? 0)) : 0,
    };
  }

  /** A single decision's signed record, packaged for independent verification (reviewers). */
  async function recordBundle(decisionRow) {
    const rec = await repos.chain.byDecision(decisionRow.decision_id);
    const t = await trust();
    const key = rec?.record?.kid ? t.registry.find((k) => k.kid === rec.record.kid) : null;
    return {
      format: 'article25-decision-record', formatVersion: 1, siteId,
      decision: decisionRow, record: rec?.record ?? null,
      publicKey: key ? { kid: key.kid, alg: key.alg, publicKey: key.publicKey, fingerprint: fingerprintOf(key.publicKey) } : null,
    };
  }

  return { mode, signerKid: signer?.kid ?? null, ensureKeys, trust, anchor, verify, exportArchive, beginRestore, confirmRestore, status, adoptPredecessor, recordBundle, storeIsEmpty, restoreState };
}
