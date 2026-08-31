import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const ProContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';

export function ProProvider({ children }) {
  const { session } = useAuth();
  const [proStatus, setProStatus] = useState({
    isPro: false,
    expiresAt: null,
    streakFreezes: 0,
  });
  const [limits, setLimits] = useState({
    receiptScansUsed: 0,
    receiptScansLimit: 3,
    chatMessagesUsed: 0,
    chatMessagesLimit: 10,
    expensesToday: 0,
    expensesLimit: 20,
  });
  const [loading, setLoading] = useState(true);

  const fetchProStatus = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/pro/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setProStatus(data.pro);
        setLimits(data.limits);
      }
    } catch (err) {
      console.error('Failed to fetch Pro status:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchProStatus();
  }, [fetchProStatus]);

  // Check if a specific feature is available
  const canUse = useCallback((feature) => {
    if (proStatus.isPro) return true;

    switch (feature) {
      case 'pdf_import':
      case 'subscription_graveyard':
      case 'burn_rate_push':
      case 'investment_deeplink':
      case 'export_data':
      case 'paisa_score_breakdown':
        return false;

      case 'receipt_scan':
        return limits.receiptScansUsed < limits.receiptScansLimit;

      case 'chat_message':
        return limits.chatMessagesUsed < limits.chatMessagesLimit;

      case 'add_expense':
        return limits.expensesToday < limits.expensesLimit;

      case 'streak_freeze':
        return false; // Must be Pro or purchased separately

      default:
        return true; // Features not listed are free
    }
  }, [proStatus, limits]);

  // Get remaining quota for a feature
  const getRemaining = useCallback((feature) => {
    if (proStatus.isPro) return Infinity;

    switch (feature) {
      case 'receipt_scan':
        return Math.max(0, limits.receiptScansLimit - limits.receiptScansUsed);
      case 'chat_message':
        return Math.max(0, limits.chatMessagesLimit - limits.chatMessagesUsed);
      case 'add_expense':
        return Math.max(0, limits.expensesLimit - limits.expensesToday);
      default:
        return Infinity;
    }
  }, [proStatus, limits]);

  return (
    <ProContext.Provider value={{
      isPro: proStatus.isPro,
      proStatus,
      limits,
      loading,
      canUse,
      getRemaining,
      refreshProStatus: fetchProStatus,
    }}>
      {children}
    </ProContext.Provider>
  );
}

export const usePro = () => useContext(ProContext);
