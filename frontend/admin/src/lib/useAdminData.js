import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from './api';

/**
 * Load an admin API resource. Re-fetches when `path` or `query` change and,
 * optionally, every `refreshMs`. Out-of-order responses are discarded.
 */
export function useAdminData(path, { query, refreshMs, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const requestId = useRef(0);
  const queryKey = JSON.stringify(query || {});

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) return;
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    try {
      const result = await adminApi(path, { query: JSON.parse(queryKey) });
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, queryKey, enabled]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, refreshMs);
    return () => clearInterval(timer);
  }, [load, refreshMs]);

  return { data, error, loading, reload: load, setData };
}
