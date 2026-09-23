import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_URL } from '../lib/apiConfig';

const ProContext = createContext();

const FREE_DEFAULTS = {
  pro: { isPro: false, expiresAt: null, streakFreezes: 0 },
  limits: {
    receiptScansUsed: 0,
    receiptScansLimit: 3,
    chatMessagesUsed: 0,
    chatMessagesLimit: 10,
    expensesToday: 0,
    expensesLimit: 20,
    moneyChecksUsed: 0,
    moneyChecksLimit: 5,
  },
};

/**
 * ProProvider — displays entitlement and usage as reported by the server.
 *
 * The server (/api/pro/status, proGate) is the only authority. Nothing here
 * grants access: a client that lies about being Pro still gets 429/403 from
 * the API. This context exists so the UI can explain limits before a request
 * fails.
 */
export function ProProvider({ children }) {
  const { session } = useAuth();
  const [proStatus, setProStatus] = useState(FREE_DEFAULTS.pro);
  const [limits, setLimits] = useState(FREE_DEFAULTS.limits);
  const [purchasesAvailable, setPurchasesAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProStatus = useCallback(async () => {
    if (!session?.access_token) {
      // Signed out (or switched account): never show the previous user's plan.
      setProStatus(FREE_DEFAULTS.pro);
      setLimits(FREE_DEFAULTS.limits);
      setPurchasesAvailable(false);
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
        setPurchasesAvailable(data.purchasesAvailable === true);
      }
    } catch {
      // Keep showing free-plan defaults; the API still enforces real limits.
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchProStatus();
  }, [fetchProStatus]);

  const remaining = (used, limit) => (limit === null || limit === undefined ? Infinity : Math.max(0, limit - used));

  const canUse = useCallback((feature) => {
    if (proStatus.isPro) return true;
    switch (feature) {
      case 'pdf_import':
        return false;
      case 'receipt_scan':
        return remaining(limits.receiptScansUsed, limits.receiptScansLimit) > 0;
      case 'chat_message':
        return remaining(limits.chatMessagesUsed, limits.chatMessagesLimit) > 0;
      case 'add_expense':
        return remaining(limits.expensesToday, limits.expensesLimit) > 0;
      default:
        return true;
    }
  }, [proStatus, limits]);

  const getRemaining = useCallback((feature) => {
    if (proStatus.isPro) return Infinity;
    switch (feature) {
      case 'receipt_scan': return remaining(limits.receiptScansUsed, limits.receiptScansLimit);
      case 'chat_message': return remaining(limits.chatMessagesUsed, limits.chatMessagesLimit);
      case 'add_expense': return remaining(limits.expensesToday, limits.expensesLimit);
      default: return Infinity;
    }
  }, [proStatus, limits]);

  /** Apply usage numbers returned by an API call (e.g. `quota` on a chat reply). */
  const applyQuota = useCallback((quota) => {
    if (!quota?.feature) return;
    const field = { chat_message: 'chatMessagesUsed', receipt_scan: 'receiptScansUsed', add_expense: 'expensesToday' }[quota.feature];
    if (field && typeof quota.used === 'number') setLimits((prev) => ({ ...prev, [field]: quota.used }));
  }, []);

  return (
    <ProContext.Provider value={{
      isPro: proStatus.isPro,
      proStatus,
      limits,
      loading,
      purchasesAvailable,
      canUse,
      getRemaining,
      applyQuota,
      refreshProStatus: fetchProStatus,
    }}>
      {children}
    </ProContext.Provider>
  );
}

export const usePro = () => useContext(ProContext);
