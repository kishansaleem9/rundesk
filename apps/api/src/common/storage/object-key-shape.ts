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
 * WHY THE SHAPE AND NOT THE PREFIX. `R2Service.getObjectUrl` in public-CDN
 * mode returns `${publicUrl}/${key}` unencoded, and a browser collapses `..`
 * in a URL path before it asks for it. So a key that merely STARTS WITH our
 * prefix — `chat/<ws>/emoji/../../workspaces/<other>/…` — signs a URL that
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
