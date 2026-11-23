// Final readiness audit: regression tests for the defects found in the M5 restore and trust paths.
// Synthetic data; keys generated in memory. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { loadSigner, loadPublicKey } from '../src/core/ledger.js';
import { REASONS } from '../src/core/gate.js';
import { copy } from '../frontend/src/shared/copy/en.js';
import { world, decision, REV1, REV2, ADMIN, APPROVE, codeOf, nextRid, newRecordKey, RECORD_KEY } from './world.mjs';

const REJECT = { decision: 'REJECTED', rationale: 'Recording prescription items is not proportionate.' };
const payload = (key) => ({ issue: { key }, transition: { from: { id: '1' }, to: { id: '3' } } });
const gateReason = async (w, key, over) => (await w.gateFor(null, over).validateDetailed(payload(key))).reason;
const publicOf = (privateB64) => loadSigner(privateB64).publicKeyB64;

async function enforce(w) {
  const o = await w.desk(ADMIN).gateOverview(ADMIN);
  await w.desk(ADMIN).setGateMode({ mode: 'enforce', expectedSeq: o.health.mode.seq, requestId: nextRid() }, ADMIN);
}
async function exportText(w, over = {}) {
  const d = w.desk(ADMIN, over);
  const e = await d.exportArchive(ADMIN);
  let text = '';
  for (let i = 0; i < e.chunks; i++) text += (await d.transferChunk({ transferId: e.transferId, idx: i }, ADMIN)).data;
  return text;
}
async function upload(w, text, over = {}) {
  const transferId = randomBytes(16).toString('hex');
  const chunks = Math.ceil(text.length / 100_000);
  for (let i = 0; i < chunks; i++) await w.desk(ADMIN, over).uploadChunk({ transferId, idx: i, data: text.slice(i * 100_000, (i + 1) * 100_000) }, ADMIN);
  return { transferId, chunks };
}
async function history(w) {
  await w.screen(10001);
  await w.screen(10002);
  await enforce(w);
  await w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 0, requestId: nextRid() }, REV1);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  await decision(w, REV1, 'HR-7', APPROVE);
  w.advance(1000);
  await decision(w, REV2, 'HR-7', REJECT);
}

// ---------------------------------------------------------------- retired public keys as anchors
test('after a key rotation AND a reinstall, an archive signed by the retired key is restorable only via its PUBLIC key in A25_RECORD_TRUSTED_KEYS', async () => {
  const w = await world();
  await history(w);
  const text = await exportText(w); // signed by key A
  // Planned rotation A → B with handover, then A's private key is retired (removed from the environment).
  const B = newRecordKey();
  await w.ledgerFor({ settings: { ...w.settings, recordKey: B, recordKeyPrevious: RECORD_KEY } }).ensureKeys();
  const onlyB = { ...w.settings, recordKey: B, recordKeyPrevious: null };
  w.fake.wipe(); // uninstall + reinstall: the succession A → B was in the wiped store

  // Before the fix this was the only possible outcome: the archive could never be restored.
  const up = await upload(w, text, { settings: onlyB });
  const refused = await w.desk(ADMIN, { settings: onlyB }).beginRestore(up, ADMIN);
  assert.equal(refused.token, null);
  assert.ok(refused.report.errors.some((e) => /not signed by a trusted key/.test(e)));

  // The vendor lists A's PUBLIC key (no secret) as a retired anchor.
  const withRetired = { ...onlyB, recordTrustedKeys: [publicOf(RECORD_KEY)] };
  const b = await w.desk(ADMIN, { settings: withRetired }).beginRestore(up, ADMIN);
  assert.equal(b.report.status, 'complete');
  const r = await w.desk(ADMIN, { settings: withRetired }).confirmRestore({ ...up, token: b.token }, ADMIN);
  assert.equal(r.outcome, 'restored_verified');
  await w.screen(10001);
  await w.screen(10002);
  assert.equal(await gateReason(w, 'SHOP-1', { settings: withRetired }), 'ALLOW_APPROVED');
  assert.equal(await gateReason(w, 'HR-7', { settings: withRetired }), 'REJECTED');
  const st = await w.desk(ADMIN, { settings: withRetired }).recordStatus(ADMIN);
  assert.deepEqual(st.retiredKeys.map((k) => k.kid), [loadSigner(RECORD_KEY).kid]);
  assert.equal(st.keys.find((k) => k.kid === loadSigner(RECORD_KEY).kid).trusted, true);
  // Without the anchor, the restored approvals are (honestly) untrusted, never silently accepted.
  assert.equal(await gateReason(w, 'SHOP-1', { settings: onlyB }), 'RECORD_KEY_UNTRUSTED');
});

test('retired-key anchors never trust an attacker: malformed, private, RSA or unlisted keys are ignored', async () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  assert.equal(loadPublicKey('not base64 at all'), null);
  assert.equal(loadPublicKey(RECORD_KEY), null); // a PRIVATE key is not accepted as a public anchor
  assert.equal(loadPublicKey(rsa), null);
  assert.equal(loadPublicKey(publicOf(RECORD_KEY)).kid, loadSigner(RECORD_KEY).kid);

  // An archive forged with the attacker's own key stays unrestorable even with retired anchors configured.
  const attacker = newRecordKey();
  const w = await world({ recordKey: attacker });
  await history(w);
  const forged = await exportText(w);
  const w2 = await world();
  const settings = { ...w2.settings, recordTrustedKeys: ['garbage', RECORD_KEY, rsa, publicOf(newRecordKey())] };
  const up = await upload(w2, forged, { settings });
  const b = await w2.desk(ADMIN, { settings }).beginRestore(up, ADMIN);
  assert.equal(b.token, null);
  assert.equal(b.report.status, 'invalid');
});

// ---------------------------------------------------------------- restore lock
test('a rejected confirm after a partial restore neither reopens the gate nor blocks resuming', async () => {
  const w = await world();
  await history(w);
  const text = await exportText(w);
  w.fake.wipe();
  w.fake.failures.restoreChainAfter = 1;
  const up = await upload(w, text);
  const b1 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...up, token: b1.token }, ADMIN), codeOf('UPSTREAM_UNAVAILABLE'));
  w.fake.failures.restoreChainAfter = null;
  await w.screen(10001);
  // A new verification, then a confirm with a DIFFERENT (tampered) upload: rejected, nothing written.
  const b2 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  const tampered = await upload(w, text.replace('Proportionate', 'Proportionatf'));
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...tampered, token: b2.token }, ADMIN), codeOf('STALE_EVIDENCE'));
  assert.equal(w.fake.lev.at(-1).type, 'restore_rejected');
  // Before the fix, the rejection was the "latest restore" and the gate reopened over a partial record.
  assert.equal(await gateReason(w, 'SHOP-1'), 'RESTORE_INCOMPLETE');
  const b3 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  assert.equal(b3.resume, true);
  const r = await w.desk(ADMIN).confirmRestore({ ...up, token: b3.token }, ADMIN);
  assert.equal(r.outcome, 'restored_verified');
});

test('a restore whose invocation is killed mid-write keeps the gate closed, refuses new decisions and signatures, and resumes after a minute', async () => {
  const w = await world();
  await history(w);
  const text = await exportText(w);
  w.fake.wipe();
  await w.screen(10001);
  const up = await upload(w, text);
  const b = await w.desk(ADMIN).beginRestore(up, ADMIN);
  w.fake.failures.restoreHang = true; // the chain phase never returns: like Forge killing the function at 25 s
  w.desk(ADMIN).confirmRestore({ ...up, token: b.token }, ADMIN).catch(() => undefined);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(w.fake.lev.filter((e) => e.type === 'restore').at(-1).outcome, 'in_progress');
  assert.equal(w.fake.sessions.every((s) => s.used_at !== null), true); // the session is consumed: only the marker protects now
  assert.equal(await gateReason(w, 'SHOP-1'), 'RESTORE_INCOMPLETE');
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE), codeOf('CONFLICT'));
  await assert.rejects(w.desk(REV1).assign({ issueKey: 'SHOP-1', assigneeId: REV2, expectedSeq: 1, requestId: nextRid() }, REV1), codeOf('CONFLICT'));
  assert.equal(await w.reviewFor(null).repairChain(), 0);
  assert.equal((await w.ledgerFor().anchor(w.fake.dec[0])).reason, 'recovery_in_progress');
  assert.equal((await w.desk(ADMIN).recordStatus(ADMIN)).restoreIncomplete, true);
  // A second verification while it may still be running is refused; after a minute it is resumable.
  await assert.rejects(w.desk(ADMIN).beginRestore(up, ADMIN), codeOf('CONFLICT'));
  w.advance(61_000);
  w.fake.failures.restoreHang = false;
  const b2 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  assert.equal(b2.resume, true);
  const r = await w.desk(ADMIN).confirmRestore({ ...up, token: b2.token }, ADMIN);
  assert.equal(r.outcome, 'restored_verified');
  await w.screen(10001);
  assert.equal(await gateReason(w, 'SHOP-1'), 'ALLOW_APPROVED');
});

test('restore writes are batched (one statement per table per 50 rows), not one statement per row', async () => {
  const w = await world();
  await history(w);
  const text = await exportText(w);
  const archive = JSON.parse(text);
  const rows = archive.decisions.length + archive.records.length + archive.assignments.length + archive.settings.length;
  w.fake.wipe();
  const before = w.fake.restoreStatements.n;
  const up = await upload(w, text);
  const b = await w.desk(ADMIN).beginRestore(up, ADMIN);
  await w.desk(ADMIN).confirmRestore({ ...up, token: b.token }, ADMIN);
  const statements = w.fake.restoreStatements.n - before;
  assert.equal(statements, 4);
  assert.ok(rows > statements);
});

// ---------------------------------------------------------------- honest gate reasons
test('a pre-M5 (HMAC) approval without its legacy key is reported as unverifiable, not as "signing not configured"', async () => {
  const w = await world({ recordKey: null });
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  const settings = { ...w.settings, recordKey: RECORD_KEY, signingKey: null };
  await w.ledgerFor({ settings }).ensureKeys();
  assert.equal(await gateReason(w, 'SHOP-1', { settings }), 'RECORD_LEGACY_UNVERIFIABLE');
});

test('every gate reason has a user-facing label (the panel and gate log never show a raw code)', () => {
  const missing = Object.keys(REASONS).filter((r) => !copy.gate.reasons[r]);
  assert.deepEqual(missing, []);
});
