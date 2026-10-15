import { registerPlugin } from '@capacitor/core';

/**
 * DebitReminders — local notifications
 * (android/app/src/main/java/com/vittova/app/DebitRemindersPlugin.java):
 * "expected debit tomorrow" reminders, and (v1.14) daily mission reminders.
 *
 *   checkPermission() / requestPermission() -> { display: 'granted'|'denied'|'prompt' }
 *   schedule({ reminders: [{ id, title, body, notifyAt, expiresAt? }], group? }) -> { scheduled }
 *       replaces every reminder in the group ('debit', the default, or 'mission')
 *   cancelAll({ group? })   default 'debit'
 *   addListener('reminderOpened', ({ route }) => ...)   route '/subscription-audit' or '/rewards'
 */
export const DebitReminders = registerPlugin('DebitReminders');
