const { supabase } = require('../config/supabase');
const appTime = require('./appTime');
const { hasActivePro, purchasesEnabled } = require('./entitlements');

/**
 * adminMetrics — the numbers on the owner dashboard, computed from real tables.
 *
 * RULES
 *  - Every figure is a database count or derived directly from one. Nothing is
 *    estimated, sampled or invented.
 *  - A figure that cannot be produced is `null` with a `note` saying why:
 *    the feature does not exist, the data never reaches the server, or the
 *    table is missing because a migration has not been run.
 *  - Aggregates only. No transaction amounts, descriptions or merchants.
 *
 * Calendar periods use the business timezone (APP_TIMEZONE, default IST):
 * "today" from local midnight, "this week" from Monday, "this month" from the 1st.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DISTINCT_PAGE = 1000;
const DISTINCT_MAX_PAGES = 50;

/** A metric value: `{ value }` or `{ value: null, note }`. */
const ok = (value, extra = {}) => ({ value, ...extra });
const unavailable = (note) => ({ value: null, note });

class MetricError extends Error {}

function periods(now = new Date()) {
    const today = appTime.startOfDay(now);
    const { year, month, day } = appTime.zonedParts(now);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
    const daysSinceMonday = (weekday + 6) % 7;
    return {
        now,
        today,
        week: appTime.zonedTimeToUtc(year, month, day - daysSinceMonday),
        month: appTime.startOfMonth(now),
        last24h: new Date(now.getTime() - DAY_MS),
        last7d: new Date(now.getTime() - 7 * DAY_MS),
        last30d: new Date(now.getTime() - 30 * DAY_MS),
    };
}

/** Exact row count with optional filters. Throws MetricError on failure. */
async function count(table, apply = (q) => q) {
    const { count: n, error } = await apply(supabase.from(table).select('*', { count: 'exact', head: true }));
    if (error) throw new MetricError(error.message);
    // PostgREST answers a HEAD count on a missing table with 204, no error and
    // no count. That is "unavailable", never zero.
    if (n === null || n === undefined) throw new MetricError(`${table}: no count returned (table missing?)`);
    return n;
}

/** Run a metric; a failure becomes an explained null instead of failing the page. */
async function safe(fn, note = 'Data unavailable (query failed)') {
    try {
        return await fn();
    } catch (err) {
        if (!(err instanceof MetricError)) console.error('Admin metric error:', err.message);
        return unavailable(note);
    }
}

const missingMigration = (what) => `${what} not available — run supabase/v1_4_admin_ops.sql`;

/**
 * Number of distinct values of `column` in rows matching `apply`, by paging.
 * Exact up to DISTINCT_PAGE * DISTINCT_MAX_PAGES rows; beyond that the result
 * is flagged `lowerBound` rather than silently truncated.
 */
async function distinct(table, column, apply = (q) => q) {
    const seen = new Set();
    for (let page = 0; page < DISTINCT_MAX_PAGES; page++) {
        const from = page * DISTINCT_PAGE;
        const { data, error } = await apply(supabase.from(table).select(column))
            .order(column, { ascending: true })
            .range(from, from + DISTINCT_PAGE - 1);
        if (error) throw new MetricError(error.message);
        for (const row of data || []) seen.add(row[column]);
        if (!data || data.length < DISTINCT_PAGE) return ok(seen.size);
    }
    return ok(seen.size, { lowerBound: true, note: 'At least this many (row scan limit reached)' });
}

const since = (column, instant) => (q) => q.gte(column, instant.toISOString());

async function userMetrics(p) {
    const total = await safe(async () => ok(await count('profiles')));
    const active = (instant) => safe(
        async () => ok(await count('profiles', since('last_active_at', instant))),
        missingMigration('Activity tracking'),
    );

    const [newToday, newWeek, newMonth, activeToday, active7d, active30d, suspended, deleted30d] = await Promise.all([
        safe(async () => ok(await count('profiles', since('created_at', p.today)))),
        safe(async () => ok(await count('profiles', since('created_at', p.week)))),
        safe(async () => ok(await count('profiles', since('created_at', p.month)))),
        active(p.today),
        active(p.last7d),
        active(p.last30d),
        safe(async () => ok(await count('profiles', (q) => q.eq('is_banned', true)))),
        safe(
            async () => ok(await count('ops_events', (q) => q.eq('type', 'account_deleted').gte('created_at', p.last30d.toISOString())), {
                note: 'Accounts are hard-deleted; counted since v1.4 telemetry was deployed',
            }),
            missingMigration('Deletion counts'),
        ),
    ]);

    const inactive = total.value !== null && active30d.value !== null
        ? ok(Math.max(0, total.value - active30d.value), { note: 'No authenticated activity in 30 days (tracking started with v1.4)' })
        : unavailable(active30d.note || 'Data unavailable');

    return { total, newToday, newWeek, newMonth, activeToday, active7d, active30d, inactive, suspended, deleted30d };
}

async function proMetrics(p, totalUsers) {
    const flagged = await safe(async () => {
        const rows = [];
        for (let from = 0; ; from += DISTINCT_PAGE) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, is_pro, pro_expires_at')
                .eq('is_pro', true)
                .order('id', { ascending: true })
                .range(from, from + DISTINCT_PAGE - 1);
            if (error) throw new MetricError(error.message);
            rows.push(...(data || []));
            if (!data || data.length < DISTINCT_PAGE) break;
        }
        return ok(rows);
    });

    if (flagged.value === null) {
        const u = unavailable(flagged.note);
        return { totalFlagged: u, active: u, freeUsers: u, conversionRate: u, expiringSoon: u, newPro30d: u, entitlementChanges30d: u, revenue: revenueStatus() };
    }

    const rows = flagged.value;
    const activeRows = rows.filter((r) => hasActivePro(r, p.now));
    const soon = new Date(p.now.getTime() + 7 * DAY_MS);
    const expiringSoon = activeRows.filter((r) => r.pro_expires_at && new Date(r.pro_expires_at) <= soon).length;

    const entitlementChanges30d = await safe(
        async () => ok(await count('admin_audit_log', (q) => q.in('action', ['pro_granted', 'pro_extended', 'pro_revoked']).gte('created_at', p.last30d.toISOString())), {
            note: 'Grants, extensions and revocations in the last 30 days',
        }),
        missingMigration('Entitlement history'),
    );

    const newPro30d = await safe(
        async () => ok(await count('admin_audit_log', (q) => q.eq('action', 'pro_granted').gte('created_at', p.last30d.toISOString())), {
            note: 'Manual grants from this panel (no billing integration)',
        }),
        missingMigration('Grant history'),
    );

    return {
        totalFlagged: ok(rows.length, { note: 'Profiles with is_pro set, including expired' }),
        active: ok(activeRows.length),
        freeUsers: totalUsers === null || totalUsers === undefined ? unavailable('Total users unavailable') : ok(Math.max(0, totalUsers - activeRows.length), { note: 'Includes expired Pro flags' }),
        entitlementChanges30d,
        conversionRate: totalUsers ? ok(activeRows.length / totalUsers) : unavailable('No users'),
        expiringSoon: ok(expiringSoon, { note: 'Active Pro expiring within 7 days' }),
        newPro30d,
        revenue: revenueStatus(),
    };
}

/** Revenue exists only with real billing. Today there is none. */
function revenueStatus() {
    return purchasesEnabled()
        ? unavailable('Billing enabled but revenue reporting is not implemented')
        : { value: null, connected: false, note: 'Billing: Not enabled' };
}

async function usageMetrics(p) {
    const expensesSince = (instant) => safe(async () => ok(await count('expenses', since('created_at', instant))));
    const bySource = (source) => safe(async () => ok(await count('expenses', (q) => q.eq('source', source).gte('created_at', p.month.toISOString()))));
    const aiQuestions = (instant) => safe(async () => ok(await count('ai_chat_history', (q) => q.eq('role', 'user').gte('created_at', instant.toISOString()))));
    const opsCount = (type, instant) => safe(
        async () => ok(await count('ops_events', (q) => q.eq('type', type).gte('created_at', instant.toISOString()))),
        missingMigration('Error tracking'),
    );

    const [
        expensesToday, expensesWeek, expensesMonth,
        upiConfirmedMonth, receiptScansMonth, pdfRowsMonth,
        savingsTargets, recurringBills, recurringBillsMonth, cancelledSubs,
        groupsTotal, groupsMonth, groupExpenses7d, settlements7d, activePools7d,
        pdfImportsMonth, pdfFailuresMonth,
        aiToday, ai7d, ai30d, aiUsers30d, aiErrors24h, aiErrors7d, aiRejected7d,
    ] = await Promise.all([
        expensesSince(p.today), expensesSince(p.week), expensesSince(p.month),
        bySource('upi_auto'), bySource('ai_scan'), bySource('pdf_import'),
        safe(async () => ok(await count('profiles', (q) => q.gt('investment_target', 0)), { note: 'Users with a savings/investment target set' })),
        safe(async () => ok(await count('recurring_bills', (q) => q.eq('is_active', true)))),
        safe(async () => ok(await count('recurring_bills', since('created_at', p.month)))),
        safe(async () => ok(await count('cancelled_subscriptions')), 'Table missing — run supabase/v1_3_product_core.sql'),
        safe(async () => ok(await count('groups'))),
        safe(async () => ok(await count('groups', since('created_at', p.month)))),
        safe(async () => ok(await count('group_expenses', since('created_at', p.last7d)))),
        safe(async () => ok(await count('settlements', since('created_at', p.last7d)))),
        safe(async () => distinct('group_expenses', 'group_id', since('created_at', p.last7d))),
        safe(async () => ok(await count('pdf_imports', (q) => q.eq('status', 'completed').gte('created_at', p.month.toISOString())))),
        opsCount('pdf_import_failed', p.month),
        aiQuestions(p.today), aiQuestions(p.last7d), aiQuestions(p.last30d),
        safe(async () => distinct('ai_chat_history', 'user_id', (q) => q.eq('role', 'user').gte('created_at', p.last30d.toISOString()))),
        opsCount('ai_error', p.last24h), opsCount('ai_error', p.last7d), opsCount('ai_reply_rejected', p.last7d),
    ]);

    return {
        expenses: { today: expensesToday, week: expensesWeek, month: expensesMonth },
        upi: {
            detections: unavailable('Detected on the device and never sent to the server until the user confirms'),
            confirmationsMonth: upiConfirmedMonth,
        },
        receiptScansMonth,
        imports: {
            pdfMonth: pdfImportsMonth,
            pdfTransactionsMonth: pdfRowsMonth,
            pdfFailuresMonth,
            csv: unavailable('CSV import is not a Vittova feature (CSV export only)'),
        },
        goals: {
            savingsTargets,
            goals: unavailable('There is no goals table; only a single savings target per user'),
        },
        subscriptions: {
            recurringBillsActive: recurringBills,
            recurringBillsAddedMonth: recurringBillsMonth,
            cancelledTracked: cancelledSubs,
            note: 'Subscription detection runs on demand and is not stored',
        },
        groups: { total: groupsTotal, createdMonth: groupsMonth, expenses7d: groupExpenses7d, settlements7d, activePools7d },
        ai: { questionsToday: aiToday, questions7d: ai7d, questions30d: ai30d, users30d: aiUsers30d, errors24h: aiErrors24h, errors7d: aiErrors7d, rejectedReplies7d: aiRejected7d },
    };
}

/** All-time totals for the dashboard's headline row. */
async function totalMetrics(p) {
    const [expenses, receiptScans, pdfImports, aiQuestions, groupUsers, deletedAccounts, aiFallback7d, aiFailed7d] = await Promise.all([
        safe(async () => ok(await count('expenses'))),
        safe(async () => ok(await count('expenses', (q) => q.eq('source', 'ai_scan')), { note: 'Receipts saved as expenses' })),
        safe(async () => ok(await count('pdf_imports', (q) => q.eq('status', 'completed')))),
        safe(async () => ok(await count('ai_chat_history', (q) => q.eq('role', 'user')))),
        safe(async () => distinct('group_members', 'user_id')),
        safe(
            async () => ok(await count('ops_events', (q) => q.eq('type', 'account_deleted')), { note: 'Accounts are hard-deleted; counted since v1.4 telemetry' }),
            missingMigration('Deletion counts'),
        ),
        safe(
            async () => ok(await count('app_events', (q) => q.eq('name', 'ai_question_answered').eq('props->>outcome', 'fallback').gte('created_at', p.last7d.toISOString())), { note: 'Gemini reply unusable or unavailable; calculated answer shown' }),
            'Not available — telemetry not configured (run supabase/v1_6_owner_console.sql)',
        ),
        safe(
            async () => ok(await count('app_events', (q) => q.eq('name', 'ai_question_failed').gte('created_at', p.last7d.toISOString()))),
            'Not available — telemetry not configured (run supabase/v1_6_owner_console.sql)',
        ),
    ]);
    return { expenses, receiptScans, pdfImports, aiQuestions, groupUsers, deletedAccounts, aiFallback7d, aiFailed7d };
}

async function overview(now = new Date()) {
    const p = periods(now);
    const users = await userMetrics(p);
    const [pro, usage, totals] = await Promise.all([proMetrics(p, users.total.value), usageMetrics(p), totalMetrics(p)]);
    return {
        generatedAt: now.toISOString(),
        timezone: appTime.APP_TIMEZONE,
        periods: { today: p.today.toISOString(), week: p.week.toISOString(), month: p.month.toISOString() },
        users,
        pro,
        usage,
        totals,
    };
}

module.exports = { overview, periods, count, distinct, MetricError };
