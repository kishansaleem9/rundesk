/**
 * THE WEB OFFERS WHAT A PERSON'S PERMISSIONS ALLOW, CUSTOM ROLES INCLUDED.
 *
 * NOT A FRAME ROW: `product-siblings/custom-role-permissions-unread-by-web`.
 * The API enforces permission keys (`@RequirePermissions`): a member may make
 * a space but not a project, a guest neither, and templates are a manager's.
 * Custom roles ADD keys to a person's role. The web gated on the base role, or
 * on nothing, and never read `GET /roles/me/permissions`: the Create menu
 * offered Project to a member and Space to a guest (each a 403), and "Save as
 * template" to anyone, while a member a custom role had granted a key still
 * saw whatever their role saw.
 *
 * A member, a guest, and the member again once custom roles grant them
 * `project.create` and `template.manage`, each read in the browser. Then
 * Folder, which the API files under `space.create` too: offered to a guest in
 * both menus and as the space's own "New folder" row, each a 403.
 *
 *   node test/e2e/role-permissions-web.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* lib/fixture.mjs's one API client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the `A` helper it replaces, it throws when nothing answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })
const stamp = Date.now()
const TAG = `rpw-${stamp}`
let browser = null
let WS = null
let A = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  WS = await make('/workspaces', { name: TAG }, 'the workspace')
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  const person = async (label, role) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const password = `${label[0].toUpperCase()}${label.slice(1)}@12345!`
    const signed = await signUpApi(API, {
      fullName: `Role ${label}`, email, password,
      organizationName: `Role ${label} ${stamp}`, organizationSlug: `role-${label}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${label}: ${added.status}`)
    return { email, password, id: signed.user.id }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const TASK = await make('/tasks', { listId: LIST, title: `${TAG} the member's task`, assigneeIds: [member.id] }, 'the task')

  browser = await chromium.launch(launchOptions())
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
  /** The Create modal's tabs, once the menu has drawn its first one. */
  const createTabs = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('create-tab-task').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const tabs = await page.locator('[data-testid^="create-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('create-tab-', '')))
    await page.keyboard.press('Escape').catch(() => {})
    return tabs
  }
  /** A space row's own "+" menu. */
  const spaceMenu = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(`space-create-open-${SPACE}`).click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('space-create-menu').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    const items = await page.locator('[data-testid="space-create-menu"] [data-testid^="space-create-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    await page.keyboard.press('Escape').catch(() => {})
    return items
  }
  /** The sidebar, once it has drawn Home: its links to Reports, and its "New space". */
  const sidebarOffers = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.locator(`a[href="/app/${WS}/inbox"]`).first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
    await page.getByTestId(`space-link-${SPACE}`).waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    return { reports: await page.locator(`a[href="/app/${WS}/reports"]`).count(), newSpace: await page.getByTestId('nav-new-space').count() }
  }
  /** The space opened in the sidebar: is it shown, and its own "New folder" row? */
  const newFolderRow = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    const toggle = page.getByTestId(`space-toggle-${SPACE}`)
    await toggle.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    if ((await toggle.getAttribute('aria-expanded').catch(() => null)) !== 'true') await toggle.click({ timeout: 5000 }).catch(() => {})
    const open = await waitUntil(async () => (await toggle.getAttribute('aria-expanded').catch(() => null)) === 'true', { timeoutMs: 5000 })
    await page.waitForTimeout(800)
    return { open, row: await page.getByTestId(`space-new-folder-${SPACE}`).count() }
  }
  /**
   * Is "Save as template" offered on the member's own task?
   *
   * COUNTED ONCE THEIR KEYS HAVE ANSWERED. The button is drawn from
   * `GET /roles/me/permissions` (`can('template.manage') === true`), and under a
   * sweep's load it was counted 1.5 fixed seconds after the sheet opened, before
   * that answer had arrived — "not offered after the grant"
   * (`found-24-sep/three-suites-fail-under-a-full-sweep`). When the answer holds
   * the key, the button it draws is waited for (bounded, so a sheet that never
   * draws it still fails); when it does not, the count is taken once the answer
   * has had a frame to be drawn in — an absence read after the data, not before.
   */
  const saveAsTemplate = async (page) => {
    const keys = page
      .waitForResponse((r) => r.url().includes(`/workspaces/${WS}/roles/me/permissions`) && r.ok(), { timeout: 30_000 })
      .then(async (r) => (await r.json().catch(() => null))?.data?.permissions ?? null)
      .catch(() => null)
    await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-sheet').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const held = await keys
    const button = page.getByTestId('task-sheet').getByRole('button', { name: /Save as template/ })
    if (Array.isArray(held) && held.includes('template.manage')) {
      await waitUntil(async () => (await button.count()) > 0, { timeoutMs: 15_000 })
    } else {
      /*
       * THE ABSENCE IS READ ONCE THE SHEET HAS DRAWN THE TASK — its cover band,
       * drawn with the task — not while it still shows the skeleton, which draws
       * no button whatever the keys say: counted two frames after the keys,
       * `rpw-5` (the button offered to everybody) read 0 and reddened nothing.
       */
      await page.getByTestId('task-sheet').getByTestId('task-cover').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {})
    }
    return button.count()
  }

  // ══ 1. A MEMBER ══════════════════════════════════════════════════════════
  console.log('\n▶ a member, whose role may make a space but not a project')
  const mPage = await signIn(member)
  const mTabs = await createTabs(mPage)
  const mMenu = await spaceMenu(mPage)
  const mSidebar = await sidebarOffers(mPage)
  chk(
    mTabs.includes('task') && mTabs.includes('space') && !mTabs.includes('project') && mMenu.length > 0 && !mMenu.includes('space-create-project') && mSidebar.reports > 0 && mSidebar.newSpace === 1,
    'a member is offered Space and not Project, in the Create menu and on a space’s own menu, and Reports',
    `the Create menu offered ${JSON.stringify(mTabs)}; the space's menu ${JSON.stringify(mMenu)}; the sidebar ${JSON.stringify(mSidebar)}`,
  )

  // ══ 2. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, whose role may make neither')
  const gPage = await signIn(guest)
  const gTabs = await createTabs(gPage)
  const gSidebar = await sidebarOffers(gPage)
  // Reminder is a guest's to make; the menu drew, and still offers it.
  chk(
    gTabs.includes('reminder') && !gTabs.includes('space') && !gTabs.includes('project') && gSidebar.reports === 0 && gSidebar.newSpace === 0,
    'a guest is offered neither Space nor Project, nor Reports',
    `the Create menu offered ${JSON.stringify(gTabs)}; the sidebar ${JSON.stringify(gSidebar)}`,
  )

  // ══ 3. A CUSTOM ROLE GRANTS PROJECTS ═════════════════════════════════════
  console.log('\n▶ the member, once a custom role grants project.create')
  const members = (await A(`/workspaces/${WS}/members`)).data ?? []
  const memberRow = members.find((m) => (m.userId ?? m.user?.id) === member.id)
  const role = await make(`/workspaces/${WS}/roles`, { name: `${TAG} project makers`, permissions: ['project.create'] }, 'the project role')
  const granted = memberRow ? await A(`/workspaces/${WS}/members/${memberRow.workspaceMemberId}/roles/${role}`, { method: 'POST', body: {} }) : { status: 0 }
  const grantedPage = await signIn(member)
  const gTabs2 = await createTabs(grantedPage)
  const gMenu2 = await spaceMenu(grantedPage)
  chk(
    granted.ok && gTabs2.includes('project') && gMenu2.includes('space-create-project'),
    'once a custom role grants project.create, the member is offered Project in both menus',
    `the grant answered ${granted.status}; the Create menu offered ${JSON.stringify(gTabs2)}; the space's menu ${JSON.stringify(gMenu2)}`,
  )

  // ══ 4. TEMPLATES ═════════════════════════════════════════════════════════
  console.log('\n▶ "Save as template" on the member’s task, before and after a role grants template.manage')
  const before = await saveAsTemplate(grantedPage)
  const tplRole = await make(`/workspaces/${WS}/roles`, { name: `${TAG} template keepers`, permissions: ['template.manage'] }, 'the template role')
  const tplGranted = memberRow ? await A(`/workspaces/${WS}/members/${memberRow.workspaceMemberId}/roles/${tplRole}`, { method: 'POST', body: {} }) : { status: 0 }
  const tplPage = await signIn(member)
  const after = await saveAsTemplate(tplPage)
  chk(
    before === 0 && tplGranted.ok && after === 1,
    '"Save as template" is offered to a member only once a role grants template.manage',
    `before the grant: ${before}; the grant answered ${tplGranted.status}; after it: ${after}`,
  )

  // ══ 5. FOLDERS ═══════════════════════════════════════════════════════════
  console.log('\n▶ Folder, which the API files under space.create: the member, then a guest who can see the space')
  const mFolderTabs = await createTabs(mPage)
  const mFolderMenu = await spaceMenu(mPage)
  const mRow = await newFolderRow(mPage)
  const shared = await A(`/spaces/${SPACE}/members`, { method: 'POST', body: { userId: guest.id, role: 'edit' } })
  const gFolderPage = await signIn(guest)
  const gFolderTabs = await createTabs(gFolderPage)
  const gFolderMenu = await spaceMenu(gFolderPage)
  const gRow = await newFolderRow(gFolderPage)
  // What the menus mirror: the API refuses the guest's folder, by status and by
  // row, and makes the member's.
  const makeFolder = async (who, name) => {
    const { accessToken } = await signInApi(API, who.email, who.password)
    const res = await fetch(`${API}/spaces/${SPACE}/folders`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
    return res.status
  }
  const gMade = await makeFolder(guest, `${TAG} the guest's folder`)
  const mMade = await makeFolder(member, `${TAG} the member's folder`)
  const folders = ((await A(`/spaces/${SPACE}/folders`)).data ?? []).map((f) => f.name ?? f.folder?.name)
  chk(
    mFolderTabs.includes('folder') && mFolderMenu.includes('space-create-folder') && mRow.open && mRow.row === 1
      && shared.status < 300 && gRow.open && gFolderMenu.length > 0
      && !gFolderTabs.includes('folder') && !gFolderMenu.includes('space-create-folder') && gRow.row === 0
      && gMade === 403 && !folders.includes(`${TAG} the guest's folder`) && mMade < 300 && folders.includes(`${TAG} the member's folder`),
    'a guest who can see the space is offered no Folder — not in the Create menu, the space’s menu, or its New folder row — which the API refuses them, and a member is offered all three',
    `the member: Create ${mFolderTabs.includes('folder')}, space menu ${mFolderMenu.includes('space-create-folder')}, row ${JSON.stringify(mRow)}; the space shared with the guest answered ${shared.status}; the guest: Create ${JSON.stringify(gFolderTabs)}, space menu ${JSON.stringify(gFolderMenu)}, row ${JSON.stringify(gRow)}; making a folder answered the guest ${gMade} and the member ${mMade}; the space holds ${JSON.stringify(folders)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    try {
      const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE /workspaces/${WS} got no answer (${err?.message ?? err})`)
    }
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
