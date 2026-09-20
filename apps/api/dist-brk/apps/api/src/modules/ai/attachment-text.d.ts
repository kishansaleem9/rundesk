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
/** Max chars of extracted text kept per attachment (keeps embeddings bounded). */
export declare const ATTACHMENT_TEXT_CAP = 40000;
/**
 * Max raw object size we will download + decode for a single attachment. Larger
 * text files are skipped rather than pulled fully into memory — the indexer
 * checks this against the stored `sizeBytes` before fetching from R2.
 */
export declare const MAX_ATTACHMENT_BYTES = 2000000;
/**
 * True when an attachment's content type is a text/extractable format we index.
 * Deliberately conservative: unknown or binary types return false so nothing
 * unparseable is ever fed to the embedder.
 */
export declare function isExtractableAttachment(contentType: string): boolean;
/**
 * Decode an extractable attachment's bytes to bounded UTF-8 text. Returns '' for
 * a non-extractable type or empty input. A leading UTF-8 BOM is stripped, line
 * endings are normalized (word spacing is preserved so the embedder still sees
 * real tokens), and the text is capped to `cap` chars so a single huge file
 * can't blow up an embedding.
 */
export declare function extractAttachmentText(bytes: Buffer | Uint8Array, contentType: string, cap?: number): string;
