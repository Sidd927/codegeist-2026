// Demo-film data (synthetic). Runs the REAL Article25 services (screening rules engine, review,
// evidence-locked approval, gate, Ed25519 ledger, archive, restore) over in-memory storage and a fake
// Jira, exactly as the integration tests do, and writes the resolver payloads the real UI renders.
// Nothing here is invented: every state is what the services return for this synthetic story.
// Vendor and people names are fictional. Usage: node scripts/film-data.mjs <out.json> <archive-dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { world, decision, adf, REV1, REV2, DEV, nextRid } from '../test/world.mjs';

const [out = '/tmp/a25-film/data.json', archiveDir = '/tmp/a25-film'] = process.argv.slice(2);
mkdirSync(archiveDir, { recursive: true });

const w = await world();
w.advance(Date.now() - w.clock() - 3 * 3600_000); // timestamps read naturally ("3 h ago" … "just now")
// Fictional people (display names only; account ids stay synthetic).
const people = { [REV1]: 'Maya Okafor', [REV2]: 'Daniel Reyes' };
for (const m of w.members) if (people[m.accountId]) m.displayName = people[m.accountId];
w.admins.push(REV1); // Maya is a Jira admin and a privacy reviewer
// The story's work item: a developer (DEV) reports it; Maya reviews it.
w.issues[10001] = {
  key: 'SHOP-214', projectKey: 'SHOP',
  summary: 'Add session replay to checkout with Fernwick',
  description: adf('Record checkout sessions to understand where shoppers drop off. Group shoppers who abandon carts containing prescription items for a follow-up campaign.'),
  reporterId: DEV, assigneeId: DEV, hiddenFrom: [],
};
w.issues[10002] = { ...w.issues[10002], key: 'HR-88', projectKey: 'HR', summary: 'Export payroll records to the new payroll provider', reporterId: DEV, assigneeId: null };

const APP = 'a2030a0d-5fd0-4ace-8ff5-7cdbfdba0cd1';
const ENV = '00000000-0000-4000-8000-0000000000f1';
const ST = [{ statusReference: 's-todo', name: 'To Do' }, { statusReference: 's-ip', name: 'In Progress' }, { statusReference: 's-done', name: 'Done' }];
const rule = { ruleKey: 'forge:expression-validator', parameters: { key: `ari:cloud:ecosystem::extension/${APP}/${ENV}/static/article25-gate` } };
const t = (id, name, to, from, validators = []) => ({ id, name, type: from.length ? 'DIRECTED' : 'GLOBAL', toStatusReference: to, links: from.map((f) => ({ fromStatusReference: f })), validators });
const over = { appId: APP, environmentId: ENV };
const asAdmin = () => w.desk(REV1, over);
const payload = (key) => ({ issue: { key }, transition: { from: { id: '1' }, to: { id: '3' } } });

const S = {};
// 0. A fresh install: nothing protected yet.
S.setupFresh = await asAdmin().setupStatus(REV1);
S.appContext = await asAdmin().appContext(REV1);
// 1. Protect a transition (workflow fixture shaped like Jira's API), then screen the work item.
w.workflowFixture.current = { workflows: [{ id: 'wf1', name: 'Software workflow for project SHOP', scope: { type: 'GLOBAL' }, transitions: [t(11, 'Start work', 's-ip', ['s-todo'], [rule]), t(21, 'Done', 's-done', ['s-ip'])] }], statuses: ST };
await w.screen(10001);
await w.screen(10002);
S.panelRequester = await w.desk(DEV, over).panelState({ id: '10001' }, DEV);
S.inbox = await w.desk(REV1, over).inbox({ view: 'attention' }, REV1);
S.workspaceBefore = await w.desk(REV1, over).workspace('SHOP-214', REV1);
// 2. Enforce, and try the transition before any decision: blocked.
const ov = await asAdmin().gateOverview(REV1);
await asAdmin().setGateMode({ mode: 'enforce', expectedSeq: ov.health.mode.seq, requestId: nextRid(), note: 'Pilot on SHOP' }, REV1);
S.gateBlockedBefore = await w.gateFor(null, over).validateDetailed(payload('SHOP-214'));
w.advance(20 * 60_000);
// 3. Maya approves with a condition; Daniel later confirms the condition with Approve.
await decision(w, REV1, 'SHOP-214', { decision: 'APPROVED_WITH_CONDITIONS', rationale: 'Proportionate for checkout analytics once form inputs are masked and prescription pages are excluded.', conditions: ['Mask every form input in recordings', 'Exclude prescription pages from replay'] });
w.advance(25 * 60_000);
await decision(w, REV2, 'SHOP-214', { decision: 'APPROVED', rationale: 'Conditions confirmed in the replay configuration: inputs masked, prescription pages excluded.' });
S.workspaceApproved = await w.desk(REV1, over).workspace('SHOP-214', REV1);
S.gateAllowed = await w.gateFor(null, over).validateDetailed(payload('SHOP-214'));
w.advance(30 * 60_000);
// 4. The work changes: shopper emails are now sent to an SMS vendor. The approval is invalidated.
w.issues[10001].description = adf('Record checkout sessions to understand where shoppers drop off. Group shoppers who abandon carts containing prescription items for a follow-up campaign. Send shopper email addresses to Tidepost for follow-up texts.');
await w.screen(10001);
S.workspaceInvalidated = await w.desk(REV1, over).workspace('SHOP-214', REV1);
S.panelInvalidated = await w.desk(DEV, over).panelState({ id: '10001' }, DEV);
S.gateBlockedAfter = await w.gateFor(null, over).validateDetailed(payload('SHOP-214'));
// Separation of duties: the developer who reported it cannot approve it, even as a reviewer.
w.members.push({ accountId: DEV, displayName: 'Sam Whitlock', active: true });
S.workspaceSod = await w.desk(DEV, over).workspace('SHOP-214', DEV);
w.members.pop();
// 5. Record: verify, export, record page, settings.
S.verify = await asAdmin().verifyLedger(REV1);
const exp = await asAdmin().exportArchive(REV1);
let text = '';
for (let i = 0; i < exp.chunks; i++) text += (await asAdmin().transferChunk({ transferId: exp.transferId, idx: i }, REV1)).data;
writeFileSync(join(archiveDir, 'article25-record-demo.json'), text);
writeFileSync(join(archiveDir, 'article25-record-demo-TAMPERED.json'), text.replace('Proportionate for checkout analytics', 'Proportionate for checkout analytic'));
S.register = await w.desk(REV1, over).register({ page: 1 }, REV1);
S.recordStatus = await asAdmin().recordStatus(REV1);
S.gateOverview = await asAdmin().gateOverview(REV1);
S.settings = await asAdmin().settingsOverview(REV1);
S.setupDone = await asAdmin().setupStatus(REV1);
S.fingerprint = S.recordStatus.currentKey.fingerprint;
// 6. Uninstall (storage wiped) → reinstall → verified restore.
w.fake.wipe();
S.gateAfterWipe = await w.gateFor(null, over).validateDetailed(payload('SHOP-214'));
const tid = 'f'.repeat(32);
await asAdmin().uploadChunk({ transferId: tid, idx: 0, data: text }, REV1);
const begin = await asAdmin().beginRestore({ transferId: tid, chunks: 1 }, REV1);
S.restoreReport = begin.report;
S.restoreResult = await asAdmin().confirmRestore({ transferId: tid, chunks: 1, token: begin.token }, REV1);
await w.screen(10001);
S.recordStatusRestored = await asAdmin().recordStatus(REV1);
S.verifyRestored = await asAdmin().verifyLedger(REV1);

writeFileSync(out, JSON.stringify(S, null, 2));
process.stdout.write(`states: ${Object.keys(S).length}; gate before ${S.gateBlockedBefore.reason}, after approval ${S.gateAllowed.reason}, after edit ${S.gateBlockedAfter.reason}, after wipe ${S.gateAfterWipe.reason}; restore ${S.restoreResult.outcome}; verify ${S.verify.status}/${S.verifyRestored.status}\n`);
