/**
 * "Collapse empty fields" — frame `01:20`.
 *
 * The task detail page in the walkthrough shows a two-column field grid with
 * `Time estimate  Empty` in it and a **"Collapse empty fields"** control beside
 * the grid. A task carries a fixed set of built-in fields plus every custom
 * field defined on the workspace, and most tasks fill in a handful; without
 * this the page is mostly labels with nothing under them.
 *
 * WHY THIS IS A MODULE AND NOT TWO PIECES OF COMPONENT STATE. Empty fields
 * appear in two places — the built-in grid on Overview and the custom-field
 * list on the Fields tab — and the preference is one preference. Kept as local
 * state in each, they would drift apart the moment either changed, and "what
 * counts as empty" would end up written twice with two different answers. That
 * is the shape of every duplicated-logic bug found in this codebase so far, so
 * both the flag and the predicate live here, once.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'rundesk.collapseEmptyFields'

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

export function setCollapseEmptyFields(next: boolean): void {
  try {
    window.localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Still notify: the toggle should work for this session even where it
    // cannot be remembered for the next one.
  }
  for (const fn of listeners) fn()
}

/** The current preference, live — every reader re-renders when it changes. */
export function useCollapseEmptyFields(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}

/**
 * Whether a field value counts as empty.
 *
 * `false` and `0` are NOT empty. An unticked checkbox that has never been
 * touched arrives as null; one somebody deliberately set to "no" arrives as
 * `false`, and hiding that would hide an answer. Same for a number field
 * holding zero — zero is a measurement, not the absence of one.
 */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}
