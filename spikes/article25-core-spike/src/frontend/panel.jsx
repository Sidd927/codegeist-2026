import React, { useState } from 'react';
import ForgeReconciler, { Button, CodeBlock, Heading, Inline, Stack, Text, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

const STATES = ['NOT_REVIEWED', 'REVIEW_REQUIRED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED'];

const App = () => {
  const ctx = useProductContext();
  const issueKey = ctx?.extension?.issue?.key;
  const [out, setOut] = useState('');
  const run = async (name, payload = {}) => {
    setOut(`${name}…`);
    const t0 = Date.now();
    try { const r = await invoke(name, { issueKey, ...payload }); setOut(`${name} (${Date.now() - t0} ms)\n${JSON.stringify(r, null, 2)}`); }
    catch (e) { setOut(`${name} ERROR: ${e?.message ?? e}`); }
  };
  return (
    <Stack space="space.100">
      <Text>Article25 SPIKE — {issueKey ?? 'no issue context'} (synthetic data only)</Text>
      <Heading size="small">B: Jira integration</Heading>
      <Inline space="space.050" shouldWrap>
        <Button onClick={() => run('getIssueData')}>Read issue + screen</Button>
        <Button onClick={() => run('addComment', { ref: 'spike-B' })}>Add comment</Button>
        <Button onClick={() => run('createReviewTask')}>Create review task</Button>
      </Inline>
      <Heading size="small">C: review state</Heading>
      <Inline space="space.050" shouldWrap>
        {STATES.map((s) => <Button key={s} onClick={() => run('setReviewState', { state: s })}>{s}</Button>)}
      </Inline>
      <Inline space="space.050" shouldWrap>
        <Button onClick={() => run('getReviewState')}>Show state</Button>
        <Button onClick={() => run('amIReviewer')}>Am I reviewer?</Button>
        <Button appearance="warning" onClick={() => run('tamperProperty', { state: 'APPROVED' })}>Tamper: set property APPROVED as me</Button>
        <Button onClick={() => run('deleteReview')}>Delete KVS state</Button>
        <Button onClick={() => run('simulate', { mode: 'throw' })}>Sim: validator throws</Button>
        <Button onClick={() => run('simulate', { mode: null })}>Sim: off</Button>
      </Inline>
      <Heading size="small">F: decision → register</Heading>
      <Inline space="space.050" shouldWrap>
        <Button onClick={() => run('decideAndRegister', { state: 'APPROVED_WITH_CONDITIONS', conditions: ['Aggregate location to city level', '30-day retention for raw events'], categories: ['location', 'financial', 'behavioural'], vendors: [] })}>Approve with conditions + register</Button>
      </Inline>
      <CodeBlock language="json" text={out || '—'} />
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
