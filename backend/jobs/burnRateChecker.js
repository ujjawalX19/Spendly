const cron = require('node-cron');
const { supabase } = require('../config/supabase');
const appTime = require('../lib/appTime');
const { computeBurnRate } = require('../lib/burnRate');

/**
 * burnRateChecker — daily count of users projected to overspend, at 09:00 IST.
 *
 * STATUS: there are no push notifications yet, so this job only logs an
 * aggregate count. It is OFF unless ENABLE_BURN_RATE_JOB=true, because a daily
 * scan of every user's expenses costs database time for no user-visible result.
 *
 * Fixed while disabling by default:
 *   - the schedule '30 3 * * *' with timezone Asia/Kolkata ran at 03:30 IST,
 *     not the documented 09:00;
 *   - it selected a `fcm_token` column that exists in no migration, so the
 *     query failed every day;
 *   - it used the server's UTC clock for month boundaries.
 */

const PAGE_SIZE = 500;

async function runOnce(now = new Date()) {
    const monthStart = appTime.startOfMonth(now).toISOString();
    let flagged = 0;
    let checked = 0;

    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, monthly_budget')
            .order('id')
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            console.error('[BurnRateChecker] Failed to load profiles:', error.message);
            return;
        }
        if (!profiles || profiles.length === 0) break;

        for (const profile of profiles) {
            const { data: expenses, error: expError } = await supabase
                .from('expenses')
                .select('amount, category')
                .eq('user_id', profile.id)
                .gte('occurred_at', monthStart);
            if (expError || !expenses || expenses.length === 0) continue;

            checked++;
            const forecast = computeBurnRate({ expenses, monthlyBudget: Number(profile.monthly_budget) || 5000, now });
            if (forecast.willGoBroke) flagged++;
        }
        if (profiles.length < PAGE_SIZE) break;
    }

    // Aggregate only — never log user ids or amounts.
    console.log(`[BurnRateChecker] ${flagged}/${checked} active users projected to exceed budget.`);
}

function startBurnRateChecker() {
    if (process.env.ENABLE_BURN_RATE_JOB !== 'true') return;
    cron.schedule('0 9 * * *', () => {
        runOnce().catch((e) => console.error('[BurnRateChecker] Fatal error:', e.message));
    }, { timezone: appTime.APP_TIMEZONE });
    console.log('Burn-rate checker scheduled: daily at 09:00', appTime.APP_TIMEZONE);
}

module.exports = { startBurnRateChecker, runOnce };
