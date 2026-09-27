/**
 * Age-aware accounts: the age rules (lib/ageAccess) and the server gates.
 * Under 18 is blocked while MINOR_ACCESS_ENABLED is off (the default); when on,
 * a guardian's consent must be verified by the owner first, and adult-only
 * features stay closed. Analytics are never linked to an under-18 account.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');
const age = require('../lib/ageAccess');

const NOW = new Date('2026-09-27T12:00:00+05:30');

test('age counts a birthday from the month after the birth month (never early)', () => {
    assert.equal(age.ageFrom('2008-09', NOW), 17);
    assert.equal(age.ageFrom('2008-08', NOW), 18);
    assert.equal(age.ageFrom('2011-01', NOW), 15);
    assert.equal(age.ageFrom('bad', NOW), null);
    assert.equal(age.ageFrom(null, NOW), null);
});

test('only a real, past month within 100 years is accepted', () => {
    assert.equal(age.validBirthYearMonth('2000-02', NOW), true);
    assert.equal(age.validBirthYearMonth('2026-10', NOW), false, 'future');
    assert.equal(age.validBirthYearMonth('1900-01', NOW), false, 'over 100');
    assert.equal(age.validBirthYearMonth('2000-13', NOW), false);
    assert.equal(age.validBirthYearMonth('2000-1', NOW), false);
});

test('experiences: adults full; under 18 blocked by default; with the switch on, consent first', () => {
    delete process.env.MINOR_ACCESS_ENABLED;
    assert.equal(age.experienceFor({ birth_year_month: '2000-01' }, null, NOW).experience, 'adult');
    assert.equal(age.experienceFor({}, null, NOW).experience, 'adult', 'not given yet (older accounts)');
    assert.equal(age.experienceFor({ birth_year_month: '2009-01' }, null, NOW).experience, 'minor_blocked');
    process.env.MINOR_ACCESS_ENABLED = 'true';
    assert.equal(age.experienceFor({ birth_year_month: '2009-01' }, null, NOW).experience, 'minor_pending');
    assert.equal(age.experienceFor({ birth_year_month: '2009-01' }, { status: 'pending' }, NOW).experience, 'minor_pending');
    assert.equal(age.experienceFor({ birth_year_month: '2009-01' }, { status: 'verified' }, NOW).experience, 'minor');
    assert.equal(age.experienceFor({ birth_year_month: '2014-01' }, { status: 'verified' }, NOW).experience, 'minor_blocked', 'under 15 never');
    delete process.env.MINOR_ACCESS_ENABLED;
});

// ─── Routes ────────────────────────────────────────────────────────────────

const OWNER_EMAIL = 'owner@vittova.test';
let t;
let owner;
test.before(async () => { t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL } }); owner = t.db.addUser({ email: OWNER_EMAIL, role: 'admin' }); });
test.after(async () => { await t.close(); delete process.env.MINOR_ACCESS_ENABLED; });
test.beforeEach(async () => { await t.resetRateLimits(); delete process.env.MINOR_ACCESS_ENABLED; });

const setAge = (u, birthYearMonth) => t.request('POST', '/api/account/age', { token: u.token, body: { birthYearMonth } });
const minorYM = () => { const d = new Date(); return `${d.getFullYear() - 16}-01`; };

test('age is given once, month and year only, and cannot be re-answered', async () => {
    const u = t.db.addUser();
    assert.equal((await t.request('GET', '/api/account/age', { token: u.token })).body.age.ageKnown, false);
    for (const bad of [{ birthYearMonth: '2000-01-15' }, { birthYearMonth: '3000-01' }, { dob: '2000-01' }, { birthYearMonth: '2000-01', experience: 'adult' }]) {
        assert.equal((await t.request('POST', '/api/account/age', { token: u.token, body: bad })).status, 400, JSON.stringify(bad));
    }
    const ok = await setAge(u, '2000-03');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.age.experience, 'adult');
    assert.equal((await setAge(u, '2012-03')).status, 409, 'cannot change it to get another experience');
    const view = await t.request('GET', '/api/account/age', { token: u.token });
    assert.doesNotMatch(view.text, /2000-03/, 'the birth month is never echoed back');
});

test('an under-18 account is blocked from everything but its profile, age and deletion', async () => {
    const u = t.db.addUser();
    assert.equal((await setAge(u, minorYM())).body.age.experience, 'minor_blocked');
    for (const [method, url] of [['GET', '/api/expenses'], ['POST', '/api/expenses'], ['GET', '/api/save-to-earn'], ['POST', '/api/ai/invest-advice'], ['GET', '/api/money-streak'], ['GET', '/api/decisions/month-shape']]) {
        const res = await t.request(method, url, { token: u.token, body: method === 'POST' ? {} : undefined });
        assert.equal(res.status, 403, `${method} ${url}`);
        assert.equal(res.body.code, 'AGE_RESTRICTED');
    }
    assert.equal((await t.request('GET', '/api/account/age', { token: u.token })).status, 200);
    assert.equal((await t.request('GET', '/api/pro/status', { token: u.token })).status, 200);
    const del = await t.request('DELETE', '/api/account', { token: u.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    assert.equal(del.status, 200, 'deletion always works');
});

test('with minor access on: consent pending blocks; owner-verified consent opens the teen experience without adult-only features', async () => {
    process.env.MINOR_ACCESS_ENABLED = 'true';
    const u = t.db.addUser();
    assert.equal((await setAge(u, minorYM())).body.age.experience, 'minor_pending');
    assert.equal((await t.request('GET', '/api/expenses', { token: u.token })).body.code, 'GUARDIAN_CONSENT_REQUIRED');

    // Only the owner can record consent, and only for an under-18 account.
    assert.equal((await t.request('POST', `/api/admin/users/${u.id}/guardian-consent`, { token: u.token, body: { status: 'verified', method: 'support_verified' } })).status, 403);
    const adult = t.db.addUser();
    await setAge(adult, '1999-05');
    assert.equal((await t.request('POST', `/api/admin/users/${adult.id}/guardian-consent`, { token: owner.token, body: { status: 'verified', method: 'support_verified' } })).status, 409);
    assert.equal((await t.request('POST', `/api/admin/users/${u.id}/guardian-consent`, { token: owner.token, body: { status: 'verified', method: 'support_verified' } })).status, 200);

    assert.equal((await t.request('GET', '/api/expenses', { token: u.token })).status, 200, 'teen can track spending');
    assert.equal((await t.request('GET', '/api/save-to-earn', { token: u.token })).status, 200, 'habits and challenges are fine');
    for (const [method, url, body] of [['GET', '/api/decisions/safe-to-invest'], ['POST', '/api/decisions/sip-stress-test', { monthlyAmount: 500 }], ['POST', '/api/pro/verify-purchase', {}], ['GET', '/api/subscription-audit']]) {
        const res = await t.request(method, url, { token: u.token, body });
        assert.equal(res.status, 403, `${method} ${url}`);
        assert.equal(res.body.code, 'ADULTS_ONLY');
    }

    // Investing questions: fixed education answer, no model call, no personal figures.
    t.gemini.calls = [];
    const ai = await t.request('POST', '/api/ai/invest-advice', { token: u.token, body: { query: 'Where should I invest ₹2,000 a month?' } });
    assert.equal(ai.status, 200);
    assert.match(ai.body.reply, /General education only/);
    assert.match(ai.body.reply, /parent or guardian/);
    assert.equal(t.gemini.calls.length, 0);

    // Usage events are not linked to the account.
    const events = (t.db.tables.app_events || []).filter((e) => e.user_id === u.id);
    assert.equal(events.length, 0);

    // Revoking consent blocks again.
    assert.equal((await t.request('POST', `/api/admin/users/${u.id}/guardian-consent`, { token: owner.token, body: { status: 'revoked', method: 'support_verified' } })).status, 200);
    assert.equal((await t.request('GET', '/api/expenses', { token: u.token })).status, 403);
});

test('adults are unaffected, including accounts that have not given an age yet', async () => {
    const old = t.db.addUser();
    assert.equal((await t.request('GET', '/api/expenses', { token: old.token })).status, 200);
    const adult = t.db.addUser();
    await setAge(adult, '1998-11');
    assert.equal((await t.request('GET', '/api/decisions/safe-to-invest', { token: adult.token })).status, 200);
});
