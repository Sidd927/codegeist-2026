// M4 gate UI tests (synthetic data, mocked API client).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GateSettingsView } from './desk/settings/GateSettings.jsx';
import { GatePreview } from './desk/review/GatePreview.jsx';
import { DecisionForm } from './desk/review/DecisionForm.jsx';
import { PanelView } from './panel/PanelApp.jsx';
import { Home } from './desk/routes/Home.jsx';
import { RouterProvider, createMemoryHistory } from './desk/router.jsx';
import { axeViolations } from './a11y.js';

const resource = (over) => ({ status: 'success', data: null, error: null, reload: vi.fn(), refresh: vi.fn(), ...over });
const HEALTH = (over = {}) => ({
  overall: 'monitoring',
  mode: { mode: 'monitor', seq: 0, isDefault: true, changedAt: null },
  checks: { database: 'ok', signing: 'configured' },
  coverage: {
    status: 'complete',
    workflowsScanned: 103,
    workflows: [{ workflowId: 'w1', name: 'Software workflow for project A25GT', scope: { type: 'team-managed', projectId: '10205' }, protectedStatuses: ['In Progress'], covered: [{ id: '21', name: 'In Progress', type: 'GLOBAL', to: 'In Progress', from: ['Any status'] }], gaps: [], coverage: 'complete' }],
  },
  activity: { would_block: 2 },
  policyVersion: 'g1',
  ...over,
});
const OVERVIEW = (over = {}) => ({
  health: HEALTH(),
  recent: [
    { at: Date.now() - 60000, mode: 'monitor', verdict: 'would_block', reason: 'REVIEW_REQUIRED', to: 'In Progress', issueKey: 'A25GT-1' },
    { at: Date.now() - 120000, mode: 'monitor', verdict: 'would_block', reason: 'NOT_SCREENED', to: 'In Progress', issueKey: null },
  ],
  modeHistory: [],
  separationOfDuties: { value: 'on', seq: 0, isDefault: true },
  separationOfDutiesHistory: [],
  ...over,
});

describe('Workflow gate settings', () => {
  it('monitoring is clearly labelled as NOT blocking, with verified coverage and recent checks', async () => {
    const { container } = render(<GateSettingsView resource={resource({ data: OVERVIEW() })} client={{}} />);
    expect(screen.getAllByText('Monitoring').length).toBeGreaterThan(0);
    expect(screen.getByText(/protected transitions are NOT blocked/)).toBeTruthy();
    expect(screen.getByText('Software workflow for project A25GT')).toBeTruthy();
    expect(screen.getByText('Team-managed')).toBeTruthy();
    expect(screen.getByText('103 workflows checked')).toBeTruthy();
    expect(screen.getByText('A25GT-1')).toBeTruthy();
    expect(screen.getByText('A work item you cannot view')).toBeTruthy();
    expect(screen.getAllByText('Would block').length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('switching to enforcement needs confirmation and sends the last seen version, a request id and the note', async () => {
    const client = { setGateMode: vi.fn().mockResolvedValue({ status: 'changed' }) };
    const refresh = vi.fn();
    render(<GateSettingsView resource={resource({ data: OVERVIEW(), refresh })} client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start enforcing' }));
    expect(client.setGateMode).not.toHaveBeenCalled();
    expect(screen.getByText(/Enforcing blocks protected transitions/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason for the change/), { target: { value: 'Pilot on test projects' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(client.setGateMode.mock.calls[0][0]).toMatchObject({ mode: 'enforce', expectedSeq: 0, note: 'Pilot on test projects' });
    expect(client.setGateMode.mock.calls[0][0].requestId).toMatch(/^[A-Za-z0-9-]{16,}$/);
    expect(refresh).toHaveBeenCalled();
  });

  it('enforcing looks different from monitoring and offers switching back', () => {
    render(<GateSettingsView resource={resource({ data: OVERVIEW({ health: HEALTH({ overall: 'enforcing', mode: { mode: 'enforce', seq: 1, isDefault: false } }), modeHistory: [{ seq: 1, value: 'enforce', at: Date.now(), by: 'Admin One', note: 'Pilot' }] }) })} client={{}} />);
    expect(screen.getByText(/protected transitions are blocked unless a reviewer has approved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch to monitoring' })).toBeTruthy();
    expect(screen.getByText('Pilot')).toBeTruthy();
    expect(screen.getByText(/Admin One/)).toBeTruthy();
  });

  it('never claims protection without coverage; explains gaps, unknown coverage and broken dependencies', () => {
    const { rerender } = render(<GateSettingsView resource={resource({ data: OVERVIEW({ health: HEALTH({ overall: 'not_protected', coverage: { status: 'none', workflows: [], workflowsScanned: 103 } }) }) })} client={{}} />);
    expect(screen.getByText('Not protected')).toBeTruthy();
    expect(screen.getByText(/Installing Article25 does not protect any workflow by itself/)).toBeTruthy();
    const gapWf = { ...HEALTH().coverage.workflows[0], coverage: 'partial', gaps: [{ id: '31', name: 'Start', type: 'GLOBAL', to: 'In Progress', from: ['Any status'] }] };
    rerender(<GateSettingsView resource={resource({ data: OVERVIEW({ health: HEALTH({ overall: 'gaps', coverage: { status: 'partial', workflows: [gapWf], workflowsScanned: 1 } }) }) })} client={{}} />);
    expect(screen.getByText('Gaps found')).toBeTruthy();
    expect(screen.getByText(/WITHOUT the gate/)).toBeTruthy();
    rerender(<GateSettingsView resource={resource({ data: OVERVIEW({ health: HEALTH({ overall: 'unknown', coverage: { status: 'unknown', workflows: [], error: 'not_permitted' } }) }) })} client={{}} />);
    expect(screen.getByText(/not allowed to read workflows/)).toBeTruthy();
    rerender(<GateSettingsView resource={resource({ data: OVERVIEW({ health: HEALTH({ overall: 'not_ready', checks: { database: 'migration_missing', signing: 'missing' } }) }) })} client={{}} />);
    expect(screen.getByText('Not ready')).toBeTruthy();
    expect(screen.getByText('Missing')).toBeTruthy();
  });

  it('loading and error states', () => {
    const { rerender } = render(<GateSettingsView resource={resource({ status: 'loading' })} client={{}} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    rerender(<GateSettingsView resource={resource({ status: 'error', error: { message: 'Jira did not respond in time. Try again.', retryable: true } })} client={{}} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('Gate preview in the workspace and panel', () => {
  it('monitoring shows "would be blocked (not blocking)"; enforcing shows "blocked now" with the reason and next step', async () => {
    const { container, rerender } = render(<GatePreview gate={{ mode: 'monitor', allow: false, reason: 'REVIEW_REQUIRED', message: 'This work item needs a privacy review. A reviewer must approve it in Article25 before it can move on.', recent: [] }} />);
    expect(screen.getByText('Would be blocked (monitoring, not blocking)')).toBeTruthy();
    expect(screen.getByText(/A reviewer must approve it/)).toBeTruthy();
    expect(screen.getByText(/has not run for this work item yet/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
    rerender(<GatePreview gate={{ mode: 'enforce', allow: false, reason: 'APPROVAL_INVALIDATED', message: 'The text changed…', recent: [{ at: Date.now(), mode: 'enforce', verdict: 'block', reason: 'APPROVAL_INVALIDATED', to: 'In Progress' }] }} />);
    expect(screen.getByText('Blocked now')).toBeTruthy();
    expect(screen.getByText('Approval invalidated by a change')).toBeTruthy();
    rerender(<GatePreview gate={{ mode: 'enforce', allow: true, reason: 'ALLOW_APPROVED', message: 'A reviewer approved the current text of this work item.', recent: [] }} />);
    expect(screen.getByText('Allowed now')).toBeTruthy();
  });

  it('an unknown mode is never shown as allowed', () => {
    render(<GatePreview gate={{ mode: 'unknown', allow: false, reason: 'SYSTEM_UNAVAILABLE', message: 'Article25 could not verify…', recent: [] }} />);
    expect(screen.getByText('Blocked now')).toBeTruthy();
  });

  it('the issue panel shows a one-line gate state with the reason', () => {
    const RESULT = { screeningId: 's1', outcome: 'REVIEW_REQUIRED', mode: 'rules', aiStatus: 'not_enabled', checkedAt: Date.now(), rulesVersion: 'r1.0.0', reasons: [], trace: [], criteria: [], truncated: false, quality: { rejected: 0, dropped: 0 }, findings: [] };
    render(<PanelView resource={resource({ data: { access: 'granted', issue: { id: '1', key: 'A25GT-1', projectKey: 'A25GT' }, screening: { state: 'REVIEW_REQUIRED', result: RESULT }, review: { status: 'AWAITING_REVIEW', assignee: null, latest: null }, gate: { mode: 'enforce', allow: false, reason: 'REVIEW_REQUIRED', message: '' } } })} />);
    expect(screen.getByText('Protected transitions: Blocked now')).toBeTruthy();
    expect(screen.getByText('Needs a privacy review')).toBeTruthy();
  });
});

describe('Conditions confirmation shortcut', () => {
  it('prefills an Approve with the conditions listed; nothing is sent until the reviewer submits', async () => {
    const client = { decide: vi.fn().mockResolvedValue({ status: 'recorded' }) };
    const review = {
      status: 'APPROVED_WITH_CONDITIONS', approvedForContent: true, latestSeq: 1, assignmentSeq: 0, assignee: null,
      decisions: [{ seq: 1, kind: 'human', decision: 'APPROVED_WITH_CONDITIONS', conditions: ['Mask all form inputs', 'Exclude prescription pages'], questions: [], decidedAt: Date.now() }],
      assignments: [], binding: { screeningId: 'e'.repeat(64), fp: 'f'.repeat(64) },
      permissions: { isReviewer: true, canDecide: true, decideReason: null, canAssign: true },
    };
    render(<DecisionForm issueKey="A25GT-1" review={review} client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm conditions are met' }));
    expect(client.decide).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio').find((r) => r.value === 'APPROVED').checked).toBe(true);
    expect(screen.getByLabelText('Rationale').value).toBe('Conditions confirmed met: (1) Mask all form inputs; (2) Exclude prescription pages.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(client.decide.mock.calls[0][0].input.decision).toBe('APPROVED');
  });
  it('is not offered for other statuses', () => {
    render(<DecisionForm issueKey="A25GT-1" review={{ status: 'AWAITING_REVIEW', latestSeq: 0, decisions: [], binding: { screeningId: 'e'.repeat(64), fp: 'f'.repeat(64) }, permissions: { isReviewer: true, canDecide: true, canAssign: true } }} client={{}} />);
    expect(screen.queryByRole('button', { name: 'Confirm conditions are met' })).toBeNull();
  });
});

describe('Overview setup', () => {
  it('shows the real reviewer group and gate mode, and does not claim workflow coverage', () => {
    const history = createMemoryHistory('/');
    render(
      <RouterProvider history={history}>
        <Home appContext={{ roles: { jiraAdmin: false, reviewer: true }, features: { screening: true }, reviewerGroup: 'article25-reviewers', gate: { mode: 'monitor' } }} />
      </RouterProvider>,
    );
    expect(screen.getByText('article25-reviewers')).toBeTruthy();
    expect(screen.getByText('you are a member')).toBeTruthy();
    expect(screen.getByText('Monitoring (not blocking)')).toBeTruthy();
    expect(screen.getByText(/Which transitions are protected: Settings/)).toBeTruthy();
    expect(screen.queryByText('Not added to any workflow')).toBeNull();
  });
});
