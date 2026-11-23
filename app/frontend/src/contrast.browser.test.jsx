// Colour contrast in a REAL browser (P1). jsdom has no layout and no canvas, so axe's `color-contrast`
// rule cannot run in the unit tests (src/a11y.js disables it there). This suite runs in headless Chromium
// (Vitest browser mode + Playwright), loads the app's own CSS and the real Atlassian Design System token
// themes (light and dark, the same CSS variables Forge injects in Jira), renders each main interface
// with realistic data, and fails on any WCAG 2 AA contrast violation. Run: npm run test:contrast
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import axe from 'axe-core';
import light from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-light.js';
import dark from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-dark.js';
import typography from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-typography.js';
import spacing from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-spacing.js';
import shape from '@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-shape.js';
import './shared/styles/base.css';
import './shared/styles/components.css';
import './desk/desk.css';
import './panel/panel.css';
import { RouterProvider, createMemoryHistory } from './desk/router.jsx';
import { DeskHeader } from './desk/DeskApp.jsx';
import { Home } from './desk/routes/Home.jsx';
import { GetStarted } from './desk/routes/GetStarted.jsx';
import { InboxView } from './desk/routes/Inbox.jsx';
import { ReviewView } from './desk/routes/Review.jsx';
import { RegisterView } from './desk/routes/Register.jsx';
import { SettingsView } from './desk/routes/Settings.jsx';
import { GateSettingsView } from './desk/settings/GateSettings.jsx';
import { RecordSettingsView } from './desk/settings/RecordSettings.jsx';
import { DecisionForm } from './desk/review/DecisionForm.jsx';
import { PanelView } from './panel/PanelApp.jsx';
import { Button, Lozenge, SectionMessage } from './shared/components/ui.jsx';
import { StatusLozenge } from './shared/components/States.jsx';
import * as F from './fixtures.js';

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [light, dark, typography, spacing, shape].join('\n');
  document.head.appendChild(style);
  // Emulate the host page. The panel's own document is transparent (panel.css) because Jira paints its
  // themed surface behind the iframe; without this, the browser default (white) would sit under dark text.
  const host = document.createElement('style');
  host.textContent = 'html { background: var(--ds-surface) !important; }';
  document.head.appendChild(host);
});
afterEach(() => cleanup());

function setTheme(mode) {
  const html = document.documentElement;
  html.setAttribute('data-color-mode', mode);
  html.setAttribute('data-theme', 'light:light dark:dark spacing:spacing typography:typography shape:shape');
}

/** Only contrast: every other axe rule already runs in the jsdom suite. Also returns how many text nodes
 *  axe actually measured, so a screen that silently checked nothing cannot pass. */
async function contrast(container) {
  const r = await axe.run(container, { runOnly: { type: 'rule', values: ['color-contrast'] } });
  return {
    violations: r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} — ${n.any?.[0]?.message ?? v.help}`)),
    measured: r.passes.reduce((n, p) => n + p.nodes.length, 0),
    undetermined: r.incomplete.flatMap((v) => v.nodes.map((n) => n.target.join(' '))),
  };
}

const resource = (data, over = {}) => ({ status: 'success', data, error: null, reload() {}, refresh: async () => undefined, ...over });
const inRouter = (ui) => <RouterProvider history={createMemoryHistory('/')}>{ui}</RouterProvider>;
const noop = () => {};

const STATES = ['NOT_SCREENED', 'SCREENING', 'SCREENING_FAILED', 'CLEAR', 'NEEDS_INFO', 'REVIEW_REQUIRED', 'DPIA_LIKELY', 'AWAITING_REVIEW', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED', 'APPROVAL_STALE', 'RESCREEN_REQUIRED'];

const SCREENS = {
  'primitives (every appearance)': () => (
    <div>
      {['default', 'primary', 'subtle', 'danger', 'warning'].map((a) => (
        <Button key={a} appearance={a}>
          {a}
        </Button>
      ))}
      <Button isDisabled>disabled</Button>
      {['default', 'success', 'removed', 'inprogress', 'new', 'moved'].flatMap((a) => [
        <Lozenge key={a} appearance={a}>
          {a}
        </Lozenge>,
        <Lozenge key={`${a}-b`} appearance={a} isBold>
          {a} bold
        </Lozenge>,
      ])}
      {STATES.map((s) => (
        <StatusLozenge key={s} state={s} />
      ))}
      {['information', 'warning', 'error', 'success', 'discovery'].map((a) => (
        <SectionMessage key={a} appearance={a} title={`${a} title`} actions={[<Button key="x">Action</Button>]}>
          <p>Body text for {a}.</p>
        </SectionMessage>
      ))}
    </div>
  ),
  'desk header and overview (non-admin)': () => inRouter(
    <div className="a25-desk">
      <DeskHeader appContext={F.APP_CONTEXT({ roles: { jiraAdmin: false, reviewer: true } })} />
      <Home appContext={F.APP_CONTEXT({ roles: { jiraAdmin: false, reviewer: true } })} client={{ setupStatus: async () => null }} />
    </div>,
  ),
  'get started (to do, mixed states)': () => inRouter(<GetStarted resource={resource(F.SETUP_FRESH)} />),
  'get started (set up, expanded)': () => inRouter(<GetStarted resource={resource(F.SETUP_DONE)} />),
  inbox: () => inRouter(<InboxView resource={resource(F.INBOX)} filters={F.INBOX_FILTERS} setFilters={noop} onOpen={noop} />),
  'review workspace (reviewer can decide)': () => inRouter(<ReviewView resource={resource(F.WORKSPACE())} onBack={noop} onOpenIssue={noop} onRecheck={noop} />),
  'separation-of-duties guidance': () => inRouter(<DecisionForm issueKey="SHOP-42" review={F.REVIEW({ canDecide: false, decideReason: 'SOD', youAre: 'reporter' })} viewer={{ isAdmin: true, reviewerGroup: 'article25-reviewers' }} />),
  'decision record page': () => inRouter(<RegisterView resource={resource(F.REGISTER)} page={1} setPage={noop} />),
  'settings (overview, gate, record)': () => inRouter(
    <SettingsView resource={resource(F.SETTINGS)} gate={<GateSettingsView resource={resource(F.GATE_OVERVIEW)} client={{}} />} record={<RecordSettingsView resource={resource(F.RECORD_STATUS)} client={{}} />} />,
  ),
  'issue panel (result, review, gate, separation of duties)': () => <PanelView resource={resource(F.PANEL)} onOpenDesk={noop} onRecheck={noop} />,
  'issue panel (failed check)': () => <PanelView resource={resource({ ...F.PANEL, screening: { state: 'SCREENING_FAILED', result: null } })} onRecheck={noop} />,
};

for (const mode of ['light', 'dark']) {
  describe(`colour contrast, ${mode} theme (WCAG 2 AA, real browser)`, () => {
    for (const [name, screen] of Object.entries(SCREENS)) {
      it(name, async () => {
        setTheme(mode);
        const { container } = render(screen());
        // The theme really applied: body text resolves to an ADS token value, not the fallback.
        expect(getComputedStyle(document.documentElement).getPropertyValue('--ds-text').trim()).not.toBe('');
        container.querySelectorAll('details').forEach((d) => (d.open = true)); // check collapsed content too
        const c = await contrast(container);
        expect(c.violations).toEqual([]);
        expect(c.measured).toBeGreaterThan(0);
      });
    }
  });
}

describe('the contrast check itself', () => {
  it('flags low-contrast text (negative control: the suite can fail)', async () => {
    setTheme('light');
    const { container } = render(<p style={{ color: '#b0b0b0' }}>Too faint to read</p>);
    expect((await contrast(container)).violations).toHaveLength(1);
  });
  it('flags dark-theme text left on a light background', async () => {
    setTheme('dark');
    const { container } = render(<p style={{ background: '#ffffff' }}>Light-theme leftover</p>);
    expect((await contrast(container)).violations).toHaveLength(1);
  });
});
