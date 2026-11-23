// Reproducible local benchmark of the pure ledger code (no Forge, no network, synthetic data).
// Usage: node scripts/bench-ledger.mjs [decisions...]   e.g.  npm run bench -- 1000 5000
// Prints, per size: signing time per record, full-chain verification, archive build + verification
// and the archive size. Numbers depend on the machine; record the CPU and Node version with them.
import { generateKeyPairSync } from 'node:crypto';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { loadSigner, registerKey, buildRecordV3, verifyLedger, buildArchive, verifyArchive, genesis } from '../src/core/ledger.js';
import { decisionIdOf } from '../src/core/review.js';

const sizes = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const SIZES = sizes.length ? sizes : [100, 1000, 5000];
const siteId = '00000000-0000-4000-8000-00000000beef';
const signer = loadSigner(generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
const at = '2026-11-23T00:00:00.000Z';
const key = registerKey(signer, { siteId, at });

function synthetic(n) {
  const decisions = [];
  const records = [];
  let prevHash = genesis(siteId);
  for (let i = 1; i <= n; i++) {
    const d = {
      issue_id: String(10000 + i), seq: 1, request_id: `bench-${i}`, kind: 'human', decision: 'APPROVED',
      rationale: 'Synthetic benchmark decision: proportionate with masking in place.', conditions: [], questions: [],
      decided_by: 'acc-bench-reviewer', decided_at: 1795400000000 + i, screening_id: 'a'.repeat(64), fp: 'b'.repeat(64),
      pipeline_version: 't1.r1.0.0.f2.noai', outcome: 'REVIEW_REQUIRED', signal_set: { outcome: 'REVIEW_REQUIRED', categories: ['contact'], criteria: [], recipients: [], transfers: [] }, detail: null,
    };
    d.decision_id = decisionIdOf({ issueId: d.issue_id, seq: d.seq, kind: d.kind, decision: d.decision, rationale: d.rationale, conditions: d.conditions, questions: d.questions, decidedBy: d.decided_by, decidedAt: d.decided_at, screeningId: d.screening_id, fp: d.fp, pipelineVersion: d.pipeline_version, outcome: d.outcome });
    const r = buildRecordV3(signer, { siteId, seq: i, prevHash, decisionId: d.decision_id, issueId: d.issue_id, state: d.decision, conditions: [], decidedBy: d.decided_by, decidedAt: new Date(d.decided_at).toISOString() });
    prevHash = r.hash;
    decisions.push(d);
    records.push(r);
  }
  return { decisions, records };
}

const ms = (t0) => performance.now() - t0;
const print = (line) => process.stdout.write(`${line}\n`);
print(`Node ${process.version} · ${cpus()[0]?.model ?? 'unknown CPU'}`);
print('decisions | sign/record | verify chain | build archive | verify archive | archive size');
for (const n of SIZES) {
  let t0 = performance.now();
  const { decisions, records } = synthetic(n);
  const sign = ms(t0) / n;
  const keys = new Map([[signer.kid, { publicKey: signer.publicKeyB64 }]]);
  t0 = performance.now();
  const v = verifyLedger(records, { siteId, keys });
  const verify = ms(t0);
  t0 = performance.now();
  const archive = buildArchive(signer, { siteId, createdAt: at, appVersion: 'bench', keys: [key], successions: [], records, checkpoints: [], decisions, assignments: [], settings: [] });
  const text = JSON.stringify(archive);
  const build = ms(t0);
  t0 = performance.now();
  const report = verifyArchive(JSON.parse(text), { siteId, anchors: [{ publicKey: signer.publicKeyB64 }], decisionIdOf });
  const verifyArch = ms(t0);
  if (!v.valid || report.status !== 'complete') throw new Error(`benchmark data did not verify at n=${n}`);
  print(`${String(n).padStart(9)} | ${sign.toFixed(3).padStart(8)} ms | ${verify.toFixed(0).padStart(9)} ms | ${build.toFixed(0).padStart(10)} ms | ${verifyArch.toFixed(0).padStart(11)} ms | ${(text.length / 1e6).toFixed(2)} MB`);
}
