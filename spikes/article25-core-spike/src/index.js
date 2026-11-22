// Article25 core spike resolvers (Spikes B, C, F). Synthetic data only.
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { screen } from './screen';
import { adfToText, storageToText, fingerprint } from './text';
import { getReview, setReview, tamperPropertyAsUser, readPropertyAsUser, isReviewer } from './review';
import { applyDecision, publish, getRegister } from './register';

const resolver = new Resolver();
// Spike evidence: log every resolver result (synthetic data only) so outcomes are captured as text via `forge logs`.
const _define = resolver.define.bind(resolver);
resolver.define = (name, fn) => _define(name, async (req) => {
  const t0 = Date.now();
  try {
    const out = await fn(req);
    console.log(JSON.stringify({ evidence: name, ms: Date.now() - t0, payload: req.payload, out }).slice(0, 3500));
    return out;
  } catch (e) {
    console.log(JSON.stringify({ evidence: name, ms: Date.now() - t0, error: String(e?.stack ?? e).slice(0, 800) }));
    throw e;
  }
});
const json = async (res) => {
  const text = await res.text(); // read once; some endpoints (e.g. POST /issueLink) return 201 with an empty body
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
};
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

resolver.define('context', async ({ context }) => ({ accountId: context.accountId, cloudId: context.cloudId, moduleKey: context.moduleKey, extension: context.extension }));

// ---------- Spike B: Jira ----------
resolver.define('getIssueData', async ({ payload, context }) => {
  const key = payload.issueKey ?? context.extension?.issue?.key;
  const t0 = Date.now();
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary,description,labels,issuetype,status,project,comment,reporter`);
  const r = await json(res);
  if (!r.ok) return { key, error: r };
  const f = r.body.fields;
  const description = adfToText(f.description);
  const screening = screen({ summary: f.summary, description });
  return {
    key, ms: Date.now() - t0,
    summary: f.summary, descriptionText: description, labels: f.labels,
    issueType: f.issuetype?.name, status: f.status?.name, statusCategory: f.status?.statusCategory?.key,
    project: { key: f.project?.key, type: f.project?.projectTypeKey, style: f.project?.style, simplified: f.project?.simplified },
    commentCount: f.comment?.total, firstCommentExcerpt: f.comment?.comments?.[0] ? adfToText(f.comment.comments[0].body).slice(0, 80) : null,
    storedTriggerScreening: await kvs.get(`screening:${key}`),
    liveScreening: { outcome: screening.outcome, categories: screening.categories, criteria: screening.criteria, reasons: screening.reasons, evidence: screening.evidence.slice(0, 6) },
    fingerprint: fingerprint(f.summary + '\n' + description),
  };
});

resolver.define('addComment', async ({ payload }) => json(await api.asApp().requestJira(route`/rest/api/3/issue/${payload.issueKey}/comment`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: adf(`Article25 spike: privacy screening outcome recorded (synthetic test). Ref ${payload.ref ?? ''}`) }),
})));

resolver.define('createReviewTask', async ({ payload }) => {
  const src = await json(await api.asApp().requestJira(route`/rest/api/3/issue/${payload.issueKey}?fields=project`));
  const projectKey = src.body.fields.project.key;
  const meta = await json(await api.asApp().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`));
  const types = meta.body.issueTypes ?? meta.body.values ?? [];
  const task = types.find((t) => t.name === 'Task') ?? types.find((t) => !t.subtask);
  const created = await json(await api.asApp().requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { project: { key: projectKey }, issuetype: { id: task.id }, summary: `Privacy review: ${payload.issueKey} (Article25 spike)`, description: adf('Synthetic privacy review task created by the Article25 spike.'), labels: ['article25-review'] } }),
  }));
  if (!created.ok) return { step: 'create', created, types: types.map((t) => t.name) };
  const link = await json(await api.asApp().requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: created.body.key }, outwardIssue: { key: payload.issueKey } }),
  }));
  return { reviewKey: created.body.key, issueType: task.name, linkStatus: link.status, link: link.ok ? 'ok' : link.body };
});

// ---------- Spike C: review state ----------
resolver.define('getReviewState', async ({ payload }) => ({ kvs: await getReview(payload.issueKey), property: await readPropertyAsUser(payload.issueKey) }));
resolver.define('setReviewState', async ({ payload, context }) => setReview({ issueKey: payload.issueKey, state: payload.state, conditions: payload.conditions ?? [], accountId: context.accountId }));
resolver.define('tamperProperty', async ({ payload }) => tamperPropertyAsUser(payload.issueKey, payload.state ?? 'APPROVED'));
resolver.define('amIReviewer', async ({ context }) => isReviewer(context.accountId));
resolver.define('simulate', async ({ payload }) => { if (payload.mode) await kvs.set('spike:simulate', payload.mode); else await kvs.delete('spike:simulate'); return { simulate: payload.mode ?? null }; });
resolver.define('deleteReview', async ({ payload }) => { await kvs.delete(`review:${payload.issueKey}`); return { deleted: true }; });

// ---------- Spike B: Confluence ----------
resolver.define('listSpaces', async () => {
  const r = await json(await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?limit=10`));
  return r.ok ? r.body.results.map((s) => ({ id: s.id, key: s.key, name: s.name, type: s.type })) : r;
});

const POLICY = `<h2>Purpose</h2><p>SYNTHETIC TEST POLICY for the Article25 spike. Not a real policy.</p>
<h2>Approved data uses</h2><ul><li>Email address and billing address for order fulfilment and invoicing.</li><li>Purchase history for customer support and returns.</li><li>Aggregated, anonymised analytics.</li></ul>
<h2>Prohibited data uses</h2><ul><li>Precise customer location tracking without explicit consent.</li><li>Behavioural profiling for targeted pricing.</li><li>Sharing personal data with vendors not listed in the approved vendor register.</li></ul>
<h2>Approved vendors</h2><ul><li>Stripe (payments)</li><li>Workday (HR)</li></ul>`;

resolver.define('createPolicyPage', async ({ payload }) => json(await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ spaceId: payload.spaceId, status: 'current', title: payload.title ?? 'Article25 Spike - Data Use Policy (SYNTHETIC)', body: { representation: 'storage', value: POLICY } }),
})));

resolver.define('searchPolicy', async ({ payload }) => {
  const cql = payload.cql ?? 'type=page AND title~"Data Use Policy"';
  const r = await json(await api.asApp().requestConfluence(route`/wiki/rest/api/search?cql=${cql}&limit=5`));
  const userR = await json(await api.asUser().requestConfluence(route`/wiki/rest/api/search?cql=${cql}&limit=5`));
  const pick = (x) => (x.ok ? x.body.results.map((h) => ({ id: h.content?.id, title: h.content?.title ?? h.title, type: h.content?.type })) : x);
  return { cql, asApp: pick(r), asUser: pick(userR) };
});

resolver.define('getPageText', async ({ payload }) => {
  const r = await json(await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${payload.pageId}?body-format=storage`));
  if (!r.ok) return r;
  const text = storageToText(r.body.body?.storage?.value);
  const section = (h) => (text.split(new RegExp(`${h}\\n?`, 'i'))[1] ?? '').split(/\n(?=[A-Z][a-z]+ (?:data|vendors|uses))/)[0].trim();
  return { id: r.body.id, title: r.body.title, version: r.body.version?.number, chars: text.length, approved: section('Approved data uses'), prohibited: section('Prohibited data uses'), text: text.slice(0, 1500) };
});

// ---------- Spike F: register ----------
resolver.define('decideAndRegister', async ({ payload, context }) => {
  const state = payload.state ?? 'APPROVED_WITH_CONDITIONS';
  const decisionId = payload.decisionId ?? `${payload.issueKey}:${state}:${Date.now()}`;
  const review = await setReview({ issueKey: payload.issueKey, state, conditions: payload.conditions ?? [], accountId: context.accountId, decisionId });
  if (!review.ok) return { review };
  const statusMap = { APPROVED: 'APPROVED', APPROVED_WITH_CONDITIONS: 'APPROVED_WITH_CONDITIONS', REJECTED: 'REJECTED', REVIEW_REQUIRED: 'PROPOSED', NOT_REVIEWED: 'PROPOSED' };
  const applied = await applyDecision({ decisionId, issueKey: payload.issueKey, activity: payload.activity ?? 'Customer analytics dashboard', status: statusMap[state], conditions: payload.conditions ?? [], categories: payload.categories ?? [], vendors: payload.vendors ?? [], accountId: context.accountId, supersedes: payload.supersedes });
  return { decisionId, review: { state: review.record.state, version: review.record.version, mirrorStatus: review.mirrorStatus }, applied };
});
resolver.define('replayDecision', async ({ payload, context }) => applyDecision({ ...payload, accountId: context.accountId }));
resolver.define('publishRegister', async ({ payload }) => publish(payload));
resolver.define('getRegister', async () => getRegister());

export const handler = resolver.getDefinitions();
