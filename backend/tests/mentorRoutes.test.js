/**
 * Vittova AI mentor — routes: authentication, isolation, missing data, model
 * failures, entitlements and the prompt contract. Real Express app, in-memory
 * Supabase, stubbed Gemini.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    t.gemini.calls = [];
    t.gemini.configured = false;
    t.gemini.reply = 'Here is a general explanation.';
    delete process.env.AI_REPLY_TIMEOUT_MS;
});

const ASK = '/api/ai/invest-advice';
function addExpense(userId, overrides = {}) {
    const row = {
        id: crypto.randomUUID(), user_id: userId, amount: 100, category: 'Food', description: 'Lunch',
        roundup_chillar: 0, source: 'manual', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
        ...overrides,
    };
    t.db.tables.expenses = t.db.tables.expenses || [];
    t.db.tables.expenses.push(row);
    return row;
}
const ask = (user, query) => t.request('POST', ASK, { token: user.token, body: { query } });

test('authenticated question gets a structured mentor answer from the user\'s own data', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    addExpense(u.id, { amount: 1234, category: 'Shopping' });
    const res = await ask(u, 'Can I afford ₹2,000 shoes?');
    assert.equal(res.status, 200);
    assert.equal(res.body.intent, 'affordability');
    assert.equal(res.body.source, 'calculated');
    assert.equal(res.body.aiFallback, false, 'no model configured is not a failure');
    assert.match(res.body.reply, /\*\*Your numbers\*\*/);
    assert.match(res.body.reply, /\*\*What I recommend\*\*|\*\*Why it matters\*\*/);
    assert.ok(res.body.answer.direct);
});

test('unauthenticated requests are refused', async () => {
    assert.equal((await t.request('POST', ASK, { body: { query: 'hi' } })).status, 401);
    assert.equal((await t.request('GET', '/api/ai/insights')).status, 401);
    assert.equal((await t.request('GET', '/api/ai/history')).status, 401);
});

test('a user never sees another user\'s figures, and cannot request them', async () => {
    const a = t.db.addUser({ monthly_budget: 20000 });
    const b = t.db.addUser({ monthly_budget: 90000 });
    addExpense(a.id, { amount: 700, category: 'Food' });
    addExpense(b.id, { amount: 54321, category: 'Shopping', description: 'B secret purchase' });

    const res = await ask(a, 'Give me a monthly summary');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.body.reply, /54,321|90,000|B secret/);
    assert.match(res.body.reply, /₹700/);

    const insights = await t.request('GET', '/api/ai/insights', { token: a.token });
    assert.doesNotMatch(JSON.stringify(insights.body), /54,321|54321|90000|B secret/);

    // A user id in the body is rejected, never used.
    const forged = await t.request('POST', ASK, { token: a.token, body: { query: 'summary', user_id: b.id } });
    assert.equal(forged.status, 400);
});

test('a profile-less account gets PROFILE_NOT_FOUND, not an outage, and is not charged', async () => {
    const u = t.db.addUser();
    t.db.tables.profiles = t.db.tables.profiles.filter((p) => p.id !== u.id);
    const res = await ask(u, 'How much can I spend?');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'PROFILE_NOT_FOUND');
    const insights = await t.request('GET', '/api/ai/insights', { token: u.token });
    assert.equal(insights.status, 404);
    assert.equal(insights.body.code, 'PROFILE_NOT_FOUND');
    const sts = await t.request('GET', '/api/safe-to-spend', { token: u.token });
    assert.equal(sts.status, 404);
    assert.equal(t.gemini.calls.length, 0);
});

test('missing financial data: empty history gives honest guidance, not invented trends', async () => {
    const u = t.db.addUser({ monthly_budget: 10000 });
    const insights = await t.request('GET', '/api/ai/insights', { token: u.token });
    assert.equal(insights.status, 200);
    assert.equal(insights.body.insight.tone, 'neutral');
    assert.match(insights.body.insight.headline, /No expenses logged/);
    assert.ok(insights.body.notTracked.includes('income'));
    assert.ok(insights.body.suggestions.length >= 5);

    const res = await ask(u, 'Why did I overspend this month?');
    assert.equal(res.status, 200);
    assert.match(res.body.reply, /don't have enough/);
});

test('insights use the same Safe-to-Spend as the dashboard and cost no AI quota', async () => {
    const u = t.db.addUser({ monthly_budget: 12000, investment_target: 1000 });
    addExpense(u.id, { amount: 2500 });
    t.db.tables.recurring_bills = [{ id: crypto.randomUUID(), user_id: u.id, name: 'Rent', amount: 3000, due_day: 31, is_active: true }];
    const sts = await t.request('GET', '/api/safe-to-spend', { token: u.token });
    const insights = await t.request('GET', '/api/ai/insights', { token: u.token });
    assert.equal(sts.status, 200);
    assert.equal(insights.body.insight.figure.value, sts.body.safeToSpend.daily);
    assert.equal(t.db.profile(u.id).chat_messages_today, 0);
    assert.equal(t.gemini.calls.length, 0);
});

test('a grounded model reply is used; the prompt carries context but no identity', async () => {
    const u = t.db.addUser({ monthly_budget: 20000, email: 'private-person@example.com', full_name: 'Private Person' });
    addExpense(u.id, { amount: 1500, category: 'Food' });
    t.gemini.configured = true;
    t.gemini.reply = 'Based on your current numbers, you have spent ₹1,500 so far this month. My recommendation is to keep going.';
    const res = await ask(u, 'Give me a monthly summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'ai');
    assert.equal(res.body.aiFallback, false);

    const prompt = t.gemini.calls[0].contents;
    assert.match(prompt, /FINANCIAL CONTEXT/);
    assert.match(prompt, /<user_question>\nGive me a monthly summary\n<\/user_question>/);
    assert.match(prompt, /notTracked/);
    assert.doesNotMatch(prompt, /private-person@example\.com|Private Person|token-/);
    assert.ok(!prompt.includes(u.id), 'no user id in the prompt');
    assert.ok(t.gemini.calls[0].options.timeoutMs > 0);
});

test('model failure falls back to the calculated answer', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    addExpense(u.id, { amount: 800 });
    t.gemini.configured = true;
    t.gemini.reply = Object.assign(new Error('provider down'), { code: 'UNAVAILABLE' });
    const res = await ask(u, 'How much can I safely spend?');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'calculated');
    assert.equal(res.body.aiFallback, true);
    assert.match(res.body.reply, /safely spend/);
    assert.doesNotMatch(res.body.reply, /provider down/);
});

test('a hung model call times out and the calculated answer is returned promptly', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    t.gemini.configured = true;
    t.gemini.reply = () => new Promise(() => {});
    process.env.AI_REPLY_TIMEOUT_MS = '80';
    const started = Date.now();
    const res = await ask(u, 'How much can I safely spend?');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'calculated');
    assert.equal(res.body.aiFallback, true);
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
});

test('malformed model output is never shown', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    t.gemini.configured = true;
    for (const bad of ['', '   ', 'ok', '{"answer":"You can spend a lot"}', '[1,2,3,4,5,6,7,8,9,10,11,12]', { text: 'object' }, 'You have ₹77,777 left and 88% of budget.']) {
        await t.resetRateLimits();
        t.gemini.reply = bad;
        const res = await t.request('POST', ASK, { token: u.token, body: { query: 'Give me a monthly summary' } });
        assert.equal(res.status, 200, JSON.stringify(bad));
        assert.equal(res.body.source, 'calculated', JSON.stringify(bad));
        assert.doesNotMatch(res.body.reply, /77,777|object|\{"answer"/);
    }
});

test('a data outage returns the friendly unavailable message and refunds the quota', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    t.db.failures.push({ table: 'expenses', op: 'select' });
    const res = await ask(u, 'summary');
    t.db.failures.length = 0;
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'AI_UNAVAILABLE');
    assert.match(res.body.message, /temporarily unavailable\. Your financial data is safe/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(t.db.profile(u.id).chat_messages_today, 0, 'refunded');
});

test('Pro users are not limited by the free quota; free users are', async () => {
    const today = appTime.localDateKey();
    const pro = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() + 86400000).toISOString(), chat_messages_today: 10, chat_messages_reset_at: today });
    const ok = await ask(pro, 'summary');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.quota, null);
    assert.equal(t.db.profile(pro.id).chat_messages_today, 10, 'Pro questions are not counted');

    const expired = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() - 1000).toISOString(), chat_messages_today: 10, chat_messages_reset_at: today });
    const blocked = await ask(expired, 'summary');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'QUOTA_EXCEEDED');

    const free = t.db.addUser({ chat_messages_today: 3, chat_messages_reset_at: today });
    const counted = await ask(free, 'summary');
    assert.equal(counted.status, 200);
    assert.deepEqual(counted.body.quota, { feature: 'chat_message', limit: 10, used: 4, remaining: 6 });
});

test('Group Pool obligations reach the mentor context', async () => {
    const asha = t.db.addUser({ full_name: 'Asha', monthly_budget: 20000 });
    const bala = t.db.addUser({ full_name: 'Bala', monthly_budget: 20000 });
    const created = await t.request('POST', '/api/groups', { token: asha.token, body: { name: 'Flat' } });
    await t.request('POST', '/api/groups/join', { token: bala.token, body: { code: created.body.group.invite_code } });
    const added = await t.request('POST', `/api/groups/${created.body.group.id}/expenses`, { token: asha.token, body: { description: 'Groceries', amount: 900 } });
    assert.equal(added.status, 201, added.text);

    t.gemini.configured = true;
    t.gemini.reply = 'Based on your current numbers, settle what you owe first.';
    const res = await ask(bala, 'What should I improve first?');
    assert.equal(res.status, 200);
    assert.match(t.gemini.calls[0].contents, /"youOwe":450/);
    assert.match(res.body.answer.priorities.join('\n'), /₹450 you owe in Group Pool/);
});

test('an unexpected exception inside the AI route returns the friendly 503 and refunds the quota', async () => {
    const u = t.db.addUser({ monthly_budget: 20000 });
    const originalFrom = t.db.client.from;
    t.db.client.from = (table) => {
        if (table === 'ai_chat_history') return { insert: () => { throw new TypeError('boom'); } };
        return originalFrom(table);
    };
    try {
        const res = await ask(u, 'How much can I safely spend?');
        assert.equal(res.status, 503);
        assert.equal(res.body.code, 'AI_UNAVAILABLE');
        assert.doesNotMatch(JSON.stringify(res.body), /boom|TypeError/);
    } finally {
        t.db.client.from = originalFrom;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(t.db.profile(u.id).chat_messages_today, 0, 'refunded');
});
