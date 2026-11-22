// Spike B: event trigger -> fetch issue -> deterministic screening -> store minimal result.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { screen } from './screen';
import { adfToText, fingerprint } from './text';

export const onIssueCreated = async (event) => {
  const key = event?.issue?.key;
  const t0 = Date.now();
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}?fields=summary,description`);
  if (!res.ok) { console.log(JSON.stringify({ spike: 'B-trigger', key, status: res.status })); return; }
  const issue = await res.json();
  const summary = issue.fields.summary ?? '';
  const description = adfToText(issue.fields.description);
  const r = screen({ summary, description });
  // Data minimisation: store outcome, categories, rule ids and short evidence + fingerprint; NOT the full description.
  await kvs.set(`screening:${key}`, {
    outcome: r.outcome, categories: r.categories, criteria: r.criteria, vendors: r.vendors,
    evidence: r.evidence.slice(0, 8).map((e) => ({ kind: e.kind, value: e.value, quote: String(e.evidence).slice(0, 120) })),
    rulesVersion: r.rulesVersion, contentFingerprint: fingerprint(summary + '\n' + description), at: new Date().toISOString(),
  });
  console.log(JSON.stringify({ spike: 'B-trigger', key, outcome: r.outcome, ms: Date.now() - t0 }));
};
