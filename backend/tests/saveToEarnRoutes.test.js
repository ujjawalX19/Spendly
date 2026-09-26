/**
 * Save-to-Earn and sponsor partner access, end to end against the real app and
 * fake DB: starting, one-active, Pro templates, server-side judging once,
 * Victory Pot, XP and badges once, skipping, forged fields, cross-user and
 * cross-sponsor isolation, flags and account deletion.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const { addDays } = require('../lib/moneyStreak');

const OWNER_EMAIL = 'owner@vittova.test';
let t;
let owner;
test.before(async () => {
    t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL, CAMPAIGN_DASHBOARD_ENABLED: 'true' } });
    owner = t.db.addUser({ email: OWNER_EMAIL, role: 'admin' });
});
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    for (const k of ['SAVE_TO_EARN_ENABLED', 'PRO_CHALLENGES_ENABLED', 'SPONSOR_DASHBOARD_ENABLED']) delete process.env[k];
    process.env.CAMPAIGN_DASHBOARD_ENABLED = 'true';
});

const DAY = 86400000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
const today = () => appTime.localDateKey(new Date());
const noonOn = (key) => new Date(Date.parse(`${key}T06:30:00Z`)).toISOString();
const hub = (u) => t.request('GET', '/api/save-to-earn', { token: u.token });
const start = (u, template, extra = {}) => t.request('POST', '/api/save-to-earn/challenges', { token: u.token, body: { template, ...extra } });
const free = () => t.db.addUser();
const pro = () => t.db.addUser({ is_pro: true, pro_expires_at: iso(30) });

function addExpense(user, key, amount, description = 'Canteen lunch', category = 'Food') {
    t.db.tables.expenses = [...(t.db.tables.expenses || []), { id: crypto.randomUUID(), user_id: user.id, amount, category, description, occurred_at: noonOn(key), created_at: new Date().toISOString() }];
}

/** A no-food-delivery challenge that started 10 days ago, fully logged, with 8 weeks of history before it. */
function finishedChallenge(user, { deliveryDuringRun = false } = {}) {
    const startsOn = addDays(today(), -9);
    const id = crypto.randomUUID();
    t.db.tables.money_challenges = [...(t.db.tables.money_challenges || []), {
        id, user_id: user.id, template: 'no_food_delivery_7', params: {}, duration_days: 7,
        enrolled_at: noonOn(addDays(today(), -10)), starts_on: startsOn, ends_on: addDays(startsOn, 6), status: 'active', created_at: new Date().toISOString(),
    }];
    for (let d = 1; d <= 56; d++) {
        addExpense(user, addDays(startsOn, -d), 100, 'Metro', 'Transport');
        if (d % 7 === 2 || d % 7 === 5) addExpense(user, addDays(startsOn, -d), 300, 'Swiggy order');
    }
    for (let i = 0; i < 7; i++) addExpense(user, addDays(startsOn, i), 150, deliveryDuringRun && i === 3 ? 'Zomato dinner' : 'Canteen lunch');
    return id;
}

const xpRows = (u) => (t.db.tables.money_xp_ledger || []).filter((r) => r.user_id === u.id && r.reason === 'challenge_completed');

test('Save-to-Earn needs sign-in and switches off with its flag', async () => {
    assert.equal((await t.request('GET', '/api/save-to-earn')).status, 401);
    assert.equal((await t.request('POST', '/api/save-to-earn/challenges', { body: { template: 'log_daily_7' } })).status, 401);
    const u = free();
    process.env.SAVE_TO_EARN_ENABLED = 'false';
    assert.equal((await hub(u)).status, 404);
    assert.equal((await start(u, 'log_daily_7')).status, 404);
});

test('a new free user sees the hub: level, empty Victory Pot, free and locked Pro challenges, a recommendation', async () => {
    const u = free();
    const res = await hub(u);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const h = res.body.saveToEarn;
    assert.equal(h.level.levelName, 'Money Starter');
    assert.equal(h.victoryPot.total, 0);
    assert.match(h.victoryPot.note, /Not cash/);
    assert.equal(h.active, null);
    assert.ok(h.templates.some((x) => !x.pro && !x.locked));
    assert.ok(h.templates.filter((x) => x.pro).every((x) => x.locked));
    assert.ok(h.recommendation && h.recommendation.reason);
    assert.equal(h.badges.filter((b) => b.earned).length, 0);
    assert.equal(h.sponsoredAvailable, false);
});

test('starting: free template works, only one at a time, Pro templates need Pro, input is strict', async () => {
    const u = free();
    const first = await start(u, 'no_food_delivery_7');
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.challenge.status, 'active');
    assert.equal(first.body.challenge.startsOn, addDays(today(), 1));
    assert.equal((await start(u, 'log_daily_7')).status, 409);
    assert.equal((await start(free(), 'weekend_budget_7')).body.code, 'PRO_REQUIRED');
    assert.equal((await start(pro(), 'weekend_budget_7')).status, 201);
    for (const bad of [{ template: 'nope' }, { template: 'log_daily_7', xp: 1000 }, { template: 'log_daily_7', status: 'completed' }, { template: 'log_daily_7', impact_inr: 99999 }, { template: 'log_daily_7', userId: u.id }]) {
        const res = await t.request('POST', '/api/save-to-earn/challenges', { token: free().token, body: bad });
        assert.equal(res.status, 400, JSON.stringify(bad));
    }
    process.env.PRO_CHALLENGES_ENABLED = 'false';
    assert.equal((await start(pro(), 'no_cab_weekend')).status, 404);
});

test('parallel starts create exactly one active challenge', async () => {
    const u = free();
    const results = await Promise.all(Array.from({ length: 5 }, () => start(u, 'log_daily_7')));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal((t.db.tables.money_challenges || []).filter((c) => c.user_id === u.id && c.status === 'active').length, 1);
});

test('a finished run is judged by the server once: completed, Victory Pot, XP and badge paid once', async () => {
    const u = free();
    finishedChallenge(u);
    const [a, b, c] = await Promise.all([hub(u), hub(u), hub(u)]);
    for (const r of [a, b, c]) assert.equal(r.status, 200);
    const h = (await hub(u)).body.saveToEarn;
    assert.equal(h.active, null);
    const done = h.history[0];
    assert.equal(done.status, 'completed');
    assert.equal(done.estimate.impact, 600);
    assert.match(done.estimate.explained, /estimate, not cash/);
    assert.equal(h.victoryPot.total, 600);
    assert.equal(xpRows(u).length, 1, 'XP paid once');
    assert.equal(xpRows(u)[0].xp, 75);
    assert.ok(h.badges.find((x) => x.key === 'first_challenge').earned);
    assert.ok(h.badges.find((x) => x.key === 'saved_500').earned);
    assert.equal((t.db.tables.user_badges || []).filter((r) => r.user_id === u.id && r.badge === 'first_challenge').length, 1);
    assert.equal(h.justFinished.status, 'completed');
    assert.ok(h.level.total >= 75);
});

test('a broken rule ends as "not completed": no XP, no Victory Pot, no shaming words', async () => {
    const u = free();
    finishedChallenge(u, { deliveryDuringRun: true });
    const h = (await hub(u)).body.saveToEarn;
    assert.equal(h.history[0].status, 'not_completed');
    assert.equal(h.history[0].estimate, undefined);
    assert.equal(h.victoryPot.total, 0);
    assert.equal(xpRows(u).length, 0);
    assert.doesNotMatch(JSON.stringify(h), /\bfail(ed|ure)?\b/i);
});

test('a finished challenge cannot be re-judged by deleting the expense that broke it', async () => {
    const u = free();
    finishedChallenge(u, { deliveryDuringRun: true });
    await hub(u);
    t.db.tables.expenses = t.db.tables.expenses.filter((e) => !(e.user_id === u.id && /Zomato/.test(e.description)));
    const h = (await hub(u)).body.saveToEarn;
    assert.equal(h.history[0].status, 'not_completed');
    assert.equal(xpRows(u).length, 0);
});

test('skip: only my own active challenge, no penalty, and I can start again', async () => {
    const a = free();
    const b = free();
    const id = (await start(a, 'log_daily_7')).body.challenge.id;
    assert.equal((await t.request('POST', `/api/save-to-earn/challenges/${id}/skip`, { token: b.token })).status, 404);
    assert.equal((await t.request('POST', `/api/save-to-earn/challenges/${id}/skip`, { token: a.token, body: { status: 'completed' } })).status, 400);
    assert.equal((await t.request('POST', `/api/save-to-earn/challenges/${id}/skip`, { token: a.token })).status, 200);
    assert.equal((await t.request('POST', `/api/save-to-earn/challenges/${id}/skip`, { token: a.token })).status, 404, 'skipping twice does nothing');
    assert.equal((await start(a, 'no_impulse_5')).status, 201);
    assert.equal(xpRows(a).length, 0);
});

test("user B never sees user A's challenges, estimates or badges", async () => {
    const a = free();
    finishedChallenge(a);
    await hub(a);
    const hb = (await hub(free())).body.saveToEarn;
    assert.equal(hb.history.length, 0);
    assert.equal(hb.victoryPot.total, 0);
    assert.equal(hb.badges.filter((x) => x.earned).length, 0);
    const other = await t.request('GET', `/api/save-to-earn?userId=${a.id}`, { token: free().token });
    assert.equal(other.body.saveToEarn.history.length, 0);
});

test('free history shows the last 5; Pro shows more', async () => {
    const u = free();
    const p = pro();
    for (const who of [u, p]) {
        for (let i = 0; i < 7; i++) {
            t.db.tables.money_challenges.push({ id: crypto.randomUUID(), user_id: who.id, template: 'log_daily_7', params: {}, duration_days: 7, enrolled_at: iso(-40 + i), starts_on: addDays(today(), -39 + i), ends_on: addDays(today(), -33 + i), status: 'skipped', judged_at: iso(-30 + i), created_at: iso(-40 + i) });
        }
    }
    const hu = (await hub(u)).body.saveToEarn;
    assert.equal(hu.history.length, 5);
    assert.equal(hu.historyLimited, true);
    assert.equal((await hub(p)).body.saveToEarn.history.length, 7);
});

test('deleting the account removes challenges and badges', async () => {
    const u = free();
    finishedChallenge(u);
    await hub(u);
    const del = await t.request('DELETE', '/api/account', { token: u.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    assert.equal(del.status, 200);
    assert.equal((t.db.tables.money_challenges || []).filter((c) => c.user_id === u.id).length, 0);
    assert.equal((t.db.tables.user_badges || []).filter((c) => c.user_id === u.id).length, 0);
});

// ─── Sponsor partner access ────────────────────────────────────────────────

async function sponsorWithCampaign(name) {
    const s = await t.request('POST', '/api/admin/campaigns/sponsors', { token: owner.token, body: { name } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    const c = await t.request('POST', '/api/admin/campaigns', { token: owner.token, body: {
        sponsorId: s.body.sponsor.id, name: `${name} food challenge`, challengeType: 'no_food_delivery', durationDays: 7, params: {},
        rewardLabel: '₹200 voucher', rewardValueInr: 200, voucherExpiry: addDays(today(), 60), startsAt: iso(-1), endsAt: iso(30),
        eligibility: 'Vittova Pro members in India.', terms: 'One reward per person. Rewards are given in the order challenges are completed.',
    } });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const id = c.body.campaign.id;
    await t.request('POST', `/api/admin/campaigns/${id}/vouchers`, { token: owner.token, body: { codes: ['CODEX-1', 'CODEX-2'] } });
    await t.request('POST', `/api/admin/campaigns/${id}/status`, { token: owner.token, body: { status: 'scheduled' } });
    return { sponsorId: s.body.sponsor.id, campaignId: id };
}

test('partner access: off by default, members only, own sponsor only, aggregated figures only', async () => {
    const brandA = await sponsorWithCampaign(`BrandA ${crypto.randomUUID().slice(0, 5)}`);
    const brandB = await sponsorWithCampaign(`BrandB ${crypto.randomUUID().slice(0, 5)}`);
    const viewer = t.db.addUser({ email: 'viewer@brand-a.test' });
    const manager = t.db.addUser({ email: 'manager@brand-a.test' });
    const nobody = t.db.addUser();

    assert.equal((await t.request('GET', '/api/partner/campaigns', { token: viewer.token })).status, 404, 'flag off');
    process.env.SPONSOR_DASHBOARD_ENABLED = 'true';

    // Only the owner can grant access.
    assert.equal((await t.request('POST', `/api/admin/campaigns/sponsors/${brandA.sponsorId}/members`, { token: viewer.token, body: { userId: viewer.id, role: 'campaign_manager' } })).status, 403);
    assert.equal((await t.request('POST', `/api/admin/campaigns/sponsors/${brandA.sponsorId}/members`, { token: owner.token, body: { userId: viewer.id, role: 'sponsor_viewer' } })).status, 201);
    assert.equal((await t.request('POST', `/api/admin/campaigns/sponsors/${brandA.sponsorId}/members`, { token: owner.token, body: { userId: manager.id, role: 'campaign_manager' } })).status, 201);

    assert.equal((await t.request('GET', '/api/partner/campaigns', { token: nobody.token })).status, 403);
    const list = await t.request('GET', '/api/partner/campaigns', { token: viewer.token });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.campaigns.map((c) => c.id), [brandA.campaignId]);
    assert.doesNotMatch(list.text, /CODEX|user_id|email|@|amount|description|category/i);
    assert.match(list.body.campaigns[0].report.note, /Aggregate/);

    // A viewer cannot change anything; a manager can pause/resume only their own sponsor's campaign.
    const pause = (u, id) => t.request('POST', `/api/partner/campaigns/${id}/status`, { token: u.token, body: { action: 'pause' } });
    assert.equal((await pause(viewer, brandA.campaignId)).status, 403);
    assert.equal((await pause(manager, brandB.campaignId)).status, 404, 'another sponsor looks like not found');
    assert.equal((await pause(manager, brandA.campaignId)).status, 200);
    assert.equal((await t.request('POST', `/api/partner/campaigns/${brandA.campaignId}/status`, { token: manager.token, body: { action: 'resume' } })).status, 200);
    assert.equal((await t.request('POST', `/api/partner/campaigns/${brandA.campaignId}/status`, { token: manager.token, body: { status: 'archived' } })).status, 400);
    assert.equal((await t.request('PATCH', `/api/admin/campaigns/${brandA.campaignId}`, { token: manager.token, body: { rewardValueInr: 99999 } })).status, 403, 'partners cannot edit rewards');
});
