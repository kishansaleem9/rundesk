/**
 * "How long ago", in the reader's own language.
 *
 * WHY THIS FILE EXISTS. There were two implementations of this, and they did
 * not agree:
 *
 *   · the list route's `formatAge` — `Intl.RelativeTimeFormat`, locale-aware,
 *     carrying a comment that it replaced "date-fns' English-only
 *     formatDistanceToNowStrict";
 *   · `docs-panel.tsx`'s `relativeTime` — hardcoded English: "just now",
 *     "5m ago", "3d ago".
 *
 * So the English-only problem was found and fixed ONCE, in one copy, and the
 * other copy kept shipping "3d ago" to people reading the product in Arabic
 * and Urdu. That is the shape of every duplicated-logic bug found in this
 * codebase so far, except this one was visible on screen the whole time.
 *
 * `numeric: 'auto'` is what yields idiomatic forms rather than arithmetic —
 * "yesterday" instead of "1 day ago", "أمس", "کل".
 */
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

export function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime()
  // An unparseable timestamp is worth showing as nothing rather than as
  // "Invalid Date ago", which is how a bad row becomes a bug report.
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(-Math.round(diffSec / secs), unit)
  }
  return rtf.format(-diffSec, 'second')
}

/**
 * The full timestamp, for the `title` attribute beside a relative one.
 *
 * A relative time is easier to read and worse to cite: "3 days ago" cannot
 * settle an argument about when something happened. Both, always — the short
 * form on screen and the exact one on hover.
 */
export function exactTime(iso: string, locale: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale)
}
