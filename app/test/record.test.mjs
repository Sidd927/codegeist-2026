// M5 RECORD & RECOVERY integration tests: real screening, review, desk, gate and ledger services over
// in-memory repositories (INSERT IGNORE semantics). Synthetic data; keys generated in memory. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../src/backend/lib/config.js';
import { randomBytes } from 'node:crypto';
import { fingerprintOf, loadSigner } from '../src/core/ledger.js';
import { verifyArchiveText } from '../scripts/verify-archive.mjs';
import { world, decision, adf, REV1, REV2, ADMIN, OUTSIDER, APPROVE, codeOf, nextRid, newRecordKey, RECORD_KEY } from './world.mjs';

const REJECT = { decision: 'REJECTED', rationale: 'Recording prescription items is not proportionate.' };
const payload = (key) => ({ issue: { key }, transition: { from: { id: '1' }, to: { id: '3' } } });
const gateReason = async (w, key, over) => (await w.gateFor(null, over).validateDetailed(payload(key))).reason;

async function enforce(w) {
  const o = await w.desk(ADMIN).gateOverview(ADMIN);
  await w.desk(ADMIN).setGateMode({ mode: 'enforce', expectedSeq: o.health.mode.seq, requestId: nextRid() }, ADMIN);
}
/** Export through the desk exactly as the UI does (chunked), returning the archive text. */
async function exportText(w, actor = ADMIN, over = {}) {
  const d = w.desk(actor, over);
  const e = await d.exportArchive(actor);
  let text = '';
  for (let i = 0; i < e.chunks; i++) text += (await d.transferChunk({ transferId: e.transferId, idx: i }, actor)).data;
  return { text, meta: e };
}
/** Upload in 100k-character chunks exactly as the UI does. */
async function upload(w, text, actor = ADMIN, chunkSize = 100_000) {
  const transferId = randomBytes(16).toString('hex');
  const chunks = Math.ceil(text.length / chunkSize);
  for (let i = 0; i < chunks; i++) await w.desk(actor).uploadChunk({ transferId, idx: i, data: text.slice(i * chunkSize, (i + 1) * chunkSize) }, actor);
  return { transferId, chunks };
}
async function restore(w, text, actor = ADMIN, over = {}) {
  const up = await upload(w, text, actor);
  const begin = await w.desk(actor, over).beginRestore(up, actor);
  if (!begin.token) return { begin, result: null };
  const result = await w.desk(actor, over).confirmRestore({ ...up, token: begin.token }, actor);
  return { begin, result, up };
}

/** A small history: SHOP-1 approved, HR-7 approved then rejected, an assignment and gate=enforce. */
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

// ---------------------------------------------------------------- normal operation
test('normal operation: decisions are Ed25519-signed records; the ledger verifies and the gate trusts them', async () => {
  const w = await world();
  await history(w);
  const recs = w.fake.chn.map((c) => JSON.parse(c.record));
  assert.ok(recs.every((r) => r.v === 3 && r.kid === loadSigner(RECORD_KEY).kid));
  assert.equal(w.fake.keys.length, 1); // the current public key registered itself (self-signed)
  const v = await w.desk(ADMIN).verifyLedger(ADMIN);
  assert.deepEqual([v.status, v.signing, v.chainLength], ['verified', 'v3', 3]);
  assert.equal(await gateReason(w, 'SHOP-1'), 'ALLOW_APPROVED');
  assert.equal(await gateReason(w, 'HR-7'), 'REJECTED');
  assert.equal(w.fake.lev.at(-1).type, 'verify'); // verification is recorded
});

test('upgrade from legacy HMAC records: history is attested once, new records continue the same chain', async () => {
  const w = await world({ recordKey: null }); // pre-M5 deployment: legacy v2 records
  await w.screen(10001);
  await enforce(w);
  await decision(w, REV1, 'SHOP-1', APPROVE);
  assert.equal(JSON.parse(w.fake.chn[0].record).v, 2);
  // Deploy M5 with a record key: same data, new settings.
  const settings = { ...w.settings, recordKey: RECORD_KEY };
  await w.ledgerFor({ settings }).ensureKeys();
  assert.equal(w.fake.cps.filter((c) => c.purpose === 'attestation').length, 1);
  await w.screen(10002);
  await decision(w, REV1, 'HR-7', REJECT);
  // That decision was anchored by the world's default ledger (legacy); anchor a new one through the M5 ledger:
  const d2 = w.desk(REV1, { settings });
  const ws = await d2.workspace('HR-7', REV1);
  await d2.decide({ issueKey: 'HR-7', input: APPROVE, ...ws.review.binding, expectedSeq: ws.review.latestSeq, requestId: nextRid() }, REV1);
  const last = JSON.parse(w.fake.chn.at(-1).record);
  assert.deepEqual([last.v, last.prevHash], [3, JSON.parse(w.fake.chn.at(-2).record).hash]);
  assert.equal((await w.desk(ADMIN, { settings }).verifyLedger(ADMIN)).status, 'verified');
  // Old (v2) approval still enforced correctly.
  assert.equal(await gateReason(w, 'SHOP-1', { settings }), 'ALLOW_APPROVED');
  // An auditor WITHOUT the legacy key verifies the export through the attestation.
  const { text } = await exportText(w, ADMIN, { settings });
  const out = verifyArchiveText(text, { fingerprint: fingerprintOf(loadSigner(RECORD_KEY).publicKeyB64) });
  assert.equal(out.ok, true, out.lines.join('\n'));
  assert.ok(out.lines.some((l) => /verified by checkpoint/.test(l)));
});

// ---------------------------------------------------------------- export, uninstall, restore
test('export → uninstall (storage wiped) → reinstall → verified restore → re-check → gate allows again; the rejection is not resurrected', async () => {
  const w = await world();
  await history(w);
  const { text, meta } = await exportText(w);
  assert.equal(meta.counts.records, 3);
  // Independent verification of the export (no secrets).
  assert.equal(verifyArchiveText(text, { fingerprint: fingerprintOf(loadSigner(RECORD_KEY).publicKeyB64) }).ok, true);

  w.fake.wipe(); // uninstall + reinstall: Forge storage gone, environment variables (keys) survive
  assert.equal(await gateReason(w, 'SHOP-1'), 'NOT_SCREENED'); // fails closed before recovery
  const { begin, result } = await restore(w, text);
  assert.deepEqual([begin.report.status, result.outcome, result.counts.records, result.counts.decisions, result.counts.assignments], ['complete', 'restored_verified', 3, 3, 1]);
  assert.deepEqual(w.rescreened.sort(), ['10001', '10002']);
  // Until each work item is re-checked, the gate stays closed.
  assert.equal(await gateReason(w, 'SHOP-1'), 'NOT_SCREENED');
  await w.screen(10001);
  await w.screen(10002);
  assert.equal(await gateReason(w, 'SHOP-1'), 'ALLOW_APPROVED');
  assert.equal(await gateReason(w, 'HR-7'), 'REJECTED'); // the older APPROVED is not resurrected
  assert.equal((await w.desk(ADMIN).verifyLedger(ADMIN)).status, 'verified');
  // The restored settings history includes the audited enforce switch.
  assert.equal((await w.desk(ADMIN).gateOverview(ADMIN)).health.mode.mode, 'enforce');
  // History continues: a new decision links to the restored head.
  await decision(w, REV1, 'HR-7', APPROVE);
  assert.equal(JSON.parse(w.fake.chn.at(-1).record).prevHash, JSON.parse(w.fake.chn.at(-2).record).hash);
});

test('text edited while the app was uninstalled: after restore the approval is invalidated, not silently reused', async () => {
  const w = await world();
  await history(w);
  const { text } = await exportText(w);
  w.fake.wipe();
  w.issues[10001].description = adf('Record checkout sessions and segment shoppers who abandon carts containing prescription items. Send shopper email addresses to Twilio.');
  await restore(w, text);
  await w.screen(10001);
  assert.equal(await gateReason(w, 'SHOP-1'), 'APPROVAL_INVALIDATED');
});

test('restore is refused into a non-empty record, for non-admins, and for tampered, foreign-site or attacker-signed archives', async () => {
  const w = await world();
  await history(w);
  const { text } = await exportText(w);
  // Not empty.
  await assert.rejects(restore(w, text), codeOf('CONFLICT'));
  // Non-admin (even a reviewer).
  await assert.rejects(upload(w, text, REV1), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(REV1).exportArchive(REV1), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(OUTSIDER).recordStatus(OUTSIDER), codeOf('NOT_AUTHORISED'));
  w.fake.wipe();
  // Tampered: the rejection rewritten as approval.
  const tampered = text.replace('"decision":"REJECTED"', '"decision":"APPROVED"');
  assert.notEqual(tampered, text);
  let r = await restore(w, tampered);
  assert.deepEqual([r.begin.report.status, r.begin.token, r.result], ['invalid', null, null]);
  assert.equal(w.fake.dec.length, 0);
  // Another site's archive (same key material, different site id).
  const other = await world({ siteId: 'site-other' });
  await other.screen(10001);
  await decision(other, REV1, 'SHOP-1', APPROVE);
  const { text: foreign } = await exportText(other);
  r = await restore(w, foreign);
  assert.equal(r.begin.report.restorable, false);
  assert.match(r.begin.report.errors[0], /different site/);
  // An archive from a deployment with a different (untrusted) key.
  const rogue = await world({ recordKey: newRecordKey() });
  await rogue.screen(10001);
  await decision(rogue, REV1, 'SHOP-1', APPROVE);
  r = await restore(w, (await exportText(rogue)).text);
  assert.equal(r.begin.report.restorable, false);
  assert.equal(w.fake.dec.length + w.fake.chn.length, 0);
  // Not JSON at all.
  const up = await upload(w, '{"format":');
  await assert.rejects(w.desk(ADMIN).beginRestore(up, ADMIN), codeOf('INVALID_INPUT'));
});

test('restore sessions are single-use, short-lived and bound to the verifying admin; a swapped archive is refused', async () => {
  const w = await world();
  w.admins.push('acc-admin-2');
  await history(w);
  const { text } = await exportText(w);
  w.fake.wipe();
  const up = await upload(w, text);
  const begin = await w.desk(ADMIN).beginRestore(up, ADMIN);
  // Another admin cannot use the token (nor this admin's upload).
  await assert.rejects(w.desk('acc-admin-2').confirmRestore({ ...up, token: begin.token }, 'acc-admin-2'), (e) => ['CONFLICT', 'INVALID_INPUT'].includes(e.code));
  // Expired after 10 minutes.
  w.advance(11 * 60 * 1000);
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...up, token: begin.token }, ADMIN), codeOf('CONFLICT'));
  // Verify again, then swap in a different (valid-looking) upload before confirming.
  const b2 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  const swapped = text.replace(`"appVersion":"${APP_VERSION}"`, '"appVersion":"0.0.0-other"');
  assert.notEqual(swapped, text); // the swap must really change the archive
  const other = await upload(w, swapped);
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...other, token: b2.token }, ADMIN), codeOf('STALE_EVIDENCE'));
  // The token was consumed by that attempt: it cannot be replayed with the right archive.
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...up, token: b2.token }, ADMIN), codeOf('CONFLICT'));
  assert.equal(w.fake.dec.length, 0);
  // A fresh verification works.
  const b3 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  assert.equal((await w.desk(ADMIN).confirmRestore({ ...up, token: b3.token }, ADMIN)).outcome, 'restored_verified');
});

test('decisions are refused while a restore is being verified (no collision with restored history)', async () => {
  const w = await world();
  await history(w);
  const { text } = await exportText(w);
  w.fake.wipe();
  await w.screen(10001);
  const up = await upload(w, text);
  await w.desk(ADMIN).beginRestore(up, ADMIN);
  await assert.rejects(decision(w, REV1, 'SHOP-1', APPROVE), codeOf('CONFLICT'));
});

test('interrupted restore: the gate stays closed, the reconciler does not interleave records, and resuming completes it', async () => {
  const w = await world();
  await history(w);
  const { text } = await exportText(w);
  w.fake.wipe();
  w.fake.failures.restoreChainAfter = 1; // the SQL connection drops after one chain record
  const up = await upload(w, text);
  const begin = await w.desk(ADMIN).beginRestore(up, ADMIN);
  await assert.rejects(w.desk(ADMIN).confirmRestore({ ...up, token: begin.token }, ADMIN), codeOf('UPSTREAM_UNAVAILABLE'));
  assert.equal(w.fake.lev.at(-1).outcome, 'failed_partial');
  await w.screen(10001);
  await w.screen(10002);
  // Never allowed from a half-restored record — even an approval whose own record was restored.
  assert.equal(await gateReason(w, 'SHOP-1'), 'RESTORE_INCOMPLETE');
  assert.equal(await gateReason(w, 'HR-7'), 'RESTORE_INCOMPLETE');
  assert.equal(await w.reviewFor(null).repairChain(), 0); // no new signatures mixed into the restore
  // Resume with the same archive (store not empty, but the last restore of THIS archive failed part-way).
  w.fake.failures.restoreChainAfter = null;
  const b2 = await w.desk(ADMIN).beginRestore(up, ADMIN);
  assert.equal(b2.resume, true);
  assert.equal(await gateReason(w, 'SHOP-1'), 'RESTORE_INCOMPLETE'); // a restore being verified also closes the gate
  const r = await w.desk(ADMIN).confirmRestore({ ...up, token: b2.token }, ADMIN);
  assert.equal(r.outcome, 'restored_verified');
  assert.equal(w.fake.chn.length, 3);
  assert.equal(await gateReason(w, 'SHOP-1'), 'ALLOW_APPROVED');
});

// ---------------------------------------------------------------- key lifecycle
test('key rotation with handover: old approvals stay trusted; the succession is co-signed', async () => {
  const w = await world();
  await history(w);
  const next = newRecordKey();
  const settings = { ...w.settings, recordKey: next, recordKeyPrevious: RECORD_KEY };
  await w.ledgerFor({ settings }).ensureKeys();
  assert.equal(w.fake.succ.length, 1);
  assert.ok(w.fake.succ[0].fromSig);
  // Later the previous key is removed from the environment: trust still flows through the succession.
  const after = { ...w.settings, recordKey: next, recordKeyPrevious: null };
  assert.equal(await gateReason(w, 'SHOP-1', { settings: after }), 'ALLOW_APPROVED');
  const st = await w.desk(ADMIN, { settings: after }).recordStatus(ADMIN);
  assert.deepEqual(st.keys.map((k) => [k.current, k.trusted]).sort(), [[false, true], [true, true]]);
  assert.equal(st.keys.find((k) => !k.current).endorsedByPredecessor, true);
});

test('key loss: old approvals are blocked until an admin adopts the previous key by its exact fingerprint', async () => {
  const w = await world();
  await history(w);
  const lost = loadSigner(RECORD_KEY);
  const settings = { ...w.settings, recordKey: newRecordKey(), recordKeyPrevious: null };
  await w.ledgerFor({ settings }).ensureKeys();
  assert.equal(await gateReason(w, 'SHOP-1', { settings }), 'RECORD_KEY_UNTRUSTED');
  const d = w.desk(ADMIN, { settings });
  await assert.rejects(d.adoptPreviousKey({ kid: lost.kid, fingerprint: 'ab'.repeat(32) }), codeOf('INVALID_INPUT'));
  await assert.rejects(w.desk(REV1, { settings }).adoptPreviousKey({ kid: lost.kid, fingerprint: fingerprintOf(lost.publicKeyB64) }), codeOf('NOT_AUTHORISED'));
  assert.equal((await d.adoptPreviousKey({ kid: lost.kid, fingerprint: fingerprintOf(lost.publicKeyB64) }, ADMIN)).status, 'adopted');
  assert.equal(await gateReason(w, 'SHOP-1', { settings }), 'ALLOW_APPROVED');
  const st = await d.recordStatus(ADMIN);
  const adopted = st.events.find((e) => e.type === 'key_adopted');
  assert.ok(adopted && adopted.by !== 'Article25', 'the trust change is attributed to the administrator');
  assert.equal(st.keys.find((k) => k.kid === lost.kid).endorsedByPredecessor, false); // honest: not co-signed
});

test('a key inserted directly into the database is never trusted', async () => {
  const w = await world();
  await history(w);
  const evil = loadSigner(newRecordKey());
  const { registerKey } = await import('../src/core/ledger.js');
  w.fake.keys.push(registerKey(evil, { siteId: w.siteId, at: new Date().toISOString() }));
  const st = await w.desk(ADMIN).recordStatus(ADMIN);
  assert.equal(st.keys.find((k) => k.kid === evil.kid).trusted, false);
});

// ---------------------------------------------------------------- transfers, register, privacy, retention
test('chunked transfers: exports are readable only by the exporting admin; uploads are immutable and complete', async () => {
  const w = await world();
  w.admins.push('acc-admin-2');
  await history(w);
  const e = await w.desk(ADMIN).exportArchive(ADMIN);
  await assert.rejects(w.desk('acc-admin-2').transferChunk({ transferId: e.transferId, idx: 0 }, 'acc-admin-2'), codeOf('NOT_FOUND'));
  await assert.rejects(w.desk(ADMIN).transferChunk({ transferId: 'zz', idx: 0 }, ADMIN), codeOf('INVALID_INPUT'));
  const tid = randomBytes(16).toString('hex');
  await w.desk(ADMIN).uploadChunk({ transferId: tid, idx: 0, data: 'abc' }, ADMIN);
  await w.desk(ADMIN).uploadChunk({ transferId: tid, idx: 0, data: 'abc' }, ADMIN); // idempotent retry
  await assert.rejects(w.desk(ADMIN).uploadChunk({ transferId: tid, idx: 0, data: 'xyz' }, ADMIN), codeOf('CONFLICT'));
  await assert.rejects(w.desk('acc-admin-2').uploadChunk({ transferId: tid, idx: 1, data: 'def' }, 'acc-admin-2'), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(ADMIN).uploadChunk({ transferId: tid, idx: 1, data: 'x'.repeat(100_001) }, ADMIN), codeOf('INVALID_INPUT'));
  await assert.rejects(w.desk(ADMIN).beginRestore({ transferId: tid, chunks: 2 }, ADMIN), codeOf('INVALID_INPUT')); // incomplete
});

test('register: only work items the viewer can see; names for everyone, account ids only for reviewers; export status', async () => {
  const w = await world();
  await history(w);
  let reg = await w.desk(OUTSIDER).register({}, OUTSIDER);
  assert.deepEqual(reg.items.map((i) => i.key).sort(), ['SHOP-1']); // HR-7 is hidden from OUTSIDER
  assert.equal(JSON.stringify(reg).includes('acc-'), false);
  assert.deepEqual([reg.items[0].record.format, reg.items[0].inLastExport], ['ed25519', false]);
  await exportText(w);
  reg = await w.desk(REV1).register({}, REV1);
  assert.equal(reg.items.length, 3);
  assert.ok(reg.items.every((i) => i.inLastExport));
  assert.equal(reg.items.find((i) => i.decision === 'REJECTED').decidedBy.id, REV2);
  await assert.rejects(w.desk(REV1).register({ page: 0 }, REV1), codeOf('INVALID_INPUT'));
});

test('a single decision can be downloaded with its signed record and verified with the public key alone', async () => {
  const w = await world();
  await history(w);
  const b = await w.desk(REV1).decisionRecord({ issueKey: 'HR-7', seq: 2 }, REV1);
  const { verifyRecordSignature, decisionMatchesRecord } = await import('../src/core/ledger.js');
  const { decisionIdOf } = await import('../src/core/review.js');
  const keys = new Map([[b.publicKey.kid, { publicKey: b.publicKey.publicKey }]]);
  assert.equal(verifyRecordSignature(b.record, { siteId: b.siteId, keys }), null);
  assert.equal(decisionMatchesRecord(b.decision, b.record, decisionIdOf), null);
  await assert.rejects(w.desk(OUTSIDER).decisionRecord({ issueKey: 'SHOP-1', seq: 1 }, OUTSIDER), codeOf('NOT_AUTHORISED'));
});

test('status and exports contain no private key material; status shows fingerprints, not account ids', async () => {
  const w = await world();
  await history(w);
  const { text } = await exportText(w);
  const st = await w.desk(ADMIN).recordStatus(ADMIN);
  for (const secret of [RECORD_KEY, w.settings.signingKey]) {
    assert.equal(JSON.stringify(st).includes(secret), false);
    assert.equal(text.includes(secret), false);
  }
  assert.equal(JSON.stringify(st).includes('acc-'), false);
  assert.match(st.currentKey.fingerprint, /^([0-9a-f]{4} ){15}[0-9a-f]{4}$/);
  assert.equal(st.notInLastExport, 0);
  assert.equal(st.externalRegister.status, 'archive_only');
});

test('retention: gate events older than 30 days and stale transfers are purged; decisions are never purged', async () => {
  const w = await world();
  await history(w);
  w.fake.gev.push({ id: 99, at: 1, issue_id: '10001', mode: 'enforce', verdict: 'block', reason: 'REVIEW_REQUIRED', policy_version: 'g1' });
  await exportText(w);
  const before = w.fake.dec.length;
  assert.equal(await w.fake.repos.purgeGateEvents(Date.now() - 30 * 24 * 3600 * 1000), 1);
  assert.ok((await w.fake.repos.transfers.purge(Date.now() + 1)) >= 1);
  assert.equal(w.fake.dec.length, before);
});
