import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { UpiNotification } from '../plugins/UpiNotification';

/**
 * usePaymentNotifications — payments detected from supported UPI/bank app
 * notifications, waiting for the user to confirm or dismiss.
 *
 * WHY A QUEUE
 * Payments mostly happen while Spendly is closed. The Android listener service
 * therefore stores each detection (amount, payee, app, time, kind — never the
 * raw notification text) in a small app-private queue, and this hook reads that
 * queue whenever the app is opened or resumed. Previously a detection was only
 * delivered as a live event, so anything that happened while the dashboard was
 * not on screen was silently lost, and a second payment overwrote the first.
 *
 * A detection leaves the queue only when the user logs it or dismisses it.
 *
 * NOT YET VERIFIED ON A DEVICE: background delivery depends on the OS keeping
 * the notification listener bound (battery optimisation on some manufacturers
 * can stop it). See DEVICE_TEST_CHECKLIST.md.
 */

// Fingerprints the user already acted on, in case removing an item from the
// native queue fails and it would otherwise reappear.
const RESOLVED_KEY = 'spendly.seenPayments.v1';
const RESOLVED_LIMIT = 200;

function loadResolved() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESOLVED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-RESOLVED_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveResolved(list) {
  try {
    window.localStorage.setItem(RESOLVED_KEY, JSON.stringify(list.slice(-RESOLVED_LIMIT)));
  } catch { /* storage unavailable */ }
}

function normalise(payload) {
  const amount = Number(payload?.amount);
  if (!payload || !Number.isFinite(amount) || amount <= 0 || !payload.fingerprint) return null;
  return {
    fingerprint: String(payload.fingerprint),
    amount,
    kind: payload.kind || 'EXPENSE',
    merchant: payload.merchant || 'Unknown',
    app: payload.app || '',
    timestamp: Number(payload.timestamp) || Date.now(),
    needsConfirmation: Boolean(payload.needsConfirmation),
  };
}

export function usePaymentNotifications() {
  const isSupported = Capacitor.getPlatform() === 'android';
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(!isSupported);
  const [pending, setPending] = useState([]);
  const resolvedRef = useRef(null);
  if (resolvedRef.current === null) resolvedRef.current = loadResolved();

  const mergeIntoPending = useCallback((items) => {
    const fresh = items.map(normalise).filter(Boolean)
      .filter((p) => !resolvedRef.current.includes(p.fingerprint));
    setPending((prev) => {
      const byId = new Map(prev.map((p) => [p.fingerprint, p]));
      for (const p of fresh) if (!byId.has(p.fingerprint)) byId.set(p.fingerprint, p);
      return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const checkPermissionNow = useCallback(async () => {
    if (!isSupported) return false;
    try {
      const { granted } = await UpiNotification.checkPermission();
      setPermissionGranted(Boolean(granted));
      return Boolean(granted);
    } catch {
      setPermissionGranted(false);
      return false;
    } finally {
      setPermissionChecked(true);
    }
  }, [isSupported]);

  const syncQueue = useCallback(async () => {
    if (!isSupported) return;
    try {
      const { payments } = await UpiNotification.getPendingPayments();
      mergeIntoPending(Array.isArray(payments) ? payments : []);
    } catch {
      // Older native build without the queue: live events still work.
    }
  }, [isSupported, mergeIntoPending]);

  // Initial permission check and queue read.
  useEffect(() => {
    if (!isSupported) return;
    checkPermissionNow();
    syncQueue();
  }, [isSupported, checkPermissionNow, syncQueue]);

  // Re-check when the app returns to the foreground (e.g. back from Settings).
  useEffect(() => {
    if (!isSupported) return undefined;
    let handle;
    let cancelled = false;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        checkPermissionNow();
        syncQueue();
      }
    }).then((h) => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [isSupported, checkPermissionNow, syncQueue]);

  // Live events while the app is open.
  useEffect(() => {
    if (!isSupported || !permissionGranted) return undefined;
    let handle;
    let cancelled = false;
    UpiNotification.addListener('paymentDetected', (payload) => mergeIntoPending([payload]))
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [isSupported, permissionGranted, mergeIntoPending]);

  /** The user logged or dismissed this detection: remove it everywhere. */
  const resolvePayment = useCallback(async (fingerprint) => {
    resolvedRef.current = [...resolvedRef.current, fingerprint].slice(-RESOLVED_LIMIT);
    saveResolved(resolvedRef.current);
    setPending((prev) => prev.filter((p) => p.fingerprint !== fingerprint));
    try {
      await UpiNotification.removePendingPayment({ fingerprint });
    } catch { /* the resolved list prevents it reappearing */ }
  }, []);

  /** Opens Android's Notification Access screen. Only ever call from a user tap. */
  const openPermissionSettings = useCallback(async () => {
    if (!isSupported) return;
    try {
      await UpiNotification.requestNotificationPermission();
    } catch { /* nothing useful to do */ }
  }, [isSupported]);

  return {
    isSupported,
    permissionGranted,
    permissionChecked,
    pending,
    resolvePayment,
    openPermissionSettings,
    checkPermissionNow,
  };
}
