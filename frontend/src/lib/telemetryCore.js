/**
 * Telemetry core — no Capacitor, React or network imports, so it runs (and is
 * tested) under plain Node.
 *
 * WHAT IS SENT (see backend/lib/appEvents.js for the server-side allow-list)
 *   installId   a random UUID created on first launch and kept in app storage.
 *               Not an advertising id, Android id, IMEI or phone number.
 *               Clearing app data or reinstalling creates a new one.
 *   platform    android | ios | web
 *   appVersion  e.g. 1.0.0
 *   events      name + a few enum-like properties (sign-in method, a failure
 *               category, an error class name). Never emails, amounts,
 *               descriptions, questions, messages or tokens.
 */

export const INSTALL_KEY = 'vittova.installId.v1';
export const LAST_OPEN_KEY = 'vittova.lastOpenAt.v1';
export const LAST_LOGIN_KEY = 'vittova.lastLoginEvent.v1';

export const EVENTS = new Set([
  'first_launch', 'app_open', 'signup', 'signup_failed', 'login', 'login_failed', 'logout',
  'google_sign_in_started', 'auth_callback_failed', 'password_reset_requested', 'password_reset_failed',
  'password_updated', 'ai_mentor_opened', 'app_crash',
]);

const PROP_RULES = {
  method: (v) => v === 'email' || v === 'google',
  code: (v) => typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v),
  kind: (v) => typeof v === 'string' && /^[A-Za-z]{1,40}$/.test(v),
};

const APP_OPEN_INTERVAL_MS = 30 * 60 * 1000;
const MAX_QUEUE = 50;
const MAX_BATCH = 25;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeProps(props) {
  const clean = {};
  for (const [key, valid] of Object.entries(PROP_RULES)) {
    if (props && props[key] !== undefined && valid(props[key])) clean[key] = props[key];
  }
  return clean;
}

/**
 * Map a Supabase Auth error to a short category. The raw message is never
 * sent: it can contain the email address that was typed.
 */
export function authFailureCode(error) {
  if (!error) return 'unknown';
  const message = String(error.message || '').toLowerCase();
  if (error.status === 429 || /rate limit|too many/.test(message)) return 'rate_limited';
  if (/invalid login|invalid credentials/.test(message)) return 'invalid_credentials';
  if (/not confirmed/.test(message)) return 'email_not_confirmed';
  if (/already registered|already exists/.test(message)) return 'user_exists';
  if (/password/.test(message)) return 'weak_password';
  if (/valid email|invalid email/.test(message)) return 'invalid_email';
  if (/fetch|network|failed to/.test(message)) return 'network';
  return 'other';
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* storage unavailable */ }
}

/**
 * @param {{
 *   storage: Storage,
 *   send: (batch: object) => Promise<boolean>,
 *   platform: string,
 *   appVersion?: () => Promise<string|undefined>|string|undefined,
 *   now?: () => number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 * }} deps
 */
export function createTelemetry({ storage, send, platform, appVersion, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms) }) {
  let queue = [];
  let timer = null;
  let flushing = null;

  let installId = safeGet(storage, INSTALL_KEY);
  const isFirstLaunch = !installId || !UUID_RE.test(installId);
  if (isFirstLaunch) {
    installId = randomUuid();
    safeSet(storage, INSTALL_KEY, installId);
  }

  function track(name, props) {
    if (!EVENTS.has(name)) return false;
    queue.push({ name, at: new Date(now()).toISOString(), props: sanitizeProps(props) });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (!timer) {
      timer = schedule(() => { timer = null; flush(); }, 1500);
    }
    return true;
  }

  async function flush() {
    if (flushing) return flushing;
    if (!queue.length) return true;
    const events = queue.slice(0, MAX_BATCH);
    queue = queue.slice(events.length);
    flushing = (async () => {
      let delivered = false;
      try {
        const version = typeof appVersion === 'function' ? await appVersion() : appVersion;
        delivered = await send({
          installId,
          platform,
          ...(version && /^[0-9A-Za-z._+-]{1,32}$/.test(version) ? { appVersion: version } : {}),
          events,
        });
      } catch {
        delivered = false;
      }
      // Undelivered events go back to the front of the queue for the next flush.
      if (!delivered) queue = [...events, ...queue].slice(-MAX_QUEUE);
      return delivered;
    })();
    try {
      return await flushing;
    } finally {
      flushing = null;
      if (queue.length && !timer) timer = schedule(() => { timer = null; flush(); }, 30000);
    }
  }

  /** first_launch once per install; app_open at most every 30 minutes. */
  function recordOpen() {
    if (isFirstLaunch && !safeGet(storage, `${INSTALL_KEY}.reported`)) {
      track('first_launch');
      safeSet(storage, `${INSTALL_KEY}.reported`, '1');
    }
    const last = Number(safeGet(storage, LAST_OPEN_KEY)) || 0;
    if (now() - last >= APP_OPEN_INTERVAL_MS) {
      safeSet(storage, LAST_OPEN_KEY, String(now()));
      track('app_open');
    }
  }

  /** A sign-in, counted once per actual Supabase sign-in (not per page load). */
  function recordLogin(user) {
    if (!user?.id) return false;
    const key = `${user.id}|${user.last_sign_in_at || ''}`;
    if (safeGet(storage, LAST_LOGIN_KEY) === key) return false;
    safeSet(storage, LAST_LOGIN_KEY, key);
    const provider = user.app_metadata?.provider;
    return track('login', { method: provider === 'google' ? 'google' : 'email' });
  }

  return { track, flush, recordOpen, recordLogin, installId, get pending() { return queue.length; } };
}
