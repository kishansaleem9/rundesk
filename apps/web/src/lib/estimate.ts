/**
 * Reading and writing a time estimate.
 *
 * §V2-S02 frame `01:35` — the estimate popover takes `12` and offers a row
 * reading **"12 hours"**, and at `01:45` the field reads `12h`. Rundesk had a
 * bare `<input type="number">` in hours: ninety minutes had to be entered as
 * `1.5`, `2h 30m` was impossible to say at all, and the unit lived only in the
 * field's label.
 *
 * WHY A MODULE. Two places already turned a number into an estimate — the task
 * detail field and the quick-create modal, each with its own
 * `Math.round(hours * 3600)`. Teaching one of them to understand `90m` and not
 * the other would be the tenth duplicated-logic instance in this codebase, and
 * a worse kind than most: the two would then DISAGREE about what somebody typed.
 *
 * DAYS ARE DELIBERATELY NOT SUPPORTED. An estimate of "2d" means two working
 * days, and a working day is a business decision — ClickUp calls it eight
 * hours — that this product has never made anywhere. Accepting `2d` and
 * quietly choosing eight would turn it into sixteen hours for somebody who
 * meant forty-eight. Better to not understand it than to misunderstand it.
 */

/** What `parseEstimate` understood, ready to show back before it is committed. */
export type ParsedEstimate = {
  seconds: number
  /** The units it found, for the suggestion row: e.g. `{ hours: 1, minutes: 30 }`. */
  hours: number
  minutes: number
}

/**
 * One `<number><unit?>` part. The unit list is spelled out rather than
 * abbreviated into a clever pattern: the first version guarded the input with a
 * character allowlist that happened to omit `s`, so "2 hours" and "90 mins"
 * were both rejected as nonsense. A unit list you can read is a unit list you
 * can check.
 */
const PART = String.raw`(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)?`
const PART_RE = new RegExp(PART, 'gi')
/** The whole box must be parts and nothing else — that is what rejects "12x". */
const WHOLE_RE = new RegExp(String.raw`^(?:\s*` + PART + String.raw`\s*)+$`, 'i')

/**
 * Turn what somebody typed into seconds, or null if it means nothing.
 *
 * A BARE NUMBER IS HOURS, which is both what the frame shows (`12` → "12
 * hours") and what the old number input already meant — so nobody's existing
 * habit changes meaning underneath them.
 */
export function parseEstimate(input: string): ParsedEstimate | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  /*
   * The WHOLE box has to be durations. Matching parts anywhere inside it would
   * read "12x" as twelve hours and "due soon 3h" as three — recording an
   * estimate nobody made.
   */
  if (!WHOLE_RE.test(text)) return null

  let totalMinutes = 0
  let found = false
  PART_RE.lastIndex = 0
  for (const match of text.matchAll(PART_RE)) {
    const value = Number(match[1])
    if (!Number.isFinite(value) || value < 0) return null
    const unit = match[2] ?? ''
    // No unit at all means hours — see above.
    const asMinutes = unit.startsWith('m') ? value : value * 60
    totalMinutes += asMinutes
    found = true
  }
  if (!found || totalMinutes <= 0) return null

  const seconds = Math.round(totalMinutes * 60)
  return {
    seconds,
    hours: Math.floor(totalMinutes / 60),
    minutes: Math.round(totalMinutes % 60),
  }
}

/**
 * How an estimate reads back: `12h`, `90m` as `1h 30m`, `45m`.
 *
 * Frame `01:45` shows `12h` where the old field showed `12`. A number with no
 * unit beside it is a question rather than an answer.
 */
export function formatEstimate(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return ''
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
