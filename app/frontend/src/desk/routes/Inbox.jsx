// Reviewer inbox (UX_DESIGN_SPEC §3.3). The backend filters to work items the caller can browse in
// Jira, derives each review status, applies the filters, orders by urgency → severity → age and
// paginates. This view only renders that result and sends filter changes back.
import { useState } from 'react';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState, StatusLozenge } from '../../shared/components/States.jsx';
import { findingLabel, duration } from '../../shared/findings.js';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';
import { Button } from '../../shared/components/ui.jsx';

const VIEWS = ['attention', 'awaiting', 'changed', 'needs-info', 'decided', 'all'];
const SEVERITIES = ['DPIA_LIKELY', 'REVIEW_REQUIRED', 'NEEDS_INFO', 'INVENTORY_UPDATE', 'CLEAR'];
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,99}-[1-9]\d{0,9}$/;
const I = copy.inbox;
export const DEFAULT_FILTERS = Object.freeze({ view: 'attention', severity: 'any', project: 'any', assignee: 'any', page: 1 });

// Filters survive navigating to a review and back within the session.
let remembered = DEFAULT_FILTERS;

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

function SummaryStrip({ counts, isReviewer, onPick }) {
  if (!counts) return null;
  const stat = (label, value, patch) => (
    <li>
      <button type="button" className="a25-stat" onClick={() => onPick(patch)}>
        <span className="a25-stat__value">{value}</span>
        <span className="a25-stat__label a25-small">{label}</span>
      </button>
    </li>
  );
  return (
    <ul className="a25-strip" aria-label={I.stripLabel}>
      {stat(I.strip.attention, counts.attention, { view: 'attention', severity: 'any', assignee: 'any' })}
      {stat(I.strip.changed, counts.changed, { view: 'changed', severity: 'any', assignee: 'any' })}
      {stat(I.strip.dpiaLikely, counts.dpiaLikely, { view: 'attention', severity: 'DPIA_LIKELY', assignee: 'any' })}
      {isReviewer ? stat(I.strip.mine, counts.mine, { view: 'attention', severity: 'any', assignee: 'me' }) : null}
      {stat(I.strip.oldest, duration(counts.oldestAttentionMs), { view: 'attention', severity: 'any', assignee: 'any' })}
    </ul>
  );
}

function Select({ id, label, value, onChange, options }) {
  return (
    <div className="a25-filter">
      <label htmlFor={id} className="a25-filter__label a25-small">
        {label}
      </label>
      <select id={id} className="a25-input a25-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Filters({ filters, projects, isReviewer, onChange }) {
  const projectOptions = [['any', I.anyProject], ...[...new Set([...(projects ?? []), ...(filters.project !== 'any' ? [filters.project] : [])])].map((p) => [p, p])];
  const dirty = filters.severity !== 'any' || filters.project !== 'any' || filters.assignee !== 'any';
  return (
    <div className="a25-filters" role="group" aria-label={I.filtersLabel}>
      <Select id="a25-f-sev" label={I.severityLabel} value={filters.severity} onChange={(v) => onChange({ severity: v })} options={[['any', I.anySeverity], ...SEVERITIES.map((s) => [s, copy.states[s]])]} />
      <Select id="a25-f-proj" label={I.projectLabel} value={filters.project} onChange={(v) => onChange({ project: v })} options={projectOptions} />
      {isReviewer ? (
        <Select id="a25-f-asg" label={I.assigneeLabel} value={filters.assignee} onChange={(v) => onChange({ assignee: v })} options={[['any', I.anyAssignee], ['me', I.assignedToMe], ['unassigned', I.unassigned]]} />
      ) : null}
      {dirty ? (
        <button type="button" className="a25-linkbutton a25-small a25-filters__clear" onClick={() => onChange({ severity: 'any', project: 'any', assignee: 'any' })}>
          {I.clearFilters}
        </button>
      ) : null}
    </div>
  );
}

function InboxTable({ items, onOpen }) {
  return (
    <table className="a25-table">
      <caption className="a25-visually-hidden">{I.listLabel}</caption>
      <thead>
        <tr>
          <th scope="col">{I.columns.item}</th>
          <th scope="col">{I.columns.outcome}</th>
          <th scope="col">{I.columns.status}</th>
          <th scope="col">{I.columns.reviewer}</th>
          <th scope="col" className="a25-table__num">
            {I.columns.age}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          // The row is clickable for mouse users; the key is the keyboard/screen-reader target.
          <tr key={it.issueId} className="a25-table__row" onClick={() => onOpen(it.key)}>
            <td className="a25-table__item">
              <a
                className="a25-table__key a25-mono"
                href={`#/review/${encodeURIComponent(it.key)}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpen(it.key);
                }}
              >
                {it.key}
              </a>
              <span className="a25-table__summary">{it.summary}</span>
              {it.chips?.length ? (
                <span className="a25-chips a25-table__chips">
                  {it.chips.map((c, i) => (
                    <span key={i} className="a25-chip">
                      {findingLabel(c)}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="a25-subtlest a25-small">
                {it.projectKey}
                {it.findingCount ? ` · ${I.findingsCount(it.findingCount)}` : ''}
                {it.mode === 'rules' ? ` · ${I.ruleBased}` : ''}
              </span>
            </td>
            <td data-label={I.columns.outcome}>{it.outcome ? <StatusLozenge state={it.outcome} /> : <StatusLozenge state={it.screeningState === 'SCREENING_FAILED' ? 'SCREENING_FAILED' : 'SCREENING'} />}</td>
            <td data-label={I.columns.status}>
              <StatusLozenge state={it.reviewStatus} />
            </td>
            <td data-label={I.columns.reviewer} className="a25-small">
              {it.assignee ? (
                <span className={it.assignee.active === false ? 'a25-subtle' : undefined}>
                  {it.assignee.name}
                  {it.assignee.active === false ? ` (${copy.review.assignment.inactive})` : ''}
                </span>
              ) : (
                <span className="a25-subtlest">{I.unassignedShort}</span>
              )}
            </td>
            <td data-label={I.columns.age} className="a25-table__num a25-small a25-subtle">
              {duration(it.ageMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1) return <p className="a25-subtlest a25-small">{I.pagination(page, pages, total)}</p>;
  return (
    <nav className="a25-pagination" aria-label={I.paginationLabel}>
      <Button isDisabled={page <= 1} onClick={() => onPage(page - 1)}>
        {I.previous}
      </Button>
      <span className="a25-small a25-subtle" aria-live="polite">
        {I.pagination(page, pages, total)}
      </span>
      <Button isDisabled={page >= pages} onClick={() => onPage(page + 1)}>
        {I.next}
      </Button>
    </nav>
  );
}

export function InboxView({ resource, filters, setFilters, onOpen }) {
  const { status, data, error, reload } = resource;
  const change = (patch) => setFilters({ ...filters, ...patch, page: patch.page ?? 1 });
  const filtered = filters.severity !== 'any' || filters.project !== 'any' || filters.assignee !== 'any' || filters.view !== 'attention';
  return (
    <div className="a25-page a25-inbox">
      <div className="a25-page__head a25-page__head--row">
        <h1 tabIndex={-1} className="a25-page__title">
          {I.title}
        </h1>
      </div>
      {status === 'success' ? <SummaryStrip counts={data.counts} isReviewer={data.isReviewer} onPick={change} /> : null}
      <div className="a25-inbox__controls">
        <div className="a25-segmented" role="group" aria-label={I.viewsLabel}>
          {VIEWS.map((v) => (
            <button key={v} type="button" className="a25-segmented__item" aria-pressed={filters.view === v} onClick={() => change({ view: v })}>
              {I.views[v]}
            </button>
          ))}
        </div>
        <Filters filters={filters} projects={data?.projects} isReviewer={data?.isReviewer} onChange={change} />
      </div>
      <section className="a25-inbox__list" aria-live="polite" aria-busy={status === 'loading'} aria-label={I.listLabel}>
        {status === 'loading' && <Skeleton lines={6} />}
        {status === 'error' && <ErrorState error={error} onRetry={reload} />}
        {status === 'success' &&
          (data.items.length === 0 ? (
            <EmptyState title={filtered ? I.emptyFilteredTitle : I.emptyTitle} body={filtered ? I.emptyFilteredBody : I.emptyBody} />
          ) : (
            <>
              <InboxTable items={data.items} onOpen={onOpen} />
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => change({ page: p })} />
            </>
          ))}
      </section>
      {status === 'success' && !data.isReviewer ? <p className="a25-subtle a25-small">{I.notReviewerNote}</p> : null}
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
  const [filters, setFiltersState] = useState(remembered);
  const setFilters = (f) => {
    remembered = f;
    setFiltersState(f);
  };
  const resource = useResource(() => api.inbox(filters), [filters.view, filters.severity, filters.project, filters.assignee, filters.page]);
  return <InboxView resource={resource} filters={filters} setFilters={setFilters} onOpen={(key) => navigate(`/review/${encodeURIComponent(key)}`)} />;
}
