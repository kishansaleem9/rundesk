/**
 * WHAT A DATE BOX WRITES, AND WHEN (`found-30-sep/sheet-dates-write-as-typed`).
 *
 * The task sheet's start and due boxes sent `PATCH /tasks/:id` from `onChange`,
 * and a `datetime-local` box changes at every whole value a person passes
 * through: the day "25" is typed as "2", which is the 2nd, and then "5". So the
 * 2nd was written at the first key — recorded, notified, pushed to calendars —
 * and the box, disabled while the write was out, lost its focus and dropped the
 * "5". A year typed "2027" was written as year 0002 at its first digit.
 * Measured on lane 4 on 5 October and on lane 5 on 6 October, in UTC, Los
 * Angeles and Karachi. The sheet's subtask rows and its date fields, and the
 * list page's row box and Table cell, wrote the same way.
 *
 * ClickUp writes a typed date when it is accepted: "Press Return or Enter to
 * accept the validated date and time" (help.clickup.com, "Natural language
 * processing for dates and times"), and, in List view, on Enter or when the
 * picker is left. So the box keeps what is typed as a draft, stays open while a
 * write is out, and writes on Enter or when it is left, as this decides:
 *
 *   · nothing typed                 — nothing to do;
 *   · a date half typed (the box's
 *     `badInput`: a segment empty)  — discarded, the stored date shown again;
 *   · the value already accepted    — nothing more to do;
 *   · the value stored, with no
 *     write out to change it        — discarded, nothing changed;
 *   · an emptied box                — written as no date, as clearing always was;
 *   · anything else                 — written, after any write still out.
 *
 * WHILE A WRITE IS OUT the stored date is about to change, so a date typed back
 * to it is a change too: Enter on the 25th, then the 8th it held typed again
 * before the first write landed, left the 25th stored and the 8th discarded
 * (measured on lane 5 with each PATCH held three seconds).
 */
export type DateBoxCommit = { kind: 'none' } | { kind: 'discard' } | { kind: 'write'; iso: string | null }

export function dateBoxCommit(box: {
  /** What the box holds as typed, or null when nothing has been typed since the stored date was shown. */
  draft: string | null
  /** The stored date as the box shows it (`toDateTimeInput`, `toDateInput`). */
  shown: string
  /** The box's `validity.badInput`: a date it holds only part of. */
  badInput: boolean
  /** The draft last accepted while its write is not yet settled — out, or waiting behind one that is — if any. */
  sending: string | null
  /** What a whole typed value is written as (`fromDateTimeInput`, `withDatePart`), or null when it is no date. */
  toValue: (typed: string) => string | null
}): DateBoxCommit {
  const { draft, shown, badInput, sending, toValue } = box
  if (draft === null) return { kind: 'none' }
  if (badInput) return { kind: 'discard' }
  if (draft === sending) return { kind: 'none' }
  if (draft === shown && sending === null) return { kind: 'discard' }
  if (draft === '') return { kind: 'write', iso: null }
  const iso = toValue(draft)
  return iso ? { kind: 'write', iso } : { kind: 'discard' }
}
