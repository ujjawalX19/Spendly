import { registerPlugin } from '@capacitor/core';

/**
 * AuthLog — writes one fixed sign-in step code to Android's logcat
 * (android/app/src/main/java/com/vittova/app/AuthLogPlugin.java).
 *
 *   logEvent({ code })   see lib/authLog.js for the codes
 */
export const AuthLog = registerPlugin('AuthLog');
