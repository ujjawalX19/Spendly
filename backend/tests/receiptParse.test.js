// Receipt scanning: what the server makes of the model's reply. A scan must
// not fail, or save the wrong amount, because the reply was not perfectly tidy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toAmount, extractJson, receiptFromReply } = require('../lib/receiptParse');

test('amounts written as text are read: ₹, Rs., commas, Indian grouping', () => {
    assert.equal(toAmount(450), 450);
    assert.equal(toAmount(10.456), 10.46);
    assert.equal(toAmount('450'), 450);
    assert.equal(toAmount('₹1,234.50'), 1234.5);
    assert.equal(toAmount('Rs. 450/-'), 450);
    assert.equal(toAmount('INR 99'), 99);
    assert.equal(toAmount('1,23,456.00'), 123456);
    assert.equal(toAmount(' 2 499.00 '), 2499);
});

test('things that are not an amount are refused, never guessed', () => {
    for (const v of [null, undefined, '', 'N/A', 'total', 0, -5, '-120', NaN, Infinity, {}, [], true]) {
        assert.equal(toAmount(v), null, String(v));
    }
});

test('the JSON is found inside fences or surrounding text', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJson('Here is the receipt:\n{"a":{"b":2}}\nHope that helps.'), { a: { b: 2 } });
    assert.throws(() => extractJson('I could not read this image.'));
    assert.throws(() => extractJson(''));
    // Cut off mid-reply: an error, not a half-read receipt.
    assert.throws(() => extractJson('{"merchantName": "Store", "items": [{"itemName": "Tea", "pri'));
});

test('a normal receipt: total, merchant and items', () => {
    const r = receiptFromReply('{"merchantName":"Chai Point","items":[{"itemName":"Tea","price":20},{"itemName":"Samosa","price":30.5}],"scannedTotal":50.5}');
    assert.deepEqual(r, {
        amount: 50.5, merchant: 'Chai Point', totalFrom: 'total',
        items: [{ itemName: 'Tea', price: 20 }, { itemName: 'Samosa', price: 30.5 }],
    });
});

test('a total written as text is stored as the right number', () => {
    assert.equal(receiptFromReply('{"merchantName":"D-Mart","items":[],"scannedTotal":"₹1,234.50"}').amount, 1234.5);
    assert.equal(receiptFromReply('{"merchantName":"Cafe","scannedTotal":"Rs. 450/-"}').amount, 450);
    // Other key names models use.
    assert.equal(receiptFromReply('{"merchantName":"Cafe","total":"99"}').amount, 99);
});

test('no readable total: the items add up to it', () => {
    const r = receiptFromReply('{"merchantName":"Kirana","items":[{"itemName":"Rice","price":"₹120"},{"itemName":"Dal","price":80}],"scannedTotal":null}');
    assert.equal(r.amount, 200);
    assert.equal(r.totalFrom, 'items');
});

test('nothing usable: no expense is created', () => {
    assert.equal(receiptFromReply('{"merchantName":"?","items":[],"scannedTotal":0}'), null);
    assert.equal(receiptFromReply('{"merchantName":"?","items":[{"itemName":"x","price":"free"}]}'), null);
    assert.equal(receiptFromReply('{"scannedTotal":99999999999}'), null);
});

test('missing or odd fields never break the scan', () => {
    const r = receiptFromReply('{"scannedTotal":75,"items":"none","merchantName":""}');
    assert.deepEqual(r, { amount: 75, merchant: 'Unknown', items: [], totalFrom: 'total' });
    const long = receiptFromReply(JSON.stringify({ merchantName: 'M'.repeat(300), scannedTotal: 10, items: Array.from({ length: 80 }, (_, i) => ({ itemName: `i${i}`, price: 1 })) }));
    assert.equal(long.merchant.length, 100);
    assert.equal(long.items.length, 50);
});

// ── The route, end to end against the app with a stand-in for the model ──────
const { startTestApp } = require('./helpers/testApp');

const IMAGE = `data:image/jpeg;base64,${Buffer.alloc(600, 7).toString('base64')}`;

test('scan route: a tidy reply, a reply with text amounts, and a receipt with no total', async () => {
    const t = await startTestApp();
    try {
        await t.resetRateLimits();
        t.gemini.configured = true;
        const u = t.db.addUser({ monthly_budget: 10000, is_pro: true });

        t.gemini.reply = '{"merchantName":"Chai Point","items":[{"itemName":"Tea","price":20}],"scannedTotal":20}';
        let res = await t.request('POST', '/api/expenses/scan', { token: u.token, body: { imageBase64: IMAGE } });
        assert.equal(res.status, 201);
        assert.equal(res.body.expense.amount, 20);
        assert.equal(res.body.expense.source, 'ai_scan');
        assert.equal(res.body.expense.description, 'Receipt from Chai Point');

        // Fenced, with the total as text: the stored amount is the right number.
        t.gemini.reply = 'Here you go:\n```json\n{"merchantName":"D-Mart","items":[],"scannedTotal":"₹1,234.50"}\n```';
        res = await t.request('POST', '/api/expenses/scan', { token: u.token, body: { imageBase64: IMAGE } });
        assert.equal(res.status, 201);
        assert.equal(res.body.expense.amount, 1234.5);

        // No total, but items: their sum.
        t.gemini.reply = '{"merchantName":"Kirana","items":[{"itemName":"Rice","price":"120"},{"itemName":"Dal","price":80}]}';
        res = await t.request('POST', '/api/expenses/scan', { token: u.token, body: { imageBase64: IMAGE } });
        assert.equal(res.status, 201);
        assert.equal(res.body.expense.amount, 200);

        // Nothing usable: a clear message, and no expense is saved.
        const before = (t.db.tables.expenses || []).length;
        t.gemini.reply = '{"merchantName":"?","items":[],"scannedTotal":null}';
        res = await t.request('POST', '/api/expenses/scan', { token: u.token, body: { imageBase64: IMAGE } });
        assert.equal(res.status, 422);
        assert.match(res.body.message, /couldn't find the total/);
        assert.equal((t.db.tables.expenses || []).length, before);

        // Not a receipt at all.
        t.gemini.reply = 'I cannot see a receipt in this image.';
        res = await t.request('POST', '/api/expenses/scan', { token: u.token, body: { imageBase64: IMAGE } });
        assert.equal(res.status, 502);
        assert.match(res.body.message, /couldn't read that receipt/);
        assert.equal((t.db.tables.expenses || []).length, before);
    } finally {
        await t.close();
    }
});
