/**
 * Sponsored challenges and the campaign dashboard, end to end against the real
 * app and fake DB: admin-only campaign management, enrolment, server-side
 * judging, fixed vouchers from a limited inventory, reveal, and the brand
 * data firewall.
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
    t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL, SPONSORED_CHALLENGES_ENABLED: 'true', CAMPAIGN_DASHBOARD_ENABLED: 'true' } });
    owner = t.db.addUser({ email: OWNER_EMAIL, role: 'admin' });
});
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    process.env.SPONSORED_CHALLENGES_ENABLED = 'true';
    process.env.CAMPAIGN_DASHBOARD_ENABLED = 'true';
});

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const admin = (method, url, body) => t.request(method, `/api/admin/campaigns${url}`, { token: owner.token, body });
const pro = () => t.db.addUser({ is_pro: true, pro_expires_at: iso(30) });
const today = () => appTime.localDateKey(new Date());
const noonOn = (key) => new Date(Date.parse(`${key}T06:30:00Z`)).toISOString();

async function sponsor(name = `Brand ${crypto.randomUUID().slice(0, 6)}`) {
    const res = await admin('POST', '/sponsors', { name, website: 'https://brand.example' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.sponsor;
}

function campaignBody(sponsorId, over = {}) {
    return {
        sponsorId, name: '7-Day Zero Food-Delivery Challenge', challengeType: 'no_food_delivery', durationDays: 7, params: {},
        rewardLabel: '₹200 voucher', rewardValueInr: 200, voucherExpiry: addDays(today(), 60),
        startsAt: iso(-1), endsAt: iso(30), eligibility: 'Vittova Pro members in India.',
        terms: 'One reward per person. Rewards are given in the order challenges are completed, while stocks last.', ...over,
    };
}

async function liveCampaign({ vouchers = 3, over = {} } = {}) {
    const s = await sponsor();
    const created = await admin('POST', '', campaignBody(s.id, over));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.campaign.id;
    if (vouchers) assert.equal((await admin('POST', `/${id}/vouchers`, { codes: Array.from({ length: vouchers }, (_, i) => `CODE-${id.slice(0, 4)}-${i}`) })).status, 201);
    assert.equal((await admin('POST', `/${id}/status`, { status: 'scheduled' })).status, 200);
    return { id, sponsor: s };
}

/** An enrolment that started 10 days ago with a clean, fully logged run. */
function finishedRun(user, campaignId, { deliveryOrder = false } = {}) {
    const enrolledAt = new Date(Date.parse(`${addDays(today(), -10)}T14:30:00Z`)).toISOString();
    const id = crypto.randomUUID();
    t.db.tables.challenge_enrollments = [...(t.db.tables.challenge_enrollments || []), { id, campaign_id: campaignId, user_id: user.id, enrolled_at: enrolledAt, starts_on: addDays(today(), -9), ends_on: addDays(today(), -3), status: 'active' }];
    for (let i = 9; i >= 3; i--) {
        t.db.tables.expenses = [...(t.db.tables.expenses || []), { id: crypto.randomUUID(), user_id: user.id, amount: 180, category: 'Food', description: deliveryOrder && i === 6 ? 'Swiggy' : 'Canteen lunch', occurred_at: noonOn(addDays(today(), -i)), created_at: new Date().toISOString() }];
    }
    return id;
}
const list = (u) => t.request('GET', '/api/challenges', { token: u.token });

test('only the owner can reach campaign admin APIs; a normal user is refused', async () => {
    const u = pro();
    for (const [method, url, body] of [['GET', ''], ['POST', '', {}], ['POST', '/sponsors', { name: 'X' }], ['GET', '/00000000-0000-4000-8000-000000000000/report']]) {
        const res = await t.request(method, `/api/admin/campaigns${url}`, { token: u.token, body });
        assert.equal(res.status, 403, `${method} ${url}`);
    }
    assert.equal((await t.request('GET', '/api/admin/campaigns')).status, 401);
});

test('the dashboard flag switches campaign admin off', async () => {
    process.env.CAMPAIGN_DASHBOARD_ENABLED = 'false';
    assert.equal((await admin('GET', '')).status, 404);
});

test('campaign creation is validated; rules and reward are locked once published', async () => {
    const s = await sponsor();
    assert.equal((await admin('POST', '', campaignBody(s.id, { challengeType: 'daily_target' }))).status, 400); // missing dailyTarget
    assert.equal((await admin('POST', '', campaignBody(s.id, { endsAt: iso(-5) }))).status, 400);
    assert.equal((await admin('POST', '', campaignBody(s.id, { rewardValueInr: 0 }))).status, 400);
    assert.equal((await admin('POST', '', { ...campaignBody(s.id), status: 'active' })).status, 400);

    const created = await admin('POST', '', campaignBody(s.id));
    const id = created.body.campaign.id;
    assert.equal(created.body.campaign.status, 'draft');
    // Publishing needs vouchers.
    assert.equal((await admin('POST', `/${id}/status`, { status: 'scheduled' })).body.code, 'NO_VOUCHERS');
    await admin('POST', `/${id}/vouchers`, { codes: ['AAA-1', 'AAA-2', 'AAA-2'] });
    assert.equal((await admin('POST', `/${id}/status`, { status: 'scheduled' })).status, 200);
    const locked = await admin('PATCH', `/${id}`, campaignBody(s.id, { rewardValueInr: 5000 }));
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'LOCKED');
    // Status transitions are constrained.
    assert.equal((await admin('POST', `/${id}/status`, { status: 'draft' })).status, 409);
    assert.equal((await admin('POST', `/${id}/status`, { status: 'active' })).status, 400); // derived, never set
    assert.equal((await admin('POST', `/${id}/status`, { status: 'archived' })).status, 409);
    const audit = (t.db.tables.admin_audit_log || []).map((r) => r.action);
    for (const a of ['sponsor_created', 'campaign_created', 'campaign_vouchers_added', 'campaign_status_changed']) assert.ok(audit.includes(a), a);
});

test('campaign start and end: scheduled before start, active between, ended after', async () => {
    const future = await liveCampaign({ over: { startsAt: iso(2), endsAt: iso(20) } });
    const detail = await admin('GET', `/${future.id}`);
    assert.equal(detail.body.campaign.effective_status, 'scheduled');
    const u = pro();
    assert.ok(!(await list(u)).body.challenges.some((c) => c.id === future.id));
    assert.equal((await t.request('POST', `/api/challenges/${future.id}/join`, { token: u.token })).status, 404);

    const live = await liveCampaign();
    assert.equal((await admin('GET', `/${live.id}`)).body.campaign.effective_status, 'active');
    const ending = await liveCampaign({ over: { startsAt: iso(-10), endsAt: iso(3) } });
    // Too little time left to finish a 7-day challenge.
    assert.equal((await t.request('POST', `/api/challenges/${ending.id}/join`, { token: u.token })).body.code, 'TOO_LATE');
});

test('users see sponsor disclosure, the fixed reward, limited inventory and terms before joining', async () => {
    const { id, sponsor: s } = await liveCampaign({ vouchers: 2 });
    const res = await list(pro());
    const c = res.body.challenges.find((x) => x.id === id);
    assert.equal(c.sponsored, true);
    assert.equal(c.disclosure, `Sponsored by ${s.name}`);
    assert.deepEqual(c.reward, { label: '₹200 voucher', valueInr: 200, voucherExpiry: addDays(today(), 60), fixed: true });
    assert.deepEqual(c.availability, { remaining: 2, limited: true, soldOut: false });
    assert.match(c.terms, /while stocks last/);
    assert.match(c.notice, /does not recommend the sponsor's products/);
});

test('challenges are Pro-only and behind their flag', async () => {
    const free = t.db.addUser();
    assert.equal((await list(free)).status, 403);
    process.env.SPONSORED_CHALLENGES_ENABLED = 'false';
    assert.equal((await list(pro())).status, 404);
});

test('enrolment: once per user, no fee, nothing accepted from the body', async () => {
    const { id } = await liveCampaign();
    const u = pro();
    assert.equal((await t.request('POST', `/api/challenges/${id}/join`, { token: u.token, body: { status: 'completed' } })).status, 400);
    const joined = await t.request('POST', `/api/challenges/${id}/join`, { token: u.token });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.startsOn, addDays(today(), 1));
    assert.equal((await t.request('POST', `/api/challenges/${id}/join`, { token: u.token })).body.code, 'ALREADY_JOINED');
    // There is no way to mark a challenge complete from the client.
    for (const url of [`/api/challenges/${id}/complete`, `/api/challenges/${id}/reward`]) {
        assert.equal((await t.request('POST', url, { token: u.token, body: { completed: true } })).status, 404);
    }
});

test('a completed challenge is judged by the server once, with exactly one voucher', async () => {
    const { id } = await liveCampaign();
    const u = pro();
    const enrollmentId = finishedRun(u, id);
    const [a, b, c] = await Promise.all([list(u), list(u), list(u)]);
    for (const r of [a, b, c]) assert.equal(r.status, 200);
    const mine = (await list(u)).body.challenges.find((x) => x.id === id).enrollment;
    assert.equal(mine.status, 'completed');
    assert.deepEqual(mine.reward, { issued: true, revealed: false });
    assert.equal(t.db.tables.challenge_completions.filter((x) => x.enrollment_id === enrollmentId).length, 1);
    assert.equal(t.db.tables.reward_issuances.filter((x) => x.enrollment_id === enrollmentId).length, 1);
    assert.equal(t.db.tables.campaign_vouchers.filter((v) => v.campaign_id === id && v.issued_at).length, 1);
});

test('a broken rule fails the challenge and stays failed even if the expense is deleted', async () => {
    const { id } = await liveCampaign();
    const u = pro();
    finishedRun(u, id, { deliveryOrder: true });
    const first = (await list(u)).body.challenges.find((x) => x.id === id).enrollment;
    assert.equal(first.status, 'failed');
    t.db.tables.expenses = t.db.tables.expenses.filter((e) => !(e.user_id === u.id && e.description === 'Swiggy'));
    const again = (await list(u)).body.challenges.find((x) => x.id === id).enrollment;
    assert.equal(again.status, 'failed');
    assert.equal((t.db.tables.reward_issuances || []).filter((r) => r.campaign_id === id).length, 0);
});

test('limited inventory: rewards run out and later finishers are told so', async () => {
    const { id } = await liveCampaign({ vouchers: 1 });
    const [first, second] = [pro(), pro()];
    finishedRun(first, id);
    finishedRun(second, id);
    await list(first);
    const late = (await list(second)).body.challenges.find((x) => x.id === id);
    assert.equal(late.enrollment.status, 'completed');
    assert.deepEqual(late.enrollment.reward, { issued: false, soldOut: true });
    assert.equal(late.availability.soldOut, true);
    const newcomer = pro();
    assert.equal((await t.request('POST', `/api/challenges/${id}/join`, { token: newcomer.token })).body.code, 'SOLD_OUT');
});

test('only the winner can reveal their voucher; revealing is recorded once', async () => {
    const { id } = await liveCampaign();
    const u = pro();
    const other = pro();
    const enrollmentId = finishedRun(u, id);
    await list(u);
    assert.equal((await t.request('POST', `/api/challenges/rewards/${enrollmentId}/reveal`, { token: other.token })).status, 404);
    const res = await t.request('POST', `/api/challenges/rewards/${enrollmentId}/reveal`, { token: u.token });
    assert.equal(res.status, 200);
    assert.match(res.body.reward.code, /^CODE-/);
    assert.match(res.body.reward.redemptionId, /^[0-9a-f-]{36}$/);
    assert.equal(res.body.reward.expired, false);
    const revealedAt = t.db.tables.reward_issuances.find((r) => r.enrollment_id === enrollmentId).revealed_at;
    await t.request('POST', `/api/challenges/rewards/${enrollmentId}/reveal`, { token: u.token });
    assert.equal(t.db.tables.reward_issuances.find((r) => r.enrollment_id === enrollmentId).revealed_at, revealedAt);
});

test('an expired voucher is shown as expired', async () => {
    const { id } = await liveCampaign({ over: { voucherExpiry: addDays(today(), -1) } });
    const u = pro();
    const enrollmentId = finishedRun(u, id);
    await list(u);
    const res = await t.request('POST', `/api/challenges/rewards/${enrollmentId}/reveal`, { token: u.token });
    assert.equal(res.body.reward.expired, true);
});

test('brand data firewall: metrics are counts only and sponsor reports hide small numbers', async () => {
    const { id } = await liveCampaign();
    const u = pro();
    finishedRun(u, id);
    await list(u);
    await t.request('POST', `/api/challenges/${id}/seen`, { token: u.token, body: { kind: 'view' } });
    const detail = await admin('GET', `/${id}`);
    assert.equal(detail.body.metrics.completed, 1);
    assert.equal(detail.body.metrics.rewardsIssued, 1);
    assert.equal(detail.body.metrics.views, 1);
    const report = (await admin('GET', `/${id}/report`)).body;
    assert.equal(report.report.completed, '<5');
    assert.equal(report.report.completionRate, null);
    const text = JSON.stringify([detail.body, report]);
    for (const leak of [u.id, u.email, 'Canteen lunch', '180', 'CODE-']) assert.ok(!text.includes(leak), `leaked ${leak}`);
    // The anonymous view counter stores no user id.
    assert.ok((t.db.tables.campaign_impressions || []).every((r) => !('user_id' in r)));
});

test('deleting the account removes enrolments but never reissues a voucher', async () => {
    const { id } = await liveCampaign({ vouchers: 1 });
    const u = pro();
    finishedRun(u, id);
    await list(u);
    assert.equal((await t.request('DELETE', '/api/account', { token: u.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } })).status, 200);
    assert.equal((t.db.tables.challenge_enrollments || []).filter((e) => e.user_id === u.id).length, 0);
    const voucher = t.db.tables.campaign_vouchers.find((v) => v.campaign_id === id);
    assert.ok(voucher.issued_at, 'the issued code stays used');
});
