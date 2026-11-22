// Reviewer inbox (UX_DESIGN_SPEC §3.3). Items come from the backend, already filtered to work items
// the reviewer can see in Jira, ordered by severity then age. Numbers in the strip are filters.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState, StatusLozenge } from '../../shared/components/States.jsx';
import { findingLabel, relativeTime } from '../../shared/findings.js';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';

const VIEWS = ['pending', 'needs-info', 'stale', 'all-open'];
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,99}-[1-9]\d{0,9}$/;
const I = copy.inbox;

function OpenWorkItem() {
  const { navigate } = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const key = value.trim().toUpperCase();
    if (!KEY.test(key)) return setError(I.invalidKey);
    setError(null);
    navigate(`/review/${encodeURIComponent(key)}`);
  };
  return (
    <form className="a25-openitem" onSubmit={submit} noValidate>
      <label htmlFor="a25-open-key" className="a25-openitem__label">
        {I.openReviewField}
      </label>
      <div className="a25-openitem__row">
        <input id="a25-open-key" className="a25-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="SHOP-42" autoComplete="off" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'a25-open-key-error' : 'a25-open-key-hint'} />
        <Button type="submit" appearance="primary">
          {I.openReviewSubmit}
        </Button>
      </div>
      {error ? (
        <p id="a25-open-key-error" className="a25-field-error" role="alert">
          {error}
        </p>
      ) : (
        <p id="a25-open-key-hint" className="a25-subtlest a25-small">
          {I.openReviewHint}
        </p>
      )}
    </form>
  );
}

function SummaryStrip({ counts, onView }) {
  if (!counts) return null;
  const days = counts.oldestPendingMs ? Math.max(1, Math.round(counts.oldestPendingMs / 86_400_000)) : null;
  const stat = (label, value, view) => (
    <li>
      <button type="button" className="a25-stat" onClick={() => onView(view)}>
        <span className="a25-stat__value">{value}</span>
        <span className="a25-stat__label a25-small">{label}</span>
      </button>
    </li>
  );
  return (
    <ul className="a25-strip" aria-label={I.stripLabel}>
      {stat(I.strip.pending, counts.pending, 'pending')}
      {stat(I.strip.dpiaLikely, counts.dpiaLikely, 'pending')}
      {stat(I.strip.needsInfo, counts.needsInfo, 'needs-info')}
      {stat(I.strip.oldest, days ? `${days} d` : '–', 'pending')}
    </ul>
  );
}

function InboxRow({ item, onOpen }) {
  return (
    <li className="a25-row">
      <button type="button" className="a25-row__button" onClick={() => onOpen(item.key)}>
        <span className="a25-row__line">
          <StatusLozenge state={item.state} />
          <span className="a25-mono a25-row__key">{item.key}</span>
          <span className="a25-row__summary">{item.summary}</span>
          <span className="a25-row__age a25-subtle a25-small">{relativeTime(item.updatedAt)}</span>
        </span>
        <span className="a25-row__line a25-row__line--meta">
          <span className="a25-chips">
            {item.chips.map((c, i) => (
              <span key={i} className="a25-chip">
                {findingLabel(c)}
              </span>
            ))}
          </span>
          <span className="a25-subtle a25-small">
            {I.findingsCount(item.findingCount)}
            {item.mode === 'rules' ? ` · ${I.ruleBased}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

export function InboxView({ resource, view, setView, onOpen }) {
  const { status, data, error, reload } = resource;
  return (
    <div className="a25-page a25-inbox">
      <div className="a25-page__head a25-page__head--row">
        <h1 tabIndex={-1} className="a25-page__title">
          {I.title}
        </h1>
      </div>
      {status === 'success' ? <SummaryStrip counts={data.counts} onView={setView} /> : null}
      <div className="a25-segmented" role="group" aria-label={I.viewsLabel}>
        {VIEWS.map((v) => (
          <button key={v} type="button" className="a25-segmented__item" aria-pressed={view === v} onClick={() => setView(v)}>
            {I.views[v]}
          </button>
        ))}
      </div>
      <section className="a25-inbox__list" aria-live="polite" aria-label={I.listLabel}>
        {status === 'loading' && <Skeleton lines={6} />}
        {status === 'error' && <ErrorState error={error} onRetry={reload} />}
        {status === 'success' &&
          (data.items.length === 0 ? (
            <EmptyState title={data.enabled ? I.emptyViewTitle : I.emptyChecksOffTitle} body={data.enabled ? I.emptyViewBody : I.emptyChecksOffBody} />
          ) : (
            <ul className="a25-rows">
              {data.items.map((it) => (
                <InboxRow key={it.issueId} item={it} onOpen={onOpen} />
              ))}
            </ul>
          ))}
      </section>
      <section className="a25-card a25-inbox__open" aria-labelledby="a25-open-title">
        <h2 id="a25-open-title" className="a25-card__title">
          {I.openReview}
        </h2>
        <OpenWorkItem />
      </section>
    </div>
  );
}

export function Inbox() {
  const { navigate } = useRouter();
  const [view, setView] = useState('pending');
  const resource = useResource(() => api.inbox(view), [view]);
  return <InboxView resource={resource} view={view} setView={setView} onOpen={(key) => navigate(`/review/${encodeURIComponent(key)}`)} />;
}
