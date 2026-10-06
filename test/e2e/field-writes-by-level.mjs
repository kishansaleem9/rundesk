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
 * AND A FIELD'S LIST IS ONE OF ITS PROJECT'S
 * (`found-30-sep/field-definition-takes-a-foreign-list`). The `listId` a field
 * was defined with was stored as sent and asked of the rule as its most
 * specific step: measured on lane 7, an admin defined a field in one project
 * scoped to another project's list (201, a field no task can have), and a
 * member refused fields in a view-only space (403) defined one there by naming
 * a list of another space shared with them to edit (201). ClickUp adds a field
 * "to the Hierarchy location where the view or task is located" (help centre,
 * "Create Custom Fields", search excerpts). Such a list is refused as a list
 * that is not there, and the space's answer stands for whoever names it.
 *
 * AND THE FIELD'S OWN LIST DECIDES, for making, renaming and deleting it, and
 * a private one is its own people's — the review of that item, measured on
 * lane 7: renaming and deleting asked without the field's list, so a member
 * shared it to view, in a space they may edit, renamed and deleted its field,
 * the values with it (200), and one shared a view-only space's list to edit
 * could not rename the field they had made there (403); a member refused a
 * private list defined a field scoped to it (201) and renamed and deleted the
 * admin's (200); a list's id sent in brackets slipped past its share (201).
 * ClickUp: "permissions set on the most specific level of the Hierarchy are
 * applied" ("Set permissions on individual locations"), and a private List is
 * for "only certain people" ("Make Spaces, Folders, Subfolders, Lists, and
 * tasks private"; help centre, search excerpts).
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
const EXPECTED_CHECKS = 10

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

  // ══ 6–7. A LIST OF ANOTHER PROJECT ═══════════════════════════════════════
  console.log('\n▶ a field scoped to a list of another project')
  /*
   * `found-30-sep/field-definition-takes-a-foreign-list`. The open space's list
   * is shared with the member to edit: a list of another space, and of another
   * project than the view-only one's. Naming it was the member's way past the
   * view-only space (201); the space's answer is theirs either way now.
   */
  const shared = await A(`/shares/list/${OPEN.list}`, { method: 'POST', body: { userId: member.id, level: 'edit' } })
  if (!shared.ok) throw new Error(`could not share the open list with the member: ${said(shared)}`)
  const defineOnView = (C, name, listId) =>
    C(`/workspaces/${WS}/projects/${VIEW.project}/custom-fields`, { method: 'POST', body: { name, type: 'text', ...(listId ? { listId } : {}) } })
  const plain = await defineOnView(M, `${TAG} the viewer's field, no list`)
  const viaShare = await defineOnView(M, `${TAG} the viewer's field on a shared list`, OPEN.list)
  const [pn, sn] = [await fieldsNamed(`${TAG} the viewer's field, no list`), await fieldsNamed(`${TAG} the viewer's field on a shared list`)]
  const spaceSays = (res) => /"View only"/.test(String(res.error?.message ?? ''))
  chk(
    plain.status === 403 && viaShare.status === 403 && spaceSays(plain) && spaceSays(viaShare) && pn === 0 && sn === 0,
    'a member refused fields in a view-only space is refused one there with no list (403), and naming a list of another space shared with them to edit (403) — no step on the way to this project — the space’s reason both times, none made (read by SQL)',
    `with no list ${said(plain)}, made ${pn}; naming the shared list of the open space ${said(viaShare)}, made ${sn}`,
  )

  const foreign = await defineOnView(A, `${TAG} the admin's field on another project's list`, OPEN.list)
  const own = await defineOnView(A, `${TAG} the admin's field on the project's own list`, VIEW.list)
  const fn = await fieldsNamed(`${TAG} the admin's field on another project's list`)
  const [ownRow] = own.data?.id ? await sql`select list_id from custom_field_definitions where id = ${own.data.id}` : []
  chk(
    foreign.status === 404 && /List not found in this project/.test(String(foreign.error?.message ?? '')) && fn === 0 &&
      own.status === 201 && ownRow?.list_id === VIEW.list,
    'a field scoped to a list of another project is refused, the admin’s included, as a list that is not there (404 “List not found in this project”, none made, read by SQL) — while one scoped to the project’s own list is made, stored with that list',
    `another project's list ${said(foreign)}, made ${fn}; the project's own list ${said(own)}, stored with ${JSON.stringify(ownRow?.list_id ?? null)}`,
  )

  // ══ 8–10. THE FIELD'S OWN LIST: ITS SHARE, ITS PRIVACY, ITS ID ═══════════
  console.log('\n▶ a field scoped to one of the project’s lists, made, renamed and deleted as that list says')
  /*
   * The review of `found-30-sep/field-definition-takes-a-foreign-list`. Made
   * last: a share on the view-only space's list lets the member change its
   * tasks, which the first check says they may not. In the open space, which
   * the member may edit: a side list shared with them to view, and a private
   * list of the admin's they may not open, each with a field the admin scoped
   * to it and a value on a task in it.
   */
  const madeBy = async (C, route, body, what) => {
    const r = await C(route, { method: 'POST', body })
    if (!r.ok || !r.data?.id) throw new Error(`could not make ${what}: ${said(r)}`)
    return r.data.id
  }
  const side = await madeBy(A, '/lists', { projectId: OPEN.project, name: `${TAG} open side` }, 'the open space’s side list')
  const secret = await madeBy(A, '/lists', { projectId: OPEN.project, name: `${TAG} open private`, visibility: 'private' }, 'the open space’s private list')
  for (const [list, level] of [[VIEW.list, 'edit'], [side, 'view']]) {
    const s = await A(`/shares/list/${list}`, { method: 'POST', body: { userId: member.id, level } })
    if (!s.ok) throw new Error(`could not share a list with the member at ${level}: ${said(s)}`)
  }
  const defineIn = (C, project, name, listId) =>
    C(`/workspaces/${WS}/projects/${project}/custom-fields`, { method: 'POST', body: { name, type: 'text', listId } })
  const scopedField = (project, listId, fname) => madeBy(A, `/workspaces/${WS}/projects/${project}/custom-fields`, { name: `${TAG} ${fname}`, type: 'text', listId }, fname)
  const valuedTaskIn = async (listId, fieldId, title) => {
    const task = await madeBy(A, '/tasks', { listId, title: `${TAG} ${title}` }, title)
    const v = await A(`/workspaces/${WS}/tasks/${task}/custom-fields/${fieldId}`, { method: 'PUT', body: { value: `${TAG} ${title}` } })
    if (!v.ok) throw new Error(`could not set a value on ${title}: ${said(v)}`)
  }
  const valuesIn = async (fieldId) => (await sql`select count(*)::int as n from custom_field_values where field_id = ${fieldId}`)[0].n
  const rename = (C, fieldId, name) => C(`/workspaces/${WS}/custom-fields/${fieldId}`, { method: 'PATCH', body: { name } })
  const remove = (C, fieldId) => C(`/workspaces/${WS}/custom-fields/${fieldId}`, { method: 'DELETE' })
  const privateSays = (res) => res.error?.message === 'This list is private'
  const viewShareSays = (res) => /^What is shared with you here is "View only"/.test(String(res.error?.message ?? ''))

  const onShared = await defineIn(M, VIEW.project, `${TAG} the member's field on the list shared to edit`, VIEW.list)
  const [onSharedRow] = onShared.data?.id ? await sql`select list_id from custom_field_definitions where id = ${onShared.data.id}` : []
  const onSecret = await defineIn(M, OPEN.project, `${TAG} the member's field on the private list`, secret)
  const secretMade = await fieldsNamed(`${TAG} the member's field on the private list`)
  chk(
    onShared.status === 201 && onSharedRow?.list_id === VIEW.list && onSecret.status === 403 && privateSays(onSecret) && secretMade === 0,
    'a field is made as its own list says: a member refused fields in a view-only space makes one there scoped to the project’s list shared with them to edit (201, stored with that list, read by SQL) — and none scoped to a private list of an open space that they may not open (403 “This list is private”, none made)',
    `on the list shared to edit ${said(onShared)}, stored with ${JSON.stringify(onSharedRow?.list_id ?? null)}; on the private list ${said(onSecret)}, made ${secretMade}`,
  )

  const sideField = await scopedField(OPEN.project, side, 'side stage')
  await valuedTaskIn(side, sideField, 'side task')
  const secretField = await scopedField(OPEN.project, secret, 'private stage')
  await valuedTaskIn(secret, secretField, 'private task')
  const viewListField = await scopedField(VIEW.project, VIEW.list, 'view list stage')
  const sideRen = await rename(M, sideField, `${TAG} side stage renamed by a viewer`)
  const sideDel = await remove(M, sideField)
  const secretRen = await rename(M, secretField, `${TAG} private stage renamed by an outsider`)
  const secretDel = await remove(M, secretField)
  const [sideName, sideValues, secretName, secretValues] = [await fieldName(sideField), await valuesIn(sideField), await fieldName(secretField), await valuesIn(secretField)]
  const viewRen = await rename(M, viewListField, `${TAG} view list stage renamed by its editor`)
  const viewRenamed = await fieldName(viewListField)
  const viewDel = await remove(M, viewListField)
  const viewLeft = await fieldName(viewListField)
  chk(
    sideRen.status === 403 && sideDel.status === 403 && viewShareSays(sideRen) && viewShareSays(sideDel) && sideName === `${TAG} side stage` && sideValues === 1 &&
      secretRen.status === 403 && secretDel.status === 403 && privateSays(secretRen) && privateSays(secretDel) && secretName === `${TAG} private stage` && secretValues === 1 &&
      viewRen.status === 200 && viewRenamed === `${TAG} view list stage renamed by its editor` && viewDel.status === 200 && viewLeft === null,
    'and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)',
    `the viewed list's field: rename ${said(sideRen)}, delete ${said(sideDel)}, now "${sideName}" with ${sideValues} value(s); ` +
      `the private list's: rename ${said(secretRen)}, delete ${said(secretDel)}, now "${secretName}" with ${secretValues} value(s); ` +
      `the list shared to edit: rename ${said(viewRen)}, now "${viewRenamed}"; delete ${said(viewDel)}, now ${JSON.stringify(viewLeft)}`,
  )

  const bracketedByMember = await defineIn(M, OPEN.project, `${TAG} the member's field on [the side list]`, [side])
  const bracketedByAdmin = await defineIn(A, OPEN.project, `${TAG} the admin's field on [the project's list]`, [OPEN.list])
  const [bm, ba] = [await fieldsNamed(`${TAG} the member's field on [the side list]`), await fieldsNamed(`${TAG} the admin's field on [the project's list]`)]
  const shapeSays = (res) => res.error?.message === 'listId must be a string or null'
  chk(
    bracketedByMember.status === 400 && bracketedByAdmin.status === 400 && shapeSays(bracketedByMember) && shapeSays(bracketedByAdmin) && bm === 0 && ba === 0,
    'a list is named by its id and nothing else: a member shared a list to view, in a space they may edit, sending it as [that list] is refused before any rule is asked, and so is the admin sending the project’s own list so (400 “listId must be a string or null”, none made, read by SQL)',
    `the member's [side list] ${said(bracketedByMember)}, made ${bm}; the admin's [the project's list] ${said(bracketedByAdmin)}, made ${ba}`,
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
