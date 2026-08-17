const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

let ai = null;
if (process.env.GEMINI_API_KEY) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
else console.warn('GEMINI_API_KEY not set — investment guide will use its personalised local plan.');

const GOALS = new Set(['habit', 'passive growth', 'active learning']);
const money = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const futureValue = (monthly, years, annual = 0.12) => {
    const rate = annual / 12;
    const months = years * 12;
    return monthly * (((1 + rate) ** months - 1) / rate) * (1 + rate);
};
const sipDate = () => new Date() < new Date(new Date().getFullYear(), new Date().getMonth(), 5) ? 'the 5th of this month' : 'the 5th of next month';
const futureTable = (amount) => [1, 3, 5].map((years) => {
    const value = futureValue(amount, years);
    const invested = amount * years * 12;
    return `${years} year${years > 1 ? 's' : ''}: ${money(value)} (${money(value - invested)} returns on ${money(invested)} invested)`;
}).join('\n');

function buildLocalPlan(context) {
    const { surplus, totalSpent, budget, topCategory, topCategorySpend, goal, paisaScore } = context;
    const greeting = paisaScore >= 600
        ? `Your Paisa Score is solid at ${paisaScore} — let’s put that discipline to work.`
        : `Your Paisa Score is ${paisaScore}. No drama — one clean money move this month changes the direction.`;

    if (surplus <= 0) {
        const over = Math.abs(surplus);
        const categoryCut = Math.max(50, Math.round((topCategorySpend || budget * 0.2) * 0.2));
        return `${greeting}\n\n### Your investable amount this month\nYou're actually ${money(over)} over budget this month. Let's fix the leaks first before we talk investing. You spent ${money(totalSpent)} against a ${money(budget)} budget.\n\n### Your plan: Leak Plug Sprint\n1. Cut ${money(categoryCut)} from ${topCategory} this month — one fewer delivery/order a week.\n2. Move ${money(Math.max(50, Math.round(over / 3)))} into a separate savings pocket on ${sipDate()}.\n3. Cap your next non-essential spend at ${money(Math.max(100, Math.round(over / 2)))}.\n\n### What this grows into\nFirst target: get back to a positive ${money(200)} surplus next month. That is the real first investment.\n\n### One thing to know\nInvesting budget-overrun money is like paying for a gym membership to avoid exercise — it looks productive but solves nothing.\n\n### This month's money win\nQuick win: You spent ${money(topCategorySpend)} on ${topCategory} this month. Cutting it by 20% = ${money(categoryCut)} extra to invest.`;
    }
    if (surplus < 100) {
        return `${greeting}\n\n### Your investable amount this month\nBased on your spending this month, you have ${money(surplus)} that's genuinely safe to invest — not your full salary, not a guess, your actual leftover.\n\n### Your plan: Buffer Before Boost\n${money(surplus)} is tight this month — and that's okay. Build a ${money(500)} emergency buffer first: park ${money(surplus)} in your savings account on ${sipDate()}. Then target a ${money(200)} surplus next month.\n\n### What this grows into\nYour first ${money(500)} buffer buys you the ability to handle a surprise without reaching for credit.\n\n### One thing to know\nA small emergency buffer beats a tiny SIP that you have to break at the first unexpected expense.\n\n### This month's money win\nQuick win: You spent ${money(topCategorySpend)} on ${topCategory} this month. Cutting it by 20% = ${money(Math.round(topCategorySpend * 0.2))} toward your buffer.`;
    }

    const sip = Math.max(100, Math.floor(surplus / 100) * 100);
    let plan;
    if (goal === 'active learning') {
        const stock = Math.floor((sip * 0.3) / 100) * 100;
        const index = sip - stock;
        plan = stock
            ? `### Your plan: Learn Without Gambling\nWHAT: Start a ${money(index)}/month SIP in UTI Nifty 50 Index Fund Direct Growth, then use up to ${money(stock)} to buy one share of TCS or HDFC Bank.\nHOW MUCH: ${money(sip)} total this month; direct stocks stay capped at ${money(stock)}.\nWHERE: Set the SIP on Kuvera, then use Zerodha for the one-stock learning buy.\nWHEN: Set the SIP for ${sipDate()}; buy the one share after reading its latest quarterly results.\n\n### What this grows into\n${futureTable(sip)}\n\n### One thing to know\nDirect stocks are a school, not a shortcut. Buy one share, track it for 30 days, read one earnings report — that’s your MBA in markets.`
            : `### Your plan: Learn Without Gambling\nWHAT: Start a ${money(sip)}/month SIP in UTI Nifty 50 Index Fund Direct Growth.\nHOW MUCH: ${money(sip)} this month; wait until your surplus reaches ${money(400)} before buying a direct stock, so it stays below the 30% beginner cap.\nWHERE: Set the SIP on Kuvera; use Zerodha later for the one-stock learning buy.\nWHEN: Set the SIP for ${sipDate()}.\n\n### What this grows into\n${futureTable(sip)}\n\n### One thing to know\nDirect stocks are a school, not a shortcut. Your SIP runs in parallel — not after you get bored of tracking one share.`;
    } else if (goal === 'passive growth') {
        const fund = sip < 1000 ? 'UTI Nifty 50 Index Fund Direct Growth' : sip <= 5000 ? 'Parag Parikh Flexi Cap Fund Direct Growth' : 'UTI Nifty 50 Index Fund Direct Growth and Parag Parikh Flexi Cap Fund Direct Growth';
        const split = sip > 5000 ? `${money(Math.floor(sip / 2 / 100) * 100)} in each fund` : money(sip);
        plan = `### Your plan: Quiet Growth Engine\nWHAT: Start a SIP in ${fund}.\nHOW MUCH: ${split} each month.\nWHERE: Set it up on Kuvera or INDmoney — both make it easy to track direct funds.\nWHEN: ${sipDate()}, right after money lands in your account.\n\n### What this grows into\n${futureTable(sip)}\n\n### One thing to know\nYou’re hiring a fund manager to do the work. Your only job is to not panic-sell when the market gets noisy.`;
    } else {
        plan = `### Your plan: Set-and-Forget Nifty Start\nWHAT: Start a SIP in UTI Nifty 50 Index Fund Direct Growth.\nHOW MUCH: ${money(sip)}/month.\nWHERE: Open Groww or Kuvera, search the exact fund name, and choose the Direct Growth option.\nWHEN: Set the auto-debit for ${sipDate()}.\n\n### What this grows into\n${futureTable(sip)}\n\n### One thing to know\nAutomation is the strategy. Set it, forget it, thank yourself in 5 years. A market dip is when your SIP works hardest — don’t stop it.`;
    }
    const cut = Math.round(topCategorySpend * 0.2);
    return `${greeting}\n\n### Your investable amount this month\nBased on your spending this month, you have ${money(surplus)} that's genuinely safe to invest — not your full salary, not a guess, your actual leftover.\n\n${plan}\n\n### This month's money win\nQuick win: You spent ${money(topCategorySpend)} on ${topCategory} this month. Cutting it by 20% = ${money(cut)} extra to invest. In 5 years, that extra SIP could add about ${money(futureValue(cut, 5) - cut * 60)} in returns.`;
}

// @route POST /api/ai/invest-advice
// @desc Personalised investment guidance based on the signed-in user's live spending data
router.post('/invest-advice', protect, async (req, res) => {
    const query = String(req.body?.query || '').trim();
    const goal = GOALS.has(req.body?.goal) ? req.body.goal : 'habit';
    if (!query) return res.status(400).json({ success: false, message: 'Missing query parameter.' });
    try {
        const start = new Date();
        start.setDate(1); start.setHours(0, 0, 0, 0);
        const [{ data: profile, error: profileError }, { data: expenses, error: expensesError }] = await Promise.all([
            supabase.from('profiles').select('monthly_budget, karma_score').eq('id', req.user.id).single(),
            supabase.from('expenses').select('amount, category').eq('user_id', req.user.id).gte('created_at', start.toISOString()),
        ]);
        if (profileError || expensesError || !profile) throw profileError || expensesError || new Error('Profile unavailable');
        const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
        const categories = expenses.reduce((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + Number(item.amount) }), {});
        const [topCategory = 'Other', topCategorySpend = 0] = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || [];
        const context = { budget: Number(profile.monthly_budget), totalSpent, surplus: Number(profile.monthly_budget) - totalSpent, topCategory, topCategorySpend, goal, paisaScore: Number(profile.karma_score) };
        const fallback = buildLocalPlan(context);
        if (!ai) return res.json({ success: true, reply: fallback, context });
        const instruction = `You are SpendIt's AI Investment Guide, a warm, direct Indian finance mentor. Never recommend F&O, crypto, penny stocks, chit funds, or unregulated instruments. Use exact rupee amounts, named fund or blue-chip stock, platform, and timing. Start with the actual surplus. Use the headings in the supplied plan. For zero/negative surplus, recommend spending cuts only. Do not invent data. Preserve all numbers and financial recommendations from this calculated plan; make only tone changes if useful.\n\nLIVE CONTEXT: ${JSON.stringify(context)}\n\nCALCULATED PLAN:\n${fallback}`;
        const response = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: `${instruction}\n\nUser question: ${query}` });
        res.json({ success: true, reply: response.text || fallback, context });
    } catch (error) {
        console.error('Investment guide error:', error);
        res.status(500).json({ success: false, message: 'Could not load your spending context for investment guidance.' });
    }
});

module.exports = router;
