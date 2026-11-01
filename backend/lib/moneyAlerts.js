/**
 * moneyAlerts — what the phone may notify about, worked out from the user's own
 * rows. The phone chooses categories and schedules locally; no push service.
 *
 * Wording never includes a rupee amount or a payee, because notifications show
 * on a lock screen. Each id is stable for its period, so an alert fires once.
 */
const appTime = require('./appTime');

const HOUR = 3600 * 1000;
const paise = (n) => Math.round(Number(n || 0) * 100);
const WARN_AT = 80;

function buildAlerts({ now = new Date(), month, monthlyBudget, categoryBudgets, monthExpenses, recentExpenses, bills, goals }) {
    const soon = new Date(now.getTime() + 60 * 1000).toISOString();
    const alerts = [];
    const byCategory = new Map();
    let spent = 0;
    for (const e of monthExpenses) {
        spent += paise(e.amount);
        byCategory.set(e.category, (byCategory.get(e.category) || 0) + paise(e.amount));
    }

    const level = (used, limit) => (used >= limit ? 100 : used * 100 >= limit * WARN_AT ? WARN_AT : 0);
    const budgetAlert = (key, name, used, limit) => {
        const reached = level(used, limit);
        if (!reached) return;
        alerts.push({
            id: `budget:${key}:${month}:${reached}`, kind: 'budget', notifyAt: soon,
            title: reached === 100 ? `${name} budget used up` : `${name} budget ${WARN_AT}% used`,
            body: 'Open Vittova to see where this month stands.',
        });
    };
    if (monthlyBudget > 0) budgetAlert('all', 'Monthly', spent, paise(monthlyBudget));
    for (const b of categoryBudgets) budgetAlert(b.category, b.category, byCategory.get(b.category) || 0, paise(b.limit_inr));

    // Unusual: today's largest expense is over three times the usual one, with enough history to know.
    const today = appTime.localDateKey(now);
    const history = recentExpenses.filter((e) => appTime.localDateKey(new Date(e.occurred_at)) !== today).map((e) => paise(e.amount)).sort((a, b) => a - b);
    if (history.length >= 10) {
        const typical = history[Math.floor(history.length / 2)];
        const largest = recentExpenses.filter((e) => appTime.localDateKey(new Date(e.occurred_at)) === today).reduce((max, e) => Math.max(max, paise(e.amount)), 0);
        if (typical > 0 && largest > typical * 3) {
            alerts.push({ id: `unusual:${today}`, kind: 'unusual', notifyAt: soon, title: 'A larger payment than usual', body: 'Today has a payment well above your usual amount. Open Vittova to check it.' });
        }
    }

    // Bills: 9 am the day before.
    const [y, m, d] = today.split('-').map(Number);
    const lastDay = appTime.daysInMonth(now);
    for (const bill of bills) {
        if (bill.is_active === false) continue;
        const due = Math.min(Number(bill.due_day), lastDay);
        if (due <= d) continue;
        const notifyAt = new Date(appTime.zonedTimeToUtc(y, m, due, 9).getTime() - 24 * HOUR);
        if (notifyAt <= now) continue;
        alerts.push({ id: `bill:${bill.name}:${month}`, kind: 'bill', notifyAt: notifyAt.toISOString(), title: 'Bill due tomorrow', body: `${bill.name} is due tomorrow.` });
    }

    // Goals: 9 am, a week before the target date.
    for (const goal of goals) {
        const [gy, gm, gd] = String(goal.target_date).split('-').map(Number);
        const notifyAt = new Date(appTime.zonedTimeToUtc(gy, gm, gd, 9).getTime() - 7 * 24 * HOUR);
        if (notifyAt <= now || notifyAt.getTime() - now.getTime() > 31 * 24 * HOUR) continue;
        alerts.push({ id: `goal:${goal.id}:${goal.target_date}`, kind: 'savings', notifyAt: notifyAt.toISOString(), title: 'Your savings goal is a week away', body: `${goal.name}: see how close you are.` });
    }

    // Weekly summary: the coming Sunday, 6 pm.
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    let sunday = new Date(noon.getTime() + ((7 - noon.getUTCDay()) % 7) * 24 * HOUR);
    let at = appTime.zonedTimeToUtc(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 18);
    if (at <= now) {
        sunday = new Date(sunday.getTime() + 7 * 24 * HOUR);
        at = appTime.zonedTimeToUtc(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 18);
    }
    alerts.push({ id: `weekly:${at.toISOString().slice(0, 10)}`, kind: 'weekly', notifyAt: at.toISOString(), title: 'Your week in Vittova', body: 'Your weekly summary is ready.' });

    return alerts;
}

module.exports = { buildAlerts };
