/**
 * razorpayApi — the few Razorpay REST calls Vittova makes (Orders and
 * Payments, https://api.razorpay.com/v1). Basic auth with the key id and
 * secret, which live only in the server environment:
 *
 *   RAZORPAY_KEY_ID          rzp_test_… or rzp_live_… (the browser may see this one)
 *   RAZORPAY_KEY_SECRET      never leaves the server
 *   RAZORPAY_WEBHOOK_SECRET  set on the webhook in the Razorpay dashboard
 *
 * Replaced by a stub in tests (tests/helpers/testApp.js → t.razorpay).
 */

const { withTimeout } = require('./timeout');

const BASE = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10000;

const keyId = () => String(process.env.RAZORPAY_KEY_ID || '').trim();
const keySecret = () => String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const webhookSecret = () => String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

function isConfigured() {
    return /^rzp_(test|live)_\w+$/.test(keyId()) && keySecret().length > 0;
}

class RazorpayError extends Error {
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

async function call(method, path, body) {
    const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
    let res;
    try {
        res = await withTimeout(fetch(`${BASE}${path}`, {
            method,
            headers: { Authorization: `Basic ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        }), TIMEOUT_MS);
    } catch {
        throw new RazorpayError('RAZORPAY_UNAVAILABLE', 503, 'Razorpay could not be reached.');
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 404 || res.status === 400) throw new RazorpayError('RAZORPAY_NOT_FOUND', res.status, json?.error?.description || 'Not found');
    if (!res.ok) throw new RazorpayError('RAZORPAY_UNAVAILABLE', 503, 'Razorpay returned an error.');
    return json;
}

module.exports = {
    isConfigured,
    keyId,
    keySecret,
    webhookSecret,
    RazorpayError,
    createOrder: (order) => call('POST', '/orders', order),
    getPayment: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}`),
    capturePayment: (paymentId, amount, currency) => call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency }),
};
