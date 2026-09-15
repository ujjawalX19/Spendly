const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const { z } = require('zod');
const rateLimit = require('express-rate-limit').rateLimit;
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { validationError } = require('../lib/validation');
const { splitEqually, computeNetBalances, suggestSettlements, toPaise, toRupees } = require('../lib/groupBalances');

/**
 * Group Pools — split shared expenses and settle up.
 *
 * Membership is by consent: a member shares the group's invite code, and the
 * other person joins with it. Nobody can add another account directly.
 *
 * The backend uses the service-role key (RLS bypassed), so every group route
 * proves membership itself. Non-members get the same 403 whether or not the
 * group exists. Member email addresses are never returned — display names only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE, 'Invalid id');
const money = z.coerce.number().positive('Amount must be positive').max(10_000_000, 'Amount too large')
    .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(6)), 'At most 2 decimal places');
const MAX_MEMBERS = 50;

// Invite codes: 8 characters from an alphabet without look-alikes (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newInviteCode() {
    const bytes = crypto.randomBytes(8);
    return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// Guessing codes must be impractical: 10 join attempts per user per 15 minutes.
const joinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id}`,
    handler: (req, res) => res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Too many join attempts. Please wait a few minutes.' }),
});

async function requireMembership(groupId, userId, res) {
    if (!UUID_RE.test(String(groupId || ''))) {
        res.status(400).json({ success: false, message: 'Invalid group id' });
        return null;
    }
    const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.error('Group membership check failed:', error.message);
        res.status(500).json({ success: false, message: 'Could not verify group access' });
        return null;
    }
    if (!data) {
        res.status(403).json({ success: false, message: 'Not a member of this group' });
        return null;
    }
    return data;
}

/** Members of a group with display names only. */
async function loadMembers(groupId) {
    const { data: rows, error } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at')
        .eq('group_id', groupId);
    if (error) throw error;
    const ids = (rows || []).map((r) => r.user_id);
    let names = new Map();
    if (ids.length) {
        const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        if (pErr) throw pErr;
        names = new Map((profiles || []).map((p) => [p.id, p.full_name]));
    }
    return (rows || []).map((r) => ({
        id: r.user_id,
        name: (names.get(r.user_id) || '').trim() || 'Member',
        role: r.role,
        joinedAt: r.joined_at,
    }));
}

/** Everything needed to show a group: members, expenses with splits, settlements, balances. */
async function loadGroupState(groupId) {
    const members = await loadMembers(groupId);
    const memberIds = members.map((m) => m.id);

    const { data: expenses, error: eErr } = await supabase
        .from('group_expenses')
        .select('id, description, amount, paid_by, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
    if (eErr) throw eErr;

    const expenseIds = (expenses || []).map((e) => e.id);
    let splits = [];
    if (expenseIds.length) {
        const { data, error } = await supabase
            .from('group_expense_splits')
            .select('group_expense_id, user_id, share_amount')
            .in('group_expense_id', expenseIds);
        if (error) throw error;
        splits = data || [];
    }

    const { data: settlements, error: sErr } = await supabase
        .from('settlements')
        .select('id, from_user_id, to_user_id, amount, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
    if (sErr) throw sErr;

    const withSplits = (expenses || []).map((e) => ({
        ...e,
        splits: splits.filter((s) => s.group_expense_id === e.id),
    }));

    // Balances include everyone who ever took part, so a member who left with
    // an open balance still shows up rather than silently vanishing.
    const everyone = new Set(memberIds);
    for (const e of withSplits) { everyone.add(e.paid_by); e.splits.forEach((s) => everyone.add(s.user_id)); }
    for (const s of settlements || []) { everyone.add(s.from_user_id); everyone.add(s.to_user_id); }

    const net = computeNetBalances([...everyone], withSplits, settlements || []);
    return { members, expenses: withSplits, settlements: settlements || [], net };
}

const nameOf = (members) => {
    const map = new Map(members.map((m) => [m.id, m.name]));
    return (id) => map.get(id) || 'Former member';
};

// ─── Create ─────────────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1, 'Group name is required').max(60) }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data: group, error } = await supabase
        .from('groups')
        .insert({ name: parsed.data.name, created_by: req.user.id, invite_code: newInviteCode() })
        .select('id, name, created_by, invite_code, created_at')
        .single();
    if (error) {
        console.error('Error creating group:', error.message);
        return res.status(500).json({ success: false, message: 'Could not create the group' });
    }

    const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: req.user.id, role: 'admin' });
    if (memberError) {
        await supabase.from('groups').delete().eq('id', group.id);
        console.error('Error adding creator to group:', memberError.message);
        return res.status(500).json({ success: false, message: 'Could not create the group' });
    }

    res.status(201).json({ success: true, group });
});

// ─── List my groups (with my net balance in each) ───────────────────────────
router.get('/', protect, async (req, res) => {
    try {
        const { data: memberships, error } = await supabase
            .from('group_members')
            .select('group_id, role')
            .eq('user_id', req.user.id);
        if (error) throw error;

        const ids = (memberships || []).map((m) => m.group_id);
        if (!ids.length) return res.json({ success: true, groups: [] });

        const { data: groups, error: gErr } = await supabase
            .from('groups')
            .select('id, name, created_by, created_at')
            .in('id', ids)
            .order('created_at', { ascending: false });
        if (gErr) throw gErr;

        const result = [];
        for (const g of groups || []) {
            const state = await loadGroupState(g.id);
            result.push({
                id: g.id,
                name: g.name,
                createdAt: g.created_at,
                role: memberships.find((m) => m.group_id === g.id)?.role,
                memberCount: state.members.length,
                myBalance: toRupees(state.net.get(req.user.id) || 0),
                expenseCount: state.expenses.length,
            });
        }
        res.json({ success: true, groups: result });
    } catch (e) {
        console.error('Error listing groups:', e.message);
        res.status(500).json({ success: false, message: 'Could not load your groups' });
    }
});

// ─── Join with an invite code ───────────────────────────────────────────────
router.post('/join', protect, joinLimiter, async (req, res) => {
    const parsed = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/, 'Enter the 8-character invite code') }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data: group, error } = await supabase
        .from('groups')
        .select('id, name')
        .eq('invite_code', parsed.data.code)
        .maybeSingle();
    if (error) return res.status(500).json({ success: false, message: 'Could not join the group' });
    if (!group) return res.status(404).json({ success: false, message: 'No group found for that invite code' });

    const members = await loadMembers(group.id).catch(() => null);
    if (!members) return res.status(500).json({ success: false, message: 'Could not join the group' });
    if (members.some((m) => m.id === req.user.id)) {
        return res.json({ success: true, group, alreadyMember: true });
    }
    if (members.length >= MAX_MEMBERS) {
        return res.status(409).json({ success: false, message: 'This group is full' });
    }

    const { error: insertError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: req.user.id, role: 'member' });
    if (insertError && insertError.code !== '23505') {
        console.error('Error joining group:', insertError.message);
        return res.status(500).json({ success: false, message: 'Could not join the group' });
    }
    res.status(201).json({ success: true, group });
});

// ─── Group detail ───────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
    const membership = await requireMembership(req.params.id, req.user.id, res);
    if (!membership) return;
    try {
        const { data: group, error } = await supabase
            .from('groups')
            .select('id, name, created_by, invite_code, created_at')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;

        const state = await loadGroupState(group.id);
        const name = nameOf(state.members);

        const history = [
            ...state.expenses.map((e) => ({
                type: 'expense',
                id: e.id,
                description: e.description,
                amount: Number(e.amount),
                paidBy: { id: e.paid_by, name: name(e.paid_by) },
                participants: e.splits.map((s) => ({ id: s.user_id, name: name(s.user_id), share: s.share_amount === null ? null : Number(s.share_amount) })),
                createdAt: e.created_at,
            })),
            ...state.settlements.map((s) => ({
                type: 'settlement',
                id: s.id,
                amount: Number(s.amount),
                from: { id: s.from_user_id, name: name(s.from_user_id) },
                to: { id: s.to_user_id, name: name(s.to_user_id) },
                createdAt: s.created_at,
            })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            group: {
                id: group.id,
                name: group.name,
                createdAt: group.created_at,
                inviteCode: group.invite_code,
                myRole: membership.role,
            },
            members: state.members,
            balances: [...state.net].map(([id, paise]) => ({ id, name: name(id), balance: toRupees(paise) })),
            settleUp: suggestSettlements(state.net).map((t) => ({ from: { id: t.from, name: name(t.from) }, to: { id: t.to, name: name(t.to) }, amount: t.amount })),
            history,
            totalSpent: toRupees(state.expenses.reduce((sum, e) => sum + toPaise(e.amount), 0)),
        });
    } catch (e) {
        console.error('Error loading group:', e.message);
        res.status(500).json({ success: false, message: 'Could not load this group' });
    }
});

// ─── Rotate invite code (admin) ─────────────────────────────────────────────
router.post('/:id/invite-code', protect, async (req, res) => {
    const membership = await requireMembership(req.params.id, req.user.id, res);
    if (!membership) return;
    if (membership.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the group admin can reset the invite code' });

    const { data, error } = await supabase
        .from('groups')
        .update({ invite_code: newInviteCode() })
        .eq('id', req.params.id)
        .select('invite_code')
        .single();
    if (error) return res.status(500).json({ success: false, message: 'Could not reset the invite code' });
    res.json({ success: true, inviteCode: data.invite_code });
});

// Adding someone else directly is not supported: people join with a code.
router.post('/:id/members', protect, (req, res) => {
    res.status(400).json({
        success: false,
        code: 'USE_INVITE_CODE',
        message: 'Share the group invite code; people join the group themselves.',
    });
});

// ─── Add a shared expense ───────────────────────────────────────────────────
router.post('/:id/expenses', protect, async (req, res) => {
    const parsed = z.object({
        description: z.string().trim().min(1, 'Description is required').max(200),
        amount: money,
        paidBy: uuid.optional(),
        participants: z.array(uuid).min(1, 'Choose at least one person').max(MAX_MEMBERS).optional(),
        // Accepted from older app builds.
        splitAmong: z.array(uuid).max(MAX_MEMBERS).optional(),
    }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const groupId = req.params.id;
    if (!(await requireMembership(groupId, req.user.id, res))) return;

    let members;
    try {
        members = await loadMembers(groupId);
    } catch {
        return res.status(500).json({ success: false, message: 'Could not load group members' });
    }
    const memberIds = new Set(members.map((m) => m.id));

    const paidBy = parsed.data.paidBy || req.user.id;
    if (!memberIds.has(paidBy)) {
        return res.status(400).json({ success: false, message: 'The person who paid must be a member of this group' });
    }
    const requested = parsed.data.participants || parsed.data.splitAmong;
    const participants = requested && requested.length ? [...new Set(requested)] : [...memberIds];
    if (participants.some((id) => !memberIds.has(id))) {
        return res.status(400).json({ success: false, message: 'Everyone in the split must be a member of this group' });
    }

    const amountPaise = toPaise(parsed.data.amount);
    if (amountPaise < participants.length) {
        return res.status(400).json({ success: false, message: 'Amount is too small to split between that many people' });
    }
    const shares = splitEqually(amountPaise, participants);

    const { data: expense, error } = await supabase
        .from('group_expenses')
        .insert({ group_id: groupId, description: parsed.data.description, amount: parsed.data.amount, paid_by: paidBy })
        .select('id, description, amount, paid_by, created_at')
        .single();
    if (error) {
        console.error('Error adding group expense:', error.message);
        return res.status(500).json({ success: false, message: 'Could not add the expense' });
    }

    const { error: splitError } = await supabase
        .from('group_expense_splits')
        .insert([...shares].map(([userId, paise]) => ({ group_expense_id: expense.id, user_id: userId, share_amount: toRupees(paise) })));
    if (splitError) {
        await supabase.from('group_expenses').delete().eq('id', expense.id);
        console.error('Error saving splits:', splitError.message);
        return res.status(500).json({ success: false, message: 'Could not add the expense' });
    }

    res.status(201).json({
        success: true,
        expense,
        shares: [...shares].map(([id, paise]) => ({ id, share: toRupees(paise) })),
    });
});

// ─── Delete a shared expense (who added it paid it, or admin) ───────────────
router.delete('/:id/expenses/:expenseId', protect, async (req, res) => {
    const membership = await requireMembership(req.params.id, req.user.id, res);
    if (!membership) return;
    if (!UUID_RE.test(req.params.expenseId)) return res.status(400).json({ success: false, message: 'Invalid expense id' });

    const { data: expense } = await supabase
        .from('group_expenses')
        .select('id, paid_by')
        .eq('id', req.params.expenseId)
        .eq('group_id', req.params.id)
        .maybeSingle();
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.paid_by !== req.user.id && membership.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only the person who paid or the group admin can delete this' });
    }

    await supabase.from('group_expense_splits').delete().eq('group_expense_id', expense.id);
    const { error } = await supabase.from('group_expenses').delete().eq('id', expense.id);
    if (error) return res.status(500).json({ success: false, message: 'Could not delete the expense' });
    res.json({ success: true });
});

// ─── Record a settlement ────────────────────────────────────────────────────
// The caller must be one side of the payment: you can record "I paid Riya"
// or "Riya paid me", not a payment between two other people.
router.post('/:id/settle', protect, async (req, res) => {
    const parsed = z.object({
        toUserId: uuid,
        fromUserId: uuid.optional(),
        amount: money,
    }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const groupId = req.params.id;
    const fromUserId = parsed.data.fromUserId || req.user.id;
    const { toUserId, amount } = parsed.data;

    if (fromUserId === toUserId) return res.status(400).json({ success: false, message: 'Cannot settle with yourself' });
    if (fromUserId !== req.user.id && toUserId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You can only record payments you made or received' });
    }
    if (!(await requireMembership(groupId, req.user.id, res))) return;

    const members = await loadMembers(groupId).catch(() => null);
    if (!members) return res.status(500).json({ success: false, message: 'Could not load group members' });
    const ids = new Set(members.map((m) => m.id));
    if (!ids.has(fromUserId) || !ids.has(toUserId)) {
        return res.status(400).json({ success: false, message: 'Both people must be members of this group' });
    }

    const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({ group_id: groupId, from_user_id: fromUserId, to_user_id: toUserId, amount })
        .select('id, from_user_id, to_user_id, amount, created_at')
        .single();
    if (error) {
        console.error('Error recording settlement:', error.message);
        return res.status(500).json({ success: false, message: 'Could not record the payment' });
    }
    res.status(201).json({ success: true, settlement });
});

// ─── Leave a group ──────────────────────────────────────────────────────────
router.delete('/:id/members/me', protect, async (req, res) => {
    const membership = await requireMembership(req.params.id, req.user.id, res);
    if (!membership) return;
    try {
        const state = await loadGroupState(req.params.id);
        if ((state.net.get(req.user.id) || 0) !== 0) {
            return res.status(409).json({ success: false, message: 'Settle your balance before leaving this group' });
        }
        const { error } = await supabase.from('group_members').delete().eq('group_id', req.params.id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('Error leaving group:', e.message);
        res.status(500).json({ success: false, message: 'Could not leave the group' });
    }
});

module.exports = router;
module.exports.loadGroupState = loadGroupState;
