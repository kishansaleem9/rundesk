/**
 * A TASK IS CHANGED BY THE LEVEL ITS SPACE GIVES, AS IN CLICKUP — NOT BY WHO
 * MADE IT OR IS ON IT.
 *
 * NOT A FRAME ROW: `found-24-sep/task-edits-narrower-than-clickup`. Only a
 * task's creator, an assignee or a manager could change it
 * (`assertTaskWriteAccess`): a member with "edit" on a space could not change a
 * colleague's task in it — its title, status, fields, archiving or deleting.
 *
 * ClickUp (help centre, search snippets): "Edit" lets a person edit every task
 * and subtask in the location — status, assignee, title, attachments,
 * archiving, moving — and "Full edit" adds creating and deleting; members hold
 * full edit on public locations by default. "Comment" allows comments, and on
 * a task assigned to them its status; "View" nothing. Rundesk's "edit" is the
 * default and already makes tasks, so it is read as ClickUp's default here.
 *
 * A task the person cannot open (a private list's) is not theirs to change,
 * whatever the space lets them do. Every refusal is read back by SQL beside
 * its positive twin.
 *
 *   node test/e2e/task-edit-levels.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

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
const TAG = `tel${stamp}`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  const body = init.body ?? (['POST', 'PATCH', 'PUT'].includes(init.method) ? {} : undefined)
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}

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
  const signed = await signUpApi(API, { fullName: 'Editing member', email, password: 'Editor@12345!', organizationName: `Editing ${stamp}`, organizationSlug: `editing-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  /** A space at `level`, a project and a list in it, and the admin's tasks there. */
  const place = async (name, level, { privateList = false } = {}) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    if (space.status >= 300 || !space.data?.id) throw new Error(`could not make the ${name} space: ${space.status}`)
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name} list`, ...(privateList ? { visibility: 'private' } : {}) } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${list.status}`)
    const task = async (title, assignees = []) => {
      const t = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${title}`, ...(assignees.length ? { assigneeIds: assignees } : {}) } })
      if (t.status >= 300 || !t.data?.id) throw new Error(`could not make "${title}": ${t.status}`)
      return t.data.id
    }
    return { space: space.data.id, list: list.data.id, task }
  }
  const row = async (id) => (await sql`select title, status, is_archived, deleted_at from tasks where id = ${id}`)[0] ?? null
  const assigned = async (id) => (await sql`select count(*)::int as n from task_assignees where task_id = ${id} and user_id = ${me.id}`)[0].n

  const EDIT = await place('edit')
  const COMMENT = await place('comment', 'comment')
  const VIEW = await place('view', 'view')
  const HIDDEN = await place('hidden', null, { privateList: true })

  // ══ 1. A SPACE THAT LETS THEM EDIT ═══════════════════════════════════════
  console.log('\n▶ in a space the member may edit, a colleague\'s task: its title, status and assignees, archived, deleted')
  const e1 = await EDIT.task('retitle')
  const e2 = await EDIT.task('archive')
  const e3 = await EDIT.task('bin')
  const retitled = await M(`/tasks/${e1}`, { method: 'PATCH', body: { title: `${TAG} renamed by the member`, status: 'in_progress' } })
  const selfAssigned = await M(`/tasks/${e1}/assignees`, { method: 'POST', body: { userId: me.id } })
  const archived = await M(`/tasks/${e2}`, { method: 'DELETE' })
  const binned = await M(`/tasks/${e3}/trash`, { method: 'POST' })
  const [r1, r2, r3] = [await row(e1), await row(e2), await row(e3)]
  chk(
    retitled.status < 300 && r1?.title === `${TAG} renamed by the member` && r1?.status === 'in_progress' &&
      selfAssigned.status < 300 && (await assigned(e1)) === 1 &&
      archived.status < 300 && r2?.is_archived === true && binned.status < 300 && r3?.deleted_at !== null,
    'a member with "edit" on the space changes a colleague\'s task there — its title and status, its assignees — and archives and deletes one',
    `retitle ${retitled.status} (${JSON.stringify(r1 && { title: r1.title, status: r1.status })}); assign ${selfAssigned.status}; ` +
      `archive ${archived.status} (${r2?.is_archived}); delete ${binned.status} (${r3?.deleted_at})`,
  )

  // ══ 2. A SPACE THAT LETS THEM COMMENT ════════════════════════════════════
  console.log('\n▶ in a comment-only space: a colleague\'s task, and one assigned to the member')
  const c1 = await COMMENT.task('not theirs')
  const c2 = await COMMENT.task('assigned to them', [me.id])
  const cTitle = await M(`/tasks/${c1}`, { method: 'PATCH', body: { title: `${TAG} renamed in comment` } })
  const cOtherStatus = await M(`/tasks/${c1}`, { method: 'PATCH', body: { status: 'in_progress' } })
  const cStatus = await M(`/tasks/${c2}`, { method: 'PATCH', body: { status: 'in_progress' } })
  const cTheirsTitle = await M(`/tasks/${c2}`, { method: 'PATCH', body: { title: `${TAG} their title in comment` } })
  const [rc1, rc2] = [await row(c1), await row(c2)]
  chk(
    cTitle.status === 403 && rc1?.title === `${TAG} not theirs` && cOtherStatus.status === 403 && rc1?.status !== 'in_progress' &&
      cStatus.status < 300 && rc2?.status === 'in_progress' &&
      cTheirsTitle.status === 403 && rc2?.title === `${TAG} assigned to them`,
    'a comment-only space lets a member change nothing of a colleague\'s task, and on a task assigned to them its status alone',
    `a colleague's title ${cTitle.status} ("${rc1?.title}"), status ${cOtherStatus.status} (${rc1?.status}); their task's status ${cStatus.status} (${rc2?.status}), its title ${cTheirsTitle.status} ("${rc2?.title}")`,
  )

  // ══ 3. A SPACE THAT LETS THEM VIEW ═══════════════════════════════════════
  console.log('\n▶ in a view-only space, even a task assigned to the member')
  const v1 = await VIEW.task('viewed', [me.id])
  const vStatus = await M(`/tasks/${v1}`, { method: 'PATCH', body: { status: 'in_progress' } })
  const vArchive = await M(`/tasks/${v1}`, { method: 'DELETE' })
  const rv1 = await row(v1)
  chk(
    vStatus.status === 403 && vArchive.status === 403 && rv1?.status !== 'in_progress' && rv1?.is_archived === false,
    'a view-only space lets a member change nothing, even on a task assigned to them',
    `status ${vStatus.status} (${rv1?.status}); archive ${vArchive.status} (${rv1?.is_archived})`,
  )

  // ══ 4. A TASK THEY CANNOT OPEN ═══════════════════════════════════════════
  console.log('\n▶ a task in a private list the member is not in, in a space they may edit')
  const h1 = await HIDDEN.task('hidden')
  const hTitle = await M(`/tasks/${h1}`, { method: 'PATCH', body: { title: `${TAG} renamed unseen` } })
  const hArchive = await M(`/tasks/${h1}`, { method: 'DELETE' })
  const adminTitle = await A(`/tasks/${h1}`, { method: 'PATCH', body: { title: `${TAG} renamed by the admin` } })
  const rh1 = await row(h1)
  chk(
    [403, 404].includes(hTitle.status) && [403, 404].includes(hArchive.status) &&
      adminTitle.status < 300 && rh1?.title === `${TAG} renamed by the admin` && rh1?.is_archived === false,
    'a task the member cannot open is not theirs to change, whatever the space lets them do — the admin changes it',
    `the member's title ${hTitle.status}, archive ${hArchive.status}; the admin's ${adminTitle.status}; the row ${JSON.stringify(rh1 && { title: rh1.title, archived: rh1.is_archived })}`,
  )

  // ══ 5. THE MESSAGE ═══════════════════════════════════════════════════════
  console.log('\n▶ what a refusal says')
  const said = await fetch(`${API}/tasks/${c1}`, { method: 'PATCH', headers: { authorization: `Bearer ${signed.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x' }) })
    .then(async (r) => (await r.json().catch(() => null))?.error?.message ?? '').catch(() => '')
  chk(
    said.length > 0 && !/Only assignees, creators/i.test(said),
    'a refusal names the space\'s level, not "only assignees, creators, managers and admins", which is no longer the rule',
    `"${said}"`,
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
