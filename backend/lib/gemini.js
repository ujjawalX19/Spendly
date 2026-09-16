/**
 * gemini — the one place that talks to Google's Gemini API.
 *
 * The model name was previously hardcoded as 'gemini-2.0-flash' in five route
 * files. Google shut that model down on 2026-06-01, which silently broke
 * receipt scanning, PDF import and the coach at once. Keeping the model and
 * the token budget here means a future retirement is a one-line env change.
 *
 * Routes call `generateText()` and never construct a client themselves, which
 * also lets tests replace this module with a stub.
 */

const { GoogleGenAI } = require('@google/genai');
const telemetry = require('./opsTelemetry');
const { withTimeout } = require('./timeout');
const diagnostics = require('./geminiDiagnostics');

// Verify against https://ai.google.dev/gemini-api/docs/models before release.
const DEFAULT_MODEL = 'gemini-3.5-flash';

let client = null;

function isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
}

function getClient() {
    if (!isConfigured()) return null;
    if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return client;
}

function modelName() {
    return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Generate text with a hard output budget.
 *
 * @param {string|Array} contents  prompt, or prompt parts (e.g. inline image)
 * @param {{maxOutputTokens?: number, temperature?: number, timeoutMs?: number}} [options]
 * @returns {Promise<string>} the model's text ('' when it returned nothing)
 */
async function generateText(contents, options = {}) {
    const started = Date.now();
    try {
        const text = await callModel(contents, options);
        telemetry.recordAiSuccess(Date.now() - started);
        return text;
    } catch (err) {
        // Status and Google's reason (e.g. 400:API_KEY_INVALID), never the prompt.
        telemetry.recordAiFailure(diagnostics.report(err, { model: modelName(), timeoutMs: options.timeoutMs }));
        throw err;
    }
}

/**
 * One tiny request at startup, so a bad key or model shows in the logs and in
 * ops_events (type ai_self_check) right after a deploy instead of on a user's
 * question. Uses a fixed prompt with no user data; never throws.
 */
async function selfCheck() {
    if (!isConfigured()) {
        console.warn('Gemini self-check: GEMINI_API_KEY is not set; AI wording is off.');
        return { ok: false, code: 'AI_NOT_CONFIGURED' };
    }
    const model = modelName();
    // Render sets RENDER=true, so production checks can be told from local runs.
    const where = process.env.RENDER ? 'render' : 'local';
    try {
        const text = await callModel('Reply with the word OK.', { maxOutputTokens: 10, timeoutMs: 15000 });
        const shape = diagnostics.keyShape();
        console.log('Gemini self-check:', JSON.stringify({ ok: true, model, reply: String(text).trim().slice(0, 20), keyLength: shape.keyLength, keySuffix: shape.keySuffix }));
        telemetry.recordEvent('ai_self_check', { severity: 'info', code: `ok:${model}@${where}`.slice(0, 60) });
        return { ok: true, model };
    } catch (err) {
        const code = diagnostics.report(err, { model, timeoutMs: 15000, where: `selfCheck@${where}` });
        telemetry.recordEvent('ai_self_check', { severity: 'error', code: `${code.slice(0, 52)}@${where}` });
        return { ok: false, code };
    }
}

async function callModel(contents, { maxOutputTokens = 800, temperature, timeoutMs = 30000 } = {}) {
    const ai = getClient();
    if (!ai) throw Object.assign(new Error('AI service not configured'), { code: 'AI_NOT_CONFIGURED' });

    // A hung provider call must not hold the request open: abort it and let
    // the caller fall back to the calculated answer.
    const controller = new AbortController();
    const response = await withTimeout(ai.models.generateContent({
        model: modelName(),
        contents,
        config: {
            maxOutputTokens,
            // Gemini 2.5+/3.x "think" before answering, and thinking tokens count
            // against maxOutputTokens. With thinking on, short budgets came back
            // empty (finishReason MAX_TOKENS), so every coach reply silently fell
            // back to the same canned text. Our answers are drafted
            // deterministically, so thinking adds cost without value.
            thinkingConfig: { thinkingBudget: 0 },
            ...(temperature !== undefined ? { temperature } : {}),
            abortSignal: controller.signal,
        },
    }), timeoutMs, () => controller.abort());
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === 'MAX_TOKENS') {
        // A cut-off answer is worse than the deterministic fallback.
        throw Object.assign(new Error('AI reply truncated'), { code: 'AI_TRUNCATED' });
    }
    return response.text || '';
}

module.exports = { isConfigured, generateText, selfCheck, modelName, DEFAULT_MODEL };
