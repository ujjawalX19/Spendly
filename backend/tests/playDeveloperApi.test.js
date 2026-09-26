/**
 * The real Google Play Developer API client and Pub/Sub push verification,
 * with the network stubbed and locally generated RSA keys. No Google account
 * or credentials are used.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Google's signing key (for push tokens) and a fake service account key.
const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleJwk = { ...google.publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const serviceKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const calls = [];
global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (String(url).startsWith('https://www.googleapis.com/oauth2/v3/certs')) return json({ keys: [googleJwk] });
    if (String(url) === 'https://oauth2.googleapis.com/token') return json({ access_token: 'ya29.test', expires_in: 3600 });
    if (String(url).includes('/subscriptionsv2/tokens/missing')) return json({ error: { code: 404 } }, 404);
    if (String(url).includes('/subscriptionsv2/tokens/')) return json({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' });
    if (String(url).includes(':acknowledge')) return { ok: true, status: 204, text: async () => '' };
    return json({}, 500);
};

Object.assign(process.env, {
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'billing@vittova-test.iam.gserviceaccount.com', private_key: serviceKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    PLAY_PACKAGE_NAME: 'com.vittova.app',
    PLAY_RTDN_AUDIENCE: 'https://api.vittova.test/api/pro/rtdn',
    PLAY_RTDN_SERVICE_ACCOUNT: 'rtdn-push@vittova-test.iam.gserviceaccount.com',
});
const play = require('../lib/playDeveloperApi');

function pushToken(claims = {}, { key = google.privateKey, header = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' } } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const body = { iss: 'https://accounts.google.com', aud: process.env.PLAY_RTDN_AUDIENCE, email: process.env.PLAY_RTDN_SERVICE_ACCOUNT, email_verified: true, iat: now, exp: now + 3600, ...claims };
    const h = b64url(JSON.stringify(header));
    const c = b64url(JSON.stringify(body));
    return `Bearer ${h}.${c}.${b64url(crypto.sign('RSA-SHA256', Buffer.from(`${h}.${c}`), key))}`;
}

test('a genuine Google push token is accepted', async () => {
    const claims = await play.verifyPushToken(pushToken());
    assert.equal(claims.email, process.env.PLAY_RTDN_SERVICE_ACCOUNT);
});

test('forged, tampered, expired or misdirected push tokens are rejected', async () => {
    const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const cases = {
        missing: undefined,
        garbage: 'Bearer abc',
        'signed by another key': pushToken({}, { key: attacker.privateKey }),
        'alg none': pushToken({}, { header: { alg: 'none', kid: 'test-kid' } }),
        'unknown kid': pushToken({}, { header: { alg: 'RS256', kid: 'other' } }),
        'wrong audience': pushToken({ aud: 'https://evil.example/rtdn' }),
        'wrong issuer': pushToken({ iss: 'https://evil.example' }),
        expired: pushToken({ exp: Math.floor(Date.now() / 1000) - 3600, iat: Math.floor(Date.now() / 1000) - 7200 }),
        'other sender': pushToken({ email: 'someone@gmail.com' }),
        'unverified sender': pushToken({ email_verified: false }),
    };
    for (const [name, header] of Object.entries(cases)) {
        await assert.rejects(play.verifyPushToken(header), (e) => e.status === 401, name);
    }
    const [h, c, s] = pushToken().slice(7).split('.');
    const tamperedClaims = b64url(JSON.stringify({ ...JSON.parse(Buffer.from(c, 'base64').toString()), email: 'attacker@example.com' }));
    await assert.rejects(play.verifyPushToken(`Bearer ${h}.${tamperedClaims}.${s}`), (e) => e.status === 401, 'tampered claims');
});

test('push verification refuses to run unconfigured', async () => {
    const saved = process.env.PLAY_RTDN_AUDIENCE;
    delete process.env.PLAY_RTDN_AUDIENCE;
    await assert.rejects(play.verifyPushToken(pushToken()), /not configured/);
    process.env.PLAY_RTDN_AUDIENCE = saved;
});

test('the service account signs an androidpublisher token request, and calls are scoped to the package', async () => {
    calls.length = 0;
    const sub = await play.getSubscription('tok/with?odd&chars');
    assert.equal(sub.subscriptionState, 'SUBSCRIPTION_STATE_ACTIVE');

    const tokenCall = calls.find((c) => c.url === 'https://oauth2.googleapis.com/token');
    const assertion = new URLSearchParams(String(tokenCall.options.body)).get('assertion');
    const [h, c, s] = assertion.split('.');
    assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${c}`), serviceKey.publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')));
    const claims = JSON.parse(Buffer.from(c, 'base64').toString());
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');

    const apiCall = calls.find((x) => x.url.includes('subscriptionsv2'));
    assert.equal(apiCall.url, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.vittova.app/purchases/subscriptionsv2/tokens/tok%2Fwith%3Fodd%26chars');
    assert.equal(apiCall.options.headers.Authorization, 'Bearer ya29.test');
});

test('an unknown purchase token is reported as not found, not as an outage', async () => {
    await assert.rejects(play.getSubscription('missing'), (e) => e.code === 'PURCHASE_NOT_FOUND');
});

test('acknowledge posts to the subscription acknowledge endpoint', async () => {
    calls.length = 0;
    await play.acknowledgeSubscription('vittova_pro', 'tok1');
    assert.ok(calls.some((c) => c.options.method === 'POST' && c.url.endsWith('/purchases/subscriptions/vittova_pro/tokens/tok1:acknowledge')));
});

test('billing is unconfigured without a valid service account', () => {
    const saved = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{not json';
    assert.equal(play.isConfigured(), false);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = saved;
    assert.equal(play.isConfigured(), true);
});
