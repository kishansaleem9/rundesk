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
 * AND A VALUE ONLY FOR A FIELD THE TASK HAS,
 * `found-30-sep/field-route-takes-another-projects-field`. The value route asked
 * that the task and the field were both in the workspace, not that the field was
 * the task's: measured on lane 7, a field of another project and one scoped to
 * another list of the task's own each took a value onto it (200, and a vote as
 * well), which no reader shows, since the task's fields are its project's, less
 * those scoped to another list. ClickUp's own API sets a value only for a field
 * "applicable" to the task and answers 400 otherwise (Set Custom Field Value,
 * read through search excerpts). Here it is refused as a field that is not there
 * (404), whatever project it is in, so the answer says nothing of a project the
 * caller may not open (OWASP ASVS 4.2.1: no "creating or updating someone else's
 * record"). The member asks, on the open task they may change.
 *
 * AND SEARCH FINDS A TASK ONLY BY A VALUE OF A FIELD IT HAS
 * (`found-30-sep/search-finds-tasks-by-values-they-no-longer-show`). A move
 * changes a task's list and leaves its value rows, and search's custom-field
 * filter matched every row of the field: measured on lane 7, a task moved out
 * of a field's list and one moved in from another project were each found by a
 * value their fields, read back, do not show. The filter asks the rule the
 * readers ask (`fieldIsOnTask`): the task's project is the field's, and for a
 * field scoped to a list, the task is in it.
 *
 * AND A FIELD SCOPED TO A LIST IS LISTED ONLY TO WHO MAY OPEN THE LIST
 * (`found-6-oct/field-lists-name-a-private-lists-fields`): a project's field
 * list and search's field filter named a private list's field to a member that
 * list refuses.
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
const EXPECTED_CHECKS = 12

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
    return { space, project, list, task, field }
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

  // ══ 5–6. A FIELD THE TASK DOES NOT HAVE ══════════════════════════════════
  console.log('\n▶ a value for a field the task does not have')
  /*
   * `found-30-sep/field-route-takes-another-projects-field`. The member may
   * change the open task (section 2). Beside it: another project in the open
   * space, with a Text and a Voting field; and in the open task's own project a
   * second list, a field scoped to it, and a field scoped to the task's own list.
   * The hidden project's field is a field of a project the member may not open.
   */
  const elsewhere = await make(A, '/projects', { spaceId: open.space, name: `${TAG} elsewhere project` }, 'the other project')
  const foreignText = await make(A, `/workspaces/${WS}/projects/${elsewhere}/custom-fields`, { name: `${TAG} elsewhere text`, type: 'text' }, 'the other project’s Text field')
  const foreignVote = await make(A, `/workspaces/${WS}/projects/${elsewhere}/custom-fields`, { name: `${TAG} elsewhere vote`, type: 'voting' }, 'the other project’s Voting field')
  const secondList = await make(A, '/lists', { projectId: open.project, name: `${TAG} open second list` }, 'the second list')
  const scopedElsewhere = await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} second list’s field`, type: 'text', listId: secondList }, 'the field of the second list')
  const scopedHere = await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} open list’s field`, type: 'text', listId: open.list }, 'the field of the task’s own list')
  const putOnOpen = (field, value) => M(`/workspaces/${WS}/tasks/${open.task}/custom-fields/${field}`, { method: 'PUT', body: { value } })
  /** How many values the open task holds for a field, read by SQL. */
  const heldFor = async (field) => (await sql`select count(*)::int as n from custom_field_values where task_id = ${open.task} and field_id = ${field}`)[0].n

  const foreignTextPut = await putOnOpen(foreignText, `${TAG} written elsewhere`)
  const foreignVotePut = await putOnOpen(foreignVote, null)
  const hiddenFieldPut = await putOnOpen(hidden.field, `${TAG} written into the hidden project`)
  const ownProjectPut = await putOnOpen(open.field, `${TAG} open value, again`)
  const foreignHeld = { text: await heldFor(foreignText), vote: await heldFor(foreignVote), hidden: await heldFor(hidden.field) }
  chk(
    refused(foreignTextPut) && refused(foreignVotePut) && refused(hiddenFieldPut) &&
      foreignHeld.text === 0 && foreignHeld.vote === 0 && foreignHeld.hidden === 0 &&
      ownProjectPut.ok && JSON.stringify(await valueOf(open.task, open.field)).includes('again'),
    'a value for a field of another project is refused on a task (404 each, nothing written, read by SQL) — a Text field and a Voting field alike, and one of a project the member may not open — while the task’s own project’s field is set',
    `the other project’s Text ${said(foreignTextPut)}, its Voting ${said(foreignVotePut)}, the hidden project’s ${said(hiddenFieldPut)}; ` +
      `the task holds ${JSON.stringify(foreignHeld)} values for them; its own project’s field answered ${said(ownProjectPut)}`,
  )

  const elsewherePut = await putOnOpen(scopedElsewhere, `${TAG} written into the second list’s field`)
  const herePut = await putOnOpen(scopedHere, `${TAG} the open list’s value`)
  const elsewhereHeld = await heldFor(scopedElsewhere)
  const shown = await M(`/workspaces/${WS}/tasks/${open.task}/custom-fields`)
  const shownHere = (shown.data ?? []).find((r) => r.definition?.id === scopedHere)?.value ?? null
  chk(
    refused(elsewherePut) && elsewhereHeld === 0 &&
      herePut.ok && shown.ok && shownHere === `${TAG} the open list’s value`,
    'and a value for a field scoped to another list of the task’s project is refused (404, nothing written) — while a field scoped to the task’s own list is set, and the task’s fields read it back',
    `the second list’s field answered ${said(elsewherePut)} and the task holds ${elsewhereHeld} value(s) for it; ` +
      `the task’s own list’s field answered ${said(herePut)}, and the task’s fields (${said(shown)}) read ${JSON.stringify(shownHere)}`,
  )

  // ══ 7. SEARCH, BY A FIELD THE TASK HAS ═══════════════════════════════════
  console.log('\n▶ search’s custom-field filter, after a move')
  /*
   * `found-30-sep/search-finds-tasks-by-values-they-no-longer-show`. Four tasks
   * of the admin's, each given a value where it is: two in the second list
   * (its field), two in the other project (its Text field). Then one of each
   * moves into the open list, where neither field is one the task has. Each
   * search is the admin's, who may open everything here.
   */
  const elsewhereList = await make(A, '/lists', { projectId: elsewhere, name: `${TAG} elsewhere list` }, 'the other project’s list')
  const adminTask = (list, title) => make(A, '/tasks', { listId: list, title: `${TAG} ${title}` }, title)
  const movedOut = await adminTask(secondList, 'moved out of the second list')
  const staysOut = await adminTask(secondList, 'stays in the second list')
  const movedIn = await adminTask(elsewhereList, 'moved in from the other project')
  const staysIn = await adminTask(elsewhereList, 'stays in the other project')
  const STAGE = `${TAG} stage value`
  const OWNER = `${TAG} owner value`
  for (const [task, field, value] of [[movedOut, scopedElsewhere, STAGE], [staysOut, scopedElsewhere, STAGE], [movedIn, foreignText, OWNER], [staysIn, foreignText, OWNER]]) {
    const set = await A(`/workspaces/${WS}/tasks/${task}/custom-fields/${field}`, { method: 'PUT', body: { value } })
    if (!set.ok) throw new Error(`could not set a value for the search: ${said(set)}`)
  }
  for (const task of [movedOut, movedIn]) {
    const moved = await A(`/tasks/${task}/move`, { method: 'POST', body: { listId: open.list, position: 0 } })
    if (!moved.ok) throw new Error(`could not move a task into the open list: ${said(moved)}`)
  }
  const found = async (field, value) => {
    const res = await A(`/search/${WS}?q=&types=task&limit=50&customFieldId=${field}&customFieldValue=${encodeURIComponent(value)}`)
    return { status: res.status, ids: (Array.isArray(res.data) ? res.data : []).map((h) => h.id) }
  }
  const byStage = await found(scopedElsewhere, STAGE)
  const byOwner = await found(foreignText, OWNER)
  const stillHeld = { out: await valueOf(movedOut, scopedElsewhere), in: await valueOf(movedIn, foreignText) }
  const has = (res, task) => res.ids.includes(`task-${task}`)
  chk(
    byStage.status === 200 && byOwner.status === 200 &&
      !has(byStage, movedOut) && !has(byOwner, movedIn) && has(byStage, staysOut) && has(byOwner, staysIn) &&
      JSON.stringify(stillHeld.out).includes(STAGE) && JSON.stringify(stillHeld.in).includes(OWNER),
    'search’s custom-field filter finds a task by a value only of a field it has: not a task moved out of the field’s list, nor one moved in from another project, though each still holds the value (read by SQL) — while a task in the field’s list, and one still in the other project, are found',
    `by the second list’s field (${byStage.status}): the moved-out task found ${has(byStage, movedOut)}, the one that stayed ${has(byStage, staysOut)}; ` +
      `by the other project’s field (${byOwner.status}): the moved-in task found ${has(byOwner, movedIn)}, the one that stayed ${has(byOwner, staysIn)}; ` +
      `the moved tasks hold ${JSON.stringify(stillHeld)}`,
  )

  // ══ 8–9. A PRIVATE LIST'S FIELD ══════════════════════════════════════════
  console.log('\n▶ the field lists, beside a private list the member may not open')
  /*
   * `found-6-oct/field-lists-name-a-private-lists-fields`. In the open project,
   * a private list of the admin's and a field scoped to it. The member, refused
   * the list (403 "This list is private"), was answered 200 with that field, by
   * name, by the project's field list and by search's field filter (lane 7).
   * Both leave it out now, as the read rule leaves out the list (`readableList`).
   */
  const privateList = await make(A, '/lists', { projectId: open.project, name: `${TAG} private list`, visibility: 'private' }, 'the private list')
  const privateField = await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} private stage`, type: 'text', listId: privateList }, 'the private list’s field')
  const privateGate = await M(`/lists/${privateList}`)
  if (privateGate.status !== 403) throw new Error(`the member was not refused the private list (${said(privateGate)}), so nothing here would mean anything`)
  const idsOf = (res) => (Array.isArray(res.data) ? res.data : []).map((f) => f.id)
  const namesOf = (res) => (Array.isArray(res.data) ? res.data : []).map((f) => String(f.name ?? '').replace(`${TAG} `, ''))
  const memberProjectFields = await M(`/workspaces/${WS}/projects/${open.project}/custom-fields`)
  const adminProjectFields = await A(`/workspaces/${WS}/projects/${open.project}/custom-fields`)
  chk(
    memberProjectFields.status === 200 && !idsOf(memberProjectFields).includes(privateField) &&
      idsOf(memberProjectFields).includes(open.field) && idsOf(memberProjectFields).includes(scopedElsewhere) &&
      adminProjectFields.status === 200 && idsOf(adminProjectFields).includes(privateField),
    'a project’s field list leaves out, to a member refused a private list, the field scoped to it — the project’s own field and an open list’s still listed — while the admin’s lists it',
    `the member's (${memberProjectFields.status}): ${JSON.stringify(namesOf(memberProjectFields))}; the admin's (${adminProjectFields.status}): ${JSON.stringify(namesOf(adminProjectFields))}`,
  )
  const memberSearchFields = await M(`/search/${WS}/custom-fields`)
  const adminSearchFields = await A(`/search/${WS}/custom-fields`)
  chk(
    memberSearchFields.status === 200 && !idsOf(memberSearchFields).includes(privateField) && idsOf(memberSearchFields).includes(open.field) &&
      adminSearchFields.status === 200 && idsOf(adminSearchFields).includes(privateField),
    'and search’s field filter leaves it out to the member, the project’s own field still offered — while the admin’s offers it',
    `the member's (${memberSearchFields.status}): ${JSON.stringify(namesOf(memberSearchFields))}; the admin's (${adminSearchFields.status}): ${JSON.stringify(namesOf(adminSearchFields))}`,
  )

  console.log('\n▶ formulas, beside a private list the member may not open')
  /*
   * `found-6-oct/field-checks-name-a-private-lists-fields`. Kept to the admin's
   * private list: a formula reading the project's Budget, and a number field.
   * The member's rename of Budget was refused with that formula's name, and a
   * formula they defined over the private number was taken (201), while one
   * over the private formula was told it "is a formula field" (lane 3, measured).
   * ClickUp reads a field, not its name, and a field kept from someone is, to
   * them, no field. The task in the private list, the admin's, has Budget 10.
   */
  const budget = await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} Budget`, type: 'number' }, 'the project’s Budget')
  const margin = await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} Secret margin`, type: 'formula', listId: privateList, config: { expression: `{${TAG} Budget} * 2` } }, 'the private formula')
  await make(A, `/workspaces/${WS}/projects/${open.project}/custom-fields`, { name: `${TAG} Private cost`, type: 'number', listId: privateList }, 'the private number')
  const privateTask = await make(A, '/tasks', { listId: privateList, title: `${TAG} private task` }, 'the private list’s task')
  const ten = await A(`/workspaces/${WS}/tasks/${privateTask}/custom-fields/${budget}`, { method: 'PUT', body: { value: 10 } })
  if (!ten.ok) throw new Error(`could not set the private task's Budget: ${said(ten)}`)
  const renamed = await M(`/workspaces/${WS}/custom-fields/${budget}`, { method: 'PATCH', body: { name: `${TAG} Budget (USD)` } })
  const [marginNow] = await sql`select config from custom_field_definitions where id = ${margin}`
  const marginOnTask = ((await A(`/workspaces/${WS}/tasks/${privateTask}/custom-fields`)).data ?? []).find((f) => (f.definition?.id ?? f.id) === margin)
  chk(
    renamed.ok && (await fieldNamed(budget)) === `${TAG} Budget (USD)` && marginNow?.config?.expression === `{${TAG} Budget (USD)} * 2`,
    'a member renames a field that a formula kept to a list they may not open reads: the rename stands, and the formula reads the new name',
    `the rename answered ${said(renamed)}; the formula now reads ${JSON.stringify(marginNow?.config?.expression ?? null)}`,
  )
  chk(
    marginOnTask?.value === 20,
    'and the formula still computes from the renamed field on the private list’s task: 20 from a Budget of 10',
    `the admin reads the formula on that task as ${JSON.stringify(marginOnTask?.value ?? null)}`,
  )
  const defineOver = (name) => M(`/workspaces/${WS}/projects/${open.project}/custom-fields`, { method: 'POST', body: { name: `${TAG} over ${name}`, type: 'formula', config: { expression: `{${TAG} ${name}} + 1` } } })
  const overCost = await defineOver('Private cost')
  const overMargin = await defineOver('Secret margin')
  const overNothing = await defineOver('Nothing by this name')
  const noField = (res, name) => res.status === 400 && res.error?.message === `Formula: there is no field called "${TAG} ${name}" on this project`
  chk(
    noField(overCost, 'Private cost') && noField(overMargin, 'Secret margin') && noField(overNothing, 'Nothing by this name'),
    'a formula the member defines over a field kept to that list is told there is no field called it, in the words for one that does not exist — a number or a formula',
    `over the private number ${said(overCost)}; over the private formula ${said(overMargin)}; over nothing ${said(overNothing)}`,
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
