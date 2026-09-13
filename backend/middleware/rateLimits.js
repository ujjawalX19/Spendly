/**
 * rateLimits — every request limiter in one place.
 *
 * WHY THE OLD LIMITER WAS BROKEN
 * ------------------------------
 * The app never told Express it runs behind Render's load balancer, so
 * `req.ip` was the balancer's address for every request. The single
 * 200-requests-per-15-minutes bucket was therefore shared by the entire user
 * base: a few dozen people opening the dashboard would lock everyone out.
 * `app.set('trust proxy', …)` (see app.js) fixes the IP; this module then
 * layers limits by what a request costs:
 *
 *   ipLimiter           every /api request, per client IP   — flood protection
 *   authFailureLimiter  per IP, counts only 401 responses   — token guessing
 *   userApiLimiter      per signed-in user                  — ordinary API use
 *   aiLimiter           per user, short burst + hourly cap  — Gemini costs money
 *   receiptScanLimiter  per user, hourly                    — image + Gemini
 *   pdfImportLimiter    per user, hourly                    — upload + parse + Gemini
 *   exportLimiter       per user, hourly                    — full-table scan
 *
 * Signed-in limits are keyed on the verified user id, not the IP, so users
 * behind the same carrier-grade NAT (common on Indian mobile networks) do not
 * throttle each other on normal use.
 *
 * Daily/monthly *product* quotas (e.g. 10 AI messages a day on the free tier)
 * are not rate limits and live in proGate.js.
 *
 * Every limiter sends the IETF draft-8 `RateLimit` / `RateLimit-Policy`
 * headers plus `Retry-After` when it rejects.
 */

const { rateLimit, ipKeyGenerator, MemoryStore } = require('express-rate-limit');

const stores = [];

function jsonHandler(message) {
    return (req, res, _next, options) => {
        const resetTime = req.rateLimit?.resetTime;
        const retryAfterSeconds = resetTime
            ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
            : Math.ceil(options.windowMs / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
            success: false,
            code: 'RATE_LIMITED',
            message,
            retryAfterSeconds,
        });
    };
}

function make({ name, windowMs, limit, message, keyGenerator, ...rest }) {
    const store = new MemoryStore();
    stores.push(store);
    return rateLimit({
        windowMs,
        limit,
        store,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        identifier: name,
        keyGenerator,
        handler: jsonHandler(message),
        ...rest,
    });
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/**
 * Header carrying the real client address, set by the edge in front of the app.
 *
 * Verified in production on 2026-09-13: behind Render + Cloudflare, req.ip with
 * TRUST_PROXY=1 was Render's internal address (10.x) for every request, so all
 * clients shared one IP bucket. Cloudflare sets CF-Connecting-IP and overwrites
 * any client-supplied value, and the Render origin is only reachable through
 * Cloudflare, so the header is trustworthy there.
 *
 * CLIENT_IP_HEADER overrides the choice; set it to "none" to use req.ip.
 */
function clientIpHeaderName() {
    const configured = process.env.CLIENT_IP_HEADER;
    if (configured) return configured.toLowerCase() === 'none' ? null : configured.toLowerCase();
    return process.env.RENDER ? 'cf-connecting-ip' : null;
}

/** @returns {{ip: string, source: string}} */
function resolveClientIp(req) {
    const header = clientIpHeaderName();
    if (header) {
        const value = String(req.headers[header] || '').trim();
        if (value && !value.includes(',') && (IPV4.test(value) || IPV6.test(value))) {
            return { ip: value, source: header };
        }
    }
    return { ip: req.ip || '', source: 'req.ip' };
}

const byIp = (req) => ipKeyGenerator(resolveClientIp(req).ip);
const byUser = (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${byIp(req)}`);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const ipLimiter = make({
    name: 'ip',
    windowMs: 15 * MINUTE,
    limit: 600,
    keyGenerator: byIp,
    message: 'Too many requests from this network. Please wait a few minutes and try again.',
});

const authFailureLimiter = make({
    name: 'auth-failures',
    windowMs: 15 * MINUTE,
    limit: 30,
    keyGenerator: byIp,
    // Only failed authentication attempts count toward this limit.
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
});

const userApiLimiter = make({
    name: 'user-api',
    windowMs: 15 * MINUTE,
    limit: 300,
    keyGenerator: byUser,
    message: 'You are making requests too quickly. Please slow down and try again shortly.',
});

const aiBurstLimiter = make({
    name: 'ai-burst',
    windowMs: MINUTE,
    limit: 5,
    keyGenerator: byUser,
    message: 'Please wait a moment before sending another question.',
});

const aiHourlyLimiter = make({
    name: 'ai-hourly',
    windowMs: HOUR,
    limit: 30,
    keyGenerator: byUser,
    message: 'You have asked a lot of questions this hour. Please try again later.',
});

const receiptScanLimiter = make({
    name: 'receipt-scan',
    windowMs: HOUR,
    limit: 10,
    keyGenerator: byUser,
    message: 'Too many receipt scans in a short time. Please try again later.',
});

const pdfImportLimiter = make({
    name: 'pdf-import',
    windowMs: HOUR,
    limit: 5,
    keyGenerator: byUser,
    message: 'Too many statement imports in a short time. Please try again later.',
});

const exportLimiter = make({
    name: 'export',
    windowMs: HOUR,
    limit: 10,
    keyGenerator: byUser,
    message: 'Too many exports in a short time. Please try again later.',
});

/** Both AI limiters, in order. Place after `protect`. */
const aiLimiter = [aiBurstLimiter, aiHourlyLimiter];

/** Clear every counter. Tests only. */
async function resetRateLimits() {
    await Promise.all(stores.map((s) => s.resetAll()));
}

/**
 * Parse TRUST_PROXY into what Express accepts.
 *   '1', '2'           -> number of proxy hops to trust (Render: 1)
 *   'true' / 'false'   -> boolean (true is unsafe: any client can spoof its IP)
 *   anything else      -> passed through (e.g. 'loopback', a CIDR list)
 */
function parseTrustProxy(value) {
    if (value === undefined || value === null || value === '') return false;
    const v = String(value).trim();
    if (/^\d+$/.test(v)) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
}

module.exports = {
    ipLimiter,
    authFailureLimiter,
    userApiLimiter,
    aiLimiter,
    receiptScanLimiter,
    pdfImportLimiter,
    exportLimiter,
    resetRateLimits,
    parseTrustProxy,
    resolveClientIp,
};
