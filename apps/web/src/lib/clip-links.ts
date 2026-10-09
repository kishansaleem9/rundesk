/**
 * A CLIP'S LINK IN A PIECE OF TEXT (`resume-defects/s4-clip-link`,
 * `ledger-rows/row-1307`): the clips whose links a chat message, a comment or a
 * description holds, so each is drawn as the clip under it — ClickUp's clip
 * links embed where they are shared ("Clip links auto-embed in Chat", and a
 * clip embedded in a task's description).
 *
 * A clip's link is this app's `/clips/<token>` (`clip-publish.ts`), copied with
 * the page's own origin. Only that is a clip here: the same path on another
 * site is somebody else's page and stays a link, as does a token of another
 * shape — `ClipsService` makes 24 random bytes, base64url, and nothing else is
 * a clip's.
 */

/** A token as a clip's link carries one: 32 base64url characters. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/

/** An address in free text, absolute or this site's own path. */
const ADDRESS = /(?:https?:\/\/[^\s<>()]+|(?<![\w/])\/clips\/[A-Za-z0-9_-]{32}(?![\w-]))/g

/** At most this many clips are drawn under one piece of text. */
export const MAX_CLIP_EMBEDS = 3

/** The clip a link names, when it is one of this site's clip links; null for any other address. */
export function clipTokenOf(href: string, origin: string): string | null {
  let url: URL
  try {
    url = new URL(href.replace(/[.,;:!?'"\]]+$/, ''), origin)
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  const m = /^\/clips\/([^/]+)\/?$/.exec(url.pathname)
  return m && TOKEN.test(m[1]) ? m[1] : null
}

/** The clips a text links to, each once, in the order they appear — at most `MAX_CLIP_EMBEDS`. */
export function clipTokensIn(text: string | null | undefined, origin: string): string[] {
  const out: string[] = []
  for (const raw of (text ?? '').match(ADDRESS) ?? []) {
    const token = clipTokenOf(raw, origin)
    if (token && !out.includes(token)) out.push(token)
    if (out.length >= MAX_CLIP_EMBEDS) break
  }
  return out
}
