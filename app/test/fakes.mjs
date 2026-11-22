// In-memory repositories with the SAME conditional semantics as src/backend/repositories/sql-repositories.js
// (each method models one atomic SQL statement: INSERT IGNORE or UPDATE ... WHERE <precondition>).
// Used to test pipeline logic; real SQL behaviour is additionally checked live (see M2 results doc).

export function createFakeRepos() {
  const items = new Map();
  const scr = new Map();
  const use = new Map();
  const counters = { screeningInserts: 0 };

  const workItems = {
    async recordEvent({ issueId, issueKey, projectKey, now, contentChange }) {
      const r = items.get(issueId);
      if (!r) {
        items.set(issueId, { issue_id: issueId, issue_key: issueKey, project_key: projectKey, state: 'QUEUED', outcome: null, screening_id: null, screened_fp: null, request_seq: 1, processed_seq: 0, lease_token: null, lease_until: null, attempts: 0, last_error: null, last_event_at: now, manual_request_at: null, version: 0, created_at: now, updated_at: now });
        return 1;
      }
      r.request_seq += 1;
      Object.assign(r, { issue_key: issueKey, project_key: projectKey, last_event_at: now, updated_at: now });
      if (contentChange && ['SCREENED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'QUEUED';
      return r.request_seq;
    },
    async requestManual({ issueId, issueKey, projectKey, now, minIntervalMs }) {
      if (!items.has(issueId)) items.set(issueId, { issue_id: issueId, issue_key: issueKey, project_key: projectKey, state: 'QUEUED', outcome: null, screening_id: null, screened_fp: null, request_seq: 0, processed_seq: 0, lease_token: null, lease_until: null, attempts: 0, last_error: null, manual_request_at: null, version: 0, created_at: now, updated_at: now });
      const r = items.get(issueId);
      if (r.manual_request_at !== null && !(r.manual_request_at < now - minIntervalMs)) return false;
      if (r.state === 'SCREENING_FAILED') r.attempts = 0;
      if (['SCREENED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'QUEUED';
      Object.assign(r, { manual_request_at: now, request_seq: r.request_seq + 1, updated_at: now });
      return true;
    },
    async claim({ issueId, token, now, leaseMs }) {
      const r = items.get(issueId);
      if (!r || !(r.lease_until === null || r.lease_until < now)) return null;
      Object.assign(r, { lease_token: token, lease_until: now + leaseMs, attempts: r.attempts + 1, updated_at: now });
      if (['QUEUED', 'SCREENING_FAILED'].includes(r.state)) r.state = 'SCREENING';
      return { ...r };
    },
    async finalize({ issueId, token, screeningId, fp, outcome, seqAtClaim, now }) {
      const r = items.get(issueId);
      if (!r || r.lease_token !== token) return false;
      Object.assign(r, { outcome, screening_id: screeningId, screened_fp: fp, processed_seq: Math.max(r.processed_seq, seqAtClaim), state: r.request_seq > seqAtClaim ? 'QUEUED' : 'SCREENED', lease_token: null, lease_until: null, attempts: 0, last_error: null, version: r.version + 1, updated_at: now });
      return true;
    },
    async fail({ issueId, token, code, terminal, now }) {
      const r = items.get(issueId);
      if (!r || r.lease_token !== token) return false;
      Object.assign(r, { state: terminal ? 'SCREENING_FAILED' : 'QUEUED', last_error: code, lease_token: null, lease_until: null, updated_at: now });
      return true;
    },
    async release({ issueId, token, now }) {
      const r = items.get(issueId);
      if (r?.lease_token === token) Object.assign(r, { lease_token: null, lease_until: null, updated_at: now });
    },
    get: async (issueId) => (items.has(issueId) ? { ...items.get(issueId) } : null),
    listStuck: async ({ olderThan, now, limit }) => [...items.values()].filter((r) => ['QUEUED', 'SCREENING'].includes(r.state) && r.updated_at < olderThan && (r.lease_until === null || r.lease_until < now)).slice(0, limit).map((r) => ({ ...r })),
    async markFailedIfStuck({ issueId, code, now }) {
      const r = items.get(issueId);
      if (!r || !['QUEUED', 'SCREENING'].includes(r.state) || !(r.lease_until === null || r.lease_until < now)) return false;
      Object.assign(r, { state: 'SCREENING_FAILED', last_error: code, updated_at: now });
      return true;
    },
    async touch({ issueId, now }) {
      if (items.has(issueId)) items.get(issueId).updated_at = now;
    },
    async remove(issueId) {
      items.delete(issueId);
    },
    listByOutcomes: async (outcomes, states, limit) => [...items.values()].filter((r) => (outcomes.includes(r.outcome) && r.state === 'SCREENED') || states.includes(r.state)).slice(0, limit).map((r) => ({ ...r })),
    countByState: async () => Object.entries([...items.values()].reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {})).map(([state, n]) => ({ state, n })),
  };

  const screenings = {
    async insert(s) {
      if (scr.has(s.screeningId)) return false;
      counters.screeningInserts++;
      scr.set(s.screeningId, JSON.parse(JSON.stringify(s)));
      return true;
    },
    get: async (id) => (scr.has(id) ? JSON.parse(JSON.stringify(scr.get(id))) : null),
    getMany: async (ids) => ids.filter((id) => scr.has(id)).map((id) => ({ screening_id: id, ...JSON.parse(JSON.stringify(scr.get(id))) })),
    async removeForIssue(issueId) {
      for (const [k, v] of scr) if (v.issueId === issueId) scr.delete(k);
    },
  };

  const usage = {
    async reserveAiCall({ day, budget }) {
      const u = use.get(day) ?? { llm_calls: 0, fallbacks: 0, screenings: 0 };
      use.set(day, u);
      if (!(u.llm_calls < budget)) return false;
      u.llm_calls++;
      return true;
    },
    async record({ day, fallback }) {
      const u = use.get(day) ?? { llm_calls: 0, fallbacks: 0, screenings: 0 };
      u.screenings++;
      if (fallback) u.fallbacks++;
      use.set(day, u);
    },
    get: async (day) => use.get(day) ?? null,
  };

  return { repos: { workItems, screenings, usage }, items, scr, use, counters };
}
