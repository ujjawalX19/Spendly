const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect, invalidateBanCache } = require('../middleware/authMiddleware');
const { requireOwner } = require('../middleware/requireOwner');
const { audit } = require('../lib/adminAudit');
const { hasActivePro, purchasesEnabled } = require('../lib/entitlements');
const { validationError } = require('../lib/validation');
const adminMetrics = require('../lib/adminMetrics');
const adminHealth = require('../lib/adminHealth');
const appTime = require('../lib/appTime');

/**
 * Owner admin API — /api/admin/*
 *
 * Every route sits behind `protect` + `requireOwner` (see
 * middleware/requireOwner.js): a verified Supabase session whose confirmed
 * email equals ADMIN_EMAIL AND whose profile has role 'admin'. Nothing here
 * accepts a role, an owner flag or a user id from the body as authority; the
 * user id in a path is only ever the *target* of an owner action.
 *
 * DATA MINIMISATION
 *  - Users are shown with profile fields and aggregate counts only. No
 *    expense amounts, descriptions, merchants, receipt data, statement data
 *    or AI chat contents are returned by any admin route.
 *  - Every mutation requires a written reason, is refused if it cannot be
 *    audited, and is recorded in admin_audit_log. Viewing a user's detail
 *    page is audited too.
 *
 * The previous cross-user "recent expenses" listing and admin expense
 * deletion were removed: the owner has no operational need to read or edit
 * users' individual transactions.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE_MAX = 100;

router.use(protect, requireOwner);

// Columns the admin user list and detail may expose. Deliberately excludes
// quota counters' raw internals, chillar totals and score internals.
const USER_COLUMNS = 'id, email, full_name, role, is_banned, is_pro, pro_expires_at, created_at, last_active_at';
const USER_COLUMNS_LEGACY = 'id, email, full_name, role, is_banned, is_pro, pro_expires_at, created_at';

const reasonSchema = z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(500);

function validId(req, res) {
    if (!UUID_RE.test(String(req.params.id || ''))) {
        res.status(400).json({ success: false, message: 'Invalid user id' });
        return false;
    }
    return true;
}

function presentUser(row, now = new Date()) {
    return {
        id: row.id,
        email: row.email,
        name: row.full_name || '',
        role: row.role,
        status: row.is_banned ? 'suspended' : 'active',
        pro: {
            flagged: row.is_pro === true,
            active: hasActivePro(row, now),
            expiresAt: row.pro_expires_at || null,
        },
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at === undefined ? undefined : row.last_active_at,
    };
}

/** Select profiles, falling back to pre-v1.4 columns if last_active_at is missing. */
async function selectProfiles(build) {
    let result = await build(USER_COLUMNS);
    if (result.error && /last_active_at/.test(result.error.message || '')) {
        result = await build(USER_COLUMNS_LEGACY);
        result.activityTracking = false;
    } else {
        result.activityTracking = !result.error;
    }
    return result;
}

// ─── Session check for the admin app ────────────────────────────────────────
// @route GET /api/admin/me — 200 only for the owner; the admin app uses it to
// decide whether to show the panel. It is not the security boundary: every
// other route enforces the same middleware independently.
router.get('/me', (req, res) => {
    res.json({ success: true, owner: { id: req.user.id, email: req.user.email } });
});

// ─── Dashboard ──────────────────────────────────────────────────────────────
// @route GET /api/admin/overview
router.get('/overview', async (req, res) => {
    try {
        res.json({ success: true, billing: { connected: purchasesEnabled() }, ...(await adminMetrics.overview()) });
    } catch (err) {
        console.error('Admin overview failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not build the overview' });
    }
});

// @route GET /api/admin/health
router.get('/health', async (req, res) => {
    try {
        res.json({ success: true, ...(await adminHealth.health()) });
    } catch (err) {
        console.error('Admin health failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not run health checks' });
    }
});

// ─── Users ───────────────────────────────────────────────────────────────────
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const listSchema = z.object({
    q: z.string().trim().max(100).optional(),
    plan: z.enum(['all', 'free', 'pro']).optional().default('all'),
    activity: z.enum(['all', 'active', 'inactive']).optional().default('all'),
    status: z.enum(['all', 'active', 'suspended']).optional().default('all'),
    role: z.enum(['all', 'admin', 'user']).optional().default('all'),
    createdFrom: dateKey.optional(),
    createdTo: dateKey.optional(),
    sort: z.enum(['newest', 'oldest', 'last_active', 'last_activity', 'expenses', 'ai_usage', 'name']).optional().default('newest'),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional().default(25),
}).strict();

const ACTIVE_WINDOW_MS = 30 * 86400000;
const USAGE_COLUMNS = 'expense_count, goal_count, subscription_count, ai_question_count, group_count, last_activity_at';
const USAGE_SORTS = new Set(['expenses', 'ai_usage', 'last_activity']);

const SORT_ORDER = {
    newest: ['created_at', { ascending: false }],
    oldest: ['created_at', { ascending: true }],
    name: ['full_name', { ascending: true }],
    last_active: ['last_active_at', { ascending: false, nullsFirst: false }],
    last_activity: ['last_activity_at', { ascending: false, nullsFirst: false }],
    expenses: ['expense_count', { ascending: false }],
    ai_usage: ['ai_question_count', { ascending: false }],
};

/** Local calendar date in APP_TIMEZONE -> UTC instant (start or end of that day). */
function localDay(key, endOfDay) {
    const [y, m, d] = key.split('-').map(Number);
    return endOfDay ? appTime.zonedTimeToUtc(y, m, d, 23, 59, 59) : appTime.zonedTimeToUtc(y, m, d, 0, 0, 0);
}

// @route GET /api/admin/users — server-side search, filters, sort and pagination
//
// Reads the admin_user_stats view (counts only, see v1_4_admin_ops.sql). If the
// view is not deployed yet, falls back to profiles without usage columns.
router.get('/users', async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid filter');
    const f = parsed.data;
    const now = new Date();
    const from = (f.page - 1) * f.pageSize;
    const nowIso = now.toISOString();
    const inactiveBefore = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString();

    if (f.createdFrom && f.createdTo && f.createdFrom > f.createdTo) {
        return res.status(400).json({ success: false, message: 'createdFrom must be on or before createdTo' });
    }

    const build = (table, columns) => {
        let query = supabase.from(table).select(columns, { count: 'exact' });
        if (f.q) {
            if (UUID_RE.test(f.q)) {
                query = query.eq('id', f.q);
            } else {
                // The term is interpolated into a PostgREST `or` filter, so keep
                // only characters that cannot change the filter's structure.
                const term = f.q.replace(/[^\p{L}\p{N}@.+\- ]/gu, '').trim();
                if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
            }
        }
        // Plan follows hasActivePro: an expired flag counts as free.
        if (f.plan === 'pro') query = query.eq('is_pro', true).or(`pro_expires_at.is.null,pro_expires_at.gt.${nowIso}`);
        if (f.plan === 'free') query = query.or(`is_pro.eq.false,pro_expires_at.lt.${nowIso}`);
        if (f.activity === 'active') query = query.gte('last_active_at', inactiveBefore);
        if (f.activity === 'inactive') query = query.or(`last_active_at.is.null,last_active_at.lt.${inactiveBefore}`);
        if (f.status === 'active') query = query.eq('is_banned', false);
        if (f.status === 'suspended') query = query.eq('is_banned', true);
        if (f.role !== 'all') query = query.eq('role', f.role);
        if (f.createdFrom) query = query.gte('created_at', localDay(f.createdFrom, false).toISOString());
        if (f.createdTo) query = query.lte('created_at', localDay(f.createdTo, true).toISOString());
        const [column, options] = SORT_ORDER[f.sort];
        return query.order(column, options).order('id', { ascending: true }).range(from, from + f.pageSize - 1);
    };

    let result = await build('admin_user_stats', `${USER_COLUMNS}, ${USAGE_COLUMNS}`);
    let usageAvailable = !result.error;
    if (result.error) {
        const needsView = USAGE_SORTS.has(f.sort) || f.activity !== 'all' || f.sort === 'last_active';
        if (needsView) {
            return res.status(409).json({ success: false, code: 'MIGRATION_REQUIRED', message: 'This filter or sort needs supabase/v1_4_admin_ops.sql' });
        }
        console.error('Admin: admin_user_stats unavailable, using profiles:', result.error.message);
        result = await build('profiles', USER_COLUMNS_LEGACY);
        usageAvailable = false;
    }
    if (result.error) {
        console.error('Admin: error listing users:', result.error.message);
        return res.status(500).json({ success: false, message: 'Could not load users' });
    }

    const users = (result.data || []).map((row) => ({
        ...presentUser(row, now),
        usage: usageAvailable ? {
            expenses: row.expense_count,
            goals: row.goal_count,
            subscriptions: row.subscription_count,
            aiQuestions: row.ai_question_count,
            groupPools: row.group_count,
            lastActivityAt: row.last_activity_at,
        } : null,
    }));
    const total = result.count ?? users.length;
    res.json({
        success: true,
        users,
        usageAvailable,
        activityTracking: usageAvailable,
        pagination: { page: f.page, pageSize: f.pageSize, total, hasMore: from + users.length < total },
    });
});

/** Count rows for one user; null when the table or query is unavailable. */
async function userCount(table, column, userId, apply = (q) => q) {
    const { count, error } = await apply(supabase.from(table).select('*', { count: 'exact', head: true }).eq(column, userId));
    return error ? null : count ?? 0;
}

// @route GET /api/admin/users/:id — profile, auth facts, aggregate usage
router.get('/users/:id', async (req, res) => {
    if (!validId(req, res)) return;
    const userId = req.params.id;
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86400000).toISOString();

    const { data: row, error } = await selectProfiles((columns) => supabase
        .from('profiles')
        .select(`${columns}, monthly_budget, investment_target, streak_current, streak_longest, streak_freezes_remaining`)
        .eq('id', userId)
        .maybeSingle());

    if (error) {
        console.error('Admin: error loading user:', error.message);
        return res.status(500).json({ success: false, message: 'Could not load user' });
    }
    if (!row) return res.status(404).json({ success: false, message: 'User not found' });

    // Auth facts (provider, last sign-in) from Supabase Auth. Never tokens.
    let authInfo = null;
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (!authError && authData?.user) {
        const u = authData.user;
        authInfo = {
            emailConfirmed: Boolean(u.email_confirmed_at),
            lastSignInAt: u.last_sign_in_at || null,
            providers: Array.isArray(u.app_metadata?.providers) ? u.app_metadata.providers : (u.app_metadata?.provider ? [u.app_metadata.provider] : []),
            bannedUntil: u.banned_until || null,
        };
    }

    const [
        expensesTotal, expenses30d, upi30d, scans30d, pdfRows30d,
        groups, aiQuestions30d, pdfImports, recurringBills, auditTrail, aiQuestionsTotal, cancelledSubs,
    ] = await Promise.all([
        userCount('expenses', 'user_id', userId),
        userCount('expenses', 'user_id', userId, (q) => q.gte('created_at', since30)),
        userCount('expenses', 'user_id', userId, (q) => q.eq('source', 'upi_auto').gte('created_at', since30)),
        userCount('expenses', 'user_id', userId, (q) => q.eq('source', 'ai_scan').gte('created_at', since30)),
        userCount('expenses', 'user_id', userId, (q) => q.eq('source', 'pdf_import').gte('created_at', since30)),
        userCount('group_members', 'user_id', userId),
        userCount('ai_chat_history', 'user_id', userId, (q) => q.eq('role', 'user').gte('created_at', since30)),
        userCount('pdf_imports', 'user_id', userId),
        userCount('recurring_bills', 'user_id', userId),
        supabase.from('admin_audit_log')
            .select('id, action, details, created_at, actor_email')
            .eq('target_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
        userCount('ai_chat_history', 'user_id', userId, (q) => q.eq('role', 'user')),
        userCount('cancelled_subscriptions', 'user_id', userId),
    ]);

    await audit(req, 'user_viewed', { targetUserId: userId });

    res.json({
        success: true,
        activityTracking: row.last_active_at !== undefined,
        user: {
            ...presentUser(row, now),
            settings: {
                monthlyBudgetSet: Number(row.monthly_budget) > 0,
                savingsTargetSet: Number(row.investment_target) > 0,
            },
            streak: { current: row.streak_current, longest: row.streak_longest, freezes: row.streak_freezes_remaining },
            auth: authInfo,
        },
        usage: {
            expensesTotal,
            expenses30d,
            upiConfirmations30d: upi30d,
            receiptScans30d: scans30d,
            pdfImportedTransactions30d: pdfRows30d,
            pdfImports,
            groupPools: groups,
            aiQuestions30d,
            aiQuestionsTotal,
            recurringBills,
            cancelledSubscriptions: cancelledSubs,
            subscriptions: recurringBills === null ? null : recurringBills + (cancelledSubs || 0),
            goals: Number(row.investment_target) > 0 ? 1 : 0,
            // Not tracked by Spendly; null means "not available", never zero.
            income: null,
            csvImports: null,
            upiDetections: null,
        },
        auditTrail: auditTrail.error ? null : (auditTrail.data || []).map((a) => ({
            id: a.id, action: a.action, details: a.details, at: a.created_at, by: a.actor_email,
        })),
    });
});

// ─── User actions ───────────────────────────────────────────────────────────
const actionSchema = z.object({ reason: reasonSchema }).strict();

async function loadTarget(req, res) {
    if (!validId(req, res)) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, is_banned, is_pro, pro_expires_at')
        .eq('id', req.params.id)
        .maybeSingle();
    if (error) {
        res.status(500).json({ success: false, message: 'Could not load user' });
        return null;
    }
    if (!data) {
        res.status(404).json({ success: false, message: 'User not found' });
        return null;
    }
    return data;
}

/** Write the audit entry first; refuse the action if it cannot be recorded. */
async function auditOrRefuse(req, res, action, targetUserId, details) {
    const stored = await audit(req, action, { targetUserId, details, required: true });
    if (!stored) {
        res.status(503).json({ success: false, code: 'AUDIT_UNAVAILABLE', message: 'Action refused: the audit log is unavailable (run supabase/v1_4_admin_ops.sql)' });
    }
    return stored;
}

async function setSuspended(req, res, suspend) {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const target = await loadTarget(req, res);
    if (!target) return;
    if (target.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot suspend your own account' });
    }
    if (target.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Admin accounts cannot be suspended from the panel' });
    }
    if (target.is_banned === suspend) {
        return res.json({ success: true, unchanged: true, message: `User is already ${suspend ? 'suspended' : 'active'}` });
    }

    const action = suspend ? 'user_suspended' : 'user_reinstated';
    if (!(await auditOrRefuse(req, res, action, target.id, { reason: parsed.data.reason }))) return;

    const { data: updated, error } = await supabase
        .from('profiles')
        .update({ is_banned: suspend })
        .eq('id', target.id)
        .select(USER_COLUMNS_LEGACY)
        .single();
    if (error) {
        console.error('Admin: suspend update failed:', error.message);
        await audit(req, `${action}_failed`, { targetUserId: target.id });
        return res.status(500).json({ success: false, message: 'Could not update the account' });
    }
    invalidateBanCache(target.id);

    // Also block token refresh at the auth layer; the profile flag already
    // blocks every API request through `protect`.
    const { error: authBanError } = await supabase.auth.admin.updateUserById(target.id, {
        ban_duration: suspend ? '876000h' : 'none',
    });
    if (authBanError) console.error('Admin: auth-level ban update failed:', authBanError.message);

    res.json({
        success: true,
        message: suspend ? 'User suspended' : 'User reinstated',
        authLayerUpdated: !authBanError,
        user: presentUser(updated),
    });
}

// @route POST /api/admin/users/:id/suspend   { reason }
router.post('/users/:id/suspend', (req, res) => setSuspended(req, res, true));
// @route POST /api/admin/users/:id/reinstate { reason }
router.post('/users/:id/reinstate', (req, res) => setSuspended(req, res, false));

const MAX_GRANT_MS = 5 * 366 * 86400000;
const grantSchema = z.object({
    reason: reasonSchema,
    // null = a non-expiring manual grant; otherwise an ISO date in the future.
    expiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

// @route POST /api/admin/users/:id/pro { expiresAt, reason } — manual Pro grant
// This is an operator grant (support, testing, promotion), not a sale: there
// is no billing integration and no revenue is recorded.
router.post('/users/:id/pro', async (req, res) => {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { reason, expiresAt } = parsed.data;

    if (expiresAt !== null) {
        const ms = new Date(expiresAt).getTime() - Date.now();
        if (ms <= 0) return res.status(400).json({ success: false, message: 'Expiry must be in the future' });
        if (ms > MAX_GRANT_MS) return res.status(400).json({ success: false, message: 'Expiry cannot be more than 5 years away' });
    }

    const target = await loadTarget(req, res);
    if (!target) return;

    const details = {
        reason,
        expiresAt,
        previous: { isPro: target.is_pro, expiresAt: target.pro_expires_at },
    };
    if (!(await auditOrRefuse(req, res, 'pro_granted', target.id, details))) return;

    const { data: updated, error } = await supabase
        .from('profiles')
        .update({ is_pro: true, pro_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null })
        .eq('id', target.id)
        .select(USER_COLUMNS_LEGACY)
        .single();
    if (error) {
        console.error('Admin: Pro grant failed:', error.message);
        await audit(req, 'pro_granted_failed', { targetUserId: target.id });
        return res.status(500).json({ success: false, message: 'Could not grant Pro' });
    }
    res.json({ success: true, message: 'Pro granted', user: presentUser(updated) });
});

// @route DELETE /api/admin/users/:id/pro { reason } — revoke a manual grant
router.delete('/users/:id/pro', async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const target = await loadTarget(req, res);
    if (!target) return;
    if (!target.is_pro) return res.json({ success: true, unchanged: true, message: 'User does not have Pro' });

    const details = { reason: parsed.data.reason, previous: { isPro: target.is_pro, expiresAt: target.pro_expires_at } };
    if (!(await auditOrRefuse(req, res, 'pro_revoked', target.id, details))) return;

    const { data: updated, error } = await supabase
        .from('profiles')
        .update({ is_pro: false, pro_expires_at: null })
        .eq('id', target.id)
        .select(USER_COLUMNS_LEGACY)
        .single();
    if (error) {
        console.error('Admin: Pro revoke failed:', error.message);
        await audit(req, 'pro_revoked_failed', { targetUserId: target.id });
        return res.status(500).json({ success: false, message: 'Could not revoke Pro' });
    }
    res.json({ success: true, message: 'Pro revoked', user: presentUser(updated) });
});

// ─── Activity timeline ──────────────────────────────────────────────────────
const TIMELINE_DAYS = 90;
const TIMELINE_SCAN = 1000;
const SOURCE_LABELS = { manual: 'manual', upi_auto: 'UPI', ai_scan: 'receipt scan', pdf_import: 'statement import' };
const ADMIN_EVENT_LABELS = {
    pro_granted: 'Pro granted', pro_extended: 'Pro extended', pro_revoked: 'Pro revoked',
    user_suspended: 'Account suspended', user_reinstated: 'Account reinstated',
};

/** Group rows by local calendar day and a key, so busy users do not flood the timeline. */
function byDay(rows, keyOf) {
    const groups = new Map();
    for (const row of rows) {
        const day = appTime.localDateKey(new Date(row.created_at));
        const id = `${day}|${keyOf(row)}`;
        const g = groups.get(id) || { key: keyOf(row), count: 0, latest: row.created_at };
        g.count++;
        if (row.created_at > g.latest) g.latest = row.created_at;
        groups.set(id, g);
    }
    return [...groups.values()];
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// @route GET /api/admin/users/:id/timeline — meaningful events, no financial details
//
// Built from existing tables. Amounts, descriptions, merchants, bank names,
// bill names and AI chat contents are never included; expenses and AI
// questions are grouped per day. Events Spendly does not record are listed in
// `notTracked` rather than invented.
router.get('/users/:id/timeline', async (req, res) => {
    if (!validId(req, res)) return;
    const userId = req.params.id;
    const since = new Date(Date.now() - TIMELINE_DAYS * 86400000).toISOString();

    const { data: profile, error: pErr } = await supabase.from('profiles').select('id, created_at').eq('id', userId).maybeSingle();
    if (pErr) return res.status(500).json({ success: false, message: 'Could not load user' });
    if (!profile) return res.status(404).json({ success: false, message: 'User not found' });

    const recent = (table, columns, { apply = (q) => q, dateColumn = 'created_at' } = {}) => apply(
        supabase.from(table).select(columns).eq('user_id', userId).gte(dateColumn, since),
    ).order(dateColumn, { ascending: false }).limit(TIMELINE_SCAN);

    const [expenses, questions, bills, cancelled, imports, memberships, groupsCreated, adminActions, authUser] = await Promise.all([
        recent('expenses', 'created_at, source'),
        recent('ai_chat_history', 'created_at', { apply: (q) => q.eq('role', 'user') }),
        recent('recurring_bills', 'created_at'),
        recent('cancelled_subscriptions', 'cancelled_at', { dateColumn: 'cancelled_at' }),
        recent('pdf_imports', 'created_at, status, transactions_count'),
        recent('group_members', 'joined_at, group_id', { dateColumn: 'joined_at' }),
        supabase.from('groups').select('id, created_at').eq('created_by', userId).gte('created_at', since).limit(TIMELINE_SCAN),
        supabase.from('admin_audit_log').select('action, created_at, details')
            .eq('target_user_id', userId)
            .in('action', Object.keys(ADMIN_EVENT_LABELS))
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(200),
        supabase.auth.admin.getUserById(userId),
    ]);

    const events = [];
    const push = (at, type, label, extra = {}) => { if (at) events.push({ at, type, label, ...extra }); };

    if (profile.created_at && profile.created_at >= since) push(profile.created_at, 'signup', 'Signed up');
    const lastSignIn = authUser?.data?.user?.last_sign_in_at;
    if (lastSignIn && lastSignIn >= since) push(lastSignIn, 'login', 'Most recent sign-in');

    for (const g of byDay(expenses.data || [], (r) => r.source)) {
        if (g.key === 'upi_auto') push(g.latest, 'upi_confirmed', `Confirmed ${plural(g.count, 'UPI payment')}`, { count: g.count });
        else push(g.latest, g.key === 'pdf_import' ? 'pdf_transactions' : 'expense_created', `Added ${plural(g.count, 'expense')} (${SOURCE_LABELS[g.key] || g.key})`, { count: g.count });
    }
    for (const g of byDay(questions.data || [], () => 'ai')) {
        push(g.latest, 'ai_used', `Asked the AI coach ${plural(g.count, 'question')}`, { count: g.count });
    }
    for (const b of bills.data || []) push(b.created_at, 'subscription_added', 'Added a recurring bill');
    for (const c of cancelled.data || []) push(c.cancelled_at, 'subscription_cancelled', 'Marked a subscription as cancelled');
    for (const i of imports.data || []) {
        push(i.created_at, 'pdf_imported', i.status === 'completed' ? `Imported a statement (${plural(i.transactions_count, 'transaction')})` : `Statement import ${i.status}`);
    }
    const created = new Set((groupsCreated.data || []).map((g) => g.id));
    for (const g of groupsCreated.data || []) push(g.created_at, 'group_created', 'Created a Group Pool');
    for (const m of memberships.data || []) {
        if (!created.has(m.group_id)) push(m.joined_at, 'group_joined', 'Joined a Group Pool');
    }
    for (const a of adminActions.data || []) {
        push(a.created_at, a.action.startsWith('pro_') ? 'pro_changed' : 'account_status', ADMIN_EVENT_LABELS[a.action], {
            by: 'owner',
            reason: a.details?.reason || null,
            expiresAt: a.details?.expiresAt,
        });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    res.json({
        success: true,
        windowDays: TIMELINE_DAYS,
        events: events.slice(0, 200),
        truncated: [expenses, questions].some((r) => (r.data || []).length >= TIMELINE_SCAN),
        unavailable: [
            expenses.error && 'expenses', questions.error && 'AI usage', bills.error && 'recurring bills',
            cancelled.error && 'cancelled subscriptions', imports.error && 'PDF imports', adminActions.error && 'admin actions',
        ].filter(Boolean),
        notTracked: [
            'Expense and goal deletions (rows are deleted, not logged)',
            'Login history (only the most recent sign-in is known)',
            'UPI detections that were not confirmed (they stay on the device)',
            'Goal creation dates (a savings target has no timestamp)',
            'CSV imports (not a Spendly feature)',
        ],
    });
});

// ─── Pro management ─────────────────────────────────────────────────────────
const PRO_ACTIONS = ['pro_granted', 'pro_extended', 'pro_revoked'];
const WEEK_MS = 7 * 86400000;

const proListSchema = z.object({
    state: z.enum(['active', 'expiring', 'expired', 'all']).optional().default('active'),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional().default(25),
}).strict();

/** Apply a Pro state filter to a profiles query. */
function proState(query, state, now) {
    const nowIso = now.toISOString();
    query = query.eq('is_pro', true);
    if (state === 'active') return query.or(`pro_expires_at.is.null,pro_expires_at.gt.${nowIso}`);
    if (state === 'expired') return query.lt('pro_expires_at', nowIso);
    if (state === 'expiring') return query.gt('pro_expires_at', nowIso).lte('pro_expires_at', new Date(now.getTime() + WEEK_MS).toISOString());
    return query;
}

// @route GET /api/admin/pro — entitlement summary, Pro users, entitlement history
router.get('/pro', async (req, res) => {
    const parsed = proListSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid filter');
    const { state, page, pageSize } = parsed.data;
    const now = new Date();
    const from = (page - 1) * pageSize;

    try {
        const { data: rows, error, count } = await proState(
            supabase.from('profiles').select('id, email, full_name, is_pro, pro_expires_at', { count: 'exact' }), state, now,
        )
            .order('pro_expires_at', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw error;

        const ids = (rows || []).map((r) => r.id);
        const [grants, totalUsers, activePro, expiredFlags, expiringSoon, history] = await Promise.all([
            ids.length
                ? supabase.from('admin_audit_log').select('target_user_id, action, created_at')
                    .in('target_user_id', ids).in('action', PRO_ACTIONS)
                    .order('created_at', { ascending: false }).limit(1000)
                : Promise.resolve({ data: [] }),
            adminMetrics.count('profiles'),
            adminMetrics.count('profiles', (q) => proState(q, 'active', now)),
            adminMetrics.count('profiles', (q) => proState(q, 'expired', now)),
            adminMetrics.count('profiles', (q) => proState(q, 'expiring', now)),
            supabase.from('admin_audit_log')
                .select('id, action, target_user_id, actor_email, details, created_at')
                .in('action', PRO_ACTIONS)
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        const users = (rows || []).map((r) => {
            const mine = (grants.data || []).filter((g) => g.target_user_id === r.id);
            const lastGrant = mine.find((g) => g.action === 'pro_granted');
            return {
                id: r.id,
                email: r.email,
                name: r.full_name || '',
                active: hasActivePro(r, now),
                expiresAt: r.pro_expires_at,
                activatedAt: lastGrant?.created_at || null,
                lastChangedAt: mine[0]?.created_at || null,
                // Billing does not exist, so every entitlement is an operator grant.
                // Grants made before the audit log existed have no recorded date.
                source: grants.error ? 'unknown' : lastGrant ? 'manual' : 'manual (before audit log)',
            };
        });

        let historyEntries = null;
        if (!history.error) {
            const targetIds = [...new Set((history.data || []).map((h) => h.target_user_id).filter(Boolean))];
            const { data: targets } = targetIds.length
                ? await supabase.from('profiles').select('id, email').in('id', targetIds)
                : { data: [] };
            const emailOf = new Map((targets || []).map((t) => [t.id, t.email]));
            historyEntries = (history.data || []).map((h) => ({
                id: h.id,
                action: h.action,
                targetUserId: h.target_user_id,
                targetEmail: emailOf.get(h.target_user_id) || null,
                by: h.actor_email,
                reason: h.details?.reason || null,
                days: h.details?.days ?? null,
                expiresAt: h.details?.expiresAt ?? null,
                previous: h.details?.previous || null,
                at: h.created_at,
            }));
        }

        res.json({
            success: true,
            billing: { connected: purchasesEnabled(), note: purchasesEnabled() ? null : 'Billing not connected — every entitlement is a manual grant' },
            summary: {
                totalUsers,
                activePro,
                freeUsers: totalUsers - activePro,
                expiredFlags,
                expiringSoon,
                conversionRate: totalUsers ? activePro / totalUsers : null,
            },
            users,
            history: historyEntries,
            pagination: { page, pageSize, total: count ?? users.length, hasMore: from + users.length < (count ?? 0) },
        });
    } catch (err) {
        console.error('Admin Pro overview failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not load Pro data' });
    }
});

const extendSchema = z.object({
    reason: reasonSchema,
    days: z.coerce.number().int().min(1, 'At least 1 day').max(1825, 'At most 5 years'),
}).strict();

// @route POST /api/admin/users/:id/pro/extend { days, reason }
// Adds days to the current expiry, or to now if the grant has already expired.
router.post('/users/:id/pro/extend', async (req, res) => {
    const parsed = extendSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { days, reason } = parsed.data;

    const target = await loadTarget(req, res);
    if (!target) return;
    if (!target.is_pro) return res.status(400).json({ success: false, message: 'User does not have Pro — grant it instead' });
    if (!target.pro_expires_at) return res.status(400).json({ success: false, message: 'This Pro grant already has no expiry' });

    const now = Date.now();
    const expiresAt = new Date(Math.max(now, new Date(target.pro_expires_at).getTime()) + days * 86400000);
    if (expiresAt.getTime() - now > MAX_GRANT_MS) {
        return res.status(400).json({ success: false, message: 'Expiry cannot be more than 5 years away' });
    }

    const details = { reason, days, expiresAt: expiresAt.toISOString(), previous: { isPro: true, expiresAt: target.pro_expires_at } };
    if (!(await auditOrRefuse(req, res, 'pro_extended', target.id, details))) return;

    // Compare-and-set on the expiry just read, so a concurrent change is not overwritten.
    const { data: updated, error } = await supabase
        .from('profiles')
        .update({ pro_expires_at: expiresAt.toISOString() })
        .eq('id', target.id)
        .eq('is_pro', true)
        .eq('pro_expires_at', target.pro_expires_at)
        .select(USER_COLUMNS_LEGACY)
        .maybeSingle();
    if (error || !updated) {
        await audit(req, 'pro_extended_failed', { targetUserId: target.id });
        return error
            ? res.status(500).json({ success: false, message: 'Could not extend Pro' })
            : res.status(409).json({ success: false, message: 'Pro changed while extending. Reload and try again.' });
    }
    res.json({ success: true, message: `Pro extended to ${appTime.localDateKey(expiresAt)}`, user: presentUser(updated) });
});

// ─── Audit log ──────────────────────────────────────────────────────────────
const auditListSchema = z.object({
    action: z.string().trim().regex(/^[a-z_]{1,60}$/).optional(),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional().default(50),
}).strict();

// @route GET /api/admin/audit-log
router.get('/audit-log', async (req, res) => {
    const parsed = auditListSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid filter');
    const { action, page, pageSize } = parsed.data;
    const from = (page - 1) * pageSize;

    let query = supabase
        .from('admin_audit_log')
        .select('id, actor_email, action, target_user_id, details, ip, created_at', { count: 'exact' });
    if (action) query = query.eq('action', action);
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

    if (error) {
        return res.status(409).json({ success: false, code: 'MIGRATION_REQUIRED', message: 'Audit log unavailable — run supabase/v1_4_admin_ops.sql' });
    }
    res.json({
        success: true,
        entries: (data || []).map((e) => ({ id: e.id, action: e.action, actor: e.actor_email, targetUserId: e.target_user_id, details: e.details, ip: e.ip, at: e.created_at })),
        pagination: { page, pageSize, total: count ?? 0, hasMore: from + (data || []).length < (count ?? 0) },
    });
});

module.exports = router;
