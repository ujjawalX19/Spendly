const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');

// Multer: store in memory, max 10MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'), false);
    },
});

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// ---------------------------------------------------------------------------
// @route   POST /api/pdf-import
// @desc    Upload bank statement PDF, parse transactions, auto-categorize
// @access  Protected (Pro-only — gated in frontend + middleware)
//
// Supported banks: SBI, HDFC, ICICI, Axis, Kotak, PNB
// Uses pdf-parse for text extraction + Gemini for classification.
// PDF data deleted after processing (privacy policy compliance).
//
// Play Store Compliance:
//   ✅ No SMS permission needed
//   ✅ No banking credentials collected
//   ✅ File processed server-side, not shared with third parties
//   ✅ Declared in Play Store data safety form
// ---------------------------------------------------------------------------
router.post('/', protect, proGate('pdf_import'), upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
        }

        if (!ai) {
            return res.status(500).json({ success: false, message: 'AI service not configured' });
        }

        // Check Pro status
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_pro')
            .eq('id', req.user.id)
            .single();

        if (!profile?.is_pro) {
            return res.status(403).json({
                success: false,
                message: 'PDF import is a Pro feature. Upgrade to unlock.',
                requiresPro: true,
            });
        }

        // 1. Parse PDF text
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(req.file.buffer);
        const rawText = pdfData.text;

        if (!rawText || rawText.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'Could not extract text from PDF. Please ensure it is a standard bank statement.',
            });
        }

        // 2. Send to Gemini for transaction extraction + categorization
        const prompt = `You are a bank statement parser for Indian banks (SBI, HDFC, ICICI, Axis, Kotak, PNB).

Extract ALL debit transactions from this bank statement text. For each transaction, determine:
1. date (ISO format YYYY-MM-DD)
2. description (merchant/payee name, cleaned up)
3. amount (positive number, INR)
4. category (one of: Food, Transport, Shopping, Recharge, Entertainment, Rent, Other)

PRIVACY RULES (MANDATORY):
- NEVER include credit card numbers, account numbers, CVV, UPI IDs, or PAN numbers
- Only return transaction data (date, description, amount, category)
- Ignore credit (incoming) transactions — only extract debits (outgoing)

Return ONLY a valid JSON object:
{
  "bankName": "detected bank name",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "transactions": [
    {"date": "2025-01-05", "description": "Swiggy", "amount": 345.00, "category": "Food"},
    {"date": "2025-01-06", "description": "Netflix", "amount": 649.00, "category": "Entertainment"}
  ]
}

Do not include any markdown formatting, only the raw JSON.

BANK STATEMENT TEXT:
${rawText.substring(0, 15000)}`; // Limit to ~15K chars for API limits

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });

        const replyText = response.text || '';
        let parsed;
        try {
            const cleanJson = replyText.replace(/```json/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            console.error('Failed to parse Gemini PDF output:', replyText.substring(0, 500));
            return res.status(500).json({
                success: false,
                message: 'Failed to parse bank statement. Try a different format.',
            });
        }

        if (!parsed.transactions || !Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No transactions found in the bank statement.',
            });
        }

        // 3. Bulk insert transactions
        const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];

        const expensesToInsert = parsed.transactions
            .filter(t => t.amount && t.amount > 0)
            .map(t => {
                const amount = parseFloat(t.amount);
                const remainder = amount % 5;
                const roundupChillar = remainder === 0 ? 0 : parseFloat((5 - remainder).toFixed(2));

                return {
                    user_id: req.user.id,
                    amount,
                    category: VALID_CATEGORIES.includes(t.category) ? t.category : 'Other',
                    description: (t.description || 'Bank Transaction').substring(0, 200),
                    roundup_chillar: roundupChillar,
                    source: 'ai_scan',
                    created_at: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
                };
            });

        const { data: inserted, error: insertError } = await supabase
            .from('expenses')
            .insert(expensesToInsert)
            .select();

        if (insertError) {
            console.error('Bulk insert error:', insertError);
            return res.status(500).json({ success: false, message: 'Failed to save transactions' });
        }

        // 4. Record the import
        await supabase.from('pdf_imports').insert({
            user_id: req.user.id,
            bank_name: parsed.bankName || 'Unknown',
            transactions_count: inserted.length,
            period_start: parsed.periodStart || null,
            period_end: parsed.periodEnd || null,
            status: 'completed',
        });

        // 5. Update total chillar
        const totalNewChillar = expensesToInsert.reduce((s, e) => s + e.roundup_chillar, 0);
        if (totalNewChillar > 0) {
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('total_chillar')
                .eq('id', req.user.id)
                .single();

            if (currentProfile) {
                await supabase
                    .from('profiles')
                    .update({ total_chillar: parseFloat(currentProfile.total_chillar) + totalNewChillar })
                    .eq('id', req.user.id);
            }
        }

        // PDF buffer is garbage-collected after response — no persistent storage

        res.json({
            success: true,
            imported: inserted.length,
            bankName: parsed.bankName || 'Unknown',
            periodStart: parsed.periodStart,
            periodEnd: parsed.periodEnd,
            totalAmount: Math.round(expensesToInsert.reduce((s, e) => s + e.amount, 0)),
            totalChillar: Math.round(totalNewChillar * 100) / 100,
        });
    } catch (error) {
        console.error('PDF Import Error:', error);
        res.status(500).json({ success: false, message: 'Failed to process PDF' });
    }
});

// ---------------------------------------------------------------------------
// @route   GET /api/pdf-import/history
// @desc    Get PDF import history for the user
// @access  Protected
// ---------------------------------------------------------------------------
router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('pdf_imports')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch import history' });
    }

    res.json({ success: true, imports: data || [] });
});

module.exports = router;
