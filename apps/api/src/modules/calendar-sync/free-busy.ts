/**
 * §V2-14c — "These calendars decide when you're busy."
 *
 * Frame `13:50`, under Busy calendars: *"These calendars decide when you're
 * busy. We plan work and suggest free slots around them."* §V2-02e's Meet-with
 * already draws a colleague's Rundesk meetings, so somebody blocked out in
 * their own Google Calendar reads as free — which is the one state that makes
 * a free/busy view worse than no free/busy view, because it is confidently
 * wrong.
 *
 * THE PRIVACY RULE IS STRUCTURAL, NOT REMEMBERED. A busy window carries a
 * start, an end and where it came from — and NO TITLE, because the type has no
 * field for one. Somebody's personal calendar says things like "MRI results"
 * and "interview at ---"; a colleague checking whether they are free at three
 * is entitled to know that they are not, and to nothing else. Making that a
 * property of the shape rather than of a `delete busy.title` line means no
 * future call site can leak it by forgetting.
 *
 * The merging lives here, away from the HTTP, because it is the part with
 * edges: overlapping meetings, zero-length events, a provider returning a
 * window that ends before it starts.
 */

/** Where a busy window came from. Not a label to show — a source to reason about. */
export type BusySource = 'rundesk' | 'external'

export type BusyWindow = {
  startsAt: string
  endsAt: string
  source: BusySource
}

/** What a provider hands back, before it is trusted. */
export type RawWindow = {
  start: Date | string | null | undefined
  end: Date | string | null | undefined
}

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Turn whatever a provider returned into windows worth trusting.
 *
 * Anything unusable is DROPPED rather than repaired: a window with no end, or
 * one that ends before it starts, is a bug at the far end, and guessing a
 * duration for it would draw a block on somebody's calendar that nothing in
 * the world corresponds to. Zero-length events are dropped for the same reason
 * — an instant is not a period of being busy.
 */
export function toBusyWindows(raw: RawWindow[], source: BusySource): BusyWindow[] {
  const out: BusyWindow[] = []
  for (const item of raw) {
    const start = asDate(item.start)
    const end = asDate(item.end)
    if (!start || !end) continue
    if (end.getTime() <= start.getTime()) continue
    out.push({ startsAt: start.toISOString(), endsAt: end.toISOString(), source })
  }
  return out
}

/**
 * One list of busy time, sorted, with overlaps joined up.
 *
 * MERGED RATHER THAN CONCATENATED. Somebody with a Rundesk meeting and a
 * Google event covering the same hour is busy once, not twice; a caller
 * looking for a free slot cares about the union. Touching windows join too —
 * back-to-back meetings from 2 to 3 and 3 to 4 leave no gap at three, and
 * reporting one would offer a free minute that does not exist.
 *
 * The source of a merged window is 'external' only when every part of it was:
 * a joined window that includes Rundesk time is still time this product can
 * explain, and the UI shows those differently.
 */
export function mergeBusy(windows: BusyWindow[]): BusyWindow[] {
  const sorted = [...windows].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const merged: BusyWindow[] = []
  for (const w of sorted) {
    const last = merged[merged.length - 1]
    if (last && w.startsAt <= last.endsAt) {
      if (w.endsAt > last.endsAt) last.endsAt = w.endsAt
      if (last.source !== w.source) last.source = 'rundesk'
      continue
    }
    merged.push({ ...w })
  }
  return merged
}

/**
 * Is somebody free for the whole of this window?
 *
 * Half-open on both sides — a meeting ending at three does not make three
 * o'clock busy — which is the same convention the planner's block range uses.
 */
export function isFree(busy: BusyWindow[], startsAt: string, endsAt: string): boolean {
  return !busy.some((w) => w.startsAt < endsAt && startsAt < w.endsAt)
}
