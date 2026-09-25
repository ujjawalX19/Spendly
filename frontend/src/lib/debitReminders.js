/**
 * debitReminders — the app side of "expected debit tomorrow" reminders.
 *
 * The server says which reminders to show (GET /api/subscription-audit →
 * reminders); the phone schedules them locally (plugins/DebitReminders).
 * Nothing is sent to a push service or any third party. Off until the user
 * turns it on; Android only.
 */

import { Capacitor } from '@capacitor/core';
import { DebitReminders } from '../plugins/DebitReminders';
import { track } from './telemetry';
import { apiJson } from './apiConfig';

const PREF_KEY = 'vittova.debitReminders.v1';

export const remindersSupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function remindersWanted() {
  try { return window.localStorage.getItem(PREF_KEY) === 'on'; } catch { return false; }
}

function setWanted(on) {
  try { window.localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

/** Replace every scheduled reminder with the server's current list. */
export async function scheduleReminders(reminders = []) {
  if (!remindersSupported() || !remindersWanted()) return 0;
  const list = reminders.map((r) => ({ id: r.id, title: r.title, body: r.body, notifyAt: Date.parse(r.notifyAt) })).filter((r) => Number.isFinite(r.notifyAt));
  const { scheduled } = await DebitReminders.schedule({ reminders: list });
  if (scheduled) track('debit_reminder_scheduled');
  return scheduled;
}

/**
 * Re-schedule from the server's current list. Called when the app opens, so
 * reminders come back after a reboot (Android drops alarms) and follow new or
 * changed recurring payments without visiting the audit screen. If the audit is
 * no longer available to this account (Pro ended, feature switched off), the
 * scheduled reminders are cleared; the user's on/off choice is kept.
 */
let refreshedFor = null; // once per app start per account, not on every screen change

export async function refreshReminders(session) {
  if (!remindersSupported() || !remindersWanted() || !session?.access_token) return;
  const userId = session.user?.id || 'unknown';
  if (refreshedFor === userId) return;
  refreshedFor = userId;
  try {
    const d = await apiJson('/subscription-audit', { session });
    await scheduleReminders(d.reminders || []);
  } catch (err) {
    if (err?.status === 403 || err?.status === 404) await DebitReminders.cancelAll().catch(() => {});
    // Network or server trouble: keep what is already scheduled.
  }
}

/** @returns {'on'|'denied'|'unsupported'} */
export async function turnRemindersOn(reminders) {
  if (!remindersSupported()) return 'unsupported';
  const { display } = await DebitReminders.requestPermission();
  if (display !== 'granted') return 'denied';
  setWanted(true);
  await scheduleReminders(reminders);
  return 'on';
}

export async function turnRemindersOff() {
  setWanted(false);
  if (remindersSupported()) await DebitReminders.cancelAll().catch(() => {});
}

/** When a reminder is tapped, open the audit. Returns an unsubscribe function. */
export function onReminderOpened(open) {
  if (!remindersSupported()) return () => {};
  const handle = DebitReminders.addListener('reminderOpened', ({ route }) => {
    track('debit_reminder_opened');
    open(route);
  });
  return () => { Promise.resolve(handle).then((h) => h?.remove?.()).catch(() => {}); };
}
