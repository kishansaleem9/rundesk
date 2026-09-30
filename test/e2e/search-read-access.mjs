/**
 * SEARCH FINDS ONLY WHAT THE SEARCHER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`,
 * search's share of it. Search reads across the whole workspace, so every
 * branch has to apply the searcher's access itself: the container rule and the
 * private-item rule for tasks and what hangs off them (comments, files), the
 * doc rule (`doc-access.ts`) for docs, chat's own rule for channels and
 * messages, and the space rule for folders, lists and spaces by name.
 *
 * Measured on lane 1 before the fix, as a member refused a private space: the
 * member's search returned every kind planted in that space — its task, a
 * comment, a file, its doc, its folder, list and own name, a channel of it and
 * a message there. A search narrowed by a task filter came back with channels,
 * messages, comments and containers besides; the custom-field list named the
 * refused project's field; and any member could rebuild the index.
 *
 * Meilisearch is the other path and no lane runs it; `search.service.test.ts`
 * holds its half (the post-filter over its hits).
 *
 *   node test/e2e/search-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`

const stamp = Date.now()
const TAG = `sra-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the planted file and field are written by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Search member', email, password: 'Member@12345!',
    organizationName: `Search member ${stamp}`, organizationSlug: `search-member-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }

  // ══ 1. EVERY KIND OF HIT ═════════════════════════════════════════════════
  console.log('\n▶ search finds only what the searcher may open')

  /*
   * One word, planted in every kind of item search returns — a folder, a
   * list, a task, a comment on it, a file on it, a doc, a channel and a
   * message in it, a custom field, and the space itself — once in a space the
   * member is refused and once in an open one. Measured on lane 1 before the
   * fix: the member's search returned every one of the refused space's kinds.
   * The attachment and the field are written by SQL: search reads only their
   * rows, and neither route is under test here.
   */
  const SW = `srch${stamp}`
  const plant = async (side, visibility) => {
    const space = await make('/spaces', { workspaceId: WS, name: `${SW} ${side} space`, ...(visibility ? { visibility } : {}) }, `the ${side} space`)
    await make(`/spaces/${space}/folders`, { name: `${SW} ${side} folder` }, `the ${side} folder`)
    const project = await make('/projects', { spaceId: space, name: `${SW} ${side} project` }, `the ${side} project`)
    const list = await make('/lists', { projectId: project, name: `${SW} ${side} list` }, `the ${side} list`)
    const task = await make('/tasks', { listId: list, title: `${SW} ${side} task`, description: `${SW} ${side} description` }, `the ${side} task`)
    const commented = await A(`/tasks/${task}/comments`, { method: 'POST', body: { body: `${SW} ${side} comment` } })
    if (!commented.ok) throw new Error(`could not comment on the ${side} task: ${said(commented)}`)
    await sql`
      insert into task_attachments (task_id, file_name, content_type, size_bytes, storage_key)
      values (${task}, ${`${SW}-${side}-file.txt`}, 'text/plain', 1, ${`workspaces/${WS}/tasks/${task}/${SW}-${side}-file.txt`})`
    await make(`/workspaces/${WS}/docs`, { title: `${SW} ${side} doc`, spaceId: space }, `the ${side} doc`)
    const channel = await make(`/workspaces/${WS}/chat/channels`, { name: `${SW}-${side}-channel`, spaceId: space }, `the ${side} channel`)
    const posted = await A(`/chat/channels/${channel}/messages`, { method: 'POST', body: { body: `${SW} ${side} message` } })
    if (!posted.ok) throw new Error(`could not post in the ${side} channel: ${said(posted)}`)
    await sql`insert into custom_field_definitions (project_id, name, type) values (${project}, ${`${SW} ${side} field`}, 'text')`
    return { task }
  }
  const hiddenSide = await plant('hidden', 'private')
  const openSide = await plant('open')
  /*
   * These rows were written by SQL, which no indexer sees. Where Meilisearch
   * answers, search reads tasks, docs and files from the index alone, so the
   * workspace's index is rebuilt from its rows first: the manager's own repair,
   * and nothing at all where Postgres answers (`search-index`, section 5).
   */
  const reindexed = await A(`/search/${WS}/reindex`, { method: 'POST', body: {} })
  if (!reindexed.ok) throw new Error(`could not rebuild the workspace's search index: ${reindexed.status}`)
  const KINDS = ['channel', 'comment', 'doc', 'file', 'folder', 'list', 'message', 'space', 'task']
  const sideOf = (hit) => {
    const s = JSON.stringify(hit)
    if (s.includes(`${SW} hidden`) || s.includes(`${SW}-hidden`)) return 'hidden'
    if (s.includes(`${SW} open`) || s.includes(`${SW}-open`)) return 'open'
    return null
  }
  const kindsOn = (res, side) => [...new Set((res.data ?? []).filter((h) => sideOf(h) === side).map((h) => h.entityType))].sort()
  const memberFinds = await M(`/search/${WS}?q=${SW}&limit=100`)
  const adminFinds = await A(`/search/${WS}?q=${SW}&limit=100`)
  chk(
    memberFinds.status === 200 && kindsOn(memberFinds, 'hidden').length === 0 &&
      JSON.stringify(kindsOn(memberFinds, 'open')) === JSON.stringify(KINDS) &&
      JSON.stringify(kindsOn(adminFinds, 'hidden')) === JSON.stringify(KINDS),
    'a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both',
    `the member found, of the refused space: ${JSON.stringify(kindsOn(memberFinds, 'hidden'))}; of the open one: ${JSON.stringify(kindsOn(memberFinds, 'open'))}; ` +
      `the admin, of the refused space: ${JSON.stringify(kindsOn(adminFinds, 'hidden'))}`,
  )

  // A task filter means tasks: the containers, comments and chat do not answer it.
  const memberFiltered = await M(`/search/${WS}?q=${SW}&statusCategory=open&limit=100`)
  const everyKind = (res) => [...new Set((res.data ?? []).map((h) => h.entityType))].sort()
  const hitIds = (res) => (res.data ?? []).map((h) => h.id)
  chk(
    memberFiltered.status === 200 && JSON.stringify(everyKind(memberFiltered)) === '["task"]' &&
      hitIds(memberFiltered).includes(`task-${openSide.task}`) && !hitIds(memberFiltered).includes(`task-${hiddenSide.task}`),
    'a search narrowed by a task filter returns tasks alone, and only tasks the member may open',
    `it answered ${memberFiltered.status} with ${JSON.stringify(everyKind(memberFiltered))}; the open task in it: ${hitIds(memberFiltered).includes(`task-${openSide.task}`)}, ` +
      `the refused one: ${hitIds(memberFiltered).includes(`task-${hiddenSide.task}`)}`,
  )

  const fieldNames = (res) => (res.data ?? []).map((f) => f.name)
  const memberFields = await M(`/search/${WS}/custom-fields`)
  const adminFields = await A(`/search/${WS}/custom-fields`)
  chk(
    memberFields.status === 200 && !fieldNames(memberFields).includes(`${SW} hidden field`) &&
      fieldNames(memberFields).includes(`${SW} open field`) && fieldNames(adminFields).includes(`${SW} hidden field`),
    'the custom fields search offers name no field of a project the member is refused — the admin’s name it',
    `the member's (${memberFields.status}) list the refused project's field: ${fieldNames(memberFields).includes(`${SW} hidden field`)}, ` +
      `the open one's: ${fieldNames(memberFields).includes(`${SW} open field`)}; the admin's the refused one's: ${fieldNames(adminFields).includes(`${SW} hidden field`)}`,
  )

  const memberReindex = await M(`/search/${WS}/reindex`, { method: 'POST', body: {} })
  const adminReindex = await A(`/search/${WS}/reindex`, { method: 'POST', body: {} })
  chk(
    memberReindex.status === 403 && adminReindex.ok,
    'and only a manager may rebuild the workspace’s search index (403 for a member) — the admin may',
    `the member's rebuild answered ${said(memberReindex)}; the admin's ${said(adminReindex)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
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
