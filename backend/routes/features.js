const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { allFlags } = require('../lib/featureFlags');
const { purchasesEnabled } = require('../lib/entitlements');

// @route GET /api/features — which optional features the app should show.
// Display only: every feature route enforces its own flag server-side.
router.get('/', protect, (req, res) => {
    res.json({ success: true, features: { ...allFlags(), purchasesAvailable: purchasesEnabled() } });
});

module.exports = router;
