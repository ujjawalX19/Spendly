/**
 * Google Play Billing: server-side verification, entitlement and every way a
 * client could try to get Pro without paying. Google is replaced by
 * tests/helpers/testApp.js → t.play (subscriptionsv2 resources by token).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

let t;
test.before(async () => { t = await startTestApp({ env: { PLAY_BILLING_ENABLED: 'true', PLAY_PRO_PRODUCT_IDS: 'vittova_pro' } }); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    process.env.PLAY_BILLING_ENABLED = 'true';
    t.play.configured = true;
    t.play.down = false;
});

const DAY = 86400000;
const accountId = (userId) => crypto.createHash('sha256').update(`vittova-account:${userId}`).digest('hex');
const token = () => `play-token-${crypto.randomUUID()}`;

function subscription(userId, overrides = {}) {
    return {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        latestOrderId: `GPA.${crypto.randomUUID().slice(0, 8)}`,
        lineItems: [{ productId: 'vittova_pro', expiryTime: new Date(Date.now() + 30 * DAY).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
        externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId(userId) },
        ...overrides,
    };
}
const verify = (u, purchaseToken, extra = {}) => t.request('POST', '/api/pro/verify-purchase', { token: u.token, body: { purchaseToken, ...extra } });
const rtdn = (purchaseToken, { auth = 'Bearer valid-google-push-token', packageName = 'com.vittova.app', type = 2 } = {}) => t.request('POST', '/api/pro/rtdn', {
    headers: auth ? { Authorization: auth } : {},
    body: { message: { data: Buffer.from(JSON.stringify({ version: '1.0', packageName, eventTimeMillis: String(Date.now()), subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken, subscriptionId: 'vittova_pro' } })).toString('base64'), messageId: '1' }, subscription: 'projects/x/subscriptions/y' },
});

test('purchases stay off unless billing is explicitly enabled and configured', async () => {
    const u = t.db.addUser();
    process.env.PLAY_BILLING_ENABLED = 'false';
    assert.equal((await t.request('GET', '/api/pro/billing-config', { token: u.token })).body.purchasesAvailable, false);
    assert.equal((await t.request('GET', '/api/pro/status', { token: u.token })).body.purchasesAvailable, false);
    assert.equal((await verify(u, token())).status, 501);

    process.env.PLAY_BILLING_ENABLED = 'true';
    t.play.configured = false; // no service account
    assert.equal((await t.request('GET', '/api/pro/billing-config', { token: u.token })).body.purchasesAvailable, false);
    assert.equal((await verify(u, token())).status, 501);
});

test('billing config binds purchases to the signed-in account', async () => {
    const u = t.db.addUser();
    const res = await t.request('GET', '/api/pro/billing-config', { token: u.token });
    assert.equal(res.body.purchasesAvailable, true);
    assert.deepEqual(res.body.productIds, ['vittova_pro']);
    assert.equal(res.body.obfuscatedAccountId, accountId(u.id));
    assert.ok(!res.body.obfuscatedAccountId.includes(u.id));
    assert.equal((await t.request('GET', '/api/pro/billing-config')).status, 401);
});

test('a genuine purchase is verified with Google, acknowledged, stored and grants Pro', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    const res = await verify(u, tok);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.entitled, true);
    assert.equal(res.body.pro.isPro, true);
    assert.ok(t.play.acks.includes(tok));

    const p = t.db.profile(u.id);
    assert.equal(p.is_pro, true);
    assert.equal(p.pro_source, 'play');
    assert.ok(Date.parse(p.pro_expires_at) > Date.now() + 29 * DAY);
    const row = t.db.tables.play_purchases.find((r) => r.user_id === u.id);
    assert.equal(row.product_id, 'vittova_pro');
    assert.equal(row.acknowledged, true);

    // Pro lifts the free money-check limit.
    for (let i = 0; i < 7; i++) assert.equal((await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 } })).status, 200);
});

test('a forged or unknown token is refused and grants nothing', async () => {
    const u = t.db.addUser();
    const res = await verify(u, 'forged-token-that-google-never-issued');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_PURCHASE');
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('a purchase made for another account cannot be claimed', async () => {
    const buyer = t.db.addUser();
    const thief = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(buyer.id));
    const res = await verify(thief, tok);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_MISMATCH');
    assert.equal(t.db.profile(thief.id).is_pro, false);
});

test('a token already verified by one account cannot be reused by another', async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(a.id));
    assert.equal((await verify(a, tok)).status, 200);
    // Even if Google were to report b's account id, the token is bound to a.
    t.play.subs.set(tok, subscription(b.id));
    const res = await verify(b, tok);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PURCHASE_ALREADY_USED');
    assert.equal(t.db.profile(b.id).is_pro, false);
});

test('only Vittova Pro products count', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id, { lineItems: [{ productId: 'some_other_app_sub', expiryTime: new Date(Date.now() + DAY).toISOString() }] }));
    const res = await verify(u, tok);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNKNOWN_PRODUCT');
});

test('pending, expired and on-hold subscriptions do not grant Pro', async () => {
    for (const [state, expiryOffset] of [['SUBSCRIPTION_STATE_PENDING', 30], ['SUBSCRIPTION_STATE_EXPIRED', -1], ['SUBSCRIPTION_STATE_ON_HOLD', 5], ['SUBSCRIPTION_STATE_ACTIVE', -1]]) {
        const u = t.db.addUser();
        const tok = token();
        t.play.subs.set(tok, subscription(u.id, { subscriptionState: state, lineItems: [{ productId: 'vittova_pro', expiryTime: new Date(Date.now() + expiryOffset * DAY).toISOString() }] }));
        const res = await verify(u, tok);
        assert.equal(res.status, 200, state);
        assert.equal(res.body.entitled, false, state);
        assert.equal(t.db.profile(u.id).is_pro, false, state);
        assert.ok(!t.play.acks.includes(tok), `${state} must not be acknowledged`);
    }
});

test('the client cannot send Pro status, expiry or price', async () => {
    const u = t.db.addUser();
    for (const body of [
        { purchaseToken: token(), is_pro: true },
        { purchaseToken: token(), expiresAt: '2099-01-01' },
        { purchaseToken: token(), price: 0 },
        { purchaseToken: 'short' },
        {},
    ]) {
        const res = await t.request('POST', '/api/pro/verify-purchase', { token: u.token, body });
        assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(t.db.profile(u.id).is_pro, false);
    assert.equal((await t.request('POST', '/api/pro/verify-purchase', { body: { purchaseToken: token() } })).status, 401);
});

test('cancellation keeps Pro until the paid period ends; expiry then removes it (RTDN)', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);

    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }));
    assert.equal((await rtdn(tok, { type: 3 })).status, 204);
    assert.equal(t.db.profile(u.id).is_pro, true);

    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', lineItems: [{ productId: 'vittova_pro', expiryTime: new Date(Date.now() - 1000).toISOString() }] }));
    assert.equal((await rtdn(tok, { type: 13 })).status, 204);
    assert.equal(t.db.profile(u.id).is_pro, false);
    // The free limit applies again.
    for (let i = 0; i < 5; i++) await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 } });
    assert.equal((await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 } })).status, 429);
});

test('renewal extends Pro; a refund or revocation removes it', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    const firstExpiry = Date.parse(t.db.profile(u.id).pro_expires_at);

    t.play.subs.set(tok, subscription(u.id, { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', lineItems: [{ productId: 'vittova_pro', expiryTime: new Date(Date.now() + 60 * DAY).toISOString() }] }));
    await rtdn(tok, { type: 2 }); // SUBSCRIPTION_RENEWED
    assert.ok(Date.parse(t.db.profile(u.id).pro_expires_at) > firstExpiry);

    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }));
    await rtdn(tok, { type: 12 }); // SUBSCRIPTION_REVOKED
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('grace period keeps Pro; account hold removes it', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }));
    await rtdn(tok, { type: 6 });
    assert.equal(t.db.profile(u.id).is_pro, true);
    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }));
    await rtdn(tok, { type: 5 });
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('notifications must carry Google\'s push token; the body alone is never trusted', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }));

    assert.equal((await rtdn(tok, { auth: null })).status, 401);
    assert.equal((await rtdn(tok, { auth: 'Bearer forged' })).status, 401);
    assert.equal(t.db.profile(u.id).is_pro, true); // nothing changed

    assert.equal((await rtdn(tok, { packageName: 'com.attacker.app' })).status, 204);
    assert.equal(t.db.profile(u.id).is_pro, true);
    assert.equal((await rtdn('never-seen-token')).status, 204);
});

test('a notification is retried when Google is unreachable', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    t.play.down = true;
    assert.equal((await rtdn(tok)).status, 503);
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('restore purchases: re-verifying on the same account is idempotent', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    assert.equal((await verify(u, tok)).status, 200);
    assert.equal((await verify(u, tok)).status, 200);
    assert.equal(t.db.tables.play_purchases.filter((r) => r.user_id === u.id).length, 1);
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('an upgrade or resubscription supersedes the earlier token', async () => {
    const u = t.db.addUser();
    const oldTok = token();
    const newTok = token();
    t.play.subs.set(oldTok, subscription(u.id));
    await verify(u, oldTok);
    t.play.subs.set(newTok, subscription(u.id, { linkedPurchaseToken: oldTok }));
    await verify(u, newTok);
    const rows = t.db.tables.play_purchases.filter((r) => r.user_id === u.id);
    assert.equal(rows.find((r) => r.purchase_token === oldTok).entitled, false);
    assert.equal(rows.find((r) => r.purchase_token === newTok).entitled, true);
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('a missed notification is caught when the app next reads its Pro status', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    // Refunded, but the notification never arrived; the entitlement is stale.
    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }));
    t.db.tables.play_purchases.find((r) => r.purchase_token === tok).last_verified_at = new Date(Date.now() - 2 * DAY).toISOString();
    const status = await t.request('GET', '/api/pro/status', { token: u.token });
    assert.equal(status.body.pro.isPro, false);
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('billing never removes a deliberate manual Pro grant', async () => {
    const u = t.db.addUser({ is_pro: true, pro_expires_at: null, pro_source: 'manual' });
    const tok = token();
    t.play.subs.set(tok, subscription(u.id, { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }));
    await verify(u, tok);
    assert.equal(t.db.profile(u.id).is_pro, true);
});

test('Google being down during a purchase fails safely and grants nothing', async () => {
    const u = t.db.addUser();
    t.play.down = true;
    const res = await verify(u, token());
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'PLAY_UNAVAILABLE');
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('deleting the account removes its purchase records', async () => {
    const u = t.db.addUser();
    const tok = token();
    t.play.subs.set(tok, subscription(u.id));
    await verify(u, tok);
    assert.equal((await t.request('DELETE', '/api/account', { token: u.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } })).status, 200);
    assert.equal((t.db.tables.play_purchases || []).filter((r) => r.user_id === u.id).length, 0);
});

// ─── Plans: monthly, yearly, limited offer, student ────────────────────────

const withPlan = (userId, basePlanId, offerId = null, over = {}) => subscription(userId, {
    lineItems: [{ productId: 'vittova_pro', expiryTime: new Date(Date.now() + (basePlanId.includes('year') ? 365 : 30) * DAY).toISOString(), offerDetails: { basePlanId, offerId } }],
    ...over,
});

test('monthly, yearly and the limited yearly offer all grant Pro and record the plan', async () => {
    for (const [basePlanId, offerId] of [['monthly', null], ['yearly', null], ['yearly', 'launch-199']]) {
        const u = t.db.addUser();
        const tok = token();
        t.play.subs.set(tok, withPlan(u.id, basePlanId, offerId));
        const res = await verify(u, tok);
        assert.equal(res.status, 200, `${basePlanId}/${offerId}: ${JSON.stringify(res.body)}`);
        assert.equal(t.db.profile(u.id).is_pro, true);
        const row = t.db.tables.play_purchases.find((r) => r.purchase_token === tok);
        assert.equal(row.base_plan_id, basePlanId);
        assert.equal(row.offer_id, offerId);
        assert.ok(t.play.acks.includes(tok));
    }
});

test('a student-plan purchase is refused and never acknowledged while verification does not exist', async () => {
    for (const plan of ['student-monthly', 'student-yearly']) {
        const u = t.db.addUser();
        const tok = token();
        t.play.subs.set(tok, withPlan(u.id, plan));
        const res = await verify(u, tok);
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'STUDENT_NOT_VERIFIED');
        assert.match(res.body.message, /refunds purchases that are not confirmed within 3 days/);
        assert.equal(t.db.profile(u.id).is_pro, false);
        assert.ok(!t.play.acks.includes(tok), 'must not be acknowledged, so Google refunds it');
    }
});

test('billing config lists plans without prices; the limited offer only with its flag; never student plans', async () => {
    const u = t.db.addUser();
    delete process.env.LIMITED_OFFER_ENABLED;
    process.env.STUDENT_PLAN_ENABLED = 'true';
    let plans = (await t.request('GET', '/api/pro/billing-config', { token: u.token })).body.plans;
    assert.deepEqual(plans.map((p) => p.key), ['monthly', 'yearly']);
    assert.ok(plans.every((p) => !('price' in p)));
    process.env.LIMITED_OFFER_ENABLED = 'true';
    plans = (await t.request('GET', '/api/pro/billing-config', { token: u.token })).body.plans;
    assert.deepEqual(plans.map((p) => p.key), ['monthly', 'yearly', 'limited_yearly']);
    assert.deepEqual(plans[2], { key: 'limited_yearly', basePlanId: 'yearly', offerId: 'launch-199' });
    delete process.env.LIMITED_OFFER_ENABLED;
    delete process.env.STUDENT_PLAN_ENABLED;
});
