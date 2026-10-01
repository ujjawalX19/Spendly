/**
 * authLog — a production-safe trail of sign-in steps in Android's logcat
 * (tag VittovaAuth), so a sign-in problem on a real phone can be diagnosed
 * with `adb logcat -s VittovaAuth`.
 *
 * Only the fixed codes below can be written; the native side
 * (GoogleAuthPlugin.logEvent) refuses anything else. Never a token, an
 * authorization code, a password, an email address or an error message.
 * On the web it does nothing.
 */
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '../plugins/GoogleAuth';

export const AUTH_EVENTS = Object.freeze([
  'AUTH_START', 'GOOGLE_NATIVE_START', 'GOOGLE_NATIVE_SUCCESS', 'GOOGLE_NATIVE_FAILURE',
  'BROWSER_FALLBACK_STARTED', 'BROWSER_FALLBACK_FAILED', 'BROWSER_CLOSED',
  'BROWSER_CALLBACK_RECEIVED', 'BROWSER_CALLBACK_DUPLICATE', 'BROWSER_CALLBACK_INVALID',
  'BROWSER_CALLBACK_PROVIDER_ERROR', 'CODE_EXCHANGE_FAILED',
  'SUPABASE_SESSION_CREATED', 'SUPABASE_AUTH_FAILED', 'AUTH_COMPLETE', 'AUTH_CANCELLED',
  'AUTH_OFFLINE', 'AUTH_ALREADY_RUNNING', 'EMAIL_LOGIN_FAILED', 'EMAIL_SIGNUP_FAILED',
  'EMAIL_RATE_LIMITED', 'SIGNED_OUT', 'SESSION_RESTORED',
  'AGE_REQUIRED', 'AGE_SAVED', 'AGE_SAVE_FAILED',
]);

const ALLOWED = new Set(AUTH_EVENTS);

/** @param {string} code one of AUTH_EVENTS; anything else is ignored */
export function authLog(code) {
  if (!ALLOWED.has(code)) return;
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    GoogleAuth.logEvent({ code }).catch(() => { /* older native build */ });
  } catch { /* never let logging break sign-in */ }
}
