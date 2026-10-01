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
 *               login screen, no error.
 *   message   — the sign-in cannot finish; say why, in plain words:
 *                 OAUTH_CONFIGURATION_ERROR  Google does not recognise this build
 *                 NETWORK_ERROR              no connection to Google
 *                 GOOGLE_AUTH_FAILED         anything else
 *   browser   — UNSUPPORTED: this phone has no (usable) Google Play services,
 *               so the in-app sheet cannot exist. The browser sign-in is the
 *               only way to use a Google account there. This is the one case
 *               in which Android ever opens a browser.
 */
export function nativeFailureAction(code) {
  if (code === 'USER_CANCELLED') return 'cancelled';
  if (code === 'UNSUPPORTED') return 'browser';
  return 'message';
}

/**
 * Whether the person is offered the browser sign-in as their own choice, with
 * a button under the message. Only when Google does not recognise this build:
 * the in-app sheet can never work there, but the browser sign-in can, and
 * without the offer a Google-only user could not get in at all. The app never
 * opens the browser by itself for this.
 */
export function offersBrowserSignIn(code) {
  return code === 'OAUTH_CONFIGURATION_ERROR';
}

/** The message for a 'message' result. Never Google's own text. */
export function nativeFailureMessage(code) {
  if (code === 'OAUTH_CONFIGURATION_ERROR') {
    return "Google sign-in inside the app isn't available in this version yet. You can sign in with Google in your browser instead, or use your email and password.";
  }
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
