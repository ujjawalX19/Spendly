const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// ─── supabaseAdmin is the same service-role client ───────────
// The backend's `supabase` client is already initialised with
// SUPABASE_SERVICE_ROLE_KEY, so it bypasses RLS by default.
const supabaseAdmin = supabase;

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE: requireAdmin
// Verifies the Bearer JWT, resolves the user profile, and
// confirms the `role` column equals 'admin'.
// ═══════════════════════════════════════════════════════════════

const requireAdmin = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — no token provided'
        });
    }

    // Verify the JWT via Supabase Auth
    const { data: authData, error: authError } =
        await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — invalid or expired token'
        });
    }

    // Fetch the profile to check the `role` column
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — profile not found'
        });
    }

    if (profile.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden — admin access required'
        });
    }

    // Attach admin user info to the request
    req.user = {
        id: authData.user.id,
        email: authData.user.email,
        role: profile.role
    };

    next();
};

// ═══════════════════════════════════════════════════════════════
// @route   GET /api/admin/users
// @desc    Fetch all users (id, full_name, email, role,
//          is_banned, karma_score)
// @access  Admin only
// ═══════════════════════════════════════════════════════════════

router.get('/users', requireAdmin, async (req, res) => {
    const { data: users, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role, is_banned, karma_score')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Admin — error fetching users:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error fetching users'
        });
    }

    res.json({ success: true, users });
});

// ═══════════════════════════════════════════════════════════════
// @route   POST /api/admin/users/:id/ban
// @desc    Toggle the `is_banned` status of a user
// @access  Admin only
// ═══════════════════════════════════════════════════════════════

router.post('/users/:id/ban', requireAdmin, async (req, res) => {
    const { id } = req.params;

    // Prevent admins from banning themselves
    if (id === req.user.id) {
        return res.status(400).json({
            success: false,
            message: 'You cannot ban yourself'
        });
    }

    // Fetch current ban status
    const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('is_banned')
        .eq('id', id)
        .single();

    if (fetchError || !profile) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    // Toggle
    const newStatus = !profile.is_banned;

    const { data: updated, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_banned: newStatus })
        .eq('id', id)
        .select('id, full_name, email, role, is_banned, karma_score')
        .single();

    if (updateError) {
        console.error('Admin — error toggling ban status:', updateError);
        return res.status(500).json({
            success: false,
            message: 'Server error updating ban status'
        });
    }

    res.json({
        success: true,
        message: `User ${newStatus ? 'banned' : 'unbanned'} successfully`,
        user: updated
    });
});

// ═══════════════════════════════════════════════════════════════
// @route   GET /api/admin/expenses/recent
// @desc    Fetch the latest 50 expenses across ALL users
// @access  Admin only
// ═══════════════════════════════════════════════════════════════

router.get('/expenses/recent', requireAdmin, async (req, res) => {
    const { data: expenses, error } = await supabaseAdmin
        .from('expenses')
        .select('id, user_id, amount, category, description, source, receipt_data, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Admin — error fetching recent expenses:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error fetching recent expenses'
        });
    }

    res.json({ success: true, expenses });
});

// ═══════════════════════════════════════════════════════════════
// @route   DELETE /api/admin/expenses/:id
// @desc    Hard-delete an anomalous expense (any user's)
// @access  Admin only
// ═══════════════════════════════════════════════════════════════

router.delete('/expenses/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;

    const { error } = await supabaseAdmin
        .from('expenses')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Admin — error deleting expense:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error deleting expense'
        });
    }

    res.json({ success: true, message: 'Expense deleted' });
});

module.exports = router;
