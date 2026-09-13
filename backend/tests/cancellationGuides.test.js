const test = require('node:test');
const assert = require('node:assert/strict');

const { guideFor, normalise } = require('../lib/cancellationGuides');

test('matches merchant strings as they actually appear on statements', () => {
    // Real-world shapes: uppercase, suffixed with city/biller codes, punctuated.
    for (const raw of ['NETFLIX.COM', 'Netflix India', 'NETFLIX BILLING BANGALORE', 'netflix']) {
        const g = guideFor(raw);
        assert.equal(g.matched, true, raw);
        assert.equal(g.name, 'Netflix');
        assert.ok(g.url.includes('netflix.com'));
    }
});

test('matches services whose names vary', () => {
    assert.equal(guideFor('JIOHOTSTAR SUBSCRIPTION').name, 'JioHotstar');
    assert.equal(guideFor('Disney+ Hotstar').name, 'JioHotstar');
    assert.equal(guideFor('SWIGGY ONE MEMBERSHIP').name, 'Swiggy One');
    assert.equal(guideFor('Zomato Pro Renewal').name, 'Zomato Gold');
    assert.equal(guideFor('GOOGLE ONE 100GB').name, 'Google One');
});

test('every guide gives the user something to do', () => {
    for (const raw of ['Netflix', 'Spotify', 'Swiggy One', 'Cult.fit', 'something unknown']) {
        const g = guideFor(raw);
        assert.ok(Array.isArray(g.steps) && g.steps.length > 0, `no steps for ${raw}`);
    }
});

test('an unknown merchant still gets the two places that actually control it', () => {
    const g = guideFor('SOME RANDOM BILLER 4471');
    assert.equal(g.matched, false);
    const joined = g.steps.join(' ').toLowerCase();
    assert.match(joined, /play store/);
    assert.match(joined, /autopay|mandate/);
    // The thing people get wrong: uninstalling does not stop a UPI mandate.
    assert.match(g.note.toLowerCase(), /mandate/);
});

test('handles empty and junk input without throwing', () => {
    for (const raw of [null, undefined, '', '   ', '₹₹₹', 123]) {
        const g = guideFor(raw);
        assert.equal(g.matched, false);
        assert.ok(g.steps.length > 0);
    }
});

test('no guide links to a signup or referral page', () => {
    const { GUIDES } = require('../lib/cancellationGuides');
    for (const g of GUIDES) {
        if (!g.url) continue;
        assert.doesNotMatch(g.url, /ref=|refer|signup|join|utm_/i,
            `${g.name} must link to cancellation, not acquisition`);
    }
});

test('normalise strips the noise statements add', () => {
    assert.equal(normalise('NETFLIX.COM'), 'netflixcom');
    assert.equal(normalise('Cult .fit  '), 'cultfit');
    assert.equal(normalise(null), '');
});

test("short service names do not match inside unrelated words", () => {
    assert.equal(guideFor("DIFFICULT DELIVERIES PVT LTD").matched, false);
    assert.equal(guideFor("Pineapple Juice Centre").matched, false);
    assert.equal(guideFor("APPLE.COM/BILL").name, "Apple services");
});
