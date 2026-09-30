/**
 * The file name a response's `Content-Disposition` gives, or null when it
 * gives none — so a download is saved under the name the server chose, and
 * the rule for that name is written once, on the server.
 *
 * `filename*` (RFC 6266 / RFC 5987, UTF-8, percent-encoded) is preferred over
 * `filename`, which carries only what ASCII can: a task's "Download all" is
 * named after the task, and a title in Arabic or Urdu is in `filename*` alone
 * (`found-30-sep/attachments-have-no-download-all`).
 */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended && /^utf-8$/i.test(extended[1].trim())) {
    try {
      const name = decodeURIComponent(extended[2].trim())
      if (name) return name
    } catch {
      /* a malformed encoding: fall back to the plain name */
    }
  }
  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header)
  const name = (plain?.[1] ?? plain?.[2] ?? '').replace(/\\(.)/g, '$1').trim()
  return name || null
}
