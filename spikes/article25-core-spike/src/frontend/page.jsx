import React, { useState } from 'react';
import ForgeReconciler, { Button, ButtonGroup, CodeBlock, Heading, Stack, Text, Textfield, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const ctx = useProductContext();
  const [spaceId, setSpaceId] = useState('');
  const [pageId, setPageId] = useState('');
  const [decisionId, setDecisionId] = useState('');
  const [out, setOut] = useState('');
  const [nonce, setNonce] = useState('');
  const run = async (name, payload = {}) => {
    setOut(`${name}…`);
    const t0 = Date.now();
    try { const r = await invoke(name, payload); setOut(`${name} (${Date.now() - t0} ms)\n${JSON.stringify(r, null, 2)}`); }
    catch (e) { setOut(`${name} ERROR: ${e?.message ?? e}`); }
  };
  // C2: concurrent invokes in waves of WAVE (each wave truly parallel across separate function invocations).
  // Counters are compared with the number of calls that actually SUCCEEDED (platform may reject some).
  const concurrency = async () => {
    setOut('running concurrency test…');
    const t0 = Date.now();
    await invoke('concResetAll', {});
    const jobs = [];
    for (let i = 0; i < 15; i++) jobs.push({ cat: 'kvsInc', fn: () => invoke('concKvsIncrement', {}) }, { cat: 'sqlInc', fn: () => invoke('concSqlIncrement', {}) });
    for (let i = 0; i < 12; i++) jobs.push({ cat: 'conc1', fn: () => invoke('concDecision', { issueKey: 'CONC-1', decisionId: `CONC-1:d${i}`, state: i % 3 ? 'APPROVED' : 'REJECTED', offsetMs: i }) });
    for (let i = 0; i < 6; i++) jobs.push({ cat: 'dup', fn: () => invoke('concDecision', { issueKey: 'CONC-1', decisionId: 'CONC-1:d0', state: 'APPROVED' }) });
    for (let i = 0; i < 10; i++) jobs.push({ cat: 'multi', fn: () => invoke('concDecision', { issueKey: `CONC-M${i}`, decisionId: `CONC-M${i}:d`, state: 'APPROVED' }) });
    jobs.sort(() => Math.random() - 0.5); // interleave categories
    const WAVE = 10; const ok = {}; const fail = {}; const results = { dup: [], conc1: [] };
    for (let w = 0; w < jobs.length; w += WAVE) {
      const wave = jobs.slice(w, w + WAVE);
      const settled = await Promise.allSettled(wave.map((j) => j.fn()));
      settled.forEach((r, k) => {
        const c = wave[k].cat;
        if (r.status === 'fulfilled') { ok[c] = (ok[c] ?? 0) + 1; if (results[c]) results[c].push(r.value?.inserted === false ? 'dup-rejected' : r.value?.inserted ? `inserted v${r.value.reviewVersion} r${r.value.retries}` : r.value); }
        else { fail[c] = (fail[c] ?? 0) + 1; }
      });
    }
    const report = await invoke('concReport', {});
    setOut(JSON.stringify({ ms: Date.now() - t0, wave: WAVE, succeeded: ok, failed: fail, report, results }, null, 2));
  };
  return (
    <Stack space="space.100">
      <Text>Article25 SPIKE — module {ctx?.moduleKey} — site {ctx?.siteUrl} (synthetic data only)</Text>
      <Heading size="small">B: Confluence</Heading>
      <Textfield placeholder="spaceId" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} />
      <Textfield placeholder="pageId" value={pageId} onChange={(e) => setPageId(e.target.value)} />
      <ButtonGroup>
        <Button onClick={() => run('context')}>Context</Button>
        <Button onClick={() => run('listSpaces')}>List spaces</Button>
        <Button onClick={() => run('createPolicyPage', { spaceId })}>Create synthetic policy page</Button>
        <Button onClick={() => run('searchPolicy', {})}>CQL search policy</Button>
        <Button onClick={() => run('getPageText', { pageId })}>Read page text</Button>
      </ButtonGroup>
      <Heading size="small">F: register</Heading>
      <Textfield placeholder="decisionId to replay" value={decisionId} onChange={(e) => setDecisionId(e.target.value)} />
      <ButtonGroup>
        <Button onClick={() => run('getRegister')}>Show register</Button>
        <Button onClick={() => run('publishRegister', { spaceId, siteUrl: ctx?.siteUrl })}>Publish register page</Button>
        <Button onClick={() => run('replayDecision', { decisionId, issueKey: 'REPLAY', activity: 'replay', status: 'APPROVED' })}>Replay decisionId (retry test)</Button>
      </ButtonGroup>
      <Heading size="small">Stage 1.5</Heading>
      <ButtonGroup>
        <Button onClick={() => run('schema')}>Ensure SQL schema</Button>
        <Button onClick={concurrency}>C2 concurrency test (parallel)</Button>
        <Button onClick={() => run('concReport')}>C2 report</Button>
        <Button onClick={() => run('setRegisterPage', { pageId, spaceId })}>Set register page (pageId)</Button>
        <Button onClick={() => run('readMirror', { pageId })}>Read mirror</Button>
        <Button onClick={() => run('rebuild', { pageId })}>C3 rebuild from mirror</Button>
      </ButtonGroup>
      <Heading size="small">C3b: hash chain recovery</Heading>
      <ButtonGroup>
        <Button onClick={() => run('chainExport')}>Chain export</Button>
        <Button onClick={async () => { setOut('recoveryVerify…'); try { const r = await invoke('recoveryVerify', { pageId }); if (r?.nonce) setNonce(r.nonce); setOut(`recoveryVerify\n${JSON.stringify(r, null, 2)}`); } catch (e) { setOut('ERROR ' + e?.message); } }}>Recovery: verify</Button>
        <Button appearance="warning" onClick={() => run('recoveryConfirm', { pageId, nonce })}>Recovery: confirm</Button>
        <Button onClick={() => run('auditLog')}>Audit log</Button>
      </ButtonGroup>
      <CodeBlock language="json" text={out || '—'} />
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
