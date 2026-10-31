/**
 * missionReminderPlan — which daily mission and weekly recap reminders to
 * schedule (v1.14). Pure: the Money Streak the app loaded, the user's
 * reminder settings and the time in; a list of reminders out. The phone side
 * is lib/missionReminders.js.
 *
 * Rules
 *  - Off until the user turns it on, and each kind can be switched off.
 *  - Times are India time (mission days are IST days), whatever the phone's
 *    time zone. Quiet hours (default 22:00–08:00) push a reminder to the end
 *    of quiet hours, or drop it if that is too late to matter.
 *  - Never for a mission that is done, on track or already missed today, and
 *    never worded to blame ("missed", "lose", "failed").
 *  - No amounts: a reminder can only be as fresh as the last time the app was
 *    opened, so each is worded to stay true later.
 *  - Every reminder expires (the end of its day), so a phone restarted late
 *    does not show yesterday's reminder.
 */

export const PREF_KEY = 'vittova.missionReminders.v1';

export const DEFAULT_PREFS = Object.freeze({
  enabled: false,
  daily: true,      // a new mission is ready (09:00)
  deadline: true,   // today's mission is still open (20:00)
  weekly: true,     // weekly goal progress (Thu or Sat, 19:00)
  recap: true,      // the weekly recap (Monday 10:00)
  quietStart: '22:00',
  quietEnd: '08:00',
});

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n) => String(n).padStart(2, '0');

export function readPrefs(storage = safeStorage()) {
  try {
    const p = JSON.parse(storage?.getItem(PREF_KEY) || 'null');
    if (!p || typeof p !== 'object') return { ...DEFAULT_PREFS };
    const out = { ...DEFAULT_PREFS };
    for (const k of ['enabled', 'daily', 'deadline', 'weekly', 'recap']) if (typeof p[k] === 'boolean') out[k] = p[k];
    for (const k of ['quietStart', 'quietEnd']) if (TIME.test(p[k] || '')) out[k] = p[k];
    return out;
  } catch { return { ...DEFAULT_PREFS }; }
}

export function writePrefs(prefs, storage = safeStorage()) {
  try { storage?.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* unavailable */ }
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// ─── India-time calendar ────────────────────────────────────────────────────

/** Epoch ms of `hh:mm` India time on IST day `key`. */
export function istAt(key, hh, mm = 0) {
  return Date.parse(`${key}T${pad(hh)}:${pad(mm)}:00+05:30`);
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(key) {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function istMinutes(epoch) {
  const t = new Date(epoch + 5.5 * 3600 * 1000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Whether `epoch` falls in quiet hours (a range that may cross midnight). */
export function inQuietHours(epoch, prefs) {
  const start = toMinutes(prefs.quietStart);
  const end = toMinutes(prefs.quietEnd);
  if (start === end) return false;
  const t = istMinutes(epoch);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Move a time out of quiet hours to the moment they end (India time). */
export function afterQuietHours(epoch, prefs) {
  if (!inQuietHours(epoch, prefs)) return epoch;
  const forward = ((toMinutes(prefs.quietEnd) - istMinutes(epoch)) + 1440) % 1440;
  return Math.floor(epoch / 60000) * 60000 + forward * 60000;
}

// ─── The plan ───────────────────────────────────────────────────────────────

/**
 * @param {object} a
 * @param {object} a.streak   moneyStreak from GET /api/money-streak
 * @param {object} a.prefs    readPrefs()
 * @param {number} a.now      epoch ms
 * @returns {Array<{id:string, kind:string, title:string, body:string, notifyAt:number, expiresAt:number}>}
 */
export function planMissionReminders({ streak, prefs, now = Date.now() }) {
  if (!prefs?.enabled || !streak?.today?.dateKey) return [];
  const today = streak.today.dateKey;
  const tomorrow = addDaysKey(today, 1);
  const endOf = (key) => istAt(addDaysKey(key, 1), 0, 0);
  const open = streak.today.status === 'to_do'; // done, on track or missed: nothing to remind about
  const title = String(streak.today.mission?.title || "Today's mission").replace(/[.!?]+$/, '');
  const out = [];
  const add = (kind, key, notifyAt, expiresAt, heading, body) => {
    const at = afterQuietHours(notifyAt, prefs);
    if (at <= now || at >= expiresAt) return;
    out.push({ id: `mission:${kind}:${key}`, kind, title: heading, body, notifyAt: at, expiresAt });
  };

  if (prefs.daily) {
    if (open) add('daily', today, istAt(today, 9), endOf(today), "Today's money mission", `${title}.`);
    add('daily', tomorrow, istAt(tomorrow, 9), endOf(tomorrow), 'A new money mission is ready', "Open Vittova to see today's mission.");
  }

  const eveningToday = prefs.deadline && open;
  if (eveningToday) {
    const current = Number(streak.current) || 0;
    const next = current + 1;
    const streakLine = next >= 7 && next % 7 === 0
      ? ` One more day makes a ${next}-day streak.`
      : current > 0 ? ` Your streak is ${current} day${current === 1 ? '' : 's'}.` : '';
    add('deadline', today, istAt(today, 20), endOf(today), 'Your mission is still open today', `${title}.${streakLine}`);
  }

  const w = streak.weekly;
  if (prefs.weekly && w && w.status !== 'over' && Number(w.activeDays) < Number(w.minActiveDays)) {
    const monday = addDaysKey(today, -weekday(today));
    const nextMonday = addDaysKey(monday, 7);
    const need = Number(w.minActiveDays) - Number(w.activeDays);
    for (const offset of [3, 5]) { // Thursday, Saturday
      const day = addDaysKey(monday, offset);
      if (day < today || istAt(day, 19) <= now) continue;
      if (day === today && eveningToday) continue; // one evening reminder a day at most
      if (need > 7 - offset) break; // no longer reachable this week: say nothing
      add('weekly', day, istAt(day, 19), istAt(nextMonday, 0), 'Weekly goal', `Log on ${need} more day${need === 1 ? '' : 's'} this week to reach your weekly goal.`);
      break;
    }
  }

  if (prefs.recap) {
    const monday = weekday(today) === 0 ? today : addDaysKey(today, 7 - weekday(today));
    add('recap', monday, istAt(monday, 10), endOf(monday), 'Your week in Vittova', "See last week's missions, XP and Points.");
  }

  return out.sort((a, b) => a.notifyAt - b.notifyAt);
}
