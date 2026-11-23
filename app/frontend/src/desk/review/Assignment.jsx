// Reviewer assignment. Shows the current reviewer to everyone; reviewers can assign themselves, pick
// another ACTIVE member of the reviewer group, or unassign. The server re-checks every rule
// (reviewer group, active account, optimistic sequence) — this control only reflects them.
// Reviewers are found by name search; the server returns only active reviewer-group members.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { api, newRequestId } from '../../shared/api.js';
import { copy } from '../../shared/copy/en.js';

const A = copy.review.assignment;

export function Assignment({ issueKey, review, onChanged, client = api }) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewers, setReviewers] = useState(null); // null: not searched yet; 'loading'; array
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const canAssign = review.permissions.canAssign;
  const current = review.assignee;

  const send = async (assigneeId) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await client.assign({ issueKey, assigneeId, expectedSeq: review.assignmentSeq, requestId: newRequestId() });
      setMsg({ tone: 'ok', text: r?.status === 'unchanged' ? A.unchanged : A.saved });
      setPicking(false);
      onChanged?.();
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
      if (e?.code === 'CONFLICT') onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const search = async (e) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setReviewers('loading');
    setChoice('');
    setMsg(null);
    try {
      const r = await client.reviewers(query.trim());
      setReviewers(r.reviewers);
      if (r.reviewers.length === 1) setChoice(r.reviewers[0].accountId);
    } catch (err) {
      setReviewers([]);
      setMsg({ tone: 'error', text: err?.message ?? copy.common.errorTitle });
    }
  };

  return (
    <section className="a25-assign" aria-labelledby="a25-assign-title">
      <h3 id="a25-assign-title" className="a25-zone__subtitle">
        {A.title}
      </h3>
      <p className="a25-assign__current">
        {current ? (
          <>
            {current.name}
            {current.active === false ? <span className="a25-subtle"> ({A.inactive})</span> : null}
          </>
        ) : (
          <span className="a25-subtle">{A.none}</span>
        )}
      </p>
      {canAssign ? (
        <div className="a25-assign__actions">
          {!picking ? (
            <>
              <Button appearance="subtle" isDisabled={busy} onClick={() => send('me')}>
                {A.assignMe}
              </Button>
              <Button appearance="subtle" isDisabled={busy} onClick={() => setPicking(true)}>
                {A.assignTo}
              </Button>
              {current ? (
                <Button appearance="subtle" isDisabled={busy} onClick={() => send(null)}>
                  {A.unassign}
                </Button>
              ) : null}
            </>
          ) : (
            <div className="a25-assign__picker">
              <form className="a25-assign__search" onSubmit={search} role="search">
                <label htmlFor="a25-assign-q" className="a25-field__label">
                  {A.searchLabel}
                </label>
                <span className="a25-openitem__row">
                  <input id="a25-assign-q" className="a25-input" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={50} autoComplete="off" aria-describedby="a25-assign-hint" />
                  <Button type="submit" isDisabled={query.trim().length < 2}>
                    {A.search}
                  </Button>
                </span>
                <span id="a25-assign-hint" className="a25-subtlest a25-small">
                  {A.searchHint}
                </span>
              </form>
              {reviewers === 'loading' ? (
                <span role="status" className="a25-subtle a25-small">
                  {A.loading}
                </span>
              ) : Array.isArray(reviewers) && reviewers.length === 0 ? (
                <span role="status" className="a25-subtle a25-small">
                  {A.noReviewers}
                </span>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (choice) send(choice);
                }}
              >
                {Array.isArray(reviewers) && reviewers.length ? (
                  <div className="a25-assign__choose">
                    <label htmlFor="a25-assign-select" className="a25-field__label">
                      {A.choose}
                    </label>
                    <select id="a25-assign-select" className="a25-input a25-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
                      <option value="">—</option>
                      {reviewers.map((r) => (
                        <option key={r.accountId} value={r.accountId}>
                          {r.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <span className="a25-assign__row">
                  <Button type="submit" appearance="primary" isDisabled={busy || !choice}>
                    {A.assign}
                  </Button>
                  <Button appearance="subtle" onClick={() => setPicking(false)}>
                    {copy.review.decision.cancel}
                  </Button>
                </span>
              </form>
            </div>
          )}
        </div>
      ) : null}
      {msg ? (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'a25-field-error' : 'a25-subtle a25-small'}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
