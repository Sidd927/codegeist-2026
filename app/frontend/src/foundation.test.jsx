import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { locateMarks, segment } from './shared/margin.js';
import { EvidenceDocument, MarginNotes } from './shared/components/Margin.jsx';
import { stateDisplay } from './shared/states.js';
import { PanelView } from './panel/PanelApp.jsx';
import { ReviewView } from './desk/routes/Review.jsx';
import { SettingsView } from './desk/routes/Settings.jsx';
import { Home } from './desk/routes/Home.jsx';
import { InboxView } from './desk/routes/Inbox.jsx';
import { DeskHeader } from './desk/DeskApp.jsx';
import { RouterProvider, createMemoryHistory, matchRoute } from './desk/router.jsx';
import { axeViolations } from './a11y.js';

const LABELS = { document: 'Work item text', summary: 'Summary', description: 'Description', noDescription: 'No description.' };
const resource = (over) => ({ status: 'success', data: null, error: null, reload: vi.fn(), refresh: vi.fn(), ...over });
const withRouter = (ui, path = '/') => {
  const history = createMemoryHistory(path);
  return { history, ...render(<RouterProvider history={history}>{ui}</RouterProvider>) };
};

// Synthetic screening result in the presenter contract (backend/services/presenter.js).
const RESULT = {
  screeningId: 's1', outcome: 'DPIA_LIKELY', mode: 'rules', model: null, aiStatus: 'not_enabled', checkedAt: Date.now() - 120000,
  rulesVersion: 'r1.0.0', reasons: [{ ruleId: 'R-SENS-2', outcome: 'DPIA_LIKELY', params: { criteria: 3 } }],
  trace: [{ ruleId: 'R-NEG', result: 'not_matched' }, { ruleId: 'R-SENS-2', result: 'fired' }], criteria: [], truncated: false, quality: { rejected: 0, dropped: 0 },
  findings: [
    { id: 'f1', index: 1, kind: 'sensitive_data', signal: 'health', certainty: 'implied', severity: 'high', isNew: false, detail: null, question: null, provenance: 'rules', excerpt: 'prescription items', source: { field: 'description', blockIndex: 0, start: 51, end: 69 } },
    { id: 'f2', index: 2, kind: 'external_sharing', signal: 'ReplayCloud', certainty: 'stated', severity: 'medium', isNew: true, detail: 'no_approved_list', question: null, provenance: 'rules', excerpt: 'ReplayCloud', source: { field: 'summary', blockIndex: -1, start: 36, end: 47 } },
    { id: 'f3', index: null, kind: 'missing_info', signal: 'purpose', certainty: 'question', severity: 'info', isNew: false, detail: null, question: null, provenance: null, excerpt: null, source: null },
  ],
};
const DOC = { summary: 'Add session replay to checkout with ReplayCloud', blocks: [{ kind: 'paragraph', text: 'Record checkout sessions and segment shoppers with prescription items.' }], truncated: false };

describe('Margin evidence helpers', () => {
  it('locates quotes case-insensitively, skips overlaps and unknown quotes', () => {
    const blocks = [{ text: 'Add session replay to checkout' }, { text: 'Abandon carts with prescription items' }];
    const map = locateMarks(blocks, [
      { id: 'a', quote: 'session replay' },
      { id: 'b', quote: 'replay to' }, // overlaps 'a' and has no other occurrence -> skipped
      { id: 'c', quote: 'PRESCRIPTION items' },
      { id: 'd', quote: 'not in text' },
    ]);
    expect(map.get(0)).toEqual([{ start: 4, end: 18, id: 'a' }]);
    expect(map.get(1)).toEqual([{ start: 19, end: 37, id: 'c' }]);
  });
  it('segments text into plain and marked parts that reassemble exactly', () => {
    const text = 'Add session replay to checkout';
    const segs = segment(text, [{ start: 4, end: 18, id: 'a' }]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs[1]).toEqual({ text: 'session replay', markId: 'a' });
  });
});

describe('Margin components', () => {
  const marks = [{ id: 'm1', index: 1, quote: 'prescription items', tone: 'sensitive' }];
  const notes = [{ id: 'm1', index: 1, label: 'Health data', detail: 'sensitive', quote: 'prescription items', isNew: true }];
  it('links each mark to its note and is accessible', async () => {
    const onActivate = vi.fn();
    const { container } = render(
      <div>
        <EvidenceDocument idPrefix="t" summary="Checkout" blocks={[{ kind: 'paragraph', text: 'Carts with prescription items' }]} marks={marks} activeId={null} labels={LABELS} />
        <MarginNotes idPrefix="t" notes={notes} activeId={null} onActivate={onActivate} />
      </div>,
    );
    const mark = container.querySelector('mark');
    expect(mark.getAttribute('aria-describedby')).toBe('t-note-m1');
    expect(container.querySelector('#t-note-m1').textContent).toContain('Health data');
    fireEvent.click(screen.getByRole('button', { name: /Health data/ }));
    expect(onActivate).toHaveBeenCalledWith('m1');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('renders an empty description message', () => {
    render(<EvidenceDocument idPrefix="t" summary="S" blocks={[]} labels={LABELS} />);
    expect(screen.getByText('No description.')).toBeTruthy();
  });
});

describe('State vocabulary', () => {
  it('maps known states and falls back safely for unknown ones', () => {
    expect(stateDisplay('DPIA_LIKELY')).toEqual({ label: 'DPIA likely', appearance: 'removed', bold: true });
    expect(stateDisplay('SOMETHING_NEW').label).toBe('Not checked yet');
  });
});

describe('Issue panel (real screening states)', () => {
  const granted = (screening) => ({ access: 'granted', issue: { key: 'SHOP-42' }, screening, features: { screening: true } });
  it('shows a loading skeleton announced to assistive tech', () => {
    render(<PanelView resource={resource({ status: 'loading' })} />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });
  it('NOT_SCREENED offers "Check now" and shows no findings', () => {
    const onRecheck = vi.fn(async () => ({ status: 'queued' }));
    render(<PanelView resource={resource({ data: granted({ state: 'NOT_SCREENED', result: null }) })} onRecheck={onRecheck} />);
    expect(screen.getByText('Not checked yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(onRecheck).toHaveBeenCalled();
  });
  it('SCREENING is visibly in progress (busy), never a result', () => {
    const { container } = render(<PanelView resource={resource({ data: granted({ state: 'SCREENING', result: null }) })} />);
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText(/No review needed|DPIA likely/)).toBeNull();
  });
  it('SCREENING_FAILED says it is not treated as clean and offers re-check', () => {
    render(<PanelView resource={resource({ data: granted({ state: 'SCREENING_FAILED', result: null }) })} onRecheck={vi.fn()} />);
    expect(screen.getByText('Check failed')).toBeTruthy();
    expect(screen.getByText(/not treated as clean/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeTruthy();
  });
  it('a result shows outcome, explanation, the rule-based mode label and verified findings', async () => {
    const { container } = render(<PanelView resource={resource({ data: granted({ state: 'DPIA_LIKELY', result: RESULT }) })} onOpenDesk={vi.fn()} onRecheck={vi.fn()} />);
    expect(screen.getByText('DPIA likely')).toBeTruthy();
    expect(screen.getByText(/Sensitive data with 3 high-risk criteria/)).toBeTruthy();
    expect(screen.getByText(/Rule-based check \(limited recall\)/)).toBeTruthy();
    expect(screen.getAllByText('Health data').length).toBeGreaterThan(0);
    expect(screen.getByText('Purpose not stated')).toBeTruthy();
    expect(screen.queryByText(/Approved/)).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });
  it('RESCREEN_REQUIRED keeps the previous result but flags it as possibly out of date', () => {
    render(<PanelView resource={resource({ data: granted({ state: 'RESCREEN_REQUIRED', result: RESULT }) })} />);
    expect(screen.getByText('Rescreening required')).toBeTruthy();
    expect(screen.getByText(/may be out of date/)).toBeTruthy();
    expect(screen.getByText(/Previous result: DPIA likely/)).toBeTruthy();
  });
  it('shows only a permission message when access is denied', () => {
    render(<PanelView resource={resource({ data: { access: 'denied' } })} />);
    expect(screen.getByText(/don't have permission/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shows an error with retry', () => {
    const reload = vi.fn();
    render(<PanelView resource={resource({ status: 'error', error: { message: 'Jira did not respond in time. Try again.', retryable: true }, reload })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });
});

describe('Review workspace (Margin with verified highlights)', () => {
  const data = (screening) => ({ issue: { key: 'SHOP-42', summary: 'Add session replay', projectName: 'Shop', issueType: 'Task', status: 'To Do' }, document: DOC, screening, decision: { available: false, reason: 'DECISIONS_NOT_ENABLED' } });
  it('draws marks from server ranges, links them to margin notes, and keeps decisions disabled with a reason', async () => {
    const { container } = withRouter(<ReviewView resource={resource({ data: data({ state: 'DPIA_LIKELY', result: RESULT, marksValid: true }) })} onBack={vi.fn()} onOpenIssue={vi.fn()} onRecheck={vi.fn()} />);
    const marks = container.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent.replace(/\d+\s*\(evidence.*$/, ''))).toEqual(['ReplayCloud', 'prescription items']);
    expect(marks[0].getAttribute('aria-describedby')).toBe('a25-rv-note-f2');
    expect(screen.getAllByRole('radio').every((r) => r.disabled)).toBe(true);
    expect(screen.getByText(/Recording decisions arrives in the next milestone/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
  it('draws NO marks when the text changed since the check (offsets would be wrong)', () => {
    const { container } = withRouter(<ReviewView resource={resource({ data: data({ state: 'RESCREEN_REQUIRED', result: RESULT, marksValid: false }) })} onBack={vi.fn()} onOpenIssue={vi.fn()} />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.getByText(/may be out of date/)).toBeTruthy();
  });
  it('ignores out-of-range server offsets defensively', () => {
    const bad = { ...RESULT, findings: [{ ...RESULT.findings[0], source: { field: 'description', blockIndex: 0, start: 60, end: 999 } }] };
    const { container } = withRouter(<ReviewView resource={resource({ data: data({ state: 'DPIA_LIKELY', result: bad, marksValid: true }) })} onBack={vi.fn()} onOpenIssue={vi.fn()} />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });
  it('not screened: empty margin with "Check now"; failed: explicit failure banner', () => {
    withRouter(<ReviewView resource={resource({ data: data({ state: 'NOT_SCREENED', result: null, marksValid: false }) })} onBack={vi.fn()} onOpenIssue={vi.fn()} onRecheck={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
  });
  it('shows not-found for missing or inaccessible work items', () => {
    withRouter(<ReviewView resource={resource({ status: 'error', error: { code: 'NOT_FOUND' } })} onBack={vi.fn()} onOpenIssue={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Work item not found' })).toBeTruthy();
  });
});

describe('Desk navigation and access', () => {
  it('matches routes, including encoded review keys', () => {
    expect(matchRoute('/')).toEqual({ name: 'home', params: {} });
    expect(matchRoute('/review/SHOP-42')).toEqual({ name: 'review', params: { issueKey: 'SHOP-42' } });
    expect(matchRoute('/nope').name).toBe('not-found');
  });
  it('hides Settings from non-admins and marks the current page', async () => {
    const { container } = withRouter(<DeskHeader appContext={{ roles: { jiraAdmin: false }, environment: { label: 'Development' } }} />, '/inbox');
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Inbox' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Development environment')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
  it('shows Settings to admins and navigates', () => {
    const { history } = withRouter(<DeskHeader appContext={{ roles: { jiraAdmin: true }, environment: { label: null } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(history.location.pathname).toBe('/settings');
  });
  it('settings show a denial message when the server refuses', () => {
    render(<SettingsView resource={resource({ status: 'error', error: { code: 'NOT_AUTHORISED' } })} />);
    expect(screen.getByText('Settings are available to Jira administrators')).toBeTruthy();
  });
  it('overview labels the example review as fictional and offers no decision controls', async () => {
    const { container } = withRouter(<Home appContext={{ roles: { jiraAdmin: false }, features: { screening: false } }} />);
    expect(screen.getByText(/fictional work item, not a real review/)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Record decision|Approve/ })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });
});


describe('Inbox', () => {
  const items = [
    { issueId: '1', key: 'SHOP-42', summary: 'Add session replay', state: 'DPIA_LIKELY', mode: 'rules', chips: [{ kind: 'sensitive_data', signal: 'health' }], findingCount: 3, updatedAt: Date.now() - 3600000 },
    { issueId: '2', key: 'HR-8', summary: 'Track contractor screens', state: 'REVIEW_REQUIRED', mode: 'ai', chips: [], findingCount: 2, updatedAt: Date.now() - 7200000 },
  ];
  it('lists real items with state, key and chips; strip numbers switch views', async () => {
    const setView = vi.fn();
    const onOpen = vi.fn();
    const { container } = withRouter(<InboxView resource={resource({ data: { enabled: true, view: 'pending', items, counts: { pending: 2, dpiaLikely: 1, needsInfo: 0, oldestPendingMs: 7200000 } } })} view="pending" setView={setView} onOpen={onOpen} />, '/inbox');
    expect(screen.getByText('SHOP-42')).toBeTruthy();
    expect(screen.getByText('Health data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /SHOP-42/ }));
    expect(onOpen).toHaveBeenCalledWith('SHOP-42');
    fireEvent.click(screen.getAllByRole('button', { name: /Needs information$/ })[0]);
    expect(setView).toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });
  it('shows an empty view and validates the open-work-item key', async () => {
    const { history } = withRouter(<InboxView resource={resource({ data: { enabled: true, view: 'pending', items: [], counts: { pending: 0, dpiaLikely: 0, needsInfo: 0, oldestPendingMs: null } } })} view="pending" setView={vi.fn()} onOpen={vi.fn()} />, '/inbox');
    expect(screen.getByText('Nothing in this view')).toBeTruthy();
    const input = screen.getByLabelText('Work item key');
    fireEvent.change(input, { target: { value: 'not a key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('alert').textContent).toContain('SHOP-42');
    fireEvent.change(input, { target: { value: 'shop-42' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open' })));
    expect(history.location.pathname).toBe('/review/SHOP-42');
  });
});
