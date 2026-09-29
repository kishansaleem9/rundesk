#!/usr/bin/env node
/*
 * A MEILISEARCH, SO "NO LANE RUNS ONE" STOPS BEING A VERDICT TOO
 * (`commit-log/log-68c0345-1`).
 *
 * `SearchService` talks to Meilisearch through the `meilisearch` client when
 * `MEILISEARCH_URL` (or `MEILI_HOST`) is set, and otherwise falls back to a
 * Postgres ILIKE query. No lane and no CI job set it, so the whole Meilisearch
 * half — `indexTask`, `indexDoc`, the file indexer, `removeTask`, the workspace
 * rebuild, and the search that reads what they wrote — was exercised by
 * nothing, and `doc-import` recorded indexing as unmeasurable. It is the
 * reason storage and the model shed this week, one subsystem over.
 *
 * THE SEAM NEEDS NO PRODUCT CHANGE. `onModuleInit` reads the URL and the key
 * from the environment and builds `new MeiliSearch({ host, apiKey })`; point
 * the URL here and the real client, the real index calls and the real search
 * path all run. What was missing was something to answer.
 *
 * WHAT IT SPEAKS — the subset the service's calls put on the wire (meilisearch
 * 0.41, read from `node_modules/meilisearch/src`), and nothing else:
 *
 *   POST   /indexes                          createIndex('rundesk', { primaryKey: 'id' })
 *   GET    /indexes/:uid                     the index's own record (getIndex)
 *   GET    /indexes/:uid/settings            the settings as stored (getSettings)
 *   PATCH  /indexes/:uid/settings            updateSettings — searchable, filterable, sortable
 *   POST   /indexes/:uid/documents           addDocuments — add, or replace by primary key
 *   DELETE /indexes/:uid/documents/:id       deleteDocument — `removeTask`
 *   POST   /indexes/:uid/documents/delete    deleteDocuments({ filter }) — the rebuild's clear
 *   GET    /tasks/:uid                       waitForTask polls this
 *   POST   /indexes/:uid/search              search(q, { filter: [...], limit, offset, sort })
 *
 * Every write answers 202 with an enqueued task, as Meilisearch does, and the
 * task is carried out before the answer leaves: a caller that waits for it
 * finds it finished, and one that does not (every indexer but the rebuild)
 * cannot race it. A task that fails says why in `GET /tasks/:uid`, with
 * Meilisearch's own codes — `index_already_exists` for the service's second
 * createIndex on every restart, `index_not_found`, `invalid_document_filter`,
 * `invalid_document_id`.
 *
 * AS MEILISEARCH REFUSES. An unknown index is a 404 `index_not_found` to a
 * search or a read; a filter on an attribute that is not filterable, or a sort
 * on one that is not sortable, is a 400 before anything is matched. A document
 * write or a settings write makes the index if it is missing, as Meilisearch
 * does. `--key` turns on the master key: every request without
 * `Authorization: Bearer <key>` is a 401, with a wrong one a 403 — so a
 * product that stopped sending its key would lose the index here as it would
 * in production, rather than being served anyway.
 *
 * THE FILTER GRAMMAR IS EXACTLY WHAT `search.service.ts` BUILDS: terms of the
 * form `attr = "value"`, joined by `OR`, in parentheses, and an array of those
 * meaning AND — `workspaceId = "<id>"` and `(entityType = "task" OR …)` for a
 * search, `workspaceId = "<id>"` for the rebuild. Anything else Meilisearch
 * would accept — `AND` inside a string, `!=`, `IN`, `EXISTS`, a nested array,
 * an unquoted value — is refused here with a 400 that names this file. A stub
 * that ignored an operator it did not know would answer as though the product
 * had not filtered at all, which is the failure a filter exists to prevent.
 *
 * WHAT IT DOES NOT MODEL, AND NO CHECK SHOULD LEAN ON: relevance. There is no
 * tokeniser, no typo tolerance and no prefix search. A document matches when
 * the whole query, lower-cased, is contained in one of its searchable
 * attributes — the Postgres fallback's ILIKE, on the index's fields. So a
 * suite cannot tell the two engines apart by WHAT matches a word; it can tell
 * them apart by what was indexed, which is what this exists to measure. Order
 * is deterministic: with `sort`, by the sort alone (documents without the
 * attribute last); without it, by the earliest searchable attribute that
 * matched, then by the order documents were first added.
 *
 * THE RECORD A SUITE READS, under `/__control/` (never behind the key, never
 * in the request log):
 *
 *   GET  /__control/version     the hash of this file — `lane-env.sh` restarts a stale stub
 *   GET  /__control/state       each index: its settings, its document count, and
 *                               `configuredAt`, when the product last wrote its settings
 *   GET  /__control/documents   ?index=<uid>&id=<id>, or ?index=<uid>&<attr>=<value>…
 *   GET  /__control/requests    every product request, numbered; `seq` survives a reset
 *   POST /__control/reset       forgets the request log — never the documents — and
 *                               brings the index back if it was sent away
 *   POST /__control/away        ?on=true: every product request is dropped unanswered,
 *                               as by a Meilisearch that has stopped; ?on=false brings it back
 *
 * The documents are the lane's, as the object store's objects are: a reset
 * that emptied the index would leave the running API searching an index it
 * created at boot and will never create again.
 *
 * NOT FOR PRODUCTION. Binds loopback, holds everything in memory, and refuses
 * to start without `RUNDESK_MEILI_STUB=1`.
 *
 *   RUNDESK_MEILI_STUB=1 node scripts/e2e-lanes/meili-stub.mjs --port 9300 [--key <master key>]
 *
 * Prints one line of JSON when it is listening, so callers wait on readiness
 * rather than sleeping.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

if (process.env.RUNDESK_MEILI_STUB !== '1') {
  console.error('[meili-stub] refusing to start without RUNDESK_MEILI_STUB=1 — this is a test double, not a search engine')
  process.exitCode = 1
  process.exit()
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const PORT = Number(arg('port', 9300))
const KEY = arg('key', null)
/*
 * WHICH SOURCE THIS PROCESS IS RUNNING, for the reason the other two stubs
 * give: a lane's stub lives for days and its launcher keeps a running one, so
 * a change to this file reaches a lane only because `lane-env.sh` compares this
 * with the file on disk and restarts a stub whose source has moved.
 */
const SOURCE = createHash('sha1').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12)

/** uid → { uid, primaryKey, createdAt, updatedAt, configuredAt, settings, documents: Map<id, doc> } */
const indexes = new Map()
/** taskUid → the task as `GET /tasks/:uid` answers it. Capped: a lane's stub lives for days. */
const tasks = new Map()
const TASK_CAP = 10_000
let nextTaskUid = 0
/*
 * EVERY PRODUCT REQUEST, IN ORDER, numbered by a counter that a reset does not
 * rewind — the store stub's rule. A suite reads `seq` before it acts and looks
 * only at what came after, so another suite's traffic, or a reset in between,
 * cannot answer for it.
 */
const requests = []
let requestSeq = 0
const REQUEST_LOG_CAP = 2000
/*
 * SENT AWAY: a Meilisearch that stopped under a running API, for a suite that
 * asks what search does then (`found-29-sep/meili-gone-after-boot-fails-every-search`).
 * Its requests are logged and dropped, never answered.
 */
let away = false

/*
 * The attributes Meilisearch starts an index with, for the four settings the
 * service writes and the search reads. Anything else a caller sets is kept as
 * given and read back, and does nothing here.
 */
const DEFAULT_SETTINGS = () => ({
  searchableAttributes: ['*'],
  filterableAttributes: [],
  sortableAttributes: [],
  displayedAttributes: ['*'],
})
const ARRAY_SETTINGS = ['searchableAttributes', 'filterableAttributes', 'sortableAttributes', 'displayedAttributes']
const OTHER_SETTINGS = new Set([
  'rankingRules', 'stopWords', 'synonyms', 'distinctAttribute', 'typoTolerance', 'faceting', 'pagination',
  'separatorTokens', 'nonSeparatorTokens', 'dictionary', 'proximityPrecision', 'embedders', 'searchCutoffMs',
  'localizedAttributes',
])

/** A Meilisearch error body: the client turns it into a `MeiliSearchApiError` carrying `code`. */
const meiliError = (status, code, message, type = 'invalid_request') => [
  status,
  { message, code, type, link: `https://docs.meilisearch.com/errors#${code}` },
]

/** Thrown inside a task to fail it, as Meilisearch fails a task it accepted. */
class TaskFailure extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}
/** Thrown while reading a request to refuse it outright, with a status. */
class Refusal extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/*
 * ENQUEUE AND FINISH IN ONE STEP. The answer is what Meilisearch sends — 202,
 * `status: "enqueued"` — and the task it names is already done by the time
 * anyone asks for it.
 */
const enqueue = (indexUid, type, run) => {
  const uid = nextTaskUid++
  const enqueuedAt = new Date().toISOString()
  let status = 'succeeded'
  let error = null
  let details = {}
  try {
    details = run() ?? {}
  } catch (e) {
    if (!(e instanceof TaskFailure)) throw e
    status = 'failed'
    details = e.details
    error = { message: e.message, code: e.code, type: 'invalid_request', link: `https://docs.meilisearch.com/errors#${e.code}` }
  }
  tasks.set(uid, {
    uid, indexUid, status, type, canceledBy: null, details, error, duration: 'PT0S',
    enqueuedAt, startedAt: enqueuedAt, finishedAt: new Date().toISOString(),
  })
  if (tasks.size > TASK_CAP) tasks.delete(tasks.keys().next().value)
  return [202, { taskUid: uid, indexUid, status: 'enqueued', type, enqueuedAt }]
}

const makeIndex = (uid, primaryKey = null) => {
  const now = new Date().toISOString()
  const index = {
    uid, primaryKey, createdAt: now, updatedAt: now, configuredAt: null,
    settings: DEFAULT_SETTINGS(), documents: new Map(),
  }
  indexes.set(uid, index)
  return index
}
const touch = (index) => { index.updatedAt = new Date().toISOString() }
const UID_SHAPE = /^[A-Za-z0-9_-]{1,400}$/
// Meilisearch's rule for a document id: letters, digits, `-` and `_`, or an integer.
const DOC_ID_SHAPE = /^[A-Za-z0-9_-]{1,511}$/

// ── FILTERS ──────────────────────────────────────────────────────────────────

/*
 * `expr := term (OR term)*`, `term := ( expr ) | attr = "value"`. Returns the
 * attributes it names and a predicate; throws a Refusal on anything else.
 */
const parseFilter = (text) => {
  let i = 0
  const src = String(text)
  const refuse = (what) => {
    throw new Refusal(
      400,
      'invalid_search_filter',
      `filter ${JSON.stringify(src)}: ${what} at character ${i} — meili-stub.mjs speaks only what search.service.ts ` +
        'builds: attr = "value" terms, OR, and parentheses (an array of those is AND)',
    )
  }
  const skip = () => { while (i < src.length && /\s/.test(src[i])) i += 1 }
  const attrs = []
  const term = () => {
    skip()
    if (src[i] === '(') {
      i += 1
      const inner = expr()
      skip()
      if (src[i] !== ')') refuse('an unclosed parenthesis')
      i += 1
      return inner
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))?.[0]
    if (!name) refuse(`${JSON.stringify(src.slice(i, i + 12))} where an attribute should be`)
    if (['AND', 'OR', 'NOT', 'TO', 'IN', 'EXISTS', 'IS'].includes(name)) refuse(`the operator ${name}`)
    i += name.length
    skip()
    if (src[i] !== '=' || src[i + 1] === '=') refuse(`${JSON.stringify(src.slice(i, i + 3))} where = should be`)
    i += 1
    skip()
    if (src[i] !== '"') refuse('a value that is not in double quotes')
    i += 1
    let value = ''
    for (;;) {
      if (i >= src.length) refuse('an unterminated string')
      if (src[i] === '\\' && i + 1 < src.length) { value += src[i + 1]; i += 2; continue }
      if (src[i] === '"') { i += 1; break }
      value += src[i]
      i += 1
    }
    attrs.push(name)
    return (doc) => {
      const v = doc[name]
      if (Array.isArray(v)) return v.some((x) => (typeof x === 'string' || typeof x === 'number') && String(x) === value)
      return (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && String(v) === value
    }
  }
  const expr = () => {
    const alternatives = [term()]
    for (;;) {
      skip()
      if (src.startsWith('OR', i) && !/[A-Za-z0-9_]/.test(src[i + 2] ?? '')) {
        i += 2
        alternatives.push(term())
        continue
      }
      break
    }
    return alternatives.length === 1 ? alternatives[0] : (doc) => alternatives.some((t) => t(doc))
  }
  const predicate = expr()
  skip()
  if (i < src.length) {
    const word = /^[A-Za-z]+/.exec(src.slice(i))?.[0]
    refuse(word ? `the operator ${word}` : `${JSON.stringify(src.slice(i, i + 12))} after a complete term`)
  }
  return { attrs, predicate }
}

/**
 * A search's or a deletion's `filter`: a string, or an array of strings that
 * are ANDed. Nested arrays (an OR of arrays) are Meilisearch syntax the service
 * never builds, so they are refused like any other unknown form.
 */
const compileFilter = (filter) => {
  if (filter === undefined || filter === null) return { attrs: [], predicate: () => true }
  const parts = typeof filter === 'string' ? [filter] : filter
  if (!Array.isArray(parts)) throw new Refusal(400, 'invalid_search_filter', `filter must be a string or an array of strings, not ${JSON.stringify(filter)}`)
  const compiled = parts.map((p) => {
    if (typeof p !== 'string') {
      throw new Refusal(
        400,
        'invalid_search_filter',
        `filter element ${JSON.stringify(p)} is not a string — meili-stub.mjs does not implement nested filter arrays, which search.service.ts never builds`,
      )
    }
    return parseFilter(p)
  })
  return {
    attrs: compiled.flatMap((c) => c.attrs),
    predicate: (doc) => compiled.every((c) => c.predicate(doc)),
  }
}

/** The attribute Meilisearch names when one is not filterable, in its own words. */
const notFilterable = (index, attrs) => {
  const allowed = index.settings.filterableAttributes ?? []
  const bad = attrs.find((a) => !allowed.includes(a))
  if (!bad) return null
  return allowed.length
    ? `Attribute \`${bad}\` is not filterable. Available filterable attributes are: \`${allowed.join(', ')}\`.`
    : `Attribute \`${bad}\` is not filterable. This index does not have configured filterable attributes.`
}

// ── SEARCH ───────────────────────────────────────────────────────────────────

/** The text of a value, for matching: strings and numbers, and arrays of them. */
const textsOf = (v) =>
  typeof v === 'string' ? [v]
    : typeof v === 'number' ? [String(v)]
      : Array.isArray(v) ? v.flatMap(textsOf)
        : []

const compileSort = (index, sort) => {
  if (sort === undefined || sort === null) return null
  if (!Array.isArray(sort) || sort.some((s) => typeof s !== 'string')) {
    throw new Refusal(400, 'invalid_search_sort', `sort must be an array of "attribute:asc|desc" strings, not ${JSON.stringify(sort)}`)
  }
  const allowed = index.settings.sortableAttributes ?? []
  const rules = sort.map((s) => {
    const m = /^([A-Za-z_][A-Za-z0-9_.]*):(asc|desc)$/.exec(s)
    if (!m) throw new Refusal(400, 'invalid_search_sort', `sort ${JSON.stringify(s)} is not "attribute:asc|desc" — meili-stub.mjs does not implement _geoPoint`)
    if (!allowed.includes(m[1])) {
      throw new Refusal(
        400,
        'invalid_search_sort',
        allowed.length
          ? `Attribute \`${m[1]}\` is not sortable. Available sortable attributes are: \`${allowed.join(', ')}\`.`
          : `Attribute \`${m[1]}\` is not sortable. This index does not have configured sortable attributes.`,
      )
    }
    return { attr: m[1], dir: m[2] === 'asc' ? 1 : -1 }
  })
  // Numbers before strings, a missing value after both, whichever way it runs.
  const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
  return (a, b) => {
    for (const { attr, dir } of rules) {
      const x = a.doc[attr]
      const y = b.doc[attr]
      if (rank(x) !== rank(y)) return rank(x) - rank(y)
      if (rank(x) === 2) continue
      if (x < y) return -dir
      if (x > y) return dir
    }
    return a.at - b.at
  }
}

const shown = (index, doc) => {
  const displayed = index.settings.displayedAttributes ?? ['*']
  if (displayed.includes('*')) return structuredClone(doc)
  return Object.fromEntries(Object.entries(doc).filter(([k]) => displayed.includes(k)).map(([k, v]) => [k, structuredClone(v)]))
}

const nonNegativeInt = (v, fallback, code) => {
  if (v === undefined || v === null) return fallback
  if (!Number.isInteger(v) || v < 0) throw new Refusal(400, code, `${JSON.stringify(v)} is not a non-negative integer`)
  return v
}

const search = (index, body, logged) => {
  if (body.q !== undefined && body.q !== null && typeof body.q !== 'string') {
    throw new Refusal(400, 'invalid_search_q', `q must be a string, not ${JSON.stringify(body.q)}`)
  }
  const q = body.q ?? ''
  const limit = nonNegativeInt(body.limit, 20, 'invalid_search_limit')
  const offset = nonNegativeInt(body.offset, 0, 'invalid_search_offset')
  const filter = compileFilter(body.filter)
  const unfilterable = notFilterable(index, filter.attrs)
  if (unfilterable) throw new Refusal(400, 'invalid_search_filter', unfilterable)
  const bySort = compileSort(index, body.sort)
  const needle = q.trim().toLowerCase()
  const searchable = index.settings.searchableAttributes ?? ['*']
  const matched = []
  let at = 0
  for (const doc of index.documents.values()) {
    at += 1
    if (!filter.predicate(doc)) continue
    let attrRank = 0
    if (needle) {
      const attrs = searchable.includes('*') ? Object.keys(doc) : searchable
      attrRank = attrs.findIndex((a) => textsOf(doc[a]).some((t) => t.toLowerCase().includes(needle)))
      if (attrRank === -1) continue
    }
    matched.push({ doc, attrRank, at })
  }
  matched.sort(bySort ?? ((a, b) => a.attrRank - b.attrRank || a.at - b.at))
  const hits = matched.slice(offset, offset + limit).map((m) => shown(index, m.doc))
  logged.hits = hits.map((h) => h[index.primaryKey ?? 'id'])
  return [200, { hits, query: q, processingTimeMs: 0, limit, offset, estimatedTotalHits: matched.length }]
}

// ── DOCUMENTS ────────────────────────────────────────────────────────────────

/*
 * ADD OR REPLACE, as `addDocuments` asks: a document whose primary key is
 * already there replaces it whole. The key is the index's, else one the
 * request names, else the first attribute whose name ends in "id" — Meilisearch's
 * own inference — and a batch with a document that has no usable id fails as
 * a whole, as Meilisearch fails it.
 */
const addDocuments = (index, docs, askedKey, logged) => {
  let key = index.primaryKey
  if (askedKey && key && askedKey !== key) {
    throw new TaskFailure('index_primary_key_already_exists', `Index \`${index.uid}\` already has a primary key: \`${key}\`.`)
  }
  key = key ?? askedKey ?? Object.keys(docs[0] ?? {}).find((k) => /id$/i.test(k)) ?? null
  if (!key) {
    throw new TaskFailure('index_primary_key_no_candidate_found', 'The primary key inference failed as the engine did not find any field ending with `id` in its name.')
  }
  for (const doc of docs) {
    const id = doc?.[key]
    if (id === undefined || id === null) {
      throw new TaskFailure('missing_document_id', `Document doesn't have a \`${key}\` attribute: \`${JSON.stringify(doc).slice(0, 200)}\`.`)
    }
    if (!(Number.isInteger(id) || (typeof id === 'string' && DOC_ID_SHAPE.test(id)))) {
      throw new TaskFailure(
        'invalid_document_id',
        `Document identifier \`${JSON.stringify(id)}\` is invalid. A document identifier can be of type integer or string, only composed of alphanumeric characters (a-z A-Z 0-9), hyphens (-) and underscores (_), and can not be more than 511 bytes.`,
      )
    }
  }
  index.primaryKey = key
  for (const doc of docs) index.documents.set(String(doc[key]), structuredClone(doc))
  touch(index)
  logged.ids = docs.slice(0, 50).map((d) => String(d[key]))
  return { receivedDocuments: docs.length, indexedDocuments: docs.length }
}

const readJson = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Refusal(400, 'malformed_payload', 'The json payload provided is malformed.'))
      }
    })
    req.on('error', reject)
  })

const indexOr404 = (uid) => {
  const index = indexes.get(uid)
  if (!index) throw new Refusal(404, 'index_not_found', `Index \`${uid}\` not found.`)
  return index
}

// ── THE PRODUCT'S ROUTES ─────────────────────────────────────────────────────

const route = async (req, url, logged) => {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const m = req.method

  if (parts[0] === 'tasks' && parts.length === 2 && m === 'GET') {
    logged.action = 'task.get'
    if (!/^\d+$/.test(parts[1])) throw new Refusal(400, 'invalid_task_uids', `\`${parts[1]}\` is not a valid task uid.`)
    const task = tasks.get(Number(parts[1]))
    logged.taskUid = Number(parts[1])
    if (!task) throw new Refusal(404, 'task_not_found', `Task \`${parts[1]}\` not found.`)
    return [200, task]
  }

  if (parts[0] !== 'indexes') return null

  if (parts.length === 1 && m === 'POST') {
    logged.action = 'index.create'
    const body = (await readJson(req)) ?? {}
    const uid = body.uid
    logged.index = uid
    if (typeof uid !== 'string' || !UID_SHAPE.test(uid)) {
      throw new Refusal(400, 'invalid_index_uid', `\`${uid}\` is not a valid index uid. Index uid can be an integer or a string containing only alphanumeric characters, hyphens (-) and underscores (_).`)
    }
    return enqueue(uid, 'indexCreation', () => {
      if (indexes.has(uid)) throw new TaskFailure('index_already_exists', `Index \`${uid}\` already exists.`)
      makeIndex(uid, typeof body.primaryKey === 'string' ? body.primaryKey : null)
      return { primaryKey: body.primaryKey ?? null }
    })
  }

  const uid = parts[1]
  logged.index = uid

  if (parts.length === 2 && m === 'GET') {
    logged.action = 'index.get'
    const index = indexOr404(uid)
    return [200, { uid, primaryKey: index.primaryKey, createdAt: index.createdAt, updatedAt: index.updatedAt }]
  }

  if (parts.length === 3 && parts[2] === 'settings' && m === 'GET') {
    logged.action = 'settings.get'
    return [200, structuredClone(indexOr404(uid).settings)]
  }

  if (parts.length === 3 && parts[2] === 'settings' && m === 'PATCH') {
    logged.action = 'settings.update'
    const body = (await readJson(req)) ?? {}
    if (typeof body !== 'object' || Array.isArray(body)) throw new Refusal(400, 'bad_request', 'settings must be an object')
    logged.keys = Object.keys(body)
    for (const k of Object.keys(body)) {
      if (!ARRAY_SETTINGS.includes(k) && !OTHER_SETTINGS.has(k)) {
        throw new Refusal(400, 'bad_request', `Unknown field \`${k}\`: expected one of ${[...ARRAY_SETTINGS, ...OTHER_SETTINGS].map((s) => `\`${s}\``).join(', ')}`)
      }
      if (ARRAY_SETTINGS.includes(k) && body[k] !== null && !(Array.isArray(body[k]) && body[k].every((a) => typeof a === 'string'))) {
        throw new Refusal(400, `invalid_settings_${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`, `\`${k}\` must be an array of strings or null`)
      }
    }
    return enqueue(uid, 'settingsUpdate', () => {
      const index = indexes.get(uid) ?? makeIndex(uid)
      const defaults = DEFAULT_SETTINGS()
      for (const [k, v] of Object.entries(body)) index.settings[k] = v === null && k in defaults ? defaults[k] : structuredClone(v)
      index.configuredAt = Date.now()
      touch(index)
      return structuredClone(body)
    })
  }

  if (parts.length === 3 && parts[2] === 'documents' && m === 'POST') {
    logged.action = 'documents.add'
    const body = await readJson(req)
    const docs = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : null
    if (!docs || docs.some((d) => !d || typeof d !== 'object' || Array.isArray(d))) {
      throw new Refusal(400, 'malformed_payload', 'The payload must be an array of JSON objects.')
    }
    return enqueue(uid, 'documentAdditionOrUpdate', () =>
      addDocuments(indexes.get(uid) ?? makeIndex(uid), docs, url.searchParams.get('primaryKey'), logged),
    )
  }

  if (parts.length === 4 && parts[2] === 'documents' && parts[3] === 'delete' && m === 'POST') {
    logged.action = 'documents.delete-by-filter'
    const body = (await readJson(req)) ?? {}
    logged.filter = body.filter
    if (body.filter === undefined || body.filter === null) throw new Refusal(400, 'missing_document_filter', 'Missing field `filter`')
    // The syntax is checked before the task is queued, as Meilisearch checks
    // it; whether the attributes are filterable is the task's to find out.
    let filter
    try {
      filter = compileFilter(body.filter)
    } catch (e) {
      if (e instanceof Refusal) throw new Refusal(400, 'invalid_document_filter', e.message)
      throw e
    }
    return enqueue(uid, 'documentDeletion', () => {
      const index = indexes.get(uid)
      if (!index) throw new TaskFailure('index_not_found', `Index \`${uid}\` not found.`, { originalFilter: JSON.stringify(body.filter), deletedDocuments: 0 })
      const unfilterable = notFilterable(index, filter.attrs)
      if (unfilterable) throw new TaskFailure('invalid_document_filter', unfilterable, { originalFilter: JSON.stringify(body.filter), deletedDocuments: 0 })
      let deleted = 0
      for (const [id, doc] of [...index.documents]) {
        if (filter.predicate(doc)) { index.documents.delete(id); deleted += 1 }
      }
      touch(index)
      logged.deleted = deleted
      return { originalFilter: JSON.stringify(body.filter), deletedDocuments: deleted }
    })
  }

  if (parts.length === 4 && parts[2] === 'documents' && m === 'DELETE') {
    logged.action = 'documents.delete'
    const id = parts[3]
    logged.id = id
    return enqueue(uid, 'documentDeletion', () => {
      const index = indexes.get(uid)
      if (!index) throw new TaskFailure('index_not_found', `Index \`${uid}\` not found.`, { providedIds: 1, deletedDocuments: 0 })
      const had = index.documents.delete(id)
      touch(index)
      return { providedIds: 1, deletedDocuments: had ? 1 : 0 }
    })
  }

  if (parts.length === 3 && parts[2] === 'search' && m === 'POST') {
    logged.action = 'search'
    const body = (await readJson(req)) ?? {}
    logged.q = body.q ?? null
    logged.filter = body.filter ?? null
    logged.sort = body.sort ?? null
    logged.limit = body.limit ?? null
    logged.offset = body.offset ?? null
    return search(indexOr404(uid), body, logged)
  }

  return null
}

// ── THE RECORD, FOR A SUITE ──────────────────────────────────────────────────

const control = (req, url) => {
  const name = url.pathname.slice('/__control/'.length)
  if (name === 'version' && req.method === 'GET') return [200, { source: SOURCE }]
  if (name === 'requests' && req.method === 'GET') return [200, { seq: requestSeq, requests }]
  if (name === 'reset' && req.method === 'POST') {
    requests.length = 0
    away = false
    return [200, { requests: 0, seq: requestSeq, indexes: indexes.size, away }]
  }
  if (name === 'away' && req.method === 'POST') {
    away = url.searchParams.get('on') === 'true'
    return [200, { away }]
  }
  if (name === 'state' && req.method === 'GET') {
    return [200, {
      seq: requestSeq,
      tasks: nextTaskUid,
      indexes: Object.fromEntries([...indexes.values()].map((ix) => [ix.uid, {
        primaryKey: ix.primaryKey,
        configuredAt: ix.configuredAt,
        settings: structuredClone(ix.settings),
        documents: ix.documents.size,
      }])),
    }]
  }
  if (name === 'documents' && req.method === 'GET') {
    const index = indexes.get(url.searchParams.get('index') ?? '')
    if (!index) return [404, { index: null, documents: [] }]
    const id = url.searchParams.get('id')
    if (id !== null) {
      const doc = index.documents.get(id)
      return doc ? [200, { document: structuredClone(doc) }] : [404, { document: null }]
    }
    // Any other parameter is an equality on that attribute.
    const where = [...url.searchParams].filter(([k]) => k !== 'index')
    const documents = [...index.documents.values()].filter((d) => where.every(([k, v]) => textsOf(d[k]).includes(v)))
    return [200, { documents: structuredClone(documents) }]
  }
  return [404, { error: `no control route ${req.method} ${url.pathname}` }]
}

const send = (res, status, body) => {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) })
  res.end(s)
}

const server = createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  } catch {
    return send(res, ...meiliError(400, 'bad_request', 'could not parse the request URI'))
  }
  if (url.pathname.startsWith('/__control/')) return send(res, ...control(req, url))

  // Control routes returned above, so what is recorded is what the product asked.
  requestSeq += 1
  const logged = { n: requestSeq, method: req.method, path: url.pathname, at: Date.now() }
  requests.push(logged)
  if (requests.length > REQUEST_LOG_CAP) requests.shift()
  if (away) {
    logged.dropped = true
    return req.socket.destroy()
  }

  let answer
  try {
    if (KEY) {
      const auth = String(req.headers.authorization ?? '')
      if (!auth) throw new Refusal(401, 'missing_authorization_header', 'The Authorization header is missing. It must use the bearer authorization method.')
      if (auth !== `Bearer ${KEY}`) throw new Refusal(403, 'invalid_api_key', 'The provided API key is invalid.')
    }
    answer = await route(req, url, logged)
    if (!answer) {
      answer = meiliError(404, 'not_implemented_by_stub', `meili-stub.mjs does not serve ${req.method} ${url.pathname} — extend it if the product now needs it`)
    }
  } catch (e) {
    if (!(e instanceof Refusal)) {
      answer = meiliError(500, 'internal', `the stub failed: ${e?.message ?? e}`, 'internal')
    } else {
      answer = meiliError(e.status, e.code, e.message, e.code.includes('authorization') || e.code === 'invalid_api_key' ? 'auth' : 'invalid_request')
    }
  }
  logged.status = answer[0]
  if (answer[0] >= 400) logged.error = answer[1]?.code
  return send(res, ...answer)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port: PORT, endpoint: `http://127.0.0.1:${PORT}`, key: Boolean(KEY), source: SOURCE }))
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
