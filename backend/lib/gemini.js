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
    try {
        const text = await callModel(contents, options);
        telemetry.recordAiSuccess();
        return text;
    } catch (err) {
        // Only a code or error class: provider messages can echo the prompt.
        telemetry.recordAiFailure(err.code || err.status || err.name);
        throw err;
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

module.exports = { isConfigured, generateText, modelName, DEFAULT_MODEL };
