// Daily mission reminders (v1.14): planned from the loaded Money Streak, in
// India time, outside quiet hours, never for a finished mission, never with an
// amount or a word of blame, and each expiring with its day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planMissionReminders, DEFAULT_PREFS, afterQuietHours, inQuietHours, istAt, readPrefs } from '../src/lib/missionReminderPlan.js';

const here = dirname(fileURLToPath(import.meta.url));
const ON = { ...DEFAULT_PREFS, enabled: true };
// Thursday 15 October 2026.
const streak = (over = {}) => ({
  current: 6,
  today: { dateKey: '2026-10-15', status: 'to_do', mission: { title: 'Stay under ₹540 today' } },
  weekly: { activeDays: 2, minActiveDays: 4, status: 'on_track' },
  ...over,
});
const at = (hhmm, day = '2026-10-15') => Date.parse(`${day}T${hhmm}:00+05:30`);

test('nothing is planned until the user turns reminders on', () => {
  assert.deepEqual(planMissionReminders({ streak: streak(), prefs: DEFAULT_PREFS, now: at('07:00') }), []);
  assert.equal(readPrefs({ getItem: () => null }).enabled, false);
  assert.equal(readPrefs({ getItem: () => '{"enabled":true,"quietStart":"25:00"}' }).quietStart, '22:00', 'bad times fall back');
});

test('an open mission: morning, evening, weekly check and Monday recap', () => {
  const plan = planMissionReminders({ streak: streak(), prefs: ON, now: at('07:00') });
  // The weekly check skips Thursday evening (the mission reminder is that
  // evening) and goes to Saturday: one evening reminder a day at most.
  assert.deepEqual(plan.map((r) => r.id), [
    'mission:daily:2026-10-15', 'mission:deadline:2026-10-15', 'mission:daily:2026-10-16',
    'mission:weekly:2026-10-17', 'mission:recap:2026-10-19',
  ]);
  const byId = Object.fromEntries(plan.map((r) => [r.id, r]));
  assert.equal(byId['mission:weekly:2026-10-17'].notifyAt, at('19:00', '2026-10-17'));
  assert.match(byId['mission:weekly:2026-10-17'].body, /Log on 2 more days/);
  // With nothing open today, the weekly check comes on Thursday itself.
  const quiet = planMissionReminders({ streak: streak({ today: { dateKey: '2026-10-15', status: 'on_track', mission: { title: 'x' } } }), prefs: ON, now: at('07:00') });
  assert.ok(quiet.some((r) => r.id === 'mission:weekly:2026-10-15'));
  assert.equal(byId['mission:daily:2026-10-15'].notifyAt, at('09:00'));
  assert.equal(byId['mission:deadline:2026-10-15'].notifyAt, at('20:00'));
  assert.match(byId['mission:deadline:2026-10-15'].body, /One more day makes a 7-day streak/);
  assert.equal(byId['mission:recap:2026-10-19'].notifyAt, at('10:00', '2026-10-19'));
  // Every reminder ends with its day.
  assert.equal(byId['mission:daily:2026-10-15'].expiresAt, at('00:00', '2026-10-16'));
  for (const r of plan) assert.ok(r.notifyAt < r.expiresAt);
});

test('no reminders about a mission that is done, on track or already missed', () => {
  for (const status of ['done', 'on_track', 'missed']) {
    const plan = planMissionReminders({ streak: streak({ today: { dateKey: '2026-10-15', status, mission: { title: 'x' } } }), prefs: ON, now: at('07:00') });
    assert.ok(!plan.some((r) => r.id === 'mission:daily:2026-10-15' || r.kind === 'deadline'), status);
    assert.ok(plan.some((r) => r.id === 'mission:daily:2026-10-16'), 'tomorrow is still announced');
  }
});

test('past times are not scheduled; the plan is the same every time', () => {
  const late = planMissionReminders({ streak: streak(), prefs: ON, now: at('21:00') });
  assert.ok(!late.some((r) => r.id.endsWith(':2026-10-15')));
  const a = planMissionReminders({ streak: streak(), prefs: ON, now: at('07:00') });
  const b = planMissionReminders({ streak: streak(), prefs: ON, now: at('07:00') });
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((r) => r.id)).size, a.length, 'no duplicates');
});

test('quiet hours move a reminder to when they end, or drop it', () => {
  const prefs = { ...ON, quietStart: '19:00', quietEnd: '21:00' };
  assert.ok(inQuietHours(at('20:00'), prefs));
  assert.equal(afterQuietHours(at('20:00'), prefs), at('21:00'));
  const plan = planMissionReminders({ streak: streak(), prefs, now: at('07:00') });
  assert.equal(plan.find((r) => r.kind === 'deadline').notifyAt, at('21:00'));
  // Across midnight (default 22:00–08:00): a 09:00 reminder is untouched; one at 23:00 moves to 08:00.
  assert.equal(afterQuietHours(at('09:00'), ON), at('09:00'));
  assert.equal(afterQuietHours(at('23:00'), ON), at('08:00', '2026-10-16'));
  // A quiet window that swallows the rest of the day drops the evening reminder.
  const evening = planMissionReminders({ streak: streak(), prefs: { ...ON, quietStart: '18:00', quietEnd: '06:00' }, now: at('07:00') });
  assert.ok(!evening.some((r) => r.kind === 'deadline'));
});

test('each kind can be switched off; the weekly check only when still reachable', () => {
  const plan = planMissionReminders({ streak: streak(), prefs: { ...ON, daily: false, deadline: false, recap: false }, now: at('07:00') });
  assert.deepEqual(plan.map((r) => r.kind), ['weekly']);
  const over = planMissionReminders({ streak: streak({ weekly: { activeDays: 1, minActiveDays: 4, status: 'over' } }), prefs: ON, now: at('07:00') });
  assert.ok(!over.some((r) => r.kind === 'weekly'), 'no nudge once the week is over plan');
  const unreachable = planMissionReminders({ streak: streak({ today: { dateKey: '2026-10-17', status: 'to_do', mission: { title: 'x' } }, weekly: { activeDays: 0, minActiveDays: 4, status: 'on_track' } }), prefs: ON, now: at('07:00', '2026-10-17') });
  assert.ok(!unreachable.some((r) => r.kind === 'weekly'), 'four more days cannot fit in Saturday and Sunday');
});

test('times are India time whatever the phone says', () => {
  assert.equal(new Date(istAt('2026-10-15', 9)).toISOString(), '2026-10-15T03:30:00.000Z');
});

test('no amounts and no blame in any reminder', () => {
  const plan = planMissionReminders({ streak: streak(), prefs: ON, now: at('07:00') });
  for (const r of plan.filter((x) => x.kind !== 'deadline' && x.kind !== 'daily')) assert.doesNotMatch(`${r.title} ${r.body}`, /₹|\d{3,}/);
  for (const r of plan) assert.doesNotMatch(`${r.title} ${r.body}`, /\b(missed|lose|lost|failed|fail|hurry|last chance|don't break)\b/i);
  // The mission title is the user's own mission, shown as the server worded it.
  assert.match(plan.find((r) => r.kind === 'deadline').body, /^Stay under ₹540 today\./);
});

test('debit reminders are a separate group the mission code never cancels', () => {
  const src = readFileSync(join(here, '../src/lib/missionReminders.js'), 'utf8');
  for (const call of src.match(/DebitReminders\.(schedule|cancelAll)\([^)]*\)/g)) assert.match(call, /group: 'mission'/, call);
  const debit = readFileSync(join(here, '../src/lib/debitReminders.js'), 'utf8');
  assert.doesNotMatch(debit, /group: 'mission'/);
});
