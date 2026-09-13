import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const API_URL = apiUrl('/expenses');
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export const EMPTY_FILTERS = {
  q: '',
  category: '',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
  sort: 'newest',
};

/** Drop empty values so the query string stays clean and the API's zod schema is happy. */
function toParams(filters, offset) {
  const params = { limit: PAGE_SIZE, offset };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) params[key] = value;
  }
  return params;
}

/**
 * useTransactionSearch — the server-side filtered expense list.
 *
 * Deliberately separate from useExpenses: that hook loads everything for the
 * dashboard's totals and chart, whereas this one pages through filtered
 * results. Sharing one hook would have meant either the dashboard paying for
 * pagination or this screen loading the user's whole history.
 *
 * Text search is debounced; every other filter applies immediately, because
 * those come from taps rather than typing.
 */
export function useTransactionSearch() {
  const { session } = useAuth();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Guards against a slow early request overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.q]);

  const effective = { ...filters, q: debouncedQ };
  const key = JSON.stringify(effective);

  const fetchPage = useCallback(async (offset, append) => {
    if (!session?.access_token) {
      setRows([]);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);

    try {
      const { data } = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        params: toParams(JSON.parse(key), offset),
      });

      if (id !== requestId.current) return; // a newer request has started

      const incoming = data.expenses || [];
      setRows(prev => (append ? [...prev, ...incoming] : incoming));
      setTotal(data.pagination?.total ?? incoming.length);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (err) {
      if (id !== requestId.current) return;
      setError(friendlyError(err, "Couldn't load your transactions. Check your connection and try again."));
      if (!append) setRows([]);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [session, key]);

  useEffect(() => { fetchPage(0, false); }, [fetchPage]);

  const setFilter = useCallback((name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    fetchPage(rows.length, true);
  }, [hasMore, loadingMore, rows.length, fetchPage]);

  const refresh = useCallback(() => fetchPage(0, false), [fetchPage]);

  /** Patch one row in place after an edit, so the list does not flash. */
  const replaceRow = useCallback((updated) => {
    setRows(prev => prev.map(r => (r.id === updated.id ? updated : r)));
  }, []);

  const removeRow = useCallback((id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setTotal(t => Math.max(0, t - 1));
  }, []);

  const isFiltered = JSON.stringify({ ...filters, q: filters.q }) !== JSON.stringify(EMPTY_FILTERS);

  return {
    filters, setFilter, resetFilters, isFiltered,
    rows, total, hasMore, loading, loadingMore, error,
    loadMore, refresh, replaceRow, removeRow,
  };
}
