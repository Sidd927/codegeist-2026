import Resolver from '@forge/resolver';

const resolver = new Resolver();

// Spike A: return values only the backend can know, so the round trip is verifiable.
resolver.define('getText', (req) => {
  const { context, payload } = req;
  const result = {
    from: 'article25-forge-foundation backend resolver',
    serverTime: new Date().toISOString(),
    node: process.version,
    echoedPayload: payload,
    accountId: context.accountId,
    cloudId: context.cloudId,
    moduleKey: context.moduleKey,
    issueKey: context.extension?.issue?.key ?? null,
    issueType: context.extension?.issue?.type ?? null,
    projectKey: context.extension?.project?.key ?? null,
  };
  console.log(JSON.stringify({ spike: 'A', issueKey: result.issueKey, node: result.node }));
  return result;
});

export const handler = resolver.getDefinitions();
