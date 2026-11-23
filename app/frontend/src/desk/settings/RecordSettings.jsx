// Settings → Decision record and recovery (Jira administrators; every action is re-checked by the
// server). Signing keys (fingerprints only), integrity, signed backup, verified restore, key-loss
// recovery and honest guidance about what removing Article25 does.
import { useRef, useState } from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import SectionMessage from '@atlaskit/section-message';
import { api, newTransferId } from '../../shared/api.js';
import { useResource } from '../../shared/useResource.js';
import { Skeleton, ErrorState } from '../../shared/components/States.jsx';
import { relativeTime } from '../../shared/findings.js';
import { downloadText, copyText, readFileText } from '../../shared/download.js';
import { copy } from '../../shared/copy/en.js';

const R = copy.record;
const UPLOAD_CHUNK = 100_000; // characters (requests are limited to 500 KB)
const OUTCOME_TONE = { verified: 'success', pending_anchor: 'moved', problem: 'removed', not_configured: 'removed' };

function Msg({ msg }) {
  if (!msg) return null;
  return (
    <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'a25-field-error' : 'a25-subtle a25-small'}>
      {msg.text}
    </p>
  );
}

function Keys({ status, onChanged, client }) {
  const untrusted = status.keys.filter((k) => !k.trusted && !k.current);
  const [fp, setFp] = useState({});
  const [msg, setMsg] = useState(null);
  const adopt = async (kid) => {
    setMsg(null);
    try {
      await client.adoptPreviousKey({ kid, fingerprint: fp[kid] ?? '' });
      await onChanged();
      setMsg({ tone: 'ok', text: R.adopted });
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
    }
  };
  return (
    <section className="a25-record__section" aria-labelledby="a25-rec-sign">
      <h3 id="a25-rec-sign" className="a25-zone__subtitle">
        {R.signingTitle}
      </h3>
      <dl className="a25-setup">
        <div>
          <dt>{R.currentKey}</dt>
          <dd>{status.currentKey ? <span className="a25-mono">{status.currentKey.kid}</span> : <Lozenge appearance="removed">{R.absent}</Lozenge>}</dd>
        </div>
        {status.currentKey ? (
          <div className="a25-record__fp">
            <dt>{R.fingerprint}</dt>
            <dd className="a25-mono a25-small">{status.currentKey.fingerprint}</dd>
          </div>
        ) : null}
        <div>
          <dt>{R.legacyKey}</dt>
          <dd>{status.legacyKey ? R.present : R.absent}</dd>
        </div>
      </dl>
      {status.currentKey ? <p className="a25-subtlest a25-small">{R.fingerprintHint}</p> : null}
      {status.keys.length > 1 ? (
        <>
          <h4 className="a25-small a25-subtle">{R.keysTitle}</h4>
          <ul className="a25-record__keys a25-small">
            {status.keys.map((k) => (
              <li key={k.kid}>
                <span className="a25-mono">{k.kid}</span>{' '}
                <Lozenge appearance={k.trusted ? 'success' : 'removed'}>{k.trusted ? R.keyTrusted : R.keyUntrusted}</Lozenge>
                {k.current ? <span className="a25-subtle"> · {R.keyCurrent}</span> : null}
                {k.trusted && !k.current && k.endorsedByPredecessor !== null ? <span className="a25-subtle"> · {k.endorsedByPredecessor ? R.keyHandover : R.keyNoHandover}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {untrusted.length ? (
        <SectionMessage appearance="warning" title={R.adoptTitle}>
          <p>{R.adoptBody}</p>
          {untrusted.map((k) => (
            <div key={k.kid} className="a25-field">
              <label htmlFor={`a25-adopt-${k.kid}`} className="a25-field__label">
                {R.adoptField(k.kid)}
              </label>
              <span className="a25-openitem__row">
                <input id={`a25-adopt-${k.kid}`} className="a25-input a25-mono" value={fp[k.kid] ?? ''} onChange={(e) => setFp({ ...fp, [k.kid]: e.target.value })} autoComplete="off" />
                <Button onClick={() => adopt(k.kid)} isDisabled={!(fp[k.kid] ?? '').trim()}>
                  {R.adopt}
                </Button>
              </span>
            </div>
          ))}
          <Msg msg={msg} />
        </SectionMessage>
      ) : null}
    </section>
  );
}

function Integrity({ status, onChanged, client }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await client.verifyLedger();
      setResult({ tone: r.status === 'problem' ? 'error' : 'ok', text: R.verifyResult[r.status] ?? r.status, errors: r.errors ?? [] });
      await onChanged();
    } catch (e) {
      setResult({ tone: 'error', text: e?.message ?? copy.common.errorTitle, errors: [] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="a25-record__section" aria-labelledby="a25-rec-int">
      <h3 id="a25-rec-int" className="a25-zone__subtitle">
        {R.integrityTitle}
      </h3>
      <p className="a25-small">
        {R.records(status.counts.records)}.{' '}
        {status.lastVerify ? (
          <span>
            {R.lastVerify(relativeTime(status.lastVerify.at))}{' '}
            <Lozenge appearance={OUTCOME_TONE[status.lastVerify.outcome] ?? 'default'}>{status.lastVerify.outcome.replace('_', ' ')}</Lozenge>
          </span>
        ) : (
          <span className="a25-subtle">{R.neverVerified}</span>
        )}
      </p>
      <span>
        <Button onClick={run} isDisabled={busy || status.signing === 'none'}>
          {busy ? R.verifying : R.verifyNow}
        </Button>
      </span>
      {result ? (
        <div role={result.tone === 'error' ? 'alert' : 'status'} className={result.tone === 'error' ? 'a25-field-error' : 'a25-small'}>
          {result.text}
          {result.errors.length ? (
            <ul className="a25-small">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Backup({ status, onChanged, client }) {
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);
  const [fallback, setFallback] = useState(null);
  const [showText, setShowText] = useState(false);
  const areaRef = useRef(null);
  const run = async () => {
    setMsg(null);
    setFallback(null);
    try {
      setProgress(R.exporting(0, 1));
      const e = await client.exportArchive();
      let text = '';
      for (let i = 0; i < e.chunks; i++) {
        setProgress(R.exporting(i + 1, e.chunks));
        text += (await client.transferChunk({ transferId: e.transferId, idx: i })).data;
      }
      const name = `article25-record-${e.createdAt.slice(0, 10)}-seq${e.head.seq}.json`;
      // A blocked download does not always throw, so never claim it was saved; always offer copy.
      setFallback(text);
      setMsg(downloadText(name, text) ? { tone: 'ok', text: R.exported(name) } : { tone: 'error', text: R.downloadBlocked });
      await onChanged();
    } catch (err) {
      setMsg({ tone: 'error', text: err?.message ?? copy.common.errorTitle });
    } finally {
      setProgress(null);
    }
  };
  const behind = status.notInLastExport;
  return (
    <section className="a25-record__section" aria-labelledby="a25-rec-bak">
      <h3 id="a25-rec-bak" className="a25-zone__subtitle">
        {R.backupTitle}
      </h3>
      <p className="a25-small">
        {status.lastExport ? R.lastBackup(relativeTime(status.lastExport.at), status.lastExport.headSeq) : R.noBackup}{' '}
        {behind > 0 ? <strong className="a25-record__behind">{R.notInBackup(behind)}</strong> : status.lastExport ? <span className="a25-subtle">{R.backupCurrent}</span> : null}
      </p>
      <span>
        <Button appearance="primary" onClick={run} isDisabled={Boolean(progress) || !status.currentKey}>
          {progress ?? R.exportButton}
        </Button>
      </span>
      <Msg msg={msg} />
      {fallback ? (
        <span className="a25-assign__row">
          <Button
            onClick={async () => {
              setMsg((await copyText(fallback)) ? { tone: 'ok', text: R.copied } : { tone: 'error', text: R.copyBlocked });
            }}
          >
            {R.copyArchive}
          </Button>
          <Button appearance="subtle" aria-expanded={showText} onClick={() => setShowText(!showText)}>
            {showText ? R.hideText : R.showText}
          </Button>
        </span>
      ) : null}
      {fallback && showText ? (
        // Always-available route out of a sandboxed iframe: the user selects and copies the text themself.
        <div className="a25-field">
          <label htmlFor="a25-archive-text" className="a25-field__label">
            {R.textLabel}
          </label>
          <textarea id="a25-archive-text" ref={areaRef} className="a25-input a25-textarea a25-mono a25-record__text" readOnly value={fallback} rows={8} />
          <span>
            <Button
              onClick={() => {
                areaRef.current?.focus();
                areaRef.current?.select();
              }}
            >
              {R.selectAll}
            </Button>
          </span>
        </div>
      ) : null}
      <p className="a25-subtlest a25-small">{R.exportHint}</p>
      <p className="a25-subtlest a25-small a25-mono">{R.verifyOffline}</p>
    </section>
  );
}

function Restore({ status, onChanged, client }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle | uploading | verified | restoring | done
  const [progress, setProgress] = useState(null);
  const [verify, setVerify] = useState(null); // { report, token, transferId, chunks, resume }
  const [msg, setMsg] = useState(null);
  // A restore that failed part-way, or whose invocation was killed while writing, must be resumed.
  const lastRestoreFailed = status.restoreIncomplete ?? status.lastRestore?.outcome === 'failed_partial';
  const empty = status.counts.decisions === 0 && status.counts.records === 0;

  const [pasted, setPasted] = useState('');
  const start = async (fromText = false) => {
    setMsg(null);
    setVerify(null);
    const file = fileRef.current?.files?.[0];
    if (!fromText && !file) return;
    try {
      setStage('uploading');
      const text = fromText ? pasted.trim() : await readFileText(file);
      const transferId = newTransferId();
      const chunks = Math.max(1, Math.ceil(text.length / UPLOAD_CHUNK));
      for (let i = 0; i < chunks; i++) {
        setProgress(R.uploading(i + 1, chunks));
        await client.uploadArchiveChunk({ transferId, idx: i, data: text.slice(i * UPLOAD_CHUNK, (i + 1) * UPLOAD_CHUNK) });
      }
      const r = await client.beginRestore({ transferId, chunks });
      setVerify({ ...r, transferId, chunks });
      setStage('verified');
    } catch (e) {
      setStage('idle');
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
    } finally {
      setProgress(null);
    }
  };
  const confirm = async () => {
    setStage('restoring');
    setMsg(null);
    try {
      const r = await client.confirmRestore({ transferId: verify.transferId, chunks: verify.chunks, token: verify.token });
      await onChanged();
      setStage('done');
      setMsg({ tone: r.outcome === 'restored_mismatch' ? 'error' : 'ok', text: R.restoreOutcome[r.outcome] ?? r.outcome });
    } catch (e) {
      setStage('idle');
      setVerify(null);
      setMsg({ tone: 'error', text: e?.message ?? copy.common.errorTitle });
    }
  };

  return (
    <section className="a25-record__section" aria-labelledby="a25-rec-res">
      <h3 id="a25-rec-res" className="a25-zone__subtitle">
        {R.restoreTitle}
      </h3>
      {lastRestoreFailed ? (
        <SectionMessage appearance="error" title={R.restoreIncompleteTitle}>
          <p>{R.restoreIncompleteBody}</p>
        </SectionMessage>
      ) : null}
      {!empty && !lastRestoreFailed ? (
        <p className="a25-subtle a25-small">{R.restoreOnlyEmpty}</p>
      ) : (
        <>
          <div className="a25-field">
            <label htmlFor="a25-restore-file" className="a25-field__label">
              {R.restoreChoose}
            </label>
            <input id="a25-restore-file" ref={fileRef} type="file" accept="application/json,.json" className="a25-file" />
          </div>
          <span>
            <Button onClick={() => start(false)} isDisabled={stage === 'uploading' || stage === 'restoring'}>
              {progress ?? R.restoreVerify}
            </Button>
          </span>
          <div className="a25-field">
            <label htmlFor="a25-restore-text" className="a25-field__label">
              {R.restorePaste}
            </label>
            <textarea id="a25-restore-text" className="a25-input a25-textarea a25-mono a25-record__text" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <span>
              <Button onClick={() => start(true)} isDisabled={!pasted.trim() || stage === 'uploading' || stage === 'restoring'}>
                {R.restoreFromText}
              </Button>
            </span>
          </div>
          {verify ? (
            <div className="a25-record__report" role="region" aria-label={R.reportTitle}>
              <p>
                <Lozenge appearance={verify.report.restorable ? 'success' : 'removed'} isBold>
                  {R.reportStatus[verify.report.status] ?? verify.report.status}
                </Lozenge>
              </p>
              {verify.report.head ? <p className="a25-small">{R.reportHead(verify.report.head.seq, verify.report.createdAt ? new Date(verify.report.createdAt).toLocaleString() : '–')}</p> : null}
              {verify.report.keys?.length ? (
                <ul className="a25-small">
                  {verify.report.keys.map((k) => (
                    <li key={k.kid}>
                      <span className="a25-mono">{k.kid}</span> {k.trusted ? R.keyTrusted : R.keyUntrusted}
                    </li>
                  ))}
                </ul>
              ) : null}
              {verify.report.errors.length ? (
                <ul className="a25-small a25-field-error">
                  {verify.report.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {verify.resume ? <p className="a25-small">{R.resume}</p> : null}
              {verify.token && stage !== 'done' ? (
                <SectionMessage appearance="warning" title={R.restoreConfirm}>
                  <p>{R.restoreConfirmBody}</p>
                  <Button appearance="primary" onClick={confirm} isDisabled={stage === 'restoring'}>
                    {stage === 'restoring' ? R.restoring : R.restoreConfirm}
                  </Button>
                </SectionMessage>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <Msg msg={msg} />
    </section>
  );
}

export function RecordSettingsView({ resource, client = api }) {
  const { status, data, error, reload, refresh } = resource;
  return (
    <section className="a25-card a25-record" aria-labelledby="a25-record-title" aria-busy={status === 'loading'}>
      <h2 id="a25-record-title" className="a25-card__title">
        {R.settingsTitle}
      </h2>
      {status === 'loading' && !data ? <Skeleton lines={5} /> : null}
      {status === 'error' ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Keys status={data} onChanged={refresh} client={client} />
          <Integrity status={data} onChanged={refresh} client={client} />
          <Backup status={data} onChanged={refresh} client={client} />
          <Restore status={data} onChanged={refresh} client={client} />
          <section className="a25-record__section" aria-labelledby="a25-rec-rem">
            <h3 id="a25-rec-rem" className="a25-zone__subtitle">
              {R.removalTitle}
            </h3>
            <ul className="a25-record__list a25-small">
              {R.removalBody.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="a25-record__section" aria-labelledby="a25-rec-ext">
            <h3 id="a25-rec-ext" className="a25-zone__subtitle">
              {R.externalTitle}
            </h3>
            <p className="a25-small">
              <Lozenge>{copy.settings.status['not-connected']}</Lozenge> <span className="a25-subtle">{R.externalBody}</span>
            </p>
          </section>
          {data.events?.length ? (
            <section className="a25-record__section" aria-labelledby="a25-rec-ev">
              <h3 id="a25-rec-ev" className="a25-zone__subtitle">
                {R.eventsTitle}
              </h3>
              <ul className="a25-record__list a25-small">
                {data.events.map((e, i) => (
                  <li key={i}>
                    {R.eventType[e.type] ?? e.type} · <span className="a25-subtle">{e.outcome.replace(/_/g, ' ')}</span> · {e.by} · {relativeTime(e.at)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function RecordSettings() {
  const resource = useResource(() => api.recordStatus(), []);
  return <RecordSettingsView resource={resource} />;
}
