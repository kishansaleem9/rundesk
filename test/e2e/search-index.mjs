/**
 * WHAT THE INDEXERS WRITE, AND WHAT SEARCH THEN FINDS (`commit-log/log-68c0345-1`).
 *
 * NOT A FRAME ROW. `SearchService` keeps a Meilisearch index when the API is
 * started with `MEILISEARCH_URL`: `indexTask` on a task's create and on an edit
 * of its title or description, `indexTaskAttachment` on a file attached,
 * `removeTask` on archive and on the Trash, and a workspace rebuild that clears
 * the workspace's documents by filter and writes them again. On that path a
 * plain search reads tasks, docs and files from the index and from nowhere
 * else, so an indexer that stopped writing is a task nobody can find — and no
 * lane ran a Meilisearch, so none of it was measured by anything.
 *
 * A lane that RUNDESK_LANE_SEARCH names now searches through `meili-stub.mjs`
 * (`lane-env.sh`). This suite asks which engine answers (`lib/search.mjs` —
 * the index configured by the API running now, never the indexers it is about
 * to measure) and holds on either, with the same eight checks:
 *
 *   · where Meilisearch answers, each check reads the stub's own record — the
 *     document the indexer wrote, or its absence — and the search endpoint's
 *     answer, and that the query went THROUGH the index;
 *   · where it does not, the same check reads the Postgres rows the fallback
 *     searches, and the endpoint's answer from them.
 *
 * The break patches (`search-index-*`) break the indexers, so they redden only
 * where Meilisearch answers and say so in their headers; the Postgres half of
 * each check is the fallback's, which the `sra-*` and `lik-*` sets break.
 *
 * AND WHAT A HIT IS HELD TO (section 6), whichever engine answers. Each was
 * measured on lane 3 with the stub before it was fixed: a member refused a
 * private space found the file on its task by name
 * (`found-29-sep/meili-file-hits-skip-the-read-rule`); a deleted doc was still
 * found (`found-29-sep/meili-finds-deleted-docs`); a file on an archived or
 * binned task was found, on Postgres too (`found-29-sep/files-of-binned-tasks-found`);
 * and a Meilisearch that stopped under the API made every plain search a 500
 * (`found-29-sep/meili-gone-after-boot-fails-every-search`).
 *
 * A WORKSPACE OF ITS OWN, because the rebuild clears and rewrites a whole
 * workspace's documents, and this run's are the only ones it may touch. One
 * task is archived by SQL, behind the API's back, which is the stale document
 * the rebuild exists to clear ("a task binned before removal-on-archive
 * existed").
 *
 *   DATABASE_URL=postgres://…/rundesk_v3 node test/e2e/search-index.mjs --api 3023 [--search 9303]
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { searchStubBase, searchEngine, stubDocument, stubDocuments, stubRequests, searchesSince, stubAway } from './lib/search.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
/** The lane's Meilisearch stub, where it has one: 9300 + lane, `--search` or E2E_SEARCH_PORT. */
const SEARCH = searchStubBase(API_PORT, argOf('--search', undefined))
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
// The SENTENCE, then the reason, so a failing check names itself in the log.
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`
/** The indexers run after the write answers (`void this.indexTaskInSearch`), so their results are waited for. */
const until = (fn) => waitUntil(fn, { timeoutMs: 15_000, stepMs: 250 })
const brief = (doc) =>
  doc ? JSON.stringify({ title: doc.title, entityType: doc.entityType, workspaceId: doc.workspaceId, listId: doc.listId, content: String(doc.content ?? '').slice(0, 40) }) : 'nothing'

const STAMP = Date.now()
const TAG = `sidx-${STAMP}`
let sql = null
/** Set while the stub's index is away (section 6), so the finally puts it back. */
let indexAway = false
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — one task is archived by SQL, behind the API, for the rebuild to clear')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} project` }, 'the project')
  const list = await make('/lists', { projectId: project, name: `${TAG} list` }, 'the list')
  const search = (q) => A(`/search/${WS}?q=${encodeURIComponent(q)}&limit=50`)
  const finds = (res, id) => res.status === 200 && (res.data ?? []).some((h) => h.id === id)
  /** Whether the stub received a search for `q` since `seq`, carrying this workspace's filter. */
  const throughIndex = async (seq, q) =>
    (await searchesSince(SEARCH, seq, q)).some((r) => (r.filter ?? []).includes(`workspaceId = "${WS}"`))

  const engine = await searchEngine(API, SEARCH)
  const meili = engine.meili

  // ══ 1. A TASK MADE ════════════════════════════════════════════════════════
  console.log(
    `\n▶ a task made is written into the index and found — this lane searches through ${meili ? 'Meilisearch' : 'Postgres'} (${engine.said})`,
  )
  const ALPHA = `${TAG} alpha`
  const alpha = await make('/tasks', { listId: list, title: `${ALPHA} task`, description: `${TAG} the alpha brief` }, 'the task')
  let alphaDoc = null
  if (meili) await until(async () => (alphaDoc = await stubDocument(SEARCH, `task-${alpha}`)) !== null)
  const alphaRow = await A(`/tasks/${alpha}`)
  chk(
    meili
      ? alphaDoc?.title === `${ALPHA} task` && alphaDoc?.content === `${TAG} the alpha brief` && alphaDoc?.entityType === 'task' &&
          alphaDoc?.workspaceId === WS && alphaDoc?.spaceId === space && alphaDoc?.listId === list
      : alphaRow.status === 200 && alphaRow.data?.title === `${ALPHA} task` && alphaRow.data?.description === `${TAG} the alpha brief`,
    'a task made is in what this lane searches — indexed under its title, its description and its place (workspace, space, list) where Meilisearch answers; in the tasks table the database search reads where it does not',
    meili
      ? `the index holds ${brief(alphaDoc)} under task-${alpha} — indexTask did not write it`
      : `GET /tasks/:id answered ${alphaRow.status} with ${JSON.stringify({ title: alphaRow.data?.title, description: alphaRow.data?.description })}`,
  )
  const alphaFrom = meili ? (await stubRequests(SEARCH))?.seq ?? 0 : 0
  const alphaFound = await until(async () => finds(await search(ALPHA), `task-${alpha}`))
  const alphaThrough = meili ? await throughIndex(alphaFrom, ALPHA) : true
  chk(
    alphaFound && alphaThrough,
    'and the search endpoint finds it by its title — through the index, with its workspace’s filter, where Meilisearch answers',
    alphaFound ? 'it was found, but no search for it reached the index this lane runs' : 'search returned no hit for the task',
  )

  // ══ 2. AN EDIT ════════════════════════════════════════════════════════════
  console.log('\n▶ an edit of its title is written through')
  const RENAMED = `${TAG} renamed`
  const edited = await A(`/tasks/${alpha}`, { method: 'PATCH', body: { title: `${RENAMED} task` } })
  if (!edited.ok) throw new Error(`could not rename the task: ${said(edited)}`)
  let renamedDoc = null
  if (meili) await until(async () => (renamedDoc = await stubDocument(SEARCH, `task-${alpha}`))?.title === `${RENAMED} task`)
  const newTitleFinds = await until(async () => finds(await search(RENAMED), `task-${alpha}`))
  const oldTitleFinds = finds(await search(ALPHA), `task-${alpha}`)
  chk(
    newTitleFinds && !oldTitleFinds && (!meili || renamedDoc?.title === `${RENAMED} task`),
    'an edit is written through: the task is found by its new title and no longer by its old one — its document in the index replaced, where Meilisearch answers',
    `the new title ${newTitleFinds ? 'finds' : 'does not find'} it, the old one ${oldTitleFinds ? 'still finds' : 'does not find'} it` +
      (meili ? `; the index holds ${brief(renamedDoc)}` : ''),
  )

  // ══ 3. A FILE ATTACHED ════════════════════════════════════════════════════
  console.log('\n▶ a file attached to it is written into the index and found')
  const FILE = `${TAG}-alpha-brief.pdf`
  const attached = await A(`/tasks/${alpha}/attachments`, {
    method: 'POST',
    body: { fileName: FILE, url: 'https://example.com/alpha-brief.pdf', contentType: 'application/pdf' },
  })
  if (!attached.ok || !attached.data?.id) throw new Error(`could not attach the file: ${said(attached)}`)
  const file = attached.data.id
  let fileDoc = null
  if (meili) await until(async () => (fileDoc = await stubDocument(SEARCH, `file-${file}`)) !== null)
  const listed = await A(`/tasks/${alpha}/attachments`)
  const listedNames = (Array.isArray(listed.data) ? listed.data : []).map((a) => a.fileName ?? a.name)
  chk(
    meili
      ? fileDoc?.title === FILE && fileDoc?.entityType === 'file' && fileDoc?.content === 'application/pdf' &&
          fileDoc?.workspaceId === WS && fileDoc?.listId === list && String(fileDoc?.url ?? '').includes(`?task=${alpha}`)
      : listed.status === 200 && listedNames.includes(FILE),
    'a file attached to it is in what this lane searches — indexed under its name, its type and its task’s place where Meilisearch answers; among the task’s attachments the database search reads where it does not',
    meili
      ? `the index holds ${fileDoc ? JSON.stringify({ title: fileDoc.title, entityType: fileDoc.entityType, content: fileDoc.content, url: fileDoc.url }) : 'nothing'} under file-${file} — the file indexer did not write it`
      : `the task's attachments (${listed.status}) are ${JSON.stringify(listedNames)}`,
  )
  const fileFrom = meili ? (await stubRequests(SEARCH))?.seq ?? 0 : 0
  const fileFound = await until(async () => finds(await search(FILE), `file-${file}`))
  const fileThrough = meili ? await throughIndex(fileFrom, FILE) : true
  chk(
    fileFound && fileThrough,
    'and the search endpoint finds the file by its name — through the index where Meilisearch answers',
    fileFound ? 'it was found, but no search for it reached the index this lane runs' : 'search returned no hit for the file',
  )

  // ══ 4. A TASK DELETED ═════════════════════════════════════════════════════
  console.log('\n▶ a task deleted is let go of — out of the index where there is one, and out of every search')
  /*
   * Found FIRST, both of them, or their absence afterwards would say nothing:
   * a task that was never indexed is also never found.
   */
  const binned = await make('/tasks', { listId: list, title: `${TAG} binned task` }, 'the task to put in the Trash')
  const archived = await make('/tasks', { listId: list, title: `${TAG} archived task` }, 'the task to archive')
  const binnedBefore = await until(async () => finds(await search(`${TAG} binned`), `task-${binned}`))
  const archivedBefore = await until(async () => finds(await search(`${TAG} archived`), `task-${archived}`))
  const toTrash = await A(`/tasks/${binned}/trash`, { method: 'POST', body: {} })
  const toArchive = await A(`/tasks/${archived}`, { method: 'DELETE' })
  /** Out of the index (where there is one) and out of the search, waited for: `removeTask` is fire-and-forget. */
  const letGo = (id, q) =>
    until(async () => (!meili || (await stubDocument(SEARCH, `task-${id}`)) === null) && !finds(await search(q), `task-${id}`))
  const binnedGone = await letGo(binned, `${TAG} binned`)
  const binnedStill = meili ? await stubDocument(SEARCH, `task-${binned}`) : null
  const binnedFound = finds(await search(`${TAG} binned`), `task-${binned}`)
  chk(
    binnedBefore && toTrash.ok && binnedGone,
    'a task put in the Trash is let go of — taken out of the index (removeTask) where Meilisearch answers, and no longer found by the search endpoint either way',
    `found before: ${binnedBefore}; the Trash answered ${said(toTrash)}; ` +
      (meili ? `the index ${binnedStill ? 'still holds' : 'let go of'} it; ` : '') +
      `the search ${binnedFound ? 'still finds' : 'no longer finds'} it`,
  )
  const archivedGone = await letGo(archived, `${TAG} archived`)
  const archivedStill = meili ? await stubDocument(SEARCH, `task-${archived}`) : null
  const archivedFound = finds(await search(`${TAG} archived`), `task-${archived}`)
  chk(
    archivedBefore && toArchive.ok && archivedGone,
    'and so is a task archived — out of the index where Meilisearch answers, and out of the search endpoint’s answer either way',
    `found before: ${archivedBefore}; the archive answered ${said(toArchive)}; ` +
      (meili ? `the index ${archivedStill ? 'still holds' : 'let go of'} it; ` : '') +
      `the search ${archivedFound ? 'still finds' : 'no longer finds'} it`,
  )

  // ══ 5. THE REBUILD ════════════════════════════════════════════════════════
  console.log('\n▶ the workspace’s rebuild makes its index match it')
  const doc = await make(`/workspaces/${WS}/docs`, { title: `${TAG} kept doc`, spaceId: space }, 'the doc')
  const stale = await make('/tasks', { listId: list, title: `${TAG} stale task` }, 'the task archived behind the API')
  if (meili) {
    await until(async () => (await stubDocument(SEARCH, `doc-${doc}`)) !== null)
    await until(async () => (await stubDocument(SEARCH, `task-${stale}`)) !== null)
  }
  // Archived where nothing calls removeTask, so the index keeps a document
  // for a task that search must never return — the rebuild's to clear.
  await sql`update tasks set is_archived = true where id = ${stale}`
  const othersBefore = meili ? ((await stubDocuments(SEARCH)) ?? []).filter((d) => d.workspaceId !== WS).length : null
  const rebuilt = await A(`/search/${WS}/reindex`, { method: 'POST', body: {} })
  const mine = meili ? (await stubDocuments(SEARCH, { workspaceId: WS })) ?? [] : []
  const othersAfter = meili ? ((await stubDocuments(SEARCH)) ?? []).filter((d) => d.workspaceId !== WS).length : null
  const ids = new Set(mine.map((d) => d.id))
  const live = [`task-${alpha}`, `file-${file}`, `doc-${doc}`]
  const dead = [`task-${binned}`, `task-${archived}`, `task-${stale}`]
  chk(
    meili
      ? rebuilt.ok && rebuilt.data?.indexed === ids.size && live.every((id) => ids.has(id)) &&
          dead.every((id) => !ids.has(id)) && othersAfter === othersBefore
      : rebuilt.ok && rebuilt.data?.indexed === undefined,
    'the workspace’s rebuild makes its index match it — every live task, file and doc, nothing archived or in the Trash (one archived behind the API’s back included), the count it answers, and no other workspace touched, where Meilisearch answers; where none does, it answers without claiming to have indexed anything',
    meili
      ? `it answered ${said(rebuilt)} ${JSON.stringify(rebuilt.data ?? null)}; the index holds ${ids.size} of this workspace's: ` +
          `live missing ${JSON.stringify(live.filter((id) => !ids.has(id)))}, dead kept ${JSON.stringify(dead.filter((id) => ids.has(id)))}; ` +
          `other workspaces' documents ${othersBefore} before, ${othersAfter} after`
      : `it answered ${said(rebuilt)} ${JSON.stringify(rebuilt.data ?? null)}`,
  )

  // ══ 6. WHAT A HIT IS HELD TO ══════════════════════════════════════════════
  console.log('\n▶ what search withholds, it withholds whichever engine answers')
  const attach = async (task, name) => {
    const res = await A(`/tasks/${task}/attachments`, {
      method: 'POST',
      body: { fileName: name, url: `https://example.com/${name}`, contentType: 'application/pdf' },
    })
    if (!res.ok || !res.data?.id) throw new Error(`could not attach ${name}: ${said(res)}`)
    return res.data.id
  }
  const seqNow = async () => (meili ? (await stubRequests(SEARCH))?.seq ?? 0 : 0)

  // A private space, a file on its task, and a member of the workspace it is
  // not shared with. The file is attached through the API, so it is indexed.
  const hidden = await make('/spaces', { workspaceId: WS, name: `${TAG} hidden space`, visibility: 'private' }, 'the private space')
  const hiddenProject = await make('/projects', { spaceId: hidden, name: `${TAG} hidden project` }, 'the private project')
  const hiddenList = await make('/lists', { projectId: hiddenProject, name: `${TAG} hidden list` }, 'the private list')
  const hiddenTask = await make('/tasks', { listId: hiddenList, title: `${TAG} hidden task` }, 'the private task')
  const HIDDEN_FILE = `${TAG}-hidden-plan.pdf`
  const hiddenFile = await attach(hiddenTask, HIDDEN_FILE)
  const memberEmail = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Index member', email: memberEmail, password: 'Member@12345!',
    organizationName: `Index member ${STAMP}`, organizationSlug: `index-member-${STAMP}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const adminFindsHidden = await until(async () => finds(await search(HIDDEN_FILE), `file-${hiddenFile}`))
  const memberFrom = await seqNow()
  const memberSearch = await M(`/search/${WS}?q=${encodeURIComponent(HIDDEN_FILE)}&limit=50`)
  const memberThrough = meili ? await throughIndex(memberFrom, HIDDEN_FILE) : true
  const memberOpens = await M(`/tasks/${hiddenTask}`)
  chk(
    adminFindsHidden && memberSearch.status === 200 && !finds(memberSearch, `file-${hiddenFile}`) && memberThrough &&
      memberOpens.status >= 400,
    'a member refused a private space does not find the file on its task by name, while the admin does — the member’s search through the index where Meilisearch answers',
    `the admin ${adminFindsHidden ? 'finds' : 'does not find'} it; the member's search answered ${said(memberSearch)} and ` +
      `${finds(memberSearch, `file-${hiddenFile}`) ? 'FOUND it' : 'did not find it'}` +
      `${memberThrough ? '' : ', never reaching the index'}; the member opening its task answered ${memberOpens.status}`,
  )

  // A doc, found, then deleted.
  const GONE_DOC = `${TAG} deleted doc`
  const goneDoc = await make(`/workspaces/${WS}/docs`, { title: GONE_DOC, spaceId: space }, 'the doc to delete')
  const docBefore = await until(async () => finds(await search(GONE_DOC), `doc-${goneDoc}`))
  const docDeleted = await A(`/docs/${goneDoc}`, { method: 'DELETE' })
  const docFrom = await seqNow()
  const docAfter = await search(GONE_DOC)
  const docThrough = meili ? await throughIndex(docFrom, GONE_DOC) : true
  chk(
    docBefore && docDeleted.ok && docAfter.status === 200 && !finds(docAfter, `doc-${goneDoc}`) && docThrough,
    'a doc deleted is no longer found — found before its delete and not after it, through the index where Meilisearch answers',
    `found before: ${docBefore}; the delete answered ${said(docDeleted)}; the search after it answered ${said(docAfter)} and ` +
      `${finds(docAfter, `doc-${goneDoc}`) ? 'STILL FOUND it' : 'did not find it'}${docThrough ? '' : ', never reaching the index'}`,
  )

  // A file on a task archived, and one on a task put in the Trash.
  const shelved = await make('/tasks', { listId: list, title: `${TAG} shelved task` }, 'the task to archive with its file')
  const trashed = await make('/tasks', { listId: list, title: `${TAG} trashed task` }, 'the task to put in the Trash with its file')
  const SHELVED_FILE = `${TAG}-shelved-notes.pdf`
  const TRASHED_FILE = `${TAG}-trashed-notes.pdf`
  const shelvedFile = await attach(shelved, SHELVED_FILE)
  const trashedFile = await attach(trashed, TRASHED_FILE)
  const shelvedBefore = await until(async () => finds(await search(SHELVED_FILE), `file-${shelvedFile}`))
  const trashedBefore = await until(async () => finds(await search(TRASHED_FILE), `file-${trashedFile}`))
  const shelvedGone = await A(`/tasks/${shelved}`, { method: 'DELETE' })
  const trashedGone = await A(`/tasks/${trashed}/trash`, { method: 'POST', body: {} })
  const shelvedAfter = await search(SHELVED_FILE)
  const trashedAfter = await search(TRASHED_FILE)
  chk(
    shelvedBefore && trashedBefore && shelvedGone.ok && trashedGone.ok &&
      shelvedAfter.status === 200 && trashedAfter.status === 200 &&
      !finds(shelvedAfter, `file-${shelvedFile}`) && !finds(trashedAfter, `file-${trashedFile}`),
    'a file goes where its task goes — found before, and not found once its task is archived or in the Trash, whichever engine answers',
    `found before: ${shelvedBefore} and ${trashedBefore}; the archive answered ${shelvedGone.status}, the Trash ${trashedGone.status}; after them the search ` +
      `${finds(shelvedAfter, `file-${shelvedFile}`) ? 'STILL FINDS' : 'does not find'} the archived task's file and ` +
      `${finds(trashedAfter, `file-${trashedFile}`) ? 'STILL FINDS' : 'does not find'} the binned one's`,
  )

  // The index goes away under the running API, and comes back.
  const wentAway = meili ? await stubAway(SEARCH, true) : false
  indexAway = wentAway
  const whileAway = await search(RENAMED)
  const cameBack = wentAway ? await stubAway(SEARCH, false) : true
  if (cameBack) indexAway = false
  chk(
    (!meili || (wentAway && cameBack)) && whileAway.status === 200 && finds(whileAway, `task-${alpha}`),
    'a search still answers when the index stops answering — from the database, finding the task by its title; where no index answers, it answers as it always does',
    `${meili ? `the stub ${wentAway ? 'went away' : 'would not go away'} and ${cameBack ? 'came back' : 'did not come back'}; ` : ''}` +
      `the search answered ${said(whileAway)} and ${finds(whileAway, `task-${alpha}`) ? 'found' : 'did not find'} the task`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // An index left away would make every later search on this lane answer from
  // the database, and every suite that asks for the index fail.
  if (indexAway) await stubAway(SEARCH, false)
  // This run's workspace only — made above, so nothing else is removed.
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
