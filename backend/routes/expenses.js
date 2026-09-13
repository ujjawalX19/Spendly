const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { advanceStreak } = require('../lib/streak');
const appTime = require('../lib/appTime');
const { toCsv } = require('../lib/csv');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} else {
    console.warn('⚠️  GEMINI_API_KEY not set — Receipt scanning will run in mock mode.');
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────
const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];

const expenseSchema = z.object({
    amount: z.coerce.number().positive('Amount must be a positive number').max(10_000_000, 'Amount too large'),
    category: z.enum(VALID_CATEGORIES).optional().default('Other'),
    description: z.string().max(200, 'Description too long (max 200 chars)').optional().default(''),
});

// ---------------------------------------------------------------------------
// Helper: Update streak and total_chillar in public.profiles
// Reads the current profile, computes the new streak, and saves atomically.
// ---------------------------------------------------------------------------
const updateProfileStats = async (userId, chillarToAdd) => {
    // Fetch current profile stats
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('total_chillar, streak_current, streak_last_log, streak_longest')
        .eq('id', userId)
        .single();

    if (fetchError || !profile) {
        console.error('Failed to fetch profile for stats update:', fetchError);
        return null;
    }

    const now = new Date();

    // Streak days are local calendar days (see lib/appTime.js), shared with
    // the /api/streaks routes so the two can never disagree.
    const streak = advanceStreak(profile, now);
    const newChillar = Number(parseFloat(profile.total_chillar) || 0) + chillarToAdd;

    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({
            total_chillar: Number(newChillar.toFixed(2)),
            streak_current: streak.streak_current,
            streak_longest: streak.streak_longest,
            streak_last_log: streak.streak_last_log
        })
        .eq('id', userId)
        .select('total_chillar, streak_current, streak_longest')
        .single();

    if (updateError) {
        console.error('Failed to update profile stats:', updateError);
        return null;
    }

    return updated;
};

// ---------------------------------------------------------------------------
// @route   GET /api/expenses
// @desc    Get all expenses for the authenticated user
// @access  Protected
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.enum(VALID_CATEGORIES).optional(),
    from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    minAmount: z.coerce.number().nonnegative().optional(),
    maxAmount: z.coerce.number().nonnegative().optional(),
    source: z.enum(['manual', 'ai_scan', 'upi_auto', 'pdf_import']).optional(),
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
 * Build the filtered, sorted, paginated expense query for one user.
 * Shared by the list endpoint and the CSV export so the two can never
 * disagree about what the user is looking at.
 */
const buildExpenseQuery = (userId, filters, { count = false } = {}) => {
    let query = supabase
        .from('expenses')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('user_id', userId);

    if (filters.q) {
        // Escape PostgREST's pattern metacharacters so a user searching for
        // "50%" does not accidentally run a wildcard query.
        const term = filters.q.replace(/[%_,()]/g, '\\$&');
        query = query.ilike('description', `%${term}%`);
    }
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.from) query = query.gte('occurred_at', new Date(filters.from).toISOString());
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

// ---------------------------------------------------------------------------
// @route   GET /api/expenses
// @desc    List the authenticated user's expenses, with search, filtering,
//          sorting and pagination.
// @access  Protected
//
// Query: q, category, source, from, to, minAmount, maxAmount, sort, limit, offset
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Invalid filter',
            errors: parsed.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
        });
    }
    const filters = parsed.data;

    const { data: expenses, error, count } = await buildExpenseQuery(req.user.id, filters, { count: true })
        .range(filters.offset, filters.offset + filters.limit - 1);

    if (error) {
        console.error('Error fetching expenses:', error);
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

// ---------------------------------------------------------------------------
// @route   GET /api/expenses/export.csv
// @desc    Download the user's expenses as CSV. Honours the same filters as
//          the list endpoint, so "export what I am looking at" works.
// @access  Protected
//
// Being able to take your data with you is a trust feature; it is available
// on the free tier on purpose.
// ---------------------------------------------------------------------------
router.get('/export.csv', protect, async (req, res) => {
    const parsed = listQuerySchema.safeParse({ ...req.query, limit: 500, offset: 0 });
    if (!parsed.success) {
        return res.status(400).json({ success: false, message: 'Invalid filter' });
    }

    // Export is not paginated — page through everything the filter matches.
    const rows = [];
    const PAGE = 500;
    for (let offset = 0; offset < 50_000; offset += PAGE) {
        const { data, error } = await buildExpenseQuery(req.user.id, parsed.data)
            .range(offset, offset + PAGE - 1);
        if (error) {
            console.error('Error exporting expenses:', error);
            return res.status(500).json({ success: false, message: 'Could not export your expenses' });
        }
        rows.push(...data);
        if (data.length < PAGE) break;
    }

    const csv = toCsv(rows);
    const filename = `spendly-expenses-${appTime.localDateKey()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // A BOM makes Excel open UTF-8 (and the rupee sign) correctly.
    res.send('\uFEFF' + csv);
});

// ---------------------------------------------------------------------------
// @route   POST /api/expenses
// @desc    Log a manual expense and update streak + chillar
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/', protect, proGate('add_expense'), async (req, res) => {
    // ── Zod Validation ──
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
        const errors = parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
        return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }
    const { amount, category, description } = parsed.data;

    const parsedAmount = amount; // Already a number via Zod coerce
    const remainder = parsedAmount % 5;
    const roundupChillar = remainder === 0 ? 0 : parseFloat((5 - remainder).toFixed(2));

    const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
            user_id: req.user.id,
            amount: parsedAmount,
            category: category || 'Other',
            description: description || '',
            roundup_chillar: roundupChillar,
            source: 'manual',
            occurred_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving expense:', error);
        return res.status(500).json({ success: false, message: 'Server error saving expense' });
    }

    const updatedStats = await updateProfileStats(req.user.id, roundupChillar);

    res.json({
        success: true,
        expense,
        roundupChillar,
        totalChillar: updatedStats?.total_chillar ?? null,
        streak: {
            currentDays: updatedStats?.streak_current ?? null,
            longestStreak: updatedStats?.streak_longest ?? null
        }
    });
});

// ---------------------------------------------------------------------------
// @route   POST /api/expenses/scan
// @desc    Scan a receipt image via Gemini Vision API and log the expense
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/scan', protect, proGate('receipt_scan'), async (req, res) => {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ success: false, message: 'No image provided' });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ success: false, message: 'GEMINI_API_KEY is not configured.' });
    }

    // Strip the data URI prefix (e.g. "data:image/jpeg;base64,")
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptContext = `
        You are a helpful receipt parser.
        Extract the following from the provided receipt image:
        1. The Merchant Name.
        2. The items purchased and their prices.
        3. The total amount.

        PRIVACY RULES (MANDATORY):
        - NEVER include any credit card numbers, debit card numbers, CVV codes,
          bank account numbers, UPI IDs, or other sensitive financial identifiers.
        - If such data is visible on the receipt, OMIT it entirely from your response.
        - Only return merchant name, item names, item prices, and the total.

        Return ONLY a valid JSON object matching this schema exactly:
        {
            "merchantName": "Name of the store",
            "items": [
                {"itemName": "Item 1", "price": 10.50},
                {"itemName": "Item 2", "price": 5.00}
            ],
            "scannedTotal": 15.50
        }
        Do not include any markdown formatting, only the raw JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                promptContext,
                { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
            ]
        });

        const replyText = response.text || '';

        let receiptData;
        try {
            const cleanJsonStr = replyText.replace(/```json/g, '').replace(/```/g, '').trim();
            receiptData = JSON.parse(cleanJsonStr);
        } catch (e) {
            // Receipt AI output may contain personal financial information.
            console.error('Failed to parse Gemini receipt output as JSON');
            return res.status(500).json({
                success: false,
                message: 'Failed to parse receipt correctly'
            });
        }

        const totalAmount = parseFloat(receiptData.scannedTotal) || 0;
        if (totalAmount <= 0 || totalAmount > 10_000_000) {
            return res.status(422).json({ success: false, message: 'The receipt did not contain a valid total.' });
        }
        const remainder = totalAmount % 5;
        const roundupChillar = remainder === 0 ? 0 : parseFloat((5 - remainder).toFixed(2));

        const { data: expense, error } = await supabase
            .from('expenses')
            .insert({
                user_id: req.user.id,
                amount: totalAmount,
                category: 'Shopping',
                description: `Receipt from ${receiptData.merchantName || 'Unknown'}`,
                roundup_chillar: roundupChillar,
                source: 'ai_scan',
                occurred_at: new Date().toISOString(),
                receipt_data: {
                    merchantName: receiptData.merchantName,
                    items: receiptData.items || [],
                    scannedTotal: totalAmount
                }
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving scanned expense:', error);
            return res.status(500).json({ success: false, message: 'Server error saving expense' });
        }

        const updatedStats = await updateProfileStats(req.user.id, roundupChillar);

        res.json({
            success: true,
            expense,
            roundupChillar,
            totalChillar: updatedStats?.total_chillar ?? null,
            streak: {
                currentDays: updatedStats?.streak_current ?? null,
                longestStreak: updatedStats?.streak_longest ?? null
            }
        });

    } catch (error) {
        console.error('Gemini AI Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process receipt',
            ...(process.env.NODE_ENV !== 'production' ? { error: error.message } : {}),
        });
    }
});


// ---------------------------------------------------------------------------
// @route   PATCH /api/expenses/:id
// @desc    Edit an expense (amount, category, description, or its date)
// @access  Protected
//
// Note this does NOT retroactively adjust round-up chillar or streaks.
// Those are earned at the moment of logging; silently rewriting a user's
// savings total when they fix a typo would be worse than leaving it.
// ---------------------------------------------------------------------------
const expenseUpdateSchema = z.object({
    amount: z.coerce.number().positive('Amount must be a positive number').max(10_000_000, 'Amount too large').optional(),
    category: z.enum(VALID_CATEGORIES).optional(),
    description: z.string().max(200, 'Description too long (max 200 chars)').optional(),
    occurred_at: z.string().datetime({ offset: true })
        .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'No fields to update' });

router.patch('/:id', protect, async (req, res) => {
    if (!UUID_RE.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    const parsed = expenseUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: parsed.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
        });
    }

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
        console.error('Error updating expense:', error);
        return res.status(500).json({ success: false, message: 'Server error updating expense' });
    }
    if (!expense) {
        return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, expense });
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
// @access  Protected
// ---------------------------------------------------------------------------
router.delete('/:id', protect, async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(String(id || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid expense id' });
    }

    // `select()` lets us tell "deleted" apart from "was never yours", instead
    // of reporting success for an id that belongs to someone else.
    const { data: deleted, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('Error deleting expense:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting expense' });
    }
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true });
});

module.exports = router;
