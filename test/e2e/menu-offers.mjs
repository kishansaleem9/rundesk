/**
 * A MENU OFFERS WHAT ITS ROUTES WOULD ACCEPT: DELETE AND RENAME ON A SPACE,
 * FOLDER, PROJECT OR LIST, AND A DOC'S PUBLIC-LINK SWITCH.
 *
 * NOT A FRAME ROW: `found-28-sep/delete-and-public-link-offered-to-everyone`,
 * found by the deletion research. The sidebar offered Delete, Rename, Move and
 * privacy on every space, folder, project and list, and so did the space
 * page's menu, with no permission read; the API refused most people, so each
 * was a dead control that answered with an alert. The docs panel drew its
 * public-link switch for everyone who could open the doc, guests and readers
 * included, whom the API refuses.
 *
 * ClickUp (help centre, from search snippets): a location's menu offers what
 * the person's permission allows — Full edit deletes, Edit changes — and
 * guests never share publicly. RunDesk's rule for each is the check its route
 * asks; the menus now ask the API the same checks (`/…/capabilities`) when
 * they open, so the two cannot disagree.
 *
 *   node test/e2e/menu-offers.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `mno${stamp}`
const PASSWORD = 'MenuOffers@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — shares are planted and what a refusal left behind is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Menu ${key}`, email, password: PASSWORD, organizationName: `Menu ${key} ${stamp}`, organizationSlug: `menu-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { key, id: signed.user?.id, email, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  if (!member.id || !guest.id || !adminId) throw new Error('a sign-up answered with no user id')

  // The admin's space at Full edit (the default), with a folder, a project and a list of the admin's.
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  const SPACE = space.data?.id
  const folder = await A(`/spaces/${SPACE}/folders`, { method: 'POST', body: { name: `${TAG} folder` } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } })
  const PROJECT = project.data?.id
  const FOLDER = folder.data?.id
  const adminsList = (await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} the admin’s list` } })).data?.id
  const ownList = (await member.as('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} the member’s list` } })).data?.id
  if (!SPACE || !FOLDER || !PROJECT || !adminsList || !ownList) throw new Error(`could not stage the tree: space ${said(space)}, folder ${said(folder)}, project ${said(project)}`)

  // The rows' owners by name, which is how their menu buttons are labelled ("Actions for …").
  const NAMES = {
    space: `${TAG} space`,
    folder: `${TAG} folder`,
    project: `${TAG} project`,
    adminsList: `${TAG} the admin’s list`,
    ownList: `${TAG} the member’s list, renamed`,
  }
  const caps = async (who, route) => (await who(route)).data ?? null
  const paths = {
    space: `/spaces/${SPACE}/capabilities`,
    folder: `/spaces/${SPACE}/folders/${FOLDER}/capabilities`,
    project: `/projects/${PROJECT}/capabilities`,
    adminsList: `/lists/${adminsList}/capabilities`,
    ownList: `/lists/${ownList}/capabilities`,
  }

  // ══ 1. THE MEMBER, ON THE ADMIN'S: REFUSED BY BOTH ═══════════════════════
  console.log('\n▶ a plain member, on what the admin made')
  const m = {
    space: await caps(member.as, paths.space),
    folder: await caps(member.as, paths.folder),
    project: await caps(member.as, paths.project),
    list: await caps(member.as, paths.adminsList),
  }
  const routes = {
    renameList: await member.as(`/lists/${adminsList}`, { method: 'PUT', body: { name: `${TAG} renamed by the member` } }),
    deleteList: await member.as(`/lists/${adminsList}`, { method: 'DELETE' }),
    deleteFolder: await member.as(`/spaces/${SPACE}/folders/${FOLDER}`, { method: 'DELETE' }),
    deleteProject: await member.as(`/projects/${PROJECT}`, { method: 'DELETE' }),
    deleteSpace: await member.as(`/spaces/${SPACE}`, { method: 'DELETE' }),
  }
  const refusedAnswers = m.space?.manage === false && m.space?.delete === false
    && m.folder?.manage === false && m.folder?.delete === false
    && m.project?.edit === false && m.project?.archive === false
    && m.list?.manage === false && m.list?.delete === false
  chk(
    refusedAnswers && Object.values(routes).every((r) => r.status === 403),
    'what a plain member may do to the admin’s space, folder, project and list, the capabilities answer as the routes do: nothing to rename or delete, and each route refuses (403)',
    `capabilities ${JSON.stringify(m)}; routes ${Object.entries(routes).map(([k, r]) => `${k} ${r.status}`).join(', ')}`,
  )

  // ══ 2. THE MEMBER, ON THEIR OWN: OFFERED BY BOTH ═════════════════════════
  console.log('\n▶ the member, on the list they made')
  const own = await caps(member.as, paths.ownList)
  const ownRename = await member.as(`/lists/${ownList}`, { method: 'PUT', body: { name: `${TAG} the member’s list, renamed` } })
  chk(
    own?.manage === true && own?.delete === true && ownRename.status < 300,
    'on the list they made the capabilities offer the member renaming and deleting it, and the rename route agrees (200)',
    `capabilities ${JSON.stringify(own)}; rename ${said(ownRename)}`,
  )

  // ══ 3. THE ADMIN ═════════════════════════════════════════════════════════
  console.log('\n▶ the admin')
  const a = {
    space: await caps(A, paths.space),
    folder: await caps(A, paths.folder),
    project: await caps(A, paths.project),
    list: await caps(A, paths.ownList),
  }
  chk(
    a.space?.manage === true && a.space?.delete === true && a.folder?.manage === true && a.folder?.delete === true
      && a.project?.edit === true && a.project?.archive === true && a.list?.manage === true && a.list?.delete === true,
    'the admin’s capabilities offer renaming and deleting the space, the folder, the project and the member’s list',
    JSON.stringify(a),
  )

  // ══ 4. A DOC'S PUBLIC LINK ═══════════════════════════════════════════════
  console.log('\n▶ a doc’s public link, at View, at Edit and for a guest at Edit')
  const PRIVATE = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} private`, visibility: 'private' } })).data?.id
  const doc = async (title) =>
    (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${PRIVATE}, ${`${TAG} ${title}`}, ${adminId}) returning id`)[0].id
  const share = (docId, userId, level) =>
    sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'doc', ${docId}, ${userId}, ${level})`
  const viewed = await doc('shared to view')
  const edited = await doc('shared to edit')
  const guests = await doc('shared with the guest to edit')
  await share(viewed, member.id, 'view')
  await share(edited, member.id, 'edit')
  await share(guests, guest.id, 'edit')
  const d = {
    view: await caps(member.as, `/docs/${viewed}/capabilities`),
    edit: await caps(member.as, `/docs/${edited}/capabilities`),
    guest: await caps(guest.as, `/docs/${guests}/capabilities`),
  }
  const linked = {
    view: await member.as(`/docs/${viewed}/share`, { method: 'POST' }),
    guest: await guest.as(`/docs/${guests}/share`, { method: 'POST' }),
  }
  chk(
    d.view?.makeLink === false && linked.view.status === 403 && d.edit?.makeLink === true && d.guest?.makeLink === false && linked.guest.status === 403,
    'a doc’s public link: a View share may not make one and an Edit share may, and a guest with an Edit share may not — as POST /docs/:id/share answers (403 for the two refused)',
    `capabilities ${JSON.stringify(d)}; link at view ${said(linked.view)}, guest ${said(linked.guest)}`,
  )

  // ══ 5–9. THE MENUS ═══════════════════════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const pageAs = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    page.on('dialog', (dlg) => void dlg.dismiss())
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    return page
  }
  /** The tree opened down to the project, as undo-delete opens it: spaces are drawn collapsed. */
  const openTree = async (page) => {
    await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`space-toggle-${SPACE}`).click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId(`project-toggle-${PROJECT}`).click({ timeout: 20_000 }).catch(() => {})
    await waitUntil(() => page.getByTestId(`list-actions-${ownList}`).isVisible().catch(() => false), { timeoutMs: 20_000 })
  }
  /**
   * Open a menu, and answer whether the row named `name` is offered once the
   * menu has asked: drawn and enabled, or not drawn at all. Read by the row's
   * visible name, as a person reads it, so a build without the rows' test ids
   * is measured the same way.
   */
  const offered = async (page, trigger, name) => {
    await page.keyboard.press('Escape').catch(() => {})
    // A Radix menu hides the rest of the page from roles while it closes, so
    // the next trigger is looked for only once no menu is open.
    await waitUntil(async () => (await page.getByRole('menu').count()) === 0, { timeoutMs: 5000 })
    await page.getByRole('button', { name: `Actions for ${trigger}`, exact: true }).first().click({ timeout: 10_000 }).catch(() => {})
    // A menu that never opened answers nothing: null, which no check reads as "not offered".
    const opened = await waitUntil(() => page.getByRole('menu').first().isVisible().catch(() => false), { timeoutMs: 8000 })
    if (!opened) return null
    const loc = page.getByRole('menuitem', { name })
    // Settled: the row is either enabled, or gone. A disabled row is the question still being asked.
    await waitUntil(async () => {
      if ((await loc.count()) === 0) return true
      return (await loc.first().getAttribute('data-disabled')) === null
    }, { timeoutMs: 8000 })
    // Bounded: the row can go between the count and the read, which answers "not offered" rather than throwing.
    const answer = (await loc.count()) > 0 && (await loc.first().getAttribute('data-disabled', { timeout: 3000 }).catch(() => 'gone')) === null
    await page.keyboard.press('Escape').catch(() => {})
    await waitUntil(async () => (await page.getByRole('menu').count()) === 0, { timeoutMs: 5000 })
    return answer
  }

  console.log('\n▶ the sidebar, as the plain member')
  const mp = await pageAs(member.email, PASSWORD)
  await openTree(mp)
  const listRows = {
    adminsDelete: await offered(mp, NAMES.adminsList, /^Delete list$/),
    adminsRename: await offered(mp, NAMES.adminsList, /^Rename$/),
    ownDelete: await offered(mp, NAMES.ownList, /^Delete list$/),
    ownRename: await offered(mp, NAMES.ownList, /^Rename$/),
  }
  chk(
    listRows.adminsDelete === false && listRows.adminsRename === false && listRows.ownDelete === true && listRows.ownRename === true,
    'the sidebar offers a plain member no Delete and no Rename on the admin’s list, and both on the list they made',
    JSON.stringify(listRows),
  )
  const upper = {
    spaceDelete: await offered(mp, NAMES.space, /^Delete space$/),
    projectArchive: await offered(mp, NAMES.project, /^Archive project$/),
    folderDelete: await offered(mp, NAMES.folder, /^Delete folder$/),
  }
  chk(
    upper.spaceDelete === false && upper.projectArchive === false && upper.folderDelete === false,
    'the sidebar offers a plain member no Delete on the admin’s space, no Archive on the admin’s project and no Delete on the admin’s folder',
    JSON.stringify(upper),
  )

  console.log('\n▶ the sidebar, as the admin')
  const ap = await pageAs(ADMIN.email, ADMIN.password)
  await openTree(ap)
  const adminRows = {
    spaceDelete: await offered(ap, NAMES.space, /^Delete space$/),
    memberListDelete: await offered(ap, NAMES.ownList, /^Delete list$/),
  }
  chk(
    adminRows.spaceDelete === true && adminRows.memberListDelete === true,
    'the sidebar offers the admin Delete on the space and on the list the member made',
    JSON.stringify(adminRows),
  )

  console.log('\n▶ the space page’s menu, as the plain member')
  await mp.goto(`${B}/app/${WS}/${SPACE}`, { waitUntil: 'domcontentloaded' })
  // The page's own menu button: the sidebar's space row carries the same label, so the one in the page header is the last.
  await mp.getByRole('button', { name: `Actions for ${NAMES.space}`, exact: true }).last().click({ timeout: 20_000 }).catch(() => {})
  const nothing = await waitUntil(() => mp.getByTestId('space-page-nothing').isVisible().catch(() => false), { timeoutMs: 8000 })
  const pageDelete = (await mp.getByRole('menuitem', { name: /^Delete space$/ }).count()) > 0
  await mp.keyboard.press('Escape').catch(() => {})
  chk(
    nothing && !pageDelete,
    'the space page’s menu tells a plain member there is nothing there for them to change, and offers no Delete',
    `said so ${nothing}; Delete offered ${pageDelete}`,
  )

  console.log('\n▶ the docs panel, at View and at Edit')
  const toggleOn = async (docId) => {
    await mp.goto(`${B}/app/${WS}/docs?doc=${docId}`, { waitUntil: 'domcontentloaded' })
    // The doc's header is drawn once the doc is open; the switch once its question is answered.
    await waitUntil(() => mp.getByRole('button', { name: /favou?rite/i }).first().isVisible().catch(() => false), { timeoutMs: 15_000 })
    const loc = mp.getByRole('button', { name: /^(Share doc publicly|Disable public share)$/ })
    await waitUntil(async () => (await loc.count()) === 0 || (await loc.first().isEnabled().catch(() => false)), { timeoutMs: 8000 })
    await mp.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    return (await loc.count()) > 0 && (await loc.first().isEnabled().catch(() => false))
  }
  const atView = await toggleOn(viewed)
  const atEdit = await toggleOn(edited)
  chk(
    !atView && atEdit,
    'the docs panel offers the public-link switch on a doc shared at Edit, and not on one shared at View',
    `at view ${atView}; at edit ${atEdit}`,
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
