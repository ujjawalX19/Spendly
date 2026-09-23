/**
 * playBilling — server-side Google Play subscription verification and the
 * Vittova Pro entitlement it produces.
 *
 *   Google Play purchase ─► app sends ONLY the purchase token
 *     ─► backend asks Google (subscriptionsv2.get) ─► checks product, state,
 *        expiry and that the purchase was made for THIS account
 *     ─► stores the entitlement (play_purchases) ─► acknowledges
 *     ─► recomputes profiles.is_pro / pro_expires_at.
 *
 * The client can never grant Pro: no route accepts is_pro, an expiry, a
 * price or a "purchase succeeded" flag, and a token is bound to the first
 * account that verifies it. Renewals, cancellations, grace periods, holds,
 * expiry, refunds and revocations reach us as real-time developer
 * notifications (routes/pro.js → refreshByToken) and are re-read from Google;
 * the notification body is never trusted. /api/pro/status also re-verifies
 * stale entitlements, in case a notification was missed.
 *
 * Purchases are OFF unless PLAY_BILLING_ENABLED=true AND a service account is
 * configured (lib/playDeveloperApi). See BILLING_ARCHITECTURE.md.
 */

const crypto = require('node:crypto');
const { supabase } = require('../config/supabase');
const play = require('./playDeveloperApi');

/** States in which the subscription still grants access until its expiry. */
const ENTITLED_STATES = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    // Auto-renew turned off: access continues until the paid period ends.
    'SUBSCRIPTION_STATE_CANCELED',
]);
const REVERIFY_AFTER_MS = 12 * 3600 * 1000;

class BillingError extends Error {
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function productIds() {
    return String(process.env.PLAY_PRO_PRODUCT_IDS || 'vittova_pro').split(',').map((s) => s.trim()).filter(Boolean);
}

function purchasesEnabled() {
    return process.env.PLAY_BILLING_ENABLED === 'true' && play.isConfigured() && productIds().length > 0;
}

/** Stable, non-reversible id the app passes to Google as obfuscatedAccountId. */
function accountIdFor(userId) {
    return crypto.createHash('sha256').update(`vittova-account:${userId}`).digest('hex');
}

const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Decide what a subscriptionsv2 resource means for this user. Pure.
 * @returns {{ok:boolean, code?:string, productId?:string, state?:string, expiresAt?:string|null, entitled?:boolean, needsAck?:boolean, linkedTokenHash?:string|null, orderId?:string|null, testPurchase?:boolean}}
 */
function evaluateSubscription(sub, { userId, now = new Date() }) {
    const items = Array.isArray(sub?.lineItems) ? sub.lineItems : [];
    const ours = items.filter((i) => productIds().includes(i.productId));
    if (!ours.length) return { ok: false, code: 'UNKNOWN_PRODUCT' };

    const bound = sub?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (!bound || bound !== accountIdFor(userId)) return { ok: false, code: 'ACCOUNT_MISMATCH' };

    const expiries = ours.map((i) => Date.parse(i.expiryTime)).filter(Number.isFinite);
    const expiry = expiries.length ? Math.max(...expiries) : null;
    const state = String(sub.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED');
    const entitled = ENTITLED_STATES.has(state) && expiry !== null && expiry > now.getTime();

    return {
        ok: true,
        productId: ours[0].productId,
        state,
        expiresAt: expiry !== null ? new Date(expiry).toISOString() : null,
        entitled,
        needsAck: entitled && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
        linkedTokenHash: sub.linkedPurchaseToken ? tokenHash(sub.linkedPurchaseToken) : null,
        orderId: sub.latestOrderId || null,
        testPurchase: Boolean(sub.testPurchase),
    };
}

async function readSubscription(purchaseToken) {
    try {
        return await play.getSubscription(purchaseToken);
    } catch (e) {
        if (e.code === 'PURCHASE_NOT_FOUND') throw new BillingError('INVALID_PURCHASE', 400, 'Google Play does not recognise this purchase.');
        throw new BillingError('PLAY_UNAVAILABLE', 503, "We couldn't reach Google Play to check your purchase. Please try again shortly.");
    }
}

/** Set profiles.is_pro / pro_expires_at from the user's Play entitlements. Manual grants are left alone. */
async function recomputeProfile(userId, now = new Date()) {
    const [{ data: profile, error: pErr }, { data: rows, error: rErr }] = await Promise.all([
        supabase.from('profiles').select('is_pro, pro_expires_at, pro_source').eq('id', userId).maybeSingle(),
        supabase.from('play_purchases').select('entitled, expires_at').eq('user_id', userId).eq('entitled', true),
    ]);
    if (pErr || rErr) throw new BillingError('DB_UNAVAILABLE', 503, 'Could not update your Pro status.');
    if (!profile || profile.pro_source === 'manual') return;

    const active = (rows || []).map((r) => Date.parse(r.expires_at)).filter((t) => Number.isFinite(t) && t > now.getTime());
    const update = active.length
        ? { is_pro: true, pro_expires_at: new Date(Math.max(...active)).toISOString(), pro_source: 'play' }
        : { is_pro: false, pro_source: profile.pro_source === 'play' ? 'play' : null };
    if (!active.length && profile.pro_source !== 'play') return; // never touched by billing
    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) throw new BillingError('DB_UNAVAILABLE', 503, 'Could not update your Pro status.');
}

async function saveRow(userId, token, result, now) {
    const row = {
        user_id: userId,
        token_hash: tokenHash(token),
        purchase_token: token,
        product_id: result.productId,
        state: result.state,
        expires_at: result.expiresAt,
        entitled: result.entitled,
        order_id: result.orderId,
        linked_token_hash: result.linkedTokenHash,
        test_purchase: result.testPurchase,
        last_verified_at: now.toISOString(),
    };
    const { error } = await supabase.from('play_purchases').upsert(row, { onConflict: 'token_hash' });
    if (error) throw new BillingError('DB_UNAVAILABLE', 503, 'Could not record your purchase. Please try again.');
    // An upgrade or resubscription replaces the earlier token.
    if (result.linkedTokenHash) {
        await supabase.from('play_purchases').update({ entitled: false, state: 'SUPERSEDED' }).eq('token_hash', result.linkedTokenHash).eq('user_id', userId);
    }
}

/**
 * Verify a purchase token the app received from Google Play and, if it is a
 * genuine Vittova Pro subscription bought by this account, store it.
 */
async function verifyAndStore(userId, purchaseToken, now = new Date()) {
    const hash = tokenHash(purchaseToken);
    const { data: existing, error } = await supabase.from('play_purchases').select('user_id').eq('token_hash', hash).maybeSingle();
    if (error) throw new BillingError('DB_UNAVAILABLE', 503, 'Could not check your purchase. Please try again.');
    if (existing && existing.user_id !== userId) {
        throw new BillingError('PURCHASE_ALREADY_USED', 409, 'This purchase is already linked to another Vittova account.');
    }

    const sub = await readSubscription(purchaseToken);
    const result = evaluateSubscription(sub, { userId, now });
    if (!result.ok) {
        if (result.code === 'ACCOUNT_MISMATCH') throw new BillingError('ACCOUNT_MISMATCH', 403, 'This purchase was made for a different Vittova account.');
        throw new BillingError('UNKNOWN_PRODUCT', 400, 'This purchase is not a Vittova Pro subscription.');
    }

    await saveRow(userId, purchaseToken, result, now);
    if (result.needsAck) {
        try {
            await play.acknowledgeSubscription(result.productId, purchaseToken);
            await supabase.from('play_purchases').update({ acknowledged: true }).eq('token_hash', hash);
        } catch (e) {
            // Not fatal now: the purchase is verified. It will be retried on the
            // next status check, well within Google's three-day window.
            console.error('Play acknowledge failed:', e.code || e.message);
        }
    }
    await recomputeProfile(userId, now);
    return result;
}

/** Re-read one stored purchase from Google (a notification or a stale entitlement). */
async function refreshStored(row, now = new Date()) {
    const sub = await readSubscription(row.purchase_token);
    const result = evaluateSubscription(sub, { userId: row.user_id, now });
    const update = result.ok
        ? { state: result.state, expires_at: result.expiresAt, entitled: result.entitled, order_id: result.orderId, last_verified_at: now.toISOString() }
        : { entitled: false, state: result.code, last_verified_at: now.toISOString() };
    await supabase.from('play_purchases').update(update).eq('token_hash', row.token_hash);
    if (result.ok && result.needsAck && !row.acknowledged) {
        try {
            await play.acknowledgeSubscription(result.productId, row.purchase_token);
            await supabase.from('play_purchases').update({ acknowledged: true }).eq('token_hash', row.token_hash);
        } catch (e) {
            console.error('Play acknowledge retry failed:', e.code || e.message);
        }
    }
    await recomputeProfile(row.user_id, now);
    return result;
}

/** RTDN: a notification names a token; re-read it from Google. Unknown tokens are ignored. */
async function refreshByToken(purchaseToken, now = new Date()) {
    const { data: row, error } = await supabase.from('play_purchases').select('*').eq('token_hash', tokenHash(purchaseToken)).maybeSingle();
    if (error) throw new BillingError('DB_UNAVAILABLE', 503, 'database unavailable');
    if (!row) return { unknown: true };
    return refreshStored(row, now);
}

/** Re-verify this user's entitlements that are stale or past expiry. Best effort. */
async function reconcileUser(userId, now = new Date()) {
    const { data: rows, error } = await supabase.from('play_purchases').select('*').eq('user_id', userId).eq('entitled', true);
    if (error || !rows?.length) return;
    for (const row of rows) {
        const stale = !row.last_verified_at || now.getTime() - Date.parse(row.last_verified_at) > REVERIFY_AFTER_MS;
        const expired = row.expires_at && Date.parse(row.expires_at) <= now.getTime();
        if (stale || expired || !row.acknowledged) {
            try { await refreshStored(row, now); } catch (e) { console.error('Play reconcile failed:', e.code || e.message); }
        }
    }
}

module.exports = {
    purchasesEnabled,
    productIds,
    accountIdFor,
    tokenHash,
    evaluateSubscription,
    verifyAndStore,
    refreshByToken,
    reconcileUser,
    recomputeProfile,
    BillingError,
    ENTITLED_STATES,
};
