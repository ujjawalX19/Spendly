/**
 * googleSignIn — pieces of the native Android Google sign-in that can be
 * tested without a device.
 *
 * Flow: Credential Manager → Google ID token (audience = the Web client id,
 * nonce = SHA-256 of a random value) → supabase.auth.signInWithIdToken with the
 * raw nonce. Supabase verifies the token's signature, audience, expiry and
 * nonce; the app never trusts an email or user id from the device.
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
 * What to do when the native picker fails.
 *   cancelled — the user closed it: stay on the login screen, no error
 *   fallback  — native sign-in is unavailable here (no Google account, or the
 *               Android OAuth client is not configured): use the browser flow
 *   retry     — transient: show a retry message
 */
export function nativeFailureAction(code) {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'INTERRUPTED') return 'retry';
  return 'fallback';
}
