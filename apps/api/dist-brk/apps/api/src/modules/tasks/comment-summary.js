"use strict";
/**
 * §V2-05 — describing a comment that has no words.
 *
 * Frame `04:45` posts a voice note on its own and `05:35` a recorded clip on
 * its own, so a comment's body can now legitimately be empty. Everything
 * downstream that quotes a comment — the notification email's snippet, most
 * of all — would then quote nothing, and a teammate would get "New comment on
 * X" above an empty box and no idea whether the product had lost something.
 *
 * So a body-less comment is described by what it carries. This is deliberately
 * a DESCRIPTION and not the stored body: the comment's real body stays empty in
 * the database and on the outgoing webhook, because inventing text and saving
 * it would put words in somebody's mouth that they would later see attributed
 * to them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeAttachments = describeAttachments;
function kindOf(att) {
    const base = (att.contentType ?? '').split(';')[0].trim().toLowerCase();
    if (base.startsWith('audio/'))
        return 'voice';
    if (base.startsWith('video/'))
        return 'clip';
    if (base.startsWith('image/'))
        return 'image';
    return 'file';
}
const SINGULAR = {
    voice: 'a voice note',
    clip: 'a clip',
    image: 'an image',
    file: 'a file',
};
const PLURAL = {
    voice: 'voice notes',
    clip: 'clips',
    image: 'images',
    file: 'files',
};
/**
 * "Sent a voice note", "Sent 2 clips", "Sent a voice note and a file".
 *
 * Ordered by the kinds' declaration order rather than by arrival, so the same
 * set of files always reads the same way — a snippet that shuffles between two
 * notifications about the same comment looks like two different comments.
 */
function describeAttachments(attachments) {
    if (attachments.length === 0)
        return '';
    const counts = new Map();
    for (const att of attachments) {
        const kind = kindOf(att);
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    const parts = [];
    for (const kind of ['voice', 'clip', 'image', 'file']) {
        const n = counts.get(kind);
        if (!n)
            continue;
        parts.push(n === 1 ? SINGULAR[kind] : `${n} ${PLURAL[kind]}`);
    }
    const phrase = parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `Sent ${phrase}`;
}
//# sourceMappingURL=comment-summary.js.map