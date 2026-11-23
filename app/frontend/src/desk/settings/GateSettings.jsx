// Workflow gate administration (Settings; Jira administrators only — enforced by the server).
// Shows what is ACTUALLY protected: verified workflow coverage (or why it is unknown), dependency
// health, the mode (monitoring never looks like enforcement), recent gate checks and the audited
// change history. Switching modes is a deliberate, confirmed, audited action.
import { useState } from 'react';
import { api, newRequestId } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState } from '../../shared/components/States.jsx';
import { relativeTime } from '../../shared/findings.js';
import { copy } from '../../shared/copy/en.js';
import { Button, Lozenge, SectionMessage } from '../../shared/components/ui.jsx';

const G = copy.gate;
const OVERALL_APPEARANCE = { enforcing: 'success', monitoring: 'inprogress', gaps: 'moved', not_protected: 'default', unknown: 'default', not_ready: 'removed' };
const VERDICT_APPEARANCE = { allow: 'success', block: 'removed', would_allow: 'default', would_block: 'moved' };

export function VerdictLozenge({ verdict }) {
  return <Lozenge appearance={VERDICT_APPEARANCE[verdict] ?? 'default'}>{G.verdict[verdict] ?? verdict}</Lozenge>;
}

export function ModeBadge({ mode }) {
  return (
    <span className={`a25-gate-mode a25-gate-mode--${mode}`}>
      <Lozenge appearance={mode === 'enforce' ? 'removed' : mode === 'monitor' ? 'inprogress' : 'default'} isBold={mode === 'enforce'}>
        {G.mode[mode] ?? G.mode.unknown}
      </Lozenge>
    </span>
  );
}

function ModeSwitch({ health, onChanged, client }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const mode = health.mode.mode;
  if (mode !== 'monitor' && mode !== 'enforce') return null;
  const target = mode === 'monitor' ? 'enforce' : 'monitor';
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await client.setGateMode({ mode: target, expectedSeq: health.mode.seq, requestId: newRequestId(), note: note || undefined });
      // Confirm only once the refreshed state is on screen, so the badge and the message never disagree.
      await onChanged();
      setConfirming(false);
      setNote('');
      setMsg({ tone: 'ok', text: G.changedTo(G.mode[target]) });
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
      if (e?.code === 'CONFLICT') onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="a25-gate__switch">
      {!confirming ? (
        <Button appearance={target === 'enforce' ? 'primary' : 'default'} onClick={() => setConfirming(true)}>
          {target === 'enforce' ? G.switchToEnforce : G.switchToMonitor}
        </Button>
      ) : (
        <SectionMessage appearance={target === 'enforce' ? 'warning' : 'information'} title={target === 'enforce' ? G.switchToEnforce : G.switchToMonitor}>
          <p>{target === 'enforce' ? G.confirmEnforce : G.confirmMonitor}</p>
          <div className="a25-field">
            <label htmlFor="a25-gate-note" className="a25-field__label">
              {G.noteLabel}
            </label>
            <input id="a25-gate-note" className="a25-input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          <span className="a25-assign__row">
            <Button appearance={target === 'enforce' ? 'danger' : 'primary'} isDisabled={busy} onClick={submit}>
              {G.confirm}
            </Button>
            <Button appearance="subtle" onClick={() => setConfirming(false)}>
              {G.cancel}
            </Button>
          </span>
        </SectionMessage>
      )}
      {msg ? (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'a25-field-error' : 'a25-subtle a25-small'}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

function Coverage({ coverage }) {
  if (coverage.status === 'unknown') return <p className="a25-subtle">{G.coverageError[coverage.error] ?? G.coverageError.unavailable}</p>;
  if (!coverage.workflows.length) return <p className="a25-subtle">{G.coverageNone}</p>;
  return (
    <ul className="a25-gate__workflows">
      {coverage.workflows.map((w) => (
        <li key={w.workflowId || w.name} className="a25-gate__workflow">
          <div className="a25-gate__wfhead">
            <span className="a25-gate__wfname">{w.name}</span>
            <Lozenge>{G.scope[w.scope.type] ?? w.scope.type}</Lozenge>
            <Lozenge appearance={w.coverage === 'complete' ? 'success' : 'moved'}>{w.coverage === 'complete' ? G.complete : G.partial}</Lozenge>
          </div>
          <dl className="a25-gate__wfbody a25-small">
            <dt className="a25-subtle">{G.protectedInto}</dt>
            <dd>{w.protectedStatuses.join(', ')}</dd>
            <dt className="a25-subtle">{G.coveredTransitions}</dt>
            <dd>
              <ul className="a25-gate__tlist">
                {w.covered.map((t) => (
                  <li key={t.id}>
                    <span className="a25-mono">{t.name || t.id}</span> {G.toStatus(t.to)} <span className="a25-subtle">({G.from(t.from)})</span>
                  </li>
                ))}
              </ul>
            </dd>
            {w.gaps.length ? (
              <>
                <dt className="a25-gate__gaplabel">{G.gapTransitions}</dt>
                <dd>
                  <ul className="a25-gate__tlist">
                    {w.gaps.map((t) => (
                      <li key={t.id}>
                        <span className="a25-mono">{t.name || t.id}</span> {G.toStatus(t.to)} <span className="a25-subtle">({G.from(t.from)})</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function RecentChecks({ rows, showItem = true, emptyText }) {
  if (!rows?.length) return <p className="a25-subtle a25-small">{emptyText}</p>;
  return (
    <table className="a25-table a25-table--compact">
      <thead>
        <tr>
          <th scope="col">{G.columns.when}</th>
          {showItem ? <th scope="col">{G.columns.item}</th> : null}
          <th scope="col">{G.columns.transition}</th>
          <th scope="col">{G.columns.result}</th>
          <th scope="col">{G.columns.reason}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={i}>
            <td data-label={G.columns.when} className="a25-small">
              <time dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleString()}>
                {relativeTime(e.at)}
              </time>
            </td>
            {showItem ? (
              <td data-label={G.columns.item} className="a25-small">
                {e.issueKey ? <span className="a25-mono">{e.issueKey}</span> : <span className="a25-subtle">{G.hiddenItem}</span>}
              </td>
            ) : null}
            <td data-label={G.columns.transition} className="a25-small">
              {G.toStatus(e.to)}
            </td>
            <td data-label={G.columns.result}>
              <VerdictLozenge verdict={e.verdict} />
            </td>
            <td data-label={G.columns.reason} className="a25-small">
              {G.reasons[e.reason] ?? e.reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CHECK_TONE = { ok: 'success', configured: 'success', migration_missing: 'moved', unavailable: 'removed', missing: 'removed' };

export function GateSettingsView({ resource, client = api }) {
  const { status, data, error, reload, refresh } = resource;
  return (
    <section className="a25-card a25-gate" aria-labelledby="a25-gate-title" aria-busy={status === 'loading'}>
      <div className="a25-gate__head">
        <h2 id="a25-gate-title" className="a25-card__title">
          {G.title}
        </h2>
        {status === 'success' ? <ModeBadge mode={data.health.mode.mode} /> : null}
      </div>
      {status === 'loading' && !data ? <Skeleton lines={5} /> : null}
      {status === 'error' ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <p className={`a25-gate__explain a25-gate__explain--${data.health.mode.mode}`}>{G.modeExplain[data.health.mode.mode] ?? G.modeExplain.unknown}</p>
          <div className="a25-gate__overall">
            <Lozenge appearance={OVERALL_APPEARANCE[data.health.overall] ?? 'default'} isBold>
              {G.overall[data.health.overall]?.label ?? data.health.overall}
            </Lozenge>
            <span>{G.overall[data.health.overall]?.body}</span>
          </div>
          <ModeSwitch health={data.health} onChanged={refresh} client={client} />

          <dl className="a25-setup">
            <div>
              <dt>{G.checks.database}</dt>
              <dd>
                <Lozenge appearance={CHECK_TONE[data.health.checks.database] ?? 'default'}>{G.checkValue[data.health.checks.database] ?? data.health.checks.database}</Lozenge>
              </dd>
            </div>
            <div>
              <dt>{G.checks.signing}</dt>
              <dd>
                <Lozenge appearance={CHECK_TONE[data.health.checks.signing] ?? 'default'}>{G.checkValue[data.health.checks.signing] ?? data.health.checks.signing}</Lozenge>
              </dd>
            </div>
            <div>
              <dt>{G.checks.coverage}</dt>
              <dd>{data.health.coverage.workflowsScanned !== undefined ? G.scanned(data.health.coverage.workflowsScanned) : '–'}</dd>
            </div>
          </dl>

          <h3 className="a25-zone__subtitle">{G.coverageTitle}</h3>
          <Coverage coverage={data.health.coverage} />

          <h3 className="a25-zone__subtitle">{G.recentAdminTitle}</h3>
          {data.recent === null ? <p className="a25-subtle a25-small">{G.checkValue.unavailable}</p> : <RecentChecks rows={data.recent} emptyText={G.recentAdminNone} />}

          <h3 className="a25-zone__subtitle">{G.historyTitle}</h3>
          {data.modeHistory.length ? (
            <ul className="a25-gate__history a25-small">
              {data.modeHistory.map((h) => (
                <li key={h.seq}>
                  <ModeBadge mode={h.value} /> <span className="a25-subtle">{G.changedBy(h.by, relativeTime(h.at))}</span>
                  {h.note ? <span className="a25-block">{h.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="a25-subtle a25-small">{G.historyNone}</p>
          )}
          <div className="a25-gate__foot a25-small a25-subtlest">
            <span>{G.policyVersion(data.health.policyVersion)}</span>
            <button type="button" className="a25-linkbutton" onClick={refresh}>
              {G.refresh}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function GateSettings() {
  const resource = useResource(() => api.gateOverview(), []);
  return <GateSettingsView resource={resource} />;
}
