// Gemini failures must be diagnosable from the logs (status, Google's reason,
// model, key shape) without ever logging the key, the prompt or user data.
const test = require('node:test');
const assert = require('node:assert/strict');

const { describeError, keyShape, telemetryCode, report } = require('../lib/geminiDiagnostics');

const FAKE_KEY = 'AIzaSyTESTONLYtestonlyTESTONLY12345abcd';

// The shape @google/genai 1.x throws: name ApiError, numeric status, JSON body as message.
function apiError(status, body) {
    const err = new Error(JSON.stringify({ error: body }));
    err.name = 'ApiError';
    err.status = status;
    return err;
}

test('an invalid key is reported as 400 API_KEY_INVALID', () => {
    const err = apiError(400, {
        code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
    });
    const d = describeError(err);
    assert.equal(d.status, 400);
    assert.equal(d.apiStatus, 'INVALID_ARGUMENT');
    assert.equal(d.reason, 'API_KEY_INVALID');
    assert.equal(d.reachedGemini, true);
    assert.equal(telemetryCode(d), '400:API_KEY_INVALID');
});

test('a bad model name is distinguishable from a bad key', () => {
    const d = describeError(apiError(400, { code: 400, message: '* GenerateContentRequest.model: unexpected model name format', status: 'INVALID_ARGUMENT' }));
    assert.equal(telemetryCode(d), '400:INVALID_ARGUMENT');
    assert.match(d.message, /model name format/);
});

test('timeouts and network failures say the request did not get an answer', () => {
    const d = describeError(Object.assign(new Error('AI request timed out'), { code: 'AI_TIMEOUT' }));
    assert.equal(d.reachedGemini, false);
    assert.equal(telemetryCode(d), 'AI_TIMEOUT');
});

test('key shape reveals only length, last 4 characters and formatting problems', () => {
    assert.deepEqual(keyShape(undefined), { keyPresent: false });
    const s = keyShape(FAKE_KEY);
    assert.equal(s.keyLength, FAKE_KEY.length);
    assert.equal(s.keySuffix, 'abcd');
    assert.equal(s.keyHasQuotes, false);
    assert.equal(s.keyHasOuterWhitespace, false);
    assert.equal(keyShape(`"${FAKE_KEY}"`).keyHasQuotes, true);
    assert.equal(keyShape(` ${FAKE_KEY}\n`).keyHasOuterWhitespace, true);
});

test('the logged line never contains the key or the prompt', () => {
    const saved = process.env.GEMINI_API_KEY;
    const original = console.error;
    const lines = [];
    process.env.GEMINI_API_KEY = FAKE_KEY;
    console.error = (...args) => lines.push(args.join(' '));
    try {
        const err = apiError(400, { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' });
        err.prompt = 'I spent ₹4,200 on food'; // must not leak even if attached
        report(err, { model: 'gemini-3.5-flash', timeoutMs: 8000 });
    } finally {
        console.error = original;
        if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;
    }
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0], new RegExp(FAKE_KEY.slice(0, 20)));
    assert.doesNotMatch(lines[0], /₹|spent/);
    assert.match(lines[0], /"status":400/);
    assert.match(lines[0], /"model":"gemini-3.5-flash"/);
    assert.match(lines[0], /"keySuffix":"abcd"/);
});
