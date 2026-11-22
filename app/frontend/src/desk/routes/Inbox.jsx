// Reviewer inbox shell (UX_DESIGN_SPEC §3.3). Lists what the backend reports as waiting for review;
// in this build checks are off, so it shows the honest empty state plus a way to open any work item.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState } from '../../shared/components/States.jsx';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';

const VIEWS = ['pending', 'stale', 'needs-info', 'all-open'];
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,99}-[1-9]\d{0,9}$/;

function OpenWorkItem() {
  const { navigate } = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const key = value.trim().toUpperCase();
    if (!KEY.test(key)) return setError(copy.inbox.invalidKey);
    setError(null);
    navigate(`/review/${encodeURIComponent(key)}`);
  };
  return (
    <form className="a25-openitem" onSubmit={submit} noValidate>
      <label htmlFor="a25-open-key" className="a25-openitem__label">
        {copy.inbox.openReviewField}
      </label>
      <div className="a25-openitem__row">
        <input
          id="a25-open-key"
          className="a25-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="SHOP-42"
          autoComplete="off"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'a25-open-key-error' : 'a25-open-key-hint'}
        />
        <Button type="submit" appearance="primary">
          {copy.inbox.openReviewSubmit}
        </Button>
      </div>
      {error ? (
        <p id="a25-open-key-error" className="a25-field-error" role="alert">
          {error}
        </p>
      ) : (
        <p id="a25-open-key-hint" className="a25-subtlest a25-small">
          {copy.inbox.openReviewHint}
        </p>
      )}
    </form>
  );
}

export function Inbox() {
  const [view, setView] = useState('pending');
  const inbox = useResource(() => api.inbox(view), [view]);

  return (
    <div className="a25-page a25-inbox">
      <div className="a25-page__head a25-page__head--row">
        <h1 tabIndex={-1} className="a25-page__title">
          {copy.inbox.title}
        </h1>
      </div>

      <div className="a25-segmented" role="group" aria-label={copy.inbox.viewsLabel}>
        {VIEWS.map((v) => (
          <button key={v} type="button" className="a25-segmented__item" aria-pressed={view === v} onClick={() => setView(v)}>
            {copy.inbox.views[v]}
          </button>
        ))}
      </div>

      <section className="a25-inbox__list" aria-live="polite">
        {inbox.status === 'loading' && <Skeleton lines={6} />}
        {inbox.status === 'error' && <ErrorState error={inbox.error} onRetry={inbox.reload} />}
        {inbox.status === 'success' && inbox.data.items.length === 0 && (
          <EmptyState
            title={inbox.data.enabled ? copy.inbox.emptyTitle : copy.inbox.emptyChecksOffTitle}
            body={inbox.data.enabled ? copy.inbox.emptyBody : copy.inbox.emptyChecksOffBody}
          />
        )}
      </section>

      <section className="a25-card a25-inbox__open" aria-labelledby="a25-open-title">
        <h2 id="a25-open-title" className="a25-card__title">
          {copy.inbox.openReview}
        </h2>
        <OpenWorkItem />
      </section>
    </div>
  );
}
