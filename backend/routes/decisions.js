const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { userApiLimiter } = require('../middleware/rateLimits');
const { validationError } = require('../lib/validation');
const { buildFacts } = require('../lib/financialInsights');
const { affordCheck, monthShape, safeToInvest, sipStressTest } = require('../lib/moneyDecisions');
const { loadFinanceData, ProfileMissingError } = require('../lib/financeData');

/**
 * Money decisions (v1.1): Afford-It Check, Month Shape, Safe-to-Invest and
 * the SIP Stress Test.
 *
 * Every figure comes from lib/moneyDecisions over lib/financialInsights facts,
 * the same calculation Vittova AI and the dashboard use. Nothing here calls a
 * language model. Amounts the user types are used for the answer only and are
 * not stored.
 *
 * Checks (Afford-It, SIP) use the daily `money_check` quota for Free users;
 * the two read-only views do not.
 */

const MAX_AMOUNT = 10_000_000;

const amountField = (label) => z.coerce.number({ error: `Enter the ${label} in rupees.` })
    .finite(`Enter the ${label} in rupees.`)
    .positive(`The ${label} must be more than ₹0.`)
    .max(MAX_AMOUNT, `The ${label} can be at most ₹1,00,00,000.`);

const affordSchema = z.object({
    amount: amountField('price'),
    label: z.string().trim().max(60, 'Keep the description under 60 characters.').optional(),
}).strict();

const sipSchema = z.object({
    monthlyAmount: amountField('monthly amount'),
}).strict();

function validate(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed.error);
        req.valid = parsed.data;
        return next();
    };
}

async function factsFor(userId) {
    const now = new Date();
    return buildFacts({ ...(await loadFinanceData(userId, now)), now });
}

function sendError(res, error) {
    if (error instanceof ProfileMissingError) {
        return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: "We couldn't find your Vittova profile. Close and reopen the app to finish setting up your account." });
    }
    console.error('Decisions: data load failed:', error?.code || error?.name || 'Error');
    return res.status(503).json({ success: false, code: 'DATA_UNAVAILABLE', message: "We couldn't load your numbers just now. Please try again in a moment." });
}

// @route POST /api/decisions/afford — Afford-It Check
router.post('/afford', protect, userApiLimiter, validate(affordSchema), proGate('money_check'), async (req, res) => {
    try {
        const facts = await factsFor(req.user.id);
        const label = req.valid.label || null;
        res.json({ success: true, check: affordCheck(facts, { amount: req.valid.amount, label }), quota: res.locals.quota || null });
    } catch (error) {
        sendError(res, error);
    }
});

// @route POST /api/decisions/sip-stress-test — cash-flow check for a monthly SIP
router.post('/sip-stress-test', protect, userApiLimiter, validate(sipSchema), proGate('money_check'), async (req, res) => {
    try {
        const facts = await factsFor(req.user.id);
        res.json({ success: true, test: sipStressTest(facts, { monthlyAmount: req.valid.monthlyAmount }), quota: res.locals.quota || null });
    } catch (error) {
        sendError(res, error);
    }
});

// @route GET /api/decisions/month-shape — how the rest of the month may look
router.get('/month-shape', protect, userApiLimiter, async (req, res) => {
    try {
        res.json({ success: true, monthShape: monthShape(await factsFor(req.user.id)) });
    } catch (error) {
        sendError(res, error);
    }
});

// @route GET /api/decisions/safe-to-invest — spare cash-flow figure, education only
router.get('/safe-to-invest', protect, userApiLimiter, async (req, res) => {
    try {
        res.json({ success: true, safeToInvest: safeToInvest(await factsFor(req.user.id)) });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
