const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { aiLimiter } = require('../middleware/rateLimits');
const gemini = require('../lib/gemini');
const appTime = require('../lib/appTime');
const { classifyIntent, buildFacts, composeAnswer, toText, numbersAreGrounded, EDUCATION_NOTE } = require('../lib/financialInsights');
const { sanitizeReply } = require('../lib/coachContent');
const { validationError } = require('../lib/validation');
const telemetry = require('../lib/opsTelemetry');

/**
 * Spendly AI — a money coach grounded in the user's own data.
 *
 * HOW AN ANSWER IS PRODUCED
 *   1. The backend loads the user's expenses (4 months), budget, savings target
 *      and bills, and computes every figure deterministically
 *      (lib/financialInsights.buildFacts).
 *   2. It classifies the question (spending analysis, budget, savings, goals,
 *      safe-to-spend, unusual spending, subscriptions, monthly summary,
 *      affordability, education) and builds a complete answer from those
 *      figures: direct answer, numbers, reasoning, action, note.
 *   3. If Gemini is configured, it may rephrase that answer. The reply is
 *      rejected — and the deterministic answer used — if it contains any rupee
 *      amount or percentage that is not in the computed facts.
 *
 * SCOPE: no named securities, funds, brokers or links (FINANCIAL_CONTENT_REVIEW.md).
 * COST: auth, per-user burst/hourly limits, 10/day free quota, 500-char
 * question cap, output token cap. Nothing here runs on dashboard load.
 */

const MAX_QUERY_CHARS = 500;
const HISTORY_LIMIT = 100;

const adviceSchema = z.object({
    query: z.string().trim().min(1, 'Please type a question.').max(MAX_QUERY_CHARS, `Questions can be at most ${MAX_QUERY_CHARS} characters.`),
    goal: z.string().max(40).optional(),
}).strict();

router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('ai_chat_history')
        .select('id, role, content, created_at')
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
    return next();
}

async function loadUserData(userId, now) {
    const [{ data: profile, error: pErr }, { data: expenses, error: eErr }, { data: bills }] = await Promise.all([
        supabase.from('profiles').select('monthly_budget, investment_target, streak_current').eq('id', userId).maybeSingle(),
        supabase.from('expenses')
            .select('amount, category, description, occurred_at')
            .eq('user_id', userId)
            .gte('occurred_at', appTime.startOfMonthsAgo(4, now).toISOString())
            .order('occurred_at', { ascending: true }),
        supabase.from('recurring_bills').select('amount, due_day, is_active').eq('user_id', userId),
    ]);
    if (pErr || eErr || !profile) throw pErr || eErr || new Error('Profile unavailable');
    return { profile, expenses: expenses || [], bills: bills || [] };
}

const STYLE_BY_INTENT = {
    education: 'Explain the concept simply and concretely, with a short everyday Indian example that uses no rupee figures of its own.',
    investing: 'Be genuinely useful: explain what fits their horizon and why, in plain language. You may explain asset classes and product types (FD, RD, PPF, NPS, debt fund, index fund, ELSS), but never a named scheme, company or platform.',
};

/** Last few turns of this user's chat, so follow-ups are answered in context. */
async function recentConversation(userId) {
    const { data } = await supabase
        .from('ai_chat_history')
        .select('role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6);
    return (data || []).reverse().map((m) => `${m.role === 'user' ? 'User' : 'Spendly AI'}: ${String(m.content).slice(0, 400)}`).join('\n');
}

function buildPrompt({ intent, facts, draft, query, conversation, retryNote }) {
    return `You are Spendly AI, a friendly, practical money coach for a user in India.

Answer the user's question directly, using the DRAFT ANSWER as your source of truth. Write it in your own words, tailored to exactly what they asked; do not just repeat the draft. If the conversation shows a follow-up, answer the follow-up.

STRICT RULES
- Start with a one-sentence direct answer. Then use short sections with bold headings chosen from **Numbers**, **Why**, **What to do**, **Note** (skip any that are not useful).
- Any rupee amount or percentage you write must appear in the draft or the facts. Never calculate, estimate or introduce a new figure.
- Describe allocations and product types as what people commonly choose, never as "recommended" or "best" for this user.
- Never name or recommend a specific stock, company, mutual fund scheme, ETF, insurance policy, broker, app or investment platform. Never include links. Never promise returns.
- Income and bank balances are not tracked by Spendly; never assume them.
- Under 200 words. No emoji. Rupee amounts as ₹1,234. Keep the draft's disclaimer note if it has one.
${STYLE_BY_INTENT[intent] || ''}
${retryNote ? `\nIMPORTANT: ${retryNote}\n` : ''}
QUESTION TYPE: ${intent}
FACTS (computed from the user's data): ${JSON.stringify(facts)}
${conversation ? `\nRECENT CONVERSATION:\n${conversation}\n` : ''}
DRAFT ANSWER:
${draft}

User question: ${query}`;
}

router.post('/invest-advice', protect, aiLimiter, validateAdvice, proGate('chat_message'), async (req, res) => {
    const query = req.adviceQuery;
    try {
        const now = new Date();
        const data = await loadUserData(req.user.id, now);
        const facts = buildFacts({ ...data, now });
        const intent = classifyIntent(query);
        const structured = composeAnswer(intent, facts, query);
        const deterministic = toText(structured);

        let reply = deterministic;
        let source = 'calculated';

        if (gemini.isConfigured()) {
            const conversation = await recentConversation(req.user.id).catch(() => '');
            let retryNote = null;
            // Two attempts: if the first reply introduces a figure that is not in
            // the computed facts, ask once more with that called out.
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const text = (await gemini.generateText(
                        buildPrompt({ intent, facts, draft: deterministic, query, conversation, retryNote }),
                        { maxOutputTokens: 900, temperature: 0.7 }
                    )).trim();
                    if (text && numbersAreGrounded(text, facts, deterministic, query)) {
                        reply = text;
                        source = 'ai';
                        break;
                    }
                    if (text) {
                        console.warn('Coach reply rejected: contained figures not in the computed facts');
                        telemetry.recordEvent('ai_reply_rejected', { severity: 'warning', route: 'POST /api/ai/invest-advice', code: 'UNGROUNDED_FIGURES' });
                        retryNote = 'Your previous reply used a rupee amount or percentage that is not in the draft or facts. Use only figures copied exactly from them.';
                    } else {
                        break;
                    }
                } catch (e) {
                    console.error('Coach AI call failed:', e.code || e.name);
                    break;
                }
            }
        }

        const investingLike = intent === 'education' || intent === 'investing';
        reply = sanitizeReply(reply, { intent: investingLike ? 'investing' : intent });
        if (investingLike && !reply.includes('not investment advice')) reply = `${reply}\n\n${EDUCATION_NOTE}`;

        const { error: insertError } = await supabase.from('ai_chat_history').insert([
            { user_id: req.user.id, role: 'user', content: query },
            { user_id: req.user.id, role: 'bot', content: reply, chips: [] },
        ]);
        if (insertError) console.error('Error saving chat history:', insertError.message);

        res.json({ success: true, reply, intent, source, answer: structured, quota: res.locals.quota || null });
    } catch (error) {
        console.error('Coach error:', error.message);
        res.status(500).json({ success: false, message: 'Could not load your spending data right now. Please try again.' });
    }
});

module.exports = router;
module.exports.MAX_QUERY_CHARS = MAX_QUERY_CHARS;
