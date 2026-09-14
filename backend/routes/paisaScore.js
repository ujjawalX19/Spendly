const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { computePaisaScore, weekStartKey } = require('../lib/paisaScore');

const DISCLAIMER = 'Spend Score: a Vittova habits score based only on your Vittova data. Not a credit score and not affiliated with CIBIL, Experian, Equifax, CRIF or any credit bureau.';

// @route GET /api/paisa-score — score out of 100 with explained components
router.get('/', protect, async (req, res) => {
    try {
        const now = new Date();
        const [{ data: profile, error: pErr }, { data: expenses, error: eErr }] = await Promise.all([
            supabase.from('profiles').select('monthly_budget, streak_current').eq('id', req.user.id).maybeSingle(),
            supabase.from('expenses')
                .select('amount, occurred_at')
                .eq('user_id', req.user.id)
                .gte('occurred_at', appTime.startOfMonthsAgo(4, now).toISOString()),
        ]);
        if (pErr || !profile) return res.status(500).json({ success: false, message: 'Could not load profile' });
        if (eErr) return res.status(500).json({ success: false, message: 'Could not load expenses' });

        const score = computePaisaScore({ expenses: expenses || [], monthlyBudget: profile.monthly_budget, streakCurrent: profile.streak_current, now });
        const weekStart = weekStartKey(now);

        let previousScore = null;
        if (score.total !== null) {
            // A weekly change is only shown against a real earlier snapshot on the same 0–100 scale.
            const { data: previous } = await supabase
                .from('paisa_scores')
                .select('score, week_start')
                .eq('user_id', req.user.id)
                .lt('week_start', weekStart)
                .lte('score', 100)
                .order('week_start', { ascending: false })
                .limit(1);
            previousScore = previous && previous.length ? previous[0].score : null;

            const { error: snapErr } = await supabase.from('paisa_scores').upsert({
                user_id: req.user.id,
                week_start: weekStart,
                score: score.total,
                savings_rate: score.components.savingsConsistency.score ?? 0,
                budget_adherence: score.components.budgetDiscipline.score ?? 0,
                streak_bonus: score.components.loggingHabit.score ?? 0,
                investment: score.components.spendingStability.score ?? 0,
                no_zombie_subs: score.components.dailyConsistency.score ?? 0,
            }, { onConflict: 'user_id,week_start' });
            if (snapErr) console.error('Paisa score snapshot failed:', snapErr.message);

            await supabase.from('profiles').update({ paisa_score: score.total }).eq('id', req.user.id);
        }

        res.json({
            success: true,
            paisaScore: {
                ...score,
                previousScore,
                change: previousScore === null || score.total === null ? null : score.total - previousScore,
                weekStart,
                disclaimer: DISCLAIMER,
            },
        });
    } catch (error) {
        console.error('Paisa score error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to calculate Spend Score' });
    }
});

// @route GET /api/paisa-score/history — last 12 weekly snapshots (0–100)
router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('paisa_scores')
        .select('score, week_start')
        .eq('user_id', req.user.id)
        .lte('score', 100)
        .order('week_start', { ascending: false })
        .limit(12);
    if (error) return res.status(500).json({ success: false, message: 'Failed to fetch score history' });
    res.json({ success: true, history: data || [] });
});

module.exports = router;
