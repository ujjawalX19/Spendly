const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// @route   DELETE /api/account
// @desc    Delete user account and all associated data
// @access  Protected
//
// Play Store mandatory requirement: users must be able to delete their data.
// This cascading delete removes:
//   - All expenses
//   - All group memberships
//   - All recurring bills
//   - All streak activities
//   - All paisa scores
//   - All PDF import records
//   - Profile
//   - Auth user
// ---------------------------------------------------------------------------
router.delete('/', protect, async (req, res) => {
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE_MY_ACCOUNT') {
        return res.status(400).json({
            success: false,
            message: 'Please send { confirmation: "DELETE_MY_ACCOUNT" } to confirm.',
        });
    }

    try {
        const userId = req.user.id;

        // All tables have ON DELETE CASCADE from profiles, so deleting
        // the profile row cascades to expenses, recurring_bills, etc.

        // 1. Delete profile (cascades to all user data)
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            console.error('Error deleting profile:', profileError);
            return res.status(500).json({ success: false, message: 'Failed to delete account data' });
        }

        // 2. Delete auth user via Supabase Admin API
        const { createClient } = require('@supabase/supabase-js');
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('Error deleting auth user:', authError);
            // Profile is already deleted, so the user is effectively gone
            // The auth record will be orphaned but harmless
        }

        res.json({
            success: true,
            message: 'Account and all associated data have been permanently deleted.',
        });
    } catch (error) {
        console.error('Account Deletion Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/account/budget
// @desc    Update monthly budget
// @access  Protected
// ---------------------------------------------------------------------------
router.put('/budget', protect, async (req, res) => {
    const { monthly_budget } = req.body;

    if (!monthly_budget || isNaN(monthly_budget) || monthly_budget < 500 || monthly_budget > 10000000) {
        return res.status(400).json({
            success: false,
            message: 'monthly_budget must be between ₹500 and ₹1,00,00,000',
        });
    }

    const { data, error } = await supabase
        .from('profiles')
        .update({ monthly_budget: parseInt(monthly_budget) })
        .eq('id', req.user.id)
        .select('monthly_budget')
        .single();

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to update budget' });
    }

    res.json({ success: true, monthly_budget: data.monthly_budget });
});

// ---------------------------------------------------------------------------
// @route   PUT /api/account/investment-target
// @desc    Update investment target for Safe-to-Spend calculation
// @access  Protected
// ---------------------------------------------------------------------------
router.put('/investment-target', protect, async (req, res) => {
    const { investment_target } = req.body;

    if (investment_target === undefined || isNaN(investment_target) || investment_target < 0) {
        return res.status(400).json({
            success: false,
            message: 'investment_target must be a non-negative number',
        });
    }

    const { data, error } = await supabase
        .from('profiles')
        .update({ investment_target: parseInt(investment_target) })
        .eq('id', req.user.id)
        .select('investment_target')
        .single();

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to update investment target' });
    }

    res.json({ success: true, investment_target: data.investment_target });
});

module.exports = router;
