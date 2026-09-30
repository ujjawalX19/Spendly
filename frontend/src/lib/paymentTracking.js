/**
 * paymentTracking — the upload half of automatic payment tracking. Pure logic
 * (no React, no Capacitor) so the whole pipeline is unit-tested.
 *
 * The Android listener captures a payment and stores it on the phone whether
 * or not Vittova is open (PaymentNotificationListener.java). This module runs
 * whenever the app does — at start, on resume, when the network returns and
 * the moment a new payment is captured — and uploads what is waiting:
 *
 *   PENDING_SYNC   a clear payment: uploaded automatically (mode 'auto')
 *   NEEDS_REVIEW   the parser was unsure: the user confirms or dismisses it
 *
 * Uploads are idempotent: each payment carries the phone's id (`client_ref`)
 * and the server stores it once however many times it is sent. Nothing is
 * uploaded without a signed-in session, and a payment captured for one
 * account is never uploaded to another (bindOwner on the device).
 */

// ── The truthful tracking state ─────────────────────────────────────────────

export const TRACKING = Object.freeze({
  ENABLED: 'ENABLED',                         // switched on AND at least one source granted by Android
  DISABLED: 'DISABLED',                       // the user switched it off in Vittova
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED', // switched on, but Android has granted no source
  TEMPORARILY_UNAVAILABLE: 'TEMPORARILY_UNAVAILABLE', // notifications only, and Android dropped the listener
  ERROR: 'ERROR',                             // the state could not be read
  UNSUPPORTED: 'UNSUPPORTED',                 // not the Android app
});

/**
 * The two ways Vittova can see a payment, each needing Android's permission:
 *   sms    bank debit SMS (SMS permission, and Vittova's SMS switch on)
 *   notif  supported payment-app notifications (Notification Access)
 * Many payment apps post no notification for a payment, so bank SMS is the
 * main source; notifications are an extra.
 */
export function sources(info) {
  return {
    sms: Boolean(info?.smsGranted) && info?.smsEnabled !== false,
    notif: Boolean(info?.granted),
  };
}

/**
 * Vittova's own switch (on by default) and Android's permissions are
 * different things; tracking is only ENABLED when the switch is on AND Android
 * has granted at least one source.
 *
 * @param {{ supported: boolean, info?: object|null, error?: boolean }} args
 *   info = UpiNotification.getTrackingInfo(): { trackingEnabled, smsGranted,
 *          smsEnabled, granted, listenerConnected, listenerChangedAt }
 */
export function trackingState({ supported, info, error = false }) {
  if (!supported) return TRACKING.UNSUPPORTED;
  if (error || !info) return TRACKING.ERROR;
  if (info.trackingEnabled === false) return TRACKING.DISABLED;
  const { sms, notif } = sources(info);
  if (!sms && !notif) return TRACKING.PERMISSION_REQUIRED;
  // Notifications only, and a recorded disconnect Android has not undone. (No
  // record at all just means the listener has not reported yet.) With bank SMS
  // on, payments are still captured whatever the listener does.
  if (!sms && info.listenerConnected === false && Number(info.listenerChangedAt) > 0) return TRACKING.TEMPORARILY_UNAVAILABLE;
  return TRACKING.ENABLED;
}

/** What to show for each state. Never says tracking is active unless it is. */
export function stateCopy(state, { manufacturer = '', info = null } = {}) {
  const { sms, notif } = sources(info);
  switch (state) {
    case TRACKING.ENABLED:
      return {
        label: 'On',
        detail: sms && notif
          ? 'Payments are added from your bank SMS and supported payment apps, even when Vittova is closed.'
          : sms
            ? "Payments are added from your bank's debit SMS, even when Vittova is closed."
            : "Payments are added from supported payment-app notifications. Allow bank SMS to catch payments those apps don't announce.",
        action: sms ? null : 'allow_sms',
      };
    case TRACKING.DISABLED:
      return { label: 'Off', detail: 'Turned off in Vittova. Nothing is captured.', action: null };
    case TRACKING.PERMISSION_REQUIRED:
      return { label: 'Needs permission', detail: 'Allow bank SMS so Vittova can see your payments. Nothing is captured yet.', action: 'allow_sms' };
    case TRACKING.TEMPORARILY_UNAVAILABLE: {
      const oem = /vivo|oppo|realme|xiaomi|redmi|poco|oneplus|huawei|honor|samsung/.test(String(manufacturer).toLowerCase());
      return {
        label: 'Paused by Android',
        detail: oem
          ? 'Your phone stopped Vittova in the background. In App info, allow background activity or auto-start for Vittova.'
          : 'Android stopped payment tracking in the background. Opening Vittova usually restarts it.',
        action: 'open_app_settings',
      };
    }
    case TRACKING.UNSUPPORTED:
      return { label: 'Android app only', detail: 'Payment tracking works in the Vittova Android app.', action: null };
    default:
      return { label: 'Unknown', detail: "We couldn't check payment tracking. Reopen Vittova to try again.", action: null };
  }
}

// ── Automatic or ask-first ──────────────────────────────────────────────────

export const MODE_KEY_PREFIX = 'vittova.paymentTracking.mode.';

/**
 * 'auto'   clear payments are added without asking
 * 'review' every detected payment waits for the user
 *
 * 'auto' is set when the user turns tracking on from a Vittova screen that
 * says payments are added automatically (onboarding, the Home card, the access
 * sheet, Profile). Someone who turned access on before automatic adding
 * existed agreed to "ask before adding": until they choose (once, on Home),
 * their payments are only reviewed.
 *
 * @returns {{ mode: 'auto'|'review', needsChoice: boolean }}
 */
export function resolveMode(stored) {
  if (stored === 'auto' || stored === 'review') return { mode: stored, needsChoice: false };
  return { mode: 'review', needsChoice: true };
}

// ── Uploading ───────────────────────────────────────────────────────────────

const ID_RE = /^[0-9a-f]{32}$/;

/** Split the device queue into what to upload now and what the user reviews. */
export function planSync(payments, { mode }) {
  const valid = (Array.isArray(payments) ? payments : [])
    .filter((p) => p && typeof p.id === 'string' && ID_RE.test(p.id) && Number(p.amount) > 0 && (p.kind || 'EXPENSE') === 'EXPENSE');
  const upload = mode === 'auto' ? valid.filter((p) => p.status === 'PENDING_SYNC') : [];
  const review = valid.filter((p) => !upload.includes(p));
  return { upload, review };
}

/**
 * The expense sent for a detected payment. Only the parsed facts — never the
 * notification text. `client_ref` goes only to a server that accepts it.
 */
export function expenseBody(payment, { idempotent, amount } = {}) {
  const body = {
    amount: Math.round(Number(amount ?? payment.amount) * 100) / 100,
    category: 'Other',
    description: String(payment.merchant && payment.merchant !== 'Unknown' ? payment.merchant : 'UPI payment').slice(0, 200),
    source: 'upi_auto',
    occurred_at: new Date(Number(payment.timestamp) || Date.now()).toISOString(),
  };
  if (idempotent && ID_RE.test(String(payment.id))) body.client_ref = payment.id;
  return body;
}

/**
 * What an upload's response means for the queued payment.
 *   synced  saved (or already saved)          → remove from the queue
 *   review  the server refused it as automatic → ask the user
 *   retry   network or server trouble          → keep, try again later
 *   auth    not signed in / session expired     → keep, stop until sign-in
 *   stop    daily limit, account restricted     → keep, stop this round
 */
export function outcomeFor(status, body = {}) {
  if ((status === 200 || status === 201) && body && body.success !== false) return 'synced';
  if (status === 401) return 'auth';
  if (status === 429 || status === 403 || status === 404) return 'stop';
  if (status === 400 || status === 422) return 'review';
  return 'retry';
}

/**
 * One upload round. Every side effect is injected so the round is tested
 * without a device or a server.
 *
 * @param {object} io
 * @param {() => Promise<object[]>} io.list                queued payments on the device
 * @param {(body: object) => Promise<{status:number, body:object}>} io.post   POST /api/expenses
 * @param {(id: string, outcome: string) => Promise<void>} io.resolve
 * @param {(id: string, code: string) => Promise<void>} io.markAttempt
 * @param {(id: string) => Promise<void>} io.markForReview
 * @param {{ mode: 'auto'|'review', idempotent: boolean }} opts
 * @returns {Promise<{ synced: number, review: number, pending: number, stoppedBy: string|null }>}
 */
export async function runSync(io, { mode, idempotent }) {
  const { upload, review } = planSync(await io.list(), { mode });
  let synced = 0;
  let toReview = review.length;
  let stoppedBy = null;
  let pending = 0;

  for (let i = 0; i < upload.length; i++) {
    const payment = upload[i];
    let res;
    try {
      res = await io.post(expenseBody(payment, { idempotent }));
    } catch {
      res = { status: 0, body: {} };
    }
    const outcome = outcomeFor(res.status, res.body);
    if (outcome === 'synced') {
      await io.resolve(payment.id, 'synced');
      synced++;
    } else if (outcome === 'review') {
      await io.markForReview(payment.id);
      toReview++;
    } else {
      // Keep it on the phone, and stop: the next trigger (reopen, network
      // back, next capture) tries again. No timers, no loops.
      await io.markAttempt(payment.id, outcome === 'retry' ? (res.status ? `http_${res.status}` : 'network') : outcome);
      stoppedBy = outcome;
      pending = upload.length - i;
      break;
    }
  }
  return { synced, review: toReview, pending, stoppedBy };
}

/** Counts for the History and Profile status lines. */
export function summarize(payments, { mode }) {
  const { upload, review } = planSync(payments, { mode });
  return { waiting: upload.length, review: review.length };
}

/** Fired after detected payments were saved, so History and Home reload. */
export const EXPENSES_CHANGED_EVENT = 'vittova:expenses-changed';
