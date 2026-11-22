// Reviewer assignment. Shows the current reviewer to everyone; reviewers can assign themselves, pick
// another ACTIVE member of the reviewer group, or unassign. The server re-checks every rule
// (reviewer group, active account, optimistic sequence) — this control only reflects them.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { api, newRequestId } from '../../shared/api.js';
import { copy } from '../../shared/copy/en.js';

const A = copy.review.assignment;

export function Assignment({ issueKey, review, onChanged, client = api }) {
  const [picking, setPicking] = useState(false);
  const [reviewers, setReviewers] = useState(null);
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

  const openPicker = async () => {
    setPicking(true);
    if (reviewers) return;
    try {
      const r = await client.reviewers();
      setReviewers(r.reviewers.filter((x) => x.active));
    } catch (e) {
      setReviewers([]);
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
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
              <Button appearance="subtle" isDisabled={busy} onClick={openPicker}>
                {A.assignTo}
              </Button>
              {current ? (
                <Button appearance="subtle" isDisabled={busy} onClick={() => send(null)}>
                  {A.unassign}
                </Button>
              ) : null}
            </>
          ) : (
            <form
              className="a25-assign__picker"
              onSubmit={(e) => {
                e.preventDefault();
                if (choice) send(choice);
              }}
            >
              <label htmlFor="a25-assign-select" className="a25-visually-hidden">
                {A.choose}
              </label>
              {reviewers === null ? (
                <span role="status" className="a25-subtle a25-small">
                  {A.loading}
                </span>
              ) : reviewers.length === 0 ? (
                <span className="a25-subtle a25-small">{A.noReviewers}</span>
              ) : (
                <select id="a25-assign-select" className="a25-input a25-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="">{A.choose}</option>
                  {reviewers.map((r) => (
                    <option key={r.accountId} value={r.accountId}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              )}
              <span className="a25-assign__row">
                <Button type="submit" appearance="primary" isDisabled={busy || !choice}>
                  {A.assign}
                </Button>
                <Button appearance="subtle" onClick={() => setPicking(false)}>
                  {copy.review.decision.cancel}
                </Button>
              </span>
            </form>
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
