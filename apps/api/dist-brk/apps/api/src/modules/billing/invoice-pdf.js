"use strict";
// App-side branded invoice PDF (Plan §14.1). Reuses the dependency-free,
// text-only PDF writer from the reports module (renderReportPdf / tableToLines)
// so we ship a real PDF receipt without pulling in puppeteer/pdfkit. This keeps
// invoice generation self-contained in the billing module while sharing the one
// PDF-rendering idiom used everywhere else in the app.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMoney = formatMoney;
exports.renderInvoicePdf = renderInvoicePdf;
const pdf_1 = require("../reports/pdf");
const CURRENCY_SYMBOLS = {
    usd: '$',
    eur: '€',
    gbp: '£',
    cad: 'CA$',
    aud: 'A$',
};
/** Format a minor-unit amount (cents) as e.g. "$20.00" / "12.50 SEK". */
function formatMoney(minorUnits, currency) {
    const code = String(currency || 'usd').toLowerCase();
    const major = (Number(minorUnits) || 0) / 100;
    const value = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const symbol = CURRENCY_SYMBOLS[code];
    return symbol ? `${symbol}${value}` : `${value} ${code.toUpperCase()}`;
}
/**
 * Render a branded Rundesk invoice to a PDF Buffer. Text-only (Helvetica),
 * mirroring the reports PDF: a header block (number / date / bill-to / status)
 * followed by an itemized table and the total.
 */
function renderInvoicePdf(data) {
    const issued = data.issuedAt instanceof Date && !Number.isNaN(data.issuedAt.getTime())
        ? data.issuedAt
        : new Date();
    const issuedLabel = issued.toISOString().slice(0, 10);
    const items = data.lines && data.lines.length > 0
        ? data.lines
        : [{ description: 'Subscription', amount: data.amountTotal }];
    const header = [
        'Rundesk',
        '',
        `Invoice: ${data.invoiceNumber}`,
        `Issued: ${issuedLabel}`,
        `Billed to: ${data.workspaceName}${data.billTo ? ` (${data.billTo})` : ''}`,
        `Status: ${String(data.status || '').toUpperCase()}`,
        '',
    ];
    const table = (0, pdf_1.tableToLines)(['Description', 'Amount'], items.map((it) => [it.description, formatMoney(it.amount, data.currency)]));
    const totals = [
        '',
        `Total: ${formatMoney(data.amountTotal, data.currency)}`,
        '',
        'Thank you for your business.',
    ];
    return (0, pdf_1.renderReportPdf)(`Rundesk Invoice ${data.invoiceNumber}`, [...header, ...table, ...totals]);
}
//# sourceMappingURL=invoice-pdf.js.map