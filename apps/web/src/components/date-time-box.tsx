import { useRef, useState } from 'react'
import { carriesTime, fromDateTimeBox, toDateInput, toDateTimeInput, withDatePart, type DateWrite } from '../lib/task-dates'
import { dateBoxCommit } from '../lib/date-box'

type BoxProps = {
  disabled?: boolean
  className?: string
  testId?: string
  title?: string
  autoFocus?: boolean
  onClick?: React.MouseEventHandler<HTMLInputElement>
  /**
   * Once a date is accepted — Enter, or the box left — written or not: a cell
   * that opened the box for the edit closes it.
   */
  onDone?: () => void
}

/**
 * A date box that writes what is typed on Enter or when it is left, and stays
 * open while the write is out (`found-30-sep/sheet-dates-write-as-typed`;
 * `lib/date-box.ts` says what it writes and why).
 *
 * `onCommit` is the write: the box shows the typed value until it settles, then
 * the stored one again — the new date, or, when the write was refused (the
 * caller says why), the date as it was. Writes go one after another, so a date
 * corrected while one is out is written after it, and only the last of those
 * waiting is.
 */
export function DateBox<V = string>({
  type,
  shown,
  toValue,
  onCommit,
  onDone,
  disabled,
  className,
  testId,
  title,
  autoFocus,
  onClick,
}: BoxProps & {
  type: 'date' | 'datetime-local'
  /** The stored date as this box shows it. */
  shown: string
  /** What a whole typed value is written as (`lib/date-box.ts`). */
  toValue: (typed: string) => V | null
  onCommit: (value: V | null) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // The draft last accepted, until its write settles.
  const sending = useRef<string | null>(null)
  const writes = useRef<Promise<unknown>>(Promise.resolve())

  const commit = (box: HTMLInputElement) => {
    const decision = dateBoxCommit({ draft, shown, badInput: box.validity.badInput, sending: sending.current, toValue })
    if (decision.kind === 'discard') setDraft(null)
    if (decision.kind !== 'write') return
    const typed = draft
    sending.current = typed
    writes.current = writes.current.then(async () => {
      // Overtaken while it waited: a later date was accepted, and is written instead.
      if (sending.current !== typed) return
      // The caller says a refusal; here it only ends the draft.
      await onCommit(decision.iso).catch(() => undefined)
      if (sending.current === typed) sending.current = null
      setDraft((now) => (now === typed ? null : now))
    })
  }

  return (
    <input
      type={type}
      data-testid={testId}
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit(e.currentTarget)
        onDone?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget)
          onDone?.()
        }
      }}
      onClick={onClick}
      title={title}
      autoFocus={autoFocus}
      disabled={disabled}
      className={className}
    />
  )
}

/**
 * A stored instant in a `datetime-local` box: the task sheet's start and due
 * dates. `hasTime` is the task's flag for it, and what is written goes with its
 * own (`fromDateTimeBox`, `found-6-oct/a-time-on-utc-midnight-reads-as-no-time`);
 * an emptied box writes no date, which carries no time.
 */
export function DateTimeBox({
  stored,
  hasTime,
  onCommit,
  ...box
}: BoxProps & {
  stored: string | null | undefined
  hasTime?: boolean
  onCommit: (iso: string | null, hasTime: boolean) => Promise<unknown>
}) {
  return (
    <DateBox<DateWrite>
      type="datetime-local"
      shown={toDateTimeInput(stored, hasTime)}
      toValue={(typed) => fromDateTimeBox(typed, stored, hasTime)}
      onCommit={(write) => onCommit(write?.iso ?? null, write?.hasTime ?? false)}
      {...box}
    />
  )
}

/**
 * A stored date in a day box: the day it is shown as, and a day picked written
 * with the time it carries kept (`withDatePart`) — a subtask's or a row's due
 * date, where a full date-and-time box would not fit.
 */
export function DayBox({
  stored,
  hasTime,
  onCommit,
  ...box
}: BoxProps & {
  stored: string | null | undefined
  /** The task's flag for `stored`: a day picked keeps the time it carries, and says so. */
  hasTime?: boolean
  onCommit: (iso: string | null, hasTime: boolean) => Promise<unknown>
}) {
  return (
    <DateBox<DateWrite>
      type="date"
      shown={toDateInput(stored, hasTime)}
      toValue={(ymd) => {
        const iso = withDatePart(stored, ymd, hasTime)
        return iso ? { iso, hasTime: carriesTime(stored, hasTime) } : null
      }}
      onCommit={(write) => onCommit(write?.iso ?? null, write?.hasTime ?? false)}
      {...box}
    />
  )
}
