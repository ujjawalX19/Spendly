/**
 * Payments detected from supported payment-app notifications
 * (source 'upi_auto'), uploaded by the phone without a tap:
 * idempotent retries, ownership, quota, dating and listing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const appTime = require('../lib/appTime');
const { startTestApp } = require('./helpers/testApp');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); });

const REF = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const detected = (overrides = {}) => ({
    amount: 150, category: 'Other', description: 'Chai Point', source: 'upi_auto',
    occurred_at: hoursAgo(2), client_ref: REF, ...overrides,
});
const rowsFor = (userId) => (t.db.tables.expenses || []).filter((e) => e.user_id === userId);

test('a detected payment is saved once, however many times the phone uploads it', async () => {
    const a = t.db.addUser();
    const first = await t.request('POST', '/api/expenses', { token: a.token, body: detected() });
    assert.equal(first.status, 201);
    assert.equal(first.body.expense.source, 'upi_auto');
    assert.equal(first.body.expense.client_ref, REF);

    // The response was lost and the phone retried, twice.
    const retry = await t.request('POST', '/api/expenses', { token: a.token, body: detected() });
    const retry2 = await t.request('POST', '/api/expenses', { token: a.token, body: detected() });
    for (const r of [retry, retry2]) {
        assert.equal(r.status, 200);
        assert.equal(r.body.duplicate, true);
        assert.equal(r.body.expense.id, first.body.expense.id);
        assert.equal(r.body.xpEarned, 0);
    }
    assert.equal(rowsFor(a.id).length, 1);
    // Stats and round-up were applied once.
    assert.equal(t.db.profile(a.id).total_chillar, first.body.roundupChillar);
});

test('parallel uploads of one detection still create one expense', async () => {
    const a = t.db.addUser();
    const results = await Promise.all([1, 2, 3].map(() =>
        t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'b'.repeat(32) }) })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201]);
    assert.equal(rowsFor(a.id).length, 1);
});

test('the same device id under two accounts is two expenses, each owned by its account', async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    assert.equal((await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'c'.repeat(32) }) })).status, 201);
    const other = await t.request('POST', '/api/expenses', { token: b.token, body: detected({ client_ref: 'c'.repeat(32) }) });
    assert.equal(other.status, 201, 'B never receives A\'s expense');
    assert.equal(other.body.expense.user_id, b.id);
    assert.equal(rowsFor(a.id).length, 1);
    assert.equal(rowsFor(b.id).length, 1);
});

test('a repeated upload does not use up the free daily expense limit', async () => {
    const today = appTime.localDateKey();
    const a = t.db.addUser({ expenses_today: 19, expenses_reset_at: today });
    assert.equal((await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'd'.repeat(32) }) })).status, 201);
    assert.equal(t.db.profile(a.id).expenses_today, 20);
    // At the limit, a retry of the saved detection is still answered.
    const retry = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'd'.repeat(32) }) });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.duplicate, true);
    // A new detection is held back by the limit (the phone keeps it and retries later).
    const next = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'e'.repeat(32) }) });
    assert.equal(next.status, 429);
    assert.equal(next.body.code, 'QUOTA_EXCEEDED');
});

test('payment references are only accepted for detected payments, and only in the device format', async () => {
    const a = t.db.addUser();
    const manual = await t.request('POST', '/api/expenses', { token: a.token, body: { amount: 10, description: 'x', client_ref: REF } });
    assert.equal(manual.status, 400);
    for (const bad of ['short', 'A1B2C3D4E5F60718293A4B5C6D7E8F90', `${REF}0`, "a1b2c3d4e5f60718293a4b5c6d7e8f9'"]) {
        const r = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: bad }) });
        assert.equal(r.status, 400, bad);
    }
    assert.equal(rowsFor(a.id).length, 0);
});

test('a detection may wait up to 30 days on the phone, but not longer, and never in the future', async () => {
    const a = t.db.addUser();
    const d29 = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: 'f'.repeat(32), occurred_at: hoursAgo(29 * 24) }) });
    assert.equal(d29.status, 201);
    const d40 = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: '1'.repeat(32), occurred_at: hoursAgo(40 * 24) }) });
    assert.equal(d40.status, 400);
    const future = await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: '2'.repeat(32), occurred_at: new Date(Date.now() + 3600000).toISOString() }) });
    assert.equal(future.status, 400);
});

test('an upload without a valid sign-in is refused and saves nothing', async () => {
    const before = (t.db.tables.expenses || []).length;
    const res = await t.request('POST', '/api/expenses', { body: detected({ client_ref: '3'.repeat(32) }) });
    assert.equal(res.status, 401);
    const forged = await t.request('POST', '/api/expenses', { token: 'not-a-real-token', body: detected({ client_ref: '3'.repeat(32) }) });
    assert.equal(forged.status, 401);
    // The owner always comes from the token: a user_id in the body is rejected.
    const a = t.db.addUser();
    const b = t.db.addUser();
    const spoof = await t.request('POST', '/api/expenses', { token: a.token, body: { ...detected({ client_ref: '4'.repeat(32) }), user_id: b.id } });
    assert.equal(spoof.status, 400);
    assert.equal((t.db.tables.expenses || []).length, before);
});

test('a detected payment appears in the list right away, dated when it was paid, with its source', async () => {
    const a = t.db.addUser();
    const when = hoursAgo(5);
    await t.request('POST', '/api/expenses', { token: a.token, body: detected({ client_ref: '5'.repeat(32), occurred_at: when }) });
    const list = await t.request('GET', '/api/expenses', { token: a.token });
    assert.equal(list.status, 200);
    assert.equal(list.body.expenses.length, 1);
    const e = list.body.expenses[0];
    assert.equal(e.source, 'upi_auto');
    assert.equal(e.description, 'Chai Point');
    assert.equal(new Date(e.occurred_at).toISOString(), when);
    // History can filter to detected payments.
    const onlyDetected = await t.request('GET', '/api/expenses?source=upi_auto', { token: a.token });
    assert.equal(onlyDetected.body.expenses.length, 1);
});

test('the server tells the app it accepts payment references', async () => {
    const a = t.db.addUser();
    const res = await t.request('GET', '/api/features', { token: a.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.features.expenseIdempotency, true);
});
