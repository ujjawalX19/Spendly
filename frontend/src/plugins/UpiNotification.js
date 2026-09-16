import { registerPlugin } from '@capacitor/core';

/**
 * UpiNotification — native bridge to the Android payment-notification listener
 * (android/app/src/main/java/com/spendly/app/UpiNotificationPlugin.java).
 *
 *   checkPermission()                    -> { granted: boolean }
 *   requestNotificationPermission()      opens Android Notification Access settings
 *                                        (call only from an explicit user tap)
 *   openAppSettings()                    opens Vittova's App info (⋮ → Allow restricted settings)
 *   getAccessInfo()                      -> { granted, restrictedSettingsLikely, sdkInt }
 *   getPendingPayments()                 -> { payments: PendingPayment[] }
 *   removePendingPayment({ fingerprint }) -> { removed: boolean }
 *   addListener('paymentDetected', cb)   live copy of a newly queued detection
 *
 * PendingPayment: { fingerprint, kind: 'EXPENSE'|'INCOME'|'REFUND', amount,
 *                   merchant, app, timestamp, needsConfirmation }
 */
export const UpiNotification = registerPlugin('UpiNotification');
