/**
 * FULL EDIT MAKES AND DELETES; EDIT CHANGES AND ARCHIVES; A SPACE IS FULL EDIT
 * UNLESS TOLD OTHERWISE.
 *
 * NOT A FRAME ROW, BUT A FRAME: `06:52` shows the space wizard's "Default
 * permission  Full edit ▾" (`found-25-sep/full-edit-enforced-nowhere`). The
 * share panel and the wizard both offered Full edit, and no rule asked for it:
 * measured on lane 5, a member holding Edit — a task shared at Edit, a space
 * role, a project role — sent tasks to the Trash (201), which the share panel
 * calls "the only level that may delete the item"; the wizard preselected Edit.
 *
 * ClickUp (help centre, "Permissions in detail", search snippets): Edit changes
 * every task (status, assignees, title, ClickApps), archives, moves, merges and
 * duplicates; Full edit adds creating tasks and deleting them. The permissions
 * spec (`docs/share-and-permissions-spec.md`): Full edit is `admin`, and a
 * public location defaults to it.
 *
 *   node test/e2e/full-edit-levels.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 8

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
const TAG = `fel${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
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

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — grants are planted, and what is made and deleted read back, by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Levels@12345!'
  const signed = await signUpApi(API, { fullName: 'Level member', email, password, organizationName: `Level ${stamp}`, organizationSlug: `level-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  /** A space (at `level`, or none said), its project and list, and tasks of the admin's in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} place: ${said(space)} ${said(project)} ${said(list)}`)
    const task = async (title) => {
      const t = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} ${title}` } })
      if (t.status >= 300 || !t.data?.id) throw new Error(`could not make "${title}": ${said(t)}`)
      return { id: t.data.id, title: `${TAG} ${name} ${title}`, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${t.data.id}` }
    }
    return { space: space.data.id, level: space.data.defaultPermission, project: project.data.id, list: list.data.id, task }
  }
  const FULL = await place('said nothing')
  const EDITS = await place('edit', 'edit')
  const VIEW = await place('view with grants', 'view')
  const ROLE = await place('view with a space role', 'view')
  const PROJ = await place('view with a project role', 'view')
  const row = async (id) => (await sql`select title, is_archived, deleted_at from tasks where id = ${id}`)[0] ?? null
  const binned = async (id) => (await row(id))?.deleted_at != null
  const titled = async (listId, title) => (await sql`select count(*)::int as n from tasks where list_id = ${listId} and title = ${title}`)[0].n
  const listsNamed = async (name) => (await sql`select count(*)::int as n from lists where name = ${name}`)[0].n
  const trash = (t) => M(`/tasks/${t.id}/trash`, { method: 'POST' })
  const retitle = (t, title) => M(`/tasks/${t.id}`, { method: 'PATCH', body: { title } })

  // ══ 1. THE DEFAULT ═══════════════════════════════════════════════════════
  console.log('\n▶ a space made without a level, and the wizard as it opens')
  const [stored] = await sql`select default_permission from spaces where id = ${FULL.space}`
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/${FULL.space}/${FULL.project}/${FULL.list}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('create-tab-space').click({ timeout: 8000 }).catch(() => {})
  const select = page.getByTestId('space-wizard-permission')
  await select.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const preselected = await select.inputValue().catch(() => null)
  // A closed select shows its selected option's label — and only while the select itself is shown.
  const shown = await select.filter({ visible: true }).evaluate((el) => el.selectedOptions?.[0]?.textContent ?? null, undefined, { timeout: 5000 }).catch(() => null)
  await page.keyboard.press('Escape').catch(() => {})
  chk(
    FULL.level === 'admin' && stored?.default_permission === 'admin' && preselected === 'admin' && shown === 'Full edit',
    'a space is Full edit unless told otherwise: made without a level it is `admin`, stored so, and the wizard opens on "Full edit"',
    `the API answered ${JSON.stringify(FULL.level)}, stored ${JSON.stringify(stored?.default_permission)}; the wizard ${JSON.stringify(preselected)} "${shown}"`,
  )

  // ══ 2. A SPACE WHOSE DEFAULT IS EDIT ═════════════════════════════════════
  console.log('\n▶ the member, in a space whose default is Edit and in a Full edit one')
  const eChange = await EDITS.task('changed')
  const eArchive = await EDITS.task('archived')
  const eDelete = await EDITS.task('not deleted')
  const e = {
    change: await retitle(eChange, `${TAG} edit changed by the member`),
    archive: await M(`/tasks/${eArchive.id}`, { method: 'DELETE' }),
    add: await M('/tasks', { method: 'POST', body: { listId: EDITS.list, title: `${TAG} edit added by the member` } }),
    list: await M('/lists', { method: 'POST', body: { projectId: EDITS.project, name: `${TAG} edit list by the member` } }),
    del: await trash(eDelete),
  }
  const eAfter = {
    changed: (await row(eChange.id))?.title === `${TAG} edit changed by the member`,
    archived: (await row(eArchive.id))?.is_archived === true,
    added: await titled(EDITS.list, `${TAG} edit added by the member`),
    lists: await listsNamed(`${TAG} edit list by the member`),
    binned: await binned(eDelete.id),
  }
  const fDelete = await FULL.task('deleted')
  const f = {
    add: await M('/tasks', { method: 'POST', body: { listId: FULL.list, title: `${TAG} full added by the member` } }),
    list: await M('/lists', { method: 'POST', body: { projectId: FULL.project, name: `${TAG} full list by the member` } }),
    del: await trash(fDelete),
  }
  const fAfter = {
    added: await titled(FULL.list, `${TAG} full added by the member`),
    lists: await listsNamed(`${TAG} full list by the member`),
    binned: await binned(fDelete.id),
  }
  chk(
    e.change.status === 200 && eAfter.changed && e.archive.status === 200 && eAfter.archived
      && e.add.status === 403 && eAfter.added === 0 && e.list.status === 403 && eAfter.lists === 0 && e.del.status === 403 && !eAfter.binned
      && f.add.status === 201 && fAfter.added === 1 && f.list.status === 201 && fAfter.lists === 1 && f.del.status < 300 && fAfter.binned,
    'where a space’s default is Edit a member changes the admin’s task and archives one, and adds no task or list and deletes no task (403 each, none made, none in the Trash) — in a Full edit space they add and delete',
    `edit: ${Object.entries(e).map(([k, r]) => `${k} ${r.status}`).join(', ')}, after ${JSON.stringify(eAfter)}; full: ${Object.entries(f).map(([k, r]) => `${k} ${r.status}`).join(', ')}, after ${JSON.stringify(fAfter)}`,
  )

  // ══ 3. GRANTS AT EDIT, AND ONE AT FULL EDIT ══════════════════════════════
  console.log('\n▶ grants at Edit — a task shared, a space role, a project role — and a task shared at Full edit, in view-only spaces')
  const vShared = await VIEW.task('shared at edit')
  const vFull = await VIEW.task('shared at full edit')
  const rTask = await ROLE.task('under a space role')
  const pTask = await PROJ.task('under a project role')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'task', ${vShared.id}, ${me.id}, 'edit'), (${WS}, 'task', ${vFull.id}, ${me.id}, 'admin')`
  await sql`insert into space_members (space_id, user_id, role) values (${ROLE.space}, ${me.id}, 'edit')`
  const role = await A(`/projects/${PROJ.project}/members`, { method: 'POST', body: { userId: me.id, role: 'edit' } })
  if (role.status >= 300) throw new Error(`could not give the project role: ${said(role)}`)
  const g = {}
  for (const [k, t] of Object.entries({ share: vShared, space: rTask, project: pTask })) {
    g[k] = { change: await retitle(t, `${t.title} changed`), del: await trash(t) }
    g[k].after = { changed: (await row(t.id))?.title === `${t.title} changed`, binned: await binned(t.id) }
  }
  const full = await trash(vFull)
  const fullBinned = await binned(vFull.id)
  chk(
    Object.values(g).every((x) => x.change.status === 200 && x.after.changed && x.del.status === 403 && !x.after.binned)
      && full.status < 300 && fullBinned,
    'a grant at Edit — a task shared at Edit, a space role of Edit, a project role of Edit — changes a task and deletes none (403, not in the Trash); a task shared at Full edit is deleted',
    `${Object.entries(g).map(([k, x]) => `${k}: change ${x.change.status}, delete ${said(x.del)}, ${JSON.stringify(x.after)}`).join('; ')}; full edit: ${said(full)}, in the Trash ${fullBinned}`,
  )

  // ══ 4. WHAT THE REFUSAL SAYS ═════════════════════════════════════════════
  console.log('\n▶ what the refusals say')
  const says = (res, words) => typeof res.error?.message === 'string' && res.error.message.includes(words)
  chk(
    says(e.add, 'does not allow adding a task') && says(e.list, 'does not allow adding a list') && says(e.del, 'does not allow deleting its tasks')
      && says(g.share.del, 'What is shared with you here is "Edit"') && says(g.project.del, 'Your access to this project is "Edit"'),
    'a refusal says what was refused and what gave the level: adding a task or a list, deleting a task — by the space’s default, a share, a project role',
    `add ${said(e.add)}; list ${said(e.list)}; delete ${said(e.del)}; shared ${said(g.share.del)}; project ${said(g.project.del)}`,
  )

  // ══ 5. THE SHEET ═════════════════════════════════════════════════════════
  console.log('\n▶ the sheet, as the member: a task shared at Edit and one at Full edit')
  const vShared2 = await VIEW.task('shared at edit, in the sheet')
  const vFull2 = await VIEW.task('shared at full edit, in the sheet')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'task', ${vShared2.id}, ${me.id}, 'edit'), (${WS}, 'task', ${vFull2.id}, ${me.id}, 'admin')`
  const caps = { edit: (await M(`/tasks/${vShared2.id}/capabilities`)).data, full: (await M(`/tasks/${vFull2.id}/capabilities`)).data }
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const mp = await ctx2.newPage()
  await mp.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await mp.fill('input[type=email]', email)
  await mp.fill('input[type=password]', password)
  await mp.click('button[type=submit]')
  await mp.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await mp.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const menu = async (t) => {
    await mp.goto(`${B}${t.url}`, { waitUntil: 'domcontentloaded' })
    await mp.getByTestId('task-more-menu').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await mp.waitForTimeout(2000)
    await mp.getByTestId('task-more-menu').click({ timeout: 5000 }).catch(() => {})
    await mp.waitForTimeout(500)
    const out = {
      archive: await mp.getByTestId('task-menu-archive').isVisible().catch(() => false),
      remove: await mp.getByTestId('task-menu-delete').isVisible().catch(() => false),
    }
    await mp.keyboard.press('Escape').catch(() => {})
    return out
  }
  const sEdit = await menu(vShared2)
  const sFull = await menu(vFull2)
  chk(
    caps.edit?.edit === true && caps.edit?.full === false && caps.full?.full === true
      && sEdit.archive && !sEdit.remove && sFull.archive && sFull.remove,
    'the sheet offers Delete only with Full edit: on a task shared at Edit its menu has Archive and not Delete, on one shared at Full edit both — as the API answers',
    `caps ${JSON.stringify(caps)}; the menu at Edit ${JSON.stringify(sEdit)}, at Full edit ${JSON.stringify(sFull)}`,
  )

  // ══ 6. WHERE THE MEMBER IS OFFERED TO ADD ════════════════════════════════
  console.log('\n▶ the spaces the "+" and the Move picker offer the member')
  const writable = await M(`/spaces/workspace/${WS}/writable`)
  const moveTo = await M(`/spaces/workspace/${WS}/move-targets`)
  const ids = (res) => (Array.isArray(res.data) ? res.data : []).map((x) => (typeof x === 'string' ? x : x.id))
  const [w, mt] = [ids(writable), ids(moveTo)]
  chk(
    writable.status === 200 && w.includes(FULL.space) && !w.includes(EDITS.space) && moveTo.status === 200 && mt.includes(FULL.space) && !mt.includes(EDITS.space),
    'the "+" and the Move picker offer the member the Full edit space to add to, and not the space whose default is Edit',
    `writable ${writable.status}: full ${w.includes(FULL.space)}, edit ${w.includes(EDITS.space)}; move targets ${moveTo.status}: full ${mt.includes(FULL.space)}, edit ${mt.includes(EDITS.space)}`,
  )

  // ══ 7. A LIST OF THEIR OWN ═══════════════════════════════════════════════
  console.log('\n▶ the member deletes a list they made, in the Edit space and in the Full edit one')
  const [ownEdit] = await sql`insert into lists (project_id, name, created_by_id) values (${EDITS.project}, ${`${TAG} the member's list in edit`}, ${me.id}) returning id`
  const [ownFull] = await sql`insert into lists (project_id, name, created_by_id) values (${FULL.project}, ${`${TAG} the member's list in full edit`}, ${me.id}) returning id`
  const lEdit = await M(`/lists/${ownEdit.id}`, { method: 'DELETE' })
  const lFull = await M(`/lists/${ownFull.id}`, { method: 'DELETE' })
  const listGone = async (id) => (await sql`select is_archived from lists where id = ${id}`)[0]?.is_archived === true
  const [goneEdit, goneFull] = [await listGone(ownEdit.id), await listGone(ownFull.id)]
  chk(
    lEdit.status === 403 && !goneEdit && says(lEdit, 'does not allow deleting this list') && lFull.status < 300 && goneFull,
    'a member deletes a list of their own only with Full edit: in the space whose default is Edit it stays (403, and the refusal says deleting), in the Full edit space it goes',
    `edit ${said(lEdit)}, deleted ${goneEdit}; full edit ${said(lFull)}, deleted ${goneFull}`,
  )

  // ══ 8. A DOC ═════════════════════════════════════════════════════════════
  // Docs are ClickUp's exception: Edit archives and deletes a Doc
  // (found-28-sep/doc-archive-and-delete-at-two-levels), so the line a doc
  // draws is between Comment and Edit, which `doc-trash-level` measures.
  console.log('\n▶ docs of the admin’s in the view-only space, shared with the member at Edit and at Full edit')
  const adminId = (await A('/users/me')).data?.id
  const doc = async (title) => (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${VIEW.space}, ${`${TAG} ${title}`}, ${adminId}) returning id`)[0].id
  const dEdit = await doc('doc shared at edit')
  const dFull = await doc('doc shared at full edit')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'doc', ${dEdit}, ${me.id}, 'edit'), (${WS}, 'doc', ${dFull}, ${me.id}, 'admin')`
  const dRename = await M(`/docs/${dEdit}`, { method: 'PATCH', body: { title: `${TAG} doc renamed at edit` } })
  const dDelEdit = await M(`/docs/${dEdit}`, { method: 'DELETE' })
  const dDelFull = await M(`/docs/${dFull}`, { method: 'DELETE' })
  const docRow = async (id) => (await sql`select title, is_archived from docs where id = ${id}`)[0] ?? null
  const [rEdit, rFull] = [await docRow(dEdit), await docRow(dFull)]
  chk(
    dRename.status === 200 && rEdit?.title === `${TAG} doc renamed at edit` && dDelEdit.status < 300 && rEdit?.is_archived === true
      && dDelFull.status < 300 && rFull?.is_archived === true,
    'a doc shared at Edit is renamed and deleted, as ClickUp’s Edit deletes a Doc, and one shared at Full edit is deleted too — in a space that is view-only for the member',
    `edit: rename ${said(dRename)}, delete ${said(dDelEdit)}, now ${JSON.stringify(rEdit)}; full edit: delete ${said(dDelFull)}, now ${JSON.stringify(rFull)}`,
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
