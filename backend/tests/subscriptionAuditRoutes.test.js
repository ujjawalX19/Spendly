/**
 * /api/subscription-audit and /api/features against the real app and fake DB.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const { addMonths, addDays } = require('../lib/recurringAudit');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); delete process.env.SUBSCRIPTION_AUDIT_ENABLED; });

const today = () => appTime.localDateKey(new Date());
const noon = (key) => new Date(Date.parse(`${key}T06:30:00Z`)).toISOString(); // 12:00 IST
const pro = (o = {}) => t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), ...o });

/** Monthly payments ending `lastAgo` days ago. */
function monthly(userId, description, amount, count = 4, lastAgo = 20) {
    const last = addDays(today(), -lastAgo);
    for (let i = count - 1; i >= 0; i--) {
        t.db.tables.expenses = [...(t.db.tables.expenses || []), {
            id: crypto.randomUUID(), user_id: userId, amount: Array.isArray(amount) ? amount[count - 1 - i] : amount,
            category: 'Entertainment', description, source: 'manual', roundup_chillar: 0,
            occurred_at: noon(addMonths(last, -i)), created_at: new Date().toISOString(),
        }];
    }
    return addMonths(last, 1);
}

test('the audit needs sign-in and Pro; free users are told it is part of Pro', async () => {
    assert.equal((await t.request('GET', '/api/subscription-audit')).status, 401);
    const free = t.db.addUser();
    const res = await t.request('GET', '/api/subscription-audit', { token: free.token });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PRO_REQUIRED');
    // The free "Recurring charges" screen still works.
    assert.equal((await t.request('GET', '/api/subscriptions/detect', { token: free.token })).status, 200);
});

test('the feature flag switches the audit off server-side', async () => {
    const u = pro();
    process.env.SUBSCRIPTION_AUDIT_ENABLED = 'false';
    const res = await t.request('GET', '/api/subscription-audit', { token: u.token });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'FEATURE_DISABLED');
    const f = await t.request('GET', '/api/features', { token: u.token });
    assert.equal(f.body.features.subscriptionAuditEnabled, false);
    assert.equal(f.body.features.studentPlanEnabled, false);
});

test('the student plan stays off even if the environment switches it on', async () => {
    const u = t.db.addUser();
    process.env.STUDENT_PLAN_ENABLED = 'true';
    assert.equal((await t.request('GET', '/api/features', { token: u.token })).body.features.studentPlanEnabled, false);
    delete process.env.STUDENT_PLAN_ENABLED;
});

test('a Pro user sees detected payments, totals, a reminder and a stored expectation', async () => {
    const u = pro();
    const next = monthly(u.id, 'Netflix', 649);
    const res = await t.request('GET', '/api/subscription-audit', { token: u.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const n = res.body.audit.items.find((i) => i.merchantKey === 'netflix');
    assert.equal(n.confidence, 'high');
    assert.equal(n.nextExpected.dateKey, next);
    assert.equal(res.body.audit.totals.monthly, 649);
    const rem = res.body.reminders.find((r) => r.merchantKey === 'netflix');
    assert.equal(rem.expectedDate, next);
    const stored = t.db.tables.recurring_expectations.filter((x) => x.user_id === u.id);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].status, 'pending');
    // Opening again does not duplicate the expectation.
    await t.request('GET', '/api/subscription-audit', { token: u.token });
    assert.equal(t.db.tables.recurring_expectations.filter((x) => x.user_id === u.id).length, 1);
});

test('price hikes are reported with a yearly impact', async () => {
    const u = pro();
    monthly(u.id, 'Spotify', [119, 119, 119, 179]);
    const res = await t.request('GET', '/api/subscription-audit', { token: u.token });
    const s = res.body.audit.items.find((i) => i.merchantKey === 'spotify');
    assert.equal(s.priceChange.perYear, 720);
    assert.equal(res.body.audit.totals.priceIncreasesPerYear, 720);
});

test('decisions are validated, saved per user, and dismissing removes it from the totals', async () => {
    const u = pro();
    monthly(u.id, 'Netflix', 649);
    for (const body of [
        { merchantKey: 'netflix', decision: 'cancel_it_for_me' },
        { merchantKey: 'Netflix<script>', decision: 'dismissed' },
        { merchantKey: 'netflix', decision: 'dismissed', userId: 'someone-else' },
        {},
    ]) {
        assert.equal((await t.request('POST', '/api/subscription-audit/decision', { token: u.token, body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await t.request('POST', '/api/subscription-audit/decision', { token: u.token, body: { merchantKey: 'netflix', decision: 'dismissed' } })).status, 200);
    const res = await t.request('GET', '/api/subscription-audit', { token: u.token });
    assert.equal(res.body.audit.totals.monthly, 0);
    assert.equal(res.body.reminders.length, 0);
    assert.equal(res.body.audit.items.find((i) => i.merchantKey === 'netflix').decision, 'dismissed');

    await t.request('POST', '/api/subscription-audit/decision', { token: u.token, body: { merchantKey: 'netflix', decision: 'cleared' } });
    assert.equal((await t.request('GET', '/api/subscription-audit', { token: u.token })).body.audit.totals.monthly, 649);
});

test('after the expected date, a matching payment marks the expectation matched; a missing one is not confirmed once', async () => {
    const u = pro();
    // An expectation 10 days ago with no payment, and one 2 days ago with a payment.
    const missed = addDays(today(), -10);
    const paid = addDays(today(), -2);
    t.db.tables.recurring_expectations = [...(t.db.tables.recurring_expectations || []),
        { user_id: u.id, merchant_key: 'hotstar', expected_date: missed, expected_amount: 299, status: 'pending' },
        { user_id: u.id, merchant_key: 'netflix', expected_date: paid, expected_amount: 649, status: 'pending' },
    ];
    t.db.tables.expenses = [...(t.db.tables.expenses || []), { id: crypto.randomUUID(), user_id: u.id, amount: 649, category: 'Entertainment', description: 'Netflix', occurred_at: noon(paid), created_at: new Date().toISOString() }];

    const res = await t.request('GET', '/api/subscription-audit', { token: u.token });
    const v = Object.fromEntries(res.body.verification.map((x) => [x.merchantKey, x.status]));
    assert.equal(v.netflix, 'matched');
    assert.equal(v.hotstar, 'not_confirmed');
    const rows = t.db.tables.recurring_expectations.filter((x) => x.user_id === u.id);
    assert.ok(rows.find((x) => x.merchant_key === 'hotstar').resolved_at);
});

test('one user never sees another user\'s recurring payments or decisions', async () => {
    const a = pro();
    const b = pro();
    monthly(a.id, 'Netflix', 649);
    await t.request('POST', '/api/subscription-audit/decision', { token: a.token, body: { merchantKey: 'netflix', decision: 'unwanted' } });
    const res = await t.request('GET', '/api/subscription-audit', { token: b.token });
    assert.equal(res.body.audit.items.length, 0);
    assert.ok(!JSON.stringify(res.body).includes('netflix'));
});
