const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// Helper: Increment karma_score on public.profiles (clamped 0–1000)
// ---------------------------------------------------------------------------
const awardKarma = async (userId, points) => {
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('karma_score')
        .eq('id', userId)
        .single();

    if (fetchError || !profile) {
        console.error('Error fetching profile for karma update:', fetchError);
        return;
    }

    const newScore = Math.min(1000, Math.max(0, profile.karma_score + points));

    const { error: updateError } = await supabase
        .from('profiles')
        .update({ karma_score: newScore })
        .eq('id', userId);

    if (updateError) {
        console.error('Error updating karma score:', updateError);
    }
};

// ---------------------------------------------------------------------------
// @route   POST /api/groups
// @desc    Create a new group (Hostel Pool) and add creator as admin
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/', protect, async (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Group name is required' });
    }

    // 1. Insert the group
    const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
            name: name.trim(),
            created_by: req.user.id
        })
        .select()
        .single();

    if (groupError) {
        console.error('Error creating group:', groupError);
        return res.status(500).json({ success: false, message: 'Server error creating group' });
    }

    // 2. Add creator as admin member
    const { error: memberError } = await supabase
        .from('group_members')
        .insert({
            group_id: group.id,
            user_id: req.user.id,
            role: 'admin'
        });

    if (memberError) {
        console.error('Error adding creator as group member:', memberError);
        return res.status(500).json({ success: false, message: 'Group created but failed to add member' });
    }

    res.status(201).json({ success: true, group });
});

// ---------------------------------------------------------------------------
// @route   GET /api/groups
// @desc    Get all groups the authenticated user belongs to
// @access  Protected
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    // Fetch all group_ids for this user, then fetch group details with members
    const { data: memberships, error: memberError } = await supabase
        .from('group_members')
        .select('group_id, role, groups(id, name, created_by, is_settled, created_at, updated_at)')
        .eq('user_id', req.user.id);

    if (memberError) {
        console.error('Error fetching groups:', memberError);
        return res.status(500).json({ success: false, message: 'Server error fetching groups' });
    }

    // For each group, also fetch the member list with their profile info
    const groupIds = memberships.map(m => m.group_id);

    let groupsWithMembers = memberships.map(m => ({ ...m.groups, userRole: m.role, members: [] }));

    if (groupIds.length > 0) {
        const { data: allMembers, error: allMembersError } = await supabase
            .from('group_members')
            .select('group_id, role, profiles(id, full_name, email, karma_score)')
            .in('group_id', groupIds);

        if (!allMembersError && allMembers) {
            groupsWithMembers = groupsWithMembers.map(group => ({
                ...group,
                members: allMembers
                    .filter(m => m.group_id === group.id)
                    .map(m => ({ ...m.profiles, role: m.role }))
            }));
        }
    }

    res.json({ success: true, groups: groupsWithMembers });
});

// ---------------------------------------------------------------------------
// @route   POST /api/groups/:id/members
// @desc    Add a member to a group (admin only)
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/:id/members', protect, async (req, res) => {
    const { userId } = req.body;
    const groupId = req.params.id;

    if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
    }

    // Verify the requester is the group admin
    const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

    if (groupError || !group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (group.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Only the group admin can add members' });
    }

    const { error } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: userId, role: 'member' });

    if (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'User is already a member of this group' });
        }
        console.error('Error adding member:', error);
        return res.status(500).json({ success: false, message: 'Server error adding member' });
    }

    res.json({ success: true, message: 'Member added successfully' });
});

// ---------------------------------------------------------------------------
// @route   POST /api/groups/:id/expenses
// @desc    Add an expense to a group and record the splits
// @access  Protected (must be a group member)
// ---------------------------------------------------------------------------
router.post('/:id/expenses', protect, async (req, res) => {
    const { description, amount, splitAmong } = req.body;
    const groupId = req.params.id;

    if (!description || !amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid description and amount are required' });
    }

    // Verify the requester is a member
    const { data: membership, error: memberCheckError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', req.user.id)
        .single();

    if (memberCheckError || !membership) {
        return res.status(403).json({ success: false, message: 'Not a member of this group' });
    }

    // 1. Insert the group expense
    const { data: groupExpense, error: expenseError } = await supabase
        .from('group_expenses')
        .insert({
            group_id: groupId,
            description,
            amount: parseFloat(amount),
            paid_by: req.user.id
        })
        .select()
        .single();

    if (expenseError) {
        console.error('Error adding group expense:', expenseError);
        return res.status(500).json({ success: false, message: 'Server error adding expense' });
    }

    // 2. Determine who the expense is split among
    let splitUserIds = splitAmong && splitAmong.length > 0 ? splitAmong : null;

    // If no specific split provided, split among all group members
    if (!splitUserIds) {
        const { data: allMembers } = await supabase
            .from('group_members')
            .select('user_id')
            .eq('group_id', groupId);

        splitUserIds = allMembers ? allMembers.map(m => m.user_id) : [req.user.id];
    }

    // 3. Insert split records
    const splitRows = splitUserIds.map(uid => ({
        group_expense_id: groupExpense.id,
        user_id: uid
    }));

    const { error: splitError } = await supabase
        .from('group_expense_splits')
        .insert(splitRows);

    if (splitError) {
        console.error('Error inserting expense splits:', splitError);
        return res.status(500).json({ success: false, message: 'Expense added but splits failed to save' });
    }

    res.json({ success: true, expense: groupExpense, splitAmong: splitUserIds });
});

// ---------------------------------------------------------------------------
// @route   GET /api/groups/:id/expenses
// @desc    Get all expenses for a group
// @access  Protected (must be a group member)
// ---------------------------------------------------------------------------
router.get('/:id/expenses', protect, async (req, res) => {
    const groupId = req.params.id;

    const { data: expenses, error } = await supabase
        .from('group_expenses')
        .select(`
            *,
            profiles!paid_by(id, full_name, email),
            group_expense_splits(user_id, profiles(id, full_name))
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching group expenses:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching expenses' });
    }

    res.json({ success: true, expenses });
});

// ---------------------------------------------------------------------------
// @route   POST /api/groups/:id/settle
// @desc    Record a settlement payment and award +5 Karma to the payer
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/:id/settle', protect, async (req, res) => {
    const { toUserId, amount } = req.body;
    const groupId = req.params.id;

    if (!toUserId || !amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid toUserId and amount are required' });
    }

    if (toUserId === req.user.id) {
        return res.status(400).json({ success: false, message: 'Cannot settle with yourself' });
    }

    const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({
            group_id: groupId,
            from_user_id: req.user.id,
            to_user_id: toUserId,
            amount: parseFloat(amount)
        })
        .select()
        .single();

    if (error) {
        console.error('Error recording settlement:', error);
        return res.status(500).json({ success: false, message: 'Server error recording settlement' });
    }

    // Award +5 Karma for settling up
    await awardKarma(req.user.id, 5);

    res.json({
        success: true,
        settlement,
        message: 'Settled! +5 Karma awarded. 🎉'
    });
});

module.exports = router;
