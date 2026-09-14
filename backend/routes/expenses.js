const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { receiptScanLimiter, exportLimiter } = require('../middleware/rateLimits');
const { applyProfileStats, roundupFor } = require('../lib/profileStats');
const gemini = require('../lib/gemini');
const appTime = require('../lib/appTime');
const { toCsv } = require('../lib/csv');
const { validationError } = require('../lib/validation');
const telemetry = require('../lib/opsTelemetry');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];
const VALID_SOURCES = ['manual', 'ai_scan', 'upi_auto', 'pdf_import'];

// How far in the past an automatically detected payment may be dated. The
// native queue keeps detections for 7 days; a little slack covers clock skew.
const MAX_UPI_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const amountSchema = z.coerce.number()
    .positive('Amount must be a positive number')
    .max(10_000_000, 'Amount too large')
    .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(6)), 'Amount can have at most 2 decimal places');

const expenseSchema = z.object({
    amount: amountSchema,
    category: z.enum(VALID_CATEGORIES).optional().default('Other'),
    description: z.string().trim().max(200, 'Description too long (max 200 chars)').optional().default(''),
    // Only the app's own notification flow may mark an expense as automatic.
    // `ai_scan` and `pdf_import` are set exclusively by their server routes.
    source: z.enum(['manual', 'upi_auto']).optional().default('manual'),
    occurred_at: z.string().datetime({ offset: true }).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Listing and export
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.enum(VALID_CATEGORIES).optional(),
    from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    minAmount: z.coerce.number().nonnegative().optional(),
    maxAmount: z.coerce.number().nonnegative().optional(),
    source: z.enum(VALID_SOURCES).optional(),
    sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional().default('newest'),
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
    offset: z.coerce.number().int().min(0).optional().default(0),
});

const SORTS = {
    newest: { column: 'occurred_at', ascending: false },
    oldest: { column: 'occurred_at', ascending: true },
    highest: { column: 'amount', ascending: false },
    lowest: { column: 'amount', ascending: true },
};

/**
 * Build the filtered, sorted expense query for one user. Shared by the list
 * endpoint and the CSV export so the two can never disagree.
 */
const buildExpenseQuery = (userId, filters, { count = false } = {}) => {
    let query = supabase
        .from('expenses')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('user_id', userId);

    if (filters.q) {
        // Escape PostgREST pattern metacharacters so "50%" is literal.
        const term = filters.q.replace(/[%_,()\\]/g, '\\$&');
        query = query.ilike('description', `%${term}%`);
    }
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.from) {
        const from = filters.from.length === 10
            ? appTime.zonedTimeToUtc(...filters.from.split('-').map(Number), 0, 0, 0)
            : new Date(filters.from);
        query = query.gte('occurred_at', new Date(from).toISOString());
    }
    if (filters.to) {
        // A bare date means "through the end of that day", local time.
        const to = filters.to.length === 10
            ? appTime.zonedTimeToUtc(...filters.to.split('-').map(Number), 23, 59, 59)
            : new Date(filters.to);
        query = query.lte('occurred_at', new Date(to).toISOString());
    }
    if (filters.minAmount !== undefined) query = query.gte('amount', filters.minAmount);
    if (filters.maxAmount !== undefined) query = query.lte('amount', filters.maxAmount);

    const sort = SORTS[filters.sort] || SORTS.newest;
    return query.order(sort.column, { ascending: sort.ascending });
};

// @route   GET /api/expenses — search, filter, sort, paginate
router.get('/', protect, async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid filter');
    const filters = parsed.data;

    const { data: expenses, error, count } = await buildExpenseQuery(req.user.id, filters, { count: true })
        .range(filters.offset, filters.offset + filters.limit - 1);

    if (error) {
        console.error('Error fetching expenses:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching expenses' });
    }

    res.json({
        success: true,
        expenses,
        pagination: {
            total: count ?? expenses.length,
            limit: filters.limit,
            offset: filters.offset,
            hasMore: (filters.offset + expenses.length) < (count ?? 0),
        },
    });
});

// @route   GET /api/expenses/export.csv — the user's data, as CSV (free tier)
router.get('/export.csv', protect, exportLimiter, async (req, res) => {
    const parsed = listQuerySchema.safeParse({ ...req.query, limit: 500, offset: 0 });
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid filter');

    const rows = [];
    const PAGE = 500;
    for (let offset = 0; offset < 50_000; offset += PAGE) {
        const { data, error } = await buildExpenseQuery(req.user.id, parsed.data)
            .range(offset, offset + PAGE - 1);
        if (error) {
            console.error('Error exporting expenses:', error.message);
            return res.status(500).json({ success: false, message: 'Could not export your expenses' });
        }
        rows.push(...data);
        if (data.length < PAGE) break;
    }

    const filename = `vittova-expenses-${appTime.localDateKey()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Row-Count', String(rows.length));
    // A BOM makes Excel open UTF-8 (and the rupee sign) correctly.
    res.send("\uFEFF" + toCsv(rows));
});

// ---------------------------------------------------------------------------
// @route   POST /api/expenses — log an expense (manual or confirmed UPI detection)
// ---------------------------------------------------------------------------
router.post('/', protect, proGate('add_expense'), async (req, res) => {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { amount, category, description, source } = parsed.data;

    const now = Date.now();
    let occurredAt = new Date(now);
    if (parsed.data.occurred_at) {
        const when = new Date(parsed.data.occurred_at);
        if (when.getTime() > now + MAX_FUTURE_SKEW_MS) {
            return res.status(400).json({ success: false, message: 'An expense cannot be dated in the future' });
        }
        if (source === 'upi_auto' && now - when.getTime() > MAX_UPI_AGE_MS) {
            return res.status(400).json({ success: false, message: 'That payment is too old to add automatically. Add it manually instead.' });
        }
        occurredAt = when;
    }

    const roundupChillar = roundupFor(amount);

    const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
            user_id: req.user.id,
            amount,
            category,
            description,
            roundup_chillar: roundupChillar,
            source,
            occurred_at: occurredAt.toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving expense:', error.message);
        return res.status(500).json({ success: false, message: 'Server error saving expense' });
    }

    const stats = await applyProfileStats(req.user.id, { chillar: roundupChillar });

    res.status(201).json({
        success: true,
        expense,
        roundupChillar,
        totalChillar: stats?.total_chillar ?? null,
        streak: {
            currentDays: stats?.streak_current ?? null,
            longestStreak: stats?.streak_longest ?? null,
        },
        quota: res.locals.quota || null,
    });
});

// ---------------------------------------------------------------------------
// @route   POST /api/expenses/scan — read a receipt image with Gemini and log it
// ---------------------------------------------------------------------------
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_DATA_URI = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,/;

const scanSchema = z.object({
    imageBase64: z.string().min(100, 'No image provided').max(8 * 1024 * 1024, 'Image is too large'),
}).strict();

router.post('/scan', protect, receiptScanLimiter, async (req, res, next) => {
    // Validate before charging the quota.
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (!gemini.isConfigured()) {
        return res.status(503).json({ success: false, message: 'Receipt scanning is temporarily unavailable.' });
    }
    return next();
}, proGate('receipt_scan'), async (req, res) => {
    const input = req.body.imageBase64;
    const match = IMAGE_DATA_URI.exec(input);
    const mimeType = match ? match[1] : 'image/jpeg';
    const base64Data = match ? input.slice(match[0].length) : input;

    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Data) || Buffer.byteLength(base64Data, 'base64') > MAX_IMAGE_BYTES) {
        return res.status(400).json({ success: false, message: 'Please upload a JPEG, PNG or WebP image under 5 MB.' });
    }

    const prompt = `You are a receipt parser. Extract only the merchant name, the purchased items with prices, and the total amount in INR from this receipt image.
Never include card numbers, account numbers, UPI IDs, phone numbers or other identifiers.
Return ONLY raw JSON, no markdown:
{"merchantName": "Store", "items": [{"itemName": "Item", "price": 10.5}], "scannedTotal": 10.5}`;

    let receiptData;
    try {
        const replyText = await gemini.generateText(
            [prompt, { inlineData: { data: base64Data, mimeType } }],
            { maxOutputTokens: 1024, temperature: 0 }
        );
        receiptData = JSON.parse(replyText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (error) {
        // Receipt output may contain personal data; log only the failure type.
        console.error('Receipt scan failed:', error.code || error.name);
        telemetry.recordEvent('receipt_scan_failed', { route: 'POST /api/expenses/scan', code: error.code || error.name });
        return res.status(502).json({ success: false, message: "We couldn't read that receipt. Try a clearer photo, or add it manually." });
    }

    const totalAmount = Number(receiptData?.scannedTotal);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > 10_000_000) {
        return res.status(422).json({ success: false, message: 'The receipt did not contain a valid total.' });
    }
    const amount = Number(totalAmount.toFixed(2));
    const merchant = String(receiptData.merchantName || 'Unknown').slice(0, 100);
    const items = Array.isArray(receiptData.items)
        ? receiptData.items.slice(0, 50).map((i) => ({
            itemName: String(i?.itemName || '').slice(0, 100),
            price: Number(i?.price) || 0,
        }))
        : [];

    const roundupChillar = roundupFor(amount);
    const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
            user_id: req.user.id,
            amount,
            category: 'Shopping',
            description: `Receipt from ${merchant}`.slice(0, 200),
            roundup_chillar: roundupChillar,
            source: 'ai_scan',
            occurred_at: new Date().toISOString(),
            receipt_data: { merchantName: merchant, items, scannedTotal: amount },
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving scanned expense:', error.message);
        return res.status(500).json({ success: false, message: 'Server error saving expense' });
    }

    const stats = await applyProfileStats(req.user.id, { chillar: roundupChillar });

    res.status(201).json({
        success: true,
        expense,
        roundupChillar,
        totalChillar: stats?.total_chillar ?? null,
        streak: {
            currentDays: stats?.streak_current ?? null,
            longestStreak: stats?.streak_longest ?? null,
        },
        quota: res.locals.quota || null,
    });
});

// ---------------------------------------------------------------------------
// @route   PATCH /api/expenses/:id — edit amount, category, description or date
//
// Does NOT retroactively adjust round-up chillar or streaks: those are earned
// at the moment of logging.
// ---------------------------------------------------------------------------
const expenseUpdateSchema = z.object({
    amount: amountSchema.optional(),
    category: z.enum(VALID_CATEGORIES).optional(),
    description: z.string().trim().max(200, 'Description too long (max 200 chars)').optional(),
    occurred_at: z.string().datetime({ offset: true })
        .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

router.patch('/:id', protect, async (req, res) => {
    if (!UUID_RE.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    const parsed = expenseUpdateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const updates = { ...parsed.data };
    if (updates.occurred_at) {
        const when = updates.occurred_at.length === 10
            ? appTime.zonedTimeToUtc(...updates.occurred_at.split('-').map(Number), 12, 0, 0)
            : new Date(updates.occurred_at);
        if (Number.isNaN(new Date(when).getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date' });
        }
        if (new Date(when) > new Date(Date.now() + 24 * 60 * 60 * 1000)) {
            return res.status(400).json({ success: false, message: 'An expense cannot be dated in the future' });
        }
        updates.occurred_at = new Date(when).toISOString();
    }

    const { data: expense, error } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)   // ownership is enforced here, not by RLS
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating expense:', error.message);
        return res.status(500).json({ success: false, message: 'Server error updating expense' });
    }
    if (!expense) {
        return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, expense });
});

// @route   DELETE /api/expenses/:id
router.delete('/:id', protect, async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(String(id || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    // `select()` distinguishes "deleted" from "was never yours".
    const { data: deleted, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('Error deleting expense:', error.message);
        return res.status(500).json({ success: false, message: 'Server error deleting expense' });
    }
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true });
});

module.exports = router;
module.exports.VALID_CATEGORIES = VALID_CATEGORIES;
