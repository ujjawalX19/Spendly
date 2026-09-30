import { registerPlugin } from '@capacitor/core';

/**
 * UpiNotification — native bridge to Android payment tracking
 * (android/app/src/main/java/com/vittova/app/UpiNotificationPlugin.java).
 * Capture does not need this bridge: the bank-SMS receiver and the notification
 * listener store payments on the phone while Vittova is closed. The web layer
 * uploads them (contexts/PaymentTrackingContext.jsx).
 *
 *   getTrackingInfo()                    -> { granted, trackingEnabled, listenerConnected,
 *                                            listenerChangedAt, restrictedSettingsLikely, sdkInt, manufacturer,
 *                                            smsGranted, smsEnabled, smsPermission }
 *   setTrackingEnabled({ enabled })      Vittova's own switch (on by default)
 *   requestSmsPermission()               Android's SMS dialog -> getTrackingInfo() shape
 *                                        (call only from an explicit tap, after the disclosure)
 *   setSmsEnabled({ enabled })           Vittova's own bank-SMS switch
 *   scanSmsInbox()                       -> { added }: bank alerts that arrived since access was
 *                                        allowed (or the last scan) and the receiver missed
 *   ensureListenerBound()                ask Android to reconnect the listener
 *   getPendingPayments()                 -> { payments: TrackedPayment[] }
 *   resolvePendingPayment({ id, outcome })  'synced' | 'dismissed' | 'rejected'
 *   markSyncAttempt({ id, error })       failed upload (short code, never a message)
 *   markForReview({ id })                the user must decide after all
 *   bindOwner({ userId })                -> { action: 'keep' | 'claim' | 'clear' }
 *   clearTrackingData()                  on account deletion
 *   requestNotificationPermission()      opens Android Notification Access settings (optional source)
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
