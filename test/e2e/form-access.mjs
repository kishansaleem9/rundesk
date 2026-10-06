/**
 * A FORM IS ITS WORKSPACE'S, AND FILES ITS TASKS ONLY WHERE ITS MAKER COULD.
 *
 * NOT A FRAME ROW: `found-24-sep/forms-open-across-workspaces`. Every route
 * that names a form by id took the id alone: the guard checked the caller's
 * membership of the workspace in the PATH, and the service acted on whatever
 * form the id named — another organisation's included, its submissions (what
 * strangers typed into it) among them. A field or a submission was taken by
 * its own id, without asking whose form it was. And a form files tasks: its
 * target list was never checked against its maker, and the list a submitter
 * picked in a routing field was taken as sent, not from the field's options —
 * so a form, or an anonymous submission to one, filed tasks into a private
 * list its maker was refused, and a guest, who may not make tasks, made them.
 *
 * And the other way round: a form made in another organisation's workspace,
 * aimed at a list of this one. Only the list rule's own workspace stands in the
 * way there — the space's create gate lets through anyone who is not a member
 * of the space's workspace, since it has no level to read for them.
 *
 * And a list in the trash, which takes no task (`ListInTrashException`,
 * `found-5-oct/default-list-files-into-an-archived-list`): a form files its
 * submissions' tasks itself, past `createTask` and its gate, so found by the
 * review, a public submission to a form whose list had been deleted made its
 * task there, and a form was made aimed at a list already in the trash (201).
 *
 * Two organisations; forms and fields made through the API as the admin,
 * submissions through the public route; every refusal read back by SQL beside
 * the same call succeeding for someone it is theirs to make.
 *
 *   node test/e2e/form-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

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

/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const refused = (status) => status === 403 || status === 404
const anon = apiAs(null)

const stamp = Date.now()
const TAG = `fma${stamp}`
let sql = null
let WS = null
let THEIRS = null
let A = null
let O = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const signUp = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Former ${who}`, email, password: 'Former@12345!',
      organizationName: `Former ${who} ${stamp}`, organizationSlug: `former-${who}-${stamp}`,
    })
    return { id: signed.user?.id, email, as: apiAs(signed.accessToken) }
  }
  // Somebody of ANOTHER organisation, in a workspace of their own.
  const outsider = await signUp('outsider')
  O = outsider.as
  const theirs = await O('/workspaces', { method: 'POST', body: { name: `${TAG} theirs` } })
  if (!theirs.ok || !theirs.data?.id) throw new Error(`the outsider could not make a workspace: ${theirs.status}`)
  THEIRS = theirs.data.id
  // A member of this workspace, and a guest.
  const join = async (who, role) => {
    const p = await signUp(who)
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: p.email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${added.status}`)
    return p
  }
  const member = await join('member', 'member')
  const guest = await join('guest', 'guest')
  const M = member.as
  const G = guest.as

  // An open list, and a private list of a private space the member is not in.
  const place = async (name, visibility) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(visibility ? { visibility } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const [list] = await sql`insert into lists (project_id, name) values (${project.data?.id}, ${`${TAG} ${name} list`}) returning id`
    return list.id
  }
  const OPEN = await place('open')
  const HIDDEN = await place('private', 'private')
  const tasksIn = async (listId) => (await sql`select count(*)::int as n from tasks where list_id = ${listId}`)[0].n

  // The admin's form, routed to the open list, with a field.
  const form = await A(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} the form`, targetListId: OPEN, isPublic: true } })
  if (!form.ok || !form.data?.id) throw new Error(`could not make the form: ${form.status}`)
  const FORM = form.data.id
  const field = await A(`/workspaces/${WS}/forms/${FORM}/fields`, { method: 'POST', body: { type: 'short_text', label: `${TAG} name` } })
  const FIELD = field.data?.id
  await anon(`/forms/${form.data.slug}/submit`, { method: 'POST', body: { data: { [FIELD]: `${TAG} typedbyavisitor` } } })
  const formRow = async () => (await sql`select title, is_enabled, is_archived from forms where id = ${FORM}`)[0] ?? null

  // ══ 1. ANOTHER ORGANISATION, BY ID ═══════════════════════════════════════
  console.log('\n▶ the form, asked for by id through the outsider’s own workspace')
  const via = (path) => `/workspaces/${THEIRS}/forms/${FORM}${path}`
  const o = {
    read: await O(via('')),
    submissions: await O(via('/submissions')),
    rename: await O(via(''), { method: 'PATCH', body: { title: `${TAG} renamedbyoutsider` } }),
    field: await O(via('/fields'), { method: 'POST', body: { type: 'short_text', label: `${TAG} planted` } }),
    duplicate: await O(via('/duplicate'), { method: 'POST', body: {} }),
    archive: await O(via('/archive'), { method: 'PATCH', body: {} }),
  }
  const after = await formRow()
  const planted = (await sql`select count(*)::int as n from form_fields where form_id = ${FORM} and label = ${`${TAG} planted`}`)[0].n
  const copies = (await sql`select count(*)::int as n from forms where title like ${`%${TAG} the form%`}`)[0].n
  const aRead = await A(`/workspaces/${WS}/forms/${FORM}/submissions`)
  const leaked = JSON.stringify(o.submissions.data ?? null).includes('typedbyavisitor') || JSON.stringify(o.read.data ?? null).includes(`${TAG} the form`)
  chk(
    Object.values(o).every((r) => refused(r.status)) && !leaked && after?.title === `${TAG} the form` && !after?.is_archived
      && planted === 0 && copies === 1 && JSON.stringify(aRead.data ?? null).includes('typedbyavisitor'),
    'a form is not found through another organisation’s workspace — not read, its submissions not listed, not renamed, given a field, copied or archived (all unchanged) — and its own admin reads the submission',
    `the outsider: ${JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, r]) => [k, r.status])))}, leaked ${leaked}; the form "${after?.title}", archived ${after?.is_archived}; planted fields ${planted}; copies ${copies}; the admin's submissions name it ${JSON.stringify(aRead.data ?? null).includes('typedbyavisitor')}`,
  )

  // ══ 2. A FIELD OF ANOTHER FORM ═══════════════════════════════════════════
  console.log('\n▶ a field of the form, named under another form of the member’s own')
  const mine = await M(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} the member's form`, targetListId: OPEN } })
  const MINE = mine.data?.id
  const relabel = await O(`/workspaces/${THEIRS}/forms/${FORM}/fields/${FIELD}`, { method: 'PATCH', body: { label: `${TAG} relabelled` } })
  const crossField = await M(`/workspaces/${WS}/forms/${MINE}/fields/${FIELD}`, { method: 'DELETE' })
  const fieldRow = (await sql`select label from form_fields where id = ${FIELD}`)[0] ?? null
  // And a field of the member's OWN form, patched with a body naming the admin's form.
  const own = MINE ? await M(`/workspaces/${WS}/forms/${MINE}/fields`, { method: 'POST', body: { type: 'short_text', label: `${TAG} theirown` } }) : { data: null }
  const moved = own.data?.id ? await M(`/workspaces/${WS}/forms/${MINE}/fields/${own.data.id}`, { method: 'PATCH', body: { label: `${TAG} theirown`, formId: FORM } }) : { status: 0 }
  const ownRow = own.data?.id ? (await sql`select form_id from form_fields where id = ${own.data.id}`)[0] ?? null : null
  chk(
    Boolean(MINE) && refused(relabel.status) && refused(crossField.status) && fieldRow?.label === `${TAG} name`
      && moved.ok && ownRow?.form_id === MINE,
    'a field is changed only under its own form, in its own workspace — relabelled from another organisation, or deleted under another form, it is not found and stays; and a body naming another form does not move one onto it',
    `the member's form ${mine.status}; relabelled from outside ${relabel.status}; deleted under the member's form ${crossField.status}; the field is ${JSON.stringify(fieldRow?.label ?? null)}; the member's own field patched with the admin's form ${moved.status}, on ${ownRow?.form_id === MINE ? 'their form' : ownRow?.form_id === FORM ? 'THE ADMIN’S FORM' : JSON.stringify(ownRow)}`,
  )

  // ══ 3. A TARGET LIST ITS MAKER IS REFUSED ════════════════════════════════
  console.log('\n▶ the member makes a form routed to the private list they are refused, and one to the open list')
  const intoHidden = await M(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} into hidden`, targetListId: HIDDEN, isPublic: true } })
  const retarget = MINE ? await M(`/workspaces/${WS}/forms/${MINE}`, { method: 'PATCH', body: { targetListId: HIDDEN } }) : { status: 0 }
  const hiddenForms = (await sql`select count(*)::int as n from forms where workspace_id = ${WS} and target_list_id = ${HIDDEN}`)[0].n
  const intoOpen = await M(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} into open`, targetListId: OPEN, isPublic: true } })
  chk(
    refused(intoHidden.status) && refused(retarget.status) && hiddenForms === 0 && intoOpen.ok,
    'a member routes no form, new or changed, to a list they are refused (none made or moved) — one to an open list they may add to is made',
    `made into the private list ${intoHidden.status}; changed to it ${retarget.status}; forms routed there ${hiddenForms}; made into the open list ${intoOpen.status}`,
  )

  // ══ 4. A ROUTING ANSWER THE FIELD DOES NOT OFFER ═════════════════════════
  console.log('\n▶ a submission routed, by a field that offers the open list, to the private one')
  const router = await A(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} routed`, isPublic: true } })
  const routeField = await A(`/workspaces/${WS}/forms/${router.data?.id}/fields`, {
    method: 'POST',
    body: { type: 'dropdown', label: `${TAG} where`, taskField: 'targetListId', options: [{ label: 'Open', value: `list:${OPEN}` }] },
  })
  const before = { open: await tasksIn(OPEN), hidden: await tasksIn(HIDDEN) }
  const offside = await anon(`/forms/${router.data?.slug}/submit`, { method: 'POST', body: { data: { [routeField.data?.id]: `list:${HIDDEN}` } } })
  const onside = await anon(`/forms/${router.data?.slug}/submit`, { method: 'POST', body: { data: { [routeField.data?.id]: `list:${OPEN}` } } })
  const afterRoute = { open: await tasksIn(OPEN), hidden: await tasksIn(HIDDEN) }
  chk(
    offside.status >= 400 && afterRoute.hidden === before.hidden && onside.ok && afterRoute.open === before.open + 1,
    'a submission is filed only where the routing field offers — naming a list it does not offer, the private one, it is refused and files nothing; naming the one it offers, it files a task there',
    `the field ${routeField.status}; routed off its options ${offside.status}, private list ${before.hidden} → ${afterRoute.hidden}; routed as offered ${onside.status}, open list ${before.open} → ${afterRoute.open}`,
  )

  // ══ 5. A ROUTING FIELD THAT OFFERS A REFUSED LIST ════════════════════════
  console.log('\n▶ the member’s routing field, offering the private list')
  const offering = MINE
    ? await M(`/workspaces/${WS}/forms/${MINE}/fields`, {
        method: 'POST',
        body: { type: 'dropdown', label: `${TAG} offers hidden`, taskField: 'targetListId', options: [{ label: 'Hidden', value: `list:${HIDDEN}` }] },
      })
    : { status: 0 }
  const offeringRows = (await sql`select count(*)::int as n from form_fields where label = ${`${TAG} offers hidden`}`)[0].n
  // A routing field a submitter TYPES into would take any list id they typed.
  const typed = MINE
    ? await M(`/workspaces/${WS}/forms/${MINE}/fields`, { method: 'POST', body: { type: 'short_text', label: `${TAG} typed route`, taskField: 'targetListId' } })
    : { status: 0 }
  const typedRows = (await sql`select count(*)::int as n from form_fields where label = ${`${TAG} typed route`}`)[0].n
  chk(
    refused(offering.status) && offeringRows === 0 && typed.status === 400 && typedRows === 0,
    'a member’s routing field may not offer a list they are refused, nor be one a submitter types into (none made)',
    `offering the private list ${offering.status}, made ${offeringRows}; a typed routing field ${typed.status}, made ${typedRows}`,
  )

  // ══ 6. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, who may not make tasks, and has no form shared with them')
  const gList = await G(`/workspaces/${WS}/forms`)
  const gMade = await G(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} by the guest`, targetListId: OPEN, isPublic: true } })
  const gRows = (await sql`select count(*)::int as n from forms where title = ${`${TAG} by the guest`}`)[0].n
  const gRead = await G(`/workspaces/${WS}/forms/${FORM}/submissions`)
  chk(
    gList.status === 200 && !JSON.stringify(gList.data ?? null).includes(`${TAG} the form`) && gMade.status === 403 && gRows === 0 && refused(gRead.status),
    'a guest is listed no form, makes none (403, none made), and reads no form’s submissions',
    `the list ${gList.status}, naming the form ${JSON.stringify(gList.data ?? null).includes(`${TAG} the form`)}; made ${gMade.status} (${gRows}); submissions ${gRead.status}`,
  )

  // ══ 7. ANOTHER ORGANISATION'S FORM, AIMED HERE ════════════════════════════
  console.log('\n▶ a form the outsider makes in their own workspace, aimed at a list of this one')
  const oSpace = await O('/spaces', { method: 'POST', body: { workspaceId: THEIRS, name: `${TAG} their space` } })
  const oProject = await O('/projects', { method: 'POST', body: { spaceId: oSpace.data?.id, name: `${TAG} their project` } })
  const [ownList] = await sql`insert into lists (project_id, name) values (${oProject.data?.id}, ${`${TAG} their list`}) returning id`
  const aimedHere = await O(`/workspaces/${THEIRS}/forms`, { method: 'POST', body: { title: `${TAG} aimed here`, targetListId: OPEN, isPublic: true } })
  const aimedHome = await O(`/workspaces/${THEIRS}/forms`, { method: 'POST', body: { title: `${TAG} aimed home`, targetListId: ownList.id, isPublic: true } })
  const turned = aimedHome.data?.id
    ? await O(`/workspaces/${THEIRS}/forms/${aimedHome.data.id}`, { method: 'PATCH', body: { targetListId: OPEN } })
    : { status: 0 }
  const pointedHere = (await sql`select count(*)::int as n from forms where workspace_id = ${THEIRS} and target_list_id = ${OPEN}`)[0].n
  const homeRow = (await sql`select target_list_id from forms where title = ${`${TAG} aimed home`}`)[0] ?? null
  chk(
    refused(aimedHere.status) && refused(turned.status) && pointedHere === 0 && aimedHome.ok && homeRow?.target_list_id === ownList.id,
    'a form made in another organisation’s workspace files nothing here: aimed at this workspace’s list, made or changed to it, it is not found and none points at it — aimed at their own list, it is made',
    `made aimed here ${aimedHere.status}; changed to aim here ${turned.status}; their forms aimed here ${pointedHere}; made aimed at their own list ${aimedHome.status}, aimed at ${homeRow?.target_list_id === ownList.id ? 'their list' : JSON.stringify(homeRow?.target_list_id ?? null)}`,
  )

  // ══ 8. A SUBMISSION, THE FORM'S LIST DELETED ═════════════════════════════
  console.log('\n▶ a public submission to a form whose list has been deleted into the trash')
  const IN_TRASH = 'This list is in the trash. Restore it from Trash before adding tasks to it.'
  const DOOMED = await place('to delete')
  const doomedForm = await A(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} files into the doomed list`, targetListId: DOOMED, isPublic: true } })
  if (!doomedForm.ok || !doomedForm.data?.slug) throw new Error(`could not make the form for the list to delete: ${doomedForm.status}`)
  const binned = await A(`/lists/${DOOMED}`, { method: 'DELETE' })
  if (!binned.ok) throw new Error(`could not delete the list: ${binned.status}`)
  const beforeTrash = await tasksIn(DOOMED)
  const intoTrash = await anon(`/forms/${doomedForm.data.slug}/submit`, { method: 'POST', body: { data: {} } })
  const afterTrash = await tasksIn(DOOMED)
  const [kept] = await sql`select created_task_id, data->'__routingMeta'->'latest'->>'message' as error from form_submissions where form_id = ${doomedForm.data.id}`
  chk(
    intoTrash.ok && intoTrash.data?.createdTaskId === null && afterTrash === beforeTrash && kept && kept.created_task_id === null && kept.error === IN_TRASH,
    'a public submission to a form whose list is in the trash files no task there — the submission is kept, with its routing error saying the list is in the trash',
    `submitted ${intoTrash.status}, task ${JSON.stringify(intoTrash.data?.createdTaskId ?? null)}; tasks in the deleted list ${beforeTrash} → ${afterTrash}; the submission ${JSON.stringify(kept ?? null)}`,
  )

  // ══ 9. A FORM AIMED AT A DELETED LIST ════════════════════════════════════
  console.log('\n▶ a form made, and one changed, to aim at the deleted list')
  const aimedAtTrash = await A(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} aimed at the trash`, targetListId: DOOMED, isPublic: true } })
  const turnedToTrash = await A(`/workspaces/${WS}/forms/${FORM}`, { method: 'PATCH', body: { targetListId: DOOMED } })
  const [{ n: aimedRows }] = await sql`select count(*)::int as n from forms where target_list_id = ${DOOMED} and id <> ${doomedForm.data.id}`
  chk(
    aimedAtTrash.status === 409 && aimedAtTrash.error?.message === IN_TRASH && turnedToTrash.status === 409 && aimedRows === 0,
    'and no form is made, or changed, to aim at a list in the trash — 409 saying so, none aimed there',
    `made ${aimedAtTrash.status} ${JSON.stringify(aimedAtTrash.error?.message ?? null)}; changed ${turnedToTrash.status}; other forms aimed there ${aimedRows}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  if (THEIRS && O) {
    const gone = await O(`/workspaces/${THEIRS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${THEIRS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
