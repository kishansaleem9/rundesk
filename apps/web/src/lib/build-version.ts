/**
 * Noticing that the app you are running is no longer the app that shipped.
 *
 * A tab open across a deploy keeps running the code it loaded with. Nothing
 * breaks — chunk-reload.ts covers the case where a lazy import 404s — so there
 * is no error, no prompt, and no reason for anyone to reload. They simply keep
 * using an older product.
 *
 * On 21 Aug 2026 that is what happened: a browser held a build from before
 * three shipped features and showed none of them. Every check we had said the
 * deploy was fine, and every check was right — verify-ui.mjs opens a fresh
 * profile, and both browser suites set `serviceWorkers: 'block'`, so all of
 * them see what a first-time visitor sees and none of them see what a returning
 * user sees. The only way out was clearing site data by hand.
 *
 * The build stamps its own identity (vite.config.ts) and writes the same value
 * to /version.json. Comparing the two answers "is what I am running still what
 * the server has?" — the question nothing was asking.
 */

import { retireStaleWorker } from './chunk-reload'

/** Injected by vite `define`. Falls back so tests and dev do not need it. */
declare const __BUILD_ID__: string | undefined
export const RUNNING_BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'dev'

/** How often to ask, while the tab is in the foreground. */
const POLL_MS = 15 * 60 * 1000

/**
 * Don't ask more than this often however many times the tab is focused. Tab
 * switching is not a signal that anything was deployed.
 */
const MIN_GAP_MS = 60 * 1000

/**
 * And ask once shortly after load, throttle bypassed.
 *
 * The first draft of this skipped the load-time check on the reasoning that a
 * tab which just started must be running whatever the server just served it.
 * That is the precise assumption this whole module exists because of: with a
 * service worker in play the shell can come from its cache, so a "fresh" load
 * can be arbitrarily old. The one case worth checking is the one I talked
 * myself out of.
 */
const FIRST_CHECK_MS = 2_000

/**
 * Test seam, read once at watch time.
 *
 * The e2e case deploys underneath a tab that must *not* reload — reloading is
 * what we are trying to make unnecessary, and a test that reloads to trigger
 * the check has quietly fetched the new build and proved nothing. So it has to
 * poll, which means the interval and the throttle have to come down together;
 * shrinking only the first delay leaves the poll 15 minutes away.
 */
function timings(): { first: number; poll: number; gap: number } {
  const override = (window as { __RUNDESK_BUILD_CHECK_MS__?: unknown })
    .__RUNDESK_BUILD_CHECK_MS__
  if (typeof override === 'number' && override > 0) {
    return { first: override, poll: override, gap: 0 }
  }
  return { first: FIRST_CHECK_MS, poll: POLL_MS, gap: MIN_GAP_MS }
}

let lastCheck = 0
let stale = false

/**
 * Ask the server which build it is serving.
 *
 * `no-store` is the point of the whole exercise: this one request must never be
 * answered from a cache, or it would confirm whatever the cache already
 * believed. Returns null when the answer is unusable — offline, a proxy error,
 * an HTML error page — because "I could not tell" must never be reported as
 * "you are out of date". A spurious reload loop is a worse failure than a
 * missed update.
 */
export async function fetchServerBuildId(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl('/version.json', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const id = (body as { buildId?: unknown } | null)?.buildId
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

/**
 * True when the server is serving a build that is not this one.
 *
 * 'dev' never counts: an unstamped bundle is a dev server or a test, and
 * telling those they are stale would be noise on every save.
 */
export async function isStale(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (RUNNING_BUILD_ID === 'dev') return false
  const serverId = await fetchServerBuildId(fetchImpl)
  if (!serverId) return false
  return serverId !== RUNNING_BUILD_ID
}

/**
 * Reload onto the current build.
 *
 * Retiring the worker first is not optional. Some browsers are still running a
 * worker registered before the config that stopped it precaching index.html,
 * and that worker answers navigations from its own stale shell — so a plain
 * reload lands straight back on the build we are trying to leave. Unregistering
 * and clearing the caches guarantees the reload reaches the network; the page
 * registers a fresh worker on the way back up.
 */
export async function reloadOntoCurrentBuild(): Promise<void> {
  await retireStaleWorker()
  window.location.reload()
}

/**
 * Watch for a newer build, and call `onStale` once when there is one.
 *
 * Deliberately does not reload on its own. A reload throws away whatever is in
 * an unsaved editor, and doing that to someone mid-sentence to deliver a
 * feature they did not ask for is not an improvement. The caller shows an
 * affordance; the person picks the moment.
 *
 * Returns a teardown function.
 */
export function watchForNewBuild(onStale: () => void): () => void {
  if (typeof window === 'undefined' || RUNNING_BUILD_ID === 'dev') return () => {}

  let stopped = false
  const { first, poll, gap } = timings()

  const check = async (force = false) => {
    if (stopped || stale) return
    const now = Date.now()
    if (!force && now - lastCheck < gap) return
    lastCheck = now
    if (await isStale()) {
      stale = true
      onStale()
    }
  }

  // Coming back to a tab is the moment a deploy is most likely to have happened
  // since you last looked, and the cheapest moment to find out.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }

  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => void check(), poll)

  // Shortly after load, past first paint. See FIRST_CHECK_MS: a load is not
  // evidence of freshness when a worker can answer it from cache.
  const firstTimer = window.setTimeout(() => void check(true), first)

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
    window.clearTimeout(firstTimer)
  }
}

/** Test seam: forget that we have already reported staleness. */
export function resetBuildWatcherForTests(): void {
  lastCheck = 0
  stale = false
}
