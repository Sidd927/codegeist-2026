// Jira issue panel: the primary integration surface (UX_DESIGN_SPEC §3.1).
// Renders the backend's screening state for the context issue. It never decides a privacy outcome;
// loading, failed and unavailable states are always visually distinct from results.
import { useEffect, useState } from 'react';
import Button from '@atlaskit/button/new';
import { api } from '../shared/api.js';
import { useResource, usePolling } from '../shared/useResource.js';
import { getContext, openDesk, reportFirstContent } from '../shared/platform.js';
import { Skeleton, ErrorState, StatusHeader } from '../shared/components/States.jsx';
import { ModeNote, RuleTrace, DeltaChips, FindingsList, OpenQuestions, CheckedAt } from '../shared/components/Screening.jsx';
import { whyLine, relativeTime } from '../shared/findings.js';
import { StatusLozenge } from '../shared/components/States.jsx';
import { copy } from '../shared/copy/en.js';

const S = copy.screening;

/** Compact review summary: derived status, latest decision and reviewer (names only). */
function ReviewSummary({ review }) {
  if (!review || review.status === 'NOT_REQUIRED' || review.status === 'NOT_SCREENED' || review.status === 'AWAITING_SCREENING') return null;
  const latest = review.latest;
  return (
    <div className="a25-panel__review" aria-label={copy.panel.reviewLabel} role="group">
      <span className="a25-status__line">
        <span className="a25-small a25-subtle">{copy.panel.reviewLabel}</span>
        <StatusLozenge state={review.status} />
      </span>
      {latest ? <span className="a25-small a25-subtle">{copy.panel.latest(copy.states[latest.kind === 'system' ? (latest.decision === 'APPROVAL_INVALIDATED' ? 'APPROVAL_STALE' : latest.detail?.carried ?? 'APPROVED') : latest.decision], latest.decidedBy?.name, relativeTime(latest.decidedAt))}</span> : null}
      {review.assignee ? <span className="a25-small a25-subtle">{copy.panel.reviewer(review.assignee.name)}</span> : null}
    </div>
  );
}

function RecheckButton({ onRecheck, label = S.recheck }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  return (
    <span className="a25-recheck">
      <Button
        appearance="subtle"
        isDisabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await onRecheck();
            setMsg(r?.status === 'rate_limited' ? S.recheckRateLimited : S.recheckQueued);
          } catch (e) {
            setMsg(e?.message ?? copy.common.errorTitle);
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
      {msg ? (
        <span role="status" className="a25-subtle a25-small">
          {msg}
        </span>
      ) : null}
    </span>
  );
}

export function PanelView({ resource, onOpenDesk, onRecheck }) {
  const { status, data, error, reload, refresh } = resource;
  const view = data?.screening;
  const pollingGaveUp = usePolling(status === 'success' && view?.state === 'SCREENING', refresh);

  useEffect(() => {
    if (status !== 'loading') reportFirstContent('panel');
  }, [status]);

  if (status === 'loading' && !data) return <Skeleton lines={3} />;
  if (status === 'error') return <ErrorState error={error} onRetry={reload} title={copy.panel.errorBody} />;
  if (data.access === 'denied') return <p className="a25-panel__denied a25-subtle">{copy.panel.denied}</p>;

  const { state, result } = view;
  const recheck = onRecheck ? async () => {
    const r = await onRecheck();
    if (r?.status === 'queued') refresh();
    return r;
  } : null;
  const openButton = onOpenDesk ? (
    <Button appearance="default" onClick={() => onOpenDesk(data.issue.key)}>
      {copy.common.openInDesk}
    </Button>
  ) : null;

  if (state === 'OUT_OF_SCOPE') return <p className="a25-subtle a25-small">{S.outOfScope}</p>;

  if (state === 'NOT_SCREENED') {
    return (
      <section className="a25-panel" aria-label={copy.panel.title}>
        <StatusHeader state="NOT_SCREENED" why={S.notScreened} />
        <div className="a25-panel__actions">{recheck ? <RecheckButton onRecheck={recheck} label={S.checkNow} /> : null}</div>
      </section>
    );
  }

  if (state === 'SCREENING') {
    return (
      <section className="a25-panel" aria-label={copy.panel.title} aria-busy="true">
        <StatusHeader state="SCREENING" why={S.checking}>
          {pollingGaveUp ? (
            <p className="a25-subtle a25-small">
              {S.slow}{' '}
              <button type="button" className="a25-linkbutton" onClick={refresh}>
                {S.refresh}
              </button>
            </p>
          ) : null}
        </StatusHeader>
      </section>
    );
  }

  if (state === 'SCREENING_FAILED') {
    return (
      <section className="a25-panel" aria-label={copy.panel.title}>
        <StatusHeader state="SCREENING_FAILED" why={S.failed} />
        <div className="a25-panel__actions">{recheck ? <RecheckButton onRecheck={recheck} /> : null}</div>
      </section>
    );
  }

  // A completed result (possibly out of date if the text has changed since).
  const stale = state === 'RESCREEN_REQUIRED';
  return (
    <section className="a25-panel" aria-label={copy.panel.title}>
      <StatusHeader state={stale ? 'RESCREEN_REQUIRED' : result.outcome} why={stale ? (view.reason === 'pipeline_changed' ? S.rescreenPipeline : S.rescreen) : whyLine(result)}>
        {stale ? <p className="a25-subtle a25-small">{S.previousResult}: {copy.states[result.outcome]}</p> : null}
        <ModeNote result={result} />
      </StatusHeader>
      <ReviewSummary review={data.review} />
      <DeltaChips findings={result.findings} />
      <FindingsList findings={result.findings} />
      <OpenQuestions findings={result.findings} />
      {result.truncated ? <p className="a25-subtle a25-small">{S.truncated}</p> : null}
      <div className="a25-panel__meta">
        <CheckedAt result={result} />
        <RuleTrace result={result} />
      </div>
      <div className="a25-panel__actions">
        {openButton}
        {recheck ? <RecheckButton onRecheck={recheck} /> : null}
      </div>
    </section>
  );
}

export default function PanelApp() {
  const resource = useResource(() => api.panelState(), []);
  const [context, setContext] = useState(null);

  useEffect(() => {
    getContext().then(setContext);
  }, []);

  const onOpenDesk = context ? (key) => openDesk(context, `/review/${encodeURIComponent(key)}`) : null;
  return <PanelView resource={resource} onOpenDesk={onOpenDesk} onRecheck={() => api.rescreen()} />;
}
