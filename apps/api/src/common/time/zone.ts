/**
 * §G05 [06:08] — "TODAY ke kya task hain."
 *
 * Whose today? Theirs. A profile panel already shows a person's local time for
 * the same reason: a deadline is a fact about their day, and a teammate eight
 * hours away reading that panel should see the buckets that person sees, not
 * the ones the server happens to be in.
 *
 * Doing this in SQL would mean pushing a timezone into every comparison; doing
 * it here means one instant computed once and ordinary `>=` / `<` afterwards.
 */

/**
 * How far `timeZone` is from UTC at a given instant, in milliseconds.
 *
 * Read off the formatter rather than a table, so it is right across DST without
 * this file knowing anything about DST. Positive east of UTC.
 */
function offsetMsAt(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // `hour` comes back as 24 at midnight in some ICU versions; % 24 normalises.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - at.getTime()
}

/**
 * The instant at which the current day began in `timeZone`.
 *
 * @param timeZone an IANA name; anything unrecognised falls back to UTC rather
 *                 than throwing, because a bad row in `users.timezone` must not
 *                 be able to take down a profile page.
 */
export function startOfDayIn(timeZone: string, now: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
    const y = get('year')
    const m = get('month')
    const d = get('day')

    // Midnight on that calendar date, first read as if it were UTC, then moved
    // back by the zone's offset to get the real instant.
    const naive = Date.UTC(y, m - 1, d)
    let guess = naive - offsetMsAt(timeZone, new Date(naive))
    /*
     * One correction pass. The offset used above is the one in force at UTC
     * midnight, which is not always the one in force at LOCAL midnight — on a
     * DST changeover day those differ by an hour and the first guess lands in
     * the wrong day. Re-reading the offset at the guess converges.
     */
    guess = naive - offsetMsAt(timeZone, new Date(guess))
    return new Date(guess)
  } catch {
    const utc = new Date(now)
    utc.setUTCHours(0, 0, 0, 0)
    return utc
  }
}
