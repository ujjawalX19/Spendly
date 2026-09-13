const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { validationError } = require('../lib/validation');

/**
 * Group pools (shared expenses).
 *
 * STATUS: the app marks Group Pools as "coming soon". There is no invite /
 * accept flow yet, so these routes support creating a group, reading groups
 * you belong to, and recording expenses and settlements among existing
 * members — nothing that adds another person without their consent.
 *
 * The backend uses the service-role key, which bypasses RLS, so every
 * group-scoped route proves membership itself via requireMembership().
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, 'Invalid id');
const money = z.coerce.number().positive('Amount must be positive').max(10_000_000, 'Amount too large');

/**
 * Responds 400/403/500 and returns false unless `userId` belongs to the group.
 * A non-member gets the same 403 whether or not the group exists, so group ids
 * cannot be probed.
 */
const requireMembership = async (groupId, userId, res) => {
    if (!UUID_RE.test(String(groupId || ''))) {
        res.status(400).json({ success: false, message: 'Invalid group id' });
        return false;
    }

    const { data: membership, error } = await supabase
        .from('group_members')
        .select('user_id, role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Group membership check failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not verify group access' });
        return false;
    }
    if (!membership) {
        res.status(403).json({ success: false, message: 'Not a member of this group' });
        return false;
    }
    return membership;
};

// @route POST /api/groups — create a group with the caller as admin
router.post('/', protect, async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1, 'Group name is required').max(60) }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name: parsed.data.name, created_by: req.user.id })
        .select('id, name, created_by, is_settled, created_at')
        .single();

    if (groupError) {
        console.error('Error creating group:', groupError.message);
        return res.status(500).json({ success: false, message: 'Server error creating group' });
    }

    const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: req.user.id, role: 'admin' });

    if (memberError) {
        console.error('Error adding creator as group member:', memberError.message);
        // Do not leave an orphaned group nobody can see.
        await supabase.from('groups').delete().eq('id', group.id);
        return res.status(500).json({ success: false, message: 'Server error creating group' });
    }

    res.status(201).json({ success: true, group });
});

// @route GET /api/groups — groups the caller belongs to, with member display names
router.get('/', protect, async (req, res) => {
    const { data: memberships, error: memberError } = await supabase
        .from('group_members')
        .select('group_id, role, groups(id, name, created_by, is_settled, created_at, updated_at)')
        .eq('user_id', req.user.id);

    if (memberError) {
        console.error('Error fetching groups:', memberError.message);
        return res.status(500).json({ success: false, message: 'Server error fetching groups' });
    }

    const groupIds = memberships.map((m) => m.group_id);
    let groups = memberships.map((m) => ({ ...m.groups, userRole: m.role, members: [] }));

    if (groupIds.length > 0) {
        // Display name only. Other members' email addresses are not needed to
        // split a bill and are not shared.
        const { data: allMembers, error } = await supabase
            .from('group_members')
            .select('group_id, role, user_id, profiles(full_name)')
            .in('group_id', groupIds);

        if (!error && allMembers) {
            groups = groups.map((group) => ({
                ...group,
                members: allMembers
                    .filter((m) => m.group_id === group.id)
                    .map((m) => ({ id: m.user_id, full_name: m.profiles?.full_name || 'Member', role: m.role })),
            }));
        }
    }

    res.json({ success: true, groups });
});

// @route POST /api/groups/:id/members
// Adding someone else by user id, without an invitation they accept, is not
// allowed. Kept as an explicit refusal until an invite flow exists.
router.post('/:id/members', protect, (req, res) => {
    res.status(501).json({
        success: false,
        code: 'INVITES_NOT_AVAILABLE',
        message: 'Adding members is not available yet.',
    });
});

// @route POST /api/groups/:id/expenses — record a shared expense among members
router.post('/:id/expenses', protect, async (req, res) => {
    const parsed = z.object({
        description: z.string().trim().min(1, 'Description is required').max(200),
        amount: money,
        splitAmong: z.array(uuid).max(100).optional(),
    }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const groupId = req.params.id;
    if (!(await requireMembership(groupId, req.user.id, res))) return;

    const { data: allMembers, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);
    if (membersError || !allMembers) {
        return res.status(500).json({ success: false, message: 'Could not load group members' });
    }
    const memberIds = allMembers.map((m) => m.user_id);

    // splitAmong comes from the client, so it is intersected with real membership.
    let splitUserIds = memberIds;
    if (parsed.data.splitAmong && parsed.data.splitAmong.length > 0) {
        splitUserIds = [...new Set(parsed.data.splitAmong)].filter((id) => memberIds.includes(id));
        if (splitUserIds.length !== new Set(parsed.data.splitAmong).size) {
            return res.status(400).json({ success: false, message: 'splitAmong may only contain members of this group' });
        }
    }

    const { data: groupExpense, error: expenseError } = await supabase
        .from('group_expenses')
        .insert({ group_id: groupId, description: parsed.data.description, amount: parsed.data.amount, paid_by: req.user.id })
        .select()
        .single();

    if (expenseError) {
        console.error('Error adding group expense:', expenseError.message);
        return res.status(500).json({ success: false, message: 'Server error adding expense' });
    }

    const { error: splitError } = await supabase
        .from('group_expense_splits')
        .insert(splitUserIds.map((uid) => ({ group_expense_id: groupExpense.id, user_id: uid })));

    if (splitError) {
        console.error('Error inserting expense splits:', splitError.message);
        await supabase.from('group_expenses').delete().eq('id', groupExpense.id);
        return res.status(500).json({ success: false, message: 'Server error adding expense' });
    }

    res.status(201).json({ success: true, expense: groupExpense, splitAmong: splitUserIds });
});

// @route GET /api/groups/:id/expenses
router.get('/:id/expenses', protect, async (req, res) => {
    const groupId = req.params.id;
    if (!(await requireMembership(groupId, req.user.id, res))) return;

    const { data: expenses, error } = await supabase
        .from('group_expenses')
        .select(`
            id, group_id, description, amount, paid_by, created_at,
            payer:profiles!paid_by(full_name),
            group_expense_splits(user_id, profiles(full_name))
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching group expenses:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching expenses' });
    }

    res.json({ success: true, expenses });
});

// @route POST /api/groups/:id/settle — record a payment between two members
router.post('/:id/settle', protect, async (req, res) => {
    const parsed = z.object({ toUserId: uuid, amount: money }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { toUserId, amount } = parsed.data;
    const groupId = req.params.id;

    if (toUserId === req.user.id) {
        return res.status(400).json({ success: false, message: 'Cannot settle with yourself' });
    }
    if (!(await requireMembership(groupId, req.user.id, res))) return;
    if (!(await requireMembership(groupId, toUserId, res))) return;

    const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({ group_id: groupId, from_user_id: req.user.id, to_user_id: toUserId, amount })
        .select()
        .single();

    if (error) {
        console.error('Error recording settlement:', error.message);
        return res.status(500).json({ success: false, message: 'Server error recording settlement' });
    }

    // No karma is awarded for settlements: two cooperating members could
    // otherwise record unlimited fake settlements to farm points.
    res.status(201).json({ success: true, settlement });
});

module.exports = router;
