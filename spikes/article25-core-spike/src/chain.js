// Forge-side hash chain: SQL append (total order via PRIMARY KEY seq), Confluence export + checkpoint anchors,
// Jira receipts, and an authorised two-step recovery. All pure crypto lives in chain-core.js.
import api, { route } from '@forge/api';
import sql from '@forge/sql';
import { kvs } from '@forge/kvs';
import { randomBytes } from 'node:crypto';
import { buildRecord, genesis, restorePlan, signCheckpoint, signReceipt, verifyHistory } from './chain-core';

const KEY = () => { const k = process.env.A25_SIGNING_KEY; if (!k) throw new Error('A25_SIGNING_KEY not configured'); return k; };
export const CHAIN_PROP = 'article25-chain';
export const RECOVERY_GROUP = 'article25-recovery-admins';
const affected = (r) => r?.rows?.affectedRows ?? 0;

// ---- append (called after a decision is accepted) ----
export async function appendToChain(siteId, d) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const head = (await sql.executeRaw('SELECT seq, record_hash FROM chain ORDER BY seq DESC LIMIT 1')).rows[0];
    const seq = head ? head.seq + 1 : 1;
    const rec = buildRecord(KEY(), { siteId, seq, prevHash: head ? head.record_hash : genesis(siteId), ...d });
    const r = await sql.prepare('INSERT IGNORE INTO chain (seq, decision_id, issue_key, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bindParams(seq, rec.decisionId, rec.issueKey, JSON.stringify(rec), rec.hash, new Date().toISOString()).execute();
    if (affected(r) === 1) return { appended: true, seq, hash: rec.hash, attempt, record: rec };
    const dup = (await sql.prepare('SELECT seq FROM chain WHERE decision_id = ?').bindParams(rec.decisionId).execute()).rows[0];
    if (dup) return { appended: false, reason: 'decision already in chain', seq: dup.seq };
    // else: another writer took this seq; retry with the new head
  }
  return { appended: false, reason: 'seq contention: retries exhausted' };
}

export async function exportChain() {
  return (await sql.executeRaw('SELECT record FROM chain ORDER BY seq')).rows.map((r) => JSON.parse(r.record));
}

// ---- anchors ----
// 1) Full chain export as a Confluence content property (customer-owned copy; user-editable, hence verified on restore).
// 2) Signed checkpoint in the Confluence page-VERSION MESSAGE (version messages can't be edited; versions can only be deleted by space admins).
// 3) Signed receipt in the Jira issue property of the decided work item.
export async function publishAnchors(pageId, siteId, rec) {
  const out = {};
  const chainRecords = await exportChain();
  // (1) property
  for (let a = 0; a < 5; a++) {
    const g = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${CHAIN_PROP}`);
    const prop = (await g.json()).results?.[0];
    const value = { schema: 2, siteId, records: chainRecords };
    const res = prop
      ? await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties/${prop.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: CHAIN_PROP, value, version: { number: prop.version.number + 1 } }) })
      : await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: CHAIN_PROP, value }) });
    if (res.status === 409) continue;
    out.property = { status: res.status, records: chainRecords.length };
    break;
  }
  // (2) checkpoint as page version message
  const cp = signCheckpoint(KEY(), siteId, rec.seq, rec.hash);
  const cur = await (await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`)).json();
  const body = (cur.body?.storage?.value ?? '').replace(/<p data-a25-checkpoint[^>]*>.*?<\/p>/s, '') + `<p data-a25-checkpoint="1"><em>Article25 chain checkpoint: seq ${cp.seq}, hash ${cp.hash.slice(0, 16)}…</em></p>`;
  const up = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pageId, status: 'current', title: cur.title, body: { representation: 'storage', value: body }, version: { number: cur.version.number + 1, message: `a25-checkpoint ${JSON.stringify(cp)}` } }) });
  out.checkpoint = { status: up.status, seq: cp.seq };
  // (3) receipt
  const receipt = signReceipt(KEY(), siteId, rec.issueKey, rec.seq, rec.hash);
  const pr = await api.asApp().requestJira(route`/rest/api/3/issue/${rec.issueKey}/properties/article25-review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: rec.state, decisionId: rec.decisionId, decidedAt: rec.decidedAt, display_only: true, receipt }) });
  out.receipt = { status: pr.status };
  return out;
}

async function harvestAnchors(pageId, issueKeys) {
  const checkpoints = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const res = await api.asApp().requestConfluence(cursor ? route`/wiki/api/v2/pages/${pageId}/versions?limit=100&cursor=${cursor}` : route`/wiki/api/v2/pages/${pageId}/versions?limit=100`);
    const j = await res.json();
    for (const v of j.results ?? []) {
      const m = String(v.message ?? '').match(/^a25-checkpoint (\{.*\})$/);
      if (m) { try { checkpoints.push(JSON.parse(m[1])); } catch { /* ignore malformed */ } }
    }
    const next = j._links?.next; if (!next) break;
    cursor = new URL(next, 'https://x').searchParams.get('cursor'); if (!cursor) break;
  }
  const receipts = [];
  for (const k of issueKeys) {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${k}/properties/article25-review`);
    if (res.ok) { const p = await res.json(); if (p.value?.receipt) receipts.push(p.value.receipt); }
  }
  return { checkpoints, receipts };
}

// ---- authorised two-step recovery ----
async function inGroup(accountId, group) {
  const res = await api.asApp().requestJira(route`/rest/api/3/user/groups?accountId=${accountId}`);
  return res.ok && (await res.json()).some((g) => g.name === group);
}

async function verifyFromConfluence(pageId, siteId) {
  const g = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${CHAIN_PROP}`);
  const prop = (await g.json()).results?.[0];
  if (!prop) return { valid: false, complete: false, errors: ['no chain backup found on page'] };
  const records = prop.value?.records ?? [];
  const anchors = await harvestAnchors(pageId, [...new Set(records.map((r) => r.issueKey))]);
  const v = verifyHistory(KEY(), siteId, records, anchors);
  return { ...v, records, anchorCounts: { checkpoints: anchors.checkpoints.length, receipts: anchors.receipts.length } };
}

export async function recoveryVerify({ pageId, siteId, accountId }) {
  if (!(await inGroup(accountId, RECOVERY_GROUP))) return { authorised: false, error: `recovery requires membership of '${RECOVERY_GROUP}'` };
  const existing = (await sql.executeRaw('SELECT COUNT(*) AS n FROM chain')).rows[0].n;
  if (existing > 0) return { authorised: true, refused: `local chain is not empty (${existing} records); recovery only runs on an empty store` };
  // Any new verification supersedes an older pending one (a stale nonce must never survive a failed check).
  await kvs.delete('recovery:pending');
  const v = await verifyFromConfluence(pageId, siteId);
  const plan = restorePlan(v);
  const report = { valid: v.valid, complete: v.complete, errors: v.errors, warnings: v.warnings, head: v.head, anchorCounts: v.anchorCounts, approvalsToRestore: plan.approvalsToRestore, untrustedClaims: plan.untrustedClaims };
  await audit(accountId, 'recovery-verify', plan.restorable ? 'ok' : 'rejected', report);
  if (!plan.restorable) return { authorised: true, restorable: false, report };
  const nonce = randomBytes(16).toString('hex');
  await kvs.set('recovery:pending', { nonce, pageId, head: v.head, by: accountId, expires: Date.now() + 10 * 60_000 });
  return { authorised: true, restorable: true, nonce, report };
}

export async function recoveryConfirm({ pageId, siteId, accountId, nonce }) {
  if (!(await inGroup(accountId, RECOVERY_GROUP))) return { authorised: false, error: `recovery requires membership of '${RECOVERY_GROUP}'` };
  const p = await kvs.get('recovery:pending');
  if (!p || p.nonce !== nonce || p.pageId !== pageId || p.by !== accountId || Date.now() > p.expires) {
    await audit(accountId, 'recovery-confirm', 'rejected', { reason: 'no matching, unexpired verification by this user' });
    return { restored: false, error: 'no matching, unexpired verification by this user; run verify again' };
  }
  await kvs.delete('recovery:pending'); // single use: consumed whether or not the restore goes ahead
  const existing = (await sql.executeRaw('SELECT COUNT(*) AS n FROM chain')).rows[0].n;
  if (existing > 0) return { restored: false, error: `local chain is not empty (${existing} records); nothing restored` };
  const v = await verifyFromConfluence(pageId, siteId); // re-verify (time-of-check/time-of-use)
  if (!restorePlan(v).restorable || v.head.hash !== p.head.hash) { await audit(accountId, 'recovery-confirm', 'rejected', { reason: 'backup changed or became invalid since verification', errors: v.errors }); return { restored: false, error: 'backup changed or became invalid since verification; nothing restored' }; }
  try {
    for (const r of v.records) {
      await sql.prepare('INSERT IGNORE INTO chain (seq, decision_id, issue_key, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').bindParams(r.seq, r.decisionId, r.issueKey, JSON.stringify(r), r.hash, new Date().toISOString()).execute();
      await sql.prepare('INSERT IGNORE INTO decisions (decision_id, issue_key, state, conditions, decided_by, decided_at, signature, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bindParams(r.decisionId, r.issueKey, r.state, JSON.stringify(r.conditions ?? []), r.decidedBy, r.decidedAt, r.sig, 'recovery').execute();
    }
    // review_state written LAST: until this succeeds the gate keeps failing closed.
    for (const [issueKey, x] of Object.entries(v.latestByIssue)) {
      const rec = v.records[x.seq - 1];
      await sql.prepare('INSERT INTO review_state (issue_key, state, decision_id, decided_by, decided_at, version) VALUES (?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE state = VALUES(state), decision_id = VALUES(decision_id), decided_by = VALUES(decided_by), decided_at = VALUES(decided_at), version = version + 1')
        .bindParams(issueKey, rec.state, rec.decisionId, rec.decidedBy, rec.decidedAt).execute();
    }
  } catch (e) {
    // fail closed and compensate: recovery only runs on an empty store, so clearing is safe and allows a clean retry
    await sql.executeRaw('DELETE FROM review_state');
    await sql.executeRaw('DELETE FROM chain');
    await sql.executeRaw("DELETE FROM decisions WHERE source = 'recovery'");
    await audit(accountId, 'recovery-confirm', 'error', { error: String(e) });
    return { restored: false, error: `restore failed; review states cleared (gate fails closed): ${e}` };
  }
  await audit(accountId, 'recovery-confirm', 'ok', { head: v.head, issues: Object.keys(v.latestByIssue).length });
  return { restored: true, records: v.records.length, workItems: Object.keys(v.latestByIssue).length, head: v.head };
}

export async function audit(actor, action, result, detail) {
  await sql.prepare('INSERT INTO audit (at, actor, action, result, detail) VALUES (?, ?, ?, ?, ?)').bindParams(new Date().toISOString(), actor, action, result, JSON.stringify(detail).slice(0, 4000)).execute();
}
export const listAudit = async () => (await sql.executeRaw('SELECT * FROM audit ORDER BY at DESC LIMIT 20')).rows;
