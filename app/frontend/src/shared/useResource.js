import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal async resource hook: { status: 'loading' | 'success' | 'error', data, error, reload, refresh }.
 * - reload(): shows the loading state.
 * - refresh(): re-fetches silently, keeping current data visible (used for polling).
 * Results from superseded requests are ignored.
 */
export function useResource(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls dependencies explicitly
  const run = useCallback(load, deps);

  const fetchNow = useCallback(
    (silent) => {
      const id = ++seq.current;
      if (!silent) setState((s) => ({ status: 'loading', data: s.data, error: null }));
      return run().then(
        (data) => id === seq.current && setState({ status: 'success', data, error: null }),
        (error) => id === seq.current && (!silent ? setState({ status: 'error', data: null, error }) : undefined),
      );
    },
    [run],
  );
  const reload = useCallback(() => fetchNow(false), [fetchNow]);
  const refresh = useCallback(() => fetchNow(true), [fetchNow]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload, refresh };
}

/** Poll `refresh` every `intervalMs` while `active`, up to `maxPolls`. Returns true once polling gave up. */
export function usePolling(active, refresh, { intervalMs = 3000, maxPolls = 30 } = {}) {
  const [gaveUp, setGaveUp] = useState(false);
  const count = useRef(0);
  useEffect(() => {
    if (!active) {
      count.current = 0;
      setGaveUp(false);
      return undefined;
    }
    const t = setInterval(() => {
      if (count.current >= maxPolls) {
        setGaveUp(true);
        clearInterval(t);
        return;
      }
      count.current += 1;
      refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [active, refresh, intervalMs, maxPolls]);
  return gaveUp;
}
