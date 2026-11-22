// Settings entry point (UX_DESIGN_SPEC §3.7). Access is decided server-side on every call; the nav
// only hides the link. Sections are listed with their real status; configuration arrives later.
import Lozenge from '@atlaskit/lozenge';
import { api } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState } from '../../shared/components/States.jsx';
import { copy } from '../../shared/copy/en.js';

export function SettingsView({ resource }) {
  const { status, data, error, reload } = resource;
  return (
    <div className="a25-page a25-settings">
      <div className="a25-page__head">
        <h1 tabIndex={-1} className="a25-page__title">
          {copy.settings.title}
        </h1>
      </div>
      {status === 'loading' && <Skeleton lines={6} />}
      {status === 'error' &&
        (error?.code === 'NOT_AUTHORISED' ? (
          <EmptyState title={copy.settings.deniedTitle} body={copy.settings.deniedBody} />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        ))}
      {status === 'success' && (
        <>
          <ul className="a25-settings__list" aria-label={copy.settings.sectionsLabel}>
            {data.sections.map((s) => (
              <li key={s.key} className="a25-settings__item">
                <div className="a25-settings__text">
                  <h2 className="a25-settings__title">{copy.settings.sections[s.key].title}</h2>
                  <p className="a25-subtle">{copy.settings.sections[s.key].body}</p>
                </div>
                <Lozenge>{copy.settings.status[s.status] ?? s.status}</Lozenge>
              </li>
            ))}
          </ul>
          <p className="a25-subtle a25-small">{copy.settings.availableLater}</p>
          <dl className="a25-settings__meta a25-small">
            <div>
              <dt>{copy.settings.environment}</dt>
              <dd>{data.environment.label ?? copy.settings.production}</dd>
            </div>
            <div>
              <dt>{copy.settings.version}</dt>
              <dd className="a25-mono">{data.version}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

export function Settings() {
  const resource = useResource(() => api.settingsOverview(), []);
  return <SettingsView resource={resource} />;
}
