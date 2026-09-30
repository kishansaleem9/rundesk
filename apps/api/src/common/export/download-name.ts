/**
 * THE NAME A DOWNLOAD IS SAVED UNDER, AND THE `Content-Disposition` THAT CARRIES
 * IT — one rule for every file the API names after something of its reader's
 * (`found-30-sep/list-export-saved-as-list-csv`).
 *
 * There were three. A task's Download all made its title safe as a zip entry's
 * name is (`safeEntryName`) and sent it whole in `filename*`; a list's export
 * kept `[\w \-.]` and dropped everything else, so "Übersicht" went out as
 * "bersicht.csv" and a list named in Arabic as "list.csv"; a doc's export
 * turned every run of anything but `[a-zA-Z0-9._-]` into a hyphen. And the page
 * worked the doc's name out a fourth time, and called every list's export
 * "list.csv", whatever the server said.
 *
 * So: the name is the title made safe as a file's name (one segment, no path,
 * nothing a file system refuses — `safeEntryName`), then what follows it (an
 * extension, or `-attachments.zip`). RFC 6266: the whole name in UTF-8,
 * percent-encoded, in `filename*`, which a browser prefers ("recipients SHOULD
 * pick filename* and ignore filename"), and an ASCII `filename` first for a
 * client that reads only that: accents dropped, anything else outside
 * printable ASCII left out, and the fallback when nothing is left. The page
 * saves under the header's name (`filenameFromContentDisposition`, web).
 *
 * Pure, and unit-tested in download-name.test.ts.
 */
import { safeEntryName } from './zip-names'

/** RFC 5987: the name in UTF-8, percent-encoded, for `filename*`. */
export function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * `title` made safe as a file's name, then `suffix`: `{ fileName, disposition }`,
 * the disposition carrying an ASCII `filename` and the whole name in `filename*`.
 * `fallback` names a title that leaves nothing, or nothing ASCII.
 */
export function downloadName(title: unknown, suffix: string, fallback: string): { fileName: string; disposition: string } {
  const base = safeEntryName(title, fallback)
  const fileName = `${base}${suffix}`
  const asciiBase =
    base
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[%;]/g, '_')
      .trim() || fallback
  return {
    fileName,
    disposition: `attachment; filename="${asciiBase}${suffix}"; filename*=UTF-8''${encodeExtValue(fileName)}`,
  }
}
