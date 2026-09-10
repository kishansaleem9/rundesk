/**
 * The activity feed as a rail you can turn on, frame `03:40`.
 *
 * The frame's note is "**Activity panel is toggleable** (button top-right of the
 * task)", and at `01:20` the activity feed sits to the RIGHT of the task while
 * the field grid is still on screen. Rundesk had the feed as a tab, which means
 * reading the history and reading the fields are two different screens: you
 * cannot see "You estimated 12 hours" next to the estimate it changed.
 *
 * WHY A MODULE. Two things read this preference — the sheet chrome, which has to
 * make room and drop the Activity tab, and the rail itself — and one of them
 * lives several hundred lines from the other. Kept as component state it would
 * be lifted, threaded and eventually copied, which is the shape of every
 * duplicated-state bug found in this codebase so far. Same shape as
 * `collapse-empty-fields.ts` deliberately: one preference, one store, and any
 * number of readers that cannot disagree.
 *
 * WHY IT IS OFF BY DEFAULT, when ClickUp shows the panel straight away. The
 * walkthrough's task is a full-page view; Rundesk's is a side sheet, 672px wide
 * until somebody expands it, and splitting that in two would leave both halves
 * too narrow to read. So turning the rail on also expands the sheet — asking for
 * the rail asks for the room it needs — and the gap the re-audit actually named
 * is that the panel could not be toggled at all.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'rundesk.activityRail'

const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    // Private windows and blocked site data throw on access rather than
    // returning null. A preference that cannot be read is simply off.
    return false
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setActivityRail(next: boolean): void {
  try {
    window.localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Still notify: the toggle should work for this session even where it
    // cannot be remembered for the next one.
  }
  for (const fn of listeners) fn()
}

/** The current preference, live — every reader re-renders when it changes. */
export function useActivityRail(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
