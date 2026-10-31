const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag } = require('../lib/featureFlags');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');
const missions = require('../lib/missions');
const s2e = require('../lib/saveToEarn');
const recap = require('../lib/weeklyRecap');
const { summarise } = require('../lib/points');
const { loadRewards } = require('../lib/rewardsData');
const { recordBadges, badgeList } = require('../lib/achievements');

/**
 * Rewards (v1.14). Behind REWARDS_ENABLED (default on). Read-only: every
 * reward is paid where it is earned (Money Streak, goals, challenges).
 *
 *   GET /api/rewards                 level, XP, Points, mission rewards, achievements,
 *                                    the first page of reward history
 *   GET /api/rewards/history         more history  ?before=<ISO time>&limit=1..100
 *   GET /api/rewards/recap           the weekly recap  ?week=<Monday YYYY-MM-DD>
 *                                    (default: the last full week)
 *
 * Works before supabase/v1_14_rewards.sql is applied: Points are then null
 * and the history holds XP only.
 */

const gates = [protect, userApiLimiter, requireFlag('rewardsEnabled')];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 30;

const unavailable = (res) => res.status(503).json({ success: false, code: 'REWARDS_UNAVAILABLE', message: "We couldn't load your rewards just now. Nothing was lost. Try again in a moment." });

const fmtDay = (k) => new Date(ms.dayStart(k).getTime() + 12 * 3600 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const fmtMonth = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** XP and Points rows merged into one list of reward events, newest first. */
function historyEvents(xpRows, pointRows, { assignments = new Map(), goals = [], challenges = [] } = {}) {
    const events = new Map();
    const at = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
    const ev = (key, reason, ref) => {
        if (!events.has(key)) events.set(key, { id: key, reason, ref, xp: 0, points: 0, at: null, status: 'confirmed' });
        return events.get(key);
    };
    for (const r of xpRows) {
        // Expense XP is three small rows a day: shown as one entry per day.
        const ref = r.reason === 'expense_logged' ? String(r.ref_key).slice(0, 10) : r.ref_key;
        const e = ev(`${r.reason}|${ref}`, r.reason, ref);
        e.xp += Number(r.xp) || 0;
        e.at = at(e.at, r.created_at);
    }
    for (const p of pointRows) {
        if (p.reason === 'reversal') {
            const [reason, ...rest] = String(p.ref_key).split(':');
            const original = events.get(`${reason}|${rest.join(':')}`);
            if (original) original.status = 'reversed';
            const e = ev(`reversal|${p.ref_key}`, 'reversal', p.ref_key);
            e.points += Number(p.points) || 0;
            e.at = at(e.at, p.created_at);
            e.status = 'reversal';
            e.note = p.note || null;
            e.reverses = original ? original.id : null;
            continue;
        }
        const e = ev(`${p.reason}|${p.ref_key}`, p.reason, p.ref_key);
        e.points += Number(p.points) || 0;
        e.at = at(e.at, p.created_at);
        if (p.note) e.note = p.note;
    }
    const goalName = new Map(goals.map((g) => [g.id, g.name]));
    const challengeName = new Map(challenges.map((c) => [c.id, s2e.describe(c.template, c.params || {}).title]));
    for (const e of events.values()) Object.assign(e, describeEvent(e, { assignments, goalName, challengeName }));
    // Newest first; rewards paid in the same moment by what they were for, newest first.
    return [...events.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.ref).localeCompare(String(a.ref)));
}

function describeEvent(e, { assignments, goalName, challengeName }) {
    switch (e.reason) {
        case 'daily_mission': {
            const a = assignments.get(e.ref);
            return { title: 'Daily mission', detail: a ? `${fmtDay(e.ref)} · ${missions.describe(a).title} (${missions.DIFFICULTIES[a.difficulty]?.label || 'Easy'})` : fmtDay(e.ref) };
        }
        case 'expense_logged': return { title: 'Logged expenses', detail: fmtDay(e.ref) };
        case 'weekly_goal': return { title: 'Weekly goal', detail: `Week of ${fmtDay(e.ref)}` };
        case 'month_within_budget': return { title: 'Month within budget', detail: fmtMonth(e.ref) };
        case 'streak_milestone': return { title: `${String(e.ref).split(':')[1] || 7}-day streak`, detail: `Run started ${fmtDay(String(e.ref).split(':')[0])}` };
        case 'challenge_completed': return { title: 'Challenge completed', detail: challengeName.get(e.ref) || 'Money challenge' };
        case 'goal_milestone': {
            const [goalId, pct] = String(e.ref).split(':');
            return { title: Number(pct) === 0 ? 'Goal set' : `Goal ${pct}% reached`, detail: goalName.get(goalId) || 'Savings goal' };
        }
        case 'reversal': return { title: 'Points reversed', detail: e.note || 'A reward was corrected' };
        case 'adjustment': return { title: 'Points adjustment', detail: e.note || 'Adjusted by Vittova support' };
        case 'redemption': return { title: 'Points used', detail: e.note || '' };
        default: return { title: 'Reward', detail: '' };
    }
}

function longestRun(streakDays) {
    const kept = streakDays.filter((d) => d.kept === true).map((d) => String(d.day).slice(0, 10)).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of kept) {
        run = prev && ms.addDays(prev, 1) === k ? run + 1 : 1;
        best = Math.max(best, run);
        prev = k;
    }
    return best;
}

async function loadAll(userId, now, { allMissions = false } = {}) {
    const today = appTime.localDateKey(now);
    const [xpRes, daysRes, badgesRes, challengesRes] = await Promise.all([
        supabase.from('money_xp_ledger').select('reason, ref_key, xp, created_at').eq('user_id', userId),
        supabase.from('money_streak_days').select('day, kept, mission').eq('user_id', userId),
        supabase.from('user_badges').select('badge, earned_at').eq('user_id', userId),
        supabase.from('money_challenges').select('id, template, params, status, impact_inr, judged_at').eq('user_id', userId),
    ]);
    for (const r of [xpRes, daysRes, badgesRes, challengesRes]) if (r.error) throw r.error;
    const rewards = await loadRewards(userId, { today, allMissions });
    return {
        today,
        xp: xpRes.data || [],
        streakDays: daysRes.data || [],
        badges: badgesRes.data || [],
        challenges: challengesRes.data || [],
        rewards,
    };
}

router.get('/', ...gates, async (req, res) => {
    const now = new Date();
    try {
        const s = await loadAll(req.user.id, now);
        const { today, rewards } = s;
        const totalXp = s.xp.reduce((sum, l) => sum + (Number(l.xp) || 0), 0);
        const level = ms.levelFor(totalXp);

        // Badges from server-side facts (the same rules as Save-to-Earn, plus goals and levels).
        const completed = s.challenges.filter((c) => c.status === 'completed');
        const goalsRows = rewards.ready ? rewards.goals : [];
        const contributions = rewards.ready ? rewards.contributions : [];
        const have = await recordBadges(req.user.id, s2e.earnedBadges({
            completed,
            victoryPot: s2e.victoryPot(completed, now).total,
            longestStreak: longestRun(s.streakDays),
            ledgerReasons: new Set(s.xp.map((l) => l.reason)),
            goalsStarted: goalsRows.filter((g) => contributions.some((c) => c.goal_id === g.id)).length,
            goalsReached: goalsRows.filter((g) => g.status === 'completed' || g.completed_at).length,
            totalXp,
        }), s.badges, now);
        const achievements = badgeList(have);
        const recent = achievements.filter((b) => b.earned).sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)))[0] || null;

        // Mission rewards: the last 14 days with a personalised mission.
        const paid = new Set(s.xp.filter((l) => l.reason === 'daily_mission').map((l) => l.ref_key));
        const pointsPaid = new Set(rewards.ready ? rewards.points.filter((p) => p.reason === 'daily_mission').map((p) => p.ref_key) : []);
        const locked = new Map(s.streakDays.map((d) => [String(d.day).slice(0, 10), d.kept === true]));
        const missionDays = rewards.ready ? [...rewards.assignments.values()]
            .filter((a) => a.day >= ms.addDays(today, -13))
            .sort((a, b) => b.day.localeCompare(a.day))
            .map((a) => {
                const status = a.day === today ? 'active'
                    : paid.has(a.day) ? 'earned'
                        : locked.has(a.day) ? (locked.get(a.day) ? 'earned' : 'missed')
                            : 'pending'; // yesterday: judged after its grace day
                return {
                    day: a.day,
                    mission: a.mission,
                    title: missions.describe(a).title,
                    difficulty: a.difficulty,
                    difficultyLabel: missions.DIFFICULTIES[a.difficulty]?.label || 'Easy',
                    selfReported: missions.CATALOG[a.mission]?.kind === 'self_reported',
                    reward: missions.rewardFor(a.mission, a.difficulty),
                    status,
                    paid: { xp: paid.has(a.day), points: pointsPaid.has(a.day) },
                };
            }) : [];

        const events = historyEvents(s.xp, rewards.ready ? rewards.points : [], {
            assignments: rewards.ready ? rewards.assignments : new Map(),
            goals: goalsRows,
            challenges: s.challenges,
        });

        res.json({
            success: true,
            rewards: {
                level: {
                    ...level,
                    levels: ms.LEVELS.map((l) => ({ level: l.level, name: l.name, minXp: l.minXp, reached: totalXp >= l.minXp })),
                },
                xp: {
                    total: totalXp,
                    thisWeek: s.xp.filter((l) => l.created_at && appTime.localDateKey(new Date(l.created_at)) >= ms.weekStart(today)).reduce((sum, l) => sum + (Number(l.xp) || 0), 0),
                },
                points: rewards.ready ? { ...summarise(rewards.points), note: 'Vittova Points are an in-app reward. They have no cash value and can\'t be exchanged yet.' } : null,
                streak: { longest: longestRun(s.streakDays) },
                recentAchievement: recent,
                missions: {
                    days: missionDays,
                    kept: missionDays.filter((d) => d.status === 'earned').length,
                    missed: missionDays.filter((d) => d.status === 'missed').length,
                    rewards: missions.MISSION_REWARD,
                },
                challenges: {
                    active: s.challenges.filter((c) => c.status === 'active').map((c) => ({ id: c.id, title: s2e.describe(c.template, c.params || {}).title, reward: { xp: s2e.TEMPLATES[c.template]?.xp || 0, points: Math.round((s2e.TEMPLATES[c.template]?.xp || 0) * missions.POINTS.challengeShare) } })),
                    completed: completed.length,
                },
                achievements,
                history: { events: events.slice(0, PAGE), next: events.length > PAGE ? events[PAGE - 1].at : null },
                pointsAvailable: rewards.ready,
            },
        });
    } catch (e) {
        console.error('Rewards: load failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

router.get('/history', ...gates, async (req, res) => {
    const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before).toISOString() : null;
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || PAGE));
    try {
        const s = await loadAll(req.user.id, new Date(), { allMissions: true });
        const events = historyEvents(s.xp, s.rewards.ready ? s.rewards.points : [], {
            assignments: s.rewards.ready ? s.rewards.assignments : new Map(),
            goals: s.rewards.ready ? s.rewards.goals : [],
            challenges: s.challenges,
        });
        const page = (before ? events.filter((e) => String(e.at) < before) : events);
        res.json({ success: true, events: page.slice(0, limit), next: page.length > limit ? page[limit - 1].at : null });
    } catch (e) {
        console.error('Rewards: history failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

router.get('/recap', ...gates, async (req, res) => {
    const now = new Date();
    const today = appTime.localDateKey(now);
    const thisMonday = ms.weekStart(today);
    let weekStart = ms.addDays(thisMonday, -7);
    if (req.query.week === 'current') weekStart = thisMonday;
    else if (typeof req.query.week === 'string') {
        if (!DAY_KEY.test(req.query.week)) return res.status(400).json({ success: false, code: 'BAD_WEEK', message: 'Use the Monday of the week, like 2026-10-05.' });
        weekStart = ms.weekStart(req.query.week);
        if (weekStart > thisMonday) return res.status(400).json({ success: false, code: 'BAD_WEEK', message: 'That week hasn\'t started yet.' });
        if (weekStart < ms.addDays(thisMonday, -7 * 12)) return res.status(400).json({ success: false, code: 'BAD_WEEK', message: 'Recaps go back 12 weeks.' });
    }
    try {
        const userId = req.user.id;
        const from = ms.dayStart(ms.addDays(weekStart, -7));
        const to = ms.dayStart(ms.addDays(weekStart, 7));
        const monthFrom = appTime.startOfMonth(new Date(ms.dayStart(weekStart).getTime() + 12 * 3600 * 1000));
        const loadFrom = new Date(Math.min(from.getTime(), monthFrom.getTime()));
        const [profileRes, expensesRes, billsRes, noSpendRes] = await Promise.all([
            supabase.from('profiles').select('monthly_budget, investment_target, money_streak_started_on').eq('id', userId).maybeSingle(),
            supabase.from('expenses').select('amount, category, description, occurred_at').eq('user_id', userId)
                .gte('occurred_at', loadFrom.toISOString()).lt('occurred_at', to.toISOString()),
            supabase.from('recurring_bills').select('name, amount, due_day, is_active').eq('user_id', userId),
            supabase.from('streak_activities').select('activity_date').eq('user_id', userId).eq('activity', 'no_spend_day')
                .gte('activity_date', appTime.localDateKey(loadFrom)),
        ]);
        for (const r of [profileRes, expensesRes, billsRes, noSpendRes]) if (r.error) throw r.error;
        if (!profileRes.data) return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
        const s = await loadAll(userId, now, { allMissions: true });
        const totalXp = s.xp.reduce((sum, l) => sum + (Number(l.xp) || 0), 0);
        const startedOn = profileRes.data.money_streak_started_on ? String(profileRes.data.money_streak_started_on).slice(0, 10) : today;

        const result = recap.build({
            weekStart,
            today,
            startedOn,
            expenses: expensesRes.data || [],
            noSpendDays: new Set((noSpendRes.data || []).map((r) => String(r.activity_date).slice(0, 10))),
            profile: profileRes.data,
            bills: billsRes.data || [],
            streakDays: s.streakDays,
            assignments: s.rewards.ready ? s.rewards.assignments : new Map(),
            checkins: s.rewards.ready ? s.rewards.checkins : [],
            xpRows: s.xp,
            pointsRows: s.rewards.ready ? s.rewards.points : [],
            badges: s.badges,
            goals: s.rewards.ready ? s.rewards.goals : [],
            contributions: s.rewards.ready ? s.rewards.contributions : [],
            level: ms.levelFor(totalXp),
        });
        res.json({
            success: true,
            recap: {
                ...result,
                previousWeek: weekStart > ms.addDays(thisMonday, -7 * 12) ? ms.addDays(weekStart, -7) : null,
                nextWeek: weekStart < thisMonday ? ms.addDays(weekStart, 7) : null,
                pointsAvailable: s.rewards.ready,
            },
        });
    } catch (e) {
        console.error('Rewards: recap failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

module.exports = router;
module.exports.historyEvents = historyEvents;
