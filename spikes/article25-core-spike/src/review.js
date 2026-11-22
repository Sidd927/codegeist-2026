// Spike C/F shared review-state logic. Authoritative state lives in app-only Forge KVS.
// The Jira issue property 'article25-review' is a MIRROR (for display / expression validator test only).
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

export const STATES = ['NOT_REVIEWED', 'REVIEW_REQUIRED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED'];
export const PASSING = new Set(['APPROVED', 'APPROVED_WITH_CONDITIONS']);
export const REVIEWER_GROUP = 'article25-reviewers';
export const PROPERTY_KEY = 'article25-review';

const reviewKey = (issueKey) => `review:${issueKey}`;

export async function getReview(issueKey) {
  return (await kvs.get(reviewKey(issueKey))) ?? null;
}

// Authorisation: only members of REVIEWER_GROUP may record decisions. Uses accountId from Forge context, never from UI input.
export async function isReviewer(accountId) {
  const res = await api.asApp().requestJira(route`/rest/api/3/user/groups?accountId=${accountId}`);
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  const groups = await res.json();
  return { ok: groups.some((g) => g.name === REVIEWER_GROUP), groups: groups.map((g) => g.name) };
}

export async function setReview({ issueKey, state, conditions = [], accountId, decisionId, mirror = true }) {
  if (!STATES.includes(state)) throw new Error(`invalid state ${state}`);
  const needsReviewer = PASSING.has(state) || state === 'REJECTED';
  if (needsReviewer) {
    const r = await isReviewer(accountId);
    if (!r.ok) return { ok: false, error: `User is not in group '${REVIEWER_GROUP}'`, detail: r };
  }
  const prev = await getReview(issueKey);
  const now = new Date().toISOString();
  const record = {
    issueKey, state, conditions,
    decidedBy: accountId, decidedAt: now,
    decisionId: decisionId ?? `${issueKey}:${now}`,
    version: (prev?.version ?? 0) + 1,
    history: [...(prev?.history ?? []), { state, by: accountId, at: now }].slice(-50),
  };
  await kvs.set(reviewKey(issueKey), record);
  let mirrorResult = null;
  if (mirror) {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROPERTY_KEY}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, version: record.version, decidedAt: now }),
    });
    mirrorResult = res.status;
  }
  return { ok: true, record, mirrorStatus: mirrorResult };
}

// TAMPER TEST: write the issue property with the CURRENT USER's permissions (equivalent to that user calling REST directly).
export async function tamperPropertyAsUser(issueKey, state) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROPERTY_KEY}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, forgedBy: 'user', at: new Date().toISOString() }),
  });
  return { status: res.status, body: res.status >= 300 ? await res.text() : '' };
}

export async function readPropertyAsUser(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROPERTY_KEY}`);
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}
