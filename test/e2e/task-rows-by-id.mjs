/**
 * A TASK'S ROUTES ACT ON THAT TASK'S OWN ROWS, AS THAT TASK'S RULES ALLOW.
 *
 * NOT A FRAME ROW: `found-25-sep/task-rows-changed-by-id-anywhere`, found by a
 * route-by-route reading of every write that hangs off a task, then measured
 * on lane 5:
 *   - the checklist routes sit under `tasks/:taskId/checklists`, the guard
 *     asked that the caller could open the task in the URL, and the service
 *     wrote whatever checklist or item id it was handed — somebody from
 *     another organisation, naming a task of their own, renamed, added to,
 *     ticked, moved out of and deleted an admin's checklists; the item's update
 *     took the raw body, `checklistId` included;
 *   - a reaction's comment was never matched to the task in the URL either, and
 *     nothing asked whether the reactor might comment;
 *   - a task's old descriptions had no guard at all;
 *   - templates from a checklist, a checklist from a template, a task's type,
 *     a reminder on a task and a calendar push asked membership of the
 *     workspace, so a member refused a private space reached its tasks;
 *   - and none asked the task's level: a member in a view-only space made
 *     checklists and ticked items there.
 *
 * ClickUp (help centre, search snippets): "View" can't comment or edit; a
 * reaction is a comment-level act; a task's checklists are part of the task.
 * Every refusal here is read back by SQL beside the same act, allowed.
 *
 *   node test/e2e/task-rows-by-id.mjs --api 3021
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const refused = (res) => res.status === 403 || res.status === 404

const stamp = Date.now()
const TAG = `trb${stamp}`
let sql = null
let WS = null
let WS2 = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Rows ${who}`, email, password: 'Rows@12345!', organizationName: `Rows ${who} ${stamp}`, organizationSlug: `rows-${who}-${stamp}` })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    const [u] = await sql`select id from users where email = ${email}`
    return { id: u.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const outsider = await person('outsider', null)
  const M = member.as
  const O = outsider.as

  /** A space, its project and list, and a task of `as`'s in it. */
  const place = async (as, ws, name, extra = {}) => {
    const space = await as('/spaces', { method: 'POST', body: { workspaceId: ws, name: `${TAG} ${name}`, ...extra } })
    const project = await as('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await as('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const task = await as('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} task`, description: `${TAG} the old words of ${name}` } })
    if (task.status >= 300 || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(space)} ${said(project)} ${said(list)} ${said(task)}`)
    return { space: space.data.id, task: task.data.id }
  }
  const OPEN = await place(A, WS, 'open')
  const PRIV = await place(A, WS, 'private', { visibility: 'private' })
  const VIEW = await place(A, WS, 'view', { defaultPermission: 'view' })
  const ws2 = await O('/workspaces', { method: 'POST', body: { name: `${TAG} the outsider's` } })
  if (ws2.status >= 300 || !ws2.data?.id) throw new Error(`could not make the outsider's workspace: ${said(ws2)}`)
  WS2 = ws2.data.id
  const THEIRS = await place(O, WS2, 'the outsider’s own')

  const checklist = async (task, title) => {
    const r = await A(`/tasks/${task}/checklists`, { method: 'POST', body: { title: `${TAG} ${title}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make the checklist ${title}: ${said(r)}`)
    return r.data.id
  }
  const item = async (task, cid, content) => {
    const r = await A(`/tasks/${task}/checklists/${cid}/items`, { method: 'POST', body: { content: `${TAG} ${content}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not add the item ${content}: ${said(r)}`)
    return r.data.id
  }
  const C1 = await checklist(OPEN.task, 'C1')
  const I1 = await item(OPEN.task, C1, 'I1')
  const I2 = await item(OPEN.task, C1, 'I2')
  const I3 = await item(OPEN.task, C1, 'I3')
  const I4 = await item(OPEN.task, C1, 'I4')
  const C2 = await checklist(OPEN.task, 'C2')
  const C3 = await checklist(OPEN.task, 'C3')
  const CP = await checklist(PRIV.task, 'CP')
  await item(PRIV.task, CP, 'a private item')
  const CV = await checklist(VIEW.task, 'CV')
  const IV = await item(VIEW.task, CV, 'IV')
  const theirs = await O(`/tasks/${THEIRS.task}/checklists`, { method: 'POST', body: { title: `${TAG} the outsider's checklist` } })
  const OC = theirs.data?.id
  if (!OC) throw new Error(`could not make the outsider's checklist: ${said(theirs)}`)
  const comment = async (task, body) => {
    const r = await A(`/tasks/${task}/comments`, { method: 'POST', body: { body: `${TAG} ${body}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not comment: ${said(r)}`)
    return r.data.id
  }
  const K1 = await comment(OPEN.task, 'on the open task')
  const KV = await comment(VIEW.task, 'on the view-only task')
  for (const t of [OPEN.task, PRIV.task]) await A(`/tasks/${t}`, { method: 'PATCH', body: { description: `${TAG} new words` } })
  const TY = (await A(`/workspaces/${WS}/task-types`, { method: 'POST', body: { name: `${TAG} type` } })).data?.id
  const TPL = (await A(`/workspaces/${WS}/checklist-templates`, { method: 'POST', body: { name: `${TAG} template`, items: ['one'] } })).data?.id
  if (!TY || !TPL) throw new Error(`could not make the type (${TY}) or the template (${TPL})`)
  for (const t of [PRIV.task, VIEW.task]) await A(`/tasks/${t}/task-type`, { method: 'PATCH', body: { taskTypeId: TY } })

  const cl = async (id) => (await sql`select task_id, title from task_checklists where id = ${id}`)[0] ?? null
  const it = async (id) => (await sql`select checklist_id, content, is_done from task_checklist_items where id = ${id}`)[0] ?? null
  const itemsSaying = async (content) => (await sql`select count(*)::int as n from task_checklist_items where content = ${content}`)[0].n
  const checklistsOn = async (task) => (await sql`select count(*)::int as n from task_checklists where task_id = ${task}`)[0].n
  const typeOf = async (task) => (await sql`select task_type_id from tasks where id = ${task}`)[0]?.task_type_id ?? null
  const reactions = async (commentId, userId) => (await sql`select count(*)::int as n from task_comment_reactions where comment_id = ${commentId} and user_id = ${userId}`)[0].n

  // ══ 1. ANOTHER ORGANISATION'S CHECKLISTS ═════════════════════════════════
  console.log('\n▶ somebody from another organisation, naming a task of their own, at the admin’s checklists')
  const on = `/tasks/${THEIRS.task}/checklists`
  const o = {
    rename: await O(`${on}/${C1}`, { method: 'PATCH', body: { title: `${TAG} renamed by the outsider` } }),
    add: await O(`${on}/${C1}/items`, { method: 'POST', body: { content: `${TAG} the outsider's item` } }),
    tick: await O(`${on}/items/${I1}`, { method: 'PATCH', body: { content: `${TAG} edited by the outsider`, isDone: true } }),
    move: await O(`${on}/items/${I2}`, { method: 'PATCH', body: { checklistId: OC } }),
    dropItem: await O(`${on}/items/${I3}`, { method: 'DELETE' }),
    dropList: await O(`${on}/${C3}`, { method: 'DELETE' }),
  }
  const after1 = {
    c1: await cl(C1), i1: await it(I1), i2: await it(I2), i3: await it(I3), c3: await cl(C3),
    added: await itemsSaying(`${TAG} the outsider's item`),
  }
  // The admin, on their own task, does the same through the same routes.
  const own = `/tasks/${OPEN.task}/checklists`
  const a = {
    rename: await A(`${own}/${C2}`, { method: 'PATCH', body: { title: `${TAG} C2 renamed` } }),
    add: await A(`${own}/${C2}/items`, { method: 'POST', body: { content: `${TAG} the admin's item` } }),
    tick: await A(`${own}/items/${I4}`, { method: 'PATCH', body: { isDone: true } }),
  }
  const [c2, i4, adminAdded] = [await cl(C2), await it(I4), await itemsSaying(`${TAG} the admin's item`)]
  chk(
    Object.values(o).every((r) => r.status === 404)
      && after1.c1?.title === `${TAG} C1` && after1.i1?.content === `${TAG} I1` && after1.i1?.is_done === false
      && after1.i2?.checklist_id === C1 && after1.i3 !== null && after1.c3 !== null && after1.added === 0
      && a.rename.status === 200 && c2?.title === `${TAG} C2 renamed` && a.add.status === 201 && adminAdded === 1 && a.tick.status === 200 && i4?.is_done === true,
    'somebody from another organisation, naming a task of their own, changes no checklist of another’s — no rename, no item added, edited, ticked, moved into theirs or deleted, no checklist deleted (404 each, all unchanged) — while the admin, on their own task, renames, adds and ticks',
    `the outsider: ${Object.entries(o).map(([k, r]) => `${k} ${r.status}`).join(', ')}; now ${JSON.stringify(after1)}; the admin: rename ${said(a.rename)} "${c2?.title}", add ${said(a.add)} ${adminAdded}, tick ${said(a.tick)} ${i4?.is_done}`,
  )

  // ══ 2. AN ITEM'S UPDATE CHANGES AN ITEM'S FIELDS ═════════════════════════
  console.log('\n▶ the admin updates an item with a `checklistId` in the body')
  const moved = await A(`${own}/items/${I2}`, { method: 'PATCH', body: { content: `${TAG} I2 renamed`, checklistId: C2 } })
  const i2 = await it(I2)
  chk(
    moved.status === 200 && i2?.content === `${TAG} I2 renamed` && i2?.checklist_id === C1,
    'an item’s update changes an item’s own fields, and a `checklistId` in the body moves it nowhere — its words change, its checklist stays',
    `${said(moved)}; now ${JSON.stringify(i2)} (its checklist ${i2?.checklist_id === C1 ? 'C1' : i2?.checklist_id === C2 ? 'C2' : i2?.checklist_id})`,
  )

  // ══ 3. REACTIONS ═════════════════════════════════════════════════════════
  console.log('\n▶ reactions: the outsider’s, through their own task; the member’s in a view-only space and in an open one')
  const oReact = await O(`/tasks/${THEIRS.task}/comments/${K1}/reactions`, { method: 'POST', body: { emoji: '👍' } })
  const vReact = await M(`/tasks/${VIEW.task}/comments/${KV}/reactions`, { method: 'POST', body: { emoji: '👍' } })
  const mReact = await M(`/tasks/${OPEN.task}/comments/${K1}/reactions`, { method: 'POST', body: { emoji: '🎉' } })
  const [oN, vN, mN] = [await reactions(K1, outsider.id), await reactions(KV, member.id), await reactions(K1, member.id)]
  chk(
    oReact.status === 404 && oN === 0 && vReact.status === 403 && vN === 0 && mReact.status === 201 && mN === 1,
    'a reaction is to a comment on the task named, by somebody who may comment there: the outsider’s through their own task is not found, and a view-only member’s refused — none written — while a member reacts in an open space',
    `the outsider ${said(oReact)}, written ${oN}; view-only ${said(vReact)}, ${vN}; open ${said(mReact)}, ${mN}`,
  )

  // ══ 4. OLD DESCRIPTIONS ══════════════════════════════════════════════════
  console.log('\n▶ a task’s old descriptions')
  const holds = (res, name) => JSON.stringify(res.data ?? null).includes(`${TAG} the old words of ${name}`)
  const oHist = await O(`/tasks/${OPEN.task}/description-history`)
  const pHist = await M(`/tasks/${PRIV.task}/description-history`)
  const mHist = await M(`/tasks/${OPEN.task}/description-history`)
  chk(
    refused(oHist) && !holds(oHist, 'open') && refused(pHist) && !holds(pHist, 'private') && mHist.status === 200 && holds(mHist, 'open'),
    'a task’s old descriptions are read as the task is: not by somebody from another organisation, nor by a member refused its private space — while a member reads an open task’s',
    `the outsider ${oHist.status} (the old words ${holds(oHist, 'open')}); the private task ${pHist.status} (${holds(pHist, 'private')}); the open one ${mHist.status} (${holds(mHist, 'open')})`,
  )

  // ══ 5. A PRIVATE SPACE'S TASK, THROUGH ITS OTHER ROUTES ══════════════════
  console.log('\n▶ a member refused a private space, at its task through templates, its type, a reminder and a calendar push; and at an open task')
  const soon = new Date(Date.now() + 86_400_000).toISOString()
  const tplsBefore = (await sql`select count(*)::int as n from checklist_templates where workspace_id = ${WS}`)[0].n
  const p = {
    template: await M(`/checklists/${CP}/save-as-template`, { method: 'POST', body: { name: `${TAG} from the private checklist` } }),
    apply: await M(`/tasks/${PRIV.task}/checklists/from-template/${TPL}`, { method: 'POST' }),
    type: await M(`/tasks/${PRIV.task}/task-type`, { method: 'PATCH', body: { taskTypeId: null } }),
    remind: await M(`/workspaces/${WS}/reminders`, { method: 'POST', body: { taskId: PRIV.task, remindAt: soon } }),
    push: await M(`/workspaces/${WS}/calendar-sync/tasks/${PRIV.task}/push`, { method: 'POST' }),
  }
  const afterP = {
    templates: (await sql`select count(*)::int as n from checklist_templates where workspace_id = ${WS}`)[0].n - tplsBefore,
    checklists: await checklistsOn(PRIV.task),
    type: (await typeOf(PRIV.task)) === TY ? 'kept' : 'changed',
    reminders: (await sql`select count(*)::int as n from reminders where task_id = ${PRIV.task}`)[0].n,
    titleTold: JSON.stringify(p.remind.data ?? null).includes('private task'),
  }
  const c = {
    template: await M(`/checklists/${C1}/save-as-template`, { method: 'POST', body: { name: `${TAG} from the open checklist` } }),
    apply: await M(`/tasks/${OPEN.task}/checklists/from-template/${TPL}`, { method: 'POST' }),
    type: await M(`/tasks/${OPEN.task}/task-type`, { method: 'PATCH', body: { taskTypeId: TY } }),
    remind: await M(`/workspaces/${WS}/reminders`, { method: 'POST', body: { taskId: OPEN.task, remindAt: soon } }),
    push: await M(`/workspaces/${WS}/calendar-sync/tasks/${OPEN.task}/push`, { method: 'POST' }),
  }
  chk(
    Object.values(p).every(refused) && afterP.templates === 0 && afterP.checklists === 1 && afterP.type === 'kept' && afterP.reminders === 0 && !afterP.titleTold
      && Object.values(c).every((r) => r.status < 300) && (await typeOf(OPEN.task)) === TY,
    'a member refused a private space reaches none of its tasks through their other routes — no template from a checklist there, no checklist from a template, no type changed, no reminder and no title told, no calendar push — while on an open task each goes through',
    `the private task: ${Object.entries(p).map(([k, r]) => `${k} ${r.status}`).join(', ')}; after ${JSON.stringify(afterP)}; the open one: ${Object.entries(c).map(([k, r]) => `${k} ${r.status}`).join(', ')}`,
  )

  // ══ 6. A VIEW-ONLY SPACE ═════════════════════════════════════════════════
  console.log('\n▶ a member in a view-only space, at its task’s checklists and type; and in an open space')
  const v = {
    make: await M(`/tasks/${VIEW.task}/checklists`, { method: 'POST', body: { title: `${TAG} the viewer's checklist` } }),
    tick: await M(`/tasks/${VIEW.task}/checklists/items/${IV}`, { method: 'PATCH', body: { isDone: true } }),
    type: await M(`/tasks/${VIEW.task}/task-type`, { method: 'PATCH', body: { taskTypeId: null } }),
  }
  const afterV = { checklists: await checklistsOn(VIEW.task), ticked: (await it(IV))?.is_done, type: (await typeOf(VIEW.task)) === TY ? 'kept' : 'changed' }
  const e = {
    make: await M(`/tasks/${OPEN.task}/checklists`, { method: 'POST', body: { title: `${TAG} the member's checklist` } }),
    tick: await M(`/tasks/${OPEN.task}/checklists/items/${I1}`, { method: 'PATCH', body: { isDone: true } }),
  }
  chk(
    Object.values(v).every((r) => r.status === 403) && afterV.checklists === 1 && afterV.ticked === false && afterV.type === 'kept'
      && e.make.status === 201 && e.tick.status === 200 && (await it(I1))?.is_done === true,
    'a member in a view-only space changes none of a task’s checklists or its type there (403, unchanged) — where in an open space they make a checklist and tick an item',
    `view-only: ${Object.entries(v).map(([k, r]) => `${k} ${said(r)}`).join(', ')}; after ${JSON.stringify(afterV)}; open: make ${e.make.status}, tick ${e.tick.status}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  if (WS2 && sql) await sql`delete from workspaces where id = ${WS2}`.catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
