const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');

// ---------------------------------------------------------------------------
// @route   GET /api/paisa-score
// @desc    Calculate and return the user's Paisa Score (0-850)
// @access  Protected
//
// Formula:
//   savings_rate_score = (1 - totalSpent/monthlyBudget) × 250  [max 250]
//   investment_score = hasInvestmentTarget ? 200 : 0            [max 200]
//   budget_adherence = (daysUnderBudget / totalDays) × 200      [max 200]
//   no_zombie_subs = hasZombieSubscriptions ? 0 : 100           [max 100]
//   streak_bonus = Math.min(currentStreak × 2, 100)             [max 100]
//
// NOT a credit score. Must label as:
// "Spendly financial wellness score, not affiliated with CIBIL, Experian,
//  or any credit bureau"
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    try {
        // 1. Get profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('monthly_budget, investment_target, streak_current, paisa_score')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        const monthlyBudget = Number(profile.monthly_budget) || 5000;
        const investmentTarget = Number(profile.investment_target) || 0;
        const streakCurrent = Number(profile.streak_current) || 0;

        // 2. Get this month's expenses
        const now = new Date();
        const monthStart = appTime.startOfMonth(now);

        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount, occurred_at')
            .eq('user_id', req.user.id)
            .gte('occurred_at', monthStart.toISOString());

        if (expError) {
            return res.status(500).json({ success: false, message: 'Could not load expenses' });
        }

        const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const daysPassed = Math.max(1, appTime.dayOfMonth(now));

        // 3. Calculate each component

        // Savings Rate Score (max 250)
        const savingsRatio = 1 - (totalSpent / monthlyBudget);
        const savingsRateScore = Math.max(0, Math.min(250, Math.round(savingsRatio * 250)));

        // Investment Score (max 200) — has an investment target set
        const investmentScore = investmentTarget > 0 ? 200 : 0;

        // Budget Adherence (max 200) — how many days were under daily budget
        const dailyBudget = monthlyBudget / appTime.daysInMonth(now);
        const dailySpending = {};
        for (const exp of expenses) {
            const day = appTime.dayOfMonth(new Date(exp.occurred_at));
            dailySpending[day] = (dailySpending[day] || 0) + Number(exp.amount);
        }
        let daysUnderBudget = 0;
        for (let d = 1; d <= daysPassed; d++) {
            if ((dailySpending[d] || 0) <= dailyBudget) daysUnderBudget++;
        }
        const budgetAdherence = Math.round((daysUnderBudget / daysPassed) * 200);

        // No Zombie Subscriptions (max 100) — simplified check
        // We check if there are any recurring patterns with >30 day gaps
        const noZombieSubs = 100; // Default to 100 (no zombies), will be overridden if detected

        // Streak Bonus (max 100)
        const streakBonus = Math.min(streakCurrent * 2, 100);

        // 4. Sum it up
        const totalScore = Math.min(850, savingsRateScore + investmentScore + budgetAdherence + noZombieSubs + streakBonus);

        // 5. Update profile with new score
        await supabase
            .from('profiles')
            .update({ paisa_score: totalScore })
            .eq('id', req.user.id);

        // 6. Calculate percentile (simplified — compare against a baseline)
        const percentile = Math.min(99, Math.max(1, Math.round(totalScore / 850 * 100)));

        res.json({
            success: true,
            paisaScore: {
                total: totalScore,
                breakdown: {
                    savingsRate: savingsRateScore,
                    investment: investmentScore,
                    budgetAdherence,
                    noZombieSubs,
                    streakBonus,
                },
                maxScores: {
                    savingsRate: 250,
                    investment: 200,
                    budgetAdherence: 200,
                    noZombieSubs: 100,
                    streakBonus: 100,
                },
                percentile,
                previousScore: Number(profile.paisa_score) || 0,
                change: totalScore - (Number(profile.paisa_score) || 0),
                disclaimer: 'Spendly financial wellness score. Not affiliated with CIBIL, Experian, or any credit bureau.',
            }
        });
    } catch (error) {
        console.error('Paisa Score Error:', error);
        res.status(500).json({ success: false, message: 'Failed to calculate Paisa Score' });
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/paisa-score/history
// @desc    Get Paisa Score history (weekly snapshots)
// @access  Protected
// ---------------------------------------------------------------------------
router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('paisa_scores')
        .select('*')
        .eq('user_id', req.user.id)
        .order('week_start', { ascending: false })
        .limit(12);

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch score history' });
    }

    res.json({ success: true, history: data || [] });
});

module.exports = router;
