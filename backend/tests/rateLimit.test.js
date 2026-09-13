/**
 * Proves clients behind the production proxy are rate-limited individually,
 * not as one shared bucket.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');
const { parseTrustProxy } = require('../middleware/rateLimits');

let t;
test.before(async () => { t = await startTestApp({ env: { TRUST_PROXY: '1' } }); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); });

async function failAuthFrom(ip, times) {
    let last;
    for (let i = 0; i < times; i++) {
        last = await t.request('GET', '/api/expenses', { token: 'wrong', headers: { 'X-Forwarded-For': ip } });
    }
    return last;
}

test('different client IPs behind the proxy get separate rate-limit buckets', async () => {
    const blocked = await failAuthFrom('203.0.113.10', 31);
    assert.equal(blocked.status, 429, 'the 31st failed attempt from one IP is throttled');
    assert.equal(blocked.body.code, 'RATE_LIMITED');

    const otherClient = await t.request('GET', '/api/expenses', { token: 'wrong', headers: { 'X-Forwarded-For': '198.51.100.7' } });
    assert.equal(otherClient.status, 401, 'another client is not affected');
});

test('successful requests do not count toward the failed-auth limit', async () => {
    const user = t.db.addUser();
    for (let i = 0; i < 40; i++) {
        const res = await t.request('GET', '/api/expenses', { token: user.token, headers: { 'X-Forwarded-For': '192.0.2.44' } });
        assert.equal(res.status, 200);
    }
});

test('signed-in users are limited per account, not per shared IP (CGNAT)', async () => {
    const heavy = t.db.addUser();
    const light = t.db.addUser();
    const sharedIp = { 'X-Forwarded-For': '100.64.0.1' };
    let last;
    for (let i = 0; i < 301; i++) {
        last = await t.request('GET', '/api/pro/status', { token: heavy.token, headers: sharedIp });
    }
    assert.equal(last.status, 429);
    const neighbour = await t.request('GET', '/api/pro/status', { token: light.token, headers: sharedIp });
    assert.equal(neighbour.status, 200);
});

test('rate-limit responses carry standard headers', async () => {
    const user = t.db.addUser();
    const res = await t.request('GET', '/api/pro/status', { token: user.token, headers: { 'X-Forwarded-For': '192.0.2.99' } });
    assert.ok(res.headers.get('ratelimit'), 'RateLimit header present');
    assert.ok(res.headers.get('ratelimit-policy'), 'RateLimit-Policy header present');
});

test('TRUST_PROXY parsing never silently trusts everything', () => {
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy('2'), 2);
    assert.equal(parseTrustProxy(''), false);
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('loopback'), 'loopback');
});
