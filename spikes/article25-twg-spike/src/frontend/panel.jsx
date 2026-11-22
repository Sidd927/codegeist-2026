import React, { useState } from 'react';
import ForgeReconciler, { Button, ButtonGroup, CodeBlock, Stack, Text, useProductContext } from '@forge/react';
import { invoke, requestTeamworkGraph } from '@forge/bridge';

// Queries use documented curated fields; return shapes follow the docs' example (edges/node, inline fragments).
const Q = {
  myWork: `query article25_assignedWork($userId: ID!) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: 5) {
      edges { node { ... on JiraWorkItem { key summary webUrl } } }
      pageInfo { hasNextPage endCursor } } }`,
  myTeams: `query article25_userTeams($userId: ID!) {
    atlassianUserInTeams(userId: $userId, first: 5) {
      edges { node { ... on AtlassianTeam { id displayName } } }
      pageInfo { hasNextPage } } }`,
  issueGoals: `query article25_workItemGoals($id: ID!) {
    jiraWorkItemGoals(id: $id, first: 5) {
      edges { node { ... on AtlassianGoal { name url } } }
      pageInfo { hasNextPage } } }`,
};

const App = () => {
  const ctx = useProductContext();
  const [out, setOut] = useState('');
  const userAri = ctx ? `ari:cloud:identity::user/${ctx.accountId}` : null;
  const issueAri = ctx ? `ari:cloud:jira:${ctx.cloudId}:issue/${ctx.extension?.issue?.id}` : null;
  const show = (name, t0, r) => setOut(`${name} (${Date.now() - t0} ms)\n${JSON.stringify(r, null, 2)}`);
  const front = async (name, query, variables) => {
    const t0 = Date.now();
    try { show(name + ' [frontend bridge]', t0, await requestTeamworkGraph(query, variables)); } catch (e) { show(name + ' ERROR', t0, { message: e?.message, e }); }
  };
  const back = async (name, payload) => {
    const t0 = Date.now();
    try { show(name + ' [backend asUser]', t0, await invoke(name === 'echo' ? 'echoBackend' : 'query', payload)); } catch (e) { show(name + ' ERROR', t0, { message: e?.message }); }
  };
  return (
    <Stack space="space.100">
      <Text>TWG spike. user={userAri} issue={issueAri}</Text>
      <ButtonGroup>
        <Button onClick={() => front('echo', 'query article25_echoFront { echo(myString: "Hello World!") }')}>Echo (frontend)</Button>
        <Button onClick={() => back('echo')}>Echo (backend)</Button>
        <Button onClick={() => front('myWork', Q.myWork, { userId: userAri })}>My assigned work</Button>
        <Button onClick={() => front('myTeams', Q.myTeams, { userId: userAri })}>My teams</Button>
        <Button onClick={() => front('issueGoals', Q.issueGoals, { id: issueAri })}>This issue's goals</Button>
        <Button onClick={() => back('myWork', { query: Q.myWork, variables: { userId: userAri } })}>My work (backend)</Button>
      </ButtonGroup>
      <CodeBlock language="json" text={out || '—'} />
    </Stack>
  );
};
ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
