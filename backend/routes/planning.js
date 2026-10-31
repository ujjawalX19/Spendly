const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { validationError } = require('../lib/validation');
const appTime = require('../lib/appTime');
const { periodRange, buildReport, reportCsv } = require('../lib/reports');
const { buildCalendar, buildWrapped } = require('../lib/moneyViews');
const { proGate } = require('../middleware/proGate');

/**
 * Category budgets, income and reports (v1_16_budgets_income.sql).
 *
 * All free: a person's own records are never behind the paywall. Every query
 * is scoped to req.user.id. Until the migration has run, the two new tables
 * answer as unavailable and a report still works from expenses alone.
 */
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];
const SOURCES = ['Salary', 'Freelance', 'Family', 'Refund', 'Other'];
const UNAVAILABLE = { success: false, code: 'NOT_AVAILABLE', message: 'This is not available yet. Please try again later.' };

// ─── Category budgets ──────────────────────────────────────────────────────
router.get('/category-budgets', protect, async (req, res) => {
    const { data, error } = await supabase.from('category_budgets').select('category, limit_inr').eq('user_id', req.user.id);
    if (error) return res.status(503).json(UNAVAILABLE);
    res.json({ success: true, budgets: data || [] });
});

const budgetSchema = z.object({
    limit_inr: z.coerce.number().int('Enter a whole number of rupees').min(1, 'Enter at least ₹1').max(100_000_000),
}).strict();
const categorySchema = z.enum(CATEGORIES);

router.put('/category-budgets/:category', protect, async (req, res) => {
    const category = categorySchema.safeParse(req.params.category);
    if (!category.success) return res.status(400).json({ success: false, message: 'Unknown category' });
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { data, error } = await supabase.from('category_budgets')
        .upsert({ user_id: req.user.id, category: category.data, limit_inr: parsed.data.limit_inr, updated_at: new Date().toISOString() }, { onConflict: 'user_id,category' })
        .select('category, limit_inr')
        .maybeSingle();
    if (error) return res.status(503).json(UNAVAILABLE);
    res.json({ success: true, budget: data });
});

router.delete('/category-budgets/:category', protect, async (req, res) => {
    const category = categorySchema.safeParse(req.params.category);
    if (!category.success) return res.status(400).json({ success: false, message: 'Unknown category' });
    const { error } = await supabase.from('category_budgets').delete().eq('user_id', req.user.id).eq('category', category.data);
    if (error) return res.status(503).json(UNAVAILABLE);
    res.json({ success: true });
});

// ─── Income ────────────────────────────────────────────────────────────────
router.get('/income', protect, async (req, res) => {
    const { data, error } = await supabase.from('income_entries')
        .select('id, amount_inr, source, note, received_on')
        .eq('user_id', req.user.id)
        .order('received_on', { ascending: false })
        .limit(100);
    if (error) return res.status(503).json(UNAVAILABLE);
    res.json({ success: true, income: data || [] });
});

const realDate = (s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const incomeSchema = z.object({
    amount_inr: z.coerce.number().int('Enter a whole number of rupees').min(1, 'Enter at least ₹1').max(100_000_000),
    source: z.enum(SOURCES).default('Other'),
    note: z.string().trim().max(200).optional(),
    received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').refine(realDate, 'Pick a real date'),
}).strict();

router.post('/income', protect, async (req, res) => {
    const parsed = incomeSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (parsed.data.received_on > appTime.localDateKey()) {
        return res.status(400).json({ success: false, message: 'The date cannot be in the future' });
    }
    const { data, error } = await supabase.from('income_entries')
        .insert({ ...parsed.data, user_id: req.user.id })
        .select('id, amount_inr, source, note, received_on')
        .maybeSingle();
    if (error) return res.status(503).json(UNAVAILABLE);
    res.status(201).json({ success: true, entry: data });
});

router.delete('/income/:id', protect, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ success: false, message: 'Invalid id' });
    const { data, error } = await supabase.from('income_entries').delete()
        .eq('id', req.params.id).eq('user_id', req.user.id).select('id');
    if (error) return res.status(503).json(UNAVAILABLE);
    if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Income entry not found' });
    res.json({ success: true });
});

// ─── Reports ───────────────────────────────────────────────────────────────
const reportQuery = z.object({
    period: z.enum(['week', 'month', 'year']).default('month'),
    offset: z.coerce.number().int().min(0).max(120).default(0),
});

async function loadReport(userId, { period, offset }) {
    const { start, end, label } = periodRange(period, offset);
    const expenses = [];
    const PAGE = 1000;
    for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase.from('expenses').select('amount, category')
            .eq('user_id', userId)
            .gte('occurred_at', start.toISOString())
            .lt('occurred_at', end.toISOString())
            .order('occurred_at', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        expenses.push(...data);
        if (data.length < PAGE) break;
    }
    const [{ data: profile, error: profileError }, income, budgets] = await Promise.all([
        supabase.from('profiles').select('monthly_budget').eq('id', userId).maybeSingle(),
        supabase.from('income_entries').select('amount_inr').eq('user_id', userId)
            .gte('received_on', appTime.localDateKey(start))
            .lt('received_on', appTime.localDateKey(end)),
        supabase.from('category_budgets').select('category, limit_inr').eq('user_id', userId),
    ]);
    if (profileError) throw profileError;
    return {
        ...buildReport({
            period, label, expenses,
            income: income.error ? [] : income.data || [],
            categoryBudgets: budgets.error ? [] : budgets.data || [],
            monthlyBudget: profile?.monthly_budget,
        }),
        incomeAvailable: !income.error,
    };
}

router.get('/report', protect, async (req, res) => {
    const parsed = reportQuery.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid period');
    try {
        res.json({ success: true, report: await loadReport(req.user.id, parsed.data) });
    } catch (err) {
        console.error('Report failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not build your report' });
    }
});

router.get('/report.csv', protect, async (req, res) => {
    const parsed = reportQuery.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid period');
    try {
        const report = await loadReport(req.user.id, parsed.data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vittova-report-${parsed.data.period}-${appTime.localDateKey()}.csv"`);
        res.send('﻿' + reportCsv(report));
    } catch (err) {
        console.error('Report export failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not export your report' });
    }
});

// ─── Month Calendar (Pro) ──────────────────────────────────────────────────
router.get('/calendar', protect, proGate('month_calendar'), async (req, res) => {
    const month = String(req.query.month || appTime.localMonthKey());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success: false, message: 'Invalid month' });
    const [y, m] = month.split('-').map(Number);
    const start = appTime.zonedTimeToUtc(y, m, 1);
    const end = m === 12 ? appTime.zonedTimeToUtc(y + 1, 1, 1) : appTime.zonedTimeToUtc(y, m + 1, 1);
    const [expenses, bills, goals] = await Promise.all([
        supabase.from('expenses').select('amount, occurred_at').eq('user_id', req.user.id)
            .gte('occurred_at', start.toISOString()).lt('occurred_at', end.toISOString()),
        supabase.from('recurring_bills').select('name, amount, due_day, is_active').eq('user_id', req.user.id),
        supabase.from('savings_goals').select('name, target_date, status').eq('user_id', req.user.id).eq('status', 'active'),
    ]);
    if (expenses.error || bills.error) return res.status(500).json({ success: false, message: 'Could not load your calendar' });
    res.json({ success: true, calendar: buildCalendar({ month, expenses: expenses.data, bills: bills.data, goals: goals.error ? [] : goals.data }) });
});

// ─── Money Wrapped ─────────────────────────────────────────────────────────
router.get('/wrapped', protect, async (req, res) => {
    const parsed = reportQuery.safeParse(req.query);
    if (!parsed.success || parsed.data.period === 'week') return res.status(400).json({ success: false, message: 'Invalid period' });
    const { period, offset } = parsed.data;
    const { start, end, label } = periodRange(period, offset);
    const [expenses, saved] = await Promise.all([
        supabase.from('expenses').select('amount, category, description, occurred_at').eq('user_id', req.user.id)
            .gte('occurred_at', start.toISOString()).lt('occurred_at', end.toISOString()),
        supabase.from('savings_events').select('amount').eq('user_id', req.user.id)
            .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
    ]);
    if (expenses.error) return res.status(500).json({ success: false, message: 'Could not build your summary' });
    const now = new Date();
    const elapsedDays = Math.round((Math.min(end.getTime(), appTime.startOfDay(now).getTime() + 86_400_000) - start.getTime()) / 86_400_000);
    const savedPaise = (saved.error ? [] : saved.data).reduce((sum, s) => sum + Math.round(Number(s.amount) * 100), 0);
    res.json({ success: true, wrapped: buildWrapped({ label, expenses: expenses.data, elapsedDays, savedPaise }) });
});

// ─── Purchase decisions and Money-Saved ────────────────────────────────────
const purchaseSchema = z.object({
    amount: z.coerce.number().positive('Enter an amount').max(10_000_000),
    label: z.string().trim().max(60).optional(),
    decision: z.enum(['bought', 'deferred', 'skipped']),
}).strict();

// Only a skipped purchase counts as saved. Deferred money may still be spent.
router.post('/purchases', protect, async (req, res) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { amount, label = null, decision } = parsed.data;
    const { data, error } = await supabase.from('planned_purchases')
        .insert({ user_id: req.user.id, amount, label, decision }).select('id').single();
    if (error) return res.status(503).json(UNAVAILABLE);
    if (decision === 'skipped') {
        const { error: eventError } = await supabase.from('savings_events')
            .insert({ user_id: req.user.id, kind: 'skipped_purchase', amount, label, purchase_id: data.id });
        if (eventError) {
            await supabase.from('planned_purchases').delete().eq('id', data.id).eq('user_id', req.user.id);
            return res.status(503).json(UNAVAILABLE);
        }
    }
    res.status(201).json({ success: true });
});

router.get('/savings-ledger', protect, async (req, res) => {
    const { data, error } = await supabase.from('savings_events')
        .select('id, kind, label, amount, created_at').eq('user_id', req.user.id)
        .order('created_at', { ascending: false }).limit(500);
    if (error) return res.status(503).json(UNAVAILABLE);
    const totalPaise = data.reduce((sum, e) => sum + Math.round(Number(e.amount) * 100), 0);
    res.json({ success: true, total: totalPaise / 100, events: data });
});

const priceDifferenceSchema = z.object({
    usualPrice: z.coerce.number().positive('Enter the usual price').max(10_000_000),
    paidPrice: z.coerce.number().min(0).max(10_000_000),
    label: z.string().trim().min(1, 'Say what you bought').max(60),
}).strict();

router.post('/savings-ledger/price-difference', protect, async (req, res) => {
    const parsed = priceDifferenceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { usualPrice, paidPrice, label } = parsed.data;
    const differencePaise = Math.round(usualPrice * 100) - Math.round(paidPrice * 100);
    if (differencePaise <= 0) return res.status(400).json({ success: false, message: 'The price you paid must be lower than the usual price' });
    const { error } = await supabase.from('savings_events')
        .insert({ user_id: req.user.id, kind: 'price_difference', label, amount: differencePaise / 100 });
    if (error) return res.status(503).json(UNAVAILABLE);
    res.status(201).json({ success: true });
});

router.delete('/savings-ledger/:id', protect, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ success: false, message: 'Invalid id' });
    const { data, error } = await supabase.from('savings_events').delete()
        .eq('id', req.params.id).eq('user_id', req.user.id).select('id');
    if (error) return res.status(503).json(UNAVAILABLE);
    if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true });
});

module.exports = router;
