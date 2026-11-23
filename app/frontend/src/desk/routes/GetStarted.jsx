// Get started (P1): what Article25 needs on this site, what Article25 found just now, and where to fix it.
// Jira administrators only (the server re-checks). Every status comes from getSetupStatus, read fresh on
// each visit: nothing is assumed, and installing the app is never presented as protecting a workflow.
import { useRouter } from '../router.jsx';
import { copy } from '../../shared/copy/en.js';
import { Skeleton } from '../../shared/components/States.jsx';
import { Button, Lozenge } from '../../shared/components/ui.jsx';

const G = copy.home.getStarted;
const TONE = { done: 'success', todo: 'moved', check: 'moved', info: 'inprogress', unknown: 'default' };

/**
 * Pure: setup status → steps. Each step: { key, title, state (done|todo|check|info|unknown), label, body, to? }.
 * Required steps must all be `done` for the site to be "set up"; the mode is a choice, not a task.
 */
export function buildSteps(s) {
  const gate = s.gate ?? {};
  const reviewers = s.reviewers?.youAreMember
    ? { state: 'done', label: G.reviewers.state.member, body: G.reviewers.member(s.reviewers.group) }
    : { state: 'check', label: G.reviewers.state.notMember, body: G.reviewers.notMember(s.reviewers?.group ?? '') };
  const signing = { state: s.signing === 'v3' ? 'done' : 'todo', label: G.signing.state[s.signing] ?? G.signing.state.none, body: G.signing[s.signing] ?? G.signing.none };
  let protect;
  if (gate.overall === 'not_ready') protect = { state: 'todo', label: G.protect.state.notReady, body: G.protect.notReady };
  else if (gate.coverage === 'complete') protect = { state: 'done', label: G.protect.state.complete, body: G.protect.complete(gate.protectedWorkflows) };
  else if (gate.coverage === 'partial') protect = { state: 'check', label: G.protect.state.partial, body: G.protect.partial(gate.gapWorkflows) };
  else if (gate.coverage === 'none') protect = { state: 'todo', label: G.protect.state.none, body: G.protect.none };
  else protect = { state: 'unknown', label: G.protect.state.unknown, body: G.protect.unknown };
  const mode = { state: gate.mode === 'unknown' || !gate.mode ? 'unknown' : 'info', label: G.mode.state[gate.mode] ?? G.mode.state.unknown, body: G.mode[gate.mode] ?? G.mode.unknown };

  const sodKey = ['on', 'off'].includes(s.separationOfDuties) ? s.separationOfDuties : 'unknown';
  const sod = { state: sodKey === 'on' ? 'done' : sodKey === 'off' ? 'check' : 'unknown', label: G.sod.state[sodKey], body: G.sod[sodKey] };
  const ai = { state: 'info', label: G.ai.state[s.screening?.ai === 'on' ? 'on' : 'off'], body: G.ai[s.screening?.ai === 'on' ? 'on' : 'off'] };
  let backup;
  if (!s.record) backup = { state: 'unknown', label: G.backup.state.unknown, body: G.backup.unknown };
  else if (s.record.decisions === 0) backup = { state: 'info', label: G.backup.state.empty, body: G.backup.empty };
  else if (s.record.notBackedUp > 0) backup = { state: 'todo', label: G.backup.state.behind, body: G.backup.behind(s.record.notBackedUp) };
  else backup = { state: 'done', label: G.backup.state.current, body: G.backup.current };

  const required = [
    { key: 'reviewers', title: G.reviewers.title, ...reviewers },
    { key: 'signing', title: G.signing.title, ...signing },
    { key: 'protect', title: G.protect.title, ...protect, to: '/settings/gate', action: G.protect.action },
    { key: 'mode', title: G.mode.title, ...mode, to: '/settings/gate', action: G.protect.action },
  ];
  const recommended = [
    { key: 'sod', title: G.sod.title, ...sod, to: '/settings/review', action: G.sod.action, alwaysAction: true }, // a switch, useful even when on
    { key: 'ai', title: G.ai.title, ...ai },
    { key: 'backup', title: G.backup.title, ...backup, to: '/settings/record', action: G.backup.action },
  ];
  const complete = required.every((x) => x.state === 'done' || x.key === 'mode');
  return { required, recommended, complete };
}

function StepIcon({ state }) {
  // Decorative: the label next to it carries the meaning (never colour or shape alone).
  const d = state === 'done' ? 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.2 4.4a.9.9 0 0 0-1.27.06L7.1 8.6 5.97 7.47a.9.9 0 1 0-1.27 1.27l1.8 1.8a.9.9 0 0 0 1.3-.03l3.47-3.84a.9.9 0 0 0-.07-1.27Z' : state === 'todo' || state === 'check' ? 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3a.9.9 0 0 0-.9.9v3.7a.9.9 0 1 0 1.8 0V4.9A.9.9 0 0 0 8 4Zm0 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z' : 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.8a5.2 5.2 0 1 0 0 10.4A5.2 5.2 0 0 0 8 2.8Z';
  return (
    <svg className={`a25-step__icon a25-step__icon--${state}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function Steps({ steps, navigate }) {
  return (
    <ol className="a25-steps">
      {steps.map((x) => (
        <li key={x.key} className={`a25-step a25-step--${x.state}`}>
          <StepIcon state={x.state} />
          <div className="a25-step__body">
            <div className="a25-step__head">
              <h4 className="a25-step__title">{x.title}</h4>
              <Lozenge appearance={TONE[x.state]}>{x.label}</Lozenge>
            </div>
            <p className="a25-step__text a25-subtle">{x.body}</p>
            {x.to && (x.state !== 'done' || x.alwaysAction) ? (
              <span>
                <Button appearance="subtle" onClick={() => navigate(x.to)}>
                  {x.action}
                </Button>
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TryIt({ status, navigate }) {
  const scope = status.screening?.scope === 'projects' ? G.scopeSome(status.screening.projects ?? []) : G.scopeAll;
  const progress = [
    status.record?.decisions > 0 ? G.progressDecisions(status.record.decisions) : null,
    Number(status.gate?.checksLast7Days) > 0 ? G.progressGate(status.gate.checksLast7Days) : null,
  ].filter(Boolean);
  return (
    <>
      <ol className="a25-tryit">
        {G.tryIt.map((t, i) => (
          <li key={t}>
            {t}
            {i === 0 ? <span className="a25-block a25-subtle a25-small">{scope}</span> : null}
          </li>
        ))}
      </ol>
      {progress.length ? (
        <ul className="a25-tryit__progress a25-small">
          {progress.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <span>
        <Button onClick={() => navigate('/inbox')}>{G.openInbox}</Button>
      </span>
    </>
  );
}

/** Get started for Jira administrators. `resource` is the getSetupStatus resource. */
export function GetStarted({ resource }) {
  const { navigate } = useRouter();
  const { status, data, reload } = resource;
  const body = (() => {
    if (status === 'loading' && !data) return <Skeleton lines={5} label={G.loading} />;
    if (status === 'error' || !data) {
      return (
        <p className="a25-small" role="status">
          {G.error}{' '}
          <button type="button" className="a25-linkbutton" onClick={reload}>
            {G.retry}
          </button>
        </p>
      );
    }
    return null;
  })();
  if (body) {
    return (
      <section className="a25-card a25-getstarted" aria-labelledby="a25-gs-title" aria-busy={status === 'loading'}>
        <h2 id="a25-gs-title" className="a25-card__title">
          {G.title}
        </h2>
        <p className="a25-subtle">{G.intro}</p>
        {body}
      </section>
    );
  }
  const { required, recommended, complete } = buildSteps(data);
  const details = (
    <>
      <h3 className="a25-getstarted__group">{G.required}</h3>
      <Steps steps={required} navigate={navigate} />
      <h3 className="a25-getstarted__group">{G.recommended}</h3>
      <Steps steps={recommended} navigate={navigate} />
      <h3 className="a25-getstarted__group">{G.tryTitle}</h3>
      <TryIt status={data} navigate={navigate} />
    </>
  );
  return (
    <section className={`a25-card a25-getstarted${complete ? ' a25-getstarted--done' : ''}`} aria-labelledby="a25-gs-title">
      <h2 id="a25-gs-title" className="a25-card__title">
        {complete ? G.titleDone : G.title}
      </h2>
      <p className="a25-subtle">{complete ? G.doneIntro : G.intro}</p>
      {complete ? (
        <details className="a25-getstarted__details">
          <summary>{G.showDetails}</summary>
          {details}
        </details>
      ) : (
        details
      )}
    </section>
  );
}
