/**
 * What the Android app tells the user when spendly://login-callback arrives
 * without a usable code, or the code cannot be exchanged.
 *
 * `google` is true when this device started a Google sign-in in the last few
 * minutes (see markGoogleSignInStarted in AuthContext). The same callback also
 * finishes signup email confirmation, which needs different wording.
 *
 * No imports, so it can be unit tested in plain Node.
 */

export const GOOGLE_PENDING_KEY = 'vittova.googleSignInStartedAt';
export const GOOGLE_PENDING_MAX_AGE_MS = 15 * 60 * 1000;

const GOOGLE_FAILED = "Google sign-in couldn't be completed. Please try again.";

/**
 * @param {{ google: boolean, error?: string|null, errorCode?: string|null,
 *           exchangeError?: { message?: string }|null, invalidLink?: boolean }} input
 * @returns {{ message: string, code: string }}  code is a short telemetry reason
 */
export function loginCallbackFailure({ google, error = null, errorCode = null, exchangeError = null, invalidLink = false }) {
  if (error || errorCode) {
    if (error === 'access_denied' && google) {
      return { message: 'Google sign-in was cancelled.', code: 'google_cancelled' };
    }
    if (errorCode === 'otp_expired' && !google) {
      return { message: 'This link has expired or has already been used. Please request a new one.', code: 'link_expired' };
    }
    return google
      ? { message: GOOGLE_FAILED, code: `google_${safe(errorCode || error)}` }
      : { message: 'We could not complete that request. Please try again.', code: `provider_${safe(errorCode || error)}` };
  }

  if (invalidLink) {
    return google
      ? { message: GOOGLE_FAILED, code: 'google_invalid_callback' }
      : { message: 'That link is not valid. Please try again.', code: 'invalid_link' };
  }

  const missingVerifier = /code verifier|code_verifier|flow state/i.test(exchangeError?.message || '');
  if (google) {
    return { message: GOOGLE_FAILED, code: missingVerifier ? 'google_missing_verifier' : 'google_exchange_failed' };
  }
  return missingVerifier
    ? { message: 'Please open the link on the same device where you requested it.', code: 'missing_verifier' }
    : { message: 'This link has expired or has already been used. Please request a new one.', code: 'code_exchange_failed' };
}

/** Whether a Google sign-in was started on this device recently. */
export function isGoogleSignInPending(startedAt, now = Date.now()) {
  const t = Number(startedAt);
  return Number.isFinite(t) && t > 0 && now - t >= 0 && now - t < GOOGLE_PENDING_MAX_AGE_MS;
}

function safe(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
}
