/**
 * receiptParse — turns the model's reply for a receipt photo into an amount,
 * a merchant and items. Pure, so every odd reply seen in practice can be
 * tested (tests/receiptParse.test.js).
 *
 * The reply is asked to be raw JSON with numbers, but models also answer with
 * code fences, a sentence before the JSON, or amounts as text ("₹1,234.50",
 * "Rs. 450/-"). A scan must not fail, or save the wrong amount, because of
 * that.
 */

const MAX_AMOUNT = 10_000_000;

/**
 * An amount from a number or a string such as "₹1,234.50", "Rs. 450/-",
 * "1,23,456.00" or "INR 99". Returns null when there is no usable amount.
 */
function toAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? round2(value) : null;
    if (typeof value !== 'string') return null;
    // A negative figure (a discount, a refund line) is not a total.
    if (/^\s*[-−]/.test(value)) return null;
    // Keep digits and separators; drop currency words and symbols ("Rs.", "₹",
    // "/-"), then the separators those leave at the ends ("Rs. 450" → ".450").
    const cleaned = value.replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
    if (!/\d/.test(cleaned)) return null;
    // Commas are thousands separators in Indian and Western notation.
    const withoutCommas = cleaned.replace(/,/g, '');
    // "450." or "1.234.50" (stray dots): keep only the last dot as the decimal point.
    const parts = withoutCommas.split('.');
    const normalised = parts.length > 2 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : withoutCommas;
    const n = Number.parseFloat(normalised);
    return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

/** The JSON object in a model reply: fences removed, text around it ignored. Throws if there is none. */
function extractJson(text) {
    const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw Object.assign(new Error('No JSON object in the reply'), { code: 'RECEIPT_NO_JSON' });
    return JSON.parse(raw.slice(start, end + 1));
}

/**
 * @param {string} replyText  the model's reply
 * @returns {{ amount: number, merchant: string, items: {itemName: string, price: number}[], totalFrom: 'total'|'items' } | null}
 *          null when the receipt has no usable amount
 */
function receiptFromReply(replyText) {
    const data = extractJson(replyText);
    const items = Array.isArray(data?.items)
        ? data.items.slice(0, 50)
            .map((i) => ({ itemName: String(i?.itemName || '').slice(0, 100), price: toAmount(i?.price) || 0 }))
            .filter((i) => i.itemName || i.price)
        : [];

    let amount = toAmount(data?.scannedTotal ?? data?.total ?? data?.totalAmount);
    let totalFrom = 'total';
    if (amount === null) {
        // No readable total (torn or cropped receipt): the items, if any, add up to it.
        const sum = round2(items.reduce((s, i) => s + i.price, 0));
        if (sum > 0) {
            amount = sum;
            totalFrom = 'items';
        }
    }
    if (amount === null || amount > MAX_AMOUNT) return null;

    const merchant = String(data?.merchantName || '').trim().slice(0, 100) || 'Unknown';
    return { amount, merchant, items, totalFrom };
}

module.exports = { toAmount, extractJson, receiptFromReply, MAX_AMOUNT };
