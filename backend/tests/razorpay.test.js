/**
 * Razorpay Pro passes: orders, checkout verification, webhooks, refunds,
 * stacking, and every way a client could try to get Pro without paying.
 * Razorpay is replaced by tests/helpers/testApp.js → t.razorpay.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const SECRET = 'test-key-secret';
const HOOK_SECRET = 'test-webhook-secret';
const DAY = 86400000;

let t;
test.before(async () => {
    t = await startTestApp({ env: { RAZORPAY_ENABLED: 'true', RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: HOOK_SECRET, PLAY_BILLING_ENABLED: 'true' } });
});
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    process.env.RAZORPAY_ENABLED = 'true';
    t.razorpay.configured = true;
    t.razorpay.down = false;
});

const sign = (orderId, paymentId, secret = SECRET) => crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
const payId = () => `pay_${crypto.randomBytes(7).toString('hex')}`;
const order = (u, plan = 'yearly') => t.request('POST', '/api/pro/razorpay/order', { token: u.token, body: { plan } });
const verify = (u, body) => t.request('POST', '/api/pro/razorpay/verify', { token: u.token, body });

/** Create an order and a matching payment at Razorpay, as Checkout would. */
async function pay(u, { plan = 'yearly', status = 'captured', amount } = {}) {
    const res = await order(u, plan);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { orderId, amount: planAmount } = res.body.order;
    const paymentId = payId();
    t.razorpay.payments.set(paymentId, { id: paymentId, order_id: orderId, amount: amount ?? planAmount, currency: 'INR', status, amount_refunded: 0 });
    return { orderId, paymentId, signature: sign(orderId, paymentId) };
}

function webhook(event, { secret = HOOK_SECRET, tamper = false } = {}) {
    const raw = JSON.stringify(event);
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return t.request('POST', '/api/pro/razorpay/webhook', {
        headers: { 'X-Razorpay-Signature': signature },
        body: tamper ? { ...event, tampered: true } : event,
    });
}
const paymentEvent = (name, paymentId, orderId) => ({ event: name, payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });

test('Razorpay stays off unless enabled and configured', async () => {
    const u = t.db.addUser();
    process.env.RAZORPAY_ENABLED = 'false';
    assert.equal((await t.request('GET', '/api/pro/razorpay/config', { token: u.token })).body.available, false);
    assert.equal((await t.request('GET', '/api/pro/status', { token: u.token })).body.razorpayAvailable, false);
    assert.equal((await order(u)).status, 501);
    process.env.RAZORPAY_ENABLED = 'true';
    t.razorpay.configured = false;
    assert.equal((await order(u)).status, 501);
    assert.equal((await t.request('GET', '/api/pro/razorpay/order')).status, 404);
});

test('config lists the server\'s plans and prices; the key secret is never sent', async () => {
    const u = t.db.addUser();
    const res = await t.request('GET', '/api/pro/razorpay/config', { token: u.token });
    assert.equal(res.body.available, true);
    assert.deepEqual(res.body.plans.map((p) => [p.key, p.amount, p.days]), [['monthly', 4900, 30], ['yearly', 44900, 365]]);
    assert.ok(!res.text.includes(SECRET));
    assert.equal((await t.request('GET', '/api/pro/razorpay/config')).status, 401);
});

test('an order uses the server\'s amount, is bound to the account, and leaks no secret', async () => {
    const u = t.db.addUser();
    const res = await order(u, 'monthly');
    assert.equal(res.status, 200);
    assert.equal(res.body.order.amount, 4900);
    assert.equal(res.body.order.keyId, 'rzp_test_vittova');
    assert.ok(!res.text.includes(SECRET));
    const row = t.db.tables.razorpay_payments.find((r) => r.order_id === res.body.order.orderId);
    assert.equal(row.user_id, u.id);
    assert.equal(row.status, 'created');
    assert.equal(t.razorpay.orders.get(row.order_id).amount, 4900);
    // A client cannot choose the amount or invent a plan.
    assert.equal((await t.request('POST', '/api/pro/razorpay/order', { token: u.token, body: { plan: 'yearly', amount: 1 } })).status, 400);
    assert.equal((await order(u, 'lifetime')).status, 400);
});

test('a genuine payment is verified with Razorpay and grants Pro for the plan\'s period', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { plan: 'yearly' });
    const res = await verify(u, p);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'paid');
    assert.equal(res.body.pro.isPro, true);
    const profile = t.db.profile(u.id);
    assert.equal(profile.pro_source, 'razorpay');
    const days = (Date.parse(profile.pro_expires_at) - Date.now()) / DAY;
    assert.ok(days > 364.9 && days <= 365, String(days));
    // Verifying the same payment again grants nothing more.
    const again = await verify(u, p);
    assert.equal(again.body.status, 'paid');
    assert.equal(t.db.profile(u.id).pro_expires_at, profile.pro_expires_at);
});

test('an authorized payment is captured before Pro is granted', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { plan: 'monthly', status: 'authorized' });
    const res = await verify(u, p);
    assert.equal(res.body.status, 'paid');
    assert.ok(t.razorpay.captures.includes(p.paymentId));
});

test('a forged or mismatched checkout result never grants Pro', async () => {
    const u = t.db.addUser();
    const p = await pay(u);
    assert.equal((await verify(u, { ...p, signature: sign(p.orderId, p.paymentId, 'wrong-secret') })).status, 400);
    assert.equal((await verify(u, { ...p, signature: 'a'.repeat(64) })).status, 400);
    assert.equal(t.db.profile(u.id).is_pro, false);

    // Signature valid but Razorpay has no such payment.
    const ghost = payId();
    assert.equal((await verify(u, { orderId: p.orderId, paymentId: ghost, signature: sign(p.orderId, ghost) })).status, 400);

    // A cheaper payment from another order cannot complete this one.
    const cheap = await pay(u, { plan: 'monthly' });
    const swapped = await verify(u, { orderId: p.orderId, paymentId: cheap.paymentId, signature: sign(p.orderId, cheap.paymentId) });
    assert.equal(swapped.status, 400);
    assert.equal(swapped.body.code, 'ORDER_MISMATCH');

    // Underpaid at Razorpay.
    const under = await pay(u, { amount: 100 });
    const res = await verify(u, under);
    assert.equal(res.body.code, 'AMOUNT_MISMATCH');
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('one account cannot use another account\'s order', async () => {
    const owner = t.db.addUser();
    const thief = t.db.addUser();
    const p = await pay(owner);
    const res = await verify(thief, p);
    assert.equal(res.status, 404);
    assert.equal(t.db.profile(thief.id).is_pro, false);
});

test('a failed attempt leaves the order open for a successful retry', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { status: 'failed' });
    assert.equal((await verify(u, p)).body.status, 'failed');
    assert.equal(t.db.profile(u.id).is_pro, false);
    const retry = payId();
    t.razorpay.payments.set(retry, { id: retry, order_id: p.orderId, amount: 44900, currency: 'INR', status: 'captured', amount_refunded: 0 });
    assert.equal((await verify(u, { orderId: p.orderId, paymentId: retry, signature: sign(p.orderId, retry) })).body.status, 'paid');
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('a Razorpay outage is a safe 503, and the webhook grants Pro later', async () => {
    const u = t.db.addUser();
    const p = await pay(u);
    t.razorpay.down = true;
    const res = await verify(u, p);
    assert.equal(res.status, 503);
    assert.equal(t.db.profile(u.id).is_pro, false);
    t.razorpay.down = false;
    const hook = await webhook(paymentEvent('payment.captured', p.paymentId, p.orderId));
    assert.equal(hook.status, 200);
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('webhooks need Razorpay\'s signature over the exact body', async () => {
    const u = t.db.addUser();
    const p = await pay(u);
    assert.equal((await webhook(paymentEvent('payment.captured', p.paymentId, p.orderId), { secret: 'nope' })).status, 401);
    assert.equal((await webhook(paymentEvent('payment.captured', p.paymentId, p.orderId), { tamper: true })).status, 401);
    assert.equal((await t.request('POST', '/api/pro/razorpay/webhook', { body: paymentEvent('payment.captured', p.paymentId, p.orderId) })).status, 401);
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('a webhook body is only a pointer: the payment is re-read from Razorpay', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { status: 'failed' });
    // The event claims a capture, but Razorpay says the payment failed.
    assert.equal((await webhook(paymentEvent('payment.captured', p.paymentId, p.orderId))).status, 200);
    assert.equal(t.db.profile(u.id).is_pro, false);
    // Unknown orders (not Vittova's) are ignored.
    assert.equal((await webhook(paymentEvent('payment.captured', payId(), 'order_unknown12345'))).status, 200);
});

test('verify and webhook together grant one period, not two', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { plan: 'monthly' });
    await Promise.all([verify(u, p), webhook(paymentEvent('order.paid', p.paymentId, p.orderId)), webhook(paymentEvent('payment.captured', p.paymentId, p.orderId))]);
    const paid = t.db.tables.razorpay_payments.filter((r) => r.user_id === u.id && r.status === 'paid');
    assert.equal(paid.length, 1);
    const days = (Date.parse(t.db.profile(u.id).pro_expires_at) - Date.now()) / DAY;
    assert.ok(days <= 30 && days > 29.9, String(days));
});

test('a second pass starts when the first ends', async () => {
    const u = t.db.addUser();
    await verify(u, await pay(u, { plan: 'monthly' }));
    await verify(u, await pay(u, { plan: 'yearly' }));
    const days = (Date.parse(t.db.profile(u.id).pro_expires_at) - Date.now()) / DAY;
    assert.ok(days > 394.9 && days <= 395, String(days));
});

test('a full refund ends the pass; a partial refund does not', async () => {
    const u = t.db.addUser();
    const p = await pay(u, { plan: 'monthly' });
    await verify(u, p);
    t.razorpay.payments.get(p.paymentId).amount_refunded = 1000;
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: p.paymentId } } } });
    assert.equal(t.db.profile(u.id).is_pro, true);
    t.razorpay.payments.get(p.paymentId).amount_refunded = 4900;
    t.razorpay.payments.get(p.paymentId).status = 'refunded';
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_2', payment_id: p.paymentId } } } });
    assert.equal(t.db.profile(u.id).is_pro, false);
    assert.equal(t.db.tables.razorpay_payments.find((r) => r.order_id === p.orderId).status, 'refunded');
});

test('no double charge: an account with Play or manual Pro cannot start a Razorpay order', async () => {
    const play = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() + 10 * DAY).toISOString(), pro_source: 'play' });
    const res = await order(play);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ALREADY_PRO');
    const manual = t.db.addUser({ is_pro: true, pro_expires_at: null, pro_source: 'manual' });
    assert.equal((await order(manual)).status, 409);
    // An expired Play subscription does not block buying a pass.
    const lapsed = t.db.addUser({ is_pro: false, pro_expires_at: new Date(Date.now() - DAY).toISOString(), pro_source: 'play' });
    assert.equal((await order(lapsed)).status, 200);
});

test('a Play cancellation does not remove a paid Razorpay pass', async () => {
    const u = t.db.addUser();
    await verify(u, await pay(u, { plan: 'yearly' }));
    const { recomputeProfile } = require('../lib/playBilling');
    // A Play row that has just ended for this user (e.g. an old subscription).
    t.db.tables.play_purchases = [...(t.db.tables.play_purchases || []), { token_hash: 'c'.repeat(64), user_id: u.id, entitled: false, expires_at: new Date(Date.now() - DAY).toISOString() }];
    await recomputeProfile(u.id);
    assert.equal(t.db.profile(u.id).is_pro, true);
    assert.equal(t.db.profile(u.id).pro_source, 'razorpay');
});

test('the entitlement decision: latest end wins, manual is never touched', () => {
    const { decide } = require('../lib/proEntitlement');
    const now = new Date('2026-11-01T00:00:00Z');
    const later = '2027-01-01T00:00:00Z';
    const sooner = '2026-12-01T00:00:00Z';
    assert.deepEqual(decide({ pro_source: null }, { play: [{ expires_at: sooner }], razorpay: [{ period_end: later }] }, now), { is_pro: true, pro_expires_at: new Date(later).toISOString(), pro_source: 'razorpay' });
    assert.equal(decide({ pro_source: 'manual', is_pro: true }, { razorpay: [{ period_end: later }] }, now), null);
    assert.deepEqual(decide({ pro_source: 'razorpay', is_pro: true }, {}, now), { is_pro: false, pro_source: 'razorpay' });
    assert.equal(decide({ pro_source: null, is_pro: false }, {}, now), null);
});
