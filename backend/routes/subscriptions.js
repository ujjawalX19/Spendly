const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');

// ---------------------------------------------------------------------------
// @route   GET /api/subscriptions/detect
// @desc    Scan expenses for recurring subscription patterns and zombie subs
// @access  Protected (Pro-only in frontend gating)
//
// Algorithm:
// 1. Fetch last 4 months of expenses
// 2. Group by merchant (description) similarity
// 3. Find patterns: same merchant ±10% amount, every 28-35 days
// 4. Flag as "zombie" if no related expense in last 30 days
// Pure pattern detection — no financial advice.
// ---------------------------------------------------------------------------
router.get('/detect', protect, async (req, res) => {
    try {
        // Fetch last 4 months of expenses
        const fourMonthsAgo = appTime.startOfMonthsAgo(4);

        const { data: expenses, error } = await supabase
            .from('expenses')
            .select('id, amount, description, category, occurred_at')
            .eq('user_id', req.user.id)
            .gte('occurred_at', fourMonthsAgo.toISOString())
            .order('occurred_at', { ascending: true });

        if (error) {
            return res.status(500).json({ success: false, message: 'Failed to fetch expenses' });
        }

        if (!expenses || expenses.length < 2) {
            return res.json({ success: true, subscriptions: [], totalWaste: 0 });
        }

        // Group expenses by normalized merchant name
        const merchantGroups = {};
        for (const exp of expenses) {
            const key = normalizeMerchant(exp.description);
            if (!key) continue;
            if (!merchantGroups[key]) merchantGroups[key] = [];
            merchantGroups[key].push(exp);
        }

        const subscriptions = [];
        const now = new Date();

        for (const [merchant, group] of Object.entries(merchantGroups)) {
            if (group.length < 2) continue;

            // Sort by date
            group.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

            // Check for recurring pattern (28-35 day intervals, ±10% amount)
            const intervals = [];
            const amounts = group.map(e => Number(e.amount));
            const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;

            let isRecurring = true;
            for (let i = 1; i < group.length; i++) {
                const daysDiff = Math.round(
                    (new Date(group[i].occurred_at) - new Date(group[i - 1].occurred_at)) / (1000 * 60 * 60 * 24)
                );
                intervals.push(daysDiff);

                // Check amount similarity (±15% tolerance)
                const amountDiff = Math.abs(Number(group[i].amount) - Number(group[i - 1].amount));
                if (amountDiff / avgAmount > 0.15) {
                    isRecurring = false;
                    break;
                }
            }

            // Check if intervals are roughly monthly (25-38 day range)
            const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
            if (!isRecurring || avgInterval < 25 || avgInterval > 38) continue;

            // Check if it's a "zombie" — last payment was 30+ days ago
            const lastPayment = new Date(group[group.length - 1].occurred_at);
            const daysSinceLastPayment = Math.round((now - lastPayment) / (1000 * 60 * 60 * 24));
            const isZombie = daysSinceLastPayment > 30;

            // Calculate total spent on this subscription
            const totalSpent = amounts.reduce((s, a) => s + a, 0);
            const monthlyAmount = Math.round(avgAmount);

            subscriptions.push({
                merchant: group[0].description,
                normalizedName: merchant,
                monthlyAmount,
                totalSpent: Math.round(totalSpent),
                monthsDetected: group.length,
                lastPayment: group[group.length - 1].occurred_at,
                daysSinceLastPayment,
                isZombie,
                category: group[0].category,
                avgInterval: Math.round(avgInterval),
            });
        }

        // Sort: zombies first, then by monthly amount desc
        subscriptions.sort((a, b) => {
            if (a.isZombie !== b.isZombie) return a.isZombie ? -1 : 1;
            return b.monthlyAmount - a.monthlyAmount;
        });

        const totalWaste = subscriptions
            .filter(s => s.isZombie)
            .reduce((sum, s) => sum + s.monthlyAmount, 0);

        const totalMonthlySubscriptions = subscriptions
            .reduce((sum, s) => sum + s.monthlyAmount, 0);

        res.json({
            success: true,
            subscriptions,
            totalWaste,
            totalMonthlySubscriptions,
            zombieCount: subscriptions.filter(s => s.isZombie).length,
            activeCount: subscriptions.filter(s => !s.isZombie).length,
        });
    } catch (error) {
        console.error('Subscription detection error:', error);
        res.status(500).json({ success: false, message: 'Failed to detect subscriptions' });
    }
});

// ---------------------------------------------------------------------------
// Helper: Normalize merchant name for grouping
// "Netflix Monthly" and "NETFLIX" should match
// ---------------------------------------------------------------------------
function normalizeMerchant(desc) {
    if (!desc) return null;
    return desc
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 2) // Take first 2 words as the merchant identifier
        .join(' ');
}

module.exports = router;
