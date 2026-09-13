const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFacts, composeAnswer, toText, classifyIntent } = require('../lib/financialInsights');
const { extractHorizonYears, futureValue } = require('../lib/investingGuide');

const now = new Date('2026-09-14T08:00:00Z');
const row = (daysAgo, amount, category = 'Food') => ({ amount, category, description: category, occurred_at: new Date(now - daysAgo * 864e5).toISOString() });
const expenses = Array.from({ length: 60 }, (_, i) => row(i * 2, 400));
const facts = buildFacts({ profile: { monthly_budget: 25000, investment_target: 3000 }, expenses, bills: [], now });
const ask = (q) => toText(composeAnswer(classifyIntent(q), facts, q));

test('investing answers change with the question instead of repeating', () => {
    const questions = [
        'Where should I invest my savings?',
        'How should I invest 5000 a month for 10 years?',
        'I want to buy a house in 2 years',
        'Should I buy crypto?',
        'How to save tax?',
        'What is a SIP?',
    ];
    const answers = questions.map(ask);
    assert.equal(new Set(answers).size, questions.length, 'every question should get a distinct answer');
});

test('horizon drives the suggested mix', () => {
    assert.match(ask('invest for 1 year'), /low-risk/);
    assert.match(ask('invest for 4 years'), /balanced mix/);
    assert.match(ask('invest for 15 years'), /mostly equity/);
    assert.equal(extractHorizonYears('in 18 months'), 1.5);
    assert.equal(extractHorizonYears('for retirement'), 20);
});

test('illustrations are computed from the amount and horizon in the question', () => {
    const text = ask('How should I invest 5000 a month for 10 years?');
    assert.match(text, /₹5,000/);
    assert.match(text, /₹6,00,000/);
    const expected = Math.round(futureValue(5000, 10, 0.10)).toLocaleString('en-IN');
    assert.ok(text.includes(`₹${expected}`), text);
    assert.match(text, /assumed/);
});

test('investing answers never name products or platforms and always carry the disclaimer', () => {
    for (const q of ['Where should I invest?', 'best mutual fund for 10 years', 'Should I buy crypto?', 'How to save tax?', 'retirement planning']) {
        const text = ask(q);
        for (const banned of ['UTI', 'Parag', 'Nifty 50 Index Fund', 'TCS', 'HDFC', 'Zerodha', 'Groww', 'Kuvera', 'Paytm', 'http', 'ref=']) {
            assert.ok(!text.includes(banned), `${q}: mentions ${banned}`);
        }
        assert.match(text, /not investment advice/, q);
    }
});
