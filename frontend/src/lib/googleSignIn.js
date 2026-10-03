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
 * (GoogleAuthErrors.java). The Android app never opens a browser to sign in:
 * every result ends inside Vittova.
 *
 *   cancelled — USER_CANCELLED: the user closed Google's sheet. Stay on the
 *               login screen, no error.
 *   message   — the sign-in cannot finish; say why, in plain words:
 *                 NETWORK_ERROR              no connection to Google
 *                 OAUTH_CONFIGURATION_ERROR  Google does not recognise this
 *                                            build (no Android OAuth client for
 *                                            its package + signing certificate)
 *                 UNSUPPORTED                no usable Google Play services
 *                 GOOGLE_AUTH_FAILED         anything else
 */
export function nativeFailureAction(code) {
  return code === 'USER_CANCELLED' ? 'cancelled' : 'message';
}

/** The message for a 'message' result. Never Google's own text. */
export function nativeFailureMessage(code) {
  if (code === 'NETWORK_ERROR') return "We couldn't reach Google. Check your internet connection and try again.";
  if (code === 'OAUTH_CONFIGURATION_ERROR') return "Google sign-in isn't available in this version of Vittova yet. Please sign in with your email and password.";
  if (code === 'UNSUPPORTED') return "Google sign-in needs Google Play services, which this phone doesn't have. Please sign in with your email and password.";
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
