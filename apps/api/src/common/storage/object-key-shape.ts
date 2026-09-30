/**
 * WHAT A STORAGE KEY'S LAST SEGMENT MAY BE — the rule every "is this key one
 * of ours" check stands on, in one place.
 *
 * Every writer of an object key in this tree builds it as a fixed prefix plus
 * `<Date.now()>-<name>`, with the name sanitised to `[a-zA-Z0-9._-]`. So a key
 * a CLIENT hands back is ours exactly when it is that prefix followed by ONE
 * segment in that alphabet — no slash, no `%` for an encoded one, and never
 * `.` or `..`.
 *
 * WHY THE SHAPE AND NOT THE PREFIX. An address on a public domain is
 * `${publicUrl}/${key}` unencoded — `R2Service.getObjectUrl` gave one for every
 * object where `R2_PUBLIC_URL` was a CDN domain, and `publicObjectUrl` still
 * does for a picture on show — and a browser collapses `..` in a URL path
 * before it asks for it. So a key that merely STARTS WITH our prefix —
 * `chat/<ws>/emoji/../../workspaces/<other>/…` — was handed out as a URL that
 * lands on somebody else's object. Task attachments, chat attachments and
 * custom emoji each had that check or none at all.
 *
 * Pure, and unit-tested in object-key-shape.test.ts.
 */

const SEGMENT = /^[A-Za-z0-9._-]+$/

/** One path segment in the sanitisers' alphabet, and not a dot segment. */
export const isSafeSegment = (segment: string): boolean =>
  SEGMENT.test(segment) && segment !== '.' && segment !== '..'

/** `key` is `prefix` followed by exactly one safe segment. `prefix` ends in `/`. */
export function isKeyDirectlyUnder(key: unknown, prefix: string): boolean {
  return typeof key === 'string' && key.startsWith(prefix) && isSafeSegment(key.slice(prefix.length))
}

/**
 * The pictures people put on show — avatars and workspace logos — and nothing
 * else. They are public by design: a logo is drawn on a custom domain's sign-in
 * page, before anybody signs in. A key under any other prefix is an attachment,
 * a clip, a recording, a document: a private object, handed out signed and only
 * to somebody its read rule let through
 * (`found-30-sep/public-cdn-url-makes-every-object-public`).
 */
export const PUBLIC_IMAGE_PREFIXES = ['avatars/', 'workspace-logos/'] as const

/** `key` is a picture on show: one safe segment directly under a public prefix. */
export function isPublicImageKey(key: unknown): boolean {
  return PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))
}

/**
 * A LISTING's prefix that may hold pictures — `avatars/…` or
 * `workspace-logos/…`, such as the purge's `workspace-logos/<id>-` — so it is
 * read in the pictures' own bucket too, where they have one
 * (`R2_PUBLIC_BUCKET_NAME`). Not for a key: which bucket a key is in, and
 * whether it is served, is `isPublicImageKey`'s answer.
 */
export function isUnderPublicImagePrefix(prefix: unknown): boolean {
  return typeof prefix === 'string' && PUBLIC_IMAGE_PREFIXES.some((p) => prefix.startsWith(p))
}
