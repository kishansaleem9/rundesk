/**
 * DELETING A SPACE, A PROJECT OR A LIST SOMEBODY ELSE MADE ASKS ITS KEY, AFTER
 * FULL EDIT THERE — AND THE KEYS THAT GATE NOTHING LEAVE THE ROLE EDITOR.
 *
 * NOT A FRAME ROW: `found-23-sep/role-editor-offers-unenforced-permissions`,
 * its last group, the deletion keys. The editor offered Delete spaces, Delete
 * projects, Delete lists, Delete any task, Delete any doc and Publish docs
 * externally, and nothing asked any of them. Deleting a space somebody else
 * made was an admin's by role (`adminOnlyDelete`), a project or a list a
 * manager's in their own spaces and an admin's anywhere, a task or a doc the
 * level's, and publishing a doc was Edit on it. So a member granted
 * `list.delete` was refused (403) the lists it names, and a role granting
 * `doc.publish` gave what every member already held.
 *
 * ClickUp (help centre "Permissions FAQ", "Default user role permissions",
 * "Permissions in detail", from search snippets; the pages are not reachable
 * from here): deleting follows the location's level. Full edit deletes; Edit
 * changes and archives ("set the permissions for members in your List to edit
 * so they are prevented from deleting it, then select the permissions for each
 * task within the List to full edit, so they can delete tasks if needed").
 * Members and admins hold Full edit on public locations by default. Guests
 * never delete a Space. A Doc's level decides who deletes it, and guests never
 * share publicly. No custom-role permission named for deleting tasks or docs
 * could be confirmed.
 *
 * So the three container keys stay, each asked for deleting what somebody else
 * made and ANDed with Full edit there, in place of the role tests: a base role
 * keeps exactly what it had. `task.delete.any`, `doc.delete.any` and
 * `doc.publish` leave the catalog as `workspace.delete` did
 * (`retired-permission-keys`): a role saved while they were offered is
 * assigned as before and grants nothing for them. Deleting sends to the Trash,
 * so the editor no longer says "Permanently".
 *
 *   node test/e2e/container-delete-keys.mjs --api 3026 --dist /tmp/claude-0/dist-6
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 10

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const KEPT = ['space.delete', 'project.delete', 'list.delete']
const RETIRED = ['task.delete.any', 'doc.delete.any', 'doc.publish']

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cdk${stamp}`
const PASSWORD = 'DeleteKeys@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is deleted is read back, and the older role written, by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  /** A person in the workspace at `role`, granted `keys` by a custom role of their own. */
  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Deleter ${key}`, email, password: PASSWORD, organizationName: `Deleter ${key} ${stamp}`, organizationSlug: `deleter-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { key, id: signed.user?.id, email, memberId: row?.id, granted, as: apiAs(signed.accessToken) }
  }
  const maker = await person('maker', 'member')
  const plain = await person('plain', 'member')
  const lister = await person('lister', 'member', ['list.delete'])
  const projector = await person('projector', 'member', ['project.delete'])
  const spacer = await person('spacer', 'member', ['space.delete'])
  const manager = await person('manager', 'manager')
  const guest = await person('guest', 'guest', ['space.delete'])
  if (!maker.id || !manager.id || !guest.id) throw new Error('a sign-up answered with no user id')

  /** A space of the admin's (at `level`, or Full edit), and a project of the admin's in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name} project` } })
    if (!project.ok || !project.data?.id) throw new Error(`could not make the ${name} place: ${said(space)} ${said(project)}`)
    return { space: space.data.id, project: project.data.id }
  }
  /** A list in `project`, made by `who`. */
  const listOf = async (who, project, name) => {
    const list = await who.as('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the list "${name}": ${said(list)}`)
    return list.data.id
  }
  const projectOf = async (space, name) => {
    const project = await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} ${name}` } })
    if (!project.ok || !project.data?.id) throw new Error(`could not make the project "${name}": ${said(project)}`)
    return project.data.id
  }
  /** Deleted: sent to the Trash, which for a container is its archived flag (`trash.service.ts`). */
  const gone = async (table, id) => {
    const rows = table === 'lists' ? await sql`select is_archived from lists where id = ${id}`
      : table === 'projects' ? await sql`select is_archived from projects where id = ${id}`
        : await sql`select is_archived from spaces where id = ${id}`
    return rows[0]?.is_archived === true
  }
  /** Whether `who`'s own Trash lists `id` as deleted by them. */
  const inTrashOf = async (who, type, id) => {
    const res = await who.as(`/workspaces/${WS}/trash?types=${type}`)
    return (res.data?.items ?? []).some((i) => i.id === id && i.type === type && i.deletedBy?.id === who.id)
  }
  const refusedFor = (res, words) => res.status === 403 && typeof res.error?.message === 'string' && res.error.message.includes(words)
  const who = { lister: lister.granted, projector: projector.granted, spacer: spacer.granted }

  // ══ 1. A LIST ANOTHER MEMBER MADE ════════════════════════════════════════
  console.log('\n▶ a list the maker made in a Full edit space: the plain member, the project deleter, the list deleter')
  const FULL = await place('full edit')
  const makersList = await listOf(maker, FULL.project, 'the maker’s list')
  const l = {
    plain: await plain.as(`/lists/${makersList}`, { method: 'DELETE' }),
    projector: await projector.as(`/lists/${makersList}`, { method: 'DELETE' }),
  }
  const lStayed = !(await gone('lists', makersList))
  l.lister = await lister.as(`/lists/${makersList}`, { method: 'DELETE' })
  const lAfter = { gone: await gone('lists', makersList), trash: await inTrashOf(lister, 'list', makersList) }
  chk(
    l.plain.status === 403 && l.projector.status === 403 && lStayed && who.lister && l.lister.ok && lAfter.gone && lAfter.trash,
    'a member granted list.delete deletes a list another member made where they hold Full edit, and it is in their Trash — a plain member, and one granted only project.delete, are refused it (403) and it stays until then',
    `plain ${said(l.plain)}; project deleter ${said(l.projector)}; stayed ${lStayed}; list deleter ${who.lister ? said(l.lister) : 'NOT GRANTED'}, ${JSON.stringify(lAfter)}`,
  )

  // ══ 2. A PROJECT SOMEBODY ELSE MADE ══════════════════════════════════════
  console.log('\n▶ a project the admin made in the Full edit space: the plain member, the list deleter, the project deleter')
  const adminsProject = await projectOf(FULL.space, 'the admin’s project')
  const p = {
    plain: await plain.as(`/projects/${adminsProject}`, { method: 'DELETE' }),
    lister: await lister.as(`/projects/${adminsProject}`, { method: 'DELETE' }),
  }
  const pStayed = !(await gone('projects', adminsProject))
  p.projector = await projector.as(`/projects/${adminsProject}`, { method: 'DELETE' })
  const pAfter = { gone: await gone('projects', adminsProject), trash: await inTrashOf(projector, 'project', adminsProject) }
  chk(
    p.plain.status === 403 && p.lister.status === 403 && pStayed && who.projector && p.projector.ok && pAfter.gone && pAfter.trash,
    'a member granted project.delete deletes a project somebody else made where they hold Full edit, and it is in their Trash — a plain member, and one granted only list.delete, are refused it (403) and it stays until then',
    `plain ${said(p.plain)}; list deleter ${said(p.lister)}; stayed ${pStayed}; project deleter ${who.projector ? said(p.projector) : 'NOT GRANTED'}, ${JSON.stringify(pAfter)}`,
  )

  // ══ 3. A SPACE SOMEBODY ELSE MADE ════════════════════════════════════════
  // The manager belongs to the space, so only the key can refuse them.
  console.log('\n▶ a space the admin made: the plain member, the manager (who belongs to it), the space deleter')
  const doomed = await place('to be deleted')
  const joined = await A(`/spaces/${doomed.space}/members`, { method: 'POST', body: { userId: manager.id, role: 'edit' } })
  if (!joined.ok) throw new Error(`could not add the manager to the space: ${said(joined)}`)
  const s = {
    plain: await plain.as(`/spaces/${doomed.space}`, { method: 'DELETE' }),
    manager: await manager.as(`/spaces/${doomed.space}`, { method: 'DELETE' }),
  }
  const sStayed = !(await gone('spaces', doomed.space))
  s.spacer = await spacer.as(`/spaces/${doomed.space}`, { method: 'DELETE' })
  const sAfter = { gone: await gone('spaces', doomed.space), trash: await inTrashOf(spacer, 'space', doomed.space) }
  chk(
    s.plain.status === 403 && s.manager.status === 403 && sStayed && who.spacer && s.spacer.ok && sAfter.gone && sAfter.trash,
    'a member granted space.delete deletes a space somebody else made where they hold Full edit, and it is in their Trash — a plain member, and a manager who belongs to it but holds no space.delete, are refused it (403) and it stays until then',
    `plain ${said(s.plain)}; manager ${said(s.manager)}; stayed ${sStayed}; space deleter ${who.spacer ? said(s.spacer) : 'NOT GRANTED'}, ${JSON.stringify(sAfter)}`,
  )

  // ══ 3b. A GUEST NEVER DELETES A SPACE ════════════════════════════════════
  // ClickUp: "Guests cannot archive, unarchive, and delete any Space." The
  // space is shared with the guest at Full edit, which the list they make
  // there proves, and a custom role grants them space.delete: neither is
  // enough.
  console.log('\n▶ a guest granted space.delete, in a space shared with them at Full edit')
  const guestsSpace = await place('shared with the guest')
  const shared = await A(`/spaces/${guestsSpace.space}/members`, { method: 'POST', body: { userId: guest.id, role: 'admin' } })
  if (!shared.ok) throw new Error(`could not share the space with the guest: ${said(shared)}`)
  const guestList = await guest.as('/lists', { method: 'POST', body: { projectId: guestsSpace.project, name: `${TAG} the guest’s list` } })
  const g = await guest.as(`/spaces/${guestsSpace.space}`, { method: 'DELETE' })
  const gStayed = !(await gone('spaces', guestsSpace.space))
  chk(
    guest.granted && guestList.ok && refusedFor(g, 'A guest cannot delete a space') && gStayed,
    'a guest granted space.delete is refused deleting a space shared with them at Full edit (403), and it stays — they make a list there, so the level is real',
    `granted ${guest.granted}; list ${said(guestList)}; delete ${said(g)}; stayed ${gStayed}`,
  )

  // ══ 4. A MANAGER, AS BEFORE ══════════════════════════════════════════════
  console.log('\n▶ the manager, in a space they belong to and in one they do not')
  const theirs = await place('the manager’s')
  const notTheirs = await place('not the manager’s')
  const added = await A(`/spaces/${theirs.space}/members`, { method: 'POST', body: { userId: manager.id, role: 'edit' } })
  if (!added.ok) throw new Error(`could not add the manager to their space: ${said(added)}`)
  const inTheirs = await listOf(maker, theirs.project, 'a list in the manager’s space')
  const inNotTheirs = await listOf(maker, notTheirs.project, 'a list in a space not the manager’s')
  const m = {
    theirList: await manager.as(`/lists/${inTheirs}`, { method: 'DELETE' }),
    theirProject: await manager.as(`/projects/${theirs.project}`, { method: 'DELETE' }),
    otherList: await manager.as(`/lists/${inNotTheirs}`, { method: 'DELETE' }),
    otherProject: await manager.as(`/projects/${notTheirs.project}`, { method: 'DELETE' }),
  }
  const mAfter = {
    theirList: await gone('lists', inTheirs),
    theirProject: await gone('projects', theirs.project),
    otherList: await gone('lists', inNotTheirs),
    otherProject: await gone('projects', notTheirs.project),
  }
  chk(
    m.theirList.ok && m.theirProject.ok && mAfter.theirList && mAfter.theirProject
      && m.otherList.status === 403 && m.otherProject.status === 403 && !mAfter.otherList && !mAfter.otherProject,
    'a manager, who holds project.delete and list.delete by default, deletes a list and a project in a space they belong to — and in one they do not is refused both (403), which stay',
    `${Object.entries(m).map(([k, r]) => `${k} ${said(r)}`).join('; ')}; deleted ${JSON.stringify(mAfter)}`,
  )

  // ══ 5. THE LEVEL COMES FIRST ═════════════════════════════════════════════
  console.log('\n▶ the three deleters, in a space whose default is Edit and in one that is View only')
  const EDIT = await place('edit', 'edit')
  const VIEW = await place('view', 'view')
  const editList = await listOf({ as: A }, EDIT.project, 'the admin’s list at edit')
  const viewList = await listOf({ as: A }, VIEW.project, 'the admin’s list at view')
  const k = {
    editList: await lister.as(`/lists/${editList}`, { method: 'DELETE' }),
    viewList: await lister.as(`/lists/${viewList}`, { method: 'DELETE' }),
    editProject: await projector.as(`/projects/${EDIT.project}`, { method: 'DELETE' }),
    viewProject: await projector.as(`/projects/${VIEW.project}`, { method: 'DELETE' }),
    editSpace: await spacer.as(`/spaces/${EDIT.space}`, { method: 'DELETE' }),
    viewSpace: await spacer.as(`/spaces/${VIEW.space}`, { method: 'DELETE' }),
  }
  const kGone = [
    await gone('lists', editList), await gone('lists', viewList),
    await gone('projects', EDIT.project), await gone('projects', VIEW.project),
    await gone('spaces', EDIT.space), await gone('spaces', VIEW.space),
  ]
  chk(
    who.lister && who.projector && who.spacer
      && Object.values(k).every((r) => refusedFor(r, 'does not allow deleting this')) && kGone.every((x) => x === false),
    'a key does not reach past the level: where the space is Edit or View only for them, the members granted list.delete, project.delete and space.delete delete nothing (403 each, the refusal naming the level) and it all stays',
    `${Object.entries(k).map(([key, r]) => `${key} ${said(r)}`).join('; ')}; deleted ${JSON.stringify(kGone)}`,
  )

  // ══ 6. WHAT THE PROJECT PAGE IS TOLD ═════════════════════════════════════
  console.log('\n▶ the project page’s capabilities, for the list deleter, the project deleter and the plain member')
  const pageList = await listOf(maker, FULL.project, 'a list the page names')
  const capsOf = async (person) => (await person.as(`/projects/${FULL.project}/capabilities?lists=${pageList}`)).data ?? null
  const caps = { lister: await capsOf(lister), projector: await capsOf(projector), plain: await capsOf(plain) }
  const cap = (c) => ({ archive: c?.archive ?? null, deleteList: c?.lists?.[pageList]?.delete ?? null })
  const seen = { lister: cap(caps.lister), projector: cap(caps.projector), plain: cap(caps.plain) }
  chk(
    seen.lister.deleteList === true && seen.lister.archive === false
      && seen.projector.archive === true && seen.projector.deleteList === false
      && seen.plain.archive === false && seen.plain.deleteList === false,
    'the project page is told what the routes answer: Delete on another member’s list for the member granted list.delete, Archive of the project for the one granted project.delete, and neither for a plain member',
    JSON.stringify(seen),
  )

  // ══ 7. WHAT THE CATALOG OFFERS ═══════════════════════════════════════════
  console.log('\n▶ the permission catalog the role editor reads, and a role made with a retired key')
  const catalog = await A(`/workspaces/${WS}/roles/catalog`)
  const keys = (catalog.data?.permissions ?? []).map((x) => x.key)
  const tries = {}
  for (const key of RETIRED) {
    const named = `${TAG} with ${key}`
    const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: named, permissions: [key] } })
    const count = (await sql`select count(*)::int as n from custom_roles where workspace_id = ${WS} and name = ${named}`)[0].n
    tries[key] = { status: r.status, made: count }
  }
  chk(
    catalog.status === 200 && KEPT.every((key) => keys.includes(key)) && RETIRED.every((key) => !keys.includes(key))
      && RETIRED.every((key) => tries[key].status === 400 && tries[key].made === 0),
    'the catalog offers space.delete, project.delete and list.delete, and no longer task.delete.any, doc.delete.any or doc.publish, which gate nothing — a role naming one of those is refused (400) and none is made',
    `${catalog.status}: kept ${JSON.stringify(KEPT.filter((key) => keys.includes(key)))}, retired offered ${JSON.stringify(RETIRED.filter((key) => keys.includes(key)))}; made with one ${JSON.stringify(tries)}`,
  )

  // ══ 8. A ROLE SAVED BEFORE ═══════════════════════════════════════════════
  console.log('\n▶ a role saved while the retired keys were offered: assigned, and granting its live key alone')
  const older = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} older`, permissions: ['list.delete'] } })
  if (!older.ok || !older.data?.id) throw new Error(`could not make the older role: ${said(older)}`)
  // What a role saved before the keys left the catalog holds: they are stored beside a live one.
  for (const key of RETIRED) await sql`insert into custom_role_permissions (role_id, permission) values (${older.data.id}, ${key}) on conflict do nothing`
  const assigned = await A(`/workspaces/${WS}/members/${maker.memberId}/roles/${older.data.id}`, { method: 'POST', body: {} })
  const holds = (await maker.as(`/workspaces/${WS}/roles/me/permissions`)).data?.permissions ?? []
  chk(
    assigned.ok && holds.includes('list.delete') && RETIRED.every((key) => !holds.includes(key)),
    'a role saved while the retired keys were offered is assigned as before, and grants list.delete and nothing for task.delete.any, doc.delete.any or doc.publish',
    `assign ${said(assigned)}; the holder resolves ${JSON.stringify(holds.filter((key) => key === 'list.delete' || RETIRED.includes(key)))}`,
  )

  // ══ 9. THE EDITOR ════════════════════════════════════════════════════════
  console.log('\n▶ the role editor in Settings')
  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/settings?tab=roles`, { waitUntil: 'domcontentloaded' })
  await page.getByTitle('New role').first().click({ timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => (await page.getByText('Manage workspace settings', { exact: true }).count()) > 0, { timeoutMs: 10_000 })
  const count = (text) => page.getByText(text, { exact: true }).count().catch(() => -1)
  const offered = {
    kept: [await count('Delete spaces'), await count('Delete projects'), await count('Delete lists')],
    retired: [await count('Delete any task'), await count('Delete any doc'), await count('Publish docs externally')],
    toTheTrash: await page.getByText(/to the Trash/).count().catch(() => -1),
    permanently: await page.getByText(/Permanently delete/i).count().catch(() => -1),
  }
  await ctx.close().catch(() => {})
  chk(
    offered.kept.every((n) => n >= 1) && offered.retired.every((n) => n === 0) && offered.toTheTrash >= 3 && offered.permanently === 0,
    'the role editor offers Delete spaces, Delete projects and Delete lists, each described as sending what somebody else made to the Trash, and no longer offers Delete any task, Delete any doc or Publish docs externally',
    JSON.stringify(offered),
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
