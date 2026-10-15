/**
 * missions — personalised daily missions (v1.14).
 *
 * Which mission a user gets today, at what difficulty and why; what it asks
 * for; whether it was kept; and what it pays. Pure: rows and dates in,
 * results out. The route (routes/moneyStreak.js) stores the choice once per
 * day in money_daily_missions, so a mission's terms never change under the
 * user, and judges finished days from the user's own records.
 *
 * RULES THE ENGINE KEEPS
 *  - Deterministic: the same records on the same day give the same mission.
 *  - Every mission is about logging honestly, spending less on things the
 *    user chose to cut, preparing for bills or putting money aside. None asks
 *    the user to buy, borrow, invest or skip essentials. Rent and recharges
 *    never count towards a spending target.
 *  - Difficulty is never about income or wealth: targets come from the
 *    user's own Safe-to-Spend, habits and goals, and a harder level only
 *    tightens the user's own numbers.
 *  - When this month's Safe-to-Spend is used up, missions are Easy and never
 *    ask for a no-spend day.
 *  - Verified missions are judged from logged expenses. Self-reported ones
 *    ("I set the money aside") pay less, and are labelled as self-reported.
 */

const appTime = require('./appTime');
const ms = require('./moneyStreak');
const { FOOD_DELIVERY } = require('./challengeRules');

const IMPULSE_CATEGORIES = new Set(['Shopping', 'Entertainment']);
/** Never counted towards a spending target: missions must not push anyone to skip these. */
const ESSENTIAL_CATEGORIES = new Set(['Rent', 'Recharge']);

const DIFFICULTY_KEYS = ['easy', 'balanced', 'advanced'];
const PREFERENCE_KEYS = ['auto', ...DIFFICULTY_KEYS];

/** The one place difficulty levels are defined. */
const DIFFICULTIES = {
    easy: {
        label: 'Easy',
        summary: 'Small everyday steps: log your spending and stay within today\'s Safe-to-Spend.',
        limitShare: 1.0,
        impulseAllowance: 300,
    },
    balanced: {
        label: 'Balanced',
        summary: 'A steady stretch from your own habits: 90% of today\'s Safe-to-Spend, no impulse buys.',
        limitShare: 0.9,
        impulseAllowance: 0,
    },
    advanced: {
        label: 'Advanced',
        summary: 'Tighter targets from your own numbers: 80% of today\'s Safe-to-Spend, no food delivery. Never asks you to skip essentials.',
        limitShare: 0.8,
        impulseAllowance: 0,
    },
};

/**
 * Every mission kind. `levels` are the difficulties it comes in; `checkin` means
 * the user confirms it in the app (self-reported).
 */
const CATALOG = {
    log_today: { kind: 'verified', levels: ['easy'] },
    under_limit: { kind: 'verified', levels: ['easy', 'balanced', 'advanced'] },
    no_impulse: { kind: 'verified', levels: ['easy', 'balanced', 'advanced'] },
    delivery_cap: { kind: 'verified', levels: ['easy', 'balanced', 'advanced'] },
    no_spend: { kind: 'verified', levels: ['advanced'] },
    bill_ready: { kind: 'self_reported', levels: ['easy'], checkin: true },
    goal_step: { kind: 'self_reported', levels: ['easy', 'balanced', 'advanced'] },
    review_recurring: { kind: 'self_reported', levels: ['easy'], checkin: true },
};
const MISSION_KEYS = Object.keys(CATALOG);
const CHECKIN_MISSIONS = MISSION_KEYS.filter((k) => CATALOG[k].checkin);

/** Rewards for a kept mission. Verified missions pay more than self-reported ones. */
const MISSION_REWARD = {
    easy: { xp: 20, points: 5 },
    balanced: { xp: 25, points: 8 },
    advanced: { xp: 30, points: 12 },
    self_reported: { xp: 10, points: 3 },
};

/** Vittova Points for the other awards (the XP for them is in lib/moneyStreak). */
const POINTS = {
    weekly_goal: 15,
    month_within_budget: 20,
    streak_milestone: 25,
    /** challenge_completed: a fifth of the challenge's XP (50 → 10, 75 → 15, 100 → 20). */
    challengeShare: 0.2,
};

const MAX_REPLACEMENTS = 2;
const NEW_USER_LOGGED_DAYS = 3;

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const round10 = (n) => Math.round((Number(n) || 0) / 10) * 10;
const sum = (rows) => Math.round(rows.reduce((s, e) => s + (Number(e.amount) || 0), 0));
const isDelivery = (e) => FOOD_DELIVERY.test(String(e.description || ''));
const keyOf = (iso) => appTime.localDateKey(new Date(iso));

// ─── Difficulty ─────────────────────────────────────────────────────────────

/** The highest level of `mission` that is not harder than `difficulty`, or null. */
function levelFor(mission, difficulty) {
    const levels = CATALOG[mission]?.levels || [];
    const max = DIFFICULTY_KEYS.indexOf(difficulty);
    for (let i = max; i >= 0; i--) if (levels.includes(DIFFICULTY_KEYS[i])) return DIFFICULTY_KEYS[i];
    return null;
}

/**
 * Today's difficulty. A user's choice is used as it is; 'auto' adapts to how
 * the last week of missions went, one step at a time. A month whose
 * Safe-to-Spend is used up is always Easy.
 *
 * @param {object} a
 * @param {string} a.preference   'auto' | 'easy' | 'balanced' | 'advanced'
 * @param {Array}  a.history      ended assigned days, newest first: { difficulty, kept }
 * @param {boolean} a.stretched   this month's Safe-to-Spend is used up
 */
function resolveDifficulty({ preference = 'auto', history = [], stretched = false }) {
    if (stretched) return { difficulty: 'easy', why: 'tight_month' };
    if (DIFFICULTY_KEYS.includes(preference)) return { difficulty: preference, why: 'chosen' };
    const recent = history.slice(0, 7);
    if (recent.length < 5) return { difficulty: 'easy', why: 'getting_started' };
    const last = DIFFICULTY_KEYS.includes(recent[0].difficulty) ? recent[0].difficulty : 'easy';
    const rate = recent.filter((d) => d.kept).length / recent.length;
    const i = DIFFICULTY_KEYS.indexOf(last);
    if (rate >= 0.8 && i < 2) return { difficulty: DIFFICULTY_KEYS[i + 1], why: 'stepped_up' };
    if (rate < 0.4 && i > 0) return { difficulty: DIFFICULTY_KEYS[i - 1], why: 'stepped_down' };
    return { difficulty: last, why: 'steady' };
}

// ─── Signals: what the user's own records say ───────────────────────────────

function billDueWithin(bills, today, days) {
    const due = [];
    for (let k = 0; k <= days; k++) {
        const key = ms.addDays(today, k);
        const dom = Number(key.slice(8, 10));
        const dim = appTime.daysInMonth(new Date(ms.dayStart(key).getTime() + 12 * 3600 * 1000));
        for (const b of bills || []) {
            if (!b || b.is_active === false || !(Number(b.amount) > 0)) continue;
            const dueDay = Math.min(Number(b.due_day) || 0, dim);
            if (dueDay === dom && !due.some((d) => d.name === b.name)) due.push({ name: String(b.name || 'A bill').slice(0, 40), amount: Math.round(Number(b.amount)), dueOn: key, inDays: k });
        }
    }
    return due.sort((a, b) => a.inDays - b.inDays || b.amount - a.amount);
}

/** Saved so far, from self-reported contributions. */
function goalSaved(goal, contributions) {
    return contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);
}

/** A suggested daily amount to reach the goal on time (whole rupees). */
function dailyStep(goal, saved, today) {
    const remaining = Math.max(0, Number(goal.target_inr) - saved);
    const daysLeft = Math.max(1, ms.daysBetween(today, String(goal.target_date).slice(0, 10)));
    return Math.ceil(remaining / daysLeft);
}

/**
 * Everything the engine looks at, from days before today only (today's own
 * spending never changes which mission today is).
 */
function buildSignals({ today, expenses = [], noSpendDays = new Set(), bills = [], goals = [], contributions = [], checkins = [], dailyLimit = 0 }) {
    const before = (n) => ms.dayStart(ms.addDays(today, -n)).getTime();
    const todayStart = ms.dayStart(today).getTime();
    const within = (fromDaysAgo, toDaysAgo) => expenses.filter((e) => {
        const x = new Date(e.occurred_at).getTime();
        return x >= before(fromDaysAgo) && x < (toDaysAgo === 0 ? todayStart : before(toDaysAgo));
    });
    const last7 = within(7, 0);
    const prev7 = within(14, 7);
    const last14 = within(14, 0);
    const last28 = within(28, 0);

    const loggedKeys = (rows, n) => {
        const keys = new Set(rows.map((e) => keyOf(e.occurred_at)));
        for (let i = 1; i <= n; i++) if (noSpendDays.has(ms.addDays(today, -i))) keys.add(ms.addDays(today, -i));
        return keys.size;
    };

    const delivery14 = last14.filter(isDelivery);
    const lastReview = checkins.filter((c) => c.mission === 'review_recurring').map((c) => String(c.day).slice(0, 10)).sort().pop() || null;

    const activeGoals = goals.filter((g) => g.status === 'active').map((g) => {
        const saved = goalSaved(g, contributions);
        const lastAdded = contributions.filter((c) => c.goal_id === g.id).map((c) => String(c.contributed_on).slice(0, 10)).sort().pop() || null;
        const createdKey = keyOf(g.created_at);
        const totalDays = Math.max(1, ms.daysBetween(createdKey, String(g.target_date).slice(0, 10)));
        const elapsed = Math.min(totalDays, Math.max(0, ms.daysBetween(createdKey, today)));
        const behind = Math.round((Number(g.target_inr) * elapsed) / totalDays - saved);
        return { id: g.id, name: String(g.name).slice(0, 40), saved, target: Number(g.target_inr), remaining: Math.max(0, Number(g.target_inr) - saved), lastAdded, createdKey, behind, step: dailyStep(g, saved, today) };
    }).filter((g) => g.remaining > 0);

    const staleGoal = activeGoals
        .filter((g) => g.createdKey < today && (!g.lastAdded || ms.daysBetween(g.lastAdded, today) >= 7))
        .sort((a, b) => b.behind - a.behind)[0] || null;

    return {
        today,
        dailyLimit: Math.max(0, Math.round(Number(dailyLimit) || 0)),
        stretched: !(Number(dailyLimit) > 0),
        loggedDays7: loggedKeys(last7, 7),
        loggedDays28: loggedKeys(last28, 28),
        delivery: {
            orders14: delivery14.length,
            spend14: sum(delivery14),
            avgOrder: delivery14.length ? Math.round(sum(delivery14) / delivery14.length) : 0,
            last7: sum(last7.filter(isDelivery)),
            prev7: sum(prev7.filter(isDelivery)),
            share14: sum(last14) > 0 ? sum(delivery14) / sum(last14) : 0,
        },
        impulse: {
            last7: sum(last7.filter((e) => IMPULSE_CATEGORIES.has(e.category))),
            prev7: sum(prev7.filter((e) => IMPULSE_CATEGORIES.has(e.category))),
        },
        billsSoon: billDueWithin(bills, today, 2),
        recurringActive: (bills || []).filter((b) => b && b.is_active !== false).length,
        daysSinceReview: lastReview ? ms.daysBetween(lastReview, today) : null,
        staleGoal,
    };
}

// ─── Candidates ─────────────────────────────────────────────────────────────

const when = (inDays, dueOn) => (inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `on ${new Date(ms.dayStart(dueOn).getTime() + 12 * 3600 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`);

/** Mission parameters at a difficulty, fixed when the mission is given. */
function paramsFor(mission, difficulty, s) {
    const d = DIFFICULTIES[difficulty];
    switch (mission) {
        case 'under_limit':
            return { limit: Math.max(0, round10(s.dailyLimit * d.limitShare)), share: d.limitShare };
        case 'no_impulse':
            return { allowance: d.impulseAllowance, noDelivery: difficulty === 'advanced' };
        case 'delivery_cap': {
            const avg = s.delivery.avgOrder;
            if (difficulty === 'advanced') return { cap: 0 };
            if (difficulty === 'balanced') return { cap: Math.max(100, round10(avg * 0.6)) };
            return { cap: Math.max(150, round10(avg)) };
        }
        case 'bill_ready': {
            const b = s.billsSoon[0];
            return { bill: b.name, amount: b.amount, dueOn: b.dueOn, inDays: b.inDays };
        }
        case 'goal_step': {
            const g = s.staleGoal;
            const base = Math.max(20, g.step);
            const step = difficulty === 'advanced' ? Math.max(100, round10(base * 2))
                : difficulty === 'balanced' ? Math.max(50, round10(base))
                    : Math.min(100, Math.max(20, round10(base)));
            return { goalId: g.id, goal: g.name, step: Math.min(step, g.remaining) };
        }
        case 'review_recurring':
            return { count: s.recurringActive };
        default:
            return {};
    }
}

/**
 * Every mission that fits the user today, most useful first, each with the
 * reason it was picked. The first is today's mission; the rest are what a
 * replacement can offer.
 */
function candidates(s, difficulty) {
    const out = [];
    const add = (mission, reason) => {
        const level = levelFor(mission, difficulty);
        if (!level || out.some((c) => c.mission === mission)) return;
        out.push({ mission, difficulty: level, reason: reason.slice(0, 200) });
    };

    const isNew = s.loggedDays28 < NEW_USER_LOGGED_DAYS;
    if (isNew) add('log_today', 'You\'re just getting started. Logging each day makes your Safe-to-Spend accurate.');
    if (s.billsSoon.length) {
        const b = s.billsSoon[0];
        add('bill_ready', `${b.name} (${inr(b.amount)}) is due ${when(b.inDays, b.dueOn)}.`);
    }
    if (!isNew && s.loggedDays7 < 4) add('log_today', `You logged spending on ${s.loggedDays7} of the last 7 days.`);
    if (s.stretched) add('log_today', 'This month\'s Safe-to-Spend is used up. Logging keeps the rest of the month accurate.');

    const dl = s.delivery;
    if (dl.orders14 >= 3 && (dl.last7 > dl.prev7 * 1.2 || dl.share14 >= 0.25)) {
        add('delivery_cap', `${dl.orders14} food-delivery orders in the last 2 weeks (${inr(dl.spend14)}).`);
    }
    const im = s.impulse;
    if (im.last7 >= 500 && im.last7 > im.prev7 * 1.2) {
        add('no_impulse', `Shopping and Entertainment went from ${inr(im.prev7)} to ${inr(im.last7)} in the last week.`);
    }
    if (s.staleGoal) {
        const g = s.staleGoal;
        add('goal_step', g.lastAdded ? `Nothing added to "${g.name}" for ${ms.daysBetween(g.lastAdded, s.today)} days.` : `"${g.name}" has nothing in it yet.`);
    }
    if (!s.stretched) add('under_limit', `Your Safe-to-Spend today is ${inr(s.dailyLimit)}.`);
    if (s.recurringActive >= 2 && (s.daysSinceReview === null || s.daysSinceReview >= 30)) {
        add('review_recurring', `You have ${s.recurringActive} recurring payments. A quick look catches ones you no longer use.`);
    }
    // Alternatives for a replacement.
    if (!s.stretched && dl.orders14 >= 1) add('delivery_cap', `You ordered food delivery ${dl.orders14} time${dl.orders14 === 1 ? '' : 's'} in the last 2 weeks.`);
    if (!s.stretched) add('no_impulse', 'Unplanned buys are the easiest spending to skip.');
    add('log_today', 'Logging every day keeps your numbers honest.');
    if (!s.stretched && s.loggedDays7 >= 4 && !s.billsSoon.some((b) => b.inDays === 0)) add('no_spend', 'You\'ve been logging steadily. A no-spend day is a strong reset.');
    return out;
}

/**
 * Today's mission.
 *
 * @param {object} a
 * @param {object} a.signals      from buildSignals
 * @param {string} a.difficulty   from resolveDifficulty
 * @param {Array}  a.recent       the last two days' missions, newest first (avoid three in a row)
 */
function choose({ signals, difficulty, recent = [] }) {
    const list = candidates(signals, difficulty);
    const repeated = recent.length >= 2 && recent[0] === recent[1] ? recent[0] : null;
    const pick = list.find((c) => c.mission !== repeated) || list[0];
    const isNew = signals.loggedDays28 < NEW_USER_LOGGED_DAYS;
    return {
        mission: pick.mission,
        difficulty: pick.difficulty,
        params: paramsFor(pick.mission, pick.difficulty, signals),
        reason: pick.reason,
        source: isNew ? 'fallback' : 'personalised',
    };
}

/**
 * A replacement for today's mission: the next candidate that is not the
 * current or an earlier one today, is not already finished (nothing to do) or
 * already broken today, and is no harder than today's difficulty.
 */
function replacement({ signals, difficulty, exclude = [], todayStatusOf }) {
    for (const c of candidates(signals, difficulty)) {
        if (exclude.includes(c.mission)) continue;
        const params = paramsFor(c.mission, c.difficulty, signals);
        const status = todayStatusOf ? todayStatusOf({ mission: c.mission, params }) : 'to_do';
        if (status === 'missed' || status === 'done') continue;
        return { mission: c.mission, difficulty: c.difficulty, params, reason: c.reason, source: 'replacement' };
    }
    return null;
}

// ─── Judging a day ──────────────────────────────────────────────────────────

/** One calendar day's facts from the user's rows. */
function dayFacts({ dateKey, expenses = [], noSpendDays = new Set(), checkins = [], contributions = [] }) {
    const start = ms.dayStart(dateKey).getTime();
    const end = ms.dayStart(ms.addDays(dateKey, 1)).getTime();
    const rows = expenses.filter((e) => { const x = new Date(e.occurred_at).getTime(); return x >= start && x < end; });
    const noSpend = noSpendDays.has(dateKey) && rows.length === 0;
    return {
        dateKey,
        transactions: rows.length,
        spent: sum(rows),
        countable: sum(rows.filter((e) => !ESSENTIAL_CATEGORIES.has(e.category))),
        delivery: sum(rows.filter(isDelivery)),
        impulse: sum(rows.filter((e) => IMPULSE_CATEGORIES.has(e.category))),
        noSpend,
        active: rows.length > 0 || noSpend,
        checkins: new Set(checkins.filter((c) => String(c.day).slice(0, 10) === dateKey).map((c) => c.mission)),
        added: (goalId) => contributions
            .filter((c) => c.goal_id === goalId && String(c.contributed_on).slice(0, 10) === dateKey && keyOf(c.created_at) === dateKey)
            .reduce((s, c) => s + (Number(c.amount_inr) || 0), 0),
    };
}

/**
 * Whether an assigned mission was kept, and how it looks while the day runs.
 * status: 'done' (finished), 'on_track' (kept so far; counts when the day
 * ends), 'to_do' (nothing yet) or 'missed' (broken today).
 */
function judge({ mission, params = {} }, f) {
    const spendRule = (broken) => {
        const kept = f.active && !broken;
        return { kept, status: broken ? 'missed' : f.active ? 'on_track' : 'to_do' };
    };
    switch (mission) {
        case 'log_today':
            return { kept: f.active, status: f.active ? 'done' : 'to_do', progress: null };
        case 'no_spend':
            return { kept: f.noSpend, status: f.noSpend ? 'done' : f.transactions ? 'missed' : 'to_do', progress: null };
        case 'under_limit':
            return { ...spendRule(f.countable > Number(params.limit || 0)), progress: { current: f.countable, target: Number(params.limit || 0), unit: 'inr' } };
        case 'no_impulse':
            return { ...spendRule(f.impulse > Number(params.allowance || 0) || (params.noDelivery && f.delivery > 0)), progress: { current: f.impulse, target: Number(params.allowance || 0), unit: 'inr' } };
        case 'delivery_cap':
            return { ...spendRule(f.delivery > Number(params.cap || 0)), progress: { current: f.delivery, target: Number(params.cap || 0), unit: 'inr' } };
        case 'bill_ready':
        case 'review_recurring': {
            const done = f.checkins.has(mission);
            return { kept: done, status: done ? 'done' : 'to_do', progress: null };
        }
        case 'goal_step': {
            const added = f.added(params.goalId);
            const step = Number(params.step || 0);
            const done = step > 0 && added >= step;
            return { kept: done, status: done ? 'done' : 'to_do', progress: { current: added, target: step, unit: 'inr' } };
        }
        default:
            return { kept: false, status: 'to_do', progress: null };
    }
}

// ─── Rewards ────────────────────────────────────────────────────────────────

function rewardFor(mission, difficulty) {
    if (CATALOG[mission]?.kind === 'self_reported') return { ...MISSION_REWARD.self_reported };
    return { ...(MISSION_REWARD[difficulty] || MISSION_REWARD.easy) };
}

/** Points that go with an XP award (0 when the award earns none). */
function pointsFor(award) {
    if (award.reason === 'daily_mission') return Number(award.points) || 0;
    if (award.reason === 'challenge_completed') return Math.round((Number(award.xp) || 0) * POINTS.challengeShare);
    return POINTS[award.reason] || 0;
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** Title, detail and the exact rule, for the app and for notifications. */
function describe({ mission, difficulty, params = {} }) {
    const p = params;
    switch (mission) {
        case 'log_today':
            return { title: "Log today's spending", detail: 'Add at least one expense today, or mark today as a no-spend day.', criteria: ['At least one expense logged for today, or today marked as a no-spend day'] };
        case 'under_limit': {
            const share = Number(p.share) || 1;
            const of = share >= 1 ? "today's full Safe-to-Spend" : `${Math.round(share * 100)}% of today's Safe-to-Spend`;
            return { title: `Stay under ${inr(p.limit)} today`, detail: `That's ${of}. Rent and recharges don't count. Log what you spend so it counts.`, criteria: [`Spending logged today (not counting rent and recharges) stays at or under ${inr(p.limit)}`, 'At least one expense logged, or today marked as a no-spend day'] };
        }
        case 'no_impulse':
            if (p.noDelivery) return { title: 'No impulse buys or delivery today', detail: 'No Shopping, Entertainment or food-delivery orders today. Groceries and essentials are fine.', criteria: ['No Shopping or Entertainment logged today', 'No food-delivery order logged today', 'At least one expense logged, or today marked as a no-spend day'] };
            if (Number(p.allowance) > 0) return { title: `Keep impulse buys under ${inr(p.allowance)}`, detail: `Shopping and Entertainment together stay under ${inr(p.allowance)} today. Log what you spend so it counts.`, criteria: [`Shopping and Entertainment logged today total ${inr(p.allowance)} or less`, 'At least one expense logged, or today marked as a no-spend day'] };
            return { title: 'Skip unplanned spending today', detail: 'No Shopping or Entertainment today. Log what you do spend so it counts.', criteria: ['No Shopping or Entertainment logged today', 'At least one expense logged, or today marked as a no-spend day'] };
        case 'delivery_cap':
            if (!(Number(p.cap) > 0)) return { title: 'No food delivery today', detail: 'Cook, eat in the mess or pick up instead. Groceries are fine.', criteria: ['No food-delivery order (Swiggy, Zomato and similar) logged today', 'At least one expense logged, or today marked as a no-spend day'] };
            return { title: `Keep food delivery under ${inr(p.cap)}`, detail: `About ${difficulty === 'easy' ? 'one usual order' : 'a smaller order than usual'} at most. Groceries don't count.`, criteria: [`Food-delivery orders logged today total ${inr(p.cap)} or less`, 'At least one expense logged, or today marked as a no-spend day'] };
        case 'no_spend':
            return { title: 'Make today a no-spend day', detail: 'Spend nothing today and mark it as a no-spend day. If you need essentials today, swap this mission.', criteria: ['Nothing logged for today', 'Today marked as a no-spend day'] };
        case 'bill_ready':
            return { title: `Set aside ${inr(p.amount)} for ${p.bill}`, detail: `${p.bill} is due ${when(Number(p.inDays) || 0, p.dueOn || '')}. Put the money aside (or check it's in your account), then tap Done.`, criteria: ['You confirm the money is ready (self-reported)'] };
        case 'goal_step':
            return { title: `Put ${inr(p.step)} towards ${p.goal}`, detail: 'Move the money first, then add it to your goal. Vittova can\'t see your bank, so this is self-reported.', criteria: [`${inr(p.step)} or more added to "${p.goal}" today (self-reported)`] };
        case 'review_recurring':
            return { title: 'Review your recurring payments', detail: `Look through your ${Number(p.count) || 'recurring'} recurring payments and cancel anything you no longer use. Tap Done when you've looked.`, criteria: ['You confirm you reviewed them (self-reported)'] };
        default:
            return { title: 'Today\'s mission', detail: '', criteria: [] };
    }
}

/** Where the app takes the user to work on a mission. */
function actionFor(mission) {
    switch (mission) {
        case 'goal_step': return { label: 'Add to goal', route: '/goals' };
        case 'review_recurring': return { label: 'Open recurring charges', route: '/graveyard' };
        case 'no_spend': return null;
        case 'bill_ready': return null;
        default: return { label: 'Log an expense', route: '/dash?add=1' };
    }
}

module.exports = {
    DIFFICULTIES, DIFFICULTY_KEYS, PREFERENCE_KEYS, CATALOG, MISSION_KEYS, CHECKIN_MISSIONS,
    MISSION_REWARD, POINTS, MAX_REPLACEMENTS, ESSENTIAL_CATEGORIES, IMPULSE_CATEGORIES,
    levelFor, resolveDifficulty, buildSignals, candidates, choose, replacement, paramsFor,
    dayFacts, judge, rewardFor, pointsFor, describe, actionFor, goalSaved, dailyStep, isDelivery,
};
