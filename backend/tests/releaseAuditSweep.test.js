/**
 * Release audit sweep: every API route is found from the source (mount points
 * in app.js + router.<method>() calls), then called without a token, with a
 * forged token and as a different user. Complements security.test.js, which
 * covers the older routes one by one; this catches any route that is added
 * later without `protect`, and the v1.1 decision/streak/audit/challenge routes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const ROOT = path.join(__dirname, '..');

/** [{ method, path }] for every route the app mounts, parameters filled with a random UUID. */
function discoverRoutes() {
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const mounts = [...appSrc.matchAll(/app\.use\('(\/api\/[^']+)',\s*require\('\.\/routes\/([^']+)'\)\)/g)]
        .map((m) => ({ prefix: m[1], file: `${m[2]}.js` }));
    // Nested routers (e.g. /api/admin/campaigns).
    const nested = [];
    for (const { prefix, file } of mounts) {
        const src = fs.readFileSync(path.join(ROOT, 'routes', file), 'utf8');
        for (const m of src.matchAll(/router\.use\('([^']+)',\s*require\('\.\/([^']+)'\)\)/g)) nested.push({ prefix: prefix + m[1], file: `${m[2]}.js` });
    }
    const out = [];
    for (const { prefix, file } of [...mounts, ...nested]) {
        const src = fs.readFileSync(path.join(ROOT, 'routes', file), 'utf8');
        for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
            const p = (prefix + (m[2] === '/' ? '' : m[2])).replace(/:[A-Za-z_]+/g, crypto.randomUUID());
            out.push({ method: m[1].toUpperCase(), path: p, file });
        }
    }
    return out;
}

// Routes that are intentionally reachable without a user session, and why.
const PUBLIC = [
    [/^GET \/api\/health$/, 'health check'],
    [/^POST \/api\/telemetry/, 'anonymous crash/usage events (allowlisted names, no user data)'],
    [/^POST \/api\/pro\/rtdn$/, 'Google Play push: authenticated by Google-signed OIDC token instead'],
];
const isPublic = (r) => PUBLIC.some(([re]) => re.test(`${r.method} ${r.path}`));

let t;
test.before(async () => { t = await startTestApp({ env: { ADMIN_EMAIL: 'owner@vittova.test' } }); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); });

test('the sweep finds the whole API (sanity check on discovery)', () => {
    const routes = discoverRoutes();
    assert.ok(routes.length >= 60, `only ${routes.length} routes discovered`);
    for (const must of ['GET /api/decisions/month-shape', 'POST /api/decisions/afford', 'GET /api/money-streak', 'GET /api/subscription-audit', 'GET /api/challenges', 'POST /api/pro/verify-purchase', 'DELETE /api/account']) {
        assert.ok(routes.some((r) => `${r.method} ${r.path}` === must || `${r.method} ${r.path}`.startsWith(must)), `missing ${must}`);
    }
});

test('every non-public route refuses a request with no token, a malformed token or a forged JWT', async () => {
    const forged = ['x', 'Bearer', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.',
        `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated' })).toString('base64url')}.sig`];
    const failures = [];
    for (const r of discoverRoutes()) {
        if (isPublic(r)) continue;
        await t.resetRateLimits();
        const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {};
        const none = await t.request(r.method, r.path, { body });
        if (none.status !== 401) failures.push(`${r.method} ${r.path} no token -> ${none.status}`);
        for (const token of forged) {
            const res = await t.request(r.method, r.path, { token, body });
            if (res.status !== 401) failures.push(`${r.method} ${r.path} forged -> ${res.status}`);
        }
    }
    assert.deepEqual(failures, []);
});

test('public routes are the documented few and leak nothing personal', async () => {
    const pub = discoverRoutes().filter(isPublic).map((r) => `${r.method} ${r.path}`);
    for (const p of pub) assert.ok(PUBLIC.some(([re]) => re.test(p)), p);
    // /api/health is declared in app.js itself, so discovery lists only these two.
    assert.deepEqual(pub.sort(), ['POST /api/pro/rtdn', 'POST /api/telemetry/events']);
    const health = await t.request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.doesNotMatch(health.text, /@|user_id|email|key/i);
    // The Play push endpoint needs Google's signed token; a bare or fake one changes nothing.
    for (const headers of [{}, { Authorization: 'Bearer fake' }]) {
        const res = await t.request('POST', '/api/pro/rtdn', { headers, body: { message: { data: Buffer.from('{}').toString('base64') } } });
        assert.equal(res.status, 401);
    }
});

test("user A never sees user B's money, streak, audit, insights or history through any GET route", async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    t.db.tables.profiles.find((p) => p.id === b.id).monthly_budget = 87654;
    const MARK = 'ZqBmerchantSecret';
    t.db.tables.expenses = t.db.tables.expenses || [];
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
        const at = new Date(now - i * 30 * 86400000).toISOString();
        t.db.tables.expenses.push({ id: crypto.randomUUID(), user_id: b.id, amount: 98765, category: 'Bills', description: `${MARK} ${i}`, roundup_chillar: 0, source: 'manual', occurred_at: at, created_at: at });
    }
    t.db.tables.ai_chat_history = t.db.tables.ai_chat_history || [];
    t.db.tables.ai_chat_history.push({ id: crypto.randomUUID(), user_id: b.id, role: 'user', content: `${MARK} question`, created_at: new Date().toISOString() });

    const leaks = [];
    for (const r of discoverRoutes()) {
        if (r.method !== 'GET' || isPublic(r) || r.path.startsWith('/api/admin')) continue;
        await t.resetRateLimits();
        for (const suffix of ['', `?user_id=${b.id}`, `?userId=${b.id}`]) {
            const res = await t.request('GET', r.path + suffix, { token: a.token });
            if (/ZqBmerchantSecret|98,?765|87,?654/.test(res.text)) leaks.push(`${r.path}${suffix} -> ${res.status}`);
        }
    }
    assert.deepEqual(leaks, []);
});

test("user-scoped writes ignore a user_id for someone else in the body", async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    const tries = [
        ['POST', '/api/expenses', { amount: 120, category: 'Food', description: 'tamper', user_id: b.id, userId: b.id }],
        ['POST', '/api/money-streak/no-spend', { user_id: b.id, userId: b.id }],
        ['POST', '/api/subscription-audit/decision', { merchantKey: 'netflix', decision: 'intentional', user_id: b.id, userId: b.id }],
        ['POST', '/api/decisions/afford', { amount: 100, user_id: b.id, userId: b.id }],
    ];
    for (const [method, url, body] of tries) {
        await t.resetRateLimits();
        await t.request(method, url, { token: a.token, body });
    }
    for (const [table, rows] of Object.entries(t.db.tables)) {
        if (!Array.isArray(rows)) continue;
        const touched = rows.filter((row) => row && row.user_id === b.id && row.description === 'tamper');
        assert.equal(touched.length, 0, table);
    }
    // Nothing new was written under B at all.
    for (const [table, rows] of Object.entries(t.db.tables)) {
        if (!Array.isArray(rows) || table === 'profiles') continue;
        assert.equal(rows.filter((row) => row && row.user_id === b.id).length, 0, `${table} got a row for B`);
    }
});

test('a normal user cannot reach any admin or campaign route, whatever the method', async () => {
    const a = t.db.addUser();
    const failures = [];
    for (const r of discoverRoutes().filter((x) => x.path.startsWith('/api/admin'))) {
        await t.resetRateLimits();
        const res = await t.request(r.method, r.path, { token: a.token, body: r.method === 'GET' ? undefined : { role: 'admin', is_pro: true } });
        if (![401, 403, 404].includes(res.status)) failures.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    assert.deepEqual(failures, []);
});
