/**
 * Every API path the frontend calls must exist in the backend.
 *
 * Scans frontend/src for request paths (apiUrl('/x'), apiJson('/x'),
 * `${API_URL}/x`, `${API_BASE}/x`), substitutes a UUID for template
 * parameters, and asserts the Express app has a route for at least one HTTP
 * method on that path, i.e. the request does not fall through to the
 * catch-all `{ message: 'Not found' }` handler. This is what caught
 * GET /api/ai/history, PATCH /api/expenses/:id and /export.csv being absent
 * from the deployed server.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers/testApp');

const SRC = path.join(__dirname, '../../frontend/src');
const UUID = '00000000-0000-4000-8000-000000000000';

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(d.name) ? [p] : [];
    });
}

function extractPaths() {
    const found = new Map(); // path -> Set(files)
    const add = (raw, file) => {
        let p = raw.replace(/\$\{[^}]+\}/g, UUID).replace(/[?#].*$/, '').replace(/\/+$/, '');
        if (!p.startsWith('/')) p = `/${p}`;
        if (!/^\/[a-z]/i.test(p)) return;
        const key = `/api${p}`;
        if (!found.has(key)) found.set(key, new Set());
        found.get(key).add(path.relative(SRC, file));
    };
    for (const file of walk(SRC)) {
        const text = fs.readFileSync(file, 'utf8');
        const expensesBase = /const API_URL = apiUrl\('\/expenses'\)/.test(text);
        for (const m of text.matchAll(/\b(?:apiUrl|apiJson)\(\s*[`'"]([^`'"]+)[`'"]/g)) add(m[1], file);
        for (const m of text.matchAll(/`\$\{(API_URL|API_BASE)\}([^`]*)`/g)) {
            const rest = m[2];
            add(expensesBase && m[1] === 'API_URL' ? `/expenses${rest}` : rest, file);
        }
        if (expensesBase && /axios\.(get|post)\(API_URL\b/.test(text)) add('/expenses', file);
    }
    return found;
}

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });

test('every API path used by the frontend is implemented by the backend', async () => {
    const paths = extractPaths();
    assert.ok(paths.size >= 20, `expected to find many API calls, found ${paths.size}`);

    const user = t.db.addUser();
    const missing = [];
    for (const [apiPath, files] of paths) {
        let routed = false;
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
            await t.resetRateLimits();
            const res = await t.request(method, apiPath, { token: user.token, body: method === 'GET' ? undefined : {} });
            const fellThrough = res.status === 404 && res.body?.message === 'Not found';
            if (!fellThrough) { routed = true; break; }
        }
        if (!routed) missing.push(`${apiPath}  (called from ${[...files].join(', ')})`);
    }
    assert.deepEqual(missing, [], `Frontend calls endpoints the backend does not implement:\n${missing.join('\n')}`);
});

test('known critical endpoints are present', async () => {
    const user = t.db.addUser();
    const critical = [
        ['GET', '/api/ai/history'],
        ['PATCH', `/api/expenses/${UUID}`],
        ['GET', '/api/expenses/export.csv'],
        ['GET', '/api/expenses?q=test&sort=highest'],
        ['GET', '/api/wealth'],
        ['GET', '/api/safe-to-spend'],
        ['GET', '/api/burn-rate'],
        ['GET', '/api/paisa-score'],
        ['POST', '/api/ai/invest-advice'],
        ['GET', '/api/groups'],
        ['POST', '/api/groups/join'],
        ['GET', '/api/subscriptions/detect'],
    ];
    for (const [method, p] of critical) {
        await t.resetRateLimits();
        const res = await t.request(method, p, { token: user.token, body: method === 'GET' ? undefined : {} });
        assert.ok(!(res.status === 404 && res.body?.message === 'Not found'), `${method} ${p} is not routed`);
        assert.notEqual(res.status, 500, `${method} ${p} errored`);
    }
});
