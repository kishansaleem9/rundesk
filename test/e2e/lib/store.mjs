/**
 * THE LANE'S OBJECT STORE, as a suite reaches it — in one place.
 *
 * `task-cover` and `attach-on-create` each carried their own copy of the lane
 * formula (lane k runs its API on 302k and its store on 91k), and a third
 * suite was about to. Three copies of an address is the duplicated list: the
 * day the lanes move, two of them follow and one quietly arms a failure on a
 * port nothing listens on. CI sets `E2E_STORE_PORT` once, at job level, and
 * every suite reads it here.
 */

/** Where the store listens: `--store`, then `E2E_STORE_PORT`, then the lane formula. */
export function storeBase(apiPort, override) {
  const port = Number(override ?? process.env.E2E_STORE_PORT ?? 9100 + (apiPort - 3020))
  return `http://127.0.0.1:${port}`
}

/**
 * The stub's request log — what the product asked the bucket to do — as
 * `{ seq, requests }`, or null when the store cannot be read. Read `seq`
 * BEFORE acting and keep only entries numbered after it: the log is shared by
 * everything that ran on this lane before, and a reset in between does not
 * renumber it.
 */
export async function storeRequests(base) {
  try {
    const res = await fetch(`${base}/__control/requests`)
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body?.requests) && typeof body?.seq === 'number' ? body : null
  } catch {
    return null
  }
}
