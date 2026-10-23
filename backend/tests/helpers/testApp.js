/**
 * Boot the real Express app against the in-memory Supabase fake and a stubbed
 * Gemini client. Each test file runs in its own process under `node --test`,
 * so module-cache injection here does not leak between files.
 */

const path = require('node:path');
const { createFakeSupabase } = require('./fakeSupabase');

function inject(modulePath, exports) {
    const resolved = require.resolve(modulePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

async function startTestApp({ env = {} } = {}) {
    Object.assign(process.env, {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://fake.supabase.local',
        SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
        ...env,
    });

    const db = createFakeSupabase();
    inject(path.join(__dirname, '../../config/supabase.js'), { supabase: db.client });

    const gemini = {
        configured: true,
        calls: [],
        reply: 'Here is a general explanation.',
        isConfigured() { return this.configured; },
        async generateText(contents, options) {
            this.calls.push({ contents, options });
            if (this.reply instanceof Error) throw this.reply;
            return typeof this.reply === 'function' ? this.reply(contents) : this.reply;
        },
        modelName: () => 'test-model',
    };
    inject(path.join(__dirname, '../../lib/gemini.js'), gemini);

    // A stand-in for the Google Play Developer API: tests put subscriptions in
    // `play.subs` (purchase token -> subscriptionsv2 resource).
    const play = {
        configured: true,
        down: false,
        subs: new Map(),
        acks: [],
        isConfigured() { return this.configured; },
        packageName: () => 'com.vittova.app',
        async getSubscription(token) {
            if (this.down) throw Object.assign(new Error('unavailable'), { code: 'PLAY_UNAVAILABLE', status: 503 });
            const sub = this.subs.get(token);
            if (!sub) throw Object.assign(new Error('not found'), { code: 'PURCHASE_NOT_FOUND', status: 404 });
            return JSON.parse(JSON.stringify(sub));
        },
        async acknowledgeSubscription(productId, token) {
            this.acks.push(token);
            const sub = this.subs.get(token);
            if (sub) sub.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
            return {};
        },
        async verifyPushToken(header) {
            if (header !== 'Bearer valid-google-push-token') throw Object.assign(new Error('bad push token'), { status: 401 });
            return { email: 'push@example.iam.gserviceaccount.com' };
        },
    };
    inject(path.join(__dirname, '../../lib/playDeveloperApi.js'), play);

    // A stand-in for Razorpay's Orders/Payments API: orders are created here
    // and tests put payments in `razorpay.payments` (payment id -> entity).
    // The key secret and webhook secret come from process.env, as in production.
    const razorpay = {
        configured: true,
        down: false,
        orders: new Map(),
        payments: new Map(),
        captures: [],
        isConfigured() { return this.configured; },
        keyId: () => 'rzp_test_vittova',
        keySecret: () => process.env.RAZORPAY_KEY_SECRET || '',
        webhookSecret: () => process.env.RAZORPAY_WEBHOOK_SECRET || '',
        RazorpayError: class extends Error {},
        async createOrder(order) {
            if (this.down) throw Object.assign(new Error('unavailable'), { code: 'RAZORPAY_UNAVAILABLE' });
            const id = `order_${Math.random().toString(36).slice(2, 16).padEnd(14, 'x')}`;
            const created = { id, entity: 'order', status: 'created', ...order };
            this.orders.set(id, created);
            return created;
        },
        async getPayment(id) {
            if (this.down) throw Object.assign(new Error('unavailable'), { code: 'RAZORPAY_UNAVAILABLE' });
            const p = this.payments.get(id);
            if (!p) throw Object.assign(new Error('not found'), { code: 'RAZORPAY_NOT_FOUND' });
            return { ...p };
        },
        async capturePayment(id) {
            this.captures.push(id);
            const p = this.payments.get(id);
            p.status = 'captured';
            return { ...p };
        },
    };
    inject(path.join(__dirname, '../../lib/razorpayApi.js'), razorpay);

    const { createApp } = require('../../app');
    const { resetRateLimits } = require('../../middleware/rateLimits');
    const app = createApp();

    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(method, url, { token, body, headers = {} } = {}) {
        const res = await fetch(`${base}${url}`, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, headers: res.headers, body: json, text };
    }

    return {
        base,
        db,
        gemini,
        play,
        razorpay,
        request,
        resetRateLimits,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

module.exports = { startTestApp };
