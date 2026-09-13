const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { detectSubscriptions } = require('../lib/subscriptions');

/**
 * GET /api/subscriptions/detect
 *
 * Recurring monthly charges found in the last four months of expenses.
 * Pattern detection over the user's own data — no advice. See
 * lib/subscriptions.js for what "active" and "lapsed" mean.
 */
router.get('/detect', protect, async (req, res) => {
    const { data: expenses, error } = await supabase
        .from('expenses')
        .select('amount, description, category, occurred_at')
        .eq('user_id', req.user.id)
        .gte('occurred_at', appTime.startOfMonthsAgo(4).toISOString())
        .order('occurred_at', { ascending: true });

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch expenses' });
    }

    res.json({ success: true, ...detectSubscriptions(expenses || [], new Date()) });
});

module.exports = router;
