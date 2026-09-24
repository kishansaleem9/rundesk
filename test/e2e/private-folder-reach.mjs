/**
 * WHAT IS IN A PRIVATE FOLDER REACHES NOBODY IT REFUSES.
 *
 * NOT A FRAME ROW: `found-24-sep/private-folders-unenforced`. A folder made
 * private left the folder listing and nothing else: no read below a folder
 * asked it. Measured before the fix (probe `probe-private-folder`): a member it
 * refuses read its project, its list's tasks, a task, the workspace list and
 * search, each naming what was inside.
 *
 * ClickUp's rule: a private folder, and its lists and tasks, are seen only by
 * those it is shared with (and the workspace's admins). Here a private folder
 * is its maker's and the managers', as the folder listing already had it.
 *
 * The admin makes two folders in an open space, one private and one open, each
 * with a project, a list and a task. Each read is asked by the member and the
 * admin, and every "not there" sits beside the open folder's, which is.
 *
 *   node test/e2e/private-folder-reach.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json?.data, error: json?.error, text }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `pfr-${stamp}`
const WORD = `wombat${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the folder is made private by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Private folder member', email, password: 'Member@12345!',
    organizationName: `Private folder ${stamp}`, organizationSlug: `private-folder-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} open space` }, 'the open space')
  const inFolder = async (name) => {
    const folder = await make(`/spaces/${space}/folders`, { name: `${name} folder` }, `the ${name} folder`)
    const project = await make('/projects', { spaceId: space, name: `${name} project` }, `the ${name} project`)
    await sql`update projects set folder_id = ${folder} where id = ${project}`
    const list = await make('/lists', { projectId: project, name: `${name} list` }, `the ${name} list`)
    const task = await make('/tasks', { listId: list, title: `${name} task` }, `the ${name} task`)
    return { folder, project, list, task }
  }
  const HID = await inFolder(WORD)
  const OPEN = await inFolder(`${TAG} open`)
  // Private, and the admin's: the folder listing's own rule.
  await sql`update folders set visibility = 'private', created_by_id = ${adminId} where id = ${HID.folder}`
  const names = (res) => res.text.includes(WORD)

  // ══ 1. THE FOLDERS AND THEIR PROJECTS, LISTED ════════════════════════════
  console.log('\n▶ the space’s folders and projects')
  const [mFolders, mProjects, aProjects] = await Promise.all([M(`/spaces/${space}/folders`), M(`/projects/space/${space}`), A(`/projects/space/${space}`)])
  chk(
    mFolders.status === 200 && !names(mFolders) && mProjects.status === 200 && !names(mProjects) && mProjects.text.includes(OPEN.project) && names(aProjects),
    'the member is listed neither the private folder nor its project — the open folder’s project is, and the admin’s list has it',
    `folders ${said(mFolders)} names it: ${names(mFolders)}; projects ${said(mProjects)} names it: ${names(mProjects)}, the open one: ${mProjects.text.includes(OPEN.project)}; the admin's names it: ${names(aProjects)}`,
  )

  // ══ 2. ITS PROJECT, OPENED ═══════════════════════════════════════════════
  console.log('\n▶ the private folder’s project, by id')
  const [mProject, mOpenProject, aProject] = await Promise.all([M(`/projects/${HID.project}`), M(`/projects/${OPEN.project}`), A(`/projects/${HID.project}`)])
  chk(
    mProject.status >= 400 && mProject.status < 500 && !names(mProject) && mOpenProject.status === 200 && aProject.status === 200,
    'the private folder’s project is refused to the member — the open one opens, and the admin opens it',
    `the member ${said(mProject)}, the open project ${mOpenProject.status}; the admin ${aProject.status}`,
  )

  // ══ 3. ITS LISTS ═════════════════════════════════════════════════════════
  console.log('\n▶ its lists and their tasks')
  const [mLists, mTasks, mOpenTasks, aTasks] = await Promise.all([
    M(`/lists/workspace/${WS}`), M(`/tasks/list/${HID.list}`), M(`/tasks/list/${OPEN.list}`), A(`/tasks/list/${HID.list}`),
  ])
  chk(
    !names(mLists) && mLists.text.includes(OPEN.list) && mTasks.status >= 400 && mTasks.status < 500 && !names(mTasks) && mOpenTasks.status === 200 && names(aTasks),
    'the member is listed none of its lists, and its list’s tasks are refused — the open list’s are not, and the admin reads them',
    `the workspace's lists ${said(mLists)} name it: ${names(mLists)} (the open one: ${mLists.text.includes(OPEN.list)}); its tasks ${said(mTasks)}; the open list's ${mOpenTasks.status}; the admin's name it: ${names(aTasks)}`,
  )

  // ══ 4. A TASK ════════════════════════════════════════════════════════════
  console.log('\n▶ a task inside it, by id')
  const [mTask, mOpenTask, aTask] = await Promise.all([M(`/tasks/${HID.task}`), M(`/tasks/${OPEN.task}`), A(`/tasks/${HID.task}`)])
  chk(
    mTask.status >= 400 && mTask.status < 500 && !names(mTask) && mOpenTask.status === 200 && aTask.status === 200,
    'a task inside the private folder is refused to the member — the open folder’s task opens, and the admin opens it',
    `the member ${said(mTask)}, the open task ${mOpenTask.status}; the admin ${aTask.status}`,
  )

  // ══ 5. THE WORKSPACE LIST ════════════════════════════════════════════════
  console.log('\n▶ the workspace list behind the task pickers')
  const [mAll, aAll] = await Promise.all([M(`/tasks/workspace/${WS}?q=${WORD}`), A(`/tasks/workspace/${WS}?q=${WORD}`)])
  const allIds = (res) => (Array.isArray(res.data) ? res.data : []).map((t) => t.id)
  chk(
    mAll.status === 200 && allIds(mAll).length === 0 && allIds(aAll).includes(HID.task),
    'the workspace list finds the member nothing inside the private folder — and finds the admin its task',
    `the member's ${said(mAll)} ${JSON.stringify(allIds(mAll))}; the admin's has it: ${allIds(aAll).includes(HID.task)}`,
  )

  // ══ 6. SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ search, for its word')
  const [mSearch, aSearch] = await Promise.all([M(`/search/${WS}?q=${WORD}&limit=100`), A(`/search/${WS}?q=${WORD}&limit=100`)])
  chk(
    mSearch.status === 200 && !names(mSearch) && names(aSearch),
    'search finds the member nothing inside the private folder — its project, list or task — and finds the admin them',
    `the member's ${said(mSearch)} names it: ${names(mSearch)} ${mSearch.text.slice(0, 140)}; the admin's: ${names(aSearch)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
