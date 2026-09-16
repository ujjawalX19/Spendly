const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { telemetryLimiter } = require('../middleware/rateLimits');
const { validationError } = require('../lib/validation');
const appEvents = require('../lib/appEvents');

/**
 * POST /api/telemetry/events — app-reported product events.
 *
 * Body: { installId, platform, appVersion?, events: [{ name, at?, props? }] }
 *
 * Anonymous by design: a first launch happens before anyone signs in. A valid
 * bearer token, when present, links the install and its events to that
 * account; an invalid or expired one is ignored rather than rejected, so a
 * stale session never loses a crash report (and never counts toward the
 * auth-failure limiter).
 *
 * Only allow-listed event names and properties are stored (lib/appEvents.js).
 * Responses never echo stored data. Always 202 once validated, even if the
 * telemetry tables are unavailable: telemetry must never break the app.
 */
router.post('/events', telemetryLimiter, async (req, res) => {
    const parsed = appEvents.batchSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error, 'Invalid telemetry batch');

    let userId = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        try {
            const { data, error } = await supabase.auth.getUser(header.slice(7).trim());
            if (!error && data?.user?.id) userId = data.user.id;
        } catch { /* anonymous */ }
    }

    let result = { accepted: 0, stored: false };
    try {
        result = await appEvents.ingestClientBatch(parsed.data, { userId });
    } catch (err) {
        console.error('Telemetry ingest failed:', err.name || 'Error');
    }
    res.status(202).json({ success: true, accepted: result.accepted });
});

module.exports = router;
