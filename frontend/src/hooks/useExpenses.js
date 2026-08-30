import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = `${import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api'}/expenses`;

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
      const response = await axios.get(API_URL, { headers: getHeaders() });
      if (response.data.success) {
        setExpenses(response.data.expenses || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch expenses');
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [session, getHeaders]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // ── Derived state ──
  // Only count expenses from the current month for budget tracking
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthExpenses = expenses.filter(
    e => new Date(e.created_at) >= currentMonthStart
  );
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
      const d = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'short' });
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
      return { success: false, message: err.response?.data?.message || err.message };
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
      return { success: false, message: err.response?.data?.message || err.message };
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
      return { success: false, message: err.response?.data?.message || err.message };
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
    deleteExpense,
    fetchExpenses,
    refetch: fetchExpenses, // Alias for backwards compatibility
  };
}
