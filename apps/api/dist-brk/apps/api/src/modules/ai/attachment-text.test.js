"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const attachment_text_1 = require("./attachment-text");
/**
 * §15.1 attachment text extraction. Verifies the pure content-type gate and the
 * bytes -> bounded UTF-8 text decode used by the knowledge indexer. Binary
 * formats (pdf/docx/images/zip) are intentionally NOT extractable here.
 */
(0, node_test_1.describe)('isExtractableAttachment (§15.1)', () => {
    (0, node_test_1.it)('accepts text/* and json/xml (incl. structured suffixes and charset params)', () => {
        for (const t of [
            'text/plain',
            'text/markdown',
            'text/csv',
            'text/html',
            'text/xml',
            'application/json',
            'application/xml',
            'application/ld+json',
            'application/rss+xml',
            'text/plain; charset=utf-8',
            'TEXT/PLAIN',
        ]) {
            strict_1.default.equal((0, attachment_text_1.isExtractableAttachment)(t), true, `${t} should be extractable`);
        }
    });
    (0, node_test_1.it)('rejects binary / non-text formats and blank types', () => {
        for (const t of [
            'image/png',
            'image/jpeg',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/octet-stream',
            'audio/mpeg',
            'video/mp4',
            '',
            '   ',
        ]) {
            strict_1.default.equal((0, attachment_text_1.isExtractableAttachment)(t), false, `${t} should NOT be extractable`);
        }
    });
});
(0, node_test_1.describe)('extractAttachmentText (§15.1)', () => {
    (0, node_test_1.it)('decodes UTF-8 text for an extractable type', () => {
        const bytes = Buffer.from('The Q3 launch ships on August 15. Owner: Priya.', 'utf8');
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(bytes, 'text/plain'), 'The Q3 launch ships on August 15. Owner: Priya.');
    });
    (0, node_test_1.it)('returns empty string for a non-extractable (binary) type — never decodes it', () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(png, 'image/png'), '');
    });
    (0, node_test_1.it)('returns empty string for empty input', () => {
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(Buffer.alloc(0), 'text/plain'), '');
    });
    (0, node_test_1.it)('strips a leading UTF-8 BOM', () => {
        const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello world', 'utf8')]);
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(withBom, 'text/plain'), 'hello world');
    });
    (0, node_test_1.it)('normalizes CRLF and trims surrounding whitespace while keeping words intact', () => {
        const bytes = Buffer.from('  line one\r\nline two  ', 'utf8');
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(bytes, 'text/markdown'), 'line one\nline two');
    });
    (0, node_test_1.it)('caps very long text to the char cap', () => {
        const big = 'a'.repeat(attachment_text_1.ATTACHMENT_TEXT_CAP + 5000);
        const out = (0, attachment_text_1.extractAttachmentText)(Buffer.from(big, 'utf8'), 'text/plain');
        strict_1.default.equal(out.length, attachment_text_1.ATTACHMENT_TEXT_CAP);
    });
    (0, node_test_1.it)('accepts a Uint8Array as well as a Buffer', () => {
        const u8 = new TextEncoder().encode('json body');
        strict_1.default.equal((0, attachment_text_1.extractAttachmentText)(u8, 'application/json'), 'json body');
    });
});
//# sourceMappingURL=attachment-text.test.js.map