const { supabase } = require('../config/supabase');
const gemini = require('./gemini');
const telemetry = require('./opsTelemetry');

/**
 * adminHealth — live checks for the System Health screen.
 *
 * Every status comes from a real probe or from recorded outcomes:
 *   HEALTHY   the check ran and passed
 *   WARNING   degraded: slow, or some recent failures
 *   ERROR     the check failed, or the component is not configured
 *   NO_DATA   nothing to judge yet (e.g. no AI calls since the last restart);
 *             shown instead of guessing HEALTHY
 *   DISABLED  switched off by configuration
 *
 * The AI check never calls Gemini: a probe on every page view would cost
 * money. It reports configuration plus the outcomes of real user calls.
 */

const SLOW_DB_MS = 1500;
const SLOW_AUTH_MS = 2000;
const HOUR_MS = 60 * 60 * 1000;

async function timed(fn) {
    const start = Date.now();
    try {
        const result = await fn();
        return { ms: Date.now() - start, result };
    } catch (error) {
        return { ms: Date.now() - start, error };
    }
}

async function databaseCheck() {
    const { ms, result, error } = await timed(() => supabase.from('profiles').select('id', { count: 'exact', head: true }));
    const failed = error || result?.error;
    if (failed) return { status: 'ERROR', latencyMs: ms, detail: 'Database query failed' };
    return { status: ms > SLOW_DB_MS ? 'WARNING' : 'HEALTHY', latencyMs: ms, detail: ms > SLOW_DB_MS ? 'Responding slowly' : 'Query succeeded' };
}

async function authCheck() {
    const { ms, result, error } = await timed(() => supabase.auth.admin.listUsers({ page: 1, perPage: 1 }));
    if (error || result?.error) return { status: 'ERROR', latencyMs: ms, detail: 'Supabase Auth admin API failed' };
    return { status: ms > SLOW_AUTH_MS ? 'WARNING' : 'HEALTHY', latencyMs: ms, detail: ms > SLOW_AUTH_MS ? 'Responding slowly' : 'Auth API reachable' };
}

/** Rows from ops_events, or null if the table is unavailable. */
async function events({ types, sinceMs, limit = 1000, severities }) {
    let q = supabase.from('ops_events').select('type, severity, route, code, status_code, duration_ms, created_at');
    if (types) q = q.in('type', types);
    if (severities) q = q.in('severity', severities);
    if (sinceMs) q = q.gte('created_at', new Date(Date.now() - sinceMs).toISOString());
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
    return error ? null : data || [];
}

function aiCheck(recentErrors) {
    const stats = telemetry.aiSnapshot();
    const base = { model: gemini.modelName(), callsSinceRestart: stats.calls, failuresSinceRestart: stats.failures, lastSuccessAt: stats.lastSuccessAt, lastFailureAt: stats.lastFailureAt, lastFailureCode: stats.lastFailureCode, errorsLastHour: recentErrors };
    if (!gemini.isConfigured()) return { status: 'ERROR', detail: 'GEMINI_API_KEY is not set: receipt scan and PDF import are off; the coach uses calculated answers', ...base };

    const failingNow = stats.lastFailureAt && (!stats.lastSuccessAt || stats.lastFailureAt > stats.lastSuccessAt);
    if (failingNow && stats.failures >= 3) return { status: 'ERROR', detail: 'Recent AI calls are failing', ...base };
    if (stats.calls === 0) {
        if (recentErrors > 0) return { status: 'WARNING', detail: 'AI errors recorded in the last hour (before this restart)', ...base };
        return { status: 'NO_DATA', detail: 'Configured; no AI calls since the last restart', ...base };
    }
    const failureRate = stats.failures / stats.calls;
    if (failureRate > 0.25 || failingNow) return { status: 'WARNING', detail: `${Math.round(failureRate * 100)}% of AI calls failed since restart`, ...base };
    return { status: 'HEALTHY', detail: 'AI calls succeeding', ...base };
}

async function lastRow(table, apply) {
    const { data, error } = await apply(supabase.from(table).select('created_at'))
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) return { error: true };
    return { at: data?.[0]?.created_at || null };
}

async function upiCheck(expenseRouteErrors) {
    const last = await lastRow('expenses', (q) => q.eq('source', 'upi_auto'));
    const base = { lastConfirmedAt: last.at || null, note: 'Detection runs on the Android device; the server receives only confirmed payments' };
    if (last.error) return { status: 'ERROR', detail: 'Could not read UPI expenses', ...base };
    if (expenseRouteErrors === null) return { status: last.at ? 'HEALTHY' : 'NO_DATA', detail: 'Error tracking unavailable (run v1.4 migration)', ...base };
    if (expenseRouteErrors > 0) return { status: 'WARNING', detail: `${expenseRouteErrors} server error(s) saving expenses in the last hour`, ...base };
    if (!last.at) return { status: 'NO_DATA', detail: 'No UPI payment has been confirmed yet', ...base };
    return { status: 'HEALTHY', detail: 'Expense endpoint has no recent server errors', ...base };
}

async function pdfCheck() {
    const last = await lastRow('pdf_imports', (q) => q.eq('status', 'completed'));
    const failures = await events({ types: ['pdf_import_failed'], sinceMs: 24 * HOUR_MS });
    const base = { lastSuccessAt: last.at || null, failures24h: failures ? failures.length : null };
    if (!gemini.isConfigured()) return { status: 'ERROR', detail: 'Unavailable: GEMINI_API_KEY is not set', ...base };
    if (last.error) return { status: 'ERROR', detail: 'Could not read import history', ...base };
    const recentSuccess = last.at && Date.now() - new Date(last.at).getTime() < 24 * HOUR_MS;
    if (failures && failures.length > 0) {
        return { status: recentSuccess ? 'WARNING' : 'ERROR', detail: `${failures.length} failed import(s) in 24h${recentSuccess ? '' : ' and no successful import'}`, ...base };
    }
    if (!last.at) return { status: 'NO_DATA', detail: 'No statement has been imported yet', ...base };
    return { status: 'HEALTHY', detail: failures === null ? 'Error tracking unavailable (run v1.4 migration)' : 'No failures in 24h', ...base };
}

async function backgroundCheck() {
    const enabled = process.env.ENABLE_BURN_RATE_JOB === 'true';
    const memory = telemetry.jobSnapshot('burn_rate_checker');
    const runs = await events({ types: ['job_run', 'job_failed'], limit: 20 });
    const lastSuccess = runs?.find((r) => r.type === 'job_run')?.created_at || memory?.lastSuccessAt || null;
    const lastFailure = runs?.find((r) => r.type === 'job_failed')?.created_at || memory?.lastFailureAt || null;
    const base = { job: 'burn_rate_checker', schedule: 'daily 09:00 (APP_TIMEZONE)', lastSuccessAt: lastSuccess, lastFailureAt: lastFailure };

    if (!enabled) return { status: 'DISABLED', detail: 'ENABLE_BURN_RATE_JOB is not true; no background jobs run', ...base };
    if (lastFailure && (!lastSuccess || lastFailure > lastSuccess)) return { status: 'ERROR', detail: 'Last run failed', ...base };
    if (!lastSuccess) return { status: 'NO_DATA', detail: 'Enabled; has not run yet', ...base };
    const ageH = (Date.now() - new Date(lastSuccess).getTime()) / HOUR_MS;
    if (ageH > 26) return { status: 'WARNING', detail: `Last success ${Math.round(ageH)}h ago (expected daily)`, ...base };
    return { status: 'HEALTHY', detail: 'Ran successfully in the last day', ...base };
}

async function health() {
    const [database, auth, aiErrorsHour, expenseErrors, pdf, background, recent, errors24h] = await Promise.all([
        databaseCheck(),
        authCheck(),
        events({ types: ['ai_error'], sinceMs: HOUR_MS }),
        events({ types: ['http_5xx'], sinceMs: HOUR_MS }),
        pdfCheck(),
        backgroundCheck(),
        events({ severities: ['error', 'warning'], limit: 30 }),
        events({ severities: ['error'], sinceMs: 24 * HOUR_MS, limit: 5000 }),
    ]);

    const requests = telemetry.requestSnapshot();
    const expenseRouteErrors = expenseErrors === null ? null : expenseErrors.filter((e) => String(e.route || '').includes('/api/expenses')).length;

    let apiStatus = 'HEALTHY';
    let apiDetail = 'Serving requests';
    if (requests.errorRate !== null && requests.sampleSize >= 20) {
        if (requests.errorRate > 0.05) { apiStatus = 'ERROR'; apiDetail = 'More than 5% of recent requests failed'; }
        else if (requests.errorRate > 0.01) { apiStatus = 'WARNING'; apiDetail = 'More than 1% of recent requests failed'; }
    }
    if (apiStatus === 'HEALTHY' && requests.latencyMs.p95 !== null && requests.latencyMs.p95 > 3000) {
        apiStatus = 'WARNING';
        apiDetail = 'Slow responses (p95 above 3s)';
    }

    return {
        checkedAt: new Date().toISOString(),
        components: {
            api: {
                status: apiStatus,
                detail: apiDetail,
                version: process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : null,
                node: process.version,
                ...requests,
            },
            database,
            auth,
            ai: aiCheck(aiErrorsHour ? aiErrorsHour.length : 0),
            upi: await upiCheck(expenseRouteErrors),
            pdfImport: pdf,
            background,
        },
        errors: {
            tracking: recent !== null,
            last24h: errors24h ? errors24h.length : null,
            recent: (recent || []).map((e) => ({
                type: e.type, severity: e.severity, route: e.route, code: e.code, statusCode: e.status_code, durationMs: e.duration_ms, at: e.created_at,
            })),
        },
    };
}

module.exports = { health };
