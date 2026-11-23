// Minimal router over a Forge history object (`view.createHistory()`), so desk routes appear in the
// Jira URL and support deep links, back and forward. Tests inject a memory history.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

export const ROUTES = [
  { name: 'home', pattern: /^\/?$/ },
  { name: 'inbox', pattern: /^\/inbox\/?$/ },
  { name: 'review', pattern: /^\/review\/([^/]+)\/?$/, params: ['issueKey'] },
  { name: 'record', pattern: /^\/record\/?$/ },
  { name: 'settings', pattern: /^\/settings\/?$/ },
];

export function matchRoute(pathname) {
  for (const r of ROUTES) {
    const m = r.pattern.exec(pathname ?? '/');
    if (m) {
      const params = {};
      (r.params ?? []).forEach((p, i) => {
        try {
          params[p] = decodeURIComponent(m[i + 1]);
        } catch {
          params[p] = m[i + 1];
        }
      });
      return { name: r.name, params };
    }
  }
  return { name: 'not-found', params: {} };
}

const pathOf = (loc) => loc?.pathname ?? '/';

export function RouterProvider({ history, children }) {
  const [pathname, setPathname] = useState(pathOf(history.location));
  useEffect(() => {
    // Forge's history follows the `history` package; support both v4 (location) and v5 ({ location }) callbacks.
    const unlisten = history.listen((a) => setPathname(pathOf(a?.location ?? a)));
    return () => (typeof unlisten === 'function' ? unlisten() : undefined);
  }, [history]);
  const value = useMemo(() => ({ pathname, route: matchRoute(pathname), navigate: (to) => history.push(to) }), [pathname, history]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

/** In-memory history for tests and non-Forge rendering. */
export function createMemoryHistory(initial = '/') {
  let location = { pathname: initial };
  const listeners = new Set();
  return {
    get location() {
      return location;
    },
    push(to) {
      location = { pathname: to };
      listeners.forEach((l) => l({ location, action: 'PUSH' }));
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
