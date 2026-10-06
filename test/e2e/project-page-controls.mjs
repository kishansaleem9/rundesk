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
 * AND ITS CUSTOM FIELDS SECTION (`found-6-oct/project-page-offers-field-edits-to-readers`):
 * "Add field" and each field's delete were drawn for every reader, a refused
 * delete said nothing, and the section said every field is on every task while
 * it listed fields kept to one list. The answer's `fields` is the define rule
 * the field routes ask (ClickUp: "Guests and limited members can't create and
 * add Custom Fields" — help centre, "Create Custom Fields", read through
 * search excerpts). And the answer a page keeps while the next one loads is
 * its own project's: moved by a link to another project, it offered the first
 * project's controls until the second's answer came.
 *
 *   node test/e2e/project-page-controls.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const EXPECTED_CHECKS = 10

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
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)

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
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Paged@12345!'
    const signed = await signUpApi(API, {
      fullName: `Paged ${who}`, email, password,
      organizationName: `Paged ${who} ${stamp}`, organizationSlug: `paged-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${added.status}`)
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
  if (!adminList.ok || !memberList.ok) throw new Error(`could not make the lists: ${adminList.status}, ${memberList.status}`)
  // The guest passes through: the admin's list is shared with them to view.
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${adminList.data.id}, ${guest.id}, 'view')`

  browser = await (await resolveChromium()).launch(launchOptions())
  const signIn = async (who) => {
    // The worker blocked: a project's answer is held back by route below, and the app's worker answers API GETs past a route.
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })).newPage()
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
    const items = await page.getByRole('menuitem').filter({ visible: true }).allInnerTexts().catch(() => [])
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
    answers.memberRenamesProject === 403 && answers.memberRenamesAdminsList === 403
      && answers.memberRenamesOwnList >= 200 && answers.memberRenamesOwnList < 300
      && answers.memberAddsStatus >= 200 && answers.memberAddsStatus < 300 && answers.memberAddsMember === 403 && answers.guestAddsStatus === 403 && answers.guestSuggests === 403
      && projectRow?.name === PROJECT_NAME,
    'each route answers as the page offers: the member renames their own list and adds a status, and is refused the project, the admin’s list and its members; the guest is refused statuses and suggestions',
    `${JSON.stringify(answers)}; the project is named ${JSON.stringify(projectRow?.name)}`,
  )

  // ══ 5–7. THE CUSTOM FIELDS SECTION ═══════════════════════════════════════
  console.log('\n▶ the Custom fields section, offered as the define rule lets')
  /*
   * `found-6-oct/project-page-offers-field-edits-to-readers`. "Add field" and
   * each field's delete were drawn for every reader; a member of a view-only
   * space pressed delete, the route refused it (403), the field stayed and
   * nothing said so (lane 7). In a view-only space of its own: lists one and
   * two, list two shared with the member to edit and list one with the guest
   * to view, and three fields — the project's own, one kept to list one, one
   * kept to list two.
   */
  const made2 = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  const VSPACE = await made2('/spaces', { workspaceId: WS, name: `${TAG} view-only space`, defaultPermission: 'view' }, 'the view-only space')
  const VPROJECT_NAME = `${TAG} view-only project`
  const VPROJECT = await made2('/projects', { spaceId: VSPACE, name: VPROJECT_NAME }, 'its project')
  const LIST_ONE = `${TAG} list one`
  const L1 = await made2('/lists', { projectId: VPROJECT, name: LIST_ONE }, 'list one')
  const L2 = await made2('/lists', { projectId: VPROJECT, name: `${TAG} list two` }, 'list two')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${L2}, ${member.id}, 'edit')`
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${L1}, ${guest.id}, 'view')`
  const field = (project, body, what) => made2(`/workspaces/${WS}/projects/${project}/custom-fields`, { type: 'text', ...body }, what)
  const WHOLE = `${TAG} Budget`
  const ONE = `${TAG} Stage one`
  const TWO = `${TAG} Stage two`
  const wholeId = await field(VPROJECT, { name: WHOLE }, 'the project’s own field')
  const oneId = await field(VPROJECT, { name: ONE, listId: L1 }, 'the field kept to list one')
  await field(VPROJECT, { name: TWO, listId: L2 }, 'the field kept to list two')

  /** What the Custom fields section offers this person, once the page has its answer (`/capabilities`). */
  const fieldsOffered = async (page, { spaceId, projectId, shown }) => {
    const answered = page.waitForResponse((r) => r.url().includes(`/projects/${projectId}/capabilities`), { timeout: 25_000 }).catch(() => null)
    await page.goto(`${B}/app/${WS}/${spaceId}/${projectId}`, { waitUntil: 'domcontentloaded' })
    await answered
    const section = page.locator('section').filter({ has: page.getByText('Custom fields', { exact: true }) })
    await section.getByText(shown, { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1000)
    const count = (name) => section.getByRole('button', { name, exact: true }).count()
    return {
      add: await count('Add field'),
      whole: await count(`Delete field ${WHOLE}`),
      one: await count(`Delete field ${ONE}`),
      two: await count(`Delete field ${TWO}`),
      section,
    }
  }
  const aFields = await fieldsOffered(aPage, { spaceId: VSPACE, projectId: VPROJECT, shown: WHOLE })
  const mFields = await fieldsOffered(mPage, { spaceId: VSPACE, projectId: VPROJECT, shown: WHOLE })
  const gFields = await fieldsOffered(gPage, { spaceId: VSPACE, projectId: VPROJECT, shown: WHOLE })
  const tally = ({ add, whole, one, two }) => ({ add, whole, one, two })
  chk(
    aFields.add === 1 && aFields.whole === 1 && aFields.one === 1 && aFields.two === 1
      && mFields.add === 0 && mFields.whole === 0 && mFields.one === 0 && mFields.two === 1
      && gFields.add === 0 && gFields.whole === 0 && gFields.one === 0 && gFields.two === 0,
    'the Custom fields section offers Add field and each field’s delete only as the define rule lets: the admin all of them; a member of a view-only space no Add field, and no delete but on the field kept to the list shared with them to edit; a guest passing through none',
    `the admin ${JSON.stringify(tally(aFields))}, the member ${JSON.stringify(tally(mFields))}, the guest ${JSON.stringify(tally(gFields))}`,
  )

  // A field kept to one list says which, and the section no longer says every field is on every task.
  const scopeOf = async (id) => ((await aPage.getByTestId(`project-field-scope-${id}`).filter({ visible: true }).allInnerTexts().catch(() => []))[0] ?? null)
  const [scopeOne, scopeWhole] = [await scopeOf(oneId), await scopeOf(wholeId)]
  const sectionText = await aFields.section.filter({ visible: true }).innerText().catch(() => '')
  chk(
    scopeOne === `Only on tasks in ${LIST_ONE}` && scopeWhole === null && sectionText.includes('kept to one list'),
    'a field kept to one list says so on the project’s page, naming the list — a field of the whole project does not — and the section no longer says every field is on every task',
    `the field of list one reads ${JSON.stringify(scopeOne)}, the project’s own ${JSON.stringify(scopeWhole)}; the section reads ${JSON.stringify(sectionText.slice(0, 240))}`,
  )

  /*
   * THE LAST ANSWER STANDS ONLY FOR ITS OWN PROJECT. The page stays drawn when
   * a link moves it to another project, and the answer it kept while the next
   * one loaded was the first project's: a member who may change one project's
   * fields and statuses followed the sidebar to a project they only view, and
   * was offered Add field, Statuses and a field's delete there until its own
   * answer came (lane 7, three runs alike). The member goes from the first
   * project, whose space still lets them, to the view-only one by its sidebar
   * link, with the view-only project's answer held back until the page is read.
   */
  const VCAPS = `**/api/v1/projects/${VPROJECT}/capabilities**`
  let vAsked = 0
  let letVGo = () => {}
  const vHeld = new Promise((resolve) => { letVGo = resolve })
  await mPage.route(VCAPS, async (route) => {
    vAsked += 1
    await vHeld
    await route.continue().catch(() => {})
  })
  const answeredFirst = mPage.waitForResponse((r) => r.url().includes(`/projects/${PROJECT}/capabilities`), { timeout: 25_000 }).catch(() => null)
  await mPage.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
  await answeredFirst
  const firstSection = mPage.locator('section').filter({ has: mPage.getByText('Custom fields', { exact: true }) })
  await firstSection.getByRole('button', { name: 'Add field', exact: true }).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const onFirst = {
    add: await firstSection.getByRole('button', { name: 'Add field', exact: true }).filter({ visible: true }).count(),
    statuses: await mPage.getByRole('button', { name: 'Statuses', exact: true }).filter({ visible: true }).count(),
  }
  const vLink = mPage.getByTestId(`project-link-${VPROJECT}`)
  if (!(await vLink.isVisible().catch(() => false))) await mPage.getByTestId(`space-toggle-${VSPACE}`).click({ timeout: 5000 }).catch(() => {})
  await vLink.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await vLink.click({ timeout: 5000 }).catch(() => {})
  const vSection = mPage.locator('section').filter({ has: mPage.getByText('Custom fields', { exact: true }) })
  const vDrawn = await waitUntil(
    async () => (await mPage.getByRole('heading', { name: VPROJECT_NAME, exact: true }).filter({ visible: true }).count()) === 1
      && (await vSection.getByText(WHOLE, { exact: true }).filter({ visible: true }).count()) >= 1,
    { timeoutMs: 20_000 },
  )
  const vCount = (name) => vSection.getByRole('button', { name, exact: true }).filter({ visible: true }).count()
  const whileHeld = {
    add: await vCount('Add field'),
    statuses: await mPage.getByRole('button', { name: 'Statuses', exact: true }).filter({ visible: true }).count(),
    deletes: (await vCount(`Delete field ${WHOLE}`)) + (await vCount(`Delete field ${ONE}`)) + (await vCount(`Delete field ${TWO}`)),
  }
  const answeredV = mPage.waitForResponse((r) => r.url().includes(`/projects/${VPROJECT}/capabilities`), { timeout: 20_000 }).then((r) => r.status()).catch(() => null)
  letVGo()
  const vAnswer = await answeredV
  await mPage.unroute(VCAPS).catch(() => {})
  chk(
    onFirst.add === 1 && onFirst.statuses === 1 && vAsked >= 1 && vDrawn
      && whileHeld.add === 0 && whileHeld.statuses === 0 && whileHeld.deletes === 0 && vAnswer === 200,
    'moving by the sidebar from a project whose fields and statuses the member may change to one they only view, the page offers nothing on the first project’s answer while the second’s is on its way — no Add field, Statuses or field’s delete — and then has the second’s',
    `on the first project Add field ${onFirst.add}, Statuses ${onFirst.statuses}; the view-only project’s answer asked ${vAsked} time(s), its page ${vDrawn ? 'drawn' : 'NOT drawn'}; ` +
      `while its answer was held, Add field ${whileHeld.add}, Statuses ${whileHeld.statuses}, field deletes ${whileHeld.deletes}; its answer then came ${vAnswer}`,
  )

  /*
   * A FIELD OF A LIST THE PAGE DOES NOT SHOW keeps its own answer: an archived
   * list is not drawn, its field still is, and the page asks the answer for the
   * lists its fields are kept to as well as for those it draws.
   */
  const L3 = await made2('/lists', { projectId: VPROJECT, name: `${TAG} list three` }, 'list three')
  const THREE = `${TAG} Stage three`
  const threeId = await field(VPROJECT, { name: THREE, listId: L3 }, 'the field kept to list three')
  const archived = await A(`/lists/${L3}`, { method: 'DELETE' })
  if (!archived.ok) throw new Error(`could not archive list three: ${archived.status}`)
  const aThree = await fieldsOffered(aPage, { spaceId: VSPACE, projectId: VPROJECT, shown: THREE })
  const threeOffered = await aThree.section.getByRole('button', { name: `Delete field ${THREE}`, exact: true }).count()
  chk(
    threeOffered === 1,
    'and a field kept to a list the page does not show — an archived one — is offered its delete by that list’s own answer: the admin is offered it',
    `the admin is offered it ${threeOffered} time(s)`,
  )
  // And it still says it is kept to one list, whose name the page does not have.
  const scopeThree = await scopeOf(threeId)
  chk(
    scopeThree === 'Only on the tasks of one list',
    'and that field says it is only on the tasks of one list, the list it is kept to not being drawn on the page',
    `it reads ${JSON.stringify(scopeThree)}`,
  )

  /*
   * A REFUSAL IS SAID IN THE SERVER'S WORDS. The member is offered Add field and
   * a field's delete in the first project, whose space is Full edit; the space
   * is then turned to View only (by SQL, so the page is not told), and each
   * press is refused (403). The toasts are compared with what the routes answer.
   */
  const NOTES = `${TAG} Notes`
  const notesId = await field(PROJECT, { name: NOTES }, 'the first project’s field')
  const MEMBER_FIELD = `${TAG} member’s field`
  const mOffered = await fieldsOffered(mPage, { spaceId: SPACE, projectId: PROJECT, shown: NOTES })
  const toasts = () => mPage.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  const deleteNotes = mOffered.section.getByRole('button', { name: `Delete field ${NOTES}`, exact: true })
  const notesDeleteOffered = await deleteNotes.count()
  // The form is opened and filled while the space still lets them; the presses come after it stops.
  await mOffered.section.getByRole('button', { name: 'Add field', exact: true }).click({ timeout: 5000 }).catch(() => {})
  await mPage.getByPlaceholder('Field name (e.g. Sprint, Risk level)').fill(MEMBER_FIELD, { timeout: 5000 }).catch(() => {})
  await sql`update spaces set default_permission = 'view' where id = ${SPACE}`
  await mOffered.section.getByRole('button', { name: 'Create field', exact: true }).click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await toasts()).length >= 1, { timeoutMs: 10_000 })
  const afterCreate = await toasts()
  // The create's toast goes first (a toast stays four seconds), so the delete's is read on its own.
  await waitUntil(async () => (await toasts()).length === 0, { timeoutMs: 10_000 })
  await deleteNotes.click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await toasts()).length >= 1, { timeoutMs: 10_000 })
  const afterDelete = await toasts()
  const refusedCreate = await M(`/workspaces/${WS}/projects/${PROJECT}/custom-fields`, { method: 'POST', body: { name: MEMBER_FIELD, type: 'text' } })
  const refusedDelete = await M(`/workspaces/${WS}/custom-fields/${notesId}`, { method: 'DELETE' })
  const createWords = refusedCreate.error?.message ?? null
  const deleteWords = refusedDelete.error?.message ?? null
  const [notesRow] = await sql`select name from custom_field_definitions where id = ${notesId}`
  const [{ n: memberMade }] = await sql`select count(*)::int as n from custom_field_definitions where project_id = ${PROJECT} and name = ${MEMBER_FIELD}`
  const sayingIt = (list, words) => !!words && list.filter((t) => t.includes(words)).length
  chk(
    mOffered.add === 1 && notesDeleteOffered === 1 && refusedCreate.status === 403 && refusedDelete.status === 403
      && sayingIt(afterCreate, createWords) >= 1 && sayingIt(afterDelete, deleteWords) >= 1
      && notesRow?.name === NOTES && memberMade === 0,
    'a field’s create and delete refused since the page was drawn are each said in the server’s words, and nothing changes (read by SQL)',
    `offered Add field ${mOffered.add} and the delete ${notesDeleteOffered}; the routes answer ${refusedCreate.status} ${JSON.stringify(createWords)} and ${refusedDelete.status} ${JSON.stringify(deleteWords)}; ` +
      `the toasts after Create ${JSON.stringify(afterCreate)}, after delete ${JSON.stringify(afterDelete)}; the field is ${notesRow ? 'still there' : 'gone'}, the member made ${memberMade}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
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
