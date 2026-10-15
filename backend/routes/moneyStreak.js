const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const { validationError } = require('../lib/validation');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');
const missions = require('../lib/missions');
const { grant } = require('../lib/moneyXp');
const { grantPoints, summarise, isMissing } = require('../lib/points');
const { loadRewards } = require('../lib/rewardsData');

/**
 * Money Streak (v1.1) — free for everyone. Personalised missions, difficulty
 * and Vittova Points added in v1.14.
 *
 * GET  /api/money-streak                 the streak, today's mission, this week, XP, level and
 *                                        Points. Gives today's mission (once a day), locks
 *                                        finished days and pays any XP and Points due.
 * POST /api/money-streak/no-spend        mark *today* as a no-spend day (only if nothing has
 *                                        been logged today). Past days cannot be marked: a
 *                                        `date` in the body is ignored, and a queued action
 *                                        that names another day ({ dateKey }) is refused.
 * POST /api/money-streak/checkin         confirm today's self-reported mission { mission, eventId }
 * POST /api/money-streak/mission/replace swap today's mission (at most twice a day)
 * PUT  /api/money-streak/preferences     mission difficulty { difficulty: auto|easy|balanced|advanced }
 *
 * Rules: lib/moneyStreak.js (streak, XP, levels) and lib/missions.js (which
 * mission, difficulty, judging, rewards). The user id always comes from the
 * verified token; no route accepts XP, Points, progress or a result.
 */

const NO_SPEND = 'no_spend_day';
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** An award whose XP was recorded this recently but whose Points were not (an interrupted request) is completed. */
const POINTS_HEAL_MS = 48 * 3600 * 1000;

function isDuplicate(error) {
    return error && error.code === '23505';
}

const dayEnded = (res) => res.status(409).json({ success: false, code: 'DAY_ENDED', message: 'That day has ended, so this can no longer count. Today\'s mission is waiting.' });

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
        supabase.from('expenses').select('amount, category, description, occurred_at').eq('user_id', userId)
            .gte('occurred_at', loadFrom.toISOString()).lt('occurred_at', endOfToday.toISOString()),
        supabase.from('recurring_bills').select('name, amount, due_day, is_active').eq('user_id', userId),
        supabase.from('streak_activities').select('activity_date').eq('user_id', userId).eq('activity', NO_SPEND).gte('activity_date', loadFromKey),
        supabase.from('money_streak_days').select('day, kept, mission').eq('user_id', userId).gte('day', startedOn).order('day', { ascending: true }),
        supabase.from('money_xp_ledger').select('reason, ref_key, xp, created_at').eq('user_id', userId),
    ]);
    for (const r of [expensesRes, billsRes, noSpendRes, lockedRes, ledgerRes]) if (r.error) throw r.error;

    // v1.14 rows. Missing tables or REWARDS_ENABLED=false: the fixed rotation, as before.
    const rewards = await loadRewards(userId, { today });

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
        rewards,
    };
}

/** Judges a day: its assigned personalised mission if it has one, else the fixed rotation. */
function evaluator(s) {
    const { expenses, noSpendDays, profile, bills, rewards } = s;
    return (dateKey) => {
        const base = ms.evaluateDay({ dateKey, expenses, noSpendDays, profile, bills });
        const assignment = rewards.ready ? rewards.assignments.get(dateKey) : null;
        if (!assignment) return { ...base, progress: null, assignment: null, reward: null };
        const facts = missions.dayFacts({ dateKey, expenses, noSpendDays, checkins: rewards.checkins, contributions: rewards.contributions });
        const judged = missions.judge(assignment, facts);
        return {
            ...base,
            mission: assignment.mission,
            kept: judged.kept,
            status: judged.status,
            progress: judged.progress,
            assignment,
            reward: missions.rewardFor(assignment.mission, assignment.difficulty),
        };
    };
}

/** Ended assigned days, newest first, for adaptive difficulty. */
function missionHistory(s, keptByDay) {
    if (!s.rewards.ready) return [];
    return [...s.rewards.assignments.values()]
        .filter((a) => a.day < s.today && keptByDay.has(a.day))
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((a) => ({ difficulty: a.difficulty, kept: keptByDay.get(a.day) === true }));
}

function signalsFor(s, todayLimit) {
    return missions.buildSignals({
        today: s.today,
        expenses: s.expenses,
        noSpendDays: s.noSpendDays,
        bills: s.bills,
        goals: s.rewards.goals,
        contributions: s.rewards.contributions,
        checkins: s.rewards.checkins,
        dailyLimit: todayLimit,
    });
}

/**
 * Give today's mission if it has not been given yet. Stored once; a parallel
 * request that loses the race reads the winner's row. On any failure the day
 * falls back to the fixed rotation rather than failing the request.
 */
async function ensureTodaysMission(userId, s, keptByDay, todayLimit) {
    const { today, rewards } = s;
    if (!rewards.ready || rewards.assignments.has(today)) return;
    const signals = signalsFor(s, todayLimit);
    const { difficulty } = missions.resolveDifficulty({ preference: rewards.preference, history: missionHistory(s, keptByDay), stretched: signals.stretched });
    const lockedMission = new Map(s.locked.map((d) => [String(d.day).slice(0, 10), d.mission]));
    const recent = [1, 2].map((n) => {
        const k = ms.addDays(today, -n);
        return rewards.assignments.get(k)?.mission || lockedMission.get(k) || null;
    });
    const choice = missions.choose({ signals, difficulty, recent });
    const row = { user_id: userId, day: today, mission: choice.mission, difficulty: choice.difficulty, params: choice.params, reason: choice.reason, source: choice.source, replacements: 0, previous: [] };
    const { error } = await supabase.from('money_daily_missions').insert(row);
    if (!error) {
        rewards.assignments.set(today, { ...row, assigned_at: new Date().toISOString() });
        return;
    }
    if (isDuplicate(error)) {
        const { data } = await supabase.from('money_daily_missions').select('day, mission, difficulty, params, reason, source, replacements, previous, assigned_at')
            .eq('user_id', userId).eq('day', today).maybeSingle();
        if (data) rewards.assignments.set(today, { ...data, day: today, params: data.params || {}, replacements: Number(data.replacements) || 0, previous: data.previous || [] });
        return;
    }
    console.error('Missions: assignment not stored:', error.code || 'error');
}

function presentMission(todayEval, s) {
    const a = todayEval.assignment;
    if (!a) {
        return {
            ...ms.missionText(todayEval.mission, todayEval.limit),
            personalised: false,
            reward: { xp: ms.XP.daily_mission, points: 0 },
            deadline: ms.dayStart(ms.addDays(s.today, 1)).toISOString(),
        };
    }
    const def = missions.CATALOG[a.mission];
    const words = missions.describe(a);
    const replacementsLeft = Math.max(0, missions.MAX_REPLACEMENTS - a.replacements);
    const finished = todayEval.status === 'done' || todayEval.status === 'missed';
    return {
        id: a.mission,
        title: words.title,
        detail: words.detail,
        criteria: words.criteria,
        personalised: true,
        source: a.source,
        reason: a.reason,
        kind: def.kind,
        selfReported: def.kind === 'self_reported',
        difficulty: a.difficulty,
        difficultyLabel: missions.DIFFICULTIES[a.difficulty]?.label || 'Easy',
        reward: missions.rewardFor(a.mission, a.difficulty),
        progress: todayEval.progress,
        deadline: ms.dayStart(ms.addDays(s.today, 1)).toISOString(),
        replacementsLeft,
        canReplace: !finished && replacementsLeft > 0,
        checkin: def.checkin ? { done: todayEval.status === 'done' } : null,
        action: missions.actionFor(a.mission),
    };
}

router.get('/', protect, userApiLimiter, async (req, res) => {
    try {
        const now = new Date();
        const s = await loadState(req.user.id, now);
        if (s.missingProfile) return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });

        const { today, startedOn, profile, expenses, bills, noSpendDays, rewards } = s;
        const evaluate = evaluator(s);

        // 1. Lock every finished day older than the grace period that is not locked yet.
        const keptByDay = new Map(s.locked.map((d) => [String(d.day).slice(0, 10), d.kept === true]));
        const lockBefore = ms.addDays(today, -ms.GRACE_DAYS); // days < this are locked
        const ended = [];
        for (let key = s.windowStart; key < lockBefore; key = ms.addDays(key, 1)) {
            if (keptByDay.has(key)) {
                const reward = rewards.ready && rewards.assignments.has(key) ? missions.rewardFor(rewards.assignments.get(key).mission, rewards.assignments.get(key).difficulty) : null;
                ended.push({ dateKey: key, kept: keptByDay.get(key), reward });
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

        // 2. Yesterday (still in its grace period) is evaluated live.
        const yesterday = ms.addDays(today, -1);
        if (yesterday >= startedOn) {
            const y = evaluate(yesterday);
            keptByDay.set(yesterday, y.kept);
            ended.push(y);
        }

        // 3. Today's mission: given once, then judged live.
        const todayBase = ms.evaluateDay({ dateKey: today, expenses, noSpendDays, profile, bills });
        await ensureTodaysMission(req.user.id, s, keptByDay, todayBase.limit);
        const todayEval = evaluate(today);
        keptByDay.set(today, todayEval.kept);

        const streak = ms.computeStreak(keptByDay, today, startedOn);

        // 4. Pay XP (and, from v1.14, Points) that is due and not yet in the ledgers.
        const lastMonday = ms.addDays(ms.weekStart(today), -7);
        const lastWeek = lastMonday >= startedOn
            ? ms.weeklyGoal({ mondayKey: lastMonday, expenses, noSpendDays, profile, today })
            : null;
        const thisMonthStartKey = appTime.localDateKey(appTime.startOfMonth(now));
        const prevMonthStartKey = appTime.localDateKey(appTime.startOfMonthsAgo(1, now));
        const lastMonth = startedOn < thisMonthStartKey
            ? { ...ms.monthGoal({ monthStartKey: prevMonthStartKey, expenses, noSpendDays, profile }), monthKey: prevMonthStartKey.slice(0, 7) }
            : null;

        const xpRows = new Map(s.ledger.map((l) => [`${l.reason}|${l.ref_key}`, l]));
        const havePoints = new Set(rewards.ready ? rewards.points.map((p) => `${p.reason}|${p.ref_key}`) : []);
        const earnedNow = [];
        const pointsNow = [];
        for (const award of ms.awardsDue({ endedDays: ended, completedRun: streak.completedRun, lastWeek, lastMonth })) {
            const key = `${award.reason}|${award.ref_key}`;
            let xpNew = false;
            if (!xpRows.has(key)) {
                const got = await grant(req.user.id, award);
                if (got) { earnedNow.push({ reason: award.reason, ref_key: award.ref_key, xp: award.xp, created_at: now.toISOString() }); xpNew = true; }
                xpRows.set(key, { created_at: now.toISOString() });
            }
            // Points are never paid for awards from before v1.14: only with a new
            // XP award, or to complete one recorded in the last 48 hours.
            const points = missions.pointsFor(award);
            if (rewards.ready && points > 0 && !havePoints.has(key)) {
                const recent = xpNew || now - new Date(xpRows.get(key).created_at) < POINTS_HEAL_MS;
                if (recent) {
                    const got = await grantPoints(req.user.id, { reason: award.reason, ref_key: award.ref_key, points });
                    if (got) pointsNow.push({ reason: award.reason, ref_key: award.ref_key, points, created_at: now.toISOString() });
                    havePoints.add(key);
                }
            }
        }

        const ledger = [...s.ledger, ...earnedNow];
        const totalXp = ledger.reduce((sum, l) => sum + (Number(l.xp) || 0), 0);
        const xpToday = ledger
            .filter((l) => l.created_at && appTime.localDateKey(new Date(l.created_at)) === today)
            .reduce((sum, l) => sum + (Number(l.xp) || 0), 0);

        const week = ms.weeklyGoal({ mondayKey: ms.weekStart(today), expenses, noSpendDays, profile, today });

        let points = null;
        if (rewards.ready) {
            const rows = [...rewards.points, ...pointsNow];
            const todays = rows.filter((p) => p.created_at && appTime.localDateKey(new Date(p.created_at)) === today && p.points > 0);
            const mission = presentMission(todayEval, s);
            points = {
                ...summarise(rows),
                today: todays.reduce((sum, p) => sum + p.points, 0),
                // Today's mission pays when the day ends; until then its Points are pending.
                pending: todayEval.assignment && todayEval.kept ? mission.reward.points : 0,
                earnedNow: pointsNow.map(({ reason, points: p }) => ({ reason, points: p })),
                note: 'Vittova Points are an in-app reward. They have no cash value.',
            };
        }

        res.json({
            success: true,
            moneyStreak: {
                current: streak.current,
                longest: streak.longest,
                startedOn,
                today: {
                    dateKey: today,
                    mission: presentMission(todayEval, s),
                    limit: todayEval.limit,
                    spent: todayEval.spent,
                    status: todayEval.status,
                    noSpendMarked: todayEval.noSpend,
                    canMarkNoSpend: todayEval.transactions === 0 && !todayEval.noSpend,
                },
                week: ms.weekView(keptByDay, today, startedOn),
                weekly: { limit: week.limit, spent: week.spent, activeDays: week.activeDays, minActiveDays: week.minActiveDays, status: week.status },
                xp: { ...ms.levelFor(totalXp), today: xpToday, earnedNow: earnedNow.map(({ reason, xp }) => ({ reason, xp })) },
                points,
                missions: rewards.ready ? {
                    preference: rewards.preference,
                    difficulties: missions.DIFFICULTY_KEYS.map((k) => ({ key: k, label: missions.DIFFICULTIES[k].label, summary: missions.DIFFICULTIES[k].summary })),
                    maxReplacements: missions.MAX_REPLACEMENTS,
                } : null,
                rules: {
                    expenseLogged: ms.XP.expense_logged,
                    expenseLoggedDailyCap: ms.EXPENSE_XP_DAILY_CAP,
                    dailyMission: ms.XP.daily_mission,
                    weeklyGoal: ms.XP.weekly_goal,
                    monthWithinBudget: ms.XP.month_within_budget,
                    streakMilestone: ms.XP.streak_milestone,
                    streakMilestoneDays: ms.STREAK_MILESTONE_DAYS,
                    missionRewards: rewards.ready ? missions.MISSION_REWARD : null,
                    points: rewards.ready ? { weeklyGoal: missions.POINTS.weekly_goal, monthWithinBudget: missions.POINTS.month_within_budget, streakMilestone: missions.POINTS.streak_milestone } : null,
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
        // A queued tap from a day that has ended cannot count for today.
        const dateKey = req.body?.dateKey;
        if (dateKey !== undefined && (typeof dateKey !== 'string' || !DAY_KEY.test(dateKey) || dateKey !== today)) return dayEnded(res);

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
        if (isDuplicate(insertError)) return res.json({ success: true, alreadyDone: true, dateKey: today });
        if (insertError) throw insertError;
        res.status(201).json({ success: true, dateKey: today });
    } catch (error) {
        console.error('No-spend day error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't save that just now. Please try again." });
    }
});

// ─── v1.14: check-ins, replacement, difficulty ──────────────────────────────

const rewardsUnavailable = (res) => res.status(503).json({ success: false, code: 'REWARDS_UNAVAILABLE', message: 'Missions are updating. Please try again in a little while.' });

/** Today's assignment, judged, with everything a change needs. */
async function todayContext(userId, now) {
    const s = await loadState(userId, now);
    if (s.missingProfile || !s.rewards.ready) return { s, ready: false };
    const assignment = s.rewards.assignments.get(s.today) || null;
    const todayEval = evaluator(s)(s.today);
    return { s, ready: true, assignment, todayEval };
}

const checkinSchema = z.object({
    mission: z.enum(missions.CHECKIN_MISSIONS),
    eventId: z.string().uuid(),
    dateKey: z.string().regex(DAY_KEY).optional(),
}).strict();

router.post('/checkin', protect, userApiLimiter, async (req, res) => {
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { mission, eventId, dateKey } = parsed.data;
    try {
        const now = new Date();
        const ctx = await todayContext(req.user.id, now);
        if (!ctx.ready) return rewardsUnavailable(res);
        if (dateKey && dateKey !== ctx.s.today) return dayEnded(res);
        if (!ctx.assignment || ctx.assignment.mission !== mission) {
            return res.status(409).json({ success: false, code: 'NOT_TODAYS_MISSION', message: 'That isn\'t today\'s mission any more. Pull to refresh.' });
        }
        const { error } = await supabase.from('money_mission_checkins').insert({ user_id: req.user.id, day: ctx.s.today, mission, event_id: eventId });
        if (isDuplicate(error)) return res.json({ success: true, alreadyDone: true, dateKey: ctx.s.today });
        if (error) throw error;
        res.status(201).json({ success: true, dateKey: ctx.s.today, mission });
    } catch (error) {
        console.error('Mission check-in error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't save that just now. Please try again." });
    }
});

const replaceSchema = z.object({ dateKey: z.string().regex(DAY_KEY).optional() }).strict();

router.post('/mission/replace', protect, userApiLimiter, async (req, res) => {
    const parsed = replaceSchema.safeParse(req.body || {});
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const now = new Date();
        const ctx = await todayContext(req.user.id, now);
        if (!ctx.ready) return rewardsUnavailable(res);
        const { s, assignment, todayEval } = ctx;
        if (parsed.data.dateKey && parsed.data.dateKey !== s.today) return dayEnded(res);
        if (!assignment) return res.status(409).json({ success: false, code: 'NO_MISSION_YET', message: 'Open Money Streak first to get today\'s mission.' });
        if (todayEval.status === 'done' || todayEval.status === 'missed') {
            return res.status(409).json({ success: false, code: 'MISSION_SETTLED', message: todayEval.status === 'done' ? 'Today\'s mission is already done.' : 'This mission can\'t be swapped after it has been missed today. A new one comes tomorrow.' });
        }
        if (assignment.replacements >= missions.MAX_REPLACEMENTS) {
            return res.status(409).json({ success: false, code: 'REPLACE_LIMIT', message: `You can swap a mission ${missions.MAX_REPLACEMENTS} times a day.` });
        }

        const signals = signalsFor(s, todayEval.limit);
        const facts = missions.dayFacts({ dateKey: s.today, expenses: s.expenses, noSpendDays: s.noSpendDays, checkins: s.rewards.checkins, contributions: s.rewards.contributions });
        const next = missions.replacement({
            signals,
            difficulty: assignment.difficulty, // never harder than the day's difficulty
            exclude: [assignment.mission, ...assignment.previous],
            todayStatusOf: (m) => missions.judge(m, facts).status,
        });
        if (!next) return res.status(409).json({ success: false, code: 'NO_ALTERNATIVE', message: 'There\'s no other mission that fits today. This one stays.' });

        // Compare-and-set on the replacement count: two taps at once swap once.
        const { data, error } = await supabase.from('money_daily_missions')
            .update({ mission: next.mission, difficulty: next.difficulty, params: next.params, reason: next.reason, source: 'replacement', replacements: assignment.replacements + 1, previous: [...assignment.previous, assignment.mission].slice(-2) })
            .eq('user_id', req.user.id).eq('day', s.today).eq('replacements', assignment.replacements)
            .select('mission, replacements');
        if (error) throw error;
        if (!data || !data.length) return res.status(409).json({ success: false, code: 'MISSION_CHANGED', message: 'Your mission just changed on another device. Pull to refresh.' });
        res.json({ success: true, mission: next.mission, replacementsLeft: missions.MAX_REPLACEMENTS - data[0].replacements });
    } catch (error) {
        console.error('Mission replace error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't swap your mission just now. Please try again." });
    }
});

const prefSchema = z.object({ difficulty: z.enum(missions.PREFERENCE_KEYS) }).strict();

router.put('/preferences', protect, userApiLimiter, async (req, res) => {
    const parsed = prefSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { difficulty } = parsed.data;
    try {
        const now = new Date();
        const ctx = await todayContext(req.user.id, now);
        if (!ctx.ready) return rewardsUnavailable(res);
        const { error } = await supabase.from('profiles').update({ mission_difficulty: difficulty }).eq('id', req.user.id);
        if (isMissing(error)) return rewardsUnavailable(res);
        if (error) throw error;

        // Today's spending mission can be made easier (never harder) if it is
        // still open. Missions tied to a bill or goal keep today's terms.
        let appliesToday = false;
        const { s, assignment, todayEval } = ctx;
        const order = missions.DIFFICULTY_KEYS;
        const easable = ['under_limit', 'no_impulse', 'delivery_cap'];
        if (assignment && easable.includes(assignment.mission) && order.includes(difficulty) && order.indexOf(difficulty) < order.indexOf(assignment.difficulty)
            && todayEval.status !== 'done' && todayEval.status !== 'missed') {
            const level = missions.levelFor(assignment.mission, difficulty);
            if (level && level !== assignment.difficulty) {
                const signals = signalsFor(s, todayEval.limit);
                const params = missions.paramsFor(assignment.mission, level, signals);
                const upd = await supabase.from('money_daily_missions').update({ difficulty: level, params })
                    .eq('user_id', req.user.id).eq('day', s.today).eq('difficulty', assignment.difficulty);
                if (upd.error) throw upd.error;
                appliesToday = true;
            }
        }
        res.json({ success: true, difficulty, appliesFrom: appliesToday ? 'today' : 'tomorrow' });
    } catch (error) {
        console.error('Mission preference error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'STREAK_UNAVAILABLE', message: "We couldn't save that just now. Please try again." });
    }
});

module.exports = router;
