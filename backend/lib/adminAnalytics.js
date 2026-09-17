const { supabase } = require('../config/supabase');
const appTime = require('./appTime');
const gemini = require('./gemini');
const telemetry = require('./opsTelemetry');
const { hasActivePro, purchasesEnabled } = require('./entitlements');
const { FREE_LIMITS } = require('../middleware/proGate');
const { periods } = require('./adminMetrics');

/**
 * adminAnalytics — Owner Console sections built on v1.6 telemetry and the
 * existing tables: Activity, Installs & versions, Engagement, AI Mentor,
 * Error Center, Settings.
 *
 * Same rules as adminMetrics:
 *  - every figure is counted from rows; nothing is estimated or sampled;
 *  - a figure that cannot be produced is `null` with a note (table missing,
 *    feature not instrumented, not enough data), never zero;
 *  - telemetry has a start date, reported as `trackingSince`, so a count is
 *    never mistaken for all-time history;
 *  - aggregates, event names and codes only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;
const MAX_PAGES = 50; // 50,000 rows per scan; beyond that results are flagged `truncated`

const V16 = 'supabase/v1_6_owner_console.sql';
const notApplied = (what) => `${what} not available — telemetry not configured (run ${V16})`;

/** Read every row matching `build` in pages. Returns { rows, truncated } or { error }. */
async function scan(build, orderColumn = 'created_at') {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE;
        const { data, error } = await build().order(orderColumn, { ascending: false }).range(from, from + PAGE - 1);
        if (error) return { error };
        rows.push(...(data || []));
        if (!data || data.length < PAGE) return { rows, truncated: false };
    }
    return { rows, truncated: true };
}

const EVENT_COLUMNS = 'name, source, user_id, install_id, platform, app_version, props, status_code, duration_ms, created_at';

/** app_events since an instant; null when the table is unavailable. */
async function eventsSince(since, names) {
    const result = await scan(() => {
        let q = supabase.from('app_events').select(EVENT_COLUMNS).gte('created_at', since.toISOString());
        if (names) q = q.in('name', names);
        return q;
    });
    return result.error ? null : result;
}

/** The first recorded app event, i.e. when product telemetry started. */
async function trackingSince() {
    const { data, error } = await supabase.from('app_events').select('created_at').order('created_at', { ascending: true }).limit(1);
    if (error) return { available: false, since: null };
    return { available: true, since: data?.[0]?.created_at || null };
}

/** Local calendar day keys from `days - 1` days ago to today, oldest first. */
function dayKeys(days, now = new Date()) {
    const keys = [];
    for (let i = days - 1; i >= 0; i--) keys.push(appTime.localDateKey(new Date(now.getTime() - i * DAY_MS)));
    return [...new Set(keys)];
}

const countBy = (rows, keyOf) => {
    const map = new Map();
    for (const r of rows) {
        const k = keyOf(r);
        map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
};

const ratio = (part, whole) => (whole > 0 ? part / whole : null);
const ok = (value, extra = {}) => ({ value, ...extra });
const unavailable = (note) => ({ value: null, note });

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]);
}
const average = (values) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

/** 4xx/5xx classification for failure breakdowns. */
function failureKind(status) {
    if (status === 429) return 'limited';
    if (status === 403) return 'blocked';
    if (status >= 500) return 'error';
    return 'rejected';
}

// ─── Activity ───────────────────────────────────────────────────────────────

/** Success/failure pairs for failure-rate reporting. */
const FAILURE_PAIRS = [
    ['Expense saved', 'expense_created', 'expense_create_failed'],
    ['Receipt scan', 'receipt_scanned', 'receipt_scan_failed'],
    ['PDF import', 'pdf_imported', 'pdf_import_failed'],
    ['CSV export', 'csv_exported', 'csv_export_failed'],
    ['AI Mentor answer', 'ai_question_answered', 'ai_question_failed'],
    ['Group join', 'group_joined', 'group_join_failed'],
    ['Sign-in', 'login', 'login_failed'],
    ['Sign-up', 'signup', 'signup_failed'],
    ['Password reset email', 'password_reset_requested', 'password_reset_failed'],
    ['Account deletion', 'account_deleted', 'account_delete_failed'],
];

/** Events Vittova does not (or cannot) record, stated rather than invented. */
const NOT_TRACKED = [
    'UPI payment detections — they stay on the device until the user confirms (confirmations are counted as expense_created with source upi_auto)',
    'CSV import — not a Vittova feature (CSV export is tracked)',
    'Pro subscription purchases, renewals, cancellations — billing is not enabled (manual Pro changes are in the audit log)',
    'App uninstalls — needs Google Play Console reporting',
    'Sign-ins and app opens on app builds released before this telemetry shipped',
];

async function activity({ days = 30, now = new Date() } = {}) {
    const since = new Date(now.getTime() - days * DAY_MS);
    const [tracking, result] = await Promise.all([trackingSince(), eventsSince(since)]);
    if (!tracking.available || !result) {
        return { available: false, note: notApplied('Product analytics'), notTracked: NOT_TRACKED };
    }
    const rows = result.rows;
    const keys = dayKeys(days, now);

    const byName = [...countBy(rows, (r) => `${r.source}|${r.name}`).entries()]
        .map(([k, count]) => {
            const [source, name] = k.split('|');
            return { name, source, count, users: new Set(rows.filter((r) => r.name === name && r.user_id).map((r) => r.user_id)).size };
        })
        .sort((a, b) => b.count - a.count);

    // Daily trend: all events, distinct signed-in users, and headline events.
    const TREND_EVENTS = ['expense_created', 'ai_question_answered', 'login', 'first_launch', 'app_open'];
    const daily = new Map(keys.map((k) => [k, { date: k, events: 0, users: new Set(), ...Object.fromEntries(TREND_EVENTS.map((e) => [e, 0])) }]));
    for (const r of rows) {
        const d = daily.get(appTime.localDateKey(new Date(r.created_at)));
        if (!d) continue;
        d.events++;
        if (r.user_id) d.users.add(r.user_id);
        if (TREND_EVENTS.includes(r.name)) d[r.name]++;
    }

    // Weekly roll-up (7-day buckets ending today).
    const weekly = [];
    for (let end = keys.length; end > 0; end -= 7) {
        const bucket = keys.slice(Math.max(0, end - 7), end);
        const users = new Set();
        let events = 0;
        for (const k of bucket) {
            const d = daily.get(k);
            events += d.events;
            d.users.forEach((u) => users.add(u));
        }
        weekly.unshift({ from: bucket[0], to: bucket[bucket.length - 1], events, users: users.size });
    }

    const counts = countBy(rows, (r) => r.name);
    const failureRates = FAILURE_PAIRS.map(([label, success, failure]) => {
        const failures = rows.filter((r) => r.name === failure);
        const okCount = counts.get(success) || 0;
        const kinds = countBy(failures, (r) => (r.status_code ? failureKind(r.status_code) : 'error'));
        return {
            label,
            success: okCount,
            failed: failures.length,
            failureRate: ratio(failures.length, okCount + failures.length),
            breakdown: Object.fromEntries(kinds),
        };
    }).filter((f) => f.success + f.failed > 0);

    const recent = rows.slice(0, 50).map((r) => ({
        name: r.name,
        source: r.source,
        userId: r.user_id,
        platform: r.platform,
        appVersion: r.app_version,
        props: r.props || {},
        statusCode: r.status_code,
        durationMs: r.duration_ms,
        at: r.created_at,
    }));

    return {
        available: true,
        windowDays: days,
        trackingSince: tracking.since,
        truncated: result.truncated,
        totals: {
            events: rows.length,
            server: rows.filter((r) => r.source === 'server').length,
            client: rows.filter((r) => r.source === 'client').length,
            users: new Set(rows.filter((r) => r.user_id).map((r) => r.user_id)).size,
        },
        byName,
        daily: [...daily.values()].map((d) => ({ ...d, users: d.users.size })),
        weekly,
        failureRates,
        recent,
        notTracked: NOT_TRACKED,
    };
}

// ─── Installs & versions ────────────────────────────────────────────────────

/** Compare dotted versions numerically ("1.10.0" > "1.9.2"); suffixes ignored. */
function compareVersions(a, b) {
    const parts = (v) => String(v || '').split(/[-+]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
    const pa = parts(a);
    const pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

const PLAY_CONSOLE = {
    connected: false,
    note: 'Play Store downloads, uninstalls and store ratings need the Google Play Console reporting integration, which is not connected. Nothing on this page is a Play Store figure.',
};

async function installs({ days = 30, now = new Date() } = {}) {
    const p = periods(now);
    const result = await scan(() => supabase.from('app_installs').select('install_id, platform, app_version, user_id, first_seen_at, last_seen_at'), 'first_seen_at');
    if (result.error) {
        return { available: false, note: notApplied('Install tracking'), playStore: PLAY_CONSOLE };
    }
    // Both timestamps default to now() in the table; tolerate a missing one rather than crash.
    const rows = result.rows
        .map((r) => ({ ...r, first_seen_at: r.first_seen_at || r.last_seen_at, last_seen_at: r.last_seen_at || r.first_seen_at }))
        .filter((r) => r.first_seen_at && !Number.isNaN(new Date(r.first_seen_at).getTime()));
    const since = (instant, column = 'first_seen_at') => rows.filter((r) => new Date(r[column]) >= instant);
    const byPlatform = (list) => Object.fromEntries(countBy(list, (r) => r.platform));

    const keys = dayKeys(days, now);
    const trend = new Map(keys.map((k) => [k, { date: k, android: 0, ios: 0, web: 0 }]));
    for (const r of rows) {
        const d = trend.get(appTime.localDateKey(new Date(r.first_seen_at)));
        if (d) d[r.platform]++;
    }

    // Version distribution per platform.
    const versions = new Map();
    const active30 = new Date(now.getTime() - 30 * DAY_MS);
    for (const r of rows) {
        const key = `${r.platform}|${r.app_version || 'unknown'}`;
        const v = versions.get(key) || { platform: r.platform, version: r.app_version || 'unknown', installs: 0, active30d: 0, users: new Set(), firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at };
        v.installs++;
        if (new Date(r.last_seen_at) >= active30) {
            v.active30d++;
            if (r.user_id) v.users.add(r.user_id);
        }
        if (r.first_seen_at < v.firstSeenAt) v.firstSeenAt = r.first_seen_at;
        if (r.last_seen_at > v.lastSeenAt) v.lastSeenAt = r.last_seen_at;
        versions.set(key, v);
    }
    const newest = {};
    for (const v of versions.values()) {
        if (v.version === 'unknown') continue;
        if (!newest[v.platform] || compareVersions(v.version, newest[v.platform]) > 0) newest[v.platform] = v.version;
    }
    const versionList = [...versions.values()]
        .map((v) => ({ ...v, activeUsers30d: v.users.size, users: undefined, newest: v.version === newest[v.platform], outdated: Boolean(newest[v.platform]) && v.version !== 'unknown' && compareVersions(v.version, newest[v.platform]) < 0 }))
        .sort((a, b) => a.platform.localeCompare(b.platform) || compareVersions(b.version, a.version));

    const firstSeen = rows.length ? rows.map((r) => r.first_seen_at).sort()[0] : null;
    return {
        available: true,
        trackingSince: firstSeen,
        truncated: result.truncated,
        playStore: PLAY_CONSOLE,
        note: 'First launches reported by the app (a random id created on first open). A reinstall or cleared app data counts as a new install. Web visits to vittova.in are counted separately as platform "web".',
        totals: {
            all: rows.length,
            byPlatform: byPlatform(rows),
            today: since(p.today).length,
            week: since(p.week).length,
            month: since(p.month).length,
            todayByPlatform: byPlatform(since(p.today)),
            weekByPlatform: byPlatform(since(p.week)),
            monthByPlatform: byPlatform(since(p.month)),
            active7d: since(p.last7d, 'last_seen_at').length,
            active30d: since(p.last30d, 'last_seen_at').length,
            active30dByPlatform: byPlatform(since(p.last30d, 'last_seen_at')),
            linkedToAccount: rows.filter((r) => r.user_id).length,
        },
        uninstalls: { value: null, note: 'Not measurable from inside the app; needs Google Play Console reporting' },
        trend: [...trend.values()],
        versions: versionList,
        newestVersion: newest,
    };
}

// ─── Engagement & retention ─────────────────────────────────────────────────

async function engagement({ now = new Date() } = {}) {
    const p = periods(now);
    const source = 'admin_user_stats';
    const result = await scan(() => supabase.from('admin_user_stats').select('id, created_at, last_active_at, last_activity_at, expense_count, ai_question_count'), 'created_at');
    if (result.error) {
        return { available: false, note: 'Engagement needs supabase/v1_4_admin_ops.sql (admin_user_stats)' };
    }
    const users = result.rows;
    const total = users.length;
    const lastSeen = (u) => [u.last_active_at, u.last_activity_at].filter(Boolean).sort().pop() || null;
    const activeSince = (instant) => users.filter((u) => u.last_active_at && new Date(u.last_active_at) >= instant).length;

    const withExpense = users.filter((u) => u.expense_count >= 1).length;
    const with5Expenses = users.filter((u) => u.expense_count >= 5).length;
    const withAi = users.filter((u) => u.ai_question_count >= 1).length;

    // Returned = seen (API request, expense, AI question or import) at least N
    // days after signing up. last_active_at only exists since v1.4, so returns
    // before then are visible only through recorded content: a lower bound.
    const retention = (days) => {
        const cohort = users.filter((u) => new Date(u.created_at).getTime() <= now.getTime() - days * DAY_MS);
        const returned = cohort.filter((u) => {
            const seen = lastSeen(u);
            return seen && new Date(seen).getTime() >= new Date(u.created_at).getTime() + days * DAY_MS;
        });
        if (!cohort.length) return unavailable(`No users signed up ${days}+ days ago yet`);
        return ok(returned.length / cohort.length, {
            returned: returned.length,
            cohort: cohort.length,
            lowerBound: true,
            note: `Of ${cohort.length} users who joined ${days}+ days ago, ${returned.length} were seen on day ${days} or later. A lower bound: request-level activity is tracked only since the v1.4 migration.`,
        });
    };

    const returning = users.filter((u) => {
        const seen = lastSeen(u);
        return seen && new Date(seen).getTime() >= new Date(u.created_at).getTime() + DAY_MS;
    }).length;

    const trackingNote = 'Authenticated API request in the window (profiles.last_active_at, written at most every 10 minutes)';
    return {
        available: true,
        source,
        generatedAt: now.toISOString(),
        totalUsers: total,
        dau: ok(activeSince(p.today), { note: `Since local midnight. ${trackingNote}` }),
        wau: ok(activeSince(p.last7d), { note: 'Last 7 days' }),
        mau: ok(activeSince(p.last30d), { note: 'Last 30 days' }),
        stickiness: ok(ratio(activeSince(p.today), activeSince(p.last30d)), { note: 'DAU ÷ MAU' }),
        returningUsers: ok(returning, { note: 'Seen at least one day after signing up (lower bound)' }),
        usersWith1Expense: ok(withExpense),
        usersWith5Expenses: ok(with5Expenses),
        signupToFirstExpense: ok(ratio(withExpense, total), { note: `${withExpense} of ${total} registered users have logged an expense` }),
        signupToFirstAiQuestion: ok(ratio(withAi, total), { note: `${withAi} of ${total} registered users have asked the AI Mentor` }),
        retention7d: retention(7),
        retention30d: retention(30),
        truncated: result.truncated,
    };
}

// ─── AI Mentor monitoring ───────────────────────────────────────────────────

async function aiMentor({ now = new Date() } = {}) {
    const p = periods(now);
    const questions = (instant) => supabase.from('ai_chat_history').select('*', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', instant.toISOString());
    const countOf = async (q) => {
        const { count, error } = await q;
        return error || count === null || count === undefined ? unavailable('Could not read ai_chat_history') : ok(count);
    };

    const [total, today, week, month, events, opsErrors, quotaRows, memorySnapshot] = await Promise.all([
        countOf(supabase.from('ai_chat_history').select('*', { count: 'exact', head: true }).eq('role', 'user')),
        countOf(questions(p.today)),
        countOf(questions(p.last7d)),
        countOf(questions(p.last30d)),
        eventsSince(p.last30d, ['ai_question_answered', 'ai_question_failed']),
        scan(() => supabase.from('ops_events').select('type, severity, code, route, created_at').in('type', ['ai_error', 'ai_reply_rejected', 'ai_self_check']).gte('created_at', p.last30d.toISOString())),
        scan(() => supabase.from('profiles').select('id, is_pro, pro_expires_at, chat_messages_today, chat_messages_reset_at').eq('chat_messages_reset_at', appTime.localDateKey(now)), 'id'),
        Promise.resolve(telemetry.aiSnapshot()),
    ]);

    // Outcomes of mentor questions (v1.6 telemetry).
    let outcomes = null;
    if (events) {
        const window = (instant) => events.rows.filter((r) => new Date(r.created_at) >= instant);
        const summarise = (rows) => {
            const answered = rows.filter((r) => r.name === 'ai_question_answered');
            const failed = rows.filter((r) => r.name === 'ai_question_failed');
            const by = (o) => answered.filter((r) => r.props?.outcome === o).length;
            const durations = answered.map((r) => r.duration_ms).filter(Number.isFinite);
            return {
                requests: answered.length + failed.length,
                answered: answered.length,
                geminiAnswers: by('ai'),
                fallbackAnswers: by('fallback'),
                calculatedAnswers: by('calculated'),
                failed: failed.length,
                failedBreakdown: Object.fromEntries(countBy(failed, (r) => failureKind(r.status_code))),
                fallbackRate: ratio(by('fallback'), by('ai') + by('fallback')),
                avgResponseMs: average(durations),
                p95ResponseMs: percentile(durations, 95),
            };
        };
        const intents = countBy(window(p.last30d).filter((r) => r.name === 'ai_question_answered' && r.props?.intent), (r) => r.props.intent);
        const keys = dayKeys(14, now);
        const daily = new Map(keys.map((k) => [k, { date: k, gemini: 0, fallback: 0, calculated: 0, failed: 0 }]));
        for (const r of events.rows) {
            const d = daily.get(appTime.localDateKey(new Date(r.created_at)));
            if (!d) continue;
            if (r.name === 'ai_question_failed') d.failed++;
            else if (r.props?.outcome === 'ai') d.gemini++;
            else if (r.props?.outcome === 'fallback') d.fallback++;
            else d.calculated++;
        }
        outcomes = {
            today: summarise(window(p.today)),
            last24h: summarise(window(p.last24h)),
            last7d: summarise(window(p.last7d)),
            last30d: summarise(events.rows),
            topics30d: [...intents.entries()].map(([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count),
            daily: [...daily.values()],
        };
    }

    // Gemini call failures across all AI features (mentor, receipts, PDF import).
    let failures = null;
    if (!opsErrors.error) {
        const errs = opsErrors.rows.filter((r) => r.type === 'ai_error');
        const rejected = opsErrors.rows.filter((r) => r.type === 'ai_reply_rejected');
        const isTimeout = (c) => /TIMEOUT|ABORT/i.test(String(c || ''));
        // Codes are "<status>:<reason>" (e.g. 400:API_KEY_INVALID) or a class such as AI_TIMEOUT.
        const isHttp = (c) => /^\d{3}(:|$)/.test(String(c || ''));
        const check = opsErrors.rows.find((r) => r.type === 'ai_self_check');
        failures = {
            geminiErrors30d: errs.length,
            geminiErrors24h: errs.filter((r) => new Date(r.created_at) >= p.last24h).length,
            timeouts30d: errs.filter((r) => isTimeout(r.code)).length,
            httpErrors30d: errs.filter((r) => isHttp(r.code)).length,
            rejectedReplies30d: rejected.length,
            byCode: [...countBy(errs, (r) => r.code || 'UNKNOWN').entries()].map(([c, n]) => ({ code: c, count: n, kind: isTimeout(c) ? 'timeout' : isHttp(c) ? 'http' : 'other' })).sort((a, b) => b.count - a.count),
            rejectedByCode: [...countBy(rejected, (r) => r.code || 'UNKNOWN').entries()].map(([c, n]) => ({ code: c, count: n })).sort((a, b) => b.count - a.count),
            recent: opsErrors.rows.filter((r) => r.type !== 'ai_self_check').slice(0, 25).map((r) => ({ type: r.type, code: r.code, route: r.route, at: r.created_at })),
            // Startup request after each deploy (lib/gemini.selfCheck); fixed prompt, no user data.
            lastSelfCheck: check ? { ok: check.severity !== 'error', code: check.code, at: check.created_at } : null,
        };
    }

    // Free-tier daily AI quota (Pro users are not metered).
    let quota = null;
    if (!quotaRows.error) {
        const limit = FREE_LIMITS.chat_message;
        const metered = quotaRows.rows.filter((r) => !hasActivePro(r, now) && Number(r.chat_messages_today) > 0);
        quota = {
            dailyFreeLimit: limit,
            usersUsingToday: metered.length,
            messagesUsedToday: metered.reduce((s, r) => s + Number(r.chat_messages_today), 0),
            usersAtLimit: metered.filter((r) => Number(r.chat_messages_today) >= limit).length,
            usersNearLimit: metered.filter((r) => Number(r.chat_messages_today) >= Math.ceil(limit * 0.8) && Number(r.chat_messages_today) < limit).length,
            resetsAt: new Date(p.today.getTime() + DAY_MS).toISOString(),
        };
    }

    return {
        generatedAt: now.toISOString(),
        health: aiHealth({ outcomes, failures, memory: memorySnapshot }),
        config: { geminiConfigured: gemini.isConfigured(), model: gemini.modelName(), replyTimeoutMs: Number(process.env.AI_REPLY_TIMEOUT_MS) || 15000 },
        questions: { total, today, last7d: week, last30d: month, note: 'Questions stored in ai_chat_history (all time)' },
        outcomes,
        outcomesNote: outcomes ? null : notApplied('Answer outcomes, fallback rate and response times'),
        failures,
        failuresNote: failures ? null : 'Gemini error tracking unavailable — run supabase/v1_4_admin_ops.sql',
        quota,
        sinceRestart: memorySnapshot,
        privacy: 'Questions and answers are never shown here; only counts, outcomes, topics (classified intent) and error codes.',
    };
}

/**
 * GREEN  Gemini configured and answering; fallback under 20% and no errors in the last hour.
 * YELLOW degraded: fallbacks above 20%, recent Gemini errors, or some failed requests.
 * RED    Gemini not configured, or recent requests all falling back / failing.
 * UNKNOWN no mentor requests to judge (never assumed healthy).
 */
function aiHealth({ outcomes, failures, memory }) {
    if (!gemini.isConfigured()) {
        return { state: 'RED', detail: 'GEMINI_API_KEY is not set: the mentor can only give calculated answers; receipt scan and PDF import are off.' };
    }
    const check = failures?.lastSelfCheck;
    if (check && !check.ok && !(memory.lastSuccessAt && memory.lastSuccessAt > check.at) && !(outcomes?.last24h?.geminiAnswers > 0)) {
        return { state: 'RED', detail: `Gemini startup self-check failed (${check.code}) and no successful call since` };
    }
    const failingNow = memory.lastFailureAt && (!memory.lastSuccessAt || memory.lastFailureAt > memory.lastSuccessAt);
    if (failingNow && memory.failures >= 3) {
        return { state: 'RED', detail: `Recent Gemini calls are failing (last code ${memory.lastFailureCode})` };
    }
    const day = outcomes?.last24h;
    if (day && day.requests >= 3) {
        const served = day.geminiAnswers + day.fallbackAnswers;
        if (served > 0 && day.geminiAnswers === 0) return { state: 'RED', detail: `All ${served} mentor answers in 24h fell back to calculated answers` };
        if (day.fallbackRate !== null && day.fallbackRate > 0.2) return { state: 'YELLOW', detail: `${Math.round(day.fallbackRate * 100)}% of mentor answers in 24h used the fallback` };
        if ((day.failedBreakdown.error || 0) > 0) return { state: 'YELLOW', detail: `${day.failedBreakdown.error} mentor request(s) failed with a server error in 24h` };
    }
    if (failures && failures.geminiErrors24h > 0) {
        return { state: 'YELLOW', detail: `${failures.geminiErrors24h} Gemini error(s) in the last 24h across AI features` };
    }
    if ((day && day.geminiAnswers > 0) || memory.lastSuccessAt) {
        return { state: 'GREEN', detail: 'Gemini is answering normally' };
    }
    return { state: 'UNKNOWN', detail: outcomes ? 'No mentor requests in the last 24h to judge' : 'Configured; no outcome telemetry yet (run the v1.6 migration) and no calls since the last restart' };
}

// ─── Error Center ───────────────────────────────────────────────────────────

const FINGERPRINT_RE = /^[a-z0-9_]{1,60}\|[^|]{1,120}\|[^|]{1,60}\|[0-9-]{1,3}$/i;

function fingerprintOf(e) {
    return `${e.type}|${e.route || '-'}|${e.code || '-'}|${e.status_code || '-'}`;
}

function categoryOf(type) {
    if (type.startsWith('http_')) return 'backend';
    if (type.startsWith('ai_')) return 'ai';
    if (type.startsWith('pdf_') || type.startsWith('receipt_')) return 'import';
    if (type.startsWith('job_')) return 'job';
    if (type.startsWith('account_')) return 'account';
    return 'other';
}

const SEVERITY_RANK = { info: 0, warning: 1, error: 2 };

async function errorCenter({ days = 7, severity = 'all', type, route, category = 'all', state = 'open', from, to, page = 1, pageSize = 25, now = new Date() } = {}) {
    const since = from ? new Date(from) : new Date(now.getTime() - days * DAY_MS);
    const until = to ? new Date(to) : null;
    const result = await scan(() => {
        let q = supabase.from('ops_events').select('type, severity, route, code, status_code, created_at').gte('created_at', since.toISOString());
        if (until) q = q.lte('created_at', until.toISOString());
        return q;
    });
    if (result.error) return { available: false, note: 'Error tracking unavailable — run supabase/v1_4_admin_ops.sql' };

    // Info events (job runs, account deletions) are operations, not errors.
    const rows = result.rows.filter((e) => e.severity !== 'info');
    const groups = new Map();
    for (const e of rows) {
        const fp = fingerprintOf(e);
        const g = groups.get(fp) || { fingerprint: fp, type: e.type, category: categoryOf(e.type), route: e.route, code: e.code, statusCode: e.status_code, severity: e.severity, count: 0, firstSeenAt: e.created_at, lastSeenAt: e.created_at };
        g.count++;
        if (SEVERITY_RANK[e.severity] > SEVERITY_RANK[g.severity]) g.severity = e.severity;
        if (e.created_at < g.firstSeenAt) g.firstSeenAt = e.created_at;
        if (e.created_at > g.lastSeenAt) g.lastSeenAt = e.created_at;
        groups.set(fp, g);
    }

    let states = new Map();
    let resolutionAvailable = true;
    const fps = [...groups.keys()];
    if (fps.length) {
        const { data, error } = await supabase.from('ops_issue_states').select('fingerprint, resolved_at, resolved_by_email, note').in('fingerprint', fps.slice(0, 500));
        if (error) resolutionAvailable = false;
        else states = new Map((data || []).map((s) => [s.fingerprint, s]));
    }

    let issues = [...groups.values()].map((g) => {
        const s = states.get(g.fingerprint);
        const status = !s ? 'open' : g.lastSeenAt > s.resolved_at ? 'regressed' : 'resolved';
        return { ...g, status, resolution: s ? { at: s.resolved_at, by: s.resolved_by_email, note: s.note } : null };
    });

    const filterOptions = {
        types: [...new Set(issues.map((i) => i.type))].sort(),
        routes: [...new Set(issues.map((i) => i.route).filter(Boolean))].sort(),
        categories: [...new Set(issues.map((i) => i.category))].sort(),
    };

    if (severity !== 'all') issues = issues.filter((i) => i.severity === severity);
    if (type) issues = issues.filter((i) => i.type === type);
    if (route) issues = issues.filter((i) => (i.route || '').toLowerCase().includes(route.toLowerCase()));
    if (category !== 'all') issues = issues.filter((i) => i.category === category);
    if (state === 'open') issues = issues.filter((i) => i.status !== 'resolved');
    else if (state !== 'all') issues = issues.filter((i) => i.status === state);

    issues.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
    const start = (page - 1) * pageSize;

    return {
        available: true,
        resolutionAvailable,
        resolutionNote: resolutionAvailable ? null : notApplied('Marking issues resolved'),
        window: { from: since.toISOString(), to: (until || now).toISOString() },
        truncated: result.truncated,
        summary: {
            occurrences: rows.length,
            issues: groups.size,
            open: [...groups.keys()].filter((fp) => { const s = states.get(fp); return !s || groups.get(fp).lastSeenAt > s.resolved_at; }).length,
            errors: rows.filter((r) => r.severity === 'error').length,
            warnings: rows.filter((r) => r.severity === 'warning').length,
        },
        issues: issues.slice(start, start + pageSize),
        filterOptions,
        pagination: { page, pageSize, total: issues.length, hasMore: start + pageSize < issues.length },
        privacy: 'Error type, route template, error code and status only. Request bodies, query strings, user ids and provider messages are never recorded.',
    };
}

/** Whether a fingerprint currently exists in ops_events (last 90 days). */
async function issueExists(fingerprint) {
    const [type, route, code, status] = fingerprint.split('|');
    let q = supabase.from('ops_events').select('type', { count: 'exact', head: true })
        .eq('type', type)
        .gte('created_at', new Date(Date.now() - 90 * DAY_MS).toISOString());
    q = route === '-' ? q.is('route', null) : q.eq('route', route);
    q = code === '-' ? q.is('code', null) : q.eq('code', code);
    q = status === '-' ? q.is('status_code', null) : q.eq('status_code', Number(status));
    const { count, error } = await q;
    if (error || count === null || count === undefined) return null;
    return count > 0;
}

// ─── Settings (read-only configuration) ────────────────────────────────────

function maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Whether a table/view exists. A real select: a HEAD request on a missing table does not report an error. */
async function probe(table) {
    const { error } = await supabase.from(table).select('*').limit(1);
    return !error;
}

async function settings() {
    const { configuredOwnerEmail } = require('../middleware/requireOwner');
    const [auditLog, opsEvents, userStats, appEventsOk, appInstallsOk, issueStates] = await Promise.all([
        probe('admin_audit_log'), probe('ops_events'), probe('admin_user_stats'),
        probe('app_events'), probe('app_installs'), probe('ops_issue_states'),
    ]);
    return {
        owner: { adminEmailConfigured: Boolean(configuredOwnerEmail()), adminEmail: maskEmail(configuredOwnerEmail()) },
        environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            version: process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : null,
            timezone: appTime.APP_TIMEZONE,
            node: process.version,
            startedAt: telemetry.STARTED_AT.toISOString(),
        },
        features: {
            billing: { enabled: purchasesEnabled(), note: purchasesEnabled() ? null : 'Billing: Not enabled — Google Play Billing is not implemented; purchases return 501' },
            gemini: { configured: gemini.isConfigured(), model: gemini.modelName() },
            burnRateJob: { enabled: process.env.ENABLE_BURN_RATE_JOB === 'true' },
            playConsole: PLAY_CONSOLE,
        },
        freeTierLimits: FREE_LIMITS,
        migrations: {
            v1_4_admin_ops: { applied: auditLog && opsEvents && userStats, objects: { admin_audit_log: auditLog, ops_events: opsEvents, admin_user_stats: userStats } },
            v1_6_owner_console: { applied: appEventsOk && appInstallsOk && issueStates, objects: { app_events: appEventsOk, app_installs: appInstallsOk, ops_issue_states: issueStates } },
        },
        retention: [
            'ops_events: delete rows older than 90 days (manual / pg_cron)',
            'app_events: delete rows older than 400 days (manual / pg_cron)',
            'admin_audit_log: kept indefinitely; append-only (update/delete blocked by a trigger in v1.6)',
        ],
        security: [
            'Admin API: verified Supabase session + confirmed email equal to ADMIN_EMAIL + profiles.role = admin, checked on every request',
            'Signed-in non-owners receive 403; refused attempts are audited',
            'Service-role and Gemini keys exist only on the backend',
            'Console session is kept in this browser tab only and signs out after 30 minutes idle',
        ],
    };
}

module.exports = { activity, installs, engagement, aiMentor, aiHealth, errorCenter, issueExists, settings, compareVersions, FINGERPRINT_RE, fingerprintOf };
