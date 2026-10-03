/**
 * appUpdate — is this build too old to keep using?
 *
 * The server names the oldest Android build it still supports
 * (GET /api/app-config → android.minSupportedVersionCode, 0 = no minimum). A
 * build below it shows the "Update Vittova" screen (components/UpdateGate),
 * which asks Google Play for an immediate in-app update. Ordinary releases do
 * not raise the minimum, so nobody is interrupted for them.
 *
 * Safe by default: if the minimum cannot be read (offline, a sleeping server,
 * an older server without the route), the last value this phone saw is used,
 * and with none the app simply opens.
 */

export const MIN_VERSION_KEY = 'vittova.minSupportedVersionCode';

// A version code: a positive whole number, or digits only as text. Anything
// else ("1e999", "26abc", a fraction) counts as none.
const whole = (v) => {
  const n = typeof v === 'number' ? v : (/^\d{1,9}$/.test(String(v ?? '').trim()) ? Number(v) : 0);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

/** The minimum from the server's reply; 0 when it has none or the reply is not understood. */
export function minFromConfig(body) {
  return whole(body?.android?.minSupportedVersionCode);
}

/**
 * @param {number|string} currentCode  this build's versionCode
 * @param {number|string} minCode      the oldest supported versionCode (0 = none)
 */
export function updateRequired(currentCode, minCode) {
  const current = whole(currentCode);
  const min = whole(minCode);
  // An unknown build number never blocks: better to open than to lock out.
  return current > 0 && min > current;
}

/**
 * The minimum to apply now: the server's when it answered, otherwise the one
 * remembered from the last time it did.
 *
 * @param {{ ok: boolean, body?: object }} reply   the /app-config fetch outcome
 * @param {string|null} remembered                 value stored under MIN_VERSION_KEY
 */
export function effectiveMinimum(reply, remembered) {
  if (reply?.ok) return minFromConfig(reply.body);
  return whole(remembered);
}
