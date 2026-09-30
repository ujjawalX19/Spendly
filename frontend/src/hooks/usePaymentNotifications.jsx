import { useCallback } from 'react';
import { usePaymentTracking } from '../contexts/PaymentTrackingContext';

/**
 * usePaymentNotifications — the Home screen's and onboarding's view of payment
 * tracking (contexts/PaymentTrackingContext.jsx does the work).
 *
 * Clear payments are uploaded automatically by the provider, whichever screen
 * is open; `pending` here is only what needs the user: detections the parser
 * was unsure about, or everything while the user has chosen "ask me first".
 *
 * `permissionGranted` is Android's real Notification Access state, re-read
 * whenever the app returns to the foreground.
 */
export function usePaymentNotifications() {
  const t = usePaymentTracking();

  const pending = t.reviewItems.map((p) => ({
    fingerprint: p.id,
    id: p.id,
    amount: Number(p.amount),
    kind: p.kind || 'EXPENSE',
    merchant: p.merchant || 'Unknown',
    app: p.app || '',
    timestamp: Number(p.timestamp) || Date.now(),
    needsConfirmation: true,
  }));

  const resolvePayment = useCallback((id) => t.dismissPayment(id), [t]);

  return {
    isSupported: t.supported,
    permissionGranted: t.granted,
    permissionChecked: t.checked,
    restrictedSettingsLikely: t.restrictedSettingsLikely,
    pending,
    resolvePayment,
    confirmPayment: t.confirmPayment,
    openPermissionSettings: t.openAccessSettings,
    openAppSettings: t.openAppSettings,
    checkPermissionNow: async () => Boolean((await t.refresh())?.granted),
  };
}
