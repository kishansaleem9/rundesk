/**
 * THE WEB ADDRESSES IN A RUN OF TEXT, AND THE TEXT AROUND THEM
 * (`found-5-oct/comment-links-not-links`).
 *
 * A comment with no block markdown is drawn on the plain path, which kept
 * every run as text, so an address in a one-line comment was not a link, while
 * the same address in a comment holding a list was (the block path's
 * autolinker). ClickUp detects an address typed or pasted into a comment and
 * opens it in a new tab.
 *
 * Only `http:` and `https:` — anything else (`javascript:`, `data:`) stays
 * text. What ends a sentence after an address is the sentence's, not the
 * address's: a full stop, comma, colon, semicolon, `!` or `?`, and a closing
 * bracket the address did not open. Nothing else of the text changes — the
 * plain path exists so that what was typed is shown byte for byte.
 */
export type AddressPart = { text: string } | { href: string }

const ADDRESS = /https?:\/\/[^\s<>"'`]+/g

/** `href` without what follows it in the sentence. */
function withoutTail(href: string): string {
  let out = href
  for (;;) {
    if (/[.,;:!?]$/.test(out)) {
      out = out.slice(0, -1)
      continue
    }
    if (out.endsWith(')') && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) {
      out = out.slice(0, -1)
      continue
    }
    return out
  }
}

export function splitAddresses(text: string): AddressPart[] {
  const parts: AddressPart[] = []
  let last = 0
  for (const m of text.matchAll(ADDRESS)) {
    const at = m.index ?? 0
    const href = withoutTail(m[0])
    if (!/^https?:\/\/[^/]/.test(href)) continue
    if (at > last) parts.push({ text: text.slice(last, at) })
    parts.push({ href })
    last = at + href.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
