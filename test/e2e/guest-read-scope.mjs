/**
 * A GUEST READS WHAT IS SHARED WITH THEM, AND THE WAY TO IT — NOTHING ELSE.
 *
 * NOT A FRAME ROW: `found-24-sep/guests-read-every-open-space`. The container
 * rule treated a guest as a member, so every open space was theirs to read:
 * its projects, lists, tasks and docs, by id, in every listing and in search.
 * Goals and sprints alone gave a guest nothing.
 *
 * ClickUp's rule (help.clickup.com "Use ClickUp as a guest or limited member",
 * "Share Spaces, Folders, Subfolders, Lists, and tasks"; search snippets): a
 * guest sees only the folders, lists and tasks shared with them — what is
 * inside a shared item comes with it, a shared task's subtasks too — in a
 * "Shared with Me" section of their own.
 *
 * One workspace: an OPEN space nothing is shared from; a space shared with the
 * guest; and a MIXED space holding a shared project, a shared list beside an
 * unshared one, a shared task beside an unshared one, and a project nothing
 * in is shared. The containers above a shared item are the way to it: they
 * are listed, and nothing else in them is. Each read is asked of the guest
 * beside a member, who reads everything open. Lists, tasks, docs and grants
 * are planted by SQL.
 *
 *   node test/e2e/guest-read-scope.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
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

const stamp = Date.now()
const TAG = `grs${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
/** Whether an answer names this title anywhere in it: shape-blind, titles are unique words. */
const names = (res, title) => res.status === 200 && JSON.stringify(res.data ?? null).includes(title)
const refused = (res) => res.status === 403 || res.status === 404

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — lists, tasks, docs and grants are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Reader@12345!'
    const signed = await signUpApi(API, {
      fullName: `Reader ${who}`, email, password,
      organizationName: `Reader ${who} ${stamp}`, organizationSlug: `reader-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, email, password, token: signed.accessToken, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as

  const space = async (name) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    if (!res.ok || !res.data?.id) throw new Error(`could not make the ${name} space: ${res.status}`)
    return res.data.id
  }
  const project = async (spaceId, name) =>
    (await sql`insert into projects (space_id, name, created_by_id) values (${spaceId}, ${`${TAG} ${name}`}, ${adminId}) returning id`)[0].id
  const list = async (projectId, name) =>
    (await sql`insert into lists (project_id, name, created_by_id) values (${projectId}, ${`${TAG} ${name}`}, ${adminId}) returning id`)[0].id
  const task = async (listId, word) =>
    (await sql`insert into tasks (list_id, title, created_by_id) values (${listId}, ${`${TAG} ${word}`}, ${adminId}) returning id`)[0].id
  const share = (type, id, level = 'view') =>
    sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, ${type}, ${id}, ${guest.id}, ${level})`

  // THE OPEN SPACE: nothing in it is shared.
  const OPEN = await space('open')
  const P_OPEN = await project(OPEN, 'open-project')
  const L_OPEN = await list(P_OPEN, 'open-list')
  const T_OPEN = await task(L_OPEN, 'openspacetask')
  // A SPACE SHARED WITH THE GUEST, whole.
  const GRANTED = await space('granted')
  await sql`insert into space_members (space_id, user_id, role) values (${GRANTED}, ${guest.id}, 'view')`
  const P_GRANTED = await project(GRANTED, 'granted-project')
  const L_GRANTED = await list(P_GRANTED, 'granted-list')
  const T_GRANTED = await task(L_GRANTED, 'grantedspacetask')
  // THE MIXED SPACE: things in it are shared one by one.
  const MIXED = await space('mixed')
  const P_SHARED = await project(MIXED, 'sharedproject')
  await share('project', P_SHARED)
  const T_UNDER = await task(await list(P_SHARED, 'list-under-shared-project'), 'undersharedprojecttask')
  const P_LISTS = await project(MIXED, 'project-of-lists')
  const L_SHARED = await list(P_LISTS, 'sharedlist')
  await share('list', L_SHARED)
  const T_IN_LIST = await task(L_SHARED, 'insharedlisttask')
  const L_BESIDE = await list(P_LISTS, 'besidelist')
  const T_BESIDE_LIST = await task(L_BESIDE, 'besidesharedlisttask')
  const P_TASKS = await project(MIXED, 'project-of-tasks')
  const L_TASKS = await list(P_TASKS, 'list-of-tasks')
  const T_SHARED = await task(L_TASKS, 'sharedalonetask')
  await share('task', T_SHARED)
  const [sub] = await sql`insert into tasks (list_id, title, created_by_id, parent_task_id) values (${L_TASKS}, ${`${TAG} subofsharedtask`}, ${adminId}, ${T_SHARED}) returning id`
  const T_BESIDE_TASK = await task(L_TASKS, 'besidesharedtask')
  const P_NONE = await project(MIXED, 'unsharedproject')
  const T_NONE = await task(await list(P_NONE, 'list-of-unshared'), 'unsharedprojecttask')
  // Docs: of the open space, of the granted space, one shared with the guest alone, one of the workspace.
  const doc = async (spaceId, word) =>
    (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${spaceId}, ${`${TAG} ${word}`}, ${adminId}) returning id`)[0].id
  const D_OPEN = await doc(OPEN, 'opendoc')
  const D_GRANTED = await doc(GRANTED, 'granteddoc')
  const D_SHARED = await doc(OPEN, 'shareddoc')
  await share('doc', D_SHARED)
  const D_WORKSPACE = await doc(null, 'workspacedoc')

  const READABLE = ['grantedspacetask', 'undersharedprojecttask', 'insharedlisttask', 'sharedalonetask', 'subofsharedtask']
  const HIDDEN = ['openspacetask', 'besidesharedlisttask', 'besidesharedtask', 'unsharedprojecttask']
  const holds = (res, words) => words.filter((w) => names(res, `${TAG} ${w}`))

  // ══ 1. THE OPEN SPACE, BY ID ═════════════════════════════════════════════
  console.log('\n▶ the open space’s task, list, project and space, asked for by id')
  const byId = async (C) => ({
    task: (await C(`/tasks/${T_OPEN}`)).status,
    list: (await C(`/lists/${L_OPEN}`)).status,
    project: (await C(`/projects/${P_OPEN}`)).status,
    space: (await C(`/spaces/${OPEN}`)).status,
  })
  const gOpen = await byId(G)
  const mOpen = await byId(M)
  chk(
    Object.values(gOpen).every((s) => s === 403 || s === 404) && Object.values(mOpen).every((s) => s === 200),
    'a guest is refused the open space’s task, list, project and space by id — a member reads each',
    `the guest ${JSON.stringify(gOpen)}; the member ${JSON.stringify(mOpen)}`,
  )

  // ══ 2. THE SPACES ════════════════════════════════════════════════════════
  console.log('\n▶ the workspace’s spaces')
  const gSpaces = await G(`/spaces/workspace/${WS}`)
  const mSpaces = await M(`/spaces/workspace/${WS}`)
  const ids = (res) => (Array.isArray(res.data) ? res.data : []).map((s) => s.id)
  chk(
    gSpaces.status === 200 && ids(gSpaces).includes(GRANTED) && ids(gSpaces).includes(MIXED) && !ids(gSpaces).includes(OPEN)
      && ids(mSpaces).includes(OPEN),
    'a guest is listed the space shared with them and the one holding things shared with them, not the open space — a member is listed it',
    `the guest ${gSpaces.status}: granted ${ids(gSpaces).includes(GRANTED)}, mixed ${ids(gSpaces).includes(MIXED)}, open ${ids(gSpaces).includes(OPEN)}; the member: open ${ids(mSpaces).includes(OPEN)}`,
  )

  // ══ 3. A SPACE SHARED WHOLE ══════════════════════════════════════════════
  console.log('\n▶ the space shared with the guest')
  const gGrantedTask = await G(`/tasks/${T_GRANTED}`)
  const gGrantedList = await G(`/tasks/list/${L_GRANTED}`)
  chk(
    gGrantedTask.status === 200 && names(gGrantedList, `${TAG} grantedspacetask`),
    'in a space shared with a guest, they read its tasks, by id and in their list',
    `by id ${gGrantedTask.status}; the list ${gGrantedList.status}, naming it: ${names(gGrantedList, `${TAG} grantedspacetask`)}`,
  )

  // ══ 4. THE MIXED SPACE'S PROJECTS ════════════════════════════════════════
  console.log('\n▶ the mixed space’s projects, as the way to what is shared')
  const gProjects = await G(`/projects/space/${MIXED}`)
  const mProjects = await M(`/projects/space/${MIXED}`)
  const pIds = (res) => (Array.isArray(res.data) ? res.data : []).map((p) => p.id)
  chk(
    gProjects.status === 200 && [P_SHARED, P_LISTS, P_TASKS].every((id) => pIds(gProjects).includes(id)) && !pIds(gProjects).includes(P_NONE)
      && pIds(mProjects).includes(P_NONE),
    'a guest is listed the projects holding what is shared with them, not the project nothing in is shared — a member is listed it',
    `the guest ${gProjects.status}: shared ${pIds(gProjects).includes(P_SHARED)}, of lists ${pIds(gProjects).includes(P_LISTS)}, of tasks ${pIds(gProjects).includes(P_TASKS)}, unshared ${pIds(gProjects).includes(P_NONE)}; the member: unshared ${pIds(mProjects).includes(P_NONE)}`,
  )

  // ══ 5. A SHARED PROJECT ══════════════════════════════════════════════════
  console.log('\n▶ the shared project')
  const gUnder = await G(`/tasks/${T_UNDER}`)
  const gNone = await G(`/tasks/${T_NONE}`)
  chk(
    gUnder.status === 200 && refused(gNone),
    'a guest reads a task under a project shared with them, and is refused one under the project beside it',
    `under the shared project ${gUnder.status}; under the unshared one ${gNone.status}`,
  )

  // ══ 6. A SHARED LIST ═════════════════════════════════════════════════════
  console.log('\n▶ the shared list, beside an unshared one')
  const gLists = await G(`/lists/project/${P_LISTS}`)
  const lIds = (res) => (Array.isArray(res.data) ? res.data : []).map((l) => l.id)
  const gInList = await G(`/tasks/list/${L_SHARED}`)
  const gBesideList = await G(`/tasks/${T_BESIDE_LIST}`)
  chk(
    names(gInList, `${TAG} insharedlisttask`) && refused(gBesideList)
      && lIds(gLists).includes(L_SHARED) && !lIds(gLists).includes(L_BESIDE),
    'a guest reads the tasks of a list shared with them, is refused the list beside it’s task, and is listed only the shared list',
    `the shared list's tasks name it: ${names(gInList, `${TAG} insharedlisttask`)}; the task beside ${gBesideList.status}; lists listed ${gLists.status}: shared ${lIds(gLists).includes(L_SHARED)}, beside ${lIds(gLists).includes(L_BESIDE)}`,
  )

  // ══ 7. A SHARED TASK ═════════════════════════════════════════════════════
  console.log('\n▶ the shared task, beside an unshared one in the same list')
  const gShared = await G(`/tasks/${T_SHARED}`)
  const gSub = await G(`/tasks/${sub.id}`)
  const gBesideTask = await G(`/tasks/${T_BESIDE_TASK}`)
  const gTasksList = await G(`/tasks/list/${L_TASKS}?includeSubtasks=true`)
  chk(
    gShared.status === 200 && gSub.status === 200 && refused(gBesideTask)
      && names(gTasksList, `${TAG} sharedalonetask`) && !names(gTasksList, `${TAG} besidesharedtask`),
    'a guest reads a task shared with them and its subtask, and neither by id nor in its list the task beside it',
    `the shared task ${gShared.status}, its subtask ${gSub.status}, the task beside ${gBesideTask.status}; the list names the shared ${names(gTasksList, `${TAG} sharedalonetask`)} and the beside ${names(gTasksList, `${TAG} besidesharedtask`)}`,
  )

  /*
   * These rows were written by SQL, which no indexer sees. Where Meilisearch
   * answers, search reads tasks, docs and files from the index alone, so the
   * workspace's index is rebuilt from its rows first: the manager's own repair,
   * and nothing at all where Postgres answers (`search-index`, section 5).
   */
  const reindexed = await A(`/search/${WS}/reindex`, { method: 'POST', body: {} })
  if (!reindexed.ok) throw new Error(`could not rebuild the workspace's search index: ${reindexed.status}`)

  // ══ 8. ACROSS THE WORKSPACE ══════════════════════════════════════════════
  console.log('\n▶ the workspace’s task listing, and search')
  const gAll = await G(`/tasks/workspace/${WS}?limit=500`)
  const gSearch = await G(`/search/${WS}?q=${encodeURIComponent(TAG)}&limit=50`)
  const mSearch = await M(`/search/${WS}?q=${encodeURIComponent(TAG)}&limit=50`)
  chk(
    holds(gAll, READABLE).length === READABLE.length && holds(gAll, HIDDEN).length === 0
      && holds(gSearch, HIDDEN).length === 0 && holds(gSearch, ['sharedalonetask', 'insharedlisttask']).length === 2
      && holds(mSearch, ['openspacetask']).length === 1,
    'across the workspace, a guest’s task listing and search hold what is shared with them and nothing else — a member’s search finds the open space’s task',
    `the listing ${gAll.status} holds ${JSON.stringify(holds(gAll, READABLE))} and hidden ${JSON.stringify(holds(gAll, HIDDEN))}; search ${gSearch.status} hidden ${JSON.stringify(holds(gSearch, HIDDEN))}; the member's search finds the open task: ${holds(mSearch, ['openspacetask']).length === 1}`,
  )

  // ══ 9. DOCS ══════════════════════════════════════════════════════════════
  console.log('\n▶ docs: of the open space, of the granted space, shared alone, of the workspace')
  const gHub = await G(`/workspaces/${WS}/docs`)
  const gDocs = {
    open: (await G(`/docs/${D_OPEN}`)).status,
    granted: (await G(`/docs/${D_GRANTED}`)).status,
    shared: (await G(`/docs/${D_SHARED}`)).status,
    workspace: (await G(`/docs/${D_WORKSPACE}`)).status,
  }
  const mOpenDoc = (await M(`/docs/${D_OPEN}`)).status
  chk(
    refused({ status: gDocs.open }) && gDocs.granted === 200 && gDocs.shared === 200 && refused({ status: gDocs.workspace })
      && names(gHub, `${TAG} granteddoc`) && names(gHub, `${TAG} shareddoc`) && !names(gHub, `${TAG} opendoc`) && !names(gHub, `${TAG} workspacedoc`)
      && mOpenDoc === 200,
    'a guest reads the docs of a space shared with them and a doc shared with them — not the open space’s, nor the workspace’s — and the docs hub lists the same; a member reads the open space’s',
    `by id ${JSON.stringify(gDocs)}; the hub names granted ${names(gHub, `${TAG} granteddoc`)}, shared ${names(gHub, `${TAG} shareddoc`)}, open ${names(gHub, `${TAG} opendoc`)}, workspace ${names(gHub, `${TAG} workspacedoc`)}; the member's open doc ${mOpenDoc}`,
  )

  // ══ 10. REALTIME ROOMS ═══════════════════════════════════════════════════
  console.log('\n▶ the realtime rooms a guest may join, and what they hear')
  const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token: guest.token }, transports: ['websocket'], reconnection: false })
  const up = await new Promise((res) => {
    sock.on('connect', () => res(true))
    sock.on('connect_error', () => res(false))
    setTimeout(() => res(false), 10_000)
  })
  const heard = []
  sock.on('event', (e) => heard.push(JSON.stringify(e)))
  const ack = await new Promise((res) => {
    sock.timeout(10_000).emit('subscribe', { rooms: [`list:${L_OPEN}`, `list:${L_TASKS}`, `task:${T_BESIDE_TASK}`, `task:${T_SHARED}`, `list:${L_SHARED}`] }, (err, a) => res(err ? null : a))
  })
  await A(`/tasks/${T_SHARED}/comments`, { method: 'POST', body: { body: `${TAG} saidonsharedtask` } })
  await A(`/tasks/${T_BESIDE_TASK}/comments`, { method: 'POST', body: { body: `${TAG} saidbesideit` } })
  const heardOf = (word) => heard.some((e) => e.includes(`${TAG} ${word}`))
  for (let i = 0; i < 40 && !heardOf('saidonsharedtask'); i += 1) await new Promise((r) => setTimeout(r, 250))
  await new Promise((r) => setTimeout(r, 1000))
  sock.close()
  const joined = ack?.joined ?? []
  chk(
    up && [`list:${L_OPEN}`, `list:${L_TASKS}`, `task:${T_BESIDE_TASK}`].every((r) => !joined.includes(r))
      && joined.includes(`task:${T_SHARED}`) && joined.includes(`list:${L_SHARED}`)
      && heardOf('saidonsharedtask') && !heardOf('saidbesideit'),
    'a guest joins the rooms of what is shared with them and hears it — not the open list’s, nor the room of a list they only pass through, nor the task beside theirs',
    `connected ${up}; joined ${JSON.stringify(joined)}; heard the shared task's comment ${heardOf('saidonsharedtask')}, the one beside it ${heardOf('saidbesideit')}`,
  )

  // ══ 11. THE GUEST'S SIDEBAR ══════════════════════════════════════════════
  console.log('\n▶ the guest’s own sidebar')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', guest.email)
  await page.fill('input[type=password]', guest.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${stack.base}/app/${WS}/${MIXED}/${P_LISTS}/${L_SHARED}`, { waitUntil: 'domcontentloaded' })
  const listed = await page.getByText(`${TAG} insharedlisttask`).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  // The tree, once it has drawn the space the guest is shared whole.
  await page.getByTestId(`space-link-${GRANTED}`).waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const sidebar = {
    granted: await page.getByTestId(`space-link-${GRANTED}`).count(),
    mixed: await page.getByTestId(`space-link-${MIXED}`).count(),
    open: await page.getByTestId(`space-link-${OPEN}`).count(),
  }
  chk(
    listed && sidebar.granted === 1 && sidebar.mixed === 1 && sidebar.open === 0,
    'the guest’s sidebar holds the spaces with things shared with them and not the open space, and the shared list opens on its task',
    `the shared list shows its task: ${listed}; the sidebar ${JSON.stringify(sidebar)}`,
  )

  // ══ 12. A LIST THEY ONLY PASS THROUGH ════════════════════════════════════
  console.log('\n▶ the list holding the task shared alone, opened in the browser')
  const failures = []
  page.on('response', (r) => { if (r.url().includes('/api/v1/') && r.status() >= 500) failures.push(`${r.status()} ${new URL(r.url()).pathname}`) })
  await page.goto(`${stack.base}/app/${WS}/${MIXED}/${P_TASKS}/${L_TASKS}`, { waitUntil: 'domcontentloaded' })
  const sharedShown = await page.getByText(`${TAG} sharedalonetask`).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  await page.waitForTimeout(1500)
  const besideShown = await page.getByText(`${TAG} besidesharedtask`).count()
  chk(
    sharedShown && besideShown === 0 && failures.length === 0,
    'the list holding a task shared alone opens on that task and not the one beside it, with nothing on the page failing',
    `the shared task shown: ${sharedShown}; the one beside shown ${besideShown}; server errors ${JSON.stringify(failures)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
