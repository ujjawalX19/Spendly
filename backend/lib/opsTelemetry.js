/**
 * opsTelemetry — what the owner admin panel knows about the running system.
 *
 * Two kinds of data, kept deliberately separate so the panel can label them
 * honestly:
 *
 *   In-memory, since this process started   request latency, 5xx rate, Gemini
 *                                            call outcomes, job runs. Lost on
 *                                            restart (Render restarts often).
 *   Persisted to public.ops_events          failures and job runs, so recent
 *                                            errors survive a restart.
 *
 * PRIVACY: nothing here records request bodies, query strings, user ids,
 * provider messages, statement text or AI output. Routes are recorded as
 * Express route templates (`/api/groups/:id`), never concrete URLs.
 *
 * Every persisted write is fire-and-forget: telemetry must never slow down or
 * fail a user request, including when the v1.4 migration has not been run.
 */

const STARTED_AT = new Date();
const SAMPLE_SIZE = 2000;

const requestSamples = []; // { at, ms, status }
const totals = { requests: 0, serverErrors: 0 };

const ai = { calls: 0, failures: 0, timeouts: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureCode: null };
const aiLatencies = []; // ms of successful Gemini calls since restart (bounded)

const jobs = new Map(); // name -> { lastRunAt, lastSuccessAt, lastFailureAt }

let persistDisabledLogged = false;

function supabaseClient() {
    // Lazy: modules such as lib/gemini load this file, and must stay usable in
    // unit tests that never configure Supabase.
    return require('../config/supabase').supabase;
}

/** Record a notable event in public.ops_events. Best effort, never throws. */
function recordEvent(type, { severity = 'error', route = null, code = null, statusCode = null, durationMs = null } = {}) {
    let client;
    try {
        client = supabaseClient();
    } catch {
        return;
    }
    Promise.resolve()
        .then(() => client.from('ops_events').insert({
            type: String(type).slice(0, 60),
            severity,
            route: route ? String(route).slice(0, 120) : null,
            code: code ? String(code).slice(0, 60) : null,
            status_code: statusCode,
            duration_ms: durationMs === null ? null : Math.round(durationMs),
        }))
        .then((result) => {
            if (result?.error && !persistDisabledLogged) {
                persistDisabledLogged = true;
                console.error('ops_events unavailable (run supabase/v1_4_admin_ops.sql):', result.error.message);
            }
        })
        .catch(() => { /* telemetry is best effort */ });
}

/** Express route template for a finished request, without ids or query strings. */
function routeTemplate(req) {
    if (req.route?.path) return `${req.baseUrl || ''}${typeof req.route.path === 'string' ? req.route.path : ''}` || 'unmatched';
    return 'unmatched';
}

/** Middleware: time every /api request and record server errors. */
function requestMetrics(req, res, next) {
    const start = process.hrtime.bigint();
    res.once('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        totals.requests++;
        requestSamples.push({ at: Date.now(), ms, status: res.statusCode });
        if (requestSamples.length > SAMPLE_SIZE) requestSamples.shift();
        if (res.statusCode >= 500) {
            totals.serverErrors++;
            recordEvent('http_5xx', { route: `${req.method} ${routeTemplate(req)}`, statusCode: res.statusCode, durationMs: ms });
        }
        // Product events (expense created, AI answered, ...) from the outcome.
        try {
            require('./appEvents').recordRequestOutcome(req, res, ms);
        } catch { /* telemetry is best effort */ }
    });
    next();
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Math.round(sorted[idx]);
}

function requestSnapshot() {
    const durations = requestSamples.map((s) => s.ms).sort((a, b) => a - b);
    const sampleErrors = requestSamples.filter((s) => s.status >= 500).length;
    return {
        since: STARTED_AT.toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        totalRequests: totals.requests,
        totalServerErrors: totals.serverErrors,
        sampleSize: requestSamples.length,
        errorRate: requestSamples.length ? sampleErrors / requestSamples.length : null,
        latencyMs: { p50: percentile(durations, 50), p95: percentile(durations, 95), p99: percentile(durations, 99) },
    };
}

function recordAiSuccess(ms) {
    ai.calls++;
    ai.lastSuccessAt = new Date().toISOString();
    if (Number.isFinite(ms)) {
        aiLatencies.push(ms);
        if (aiLatencies.length > 500) aiLatencies.shift();
    }
}

function recordAiFailure(code) {
    ai.calls++;
    ai.failures++;
    if (/TIMEOUT|ABORT/i.test(String(code || ''))) ai.timeouts++;
    ai.lastFailureAt = new Date().toISOString();
    ai.lastFailureCode = code ? String(code).slice(0, 60) : 'UNKNOWN';
    recordEvent('ai_error', { code: ai.lastFailureCode });
}

function aiSnapshot() {
    const sorted = [...aiLatencies].sort((a, b) => a - b);
    const avg = sorted.length ? Math.round(sorted.reduce((sum, v) => sum + v, 0) / sorted.length) : null;
    return { ...ai, since: STARTED_AT.toISOString(), latencyMs: { avg, p95: percentile(sorted, 95), samples: sorted.length } };
}

function recordJobRun(name, ok, code) {
    const now = new Date().toISOString();
    const entry = jobs.get(name) || { lastRunAt: null, lastSuccessAt: null, lastFailureAt: null };
    entry.lastRunAt = now;
    if (ok) entry.lastSuccessAt = now;
    else entry.lastFailureAt = now;
    jobs.set(name, entry);
    recordEvent(ok ? 'job_run' : 'job_failed', { severity: ok ? 'info' : 'error', route: name, code: ok ? null : code });
}

function jobSnapshot(name) {
    return jobs.get(name) || null;
}

/** Tests only. */
function resetTelemetry() {
    requestSamples.length = 0;
    totals.requests = 0;
    totals.serverErrors = 0;
    Object.assign(ai, { calls: 0, failures: 0, timeouts: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureCode: null });
    aiLatencies.length = 0;
    jobs.clear();
}

module.exports = {
    recordEvent,
    requestMetrics,
    requestSnapshot,
    recordAiSuccess,
    recordAiFailure,
    aiSnapshot,
    recordJobRun,
    jobSnapshot,
    resetTelemetry,
    STARTED_AT,
};
