// Review workspace (UX_DESIGN_SPEC §3.4): Document · Margin · Decision.
// Highlights come from server-verified offsets and are only drawn when the current text is exactly
// the screened text. The decision zone renders the server's review block: status, reviewer,
// decision form (only when the server says this user may decide) and the append-only history.
import { useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { api } from '../../shared/api.js';
import { useResource, usePolling } from '../../shared/useResource.js';
import { openIssue } from '../../shared/platform.js';
import { Skeleton, ErrorState, EmptyState, StatusLozenge } from '../../shared/components/States.jsx';
import { EvidenceDocument, MarginNotes } from '../../shared/components/Margin.jsx';
import { ModeNote, RuleTrace, DeltaChips, OpenQuestions, CheckedAt } from '../../shared/components/Screening.jsx';
import { toNote, toneOf, rangesFrom, whyLine } from '../../shared/findings.js';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';
import { ProcessingSummary } from '../review/ProcessingSummary.jsx';
import { Assignment } from '../review/Assignment.jsx';
import { DecisionForm } from '../review/DecisionForm.jsx';
import { History } from '../review/History.jsx';

const S = copy.screening;
const LABELS = { document: copy.review.documentLabel, summary: copy.review.summaryHeading, description: copy.review.descriptionHeading, noDescription: copy.review.noDescription };

function DecisionZone({ issueKey, review, onChanged }) {
  return (
    <section className="a25-zone a25-zone--decision" aria-labelledby="a25-decision-title">
      <h2 id="a25-decision-title" className="a25-zone__title">
        {copy.review.decision.title}
      </h2>
      {!review ? (
        <p className="a25-decision__reason a25-small">{copy.review.decision.unavailable.OUT_OF_SCOPE}</p>
      ) : (
        <>
          <div className="a25-review-status">
            <span className="a25-small a25-subtle">{copy.review.reviewStatusLabel}</span>
            <StatusLozenge state={review.status} />
          </div>
          {review.approvedForContent ? <p className="a25-subtle a25-small">{copy.review.decision.currentApproval(copy.states[review.status])}</p> : null}
          <Assignment issueKey={issueKey} review={review} onChanged={onChanged} />
          <div className="a25-zone__divider" />
          <DecisionForm issueKey={issueKey} review={review} onRecorded={onChanged} />
          <div className="a25-zone__divider" />
          <History issueKey={issueKey} review={review} />
        </>
      )}
    </section>
  );
}

function MarginZone({ screening, activeId, onActivate, onRecheck }) {
  const { state, result } = screening;
  if (state === 'NOT_SCREENED' || state === 'OUT_OF_SCOPE') {
    return (
      <EmptyState headingLevel={3} title={copy.review.marginNotScreenedTitle} body={state === 'OUT_OF_SCOPE' ? S.outOfScope : copy.review.marginNotScreenedBody}>
        {state === 'NOT_SCREENED' && onRecheck ? <Button onClick={onRecheck}>{S.checkNow}</Button> : null}
      </EmptyState>
    );
  }
  if (!result) {
    return state === 'SCREENING' ? <Skeleton lines={4} label={S.checking} /> : <EmptyState headingLevel={3} title={copy.states.SCREENING_FAILED} body={S.failed} />;
  }
  const notes = result.findings.filter((f) => f.excerpt && f.index).map(toNote);
  return (
    <div className="a25-margin">
      <p className="a25-margin__why">{whyLine(result)}</p>
      <ModeNote result={result} />
      <DeltaChips findings={result.findings} />
      {notes.length ? <MarginNotes idPrefix="a25-rv" notes={notes} activeId={activeId} onActivate={onActivate} newLabel={copy.findings.new} /> : <p className="a25-subtle">{S.noFindings}</p>}
      {!screening.marksValid ? <p className="a25-subtle a25-small">{copy.review.marksHidden}</p> : null}
      <OpenQuestions findings={result.findings} />
      <ProcessingSummary result={result} onActivate={onActivate} />
      {result.truncated ? <p className="a25-subtle a25-small">{S.truncated}</p> : null}
      <div className="a25-margin__meta">
        <CheckedAt result={result} />
        <RuleTrace result={result} />
      </div>
    </div>
  );
}

export function ReviewView({ resource, onBack, onOpenIssue, onRecheck }) {
  const [tab, setTab] = useState('text');
  const [activeId, setActiveId] = useState(null);
  const [recheckMsg, setRecheckMsg] = useState(null);
  const { status, data, error, reload, refresh } = resource;
  usePolling(status === 'success' && data?.screening?.state === 'SCREENING', refresh);

  const result = data?.screening?.result ?? null;
  const findings = useMemo(() => result?.findings ?? [], [result]);
  const marks = useMemo(() => findings.filter((f) => f.source && f.index).map((f) => ({ id: f.id, index: f.index, tone: toneOf(f) })), [findings]);
  const ranges = useMemo(() => (data?.screening?.marksValid ? rangesFrom(findings) : []), [data, findings]);

  if (status === 'loading' && !data) {
    return (
      <div className="a25-page a25-review">
        <Skeleton lines={2} />
        <div className="a25-review__zones">
          <div className="a25-zone">
            <Skeleton lines={6} />
          </div>
          <div className="a25-zone">
            <Skeleton lines={4} />
          </div>
          <div className="a25-zone">
            <Skeleton lines={4} />
          </div>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    if (error?.code === 'NOT_FOUND' || error?.code === 'INVALID_INPUT') {
      return (
        <div className="a25-page">
          <EmptyState headingLevel={1} title={copy.review.notFoundTitle} body={copy.review.notFoundBody}>
            <Button onClick={onBack}>{copy.review.back}</Button>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="a25-page">
        <h1 tabIndex={-1} className="a25-visually-hidden">
          {copy.common.errorTitle}
        </h1>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { issue, document: doc, screening, review } = data;
  const displayState = screening.state;
  const recheck = onRecheck
    ? async () => {
        try {
          const r = await onRecheck(issue.key);
          setRecheckMsg(r?.status === 'rate_limited' ? S.recheckRateLimited : S.recheckQueued);
          if (r?.status === 'queued') refresh();
        } catch (e) {
          setRecheckMsg(e?.message ?? copy.common.errorTitle);
        }
      }
    : null;

  return (
    <div className="a25-page a25-review">
      <div className="a25-review__head">
        <button type="button" className="a25-linkbutton a25-small" onClick={onBack}>
          ← {copy.review.back}
        </button>
        <div className="a25-review__titleline">
          <span className="a25-mono a25-review__key">{issue.key}</span>
          <h1 tabIndex={-1} className="a25-page__title a25-review__title">
            {issue.summary}
          </h1>
          <StatusLozenge state={displayState} />
          {review && review.status !== displayState ? <StatusLozenge state={review.status} /> : null}
          <span className="a25-review__open">
            {recheck && displayState !== 'SCREENING' && displayState !== 'OUT_OF_SCOPE' ? (
              <Button appearance="subtle" onClick={recheck}>
                {S.recheck}
              </Button>
            ) : null}
            <Button appearance="subtle" onClick={() => onOpenIssue(issue.key)}>
              {copy.common.openInJira}
            </Button>
          </span>
        </div>
        <p className="a25-subtle a25-small">{[issue.projectName, issue.issueType, issue.status].filter(Boolean).join(' · ')}</p>
        {recheckMsg ? (
          <p role="status" className="a25-subtle a25-small">
            {recheckMsg}
          </p>
        ) : null}
      </div>

      {displayState === 'SCREENING' ? <SectionMessage appearance="information">{S.checking}</SectionMessage> : null}
      {displayState === 'RESCREEN_REQUIRED' ? <SectionMessage appearance="warning">{screening.reason === 'pipeline_changed' ? S.rescreenPipeline : S.rescreen}</SectionMessage> : null}
      {displayState === 'SCREENING_FAILED' ? <SectionMessage appearance="error">{S.failed}</SectionMessage> : null}

      <div className="a25-review__tabs" role="group" aria-label={copy.review.tabsLabel}>
        <button type="button" className="a25-segmented__item" aria-pressed={tab === 'text'} onClick={() => setTab('text')}>
          {copy.review.tabText}
        </button>
        <button type="button" className="a25-segmented__item" aria-pressed={tab === 'findings'} onClick={() => setTab('findings')}>
          {copy.review.tabFindings(findings.filter((f) => f.index).length)}
        </button>
      </div>

      <div className="a25-review__zones" data-tab={tab}>
        <section className="a25-zone a25-zone--document" aria-labelledby="a25-doc-title">
          <h2 id="a25-doc-title" className="a25-zone__title">
            {copy.review.documentLabel}
          </h2>
          <EvidenceDocument idPrefix="a25-rv" summary={doc.summary} blocks={doc.blocks} marks={marks} ranges={ranges} activeId={activeId} labels={LABELS} />
          {doc.truncated ? <p className="a25-subtle a25-small">{copy.review.truncated}</p> : null}
        </section>

        <section className="a25-zone a25-zone--margin" aria-labelledby="a25-margin-title">
          <h2 id="a25-margin-title" className="a25-zone__title">
            {copy.review.marginLabel}
          </h2>
          <MarginZone screening={screening} activeId={activeId} onActivate={setActiveId} onRecheck={recheck} />
        </section>

        <DecisionZone issueKey={issue.key} review={review} onChanged={refresh} />
      </div>
    </div>
  );
}

export function Review({ issueKey }) {
  const { navigate } = useRouter();
  const resource = useResource(() => api.workspace(issueKey), [issueKey]);
  return <ReviewView resource={resource} onBack={() => navigate('/inbox')} onOpenIssue={openIssue} onRecheck={(key) => api.rescreen(key)} />;
}
