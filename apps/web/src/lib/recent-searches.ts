/**
 * §G02 — the last few things you searched for, per workspace.
 *
 * "jaise ke maine search kiya par mujhe koi cheez show nahi hui" `[01:24]` —
 * a search that found nothing is usually followed by the same search, spelled
 * differently, a minute later. Retyping it from memory is the part that wastes
 * the minute.
 *
 * Local to the browser on purpose. This is a convenience, not a record: it is
 * one person's recent typing, it is worth nothing on another device, and
 * sending every query anyone types to the server to store forever is a
 * meaningfully worse trade than forgetting them when the profile is cleared.
 *
 * Keyed per workspace, because "invoice" in one workspace and "invoice" in
 * another are different searches with different answers.
 */

const KEY = 'rundesk.search.recent'
const PER_WORKSPACE = 6

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

/** The recent queries for one workspace, newest first. */
export function recentSearches(workspaceId: string | null | undefined): string[] {
  if (!workspaceId) return []
  const list = read()[workspaceId]
  return Array.isArray(list) ? list.filter((q) => typeof q === 'string') : []
}

/**
 * Remember a query.
 *
 * Case-insensitive de-dupe that keeps the NEWEST spelling: somebody who
 * searched "Acme" and later "acme" meant the same thing, and showing both is
 * two rows saying one thing. Re-searching an old query moves it to the front
 * rather than adding a duplicate.
 */
export function rememberSearch(workspaceId: string | null | undefined, raw: string): void {
  const query = raw.trim()
  // One character is a keystroke on the way to a word, not a search.
  if (!workspaceId || query.length < 2) return
  try {
    const store = read()
    const existing = store[workspaceId] ?? []
    const next = [query, ...existing.filter((q) => q.toLowerCase() !== query.toLowerCase())]
    store[workspaceId] = next.slice(0, PER_WORKSPACE)
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Not being able to remember a search is not worth an error anybody sees.
  }
}

/** Forget one query, for when it should not have been kept. */
export function forgetSearch(workspaceId: string | null | undefined, query: string): void {
  if (!workspaceId) return
  try {
    const store = read()
    store[workspaceId] = (store[workspaceId] ?? []).filter((q) => q !== query)
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* see above */
  }
}
