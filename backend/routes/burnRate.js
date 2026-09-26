const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const gemini = require('../lib/gemini');
const appTime = require('../lib/appTime');
const { computeBurnRate } = require('../lib/burnRate');
const { effectiveMonthlyBudget } = require('../lib/safeToSpend');
const { TtlCache } = require('../lib/ttlCache');

/**
 * GET /api/burn-rate — spending forecast for the current IST month.
 *
 * Labelled a "spending forecast", not financial advice.
 *
 * AI COST: the optional one-line AI tip used to be generated on every dashboard
 * load for any user projected to overspend. It is now generated at most once
 * per user per IST day per forecast situation, and cached.
 */

const tipCache = new TtlCache({ maxEntries: 10000, ttlMs: 24 * 60 * 60 * 1000 });

async function aiTipFor(userId, forecast, now) {
    if (!gemini.isConfigured() || !forecast.willGoBroke || !forecast.topCategory) return null;

    // The key changes only when the situation meaningfully changes: a new day,
    // a different top category, or spending moving to a different ₹500 band.
    const key = [
        userId,
        appTime.localDateKey(now),
        forecast.topCategory.category,
        Math.floor(forecast.totalSpent / 500),
    ].join('|');

    const cached = tipCache.get(key);
    if (cached !== undefined) return cached;

    let tip = null;
    try {
        const prompt = `Write ONE practical, specific tip (max 20 words, no markdown, no product or brand names, no links) for someone in India who has spent ₹${forecast.totalSpent} of a ₹${forecast.monthlyBudget} monthly budget with ${forecast.daysRemaining} days left. Their largest discretionary category is ${forecast.topCategory.category} at ₹${forecast.topCategory.amount}.`;
        const text = await gemini.generateText(prompt, { maxOutputTokens: 60 });
        tip = text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '').trim().slice(0, 200) || null;
    } catch (e) {
        console.error('Burn-rate AI tip failed:', e.code || e.name);
    }
    // Cache failures too, so an outage does not trigger a call per page load.
    tipCache.set(key, tip);
    return tip;
}

router.get('/', protect, async (req, res) => {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('monthly_budget')
            .eq('id', req.user.id)
            .maybeSingle();

        if (profileError) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }
        if (!profile) {
            return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
        }

        const now = new Date();
        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount, category, occurred_at')
            .eq('user_id', req.user.id)
            .gte('occurred_at', appTime.startOfMonth(now).toISOString())
            .lt('occurred_at', appTime.startOfNextMonth(now).toISOString());

        if (expError) {
            return res.status(500).json({ success: false, message: 'Could not load expenses' });
        }

        const forecast = computeBurnRate({
            expenses: expenses || [],
            monthlyBudget: effectiveMonthlyBudget(profile),
            now,
        });
        const aiSuggestion = await aiTipFor(req.user.id, forecast, now);

        res.json({ success: true, burnRate: { ...forecast, aiSuggestion } });
    } catch (error) {
        console.error('Burn rate error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to calculate burn rate' });
    }
});

module.exports = router;
module.exports._tipCache = tipCache;
