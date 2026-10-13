/**
 * An uploaded file's bytes as text: UTF-8, or UTF-16 when a byte-order mark
 * says so — Excel's "Unicode text" and many Windows exports are UTF-16 — and
 * without a UTF-8 byte-order mark in front.
 */
export function decodeText(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le')
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)))
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  const text = bytes.toString('utf8')
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
