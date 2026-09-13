const test = require('node:test');
const assert = require('node:assert/strict');

const { toCsv, escapeCell, formatDate } = require('../lib/csv');

test('emits a header row even with no expenses', () => {
    const csv = toCsv([]);
    assert.equal(csv.split('\r\n')[0],
        'Date,Amount (INR),Category,Description,Source,Round-up saved (INR),Logged at,ID');
    assert.equal(csv.split('\r\n').filter(Boolean).length, 1);
});

test('writes a normal expense row', () => {
    const csv = toCsv([{
        id: 'abc-123',
        occurred_at: '2026-04-15T06:30:00Z',
        created_at: '2026-04-15T06:31:00Z',
        amount: 250.5,
        category: 'Food',
        description: 'Lunch',
        source: 'manual',
        roundup_chillar: 4.5,
    }]);
    const row = csv.split('\r\n')[1];
    assert.equal(row, '2026-04-15 12:00,250.50,Food,Lunch,manual,4.50,2026-04-15 12:01,abc-123');
});

test('dates are rendered in IST, not UTC', () => {
    // 18:30Z is midnight IST the following day.
    assert.equal(formatDate('2026-04-15T18:30:00Z'), '2026-04-16 00:00');
});

test('quotes fields containing commas, quotes or newlines', () => {
    assert.equal(escapeCell('Dinner, drinks'), '"Dinner, drinks"');
    assert.equal(escapeCell('The "good" place'), '"The ""good"" place"');
    assert.equal(escapeCell('line one\nline two'), '"line one\nline two"');
    assert.equal(escapeCell('plain'), 'plain');
});

test('a description with a comma survives a round trip', () => {
    const csv = toCsv([{ amount: 10, description: 'Chai, samosa, and a "deal"', category: 'Food' }]);
    const row = csv.split('\r\n')[1];
    // Field 4 is the description; splitting naively must NOT yield 8 fields.
    assert.ok(row.includes('"Chai, samosa, and a ""deal"""'));
});

test('neutralises spreadsheet formula injection', () => {
    // A cell starting with = + - or @ is executed as a formula by Excel,
    // LibreOffice and Google Sheets.
    for (const payload of [
        '=HYPERLINK("http://evil.example","click")',
        '+1+1',
        '-2+3',
        '@SUM(A1:A9)',
    ]) {
        const cell = escapeCell(payload);
        assert.ok(cell.startsWith("'") || cell.startsWith('"\''),
            `formula payload must be prefixed as text: ${payload} -> ${cell}`);
    }
});

test('handles missing and null fields without throwing', () => {
    const csv = toCsv([{}, { amount: null, description: undefined }]);
    assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
    assert.ok(csv.includes('0.00'));
});

test('falls back to created_at when occurred_at is absent', () => {
    // Rows written before the occurred_at migration.
    const csv = toCsv([{ created_at: '2026-01-02T06:30:00Z', amount: 1 }]);
    assert.ok(csv.includes('2026-01-02 12:00'));
});

test('an invalid date renders empty rather than "Invalid Date"', () => {
    assert.equal(formatDate('not-a-date'), '');
    assert.equal(formatDate(null), '');
});
