/**
 * offlineQueue — mission actions taken without a connection (v1.14).
 *
 * A tap that cannot reach the server (no signal, server waking up) is kept on
 * the phone with its own event id and sent later: when the connection comes
 * back, when the app returns to the foreground, and every minute while it is
 * open. The queue survives closing and restarting the app.
 *
 *   - The server decides everything. A queued item carries only what the
 *     user did (which mission, which goal, how much they put aside) and an id;
 *     never XP, Points, progress or a result.
 *   - The same tap is never sent as two actions: each item has a unique event
 *     id the server de-duplicates on (check-ins, goal contributions), and the
 *     queue itself keeps one item per action and day.
 *   - Day-bound actions (a no-spend day, a mission check-in) carry the IST day
 *     they were made on. If that day has ended by the time they reach the
 *     server, the server refuses them (DAY_ENDED) and the item is marked
 *     expired, so a late sync can never change a finished day.
 *   - Rewards only appear once the server has accepted the action; until then
 *     the app shows the item as "waiting to sync".
 *
 * Storage is this device's localStorage, per signed-in account.
 */

const KEY = 'vittova.offlineQueue.v1';
const MAX_ITEMS = 50;
const MAX_ATTEMPTS = 20;
/** Finished items stay briefly so the app can tell the user what happened. */
const KEEP_FINISHED_MS = 2 * 24 * 3600 * 1000;

export const KINDS = {
  no_spend: { path: () => '/money-streak/no-spend', method: 'POST', dayBound: true, label: 'No-spend day' },
  checkin: { path: () => '/money-streak/checkin', method: 'POST', dayBound: true, label: 'Mission check-in' },
  goal_contribution: { path: (i) => `/goals/${i.goalId}/contributions`, method: 'POST', dayBound: false, label: 'Goal contribution' },
};

/** 'YYYY-MM-DD' in India time: mission days are IST calendar days. */
export function istDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function newEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues (older WebViews).
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readAll(storage) {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeAll(storage, all) {
  try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or unavailable */ }
}

/** The queue for one account. `storage` and `now` are injectable for tests. */
export function createQueue(userId, { storage = defaultStorage(), now = () => Date.now() } = {}) {
  const owner = String(userId || 'signed-out');
  const load = () => (readAll(storage)[owner] || []).filter((i) => i && KINDS[i.kind]);
  const save = (items) => {
    const all = readAll(storage);
    const cutoff = now() - KEEP_FINISHED_MS;
    all[owner] = items.filter((i) => i.status === 'pending' || (i.finishedAt || 0) > cutoff).slice(-MAX_ITEMS);
    writeAll(storage, all);
  };
  /** Two taps of the same action on the same day are one item. */
  const sameAction = (a, b) => a.kind === b.kind && a.dateKey === b.dateKey
    && (a.kind === 'no_spend' || (a.kind === 'checkin' && a.body?.mission === b.body?.mission)
      || (a.kind === 'goal_contribution' && a.body?.clientRef === b.body?.clientRef));

  return {
    items: load,
    pending: () => load().filter((i) => i.status === 'pending'),

    /**
     * Keep an action to send later. Returns the stored item (the existing one
     * if the same action is already waiting).
     * @param {'no_spend'|'checkin'|'goal_contribution'} kind
     * @param {object} body       what the user did (no rewards, ever)
     * @param {object} [extra]    { goalId } for contributions
     */
    enqueue(kind, body = {}, extra = {}) {
      if (!KINDS[kind]) throw new Error(`Unknown queued action ${kind}`);
      const items = load();
      const dateKey = istDateKey(new Date(now()));
      const eventId = body.eventId || body.clientRef || newEventId();
      let payload;
      if (kind === 'no_spend') payload = { eventId, dateKey };
      else if (kind === 'checkin') payload = { mission: body.mission, eventId, dateKey };
      // A contribution counts on the day it was made, whenever it syncs.
      else payload = { amountInr: body.amountInr, clientRef: eventId, contributedOn: body.contributedOn || dateKey, ...(body.note ? { note: body.note } : {}) };
      const item = {
        id: eventId,
        kind,
        dateKey,
        goalId: extra.goalId || null,
        body: payload,
        createdAt: now(),
        attempts: 0,
        status: 'pending',
        lastError: null,
      };
      const dupe = items.find((i) => i.status === 'pending' && (i.id === item.id || sameAction(i, item)));
      if (dupe) return dupe;
      items.push(item);
      save(items);
      return item;
    },

    /**
     * Send what is waiting, oldest first.
     * @param {(item) => Promise<{ok:boolean, status?:number, code?:string, message?:string}>} send
     * @returns {Promise<{sent:number, expired:number, failed:number, waiting:number}>}
     */
    async flush(send) {
      const items = load();
      let sent = 0;
      let expired = 0;
      let failed = 0;
      for (const item of items) {
        if (item.status !== 'pending') continue;
        let result;
        try {
          result = await send(item);
        } catch (err) {
          result = { ok: false, status: err?.status, code: err?.data?.code, message: err?.message, offline: !err?.status };
        }
        item.attempts += 1;
        if (result.ok) {
          item.status = 'done';
          item.finishedAt = now();
          sent += 1;
        } else if (result.code === 'DAY_ENDED') {
          item.status = 'expired';
          item.finishedAt = now();
          item.lastError = 'That day ended before it could sync, so it did not count.';
          expired += 1;
        } else if (isRetryable(result) && item.attempts < MAX_ATTEMPTS) {
          item.lastError = 'Waiting for a connection';
          // Keep order: later items wait behind this one.
          save(items);
          return { sent, expired, failed, waiting: items.filter((i) => i.status === 'pending').length };
        } else {
          item.status = 'failed';
          item.finishedAt = now();
          item.lastError = result.message || 'The server did not accept this.';
          failed += 1;
        }
      }
      save(items);
      return { sent, expired, failed, waiting: items.filter((i) => i.status === 'pending').length };
    },

    /** Forget finished items the user has seen. */
    clearFinished() {
      save(load().filter((i) => i.status === 'pending'));
    },

    /** On sign-out: this account's queue goes with it. */
    clear() {
      const all = readAll(storage);
      delete all[owner];
      writeAll(storage, all);
    },
  };
}

/** No usable response, or the server is waking up: try again later. */
export function isRetryable(result) {
  if (result.offline) return true;
  const s = Number(result.status);
  return !s || s === 408 || s === 429 || s >= 500;
}

/** The request for a queued item. */
export function requestFor(item) {
  const kind = KINDS[item.kind];
  return { path: kind.path(item), method: kind.method, body: item.body };
}

// ─── The last mission state, for showing while offline ──────────────────────

const CACHE_KEY = 'vittova.missionCache.v1';

export function cacheMissionState(userId, moneyStreak, { storage = defaultStorage(), now = () => Date.now() } = {}) {
  if (!userId || !moneyStreak) return;
  try { storage?.setItem(CACHE_KEY, JSON.stringify({ userId, savedAt: now(), moneyStreak })); } catch { /* unavailable */ }
}

/**
 * The cached Money Streak for this account, if it is from today (IST).
 * Yesterday's mission is never shown as today's.
 */
export function cachedMissionState(userId, { storage = defaultStorage(), now = () => Date.now() } = {}) {
  try {
    const c = JSON.parse(storage?.getItem(CACHE_KEY) || 'null');
    if (!c || c.userId !== userId || !c.moneyStreak?.today) return null;
    if (c.moneyStreak.today.dateKey !== istDateKey(new Date(now()))) return null;
    return { ...c.moneyStreak, offline: true, savedAt: c.savedAt };
  } catch { return null; }
}

export function clearMissionCache({ storage = defaultStorage() } = {}) {
  try { storage?.removeItem(CACHE_KEY); } catch { /* unavailable */ }
}
