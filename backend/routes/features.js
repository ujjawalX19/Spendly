const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { allFlags } = require('../lib/featureFlags');
const { purchasesEnabled } = require('../lib/entitlements');

// @route GET /api/features — which optional features the app should show.
// Display only: every feature route enforces its own flag server-side.
//
// expenseIdempotency: POST /api/expenses accepts `client_ref` for payments the
// phone detected, so the app may retry an upload safely. An older server does
// not send it, and the app then leaves the field out (the schema is strict).
router.get('/', protect, (req, res) => {
    res.json({ success: true, features: { ...allFlags(), purchasesAvailable: purchasesEnabled(), expenseIdempotency: true } });
});

module.exports = router;
