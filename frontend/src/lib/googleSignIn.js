/**
 * googleSignIn — the pieces of in-app Google sign-in on Android that can be
 * tested without a device.
 *
 * Flow: Google's sign-in sheet (GoogleAuthPlugin) → Google ID token (audience =
 * the Web client id, nonce = SHA-256 of a random value) →
 * supabase.auth.signInWithIdToken with the raw nonce. Supabase verifies the
 * token's signature, audience, expiry and nonce; the app never trusts an email
 * or user id from the device. No browser is involved.
 */

/**
 * The Web OAuth client id Supabase's Google provider uses. Public (it appears
 * in every Google sign-in URL), not a secret. A release APK is built once, so
 * it falls back to the production id when the build variable is absent.
 */
const FALLBACK_WEB_CLIENT_ID = '721097065853-laesaqu68pugihim0rptp4v086k45352.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = (import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID || FALLBACK_WEB_CLIENT_ID).trim();

const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** A fresh random nonce and its SHA-256 (hex): the hash goes to Google, the raw value to Supabase. */
export async function makeNonce(cryptoImpl = globalThis.crypto) {
  const raw = hex(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const hashed = hex(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed };
}

/**
 * What the app does for each result code from GoogleAuthPlugin
 * (GoogleAuthErrors.java).
 *
 *   cancelled — USER_CANCELLED: the user closed Google's sheet. Stay on the
 *               login screen, no error, and never open a browser.
 *   message   — the sign-in cannot finish; say why, in plain words:
 *                 NETWORK_ERROR              no connection to Google
 *                 GOOGLE_AUTH_FAILED         anything else
 *   browser   — the in-app sheet cannot sign this person in, but the browser
 *               sign-in can, so "Continue with Google" carries straight on
 *               there and one tap still signs them in:
 *                 OAUTH_CONFIGURATION_ERROR  Google does not recognise this
 *                                            build (no Android OAuth client for
 *                                            its package + signing certificate)
 *                 UNSUPPORTED                no usable Google Play services
 *               A build Google recognises never reaches this.
 */
export function nativeFailureAction(code) {
  if (code === 'USER_CANCELLED') return 'cancelled';
  if (code === 'OAUTH_CONFIGURATION_ERROR' || code === 'UNSUPPORTED') return 'browser';
  return 'message';
}

/**
 * After Google refuses the in-app sheet, the app goes straight to the browser
 * for the next sign-ins instead of showing a sheet that cannot work (and
 * asking for the account twice). It tries the in-app sheet again after a day,
 * so a build Google starts recognising switches over by itself.
 */
export const NATIVE_REFUSED_KEY = 'vittova.googleNativeRefusedAt';
export const NATIVE_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/** @param {string|number|null} refusedAt  ms timestamp stored under NATIVE_REFUSED_KEY */
export function shouldSkipNative(refusedAt, now = Date.now()) {
  const t = Number(refusedAt);
  return Number.isFinite(t) && t > 0 && now - t >= 0 && now - t < NATIVE_RETRY_AFTER_MS;
}

/** The message for a 'message' result. Never Google's own text. */
export function nativeFailureMessage(code) {
  if (code === 'NETWORK_ERROR') return "We couldn't reach Google. Check your internet connection and try again.";
  return "Google sign-in couldn't be completed. Please try again.";
}

/** Telemetry reason for a native failure. A short code, never the message. */
export function nativeFailureCode(code) {
  if (code === 'OAUTH_CONFIGURATION_ERROR') return 'native_oauth_client_mismatch';
  if (code === 'NETWORK_ERROR') return 'native_network';
  if (code === 'UNSUPPORTED') return 'native_unsupported';
  if (code === 'USER_CANCELLED') return 'cancelled';
  return 'native_failed';
}
