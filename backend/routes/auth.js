const express = require('express');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Sign-up, sign-in, password reset and OAuth are handled by Supabase Auth
 * directly from the app, which applies its own server-side rate limits
 * (configure them in Supabase → Authentication → Rate Limits).
 *
 * The backend previously also exposed POST /signup and POST /login proxies.
 * Nothing used them, and they were an extra credential-stuffing surface running
 * with the service-role key, so they were removed.
 */

// Columns a client may see about its own account. Deliberately excludes
// quota counters' internals and anything admin-only beyond the user's own role.
const PROFILE_COLUMNS = [
    'id', 'email', 'full_name', 'role', 'monthly_budget', 'investment_target',
    'karma_score', 'streak_current', 'streak_longest', 'streak_last_log',
    'streak_freezes_remaining', 'total_chillar', 'paisa_score',
    'is_pro', 'pro_expires_at', 'created_at',
].join(', ');

/**
 * @route   GET /api/auth/me
 * @desc    The signed-in user's profile
 * @access  Protected
 */
router.get('/me', protect, async (req, res) => {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', req.user.id)
        .maybeSingle();

    if (error) {
        console.error('Get profile error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
    if (!profile) {
        return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
    }

    res.json({ success: true, user: profile });
});

module.exports = router;
module.exports.PROFILE_COLUMNS = PROFILE_COLUMNS;
