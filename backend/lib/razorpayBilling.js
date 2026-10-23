/**
 * razorpayBilling — Vittova Pro passes paid through Razorpay (website and the
 * Indus Appstore build; the Google Play build uses Play Billing only).
 *
 * A pass is a one-time payment, not a subscription: nothing renews and no
 * mandate is created. Paying again before a pass ends adds the new period
 * after the current one.
 *
 *   POST /api/pro/razorpay/order   server creates a Razorpay order for a plan;
 *                                  the amount is the server's, never the client's
 *   Razorpay Checkout              the user pays
 *   POST /api/pro/razorpay/verify  checkout's signature is checked, THEN the
 *                                  payment is re-read from Razorpay (paid, same
 *                                  order, same amount) before Pro is granted
 *   POST /api/pro/razorpay/webhook signed by Razorpay; catches payments whose
 *                                  verify call never arrived, and refunds
 *
 * A row in razorpay_payments is bound to the account that created the order;
 * a payment can only ever complete that order. Granting is idempotent: the
 * row moves from 'created' to 'paid' once, so verify and the webhook racing
 * each other grant one period.
 *
 * Off unless RAZORPAY_ENABLED=true AND keys are configured (lib/razorpayApi).
 */

const crypto = require('node:crypto');
const { supabase } = require('../config/supabase');
const api = require('./razorpayApi');
const { recomputePro } = require('./proEntitlement');

const DAY = 86400000;
/** Same prices as Google Play. Amounts in paise. */
const PLANS = Object.freeze({
    monthly: { key: 'monthly', amount: 4900, days: 30, label: 'Pro for 30 days' },
    yearly: { key: 'yearly', amount: 44900, days: 365, label: 'Pro for 1 year' },
});

class RazorpayBillingError extends Error {
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
const dbError = () => new RazorpayBillingError('DB_UNAVAILABLE', 503, 'Could not record your payment. Please try again.');

function enabled() {
    return process.env.RAZORPAY_ENABLED === 'true' && api.isConfigured();
}

function publicPlans() {
    return Object.values(PLANS).map(({ key, amount, days, label }) => ({ key, amount, currency: 'INR', days, label }));
}

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Checkout's signature: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
function validPaymentSignature(orderId, paymentId, signature, secret = api.keySecret()) {
    if (!secret || !orderId || !paymentId || !signature) return false;
    return safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
function validWebhookSignature(rawBody, signature, secret = api.webhookSecret()) {
    if (!secret || !rawBody || !signature) return false;
    return safeEqual(hmac(secret, rawBody), signature);
}

async function activeProFromOtherSource(userId, now) {
    const { data, error } = await supabase.from('profiles').select('is_pro, pro_expires_at, pro_source').eq('id', userId).maybeSingle();
    if (error) throw dbError();
    if (!data?.is_pro || data.pro_source === 'razorpay') return null;
    const live = !data.pro_expires_at || Date.parse(data.pro_expires_at) > now.getTime();
    return live ? (data.pro_source || 'manual') : null;
}

async function createOrder(userId, planKey, now = new Date()) {
    const plan = PLANS[planKey];
    if (!plan) throw new RazorpayBillingError('UNKNOWN_PLAN', 400, 'Choose a plan.');
    // Pro already paid through Google Play, or granted: paying again would be wasted.
    const other = await activeProFromOtherSource(userId, now);
    if (other) {
        throw new RazorpayBillingError('ALREADY_PRO', 409, other === 'play'
            ? 'Pro is already active through Google Play on this account.'
            : 'Pro is already active on this account.');
    }
    let order;
    try {
        order = await api.createOrder({
            amount: plan.amount,
            currency: 'INR',
            receipt: `vp_${crypto.randomBytes(8).toString('hex')}`,
            notes: { plan: plan.key, product: 'vittova_pro_pass' },
        });
    } catch {
        throw new RazorpayBillingError('RAZORPAY_UNAVAILABLE', 503, "We couldn't reach Razorpay. Please try again shortly.");
    }
    if (!order?.id || order.amount !== plan.amount || order.currency !== 'INR') {
        throw new RazorpayBillingError('RAZORPAY_UNAVAILABLE', 503, "We couldn't start the payment. Please try again.");
    }
    const { error } = await supabase.from('razorpay_payments').insert({
        order_id: order.id,
        user_id: userId,
        plan: plan.key,
        amount_paise: plan.amount,
        currency: 'INR',
        status: 'created',
    });
    if (error) throw dbError();
    return { orderId: order.id, amount: plan.amount, currency: 'INR', plan: plan.key, label: plan.label, keyId: api.keyId() };
}

/** Re-read a payment from Razorpay; capture it if it is only authorized. */
async function readPaidPayment(paymentId, row) {
    let payment;
    try {
        payment = await api.getPayment(paymentId);
    } catch (e) {
        if (e.code === 'RAZORPAY_NOT_FOUND') throw new RazorpayBillingError('INVALID_PAYMENT', 400, 'Razorpay does not recognise this payment.');
        throw new RazorpayBillingError('RAZORPAY_UNAVAILABLE', 503, "We couldn't confirm your payment with Razorpay yet. It is safe; Pro turns on once Razorpay confirms it.");
    }
    if (payment.order_id !== row.order_id) throw new RazorpayBillingError('ORDER_MISMATCH', 400, 'This payment belongs to a different order.');
    if (payment.amount !== row.amount_paise || payment.currency !== row.currency) throw new RazorpayBillingError('AMOUNT_MISMATCH', 400, 'The payment amount does not match the plan.');
    if (payment.status === 'authorized') {
        try {
            payment = await api.capturePayment(paymentId, row.amount_paise, row.currency);
        } catch {
            throw new RazorpayBillingError('RAZORPAY_UNAVAILABLE', 503, "We couldn't confirm your payment with Razorpay yet. It is safe; Pro turns on once Razorpay confirms it.");
        }
    }
    return payment;
}

/** The new period starts when this user's latest paid pass ends, or now. */
async function nextPeriodStart(userId, now) {
    const { data, error } = await supabase.from('razorpay_payments').select('period_end').eq('user_id', userId).eq('status', 'paid');
    if (error) throw dbError();
    const ends = (data || []).map((r) => Date.parse(r.period_end)).filter((t) => Number.isFinite(t) && t > now.getTime());
    return new Date(ends.length ? Math.max(...ends) : now.getTime());
}

/**
 * Grant the pass for one order once Razorpay confirms the payment. Safe to
 * call repeatedly (verify, webhook, retries): only the first call grants.
 * @returns {{status:'paid'|'pending'|'failed'|'refunded', periodEnd?:string|null}}
 */
async function settleOrder(row, paymentId, now = new Date()) {
    if (row.status === 'paid' || row.status === 'refunded') return { status: row.status, periodEnd: row.period_end };
    const payment = await readPaidPayment(paymentId, row);
    // A failed attempt leaves the order open: Checkout lets the user retry it.
    if (payment.status === 'failed') return { status: 'failed' };
    if (payment.status !== 'captured') return { status: 'pending' };

    const start = await nextPeriodStart(row.user_id, now);
    const end = new Date(start.getTime() + PLANS[row.plan].days * DAY);
    const { data: moved, error } = await supabase.from('razorpay_payments')
        .update({ status: 'paid', payment_id: paymentId, period_start: start.toISOString(), period_end: end.toISOString(), paid_at: now.toISOString() })
        .eq('order_id', row.order_id)
        .eq('status', 'created')
        .select('order_id, period_end');
    if (error) throw dbError();
    if (!moved?.length) {
        // Someone else (the webhook, or a retry) settled it first.
        const { data: current } = await supabase.from('razorpay_payments').select('status, period_end').eq('order_id', row.order_id).maybeSingle();
        return { status: current?.status || 'paid', periodEnd: current?.period_end };
    }
    try { await recomputePro(row.user_id, now); } catch { throw dbError(); }
    return { status: 'paid', periodEnd: end.toISOString() };
}

async function loadOrder(orderId) {
    const { data, error } = await supabase.from('razorpay_payments').select('*').eq('order_id', orderId).maybeSingle();
    if (error) throw dbError();
    return data;
}

/** Checkout finished in the browser/app: check its signature, then confirm with Razorpay. */
async function verifyCheckout(userId, { orderId, paymentId, signature }, now = new Date()) {
    const row = await loadOrder(orderId);
    if (!row || row.user_id !== userId) throw new RazorpayBillingError('ORDER_NOT_FOUND', 404, 'This payment was not started from your account.');
    if (!validPaymentSignature(orderId, paymentId, signature)) throw new RazorpayBillingError('BAD_SIGNATURE', 400, "This payment couldn't be verified.");
    return settleOrder(row, paymentId, now);
}

/** A refund: re-read the payment and end the pass only if Razorpay says it was refunded in full. */
async function refundOrder(row, paymentId, now = new Date()) {
    let payment;
    try {
        payment = await api.getPayment(paymentId);
    } catch {
        throw new RazorpayBillingError('RAZORPAY_UNAVAILABLE', 503, 'Razorpay could not be reached.');
    }
    if (payment.order_id !== row.order_id) return { status: row.status };
    const full = payment.status === 'refunded' || Number(payment.amount_refunded) >= row.amount_paise;
    if (!full) return { status: row.status };
    const { error } = await supabase.from('razorpay_payments').update({ status: 'refunded', refunded_at: now.toISOString() }).eq('order_id', row.order_id);
    if (error) throw dbError();
    try { await recomputePro(row.user_id, now); } catch { throw dbError(); }
    return { status: 'refunded' };
}

/**
 * A verified webhook event. Only pointers are taken from the body (order and
 * payment ids); the payment itself is always re-read from Razorpay.
 * Unknown orders (not created by Vittova) are ignored.
 */
async function handleWebhook(event, now = new Date()) {
    const payment = event?.payload?.payment?.entity;
    const refund = event?.payload?.refund?.entity;
    const paymentId = payment?.id || refund?.payment_id;
    const orderId = payment?.order_id || event?.payload?.order?.entity?.id;
    if (!paymentId) return { ignored: true };

    let row = orderId ? await loadOrder(orderId) : null;
    if (!row) {
        const { data } = await supabase.from('razorpay_payments').select('*').eq('payment_id', paymentId).maybeSingle();
        row = data;
    }
    if (!row) return { ignored: true };

    switch (event.event) {
        case 'payment.captured':
        case 'payment.authorized':
        case 'order.paid':
        case 'payment.failed':
            return settleOrder(row, paymentId, now);
        case 'refund.processed':
        case 'refund.created':
        case 'payment.refunded':
            return refundOrder(row, paymentId, now);
        default:
            return { ignored: true };
    }
}

/** The user's passes, newest first, for the Pro screen. No payment ids. */
async function history(userId) {
    const { data, error } = await supabase.from('razorpay_payments')
        .select('plan, amount_paise, status, period_start, period_end, paid_at')
        .eq('user_id', userId)
        .in('status', ['paid', 'refunded'])
        .order('paid_at', { ascending: false })
        .limit(12);
    if (error) return [];
    return data || [];
}

module.exports = {
    PLANS,
    enabled,
    publicPlans,
    validPaymentSignature,
    validWebhookSignature,
    createOrder,
    verifyCheckout,
    handleWebhook,
    history,
    RazorpayBillingError,
};
