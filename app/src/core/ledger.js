// Article25 decision ledger v3 — pure logic (Node crypto only; exhaustively unit-tested).
//
// Why v3: v2 records (core/chain-core.js, unchanged) are HMAC-signed. Only the holder of the secret
// can verify them, losing or rotating the secret orphans history, and no auditor can check an
// export independently. v3 records are signed with Ed25519: anyone holding the PUBLIC key can
// verify them, keys are identified (kid) and rotated with signed succession statements, and an
// exported archive can be verified offline (scripts/verify-archive.mjs) without any secret.
//
// Compatibility: v3 records continue the SAME hash chain (seq, prevHash) as v2. An Ed25519-signed
// "attestation" checkpoint over the v2 head makes the v2 prefix publicly verifiable through its hash
// links (hash = SHA-256(canonical | sig) is computable without the HMAC key).
//
// Trust: signatures prove possession of a key, not that the key is OURS. A key is trusted only if
// it is (a) the app's current key (encrypted environment variable), or (b) named as predecessor in
// a succession statement signed by a trusted key. Keys stored in the database are never trusted by
// virtue of being stored.
import { createHash, createHmac, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, timingSafeEqual } from 'node:crypto';
import { canonical as canonicalV2, genesis, CHAIN_VERSION as V2 } from './chain-core.js';

export const LEDGER_VERSION = 3;
export const ARCHIVE_FORMAT = 'article25-record-archive';
export const ARCHIVE_VERSION = 1;
export { genesis };

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const b64 = (buf) => Buffer.from(buf).toString('base64');
const hexEq = (a, b) => {
  const x = Buffer.from(String(a ?? ''), 'hex');
  const y = Buffer.from(String(b ?? ''), 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

// ---- keys ---------------------------------------------------------------------------------------

/** kid = "k" + first 16 hex of SHA-256(SPKI DER). Stable and derivable from the public key alone. */
export const kidOf = (publicKeyB64) => `k${sha256(Buffer.from(String(publicKeyB64), 'base64')).slice(0, 16)}`;

/** Fingerprint shown to admins for out-of-band pinning (full SHA-256 of the SPKI DER, grouped). */
export const fingerprintOf = (publicKeyB64) => sha256(Buffer.from(String(publicKeyB64), 'base64')).match(/.{4}/g).join(' ');

/**
 * Load the Ed25519 signer from a base64 PKCS#8 DER private key (the encrypted env variable).
 * Returns null for anything that is not a valid Ed25519 private key (never throws, never logs).
 */
export function loadSigner(privateKeyB64) {
  if (!privateKeyB64) return null;
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(String(privateKeyB64).trim(), 'base64'), format: 'der', type: 'pkcs8' });
    if (privateKey.asymmetricKeyType !== 'ed25519') return null;
    const publicKeyB64 = b64(createPublicKey(privateKey).export({ format: 'der', type: 'spki' }));
    return { kid: kidOf(publicKeyB64), publicKeyB64, sign: (message) => b64(edSign(null, Buffer.from(message), privateKey)) };
  } catch {
    return null;
  }
}

/**
 * Load a PUBLIC Ed25519 key (base64 SPKI DER), e.g. a retired key listed in A25_RECORD_TRUSTED_KEYS.
 * Returns { kid, publicKey } or null for anything that is not an Ed25519 public key. Never throws.
 */
export function loadPublicKey(publicKeyB64) {
  try {
    const raw = String(publicKeyB64 ?? '').trim();
    if (!raw) return null;
    const key = createPublicKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') return null;
    const canonicalB64 = b64(key.export({ format: 'der', type: 'spki' }));
    return { kid: kidOf(canonicalB64), publicKey: canonicalB64 };
  } catch {
    return null;
  }
}

/** Verify an Ed25519 signature with a base64 SPKI public key. Never throws. */
export function verifySig(publicKeyB64, message, sigB64) {
  try {
    const key = createPublicKey({ key: Buffer.from(String(publicKeyB64), 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') return false;
    return edVerify(null, Buffer.from(message), key, Buffer.from(String(sigB64 ?? ''), 'base64'));
  } catch {
    return false;
  }
}

const keyStatement = (siteId, kid, publicKeyB64, at) => JSON.stringify(['a25-key', 1, siteId, kid, publicKeyB64, at]);
const successionStatement = (siteId, fromKid, fromKey, toKid, toKey, at) => JSON.stringify(['a25-succession', 1, siteId, fromKid, fromKey, toKid, toKey, at]);

/** Self-signed key registration (proves possession of the private key). */
export function registerKey(signer, { siteId, at }) {
  return { kid: signer.kid, alg: 'Ed25519', publicKey: signer.publicKeyB64, registeredAt: at, selfSig: signer.sign(keyStatement(siteId, signer.kid, signer.publicKeyB64, at)) };
}

/**
 * Succession: the NEW (current) key names its predecessor. If the previous private key is still
 * available it co-signs the handover (`fromSig`); after a key LOSS it cannot, and the succession is
 * honestly marked as not endorsed by the predecessor.
 */
export function succession(newSigner, prevEntry, { siteId, at, prevSigner = null }) {
  const statement = successionStatement(siteId, prevEntry.kid, prevEntry.publicKey, newSigner.kid, newSigner.publicKeyB64, at);
  return {
    fromKid: prevEntry.kid, toKid: newSigner.kid, at,
    toSig: newSigner.sign(statement),
    fromSig: prevSigner && prevSigner.kid === prevEntry.kid ? prevSigner.sign(statement) : null,
  };
}

/**
 * Resolve which registered keys are trusted, starting ONLY from the anchor public key(s) (the app's
 * current key, or a key fingerprint pinned by an auditor). Returns Map(kid → {publicKey, how}).
 */
export function trustedKeys(registry, successions, { siteId, anchors }) {
  const byKid = new Map((registry ?? []).map((k) => [k.kid, k]));
  const trusted = new Map();
  for (const a of anchors ?? []) {
    if (!a?.publicKey) continue;
    trusted.set(kidOf(a.publicKey), { publicKey: a.publicKey, how: 'anchor', endorsedByPredecessor: null });
  }
  // Walk succession statements backwards from trusted keys (bounded).
  for (let round = 0; round < 10; round++) {
    let grew = false;
    for (const s of successions ?? []) {
      if (!trusted.has(s.toKid) || trusted.has(s.fromKid)) continue;
      const from = byKid.get(s.fromKid);
      const to = trusted.get(s.toKid);
      if (!from || kidOf(from.publicKey) !== s.fromKid) continue;
      const statement = successionStatement(siteId, s.fromKid, from.publicKey, s.toKid, to.publicKey, s.at);
      if (!verifySig(to.publicKey, statement, s.toSig)) continue;
      const endorsed = s.fromSig ? verifySig(from.publicKey, statement, s.fromSig) : false;
      trusted.set(s.fromKid, { publicKey: from.publicKey, how: 'succession', endorsedByPredecessor: endorsed });
      grew = true;
    }
    if (!grew) break;
  }
  return trusted;
}

/** A registry entry's self-signature (possession proof). */
export const keyEntryValid = (k, siteId) => Boolean(k) && kidOf(k.publicKey) === k.kid && verifySig(k.publicKey, keyStatement(siteId, k.kid, k.publicKey, k.registeredAt), k.selfSig);

// ---- records ------------------------------------------------------------------------------------

export const canonicalV3 = (r) => JSON.stringify(['a25-record', LEDGER_VERSION, r.siteId, r.seq, r.prevHash, r.decisionId, r.issueId, r.state, r.conditions ?? [], r.decidedBy, r.decidedAt, r.kid]);

/** Build a signed v3 record (continues the v2/v3 hash chain). */
export function buildRecordV3(signer, { siteId, seq, prevHash, decisionId, issueId, state, conditions = [], decidedBy, decidedAt }) {
  const r = { v: LEDGER_VERSION, siteId, seq, prevHash, decisionId, issueId: String(issueId), state, conditions, decidedBy, decidedAt, kid: signer.kid };
  r.sig = signer.sign(canonicalV3(r));
  r.hash = sha256(`${canonicalV3(r)}|${r.sig}`);
  return r;
}

/** The issue a record belongs to (v2 stored the stable numeric issue id under `issueKey`). */
export const recordIssueId = (r) => String(r?.v === LEDGER_VERSION ? r.issueId : r?.issueKey ?? '');

/** Recompute the record's hash from its content (works for v2 and v3 without any key). */
export function recordHashOk(r) {
  if (r?.v === LEDGER_VERSION) return r.hash === sha256(`${canonicalV3(r)}|${r.sig}`);
  if (r?.v === V2) return r.hash === sha256(`${canonicalV2(r)}|${r.sig}`);
  return false;
}

/**
 * Verify ONE record's signature. Returns null when valid, otherwise a problem code:
 * 'unknown_key' (v3 kid not trusted), 'bad_signature', 'legacy_unverifiable' (v2 without HMAC key),
 * 'bad_hash', 'wrong_site', 'bad_version'.
 */
export function verifyRecordSignature(r, { siteId, keys, hmacKey }) {
  if (!r || (r.v !== LEDGER_VERSION && r.v !== V2)) return 'bad_version';
  if (r.siteId !== siteId) return 'wrong_site';
  if (!recordHashOk(r)) return 'bad_hash';
  if (r.v === LEDGER_VERSION) {
    const k = keys?.get(r.kid);
    if (!k) return 'unknown_key';
    return verifySig(k.publicKey, canonicalV3(r), r.sig) ? null : 'bad_signature';
  }
  if (!hmacKey) return 'legacy_unverifiable';
  return hexEq(r.sig, createHmac('sha256', hmacKey).update(canonicalV2(r)).digest('hex')) ? null : 'bad_signature';
}

// ---- checkpoints --------------------------------------------------------------------------------

const checkpointStatement = (c) => JSON.stringify(['a25-checkpoint', 1, c.siteId, c.seq, c.hash, c.kid, c.at, c.purpose]);

/** Signed statement "the ledger of siteId had head (seq, hash) at time at" (purpose: attestation|export). */
export function signCheckpointV3(signer, { siteId, seq, hash, at, purpose }) {
  const c = { siteId, seq, hash, kid: signer.kid, at, purpose };
  return { ...c, sig: signer.sign(checkpointStatement(c)) };
}
export const checkpointValidV3 = (c, keys) => Boolean(keys?.get(c?.kid)) && verifySig(keys.get(c.kid).publicKey, checkpointStatement(c), c.sig);

// ---- whole ledger -------------------------------------------------------------------------------

/**
 * Verify an ordered list of records (v2 and/or v3) as ONE chain.
 * - sequence must be 1..n, each prevHash = previous hash (seq 1 → genesis(siteId)), no replays;
 * - v3 signatures need a trusted key; v2 signatures are checked with the HMAC key when available;
 * - without the HMAC key, a v2 prefix is accepted ONLY if a trusted checkpoint covers it
 *   (its hash links are then verified up to that signed head);
 * - checkpoints beyond the head (truncation) or with a mismatching hash (rewrite) are errors.
 */
export function verifyLedger(records, { siteId, keys, hmacKey = null, checkpoints = [] }) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(records)) return { valid: false, errors: ['history is not a list'], warnings, head: null, legacy: { count: 0, verifiedBy: 'none' } };
  let prev = genesis(siteId);
  const seen = new Set();
  let legacyUnverified = 0;
  let legacyCount = 0;
  records.forEach((r, i) => {
    const where = `seq ${i + 1}`;
    if (r?.seq !== i + 1) errors.push(`${where}: found seq ${r?.seq} (deleted, inserted or reordered record)`);
    if (r?.prevHash !== prev) errors.push(`${where}: link to the previous record is broken`);
    if (seen.has(r?.decisionId)) errors.push(`${where}: decision appears twice (replayed record)`);
    seen.add(r?.decisionId);
    if (r?.v === V2) legacyCount++;
    const problem = verifyRecordSignature(r, { siteId, keys, hmacKey });
    if (problem === 'legacy_unverifiable') legacyUnverified++;
    else if (problem) errors.push(`${where}: ${problem.replace(/_/g, ' ')}`);
    prev = r?.hash;
  });
  const head = records.length ? { seq: records.at(-1).seq, hash: records.at(-1).hash } : { seq: 0, hash: genesis(siteId) };
  // Checkpoints: valid ones must agree with the history; any beyond the head means truncation.
  const validCps = (checkpoints ?? []).filter((c) => c?.siteId === siteId && checkpointValidV3(c, keys));
  for (const c of validCps) {
    if (c.seq > records.length) errors.push(`checkpoint at seq ${c.seq} is beyond the history head ${records.length} (records were removed)`);
    else if (c.seq > 0 && records[c.seq - 1]?.hash !== c.hash) errors.push(`checkpoint at seq ${c.seq} does not match the history (records were rewritten)`);
  }
  // Legacy prefix without the HMAC key: covered only if a trusted checkpoint attests a head at or after it.
  let legacyVerifiedBy = legacyCount === 0 ? 'n/a' : legacyUnverified === 0 ? 'hmac' : 'none';
  if (legacyUnverified > 0) {
    const lastLegacySeq = Math.max(...records.filter((r) => r?.v === V2).map((r) => r.seq));
    const covering = validCps.some((c) => c.seq >= lastLegacySeq && records[c.seq - 1]?.hash === c.hash);
    if (covering) legacyVerifiedBy = 'checkpoint';
    else errors.push(`${legacyUnverified} legacy (v2) records cannot be verified without the legacy key or a signed checkpoint`);
  }
  if ((checkpoints ?? []).length > validCps.length) warnings.push(`${checkpoints.length - validCps.length} checkpoint(s) ignored (unknown key or invalid signature)`);
  return { valid: errors.length === 0, errors, warnings, head, legacy: { count: legacyCount, verifiedBy: legacyVerifiedBy }, checkpoints: validCps.length };
}

/** A decision row recomputes to the decision id its signed record names (binds every field). */
export function decisionMatchesRecord(row, record, decisionIdOf) {
  const id = decisionIdOf({
    issueId: row.issue_id, seq: Number(row.seq), kind: row.kind, decision: row.decision, rationale: row.rationale, conditions: row.conditions, questions: row.questions,
    decidedBy: row.decided_by, decidedAt: Number(row.decided_at), screeningId: row.screening_id, fp: row.fp, pipelineVersion: row.pipeline_version, outcome: row.outcome,
  });
  if (id !== row.decision_id) return 'row_changed';
  if (!record) return 'not_anchored';
  if (record.decisionId !== row.decision_id || record.state !== row.decision || recordIssueId(record) !== String(row.issue_id)) return 'record_mismatch';
  return null;
}

// ---- archive ------------------------------------------------------------------------------------

/** Stable JSON (sorted object keys) so the digest does not depend on property order. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  // Keys whose value is undefined are skipped exactly like JSON.stringify does, so the digest survives
  // a JSON download/upload round trip.
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const archiveStatement = (siteId, digest, kid) => JSON.stringify(['a25-archive', ARCHIVE_VERSION, siteId, digest, kid]);

/**
 * Build a signed archive. The body is everything needed to restore and verify; the signature covers
 * the SHA-256 of the stable serialisation of the body, so ANY change (added, removed, edited or
 * reordered entries; counts; head) invalidates it.
 */
export function buildArchive(signer, { siteId, createdAt, appVersion, keys, successions, records, checkpoints, decisions, assignments, settings }) {
  const head = records.length ? { seq: records.at(-1).seq, hash: records.at(-1).hash } : { seq: 0, hash: genesis(siteId) };
  const body = {
    format: ARCHIVE_FORMAT, formatVersion: ARCHIVE_VERSION, siteId, createdAt, appVersion,
    keys, successions, records, checkpoints, decisions, assignments, settings, head,
    counts: { records: records.length, decisions: decisions.length, assignments: assignments.length, settings: settings.length },
  };
  const digest = sha256(stableStringify(body));
  return { ...body, digest, signature: { kid: signer.kid, sig: signer.sign(archiveStatement(siteId, digest, signer.kid)) } };
}

const pick = (a) => {
  const { digest, signature, ...body } = a ?? {};
  return { body, digest, signature };
};

/**
 * Verify an archive completely and classify it for restore.
 * @param {object} archive  parsed JSON
 * @param {{siteId:string, anchors:{publicKey:string}[], hmacKey?:string, decisionIdOf:Function}} opts
 *   anchors: the app's current public key and/or a fingerprint-pinned key (never the archive's own claim alone)
 * @returns {{ status: 'complete'|'complete_with_pending'|'invalid', restorable: boolean, errors: string[],
 *            warnings: string[], head, counts, keys, pending: number, trustedKids: string[] }}
 */
export function verifyArchive(archive, { siteId, anchors, hmacKey = null, decisionIdOf }) {
  const errors = [];
  const warnings = [];
  const fail = (msg) => ({ status: 'invalid', restorable: false, errors: [msg], warnings, head: null, counts: null, keys: [], pending: 0, trustedKids: [] });
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)) return fail('not an archive object');
  if (archive.format !== ARCHIVE_FORMAT || archive.formatVersion !== ARCHIVE_VERSION) return fail('unsupported archive format or version');
  if (archive.siteId !== siteId) return fail('archive belongs to a different site (cross-site restore is not allowed)');
  for (const k of ['keys', 'successions', 'records', 'checkpoints', 'decisions', 'assignments', 'settings']) if (!Array.isArray(archive[k])) return fail(`archive field "${k}" is missing or malformed`);

  const { body, digest, signature } = pick(archive);
  if (sha256(stableStringify(body)) !== digest) errors.push('archive digest does not match its content (archive was modified)');
  const registry = archive.keys.filter((k) => keyEntryValid(k, siteId));
  if (registry.length !== archive.keys.length) warnings.push(`${archive.keys.length - registry.length} key entr(ies) ignored (invalid self-signature)`);
  const trusted = trustedKeys(registry, archive.successions, { siteId, anchors });
  if (!trusted.has(signature?.kid)) errors.push('archive is not signed by a trusted key (key not anchored by this app or a pinned fingerprint)');
  else if (!verifySig(trusted.get(signature.kid).publicKey, archiveStatement(siteId, digest, signature.kid), signature.sig)) errors.push('archive signature is invalid');

  const ledger = verifyLedger(archive.records, { siteId, keys: trusted, hmacKey, checkpoints: archive.checkpoints });
  errors.push(...ledger.errors);
  warnings.push(...ledger.warnings);
  const c = archive.counts ?? {};
  if (c.records !== archive.records.length || c.decisions !== archive.decisions.length || c.assignments !== archive.assignments.length || c.settings !== archive.settings.length) errors.push('archive counts do not match its content');
  if (archive.head?.seq !== ledger.head?.seq || archive.head?.hash !== ledger.head?.hash) errors.push('archive head does not match its last record');

  // Every signed record must have its decision row (otherwise the latest decision for an issue could
  // be lost and an OLDER approval resurrected). Rows without a record are "pending anchor".
  const rowsById = new Map(archive.decisions.map((d) => [d.decision_id, d]));
  const recById = new Map(archive.records.map((r) => [r.decisionId, r]));
  for (const r of archive.records) if (!rowsById.has(r.decisionId)) errors.push(`seq ${r.seq}: the decision for this record is missing (cannot be reconstructed)`);
  let pending = 0;
  for (const d of archive.decisions) {
    const problem = decisionMatchesRecord(d, recById.get(d.decision_id), decisionIdOf);
    if (problem === 'not_anchored') pending++;
    else if (problem) errors.push(`decision ${d.issue_id}#${d.seq}: ${problem.replace(/_/g, ' ')}`);
  }
  const perIssue = new Map();
  for (const d of archive.decisions) perIssue.set(`${d.issue_id}#${d.seq}`, (perIssue.get(`${d.issue_id}#${d.seq}`) ?? 0) + 1);
  if ([...perIssue.values()].some((n) => n > 1)) errors.push('duplicate decision sequence for a work item');

  const status = errors.length ? 'invalid' : pending ? 'complete_with_pending' : 'complete';
  return {
    status, restorable: errors.length === 0, errors: errors.slice(0, 20), warnings: warnings.slice(0, 10),
    head: ledger.head, counts: archive.counts, pending, legacy: ledger.legacy,
    keys: registry.map((k) => ({ kid: k.kid, fingerprint: fingerprintOf(k.publicKey), trusted: trusted.has(k.kid), how: trusted.get(k.kid)?.how ?? null, endorsedByPredecessor: trusted.get(k.kid)?.endorsedByPredecessor ?? null })),
    trustedKids: [...trusted.keys()], createdAt: archive.createdAt, digest,
  };
}
