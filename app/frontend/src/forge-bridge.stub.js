// Inert @forge/bridge for real-browser tests (the real bridge only works inside Jira's iframe).
export const invoke = async () => ({ ok: true, data: {} });
export const view = { theme: { enable: async () => undefined }, getContext: async () => ({}), createHistory: async () => ({ location: { pathname: '/' }, push() {}, listen: () => () => {} }) };
export const router = { navigate: async () => undefined, open: async () => undefined };
