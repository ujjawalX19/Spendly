/**
 * playDeveloperApi — the small part of the Google Play Developer API that
 * Vittova Pro needs, plus verification of Google-signed Pub/Sub push tokens.
 *
 * Uses Node's crypto and fetch only (no googleapis dependency):
 *   - a service-account JWT is exchanged for an OAuth access token
 *     (scope androidpublisher), cached until shortly before it expires;
 *   - purchases.subscriptionsv2.get reads a subscription by purchase token;
 *   - purchases.subscriptions.acknowledge acknowledges it (Play refunds
 *     purchases that are not acknowledged within three days).
 *
 * CONFIGURATION (Render environment, never committed):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  the service account key JSON (or base64 of it)
 *                                     with "View financial data" + "Manage orders
 *                                     and subscriptions" in Play Console
 *   PLAY_PACKAGE_NAME                 defaults to com.vittova.app
 *   PLAY_RTDN_AUDIENCE                audience set on the Pub/Sub push subscription
 *   PLAY_RTDN_SERVICE_ACCOUNT         email of the push subscription's service account
 *
 * The module is replaceable in tests (require.cache injection), like gemini.js.
 */

const crypto = require('node:crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

class PlayApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        // 404/410: the token does not exist for this package — a forged or foreign token.
        this.code = status === 404 || status === 410 ? 'PURCHASE_NOT_FOUND' : status >= 500 || !status ? 'PLAY_UNAVAILABLE' : 'PLAY_REJECTED';
    }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function packageName() {
    return process.env.PLAY_PACKAGE_NAME || 'com.vittova.app';
}

/** The service account, or null when billing verification is not configured. */
function serviceAccount() {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try {
        const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        const json = JSON.parse(text);
        return json.client_email && json.private_key ? json : null;
    } catch {
        return null;
    }
}

function isConfigured() {
    return serviceAccount() !== null;
}

let cached = null; // { token, expiresAt }

async function accessToken() {
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const sa = serviceAccount();
    if (!sa) throw new PlayApiError('Play billing is not configured', 0);

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key));

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
    });
    if (!res.ok) throw new PlayApiError('Could not authenticate with Google Play', res.status);
    const data = await res.json();
    cached = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return cached.token;
}

async function call(method, url) {
    const token = await accessToken();
    let res;
    try {
        res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    } catch {
        throw new PlayApiError('Google Play could not be reached', 0);
    }
    if (!res.ok) throw new PlayApiError(`Google Play returned ${res.status}`, res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
}

/** purchases.subscriptionsv2.get — the source of truth for a subscription. */
function getSubscription(purchaseToken) {
    return call('GET', `${API}/${encodeURIComponent(packageName())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
}

/** purchases.subscriptions.acknowledge */
function acknowledgeSubscription(productId, purchaseToken) {
    return call('POST', `${API}/${encodeURIComponent(packageName())}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`);
}

// ─── Pub/Sub push authentication ────────────────────────────────────────────

let certs = null; // { keys: Map(kid -> KeyObject), fetchedAt }

async function googleKey(kid) {
    if (!certs || Date.now() - certs.fetchedAt > 3600_000 || !certs.keys.has(kid)) {
        const res = await fetch(GOOGLE_CERTS);
        if (!res.ok) throw new PlayApiError('Could not load Google signing keys', res.status);
        const { keys } = await res.json();
        certs = { fetchedAt: Date.now(), keys: new Map(keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])) };
    }
    return certs.keys.get(kid) || null;
}

/**
 * Verify the OIDC token Pub/Sub sends with a push: Google's signature, issuer,
 * audience, expiry and the push service account. Returns the claims or throws.
 */
async function verifyPushToken(authorizationHeader) {
    const audience = process.env.PLAY_RTDN_AUDIENCE;
    const pushAccount = process.env.PLAY_RTDN_SERVICE_ACCOUNT;
    if (!audience || !pushAccount) throw new PlayApiError('Real-time notifications are not configured', 0);

    const m = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(String(authorizationHeader || ''));
    if (!m) throw new PlayApiError('Missing push token', 401);
    let header;
    let claims;
    try {
        header = JSON.parse(fromB64url(m[1]).toString('utf8'));
        claims = JSON.parse(fromB64url(m[2]).toString('utf8'));
    } catch {
        throw new PlayApiError('Malformed push token', 401);
    }
    if (header.alg !== 'RS256' || !header.kid) throw new PlayApiError('Unexpected push token algorithm', 401);
    const key = await googleKey(header.kid);
    if (!key || !crypto.verify('RSA-SHA256', Buffer.from(`${m[1]}.${m[2]}`), key, fromB64url(m[3]))) {
        throw new PlayApiError('Invalid push token signature', 401);
    }
    const now = Math.floor(Date.now() / 1000);
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new PlayApiError('Wrong issuer', 401);
    if (claims.aud !== audience) throw new PlayApiError('Wrong audience', 401);
    if (!(claims.exp > now - 60) || !(claims.iat < now + 300)) throw new PlayApiError('Expired push token', 401);
    if (claims.email !== pushAccount || claims.email_verified !== true) throw new PlayApiError('Unexpected push sender', 401);
    return claims;
}

module.exports = { isConfigured, packageName, getSubscription, acknowledgeSubscription, verifyPushToken, PlayApiError };
