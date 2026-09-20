"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const comment_summary_1 = require("./comment-summary");
/**
 * §V2-05 — the snippet a wordless comment gets in a notification.
 *
 * A comment can now be posted with nothing but a voice note (frame `04:45`) or
 * a clip (`05:35`). These checks are about the teammate who is emailed about
 * it: "New comment on X" over a blank quote reads as the product having lost
 * the comment.
 */
(0, node_test_1.test)('a comment with words does not reach this at all, but no attachments still says nothing', () => {
    // The caller only asks for a description when the body is empty; an empty
    // list here means a bug upstream, and returning '' keeps the old behaviour
    // rather than emailing the word "Sent".
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([]), '');
});
(0, node_test_1.test)('one voice note is named as a voice note, not as a file', () => {
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([{ fileName: 'voice-note_x.webm', contentType: 'audio/webm;codecs=opus' }]), 'Sent a voice note');
});
(0, node_test_1.test)('one clip is named as a clip', () => {
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([{ fileName: 'clip_x.webm', contentType: 'video/webm;codecs=vp9,opus' }]), 'Sent a clip');
});
(0, node_test_1.test)('several of a kind are counted', () => {
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([
        { fileName: 'a.webm', contentType: 'video/webm' },
        { fileName: 'b.webm', contentType: 'video/webm' },
    ]), 'Sent 2 clips');
});
(0, node_test_1.test)('mixed kinds read as a sentence, in a fixed order', () => {
    // Fixed order so two notifications about the same comment cannot describe it
    // two different ways.
    const files = [
        { fileName: 'notes.pdf', contentType: 'application/pdf' },
        { fileName: 'v.webm', contentType: 'audio/webm' },
        { fileName: 'shot.png', contentType: 'image/png' },
    ];
    strict_1.default.equal((0, comment_summary_1.describeAttachments)(files), 'Sent a voice note, an image and a file');
    // Same set, different arrival order — same sentence.
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([...files].reverse()), 'Sent a voice note, an image and a file');
});
(0, node_test_1.test)('a file whose type never arrived is still described', () => {
    // An attachment row with no content type must not fall through to "" and
    // leave the snippet blank, which is the case this whole module exists for.
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([{ fileName: 'thing', contentType: null }]), 'Sent a file');
    strict_1.default.equal((0, comment_summary_1.describeAttachments)([{ fileName: 'thing' }]), 'Sent a file');
});
(0, node_test_1.test)('the description is not the stored body', () => {
    // Guard on intent rather than on a string: nothing here may look like the
    // person typed it. If this ever starts returning first-person text it is
    // being written into a comment somebody will be quoted on.
    const out = (0, comment_summary_1.describeAttachments)([{ fileName: 'v.webm', contentType: 'audio/webm' }]);
    strict_1.default.ok(out.startsWith('Sent '), out);
    strict_1.default.ok(!/\bI\b|\bmy\b/.test(out), out);
});
//# sourceMappingURL=comment-summary.test.js.map