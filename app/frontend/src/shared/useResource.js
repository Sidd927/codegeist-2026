import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal async resource hook: { status: 'loading' | 'success' | 'error', data, error, reload }.
 * Ignores results from superseded requests (e.g. fast route changes).
 */
export function useResource(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls dependencies explicitly
  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    run().then(
      (data) => id === seq.current && setState({ status: 'success', data, error: null }),
      (error) => id === seq.current && setState({ status: 'error', data: null, error }),
    );
  }, [run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
