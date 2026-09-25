/**
 * A PROJECT'S PAGE OFFERS EACH CONTROL TO WHOEVER ITS ROUTE WOULD LET USE IT.
 *
 * NOT A FRAME ROW: `found-24-sep/project-page-offers-guests-its-managers-buttons`.
 * The page drew Statuses, Members (with its add, role and remove controls, and
 * visibility), Suggest tasks, Edit project, Archive project, and each list's
 * Rename and Delete for anybody who could open it. A guest who only passes
 * through a project, or a member who did not make it, was offered the lot, and
 * refused by the route behind each.
 *
 * ClickUp (help centre, search snippets): a view-only person or a guest cannot
 * rename, delete or change a location's settings, and a location's Edit (below
 * Full edit) may not delete it.
 *
 * The page now asks the API what this person may do there
 * (`GET /projects/:id/capabilities`), which answers with the rule each route
 * asks. Read beside the admin, and beside what the routes answer.
 *
 *   node test/e2e/project-page-controls.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 4

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
const TAG = `ppc${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — lists and shares are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Paged@12345!'
    const signed = await signUpApi(API, {
      fullName: `Paged ${who}`, email, password,
      organizationName: `Paged ${who} ${stamp}`, organizationSlug: `paged-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, email, password, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  const SPACE = space.data?.id
  const PROJECT_NAME = `${TAG} project`
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: PROJECT_NAME } })
  const PROJECT = project.data?.id
  if (!SPACE || !PROJECT) throw new Error(`could not make the space and project: ${space.status}, ${project.status}`)
  // The admin's list, and one the member makes themselves.
  const adminList = await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} admins list` } })
  const memberList = await member.as('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} members list` } })
  if (adminList.status >= 300 || memberList.status >= 300) throw new Error(`could not make the lists: ${adminList.status}, ${memberList.status}`)
  // The guest passes through: the admin's list is shared with them to view.
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${adminList.data.id}, ${guest.id}, 'view')`

  browser = await (await resolveChromium()).launch(launchOptions())
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
  /** Which items a "…" menu offers, by its trigger's label. */
  const menuItems = async (page, label) => {
    const trigger = page.getByRole('button', { name: label, exact: true })
    if ((await trigger.count()) === 0) return null
    await trigger.first().click({ timeout: 5000, force: true }).catch(() => {})
    await page.getByRole('menu').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    const items = await page.getByRole('menuitem').allInnerTexts().catch(() => [])
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
    return items.map((s) => s.trim())
  }
  /** Everything the project's page offers this person, once the page and its lists are drawn. */
  const offered = async (page, lists) => {
    await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: PROJECT_NAME, exact: true }).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.getByText(lists[0], { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const button = async (name) => page.getByRole('button', { name, exact: true }).count()
    const out = {
      statuses: await button('Statuses'),
      members: await button('Members'),
      suggest: await button('Suggest tasks'),
      project: await menuItems(page, `Actions for ${PROJECT_NAME}`),
      lists: {},
      manageMembers: null,
    }
    for (const name of lists) out.lists[name] = await menuItems(page, `Actions for ${name}`)
    if (out.members > 0) {
      // The sheet is a plain panel (no dialog role): read its controls page-wide
      // once it is open, and its selects against the page's own before it opened.
      const selectsBefore = await page.locator('select').count()
      await page.getByRole('button', { name: 'Members', exact: true }).click({ timeout: 5000 }).catch(() => {})
      const overlay = page.getByRole('button', { name: 'Close sheet overlay' })
      const opened = await overlay.waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false)
      await page.waitForTimeout(2500)
      out.manageMembers = opened
        ? {
            add: await page.getByText('Add member', { exact: true }).count(),
            remove: await page.getByRole('button', { name: 'Remove member' }).count(),
            selects: (await page.locator('select').count()) - selectsBefore,
          }
        : null
      await overlay.click({ timeout: 3000 }).catch(() => {})
    }
    return out
  }
  const has = (items, word) => Array.isArray(items) && items.some((s) => s.includes(word))
  const LISTS = [`${TAG} admins list`, `${TAG} members list`]

  // ══ 1. THE ADMIN ═════════════════════════════════════════════════════════
  console.log('\n▶ the admin, on the project’s page')
  const aPage = await signIn(ADMIN)
  const aSees = await offered(aPage, LISTS)
  chk(
    aSees.statuses === 1 && aSees.members === 1 && aSees.suggest === 1 && has(aSees.project, 'Edit project') && has(aSees.project, 'Archive project')
      && LISTS.every((l) => has(aSees.lists[l], 'Rename') && has(aSees.lists[l], 'Delete list'))
      && aSees.manageMembers && aSees.manageMembers.add === 1 && aSees.manageMembers.selects >= 2,
    'the admin is offered every control: Statuses, Members and managing them, Suggest tasks, Edit and Archive, and each list’s Rename and Delete',
    JSON.stringify(aSees),
  )

  // ══ 2. A MEMBER WHO DID NOT MAKE THE PROJECT ═════════════════════════════
  console.log('\n▶ a member, who made one of its lists and not the project')
  const mPage = await signIn(member)
  const mSees = await offered(mPage, LISTS)
  const mine = mSees.lists[`${TAG} members list`]
  const theirs = mSees.lists[`${TAG} admins list`]
  chk(
    mSees.statuses === 1 && mSees.suggest === 1 && !has(mSees.project, 'Edit project') && !has(mSees.project, 'Archive project')
      && has(mine, 'Rename') && has(mine, 'Delete list') && !has(theirs, 'Rename') && !has(theirs, 'Delete list')
      && mSees.manageMembers !== null && mSees.manageMembers.add === 0 && mSees.manageMembers.remove === 0 && mSees.manageMembers.selects === 0,
    'a member who did not make the project is offered Statuses and Suggest tasks, and Rename and Delete on the list they made — not Edit or Archive, not the admin’s list, and the members only to read',
    JSON.stringify(mSees),
  )

  // ══ 3. A GUEST PASSING THROUGH ═══════════════════════════════════════════
  console.log('\n▶ a guest, who passes through the project to the list shared with them')
  const gPage = await signIn(guest)
  const gSees = await offered(gPage, [`${TAG} admins list`])
  const gList = gSees.lists[`${TAG} admins list`]
  chk(
    gSees.statuses === 0 && gSees.suggest === 0 && !has(gSees.project, 'Edit project') && !has(gSees.project, 'Archive project')
      && !has(gList, 'Rename') && !has(gList, 'Delete list')
      && (gSees.manageMembers === null || (gSees.manageMembers.add === 0 && gSees.manageMembers.remove === 0 && gSees.manageMembers.selects === 0)),
    'a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read',
    JSON.stringify(gSees),
  )

  // ══ 4. THE ROUTES AGREE ══════════════════════════════════════════════════
  console.log('\n▶ what the routes answer the member and the guest')
  const M = member.as
  const G = guest.as
  const answers = {
    memberRenamesProject: (await M(`/projects/${PROJECT}`, { method: 'PUT', body: { name: `${TAG} renamed by member` } })).status,
    memberRenamesAdminsList: (await M(`/lists/${adminList.data.id}`, { method: 'PUT', body: { name: `${TAG} renamed by member` } })).status,
    memberRenamesOwnList: (await M(`/lists/${memberList.data.id}`, { method: 'PUT', body: { name: `${TAG} members list, renamed` } })).status,
    memberAddsStatus: (await M(`/projects/${PROJECT}/statuses`, { method: 'POST', body: { name: `${TAG} memberstatus` } })).status,
    memberAddsMember: (await M(`/projects/${PROJECT}/members`, { method: 'POST', body: { userId: guest.id, role: 'edit' } })).status,
    guestAddsStatus: (await G(`/projects/${PROJECT}/statuses`, { method: 'POST', body: { name: `${TAG} gueststatus` } })).status,
    guestSuggests: (await G('/ai/suggest-tasks', { method: 'POST', body: { workspaceId: WS, projectId: PROJECT } })).status,
  }
  const [projectRow] = await sql`select name from projects where id = ${PROJECT}`
  chk(
    answers.memberRenamesProject === 403 && answers.memberRenamesAdminsList === 403 && answers.memberRenamesOwnList < 300
      && answers.memberAddsStatus < 300 && answers.memberAddsMember === 403 && answers.guestAddsStatus === 403 && answers.guestSuggests === 403
      && projectRow?.name === PROJECT_NAME,
    'each route answers as the page offers: the member renames their own list and adds a status, and is refused the project, the admin’s list and its members; the guest is refused statuses and suggestions',
    `${JSON.stringify(answers)}; the project is named ${JSON.stringify(projectRow?.name)}`,
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
