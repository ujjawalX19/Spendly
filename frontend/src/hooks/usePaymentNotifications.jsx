import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { UpiNotification } from '../plugins/UpiNotification';

/**
 * Fingerprints of transactions already shown to the user.
 *
 * The native listener suppresses duplicates within its own process, but it is
 * restarted independently of the WebView — on reboot, after a crash, or when
 * the user re-grants notification access. Keeping a short client-side history
 * means a payment already recorded does not reappear after a restart.
 *
 * Deliberately small and best-effort: losing it costs at most one duplicate
 * prompt, which the user can dismiss.
 */
const SEEN_KEY = 'spendly.seenPayments.v1';
const SEEN_LIMIT = 100;

function loadSeen() {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-SEEN_LIMIT) : [];
  } catch {
    // Private mode, cleared site data, or corrupt JSON — start fresh.
    return [];
  }
}

function persistSeen(list) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_LIMIT)));
  } catch {
    // Storage unavailable or full; in-memory dedup still applies this session.
  }
}

export function usePaymentNotifications({ onPaymentDetected } = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const seenRef = useRef(null);
  if (seenRef.current === null) seenRef.current = loadSeen();

  // Keep the latest callback in a ref so re-registering the native listener
  // is not required every time the consumer re-renders.
  const callbackRef = useRef(onPaymentDetected);
  useEffect(() => { callbackRef.current = onPaymentDetected; }, [onPaymentDetected]);

  // 1. Initial permission check
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    UpiNotification.checkPermission()
      .then(({ granted }) => setPermissionGranted(Boolean(granted)))
      .catch(() => setPermissionGranted(false));
  }, []);

  // 2. Listen for detected payments
  useEffect(() => {
    if (!isSupported || !permissionGranted) return undefined;

    let listener = null;
    let cancelled = false;

    UpiNotification.addListener('paymentDetected', (payload) => {
      if (!payload) return;

      // The native side classifies; the UI must not assume every event is
      // spending. FAILED and UNKNOWN never reach here at all.
      const kind = payload.kind || 'EXPENSE';
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) return;

      const fingerprint = payload.fingerprint;
      if (fingerprint) {
        if (seenRef.current.includes(fingerprint)) return;
        seenRef.current = [...seenRef.current, fingerprint].slice(-SEEN_LIMIT);
        persistSeen(seenRef.current);
      }

      callbackRef.current?.({
        ...payload,
        amount,
        kind,
        merchant: payload.merchant || 'Unknown',
        needsConfirmation: Boolean(payload.needsConfirmation),
      });
    })
      .then((l) => {
        if (cancelled) { l.remove(); return; }
        listener = l;
      })
      .catch(() => { /* listener unavailable; the app still works manually */ });

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [isSupported, permissionGranted]);

  // 3. Send the user to the system settings screen
  const requestPermission = useCallback(async () => {
    if (!isSupported) return;
    try {
      await UpiNotification.requestNotificationPermission();
      // Android takes the user out of the app to grant this, so the result is
      // not known here. checkPermissionNow() is called when the app resumes.
    } catch {
      // Nothing useful to do; the banner stays visible.
    }
  }, [isSupported]);

  const checkPermissionNow = useCallback(async () => {
    if (!isSupported) return false;
    try {
      const { granted } = await UpiNotification.checkPermission();
      setPermissionGranted(Boolean(granted));
      return Boolean(granted);
    } catch {
      return false;
    }
  }, [isSupported]);

  return { isSupported, permissionGranted, requestPermission, checkPermissionNow };
}
