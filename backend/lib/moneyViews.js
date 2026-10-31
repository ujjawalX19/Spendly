/**
 * moneyViews — the Month Calendar and Money Wrapped, from the user's own rows.
 * Nothing is projected or estimated. Amounts are added in paise.
 */
const appTime = require('./appTime');

const paise = (n) => Math.round(Number(n || 0) * 100);
const rupees = (p) => Math.round(p) / 100;

/** `month` is YYYY-MM. A bill due past the month's end falls on its last day. */
function buildCalendar({ month, expenses, bills, goals }) {
    const [y, m] = month.split('-').map(Number);
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = Array.from({ length: count }, (_, i) => ({
        date: `${month}-${String(i + 1).padStart(2, '0')}`, spentPaise: 0, expenses: 0, bills: [], goals: [],
    }));
    for (const e of expenses) {
        const day = days[Number(appTime.localDateKey(new Date(e.occurred_at)).slice(8)) - 1];
        day.spentPaise += paise(e.amount);
        day.expenses += 1;
    }
    let billsPaise = 0;
    for (const b of bills) {
        if (b.is_active === false) continue;
        days[Math.min(Number(b.due_day), count) - 1].bills.push({ name: b.name, amount: Number(b.amount) });
        billsPaise += paise(b.amount);
    }
    for (const g of goals) {
        if (String(g.target_date).startsWith(month)) days[Number(String(g.target_date).slice(8)) - 1].goals.push(g.name);
    }
    return {
        month,
        totalSpent: rupees(days.reduce((sum, d) => sum + d.spentPaise, 0)),
        totalBills: rupees(billsPaise),
        days: days.map(({ spentPaise, ...d }) => ({ ...d, spent: rupees(spentPaise) })),
    };
}

const MIN_EXPENSES = 5;

/** `elapsedDays` counts only days that have happened, so today can't be a "no-spend day" too early. */
function buildWrapped({ label, expenses, elapsedDays, savedPaise = 0 }) {
    if (expenses.length < MIN_EXPENSES) {
        return { eligible: false, label, expenseCount: expenses.length, needed: MIN_EXPENSES };
    }
    const byCategory = new Map();
    const byMerchant = new Map();
    const byDay = new Map();
    let total = 0;
    for (const e of expenses) {
        const p = paise(e.amount);
        total += p;
        byCategory.set(e.category, (byCategory.get(e.category) || 0) + p);
        const merchant = String(e.description || '').trim();
        if (merchant) {
            const key = merchant.toLowerCase();
            const row = byMerchant.get(key) || { name: merchant, count: 0 };
            row.count += 1;
            byMerchant.set(key, row);
        }
        const day = appTime.localDateKey(new Date(e.occurred_at));
        byDay.set(day, (byDay.get(day) || 0) + p);
    }
    const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
    const [topCategory, topCategoryPaise] = top(byCategory);
    const [biggestDay, biggestDayPaise] = top(byDay);
    const regular = [...byMerchant.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
    const activeDays = byDay.size;
    const noSpendDays = Math.max(0, elapsedDays - activeDays);
    return {
        eligible: true,
        label,
        totalSpent: rupees(total),
        expenseCount: expenses.length,
        activeDays,
        noSpendDays,
        topCategory: { name: topCategory, amount: rupees(topCategoryPaise), share: Math.round((topCategoryPaise / total) * 100) },
        biggestDay: { date: biggestDay, amount: rupees(biggestDayPaise) },
        regular: regular && regular.count > 1 ? regular : null,
        saved: rupees(savedPaise),
        // The only figures a share card may use: no amounts, merchants or dates.
        share: { label, expenseCount: expenses.length, activeDays, noSpendDays },
    };
}

module.exports = { buildCalendar, buildWrapped };
