import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { lastNDays, localDateKey, startOfLocalMonth } from '../lib/dates';

const API_URL = apiUrl('/expenses');

/** `occurred_at` is when the money moved; `created_at` only when the row was written. */
const when = (e) => new Date(e.occurred_at || e.created_at);

/**
 * useExpenses — the signed-in user's expenses, via the Spendly backend.
 *
 * All writes go through the API. Server-owned profile values that change as a
 * side effect (round-up savings, streak) are taken from the API response and
 * merged into the displayed profile — never written to the database from here.
 */
export function useExpenses() {
  const { session, applyServerProfile } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getHeaders = useCallback(() => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session]);

  const fetchExpenses = useCallback(async () => {
    if (!session?.access_token) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // The dashboard only needs this month and the last 7 days.
      const from = new Date(Math.min(startOfLocalMonth().getTime(), lastNDays(7)[0].start.getTime())).toISOString();
      const response = await axios.get(API_URL, { headers: getHeaders(), params: { limit: 500, from } });
      if (!response.data.success) throw new Error(response.data.message || 'Failed to fetch expenses');
      setExpenses(response.data.expenses || []);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load your expenses. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [session, getHeaders]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // This month's total, on the device's calendar.
  const totalSpent = useMemo(() => {
    const monthStart = startOfLocalMonth();
    return expenses
      .filter((e) => when(e) >= monthStart)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  // The last 7 calendar days, oldest first. Buckets by full date, not weekday
  // name: the old version added last week's Monday to this week's.
  const chartData = useMemo(() => {
    const days = lastNDays(7);
    const totals = new Map(days.map((d) => [d.key, 0]));
    for (const e of expenses) {
      const key = localDateKey(when(e));
      if (totals.has(key)) totals.set(key, totals.get(key) + (Number(e.amount) || 0));
    }
    return days.map((d) => ({ name: d.label, date: d.key, kharcha: Math.round(totals.get(d.key) * 100) / 100 }));
  }, [expenses]);

  const applyStats = (data) => {
    applyServerProfile({
      total_chillar: data.totalChillar,
      streak_current: data.streak?.currentDays,
      streak_longest: data.streak?.longestStreak,
    });
  };

  /**
   * @param {number} amount
   * @param {string} [category]
   * @param {string} [description]
   * @param {{source?: 'manual'|'upi_auto', occurredAt?: string}} [options]
   */
  const addExpense = async (amount, category = 'Other', description = '', options = {}) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };
    try {
      const body = { amount, category, description };
      if (options.source) body.source = options.source;
      if (options.occurredAt) body.occurred_at = options.occurredAt;

      const response = await axios.post(API_URL, body, { headers: getHeaders() });
      if (!response.data.success) return { success: false, message: response.data.message };

      setExpenses((prev) => [response.data.expense, ...prev]);
      applyStats(response.data);
      return { success: true, expense: response.data.expense, roundupChillar: response.data.roundupChillar };
    } catch (err) {
      return { success: false, message: friendlyError(err, "We couldn't save that expense. Please try again.") };
    }
  };

  const addScannedExpense = async (receiptData) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };
    try {
      const response = await axios.post(
        `${API_URL}/scan`,
        { imageBase64: receiptData.imageBase64 || receiptData },
        { headers: getHeaders() }
      );
      if (!response.data.success) return { success: false, message: response.data.message };

      setExpenses((prev) => [response.data.expense, ...prev]);
      applyStats(response.data);
      return { success: true, expense: response.data.expense, roundupChillar: response.data.roundupChillar };
    } catch (err) {
      return { success: false, message: friendlyError(err, "We couldn't read that receipt. Try a clearer photo, or add it manually.") };
    }
  };

  const deleteExpense = async (id) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };
    try {
      const response = await axios.delete(`${API_URL}/${id}`, { headers: getHeaders() });
      if (!response.data.success) return { success: false, message: response.data.message };
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, message: friendlyError(err, "We couldn't delete that expense. Please try again.") };
    }
  };

  const editExpense = async (id, updates) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };
    try {
      const response = await axios.patch(`${API_URL}/${id}`, updates, { headers: getHeaders() });
      if (!response.data.success) return { success: false, message: response.data.message };
      setExpenses((prev) => prev.map((e) => (e.id === id ? response.data.expense : e)));
      return { success: true, expense: response.data.expense };
    } catch (err) {
      return { success: false, message: friendlyError(err, "We couldn't update that expense. Please try again.") };
    }
  };

  /**
   * Export expenses as CSV.
   *
   * Web: download through an object URL.
   * Android: the WebView ignores `<a download>` on blob URLs (the old code did
   * nothing and still reported success), so the file is written to app storage
   * and handed to the system share sheet, from which the user can save it to
   * Files/Drive or open it in a spreadsheet app.
   *
   * @returns {Promise<{success: boolean, cancelled?: boolean, message?: string}>}
   */
  const exportCsv = async (filters = {}) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    let csvText;
    let rowCount = null;
    try {
      const response = await axios.get(`${API_URL}/export.csv`, {
        headers: getHeaders(),
        params: filters,
        responseType: 'text',
        transformResponse: (d) => d,
      });
      csvText = String(response.data || '');
      rowCount = Number(response.headers?.['x-row-count']);
    } catch (err) {
      return { success: false, message: friendlyError(err, "We couldn't prepare your export. Please try again.") };
    }

    const filename = `spendly-expenses-${localDateKey(new Date())}.csv`;
    const summary = Number.isFinite(rowCount) ? `${rowCount} expense${rowCount === 1 ? '' : 's'} exported` : undefined;

    if (Capacitor.isNativePlatform()) {
      try {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
          import('@capacitor/filesystem'),
          import('@capacitor/share'),
        ]);
        const written = await Filesystem.writeFile({
          path: filename,
          data: csvText,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        try {
          await Share.share({ title: 'Spendly expenses', files: [written.uri], dialogTitle: 'Save or share your expenses' });
        } catch (shareErr) {
          // Dismissing the share sheet rejects with a cancellation; that is not a failure.
          if (/cancel/i.test(shareErr?.message || '')) return { success: false, cancelled: true };
          throw shareErr;
        }
        return { success: true, message: summary };
      } catch {
        return { success: false, message: "We couldn't save the export file on this device." };
      }
    }

    try {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      return { success: true, message: summary };
    } catch {
      return { success: false, message: "Your browser blocked the download." };
    }
  };

  return {
    expenses,
    loading,
    error,
    totalSpent,
    chartData,
    addExpense,
    addScannedExpense,
    editExpense,
    deleteExpense,
    exportCsv,
    fetchExpenses,
    refetch: fetchExpenses,
  };
}
