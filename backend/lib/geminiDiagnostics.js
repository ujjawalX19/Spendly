/**
 * geminiDiagnostics — safe detail about why a Gemini call failed.
 *
 * Production logged only "ApiError", which cannot tell a bad key from a bad
 * model name. This reports the HTTP status, Google's error status and reason
 * (e.g. 400 INVALID_ARGUMENT API_KEY_INVALID), the model, and the *shape* of
 * the configured key: present, length, last 4 characters, stray whitespace or
 * quotes. It never includes the key itself, prompts, or user data.
 */

const MESSAGE_CHARS = 160;

/** Parse the JSON body the @google/genai SDK puts in ApiError.message. */
function describeError(err) {
    const status = Number.isInteger(err?.status) ? err.status : null;
    let apiStatus = null;
    let reason = null;
    let message = null;
    try {
        const body = JSON.parse(err.message).error || {};
        apiStatus = typeof body.status === 'string' ? body.status : null;
        reason = (body.details || []).map((d) => d && d.reason).filter(Boolean).join(',') || null;
        message = typeof body.message === 'string' ? body.message : null;
    } catch {
        // Not a JSON provider body: a network error, timeout or local failure.
    }
    return {
        name: err?.name || 'Error',
        code: err?.code || null,
        status,
        apiStatus,
        reason,
        // Google's own text ("API key not valid…", "unexpected model name
        // format"), trimmed. Keys and prompts are not part of these messages.
        message: message ? message.slice(0, MESSAGE_CHARS) : null,
        // An HTTP status means the request reached Google and was answered.
        reachedGemini: status !== null,
    };
}

function keyShape(raw = process.env.GEMINI_API_KEY) {
    if (!raw) return { keyPresent: false };
    const trimmed = raw.trim();
    return {
        keyPresent: true,
        keyLength: raw.length,
        keySuffix: trimmed.slice(-4),
        keyHasOuterWhitespace: trimmed.length !== raw.length,
        keyHasQuotes: /^["'`]|["'`]$/.test(trimmed),
    };
}

/** Short code for telemetry (ops_events.code is at most 60 characters). */
function telemetryCode(d) {
    const parts = [d.status || d.code || d.name, d.reason || d.apiStatus].filter(Boolean);
    return parts.join(':').slice(0, 60);
}

/**
 * Log one safe diagnostic line and return the telemetry code.
 * @param {Error} err
 * @param {{ model: string, timeoutMs?: number, where?: string }} ctx
 */
function report(err, { model, timeoutMs, where = 'generateText' } = {}) {
    const d = describeError(err);
    console.error('Gemini diagnostic:', JSON.stringify({ where, model, timeoutMs: timeoutMs ?? null, ...d, ...keyShape() }));
    return telemetryCode(d);
}

module.exports = { describeError, keyShape, telemetryCode, report };
