const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { pdfImportLimiter } = require('../middleware/rateLimits');
const gemini = require('../lib/gemini');
const { applyProfileStats, roundupFor } = require('../lib/profileStats');
const { validateTransactions, removeDuplicates } = require('../lib/statementImport');
const telemetry = require('../lib/opsTelemetry');

const importFailed = (code) => telemetry.recordEvent('pdf_import_failed', { route: 'POST /api/pdf-import', code });

/**
 * POST /api/pdf-import — Pro only.
 *
 * The PDF is held in memory only for the duration of the request and is never
 * written to disk or storage. Its extracted text (up to 15,000 characters) is
 * sent to Google's Gemini API to identify debit transactions — this must be
 * disclosed in the privacy policy and Data Safety form.
 */

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(Object.assign(new Error('Only PDF files are allowed'), { status: 415, expose: true }));
    },
});

/** Multer errors become 4xx JSON instead of reaching the 500 handler. */
function acceptPdf(req, res, next) {
    upload.single('pdf')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, message: 'That file is larger than 10 MB.' });
        }
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: 'Please upload a single PDF file.' });
        }
        return res.status(err.status || 400).json({ success: false, message: err.expose ? err.message : 'Invalid upload' });
    });
}

router.post('/', protect, pdfImportLimiter, proGate('pdf_import'), acceptPdf, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
    }
    // MIME type is client-controlled; check the file signature too.
    if (req.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return res.status(400).json({ success: false, message: 'Invalid PDF file' });
    }
    if (!gemini.isConfigured()) {
        return res.status(503).json({ success: false, message: 'Statement import is temporarily unavailable.' });
    }

    try {
        const pdfParse = require('pdf-parse');
        const rawText = (await pdfParse(req.file.buffer)).text || '';
        if (rawText.trim().length < 50) {
            return res.status(422).json({
                success: false,
                message: 'Could not read text from this PDF. Scanned or password-protected statements are not supported.',
            });
        }

        const prompt = `Extract every DEBIT (money going out) transaction from this Indian bank statement text.
Ignore credits, balances, and totals. Never output account numbers, card numbers, UPI IDs or PAN.
Return ONLY raw JSON, no markdown:
{"bankName": "name", "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD",
 "transactions": [{"date": "YYYY-MM-DD", "description": "payee", "amount": 123.45, "category": "Food|Transport|Shopping|Recharge|Entertainment|Rent|Other"}]}

STATEMENT TEXT:
${rawText.substring(0, 15000)}`;

        let parsed;
        try {
            const replyText = await gemini.generateText(prompt, { maxOutputTokens: 8192, temperature: 0 });
            parsed = JSON.parse(replyText.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (e) {
            // AI output can contain statement data; never log it.
            console.error('PDF import parse failed:', e.code || e.name);
            importFailed(e.code === 'AI_TRUNCATED' ? 'AI_TRUNCATED' : 'AI_PARSE');
            return res.status(502).json({ success: false, message: 'Could not read this statement. Try a different export format.' });
        }

        const now = new Date();
        const { valid, rejected } = validateTransactions(parsed?.transactions, now);
        if (valid.length === 0) {
            return res.status(422).json({ success: false, message: 'No valid debit transactions were found in this statement.' });
        }

        // Existing expenses in the statement's date range, for duplicate checks.
        const times = valid.map((t) => new Date(t.occurredAt).getTime());
        const from = new Date(Math.min(...times) - 24 * 60 * 60 * 1000).toISOString();
        const to = new Date(Math.max(...times) + 24 * 60 * 60 * 1000).toISOString();
        const { data: existing, error: existingError } = await supabase
            .from('expenses')
            .select('occurred_at, amount, description')
            .eq('user_id', req.user.id)
            .gte('occurred_at', from)
            .lte('occurred_at', to);
        if (existingError) {
            console.error('PDF import duplicate check failed:', existingError.message);
            importFailed('DB_READ');
            return res.status(500).json({ success: false, message: 'Failed to import transactions' });
        }

        const { fresh, duplicates } = removeDuplicates(valid, existing || []);

        let inserted = [];
        if (fresh.length > 0) {
            const rows = fresh.map((t) => ({
                user_id: req.user.id,
                amount: t.amount,
                category: t.category,
                description: t.description,
                roundup_chillar: roundupFor(t.amount),
                source: 'pdf_import',
                occurred_at: t.occurredAt,
            }));
            const { data, error: insertError } = await supabase.from('expenses').insert(rows).select('id, amount, roundup_chillar');
            if (insertError) {
                console.error('PDF import insert failed:', insertError.message);
                importFailed('DB_WRITE');
                return res.status(500).json({ success: false, message: 'Failed to save transactions' });
            }
            inserted = data || [];
        }

        const totalChillar = inserted.reduce((s, r) => s + Number(r.roundup_chillar || 0), 0);
        if (totalChillar > 0) {
            // Importing history does not count as today's logging activity.
            await applyProfileStats(req.user.id, { chillar: totalChillar, advance: false });
        }

        const isDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
        await supabase.from('pdf_imports').insert({
            user_id: req.user.id,
            bank_name: String(parsed.bankName || 'Unknown').slice(0, 100),
            transactions_count: inserted.length,
            period_start: isDate(parsed.periodStart),
            period_end: isDate(parsed.periodEnd),
            status: 'completed',
        });

        res.json({
            success: true,
            imported: inserted.length,
            duplicatesSkipped: duplicates,
            invalidRowsSkipped: rejected,
            bankName: parsed.bankName || 'Unknown',
            periodStart: isDate(parsed.periodStart),
            periodEnd: isDate(parsed.periodEnd),
            totalAmount: Math.round(inserted.reduce((s, r) => s + Number(r.amount || 0), 0)),
            totalChillar: Math.round(totalChillar * 100) / 100,
        });
    } catch (error) {
        console.error('PDF import error:', error.name);
        importFailed(error.name || 'UNEXPECTED');
        res.status(500).json({ success: false, message: 'Failed to process PDF' });
    }
});

// @route GET /api/pdf-import/history
router.get('/history', protect, async (req, res) => {
    const { data, error } = await supabase
        .from('pdf_imports')
        .select('id, bank_name, transactions_count, period_start, period_end, status, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch import history' });
    }
    res.json({ success: true, imports: data || [] });
});

module.exports = router;
