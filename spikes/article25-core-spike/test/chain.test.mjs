// Unit tests for the decision hash chain (synthetic data). Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, verifyHistory, genesis, signCheckpoint, signReceipt, restorePlan } from '../src/chain-core.js';

const KEY = 'test-key-not-a-secret';
const SITE = 'site-A';
const T = (n) => `2026-11-22T10:00:${String(n).padStart(2, '0')}.000Z`;

function makeChain(decisions, { key = KEY, site = SITE } = {}) {
  const out = []; let prev = genesis(site);
  decisions.forEach((d, i) => {
    const r = buildRecord(key, { siteId: site, seq: i + 1, prevHash: prev, decidedBy: 'acc-reviewer', decidedAt: T(i), conditions: [], ...d });
    out.push(r); prev = r.hash;
  });
  return out;
}
const base = () => makeChain([
  { decisionId: 'd1', issueKey: 'AS-1', state: 'REVIEW_REQUIRED' },
  { decisionId: 'd2', issueKey: 'AS-1', state: 'APPROVED' },
  { decisionId: 'd3', issueKey: 'AS-2', state: 'APPROVED' },
  { decisionId: 'd4', issueKey: 'AS-1', state: 'REJECTED' },   // later rejection of AS-1
  { decisionId: 'd5', issueKey: 'AS-3', state: 'APPROVED_WITH_CONDITIONS', conditions: ['mask inputs'] },
]);
const anchorsFor = (chain) => ({
  checkpoints: chain.map((r) => signCheckpoint(KEY, SITE, r.seq, r.hash)),
  receipts: Object.values(chain.reduce((m, r) => ({ ...m, [r.issueKey]: r }), {})).map((r) => signReceipt(KEY, SITE, r.issueKey, r.seq, r.hash)),
});
const clone = (x) => JSON.parse(JSON.stringify(x));

test('S0 valid complete history verifies', () => {
  const c = base(); const v = verifyHistory(KEY, SITE, c, anchorsFor(c));
  assert.equal(v.valid, true, v.errors.join('\n')); assert.equal(v.complete, true); assert.equal(v.head.seq, 5);
  assert.equal(v.latestByIssue['AS-1'].state, 'REJECTED');
});
test('S1 modified state (REJECTED -> APPROVED) is detected', () => {
  const c = base(); const a = anchorsFor(c); c[3].state = 'APPROVED';
  const v = verifyHistory(KEY, SITE, c, a); assert.equal(v.valid, false); assert.match(v.errors.join(), /signature invalid/);
});
test('S2 modified conditions detected', () => {
  const c = base(); const a = anchorsFor(c); c[4].conditions = [];
  assert.equal(verifyHistory(KEY, SITE, c, a).valid, false);
});
test('S3 modified record re-hashed by attacker (no key) still detected', () => {
  const c = base(); const a = anchorsFor(c); c[3].state = 'APPROVED'; c[3].hash = 'ff'.repeat(32);
  const v = verifyHistory(KEY, SITE, c, a); assert.equal(v.valid, false);
});
test('S4 deleted middle record (d4 rejection) detected', () => {
  const c = base(); const a = anchorsFor(c); c.splice(3, 1);
  const v = verifyHistory(KEY, SITE, c, a); assert.equal(v.valid, false); assert.match(v.errors.join(), /expected seq|prevHash/);
});
test('S5 deleted middle record even WITHOUT anchors detected', () => {
  const c = base(); c.splice(1, 1);
  assert.equal(verifyHistory(KEY, SITE, c, {}).valid, false);
});
test('S6 tail truncation detected by checkpoint anchor', () => {
  const c = base(); const a = anchorsFor(c); const t = c.slice(0, 3);  // drops d4 (REJECTED AS-1) and d5
  const v = verifyHistory(KEY, SITE, t, a); assert.equal(v.valid, false); assert.match(v.errors.join(), /beyond history head|truncated/);
});
test('S7 tail truncation detected by receipt anchor alone (checkpoints lost)', () => {
  const c = base(); const a = anchorsFor(c); const t = c.slice(0, 3);
  const v = verifyHistory(KEY, SITE, t, { receipts: a.receipts }); assert.equal(v.valid, false); assert.match(v.errors.join(), /later decision missing|no decision/);
});
test('S8 tail truncation with ALL anchors also removed: chain valid but NOT complete -> recovery must refuse', () => {
  const c = base(); const v = verifyHistory(KEY, SITE, c.slice(0, 3), {});
  assert.equal(v.valid, true); assert.equal(v.complete, false); assert.match(v.warnings.join(), /tail truncation cannot be ruled out/);
});
test('S9 tail truncation with anchors ROLLED BACK consistently (older signed checkpoint + replayed older receipts) is NOT detectable', () => {
  const c = base(); const t = c.slice(0, 3); const old = anchorsFor(t);   // attacker kept earlier anchor values
  const v = verifyHistory(KEY, SITE, t, old);
  assert.equal(v.valid, true); assert.equal(v.complete, true); // documented residual risk: rollback to a previous consistent state
});
test('S10 reordered records detected', () => {
  const c = base(); const a = anchorsFor(c); [c[1], c[2]] = [c[2], c[1]];
  assert.equal(verifyHistory(KEY, SITE, c, a).valid, false);
});
test('S11 replayed (duplicated) record detected', () => {
  const c = base(); const a = anchorsFor(c); c.splice(3, 0, clone(c[1])); // re-insert APPROVED d2 after d3
  const v = verifyHistory(KEY, SITE, c, a); assert.equal(v.valid, false); assert.match(v.errors.join(), /replay|expected seq|prevHash/);
});
test('S12 cross-site replay (valid chain from another site) rejected', () => {
  const other = makeChain([{ decisionId: 'x1', issueKey: 'AS-1', state: 'APPROVED' }], { site: 'site-B' });
  const v = verifyHistory(KEY, SITE, other, {}); assert.equal(v.valid, false); assert.match(v.errors.join(), /cross-site/);
});
test('S13 forged record signed with a different key rejected', () => {
  const c = base(); const forged = makeChain([{ decisionId: 'd1', issueKey: 'AS-1', state: 'APPROVED' }], { key: 'attacker-key' });
  assert.equal(verifyHistory(KEY, SITE, [forged[0], ...c.slice(1)], {}).valid, false);
});
test('S14 appended forged record at tail rejected', () => {
  const c = base(); const prev = c[4];
  const forged = { ...buildRecord('attacker-key', { siteId: SITE, seq: 6, prevHash: prev.hash, decisionId: 'd6', issueKey: 'AS-1', state: 'APPROVED', decidedBy: 'x', decidedAt: T(9) }) };
  assert.equal(verifyHistory(KEY, SITE, [...c, forged], anchorsFor(c)).valid, false);
});
test('S15 empty history while receipts exist is incomplete', () => {
  const c = base(); const v = verifyHistory(KEY, SITE, [], anchorsFor(c)); assert.equal(v.valid, false);
});
test('S16 forged checkpoint/receipt anchors are ignored or rejected', () => {
  const c = base(); const fakeCp = { siteId: SITE, seq: 99, hash: 'aa', sig: 'bb' }; const fakeRc = { issueKey: 'AS-9', seq: 1, hash: 'aa', sig: 'bb' };
  const v = verifyHistory(KEY, SITE, c, { checkpoints: [fakeCp, ...anchorsFor(c).checkpoints], receipts: [fakeRc] });
  assert.equal(v.valid, false); assert.match(v.errors.join(), /receipt for AS-9: invalid signature/); assert.match(v.warnings.join(), /invalid signature ignored/);
});
test('S17 genesis tampered (seq 1 prevHash changed) detected', () => {
  const c = base(); c[0].prevHash = '00'.repeat(32);
  assert.equal(verifyHistory(KEY, SITE, c, {}).valid, false);
});

test('S18 restore plan: valid+complete history offers only the LATEST approvals (AS-1 later REJECTED is excluded)', () => {
  const c = base(); const p = restorePlan(verifyHistory(KEY, SITE, c, anchorsFor(c)));
  assert.equal(p.restorable, true); assert.deepEqual(p.approvalsToRestore.sort(), ['AS-2:APPROVED@seq3', 'AS-3:APPROVED_WITH_CONDITIONS@seq5']);
});
test('S19 restore plan: tampered history offers NO approvals; claims are reported as untrusted', () => {
  const c = base(); const a = anchorsFor(c); c[3].state = 'APPROVED';
  const p = restorePlan(verifyHistory(KEY, SITE, c, a));
  assert.equal(p.restorable, false); assert.deepEqual(p.approvalsToRestore, []); assert.ok(p.untrustedClaims.includes('AS-1:APPROVED@seq4'));
});
test('S20 restore plan: valid but incomplete history (no anchors) is never restorable', () => {
  const p = restorePlan(verifyHistory(KEY, SITE, base(), {}));
  assert.equal(p.restorable, false); assert.deepEqual(p.approvalsToRestore, []);
});
