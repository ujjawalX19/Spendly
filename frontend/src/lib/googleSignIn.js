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
 * What to do when the native picker fails. The codes come from
 * GoogleAuthErrors.java (the older CANCELLED / FAILED / REAUTH_FAILED names are
 * still understood).
 *   cancelled — USER_CANCELLED: the user closed it. Stay on the login screen,
 *               no error, and never open a browser.
 *   retry     — INTERRUPTED: transient, show a retry message
 *   network   — NETWORK_ERROR: Google could not be reached; a browser would
 *               fail the same way, so ask for the connection instead
 *   fallback  — native sign-in cannot work here but the browser flow can:
 *               OAUTH_CONFIGURATION_ERROR (no Android OAuth client for this
 *               build's package and signing certificate), NO_CREDENTIAL (no
 *               Google account on the phone), UNSUPPORTED, GOOGLE_AUTH_FAILED
 */
/**
 * Telemetry code for a native failure that falls back to the browser, so a
 * device report shows WHY (no account / Android OAuth client not matching the
 * signing certificate usually surfaces as NO_CREDENTIAL). Never the message.
 */
export function nativeFailureCode(code) {
  if (code === 'NO_CREDENTIAL') return 'native_no_credential';
  // Google answered "[16] Account reauth failed" / UNREGISTERED_ON_API_CONSOLE:
  // no Android OAuth client matches this build's package and signing certificate.
  if (code === 'OAUTH_CONFIGURATION_ERROR' || code === 'REAUTH_FAILED') return 'native_oauth_client_mismatch';
  if (code === 'UNSUPPORTED') return 'native_unsupported';
  if (code === 'NETWORK_ERROR') return 'native_network';
  if (code === 'GOOGLE_AUTH_FAILED' || code === 'FAILED') return 'native_failed';
  return 'native_unavailable';
}

export function nativeFailureAction(code) {
  if (code === 'USER_CANCELLED' || code === 'CANCELLED') return 'cancelled';
  if (code === 'INTERRUPTED') return 'retry';
  if (code === 'NETWORK_ERROR') return 'network';
  return 'fallback';
}

/**
 * One Google sign-in at a time. A second tap while the picker or the browser
 * hand-off is still starting gets the first attempt's result instead of opening
 * a second picker or a second browser tab. `onBusy` runs for the ignored call.
 *
 * @param {() => Promise<any>} run
 * @param {() => void} [onBusy]
 */
export function singleFlight(run, onBusy) {
  let current = null;
  return () => {
    if (current) {
      onBusy?.();
      return current;
    }
    current = Promise.resolve().then(run).finally(() => { current = null; });
    return current;
  };
}
