/**
 * csv — turn expense rows into a spreadsheet file a user can actually open.
 *
 * Two things here are easy to get wrong and both matter:
 *
 * 1. Quoting. A description like `Dinner, "the good place"` must survive a
 *    round trip. Fields containing a comma, quote, or newline are quoted and
 *    internal quotes doubled, per RFC 4180.
 *
 * 2. Formula injection. Excel, LibreOffice and Google Sheets treat a cell
 *    beginning with = + - or @ as a formula. A description of
 *    `=HYPERLINK("http://evil","click")` — which a user can type, or which
 *    could arrive from a parsed receipt — becomes live content in whatever
 *    spreadsheet the file is opened in. Such cells are prefixed with a single
 *    quote so they are read as text.
 */

const RISKY_LEADING = /^[=+\-@\t\r]/;

function escapeCell(value) {
    if (value === null || value === undefined) return '';

    let s = String(value);

    // Neutralise spreadsheet formula injection.
    if (RISKY_LEADING.test(s)) s = `'${s}`;

    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** Format a timestamp as a local ISO-like date for the spreadsheet. */
function formatDate(value, timeZone = 'Asia/Kolkata') {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const COLUMNS = [
    ['Date', r => formatDate(r.occurred_at || r.created_at)],
    ['Amount (INR)', r => Number(r.amount ?? 0).toFixed(2)],
    ['Category', r => r.category ?? ''],
    ['Description', r => r.description ?? ''],
    ['Source', r => r.source ?? ''],
    ['Round-up saved (INR)', r => Number(r.roundup_chillar ?? 0).toFixed(2)],
    ['Logged at', r => formatDate(r.created_at)],
    ['ID', r => r.id ?? ''],
];

/**
 * Render expense rows as an RFC 4180 CSV string, header included.
 * @param {Array<object>} rows
 * @returns {string}
 */
function toCsv(rows) {
    const lines = [COLUMNS.map(([header]) => escapeCell(header)).join(',')];
    for (const row of rows || []) {
        lines.push(COLUMNS.map(([, get]) => escapeCell(get(row))).join(','));
    }
    // CRLF is what RFC 4180 specifies and what Excel on Windows expects.
    return lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, escapeCell, formatDate };
