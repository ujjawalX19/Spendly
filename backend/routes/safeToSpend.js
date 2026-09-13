const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { z } = require('zod');
const { validationError } = require('../lib/validation');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];

// ---------------------------------------------------------------------------
// @route   GET /api/safe-to-spend
// @desc    Calculate safe-to-spend amount for the current day
// @access  Protected
//
// Formula: monthly_budget − total_spent_this_month − upcoming_recurring_bills − investment_target
// Then divided by remaining days to get daily safe amount.
// Pure math — no financial advice, no license needed.
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    try {
        // 1. Get user profile (budget, investment target)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('monthly_budget, investment_target')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        const monthlyBudget = Number(profile.monthly_budget) || 5000;
        const investmentTarget = Number(profile.investment_target) || 0;

        // 2. Get total spent this month.
        //    Boundaries are computed in the app timezone (IST), not the
        //    server's UTC clock — see lib/appTime.js for why that matters.
        const now = new Date();
        const monthStart = appTime.startOfMonth(now);

        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount')
            .eq('user_id', req.user.id)
            .gte('occurred_at', monthStart.toISOString());

        if (expError) {
            return res.status(500).json({ success: false, message: 'Could not load expenses' });
        }

        const totalSpentThisMonth = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

        // 3. Get upcoming recurring bills (bills due on or after today this month)
        const todayDay = appTime.dayOfMonth(now);

        const { data: bills, error: billsError } = await supabase
            .from('recurring_bills')
            .select('amount, due_day')
            .eq('user_id', req.user.id)
            .eq('is_active', true);

        let upcomingBills = 0;
        if (!billsError && bills) {
            upcomingBills = bills
                .filter(b => b.due_day >= todayDay)
                .reduce((sum, b) => sum + Number(b.amount), 0);
        }

        // 4. Calculate safe-to-spend
        const safeToSpendMonth = monthlyBudget - totalSpentThisMonth - upcomingBills - investmentTarget;
        const daysRemaining = appTime.daysRemainingInMonth(now); // Including today
        const safeToSpendDaily = Math.max(0, Math.round(safeToSpendMonth / daysRemaining));
        const safeToSpendTotal = Math.max(0, Math.round(safeToSpendMonth));

        res.json({
            success: true,
            safeToSpend: {
                daily: safeToSpendDaily,
                remaining: safeToSpendTotal,
                monthlyBudget,
                totalSpent: Math.round(totalSpentThisMonth),
                upcomingBills: Math.round(upcomingBills),
                investmentTarget,
                daysRemaining,
                isNegative: safeToSpendMonth < 0,
                overBy: safeToSpendMonth < 0 ? Math.abs(Math.round(safeToSpendMonth)) : 0,
            }
        });
    } catch (error) {
        console.error('Safe-to-Spend Error:', error);
        res.status(500).json({ success: false, message: 'Failed to calculate safe-to-spend' });
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/safe-to-spend/bills
// @desc    Get all recurring bills for the user
// @access  Protected
// ---------------------------------------------------------------------------
router.get('/bills', protect, async (req, res) => {
    const { data: bills, error } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('user_id', req.user.id)
        .order('due_day', { ascending: true });

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch bills' });
    }

    res.json({ success: true, bills: bills || [] });
});

// ---------------------------------------------------------------------------
// @route   POST /api/safe-to-spend/bills
// @desc    Add a recurring bill
// @access  Protected
// ---------------------------------------------------------------------------
const billSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    amount: z.coerce.number().positive('Amount must be positive').max(10_000_000),
    due_day: z.coerce.number().int().min(1, 'due_day must be between 1 and 31').max(31, 'due_day must be between 1 and 31'),
    category: z.enum(VALID_CATEGORIES).optional().default('Other'),
}).strict();

router.post('/bills', protect, async (req, res) => {
    const parsed = billSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data: bill, error } = await supabase
        .from('recurring_bills')
        .insert({ user_id: req.user.id, ...parsed.data })
        .select()
        .single();

    if (error) {
        console.error('Error adding recurring bill:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to add bill' });
    }

    res.status(201).json({ success: true, bill });
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/safe-to-spend/bills/:id
// @desc    Delete a recurring bill
// @access  Protected
// ---------------------------------------------------------------------------
router.delete('/bills/:id', protect, async (req, res) => {
    if (!UUID_RE.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid bill id' });
    }

    const { data: deleted, error } = await supabase
        .from('recurring_bills')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id')
        .maybeSingle();

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to delete bill' });
    }
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    res.json({ success: true });
});

module.exports = router;
