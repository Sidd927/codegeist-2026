// One real view per ?state=… (see scripts/film-data.mjs). Clients are inert: the film shows states the
// services really produced; interactions captured here are the components' own behaviour.
import { createRoot } from 'react-dom/client';
import light from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-light.js';
import typography from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-typography.js';
import spacing from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-spacing.js';
import shape from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-shape.js';
import '../src/shared/styles/base.css';
import '../src/shared/styles/components.css';
import '../src/desk/desk.css';
import '../src/panel/panel.css';
import { RouterProvider, createMemoryHistory } from '../src/desk/router.jsx';
import { DeskHeader } from '../src/desk/DeskApp.jsx';
import { GetStarted } from '../src/desk/routes/GetStarted.jsx';
import { InboxView } from '../src/desk/routes/Inbox.jsx';
import { ReviewView } from '../src/desk/routes/Review.jsx';
import { RegisterView } from '../src/desk/routes/Register.jsx';
import { GateSettingsView } from '../src/desk/settings/GateSettings.jsx';
import { RecordSettingsView } from '../src/desk/settings/RecordSettings.jsx';
import { PanelView } from '../src/panel/PanelApp.jsx';
import D from '/tmp/a25-film/data.json';

const style = document.createElement('style');
style.textContent = [light, typography, spacing, shape].join('\n') + '\nhtml{background:var(--ds-surface)} body{padding:0} .film-panel{width:440px;padding:16px;border:1px solid var(--ds-border);border-radius:8px;margin:24px}';
document.head.appendChild(style);

const r = (data) => ({ status: 'success', data, error: null, reload() {}, refresh: async () => undefined });
const noop = () => {};
const client = { decide: async () => ({ status: 'recorded' }), assign: async () => ({}), reviewers: async () => [], verifyRecord: async () => ({ status: 'verified' }), decisionRecord: async () => ({}) };
const viewer = { isAdmin: true, reviewerGroup: 'article25-reviewers' };
const desk = (page) => (
  <RouterProvider history={createMemoryHistory('/')}>
    <div className="a25-desk">
      <DeskHeader appContext={D.appContext} />
      <main className="a25-desk__main">{page}</main>
    </div>
  </RouterProvider>
);
const review = (data, v = viewer) => desk(<ReviewView resource={r(data)} onBack={noop} onOpenIssue={noop} onRecheck={noop} viewer={v} />);
const STATES = {
  'getstarted-fresh': () => desk(<div className="a25-page"><GetStarted resource={r(D.setupFresh)} /></div>),
  'getstarted-done': () => desk(<div className="a25-page"><GetStarted resource={r(D.setupDone)} /></div>),
  panel: () => <div className="film-panel"><PanelView resource={r(D.panelRequester)} onOpenDesk={noop} onRecheck={noop} /></div>,
  'panel-invalidated': () => <div className="film-panel"><PanelView resource={r(D.panelInvalidated)} onOpenDesk={noop} onRecheck={noop} /></div>,
  inbox: () => desk(<InboxView resource={r(D.inbox)} filters={{ view: 'attention', severity: 'any', project: 'any', assignee: 'any', page: 1 }} setFilters={noop} onOpen={noop} />),
  workspace: () => review(D.workspaceBefore),
  'workspace-approved': () => review(D.workspaceApproved),
  'workspace-invalidated': () => review(D.workspaceInvalidated),
  'workspace-sod': () => review(D.workspaceSod, { isAdmin: false, reviewerGroup: 'article25-reviewers' }),
  record: () => desk(<RegisterView resource={r(D.register)} page={1} setPage={noop} onOpen={noop} />),
  'settings-gate': () => desk(<div className="a25-page"><GateSettingsView resource={r(D.gateOverview)} client={{}} /></div>),
  'settings-record': () => desk(<div className="a25-page"><RecordSettingsView resource={r(D.recordStatus)} client={{}} /></div>),
  'settings-restored': () => desk(<div className="a25-page"><RecordSettingsView resource={r(D.recordStatusRestored)} client={{}} /></div>),
};
const state = new URLSearchParams(location.search).get('state') ?? 'workspace';
window.__client = client;
createRoot(document.getElementById('root')).render((STATES[state] ?? STATES.workspace)());
