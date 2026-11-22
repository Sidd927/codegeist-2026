// M3 review UI tests: decision form, assignment and history (synthetic data, mocked API client).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DecisionForm, precheck } from './desk/review/DecisionForm.jsx';
import { Assignment } from './desk/review/Assignment.jsx';
import { History } from './desk/review/History.jsx';
import { ClientError } from './shared/api.js';
import { axeViolations } from './a11y.js';

const FP = 'ab12cd34'.padEnd(64, '0');
const SID = 'ee'.repeat(32);
const review = (over = {}) => ({
  status: 'AWAITING_REVIEW', approvedForContent: false, latestSeq: 2, assignmentSeq: 1,
  assignee: { id: 'acc-rev-1', name: 'Reviewer One', active: true },
  decisions: [], assignments: [], binding: { screeningId: SID, fp: FP },
  permissions: { isReviewer: true, canDecide: true, decideReason: null, canAssign: true },
  ...over,
});
const VALUES = { Approve: 'APPROVED', 'Approve with conditions': 'APPROVED_WITH_CONDITIONS', 'Request more information': 'NEEDS_MORE_INFORMATION', Reject: 'REJECTED' };
const pick = (name) => fireEvent.click(screen.getAllByRole('radio').find((r) => r.value === VALUES[name]));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Decision form', () => {
  it('sends the decision bound to the evidence, the last seen sequence and an idempotency key', async () => {
    const client = { decide: vi.fn().mockResolvedValue({ status: 'recorded' }) };
    const onRecorded = vi.fn();
    const { container } = render(<DecisionForm issueKey="SHOP-42" review={review()} onRecorded={onRecorded} client={client} />);
    expect(screen.getByText(/content reference ab12cd34/)).toBeTruthy();
    pick('Approve with conditions');
    type('Conditions 1', 'Mask all form inputs');
    type('Rationale', '  Proportionate   once inputs are masked. ');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    const payload = client.decide.mock.calls[0][0];
    expect(payload).toMatchObject({ issueKey: 'SHOP-42', screeningId: SID, fp: FP, expectedSeq: 2, input: { decision: 'APPROVED_WITH_CONDITIONS', conditions: ['Mask all form inputs'], questions: [] } });
    expect(payload.requestId).toMatch(/^[A-Za-z0-9-]{16,}$/);
    expect(onRecorded).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Decision recorded.');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('checks required content early; the server remains the authority', async () => {
    const client = { decide: vi.fn() };
    render(<DecisionForm issueKey="SHOP-42" review={review()} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(screen.getByText('Choose an outcome.')).toBeTruthy();
    pick('Request more information');
    type('Rationale', 'short');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(screen.getByText('Write at least 10 characters.')).toBeTruthy();
    expect(screen.getByText('Add at least one question.')).toBeTruthy();
    expect(client.decide).not.toHaveBeenCalled();
    expect(precheck({ decision: 'APPROVED', rationale: 'Proportionate as described.', conditions: [], questions: [] })).toEqual({});
  });

  it('rejection needs a second, explicit confirmation', async () => {
    const client = { decide: vi.fn().mockResolvedValue({ status: 'recorded' }) };
    render(<DecisionForm issueKey="SHOP-42" review={review()} client={client} />);
    pick('Reject');
    type('Rationale', 'Recording health data is not proportionate.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(client.decide).not.toHaveBeenCalled();
    expect(screen.getByText(/Rejections are recorded permanently/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' })));
    expect(client.decide).toHaveBeenCalledTimes(1);
    expect(client.decide.mock.calls[0][0].input.decision).toBe('REJECTED');
  });

  it('shows server field errors and reuses the same request id when retrying', async () => {
    const client = { decide: vi.fn().mockRejectedValueOnce(new ClientError({ code: 'INVALID_INPUT', message: 'Some fields need attention.', retryable: false, fields: { rationale: 'rationale_too_long' } })).mockResolvedValueOnce({ status: 'recorded' }) };
    render(<DecisionForm issueKey="SHOP-42" review={review()} client={client} />);
    pick('Approve');
    type('Rationale', 'Proportionate as described in the ticket.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(screen.getByText('Keep the rationale under 2,000 characters.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Some fields need attention.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(client.decide.mock.calls[1][0].requestId).toBe(client.decide.mock.calls[0][0].requestId);
  });

  it('a conflict or stale evidence offers a reload instead of overwriting', async () => {
    const onRecorded = vi.fn();
    const client = { decide: vi.fn().mockRejectedValue(new ClientError({ code: 'STALE_EVIDENCE', message: 'The work item changed since these findings were produced. Re-check it before deciding.', retryable: false })) };
    render(<DecisionForm issueKey="SHOP-42" review={review()} onRecorded={onRecorded} client={client} />);
    pick('Approve');
    type('Rationale', 'Proportionate as described in the ticket.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record decision' })));
    expect(screen.getByRole('alert').textContent).toContain('changed since');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRecorded).toHaveBeenCalled();
  });

  it.each([
    ['NOT_REVIEWER', /Only members of the reviewer group/],
    ['SOD', /another reviewer must decide/],
    ['STALE_EVIDENCE', /Re-check it so the decision is made on the current text/],
    ['CHECKING', /being checked/],
    ['NOT_CONFIGURED', /not configured on this site/],
  ])('no form when the server says %s', (reason, text) => {
    render(<DecisionForm issueKey="SHOP-42" review={review({ binding: null, permissions: { isReviewer: reason !== 'NOT_REVIEWER', canDecide: false, decideReason: reason, canAssign: reason !== 'NOT_REVIEWER' } })} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record decision' })).toBeNull();
  });
});

describe('Assignment', () => {
  it('assigns to me with the last seen assignment sequence', async () => {
    const client = { assign: vi.fn().mockResolvedValue({ status: 'assigned' }) };
    const onChanged = vi.fn();
    render(<Assignment issueKey="SHOP-42" review={review()} onChanged={onChanged} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Assign to me' })));
    expect(client.assign.mock.calls[0][0]).toMatchObject({ issueKey: 'SHOP-42', assigneeId: 'me', expectedSeq: 1 });
    expect(onChanged).toHaveBeenCalled();
  });
  it('offers only active reviewers when picking someone', async () => {
    const client = { reviewers: vi.fn().mockResolvedValue({ reviewers: [{ accountId: 'a1', displayName: 'Reviewer One', active: true }, { accountId: 'a2', displayName: 'Former Reviewer', active: false }] }), assign: vi.fn().mockResolvedValue({ status: 'assigned' }) };
    const { container } = render(<Assignment issueKey="SHOP-42" review={review({ assignee: null })} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Assign to' })));
    const select = screen.getByLabelText('Choose a reviewer');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Choose a reviewer', 'Reviewer One']);
    fireEvent.change(select, { target: { value: 'a1' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Assign' })));
    expect(client.assign.mock.calls[0][0].assigneeId).toBe('a1');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('shows an inactive assignee and no controls for non-reviewers', () => {
    render(<Assignment issueKey="SHOP-42" review={review({ assignee: { name: 'Former Reviewer', active: false }, permissions: { isReviewer: false, canDecide: false, decideReason: 'NOT_REVIEWER', canAssign: false } })} />);
    expect(screen.getByText(/inactive account/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('History', () => {
  const decisions = [
    { seq: 2, kind: 'system', decision: 'APPROVAL_INVALIDATED', rationale: null, conditions: [], questions: [], decidedBy: null, decidedAt: Date.now() - 60000, outcome: 'DPIA_LIKELY', contentRef: '9f8e7d6c', detail: { carried: 'APPROVED', added: { categories: ['health'], recipients: ['twilio'] }, escalated: true, from: 'REVIEW_REQUIRED', to: 'DPIA_LIKELY' } },
    { seq: 1, kind: 'human', decision: 'APPROVED', rationale: 'Proportionate with masking.', conditions: [], questions: [], decidedBy: { name: 'Reviewer One', active: true }, decidedAt: Date.now() - 3600000, outcome: 'REVIEW_REQUIRED', contentRef: 'ab12cd34', detail: null },
  ];
  const assignments = [{ seq: 1, assignee: { name: 'Reviewer One' }, assignedBy: { name: 'Reviewer Two' }, assignedAt: Date.now() - 7200000 }];
  it('explains system invalidations and shows who decided what, newest first', async () => {
    const { container } = render(<History issueKey="SHOP-42" review={review({ decisions, assignments })} client={{ verifyRecord: vi.fn() }} />);
    const items = screen.getAllByRole('listitem').filter((li) => li.parentElement.classList.contains('a25-history__timeline'));
    expect(items.map((li) => li.textContent.slice(0, 40))).toHaveLength(3);
    expect(items[0].textContent).toContain('Approval invalidated');
    expect(items[0].textContent).toContain('Health data');
    expect(items[0].textContent).toContain('Shared with twilio');
    expect(items[0].textContent).toContain('from Review required to DPIA likely');
    expect(items[1].textContent).toContain('by Reviewer One');
    expect(items[1].textContent).toContain('Proportionate with masking.');
    expect(items[2].textContent).toContain('Assigned to Reviewer One by Reviewer Two');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('verifies the signed record on request (reviewers only)', async () => {
    const client = { verifyRecord: vi.fn().mockResolvedValue({ status: 'verified' }) };
    render(<History issueKey="SHOP-42" review={review({ decisions })} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verify record' })));
    expect(screen.getByRole('status').textContent).toMatch(/Record verified/);
    render(<History issueKey="SHOP-42" review={review({ decisions, permissions: { isReviewer: false, canDecide: false, canAssign: false } })} />);
    expect(screen.getAllByRole('button', { name: 'Verify record' })).toHaveLength(1);
  });
});
