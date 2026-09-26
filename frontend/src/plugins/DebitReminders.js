import { registerPlugin } from '@capacitor/core';

/**
 * DebitReminders — local "expected debit tomorrow" notifications
 * (android/app/src/main/java/com/vittova/app/DebitRemindersPlugin.java).
 *
 *   checkPermission() / requestPermission() -> { display: 'granted'|'denied'|'prompt' }
 *   schedule({ reminders: [{ id, title, body, notifyAt (epoch ms) }] }) -> { scheduled }   replaces all
 *   cancelAll()
 *   addListener('reminderOpened', ({ route }) => ...)
 */
export const DebitReminders = registerPlugin('DebitReminders');
