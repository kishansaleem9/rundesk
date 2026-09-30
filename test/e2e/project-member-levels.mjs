/**
 * A MEMBER'S ROLE ON A PROJECT DECIDES THERE, BEFORE THE SPACE'S — THE MOST
 * SPECIFIC GRANT WINS, AS IN CLICKUP.
 *
 * NOT A FRAME ROW: `found-25-sep/project-roles-narrow-nothing`. The Members
 * sheet sets a member's role on a project (View, Comment, Edit, Full), and
 * nothing read it: measured on lane 5, a member set to View on a project in an
 * ordinary space changed the admin's task there and made new ones, and every
 * rule a member meets asked only the space.
 *
 * ClickUp (help centre, search snippets): permissions set on a Folder or List
 * override the Space's, and the most specific one decides — "full edit on the
 * List but edit on the Folder". Both ways: a grant can narrow a member below
 * the space's default, and widen them above it.
 *
 * A project's maker is seeded as its admin member, by themselves; that says
 * who made it, not what they were given, so it is no exception to its space's
 * level (as `assertCanManageContainer` has it for the maker of a list).
 * Every refusal is read back by SQL beside its positive twin.
 *
 *   node test/e2e/project-member-levels.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

const stamp = Date.now()
const TAG = `pml${stamp}`
/* NEVER THROWS — `{status, data, message}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`),
 * whose `message` is this copy's rule (a list joined with '; ', '' for none);
 * like the copy, a write without a body sends `{}`: a route that reads a body
 * refuses a request with none. */
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'PATCH', 'PUT'] })

let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every change is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: 'Project member', email, password: 'Project@12345!', organizationName: `Project ${stamp}`, organizationSlug: `project-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  const space = async (name, level) => {
    const s = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    if (s.status >= 300 || !s.data?.id) throw new Error(`could not make the ${name} space: ${s.status}`)
    return s.data.id
  }
  /** A project in `spaceId` made by `by`, its list and a task of the admin's, and the member's role on it if any. */
  const place = async (spaceId, name, { role = null, by = A } = {}) => {
    const project = await by('/projects', { method: 'POST', body: { spaceId, name: `${TAG} ${name}` } })
    if (project.status >= 300 || !project.data?.id) throw new Error(`could not make the ${name} project: ${project.status}`)
    const list = await by('/lists', { method: 'POST', body: { projectId: project.data.id, name: `${TAG} ${name} list` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${list.status}`)
    const task = await by('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} task` } })
    if (task.status >= 300 || !task.data?.id) throw new Error(`could not make the ${name} task: ${task.status}`)
    if (role) {
      const granted = await A(`/projects/${project.data.id}/members`, { method: 'POST', body: { userId: me.id, role } })
      if (granted.status >= 300) throw new Error(`could not give the member ${role} on ${name}: ${granted.status}`)
    }
    return { project: project.data.id, list: list.data.id, task: task.data.id, name }
  }
  /** A list of the member's own in `place`, planted by SQL: its maker may rename it, so only a grant can refuse them. */
  const theirList = async (place) =>
    (await sql`insert into lists (project_id, name, created_by_id) values (${place.project}, ${`${TAG} ${place.name} theirs`}, ${me.id}) returning id`)[0].id
  const title = async (id) => (await sql`select title from tasks where id = ${id}`)[0]?.title ?? null
  const tasksNamed = async (t) => (await sql`select count(*)::int as n from tasks where title = ${t}`)[0].n
  const listName = async (id) => (await sql`select name from lists where id = ${id}`)[0]?.name ?? null
  const comments = async (id) => (await sql`select count(*)::int as n from task_comments where task_id = ${id} and author_id = ${me.id}`)[0].n

  const OPEN = await space('open')
  const PV = await place(OPEN, 'view', { role: 'view' })
  const PC = await place(OPEN, 'comment', { role: 'comment' })
  const PN = await place(OPEN, 'no grant')
  const LOCKED = await space('locked', 'view')
  const PE = await place(LOCKED, 'edit', { role: 'edit' })
  // Full edit on the project beside it: making a task takes Full edit, and Edit
  // changes what is there (`found-25-sep/full-edit-enforced-nowhere`).
  const PF = await place(LOCKED, 'full edit', { role: 'admin' })
  const PX = await place(LOCKED, 'nothing')

  // ══ 1. A VIEW GRANT NARROWS ══════════════════════════════════════════════
  console.log('\n▶ View on a project, in a space members may edit — and the project beside it, with no grant')
  const vTitle = await M(`/tasks/${PV.task}`, { method: 'PATCH', body: { title: `${TAG} changed through view` } })
  const vMake = await M('/tasks', { method: 'POST', body: { listId: PV.list, title: `${TAG} made through view` } })
  const vRename = await M(`/lists/${PV.list}`, { method: 'PUT', body: { name: `${TAG} renamed through view` } })
  // Their own list: the maker rule would let them rename it, so the project's View is what refuses.
  const vOwn = await theirList(PV)
  const vOwnRename = await M(`/lists/${vOwn}`, { method: 'PUT', body: { name: `${TAG} theirs renamed through view` } })
  const nOwn = await theirList(PN)
  const nOwnRename = await M(`/lists/${nOwn}`, { method: 'PUT', body: { name: `${TAG} theirs renamed with no grant` } })
  const nTitle = await M(`/tasks/${PN.task}`, { method: 'PATCH', body: { title: `${TAG} changed with no grant` } })
  chk(
    vTitle.status === 403 && (await title(PV.task)) === `${TAG} view task` &&
      vMake.status === 403 && (await tasksNamed(`${TAG} made through view`)) === 0 &&
      vRename.status === 403 && (await listName(PV.list)) === `${TAG} view list` &&
      vOwnRename.status === 403 && (await listName(vOwn)) === `${TAG} view theirs` &&
      nTitle.ok && (await title(PN.task)) === `${TAG} changed with no grant` &&
      nOwnRename.ok && (await listName(nOwn)) === `${TAG} theirs renamed with no grant`,
    'a member given View on a project changes nothing in it — not the admin\'s task, not a new task, not a list, even one they made — where the space alone would let them, as it does in the project beside it',
    `view: the task ${vTitle.status} ("${await title(PV.task)}"), a new task ${vMake.status}, the list ${vRename.status}, their own list ${vOwnRename.status} ("${await listName(vOwn)}"); ` +
      `no grant: the task ${nTitle.status} ("${await title(PN.task)}"), their own list ${nOwnRename.status}`,
  )

  // ══ 2. A COMMENT GRANT ═══════════════════════════════════════════════════
  console.log('\n▶ Comment on a project')
  const cSaid = await M(`/tasks/${PC.task}/comments`, { method: 'POST', body: { body: `${TAG} a comment` } })
  const cTitle = await M(`/tasks/${PC.task}`, { method: 'PATCH', body: { title: `${TAG} changed through comment` } })
  chk(
    cSaid.ok && (await comments(PC.task)) === 1 && cTitle.status === 403 && (await title(PC.task)) === `${TAG} comment task`,
    'a member given Comment on a project comments on its tasks and changes nothing of them',
    `the comment ${cSaid.status} (${await comments(PC.task)}); the title ${cTitle.status} ("${await title(PC.task)}")`,
  )

  // ══ 3. A GRANT WIDENS ════════════════════════════════════════════════════
  console.log('\n▶ Edit and Full edit on projects, in a view-only space — and a project beside them, with no grant')
  const eTitle = await M(`/tasks/${PE.task}`, { method: 'PATCH', body: { title: `${TAG} changed through edit` } })
  const eMake = await M('/tasks', { method: 'POST', body: { listId: PE.list, title: `${TAG} made through edit` } })
  const fMake = await M('/tasks', { method: 'POST', body: { listId: PF.list, title: `${TAG} made through full edit` } })
  const xTitle = await M(`/tasks/${PX.task}`, { method: 'PATCH', body: { title: `${TAG} changed in view-only` } })
  chk(
    eTitle.ok && (await title(PE.task)) === `${TAG} changed through edit` &&
      eMake.status === 403 && (await tasksNamed(`${TAG} made through edit`)) === 0 &&
      fMake.ok && (await tasksNamed(`${TAG} made through full edit`)) === 1 &&
      xTitle.status === 403 && (await title(PX.task)) === `${TAG} nothing task`,
    'a member given Edit on a project in a view-only space changes the admin\'s task there and makes none, and given Full edit on the one beside it makes one — and in a project with no grant the space\'s View still decides',
    `edit: the task ${eTitle.status} ("${await title(PE.task)}"), a new task ${eMake.status}; full edit: a new task ${fMake.status}; no grant: ${xTitle.status} ("${await title(PX.task)}")`,
  )

  // ══ 4. MAKING A PROJECT IS NOT A GRANT ═══════════════════════════════════
  console.log('\n▶ a project in a view-only space, with the member as its admin: the maker\'s seed, then the admin\'s grant')
  // The row `createProject` writes for its maker — admin, added by themselves —
  // planted by SQL: a plain member makes no projects, and the rule is about the row.
  const PM = await place(LOCKED, 'theirs')
  await sql`insert into project_members (project_id, user_id, role, added_by_id) values (${PM.project}, ${me.id}, 'admin', ${me.id})`
  const seeded = await M(`/tasks/${PM.task}`, { method: 'PATCH', body: { title: `${TAG} changed by the seed` } })
  const afterSeed = await title(PM.task)
  const [admin] = await sql`select id from users where email = ${ADMIN.email}`
  await sql`update project_members set added_by_id = ${admin.id} where project_id = ${PM.project} and user_id = ${me.id}`
  const given = await M(`/tasks/${PM.task}`, { method: 'PATCH', body: { title: `${TAG} changed by the grant` } })
  chk(
    seeded.status === 403 && afterSeed === `${TAG} theirs task` && given.ok && (await title(PM.task)) === `${TAG} changed by the grant`,
    'the admin row a project\'s maker is seeded with is no grant — the space\'s View decides — and the same row given by the admin is one',
    `the seed ${seeded.status} ("${afterSeed}"); given by the admin ${given.status} ("${await title(PM.task)}")`,
  )

  // ══ 5. WHAT A REFUSAL SAYS ═══════════════════════════════════════════════
  console.log('\n▶ what the View refusal says')
  chk(
    /project/i.test(vTitle.message) && /View only/.test(vTitle.message),
    'the refusal names the project and the level it gives — not the space\'s',
    `"${vTitle.message}"`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
