// Decision record ("Record" page): every decision on work items the viewer can see, newest first,
// with the signature status of its record and whether it is in a downloaded backup. Read-only:
// decisions cannot be edited or deleted. Filtering to visible work items happens on the server.
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState, StatusLozenge } from '../../shared/components/States.jsx';
import { relativeTime } from '../../shared/findings.js';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';

const R = copy.record;
const LABEL = (d) => (d.decision === 'APPROVAL_INVALIDATED' ? 'APPROVAL_STALE' : d.decision === 'APPROVAL_RECONFIRMED' ? 'APPROVED' : d.decision);

export function SignatureCell({ record }) {
  if (!record) return <Lozenge appearance="inprogress">{R.format.pending}</Lozenge>;
  return (
    <span className="a25-register__sig">
      <Lozenge appearance={record.format === 'ed25519' ? 'success' : 'default'}>{R.format[record.format] ?? R.format.unknown}</Lozenge>
      {record.kid ? <span className="a25-mono a25-subtlest a25-small">{record.kid}</span> : null}
    </span>
  );
}

export function RegisterView({ resource, page, setPage, onOpen }) {
  const { status, data, error, reload } = resource;
  return (
    <div className="a25-page a25-register">
      <div className="a25-page__head">
        <h1 tabIndex={-1} className="a25-page__title">
          {R.title}
        </h1>
        <p className="a25-page__lead a25-subtle">{R.lead}</p>
      </div>
      {status === 'success' ? (
        <p className="a25-register__summary a25-small">
          <span>{R.signingSummary[data.signing] ?? R.signingSummary.none}</span>{' '}
          <span className="a25-subtle">{data.lastExport ? R.lastBackup(relativeTime(data.lastExport.at), data.lastExport.headSeq) : R.noBackup}</span>
        </p>
      ) : null}
      <section className="a25-inbox__list" aria-label={R.title} aria-busy={status === 'loading'}>
        {status === 'loading' && <Skeleton lines={6} />}
        {status === 'error' && <ErrorState error={error} onRetry={reload} />}
        {status === 'success' &&
          (data.items.length === 0 ? (
            <EmptyState title={R.empty} body={R.emptyBody} />
          ) : (
            <>
              <table className="a25-table">
                <caption className="a25-visually-hidden">{R.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{R.columns.item}</th>
                    <th scope="col">{R.columns.decision}</th>
                    <th scope="col">{R.columns.by}</th>
                    <th scope="col">{R.columns.when}</th>
                    <th scope="col">{R.columns.signature}</th>
                    <th scope="col">{R.columns.backup}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={`${d.key}-${d.seq}`} className="a25-table__row" onClick={() => onOpen(d.key)}>
                      <td className="a25-table__item">
                        <a
                          className="a25-table__key a25-mono"
                          href={`#/review/${encodeURIComponent(d.key)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpen(d.key);
                          }}
                        >
                          {d.key}
                        </a>
                        <span className="a25-table__summary">{d.summary}</span>
                        <span className="a25-subtlest a25-small a25-mono">
                          {R.columns.content} {d.contentRef}
                        </span>
                      </td>
                      <td data-label={R.columns.decision}>
                        <StatusLozenge state={LABEL(d)} />
                      </td>
                      <td data-label={R.columns.by} className="a25-small">
                        {d.kind === 'human' ? d.decidedBy?.name ?? '–' : <span className="a25-subtle">{R.system}</span>}
                      </td>
                      <td data-label={R.columns.when} className="a25-small">
                        <time dateTime={new Date(d.decidedAt).toISOString()} title={new Date(d.decidedAt).toLocaleString()}>
                          {relativeTime(d.decidedAt)}
                        </time>
                      </td>
                      <td data-label={R.columns.signature}>
                        <SignatureCell record={d.record} />
                      </td>
                      <td data-label={R.columns.backup} className="a25-small">
                        {d.inLastExport ? R.yes : <span className="a25-subtle">{R.no}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.pages > 1 ? (
                <nav className="a25-pagination" aria-label={copy.inbox.paginationLabel}>
                  <Button isDisabled={page <= 1} onClick={() => setPage(page - 1)}>
                    {copy.inbox.previous}
                  </Button>
                  <span className="a25-small a25-subtle" aria-live="polite">
                    {R.pagination(data.page, data.pages, data.total)}
                  </span>
                  <Button isDisabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                    {copy.inbox.next}
                  </Button>
                </nav>
              ) : (
                <p className="a25-subtlest a25-small">{R.pagination(data.page, data.pages, data.total)}</p>
              )}
            </>
          ))}
      </section>
    </div>
  );
}

export function Register() {
  const { navigate } = useRouter();
  const [page, setPage] = useState(1);
  const resource = useResource(() => api.register({ page }), [page]);
  return <RegisterView resource={resource} page={page} setPage={setPage} onOpen={(key) => navigate(`/review/${encodeURIComponent(key)}`)} />;
}
