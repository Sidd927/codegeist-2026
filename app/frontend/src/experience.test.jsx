// P1 experience tests: Get started (truthful steps), separation-of-duties guidance (workspace + panel),
// Settings deep links and the lightweight primitives. Synthetic data, mocked clients.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { buildSteps, GetStarted } from './desk/routes/GetStarted.jsx';
import { Home } from './desk/routes/Home.jsx';
import { SettingsView } from './desk/routes/Settings.jsx';
import { DecisionForm } from './desk/review/DecisionForm.jsx';
import { PanelView } from './panel/PanelApp.jsx';
import { RouterProvider, createMemoryHistory, matchRoute } from './desk/router.jsx';
import { Button, Lozenge, SectionMessage } from './shared/components/ui.jsx';
import { axeViolations } from './a11y.js';

const resource = (over) => ({ status: 'success', data: null, error: null, reload: vi.fn(), refresh: vi.fn(async () => undefined), ...over });
const withRouter = (ui, path = '/') => {
  const history = createMemoryHistory(path);
  return { history, ...render(<RouterProvider history={history}>{ui}</RouterProvider>) };
};
const SETUP = (over = {}) => ({
  reviewers: { group: 'article25-reviewers', youAreMember: true },
  signing: 'v3',
  screening: { ai: 'off', scope: 'all', projects: [] },
  gate: { overall: 'monitoring', mode: 'monitor', database: 'ok', coverage: 'complete', coverageError: null, protectedWorkflows: 2, gapWorkflows: 0, checksLast7Days: 4 },
  separationOfDuties: 'on',
  record: { decisions: 3, lastExportAt: 1, notBackedUp: 0 },
  ...over,
});
const stepOf = (s, key) => [...buildSteps(s).required, ...buildSteps(s).recommended].find((x) => x.key === key);

describe('Get started: steps reflect what the server found, never assumptions', () => {
  it('a fresh install is not "set up" and never shows a protected workflow', () => {
    const fresh = SETUP({ reviewers: { group: 'article25-reviewers', youAreMember: false }, gate: { overall: 'not_protected', mode: 'monitor', coverage: 'none', protectedWorkflows: 0, gapWorkflows: 0, checksLast7Days: 0 }, record: { decisions: 0, lastExportAt: null, notBackedUp: 0 } });
    const steps = buildSteps(fresh);
    expect(steps.complete).toBe(false);
    expect(stepOf(fresh, 'protect')).toMatchObject({ state: 'todo', label: 'Not protected' });
    expect(stepOf(fresh, 'protect').body).toMatch(/Nothing is protected yet/);
    expect(stepOf(fresh, 'reviewers')).toMatchObject({ state: 'check', label: 'Check the group' });
    expect(stepOf(fresh, 'backup')).toMatchObject({ state: 'info', label: 'Not needed yet' });
  });

  it.each([
    [{ coverage: 'partial', gapWorkflows: 1, overall: 'gaps' }, 'check', 'Gaps'],
    [{ coverage: 'unknown', overall: 'unknown' }, 'unknown', 'Unknown'],
    [{ coverage: 'complete', overall: 'not_ready' }, 'todo', 'Not ready'],
  ])('protection %o → %s', (gate, state, label) => {
    const s = SETUP({ gate: { ...SETUP().gate, ...gate } });
    expect(stepOf(s, 'protect')).toMatchObject({ state, label });
    expect(buildSteps(s).complete).toBe(false);
  });

  it('only complete coverage, signing and your membership make the site "set up"; the mode is a choice', () => {
    expect(buildSteps(SETUP()).complete).toBe(true);
    expect(buildSteps(SETUP({ gate: { ...SETUP().gate, mode: 'enforce' } })).complete).toBe(true);
    expect(buildSteps(SETUP({ signing: 'none' })).complete).toBe(false);
    expect(buildSteps(SETUP({ signing: 'v2' })).complete).toBe(false);
    expect(stepOf(SETUP(), 'mode')).toMatchObject({ state: 'info', label: 'Monitoring' });
    expect(stepOf(SETUP({ separationOfDuties: 'off' }), 'sod')).toMatchObject({ state: 'check', label: 'Off' });
    expect(stepOf(SETUP({ record: { decisions: 3, lastExportAt: null, notBackedUp: 3 } }), 'backup')).toMatchObject({ state: 'todo', label: 'Not backed up' });
    expect(stepOf(SETUP({ record: null }), 'backup')).toMatchObject({ state: 'unknown' });
  });

  it('renders the checklist with actions that open the right Settings section; accessible', async () => {
    const fresh = SETUP({ gate: { ...SETUP().gate, coverage: 'none', overall: 'not_protected', protectedWorkflows: 0 } });
    const { history, container } = withRouter(<GetStarted resource={resource({ data: fresh })} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Get started' })).toBeTruthy();
    expect(screen.getByText(/Installing Article25 does not protect any workflow by itself/)).toBeTruthy();
    expect(screen.getByText('Not protected')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Open workflow gate' })[0]);
    expect(history.location.pathname).toBe('/settings/gate');
    expect(screen.getByText('3 decisions recorded on this site so far.')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('collapses into "Article25 is set up" once the required steps are done; still inspectable', async () => {
    const { container } = withRouter(<GetStarted resource={resource({ data: SETUP() })} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Article25 is set up' })).toBeTruthy();
    expect(container.querySelector('details')).toBeTruthy();
    expect(screen.getByText('Show setup details')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('loading and error states never show a status', () => {
    const { rerender } = withRouter(<GetStarted resource={resource({ status: 'loading' })} />);
    expect(screen.getByText('Checking this site…')).toBeTruthy();
    expect(screen.queryByText('Protected')).toBeNull();
    const reload = vi.fn();
    rerender(
      <RouterProvider history={createMemoryHistory('/')}>
        <GetStarted resource={resource({ status: 'error', error: { message: 'x' }, reload })} />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(reload).toHaveBeenCalled();
  });
});

describe('Home: administrators get Get started, everyone else gets their role', () => {
  it('admin: Get started from the server; the old setup card is gone', async () => {
    const client = { setupStatus: vi.fn().mockResolvedValue(SETUP()) };
    await act(async () => {
      withRouter(<Home appContext={{ roles: { jiraAdmin: true, reviewer: true }, reviewerGroup: 'article25-reviewers', features: { screening: true } }} client={client} />);
    });
    expect(client.setupStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Article25 is set up' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Setup on this site' })).toBeNull();
  });

  it('reviewer who is not an admin: their role and a way to the Inbox; no Get started', async () => {
    const client = { setupStatus: vi.fn().mockRejectedValue(Object.assign(new Error('no'), { code: 'NOT_AUTHORISED' })) };
    let h;
    await act(async () => {
      h = withRouter(<Home appContext={{ roles: { jiraAdmin: false, reviewer: true }, reviewerGroup: 'article25-reviewers', features: { screening: true } }} client={client} />);
    });
    expect(screen.queryByRole('heading', { name: 'Get started' })).toBeNull();
    expect(screen.getByText(/You are a privacy reviewer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the Inbox' }));
    expect(h.history.location.pathname).toBe('/inbox');
    expect(await axeViolations(h.container)).toEqual([]);
  });

  it('not a reviewer: who decides, and where to follow checks', async () => {
    const client = { setupStatus: vi.fn().mockRejectedValue(Object.assign(new Error('no'), { code: 'NOT_AUTHORISED' })) };
    await act(async () => {
      withRouter(<Home appContext={{ roles: { jiraAdmin: false, reviewer: false }, reviewerGroup: 'privacy-team', features: { screening: true } }} client={client} />);
    });
    expect(screen.getByText(/Privacy decisions are made by members of privacy-team/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open the Inbox' })).toBeNull();
  });
});

describe('Separation-of-duties guidance', () => {
  const review = (permissions) => ({ status: 'AWAITING_REVIEW', approvedForContent: false, latestSeq: 0, assignmentSeq: 0, assignee: null, decisions: [], assignments: [], binding: null, permissions: { isReviewer: true, canDecide: false, canAssign: true, ...permissions } });

  it('reporter: the exact restriction and the next action; the admin switch only for administrators', async () => {
    const { history, container } = withRouter(<DecisionForm issueKey="SHOP-1" review={review({ decideReason: 'SOD', youAre: 'reporter' })} viewer={{ isAdmin: true, reviewerGroup: 'article25-reviewers' }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Another reviewer must decide' })).toBeTruthy();
    expect(screen.getByText(/You reported this work item\. Separation of duties stops people deciding on their own work/)).toBeTruthy();
    expect(screen.getByText(/Assign the review to another reviewer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open review settings' }));
    expect(history.location.pathname).toBe('/settings/review');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('assignee, not an admin: no mention of the admin switch', () => {
    withRouter(<DecisionForm issueKey="SHOP-1" review={review({ decideReason: 'SOD', youAre: 'assignee' })} viewer={{ isAdmin: false, reviewerGroup: 'article25-reviewers' }} />);
    expect(screen.getByText(/You are assigned to this work item\./)).toBeTruthy();
    expect(screen.queryByText(/switch separation of duties off/)).toBeNull();
  });

  it('not a reviewer is a permission message, clearly different from separation of duties', () => {
    withRouter(<DecisionForm issueKey="SHOP-1" review={review({ isReviewer: false, decideReason: 'NOT_REVIEWER', youAre: null })} viewer={{ isAdmin: false, reviewerGroup: 'privacy-team' }} />);
    expect(screen.getByRole('heading', { name: "You can't record decisions" })).toBeTruthy();
    expect(screen.getByText(/Only members of the Jira group privacy-team/)).toBeTruthy();
    expect(screen.queryByText(/Separation of duties/)).toBeNull();
  });

  const RESULT = { screeningId: 's1', outcome: 'REVIEW_REQUIRED', mode: 'rules', aiStatus: 'not_enabled', checkedAt: Date.now(), rulesVersion: 'r1.0.0', reasons: [], trace: [], criteria: [], truncated: false, quality: { rejected: 0, dropped: 0 }, findings: [] };
  const panel = (you) => ({ access: 'granted', issue: { id: '1', key: 'SHOP-1', projectKey: 'SHOP' }, screening: { state: 'REVIEW_REQUIRED', result: RESULT }, review: { status: 'AWAITING_REVIEW', assignee: null, latest: null, you } });

  it('the panel says the same thing in one line, and only to reviewers it applies to', async () => {
    const { container, rerender } = render(<PanelView resource={resource({ data: panel({ isReviewer: true, decideReason: 'SOD', youAre: 'reporter_assignee' }) })} />);
    expect(screen.getByText('You reported this work item and are assigned to it, so another reviewer must decide (separation of duties).')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
    rerender(<PanelView resource={resource({ data: panel({ isReviewer: false, decideReason: 'NOT_REVIEWER', youAre: null }) })} />);
    expect(screen.queryByText(/separation of duties/)).toBeNull();
  });
});

describe('Settings deep links', () => {
  it('/settings/<section> parses, and the section heading receives focus once loaded', () => {
    expect(matchRoute('/settings/record')).toEqual({ name: 'settings', params: { section: 'record' } });
    expect(matchRoute('/settings')).toEqual({ name: 'settings', params: {} });
    expect(matchRoute('/settings/nope').name).toBe('not-found');
    const data = { sections: [], environment: { label: 'Development' }, version: '0.5.0', review: null, screening: null };
    render(<SettingsView resource={resource({ data })} section="record" record={<h2 id="a25-record-title">Decision record and recovery</h2>} />);
    expect(document.activeElement?.id).toBe('a25-record-title');
  });
});

describe('Primitives keep native semantics', () => {
  it('Button is a native button (disabled works), Lozenge is text, SectionMessage has a heading and actions', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div>
        <Button onClick={onClick}>Go</Button>
        <Button isDisabled>Off</Button>
        <Lozenge appearance="success" isBold>
          Approved
        </Lozenge>
        <SectionMessage appearance="warning" title="Heads up" actions={[<Button key="a">A</Button>, <Button key="b">B</Button>]}>
          <p>Body</p>
        </SectionMessage>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Off' }).disabled).toBe(true);
    expect(screen.getByRole('heading', { name: 'Heads up' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
  });
});
