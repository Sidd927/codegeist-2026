// P1 experience: Get started status (truthful, admin-only) and separation-of-duties guidance data.
// Synthetic data over in-memory repositories. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, decision, REV1, REV2, REPORTER, DEV, ADMIN, OUTSIDER, APPROVE, codeOf, nextRid } from './world.mjs';

const ST = [{ statusReference: 's-todo', name: 'To Do' }, { statusReference: 's-ip', name: 'In Progress' }];
const APP = 'a2030a0d-5fd0-4ace-8ff5-7cdbfdba0cd1';
const ENV = '00000000-0000-4000-8000-000000000001';
const rule = (env = ENV) => ({ ruleKey: 'forge:expression-validator', parameters: { key: `ari:cloud:ecosystem::extension/${APP}/${env}/static/article25-gate` } });
const t = (id, type, to, from, validators = []) => ({ id, name: `T${id}`, type, toStatusReference: to, links: from.map((f) => ({ fromStatusReference: f })), validators });
const wf = (transitions) => ({ id: 'wf1', name: 'Software workflow', scope: { type: 'GLOBAL' }, transitions });

test('get started: admin only, and a fresh install is never presented as protected', async () => {
  const w = await world();
  await assert.rejects(w.desk(REV1).setupStatus(REV1), codeOf('NOT_AUTHORISED'));
  await assert.rejects(w.desk(OUTSIDER).setupStatus(OUTSIDER), codeOf('NOT_AUTHORISED'));
  const s = await w.desk(ADMIN).setupStatus(ADMIN);
  assert.deepEqual(s.reviewers, { group: 'article25-reviewers', youAreMember: false });
  assert.equal(s.signing, 'v3');
  assert.deepEqual([s.gate.coverage, s.gate.overall, s.gate.protectedWorkflows, s.gate.mode], ['none', 'not_protected', 0, 'monitor']);
  assert.equal(s.screening.ai, 'off');
  assert.equal(s.separationOfDuties, 'on');
  assert.deepEqual(s.record, { decisions: 0, lastExportAt: null, notBackedUp: 0 });
  assert.equal(JSON.stringify(s).includes('acc-'), false); // no account ids
});

test('get started: reports real coverage, gaps, unreadable workflows, decisions and backups', async () => {
  const w = await world();
  w.admins.push(REV1); // an admin who is also a reviewer
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [rule()])])], statuses: ST };
  let s = await w.desk(REV1).setupStatus(REV1);
  assert.deepEqual([s.reviewers.youAreMember, s.gate.coverage, s.gate.protectedWorkflows, s.gate.overall], [true, 'complete', 1, 'monitoring']);
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [rule()]), t(31, 'GLOBAL', 's-ip', [])])], statuses: ST };
  s = await w.desk(REV1).setupStatus(REV1);
  assert.deepEqual([s.gate.coverage, s.gate.gapWorkflows, s.gate.overall], ['partial', 1, 'gaps']);
  // Another environment's rule is not this installation's protection.
  w.workflowFixture.current = { workflows: [wf([t(11, 'DIRECTED', 's-ip', ['s-todo'], [rule('00000000-0000-4000-8000-000000000002')])])], statuses: ST };
  s = await w.desk(REV1, { appId: APP, environmentId: ENV }).setupStatus(REV1);
  assert.equal(s.gate.coverage, 'none');
  w.workflowFixture.current = Object.assign(new Error('forbidden'), { status: 403 });
  s = await w.desk(REV1).setupStatus(REV1);
  assert.deepEqual([s.gate.coverage, s.gate.overall], ['unknown', 'unknown']);
  // A decision exists and is not in any archive yet.
  w.workflowFixture.current = { workflows: [], statuses: [] };
  await w.screen(10001);
  await decision(w, REV2, 'SHOP-1', APPROVE);
  s = await w.desk(REV1).setupStatus(REV1);
  assert.deepEqual([s.record.decisions, s.record.lastExportAt, s.record.notBackedUp], [1, null, 1]);
  await w.desk(REV1).exportArchive(REV1);
  s = await w.desk(REV1).setupStatus(REV1);
  assert.equal(s.record.notBackedUp, 0);
  assert.ok(s.record.lastExportAt);
});

test('get started: missing signing key and separation of duties off are reported, not hidden', async () => {
  const w = await world({ recordKey: null, signingKey: null, sod: 'off' });
  const s = await w.desk(ADMIN).setupStatus(ADMIN);
  assert.deepEqual([s.signing, s.separationOfDuties, s.gate.overall], ['none', 'off', 'not_ready']);
});

test('separation of duties: the workspace and panel say which relation applies to YOU, and nothing about others', async () => {
  const w = await world();
  w.members.push({ accountId: REPORTER, displayName: 'Reporter', active: true }, { accountId: DEV, displayName: 'Dev', active: true });
  await w.screen(10001); // SHOP-1: reporter REPORTER, assignee DEV
  const asReporter = (await w.desk(REPORTER).workspace('SHOP-1', REPORTER)).review.permissions;
  const asAssignee = (await w.desk(DEV).workspace('SHOP-1', DEV)).review.permissions;
  const asOther = (await w.desk(REV1).workspace('SHOP-1', REV1)).review.permissions;
  assert.deepEqual([asReporter.decideReason, asReporter.youAre], ['SOD', 'reporter']);
  assert.deepEqual([asAssignee.decideReason, asAssignee.youAre], ['SOD', 'assignee']);
  assert.deepEqual([asOther.canDecide, asOther.youAre], [true, null]);
  // Panel: the same facts, for the caller only.
  const panel = await w.desk(REPORTER).panelState({ id: '10001' }, REPORTER);
  assert.deepEqual(panel.review.you, { isReviewer: true, decideReason: 'SOD', youAre: 'reporter' });
  assert.equal(JSON.stringify(panel).includes(DEV), false); // the assignee's account id is never sent
  // Not a reviewer is a different reason (a permission, not separation of duties).
  const outsider = await w.desk(OUTSIDER).panelState({ id: '10001' }, OUTSIDER);
  assert.deepEqual(outsider.review.you, { isReviewer: false, decideReason: 'NOT_REVIEWER', youAre: null });
  // UI guidance never replaces the server check.
  await assert.rejects(decision(w, REPORTER, 'SHOP-1', APPROVE), codeOf('SOD_BLOCKED'));
  // Both relations at once.
  w.issues[10001].assigneeId = REPORTER;
  assert.equal((await w.desk(REPORTER).workspace('SHOP-1', REPORTER)).review.permissions.youAre, 'reporter_assignee');
  void nextRid;
});

test('workflow pages: parallel after the first when total is known, sequential otherwise, bounded', async () => {
  const { collectPages } = await import('../src/backend/lib/paging.js');
  const page = (startAt, total, size = 50) => ({ startAt, total, isLast: startAt + size >= total, values: Array.from({ length: Math.min(size, total - startAt) }, (_, i) => ({ id: startAt + i })) });
  // 105 workflows: page 0, then pages 50 and 100 requested together.
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPage = async (s) => {
    calls.push(s);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return page(s, 105);
  };
  const r = await collectPages(fetchPage, { pageSize: 50 });
  assert.deepEqual(calls, [0, 50, 100]);
  assert.equal(maxInFlight, 2);
  assert.deepEqual([r.pages.flatMap((p) => p.values).length, r.truncated], [105, false]);
  // No total reported: sequential until isLast.
  const seq = [];
  const noTotal = async (s) => (seq.push(s), { isLast: s >= 100, values: [{ id: s }] });
  assert.deepEqual([(await collectPages(noTotal, { pageSize: 50 })).pages.length, seq], [3, [0, 50, 100]]);
  // Bounded: never more than maxPages, and says so.
  const big = await collectPages(async (s) => page(s, 5000), { pageSize: 50, maxPages: 3 });
  assert.deepEqual([big.pages.length, big.truncated], [3, true]);
  // A single page.
  assert.deepEqual((await collectPages(async (s) => page(s, 7))).pages.length, 1);
});
