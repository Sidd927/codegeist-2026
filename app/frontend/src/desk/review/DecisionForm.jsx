// Decision form. The server decides whether this user may decide and validates every field; the form
// mirrors those rules only to give early feedback. Each submission carries:
//  - the evidence binding (screening id + content fingerprint) the reviewer is looking at,
//  - the last decision sequence they saw (optimistic concurrency),
//  - a request id reused across retries of the same submission (idempotency).
import { useRef, useState } from 'react';
import { api, newRequestId } from '../../shared/api.js';
import { copy } from '../../shared/copy/en.js';
import { Button, SectionMessage } from '../../shared/components/ui.jsx';

const D = copy.review.decision;
export const DECISIONS = ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'NEEDS_MORE_INFORMATION', 'REJECTED'];
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** Early, non-authoritative checks with the same codes the server returns. */
export function precheck({ decision, rationale, conditions, questions }) {
  const errors = {};
  if (!DECISIONS.includes(decision)) errors.decision = 'choose_decision';
  const r = clean(rationale);
  if (r.length < 10) errors.rationale = 'rationale_too_short';
  else if (r.length > 2000) errors.rationale = 'rationale_too_long';
  const list = (items) => items.map(clean).filter(Boolean);
  if (decision === 'APPROVED_WITH_CONDITIONS' && list(conditions).length === 0) errors.conditions = 'conditions_required';
  if (decision === 'NEEDS_MORE_INFORMATION' && list(questions).length === 0) errors.questions = 'questions_required';
  return errors;
}

function ListEditor({ id, label, kind, items, setItems, error, addLabel }) {
  const errId = `${id}-error`;
  return (
    <fieldset className="a25-listedit" aria-describedby={error ? errId : undefined}>
      <legend className="a25-field__label">{label}</legend>
      <ol className="a25-listedit__items">
        {items.map((v, i) => (
          <li key={i} className="a25-listedit__item">
            <label htmlFor={`${id}-${i}`} className="a25-visually-hidden">
              {D.itemLabel(kind, i + 1)}
            </label>
            <input
              id={`${id}-${i}`}
              className="a25-input"
              value={v}
              maxLength={300}
              aria-invalid={error ? 'true' : undefined}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {items.length > 1 ? (
              <button type="button" className="a25-iconbutton" aria-label={D.remove(i + 1)} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {items.length < 10 ? (
        <button type="button" className="a25-linkbutton a25-small" onClick={() => setItems([...items, ''])}>
          + {addLabel}
        </button>
      ) : null}
      {error ? (
        <p id={errId} className="a25-field-error">
          {D.fieldErrors[error] ?? error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function DecisionForm({ issueKey, review, onRecorded, client = api }) {
  const [decision, setDecision] = useState(null);
  const [rationale, setRationale] = useState('');
  const [conditions, setConditions] = useState(['']);
  const [questions, setQuestions] = useState(['']);
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { tone, text, reload? }
  const requestId = useRef(newRequestId());
  const { permissions, binding } = review;

  if (!permissions.canDecide) {
    return (
      <div className="a25-decision__unavailable">
        <p className="a25-decision__reason a25-small" id="a25-decision-reason">
          {D.unavailable[permissions.decideReason] ?? D.unavailable.STALE_EVIDENCE}
        </p>
      </div>
    );
  }

  const reset = () => {
    setDecision(null);
    setRationale('');
    setConditions(['']);
    setQuestions(['']);
    setErrors({});
    setConfirming(false);
    requestId.current = newRequestId();
  };

  const submit = async (e) => {
    e?.preventDefault();
    setResult(null);
    const input = { decision, rationale, conditions: decision === 'APPROVED_WITH_CONDITIONS' ? conditions.map(clean).filter(Boolean) : [], questions: decision === 'NEEDS_MORE_INFORMATION' ? questions.map(clean).filter(Boolean) : [] };
    const pre = precheck({ decision, rationale, conditions, questions });
    setErrors(pre);
    if (Object.keys(pre).length) return;
    if (decision === 'REJECTED' && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      const r = await client.decide({ issueKey, input, screeningId: binding.screeningId, fp: binding.fp, expectedSeq: review.latestSeq, requestId: requestId.current });
      setResult({ tone: 'ok', text: r?.status === 'unchanged' ? D.duplicate : D.recorded });
      reset();
      onRecorded?.();
    } catch (err) {
      setConfirming(false);
      if (err?.fields) setErrors(err.fields);
      setResult({ tone: 'error', text: err?.message ?? copy.common.errorTitle, reload: err?.code === 'CONFLICT' || err?.code === 'STALE_EVIDENCE' });
    } finally {
      setBusy(false);
    }
  };

  // Conditional approvals block protected transitions until a reviewer confirms the conditions are met
  // (by recording APPROVED for the current text). This shortcut prefills that decision; nothing is sent
  // until the reviewer submits it.
  const latest = review.decisions?.[0];
  const pendingConditions = review.status === 'APPROVED_WITH_CONDITIONS' ? (latest?.decision === 'APPROVED_WITH_CONDITIONS' || latest?.decision === 'APPROVAL_RECONFIRMED' ? latest.conditions : []) : [];
  const prefillConfirmation = () => {
    setDecision('APPROVED');
    setRationale(D.conditionsRationale(pendingConditions));
    setErrors({});
    setConfirming(false);
  };

  return (
    <form className="a25-decision-form" onSubmit={submit} noValidate aria-describedby="a25-binding-note">
      {pendingConditions?.length ? (
        <div className="a25-decision__confirm">
          <Button appearance="default" onClick={prefillConfirmation}>
            {D.confirmConditions}
          </Button>
          <span className="a25-subtle a25-small">{D.confirmConditionsHint}</span>
        </div>
      ) : null}
      <fieldset className="a25-decision" aria-describedby={errors.decision ? 'a25-decision-err' : undefined}>
        <legend className="a25-field__label">{D.legend}</legend>
        {DECISIONS.map((d) => (
          <label key={d} className={`a25-radio a25-radio--${d.toLowerCase()}`}>
            <input
              type="radio"
              name="a25-decision"
              value={d}
              checked={decision === d}
              onChange={() => {
                setDecision(d);
                setConfirming(false);
                setErrors({});
              }}
            />
            <span className="a25-radio__text">
              <span>{D.options[d]}</span>
              {decision === d ? <span className="a25-subtle a25-small a25-block">{D.hints[d]}</span> : null}
            </span>
          </label>
        ))}
        {errors.decision ? (
          <p id="a25-decision-err" className="a25-field-error">
            {D.fieldErrors[errors.decision]}
          </p>
        ) : null}
      </fieldset>

      {decision === 'APPROVED_WITH_CONDITIONS' ? <ListEditor id="a25-cond" label={D.conditions} kind={D.conditions} items={conditions} setItems={(v) => { setConditions(v); if (errors.conditions) setErrors(({ conditions: _c, ...rest }) => rest); }} error={errors.conditions} addLabel={D.addCondition} /> : null}
      {decision === 'NEEDS_MORE_INFORMATION' ? <ListEditor id="a25-q" label={D.questions} kind={D.questions} items={questions} setItems={(v) => { setQuestions(v); if (errors.questions) setErrors(({ questions: _q, ...rest }) => rest); }} error={errors.questions} addLabel={D.addQuestion} /> : null}

      <div className="a25-field">
        <label htmlFor="a25-rationale" className="a25-field__label">
          {D.rationale}
        </label>
        <textarea
          id="a25-rationale"
          className="a25-input a25-textarea"
          rows={4}
          maxLength={2000}
          value={rationale}
          onChange={(e) => {
            setRationale(e.target.value);
            if (errors.rationale) setErrors(({ rationale: _r, ...rest }) => rest);
          }}
          aria-invalid={errors.rationale ? 'true' : undefined}
          aria-describedby={errors.rationale ? 'a25-rationale-err' : 'a25-rationale-hint'}
        />
        {errors.rationale ? (
          <p id="a25-rationale-err" className="a25-field-error">
            {D.fieldErrors[errors.rationale]}
          </p>
        ) : (
          <p id="a25-rationale-hint" className="a25-subtlest a25-small">
            {D.rationaleHint}
          </p>
        )}
      </div>

      <p id="a25-binding-note" className="a25-subtlest a25-small">
        {D.bindingNote(binding.fp.slice(0, 8))}
      </p>

      {confirming ? (
        <SectionMessage appearance="warning" title={D.confirmReject}>
          <p>{D.confirmRejectBody}</p>
          <span className="a25-assign__row">
            <Button appearance="danger" type="submit" isDisabled={busy}>
              {busy ? D.submitting : D.confirmReject}
            </Button>
            <Button appearance="subtle" onClick={() => setConfirming(false)}>
              {D.cancel}
            </Button>
          </span>
        </SectionMessage>
      ) : (
        <Button appearance="primary" type="submit" isDisabled={busy} shouldFitContainer>
          {busy ? D.submitting : D.submit}
        </Button>
      )}
      {result ? (
        <div role={result.tone === 'error' ? 'alert' : 'status'} className={result.tone === 'error' ? 'a25-decision__result a25-field-error' : 'a25-subtle a25-small'}>
          <span>{result.text}</span>
          {result.reload ? (
            <Button appearance="default" onClick={() => onRecorded?.()}>
              {D.reload}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
