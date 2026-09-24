/**
 * A GUEST IS OFFERED WHAT A GUEST MAY MAKE, AND NOTHING THE API REFUSES THEM.
 *
 * NOT A FRAME ROW: `found-24-sep/create-menu-offers-guests-what-they-cannot-make`.
 * The Create menu and a space's own "+" offered a guest a task (always "Guests
 * cannot create tasks"), a doc of the workspace (the form makes no other, and
 * a guest may not), a whiteboard, a dashboard and a form, a list anywhere, and
 * Imports and Templates — each a 403 once chosen. The List form's space picker
 * named every space they could see, and a project's page offered "Add list"
 * in any project they could open.
 *
 * What a guest may make, as the API has it now: a reminder, their own; a list,
 * only in a space shared with them to edit. The guest here first passes
 * through a space (a list in it is shared with them to view) and can add to
 * none, then is given another space to edit. Each menu is read beside a
 * member's, and the API is asked the same things the menus answer.
 *
 *   node test/e2e/guest-create-menu.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 6

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
const TAG = `gcm${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — lists and grants are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Maker@12345!'
    const signed = await signUpApi(API, {
      fullName: `Maker ${who}`, email, password,
      organizationName: `Maker ${who} ${stamp}`, organizationSlug: `maker-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, email, password, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const space = async (name) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: res.data?.id, name: `${TAG} ${name}` } })
    const [list] = await sql`insert into lists (project_id, name) values (${project.data?.id}, ${`${TAG} ${name} list`}) returning id`
    return { id: res.data?.id, project: project.data?.id, list: list.id }
  }
  // The guest passes through THROUGH — a list in it shared with them to view — and adds to nothing.
  const THROUGH = await space('passing through')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${THROUGH.list}, ${guest.id}, 'view')`
  // And a project there with no list yet, shared with them to view: its page's empty state offers "Add list" too.
  const BARE = { id: THROUGH.id, project: (await A('/projects', { method: 'POST', body: { spaceId: THROUGH.id, name: `${TAG} bare` } })).data?.id }
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'project', ${BARE.project}, ${guest.id}, 'view')`
  const EDIT = await space('to edit')

  browser = await chromium()
  async function chromium() {
    const c = await resolveChromium()
    return c.launch(launchOptions())
  }
  const signIn = async (who) => {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /*
   * A GUEST'S MENUS WAIT ON THE SPACES THEY MAY ADD TO (`move-targets`): read
   * before it answers, a list missing from a menu would be the load, not the
   * rule. So each read of the guest's waits for that answer first.
   */
  const load = async (page, url, guestReads) => {
    const targets = guestReads
      ? page.waitForResponse((r) => r.url().includes(`/spaces/workspace/${WS}/move-targets`), { timeout: 20_000 }).catch(() => null)
      : null
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    return targets
  }
  /** The Create modal's tabs, once it has drawn Reminder (which everyone is offered). */
  const createTabs = async (page, guestReads = false) => {
    const targets = await load(page, `${B}/app/${WS}`, guestReads)
    await page.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('create-tab-reminder').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await targets
    await page.waitForTimeout(1200)
    const tabs = await page.locator('[data-testid^="create-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('create-tab-', '')))
    await page.keyboard.press('Escape').catch(() => {})
    return tabs
  }
  /** A space's own "+" menu. */
  const spaceMenu = async (page, spaceId, guestReads = false) => {
    const targets = await load(page, `${B}/app/${WS}`, guestReads)
    await page.getByTestId(`space-create-open-${spaceId}`).click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('space-create-menu').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await targets
    await page.waitForTimeout(800)
    const items = await page.locator('[data-testid="space-create-menu"] [data-testid^="space-create-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('space-create-', '')))
    await page.keyboard.press('Escape').catch(() => {})
    return items.filter((i) => !i.startsWith('label-') && i !== 'menu-title')
  }
  /** The List form's space picker, once `expectId` is among its options. */
  const listSpaces = async (page, expectId, guestReads = false) => {
    const targets = await load(page, `${B}/app/${WS}`, guestReads)
    await page.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('create-tab-list').click({ timeout: 10_000 }).catch(() => {})
    const picker = page.getByTestId('quick-create-list-space')
    await picker.locator(`option[value="${expectId}"]`).waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
    await targets
    await page.waitForTimeout(800)
    const ids = await picker.locator('option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean)).catch(() => [])
    await page.keyboard.press('Escape').catch(() => {})
    return ids
  }
  /** How many "Add list" a project's own page offers, once its title and its lists (`ready`) are drawn. */
  const addListOn = async (page, sp, name, ready, guestReads = false) => {
    const targets = await load(page, `${B}/app/${WS}/${sp.id}/${sp.project}`, guestReads)
    const drawn = await page.getByRole('heading', { name: `${TAG} ${name}`, exact: true }).waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
      && await page.getByText(ready, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    await targets
    await page.waitForTimeout(800)
    // By its name, not a test id: the page had none, and the "before" must read the same button.
    return { drawn, offered: await page.getByRole('button', { name: /^Add list$/ }).count() }
  }
  const NEVER = ['task', 'doc', 'whiteboard', 'dashboard', 'form', 'folder', 'project', 'space']

  // ══ 1. THE CREATE MENU, ADDING TO NOTHING ════════════════════════════════
  console.log('\n▶ the Create menu, as the guest who adds to nothing and as a member')
  const gPage = await signIn(guest)
  const gTabs = await createTabs(gPage, true)
  const mPage = await signIn(member)
  const mTabs = await createTabs(mPage)
  chk(
    gTabs.includes('reminder') && !NEVER.some((k) => gTabs.includes(k)) && !gTabs.includes('list')
      && ['task', 'doc', 'whiteboard', 'list'].every((k) => mTabs.includes(k)),
    'a guest who may add to no space is offered a reminder and nothing else — a member is offered a task, a doc, a whiteboard and a list',
    `the guest's tabs ${JSON.stringify(gTabs)}; the member's ${JSON.stringify(mTabs)}`,
  )

  // ══ 2. THE SPACE THEY PASS THROUGH ═══════════════════════════════════════
  console.log('\n▶ the "+" of the space the guest only passes through')
  const gThrough = await spaceMenu(gPage, THROUGH.id, true)
  const mThrough = await spaceMenu(mPage, THROUGH.id)
  chk(
    gThrough.length > 0 && !gThrough.some((k) => [...NEVER, 'list', 'imports', 'templates'].includes(k))
      && ['list', 'task', 'imports', 'templates'].every((k) => mThrough.includes(k)),
    'on a space a guest only passes through, its own menu offers them no list, task, Imports or Templates — a member’s offers all four',
    `the guest's ${JSON.stringify(gThrough)}; the member's ${JSON.stringify(mThrough)}`,
  )

  // ══ 3. A SPACE TO EDIT ═══════════════════════════════════════════════════
  console.log('\n▶ the guest, once a space is shared with them to edit')
  await sql`insert into space_members (space_id, user_id, role) values (${EDIT.id}, ${guest.id}, 'edit')`
  const gPage2 = await signIn(guest)
  const gTabs2 = await createTabs(gPage2, true)
  const gEdit = await spaceMenu(gPage2, EDIT.id, true)
  const gThrough2 = await spaceMenu(gPage2, THROUGH.id, true)
  chk(
    gTabs2.includes('list') && !gTabs2.includes('task') && gEdit.includes('list') && !gEdit.includes('task') && !gThrough2.includes('list'),
    'given a space to edit, a guest is offered a list — in the Create menu and on that space’s menu, not on the space they pass through — and still no task',
    `the Create menu ${JSON.stringify(gTabs2)}; the edited space's ${JSON.stringify(gEdit)}; the passed-through space's ${JSON.stringify(gThrough2)}`,
  )

  // ══ 4. THE LIST FORM'S SPACES ════════════════════════════════════════════
  console.log('\n▶ the spaces the List form offers to make a list in')
  const gList = await listSpaces(gPage2, EDIT.id, true)
  const mList = await listSpaces(mPage, EDIT.id)
  chk(
    gList.includes(EDIT.id) && !gList.includes(THROUGH.id) && mList.includes(EDIT.id) && mList.includes(THROUGH.id),
    'the List form offers the guest the space to edit and not the one they pass through — a member is offered both',
    `the guest's spaces ${JSON.stringify(gList.map((id) => id === EDIT.id ? 'EDIT' : id === THROUGH.id ? 'THROUGH' : id))}; the member's ${JSON.stringify(mList.map((id) => id === EDIT.id ? 'EDIT' : id === THROUGH.id ? 'THROUGH' : id))}`,
  )

  // ══ 5. A PROJECT'S OWN PAGE ══════════════════════════════════════════════
  console.log('\n▶ "Add list" on a project’s own page')
  const gOnThrough = await addListOn(gPage2, THROUGH, 'passing through', `${TAG} passing through list`, true)
  const gOnBare = await addListOn(gPage2, BARE, 'bare', 'No lists yet', true)
  const gOnEdit = await addListOn(gPage2, EDIT, 'to edit', `${TAG} to edit list`, true)
  const mOnThrough = await addListOn(mPage, THROUGH, 'passing through', `${TAG} passing through list`)
  const mOnBare = await addListOn(mPage, BARE, 'bare', 'No lists yet')
  chk(
    gOnThrough.drawn && gOnThrough.offered === 0 && gOnBare.drawn && gOnBare.offered === 0 && gOnEdit.drawn && gOnEdit.offered === 1
      && mOnThrough.drawn && mOnThrough.offered === 1 && mOnBare.drawn && mOnBare.offered === 2,
    'a project’s page offers the guest "Add list" in the space to edit, and not in the one they pass through, nor from an empty project’s own empty state there — a member is offered both',
    `the guest: passing through ${JSON.stringify(gOnThrough)}, the empty project ${JSON.stringify(gOnBare)}, to edit ${JSON.stringify(gOnEdit)}; the member, passing through ${JSON.stringify(mOnThrough)}, the empty project ${JSON.stringify(mOnBare)}`,
  )

  // ══ 6. THE API AGREES ════════════════════════════════════════════════════
  console.log('\n▶ what the API answers the guest for each')
  const G = guest.as
  const named = async (table, col, value) => (await sql.unsafe(`select count(*)::int as n from ${table} where ${col} = $1`, [value]))[0].n
  const api = {
    listInEdit: (await G('/lists', { method: 'POST', body: { projectId: EDIT.project, name: `${TAG} guestlistedit` } })).status,
    listThrough: (await G('/lists', { method: 'POST', body: { projectId: THROUGH.project, name: `${TAG} guestlistthrough` } })).status,
    task: (await G('/tasks', { method: 'POST', body: { listId: EDIT.list, title: `${TAG} guesttask` } })).status,
    doc: (await G(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} guestdoc` } })).status,
    whiteboard: (await G(`/workspaces/${WS}/canvases`, { method: 'POST', body: { type: 'whiteboard', title: `${TAG} guestboard` } })).status,
    form: (await G(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} guestform` } })).status,
    reminder: (await G(`/workspaces/${WS}/reminders`, { method: 'POST', body: { remindAt: new Date(Date.now() + 3_600_000).toISOString(), note: `${TAG} guestreminder` } })).status,
  }
  const rows = {
    reminder: await named('reminders', 'note', `${TAG} guestreminder`),
    listInEdit: await named('lists', 'name', `${TAG} guestlistedit`),
    listThrough: await named('lists', 'name', `${TAG} guestlistthrough`),
    task: await named('tasks', 'title', `${TAG} guesttask`),
  }
  chk(
    api.reminder === 201 && rows.reminder === 1 && api.listInEdit === 201 && rows.listInEdit === 1 && api.listThrough === 403 && rows.listThrough === 0
      && api.task === 403 && rows.task === 0 && api.doc === 403 && api.whiteboard === 403 && api.form === 403,
    'the API makes the guest what the menus offer — a reminder, a list in the space to edit — and refuses what they withhold: a list where they pass through, a task, a workspace doc, a whiteboard, a form',
    `answers ${JSON.stringify(api)}; rows ${JSON.stringify(rows)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
