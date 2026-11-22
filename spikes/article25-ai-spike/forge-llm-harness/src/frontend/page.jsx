import React, { useState } from 'react';
import ForgeReconciler, { Button, CodeBlock, Inline, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [out, setOut] = useState('');
  const run = async (name, payload) => { setOut(name + '…'); try { setOut(`${name}\n${JSON.stringify(await invoke(name, payload), null, 2)}`); } catch (e) { setOut('ERROR ' + e?.message); } };
  return (
    <Stack space="space.100">
      <Text>Article25 LLM spike: synthetic tickets only. Runs are BILLABLE (cap $4 enforced in-app; user approved $5).</Text>
      <Inline space="space.050" shouldWrap>
        <Button onClick={() => run('listModels')}>List models</Button>
        <Button onClick={() => run('spend')}>Spend so far</Button>
        <Button appearance="warning" onClick={() => run('startEval', { model: 'claude-sonnet-5-5', pass: 1 })}>Sonnet 5.5 pass 1</Button>
        <Button appearance="warning" onClick={() => run('startEval', { model: 'claude-sonnet-5-5', pass: 2 })}>Sonnet 5.5 pass 2</Button>
        <Button appearance="warning" onClick={() => run('startEval', { model: 'claude-sonnet-5-5', pass: 3 })}>Sonnet 5.5 pass 3</Button>
        <Button appearance="warning" onClick={() => run('startEval', { model: 'claude-opus-5-5', pass: 1 })}>Opus 5.5 pass 1</Button>
        <Button appearance="warning" onClick={() => run('startEval', { model: 'claude-haiku-5-5', pass: 1 })}>Haiku 5.5 pass 1</Button>
      </Inline>
      <CodeBlock language="json" text={out || '—'} />
    </Stack>
  );
};
ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
