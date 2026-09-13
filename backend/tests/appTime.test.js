const test = require('node:test');
const assert = require('node:assert/strict');

const T = require('../lib/appTime');

const IST = 'Asia/Kolkata';

// Every case below pins an explicit UTC instant so the assertions hold
// regardless of the machine's own timezone. `TZ=UTC` and `TZ=America/New_York`
// must both pass.

test('zonedParts reads IST wall-clock, not the server clock', () => {
    // 2026-03-31T19:00:00Z is 2026-04-01 00:30 IST — already next month locally.
    const p = T.zonedParts(new Date('2026-03-31T19:00:00Z'), IST);
    assert.equal(p.year, 2026);
    assert.equal(p.month, 4);
    assert.equal(p.day, 1);
    assert.equal(p.hour, 0);
    assert.equal(p.minute, 30);
});

test('startOfMonth is midnight IST, which is 18:30 UTC the previous day', () => {
    const now = new Date('2026-04-15T10:00:00Z');
    assert.equal(T.startOfMonth(now, IST).toISOString(), '2026-03-31T18:30:00.000Z');
});

test('REGRESSION: spending in the first 5.5 IST hours of a month counts in that month', () => {
    // The original code used `new Date(y, m, 1)` on a UTC server, giving a
    // month start of 2026-04-01T00:00Z. An expense at 02:00 IST on 1 April
    // (2026-03-31T20:30Z) sorted *before* that boundary and silently vanished
    // from "this month's spending".
    const now = new Date('2026-04-15T10:00:00Z');
    const expenseAt = new Date('2026-03-31T20:30:00Z'); // 1 Apr 02:00 IST

    const buggyBoundary = new Date(Date.UTC(2026, 3, 1)); // what the old code produced
    assert.ok(expenseAt < buggyBoundary, 'precondition: the old boundary excluded this expense');

    assert.ok(
        expenseAt >= T.startOfMonth(now, IST),
        'the IST-aware boundary must include an expense made at 02:00 IST on the 1st'
    );
});

test('REGRESSION: after 18:30 UTC the local day has already advanced', () => {
    // 2026-04-15T19:00:00Z is 16 April 00:30 IST.
    const now = new Date('2026-04-15T19:00:00Z');
    assert.equal(now.getUTCDate(), 15, 'precondition: UTC still says the 15th');
    assert.equal(T.dayOfMonth(now, IST), 16, 'IST says the 16th');
    assert.equal(T.localDateKey(now, IST), '2026-04-16');
});

test('daysInMonth and daysRemainingInMonth use the local month', () => {
    const feb2028 = new Date('2028-02-10T06:00:00Z'); // leap year
    assert.equal(T.daysInMonth(feb2028, IST), 29);
    assert.equal(T.daysRemainingInMonth(feb2028, IST), 29 - 10 + 1);

    // Last day of the month still leaves one day (today) to spend.
    const lastDay = new Date('2026-04-30T12:00:00Z');
    assert.equal(T.daysRemainingInMonth(lastDay, IST), 1);

    // Late evening IST on the last day rolls into the next month locally.
    const rollover = new Date('2026-04-30T19:00:00Z'); // 1 May 00:30 IST
    assert.equal(T.dayOfMonth(rollover, IST), 1);
    assert.equal(T.daysRemainingInMonth(rollover, IST), 31);
});

test('daysRemainingInMonth never returns 0, so per-day division is safe', () => {
    for (let d = 1; d <= 31; d++) {
        const iso = `2026-01-${String(d).padStart(2, '0')}T12:00:00Z`;
        assert.ok(T.daysRemainingInMonth(new Date(iso), IST) >= 1);
    }
});

test('calendarDaysBetween counts calendar days, not elapsed hours', () => {
    // Two hours apart in wall-clock time, but two different calendar days.
    const lateNight = new Date('2026-04-15T17:40:00Z'); // 15 Apr 23:10 IST
    const afterMidnight = new Date('2026-04-15T19:40:00Z'); // 16 Apr 01:10 IST
    assert.equal(T.calendarDaysBetween(lateNight, afterMidnight, IST), 1);

    // Nearly a full day apart, but the same calendar day.
    const earlyMorning = new Date('2026-04-15T19:00:00Z'); // 16 Apr 00:30 IST
    const lateEvening = new Date('2026-04-16T17:00:00Z'); // 16 Apr 22:30 IST
    assert.equal(T.calendarDaysBetween(earlyMorning, lateEvening, IST), 0);

    assert.equal(T.calendarDaysBetween(afterMidnight, lateNight, IST), -1);
});

test('REGRESSION: an evening-then-next-evening streak increments by exactly one day', () => {
    // A user who logs at 23:10 IST and again at 23:10 IST the next night.
    // Under the old UTC day math both fell inside a single UTC day for part of
    // the year, so the streak stalled.
    const day1 = new Date('2026-04-15T17:40:00Z');
    const day2 = new Date('2026-04-16T17:40:00Z');
    assert.equal(T.calendarDaysBetween(day1, day2, IST), 1);
});

test('startOfNextMonth wraps the year correctly', () => {
    const dec = new Date('2026-12-20T06:00:00Z');
    assert.equal(T.startOfNextMonth(dec, IST).toISOString(), '2026-12-31T18:30:00.000Z');
    assert.equal(T.zonedParts(T.startOfNextMonth(dec, IST), IST).year, 2027);
});

test('startOfMonthsAgo walks back across a year boundary', () => {
    const now = new Date('2026-02-10T06:00:00Z');
    const fourAgo = T.startOfMonthsAgo(4, now, IST);
    const p = T.zonedParts(fourAgo, IST);
    assert.equal(p.year, 2025);
    assert.equal(p.month, 10);
    assert.equal(p.day, 1);
    assert.equal(p.hour, 0);
});

test('month boundaries are exact: the instant itself is inside, one ms before is not', () => {
    const now = new Date('2026-07-09T04:00:00Z');
    const start = T.startOfMonth(now, IST);
    assert.equal(T.localMonthKey(start, IST), '2026-07');
    assert.equal(T.localMonthKey(new Date(start.getTime() - 1), IST), '2026-06');
});

test('round-trip: zonedTimeToUtc and zonedParts are inverses', () => {
    for (const [y, m, d, h] of [[2026, 1, 1, 0], [2026, 6, 15, 13], [2028, 2, 29, 23]]) {
        const instant = T.zonedTimeToUtc(y, m, d, h, 0, 0, IST);
        const p = T.zonedParts(instant, IST);
        assert.deepEqual([p.year, p.month, p.day, p.hour], [y, m, d, h]);
    }
});

test('the module still behaves for a zone that observes DST', () => {
    const NY = 'America/New_York';
    // 2026-03-08 is the US spring-forward date; 02:00 local does not exist.
    const start = T.startOfDay(new Date('2026-03-08T18:00:00Z'), NY);
    assert.equal(T.zonedParts(start, NY).day, 8);
    assert.equal(T.zonedParts(start, NY).hour, 0);
    assert.equal(T.calendarDaysBetween(
        new Date('2026-03-07T18:00:00Z'),
        new Date('2026-03-08T18:00:00Z'),
        NY
    ), 1);
});
