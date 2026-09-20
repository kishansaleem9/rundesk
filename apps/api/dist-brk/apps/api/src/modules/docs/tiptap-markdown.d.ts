/**
 * Convert a Tiptap/ProseMirror document (the JSON shape stored in docs.content)
 * to GitHub-flavored Markdown. Pure + dependency-free so it's trivially testable
 * and safe to run on the request path.
 */
/**
 * Flatten a Tiptap doc to plain text lines for the line-based PDF writer.
 * Marks are stripped; headings are underlined; lists get plain markers.
 */
export declare function tiptapToPlainLines(content: unknown): string[];
export declare function tiptapToMarkdown(content: unknown): string;
