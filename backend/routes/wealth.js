const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { computeWealth } = require('../lib/wealth');

// @route GET /api/wealth — budget position, 6-month history, round-ups, target
router.get('/', protect, async (req, res) => {
    try {
        const now = new Date();
        const [{ data: profile, error: pErr }, { data: expenses, error: eErr }, { data: bills, error: bErr }] = await Promise.all([
            supabase.from('profiles').select('monthly_budget, investment_target, total_chillar').eq('id', req.user.id).maybeSingle(),
            supabase.from('expenses')
                .select('amount, roundup_chillar, occurred_at')
                .eq('user_id', req.user.id)
                .gte('occurred_at', appTime.startOfMonthsAgo(5, now).toISOString()),
            supabase.from('recurring_bills').select('amount, due_day, is_active').eq('user_id', req.user.id),
        ]);
        if (pErr || !profile) return res.status(500).json({ success: false, message: 'Could not load profile' });
        if (eErr || bErr) return res.status(500).json({ success: false, message: 'Could not load your data' });

        res.json({ success: true, wealth: computeWealth({ profile, expenses: expenses || [], bills: bills || [], now }) });
    } catch (e) {
        console.error('Wealth error:', e.message);
        res.status(500).json({ success: false, message: 'Could not load wealth figures' });
    }
});

module.exports = router;
