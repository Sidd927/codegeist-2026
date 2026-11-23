#!/usr/bin/env node
// Independent verifier for Article25 decision archives. Needs NO secret and NO Article25 install.
//
//   node scripts/verify-archive.mjs <archive.json> --fingerprint "<sha-256 of the public key>" [--site <cloudId>]
//
// Trust: pass the record-key fingerprint you saved out of band (Article25 → Settings → Decision
// record shows it). Without --fingerprint the verifier trusts the key named in the archive itself
// and says so loudly: that proves internal consistency, not that the archive came from your site.
// Legacy (pre-M5, HMAC) records are verified through their hash links up to an Ed25519-signed
// attestation checkpoint; the legacy HMAC key is optional (--legacy-key-env VAR reads it from env).
import { readFileSync } from 'node:fs';
import { verifyArchive, fingerprintOf } from '../src/core/ledger.js';
import { decisionIdOf } from '../src/core/review.js';

/** Pure entry point (also used by tests). */
export function verifyArchiveText(text, { fingerprint = null, siteId = null, hmacKey = null } = {}) {
  let archive;
  try {
    archive = JSON.parse(text);
  } catch {
    return { ok: false, lines: ['NOT VALID: the file is not JSON'], report: null };
  }
  const site = siteId ?? archive?.siteId ?? null;
  const norm = (f) => String(f ?? '').replace(/\s+/g, '').toLowerCase();
  const keys = Array.isArray(archive?.keys) ? archive.keys : [];
  let anchors;
  const lines = [];
  if (fingerprint) {
    const k = keys.find((x) => norm(fingerprintOf(x.publicKey)) === norm(fingerprint));
    if (!k) return { ok: false, lines: ['NOT VALID: no key in the archive matches the pinned fingerprint'], report: null };
    anchors = [{ publicKey: k.publicKey }];
    lines.push(`Trust anchor: pinned key ${k.kid}`);
  } else {
    const k = keys.find((x) => x.kid === archive?.signature?.kid);
    anchors = k ? [{ publicKey: k.publicKey }] : [];
    lines.push('WARNING: no --fingerprint given. Trusting the key named in the archive itself.');
    if (k) lines.push(`Archive key ${k.kid} fingerprint: ${fingerprintOf(k.publicKey)} (compare with your records)`);
  }
  const report = verifyArchive(archive, { siteId: site, anchors, hmacKey, decisionIdOf });
  lines.push(`Site: ${site}`);
  lines.push(`Created: ${report.createdAt ?? 'unknown'} · head seq ${report.head?.seq ?? '?'} · ${report.counts?.records ?? '?'} records · ${report.counts?.decisions ?? '?'} decisions`);
  if (report.legacy?.count) lines.push(`Legacy (HMAC) records: ${report.legacy.count}, verified by ${report.legacy.verifiedBy}`);
  for (const k of report.keys ?? []) lines.push(`Key ${k.kid}: ${k.trusted ? `trusted (${k.how}${k.how === 'succession' ? (k.endorsedByPredecessor ? ', handover co-signed' : ', NOT co-signed by the previous key') : ''})` : 'not trusted'}`);
  for (const w of report.warnings) lines.push(`warning: ${w}`);
  for (const e of report.errors) lines.push(`error: ${e}`);
  lines.push(report.status === 'invalid' ? 'RESULT: NOT VALID' : report.status === 'complete' ? 'RESULT: VALID and complete' : `RESULT: VALID; ${report.pending} decision(s) were not yet anchored at export time`);
  return { ok: report.status !== 'invalid', lines, report };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && !['--fingerprint', '--site', '--legacy-key-env'].includes(args[args.indexOf(a) - 1]));
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  if (!file) {
    process.stderr.write('usage: node scripts/verify-archive.mjs <archive.json> --fingerprint "<fingerprint>" [--site <cloudId>] [--legacy-key-env VAR]\n');
    process.exit(2);
  }
  const envVar = opt('--legacy-key-env');
  const out = verifyArchiveText(readFileSync(file, 'utf8'), { fingerprint: opt('--fingerprint'), siteId: opt('--site'), hmacKey: envVar ? process.env[envVar] ?? null : null });
  for (const l of out.lines) process.stdout.write(`${l}\n`);
  process.exit(out.ok ? 0 : 1);
}
