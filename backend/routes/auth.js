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

/**
 * @route   POST /api/auth/profile
 * @desc    Create the signed-in user's profile row if it is missing, and
 *          return it. Idempotent.
 *
 * The signup trigger normally creates the row. Accounts created before the
 * trigger existed (or while it was failing) have none, and without it the app
 * cannot load at all. Only default values are written: nothing the client
 * sends is used, so this cannot set Pro, role, ban or quota fields.
 * @access  Protected
 */
router.post('/profile', protect, async (req, res) => {
    const existing = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', req.user.id).maybeSingle();
    if (existing.error) {
        console.error('Ensure profile read error:', existing.error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
    if (existing.data) return res.json({ success: true, created: false, user: existing.data });

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(req.user.id);
    if (authError || !authUser?.user) {
        console.error('Ensure profile auth lookup failed:', authError?.message || 'no user');
        return res.status(500).json({ success: false, message: 'Server error creating profile' });
    }
    const meta = authUser.user.user_metadata || {};
    const fullName = String(meta.full_name || meta.name || '').slice(0, 120);

    const { error: insertError } = await supabase
        .from('profiles')
        .upsert({ id: req.user.id, email: authUser.user.email, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true });
    if (insertError) {
        console.error('Ensure profile insert failed:', insertError.message);
        return res.status(500).json({ success: false, message: 'Server error creating profile' });
    }

    const created = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', req.user.id).maybeSingle();
    if (created.error || !created.data) {
        return res.status(500).json({ success: false, message: 'Server error creating profile' });
    }
    res.status(201).json({ success: true, created: true, user: created.data });
});

module.exports = router;
module.exports.PROFILE_COLUMNS = PROFILE_COLUMNS;
