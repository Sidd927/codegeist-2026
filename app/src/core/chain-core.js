// Article25 decision hash chain — pure logic (no Forge imports) so it can be unit-tested locally.
//
// Record (v2):  { v:2, siteId, seq, prevHash, decisionId, issueKey, state, conditions, decidedBy, decidedAt, sig, hash }
//   sig  = HMAC-SHA256(key, canonical(record))          -> authenticity (only the app can produce it)
//   hash = SHA-256(canonical(record) + '|' + sig)        -> identity used by the next record's prevHash
//   seq 1 links to GENESIS = SHA-256('article25-genesis|' + siteId)
// Checkpoint (anchor): { siteId, seq, hash, sig = HMAC(key, 'checkpoint|siteId|seq|hash') }
// Receipt (per work item anchor): { issueKey, seq, hash, sig = HMAC(key, 'receipt|siteId|issueKey|seq|hash') }
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const CHAIN_VERSION = 2;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => createHmac('sha256', key).update(s).digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a ?? ''), 'hex'); const y = Buffer.from(String(b ?? ''), 'hex'); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); };

export const genesis = (siteId) => sha256(`article25-genesis|${siteId}`);
export const canonical = (r) => JSON.stringify([r.v, r.siteId, r.seq, r.prevHash, r.decisionId, r.issueKey, r.state, r.conditions ?? [], r.decidedBy, r.decidedAt]);

export function buildRecord(key, { siteId, seq, prevHash, decisionId, issueKey, state, conditions = [], decidedBy, decidedAt }) {
  const r = { v: CHAIN_VERSION, siteId, seq, prevHash, decisionId, issueKey, state, conditions, decidedBy, decidedAt };
  r.sig = hmac(key, canonical(r));
  r.hash = sha256(canonical(r) + '|' + r.sig);
  return r;
}
export const signCheckpoint = (key, siteId, seq, hash) => ({ siteId, seq, hash, sig: hmac(key, `checkpoint|${siteId}|${seq}|${hash}`) });
export const checkpointValid = (key, c) => eq(c?.sig, hmac(key, `checkpoint|${c?.siteId}|${c?.seq}|${c?.hash}`));
export const signReceipt = (key, siteId, issueKey, seq, hash) => ({ issueKey, seq, hash, sig: hmac(key, `receipt|${siteId}|${issueKey}|${seq}|${hash}`) });
export const receiptValid = (key, siteId, r) => eq(r?.sig, hmac(key, `receipt|${siteId}|${r?.issueKey}|${r?.seq}|${r?.hash}`));

/**
 * Verify a full history AS PROVIDED (order matters) plus independent anchors.
 * anchors.checkpoints: signed checkpoints harvested from immutable-ish places (Confluence page-version messages).
 * anchors.receipts:    signed per-work-item receipts (Jira issue properties).
 * Returns { valid, complete, errors[], warnings[], head, latestByIssue }.
 * Policy: ANY error => valid=false => restore nothing.
 */
export function verifyHistory(key, siteId, records, anchors = {}) {
  const errors = [], warnings = [];
  if (!Array.isArray(records)) return { valid: false, errors: ['history is not a list'] };
  let prev = genesis(siteId);
  const seenIds = new Set(), seenHashes = new Set(), latestByIssue = {};
  records.forEach((r, i) => {
    const where = `position ${i + 1}`;
    if (r?.v !== CHAIN_VERSION) errors.push(`${where}: unsupported record version ${r?.v}`);
    if (r?.siteId !== siteId) errors.push(`${where}: record belongs to site ${r?.siteId}, not ${siteId} (cross-site replay)`);
    if (r?.seq !== i + 1) errors.push(`${where}: expected seq ${i + 1}, found ${r?.seq} (deleted, inserted or reordered record)`);
    if (r?.prevHash !== prev) errors.push(`${where} (seq ${r?.seq}): prevHash does not match predecessor (chain break: deletion/reorder/insertion)`);
    if (!eq(r?.sig, hmac(key, canonical(r ?? {})))) errors.push(`${where} (seq ${r?.seq}): signature invalid (modified or forged record)`);
    const h = sha256(canonical(r ?? {}) + '|' + r?.sig);
    if (r?.hash !== h) errors.push(`${where} (seq ${r?.seq}): stored hash does not match content`);
    if (seenIds.has(r?.decisionId)) errors.push(`${where}: decisionId ${r?.decisionId} appears twice (replayed record)`);
    if (seenHashes.has(h)) errors.push(`${where}: identical record appears twice (replay)`);
    seenIds.add(r?.decisionId); seenHashes.add(h);
    prev = r?.hash;
    if (r?.issueKey) latestByIssue[r.issueKey] = { seq: r.seq, hash: r.hash, state: r.state, decisionId: r.decisionId };
  });
  const head = records.length ? { seq: records[records.length - 1].seq, hash: records[records.length - 1].hash } : { seq: 0, hash: genesis(siteId) };

  // Completeness: the history must reach at least the highest valid checkpoint ever published, and match it exactly at that seq.
  const cps = (anchors.checkpoints ?? []).filter((c) => c?.siteId === siteId);
  const validCps = cps.filter((c) => checkpointValid(key, c));
  if (cps.length !== validCps.length) warnings.push(`${cps.length - validCps.length} checkpoint(s) with invalid signature ignored`);
  for (const c of validCps) {
    if (c.seq > head.seq) errors.push(`checkpoint seq ${c.seq} is beyond history head ${head.seq} (history truncated: later records missing)`);
    else if (c.seq > 0 && records[c.seq - 1]?.hash !== c.hash) errors.push(`checkpoint seq ${c.seq} hash does not match the record at that position (history rewritten)`);
  }
  if (!validCps.length) warnings.push('no valid checkpoint anchors found: tail truncation cannot be ruled out');

  // Per-work-item receipts: the latest decision for each work item must be the one the receipt attests.
  for (const rc of anchors.receipts ?? []) {
    if (!receiptValid(key, siteId, rc)) { errors.push(`receipt for ${rc?.issueKey}: invalid signature`); continue; }
    const latest = latestByIssue[rc.issueKey];
    if (!latest) errors.push(`receipt for ${rc.issueKey} (seq ${rc.seq}) but the history has no decision for it (records missing)`);
    else if (rc.seq > latest.seq) errors.push(`receipt for ${rc.issueKey} attests seq ${rc.seq}, history's latest is seq ${latest.seq} (later decision missing)`);
    else if (rc.seq === latest.seq && rc.hash !== latest.hash) errors.push(`receipt for ${rc.issueKey} hash mismatch at seq ${rc.seq}`);
    else if (rc.seq < latest.seq) warnings.push(`receipt for ${rc.issueKey} is older (seq ${rc.seq}) than history (seq ${latest.seq}); receipt may be stale or replayed`);
  }
  return { valid: errors.length === 0, complete: errors.length === 0 && validCps.length > 0, errors, warnings, head, latestByIssue };
}

const APPROVALS = ['APPROVED', 'APPROVED_WITH_CONDITIONS'];
/**
 * Restore policy. Approvals are only ever offered when the history is BOTH valid and complete.
 * For anything else the backup's claims are reported separately as untrusted, and nothing is restorable.
 */
export function restorePlan(v) {
  const latest = Object.entries(v?.latestByIssue ?? {});
  const fmt = ([k, x]) => `${k}:${x.state}@seq${x.seq}`;
  if (!(v?.valid && v?.complete)) {
    return { restorable: false, approvalsToRestore: [], untrustedClaims: latest.filter(([, x]) => APPROVALS.includes(x.state)).map(fmt) };
  }
  return { restorable: true, approvalsToRestore: latest.filter(([, x]) => APPROVALS.includes(x.state)).map(fmt), untrustedClaims: [] };
}
