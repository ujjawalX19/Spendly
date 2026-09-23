const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');
const { grant } = require('../lib/moneyXp');

/**
 * Money Streak (v1.1) — free for everyone.
 *
 * GET  /api/money-streak           the streak, today's mission, this week, XP and level.
 *                                  Also locks finished days and pays any XP due.
 * POST /api/money-streak/no-spend  mark *today* as a no-spend day (only if nothing
 *                                  has been logged today). Takes no date: past days
 *                                  cannot be marked.
 *
 * Rules and anti-tampering: lib/moneyStreak.js. The user id always comes from
 * the verified token.
 */

const NO_SPEND = 'no_spend_day';

function isDuplicate(error) {
    return error && error.code === '23505';
}

async function loadState(userId, now) {
    const today = appTime.localDateKey(now);

    const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('monthly_budget, investment_target, money_streak_started_on')
        .eq('id', userId)
        .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) return { missingProfile: true };

    // The first visit starts the streak. Earlier days never count, so nobody
    // is handed a backlog of XP (or missed days) on their first look.
    let startedOn = profile.money_streak_started_on ? String(profile.money_streak_started_on).slice(0, 10) : null;
    if (!startedOn) {
        await supabase.from('profiles').update({ money_streak_started_on: today }).eq('id', userId).is('money_streak_started_on', null);
        const { data: again } = await supabase.from('profiles').select('money_streak_started_on').eq('id', userId).maybeSingle();
        startedOn = again?.money_streak_started_on ? String(again.money_streak_started_on).slice(0, 10) : today;
    }

    const windowStart = [startedOn, ms.addDays(today, -ms.BACKFILL_DAYS)].sort().pop();
    const loadFrom = new Date(Math.min(
        appTime.startOfMonth(ms.dayStart(windowStart)).getTime(),
        appTime.startOfMonthsAgo(1, now).getTime(),
    ));
    const loadFromKey = appTime.localDateKey(loadFrom);
    const endOfToday = ms.dayStart(ms.addDays(today, 1));

    const [expensesRes, billsRes, noSpendRes, lockedRes, ledgerRes] = await Promise.all([
        supabase.from('expenses').select('amount, category, occurred_at').eq('user_id', userId)
            .gte('occurred_at', loadFrom.toISOString()).lt('occurred_at', endOfToday.toISOString()),
        supabase.from('recurring_bills').select('name, amount, due_day, is_active').eq('user_id', userId),
        supabase.from('streak_activities').select('activity_date').eq('user_id', userId).eq('activity', NO_SPEND).gte('activity_date', loadFromKey),
        supabase.from('money_streak_days').select('day, kept').eq('user_id', userId).gte('day', startedOn).order('day', { ascending: true }),
        supabase.from('money_xp_ledger').select('reason, ref_key, xp, created_at').eq('user_id', userId),
    ]);
    for (const r of [expensesRes, billsRes, noSpendRes, lockedRes, ledgerRes]) if (r.error) throw r.error;

    return {
        today,
        startedOn,
        windowStart,
        profile,
        expenses: expensesRes.data || [],
        bills: billsRes.data || [],
        noSpendDays: new Set((noSpendRes.data || []).map((r) => String(r.activity_date).slice(0, 10))),
        locked: lockedRes.data || [],
        ledger: ledgerRes.data || [],
    };
}

router.get('/', protect, userApiLimiter, async (req, res) => {
    try {
        const now = new Date();
        const s = await loadState(req.user.id, now);
        if (s.missingProfile) return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });

        const { today, startedOn, profile, expenses, bills, noSpendDays } = s;
        const evaluate = (dateKey) => ms.evaluateDay({ dateKey, expenses, noSpendDays, profile, bills });

        // 1. Lock every finished day older than the grace period that is not locked yet.
        const keptByDay = new Map(s.locked.map((d) => [String(d.day).slice(0, 10), d.kept === true]));
        const lockBefore = ms.addDays(today, -ms.GRACE_DAYS); // days < this are locked
        const ended = [];
        for (let key = s.windowStart; key < lockBefore; key = ms.addDays(key, 1)) {
            if (keptByDay.has(key)) {
                ended.push({ dateKey: key, kept: keptByDay.get(key) });
                continue;
            }
            const day = evaluate(key);
            const { error } = await supabase.from('money_streak_days').insert({
                user_id: req.user.id, day: key, mission: day.mission, kept: day.kept, spent: day.spent, day_limit: day.limit,
            });
            if (error && !isDuplicate(error)) throw error;
            keptByDay.set(key, day.kept);
            ended.push(day);
        }

        // 2. Yesterday (still in its grace period) and today are evaluated live.
        const yesterday = ms.addDays(today, -1);
        if (yesterday >= startedOn) {
            const y = evaluate(yesterday);
            keptByDay.set(yesterday, y.kept);
            ended.push(y);
        }
        const todayEval = evaluate(today);
        keptByDay.set(today, todayEval.kept);

        const streak = ms.computeStreak(keptByDay, today, startedOn);

        // 3. Pay XP that is due and not yet in the ledger.
        const lastMonday = ms.addDays(ms.weekStart(today), -7);
        const lastWeek = lastMonday >= startedOn
            ? ms.weeklyGoal({ mondayKey: lastMonday, expenses, noSpendDays, profile, today })
            : null;
        const thisMonthStartKey = appTime.localDateKey(appTime.startOfMonth(now));
        const prevMonthStartKey = appTime.localDateKey(appTime.startOfMonthsAgo(1, now));
        const lastMonth = startedOn < thisMonthStartKey
            ? { ...ms.monthGoal({ monthStartKey: prevMonthStartKey, expenses, noSpendDays, profile }), monthKey: prevMonthStartKey.slice(0, 7) }
            : null;

        const have = new Set(s.ledger.map((l) => `${l.reason}|${l.ref_key}`));
        const earnedNow = [];
        for (const award of ms.awardsDue({ endedDays: ended, completedRun: streak.completedRun, lastWeek, lastMonth })) {
            if (have.has(`${award.reason}|${award.ref_key}`)) continue;
            const got = await grant(req.user.id, award);
            if (got) earnedNow.push({ ...award, created_at: now.toISOString() });
            have.add(`${award.reason}|${award.ref_key}`);
        }

        const ledger = [...s.ledger, ...earnedNow];
        const totalXp = ledger.reduce((sum, l) => sum + (Number(l.xp) || 0), 0);
        const xpToday = ledger
            .filter((l) => l.created_at && appTime.localDateKey(new Date(l.created_at)) === today)
            .reduce((sum, l) => sum + (Number(l.xp) || 0), 0);

        const week = ms.weeklyGoal({ mondayKey: ms.weekStart(today), expenses, noSpendDays, profile, today });

        res.json({
            success: true,
            moneyStreak: {
                current: streak.current,
                longest: streak.longest,
                startedOn,
                today: {
                    dateKey: today,
                    mission: ms.missionText(todayEval.mission, todayEval.limit),
                    limit: todayEval.limit,
                    spent: todayEval.spent,
                    status: todayEval.status,
                    noSpendMarked: todayEval.noSpend,
                    canMarkNoSpend: todayEval.transactions === 0 && !todayEval.noSpend,
                },
                week: ms.weekView(keptByDay, today, startedOn),
                weekly: { limit: week.limit, spent: week.spent, activeDays: week.activeDays, minActiveDays: week.minActiveDays, status: week.status },
                xp: { ...ms.levelFor(totalXp), today: xpToday, earnedNow: earnedNow.map(({ reason, xp }) => ({ reason, xp })) },
                rules: {
                    expenseLogged: ms.XP.expense_logged,
                    expenseLoggedDailyCap: ms.EXPENSE_XP_DAILY_CAP,
                    dailyMission: ms.XP.daily_mission,
                    weeklyGoal: ms.XP.weekly_goal,
                    monthWithinBudget: ms.XP.month_within_budget,
                    streakMilestone: ms.XP.streak_milestone,
                    streakMilestoneDays: ms.STREAK_MILESTONE_DAYS,
                },
            },
        });
    } catch (error) {
        console.error('Money Streak error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't load your Money Streak just now. Please try again in a moment." });
    }
});

router.post('/no-spend', protect, userApiLimiter, async (req, res) => {
    try {
        const now = new Date();
        const today = appTime.localDateKey(now);
        const { data: todays, error } = await supabase
            .from('expenses')
            .select('id')
            .eq('user_id', req.user.id)
            .gte('occurred_at', appTime.startOfDay(now).toISOString())
            .lt('occurred_at', ms.dayStart(ms.addDays(today, 1)).toISOString())
            .limit(1);
        if (error) throw error;
        if (todays && todays.length) {
            return res.status(409).json({ success: false, code: 'SPENDING_LOGGED_TODAY', message: "You've logged spending today, so today can't be a no-spend day." });
        }

        const { error: insertError } = await supabase.from('streak_activities').insert({ user_id: req.user.id, activity: NO_SPEND, activity_date: today });
        if (isDuplicate(insertError)) return res.json({ success: true, alreadyDone: true });
        if (insertError) throw insertError;
        res.status(201).json({ success: true, dateKey: today });
    } catch (error) {
        console.error('No-spend day error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't save that just now. Please try again." });
    }
});

module.exports = router;
