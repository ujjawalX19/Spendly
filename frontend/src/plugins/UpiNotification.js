import { registerPlugin } from '@capacitor/core';

/**
 * UpiNotification Plugin
 * 
 * Bridging Android's NotificationListenerService to the React frontend.
 * 
 * Methods:
 * - requestNotificationPermission(): Opens Android Settings to grant access
 * - checkPermission(): Returns { granted: boolean } silently
 * - hasNotificationAccess(): Returns { granted: boolean } — clean alias for permission banner
 * - openNotificationSettings(): Opens Android Notification Listener Settings screen
 * 
 * Events:
 * - addListener('paymentDetected', (payload) => void)
 *   Payload: { app: string, amount: number, merchant: string, timestamp: number }
 */
export const UpiNotification = registerPlugin('UpiNotification');
