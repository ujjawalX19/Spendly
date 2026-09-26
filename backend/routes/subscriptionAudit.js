const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag } = require('../lib/featureFlags');
const { validationError } = require('../lib/validation');
const appTime = require('../lib/appTime');
const audit = require('../lib/recurringAudit');

/**
 * Subscription & Recurring Expense Audit (Vittova Pro).
 *
 *   GET  /api/subscription-audit           detected recurring payments, totals,
 *                                          price changes, reminders to schedule on
 *                                          the device, and after-debit verification
 *   POST /api/subscription-audit/decision  confirm / dismiss / intentional / unwanted
 *
 * Detection runs on the user's own expense rows (lib/recurringAudit). Vittova
 * never cancels anything and never contacts a merchant. The free "Recurring
 * charges" screen (/api/subscriptions) is unchanged.
 */

const gates = [protect, userApiLimiter, requireFlag('subscriptionAuditEnabled'), proGate('subscription_audit')];

router.get('/', ...gates, async (req, res) => {
    try {
        const now = new Date();
        const userId = req.user.id;
        const [exp, dec, can, ex] = await Promise.all([
            supabase.from('expenses').select('id, amount, description, category, occurred_at').eq('user_id', userId)
                .gte('occurred_at', appTime.startOfMonthsAgo(13, now).toISOString()).order('occurred_at', { ascending: true }),
            supabase.from('recurring_decisions').select('merchant_key, decision').eq('user_id', userId),
            supabase.from('cancelled_subscriptions').select('normalized_name, cancelled_at').eq('user_id', userId),
            supabase.from('recurring_expectations').select('merchant_key, expected_date, expected_amount, status, matched_amount, matched_on').eq('user_id', userId)
                .gte('expected_date', audit.addDays(appTime.localDateKey(now), -90)),
        ]);
        for (const r of [exp, dec, can, ex]) if (r.error) throw r.error;
        const expenses = exp.data || [];

        const result = audit.buildAudit({ expenses, decisions: dec.data || [], cancelled: can.data || [], now });

        // After-debit verification, resolved once per expectation.
        const expectations = ex.data || [];
        for (const change of audit.reconcileExpectations(expectations, expenses, now)) {
            const { merchant_key: key, expected_date: date, ...fields } = change;
            await supabase.from('recurring_expectations').update({ ...fields, resolved_at: now.toISOString() })
                .eq('user_id', userId).eq('merchant_key', key).eq('expected_date', date).eq('status', 'pending');
            const row = expectations.find((x) => x.merchant_key === key && String(x.expected_date).slice(0, 10) === date);
            if (row) Object.assign(row, fields);
        }

        // Remember the next expected debit of each reminder-eligible payment.
        for (const item of result.items.filter((i) => i.reminderEligible)) {
            const exists = expectations.some((x) => x.merchant_key === item.merchantKey && String(x.expected_date).slice(0, 10) === item.nextExpected.dateKey);
            if (exists) continue;
            const row = { user_id: userId, merchant_key: item.merchantKey, expected_date: item.nextExpected.dateKey, expected_amount: item.amount, status: 'pending' };
            const { error } = await supabase.from('recurring_expectations').insert(row);
            if (!error) expectations.push(row);
        }

        const itemsByKey = new Map(result.items.map((i) => [i.merchantKey, i.merchant]));
        res.json({
            success: true,
            audit: result,
            reminders: audit.remindersFor(result, now),
            verification: expectations
                .filter((x) => x.status !== 'pending' || String(x.expected_date).slice(0, 10) <= appTime.localDateKey(now))
                .map((x) => ({
                    merchantKey: x.merchant_key,
                    merchant: itemsByKey.get(x.merchant_key) || x.merchant_key,
                    expectedDate: String(x.expected_date).slice(0, 10),
                    expectedAmount: Math.round(Number(x.expected_amount)),
                    status: x.status === 'pending' ? 'pending' : x.status,
                    matchedAmount: x.matched_amount != null ? Math.round(Number(x.matched_amount)) : null,
                    matchedOn: x.matched_on ? String(x.matched_on).slice(0, 10) : null,
                }))
                .sort((a, b) => b.expectedDate.localeCompare(a.expectedDate))
                .slice(0, 20),
        });
    } catch (error) {
        console.error('Subscription audit error:', error?.code || error?.message || 'Error');
        res.status(503).json({ success: false, code: 'AUDIT_UNAVAILABLE', message: "We couldn't load your recurring payments just now. Please try again." });
    }
});

const decisionSchema = z.object({
    merchantKey: z.string().trim().regex(/^[a-z0-9 ]{1,60}$/, 'Unknown recurring payment'),
    decision: z.enum([...audit.DECISIONS, 'cleared']),
}).strict();

router.post('/decision', ...gates, async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { merchantKey, decision } = parsed.data;
    const query = decision === 'cleared'
        ? supabase.from('recurring_decisions').delete().eq('user_id', req.user.id).eq('merchant_key', merchantKey)
        : supabase.from('recurring_decisions').upsert({ user_id: req.user.id, merchant_key: merchantKey, decision, updated_at: new Date().toISOString() }, { onConflict: 'user_id,merchant_key' });
    const { error } = await query;
    if (error) return res.status(503).json({ success: false, code: 'AUDIT_UNAVAILABLE', message: "We couldn't save that just now. Please try again." });
    res.json({ success: true, merchantKey, decision });
});

module.exports = router;
