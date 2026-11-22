// Review history: decisions (human and system) and assignments, newest first. Nothing here can be
// edited. System records explain WHY an approval was invalidated or carried over. Reviewers can ask
// the server to verify the signed decision record.
import { useState } from 'react';
import { api } from '../../shared/api.js';
import { StatusLozenge } from '../../shared/components/States.jsx';
import { copy } from '../../shared/copy/en.js';
import { relativeTime } from '../../shared/findings.js';

const H = copy.review.history;
const F = copy.findings;

const absolute = (ms) => (ms ? new Date(Number(ms)).toLocaleString() : '');

function addedLabels(added = {}) {
  const out = [];
  for (const c of added.categories ?? []) out.push(F.categories[c] ?? c);
  for (const c of added.criteria ?? []) out.push(F.criteria[c] ?? c);
  for (const r of added.recipients ?? []) out.push(F.sharedWith(r));
  for (const t of added.transfers ?? []) out.push(F.transferTo(t));
  return out;
}

function When({ ms }) {
  return (
    <time className="a25-subtlest a25-small" dateTime={ms ? new Date(Number(ms)).toISOString() : undefined} title={absolute(ms)}>
      {relativeTime(ms)}
    </time>
  );
}

function DecisionEntry({ d }) {
  const system = d.kind === 'system';
  const label = d.decision === 'APPROVAL_INVALIDATED' ? 'APPROVAL_STALE' : d.decision === 'APPROVAL_RECONFIRMED' ? d.detail?.carried ?? 'APPROVED' : d.decision;
  const added = addedLabels(d.detail?.added);
  return (
    <li className={`a25-history__entry${system ? ' a25-history__entry--system' : ''}`}>
      <div className="a25-history__head">
        <StatusLozenge state={label} />
        <span className="a25-small">{system ? H.system : H.decidedBy(d.decidedBy?.name ?? '')}</span>
        <When ms={d.decidedAt} />
      </div>
      {d.decision === 'APPROVAL_INVALIDATED' ? (
        <div className="a25-small">
          <p>{H.invalidated}</p>
          {added.length ? (
            <p className="a25-subtle">
              {H.added}: {added.join(', ')}
            </p>
          ) : null}
          {d.detail?.escalated ? <p className="a25-subtle">{H.escalated(copy.states[d.detail.from] ?? d.detail.from, copy.states[d.detail.to] ?? d.detail.to)}</p> : null}
        </div>
      ) : null}
      {d.decision === 'APPROVAL_RECONFIRMED' ? <p className="a25-small">{H.reconfirmed(copy.states[d.detail?.carried] ?? copy.states.APPROVED)}</p> : null}
      {d.rationale ? <p className="a25-history__rationale">{d.rationale}</p> : null}
      {d.conditions?.length ? (
        <div className="a25-small">
          <span className="a25-subtle">{H.conditions}</span>
          <ul className="a25-history__list">
            {d.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.questions?.length ? (
        <div className="a25-small">
          <span className="a25-subtle">{H.questions}</span>
          <ul className="a25-history__list">
            {d.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <span className="a25-subtlest a25-small a25-mono">{H.contentRef(d.contentRef)}</span>
    </li>
  );
}

function AssignmentEntry({ a }) {
  return (
    <li className="a25-history__entry a25-history__entry--minor">
      <div className="a25-history__head">
        <span className="a25-small">{H.assigned(a.assignee?.name, a.assignedBy?.name ?? '')}</span>
        <When ms={a.assignedAt} />
      </div>
    </li>
  );
}

export function History({ issueKey, review, client = api }) {
  const [verify, setVerify] = useState(null);
  const [busy, setBusy] = useState(false);
  const entries = [...review.decisions.map((d) => ({ at: d.decidedAt, key: `d${d.seq}`, el: <DecisionEntry key={`d${d.seq}`} d={d} /> })), ...review.assignments.map((a) => ({ at: a.assignedAt, key: `a${a.seq}`, el: <AssignmentEntry key={`a${a.seq}`} a={a} /> }))].sort((x, y) => y.at - x.at);

  const runVerify = async () => {
    setBusy(true);
    try {
      const r = await client.verifyRecord(issueKey);
      setVerify({ status: r.status });
    } catch (e) {
      setVerify({ status: 'error', message: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="a25-history" aria-labelledby="a25-history-title">
      <h3 id="a25-history-title" className="a25-zone__subtitle">
        {H.title}
      </h3>
      {entries.length ? <ol className="a25-history__list a25-history__timeline">{entries.map((e) => e.el)}</ol> : <p className="a25-subtle a25-small">{H.empty}</p>}
      {review.permissions.isReviewer && review.decisions.length ? (
        <div className="a25-history__verify">
          <button type="button" className="a25-linkbutton a25-small" onClick={runVerify} disabled={busy}>
            {busy ? H.verifying : H.verify}
          </button>
          {verify ? (
            <p role="status" className={`a25-small ${verify.status === 'problem' || verify.status === 'error' ? 'a25-field-error' : 'a25-subtle'}`}>
              {verify.status === 'error' ? verify.message : H.verifyResult[verify.status]}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
