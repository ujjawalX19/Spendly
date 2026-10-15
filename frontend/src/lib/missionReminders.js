/**
 * missionReminders — the phone side of daily mission and weekly recap
 * reminders (v1.14). What to schedule is decided in lib/missionReminderPlan.
 *
 * LOCAL notifications only (plugins/DebitReminders, group "mission"): nothing
 * goes to a push service or any third party. Vittova has no server push, so
 * the plan is refreshed whenever the app loads the Money Streak; after a
 * reboot the phone re-arms the last plan by itself (expired ones are
 * dropped). Debit reminders are a separate group and are never touched here.
 * Android only.
 */

import { DebitReminders } from '../plugins/DebitReminders';
import { remindersSupported } from './debitReminders';
import { planMissionReminders, readPrefs, writePrefs } from './missionReminderPlan';

export { readPrefs, DEFAULT_PREFS } from './missionReminderPlan';

export const missionRemindersSupported = () => remindersSupported();

/** Replace the scheduled mission reminders with the plan for `streak`. */
export async function syncMissionReminders(streak, { now = Date.now() } = {}) {
  if (!missionRemindersSupported() || !streak) return 0;
  const prefs = readPrefs();
  if (!prefs.enabled) return 0;
  const reminders = planMissionReminders({ streak, prefs, now });
  const { scheduled } = await DebitReminders.schedule({ group: 'mission', reminders });
  return scheduled;
}

/** @returns {Promise<'on'|'denied'|'unsupported'>} */
export async function turnMissionRemindersOn(streak) {
  if (!missionRemindersSupported()) return 'unsupported';
  const { display } = await DebitReminders.requestPermission();
  if (display !== 'granted') return 'denied';
  writePrefs({ ...readPrefs(), enabled: true });
  await syncMissionReminders(streak).catch(() => 0);
  return 'on';
}

export async function turnMissionRemindersOff() {
  writePrefs({ ...readPrefs(), enabled: false });
  if (missionRemindersSupported()) await DebitReminders.cancelAll({ group: 'mission' }).catch(() => {});
}

/** Change which reminders are wanted, then re-plan. */
export async function updateMissionReminderPrefs(patch, streak) {
  const next = { ...readPrefs(), ...patch };
  writePrefs(next);
  if (!missionRemindersSupported()) return next;
  if (!next.enabled) await DebitReminders.cancelAll({ group: 'mission' }).catch(() => {});
  else await syncMissionReminders(streak).catch(() => 0);
  return next;
}

/** On sign-out: no reminders for an account that is no longer on this phone. */
export async function clearMissionRemindersForSignOut() {
  if (missionRemindersSupported()) await DebitReminders.cancelAll({ group: 'mission' }).catch(() => {});
}
