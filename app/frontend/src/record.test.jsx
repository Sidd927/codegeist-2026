// M5 record & recovery UI tests (synthetic data, mocked API client).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RegisterView } from './desk/routes/Register.jsx';
import { RecordSettingsView } from './desk/settings/RecordSettings.jsx';
import { History } from './desk/review/History.jsx';
import { axeViolations } from './a11y.js';

const resource = (over) => ({ status: 'success', data: null, error: null, reload: vi.fn(), refresh: vi.fn(async () => undefined), ...over });
const NOW = Date.now();

const REG = {
  items: [
    { key: 'SHOP-1', summary: 'Session replay', seq: 1, kind: 'human', decision: 'APPROVED', decidedBy: { name: 'Reviewer One' }, decidedAt: NOW - 60000, outcome: 'DPIA_LIKELY', contentRef: 'c144dcc7', record: { seq: 3, format: 'ed25519', kid: 'k2ef06b1c223f8666' }, inLastExport: true },
    { key: 'HR-7', summary: 'Payroll export', seq: 2, kind: 'system', decision: 'APPROVAL_INVALIDATED', decidedBy: null, decidedAt: NOW - 120000, outcome: 'REVIEW_REQUIRED', contentRef: '2982a0f8', record: { seq: 2, format: 'legacy', kid: null }, inLastExport: false },
    { key: 'HR-8', summary: 'Pending', seq: 1, kind: 'human', decision: 'REJECTED', decidedBy: { name: 'Reviewer Two' }, decidedAt: NOW - 1000, outcome: 'REVIEW_REQUIRED', contentRef: 'aaaaaaaa', record: null, inLastExport: false },
  ],
  total: 3, page: 1, pages: 1, signing: 'v3', lastExport: { at: NOW - 3600000, headSeq: 3 }, isReviewer: true,
};

describe('Decision record page', () => {
  it('lists decisions with signature and backup status; system decisions are labelled; accessible', async () => {
    const onOpen = vi.fn();
    const { container } = render(<RegisterView resource={resource({ data: REG })} page={1} setPage={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByText(/signed with Ed25519/)).toBeTruthy();
    expect(screen.getByText(/Last signed archive exported/)).toBeTruthy();
    expect(screen.getByText('Ed25519')).toBeTruthy();
    expect(screen.getByText('Legacy (HMAC)')).toBeTruthy();
    expect(screen.getByText('Being signed')).toBeTruthy();
    expect(screen.getByText('Article25 (automatic)')).toBeTruthy();
    expect(screen.getAllByText('Not yet').length).toBe(2);
    fireEvent.click(screen.getByRole('link', { name: 'SHOP-1' }));
    expect(onOpen).toHaveBeenCalledWith('SHOP-1');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('empty, error and paginated states', () => {
    const setPage = vi.fn();
    const { rerender } = render(<RegisterView resource={resource({ data: { ...REG, items: [], total: 0 } })} page={1} setPage={setPage} onOpen={vi.fn()} />);
    expect(screen.getByText('No decisions yet')).toBeTruthy();
    rerender(<RegisterView resource={resource({ status: 'error', error: { message: 'Jira did not respond in time. Try again.', retryable: true } })} page={1} setPage={setPage} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    rerender(<RegisterView resource={resource({ data: { ...REG, page: 1, pages: 2, total: 30 } })} page={1} setPage={setPage} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(setPage).toHaveBeenCalledWith(2);
  });
});

const STATUS = (over = {}) => ({
  signing: 'v3',
  currentKey: { kid: 'k2ef06b1c223f8666', fingerprint: 'ab12 '.repeat(15) + 'ab12' },
  legacyKey: true,
  keys: [{ kid: 'k2ef06b1c223f8666', fingerprint: 'x', registeredAt: 't', trusted: true, current: true, endorsedByPredecessor: null }],
  head: 7, counts: { decisions: 7, records: 7, assignments: 2 },
  lastExport: { at: NOW - 3600000, headSeq: 5, digest: 'd' }, lastVerify: { at: NOW - 60000, outcome: 'verified', headSeq: 7 }, lastRestore: null,
  notInLastExport: 2, events: [{ at: NOW - 60000, type: 'verify', outcome: 'verified', headSeq: 7, by: 'Admin One', digest: null }],
  externalRegister: { status: 'archive_only' },
  ...over,
});

describe('Decision record settings', () => {
  it('shows the key fingerprint to pin, integrity, backup freshness, removal guidance and the external register status', async () => {
    const { container } = render(<RecordSettingsView resource={resource({ data: STATUS() })} client={{}} />);
    expect(screen.getByText(/ab12 ab12/)).toBeTruthy();
    expect(screen.getByText(/Save this fingerprint somewhere outside Jira/)).toBeTruthy();
    expect(screen.getByText('2 records are not in any exported archive.')).toBeTruthy();
    expect(screen.getByText(/Restore is only possible when this site has no decisions/)).toBeTruthy();
    expect(screen.getByText(/soft-deletes app data/)).toBeTruthy();
    expect(screen.getByText(/does not publish it to other products/)).toBeTruthy(); // archive-only design (final audit)
    expect(screen.getByText(/Admin One/)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('verifies the whole record on request and reports problems', async () => {
    const client = { verifyLedger: vi.fn().mockResolvedValue({ status: 'problem', errors: ['seq 3: bad signature'] }) };
    render(<RecordSettingsView resource={resource({ data: STATUS() })} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verify the whole record' })));
    expect(screen.getByRole('alert').textContent).toMatch(/Problem found/);
    expect(screen.getByText('seq 3: bad signature')).toBeTruthy();
  });

  it('exports in chunks, never claims a download it cannot observe, and always offers copy', async () => {
    const client = { exportArchive: vi.fn().mockResolvedValue({ transferId: 'a'.repeat(32), chunks: 2, createdAt: '2026-11-23T10:00:00.000Z', head: { seq: 7 } }), transferChunk: vi.fn(async ({ idx }) => ({ idx, data: idx === 0 ? '{"a":' : '1}' })) };
    render(<RecordSettingsView resource={resource({ data: STATUS() })} client={client} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download signed archive' })));
    expect(client.transferChunk).toHaveBeenCalledTimes(2);
    // A blocked download does not always throw: the UI only says the browser SHOULD save it, and
    // always offers a second way to keep the archive.
    expect(screen.getByText(/should now save article25-record-2026-11-23-seq7.json/)).toBeTruthy();
    expect(screen.queryByText(/Downloaded/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy archive' })).toBeTruthy();
    // Live finding: sandboxed iframes may block both downloads and clipboard writes. The text view
    // always works (the user selects and copies it themself).
    fireEvent.click(screen.getByRole('button', { name: 'Show archive text' }));
    expect(screen.getByLabelText(/Archive \(JSON\)/).value).toBe('{"a":1}');
    expect(screen.getByRole('button', { name: 'Select all' })).toBeTruthy();
  });

  it('restore: uploads in chunks, shows the verification report, and restores only after explicit confirmation', async () => {
    const report = { status: 'complete', restorable: true, errors: [], warnings: [], head: { seq: 7 }, createdAt: '2026-11-23T10:00:00.000Z', keys: [{ kid: 'k2ef06b1c223f8666', trusted: true }], pending: 0 };
    const client = {
      uploadArchiveChunk: vi.fn().mockResolvedValue({ received: true }),
      beginRestore: vi.fn().mockResolvedValue({ report, token: 't'.repeat(48), resume: false }),
      confirmRestore: vi.fn().mockResolvedValue({ outcome: 'restored_verified', counts: {} }),
    };
    const refresh = vi.fn(async () => undefined);
    render(<RecordSettingsView resource={resource({ data: STATUS({ counts: { decisions: 0, records: 0, assignments: 0 } }), refresh })} client={client} />);
    const text = 'x'.repeat(250_000);
    const file = new File([text], 'archive.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Archive file'), { target: { files: [file] } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Upload and verify' })));
    expect(await screen.findByText('Valid and complete')).toBeTruthy();
    expect(client.uploadArchiveChunk).toHaveBeenCalledTimes(3); // 100k-character chunks
    expect(client.beginRestore.mock.calls[0][0]).toMatchObject({ chunks: 3 });
    expect(client.confirmRestore).not.toHaveBeenCalled();
    expect(screen.getByText(/An older archive restores older decisions/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore these decisions' })));
    expect(client.confirmRestore.mock.calls[0][0]).toMatchObject({ chunks: 3, token: 't'.repeat(48) });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/Restored and verified/);
  });

  it('an unfinished restore (failed or killed mid-write) is called out and the restore form stays available to resume', async () => {
    render(<RecordSettingsView resource={resource({ data: STATUS({ restoreIncomplete: true, lastRestore: { at: NOW - 120000, outcome: 'in_progress', headSeq: 7 } }) })} client={{}} />);
    expect(screen.getByText('A restore did not finish')).toBeTruthy();
    expect(screen.getByText(/Verify the same archive again below to resume it/)).toBeTruthy();
    expect(screen.getByLabelText('Archive file')).toBeTruthy(); // not hidden behind "only possible when empty"
  });

  it('an invalid archive shows its errors and offers no restore button', async () => {
    const report = { status: 'invalid', restorable: false, errors: ['archive is not signed by a trusted key'], warnings: [], head: null, keys: [], pending: 0 };
    const client = { uploadArchiveChunk: vi.fn().mockResolvedValue({}), beginRestore: vi.fn().mockResolvedValue({ report, token: null }) };
    render(<RecordSettingsView resource={resource({ data: STATUS({ counts: { decisions: 0, records: 0, assignments: 0 } }) })} client={client} />);
    fireEvent.change(screen.getByLabelText('Archive file'), { target: { files: [new File(['{}'], 'a.json')] } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Upload and verify' })));
    expect(await screen.findByText(/Not valid: nothing can be restored/)).toBeTruthy();
    expect(screen.getByText('archive is not signed by a trusted key')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore these decisions' })).toBeNull();
  });

  it('after a key loss, an untrusted previous key can be adopted only with its typed fingerprint', async () => {
    const client = { adoptPreviousKey: vi.fn().mockResolvedValue({ status: 'adopted' }) };
    const keys = [STATUS().keys[0], { kid: 'k1111111111111111', fingerprint: 'y', registeredAt: 't', trusted: false, current: false, endorsedByPredecessor: null }];
    render(<RecordSettingsView resource={resource({ data: STATUS({ keys }) })} client={client} />);
    expect(screen.getByText('Adopt a previous key')).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Adopt key' });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Fingerprint of k1111111111111111'), { target: { value: 'ab12 cd34' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Adopt key' })));
    expect(client.adoptPreviousKey).toHaveBeenCalledWith({ kid: 'k1111111111111111', fingerprint: 'ab12 cd34' });
  });

  it('loading and error states', () => {
    const { rerender } = render(<RecordSettingsView resource={resource({ status: 'loading' })} client={{}} />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    rerender(<RecordSettingsView resource={resource({ status: 'error', error: { message: 'x', retryable: true } })} client={{}} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    // First minute after install: an informational "setting up" state, not an error, with retry.
    rerender(<RecordSettingsView resource={resource({ status: 'error', error: { code: 'SETTING_UP', message: 'Article25 is finishing its setup on this site.', retryable: true } })} client={{}} />);
    expect(screen.getByText('Article25 is setting up')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this view")).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('Workspace history signature line', () => {
  const review = (isReviewer) => ({
    decisions: [{ seq: 1, kind: 'human', decision: 'APPROVED', rationale: 'Fine.', conditions: [], questions: [], decidedBy: { name: 'Reviewer One' }, decidedAt: NOW, contentRef: 'c144dcc7', detail: null, record: { seq: 3, format: 'ed25519', kid: 'k2ef06b1c223f8666' } }],
    assignments: [], permissions: { isReviewer },
  });
  it('shows the signed record and lets reviewers download it', async () => {
    const client = { decisionRecord: vi.fn().mockResolvedValue({ record: {} }), verifyRecord: vi.fn() };
    render(<History issueKey="SHOP-1" review={review(true)} client={client} />);
    expect(screen.getByText(/Signed record · Ed25519 · k2ef06b1c223f8666/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download signed record' })));
    expect(client.decisionRecord).toHaveBeenCalledWith({ issueKey: 'SHOP-1', seq: 1 });
  });
  it('non-reviewers see the signature status but no download', () => {
    render(<History issueKey="SHOP-1" review={review(false)} client={{}} />);
    expect(screen.getByText(/Signed record · Ed25519/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download signed record' })).toBeNull();
  });
});
