/**
 * alerts — money alerts on this phone: budget limits, unusual spending, bills,
 * savings goals and a weekly summary. Each category is off until chosen. The
 * server says what is due (GET /api/planning/alerts); the phone schedules it
 * locally (plugins/DebitReminders, group "alert"). No push service.
 */
import { DebitReminders } from '../plugins/DebitReminders';
import { apiJson } from './apiConfig';
import { remindersSupported } from './debitReminders';

const PREFS_KEY = 'vittova.alerts.v1';
const SENT_KEY = 'vittova.alerts.sent.v1';

export const ALERT_KINDS = [
  { id: 'budget', label: 'Budget limits', hint: 'At 80% and 100% of a budget' },
  { id: 'unusual', label: 'Unusual spending', hint: 'A payment well above your usual amount' },
  { id: 'bill', label: 'Upcoming bills', hint: 'The day before a bill you added' },
  { id: 'savings', label: 'Savings goals', hint: 'A week before a goal date' },
  { id: 'weekly', label: 'Weekly summary', hint: 'Sunday evening' },
];

function read(key, fallback) {
  try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const alertPrefs = () => read(PREFS_KEY, {});

/** Chosen categories only, and each once: "soon" alerts must not repeat on every app open. */
export function chooseAlerts(alerts, prefs, sent, now = Date.now()) {
  return alerts
    .filter((a) => prefs[a.kind] === true && !sent.includes(a.id))
    .map((a) => ({ ...a, notifyAt: Date.parse(a.notifyAt) }))
    .filter((a) => a.notifyAt > now)
    .sort((a, b) => a.notifyAt - b.notifyAt)
    .slice(0, 20);
}

const IMMEDIATE_MS = 5 * 60 * 1000;

export async function syncAlerts(session) {
  if (!remindersSupported() || !session?.access_token) return;
  const prefs = alertPrefs();
  if (!Object.values(prefs).some(Boolean)) {
    await DebitReminders.cancelAll({ group: 'alert' }).catch(() => {});
    return;
  }
  const { alerts } = await apiJson('/planning/alerts', { session });
  const sent = read(SENT_KEY, []);
  const list = chooseAlerts(alerts, prefs, sent);
  await DebitReminders.schedule({
    group: 'alert',
    reminders: list.map(({ id, title, body, notifyAt }) => ({ id, title, body, notifyAt })),
  });
  // Scheduled for a minute from now: counted as sent, so reopening doesn't repeat it.
  const firing = list.filter((a) => a.notifyAt - Date.now() < IMMEDIATE_MS).map((a) => a.id);
  if (firing.length) write(SENT_KEY, [...sent, ...firing].slice(-200));
}

/** @returns {'on'|'off'|'denied'} */
export async function setAlertKind(kind, on, session) {
  if (on) {
    const { display } = await DebitReminders.requestPermission();
    if (display !== 'granted') return 'denied';
  }
  write(PREFS_KEY, { ...alertPrefs(), [kind]: on });
  await syncAlerts(session).catch(() => {});
  return on ? 'on' : 'off';
}

export async function clearAlertsForSignOut() {
  write(PREFS_KEY, {});
  write(SENT_KEY, []);
  if (remindersSupported()) await DebitReminders.cancelAll({ group: 'alert' }).catch(() => {});
}
