const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { computePaisaScore, weekStartKey } = require('../lib/paisaScore');

const DISCLAIMER = 'Spendly spending-discipline score based only on your Spendly data. Not a credit score and not affiliated with CIBIL, Experian, Equifax, CRIF or any credit bureau.';

// @route GET /api/paisa-score — current score, component breakdown, weekly change
router.get('/', protect, async (req, res) => {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('monthly_budget, investment_target, streak_current')
            .eq('id', req.user.id)
            .maybeSingle();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        const now = new Date();
        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount, occurred_at')
            .eq('user_id', req.user.id)
            .gte('occurred_at', appTime.startOfMonth(now).toISOString());

        if (expError) {
            return res.status(500).json({ success: false, message: 'Could not load expenses' });
        }

        const score = computePaisaScore({
            expenses: expenses || [],
            monthlyBudget: profile.monthly_budget,
            investmentTarget: profile.investment_target,
            streakCurrent: profile.streak_current,
            now,
        });

        const weekStart = weekStartKey(now);

        // Weekly change compares with the most recent snapshot from an earlier
        // week. With no earlier snapshot there is no change to report.
        const { data: previous } = await supabase
            .from('paisa_scores')
            .select('score, week_start')
            .eq('user_id', req.user.id)
            .lt('week_start', weekStart)
            .order('week_start', { ascending: false })
            .limit(1);
        const previousScore = previous && previous.length ? previous[0].score : null;

        // Record (or refresh) this week's snapshot. Idempotent within a week.
        const { error: snapshotError } = await supabase
            .from('paisa_scores')
            .upsert({
                user_id: req.user.id,
                week_start: weekStart,
                score: score.total,
                savings_rate: score.breakdown.pace,
                budget_adherence: score.breakdown.dailyBudget,
                streak_bonus: score.breakdown.consistency,
                investment: score.breakdown.planning,
                no_zombie_subs: 0,
            }, { onConflict: 'user_id,week_start' });
        if (snapshotError) console.error('Paisa score snapshot failed:', snapshotError.message);

        await supabase.from('profiles').update({ paisa_score: score.total }).eq('id', req.user.id);

        res.json({
            success: true,
            paisaScore: {
                ...score,
                previousScore,
                change: previousScore === null ? null : score.total - previousScore,
                weekStart,
                disclaimer: DISCLAIMER,
            },
        });
    } catch (error) {
        console.error('Paisa score error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to calculate Paisa Score' });
    }
});

// @route GET /api/paisa-score/history — last 12 weekly snapshots
router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('paisa_scores')
        .select('score, week_start, savings_rate, budget_adherence, streak_bonus, investment')
        .eq('user_id', req.user.id)
        .order('week_start', { ascending: false })
        .limit(12);

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch score history' });
    }
    res.json({ success: true, history: data || [] });
});

module.exports = router;
