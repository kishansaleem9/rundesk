/**
 * Stale-chunk recovery.
 *
 * Every screen in this app arrives as a dynamic import — 47 generated lazy
 * routes plus the command palette and the AI dock — and every deploy publishes
 * a fresh set of content-hashed chunks and deletes the previous ones. So a tab
 * that was opened before a deploy is still running the *old* index.html: the
 * moment it imports a chunk, the browser asks for a filename that no longer
 * exists on the server, the import rejects, and the router's error boundary
 * replaces the entire app with "Something went wrong".
 *
 * That is the crash in the 7 Aug review video — the whole shell gone, reading
 * "Failed to fetch dynamically imported module:
 * https://rundesk.theaura.agency/assets/command-palette-NaNmjPLK.js" — and it
 * is why the same click works in a browser that loaded the page after the
 * deploy: a fresh tab fetches the current manifest and asks for chunks that
 * are actually there.
 *
 * There is no way to recover in place, because the file the running page wants
 * is gone. The only correct move is to go and get the current index.html —
 * i.e. reload. `location.reload()` re-requests the document with cache mode
 * "reload", so it revalidates past any stale copy in the HTTP cache.
 *
 * The reload is guarded: if we already reloaded moments ago and are still
 * hitting chunk errors, the deploy itself is broken and reloading again would
 * only spin. In that case we stand down and let the error boundary show, which
 * is at least an honest, readable failure.
 */

const RELOAD_STAMP_KEY = 'rundesk.chunk-reload-at'

/**
 * How recently a recovery reload must have happened for us to conclude that
 * reloading is not working. A reload takes a second or two; anything still
 * failing 30s later is not a staleness problem.
 */
const RELOAD_COOLDOWN_MS = 30_000

/**
 * The message every engine uses for "I could not load that module." Chromium,
 * Firefox and WebKit each word it differently, and Vite's own preload helper
 * adds two more for chunk assets it fetches ahead of the import.
 */
const CHUNK_ERROR_RE =
  /(failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|loading chunk \S+ failed|loading css chunk)/i

function messageOf(error: unknown): string {
  if (!error) return ''
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const maybe = error as { message?: unknown }
    if (typeof maybe.message === 'string') return maybe.message
  }
  return ''
}

/** True when `error` is "the chunk I asked for isn't there", in any engine. */
export function isChunkLoadError(error: unknown): boolean {
  return CHUNK_ERROR_RE.test(messageOf(error))
}

/**
 * Whether a recovery reload is still worth attempting. Pure — safe to call
 * during render to decide what to show. Falls back to "yes" if sessionStorage
 * is unavailable (private mode, blocked storage): one reload is better than a
 * permanently dead app.
 */
export function canReloadForStaleChunks(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stamp = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0)
    if (!stamp) return true
    return Date.now() - stamp > RELOAD_COOLDOWN_MS
  } catch {
    return true
  }
}

/**
 * Reloading is not enough on its own. The service worker answers navigations
 * from its own precached copy of index.html, and that worker only updates
 * between page loads — so a tab that has been open across a deploy would
 * reload straight back into the same stale shell, and the entry chunk *that*
 * names would 404 too, leaving a blank page. Retiring the worker and its
 * caches first guarantees the reload reaches the network. The page registers a
 * fresh worker on the way back up.
 *
 * Bounded: a wedged worker must not be able to hold the reload hostage.
 */
export async function retireStaleWorker(): Promise<void> {
  const teardown = (async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)))
    }
    if (typeof caches !== 'undefined') {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name).catch(() => false)))
    }
  })().catch(() => undefined)

  await Promise.race([
    teardown,
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ])
}

/**
 * Reload to pick up the current build. Returns whether the reload was actually
 * started, so callers can fall back to showing an error when it wasn't.
 */
export function reloadForStaleChunks(): boolean {
  if (!canReloadForStaleChunks()) return false
  try {
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()))
  } catch {
    /* storage blocked — proceed anyway; the cooldown is a nicety, not a lock */
  }
  void retireStaleWorker().finally(() => window.location.reload())
  return true
}

/**
 * Install the global listeners for chunk failures that never reach a React
 * error boundary:
 *
 *  - `vite:preloadError` — the router preloads a route's chunk on hover
 *    (`defaultPreload: 'intent'`), so a stale tab can hit this without the user
 *    having navigated anywhere. Vite rethrows unless we preventDefault.
 *  - `unhandledrejection` — an `import()` awaited outside a boundary, e.g. in
 *    an event handler.
 */
export function installChunkReloadHandlers(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadForStaleChunks()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return
    if (reloadForStaleChunks()) event.preventDefault()
  })
}

/**
 * `React.lazy` that survives a flaky network. A second attempt costs one round
 * trip and rescues the genuinely transient case; a chunk that is *gone* fails
 * again and is rethrown, which is what we want — the boundary then reloads.
 */
export function lazyChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load()
    } catch (error) {
      if (!isChunkLoadError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 400))
      return await load()
    }
  }
}
