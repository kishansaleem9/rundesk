/**
 * THE LANE'S SEARCH ENGINE, as a suite reaches it — in one place
 * (`commit-log/log-68c0345-1`).
 *
 * `SearchService` searches through Meilisearch when the API was started with
 * `MEILISEARCH_URL`, and through Postgres when it was not. A lane that
 * `RUNDESK_LANE_SEARCH` names runs `scripts/e2e-lanes/meili-stub.mjs` on 93k
 * beside its API on 302k (`lane-env.sh`); `--search` or `E2E_SEARCH_PORT`
 * overrides the formula, as `--store` and `E2E_STORE_PORT` do for the store.
 *
 * A SUITE THAT READS THE INDEX HAS TO HOLD ON BOTH, with the same number of
 * checks, so it asks which engine answers and asserts that engine's half:
 * where Meilisearch answers, what the indexers wrote into it; where it does
 * not, the Postgres rows the fallback reads.
 */

/** The index `SearchService` writes to and searches. */
export const SEARCH_INDEX = 'rundesk'

/** Where the lane's search stub listens: `--search`, then `E2E_SEARCH_PORT`, then 9300 + lane. */
export function searchStubBase(apiPort, override) {
  const port = Number(override ?? process.env.E2E_SEARCH_PORT ?? 9300 + (apiPort - 3020))
  return `http://127.0.0.1:${port}`
}

const getJson = async (url) => {
  const res = await fetch(url).catch(() => null)
  if (!res) return { status: 0, body: null }
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/**
 * WHICH ENGINE ANSWERS THIS LANE'S SEARCH, asked of what is running rather than
 * of how the lane was meant to start. `{ meili, said }`.
 *
 * Meilisearch when the lane's stub holds the product's index and its settings
 * were written by THE API ANSWERING NOW: its init writes them once, before it
 * listens, so a `configuredAt` after the API's start (off `/health`'s
 * `uptimeMs`) is this API's own. Postgres otherwise — no stub, a stub nobody
 * configured, or one an earlier API configured before it was replaced by one
 * not pointed at it (a stub outlives the API that used it).
 *
 * Not "a search reached the stub" and not "the stub holds a document": those
 * are the search path and the indexers, which are what the suites that ask
 * this are measuring, so neither may decide which half of a check runs.
 */
export async function searchEngine(apiBase, stubBase) {
  const health = await getJson(`${apiBase}/health`)
  const h = health.body?.data ?? health.body
  const startedAt = typeof h?.timestamp === 'string' && Number.isFinite(h?.uptimeMs)
    ? Date.parse(h.timestamp) - h.uptimeMs
    : null
  const state = await getJson(`${stubBase}/__control/state`)
  const configuredAt = state.body?.indexes?.[SEARCH_INDEX]?.configuredAt ?? null
  if (state.status !== 200) return { meili: false, said: `no search stub answers at ${stubBase}` }
  if (startedAt === null) return { meili: false, said: `the API's /health gave no start time (${health.status})` }
  if (configuredAt === null) return { meili: false, said: `the stub at ${stubBase} holds no configured "${SEARCH_INDEX}" index` }
  // A second of slack, which no restart comes close to: an API is killed and
  // booted before its successor writes anything.
  if (configuredAt < startedAt - 1000) {
    return { meili: false, said: `the stub's index was configured ${Math.round((startedAt - configuredAt) / 1000)}s before this API started, by another` }
  }
  return { meili: true, said: `this API configured the stub's index at ${stubBase}` }
}

/** One document of the index, by its id (`task-<uuid>`, `doc-<uuid>`, `file-<uuid>`), or null. */
export async function stubDocument(stubBase, id) {
  const r = await getJson(`${stubBase}/__control/documents?index=${SEARCH_INDEX}&id=${encodeURIComponent(id)}`)
  return r.status === 200 ? r.body?.document ?? null : null
}

/** The index's documents whose attributes equal `where` (`{ workspaceId }`), or null when the stub cannot be read. */
export async function stubDocuments(stubBase, where = {}) {
  const q = new URLSearchParams({ index: SEARCH_INDEX, ...where })
  const r = await getJson(`${stubBase}/__control/documents?${q}`)
  return r.status === 200 && Array.isArray(r.body?.documents) ? r.body.documents : null
}

/**
 * The stub's request log, `{ seq, requests }`, or null. Read `seq` BEFORE
 * acting and keep only entries numbered after it — `lib/store.mjs`'s rule.
 */
export async function stubRequests(stubBase) {
  const r = await getJson(`${stubBase}/__control/requests`)
  return r.status === 200 && Array.isArray(r.body?.requests) && typeof r.body?.seq === 'number' ? r.body : null
}

/** The searches the product sent after `seq` for exactly `q`. */
export async function searchesSince(stubBase, seq, q) {
  const log = await stubRequests(stubBase)
  return (log?.requests ?? []).filter((r) => r.n > seq && r.action === 'search' && r.q === q)
}

/**
 * Send the stub's index away, or bring it back. While it is away the stub
 * drops every product request unanswered, as a Meilisearch that has stopped
 * does; `POST /__control/reset` brings it back too. True when the stub did as
 * asked.
 */
export async function stubAway(stubBase, away) {
  const res = await fetch(`${stubBase}/__control/away?on=${away}`, { method: 'POST' }).catch(() => null)
  const body = res ? await res.json().catch(() => null) : null
  return res?.status === 200 && body?.away === away
}
