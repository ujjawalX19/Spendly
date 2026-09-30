import { registerPlugin } from '@capacitor/core';

/**
 * UpiNotification — native bridge to Android payment tracking
 * (android/app/src/main/java/com/vittova/app/UpiNotificationPlugin.java).
 * Capture does not need this bridge: the listener stores payments on the phone
 * while Vittova is closed. The web layer uploads them (contexts/PaymentTrackingContext.jsx).
 *
 *   getTrackingInfo()                    -> { granted, trackingEnabled, listenerConnected,
 *                                            listenerChangedAt, restrictedSettingsLikely, sdkInt, manufacturer }
 *   setTrackingEnabled({ enabled })      Vittova's own switch (on by default)
 *   ensureListenerBound()                ask Android to reconnect the listener
 *   getPendingPayments()                 -> { payments: TrackedPayment[] }
 *   resolvePendingPayment({ id, outcome })  'synced' | 'dismissed' | 'rejected'
 *   markSyncAttempt({ id, error })       failed upload (short code, never a message)
 *   markForReview({ id })                the user must decide after all
 *   bindOwner({ userId })                -> { action: 'keep' | 'claim' | 'clear' }
 *   clearTrackingData()                  on account deletion
 *   requestNotificationPermission()      opens Android Notification Access settings
 *                                        (call only from an explicit user tap)
 *   openAppSettings()                    opens Vittova's App info (restricted settings, battery)
 *   checkPermission() / getAccessInfo()  older names: -> { granted, ... }
 *   addListener('paymentDetected', cb)   a payment was just captured while the app is open
 *
 * TrackedPayment: { id (32 hex, also the upload's client_ref), kind: 'EXPENSE', amount,
 *                   merchant, app, timestamp, status: 'PENDING_SYNC'|'NEEDS_REVIEW',
 *                   needsConfirmation, attempts, lastError }
 */
export const UpiNotification = registerPlugin('UpiNotification');
