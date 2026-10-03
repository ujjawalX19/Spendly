// GET /api/app-config: the oldest Android build still allowed to run. Public
// (the app reads it before sign-in), and a bad setting must never lock
// everyone out.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');
const { minSupportedAndroidVersionCode } = require('../routes/appConfig');

test('the minimum version is public, off by default and set from the environment', async () => {
    const t = await startTestApp();
    try {
        delete process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE;
        let res = await t.request('GET', '/api/app-config');
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { success: true, android: { minSupportedVersionCode: 0 } });

        process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE = '26';
        res = await t.request('GET', '/api/app-config');
        assert.equal(res.body.android.minSupportedVersionCode, 26);
    } finally {
        delete process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE;
        await t.close();
    }
});

test('a mistyped setting blocks nobody', () => {
    try {
        for (const bad of ['', 'abc', '-5', '0', 'NaN', '1e999', ' ']) {
            process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE = bad;
            assert.equal(minSupportedAndroidVersionCode(), 0, JSON.stringify(bad));
        }
        process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE = ' 30 ';
        assert.equal(minSupportedAndroidVersionCode(), 30);
    } finally {
        delete process.env.MIN_SUPPORTED_ANDROID_VERSION_CODE;
    }
});
