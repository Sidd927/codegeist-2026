// Standard async states (UX_DESIGN_SPEC §4): loading skeletons, error with retry, empty state,
// and the status header used by the panel and the workspace.
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import Button from '@atlaskit/button/new';
import { stateDisplay } from '../states.js';
import { copy } from '../copy/en.js';

export function Skeleton({ lines = 3, label = copy.common.loading }) {
  return (
    <div role="status" aria-live="polite" className="a25-skeleton-group">
      <span className="a25-visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="a25-skeleton" style={{ width: `${[92, 76, 84, 60, 70, 88][i % 6]}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorState({ title = copy.common.errorTitle, error, onRetry }) {
  return (
    <SectionMessage
      appearance="error"
      title={title}
      actions={error?.retryable !== false && onRetry ? [<Button key="retry" onClick={onRetry}>{copy.common.retry}</Button>] : []}
    >
      <p role="alert">{error?.message ?? copy.common.errorTitle}</p>
    </SectionMessage>
  );
}

export function EmptyState({ title, body, children, headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  return (
    <div className="a25-empty">
      <H className="a25-empty__title" tabIndex={headingLevel === 1 ? -1 : undefined}>
        {title}
      </H>
      <p className="a25-empty__body a25-subtle">{body}</p>
      {children ? <div className="a25-empty__actions">{children}</div> : null}
    </div>
  );
}

export function StatusLozenge({ state }) {
  const d = stateDisplay(state);
  return (
    <Lozenge appearance={d.appearance} isBold={d.bold}>
      {d.label}
    </Lozenge>
  );
}

export function StatusHeader({ state, why, children }) {
  return (
    <div className="a25-status">
      <div className="a25-status__line">
        <StatusLozenge state={state} />
      </div>
      {why ? <p className="a25-status__why">{why}</p> : null}
      {children}
    </div>
  );
}
