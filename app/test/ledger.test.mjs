// M5 ledger tests (pure): Ed25519 records, key trust, mixed v2/v3 chains, checkpoints, archives and
// the independent offline verifier. Keys are generated in memory per run. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import {
  loadSigner, kidOf, fingerprintOf, verifySig, registerKey, succession, trustedKeys, keyEntryValid, buildRecordV3, verifyRecordSignature,
  recordHashOk, signCheckpointV3, verifyLedger, buildArchive, verifyArchive, stableStringify, genesis, recordIssueId,
} from '../src/core/ledger.js';
import { buildRecord } from '../src/core/chain-core.js';
import { decisionIdOf } from '../src/core/review.js';
import { verifyArchiveText } from '../scripts/verify-archive.mjs';

const SITE = 'site-test';
const HMAC = 'legacy-hmac-key-0123456789abcdef';
const newKey = () => generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const A = loadSigner(newKey());
const B = loadSigner(newKey());
const EVIL = loadSigner(newKey());
const keysOf = (...signers) => new Map(signers.map((s) => [s.kid, { publicKey: s.publicKeyB64 }]));
const AT = '2026-11-23T10:00:00.000Z';

function decisionRow(issueId, seq, decision = 'APPROVED', over = {}) {
  const row = { issue_id: String(issueId), seq, kind: 'human', decision, rationale: 'Synthetic rationale text.', conditions: [], questions: [], decided_by: 'acc-rev-1', decided_at: 1_800_000_000_000 + seq, screening_id: 's'.repeat(64), fp: 'f'.repeat(64), pipeline_version: 'p', outcome: 'REVIEW_REQUIRED', request_id: `req-${issueId}-${seq}`, signal_set: {}, detail: null, ...over };
  row.decision_id = decisionIdOf({ issueId: row.issue_id, seq: row.seq, kind: row.kind, decision: row.decision, rationale: row.rationale, conditions: row.conditions, questions: row.questions, decidedBy: row.decided_by, decidedAt: row.decided_at, screeningId: row.screening_id, fp: row.fp, pipelineVersion: row.pipeline_version, outcome: row.outcome });
  return row;
}
/** Build a chain: entries [{row, v: 2|3, signer}] */
function chainOf(entries) {
  const records = [];
  let prev = genesis(SITE);
  entries.forEach(({ row, v = 3, signer = A }, i) => {
    const base = { siteId: SITE, seq: i + 1, prevHash: prev, decisionId: row.decision_id, state: row.decision, conditions: row.conditions, decidedBy: row.decided_by, decidedAt: new Date(row.decided_at).toISOString() };
    const r = v === 3 ? buildRecordV3(signer, { ...base, issueId: row.issue_id }) : buildRecord(HMAC, { ...base, issueKey: row.issue_id });
    records.push(r);
    prev = r.hash;
  });
  return records;
}

// ---------------------------------------------------------------- keys
test('keys: loadSigner accepts only Ed25519 PKCS#8; kid and fingerprint derive from the public key', () => {
  assert.equal(A.kid, kidOf(A.publicKeyB64));
  assert.match(A.kid, /^k[0-9a-f]{16}$/);
  assert.equal(fingerprintOf(A.publicKeyB64).replace(/ /g, ''), createHash('sha256').update(Buffer.from(A.publicKeyB64, 'base64')).digest('hex'));
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  for (const bad of [null, '', 'not-base64!', rsa, Buffer.from('x').toString('base64')]) assert.equal(loadSigner(bad), null);
  assert.equal(verifySig(A.publicKeyB64, 'm', A.sign('m')), true);
  assert.equal(verifySig(A.publicKeyB64, 'm', B.sign('m')), false);
  assert.equal(verifySig('garbage', 'm', A.sign('m')), false);
});

test('key trust comes only from anchors and signed successions; database-inserted keys are not trusted', () => {
  const regA = registerKey(A, { siteId: SITE, at: AT });
  const regB = registerKey(B, { siteId: SITE, at: AT });
  const regEvil = registerKey(EVIL, { siteId: SITE, at: AT });
  assert.ok(keyEntryValid(regA, SITE) && !keyEntryValid({ ...regA, publicKey: B.publicKeyB64 }, SITE) && !keyEntryValid(regA, 'other-site'));
  // Anchor B only: A trusted after an endorsed succession A → B.
  const s = succession(B, regA, { siteId: SITE, at: AT, prevSigner: A });
  let t = trustedKeys([regA, regB, regEvil], [s], { siteId: SITE, anchors: [{ publicKey: B.publicKeyB64 }] });
  assert.deepEqual([...t.keys()].sort(), [A.kid, B.kid].sort());
  assert.equal(t.get(A.kid).endorsedByPredecessor, true);
  assert.equal(t.has(EVIL.kid), false); // a key merely present in the registry is never trusted
  // Key loss: succession signed only by the new key → trusted but marked not co-signed.
  t = trustedKeys([regA, regB], [succession(B, regA, { siteId: SITE, at: AT })], { siteId: SITE, anchors: [{ publicKey: B.publicKeyB64 }] });
  assert.equal(t.get(A.kid).endorsedByPredecessor, false);
  // A succession forged by an untrusted key (EVIL "succeeds" A) does nothing for anchor B.
  t = trustedKeys([regA, regB, regEvil], [succession(EVIL, regA, { siteId: SITE, at: AT })], { siteId: SITE, anchors: [{ publicKey: B.publicKeyB64 }] });
  assert.deepEqual([...t.keys()], [B.kid]);
  // A succession statement edited after signing is ignored.
  t = trustedKeys([regA, regB], [{ ...s, at: '2030-01-01T00:00:00.000Z' }], { siteId: SITE, anchors: [{ publicKey: B.publicKeyB64 }] });
  assert.equal(t.has(A.kid), false);
  // Two rotations A → B → C, anchor C: all trusted.
  const C = loadSigner(newKey());
  const regC = registerKey(C, { siteId: SITE, at: AT });
  t = trustedKeys([regA, regB, regC], [s, succession(C, regB, { siteId: SITE, at: AT, prevSigner: B })], { siteId: SITE, anchors: [{ publicKey: C.publicKeyB64 }] });
  assert.deepEqual([...t.keys()].sort(), [A.kid, B.kid, C.kid].sort());
});

// ---------------------------------------------------------------- records
test('v3 records: any field change, another key, or another site fails; hash is recomputable without a key', () => {
  const row = decisionRow(10001, 1);
  const [r] = chainOf([{ row }]);
  const K = keysOf(A);
  assert.equal(verifyRecordSignature(r, { siteId: SITE, keys: K }), null);
  assert.ok(recordHashOk(r));
  assert.equal(recordIssueId(r), '10001');
  for (const [k, v] of [['state', 'REJECTED'], ['decidedBy', 'acc-x'], ['conditions', ['x']], ['seq', 2], ['decisionId', 'x'], ['issueId', '1'], ['kid', B.kid]]) {
    assert.notEqual(verifyRecordSignature({ ...r, [k]: v }, { siteId: SITE, keys: keysOf(A, B) }), null, k);
  }
  // Re-signed with another key and re-hashed: unknown key (not trusted) or bad signature (if trusted).
  const forged = buildRecordV3(EVIL, { siteId: SITE, seq: 1, prevHash: genesis(SITE), decisionId: row.decision_id, issueId: '10001', state: 'APPROVED', conditions: [], decidedBy: 'acc-rev-1', decidedAt: AT });
  assert.equal(verifyRecordSignature(forged, { siteId: SITE, keys: K }), 'unknown_key');
  assert.equal(verifyRecordSignature({ ...forged, kid: A.kid }, { siteId: SITE, keys: K }), 'bad_hash');
  assert.equal(verifyRecordSignature(r, { siteId: 'other-site', keys: K }), 'wrong_site');
  assert.equal(verifyRecordSignature({ ...r, v: 9 }, { siteId: SITE, keys: K }), 'bad_version');
});

test('ledger: mixed legacy (v2) and v3 chain verifies with the legacy key, or without it through a signed attestation', () => {
  const rows = [decisionRow(1, 1), decisionRow(2, 1), decisionRow(1, 2, 'REJECTED'), decisionRow(3, 1)];
  const records = chainOf([{ row: rows[0], v: 2 }, { row: rows[1], v: 2 }, { row: rows[2] }, { row: rows[3] }]);
  const K = keysOf(A);
  assert.equal(verifyLedger(records, { siteId: SITE, keys: K, hmacKey: HMAC }).valid, true);
  // An auditor without the legacy key: invalid until an attestation over the legacy head exists.
  let v = verifyLedger(records, { siteId: SITE, keys: K });
  assert.equal(v.valid, false);
  const att = signCheckpointV3(A, { siteId: SITE, seq: 2, hash: records[1].hash, at: AT, purpose: 'attestation' });
  v = verifyLedger(records, { siteId: SITE, keys: K, checkpoints: [att] });
  assert.deepEqual([v.valid, v.legacy], [true, { count: 2, verifiedBy: 'checkpoint' }]);
  // A forged legacy record (no HMAC key to re-sign it) breaks the hash links the attestation covers.
  const tampered = records.map((r, i) => (i === 0 ? { ...r, state: 'APPROVED_WITH_CONDITIONS' } : r));
  assert.equal(verifyLedger(tampered, { siteId: SITE, keys: K, checkpoints: [att] }).valid, false);
});

test('ledger: deletion, reordering, replay, truncation and rewrite are detected', () => {
  const rows = [decisionRow(1, 1), decisionRow(2, 1), decisionRow(1, 2, 'REJECTED')];
  const records = chainOf(rows.map((row) => ({ row })));
  const K = keysOf(A);
  const cp = signCheckpointV3(A, { siteId: SITE, seq: 3, hash: records[2].hash, at: AT, purpose: 'export' });
  assert.equal(verifyLedger(records, { siteId: SITE, keys: K, checkpoints: [cp] }).valid, true);
  assert.equal(verifyLedger([records[0], records[2]], { siteId: SITE, keys: K }).valid, false); // middle deletion
  assert.equal(verifyLedger([records[1], records[0], records[2]], { siteId: SITE, keys: K }).valid, false); // reorder
  assert.equal(verifyLedger([...records, records[0]], { siteId: SITE, keys: K }).valid, false); // replay
  // Tail truncation that would resurrect the old APPROVED for issue 1: caught by the signed checkpoint.
  const trunc = verifyLedger(records.slice(0, 2), { siteId: SITE, keys: K, checkpoints: [cp] });
  assert.equal(trunc.valid, false);
  assert.match(trunc.errors.join(' '), /beyond the history head/);
  // A checkpoint from an untrusted key is ignored (warned), not obeyed.
  const evilCp = signCheckpointV3(EVIL, { siteId: SITE, seq: 1, hash: 'x'.repeat(64), at: AT, purpose: 'export' });
  const w = verifyLedger(records, { siteId: SITE, keys: K, checkpoints: [evilCp] });
  assert.deepEqual([w.valid, w.warnings.length], [true, 1]);
  assert.equal(verifyLedger('nope', { siteId: SITE, keys: K }).valid, false);
});

// ---------------------------------------------------------------- archive
function archiveOf({ signer = A, rows, records, extraRows = [], keys = [registerKey(A, { siteId: SITE, at: AT })], successions = [], checkpoints = [] }) {
  return buildArchive(signer, { siteId: SITE, createdAt: AT, appVersion: '0.5.0', keys, successions, records, checkpoints, decisions: [...rows, ...extraRows], assignments: [{ issue_id: '1', seq: 1, assignee: 'acc-rev-1', assigned_by: 'acc-rev-2', assigned_at: 5, request_id: 'r-a-1' }], settings: [{ setting: 'gate.mode', seq: 1, value: 'enforce', changed_by: 'acc-admin', changed_at: 6, request_id: 'r-s-1', note: null }] });
}
const ANCHOR_A = { siteId: SITE, anchors: [{ publicKey: A.publicKeyB64 }], decisionIdOf };

test('archive: complete archives verify after a JSON round trip; pending (unanchored) decisions are reported', () => {
  const rows = [decisionRow(1, 1), decisionRow(2, 1), decisionRow(1, 2, 'REJECTED')];
  const records = chainOf(rows.map((row) => ({ row })));
  const arch = JSON.parse(JSON.stringify(archiveOf({ rows, records })));
  const r = verifyArchive(arch, ANCHOR_A);
  assert.deepEqual([r.status, r.restorable, r.head.seq, r.pending], ['complete', true, 3, 0]);
  const withPending = verifyArchive(JSON.parse(JSON.stringify(archiveOf({ rows, records, extraRows: [decisionRow(4, 1)] }))), ANCHOR_A);
  assert.deepEqual([withPending.status, withPending.pending, withPending.restorable], ['complete_with_pending', 1, true]);
  assert.equal(stableStringify({ b: 1, a: [1, { d: undefined, c: 2 }] }), '{"a":[1,{"c":2}],"b":1}');
});

test('archive: every kind of tampering, an attacker-signed archive and cross-site restore are refused', () => {
  const rows = [decisionRow(1, 1), decisionRow(2, 1), decisionRow(1, 2, 'REJECTED')];
  const records = chainOf(rows.map((row) => ({ row })));
  const good = archiveOf({ rows, records });
  const mutate = (fn) => {
    const a = JSON.parse(JSON.stringify(good));
    fn(a);
    return verifyArchive(a, ANCHOR_A);
  };
  const cases = {
    'decision row edited': (a) => { a.decisions[2].decision = 'APPROVED'; },
    'rationale edited': (a) => { a.decisions[0].rationale = 'Changed later.'; },
    'record removed': (a) => { a.records.pop(); },
    'decision removed': (a) => { a.decisions.pop(); },
    'records reordered': (a) => { a.records.reverse(); },
    'counts changed': (a) => { a.counts.decisions = 99; },
    'signature changed': (a) => { a.signature.sig = B.sign('x'); },
    'assignment injected': (a) => { a.assignments.push({ issue_id: '9', seq: 1, assignee: 'acc-evil', assigned_by: 'acc-evil', assigned_at: 1, request_id: 'r-evil' }); },
    'gate mode changed': (a) => { a.settings[0].value = 'monitor'; },
    'site changed': (a) => { a.siteId = 'other-site'; },
    'format changed': (a) => { a.formatVersion = 2; },
    'field missing': (a) => { delete a.records; },
  };
  for (const [name, fn] of Object.entries(cases)) assert.equal(mutate(fn).restorable, false, name);
  // An attacker rebuilds the whole archive (rows changed, everything re-signed) with their own key.
  const evilRows = rows.map((r) => (r.decision === 'REJECTED' ? decisionRow(1, 2, 'APPROVED') : r));
  const evilArchive = archiveOf({ signer: EVIL, rows: evilRows, records: chainOf(evilRows.map((row) => ({ row, signer: EVIL }))), keys: [registerKey(EVIL, { siteId: SITE, at: AT })] });
  const er = verifyArchive(evilArchive, ANCHOR_A);
  assert.equal(er.restorable, false);
  assert.match(er.errors.join(' '), /not signed by a trusted key/);
  assert.equal(verifyArchive(null, ANCHOR_A).restorable, false);
  assert.equal(verifyArchive([], ANCHOR_A).restorable, false);
});

test('archive: a record whose decision row is missing cannot be reconstructed (no resurrection of older approvals)', () => {
  const rows = [decisionRow(1, 1), decisionRow(1, 2, 'REJECTED')];
  const records = chainOf(rows.map((row) => ({ row })));
  // Exported inconsistently: the REJECTED row is missing although its signed record exists.
  const a = archiveOf({ rows: [rows[0]], records });
  const r = verifyArchive(a, ANCHOR_A);
  assert.equal(r.restorable, false);
  assert.match(r.errors.join(' '), /cannot be reconstructed/);
});

test('independent verifier: pinned fingerprint, legacy prefix without the legacy key, rotation history', () => {
  // Legacy prefix + v3 tail, attested; key rotated A → B (endorsed); archive signed by B.
  const rows = [decisionRow(1, 1), decisionRow(2, 1), decisionRow(1, 2, 'REJECTED')];
  const records = chainOf([{ row: rows[0], v: 2 }, { row: rows[1] }, { row: rows[2], signer: B }]);
  const att = signCheckpointV3(A, { siteId: SITE, seq: 1, hash: records[0].hash, at: AT, purpose: 'attestation' });
  const regA = registerKey(A, { siteId: SITE, at: AT });
  const regB = registerKey(B, { siteId: SITE, at: AT });
  const arch = archiveOf({ signer: B, rows, records, keys: [regA, regB], successions: [succession(B, regA, { siteId: SITE, at: AT, prevSigner: A })], checkpoints: [att] });
  const text = JSON.stringify(arch);
  const pinned = verifyArchiveText(text, { fingerprint: fingerprintOf(B.publicKeyB64) });
  assert.equal(pinned.ok, true, pinned.lines.join('\n'));
  assert.ok(pinned.lines.some((l) => /Legacy \(HMAC\) records: 1, verified by checkpoint/.test(l)));
  assert.ok(pinned.lines.some((l) => /handover co-signed/.test(l)));
  // Wrong pin: refused. No pin: still checks consistency, with a loud warning.
  assert.equal(verifyArchiveText(text, { fingerprint: fingerprintOf(EVIL.publicKeyB64) }).ok, false);
  const unpinned = verifyArchiveText(text, {});
  assert.equal(unpinned.ok, true);
  assert.match(unpinned.lines[0], /WARNING: no --fingerprint/);
  assert.equal(verifyArchiveText('{not json', {}).ok, false);
  assert.equal(verifyArchiveText(text.replace('"REJECTED"', '"APPROVED"'), { fingerprint: fingerprintOf(B.publicKeyB64) }).ok, false);
});
