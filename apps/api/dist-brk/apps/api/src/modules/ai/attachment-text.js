"use strict";
/**
 * §15.1 attachment text extraction. Pure, dependency-free helpers that decide
 * whether an uploaded attachment is a text/extractable format and, if so, turn
 * its raw bytes into indexable UTF-8 text.
 *
 * SCOPE — only genuinely text-based formats are extracted here: `text/*`
 * (text/plain, text/markdown, text/csv, text/html, …), `application/json`,
 * `application/xml`, and the RFC 6839 structured-syntax suffixes `+json` /
 * `+xml`. Binary documents (PDF, Word/Excel/PowerPoint, images, zip/archives,
 * audio/video) are intentionally NOT parsed: doing so would require a heavy
 * parser dependency (e.g. pdf-parse / mammoth / an OCR pipeline), which is out
 * of scope for this dependency-light feature. Such attachments are skipped
 * cleanly by `isExtractableAttachment` returning false, and could be added
 * later behind a real parser lib without changing the indexing contract.
 *
 * Kept free of NestJS/DB/R2 imports so it is trivially unit-testable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ATTACHMENT_BYTES = exports.ATTACHMENT_TEXT_CAP = void 0;
exports.isExtractableAttachment = isExtractableAttachment;
exports.extractAttachmentText = extractAttachmentText;
/** Max chars of extracted text kept per attachment (keeps embeddings bounded). */
exports.ATTACHMENT_TEXT_CAP = 40_000;
/**
 * Max raw object size we will download + decode for a single attachment. Larger
 * text files are skipped rather than pulled fully into memory — the indexer
 * checks this against the stored `sizeBytes` before fetching from R2.
 */
exports.MAX_ATTACHMENT_BYTES = 2_000_000;
/** Normalize a stored content type to its bare, lowercased media type. */
function bareMediaType(contentType) {
    // Drop any parameters (e.g. "; charset=utf-8") and normalize case/space.
    return (contentType ?? '').split(';')[0].trim().toLowerCase();
}
/**
 * True when an attachment's content type is a text/extractable format we index.
 * Deliberately conservative: unknown or binary types return false so nothing
 * unparseable is ever fed to the embedder.
 */
function isExtractableAttachment(contentType) {
    const type = bareMediaType(contentType);
    if (!type)
        return false;
    if (type.startsWith('text/'))
        return true;
    if (type === 'application/json' || type === 'application/xml')
        return true;
    // RFC 6839 structured suffixes — e.g. application/ld+json, application/rss+xml.
    if (type.startsWith('application/') && (type.endsWith('+json') || type.endsWith('+xml')))
        return true;
    return false;
}
/**
 * Decode an extractable attachment's bytes to bounded UTF-8 text. Returns '' for
 * a non-extractable type or empty input. A leading UTF-8 BOM is stripped, line
 * endings are normalized (word spacing is preserved so the embedder still sees
 * real tokens), and the text is capped to `cap` chars so a single huge file
 * can't blow up an embedding.
 */
function extractAttachmentText(bytes, contentType, cap = exports.ATTACHMENT_TEXT_CAP) {
    if (!isExtractableAttachment(contentType))
        return '';
    if (!bytes || bytes.length === 0)
        return '';
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    // Only decode a little past the cap — no point materializing megabytes of a
    // text file we're about to truncate anyway (a UTF-8 char is at most 4 bytes).
    const decoded = buf.subarray(0, (cap + 1) * 4).toString('utf8');
    const withoutBom = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
    const normalized = withoutBom.replace(/\r\n?/g, '\n').trim();
    return normalized.length > cap ? normalized.slice(0, cap) : normalized;
}
//# sourceMappingURL=attachment-text.js.map