/**
 * Account deletion: every way the endpoint could be reached or abused, and a
 * guard that no other code path can delete an auth user.
 *
 * Added after the 2026-09-14 investigation into an unexpected deletion
 * (see ACCOUNT_DELETION_INVESTIGATION.md).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp } = require('./helpers/testApp');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.calls = []; });

const deletions = () => t.db.calls.filter((c) => c[0] === 'deleteUser');
const CONFIRM = { confirmation: 'DELETE_MY_ACCOUNT' };

test('no token, or an invalid token, cannot delete anything', async () => {
    const a = t.db.addUser();
    assert.equal((await t.request('DELETE', '/api/account', { body: CONFIRM })).status, 401);
    assert.equal((await t.request('DELETE', '/api/account', { token: 'forged-token', body: CONFIRM })).status, 401);
    assert.equal((await t.request('DELETE', '/api/account', { token: `${a.token}x`, body: CONFIRM })).status, 401);
    assert.equal(deletions().length, 0);
    assert.ok(t.db.profile(a.id));
});

test("a user cannot delete another user's account through the body, query string or path", async () => {
    const attacker = t.db.addUser();
    const victim = t.db.addUser();

    // Extra target fields are ignored: only the caller's own account is ever used.
    const viaBody = await t.request('DELETE', `/api/account?id=${victim.id}&user_id=${victim.id}`, {
        token: attacker.token,
        body: { ...CONFIRM, id: victim.id, user_id: victim.id, userId: victim.id },
    });
    assert.equal(viaBody.status, 200);
    assert.deepEqual(deletions().map((c) => c[1]), [attacker.id], 'only the caller was deleted');
    assert.ok(t.db.profile(victim.id), 'victim profile untouched');
    assert.ok(t.db.authUsers.has(victim.id), 'victim login untouched');

    // There is no route that takes a target id.
    const other = t.db.addUser();
    const viaPath = await t.request('DELETE', `/api/account/${victim.id}`, { token: other.token, body: CONFIRM });
    assert.equal(viaPath.status, 404);
    assert.ok(t.db.authUsers.has(victim.id));
    assert.ok(t.db.authUsers.has(other.id));
});

test('missing, malformed or near-miss confirmations never delete', async () => {
    const a = t.db.addUser();
    const bodies = [
        undefined,
        {},
        { confirmation: '' },
        { confirmation: 'DELETE' },
        { confirmation: 'delete_my_account' },
        { confirmation: ' DELETE_MY_ACCOUNT ' },
        { confirmation: ['DELETE_MY_ACCOUNT'] },
        { confirmation: { value: 'DELETE_MY_ACCOUNT' } },
        { confirm: 'DELETE_MY_ACCOUNT' },
    ];
    for (const body of bodies) {
        const res = await t.request('DELETE', '/api/account', { token: a.token, body });
        assert.equal(res.status, 400, `body ${JSON.stringify(body)}`);
    }

    // Non-JSON bodies are not parsed, so they cannot carry a confirmation.
    for (const [type, raw] of [['text/plain', 'confirmation=DELETE_MY_ACCOUNT'], ['application/x-www-form-urlencoded', 'confirmation=DELETE_MY_ACCOUNT'], ['application/json', '{bad json']]) {
        const res = await fetch(`${t.base}/api/account`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': type },
            body: raw,
        });
        assert.ok(res.status === 400, `${type} -> ${res.status}`);
    }

    // The confirmation in a query string is ignored.
    const q = await t.request('DELETE', '/api/account?confirmation=DELETE_MY_ACCOUNT', { token: a.token });
    assert.equal(q.status, 400);

    assert.equal(deletions().length, 0);
    assert.ok(t.db.profile(a.id));
});

test('other methods on /api/account never delete', async () => {
    const a = t.db.addUser();
    for (const method of ['GET', 'POST', 'PUT', 'PATCH']) {
        const res = await t.request(method, '/api/account', { token: a.token, body: method === 'GET' ? undefined : CONFIRM });
        assert.equal(res.status, 404, method);
    }
    assert.equal(deletions().length, 0);
    assert.ok(t.db.profile(a.id));
});

test('replaying a successful deletion does nothing further', async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    assert.equal((await t.request('DELETE', '/api/account', { token: a.token, body: CONFIRM })).status, 200);
    const replay = await t.request('DELETE', '/api/account', { token: a.token, body: CONFIRM });
    assert.equal(replay.status, 401, 'the deleted user token is rejected');
    assert.deepEqual(deletions().map((c) => c[1]), [a.id]);
    assert.ok(t.db.profile(b.id));
});

test('browsers on other origins are not granted CORS access, and auth is not cookie-based', async () => {
    const a = t.db.addUser();
    const preflight = await fetch(`${t.base}/api/account`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);

    // A cookie is not a credential: without the Authorization header nothing happens.
    const cookieOnly = await fetch(`${t.base}/api/account`, {
        method: 'DELETE',
        headers: { Cookie: `sb-access-token=${a.token}`, 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify(CONFIRM),
    });
    assert.equal(cookieOnly.status, 401);
    assert.equal(deletions().length, 0);
});

test('only DELETE /api/account can delete an auth user; admin and other routes cannot', () => {
    const root = path.join(__dirname, '..');
    const offenders = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            if (['node_modules', 'tests'].includes(name)) continue;
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) walk(full);
            else if (name.endsWith('.js') && /deleteUser\s*\(/.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(root, full));
        }
    };
    walk(root);
    assert.deepEqual(offenders.map((p) => p.replace(/\\/g, '/')), ['routes/account.js']);

    // No admin route deletes users or profiles.
    const admin = fs.readFileSync(path.join(root, 'routes/admin.js'), 'utf8');
    assert.doesNotMatch(admin, /from\('profiles'\)\s*\.delete\(/);
    assert.doesNotMatch(admin, /auth\.admin\.deleteUser/);
});

test('a normal user cannot reach any admin route', async () => {
    delete process.env.ADMIN_EMAIL;
    const a = t.db.addUser();
    for (const [method, url] of [['GET', '/api/admin/users'], ['POST', `/api/admin/users/${crypto.randomUUID()}/suspend`], ['DELETE', `/api/admin/users/${crypto.randomUUID()}/pro`]]) {
        const res = await t.request(method, url, { token: a.token, body: method === 'GET' ? undefined : { reason: 'x' } });
        assert.equal(res.status, 404, `${method} ${url}`);
    }
    assert.equal(deletions().length, 0);
});
