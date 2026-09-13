import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const API_URL = apiUrl('/expenses');

/**
 * useExpenses — Custom hook for personal expense CRUD via Express backend.
 *
 * Returns:
 *  - expenses: array of expense objects, sorted by created_at desc
 *  - loading: boolean
 *  - error: string | null
 *  - totalSpent: sum of all expense amounts
 *  - addExpense: (amount, category, description) => Promise
 *  - addScannedExpense: (receiptData) => Promise — for AI-scanned receipts
 *  - deleteExpense: (id) => Promise
 *  - chartData: last 7 days spending data for Recharts
 *  - fetchExpenses / refetch: function to reload expenses manually
 */
export function useExpenses() {
  const { session, updateProfile } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper to get auth headers
  const getHeaders = useCallback(() => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session]);

  // ── Fetch expenses (GET) ──
  const fetchExpenses = useCallback(async () => {
    if (!session?.access_token) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(API_URL, { headers: getHeaders(), params: { limit: 500 } });
      if (response.data.success) {
        setExpenses(response.data.expenses || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch expenses');
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
      setError(friendlyError(err, "Couldn't load your expenses. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [session, getHeaders]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // ── Derived state ──
  // `occurred_at` is when the money actually moved; `created_at` is only when
  // the row was written. Rows created before that column existed fall back.
  const when = (e) => new Date(e.occurred_at || e.created_at);

  // Only count expenses from the current month for budget tracking.
  // This runs on the user's device, so the device's local month is the right
  // one — unlike the server, which must be told to use IST explicitly.
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthExpenses = expenses.filter(e => when(e) >= currentMonthStart);
  const totalSpent = currentMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // ── Chart data: last 7 days ──
  const chartData = (() => {
    const last7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
    }
    expenses.forEach((e) => {
      const d = when(e).toLocaleDateString('en-US', { weekday: 'short' });
      if (last7[d] !== undefined) last7[d] += parseFloat(e.amount);
    });
    return Object.keys(last7).map((k) => ({ name: k, kharcha: last7[k] }));
  })();

  // ── Add manual expense (POST) ──
  const addExpense = async (amount, category = 'Other', description = '') => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
      const response = await axios.post(
        API_URL,
        { amount, category, description },
        { headers: getHeaders() }
      );

      if (response.data.success) {
        // Optimistically add to top of local state
        setExpenses((prev) => [response.data.expense, ...prev]);

        // Update AuthContext so the UI immediately reflects the new chillar and streak
        if (updateProfile) {
          await updateProfile({
            total_chillar: response.data.totalChillar,
            streak_current: response.data.streak?.currentDays,
            streak_longest: response.data.streak?.longestStreak,
          });
        }

        return { 
          success: true, 
          expense: response.data.expense, 
          roundupChillar: response.data.roundupChillar 
        };
      }
      return { success: false, message: response.data.message };
    } catch (err) {
      console.error('Error adding expense:', err);
      return { success: false, message: friendlyError(err, "We couldn't save that expense. Please try again.") };
    }
  };

  // ── Add AI-scanned expense (POST /scan) ──
  const addScannedExpense = async (receiptData) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
      const response = await axios.post(
        `${API_URL}/scan`,
        { imageBase64: receiptData.imageBase64 || receiptData },
        { headers: getHeaders() }
      );

      if (response.data.success) {
        setExpenses((prev) => [response.data.expense, ...prev]);

        if (updateProfile) {
          await updateProfile({
            total_chillar: response.data.totalChillar,
            streak_current: response.data.streak?.currentDays,
            streak_longest: response.data.streak?.longestStreak,
          });
        }

        return { 
          success: true, 
          expense: response.data.expense, 
          roundupChillar: response.data.roundupChillar 
        };
      }
      return { success: false, message: response.data.message };
    } catch (err) {
      console.error('Error adding scanned expense:', err);
      return { success: false, message: friendlyError(err, "We couldn't read that receipt. Try a clearer photo, or add it manually.") };
    }
  };

  // ── Delete Expense (DELETE) ──
  const deleteExpense = async (id) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
      const response = await axios.delete(`${API_URL}/${id}`, { headers: getHeaders() });
      if (response.data.success) {
        setExpenses((prev) => prev.filter(e => e.id !== id));
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (err) {
      console.error('Error deleting expense:', err);
      return { success: false, message: friendlyError(err, "We couldn't delete that expense. Please try again.") };
    }
  };

  // ── Edit an existing expense (PATCH) ──
  const editExpense = async (id, updates) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
      const response = await axios.patch(`${API_URL}/${id}`, updates, { headers: getHeaders() });
      if (response.data.success) {
        setExpenses((prev) => prev.map(e => (e.id === id ? response.data.expense : e)));
        return { success: true, expense: response.data.expense };
      }
      return { success: false, message: response.data.message };
    } catch (err) {
      console.error('Error updating expense:', err);
      return { success: false, message: friendlyError(err, "We couldn't update that expense. Please try again.") };
    }
  };

  /**
   * Download the user's expenses as CSV.
   *
   * The file is fetched as a blob and saved through an object URL rather than
   * by pointing the browser at the endpoint, because the request needs an
   * Authorization header.
   */
  const exportCsv = async (filters = {}) => {
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
      const response = await axios.get(`${API_URL}/export.csv`, {
        headers: getHeaders(),
        params: filters,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `spendly-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return { success: true };
    } catch (err) {
      console.error('Error exporting expenses:', err);
      return { success: false, message: friendlyError(err, "We couldn't prepare your export. Please try again.") };
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
    refetch: fetchExpenses, // Alias for backwards compatibility
  };
}
