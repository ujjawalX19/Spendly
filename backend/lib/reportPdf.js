/**
 * reportPdf — a report (lib/reports) as a one-document PDF. The built-in PDF
 * font has no rupee sign, so amounts are written "Rs." rather than risking a
 * wrong glyph.
 */
const PDFDocument = require('pdfkit');

const rs = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function reportPdf(report) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Vittova report: ${report.label}`, Author: 'Vittova' } });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(20).font('Helvetica-Bold').text('Vittova report');
        doc.moveDown(0.2).fontSize(12).font('Helvetica').fillColor('#555555').text(report.label);
        doc.moveDown().fillColor('#000000').fontSize(11);
        const line = (label, value) => doc.font('Helvetica').text(`${label}: `, { continued: true }).font('Helvetica-Bold').text(value);
        line('Total spent', rs(report.totalSpent));
        line('Expenses', String(report.expenseCount));
        if (report.monthlyBudget) line('Monthly budget', rs(report.monthlyBudget));
        if (report.incomeCount) {
            line('Income you entered', rs(report.totalIncome));
            line('Income minus spending', `${report.net < 0 ? '-' : ''}${rs(Math.abs(report.net))}`);
        }

        doc.moveDown().fontSize(13).font('Helvetica-Bold').text('By category');
        doc.moveDown(0.3).fontSize(11);
        if (!report.categories.length) doc.font('Helvetica').text('Nothing recorded for this period.');
        for (const c of report.categories) {
            const limit = c.limit != null ? `, limit ${rs(c.limit)}${c.over ? ' (over)' : ''}` : '';
            doc.font('Helvetica').text(`${c.category}: ${rs(c.amount)} (${c.share}%, ${c.count} expense${c.count === 1 ? '' : 's'}${limit})`);
        }

        doc.moveDown(2).fontSize(9).fillColor('#555555').text('From the records in your Vittova account. Not financial advice.');
        doc.end();
    });
}

module.exports = { reportPdf };
