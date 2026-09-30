/**
 * A PROJECT'S CUSTOM FIELDS ARE READ AND CHANGED ONLY BY WHO MAY OPEN IT.
 *
 * NOT A FRAME ROW: `found-24-sep/custom-fields-open-to-any-member`. Every
 * custom-field route sits under `workspaces/:workspaceId` behind workspace
 * membership, and the service checked only that the project or task was in
 * that workspace. Measured on lane 1 before the fix, as a member refused a
 * private space (403 on its list and its task): they listed its project's
 * field by name, read its task's values, overwrote one, defined new fields
 * there (from the project and from the task), renamed a field and deleted it,
 * with every task's value in it.
 *
 * Each route is made by that member against the refused space and against an
 * open one, and the admin, who may open everything, reads the refused one.
 *
 *   node test/e2e/custom-field-access.mjs --api 3021
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
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 100)}`
/** Refused the way a missing or foreign project is: not found. */
const refused = (res) => res.status === 404

const stamp = Date.now()
const TAG = `cfa-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each refused write left behind is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Field member', email, password: 'Member@12345!',
    organizationName: `Field member ${stamp}`, organizationSlug: `field-member-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const make = async (C, route, body, what) => {
    const res = await C(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  /** A space, its project and list, a task, and one text field with a value on it. */
  const plant = async (side, visibility) => {
    const space = await make(A, '/spaces', { workspaceId: WS, name: `${TAG} ${side} space`, ...(visibility ? { visibility } : {}) }, `the ${side} space`)
    const project = await make(A, '/projects', { spaceId: space, name: `${TAG} ${side} project` }, `the ${side} project`)
    const list = await make(A, '/lists', { projectId: project, name: `${TAG} ${side} list` }, `the ${side} list`)
    const task = await make(A, '/tasks', { listId: list, title: `${TAG} ${side} task` }, `the ${side} task`)
    const field = await make(A, `/workspaces/${WS}/projects/${project}/custom-fields`, { name: `${TAG} ${side} field`, type: 'text' }, `the ${side} field`)
    const set = await A(`/workspaces/${WS}/tasks/${task}/custom-fields/${field}`, { method: 'PUT', body: { value: `${TAG} ${side} value` } })
    if (!set.ok) throw new Error(`could not set the ${side} value: ${said(set)}`)
    return { project, list, task, field }
  }
  const hidden = await plant('hidden', 'private')
  const open = await plant('open')
  const gate = await M(`/tasks/list/${hidden.list}`)
  if (gate.status !== 403) throw new Error(`the member was not refused the hidden list (${said(gate)}), so nothing here would mean anything`)
  const valueOf = async (task, field) =>
    (await sql`select value from custom_field_values where task_id = ${task} and field_id = ${field}`)[0]?.value ?? null
  const fieldNamed = async (id) => (await sql`select name from custom_field_definitions where id = ${id}`)[0]?.name ?? null

  // ══ 1. READS ═════════════════════════════════════════════════════════════
  console.log('\n▶ reading a project’s fields and a task’s values')
  const readAs = (C, side) => Promise.all([
    C(`/workspaces/${WS}/projects/${side.project}/custom-fields`),
    C(`/workspaces/${WS}/tasks/${side.task}/custom-fields`),
  ])
  const [memberDefs, memberValues] = await readAs(M, hidden)
  const [openDefs, openValues] = await readAs(M, open)
  const [adminDefs, adminValues] = await readAs(A, hidden)
  const names = (res) => JSON.stringify(res.data ?? null)
  chk(
    refused(memberDefs) && refused(memberValues) && !names(memberDefs).includes(`${TAG} hidden`) && !names(memberValues).includes(`${TAG} hidden`) &&
      openDefs.status === 200 && names(openDefs).includes(`${TAG} open field`) && openValues.status === 200 && names(openValues).includes(`${TAG} open value`) &&
      adminDefs.status === 200 && names(adminDefs).includes(`${TAG} hidden field`) && adminValues.status === 200,
    'a member cannot read the fields of a project they are refused, nor a task’s values there (404 each) — while they read an open one’s, and the admin reads the refused one’s',
    `the member: fields ${said(memberDefs)}, values ${said(memberValues)}; open fields ${openDefs.status}, values ${openValues.status}; ` +
      `the admin: fields ${adminDefs.status}, values ${adminValues.status}`,
  )

  // ══ 2. VALUES ════════════════════════════════════════════════════════════
  console.log('\n▶ setting a value')
  const hiddenPut = await M(`/workspaces/${WS}/tasks/${hidden.task}/custom-fields/${hidden.field}`, { method: 'PUT', body: { value: 'overwritten by the member' } })
  const openPut = await M(`/workspaces/${WS}/tasks/${open.task}/custom-fields/${open.field}`, { method: 'PUT', body: { value: `${TAG} open value, edited` } })
  const hiddenValue = await valueOf(hidden.task, hidden.field)
  const openValue = await valueOf(open.task, open.field)
  chk(
    refused(hiddenPut) && JSON.stringify(hiddenValue).includes(`${TAG} hidden value`) &&
      openPut.ok && JSON.stringify(openValue).includes('edited'),
    'a member cannot set a field on a task of a space they are refused (404, the value unchanged) — while they set one on an open task',
    `the refused task answered ${said(hiddenPut)} and now holds ${JSON.stringify(hiddenValue)}; the open one ${said(openPut)}, ${JSON.stringify(openValue)}`,
  )

  // ══ 3. NEW DEFINITIONS ═══════════════════════════════════════════════════
  console.log('\n▶ defining a field')
  const defineOnProject = await M(`/workspaces/${WS}/projects/${hidden.project}/custom-fields`, { method: 'POST', body: { name: `${TAG} member-made`, type: 'text' } })
  const defineFromTask = await M(`/workspaces/${WS}/tasks/${hidden.task}/custom-fields`, { method: 'POST', body: { name: `${TAG} member-made from the task`, type: 'text' } })
  const [{ n: strayDefs }] = await sql`
    select count(*)::int as n from custom_field_definitions where project_id = ${hidden.project} and name like ${`${TAG} member-made%`}`
  const defineOpen = await M(`/workspaces/${WS}/projects/${open.project}/custom-fields`, { method: 'POST', body: { name: `${TAG} member-made, open`, type: 'text' } })
  chk(
    refused(defineOnProject) && refused(defineFromTask) && strayDefs === 0 && defineOpen.ok,
    'a member cannot define a field in a project they are refused, from the project or from its task (404 each, none made) — while they define one in an open project',
    `from the project ${said(defineOnProject)}, from the task ${said(defineFromTask)}, fields made ${strayDefs}; in the open project ${said(defineOpen)}`,
  )

  // ══ 4. RENAME AND DELETE ═════════════════════════════════════════════════
  console.log('\n▶ renaming and deleting a field')
  const renameHidden = await M(`/workspaces/${WS}/custom-fields/${hidden.field}`, { method: 'PATCH', body: { name: 'renamed by the member' } })
  const deleteHidden = await M(`/workspaces/${WS}/custom-fields/${hidden.field}`, { method: 'DELETE' })
  const hiddenName = await fieldNamed(hidden.field)
  const renameOpen = await M(`/workspaces/${WS}/custom-fields/${open.field}`, { method: 'PATCH', body: { name: `${TAG} open field, renamed` } })
  chk(
    refused(renameHidden) && refused(deleteHidden) && hiddenName === `${TAG} hidden field` &&
      renameOpen.ok && (await fieldNamed(open.field)) === `${TAG} open field, renamed`,
    'a member cannot rename or delete a field of a project they are refused (404 each, the field untouched) — while they rename an open one',
    `rename ${said(renameHidden)}, delete ${said(deleteHidden)}; the field is now ${JSON.stringify(hiddenName)}; renaming the open one ${said(renameOpen)}`,
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
