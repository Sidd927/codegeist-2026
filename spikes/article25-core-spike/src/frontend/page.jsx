import React, { useState } from 'react';
import ForgeReconciler, { Button, ButtonGroup, CodeBlock, Heading, Stack, Text, Textfield, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const ctx = useProductContext();
  const [spaceId, setSpaceId] = useState('');
  const [pageId, setPageId] = useState('');
  const [decisionId, setDecisionId] = useState('');
  const [out, setOut] = useState('');
  const run = async (name, payload = {}) => {
    setOut(`${name}…`);
    const t0 = Date.now();
    try { const r = await invoke(name, payload); setOut(`${name} (${Date.now() - t0} ms)\n${JSON.stringify(r, null, 2)}`); }
    catch (e) { setOut(`${name} ERROR: ${e?.message ?? e}`); }
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
      <CodeBlock language="json" text={out || '—'} />
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
