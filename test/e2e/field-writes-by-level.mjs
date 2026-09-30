/**
 * A TASK'S CUSTOM FIELDS ARE SET AS THE TASK IS CHANGED, AND DEFINED BY
 * SOMEBODY WHO MAY CHANGE THEIR LOCATION.
 *
 * NOT A FRAME ROW: `found-25-sep/field-values-written-by-readers`. The value
 * route and every definition route asked only that the task or project could
 * be opened. Measured on lane 5: a member in a view-only space set a task's
 * field value (200) and defined a field from the task (201), and a guest with
 * only a view share on a task defined one from it (201). Deleting a field
 * takes every task's value in it.
 *
 * ClickUp (help centre, "Custom Field permissions", "Use Voting Custom
 * Fields", search snippets): a field's value is part of the task, changed with
 * "Edit"; guests with edit change values and create no fields; anybody who can
 * see a task may vote on it. Every value and definition is read back by SQL.
 *
 *   node test/e2e/field-writes-by-level.mjs --api 3021
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `fwl${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — values and definitions are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Fields ${who}`, email, password: 'Fields@12345!', organizationName: `Fields ${who} ${stamp}`, organizationSlug: `fields-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    const [u] = await sql`select id from users where email = ${email}`
    return { id: u.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as

  /** A space at `level`, its project, list and a task of the admin's, and a text and a voting field on the project. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} task` } })
    if (!task.ok || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(space)} ${said(project)} ${said(list)} ${said(task)}`)
    const field = async (fname, type) => {
      const r = await A(`/workspaces/${WS}/projects/${project.data.id}/custom-fields`, { method: 'POST', body: { name: `${TAG} ${name} ${fname}`, type } })
      if (!r.ok || !r.data?.id) throw new Error(`could not define ${fname}: ${said(r)}`)
      return r.data.id
    }
    return { space: space.data.id, project: project.data.id, list: list.data.id, task: task.data.id, text: await field('notes', 'text'), vote: await field('votes', 'voting') }
  }
  const VIEW = await place('view', 'view')
  const OPEN = await place('open')
  const value = async (task, field) => (await sql`select value from custom_field_values where task_id = ${task} and field_id = ${field}`)[0]?.value ?? null
  const fieldsNamed = async (name) => (await sql`select count(*)::int as n from custom_field_definitions where name = ${name}`)[0].n
  const fieldName = async (id) => (await sql`select name from custom_field_definitions where id = ${id}`)[0]?.name ?? null
  const setValue = (C, place, field, v) => C(`/workspaces/${WS}/tasks/${place.task}/custom-fields/${field}`, { method: 'PUT', body: { value: v } })

  // ══ 1. A VALUE ═══════════════════════════════════════════════════════════
  console.log('\n▶ a field’s value, set by the member in a view-only space and in an open one')
  const v1 = await setValue(M, VIEW, VIEW.text, 'set by a viewer')
  const o1 = await setValue(M, OPEN, OPEN.text, 'set by the member')
  const [vv, ov] = [await value(VIEW.task, VIEW.text), await value(OPEN.task, OPEN.text)]
  chk(
    v1.status === 403 && vv === null && o1.status === 200 && JSON.stringify(ov).includes('set by the member'),
    'a member in a view-only space sets no field value on a task there (403, none written) — in an open space they do, read back',
    `view-only ${said(v1)}, now ${JSON.stringify(vv)}; open ${said(o1)}, now ${JSON.stringify(ov)}`,
  )

  // ══ 2. DEFINING ══════════════════════════════════════════════════════════
  console.log('\n▶ defining a field, from a task and on the project, in each space')
  const d1 = await M(`/workspaces/${WS}/tasks/${VIEW.task}/custom-fields`, { method: 'POST', body: { name: `${TAG} the viewer's field from the task`, type: 'text' } })
  const d2 = await M(`/workspaces/${WS}/projects/${VIEW.project}/custom-fields`, { method: 'POST', body: { name: `${TAG} the viewer's field on the project`, type: 'text' } })
  const d3 = await M(`/workspaces/${WS}/tasks/${OPEN.task}/custom-fields`, { method: 'POST', body: { name: `${TAG} the member's field`, type: 'text' } })
  const [n1, n2, n3] = [
    await fieldsNamed(`${TAG} the viewer's field from the task`),
    await fieldsNamed(`${TAG} the viewer's field on the project`),
    await fieldsNamed(`${TAG} the member's field`),
  ]
  chk(
    d1.status === 403 && n1 === 0 && d2.status === 403 && n2 === 0 && d3.status === 201 && n3 === 1,
    'a member in a view-only space defines no field there, from a task or on the project (403, none made) — in an open space they define one from a task',
    `from the task ${said(d1)}, made ${n1}; on the project ${said(d2)}, ${n2}; in the open space ${said(d3)}, ${n3}`,
  )

  // ══ 3. RENAMING AND DELETING ═════════════════════════════════════════════
  console.log('\n▶ renaming and deleting a field, in each space')
  const r1 = await M(`/workspaces/${WS}/custom-fields/${VIEW.text}`, { method: 'PATCH', body: { name: `${TAG} renamed by a viewer` } })
  const x1 = await M(`/workspaces/${WS}/custom-fields/${VIEW.text}`, { method: 'DELETE' })
  const r2 = await M(`/workspaces/${WS}/custom-fields/${OPEN.text}`, { method: 'PATCH', body: { name: `${TAG} renamed by the member` } })
  const [nv, no] = [await fieldName(VIEW.text), await fieldName(OPEN.text)]
  chk(
    r1.status === 403 && x1.status === 403 && nv === `${TAG} view notes` && r2.status === 200 && no === `${TAG} renamed by the member`,
    'nor renames or deletes a field there (403, the field as it was) — in an open space they rename one',
    `rename ${said(r1)}, delete ${said(x1)}, now "${nv}"; open rename ${said(r2)}, now "${no}"`,
  )

  // ══ 4. A VOTE ════════════════════════════════════════════════════════════
  console.log('\n▶ a vote, by the member in the view-only space')
  const vote = await setValue(M, VIEW, VIEW.vote, true)
  const votes = await value(VIEW.task, VIEW.vote)
  chk(
    vote.status === 200 && Array.isArray(votes?.v) && votes.v.includes(member.id),
    'a vote is the voter’s own, and anybody who can see the task casts one — the member votes in the view-only space, read back',
    `${said(vote)}, now ${JSON.stringify(votes)}`,
  )

  // ══ 5. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest: a project shared with them to edit, a task shared with them to view')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'project', ${OPEN.project}, ${guest.id}, 'edit'),
    (${WS}, 'task', ${VIEW.task}, ${guest.id}, 'view')`
  const g1 = await G(`/workspaces/${WS}/projects/${OPEN.project}/custom-fields`, { method: 'POST', body: { name: `${TAG} the guest's field`, type: 'text' } })
  const g2 = await G(`/workspaces/${WS}/tasks/${OPEN.task}/custom-fields`, { method: 'POST', body: { name: `${TAG} the guest's field from a task`, type: 'text' } })
  const g3 = await setValue(G, VIEW, VIEW.text, 'set by the guest')
  const [gn1, gn2, gv] = [await fieldsNamed(`${TAG} the guest's field`), await fieldsNamed(`${TAG} the guest's field from a task`), await value(VIEW.task, VIEW.text)]
  chk(
    g1.status === 403 && gn1 === 0 && g2.status === 403 && gn2 === 0 && g3.status === 403 && gv === null,
    'a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)',
    `on the project ${said(g1)}, made ${gn1}; from a task ${said(g2)}, ${gn2}; a value where shared to view ${said(g3)}, now ${JSON.stringify(gv)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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
