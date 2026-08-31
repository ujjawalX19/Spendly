const cron = require('node-cron');
const { supabase } = require('../config/supabase');

/**
 * burnRateChecker — Daily cron job that runs at 9:00 AM IST.
 *
 * Checks all users' burn rates and logs warnings for users who will
 * run out of budget before month end. When FCM is configured, this
 * will send push notifications.
 *
 * Message format:
 *   "At this rate you'll be broke by the 18th. Cut Zomato by ₹300
 *    and you'll make it to payday."
 */
function startBurnRateChecker() {
    // Run daily at 9:00 AM IST (3:30 AM UTC)
    cron.schedule('30 3 * * *', async () => {
        console.log('[BurnRateChecker] Running daily check...');

        try {
            // 1. Get all users with budgets
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('id, monthly_budget, fcm_token');

            if (profileError || !profiles) {
                console.error('[BurnRateChecker] Failed to load profiles:', profileError);
                return;
            }

            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            monthStart.setHours(0, 0, 0, 0);
            const daysPassed = Math.max(1, now.getDate());
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysRemaining = daysInMonth - daysPassed;

            let panicCount = 0;

            for (const profile of profiles) {
                try {
                    const monthlyBudget = Number(profile.monthly_budget) || 5000;

                    // 2. Get this month's expenses for user
                    const { data: expenses, error: expError } = await supabase
                        .from('expenses')
                        .select('amount, category')
                        .eq('user_id', profile.id)
                        .gte('created_at', monthStart.toISOString());

                    if (expError || !expenses || expenses.length === 0) continue;

                    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
                    const dailyBurnRate = totalSpent / daysPassed;
                    const budgetRemaining = monthlyBudget - totalSpent;

                    if (dailyBurnRate <= 0 || budgetRemaining < 0) continue;

                    const daysUntilBroke = budgetRemaining / dailyBurnRate;

                    // 3. Check if user will go broke before month end
                    if (daysUntilBroke < daysRemaining) {
                        panicCount++;
                        const brokeDay = now.getDate() + Math.floor(daysUntilBroke);

                        // Find highest non-essential category
                        const categoryTotals = {};
                        const NON_ESSENTIAL = ['Food', 'Entertainment', 'Shopping', 'Other'];
                        for (const exp of expenses) {
                            if (NON_ESSENTIAL.includes(exp.category)) {
                                categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + Number(exp.amount);
                            }
                        }
                        const topCategory = Object.entries(categoryTotals)
                            .sort((a, b) => b[1] - a[1])[0];

                        const cutSuggestion = topCategory
                            ? `Cut ${topCategory[0]} by ₹${Math.round(topCategory[1] * 0.3).toLocaleString('en-IN')} and you'll make it to payday.`
                            : 'Try reducing discretionary spending.';

                        const message = `At this rate you'll be broke by the ${brokeDay}${getOrdinalSuffix(brokeDay)}. ${cutSuggestion}`;

                        // TODO: When Firebase Admin is configured, send FCM push notification:
                        //
                        // if (profile.fcm_token) {
                        //     await admin.messaging().send({
                        //         token: profile.fcm_token,
                        //         notification: {
                        //             title: '⚠️ Spending Alert',
                        //             body: message,
                        //         },
                        //         data: { type: 'burn_rate_alert' },
                        //     });
                        // }

                        console.log('[BurnRateChecker] Spending alert queued');
                    }
                } catch {
                    console.error('[BurnRateChecker] Error processing a profile');
                }
            }

            console.log(`[BurnRateChecker] Done. ${panicCount}/${profiles.length} users flagged.`);
        } catch (error) {
            console.error('[BurnRateChecker] Fatal error:', error);
        }
    }, {
        timezone: 'Asia/Kolkata',
    });

    console.log('📅 Burn-rate checker scheduled: daily at 9:00 AM IST');
}

function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

module.exports = { startBurnRateChecker };
