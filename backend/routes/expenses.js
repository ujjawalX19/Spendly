const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let { streak_current, streak_last_log, streak_longest, total_chillar } = profile;

    // Streak logic
    let newStreak = streak_current;
    if (streak_last_log) {
        const lastLog = new Date(streak_last_log);
        const lastLogDay = new Date(lastLog.getFullYear(), lastLog.getMonth(), lastLog.getDate());
        const diffDays = Math.round((today - lastLogDay) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Already logged today — streak unchanged
        } else if (diffDays === 1) {
            // Consecutive day — increment streak
            newStreak = streak_current + 1;
        } else {
            // Streak broken — reset
            newStreak = 1;
        }
    } else {
        // First ever log
        newStreak = 1;
    }

    const newLongest = newStreak > streak_longest ? newStreak : streak_longest;
    const newChillar = parseFloat(total_chillar) + chillarToAdd;

    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({
            total_chillar: newChillar,
            streak_current: newStreak,
            streak_longest: newLongest,
            streak_last_log: now.toISOString()
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
router.get('/', protect, async (req, res) => {
    const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching expenses:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching expenses' });
    }

    res.json({ success: true, expenses });
});

// ---------------------------------------------------------------------------
// @route   POST /api/expenses
// @desc    Log a manual expense and update streak + chillar
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/', protect, async (req, res) => {
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
            source: 'manual'
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
router.post('/scan', protect, async (req, res) => {
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
            console.error('Failed to parse Gemini output as JSON:', replyText);
            return res.status(500).json({
                success: false,
                message: 'Failed to parse receipt correctly',
                rawResponse: replyText
            });
        }

        const totalAmount = parseFloat(receiptData.scannedTotal) || 0;
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
                receipt_data: {
                    merchantName: receiptData.merchantName,
                    items: receiptData.items || [],
                    scannedTotal: totalAmount,
                    rawResponse: replyText
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
// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
// @access  Protected
// ---------------------------------------------------------------------------
router.delete('/:id', protect, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Error deleting expense:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting expense' });
    }

    res.json({ success: true });
});

module.exports = router;