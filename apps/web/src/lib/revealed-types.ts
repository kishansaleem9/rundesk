/**
 * §G02-6 [02:01] — the type chips promoted out of the "⋯" menu, per workspace.
 *
 * > "yeh 3 DOTS dekh rahe hain? Main yahan se aur points pe click out kar ke …
 * >  to folders yahan pe appear ho jayega."
 *
 * Choosing "Folders" from the overflow put a Folders chip in the row, and the
 * palette is mounted only while it is open — so the chip was gone the next time
 * ⌘K was pressed. The control worked exactly once and then undid itself, which
 * is worse than not offering it: you learn it does nothing.
 *
 * Local to the browser, like `recent-searches` beside it and for the same
 * reason: this is which chips one person likes seeing, not a record. Keyed per
 * workspace, because the types worth having on the bar differ between a
 * workspace full of docs and one full of tasks.
 */

const KEY = 'rundesk.search.revealedTypes'

type Store = Record<string, string[]>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    // Private mode, blocked storage, or something else's data under our key.
    return {}
  }
}

/** The types promoted onto the chip row in this workspace. */
export function revealedTypesFor(workspaceId: string | null | undefined): string[] {
  if (!workspaceId) return []
  const list = read()[workspaceId]
  return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : []
}

/**
 * Replace the promoted set for a workspace.
 *
 * Takes the whole set rather than one addition, because the caller already
 * holds it and a merge here would quietly resurrect a chip somebody removed.
 */
export function rememberRevealedTypes(
  workspaceId: string | null | undefined,
  types: Iterable<string>,
): void {
  if (!workspaceId) return
  try {
    const store = read()
    store[workspaceId] = [...new Set(types)]
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Not being able to remember which chips you like is not worth an error.
  }
}
