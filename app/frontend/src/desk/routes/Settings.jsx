// Settings entry point (UX_DESIGN_SPEC §3.7). Access is decided server-side on every call; the nav
// only hides the link. Sections are listed with their real status; configuration arrives later.
import { useState } from 'react';
import Lozenge from '@atlaskit/lozenge';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { api, newRequestId } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState, EmptyState } from '../../shared/components/States.jsx';
import { copy } from '../../shared/copy/en.js';
import { GateSettings } from '../settings/GateSettings.jsx';

/** Audited admin switch for separation of duties (server re-checks admin rights). */
function SodControl({ setting, onChanged, client = api }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!setting) return null;
  const target = setting.value === 'off' ? 'on' : 'off';
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await client.setSeparationOfDuties({ value: target, expectedSeq: setting.seq, requestId: newRequestId() });
      setConfirming(false);
      onChanged();
    } catch (e) {
      setMsg(e?.message ?? copy.common.errorTitle);
      if (e?.code === 'CONFLICT') onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="a25-gate__switch">
      {!confirming ? (
        <Button appearance="subtle" onClick={() => setConfirming(true)}>
          {target === 'off' ? copy.sod.switchOff : copy.sod.switchOn}
        </Button>
      ) : (
        <SectionMessage appearance={target === 'off' ? 'warning' : 'information'} title={copy.sod.title}>
          <p>{target === 'off' ? copy.sod.confirmOff : copy.sod.confirmOn}</p>
          <span className="a25-assign__row">
            <Button appearance={target === 'off' ? 'danger' : 'primary'} isDisabled={busy} onClick={submit}>
              {copy.gate.confirm}
            </Button>
            <Button appearance="subtle" onClick={() => setConfirming(false)}>
              {copy.gate.cancel}
            </Button>
          </span>
        </SectionMessage>
      )}
      {msg ? (
        <p role="alert" className="a25-field-error">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function ScreeningStatus({ s }) {
  const T = copy.settings;
  const [msg, setMsg] = useState(null);
  const states = Object.entries(s.countsByState ?? {});
  return (
    <section className="a25-card a25-settings__screening" aria-labelledby="a25-screening-title">
      <h2 id="a25-screening-title" className="a25-card__title">
        {T.screeningTitle}
      </h2>
      <dl className="a25-setup">
        <div>
          <dt>{T.aiLabel}</dt>
          <dd>{s.ai === 'on' ? T.aiOn(s.aiModel) : T.aiOff}</dd>
        </div>
        <div>
          <dt>{T.budgetLabel}</dt>
          <dd>{T.budgetValue(s.dailyAiBudget)}</dd>
        </div>
        <div>
          <dt>{T.scopeLabel}</dt>
          <dd>{s.scopeProjects.length ? s.scopeProjects.join(', ') : T.scopeAll}</dd>
        </div>
        <div>
          <dt>{T.todayLabel}</dt>
          <dd>{T.todayValue(s.today)}</dd>
        </div>
        <div>
          <dt>{T.statesLabel}</dt>
          <dd className="a25-mono">{states.length ? states.map(([k, n]) => `${k} ${n}`).join(' · ') : '–'}</dd>
        </div>
      </dl>
      <div>
        <Button
          onClick={async () => {
            try {
              await api.applySchema();
              setMsg(T.schemaQueued);
            } catch (e) {
              setMsg(e?.message ?? copy.common.errorTitle);
            }
          }}
        >
          {T.schemaAction}
        </Button>
        {msg ? (
          <p role="status" className="a25-subtle a25-small">
            {msg}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ReviewStatus({ r, onChanged }) {
  const T = copy.settings;
  return (
    <section className="a25-card a25-settings__screening" aria-labelledby="a25-review-settings-title">
      <h2 id="a25-review-settings-title" className="a25-card__title">
        {T.reviewTitle}
      </h2>
      <dl className="a25-setup">
        <div>
          <dt>{T.reviewerGroupLabel}</dt>
          <dd className="a25-mono">{r.reviewerGroup}</dd>
        </div>
        <div>
          <dt>{T.youLabel}</dt>
          <dd>{r.youAreReviewer ? T.youReviewer : T.youNotReviewer}</dd>
        </div>
        <div>
          <dt>{T.sodLabel}</dt>
          <dd>{r.separationOfDuties ? T.sodOn : T.sodOff}</dd>
        </div>
      </dl>
      <SodControl setting={r.separationOfDutiesSetting} onChanged={onChanged} />
      <dl className="a25-setup">
        <div>
          <dt>{T.signingLabel}</dt>
          <dd>{T.signing[r.recordSigning] ?? r.recordSigning}</dd>
        </div>
      </dl>
    </section>
  );
}

export function SettingsView({ resource, gate = <GateSettings /> }) {
  const { status, data, error, reload, refresh } = resource;
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
          {gate}
          {data.review ? <ReviewStatus r={data.review} onChanged={refresh} /> : null}
          {data.screening ? <ScreeningStatus s={data.screening} /> : null}
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
