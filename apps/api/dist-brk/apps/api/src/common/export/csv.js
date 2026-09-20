"use strict";
/**
 * CSV that survives a spreadsheet.
 *
 * The exporter this replaces quoted the TITLE and nothing else, and joined the
 * rest with commas — so a status with a comma, or a title with a newline, moved
 * every column after it by one. It also passed cell values through untouched,
 * which is the part that matters:
 *
 *   A cell beginning `=`, `+`, `-`, `@`, tab or CR is a FORMULA to Excel,
 *   LibreOffice and Google Sheets. A task titled `=HYPERLINK("http://…")` or
 *   `=cmd|'/c calc'!A1` runs when somebody opens the export. The person who
 *   typed it never had to attack anything — they typed it into a task title in
 *   an app that invited them to, and the export carried it into a program that
 *   executes cells.
 *
 * So every field is quoted, quotes are doubled, and a leading formula character
 * is prefixed with a single quote — the convention every spreadsheet reads as
 * "this is text", and which is stripped on display.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvCell = csvCell;
exports.toCsv = toCsv;
/** Characters a spreadsheet treats as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
function csvCell(value) {
    if (value == null)
        return '""';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (FORMULA_LEAD.test(text))
        text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}
/**
 * `\r\n` between rows, because that is what RFC 4180 says and what Excel wants
 * on every platform; a lone `\n` is read as one row by some importers.
 */
function toCsv(headers, rows) {
    const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
    return lines.join('\r\n');
}
//# sourceMappingURL=csv.js.map