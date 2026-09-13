const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { aiLimiter } = require('../middleware/rateLimits');
const gemini = require('../lib/gemini');
const appTime = require('../lib/appTime');
const { buildContext, describeContext } = require('../lib/financialContext');
const { classifyIntent, educationalInvestingNote, sanitizeReply, EDUCATION_DISCLAIMER } = require('../lib/coachContent');
const { validationError } = require('../lib/validation');

/**
 * Spendly's money coach.
 *
 * SCOPE (see FINANCIAL_CONTENT_REVIEW.md)
 * The coach explains the user's own spending and offers general financial
 * education. It does NOT recommend specific securities, mutual fund schemes,
 * brokers, platforms or insurance products, does not link to them, and has no
 * affiliate relationships. Personalised product recommendations are regulated
 * investment advice in India and are out of scope until professionally reviewed.
 *
 * COST CONTROL
 *   - authentication required
 *   - per-user burst and hourly rate limits (aiLimiter)
 *   - free tier: 10 messages per IST day, enforced by proGate (429 when exhausted)
 *   - question capped at 500 characters, answer capped by maxOutputTokens
 */

const MAX_QUERY_CHARS = 500;
const HISTORY_LIMIT = 100;

const adviceSchema = z.object({
    query: z.string().trim().min(1, 'Please type a question.').max(MAX_QUERY_CHARS, `Questions can be at most ${MAX_QUERY_CHARS} characters.`),
    // Accepted for compatibility with older app builds; no longer changes content.
    goal: z.string().max(40).optional(),
}).strict();

// @route GET /api/ai/history — the signed-in user's recent chat
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

/** Validate before the quota is charged, so a bad request costs nothing. */
function validateAdvice(req, res, next) {
    const parsed = adviceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    req.adviceQuery = parsed.data.query;
    return next();
}

// @route POST /api/ai/invest-advice — coach answer grounded in the user's data
router.post('/invest-advice', protect, aiLimiter, validateAdvice, proGate('chat_message'), async (req, res) => {
    const query = req.adviceQuery;

    try {
        const now = new Date();
        const monthStart = appTime.startOfMonth(now);
        const prevStart = appTime.startOfMonthsAgo(1, now);

        const [
            { data: profile, error: profileError },
            { data: monthRows, error: expensesError },
            { data: prevRows },
            { data: bills },
        ] = await Promise.all([
            supabase.from('profiles')
                .select('monthly_budget, investment_target, karma_score, paisa_score')
                .eq('id', req.user.id).maybeSingle(),
            supabase.from('expenses')
                .select('amount, category, occurred_at')
                .eq('user_id', req.user.id)
                .gte('occurred_at', monthStart.toISOString()),
            supabase.from('expenses')
                .select('amount, category, occurred_at')
                .eq('user_id', req.user.id)
                .gte('occurred_at', prevStart.toISOString())
                .lt('occurred_at', monthStart.toISOString()),
            supabase.from('recurring_bills')
                .select('amount, due_day, is_active')
                .eq('user_id', req.user.id),
        ]);

        if (profileError || expensesError || !profile) {
            throw profileError || expensesError || new Error('Profile unavailable');
        }

        const ctx = buildContext({ thisMonth: monthRows || [], lastMonth: prevRows || [], bills: bills || [], profile, now });
        const grounding = describeContext(ctx);
        const intent = classifyIntent(query);

        const fallback = intent === 'investing'
            ? `${grounding}\n\n${educationalInvestingNote(ctx)}\n\n${EDUCATION_DISCLAIMER}`
            : grounding;

        let reply = fallback;
        if (gemini.isConfigured()) {
            const instruction = `You are Spendly's money coach for a user in India. Warm, direct, plain language.

WHAT YOU MAY DO
- Explain the user's own spending using the figures below.
- Answer affordability questions using their safe-to-spend and upcoming bills.
- Suggest realistic ways to save, based on their actual categories.
- Give GENERAL financial education: emergency funds, budgeting, how SIPs work, what diversification and risk mean, the difference between asset classes, compounding with clearly stated assumptions.

WHAT YOU MUST NEVER DO
- Never name or recommend a specific stock, mutual fund scheme, ETF, bond, insurance policy, bank product, broker, trading app or investment platform.
- Never tell the user to buy, sell or hold any particular security.
- Never include links or referral codes.
- Never promise or predict returns. If you illustrate compounding, state the assumed rate as an assumption, not a forecast.
- Never recommend derivatives (F&O), crypto, chit funds, or unregulated schemes.
- Never state a number that is not in the data below.

The question is classified as: ${intent}. Answer the question that was asked; do not steer spending questions toward investing.

USER DATA (confidence: "${ctx.confidence}")
${JSON.stringify(ctx)}

Summary of the same data:
${grounding}

If confidence is "insufficient", say you need about a week of logged spending before commenting on habits.
Keep it to two or three short paragraphs. Rupee amounts as ₹1,234. No emoji.
${intent === 'investing' ? `End with exactly: "${EDUCATION_DISCLAIMER}"` : ''}`;

            try {
                const text = await gemini.generateText(`${instruction}\n\nUser question: ${query}`, { maxOutputTokens: 700 });
                if (text.trim()) reply = sanitizeReply(text, { intent });
            } catch (e) {
                console.error('Coach AI call failed:', e.code || e.name);
                // Fall back to the deterministic summary rather than failing.
            }
        }

        const { error: insertError } = await supabase.from('ai_chat_history').insert([
            { user_id: req.user.id, role: 'user', content: query },
            { user_id: req.user.id, role: 'bot', content: reply, chips: [] },
        ]);
        if (insertError) console.error('Error saving chat history:', insertError.message);

        res.json({ success: true, reply, context: ctx, quota: res.locals.quota || null });
    } catch (error) {
        console.error('Coach error:', error.message);
        res.status(500).json({ success: false, message: 'Could not load your spending data right now. Please try again.' });
    }
});

module.exports = router;
module.exports.MAX_QUERY_CHARS = MAX_QUERY_CHARS;
