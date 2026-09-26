const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag, flag } = require('../lib/featureFlags');
const { validationError } = require('../lib/validation');
const { hasActivePro } = require('../lib/entitlements');
const { loadFinanceData, ProfileMissingError } = require('../lib/financeData');
const { buildFacts } = require('../lib/financialInsights');
const { grant } = require('../lib/moneyXp');
const { recordServerEvent } = require('../lib/appEvents');
const ms = require('../lib/moneyStreak');
const s2e = require('../lib/saveToEarn');
const appTime = require('../lib/appTime');

/**
 * Save-to-Earn (v1.1): personal Money Challenges, Victory Pot, badges.
 * Free for everyone (basic challenges); Pro unlocks more challenges and the
 * full history. Behind SAVE_TO_EARN_ENABLED (default on).
 *
 *   GET  /api/save-to-earn                          the hub (judges the active challenge first)
 *   POST /api/save-to-earn/challenges               start a challenge  { template }
 *   POST /api/save-to-earn/challenges/:id/skip      stop the active challenge (no penalty)
 *
 * Nothing here accepts XP, progress, completion, impact or rewards from the
 * client. The server judges from the user's own records, once, with a
 * compare-and-set on status = 'active'; XP is paid through the unique ledger.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FREE_HISTORY = 5;
const PRO_HISTORY = 50;
const gates = [protect, userApiLimiter, requireFlag('saveToEarnEnabled')];

const unavailable = (res) => res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: "We couldn't load Save-to-Earn just now. Your progress is safe. Try again in a moment." });
const profileMissing = (res) => res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: "We couldn't find your Vittova profile. Close and reopen the app to finish setting up your account." });

async function loadState(userId, now) {
    const [finance, proRes, noSpendRes, challengesRes, badgesRes, ledgerRes, daysRes] = await Promise.all([
        loadFinanceData(userId, now),
        supabase.from('profiles').select('is_pro, pro_expires_at, money_streak_started_on').eq('id', userId).maybeSingle(),
        supabase.from('streak_activities').select('activity_date').eq('user_id', userId).eq('activity', 'no_spend_day')
            .gte('activity_date', appTime.localDateKey(appTime.startOfMonthsAgo(4, now))),
        supabase.from('money_challenges').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(PRO_HISTORY + 1),
        supabase.from('user_badges').select('badge, earned_at').eq('user_id', userId),
        supabase.from('money_xp_ledger').select('reason, xp').eq('user_id', userId),
        supabase.from('money_streak_days').select('day, kept').eq('user_id', userId),
    ]);
    for (const r of [proRes, noSpendRes, challengesRes, badgesRes, ledgerRes, daysRes]) if (r.error) throw r.error;
    return {
        ...finance,
        isPro: hasActivePro(proRes.data),
        startedOn: proRes.data?.money_streak_started_on ? String(proRes.data.money_streak_started_on).slice(0, 10) : null,
        noSpendDays: new Set((noSpendRes.data || []).map((r) => String(r.activity_date).slice(0, 10))),
        challenges: challengesRes.data || [],
        badges: badgesRes.data || [],
        ledger: ledgerRes.data || [],
        streakDays: daysRes.data || [],
    };
}

/** Judge the active challenge once it is decided. Returns the updated row (or the same). */
async function judgeActive(userId, row, state, now) {
    const result = s2e.evaluate({ templateKey: row.template, params: row.params || {}, enrolledAt: row.enrolled_at, expenses: state.expenses, noSpendDays: state.noSpendDays, now });
    if (result.status !== 'completed' && result.status !== 'failed') return { row, progress: result };
    const patch = { status: result.status === 'completed' ? 'completed' : 'not_completed', judged_at: now.toISOString(), result_reason: result.reason ? String(result.reason).slice(0, 200) : null };
    if (result.status === 'completed') {
        const est = s2e.estimateImpact(row.template, { expenses: state.expenses, startsOn: row.starts_on, endsOn: row.ends_on });
        Object.assign(patch, { baseline_inr: est.baseline, actual_inr: est.actual, impact_inr: est.impact });
    }
    // Compare-and-set: only the request that moves it out of 'active' wins.
    const { data, error } = await supabase.from('money_challenges').update(patch)
        .eq('id', row.id).eq('user_id', userId).eq('status', 'active').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return { row, progress: result };
    if (data.status === 'completed') {
        await grant(userId, { reason: 'challenge_completed', ref_key: data.id, xp: s2e.TEMPLATES[data.template].xp });
        recordServerEvent('challenge_completed', { userId, props: { code: data.template } }).catch(() => {});
    }
    return { row: data, progress: result };
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

function presentChallenge(row, progress) {
    const t = s2e.TEMPLATES[row.template];
    const { title, rule } = s2e.describe(row.template, row.params || {});
    const out = {
        id: row.id,
        template: row.template,
        title,
        rule,
        why: t.why,
        category: t.category,
        days: t.days,
        startsOn: String(row.starts_on).slice(0, 10),
        endsOn: String(row.ends_on).slice(0, 10),
        status: row.status,
        reward: { xp: t.xp },
        judgedAt: row.judged_at,
        note: row.result_reason || null,
    };
    if (row.status === 'completed') {
        out.estimate = row.impact_inr === null || row.impact_inr === undefined
            ? { impact: null, label: 'Not estimated', explained: t.impact ? 'Not estimated: it needs about four weeks of spending history to compare with.' : 'This challenge builds a habit; it has no spending estimate.' }
            : { impact: row.impact_inr, baseline: row.baseline_inr, actual: row.actual_inr, label: 'Estimated spending avoided',
                explained: `Usual ${t.days}-day spending here: ₹${Number(row.baseline_inr).toLocaleString('en-IN')}. This time: ₹${Number(row.actual_inr).toLocaleString('en-IN')}. The difference is an estimate, not cash.` };
    }
    if (progress) {
        out.progress = { day: progress.day, days: progress.days, activeDays: progress.activeDays, activeNeeded: progress.activeNeeded, judgeOn: progress.judgeOn, upcoming: progress.status === 'upcoming' };
    }
    return out;
}

router.get('/', ...gates, async (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    let state;
    try {
        state = await loadState(userId, now);
    } catch (e) {
        if (e instanceof ProfileMissingError) return profileMissing(res);
        return unavailable(res);
    }
    try {
        // 1. Judge the active challenge if its outcome is decided.
        let active = state.challenges.find((c) => c.status === 'active') || null;
        let activeProgress = null;
        if (active) {
            const judged = await judgeActive(userId, active, state, now);
            state.challenges = state.challenges.map((c) => (c.id === judged.row.id ? judged.row : c));
            if (judged.row.status === 'active') { active = judged.row; activeProgress = judged.progress; } else active = null;
        }

        // 2. Victory Pot, badges and XP from server-side facts.
        const completed = state.challenges.filter((c) => c.status === 'completed');
        const pot = s2e.victoryPot(completed, now);
        const ledgerReasons = new Set(state.ledger.map((l) => l.reason));
        const earned = s2e.earnedBadges({ completed, victoryPot: pot.total, longestStreak: longestRun(state.streakDays), ledgerReasons });
        const have = new Map(state.badges.map((b) => [b.badge, b.earned_at]));
        for (const badge of earned) {
            if (have.has(badge)) continue;
            const { error } = await supabase.from('user_badges').insert({ user_id: userId, badge });
            if (!error || error.code === '23505') {
                have.set(badge, now.toISOString());
                recordServerEvent('badge_unlocked', { userId, props: { code: badge } }).catch(() => {});
            }
        }
        const { data: ledgerNow } = await supabase.from('money_xp_ledger').select('xp').eq('user_id', userId);
        const totalXp = (ledgerNow || state.ledger).reduce((s, l) => s + (Number(l.xp) || 0), 0);

        // 3. What to offer next (only when nothing is active).
        const facts = buildFacts({ profile: state.profile, expenses: state.expenses, bills: state.bills, now });
        const dailyLimit = facts.safeToSpendPerDay;
        const proChallenges = flag('proChallengesEnabled');
        const templates = s2e.TEMPLATE_KEYS.filter((k) => proChallenges || !s2e.TEMPLATES[k].pro).map((k) => {
            const t = s2e.TEMPLATES[k];
            const params = s2e.paramsFor(k, { dailyLimit });
            const { title, rule } = s2e.describe(k, params);
            return { template: k, title, rule, why: t.why, days: t.days, category: t.category, pro: t.pro, locked: t.pro && !state.isPro, reward: { xp: t.xp } };
        });
        const rec = active ? null : s2e.recommend({ expenses: state.expenses, now, isPro: state.isPro });

        // A challenge finished in the last 3 days is shown once as a celebration / summary.
        const recent = state.challenges.find((c) => c.status !== 'active' && c.status !== 'skipped' && c.judged_at
            && now - new Date(c.judged_at) < 3 * 86400000) || null;

        const history = state.challenges.filter((c) => c.status !== 'active').slice(0, state.isPro ? PRO_HISTORY : FREE_HISTORY);

        res.json({
            success: true,
            saveToEarn: {
                isPro: state.isPro,
                level: ms.levelFor(totalXp),
                victoryPot: { ...pot, note: 'An estimate of spending avoided in completed challenges. Not cash, and not withdrawable.' },
                active: active ? presentChallenge(active, activeProgress) : null,
                justFinished: recent ? presentChallenge(recent, null) : null,
                recommendation: rec ? { ...rec, title: templates.find((t) => t.template === rec.template)?.title } : null,
                templates,
                badges: s2e.BADGE_KEYS.map((k) => ({ key: k, ...s2e.BADGES[k], earned: have.has(k), earnedAt: have.get(k) || null })),
                history: history.map((c) => presentChallenge(c, null)),
                historyLimited: !state.isPro && state.challenges.filter((c) => c.status !== 'active').length > FREE_HISTORY,
                sponsoredAvailable: flag('sponsoredChallengesEnabled'),
            },
        });
    } catch (e) {
        console.error('Save-to-Earn: hub failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

const startSchema = z.object({ template: z.enum(s2e.TEMPLATE_KEYS) }).strict();

router.post('/challenges', ...gates, async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const userId = req.user.id;
    const now = new Date();
    const key = parsed.data.template;
    if (s2e.TEMPLATES[key].pro && !flag('proChallengesEnabled')) {
        return res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'This challenge is not available.' });
    }
    try {
        const state = await loadState(userId, now);
        const activeCount = state.challenges.filter((c) => c.status === 'active').length;
        const ok = s2e.canStart(key, { isPro: state.isPro, expenses: state.expenses, now, activeCount });
        if (!ok.ok) {
            const status = ok.code === 'PRO_REQUIRED' ? 403 : ok.code === 'CHALLENGE_ACTIVE' ? 409 : 422;
            return res.status(status).json({ success: false, code: ok.code, message: ok.message });
        }
        const facts = buildFacts({ profile: state.profile, expenses: state.expenses, bills: state.bills, now });
        const params = s2e.paramsFor(key, { dailyLimit: facts.safeToSpendPerDay });
        const t = s2e.TEMPLATES[key];
        const enrolledAt = now.toISOString();
        const startsOn = ms.addDays(appTime.localDateKey(now), 1);
        const { data, error } = await supabase.from('money_challenges').insert({
            user_id: userId, template: key, params, duration_days: t.days, enrolled_at: enrolledAt,
            starts_on: startsOn, ends_on: ms.addDays(startsOn, t.days - 1), status: 'active',
        }).select('*').maybeSingle();
        if (error && error.code === '23505') return res.status(409).json({ success: false, code: 'CHALLENGE_ACTIVE', message: 'Finish or skip your current challenge first.' });
        if (error) throw error;
        recordServerEvent('challenge_started', { userId, props: { code: key } }).catch(() => {});
        res.status(201).json({ success: true, challenge: presentChallenge(data, s2e.evaluate({ templateKey: key, params, enrolledAt, expenses: state.expenses, noSpendDays: state.noSpendDays, now })) });
    } catch (e) {
        if (e instanceof ProfileMissingError) return profileMissing(res);
        console.error('Save-to-Earn: start failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

router.post('/challenges/:id/skip', ...gates, async (req, res) => {
    if (!UUID.test(String(req.params.id))) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Invalid id' });
    if (req.body && Object.keys(req.body).length) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'This request takes no body.' });
    try {
        const { data, error } = await supabase.from('money_challenges')
            .update({ status: 'skipped', judged_at: new Date().toISOString(), result_reason: 'Skipped. You can start another challenge any time.' })
            .eq('id', req.params.id).eq('user_id', req.user.id).eq('status', 'active').select('id').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No active challenge with that id.' });
        recordServerEvent('challenge_skipped', { userId: req.user.id }).catch(() => {});
        res.json({ success: true });
    } catch (e) {
        console.error('Save-to-Earn: skip failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

module.exports = router;
