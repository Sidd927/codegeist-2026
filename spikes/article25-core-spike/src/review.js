// Review-state logic. Stage 1.5: authoritative state lives in Forge SQL (atomic, idempotent; see db.js).
// Signed decisions are mirrored to the Confluence register page (mirror.js). The Jira issue property is display-only.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { recordDecision, getReviewState } from './db';
import { appendToChain, publishAnchors } from './chain';

export const STATES = ['NOT_REVIEWED', 'REVIEW_REQUIRED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED'];
export const PASSING = new Set(['APPROVED', 'APPROVED_WITH_CONDITIONS']);
export const REVIEWER_GROUP = 'article25-reviewers';
export const PROPERTY_KEY = 'article25-review';


export async function getReview(issueKey) {
  return getReviewState(issueKey); // SQL
}

// Authorisation: only members of REVIEWER_GROUP may record decisions. Uses accountId from Forge context, never from UI input.
export async function isReviewer(accountId) {
  const res = await api.asApp().requestJira(route`/rest/api/3/user/groups?accountId=${accountId}`);
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  const groups = await res.json();
  return { ok: groups.some((g) => g.name === REVIEWER_GROUP), groups: groups.map((g) => g.name) };
}

export async function setReview({ issueKey, state, conditions = [], accountId, decisionId, siteId }) {
  if (!STATES.includes(state)) throw new Error(`invalid state ${state}`);
  const needsReviewer = PASSING.has(state) || state === 'REJECTED';
  if (needsReviewer) {
    const r = await isReviewer(accountId);
    if (!r.ok) return { ok: false, error: `User is not in group '${REVIEWER_GROUP}'`, detail: r };
  }
  const decidedAt = new Date().toISOString();
  const decision = { decisionId: decisionId ?? `${issueKey}:${state}:${decidedAt}`, issueKey, state, conditions, decidedBy: accountId, decidedAt };
  const db = await recordDecision(decision);              // SQL decisions + review_state (idempotent, optimistic)
  if (!db.inserted) return { ok: true, decision, db, chain: { appended: false, reason: 'duplicate decision' } };
  const chain = await appendToChain(siteId, decision);    // hash-chained, signed record (total order by seq)
  let anchors = null;
  const page = await kvs.get('register:page');
  if (chain.appended && page?.pageId) anchors = await publishAnchors(page.pageId, siteId, chain.record);
  return { ok: true, decision, db, chain: { appended: chain.appended, seq: chain.seq, hash: chain.hash?.slice(0, 16), attempt: chain.attempt, reason: chain.reason }, anchors: anchors ?? { skipped: 'no register page configured' } };
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
