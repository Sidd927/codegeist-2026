// Stage 1.5 / C3: durable, tamper-evident decision mirror.
// Each decision is signed with HMAC-SHA256 using an APP-LEVEL secret (encrypted Forge environment variable
// A25_SIGNING_KEY). Environment variables belong to the app environment, not the installation, so they are
// expected to survive uninstall (verified by test). Signed records are stored as a Confluence content property on the
// customer-owned register page. Anyone can READ them; edits are detected on rebuild because the signature no longer verifies.
import api, { route } from '@forge/api';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { recordDecision } from './db';

const PROP_KEY = 'article25-decisions';
const canonical = (d) => JSON.stringify([d.decisionId, d.issueKey, d.state, d.conditions ?? [], d.decidedBy, d.decidedAt]);

export function sign(d) {
  const key = process.env.A25_SIGNING_KEY;
  if (!key) throw new Error('A25_SIGNING_KEY not configured');
  return createHmac('sha256', key).update(canonical(d)).digest('hex');
}
export function verify(d) {
  try {
    const expected = Buffer.from(sign(d), 'hex');
    const got = Buffer.from(String(d.signature ?? ''), 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch { return false; }
}

async function getProp(pageId) {
  const r = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${PROP_KEY}`);
  const j = await r.json();
  if (!r.ok) return { error: { status: r.status, body: j } };
  return { prop: j.results?.[0] ?? null };
}

// Append a signed decision to the page property (optimistic concurrency via property version; retries on 409).
export async function appendToMirror(pageId, decision) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { prop, error } = await getProp(pageId);
    if (error) return { mirrored: false, error };
    const list = prop?.value?.decisions ?? [];
    if (list.some((x) => x.decisionId === decision.decisionId)) return { mirrored: false, reason: 'already mirrored' };
    const value = { schema: 1, decisions: [...list, decision] };
    const res = prop
      ? await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties/${prop.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: PROP_KEY, value, version: { number: prop.version.number + 1, message: `decision ${decision.decisionId}` } }) })
      : await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: PROP_KEY, value }) });
    if (res.status === 409) continue;
    const j = await res.json();
    if (!res.ok) return { mirrored: false, status: res.status, error: j };
    return { mirrored: true, propertyVersion: j.version?.number, count: value.decisions.length, attempt };
  }
  return { mirrored: false, reason: 'conflict after retries' };
}

// Rebuild SQL state from the mirror. Only signature-verified records are restored.
export async function rebuildFromMirror(pageId) {
  const { prop, error } = await getProp(pageId);
  if (error) return { error };
  const list = prop?.value?.decisions ?? [];
  const out = { found: list.length, restored: 0, duplicates: 0, rejected: [] };
  for (const d of list.sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))) {
    if (!verify(d)) { out.rejected.push({ decisionId: d.decisionId, issueKey: d.issueKey, state: d.state, reason: 'signature mismatch' }); continue; }
    const r = await recordDecision({ ...d, source: 'rebuild' });
    r.inserted ? out.restored++ : out.duplicates++;
  }
  return out;
}

export const readMirror = async (pageId) => getProp(pageId);
