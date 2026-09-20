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
 * G06-6 [07:03] — is this a real IANA zone?
 *
 * `startOfDayIn` below deliberately falls back to UTC on anything it does not
 * recognise, so that one bad row cannot take down a profile page. The cost of
 * that kindness is silence: somebody who typed "Asia/Karach" gets UTC for
 * every due date, reminder, digest and "today" bucket, with nothing anywhere
 * saying so. The fix is to refuse the value at the point it is written, which
 * is why this lives here rather than in the form — a picker on one screen does
 * not stop an API client, or the next form, from storing a typo.
 *
 * `Intl.supportedValuesOf` would give the whole list, but it is not needed:
 * the formatter already knows, and it also accepts legacy aliases like
 * "US/Pacific" that the canonical list omits and real accounts still carry.
 */
export declare function isValidTimeZone(timeZone: unknown): timeZone is string;
/**
 * The instant at which the current day began in `timeZone`.
 *
 * @param timeZone an IANA name; anything unrecognised falls back to UTC rather
 *                 than throwing, because a bad row in `users.timezone` must not
 *                 be able to take down a profile page.
 */
export declare function startOfDayIn(timeZone: string, now?: Date): Date;
