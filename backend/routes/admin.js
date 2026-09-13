const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect, invalidateBanCache } = require('../middleware/authMiddleware');

/**
 * Admin API.
 *
 * Admin status is server-controlled: `profiles.role` can be changed only with
 * the service-role key (clients have no UPDATE grant on it — see
 * supabase/v1_2_security_p0.sql) and no API route accepts a role from a request.
 * Promote an operator manually in the Supabase SQL editor.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs after `protect`; re-reads the role from the database on every request. */
const requireAdmin = async (req, res, next) => {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ success: false, message: 'Could not verify permissions' });
    }
    if (!profile || profile.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden — admin access required' });
    }
    req.user.role = 'admin';
    next();
};

router.use(protect, requireAdmin);

// @route GET /api/admin/users
router.get('/users', async (req, res) => {
    const { data: users, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_banned, karma_score, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) {
        console.error('Admin: error fetching users:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching users' });
    }
    res.json({ success: true, users });
});

// @route POST /api/admin/users/:id/ban — toggle suspension
router.post('/users/:id/ban', async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    if (id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot ban yourself' });
    }

    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('is_banned, role')
        .eq('id', id)
        .maybeSingle();

    if (fetchError || !profile) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (profile.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Remove admin role before suspending this account' });
    }

    const newStatus = !profile.is_banned;
    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ is_banned: newStatus })
        .eq('id', id)
        .select('id, full_name, email, role, is_banned, karma_score')
        .single();

    if (updateError) {
        console.error('Admin: error toggling ban:', updateError.message);
        return res.status(500).json({ success: false, message: 'Server error updating ban status' });
    }
    invalidateBanCache(id);

    // Also block new sessions at the auth layer. The profile flag (checked in
    // `protect`) already blocks the API; this stops token refresh.
    const { error: authBanError } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: newStatus ? '876000h' : 'none',
    });
    if (authBanError) console.error('Admin: auth-level ban update failed:', authBanError.message);

    console.log(`Admin action: ${req.user.id} set is_banned=${newStatus} on ${id}`);
    res.json({ success: true, message: `User ${newStatus ? 'suspended' : 'reinstated'}`, user: updated });
});

// @route GET /api/admin/expenses/recent — latest 50 expenses across users (no receipt contents)
router.get('/expenses/recent', async (req, res) => {
    const { data: expenses, error } = await supabase
        .from('expenses')
        .select('id, user_id, amount, category, description, source, occurred_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Admin: error fetching recent expenses:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching recent expenses' });
    }
    res.json({ success: true, expenses });
});

// @route DELETE /api/admin/expenses/:id
router.delete('/expenses/:id', async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    const { data: deleted, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('Admin: error deleting expense:', error.message);
        return res.status(500).json({ success: false, message: 'Server error deleting expense' });
    }
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    console.log(`Admin action: ${req.user.id} deleted expense ${id}`);
    res.json({ success: true, message: 'Expense deleted' });
});

module.exports = router;
