#!/usr/bin/env node
/*
 * THE SEARCH SEAM, AND THAT THE DOUBLE ON THE END OF IT IS HONEST.
 *
 * `scripts/e2e-lanes/meili-stub.mjs` exists to retire a recorded reason:
 * `commit-log/log-68c0345-1` has search indexing "unmeasurable on any lane
 * because none runs Meilisearch", and `doc-import` said so rather than assert
 * it. `SearchService` builds `new MeiliSearch({ host, apiKey })` from
 * `MEILISEARCH_URL` and `MEILISEARCH_MASTER_KEY`, so the seam is already in the
 * product; the stub is something for it to talk to.
 *
 * A DOUBLE THAT SILENTLY STOPS BEING FAITHFUL IS WORSE THAN NO DOUBLE. If the
 * stub stored nothing, or ignored a filter, every suite built on it would
 * measure the stub and call it the product. So the contract is asserted the way
 * `check-s3-stub.mjs` asserts the store's: through THE PRODUCT'S OWN CODE. The
 * probe constructs the real `SearchService` with nothing but its two variables
 * and runs its own `onModuleInit`, `indexTask`, `indexDoc`,
 * `indexTaskAttachment`, `removeTask` and the Meilisearch half of its search
 * (`visibleMeiliHits`, as a manager asking for archived work too, which is the
 * one way through it that reads no database) — the real `meilisearch` client
 * underneath, sending what the service sends. What needs Postgres — building
 * the filter inside `search()` and the rows `reindexWorkspace` reads — is done
 * here with the service's own index object, the filter spelled exactly as
 * `search()` spells it and the clear exactly as the rebuild does it. If
 * `search.service.ts` changes either, `inWorkspace` below has to follow it.
 *
 *   node scripts/check-meili-stub.mjs            # the cases
 *   node scripts/check-meili-stub.mjs --mutate   # and that each one bites
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The shared counter, and `lib/mutate.mjs` records why it is not `FAIL`
// and not `includes('FAIL')` — both were tried and both were wrong.
import { namedFailures } from './lib/mutate.mjs'
import { freePort } from './lib/free-port.mjs'
import { runMutant } from './lib/run-mutant.mjs'

const ROOT = join(HERE, '..')
const STUB = process.env.MEILI_STUB ?? join(HERE, 'e2e-lanes/meili-stub.mjs')
// A port per run, chosen by the OS, because `--mutate` runs this file inside
// itself (`scripts/lib/free-port.mjs` says what a pid-chosen one cost).
const PORT = await freePort()
const KEY = 'probe-master-key'

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

const PROBE = `
import { MeiliSearch } from 'meilisearch'
import { SearchService, meiliSort } from './src/modules/search/search.service'
const BASE = 'http://127.0.0.1:${PORT}'
const KEY = '${KEY}'
const control = async (path: string, init?: RequestInit) => (await fetch(BASE + '/__control/' + path, init)).json()
// Built as the service is built by Nest: a database it will not be asked for, and a ConfigService.
const service = (env: Record<string, string>) =>
  new SearchService(null as never, { get: (k: string) => env[k] } as never)
// What a rejected call carried, as <code>:<status>, or 'answered' when it did not reject.
const refusal = (p: Promise<unknown>) =>
  p.then(() => 'answered', (e: { code?: string; name?: string; httpStatus?: number }) => \`\${e?.code ?? e?.name}:\${e?.httpStatus ?? '?'}\`)
// The filter exactly as SearchService.search builds it.
const inWorkspace = (ws: string, types?: string[]) => [
  \`workspaceId = "\${ws}"\`,
  ...(types?.length ? [\`(\${types.map((t) => \`entityType = "\${t}"\`).join(' OR ')})\`] : []),
]
const WS = 'ws-probe-one'
const OTHER = 'ws-probe-two'
const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'
const F1 = '44444444-4444-4444-8444-444444444444'
async function main() {
  const out: Record<string, unknown> = {}
  try {
    const beforeInit = Date.now()
    const svc = service({ MEILISEARCH_URL: BASE, MEILISEARCH_MASTER_KEY: KEY })
    await svc.onModuleInit()
    const s = svc as unknown as { enabled: boolean; index: any; visibleMeiliHits: (...a: unknown[]) => Promise<any[]> }
    out.enabled = s.enabled
    const client = new MeiliSearch({ host: BASE, apiKey: KEY })
    out.primaryKey = (await client.getIndex('rundesk')).primaryKey
    const settings = await client.index('rundesk').getSettings()
    out.settings = [settings.searchableAttributes, settings.filterableAttributes, settings.sortableAttributes]
    const state = await control('state')
    out.configuredAfterInit = (state.indexes?.rundesk?.configuredAt ?? 0) >= beforeInit

    await svc.indexTask({ id: T1, title: 'Alpha Quarterly task', description: 'a body about budgets', listId: 'list-one', createdAt: new Date(1000), updatedAt: new Date(5000) }, WS, 'space-one', 'project-one')
    await svc.indexDoc({ id: D1, title: 'Alpha doc', plaintext: 'minutes of the meeting', workspaceId: WS, spaceId: null, createdAt: new Date(2000), updatedAt: new Date(4000) })
    await svc.indexTaskAttachment({ id: F1, fileName: 'alpha-plan.pdf', contentType: 'application/pdf', createdAt: new Date(3000) }, { id: T1, listId: 'list-one' }, WS, 'space-one', 'project-one')
    await svc.indexTask({ id: T2, title: 'Alpha elsewhere', description: null, listId: 'list-nine', createdAt: new Date(6000), updatedAt: null }, OTHER, 'space-nine', 'project-nine')
    // Read while both workspaces hold documents, or a read that ignored the
    // workspace could not be told from one that kept to it.
    out.docsByWs = ((await control('documents?index=rundesk&workspaceId=' + OTHER)).documents ?? []).map((d: { id: string }) => d.id)

    const hits = async (q: string, filter: string[], sort?: string, ws = WS) =>
      (await s.visibleMeiliHits(q, filter, sort, 10, ws, 'probe-user', true, true)) as Array<Record<string, any>>
    const ids = async (q: string, filter: string[], sort?: string, ws = WS) => (await hits(q, filter, sort, ws)).map((h) => h.id)
    out.alpha = (await ids('alpha', inWorkspace(WS))).sort()
    out.taskHit = (await hits('alpha', inWorkspace(WS))).find((h) => h.id === 'task-' + T1) ?? null
    out.caseBlind = await ids('ALPHA QUARTERLY', inWorkspace(WS))
    out.byContent = await ids('budgets', inWorkspace(WS))
    out.typed = (await ids('alpha', inWorkspace(WS, ['doc', 'file']))).sort()
    out.otherWs = await ids('alpha', inWorkspace(OTHER), undefined, OTHER)
    out.byUpdated = await ids('alpha', inWorkspace(WS), 'updated')
    out.byCreated = await ids('alpha', inWorkspace(WS), 'created')
    out.sortedAt = (await hits('alpha', inWorkspace(WS), 'updated')).map((h) => new Date(h.sortedAt).getTime())

    // Indexed again under a new title: replaced, not added beside.
    await svc.indexTask({ id: T1, title: 'Renamed Quarterly task', description: 'a body about budgets', listId: 'list-one', createdAt: new Date(1000), updatedAt: new Date(7000) }, WS, 'space-one', 'project-one')
    out.oldTitle = await ids('alpha quarterly', inWorkspace(WS))
    out.newTitle = await ids('renamed', inWorkspace(WS))
    const raw = await s.index.search('quarterly', { filter: inWorkspace(WS), limit: 10, offset: 0 })
    out.shape = { hits: Array.isArray(raw.hits), query: raw.query, limit: raw.limit, offset: raw.offset, ms: typeof raw.processingTimeMs, total: raw.estimatedTotalHits }

    // Seven documents that match one word, two at a time from the third.
    for (let i = 0; i < 7; i++) {
      await svc.indexDoc({ id: 'pager-' + i, title: 'pager ' + i, plaintext: '', workspaceId: WS, spaceId: null, createdAt: new Date(10000 + i), updatedAt: new Date(10000 + i) })
    }
    const page = await s.index.search('pager', { filter: inWorkspace(WS), limit: 2, offset: 2, sort: meiliSort('created') })
    out.page = page.hits.map((h: { id: string }) => h.id)
    out.pageTotal = page.estimatedTotalHits

    await svc.removeTask(T1)
    out.afterRemove = await ids('renamed', inWorkspace(WS))

    // The rebuild's clear: by filter, and waited for, as reindexWorkspace does it.
    const cleared = await s.index.deleteDocuments({ filter: \`workspaceId = "\${WS}"\` })
    const done = await s.index.waitForTask(cleared.taskUid, { timeOutMs: 5000 })
    out.clear = \`\${done.status}:\${done.details?.deletedDocuments}\`
    out.afterClear = (await ids('a', inWorkspace(WS))).length
    out.otherKept = await ids('alpha', inWorkspace(OTHER), undefined, OTHER)
    const badDelete = await s.index.deleteDocuments({ filter: 'title = "Alpha elsewhere"' })
    const badDone = await s.index.waitForTask(badDelete.taskUid, { timeOutMs: 5000 })
    out.badDelete = \`\${badDone.status}:\${badDone.error?.code}\`
    out.otherStillKept = await ids('alpha', inWorkspace(OTHER), undefined, OTHER)

    out.notFilterable = await refusal(s.index.search('x', { filter: ['title = "x"'] }))
    out.unknownOperator = await refusal(s.index.search('x', { filter: [\`workspaceId = "\${WS}" AND entityType = "task"\`] }))
    out.notEquals = await refusal(s.index.search('x', { filter: [\`workspaceId != "\${WS}"\`] }))
    out.notSortable = await refusal(s.index.search('x', { sort: ['title:asc'] }))
    out.unknownIndex = await refusal(client.index('no-such-index').search('x'))
    out.noKey = await refusal(new MeiliSearch({ host: BASE }).index('rundesk').search('x'))
    out.wrongKey = await refusal(new MeiliSearch({ host: BASE, apiKey: 'wrong' }).index('rundesk').search('x'))
    const wrongKeyed = service({ MEILISEARCH_URL: BASE, MEILISEARCH_MASTER_KEY: 'wrong' })
    await wrongKeyed.onModuleInit()
    out.wrongKeyEnabled = (wrongKeyed as unknown as { enabled: boolean }).enabled
    const badId = await s.index.addDocuments([{ id: 'task-not/valid', entityType: 'task', workspaceId: WS, title: 'x', content: '', url: '', createdAt: 0, updatedAt: 0 }])
    const badIdDone = await s.index.waitForTask(badId.taskUid, { timeOutMs: 5000 })
    out.badId = \`\${badIdDone.status}:\${badIdDone.error?.code}\`

    // A restart: the service's init again, against the index it made.
    const again = service({ MEILISEARCH_URL: BASE, MEILISEARCH_MASTER_KEY: KEY })
    await again.onModuleInit()
    out.restartEnabled = (again as unknown as { enabled: boolean }).enabled
    out.restartKept = ((await (again as unknown as { visibleMeiliHits: (...a: unknown[]) => Promise<any[]> })
      .visibleMeiliHits('alpha', inWorkspace(OTHER), undefined, 10, OTHER, 'probe-user', true, true)) as Array<{ id: string }>).map((h) => h.id)
    const dup = await client.createIndex('rundesk', { primaryKey: 'id' })
    const dupDone = await client.waitForTask(dup.taskUid, { timeOutMs: 5000 })
    out.secondCreate = \`\${dupDone.status}:\${dupDone.error?.code}\`

    const log = await control('requests')
    const rows = log.requests as Array<Record<string, any>>
    out.logSeq = log.seq
    out.logNumbers = rows.map((r) => r.n)
    out.searchLogged = rows.some((r) => r.action === 'search' && r.q === 'budgets' && JSON.stringify(r.filter) === JSON.stringify(inWorkspace(WS)))
    out.addLogged = rows.some((r) => r.action === 'documents.add' && (r.ids ?? []).includes('doc-' + D1))
    out.deleteLogged = rows.some((r) => r.action === 'documents.delete' && r.id === 'task-' + T1)
    out.controlLogged = rows.some((r) => String(r.path).startsWith('/__control'))
    out.docRead = (await control('documents?index=rundesk&id=' + encodeURIComponent('task-' + T2))).document?.title ?? null
    out.docMissing = (await fetch(BASE + '/__control/documents?index=rundesk&id=task-none')).status
    await control('reset', { method: 'POST' })
    const afterReset = await control('requests')
    out.afterReset = [afterReset.requests.length, afterReset.seq === log.seq]
    out.docsAfterReset = (await control('state')).indexes?.rundesk?.documents ?? null

    // Sent away, every product request is dropped unanswered; asked back, or reset, it answers.
    out.awayOn = (await control('away?on=true', { method: 'POST' })).away
    out.awaySearch = await refusal(s.index.search('alpha', { filter: inWorkspace(OTHER) }))
    out.awayOff = (await control('away?on=false', { method: 'POST' })).away
    out.backSearch = await refusal(s.index.search('alpha', { filter: inWorkspace(OTHER) }))
    await control('away?on=true', { method: 'POST' })
    out.resetAway = (await control('reset', { method: 'POST' })).away
    out.afterResetSearch = await refusal(s.index.search('alpha', { filter: inWorkspace(OTHER) }))
  } catch (err) {
    out.threw = err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err)
  }
  console.log('RESULT ' + JSON.stringify(out))
}
void main()
`

const startStub = () => {
  const child = spawn(process.execPath, [STUB, '--port', String(PORT), '--key', KEY], {
    env: { ...process.env, RUNDESK_MEILI_STUB: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let seen = ''
    const bail = setTimeout(() => reject(new Error(`the stub never announced itself: ${seen}`)), 60_000)
    child.stdout.on('data', (d) => {
      seen += d
      // Readiness is read, not slept through.
      if (/"ready":true/.test(seen)) {
        clearTimeout(bail)
        resolve(child)
      }
    })
    child.stderr.on('data', (d) => (seen += d))
    child.on('exit', (code) => {
      clearTimeout(bail)
      reject(new Error(`the stub exited with ${code}: ${seen}`))
    })
  })
}

// Named after the process that writes it; a mutant's is removed by the gate
// that ran it, however that run ended.
const probeFileOf = (pid) => join(ROOT, 'apps/api', `.meili-stub-probe-${pid}.ts`)
const probe = () => {
  const file = probeFileOf(process.pid)
  try {
    writeFileSync(file, PROBE)
    const r = spawnSync('pnpm', ['exec', 'tsx', file], {
      cwd: join(ROOT, 'apps/api'),
      encoding: 'utf8',
      timeout: 120_000,
      // The service logs its connection through Nest's logger; that is not a result.
      env: { ...process.env, NO_COLOR: '1' },
    })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) return { none: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().slice(-600) }
    return JSON.parse(line.slice(7))
  } finally {
    rmSync(file, { force: true })
  }
}

const stub = await startStub()
let out
try {
  console.log('\n▶ the real SearchService and the real meilisearch client, against the stub')
  out = probe()
  // Which source the running stub reports — what `lane-env.sh` compares with
  // the file on disk to restart a stale one.
  out.version = await fetch(`http://127.0.0.1:${PORT}/__control/version`).then((r) => r.json()).catch(() => null)
} finally {
  stub.kill('SIGTERM')
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'
const F1 = '44444444-4444-4444-8444-444444444444'

if (out.none !== undefined) {
  console.error(`\n[meili-stub] the probe printed no result:\n${out.none}`)
  process.exitCode = 1
} else {
  chk(!out.threw, 'the probe ran to the end', `it threw: ${out.threw}`)
  chk(
    out.enabled === true && out.primaryKey === 'id',
    "MEILISEARCH_URL and the master key alone turn the service's Meilisearch half on — its own init creates the index, keyed on id",
    `after onModuleInit the service was enabled=${out.enabled} and the index's primary key ${JSON.stringify(out.primaryKey)}`,
  )
  chk(
    same(out.settings, [['title', 'content'], ['entityType', 'workspaceId', 'listId', 'spaceId'], ['createdAt', 'updatedAt']]),
    'and the settings it writes are stored and read back — searchable, filterable, sortable',
    `the index's settings read back as ${JSON.stringify(out.settings)}`,
  )
  chk(
    out.configuredAfterInit === true,
    "the stub records when the product configured the index — what a suite reads to know this API searches through it",
    'configuredAt was missing or earlier than the init that wrote the settings',
  )
  chk(
    same(out.alpha, [`doc-${D1}`, `file-${F1}`, `task-${T1}`]),
    'indexTask, indexDoc and indexTaskAttachment each write a document, found by the service\'s own search — and a task of another workspace is not',
    `a search for "alpha" in the workspace returned ${JSON.stringify(out.alpha)}`,
  )
  chk(
    out.taskHit?.url === `/app/${'ws-probe-one'}/space-one/project-one/list-one?task=${T1}` && out.taskHit?.content === 'a body about budgets' && out.taskHit?.entityType === 'task',
    'a task\'s hit comes back as the service mapped it: its url into the list, its description as content',
    `the task's hit was ${JSON.stringify(out.taskHit)}`,
  )
  chk(same(out.caseBlind, [`task-${T1}`]), 'the match ignores case', `"ALPHA QUARTERLY" returned ${JSON.stringify(out.caseBlind)}`)
  chk(same(out.byContent, [`task-${T1}`]), 'and reads the content as well as the title', `"budgets" returned ${JSON.stringify(out.byContent)}`)
  chk(
    same(out.typed, [`doc-${D1}`, `file-${F1}`]),
    'the type filter the service builds — (entityType = "doc" OR entityType = "file") — is an OR, ANDed with the workspace',
    `narrowed to docs and files it returned ${JSON.stringify(out.typed)}`,
  )
  chk(same(out.otherWs, [`task-${T2}`]), 'the workspace filter keeps each workspace to its own', `the other workspace's search returned ${JSON.stringify(out.otherWs)}`)
  chk(
    same(out.byUpdated, [`task-${T1}`, `doc-${D1}`, `file-${F1}`]) && same(out.byCreated, [`file-${F1}`, `doc-${D1}`, `task-${T1}`]) && same(out.sortedAt, [5000, 4000, 3000]),
    'meiliSort orders by the timestamp asked for, newest first, and the hits carry it for the merge',
    `by updated ${JSON.stringify(out.byUpdated)} (${JSON.stringify(out.sortedAt)}), by created ${JSON.stringify(out.byCreated)}`,
  )
  chk(
    same(out.oldTitle, []) && same(out.newTitle, [`task-${T1}`]) && out.shape?.total === 1,
    'indexing a task again REPLACES its document — the old title stops matching and there is still one',
    `the old title found ${JSON.stringify(out.oldTitle)}, the new ${JSON.stringify(out.newTitle)}, ${out.shape?.total} in all`,
  )
  chk(
    out.shape?.hits === true && out.shape?.query === 'quarterly' && out.shape?.limit === 10 && out.shape?.offset === 0 && out.shape?.ms === 'number',
    'a search answers the shape the client and the service read: hits, query, limit, offset, processingTimeMs, estimatedTotalHits',
    `it answered ${JSON.stringify(out.shape)}`,
  )
  chk(
    same(out.page, ['doc-pager-4', 'doc-pager-3']) && out.pageTotal === 7,
    'limit and offset page through the sorted result, and the total counts all of it',
    `two from the third of seven gave ${JSON.stringify(out.page)}, ${out.pageTotal} in all`,
  )
  chk(same(out.afterRemove, []), 'removeTask takes the task out of the index', `after removeTask the search still found ${JSON.stringify(out.afterRemove)}`)
  chk(
    out.clear === 'succeeded:9' && out.afterClear === 0 && same(out.otherKept, [`task-${T2}`]),
    'the rebuild\'s clear — deleteDocuments by a workspace filter, waited for — removes that workspace\'s documents and no other\'s',
    `the task finished ${out.clear}; ${out.afterClear} left in the workspace; the other workspace kept ${JSON.stringify(out.otherKept)}`,
  )
  chk(
    out.badDelete === 'failed:invalid_document_filter' && same(out.otherStillKept, [`task-${T2}`]),
    'a deletion by an attribute that is not filterable fails as its task, which waitForTask hands back, and deletes nothing',
    `it finished ${out.badDelete}, leaving ${JSON.stringify(out.otherStillKept)}`,
  )
  chk(
    out.notFilterable === 'invalid_search_filter:400' && out.notSortable === 'invalid_search_sort:400',
    'a filter or sort on an attribute the settings do not name is a 400, with Meilisearch\'s code',
    `a filter on title answered ${out.notFilterable}; a sort on title ${out.notSortable}`,
  )
  chk(
    out.unknownOperator === 'invalid_search_filter:400' && out.notEquals === 'invalid_search_filter:400',
    'and a filter form the service does not build is refused, not ignored',
    `AND inside a string answered ${out.unknownOperator}; != answered ${out.notEquals}`,
  )
  chk(out.unknownIndex === 'index_not_found:404', 'an index that does not exist is a 404, as Meilisearch answers', `it answered ${out.unknownIndex}`)
  chk(
    out.noKey === 'missing_authorization_header:401' && out.wrongKey === 'invalid_api_key:403' && out.wrongKeyEnabled === false,
    'without the master key the stub refuses, as Meilisearch does — and a service holding the wrong one does not come up searching it',
    `no key answered ${out.noKey}; a wrong one ${out.wrongKey}; the service with it came up enabled=${out.wrongKeyEnabled}`,
  )
  chk(out.badId === 'failed:invalid_document_id', 'a document id Meilisearch would refuse fails its task, and is not stored', `it finished ${out.badId}`)
  chk(
    out.restartEnabled === true && same(out.restartKept, [`task-${T2}`]) && out.secondCreate === 'failed:index_already_exists',
    'a restarted API\'s init finds its index where it left it: the second create fails as index_already_exists, and nothing indexed is lost',
    `the second init came up enabled=${out.restartEnabled}, found ${JSON.stringify(out.restartKept)}; a second create finished ${out.secondCreate}`,
  )
  const numbers = Array.isArray(out.logNumbers) ? out.logNumbers : []
  chk(
    out.searchLogged === true && out.addLogged === true && out.deleteLogged === true,
    'the request log names what the product asked: a search with its query and filter, an add by id, a delete by id',
    `search ${out.searchLogged}, add ${out.addLogged}, delete ${out.deleteLogged}`,
  )
  chk(
    numbers.length > 0 && numbers.every((n, i) => i === 0 || n > numbers[i - 1]) && out.logSeq === numbers[numbers.length - 1] && out.controlLogged === false,
    'numbered, in order, with the latest number reported — and the control routes are not in it',
    `numbers ${JSON.stringify(numbers.slice(-5))} against seq ${out.logSeq}; control routes logged: ${out.controlLogged}`,
  )
  chk(
    out.docRead === 'Alpha elsewhere' && same(out.docsByWs, [`task-${T2}`]) && out.docMissing === 404,
    'a suite can read one document by id, or a workspace\'s documents, and one that is not there is a 404',
    `by id ${JSON.stringify(out.docRead)}; by workspace ${JSON.stringify(out.docsByWs)}; a missing id answered ${out.docMissing}`,
  )
  chk(
    same(out.afterReset, [0, true]) && out.docsAfterReset === 1,
    'reset forgets the log and keeps its number and the documents — they are the lane\'s, and the running API made the index once',
    `after reset: ${JSON.stringify(out.afterReset)}, ${out.docsAfterReset} document(s)`,
  )
  chk(
    out.awayOn === true && out.awaySearch !== 'answered',
    'sent away, the stub answers no product request — the client fails as against a Meilisearch that has stopped',
    `away=${out.awayOn}; a search then ${out.awaySearch === 'answered' ? 'was answered' : `failed (${out.awaySearch})`}`,
  )
  chk(
    out.awayOff === false && out.backSearch === 'answered' && out.resetAway === false && out.afterResetSearch === 'answered',
    'and asked back, or reset, it answers again — so a suite that ends early leaves no lane unable to search',
    `back: away=${out.awayOff}, a search ${out.backSearch}; after a reset: away=${out.resetAway}, a search ${out.afterResetSearch}`,
  )
  const wantSource = createHash('sha1').update(readFileSync(STUB)).digest('hex').slice(0, 12)
  chk(
    out.version?.source === wantSource,
    'the stub reports the hash of the source it is running — what the launcher compares, to restart a stale one',
    `it reported ${JSON.stringify(out.version)} against ${wantSource} for the file on disk`,
  )
}

console.log(
  `\n${fail === 0 && out.none === undefined ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} meili-stub: ` +
    `${pass} case(s) held, ${fail} did not`,
)

if (process.argv.includes('--mutate')) {
  // A loaded machine can take a mutant's run past a fixed limit; set it higher there.
  const MUTANT_TIMEOUT_MS = Number(process.env.STUB_GATE_MUTANT_TIMEOUT_MS) || 300_000
  const ORIGINAL = readFileSync(STUB, 'utf8')
  let blind = 0
  const MUTATIONS = [
    ['documents are answered 202 and never stored', 'for (const doc of docs) index.documents.set(String(doc[key]), structuredClone(doc))', 'void docs'],
    ['a document indexed again is kept beside the old one', 'for (const doc of docs) index.documents.set(String(doc[key]), structuredClone(doc))', "for (const doc of docs) index.documents.set(String(doc[key]) + '_' + index.documents.size, structuredClone(doc))"],
    ['a deleted document is still there', 'const had = index.documents.delete(id)', 'const had = index.documents.has(id)'],
    ['the filter is ignored', '    if (!filter.predicate(doc)) continue\n', ''],
    ['OR is read as AND', 'alternatives.some((t) => t(doc))', 'alternatives.every((t) => t(doc))'],
    ['an operator the stub does not speak is ignored', '  if (i < src.length) {\n    const word', '  if (false) {\n    const word'],
    ['a filter on an attribute that is not filterable is served', "  if (unfilterable) throw new Refusal(400, 'invalid_search_filter', unfilterable)\n", ''],
    ['the sort is ignored', 'matched.sort(bySort ?? ((a, b) => a.attrRank - b.attrRank || a.at - b.at))', 'matched.sort((a, b) => a.attrRank - b.attrRank || a.at - b.at)'],
    ['the sort direction is ignored', "dir: m[2] === 'asc' ? 1 : -1", 'dir: 1'],
    ['the match is case-sensitive', 't.toLowerCase().includes(needle)', 't.includes(needle)'],
    ['only the first searchable attribute is read', 'attrRank = attrs.findIndex(', 'attrRank = attrs.slice(0, 1).findIndex('],
    ['offset is ignored', 'matched.slice(offset, offset + limit)', 'matched.slice(0, limit)'],
    ['limit is ignored', 'matched.slice(offset, offset + limit)', 'matched.slice(offset)'],
    ['the total counts only the page', 'estimatedTotalHits: matched.length', 'estimatedTotalHits: hits.length'],
    ['an unknown index answers as an empty one', 'return search(indexOr404(uid), body, logged)', 'return search(indexes.get(uid) ?? makeIndex(uid), body, logged)'],
    ['the rebuild\'s clear deletes every workspace', 'if (filter.predicate(doc)) { index.documents.delete(id); deleted += 1 }', '{ index.documents.delete(id); deleted += 1 }'],
    ['the rebuild\'s clear reports success and deletes nothing', 'if (filter.predicate(doc)) { index.documents.delete(id); deleted += 1 }', 'if (filter.predicate(doc)) { deleted += 1 }'],
    ['a failed task is reported as succeeded', "    status = 'failed'\n", ''],
    ['a task never finishes', 'uid, indexUid, status, type, canceledBy: null,', "uid, indexUid, status: 'processing', type, canceledBy: null,"],
    ['the master key is not enforced', '    if (KEY) {\n', '    if (false) {\n'],
    ['the settings are not kept', 'for (const [k, v] of Object.entries(body)) index.settings[k] = v === null && k in defaults ? defaults[k] : structuredClone(v)', 'void defaults'],
    ['when the product configured the index is not recorded', 'index.configuredAt = Date.now()', 'void 0'],
    ['an id Meilisearch refuses is stored', "if (!(Number.isInteger(id) || (typeof id === 'string' && DOC_ID_SHAPE.test(id)))) {", 'if (false) {'],
    ['a second createIndex wipes the index', "      if (indexes.has(uid)) throw new TaskFailure('index_already_exists', `Index \\`${uid}\\` already exists.`)\n", ''],
    ['the request log records nothing', '  requests.push(logged)\n', ''],
    ['the log does not say what was searched', 'logged.q = body.q ?? null', 'logged.q = null'],
    ['a reset forgets the documents', '    requests.length = 0\n    away = false\n', '    requests.length = 0\n    away = false\n    indexes.clear()\n'],
    ['control routes are logged as product traffic', "  if (url.pathname.startsWith('/__control/')) return send(res, ...control(req, url))", "  requests.push({ n: ++requestSeq, method: req.method, path: url.pathname })\n  if (url.pathname.startsWith('/__control/')) return send(res, ...control(req, url))"],
    ['a stale stub reports the source on disk', "if (name === 'version' && req.method === 'GET') return [200, { source: SOURCE }]", "if (name === 'version' && req.method === 'GET') return [200, { source: 'stale' }]"],
    ['reading a document that is not there answers as though it were', ': [404, { document: null }]', ': [200, { document: null }]'],
    ['a suite\'s read by workspace returns every document', '.filter((d) => where.every(([k, v]) => textsOf(d[k]).includes(v)))', '.filter(() => true)'],
    ['the answer does not carry the query', 'return [200, { hits, query: q,', "return [200, { hits, query: '',"],
    ['a stub sent away still answers', '  if (away) {\n    logged.dropped = true', '  if (false) {\n    logged.dropped = true'],
    ['a stub sent away never comes back', "away = url.searchParams.get('on') === 'true'", "away = away || url.searchParams.get('on') === 'true'"],
    ['a reset leaves the stub away', '    away = false\n    return [200, { requests: 0', '    return [200, { requests: 0'],
  ]
  console.log('\n▶ and each mutation of the stub reddens a case')
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    // Beside the original, never over it — `lib/mutate.mjs` says why.
    const mutant = join(dirname(STUB), `.meili-stub-mutant-${label.replace(/\W+/g, '-')}.mjs`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))
      const r = runMutant([fileURLToPath(import.meta.url)], {
        timeout: MUTANT_TIMEOUT_MS,
        env: { ...process.env, MEILI_STUB: mutant },
        leftBehind: (pid) => [probeFileOf(pid)],
      })
      if (/the probe printed no result|the stub never announced itself|the stub exited/.test(`${r.stderr ?? ''}${r.stdout ?? ''}`)) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — the mutant never got a result back`)
        blind += 1
        continue
      }
      // A run the timeout ended is about the machine, not the rule: said, and not credited.
      if (r.error?.code === 'ETIMEDOUT' || r.signal) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — its run was ended after ${MUTANT_TIMEOUT_MS / 1000} s (${r.signal ?? r.error.code}): a loaded machine, not the rule; run it again`)
        blind += 1
        continue
      }
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        // Non-zero with nothing named: this file stopped before it could
        // report, and the exit code is about the harness, not the stub.
        const said = String(r.stderr ?? '').trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 240)
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — it exited non-zero but named no case${said ? ` (it said: ${said})` : ''}`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }
  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`,
  )
  if (blind) fail += blind
}

if (fail) {
  console.error(`\n[meili-stub] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exitCode = 1
}
