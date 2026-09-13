const test = require('node:test');
const assert = require('node:assert/strict');

const { advanceStreak, streakStatus } = require('../lib/streak');

// IST wall-clock times, expressed as the UTC instants they correspond to.
const ist = (isoLocal) => {
    // '2026-04-15 23:10' IST -> UTC
    const [d, t] = isoLocal.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = t.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};

test('the first ever log starts the streak at 1', () => {
    const r = advanceStreak({ streak_current: 0, streak_longest: 0, streak_last_log: null }, ist('2026-04-15 10:00'));
    assert.equal(r.streak_current, 1);
    assert.equal(r.streak_longest, 1);
    assert.equal(r.incremented, true);
});

test('logging twice on the same day does not inflate the streak', () => {
    const profile = { streak_current: 5, streak_longest: 9, streak_last_log: ist('2026-04-15 09:00').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-15 22:00'));
    assert.equal(r.streak_current, 5);
    assert.equal(r.incremented, false);
    assert.equal(r.streak_longest, 9);
});

test('logging the next day increments by one', () => {
    const profile = { streak_current: 5, streak_longest: 9, streak_last_log: ist('2026-04-15 09:00').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-16 09:00'));
    assert.equal(r.streak_current, 6);
});

test('REGRESSION: 23:10 then 23:10 the next night counts as two days', () => {
    // Under the previous UTC day math these two instants shared a UTC date
    // for part of the year, so the streak silently stalled.
    const profile = { streak_current: 3, streak_longest: 3, streak_last_log: ist('2026-04-15 23:10').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-16 23:10'));
    assert.equal(r.streak_current, 4);
});

test('REGRESSION: 23:50 then 00:30 is a new day, not the same one', () => {
    const profile = { streak_current: 3, streak_longest: 3, streak_last_log: ist('2026-04-15 23:50').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-16 00:30'));
    assert.equal(r.streak_current, 4, 'forty minutes apart, but a day apart on the calendar');
});

test('a missed day resets the streak to 1', () => {
    const profile = { streak_current: 12, streak_longest: 12, streak_last_log: ist('2026-04-13 09:00').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-16 09:00'));
    assert.equal(r.streak_current, 1);
    assert.equal(r.streak_longest, 12, 'the record is kept');
});

test('longest is raised only when the current run beats it', () => {
    const profile = { streak_current: 9, streak_longest: 9, streak_last_log: ist('2026-04-15 09:00').toISOString() };
    assert.equal(advanceStreak(profile, ist('2026-04-16 09:00')).streak_longest, 10);
});

test('a corrupt or missing last_log does not throw', () => {
    for (const bad of [undefined, null, '', 'not-a-date', {}]) {
        const r = advanceStreak({ streak_current: 4, streak_longest: 4, streak_last_log: bad }, ist('2026-04-16 09:00'));
        assert.ok(r.streak_current >= 1);
    }
    assert.equal(advanceStreak(null, ist('2026-04-16 09:00')).streak_current, 1);
});

test('a last_log in the future does not reset or inflate the streak', () => {
    // Clock skew between the device and the server should not punish the user.
    const profile = { streak_current: 7, streak_longest: 7, streak_last_log: ist('2026-04-20 09:00').toISOString() };
    const r = advanceStreak(profile, ist('2026-04-16 09:00'));
    assert.equal(r.streak_current, 7);
    assert.equal(r.incremented, false);
});

test('status reflects what the user still has to do today', () => {
    const now = ist('2026-04-16 20:00');
    assert.equal(streakStatus(null, false, now), 'none');
    assert.equal(streakStatus(ist('2026-04-16 09:00'), true, now), 'active');
    assert.equal(streakStatus(ist('2026-04-15 09:00'), false, now), 'at_risk');
    assert.equal(streakStatus(ist('2026-04-15 09:00'), true, now), 'active');
    assert.equal(streakStatus(ist('2026-04-12 09:00'), false, now), 'broken');
});

test('status tolerates junk input', () => {
    assert.equal(streakStatus('not-a-date', false, new Date()), 'none');
    assert.equal(streakStatus(undefined, true, new Date()), 'none');
});
