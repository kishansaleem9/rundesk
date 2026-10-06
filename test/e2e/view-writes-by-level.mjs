/**
 * A LIST'S SHARED VIEWS ARE CHANGED BY THOSE WHO MAY EDIT THEM, AND DELETED AT
 * FULL EDIT; A READER'S PRIVATE VIEW STAYS THEIRS; THE PAGE OFFERS ONLY WHAT
 * ITS READER MAY DO.
 *
 * NOT A FRAME ROW: `found-5-oct/readers-change-shared-views`, found by the
 * triage beside `found-25-sep/view-only-individual-permissions`. Measured on 5
 * October: in a space whose default is View only, a plain member and a guest
 * with the list shared at View each renamed and reconfigured the admin's views
 * (200), deleted them (200), made a view of their own (201) and made it the
 * list's default (200); on a list with no views, the member's first view was
 * saved shared and default, and the admin's list opened on it — while the same
 * member was refused a task's title on that list (403). The view menu offered
 * Update, Rename, Make default and Delete on every view to everybody.
 *
 * And measured closing it, on lane 6: a share on one view was read by its
 * share panel and not by its writes; a member at Edit, refused trashing a task,
 * deleted the list's default view for good; views made at once on an empty
 * list, or made default at once, left it several defaults; and the Customize
 * panel offered Private on the default view, which the server refuses.
 *
 * ClickUp (help centre, read through search excerpts): "To create views, you
 * must have Edit or Full edit permissions to the List, Subfolder, Folder, or
 * Space where the view is created" ("Views feature availability and limits");
 * creating views is off by default for view-only users and guests ("Manage
 * individual permissions for view only users"); "Guests with Full access to a
 * Folder, Subfolder, or List can delete views in it" ("Delete a view"); a
 * person given Full edit on a view "can save changes, protect and unprotect,
 * share, and delete the view", Limited "can only view, duplicate, and favorite
 * the view" ("Protect a view").
 *
 * What the readers change is read back by SQL. One fixture is written by SQL:
 * a private view as the list's default, which the API made before it counted
 * only shared views for the default and no longer can.
 *
 *   node test/e2e/view-writes-by-level.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 20

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
const TAG = `vwl${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what the readers change is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'ViewWrites@12345!'
    const signed = await signUpApi(API, { fullName: `Views ${who}`, email, password, organizationName: `Views ${who} ${stamp}`, organizationSlug: `views-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { email, password, id: row?.id, api: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  // A workspace manager, who is no super-admin: the suite's admin is one, and
  // every view rule lets a super-admin past before it asks anything.
  const manager = await person('manager', 'manager')

  /** A space at `level`, its project and a list, with the admin's views on it (the first is the list's default). */
  const place = async (name, level, viewNames) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, defaultPermission: level } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    const views = []
    for (const v of viewNames) {
      const made = await A(`/lists/${list.data.id}/views`, { method: 'POST', body: { name: `${TAG} ${name} ${v}`, type: 'list', config: { groupBy: 'status' } } })
      if (!made.ok || !made.data?.id) throw new Error(`could not make the admin's "${name} ${v}" view: ${said(made)}`)
      views.push({ id: made.data.id, name: `${TAG} ${name} ${v}` })
    }
    return { space: space.data.id, project: project.data.id, list: list.data.id, views, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const VIEW = await place('view', 'view', ['main', 'second', 'third'])
  const COMMENT = await place('comment', 'comment', ['main', 'second'])
  const EDIT = await place('edit', 'edit', ['main', 'second', 'third'])
  const FULL = await place('full', 'admin', ['main', 'second', 'third'])
  const NARROW = await place('narrow', 'edit', ['main', 'second'])
  const WIDE = await place('wide', 'view', ['main', 'second'])
  const EMPTY = await A('/lists', { method: 'POST', body: { projectId: VIEW.project, name: `${TAG} empty` } })
  if (!EMPTY.ok || !EMPTY.data?.id) throw new Error(`could not make the empty list: ${said(EMPTY)}`)
  for (const [listId, level] of [[VIEW.list, 'view'], [EDIT.list, 'edit'], [FULL.list, 'admin']]) {
    const shared = await A(`/shares/list/${listId}`, { method: 'POST', body: { email: guest.email, level } })
    if (!shared.ok) throw new Error(`could not share a list with the guest at ${level}: ${said(shared)}`)
  }
  /** The list's views as stored: what nobody but its editors may change. */
  const stored = async (listId) =>
    (await sql`select id, name, config, is_pinned, is_default, visibility, created_by_id from task_views where list_id = ${listId} order by created_at`)
      .map((r) => ({ id: r.id, name: r.name, config: JSON.stringify(r.config), pinned: r.is_pinned, isDefault: r.is_default, visibility: r.visibility, by: r.created_by_id }))
  const before = JSON.stringify(await stored(VIEW.list))

  // ══ 1. A READER CHANGES NO SHARED VIEW ═══════════════════════════════════
  console.log('\n▶ a member of a view-only space and a guest with a view share, on the admin’s views')
  const [main, second, third] = VIEW.views
  const tries = {}
  for (const [who, P, words] of [['member', member, /^This space's default permission is "View only", which does not allow /], ['guest', guest, /^What is shared with you here is "View only", which does not allow /]]) {
    const rename = await P.api(`/views/${second.id}`, { method: 'PATCH', body: { name: `${TAG} renamed by the ${who}`, config: { groupBy: 'priority' } } })
    const pin = await P.api(`/views/${third.id}`, { method: 'PATCH', body: { isPinned: true } })
    const def = await P.api(`/views/${second.id}`, { method: 'PATCH', body: { isDefault: true } })
    const del = await P.api(`/views/${third.id}`, { method: 'DELETE' })
    tries[who] = {
      refused: [rename, pin, def, del].every((r) => r.status === 403),
      inWords: [rename, pin, def].every((r) => words.test(r.message) && r.message.endsWith('changing its shared views'))
        && words.test(del.message) && del.message.endsWith('deleting its shared views'),
      said: [rename, pin, def, del].map(said),
    }
  }
  const after1 = JSON.stringify(await stored(VIEW.list))
  chk(
    tries.member.refused && tries.member.inWords && tries.guest.refused && tries.guest.inWords && after1 === before,
    'a member of a view-only space and a guest with a view share are refused every change to the list’s shared views — their name and layout, a pin, the list’s default, deleting one — in the level’s words (403), and the views are as the admin left them',
    `member ${JSON.stringify(tries.member)}; guest ${JSON.stringify(tries.guest)}; the views ${after1 === before ? 'unchanged' : `changed: ${after1}`}`,
  )

  // ══ 2. NOR MAKES ONE ═════════════════════════════════════════════════════
  console.log('\n▶ the same two, making a view everybody would share')
  const makes = {}
  for (const [who, P] of [['member', member], ['guest', guest]]) {
    const unsaid = await P.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} ${who} unsaid`, type: 'board' } })
    const guarded = await P.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} ${who} protected`, type: 'board', visibility: 'protected' } })
    makes[who] = { unsaid: said(unsaid), guarded: said(guarded), ok: [unsaid, guarded].every((r) => r.status === 403 && r.message.endsWith('does not allow adding a shared view')) }
  }
  // Against the views as section 1 left them, so this says only what making one did.
  const after2 = JSON.stringify(await stored(VIEW.list))
  chk(
    makes.member.ok && makes.guest.ok && after2 === after1,
    'neither makes a view everybody shares: one said protected, or not said, is refused in the level’s words (403) and nothing is saved',
    `member ${JSON.stringify(makes.member)}; guest ${JSON.stringify(makes.guest)}; the views ${after2 === after1 ? 'unchanged' : `changed: ${after2}`}`,
  )

  // ══ 3. A READER'S PRIVATE VIEW STAYS THEIRS ══════════════════════════════
  console.log('\n▶ a reader’s own private view')
  const own = {}
  for (const [who, P] of [['member', member], ['guest', guest]]) {
    const made = await P.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} ${who} private`, type: 'list', visibility: 'private' } })
    const id = made.data?.id
    const rename = id ? await P.api(`/views/${id}`, { method: 'PATCH', body: { name: `${TAG} ${who} private renamed`, config: { groupBy: 'priority' } } }) : { status: 0, message: 'not made' }
    const publish = id ? await P.api(`/views/${id}`, { method: 'PATCH', body: { visibility: 'everyone' } }) : { status: 0, message: 'not made' }
    const [row] = id ? await sql`select name, visibility, is_default from task_views where id = ${id}` : []
    const del = id ? await P.api(`/views/${id}`, { method: 'DELETE' }) : { status: 0, message: 'not made' }
    const [gone] = id ? await sql`select count(*)::int as n from task_views where id = ${id}` : [{ n: -1 }]
    own[who] = {
      ok: made.status === 201 && made.data?.isDefault === false && rename.status === 200 && publish.status === 403
        && publish.message.endsWith('does not allow adding a shared view') && row?.name === `${TAG} ${who} private renamed`
        && row?.visibility === 'private' && row?.is_default === false && del.status === 200 && gone.n === 0,
      said: { made: said(made), rename: said(rename), publish: said(publish), del: said(del), row, gone: gone.n },
    }
  }
  // One the member keeps, for the page below.
  const kept = await member.api(`/lists/${VIEW.list}/views`, { method: 'POST', body: { name: `${TAG} member keeps`, type: 'list', visibility: 'private', config: { groupBy: 'status' } } })
  if (!kept.ok || !kept.data?.id) throw new Error(`the member could not keep a private view: ${said(kept)}`)
  chk(
    own.member.ok && own.guest.ok,
    'a reader’s own private view stays theirs: they make it, rename it and change its layout, and delete it; it is never the list’s default, and making it shared is refused (403)',
    `member ${JSON.stringify(own.member.said)}; guest ${JSON.stringify(own.guest.said)}`,
  )

  // ══ 4. THE LIST'S DEFAULT IS NOT A READER'S ══════════════════════════════
  console.log('\n▶ an empty list: a reader’s private view, then the admin’s first view')
  const first = await member.api(`/lists/${EMPTY.data.id}/views`, { method: 'POST', body: { name: `${TAG} member first`, type: 'list', visibility: 'private' } })
  const adminFirst = await A(`/lists/${EMPTY.data.id}/views`, { method: 'POST', body: { name: `${TAG} admin first`, type: 'list' } })
  const defaults = (await stored(EMPTY.data.id)).filter((v) => v.isDefault).map((v) => v.name)
  chk(
    first.status === 201 && first.data?.isDefault === false && adminFirst.data?.isDefault === true
      && defaults.length === 1 && defaults[0] === `${TAG} admin first`,
    'on an empty list a reader’s private view does not take the list’s default, and the admin’s first view, shared, does',
    `the member's ${said(first)} default ${first.data?.isDefault}; the admin's ${said(adminFirst)} default ${adminFirst.data?.isDefault}; the list's defaults ${JSON.stringify(defaults)}`,
  )

  // ══ 5. COMMENT, AND EDIT ═════════════════════════════════════════════════
  console.log('\n▶ a member where the default is Comment, and where it is Edit')
  const cBefore = JSON.stringify(await stored(COMMENT.list))
  const c = {
    make: await member.api(`/lists/${COMMENT.list}/views`, { method: 'POST', body: { name: `${TAG} comment own`, type: 'list' } }),
    rename: await member.api(`/views/${COMMENT.views[1].id}`, { method: 'PATCH', body: { name: `${TAG} comment renamed` } }),
    del: await member.api(`/views/${COMMENT.views[1].id}`, { method: 'DELETE' }),
  }
  const cAfter = JSON.stringify(await stored(COMMENT.list))
  const e = {
    make: await member.api(`/lists/${EDIT.list}/views`, { method: 'POST', body: { name: `${TAG} edit own`, type: 'list' } }),
    rename: await member.api(`/views/${EDIT.views[1].id}`, { method: 'PATCH', body: { name: `${TAG} edit second renamed` } }),
    def: await member.api(`/views/${EDIT.views[1].id}`, { method: 'PATCH', body: { isDefault: true } }),
  }
  const eRows = await stored(EDIT.list)
  const eSecond = eRows.find((v) => v.id === EDIT.views[1].id)
  // The member's own shared view there, for the page below.
  const ownEdit = e.make.data?.id ? { id: e.make.data.id, name: `${TAG} edit own` } : null
  chk(
    Object.values(c).every((r) => r.status === 403 && /^This space's default permission is "Comment", which does not allow /.test(r.message)) && cAfter === cBefore
      && e.make.status === 201 && e.rename.status === 200 && e.def.status === 200 && !!ownEdit
      && eSecond?.name === `${TAG} edit second renamed` && eSecond?.isDefault === true && eRows.filter((v) => v.isDefault).length === 1,
    'a member at Comment is refused the same, in its words (403), and where the default is Edit a member makes, renames and defaults the list’s shared views',
    `Comment ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, r]) => [k, said(r)])))}, the views ${cAfter === cBefore ? 'unchanged' : 'changed'}; Edit ${JSON.stringify(Object.fromEntries(Object.entries(e).map(([k, r]) => [k, said(r)])))}, the second ${JSON.stringify(eSecond)}`,
  )

  // ══ 6. DELETING ONE TAKES FULL EDIT ══════════════════════════════════════
  console.log('\n▶ deleting a shared view: at Edit, and at Full edit')
  const del6 = {
    member: await member.api(`/views/${EDIT.views[2].id}`, { method: 'DELETE' }),
    guest: await guest.api(`/views/${EDIT.views[2].id}`, { method: 'DELETE' }),
    memberFull: await member.api(`/views/${FULL.views[1].id}`, { method: 'DELETE' }),
    guestFull: await guest.api(`/views/${FULL.views[2].id}`, { method: 'DELETE' }),
  }
  const editIds = (await stored(EDIT.list)).map((v) => v.id)
  const fullIds = (await stored(FULL.list)).map((v) => v.id)
  chk(
    del6.member.status === 403 && del6.member.message === 'This space\'s default permission is "Edit", which does not allow deleting its shared views'
      && del6.guest.status === 403 && del6.guest.message === 'What is shared with you here is "Edit", which does not allow deleting its shared views'
      && editIds.includes(EDIT.views[2].id)
      && del6.memberFull.status === 200 && del6.guestFull.status === 200
      && !fullIds.includes(FULL.views[1].id) && !fullIds.includes(FULL.views[2].id),
    'deleting a shared view takes Full edit: a member where the default is Edit and a guest with an Edit share are refused in their level’s words (403) and the view stays, and where the default is Full edit the member deletes one, as does a guest the list is shared with at Full edit',
    `${JSON.stringify(Object.fromEntries(Object.entries(del6).map(([k, r]) => [k, said(r)])))}; the Edit list still holds it: ${editIds.includes(EDIT.views[2].id)}; the Full edit list ${JSON.stringify(fullIds)}`,
  )

  // ══ 7. WHAT THE API SAYS MAY BE DONE ═════════════════════════════════════
  console.log('\n▶ what the API answers the member and the guest: the list’s, and each view’s')
  const capsOf = async (P, listId) => (await P.api(`/tasks/list/${listId}/capabilities`)).data?.views
  const caps = { member: await capsOf(member, VIEW.list), guest: await capsOf(guest, VIEW.list), comment: await capsOf(member, COMMENT.list), edit: await capsOf(member, EDIT.list) }
  const offersOf = async (P, listId) => (await P.api(`/lists/${listId}/views`)).data ?? []
  const pick = (v) => v && { change: v.mayChange, delete: v.mayDelete, makeDefault: v.mayMakeDefault, visibility: v.mayChangeVisibility, makePrivate: v.mayMakePrivate }
  const mv = await offersOf(member, VIEW.list)
  const gv = await offersOf(guest, VIEW.list)
  const ev = await offersOf(member, EDIT.list)
  const fv = await offersOf(member, FULL.list)
  const none = { change: false, delete: false, makeDefault: false, visibility: false, makePrivate: false }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // The admin's views as the list holds them now, whatever sections 1 and 2 left of them.
  const adminsIn = (rows) => rows.filter((r) => r.createdById !== member.id && r.createdById !== guest.id)
  const offers = {
    memberAdmins: adminsIn(mv).map(pick),
    guestAdmins: adminsIn(gv).map(pick),
    memberOwn: pick(mv.find((r) => r.id === kept.data.id)),
    editAdmin: pick(ev.find((r) => r.id === EDIT.views[0].id)),
    fullAdmin: pick(fv.find((r) => r.id === FULL.views[0].id)),
  }
  chk(
    caps.member === false && caps.guest === false && caps.comment === false && caps.edit === true
      && offers.memberAdmins.length > 0 && offers.memberAdmins.every((o) => same(o, none))
      && offers.guestAdmins.length > 0 && offers.guestAdmins.every((o) => same(o, none))
      && same(offers.memberOwn, { change: true, delete: true, makeDefault: false, visibility: false, makePrivate: false })
      && same(offers.editAdmin, { change: true, delete: false, makeDefault: true, visibility: false, makePrivate: false })
      && same(offers.fullAdmin, { change: true, delete: true, makeDefault: true, visibility: false, makePrivate: false }),
    'the API says who may add a shared view — not the view-only member, the guest or the commenter; the member at Edit — and, view by view, that a reader may change nothing of the admin’s and only their own private view, never as the default, and that deleting one is offered at Full edit, not at Edit',
    `may add a view: ${JSON.stringify(caps)}; per view ${JSON.stringify(offers)}`,
  )

  // ══ 8. A SHARE ON ONE VIEW HOLDS ITS HOLDER TO IT ════════════════════════
  console.log('\n▶ a member held to View on one view by a share on it, where the default is Edit')
  const narrowed = NARROW.views[1]
  const nShare = await A(`/shares/view/${narrowed.id}`, { method: 'POST', body: { email: member.email, level: 'view' } })
  const n8 = {
    rename: await member.api(`/views/${narrowed.id}`, { method: 'PATCH', body: { name: `${TAG} narrowed renamed`, config: { groupBy: 'priority' } } }),
    pin: await member.api(`/views/${narrowed.id}`, { method: 'PATCH', body: { isPinned: true } }),
    del: await member.api(`/views/${narrowed.id}`, { method: 'DELETE' }),
    other: await member.api(`/views/${NARROW.views[0].id}`, { method: 'PATCH', body: { name: `${TAG} narrow main renamed` } }),
  }
  const nOffers = await offersOf(member, NARROW.list)
  const nRow = (await stored(NARROW.list)).find((v) => v.id === narrowed.id)
  chk(
    nShare.status === 201
      && n8.rename.status === 403 && n8.rename.message === 'What is shared with you here is "View only", which does not allow changing its shared views'
      && n8.pin.status === 403
      && n8.del.status === 403 && n8.del.message === 'What is shared with you here is "View only", which does not allow deleting its shared views'
      && same(pick(nOffers.find((r) => r.id === narrowed.id)), none)
      && n8.other.status === 200 && pick(nOffers.find((r) => r.id === NARROW.views[0].id))?.change === true
      && nRow?.name === narrowed.name && nRow?.pinned === false,
    'a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change',
    `share ${said(nShare)}; ${JSON.stringify(Object.fromEntries(Object.entries(n8).map(([k, r]) => [k, said(r)])))}; offers ${JSON.stringify(nOffers.map(pick))}; the view ${JSON.stringify(nRow)}`,
  )

  // ══ 9. AND A FULL EDIT SHARE ON ONE VIEW OPENS IT ════════════════════════
  console.log('\n▶ a member given Full edit on one view of a view-only list by a share on it')
  const widened = WIDE.views[1]
  const wShare = await A(`/shares/view/${widened.id}`, { method: 'POST', body: { email: member.email, level: 'admin' } })
  const wOffers = await offersOf(member, WIDE.list)
  const w9 = {
    rename: await member.api(`/views/${widened.id}`, { method: 'PATCH', body: { name: `${TAG} widened renamed` } }),
    def: await member.api(`/views/${widened.id}`, { method: 'PATCH', body: { isDefault: true } }),
    other: await member.api(`/views/${WIDE.views[0].id}`, { method: 'PATCH', body: { name: `${TAG} wide main renamed` } }),
  }
  const wRows = await stored(WIDE.list)
  w9.del = await member.api(`/views/${widened.id}`, { method: 'DELETE' })
  const wGone = !(await stored(WIDE.list)).some((v) => v.id === widened.id)
  const wHeld = wRows.find((v) => v.id === widened.id)
  const wMain = wRows.find((v) => v.id === WIDE.views[0].id)
  chk(
    wShare.status === 201
      && same(pick(wOffers.find((r) => r.id === widened.id)), { change: true, delete: true, makeDefault: false, visibility: false, makePrivate: false })
      && same(pick(wOffers.find((r) => r.id === WIDE.views[0].id)), none)
      && w9.rename.status === 200 && wHeld?.name === `${TAG} widened renamed`
      && w9.def.status === 403 && w9.def.message === 'This space\'s default permission is "View only", which does not allow changing its default view'
      && wHeld?.isDefault === false && wMain?.isDefault === true && wMain?.name === WIDE.views[0].name
      && w9.other.status === 403
      && w9.del.status === 200 && wGone,
    'a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)',
    `share ${said(wShare)}; offers ${JSON.stringify(wOffers.map(pick))}; ${JSON.stringify(Object.fromEntries(Object.entries(w9).map(([k, r]) => [k, said(r)])))}; the views ${JSON.stringify(wRows)}; gone ${wGone}`,
  )

  // ══ 10. A MANAGER ════════════════════════════════════════════════════════
  console.log('\n▶ a workspace manager, on a member’s protected view and on their shared one')
  // Where the default is Full edit, so the member's two views are made whatever level a shared view asks.
  const guardedMade = await member.api(`/lists/${FULL.list}/views`, { method: 'POST', body: { name: `${TAG} full guarded`, type: 'list', visibility: 'protected' } })
  const openMade = await member.api(`/lists/${FULL.list}/views`, { method: 'POST', body: { name: `${TAG} full shared`, type: 'list' } })
  const guardedId = guardedMade.data?.id ?? null
  const mo = await offersOf(manager, FULL.list)
  const mRename = guardedId ? await manager.api(`/views/${guardedId}`, { method: 'PATCH', body: { name: `${TAG} guarded renamed by the manager` } }) : { status: 0, message: 'not made' }
  const [mRow] = guardedId ? await sql`select name from task_views where id = ${guardedId}` : []
  chk(
    guardedMade.status === 201 && openMade.status === 201
      && same(pick(mo.find((r) => r.id === guardedId)), { change: true, delete: true, makeDefault: true, visibility: true, makePrivate: true })
      && pick(mo.find((r) => r.id === openMade.data?.id))?.visibility === true
      && mRename.status === 200 && mRow?.name === `${TAG} guarded renamed by the manager`,
    'a workspace manager who is no super-admin is offered a member’s protected view to change, delete, default, unprotect or make private, and the member’s shared view to protect, and their rename of the protected one is saved',
    `made ${said(guardedMade)} and ${said(openMade)}; the manager is offered ${JSON.stringify(mo.map((r) => ({ name: r.name, ...pick(r) })))}; rename ${said(mRename)}, now ${JSON.stringify(mRow?.name)}`,
  )

  // ══ 11, 12. ONE DEFAULT, HOWEVER MANY ASK AT ONCE ════════════════════════
  console.log('\n▶ views made at once on an empty list, and Make default pressed at once')
  const atOnce = await A('/projects', { method: 'POST', body: { spaceId: EDIT.space, name: `${TAG} at once` } })
  if (!atOnce.ok || !atOnce.data?.id) throw new Error(`could not make the project for views made at once: ${said(atOnce)}`)
  const defaultsOn = async (listId) => (await sql`select count(*)::int as n from task_views where list_id = ${listId} and is_default`)[0].n
  const madeAtOnce = []
  for (let round = 0; round < 3; round++) {
    const l = await A('/lists', { method: 'POST', body: { projectId: atOnce.data.id, name: `${TAG} at once ${round}` } })
    if (!l.ok || !l.data?.id) throw new Error(`could not make an empty list: ${said(l)}`)
    const answers = await Promise.all(Array.from({ length: 6 }, (_, i) => A(`/lists/${l.data.id}/views`, { method: 'POST', body: { name: `${TAG} at once ${round}.${i}`, type: 'list' } })))
    madeAtOnce.push({ answered: answers.map((r) => r.status).join(','), defaults: await defaultsOn(l.data.id) })
  }
  chk(
    madeAtOnce.every((r) => r.answered === '201,201,201,201,201,201' && r.defaults === 1),
    'six views made at once on an empty list leave it one default view, three times over',
    JSON.stringify(madeAtOnce),
  )
  const md = await A('/lists', { method: 'POST', body: { projectId: atOnce.data.id, name: `${TAG} make default at once` } })
  if (!md.ok || !md.data?.id) throw new Error(`could not make the list for Make default: ${said(md)}`)
  const mdIds = []
  for (let i = 0; i < 4; i++) {
    const v = await A(`/lists/${md.data.id}/views`, { method: 'POST', body: { name: `${TAG} make default ${i}`, type: 'list' } })
    if (!v.ok || !v.data?.id) throw new Error(`could not make a view for Make default: ${said(v)}`)
    mdIds.push(v.data.id)
  }
  const pressedAtOnce = []
  for (let round = 0; round < 4; round++) {
    const answers = await Promise.all([1, 2, 3].map((k) => A(`/views/${mdIds[k]}`, { method: 'PATCH', body: { isDefault: true } })))
    pressedAtOnce.push({ answered: answers.map((r) => r.status).join(','), defaults: await defaultsOn(md.data.id) })
    const back = await A(`/views/${mdIds[0]}`, { method: 'PATCH', body: { isDefault: true } })
    if (back.status !== 200) throw new Error(`could not put the first view back as the default: ${said(back)}`)
  }
  chk(
    pressedAtOnce.every((r) => r.answered === '200,200,200' && r.defaults === 1),
    'Make default pressed on three views at once leaves the list one default view, four times over',
    JSON.stringify(pressedAtOnce),
  )

  // ══ 13. A PRIVATE DEFAULT GIVES WAY ══════════════════════════════════════
  console.log('\n▶ a private view the list was left on as its default, then the list’s first shared view')
  const legacy = await A('/lists', { method: 'POST', body: { projectId: atOnce.data.id, name: `${TAG} left on a private default` } })
  if (!legacy.ok || !legacy.data?.id) throw new Error(`could not make the list: ${said(legacy)}`)
  const leftPrivate = await member.api(`/lists/${legacy.data.id}/views`, { method: 'POST', body: { name: `${TAG} member private first`, type: 'list', visibility: 'private' } })
  if (!leftPrivate.ok || !leftPrivate.data?.id) throw new Error(`the member could not make their private view: ${said(leftPrivate)}`)
  // As the API left a list's first view when it was private, before it counted only shared views.
  await sql`update task_views set is_default = true where id = ${leftPrivate.data.id}`
  const firstShared = await A(`/lists/${legacy.data.id}/views`, { method: 'POST', body: { name: `${TAG} admin first shared`, type: 'list' } })
  const legacyDefaults = (await stored(legacy.data.id)).filter((v) => v.isDefault).map((v) => v.name)
  const renamedPrivate = await member.api(`/views/${leftPrivate.data.id}`, { method: 'PATCH', body: { name: `${TAG} member private renamed` } })
  chk(
    firstShared.status === 201 && firstShared.data?.isDefault === true
      && legacyDefaults.length === 1 && legacyDefaults[0] === `${TAG} admin first shared`
      && renamedPrivate.status === 200,
    'a private view the list was left on as its default gives the default up to the list’s first shared view, so the list holds one, and its maker may rename it again',
    `the first shared ${said(firstShared)} default ${firstShared.data?.isDefault}; the list's defaults ${JSON.stringify(legacyDefaults)}; the member's rename ${said(renamedPrivate)}`,
  )

  // ══ THE PAGE ═════════════════════════════════════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', member.email)
  await page.fill('input[type=password]', member.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const count = async (loc) => loc.count().catch(() => -1)
  /** Open the list on its default view, and wait for its tab strip to name the admin's views. */
  const open = async (p) => {
    await page.goto(`${B}${p.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`work-view-tab-view-${p.views[0].id}`).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2000)
  }
  /** The strip's own buttons: its tabs, and the + View beside them. */
  const strip = () => page.getByTestId('work-view-tab-type-list').locator('xpath=../..')
  const addView = () => strip().locator('button', { hasText: /^View$/ })
  const dots = (name) => page.getByRole('button', { name: `Actions for the "${name}" view` })
  /** Open a view's ⋯ and read what it offers, by the items' names. */
  const menuOf = async (name) => {
    if ((await count(dots(name))) === 0) return null
    await dots(name).first().click({ timeout: 5000 }).catch(() => {})
    const menu = page.getByRole('menu')
    await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    const items = await menu.getByRole('menuitem').filter({ visible: true }).allInnerTexts().catch(() => [])
    return items.map((s) => s.trim())
  }
  const closeMenu = async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByRole('menu').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
  }
  /** Open the Customize panel on the saved view the strip is on, and read which of its switches cannot be pressed. */
  const disabled = async (id) => page.getByTestId(id).isDisabled({ timeout: 5000 }).catch(() => null)
  const panelOn = async (viewId) => {
    await page.getByTestId(`work-view-tab-view-${viewId}`).click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(800)
    const panel = page.getByTestId('list-customize')
    if (!(await panel.evaluate((el) => el.open).catch(() => true))) await panel.locator('> summary').click({ timeout: 5000 }).catch(() => {})
    await page.getByTestId('list-view-settings').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    return {
      pin: await disabled('list-view-pin'),
      private: await disabled('list-view-private'),
      protect: await disabled('list-view-protect'),
      default: await disabled('list-view-default'),
      autosave: await disabled('list-view-autosave'),
    }
  }

  // ══ 14. A VIEW-ONLY LIST OFFERS NO WRITE TO ITS VIEWS ════════════════════
  console.log('\n▶ the page, in the view-only list: + View, Save view, and each view’s ⋯')
  await open(VIEW)
  // The admin's views by the names they have now, whatever sections 1 and 2 left of them.
  const adminNames = (await stored(VIEW.list)).filter((v) => v.by !== member.id && v.by !== guest.id).map((v) => v.name)
  const v14 = {
    tabs: await count(page.getByTestId(`work-view-tab-view-${main.id}`)),
    addView: await count(addView()),
    dots: await Promise.all(adminNames.map((name) => count(dots(name)))),
  }
  /*
   * A change of grouping — to one the view does not already have — makes the
   * view one with something to save: on the default view, then on a built-in
   * tab. Whether there was something to save is read too, from the control.
   */
  const regroup = async () => {
    const groupBy = page.getByTestId('list-group-by')
    const was = await groupBy.inputValue({ timeout: 5000 }).catch(() => null)
    await groupBy.selectOption(was === 'priority' ? 'assignee' : 'priority', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(800)
    const now = await groupBy.inputValue({ timeout: 5000 }).catch(() => null)
    return was !== null && now !== null && now !== was
  }
  v14.changedOnView = await regroup()
  v14.saveOnView = await count(page.getByTestId('list-save-view'))
  await page.getByTestId('work-view-tab-type-list').click({ timeout: 5000 }).catch(() => {})
  v14.changedOnTab = await regroup()
  v14.saveAsView = await count(page.getByTestId('list-save-view'))
  chk(
    v14.tabs === 1 && v14.addView === 0 && v14.dots.length > 0 && v14.dots.every((n) => n === 0)
      && v14.changedOnView && v14.saveOnView === 0 && v14.changedOnTab && v14.saveAsView === 0,
    'in a view-only list the page offers the member no + View, no ⋯ on the admin’s views — no Update, Rename, Make default or Delete — and no Save view once they change one, on a saved view or a built-in tab',
    JSON.stringify(v14),
  )

  // ══ 15. THEIR OWN PRIVATE VIEW ═══════════════════════════════════════════
  console.log('\n▶ the member’s own private view in that list')
  await open(VIEW)
  const ownMenu = await menuOf(`${TAG} member keeps`)
  await closeMenu()
  chk(
    Array.isArray(ownMenu) && ownMenu.includes('Update') && ownMenu.includes('Rename') && ownMenu.includes('Delete') && !ownMenu.includes('Default'),
    'their own private view’s ⋯ offers them Update, Rename and Delete, and not Make default, which a private view cannot be',
    JSON.stringify(ownMenu),
  )

  // ══ 16. THE CUSTOMIZE PANEL ══════════════════════════════════════════════
  console.log('\n▶ the Customize panel, on the admin’s second view')
  const p16 = await panelOn(second.id)
  chk(
    p16.pin === true && p16.private === true && p16.protect === true && p16.default === true && p16.autosave === false,
    'the Customize panel draws the admin’s view’s Pin, Private, Protect and Set as default for the member without letting them be pressed, and leaves them Autosave, their own',
    JSON.stringify(p16),
  )

  // ══ 17. WHERE THE DEFAULT IS EDIT ════════════════════════════════════════
  console.log('\n▶ the page where the default is Edit: + View, the ⋯, and a rename from it')
  await open(EDIT)
  // Since section 5 the member's renamed second view is the default; the admin's main is not.
  const editMain = EDIT.views[0]
  const e17 = { addView: await count(addView()), menu: await menuOf(editMain.name) }
  const renamed17 = `${TAG} main renamed from the page`
  page.once('dialog', (d) => d.accept(renamed17).catch(() => {}))
  await page.getByRole('menuitem', { name: /^Rename$/ }).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await closeMenu()
  const [r17] = await sql`select name from task_views where id = ${editMain.id}`
  chk(
    e17.addView === 1 && Array.isArray(e17.menu) && ['Update', 'Rename', 'Default'].every((s) => e17.menu.includes(s)) && !e17.menu.includes('Delete') && r17?.name === renamed17,
    'where the default is Edit the member is offered + View and each view’s ⋯ — Update, Rename, Make default, and not Delete, which takes Full edit — and a rename made from it is saved',
    `${JSON.stringify(e17)}; the view is now called ${JSON.stringify(r17?.name)}`,
  )

  // ══ 18. THE PANEL ON A VIEW OF THEIR OWN ═════════════════════════════════
  console.log('\n▶ the Customize panel on the member’s own view where the default is Edit: Pin, then Set as default')
  // A view id that names nothing when section 5 made none, so the reads below find nothing rather than throw.
  const ownEditId = ownEdit?.id ?? '00000000-0000-4000-8000-000000000000'
  const p18 = await panelOn(ownEditId)
  const rowOf = async (id) => (await sql`select is_pinned, is_default from task_views where id = ${id}`)[0] ?? null
  await page.getByTestId('list-view-pin').click({ timeout: 5000 }).catch(() => {})
  p18.pinned = await waitUntil(async () => (await rowOf(ownEditId))?.is_pinned === true, { timeoutMs: 8000 })
  await page.getByTestId('list-view-default').click({ timeout: 5000 }).catch(() => {})
  p18.defaulted = await waitUntil(async () => (await rowOf(ownEditId))?.is_default === true, { timeoutMs: 8000 })
  chk(
    p18.pin === false && p18.private === false && p18.protect === false && p18.default === false && p18.pinned && p18.defaulted,
    'on a view of their own where the default is Edit the Customize panel lets the member press Pin, Private, Protect and Set as default, and the pin and the default they press are saved',
    JSON.stringify(p18),
  )

  // ══ 19. BUT NOT PRIVATE ON THE DEFAULT ═══════════════════════════════════
  console.log('\n▶ the same view, now the list’s default: Private, and Protect')
  const p19 = {
    private: await waitUntil(async () => (await disabled('list-view-private')) === true, { timeoutMs: 8000 }),
    protect: await disabled('list-view-protect'),
  }
  const [r19] = await sql`select visibility, is_default from task_views where id = ${ownEditId}`
  chk(
    p19.private && p19.protect === false && r19?.is_default === true && r19?.visibility === 'everyone',
    'once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it',
    `${JSON.stringify(p19)}; the view ${JSON.stringify(r19)}`,
  )

  // ══ 20. A REFUSAL THE PAGE DID NOT FORESEE ═══════════════════════════════
  console.log('\n▶ the space’s default drops to View only while the page is open; a rename from the ⋯ it still draws')
  const lowered = await A(`/spaces/${EDIT.space}`, { method: 'PUT', body: { defaultPermission: 'view' } })
  if (!lowered.ok) throw new Error(`could not lower the Edit space: ${said(lowered)}`)
  // Its name now, whatever section 17 left it called, so this says only what the refused rename did.
  const [b20] = await sql`select name from task_views where id = ${editMain.id}`
  const menu20 = await menuOf(b20?.name ?? editMain.name)
  page.once('dialog', (d) => d.accept(`${TAG} renamed after the drop`).catch(() => {}))
  await page.getByRole('menuitem', { name: /^Rename$/ }).click({ timeout: 5000 }).catch(() => {})
  const words = page.getByText(/^This space's default permission is "View only", which does not allow changing its shared views$/).first()
  await words.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const toldWhy = await words.isVisible().catch(() => false)
  await closeMenu()
  const [r20] = await sql`select name from task_views where id = ${editMain.id}`
  chk(
    Array.isArray(menu20) && toldWhy && !!b20?.name && r20?.name === b20.name,
    'a rename the page still offered and the server refuses says why, in the server’s words, and saves nothing',
    `the menu ${JSON.stringify(menu20)}; the refusal said ${toldWhy}; the view was called ${JSON.stringify(b20?.name)} and is called ${JSON.stringify(r20?.name)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
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
