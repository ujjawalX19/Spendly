const express = require('express');
const router = express.Router();

/**
 * The oldest Android build still allowed to run. An app below it shows an
 * "Update Vittova" screen and asks Google Play for an immediate update.
 *
 *   MIN_SUPPORTED_ANDROID_VERSION_CODE   default 0 (nobody is blocked)
 *
 * Raise it only for a release people must not stay behind (a security fix, a
 * broken build), and only after the newer build is live on Google Play:
 * blocked users can do nothing until they can update.
 */
function minSupportedAndroidVersionCode() {
    // Digits only: "1e999" or "26abc" is a typing mistake, not a version.
    const raw = String(process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE || '').trim();
    if (!/^\d{1,9}$/.test(raw)) return 0;
    return Number(raw);
}

// @route GET /api/app-config — public: read before sign-in, holds nothing private.
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, android: { minSupportedVersionCode: minSupportedAndroidVersionCode() } });
});

module.exports = router;
module.exports.minSupportedAndroidVersionCode = minSupportedAndroidVersionCode;
