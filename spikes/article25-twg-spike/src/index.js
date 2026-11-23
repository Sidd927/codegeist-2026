// Spike E backend: TWG calls as the current user (TWG cannot be called as the app).
import Resolver from '@forge/resolver';
import api from '@forge/api';
const resolver = new Resolver();
const call = async (query, variables) => {
  const t0 = Date.now();
  const res = await api.asUser().requestTeamworkGraph(query, variables);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ms: Date.now() - t0, body };
};
resolver.define('echoBackend', () => call('query article25_echoTest { echo(myString: "Hello World!") }'));
resolver.define('query', ({ payload }) => call(payload.query, payload.variables));
export const handler = resolver.getDefinitions();
