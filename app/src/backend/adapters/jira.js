// Jira REST adapter. All reads in this milestone run AS THE USER, so Jira's own permission model
// decides what the caller may see (DATA_AND_SECURITY_MODEL §3). Upstream bodies are never returned
// or logged; failures map to AppError codes.
import api, { route } from '@forge/api';
import { AppError, ErrorCode } from '../lib/errors.js';

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new AppError(ErrorCode.UPSTREAM_UNAVAILABLE)), ms)),
  ]);

function mapStatus(status) {
  if (status === 404 || status === 403) return new AppError(ErrorCode.NOT_FOUND);
  if (status === 401) return new AppError(ErrorCode.NOT_AUTHORISED);
  if (status === 429 || status >= 500) return new AppError(ErrorCode.UPSTREAM_UNAVAILABLE);
  return new AppError(ErrorCode.INTERNAL);
}

export function createJiraAdapter({ timeoutMs }) {
  async function getJson(r, { asApp = false, method = 'GET', body } = {}) {
    const actor = asApp ? api.asApp() : api.asUser();
    const init = { method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
    const res = await withTimeout(actor.requestJira(r, init), timeoutMs);
    if (!res.ok) throw Object.assign(mapStatus(res.status), { status: res.status });
    return res.json();
  }

  return {
    /**
     * Screening read AS THE APP (runs from the queue, with no user). Results are only ever shown to
     * users after an as-user browse check (DATA_AND_SECURITY_MODEL §3).
     */
    async getIssueForScreening(id) {
      const j = await getJson(route`/rest/api/3/issue/${id}?fields=summary,description,project`, { asApp: true });
      return { id: String(j.id), key: j.key, projectKey: j.fields?.project?.key ?? null, summary: j.fields?.summary ?? '', description: j.fields?.description ?? null };
    },
    /** Which of these issue ids can the CALLING USER see? Returns Map(id → {key, summary, projectKey}). */
    async visibleIssues(ids) {
      const out = new Map();
      const clean = ids.filter((x) => /^\d{1,18}$/.test(String(x)));
      for (let i = 0; i < clean.length; i += 100) {
        const chunk = clean.slice(i, i + 100);
        const j = await getJson(route`/rest/api/3/search/jql`, { method: 'POST', body: { jql: `id in (${chunk.join(',')})`, fields: ['summary', 'project'], maxResults: 100 } });
        for (const is of j.issues ?? []) out.set(String(is.id), { key: is.key, summary: is.fields?.summary ?? '', projectKey: is.fields?.project?.key ?? null });
      }
      return out;
    },
    /** Fields needed by the panel: proves the user can browse the issue. */
    async getIssueIdentity(idOrKey) {
      const j = await getJson(route`/rest/api/3/issue/${idOrKey}?fields=project,issuetype`);
      return { id: String(j.id), key: j.key, projectKey: j.fields?.project?.key ?? null };
    },
    /** Fields needed by the Margin document view. */
    async getIssueDocument(idOrKey) {
      const j = await getJson(route`/rest/api/3/issue/${idOrKey}?fields=summary,description,status,project,issuetype`);
      return {
        id: String(j.id),
        key: j.key,
        summary: j.fields?.summary ?? '',
        description: j.fields?.description ?? null,
        status: j.fields?.status?.name ?? null,
        statusCategory: j.fields?.status?.statusCategory?.key ?? null,
        projectKey: j.fields?.project?.key ?? null,
        projectName: j.fields?.project?.name ?? null,
        issueType: j.fields?.issuetype?.name ?? null,
      };
    },
    /** Jira global ADMINISTER permission for the calling user. */
    async isJiraAdmin() {
      const j = await getJson(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
      return j?.permissions?.ADMINISTER?.havePermission === true;
    },
  };
}
