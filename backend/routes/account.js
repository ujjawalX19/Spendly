const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { validationError } = require('../lib/validation');
const telemetry = require('../lib/opsTelemetry');

/**
 * Tables holding a user's data, all with ON DELETE CASCADE from profiles,
 * which itself cascades from auth.users. Checked after deletion so the
 * endpoint never reports success while financial data is left behind.
 */
const USER_TABLES = [
    ['expenses', 'user_id'],
    ['recurring_bills', 'user_id'],
    ['streak_activities', 'user_id'],
    ['paisa_scores', 'user_id'],
    ['pdf_imports', 'user_id'],
    ['ai_chat_history', 'user_id'],
    ['group_members', 'user_id'],
    ['profiles', 'id'],
];

// ---------------------------------------------------------------------------
// @route   DELETE /api/account
// @desc    Permanently delete the account and all associated data
// @access  Protected
//
// Order matters. The auth user is deleted FIRST:
//   - it revokes every refresh token, so no device can obtain a new session;
//   - any still-unexpired access token fails `protect`, which re-checks the
//     user with Supabase Auth on every request;
//   - the cascade removes the profile and all user rows.
// The previous order (profile first, then auth user) could leave a live login
// with no profile if the second step failed, while reporting success.
//
// Groups the user created are deleted with them (groups.created_by cascades),
// including other members' shared entries in those groups.
// ---------------------------------------------------------------------------
router.delete('/', protect, async (req, res) => {
    if (req.body?.confirmation !== 'DELETE_MY_ACCOUNT') {
        return res.status(400).json({
            success: false,
            message: 'Please send { confirmation: "DELETE_MY_ACCOUNT" } to confirm.',
        });
    }

    const userId = req.user.id;

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
        console.error('Account deletion: auth user delete failed:', authError.message);
        return res.status(500).json({
            success: false,
            message: 'We could not delete your account. Nothing was removed. Please try again or contact support.',
        });
    }

    // Belt and braces: remove anything a missing cascade left behind, then verify.
    const leftovers = [];
    for (const [table, column] of USER_TABLES) {
        const { error: delError } = await supabase.from(table).delete().eq(column, userId);
        if (delError) {
            leftovers.push(table);
            continue;
        }
        const { data: remaining, error: checkError } = await supabase.from(table).select(column).eq(column, userId).limit(1);
        if (checkError || (remaining && remaining.length > 0)) leftovers.push(table);
    }

    if (leftovers.length > 0) {
        // The login is already gone; data cleanup needs attention.
        console.error(`Account deletion: data remains in ${leftovers.join(', ')} for a deleted user`);
        telemetry.recordEvent('account_deletion_partial', { route: 'DELETE /api/account', code: 'LEFTOVER_DATA' });
        return res.status(500).json({
            success: false,
            code: 'PARTIAL_DELETION',
            message: 'Your login has been removed, but some data could not be deleted automatically. Our team has been alerted; contact support to confirm removal.',
        });
    }

    // Counted for the admin panel; no identifier is stored.
    telemetry.recordEvent('account_deleted', { severity: 'info', route: 'DELETE /api/account' });
    res.json({
        success: true,
        message: 'Your account and all associated data have been permanently deleted.',
    });
});

// ---------------------------------------------------------------------------
// @route   PUT /api/account/budget
// ---------------------------------------------------------------------------
const budgetSchema = z.object({
    monthly_budget: z.coerce.number().int('Budget must be a whole number of rupees').min(500, 'Budget must be at least ₹500').max(10_000_000, 'Budget cannot exceed ₹1,00,00,000'),
}).strict();

router.put('/budget', protect, async (req, res) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data, error } = await supabase
        .from('profiles')
        .update({ monthly_budget: parsed.data.monthly_budget })
        .eq('id', req.user.id)
        .select('monthly_budget')
        .maybeSingle();

    if (error || !data) {
        return res.status(500).json({ success: false, message: 'Failed to update budget' });
    }
    res.json({ success: true, monthly_budget: data.monthly_budget });
});

// ---------------------------------------------------------------------------
// @route   PUT /api/account/investment-target
// ---------------------------------------------------------------------------
const targetSchema = z.object({
    investment_target: z.coerce.number().int('Target must be a whole number of rupees').min(0).max(10_000_000),
}).strict();

router.put('/investment-target', protect, async (req, res) => {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data, error } = await supabase
        .from('profiles')
        .update({ investment_target: parsed.data.investment_target })
        .eq('id', req.user.id)
        .select('investment_target')
        .maybeSingle();

    if (error || !data) {
        return res.status(500).json({ success: false, message: 'Failed to update target' });
    }
    res.json({ success: true, investment_target: data.investment_target });
});

module.exports = router;
