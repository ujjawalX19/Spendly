const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { streakStatus } = require('../lib/streak');
const { applyProfileStats } = require('../lib/profileStats');

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
        const today = appTime.localDateKey(); // local YYYY-MM-DD, not UTC

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

        // Streak health, evaluated in local calendar days.
        const status = streakStatus(profile.streak_last_log, anyCompleted, new Date());

        res.json({
            success: true,
            streak: {
                current: profile.streak_current,
                longest: profile.streak_longest,
                freezesRemaining: profile.streak_freezes_remaining,
                status,
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

    const today = appTime.localDateKey();

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

        // Same atomic streak update used when logging an expense.
        await applyProfileStats(req.user.id, { chillar: 0, advance: true });

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
            .select('streak_freezes_remaining, streak_last_log')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        const remaining = Number(profile.streak_freezes_remaining) || 0;
        if (remaining <= 0) {
            return res.status(400).json({ success: false, code: 'NO_FREEZES', message: 'You have no streak freezes left.' });
        }

        // A freeze covers exactly one missed day: the last activity was the day
        // before yesterday. It cannot resurrect a streak broken days ago, and
        // is not needed while the streak is still intact.
        const now = new Date();
        const gap = profile.streak_last_log ? appTime.calendarDaysBetween(new Date(profile.streak_last_log), now) : null;
        if (gap !== 2) {
            return res.status(400).json({
                success: false,
                code: 'FREEZE_NOT_APPLICABLE',
                message: gap !== null && gap < 2 ? 'Your streak is not broken, so no freeze is needed.' : 'A freeze can only cover a single missed day.',
            });
        }

        const { year, month, day } = appTime.zonedParts(now);
        const yesterdayNoon = appTime.zonedTimeToUtc(year, month, day - 1, 12, 0, 0);

        // Compare-and-set so two taps cannot spend one freeze twice.
        const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({ streak_freezes_remaining: remaining - 1, streak_last_log: yesterdayNoon.toISOString() })
            .eq('id', req.user.id)
            .eq('streak_freezes_remaining', remaining)
            .eq('streak_last_log', profile.streak_last_log)
            .select('streak_freezes_remaining');

        if (updateError) throw updateError;
        if (!updated || updated.length !== 1) {
            return res.status(409).json({ success: false, message: 'Your streak changed just now. Please refresh and try again.' });
        }

        res.json({
            success: true,
            message: 'Streak freeze used. Your streak is safe.',
            freezesRemaining: updated[0].streak_freezes_remaining,
        });
    } catch (error) {
        console.error('Streak freeze error:', error);
        res.status(500).json({ success: false, message: 'Failed to use streak freeze' });
    }
});

module.exports = router;
