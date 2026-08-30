const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// @route   GET /api/streaks
// @desc    Get current streak data and daily mission status
// @access  Protected
//
// Daily missions (complete any ONE):
//   - Log one expense
//   - Read one AI tip (check safe-to-spend)
//   - Check Safe-to-Spend number
// Streak breaks at midnight if no activity.
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('streak_current, streak_longest, streak_last_log, streak_freezes_remaining')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        // Check today's completed activities
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const { data: activities, error: actError } = await supabase
            .from('streak_activities')
            .select('activity')
            .eq('user_id', req.user.id)
            .eq('activity_date', today);

        const completedToday = (activities || []).map(a => a.activity);

        const missions = [
            { id: 'log_expense', label: 'Log one expense', completed: completedToday.includes('log_expense') },
            { id: 'read_tip', label: 'Read one AI tip', completed: completedToday.includes('read_tip') },
            { id: 'check_safe_to_spend', label: 'Check Safe-to-Spend', completed: completedToday.includes('check_safe_to_spend') },
        ];

        const anyCompleted = completedToday.length > 0;

        // Check if streak should have broken (no activity yesterday + no freeze)
        let streakStatus = 'active';
        const now = new Date();
        const lastLog = profile.streak_last_log ? new Date(profile.streak_last_log) : null;

        if (lastLog) {
            const lastLogDay = new Date(lastLog.getFullYear(), lastLog.getMonth(), lastLog.getDate());
            const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffDays = Math.round((todayDay - lastLogDay) / (1000 * 60 * 60 * 24));

            if (diffDays > 1) {
                streakStatus = 'broken';
            } else if (diffDays === 1 && !anyCompleted) {
                streakStatus = 'at_risk';
            }
        }

        res.json({
            success: true,
            streak: {
                current: profile.streak_current,
                longest: profile.streak_longest,
                freezesRemaining: profile.streak_freezes_remaining,
                status: streakStatus,
                todayCompleted: anyCompleted,
                missions,
                lastActivity: profile.streak_last_log,
            }
        });
    } catch (error) {
        console.error('Streak Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load streak data' });
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/streaks/check-in
// @desc    Record a daily streak activity
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/check-in', protect, async (req, res) => {
    const { activity } = req.body;
    const VALID_ACTIVITIES = ['log_expense', 'read_tip', 'check_safe_to_spend'];

    if (!activity || !VALID_ACTIVITIES.includes(activity)) {
        return res.status(400).json({
            success: false,
            message: `activity must be one of: ${VALID_ACTIVITIES.join(', ')}`
        });
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        // Insert activity (unique constraint handles duplicates)
        const { error: actError } = await supabase
            .from('streak_activities')
            .insert({
                user_id: req.user.id,
                activity,
                activity_date: today,
            });

        if (actError && actError.code === '23505') {
            // Already completed this activity today
            return res.json({ success: true, message: 'Already completed today', alreadyDone: true });
        }

        if (actError) throw actError;

        // Update streak (reuse the existing streak logic from expenses.js)
        const { data: profile } = await supabase
            .from('profiles')
            .select('streak_current, streak_last_log, streak_longest')
            .eq('id', req.user.id)
            .single();

        if (profile) {
            const now = new Date();
            const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let newStreak = profile.streak_current;

            if (profile.streak_last_log) {
                const lastLog = new Date(profile.streak_last_log);
                const lastLogDay = new Date(lastLog.getFullYear(), lastLog.getMonth(), lastLog.getDate());
                const diffDays = Math.round((todayDate - lastLogDay) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    // Already logged today — streak unchanged
                } else if (diffDays === 1) {
                    newStreak = profile.streak_current + 1;
                } else {
                    newStreak = 1; // Streak broken
                }
            } else {
                newStreak = 1;
            }

            const newLongest = Math.max(newStreak, profile.streak_longest);

            await supabase
                .from('profiles')
                .update({
                    streak_current: newStreak,
                    streak_longest: newLongest,
                    streak_last_log: now.toISOString(),
                })
                .eq('id', req.user.id);
        }

        res.json({ success: true, message: 'Activity recorded!', activity });
    } catch (error) {
        console.error('Streak check-in error:', error);
        res.status(500).json({ success: false, message: 'Failed to record activity' });
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/streaks/freeze
// @desc    Use a streak freeze to prevent streak from breaking
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/freeze', protect, async (req, res) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('streak_freezes_remaining')
            .eq('id', req.user.id)
            .single();

        if (error || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        if (profile.streak_freezes_remaining <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No streak freezes remaining. Purchase more from the store.',
                requiresPurchase: true,
            });
        }

        // Use one freeze
        await supabase
            .from('profiles')
            .update({
                streak_freezes_remaining: profile.streak_freezes_remaining - 1,
                streak_last_log: new Date().toISOString(), // Treat as if they logged today
            })
            .eq('id', req.user.id);

        res.json({
            success: true,
            message: 'Streak freeze used! Your streak is safe.',
            freezesRemaining: profile.streak_freezes_remaining - 1,
        });
    } catch (error) {
        console.error('Streak freeze error:', error);
        res.status(500).json({ success: false, message: 'Failed to use streak freeze' });
    }
});

module.exports = router;
