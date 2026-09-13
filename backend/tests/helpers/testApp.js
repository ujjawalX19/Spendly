/**
 * Boot the real Express app against the in-memory Supabase fake and a stubbed
 * Gemini client. Each test file runs in its own process under `node --test`,
 * so module-cache injection here does not leak between files.
 */

const path = require('node:path');
const { createFakeSupabase } = require('./fakeSupabase');

function inject(modulePath, exports) {
    const resolved = require.resolve(modulePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

async function startTestApp({ env = {} } = {}) {
    Object.assign(process.env, {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://fake.supabase.local',
        SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
        ...env,
    });

    const db = createFakeSupabase();
    inject(path.join(__dirname, '../../config/supabase.js'), { supabase: db.client });

    const gemini = {
        configured: true,
        calls: [],
        reply: 'Here is a general explanation.',
        isConfigured() { return this.configured; },
        async generateText(contents, options) {
            this.calls.push({ contents, options });
            if (this.reply instanceof Error) throw this.reply;
            return typeof this.reply === 'function' ? this.reply(contents) : this.reply;
        },
        modelName: () => 'test-model',
    };
    inject(path.join(__dirname, '../../lib/gemini.js'), gemini);

    const { createApp } = require('../../app');
    const { resetRateLimits } = require('../../middleware/rateLimits');
    const app = createApp();

    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(method, url, { token, body, headers = {} } = {}) {
        const res = await fetch(`${base}${url}`, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, headers: res.headers, body: json, text };
    }

    return {
        base,
        db,
        gemini,
        request,
        resetRateLimits,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

module.exports = { startTestApp };
