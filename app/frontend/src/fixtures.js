// Realistic, synthetic data for rendering whole interfaces in tests (contrast suite). No real identifiers.
const NOW = Date.now();

export const APP_CONTEXT = (over = {}) => ({
  product: 'Article25', version: '0.5.0', environment: { name: 'development', label: 'Development' }, features: { screening: true, decisions: true, gate: true, record: true },
  screening: { ai: 'off' }, roles: { jiraAdmin: true, reviewer: true }, reviewerGroup: 'article25-reviewers', gate: { mode: 'monitor' }, record: { signing: 'v3' }, ...over,
});

export const SETUP_FRESH = {
  reviewers: { group: 'article25-reviewers', youAreMember: false }, signing: 'v3', screening: { ai: 'off', scope: 'all', projects: [] },
  gate: { overall: 'gaps', mode: 'monitor', database: 'ok', coverage: 'partial', coverageError: null, protectedWorkflows: 1, gapWorkflows: 1, checksLast7Days: 2 },
  separationOfDuties: 'off', record: { decisions: 2, lastExportAt: null, notBackedUp: 2 },
};
export const SETUP_DONE = {
  reviewers: { group: 'article25-reviewers', youAreMember: true }, signing: 'v3', screening: { ai: 'on', scope: 'projects', projects: ['SHOP', 'HR'] },
  gate: { overall: 'enforcing', mode: 'enforce', database: 'ok', coverage: 'complete', coverageError: null, protectedWorkflows: 2, gapWorkflows: 0, checksLast7Days: 9 },
  separationOfDuties: 'on', record: { decisions: 12, lastExportAt: NOW - 3600000, notBackedUp: 0 },
};

export const RESULT = {
  screeningId: 's1', outcome: 'DPIA_LIKELY', mode: 'rules', model: null, aiStatus: 'not_enabled', checkedAt: NOW - 120000,
  rulesVersion: 'r1.0.0', reasons: [{ ruleId: 'R-SENS-2', outcome: 'DPIA_LIKELY', params: { criteria: 3 } }],
  trace: [{ ruleId: 'R-NEG', result: 'not_matched' }, { ruleId: 'R-SENS-2', result: 'fired' }], criteria: [], truncated: false, quality: { rejected: 0, dropped: 0 },
  findings: [
    { id: 'f1', index: 1, kind: 'sensitive_data', signal: 'health', certainty: 'implied', severity: 'high', isNew: true, detail: null, question: null, provenance: 'rules', excerpt: 'prescription items', source: { field: 'description', blockIndex: 0, start: 51, end: 69 } },
    { id: 'f2', index: 2, kind: 'external_sharing', signal: 'ReplayCloud', certainty: 'stated', severity: 'medium', isNew: true, detail: 'no_approved_list', question: null, provenance: 'rules', excerpt: 'ReplayCloud', source: { field: 'summary', blockIndex: -1, start: 36, end: 47 } },
    { id: 'f3', index: null, kind: 'missing_info', signal: 'purpose', certainty: 'question', severity: 'info', isNew: false, detail: null, question: null, provenance: null, excerpt: null, source: null },
  ],
};
const DOC = { summary: 'Add session replay to checkout with ReplayCloud', blocks: [{ kind: 'paragraph', text: 'Record checkout sessions and segment shoppers with prescription items.' }], truncated: false };

export const REVIEW = (permissions = {}) => ({
  status: 'AWAITING_REVIEW', approvedForContent: false, latestSeq: 1, assignmentSeq: 1,
  assignee: { id: 'acc-rev-1', name: 'Reviewer One', active: true },
  decisions: [
    { seq: 1, kind: 'system', decision: 'APPROVAL_INVALIDATED', rationale: null, conditions: [], questions: [], decidedBy: null, decidedAt: NOW - 3600000, contentRef: 'c144dcc7', detail: { added: { categories: ['contact'] }, escalated: false }, record: { seq: 3, format: 'ed25519', kid: 'k2ef06b1c223f8666' } },
  ],
  assignments: [], binding: { screeningId: 'ee'.repeat(32), fp: 'ab12cd34'.padEnd(64, '0') },
  permissions: { isReviewer: true, canDecide: true, decideReason: null, youAre: null, canAssign: true, ...permissions },
});

export const WORKSPACE = () => ({
  issue: { key: 'SHOP-42', summary: DOC.summary, projectName: 'Shop', issueType: 'Task', status: 'To Do' },
  document: DOC,
  screening: { state: 'DPIA_LIKELY', result: RESULT, marksValid: true },
  review: REVIEW(),
  gate: { mode: 'monitor', allow: false, reason: 'REVIEW_REQUIRED', message: 'This work item needs a privacy review.', policyVersion: 'g1', recent: [{ at: NOW - 60000, verdict: 'would_block', reason: 'REVIEW_REQUIRED', to: 'In Progress', mode: 'monitor' }] },
});

export const INBOX = {
  items: [
    { issueId: '1', key: 'SHOP-42', summary: 'Add session replay', projectKey: 'SHOP', outcome: 'DPIA_LIKELY', screeningState: 'SCREENED', reviewStatus: 'APPROVAL_STALE', assignee: { name: 'Reviewer One', active: true }, mode: 'rules', chips: [{ kind: 'sensitive_data', signal: 'health' }], findingCount: 3, ageMs: 3600000 },
    { issueId: '2', key: 'HR-8', summary: 'Track contractor screens', projectKey: 'HR', outcome: 'REVIEW_REQUIRED', screeningState: 'SCREENED', reviewStatus: 'AWAITING_REVIEW', assignee: null, mode: 'ai', chips: [], findingCount: 2, ageMs: 7200000 },
  ],
  total: 2, page: 1, pages: 1, pageSize: 25, counts: { attention: 2, awaiting: 1, changed: 1, dpiaLikely: 1, mine: 1, oldestAttentionMs: 7200000 }, projects: ['HR', 'SHOP'], isReviewer: true,
};
export const INBOX_FILTERS = { view: 'attention', severity: 'any', project: 'any', assignee: 'any', page: 1 };

export const REGISTER = {
  items: [
    { key: 'SHOP-1', summary: 'Session replay', seq: 1, kind: 'human', decision: 'APPROVED', decidedBy: { name: 'Reviewer One' }, decidedAt: NOW - 60000, outcome: 'DPIA_LIKELY', contentRef: 'c144dcc7', record: { seq: 3, format: 'ed25519', kid: 'k2ef06b1c223f8666' }, inLastExport: true },
    { key: 'HR-7', summary: 'Payroll export', seq: 2, kind: 'system', decision: 'APPROVAL_INVALIDATED', decidedBy: null, decidedAt: NOW - 120000, outcome: 'REVIEW_REQUIRED', contentRef: '2982a0f8', record: { seq: 2, format: 'legacy', kid: null }, inLastExport: false },
    { key: 'HR-8', summary: 'Pending', seq: 1, kind: 'human', decision: 'REJECTED', decidedBy: { name: 'Reviewer Two' }, decidedAt: NOW - 1000, outcome: 'REVIEW_REQUIRED', contentRef: 'aaaaaaaa', record: null, inLastExport: false },
  ],
  total: 3, page: 1, pages: 1, signing: 'v3', lastExport: { at: NOW - 3600000, headSeq: 3 }, isReviewer: true,
};

export const SETTINGS = {
  environment: { name: 'development', label: 'Development' }, version: '0.5.0',
  sections: [
    { key: 'scope', status: 'all-projects' }, { key: 'people', status: 'configured' }, { key: 'ai', status: 'off' }, { key: 'record', status: 'configured' }, { key: 'gate', status: 'monitor' },
  ],
  screening: { ai: 'off', aiModel: null, dailyAiBudget: 150, aiSpend: { usedMicros: 0, capMicros: 0 }, scopeProjects: [], countsByState: { SCREENED: 11 }, today: { screenings: 5, aiCalls: 0, ruleBased: 5 } },
  review: { reviewerGroup: 'article25-reviewers', youAreReviewer: true, separationOfDuties: true, separationOfDutiesSetting: { value: 'on', seq: 2, isDefault: false }, recordSigning: 'configured' },
};

export const GATE_OVERVIEW = {
  health: {
    overall: 'gaps', mode: { mode: 'monitor', seq: 0, isDefault: true, changedAt: null }, checks: { database: 'ok', signing: 'configured' },
    coverage: {
      status: 'partial', workflowsScanned: 103,
      workflows: [
        { workflowId: 'w1', name: 'Software workflow for project A25GT', scope: { type: 'team-managed', projectId: '10205' }, protectedStatuses: ['In Progress'], covered: [{ id: '21', name: 'In Progress', type: 'GLOBAL', to: 'In Progress', from: ['Any status'] }], gaps: [{ id: '31', name: 'Rework', type: 'DIRECTED', to: 'In Progress', from: ['In Review'] }], coverage: 'partial' },
      ],
    },
    activity: { would_block: 2 }, policyVersion: 'g1',
  },
  recent: [{ at: NOW - 60000, mode: 'monitor', verdict: 'would_block', reason: 'REVIEW_REQUIRED', to: 'In Progress', issueKey: 'A25GT-1' }, { at: NOW - 90000, mode: 'monitor', verdict: 'would_allow', reason: 'ALLOW_APPROVED', to: 'In Progress', issueKey: 'A25GT-2' }],
  modeHistory: [], separationOfDuties: { value: 'on', seq: 0, isDefault: true }, separationOfDutiesHistory: [],
};

export const RECORD_STATUS = {
  signing: 'v3', currentKey: { kid: 'k2ef06b1c223f8666', fingerprint: 'ab12 '.repeat(15) + 'ab12' }, legacyKey: true,
  keys: [{ kid: 'k2ef06b1c223f8666', fingerprint: 'x', registeredAt: 't', trusted: true, current: true, endorsedByPredecessor: null }],
  head: 7, counts: { decisions: 7, records: 7, assignments: 2 },
  lastExport: { at: NOW - 3600000, headSeq: 5, digest: 'd' }, lastVerify: { at: NOW - 60000, outcome: 'verified', headSeq: 7 }, lastRestore: null,
  notInLastExport: 2, backedUpSeq: 5, restoreIncomplete: false, retiredKeys: [],
  events: [{ at: NOW - 60000, type: 'verify', outcome: 'verified', headSeq: 7, by: 'Admin One', digest: null }], externalRegister: { status: 'archive_only' },
};

export const PANEL = {
  access: 'granted', issue: { id: '1', key: 'SHOP-42', projectKey: 'SHOP' },
  screening: { state: 'DPIA_LIKELY', result: RESULT },
  review: { status: 'APPROVAL_STALE', assignee: { name: 'Reviewer One' }, latest: { kind: 'system', decision: 'APPROVAL_INVALIDATED', decidedBy: null, decidedAt: NOW - 3600000 }, you: { isReviewer: true, decideReason: 'SOD', youAre: 'reporter' } },
  gate: { mode: 'monitor', allow: false, reason: 'APPROVAL_INVALIDATED', message: 'x', policyVersion: 'g1' },
  features: { screening: true }, ai: 'off',
};
