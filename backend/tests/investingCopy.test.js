// Investing answers are education about kinds of product and time horizons.
// They never give an equity/debt percentage split, a named product, or a
// promised return: a ratio sized to a person's own money reads as an
// allocation recommendation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lib = (f) => fs.readFileSync(path.join(__dirname, '../lib', f), 'utf8');
const FILES = ['investingGuide.js', 'investmentDecision.js', 'financialInsights.js', 'moneyDecisions.js', 'coachContent.js'];

// The text people can be shown: string literals, without comments.
function strings(source) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]);
}

test('no equity/debt percentage split is suggested', () => {
    for (const f of FILES) {
        for (const s of strings(lib(f))) {
            assert.doesNotMatch(s, /\d+\s?%\s+(in\s+)?(equity|debt|lower-risk|deposits|stocks|shares)/i, `${f}: ${s.slice(0, 80)}`);
        }
    }
});

test('no promised or guaranteed return, and no "best" product', () => {
    for (const f of FILES) {
        for (const s of strings(lib(f))) {
            // "never guaranteed" / "not a guarantee" are warnings, and are allowed.
            if (/\b(never|not|no|without)\b[^.]{0,40}guarant/i.test(s)) continue;
            // Words the question is searched for, not words shown.
            if (/^\\b\(|\|guaranteed\)/.test(s)) continue;
            assert.doesNotMatch(s, /guaranteed return|assured return|risk[- ]free return|double your money|best (fund|stock|scheme|sip)\b/i, `${f}: ${s.slice(0, 80)}`);
        }
    }
});

test('the assistant is told: education only, no named products, not a registered adviser', () => {
    const route = fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8');
    assert.match(route, /no named stock, fund scheme, ETF, policy, broker, app or platform/);
    assert.match(route, /no promised returns/);
    assert.match(lib('investingGuide.js'), /not a SEBI-registered investment adviser/);
});
