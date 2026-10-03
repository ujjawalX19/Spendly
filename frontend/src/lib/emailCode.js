/**
 * emailCode — the one-time code in Vittova's confirmation and password-reset
 * emails, typed into the app so the person never has to leave it.
 *
 * Supabase sends the code when the email template contains `{{ .Token }}`
 * (6 digits by default; the project can set up to 10). The link in the same
 * email keeps working, so both ways finish the same step.
 */

export const CODE_MIN = 6;
export const CODE_MAX = 10;
export const RESEND_WAIT_SECONDS = 60; // Supabase refuses a second email sooner than this

/** What was typed or pasted ("123 456", "Code: 123456") → digits only, capped. */
export function cleanCode(input) {
  return String(input ?? '').replace(/\D+/g, '').slice(0, CODE_MAX);
}

export function isCode(code) {
  return new RegExp(`^\\d{${CODE_MIN},${CODE_MAX}}$`).test(String(code ?? ''));
}

/** Seconds left before another email may be requested. */
export function resendWaitLeft(sentAt, now = Date.now()) {
  const t = Number(sentAt);
  if (!Number.isFinite(t) || t <= 0 || now < t) return 0;
  return Math.max(0, RESEND_WAIT_SECONDS - Math.floor((now - t) / 1000));
}
