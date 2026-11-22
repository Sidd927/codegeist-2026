import React, { useEffect, useState } from 'react';
import ForgeReconciler, { CodeBlock, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [data, setData] = useState(null);
  const [ms, setMs] = useState(null);
  useEffect(() => {
    const t0 = Date.now();
    invoke('getText', { example: 'spike-A-payload' })
      .then((r) => { setMs(Date.now() - t0); setData(r); })
      .catch((e) => setData({ error: String(e) }));
  }, []);
  return (
    <>
      <Text>Article25 Spike A: frontend → resolver round trip</Text>
      <Text>{data ? `Resolver responded in ${ms} ms` : 'Calling resolver…'}</Text>
      {data && <CodeBlock language="json" text={JSON.stringify(data, null, 2)} />}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
