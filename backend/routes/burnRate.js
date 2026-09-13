const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// ---------------------------------------------------------------------------
// @route   GET /api/burn-rate
// @desc    Calculate burn rate and predict "broke date" for this month
// @access  Protected
//
// Formula:
//   dailyBurnRate = totalSpentThisMonth / daysPassed
//   daysRemaining = (monthlyBudget - totalSpent) / dailyBurnRate
//   brokeDate = today + daysRemaining
//
// Label as "spending forecast" not "financial advice" for Play Store compliance.
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    try {
        // 1. Get profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('monthly_budget')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        const monthlyBudget = Number(profile.monthly_budget) || 5000;

        // 2. Get this month's expenses with categories
        const now = new Date();
        const monthStart = appTime.startOfMonth(now);

        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount, category, occurred_at')
            .eq('user_id', req.user.id)
            .gte('occurred_at', monthStart.toISOString());

        if (expError) {
            return res.status(500).json({ success: false, message: 'Could not load expenses' });
        }

        const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const daysPassed = Math.max(1, appTime.dayOfMonth(now)); // At least 1 to avoid division by zero
        const daysInMonth = appTime.daysInMonth(now);
        // Days left after today, matching how `daysUntilBroke` is compared below.
        const daysRemaining = Math.max(0, daysInMonth - daysPassed);

        // 3. Calculate burn rate
        const dailyBurnRate = totalSpent / daysPassed;
        const projectedTotal = dailyBurnRate * daysInMonth;
        const budgetRemaining = monthlyBudget - totalSpent;

        let brokeDate = null;
        let brokeDateString = null;
        let willGoBroke = false;

        if (dailyBurnRate > 0 && budgetRemaining >= 0) {
            const daysUntilBroke = budgetRemaining / dailyBurnRate;
            if (daysUntilBroke < daysRemaining) {
                willGoBroke = true;
                brokeDate = new Date(now);
                brokeDate.setDate(brokeDate.getDate() + Math.floor(daysUntilBroke));
                brokeDateString = brokeDate.toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short'
                });
            }
        } else if (budgetRemaining < 0) {
            willGoBroke = true;
            brokeDateString = 'Already over budget!';
        }

        // 4. Find highest non-essential category for cut suggestion
        const categoryTotals = {};
        const NON_ESSENTIAL = ['Food', 'Entertainment', 'Shopping', 'Other'];
        for (const exp of expenses) {
            if (NON_ESSENTIAL.includes(exp.category)) {
                categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + Number(exp.amount);
            }
        }

        const topCategory = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])[0];

        let cutSuggestion = null;
        if (willGoBroke && topCategory) {
            const suggestedCut = Math.round(topCategory[1] * 0.3);
            cutSuggestion = {
                category: topCategory[0],
                categorySpent: Math.round(topCategory[1]),
                suggestedCut,
                message: `Cut ${topCategory[0]} by ₹${suggestedCut.toLocaleString('en-IN')} and you'll make it to payday.`,
            };
        }

        // 5. Generate AI suggestion if available and user is going broke
        let aiSuggestion = null;
        if (willGoBroke && ai && topCategory) {
            try {
                const prompt = `You are Spendly, a direct Indian finance mentor. The user has spent ₹${Math.round(totalSpent)} this month against a ₹${monthlyBudget} budget. Their highest non-essential spend is ₹${Math.round(topCategory[1])} on ${topCategory[0]}. They will run out of money by ${brokeDateString}. Give ONE specific, actionable cut suggestion in 20 words or less. Be direct, no markdown. Example: "Skip 3 Zomato orders this week — saves ₹450, enough to last till the 30th."`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: prompt,
                });
                aiSuggestion = response.text || null;
            } catch (e) {
                console.error('Burn-rate AI suggestion error:', e);
            }
        }

        res.json({
            success: true,
            burnRate: {
                dailyBurnRate: Math.round(dailyBurnRate),
                projectedTotal: Math.round(projectedTotal),
                totalSpent: Math.round(totalSpent),
                monthlyBudget,
                budgetRemaining: Math.round(budgetRemaining),
                daysRemaining,
                daysPassed,
                willGoBroke,
                brokeDate: brokeDateString,
                percentUsed: Math.round((totalSpent / monthlyBudget) * 100),
                cutSuggestion,
                aiSuggestion,
            }
        });
    } catch (error) {
        console.error('Burn Rate Error:', error);
        res.status(500).json({ success: false, message: 'Failed to calculate burn rate' });
    }
});

module.exports = router;
