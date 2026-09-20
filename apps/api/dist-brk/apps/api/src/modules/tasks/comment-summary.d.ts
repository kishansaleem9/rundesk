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
export type AttachmentLike = {
    fileName: string;
    contentType?: string | null;
};
/**
 * "Sent a voice note", "Sent 2 clips", "Sent a voice note and a file".
 *
 * Ordered by the kinds' declaration order rather than by arrival, so the same
 * set of files always reads the same way — a snippet that shuffles between two
 * notifications about the same comment looks like two different comments.
 */
export declare function describeAttachments(attachments: AttachmentLike[]): string;
