/**
 * PaymentTrackingContext — automatic payment tracking, app-wide.
 *
 * Mounted once, above the routes, so uploads do not depend on which screen is
 * open. Capture itself never depends on the app: the Android listener stores
 * payments on the phone while Vittova is closed (PaymentNotificationListener).
 * Whenever the app runs with a signed-in user, this provider uploads what is
 * waiting (lib/paymentTracking.runSync):
 *
 *   - at start, after binding the stored payments to this account
 *   - when the app returns to the foreground
 *   - when the network comes back
 *   - the moment the listener captures a new payment while the app is open
 *
 * After anything is saved it fires EXPENSES_CHANGED_EVENT, and History and Home
 * reload. It also exposes the truthful tracking state (Vittova's switch AND
 * Android's Notification Access) for Home, History, onboarding and Profile.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { UpiNotification } from '../plugins/UpiNotification';
import { useAuth } from './AuthContext';
import { API_URL, apiFetch, authHeaders } from '../lib/apiConfig';
import { track } from '../lib/telemetry';
import {
  EXPENSES_CHANGED_EVENT, MODE_KEY_PREFIX, TRACKING, expenseBody, outcomeFor, planSync,
  resolveMode, runSync, stateCopy, summarize, trackingState,
} from '../lib/paymentTracking';

const PaymentTrackingContext = createContext(null);

const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

function readStoredMode(userId) {
  if (!userId) return null;
  try { return window.localStorage.getItem(MODE_KEY_PREFIX + userId); } catch { return null; }
}

export function PaymentTrackingProvider({ children }) {
  const { session, user } = useAuth();
  const supported = isAndroidApp();
  const userId = user?.id || session?.user?.id || null;
  const token = session?.access_token || null;

  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(false);
  const [checked, setChecked] = useState(!supported);
  const [payments, setPayments] = useState([]);
  const [storedMode, setStoredMode] = useState(() => readStoredMode(userId));
  const [lastResult, setLastResult] = useState(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const idempotentRef = useRef({ token: null, value: false });
  const syncing = useRef(null);
  const boundFor = useRef(null);

  useEffect(() => { setStoredMode(readStoredMode(userId)); }, [userId]);
  const { mode, needsChoice } = resolveMode(storedMode);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ── Device state ──────────────────────────────────────────────────────────

  const refreshInfo = useCallback(async () => {
    if (!supported) return null;
    try {
      let next;
      try {
        next = await UpiNotification.getTrackingInfo();
      } catch {
        // An older native build: access state only, switch assumed on.
        const old = await UpiNotification.getAccessInfo();
        next = { ...old, trackingEnabled: true };
      }
      setInfo(next);
      setInfoError(false);
      return next;
    } catch {
      setInfoError(true);
      return null;
    } finally {
      setChecked(true);
    }
  }, [supported]);

  const refreshQueue = useCallback(async () => {
    if (!supported) return [];
    try {
      const { payments: list } = await UpiNotification.getPendingPayments();
      const clean = Array.isArray(list) ? list : [];
      setPayments(clean);
      return clean;
    } catch {
      return [];
    }
  }, [supported]);

  // ── Uploading ─────────────────────────────────────────────────────────────

  /** Does this server accept payment references (idempotent uploads)? Asked once per sign-in. */
  const serverIsIdempotent = useCallback(async (s) => {
    if (idempotentRef.current.token === s.access_token) return idempotentRef.current.value;
    let value = false;
    try {
      const response = await apiFetch(`${API_URL}/features`, { headers: authHeaders(s, { json: false }) }, { retries: 1 });
      const data = await response.json().catch(() => ({}));
      value = Boolean(response.ok && data?.features?.expenseIdempotency);
    } catch { /* offline: decided on the next attempt */ }
    idempotentRef.current = { token: s.access_token, value };
    return value;
  }, []);

  const postExpense = useCallback(async (body) => {
    const s = sessionRef.current;
    if (!s?.access_token) return { status: 401, body: {} };
    const response = await apiFetch(`${API_URL}/expenses`, {
      method: 'POST', headers: authHeaders(s), body: JSON.stringify(body),
    }, { timeoutMs: 20000 });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, []);

  const syncNow = useCallback(async () => {
    if (!supported || !sessionRef.current?.access_token || boundFor.current !== userId) return null;
    if (syncing.current) return syncing.current;
    syncing.current = (async () => {
      try {
        const idempotent = await serverIsIdempotent(sessionRef.current);
        const result = await runSync({
          list: refreshQueue,
          post: postExpense,
          resolve: (id, outcome) => UpiNotification.resolvePendingPayment({ id, outcome }),
          markAttempt: (id, error) => UpiNotification.markSyncAttempt({ id, error }).catch(() => {}),
          markForReview: (id) => UpiNotification.markForReview({ id }).catch(() => {}),
        }, { mode: modeRef.current, idempotent });
        setLastResult({ ...result, at: Date.now() });
        if (result.synced > 0) {
          track('payment_auto_added', { code: 'auto' });
          window.dispatchEvent(new CustomEvent(EXPENSES_CHANGED_EVENT));
        }
        return result;
      } catch {
        return null;
      } finally {
        await refreshQueue();
        syncing.current = null;
      }
    })();
    return syncing.current;
  }, [supported, userId, serverIsIdempotent, refreshQueue, postExpense]);

  // Bind stored payments to this account, then catch up.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      await refreshInfo();
      if (!userId || !token) { await refreshQueue(); return; }
      if (boundFor.current !== userId) {
        try {
          const { action } = await UpiNotification.bindOwner({ userId });
          if (action === 'clear') track('payment_queue_cleared', { code: 'other_account' });
        } catch { /* an older native build keeps no owner */ }
        if (cancelled) return;
        boundFor.current = userId;
      }
      try { await UpiNotification.ensureListenerBound(); } catch { /* older native build */ }
      if (!cancelled) await syncNow();
    })();
    return () => { cancelled = true; };
  }, [supported, userId, token, refreshInfo, refreshQueue, syncNow]);

  // Foreground: re-read Android's real permission state and upload.
  useEffect(() => {
    if (!supported) return undefined;
    let handle;
    let cancelled = false;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      refreshInfo();
      UpiNotification.ensureListenerBound().catch(() => {});
      syncNow();
    }).then((h) => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
    return () => { cancelled = true; handle?.remove(); };
  }, [supported, refreshInfo, syncNow]);

  // Network back: upload what waited.
  useEffect(() => {
    if (!supported) return undefined;
    const onOnline = () => { syncNow(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [supported, syncNow]);

  // Captured while the app is open: upload straight away.
  useEffect(() => {
    if (!supported) return undefined;
    let handle;
    let cancelled = false;
    UpiNotification.addListener('paymentDetected', () => { syncNow().then((r) => { if (!r) refreshQueue(); }); })
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => {});
    return () => { cancelled = true; handle?.remove(); };
  }, [supported, syncNow, refreshQueue]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setMode = useCallback((next) => {
    if (!userId || (next !== 'auto' && next !== 'review')) return;
    try { window.localStorage.setItem(MODE_KEY_PREFIX + userId, next); } catch { /* storage unavailable */ }
    setStoredMode(next);
    modeRef.current = next;
    track('payment_tracking_mode', { code: next });
    if (next === 'auto') syncNow();
  }, [userId, syncNow]);

  const setTrackingEnabled = useCallback(async (enabled) => {
    if (!supported) return null;
    try {
      const next = await UpiNotification.setTrackingEnabled({ enabled });
      setInfo(next);
      track('payment_tracking_switch', { code: enabled ? 'on' : 'off' });
      return next;
    } catch {
      return refreshInfo();
    }
  }, [supported, refreshInfo]);

  /** Opens Android's Notification Access screen. Only ever call from a user tap. */
  const openAccessSettings = useCallback(async () => {
    if (!supported) return;
    try { await UpiNotification.requestNotificationPermission(); } catch { /* nothing useful to do */ }
  }, [supported]);

  /** Vittova's App info (restricted settings, battery / background). Only from a user tap. */
  const openAppSettings = useCallback(async () => {
    if (!supported) return;
    try { await UpiNotification.openAppSettings(); } catch { /* nothing useful to do */ }
  }, [supported]);

  /** The user said a detected payment is not an expense. */
  const dismissPayment = useCallback(async (id) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    try { await UpiNotification.resolvePendingPayment({ id, outcome: 'dismissed' }); } catch { /* re-read below */ }
    refreshQueue();
  }, [refreshQueue]);

  /** The user confirmed a detected payment (possibly correcting the amount). */
  const confirmPayment = useCallback(async (id, amount) => {
    const payment = payments.find((p) => p.id === id);
    const s = sessionRef.current;
    if (!payment || !s?.access_token) return { success: false, message: 'Please sign in again to add this payment.' };
    try {
      const idempotent = await serverIsIdempotent(s);
      const res = await postExpense(expenseBody(payment, { idempotent, amount }));
      if (outcomeFor(res.status, res.body) !== 'synced') {
        return { success: false, message: res.body?.message || "We couldn't save that payment. Please try again." };
      }
      await UpiNotification.resolvePendingPayment({ id, outcome: 'synced' });
      window.dispatchEvent(new CustomEvent(EXPENSES_CHANGED_EVENT));
      await refreshQueue();
      return { success: true, expense: res.body.expense };
    } catch {
      return { success: false, message: "We couldn't reach Vittova. Your payment is kept and you can try again." };
    }
  }, [payments, serverIsIdempotent, postExpense, refreshQueue]);

  /** Account deleted: forget every payment stored on this phone. */
  const clearDeviceData = useCallback(async () => {
    if (!supported) return;
    try { await UpiNotification.clearTrackingData(); } catch { /* older native build */ }
    setPayments([]);
  }, [supported]);

  const state = trackingState({ supported, info, error: infoError });
  const counts = summarize(payments, { mode });
  const reviewItems = useMemo(() => planSync(payments, { mode }).review, [payments, mode]);

  const value = {
    supported,
    checked,
    info,
    state,
    copy: stateCopy(state, { manufacturer: info?.manufacturer }),
    granted: Boolean(info?.granted),
    trackingEnabled: info ? info.trackingEnabled !== false : true,
    restrictedSettingsLikely: Boolean(info?.restrictedSettingsLikely),
    mode,
    needsChoice: needsChoice && state === TRACKING.ENABLED,
    payments,
    reviewItems,
    waiting: counts.waiting,
    reviewCount: counts.review,
    lastResult,
    setMode,
    setTrackingEnabled,
    openAccessSettings,
    openAppSettings,
    refresh: refreshInfo,
    syncNow,
    dismissPayment,
    confirmPayment,
    clearDeviceData,
  };

  return <PaymentTrackingContext.Provider value={value}>{children}</PaymentTrackingContext.Provider>;
}

/** Tracking state and actions. Safe outside the provider (reports unsupported). */
export function usePaymentTracking() {
  return useContext(PaymentTrackingContext) || FALLBACK;
}

const noop = async () => null;
const FALLBACK = {
  supported: false, checked: true, info: null, state: TRACKING.UNSUPPORTED, copy: stateCopy(TRACKING.UNSUPPORTED),
  granted: false, trackingEnabled: false, restrictedSettingsLikely: false, mode: 'review', needsChoice: false,
  payments: [], reviewItems: [], waiting: 0, reviewCount: 0, lastResult: null,
  setMode: () => {}, setTrackingEnabled: noop, openAccessSettings: noop, openAppSettings: noop, refresh: noop,
  syncNow: noop, dismissPayment: noop, confirmPayment: async () => ({ success: false }), clearDeviceData: noop,
};
