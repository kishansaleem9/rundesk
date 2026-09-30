/**
 * THE NAMES A ZIP'S ENTRIES ARE GIVEN — one name each, safe to unpack, and no
 * two the same (`found-30-sep/attachments-have-no-download-all`).
 *
 * A task file's name is whatever its uploader's browser said, or whatever was
 * typed beside a link: nothing checks it. In a ZIP an entry's name is a PATH,
 * so `../../.bashrc` or `docs/brief.pdf` would unpack outside the folder it was
 * unpacked into, or into one of its own. And two files called `notes.txt` would
 * be one file on the disk: most tools unpack the second over the first, or ask.
 *
 * So each name is ONE segment: a path separator becomes `_`, a run of dots
 * becomes one (so no `..` is left anywhere), and control characters and the
 * characters Windows will not put in a file name go too. A name left with
 * nothing is `file`. Then the second `notes.txt` is `notes (2).txt`, the third
 * `notes (3).txt`, as a desktop names a copy — compared without case, since
 * `Notes.txt` and `notes.txt` are one file on Windows and macOS.
 *
 * Pure, and unit-tested in zip-names.test.ts.
 */

/** Characters a file name may not hold here: separators, controls, and Windows' reserved ones. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[/\\\u0000-\u001f\u007f<>:"|?*]/g
/** Device names Windows will not create a file under, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
/** A name longer than this, in UTF-8, is cut short (a file system holds 255 bytes, and ` (99)` may follow). */
const MAX_NAME_BYTES = 200

/** `report.final.pdf` → [`report.final`, `.pdf`]; a leading dot is not an extension (`.env` has none). */
export function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return [name, '']
  const ext = name.slice(dot)
  // An "extension" of twenty characters is part of the name.
  return ext.length > 16 ? [name, ''] : [name.slice(0, dot), ext]
}

function clip(name: string, maxBytes: number): string {
  if (Buffer.byteLength(name, 'utf8') <= maxBytes) return name
  const [base, ext] = splitExtension(name)
  // By code point, so a character outside the BMP is never cut in half.
  const chars = Array.from(base)
  while (chars.length > 1 && Buffer.byteLength(chars.join('') + ext, 'utf8') > maxBytes) chars.pop()
  return chars.join('') + ext
}

/** One safe name: a single segment with no separator, no `..`, nothing a file system refuses. */
export function safeEntryName(input: unknown, fallback = 'file'): string {
  let name = typeof input === 'string' ? input.normalize('NFC') : ''
  name = name.replace(UNSAFE, '_').replace(/\.{2,}/g, '.').trim()
  // A file system drops a trailing dot or space, and Windows will not end a name with one.
  name = name.replace(/[. ]+$/, '')
  if (!name || name === '.') return fallback
  if (RESERVED.test(name)) name = `_${name}`
  return clip(name, MAX_NAME_BYTES)
}

/**
 * Each name made safe, and made distinct from every name before it — and from
 * `taken`, when a caller has names of its own. The first keeps its name; a
 * repeat takes the lowest ` (n)` not yet used, starting at 2.
 */
export function uniqueEntryNames(names: readonly unknown[], taken: Iterable<string> = []): string[] {
  const used = new Set<string>()
  for (const name of taken) used.add(name.toLowerCase())
  return names.map((raw) => {
    const name = safeEntryName(raw)
    const [base, ext] = splitExtension(name)
    let candidate = name
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})${ext}`
    used.add(candidate.toLowerCase())
    return candidate
  })
}
