const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { aiLimiter, userApiLimiter } = require('../middleware/rateLimits');
const gemini = require('../lib/gemini');
const {
    classifyIntent, buildFacts, mentorContext, composeAnswer, toText, buildDailyInsight, suggestPrompts,
    numbersAreGrounded, EDUCATION_NOTE,
} = require('../lib/financialInsights');
const coach = require('../lib/aiCoach');
const aiContext = require('../lib/aiContext');
const aiMemory = require('../lib/aiMemory');
const { sanitizeReply } = require('../lib/coachContent');
const { validationError } = require('../lib/validation');
const { toRupees } = require('../lib/groupBalances');
const telemetry = require('../lib/opsTelemetry');
const { withTimeout } = require('../lib/timeout');
const { loadFinanceData, ProfileMissingError } = require('../lib/financeData');

/**
 * Vittova AI — a personal finance coach grounded in the user's own data.
 *
 * HOW AN ANSWER IS PRODUCED
 *   1. The backend loads only the signed-in user's data and computes every
 *      figure deterministically: the dashboard's facts (lib/financialInsights)
 *      plus the extended context with provenance (lib/aiContext): category
 *      budgets, income the user entered, goals, decisions, Money-Saved and the
 *      user's own memories (lib/aiMemory).
 *   2. The question is classified into a coaching capability and a complete
 *      draft answer is composed from those figures (lib/aiCoach, then
 *      financialInsights). Stock tips and off-topic questions get fixed
 *      answers with no model call.
 *   3. If Gemini is configured, it re-phrases the draft for the exact question
 *      in the coach's voice (English or Hinglish). The reply is rejected, and
 *      the draft used, if it contains any figure not in the computed facts, is
 *      empty, or the call fails or times out.
 *   4. Actions the user might want (a budget, a goal, a savings target, a
 *      memory) are proposed from the facts, never by the model, and happen
 *      only when the user confirms them in the app through the ordinary
 *      validated endpoints.
 *
 * The user id always comes from the verified token; nothing in the request can
 * select another user's data. No ids, emails or names reach the model.
 */

const MAX_QUERY_CHARS = 500;
const HISTORY_LIMIT = 100;
const MAX_GROUPS_IN_CONTEXT = 5;
const UNAVAILABLE_MESSAGE = 'Vittova AI is temporarily unavailable. Your financial data is safe. Please try again in a moment.';

const adviceSchema = z.object({
    query: z.string().trim().min(1, 'Please type a question.').max(MAX_QUERY_CHARS, `Questions can be at most ${MAX_QUERY_CHARS} characters.`),
    goal: z.string().max(40).optional(),
    /** Where the question came from, for the answer's style and links: 'chat' | 'budgets' | 'goals' | 'calendar' | 'transactions' | 'reports' | 'home'. */
    screen: z.enum(['chat', 'home', 'budgets', 'goals', 'calendar', 'transactions', 'reports', 'afford', 'wrapped', 'saved']).optional(),
}).strict();

router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('ai_chat_history')
        .select('id, role, content, chips, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);

    if (error) {
        console.error('Error fetching AI history:', error.message);
        return res.status(500).json({ success: false, message: 'Could not fetch chat history.' });
    }
    res.json({ success: true, history: (data || []).reverse() });
});

function validateAdvice(req, res, next) {
    const parsed = adviceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    req.adviceQuery = parsed.data.query;
    req.adviceScreen = parsed.data.screen || 'chat';
    return next();
}

/** What the user owes / is owed across their groups. Best effort. */
async function loadGroupPool(userId) {
    const { data: memberships, error } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
    if (error || !memberships?.length) return null;
    const { loadGroupState } = require('./groups');
    let youOwe = 0;
    let owedToYou = 0;
    for (const m of memberships.slice(0, MAX_GROUPS_IN_CONTEXT)) {
        const state = await loadGroupState(m.group_id);
        const net = state.net.get(userId) || 0;
        if (net < 0) youOwe += -net;
        else owedToYou += net;
    }
    return { groups: memberships.length, youOwe: toRupees(youOwe), owedToYou: toRupees(owedToYou) };
}

async function loadUserData(userId, now) {
    const data = await loadFinanceData(userId, now);
    const groupPool = await loadGroupPool(userId).catch((e) => {
        console.error('AI context: group pool unavailable:', e.message);
        return null;
    });
    return { ...data, groupPool };
}

function sendLoadError(res, error) {
    if (error instanceof ProfileMissingError) {
        return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: "We couldn't find your Vittova profile. Close and reopen the app, or sign out and back in." });
    }
    console.error('AI data load failed:', error.message);
    return res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', message: UNAVAILABLE_MESSAGE });
}

/** Facts plus the extended context, in one call. The context never blocks an answer. */
async function loadEverything(userId, now) {
    const data = await loadUserData(userId, now);
    const facts = buildFacts({ ...data, now });
    const context = await aiContext.assembleContext(userId, facts, now).catch((e) => {
        console.error('AI context: extended context unavailable:', e.code || e.name || 'Error');
        return { asOf: facts.today, memories: [], notTracked: mentorContext(facts).notTracked, unavailable: true };
    });
    return { facts, context };
}

// @route GET /api/ai/insights — "Your money today", quick prompts and where things stand. No model call, no quota.
router.get('/insights', protect, async (req, res) => {
    try {
        const now = new Date();
        const { facts, context } = await loadEverything(req.user.id, now);
        res.json({
            success: true,
            insight: buildDailyInsight(facts),
            suggestions: suggestPrompts(facts),
            notTracked: context.notTracked,
            overview: overviewOf(facts, context),
            personalisation: context.memories ? { memories: context.memories.length } : null,
        });
    } catch (error) {
        sendLoadError(res, error);
    }
});

/** A compact, honest picture for the AI home screen and the dashboard card. Figures only. */
function overviewOf(f, c) {
    const goal = c.goals?.goals?.[0] || null;
    const budget = c.categoryBudgets?.budgets?.find((b) => b.over) || c.categoryBudgets?.budgets?.find((b) => b.usedPercent >= 80) || null;
    const bill = f.upcomingBillList?.[0] || null;
    return {
        spentThisMonth: f.spentThisMonth,
        budget: f.budget,
        budgetIsDefault: f.budgetIsDefault,
        safePerDay: f.safeToSpendPerDay,
        daysLeft: f.daysLeft,
        income: c.income?.thisMonth ? { value: c.income.thisMonth.value, selfReported: true } : null,
        goal: goal ? { name: goal.name, percent: goal.percent, left: goal.left, neededPerMonth: goal.neededPerMonth } : null,
        watch: budget ? { category: budget.category, spent: budget.spent, limit: budget.limit, over: budget.over } : null,
        nextBill: bill ? { name: bill.name, amount: Number(bill.amount), dueDay: Number(bill.due_day) } : null,
        moneySavedThisMonth: c.moneySaved?.value ?? null,
        confidence: f.confidence,
    };
}

/** Last few turns of this user's chat, so follow-ups are answered in context. */
async function recentConversation(userId) {
    const { data } = await supabase
        .from('ai_chat_history')
        .select('role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6);
    return (data || []).reverse().map((m) => `${m.role === 'user' ? 'User' : 'Vittova AI'}: ${String(m.content).slice(0, 400)}`).join('\n');
}

const TEEN_INVESTING_ANSWER = {
    direct: 'Investing is worth learning about now, and the first steps are habits, not products.',
    numbers: [],
    reasoning: 'A budget you keep and a small savings buffer come first. Learn what risk, return and diversification mean, and why time matters.',
    action: 'Track what you spend, keep to a monthly budget and build a small buffer for surprises.',
    next: 'Most investment accounts need you to be 18, or a parent or guardian to open one with you. Talk to them before any decision like this.',
    note: 'General education only. Vittova does not recommend any investment.',
};

/** The model's context: dashboard facts plus the extended, provenance-tagged context. No identity. */
function modelContext(facts, context) {
    const { memories, ...rest } = context;
    return { ...mentorContext(facts), extended: rest };
}

function buildPrompt({ capability, facts, context, draft, query, conversation, retryNote, minor = false, language }) {
    return `${coach.systemInstructions({ capability, language, minor })}
${retryNote ? `\nIMPORTANT: ${retryNote}\n` : ''}
CAPABILITY: ${capability}

CONTEXT (calculated from the user's own data; each block says its source and reliability):
${JSON.stringify(modelContext(facts, context))}

MEMORIES (what the user told you earlier):
${JSON.stringify(context.memories || [])}

DRAFT ANSWER (your source of truth for every figure):
${draft}
${conversation ? `\n<recent_conversation>\n${conversation}\n</recent_conversation>\n` : ''}
<user_question>
${query}
</user_question>`;
}

/**
 * A reply must keep the user's numbers. When the draft has rupee figures, the
 * reply must repeat at least one of them; otherwise a vague answer ("here is a
 * general explanation") would replace a specific, calculated one.
 */
function keepsTheFigures(reply, draft) {
    const figures = (text) => [...String(text || '').replace(/,/g, '').matchAll(/₹\s?(\d+)/g)].map((m) => Number(m[1]));
    const inDraft = new Set(figures(draft));
    if (inDraft.size === 0) return true;
    return figures(reply).some((n) => inDraft.has(n) || inDraft.has(n - 1) || inDraft.has(n + 1));
}

/** A model reply worth showing: real prose, not empty, a stub or a data dump. */
function isUsableReply(raw) {
    if (typeof raw !== 'string') return false;
    const text = raw.trim();
    return text.length >= 20 && !/^[[{]/.test(text) && /[a-z]{3,}/i.test(text);
}

const aiTimeoutMs = () => Number(process.env.AI_REPLY_TIMEOUT_MS) || 15000;

/** Links the app shows under an answer, chosen by capability and what exists. */
function linksFor(capability, context) {
    const links = [];
    if (capability === 'budget_coach') links.push({ label: 'Open Budgets', to: '/budgets' });
    if (capability === 'goal_coach') links.push({ label: context.goals?.active ? 'Open Savings goals' : 'Create a savings goal', to: '/goals' });
    if (capability === 'subscription_coach') links.push({ label: 'Review recurring charges', to: '/graveyard' }, { label: 'Money alerts', to: '/alerts' });
    if (capability === 'affordability_coach') links.push({ label: 'Run an Afford-It check', to: '/dash', state: { afford: true } });
    if (capability === 'money_coach') links.push({ label: 'See this month\'s report', to: '/reports' });
    return links.slice(0, 2);
}

router.post('/invest-advice', protect, aiLimiter, validateAdvice, proGate('chat_message'), async (req, res) => {
    const query = req.adviceQuery;
    const now = new Date();

    let facts;
    let context;
    try {
        ({ facts, context } = await loadEverything(req.user.id, now));
    } catch (error) {
        return sendLoadError(res, error);
    }

    const intent = classifyIntent(query);
    const capability = coach.capabilityFor(intent);
    const language = coach.detectLanguage(query, context.memories);
    const teenInvesting = req.user.isMinor && intent === 'investing';
    const injection = coach.looksLikeInjection(query);

    // Fixed answers: no model, no invented figures.
    let structured;
    let fixed = false;
    if (coach.asksForTip(query)) { structured = coach.TIP_REFUSAL; fixed = true; }
    else if (coach.isOffTopic(query)) { structured = coach.OFF_TOPIC_ANSWER; fixed = true; }
    else if (teenInvesting) { structured = TEEN_INVESTING_ANSWER; fixed = true; }
    else structured = coach.withEmpathy(coach.composeWithContext(intent, facts, context, query) || composeAnswer(intent, facts, query), query);

    const deterministic = toText(structured);
    let reply = deterministic;
    let source = 'calculated';
    let aiFallback = false;

    if (gemini.isConfigured() && !fixed && !injection) {
        const started = Date.now();
        const timeoutMs = aiTimeoutMs();
        const conversation = await recentConversation(req.user.id).catch(() => '');
        let retryNote = null;
        aiFallback = true;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0 && Date.now() - started > timeoutMs * 0.6) break;
            try {
                const raw = await withTimeout(
                    gemini.generateText(
                        buildPrompt({ capability, facts, context, draft: deterministic, query, conversation, retryNote, minor: req.user.isMinor, language }),
                        { maxOutputTokens: 900, temperature: 0.6, timeoutMs }
                    ),
                    timeoutMs
                );
                const text = isUsableReply(raw) ? raw.trim() : '';
                if (text && !keepsTheFigures(text, deterministic)) {
                    telemetry.recordEvent('ai_reply_rejected', { severity: 'warning', route: 'POST /api/ai/invest-advice', code: 'DROPPED_FIGURES' });
                    retryNote = 'Your previous reply left out the user\'s figures. Keep the key rupee amounts from the draft.';
                    continue;
                }
                if (text && numbersAreGrounded(text, facts, modelContext(facts, context), deterministic, query)) {
                    reply = text;
                    source = 'ai';
                    aiFallback = false;
                    break;
                }
                if (!text) {
                    telemetry.recordEvent('ai_reply_rejected', { severity: 'warning', route: 'POST /api/ai/invest-advice', code: 'MALFORMED' });
                    break;
                }
                console.warn('Coach reply rejected: contained figures not in the computed facts');
                telemetry.recordEvent('ai_reply_rejected', { severity: 'warning', route: 'POST /api/ai/invest-advice', code: 'UNGROUNDED_FIGURES' });
                retryNote = 'Your previous reply used a rupee amount or percentage that is not in the draft or context. Use only figures copied exactly from them.';
            } catch (e) {
                console.error('Coach AI call failed:', e.code || e.name);
                break;
            }
        }
    }

    const investingLike = intent === 'education' || intent === 'investing';
    reply = sanitizeReply(reply, { intent: investingLike ? 'investing' : intent });
    if (investingLike && !reply.includes('not investment advice')) reply = `${reply}\n\n${EDUCATION_NOTE}`;

    // Proposals the user may confirm; memory suggestions only while personalisation is on.
    const personalisationOn = !context.unavailable && await aiMemory.personalisationOn(req.user.id).catch(() => false);
    const memorySuggestions = personalisationOn && !fixed ? aiMemory.suggestFromMessage(query).filter((s) => !context.memories.some((m) => m.kind === s.kind && m.content === s.content)) : [];
    const actions = fixed ? [] : coach.proposeActions({ intent, facts, context, question: query, memorySuggestions });
    const links = fixed ? [] : linksFor(capability, context);

    const { data: saved, error: insertError } = await supabase.from('ai_chat_history').insert([
        { user_id: req.user.id, role: 'user', content: query },
        { user_id: req.user.id, role: 'bot', content: reply, chips: [] },
    ]).select('id, role');
    if (insertError) console.error('Error saving chat history:', insertError.message);
    const messageId = (saved || []).find((m) => m.role === 'bot')?.id || null;

    res.locals.aiOutcome = { source, aiFallback, intent };
    res.json({ success: true, reply, intent, capability, language, source, aiFallback, answer: structured, actions, links, messageId, quota: res.locals.quota || null });
});

// ─── Feedback ──────────────────────────────────────────────────────────────
const feedbackSchema = z.object({
    messageId: z.string().uuid().nullable().optional(),
    helpful: z.boolean(),
    intent: z.string().regex(/^[a-z_]{1,30}$/).optional(),
    source: z.enum(['ai', 'calculated']).optional(),
}).strict();

router.post('/feedback', protect, userApiLimiter, async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { error } = await supabase.from('ai_feedback').insert({ user_id: req.user.id, message_id: parsed.data.messageId || null, helpful: parsed.data.helpful, intent: parsed.data.intent || null, source: parsed.data.source || null });
    if (error && !['42P01', 'PGRST205', '23503'].includes(error.code)) console.error('AI feedback failed:', error.code || error.message);
    res.json({ success: true });
});

// ─── Memory ────────────────────────────────────────────────────────────────
const memorySchema = z.object({
    kind: z.enum(aiMemory.KINDS),
    content: z.string().trim().min(2).max(200),
}).strict();

const memoryError = (res, e) => {
    if (e.status) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
    console.error('AI memory failed:', e.code || e.name || 'Error');
    return res.status(503).json({ success: false, code: 'MEMORY_UNAVAILABLE', message: 'Memory is not available right now.' });
};

router.get('/memory', protect, async (req, res) => {
    try {
        const [on, list] = await Promise.all([aiMemory.personalisationOn(req.user.id), aiMemory.list(req.user.id)]);
        res.json({ success: true, personalisation: on, available: list.available, memories: list.memories, max: aiMemory.MAX_MEMORIES });
    } catch (e) {
        memoryError(res, e);
    }
});

router.put('/memory/personalisation', protect, userApiLimiter, async (req, res) => {
    const parsed = z.object({ on: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        await aiMemory.setPersonalisation(req.user.id, parsed.data.on);
        res.json({ success: true, personalisation: parsed.data.on });
    } catch (e) {
        memoryError(res, e);
    }
});

router.post('/memory', protect, userApiLimiter, async (req, res) => {
    const parsed = memorySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        if (!(await aiMemory.personalisationOn(req.user.id))) return res.status(409).json({ success: false, code: 'PERSONALISATION_OFF', message: 'Turn on personalisation to save memories.' });
        const result = await aiMemory.remember(req.user.id, parsed.data);
        if (!result.available) return res.status(503).json({ success: false, code: 'MEMORY_UNAVAILABLE', message: 'Memory is not available yet.' });
        res.status(201).json({ success: true, memory: result.memory });
    } catch (e) {
        memoryError(res, e);
    }
});

router.patch('/memory/:id', protect, userApiLimiter, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ success: false, message: 'Invalid id' });
    const parsed = z.object({ content: z.string().trim().min(2).max(200) }).strict().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const result = await aiMemory.update(req.user.id, req.params.id, parsed.data.content);
        if (!result.available) return res.status(503).json({ success: false, code: 'MEMORY_UNAVAILABLE', message: 'Memory is not available yet.' });
        if (!result.memory) return res.status(404).json({ success: false, message: 'Memory not found' });
        res.json({ success: true, memory: result.memory });
    } catch (e) {
        memoryError(res, e);
    }
});

router.delete('/memory/:id', protect, userApiLimiter, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ success: false, message: 'Invalid id' });
    try {
        const result = await aiMemory.forget(req.user.id, req.params.id);
        if (!result.removed) return res.status(404).json({ success: false, message: 'Memory not found' });
        res.json({ success: true });
    } catch (e) {
        memoryError(res, e);
    }
});

router.delete('/memory', protect, userApiLimiter, async (req, res) => {
    try {
        await aiMemory.forgetAll(req.user.id);
        res.json({ success: true });
    } catch (e) {
        memoryError(res, e);
    }
});

// Any unexpected failure while building an answer: a friendly, retryable
// response instead of a generic 500. The quota is refunded (status >= 400).
router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error('AI route error:', err.name || 'Error');
    return res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', message: UNAVAILABLE_MESSAGE });
});

module.exports = router;
module.exports.MAX_QUERY_CHARS = MAX_QUERY_CHARS;
module.exports.buildPrompt = buildPrompt;
