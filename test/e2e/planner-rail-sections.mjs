/**
 * "+ ADD A NEW SECTION" IN THE PLANNER'S RAIL (`commit-log/log-716d25c-1`,
 * `ledger-rows/row-835`).
 *
 * Frame `14:14`, Calendar settings › Sidebar, draws `+ Add a new section` under
 * the five, and nothing drew it: no frame says what a new section holds. Nor do
 * ClickUp's Planner pages. ClickUp's own custom sections are the Home
 * Sidebar's (its help centre, through search excerpts): + › Section, a name and
 * an optional emoji; items put in through the section's + and a search; each
 * item in one section at a time; sections dragged among the others in
 * Customize › Sections; and deleting one leaves what it held. So a section
 * here is the person's own, in one workspace, holding tasks they put in it,
 * placed among the five, deleted rather than hidden.
 *
 * Every check reads the rail AND the server (or Postgres): a page that drew a
 * section it never saved fails, and so does a server whose sections no rail
 * draws. And whose: a section is its maker's, a task goes in only when they may
 * open it, and a colleague reaches none of it.
 *
 * ITS OWN PEOPLE: planner settings are a person's own, so a newcomer's rail is
 * the one ordered here, in workspaces this suite makes.
 *
 *   node test/e2e/planner-rail-sections.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const EXPECTED_CHECKS = 11

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
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const FIVE = ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog']
const stamp = Date.now()
const TAG = `prs${stamp}`
const PASSWORD = 'RailSections@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
let sql = null
let browser = null
let A = null
/** Each workspace made, with the session that may delete it. */
const workspacesMade = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the stored order is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const makeWorkspace = async (name) => {
    const made = await A('/workspaces', { method: 'POST', body: { name } })
    if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace "${name}": ${said(made)}`)
    workspacesMade.push({ id: made.data.id, as: A })
    return made.data.id
  }
  const WS = await makeWorkspace(`Rail sections ${TAG}`)
  const WS2 = await makeWorkspace(`Rail sections elsewhere ${TAG}`)

  /** A newcomer, a member of the workspaces named: their planner is their own. */
  const newcomer = async (who, workspaces) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Rail ${who} ${TAG}`, email, password: PASSWORD,
      organizationName: `Rail ${who} ${stamp}`, organizationSlug: `rail-${who}-${stamp}`,
    })
    const as = apiAs(signed.accessToken)
    if (signed.workspaces?.[0]?.id) workspacesMade.push({ id: signed.workspaces[0].id, as })
    for (const ws of workspaces) {
      const added = await A(`/workspaces/${ws}/members`, { method: 'POST', body: { email, role: 'member' } })
      if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    }
    if (!signed.user?.id) throw new Error(`the sign-up of ${who} answered with no user id`)
    return { email, as, id: signed.user.id }
  }
  const P = await newcomer('planner', [WS, WS2])
  const C = await newcomer('colleague', [WS])

  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [hidden] = await sql`insert into lists (project_id, name, visibility, created_by_id) values (${project.id}, ${`Private ${TAG}`}, 'private', ${auth.user.id}) returning id`
  const task = async (title, listId = list.id) => (await sql`insert into tasks (list_id, title) values (${listId}, ${title}) returning id`)[0].id
  const T1 = await task(`Draft the brief ${TAG}`)
  const T2 = await task(`Review the draft ${TAG}`)
  const T3 = await task(`Thrown away ${TAG}`)
  const T4 = await task(`Block time for ${TAG}`)
  const TP = await task(`Not theirs to see ${TAG}`, hidden.id)
  const [space2] = await sql`insert into spaces (workspace_id, name) values (${WS2}, ${`Space ${TAG}`}) returning id`
  const [project2] = await sql`insert into projects (space_id, name) values (${space2.id}, ${`Project ${TAG}`}) returning id`
  const [list2] = await sql`insert into lists (project_id, name) values (${project2.id}, ${`List ${TAG}`}) returning id`
  const T_OTHER = await task(`Of the other workspace ${TAG}`, list2.id)

  /** The order as Postgres holds it: null while nothing is stored. */
  const stored = async () =>
    (await sql`select planner_settings from users where id = ${P.id}`)[0]?.planner_settings?.railSections ?? null
  const sectionsOf = async (as, ws = WS) => {
    const res = await as(`/planner/${ws}/sections`)
    return res.ok && Array.isArray(res.data) ? res.data : []
  }

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', P.email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** The rail's sections as drawn, top to bottom. */
  const rail = () =>
    page
      .locator('[data-testid="planner-rail"] [data-rail-section]')
      .evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => el.getAttribute('data-rail-section')))
      .catch(() => [])
  const ownSection = (id) => page.locator(`[data-testid="planner-own-section"][data-section-id="${id}"]`)
  const itemsOf = (id) =>
    ownSection(id)
      .locator('[data-testid="planner-own-section-item"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-task-id')))
      .catch(() => [])
  const openPlanner = async () => {
    const answered = page
      .waitForResponse(
        (res) => res.request().method() === 'GET' && /\/api\/v1\/planner\/[^/]+\/sections$/.test(new URL(res.url()).pathname),
        { timeout: 25_000 },
      )
      .then((res) => res.status() === 200, () => false)
    await page.goto(`${B}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
    const drawn = await waitUntil(async () => (await page.locator('[data-testid="planner-rail"] [data-rail-section]').count()) > 0, { timeoutMs: 25_000 })
    return (await answered) && drawn
  }
  const openSidebarPage = async () => {
    await page.getByTestId('planner-settings').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('planner-settings-nav-sidebar').click({ timeout: 10_000 }).catch(() => {})
    return waitUntil(async () => (await page.locator('[data-testid="planner-rail-row"]').count()) >= FIVE.length, { timeoutMs: 10_000 })
  }
  const closeDialog = async () => {
    await page.keyboard.press('Escape')
    await waitUntil(async () => (await page.getByTestId('planner-settings-dialog').count()) === 0, { timeoutMs: 5000 })
  }
  /** A drag by the row's name onto another row, as `rail-reorder` drags them. */
  const dragRow = async (from, onto) => {
    const row = (section) => page.locator(`[data-testid="planner-rail-row"][data-section="${section}"]`)
    await waitUntil(async () => {
      const one = await row(from).boundingBox({ timeout: 2000 }).catch(() => null)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const two = await row(from).boundingBox({ timeout: 2000 }).catch(() => null)
      return !!one && !!two && one.x === two.x && one.y === two.y && one.width === two.width
    }, { timeoutMs: 5000 })
    const a = await row(from).boundingBox({ timeout: 5000 }).catch(() => null)
    const b = await row(onto).boundingBox({ timeout: 5000 }).catch(() => null)
    if (!a || !b) return false
    const x = a.x + a.width / 3
    const y = a.y + a.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 10, { steps: 4 })
    await page.mouse.move(x, b.y + b.height / 2 - 4, { steps: 20 })
    await page.mouse.up()
    return true
  }

  // ══ 1. + ADD A NEW SECTION ═════════════════════════════════════════════════
  console.log('\n▶ the Sidebar page’s “+ Add a new section”')
  await openPlanner()
  await openSidebarPage()
  await page.getByTestId('planner-rail-add-section').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('planner-rail-new-emoji').fill('🎯', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('planner-rail-new-name').fill(`Focus ${TAG}`, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('planner-rail-new-save').click({ timeout: 5000 }).catch(() => {})
  let S1 = null
  await waitUntil(async () => {
    S1 = (await sectionsOf(P.as)).find((s) => s.name === `Focus ${TAG}`) ?? null
    return !!S1
  }, { timeoutMs: 10_000 })
  const S1KEY = `section:${S1?.id}`
  const rowShown = S1 ? await waitUntil(async () => (await page.locator(`[data-testid="planner-rail-row"][data-section="${S1KEY}"]`).count()) === 1, { timeoutMs: 8000 }) : false
  await closeDialog()
  const railNow = await rail()
  const heading = S1
    // The words, not as drawn: the rail's headings are set in capitals, every one of them.
    ? `${await ownSection(S1.id).getByTestId('planner-own-section-emoji').filter({ visible: true }).textContent({ timeout: 5000 }).catch(() => '')} ${await ownSection(S1.id).getByTestId('planner-own-section-name').filter({ visible: true }).textContent({ timeout: 5000 }).catch(() => '')}`
    : ''
  chk(
    !!S1 && S1.emoji === '🎯' && rowShown && same(railNow, [...FIVE, S1KEY]) && heading === `🎯 Focus ${TAG}`,
    '“+ Add a new section” makes a section with its name and emoji: the Sidebar page lists it, the rail draws it at its foot under that heading, and the server holds it',
    `held ${JSON.stringify(S1 && { name: S1.name, emoji: S1.emoji })}; listed on the page ${rowShown}; rail ${JSON.stringify(railNow)}; heading ${JSON.stringify(heading)}`,
  )

  // ══ 2. A TASK PUT IN BY ITS + ══════════════════════════════════════════════
  console.log('\n▶ the section’s +, and a search for the task')
  if (S1) {
    await ownSection(S1.id).getByTestId('planner-own-section-add').click({ timeout: 5000 }).catch(() => {})
    await ownSection(S1.id).getByTestId('planner-own-section-search').fill(`Draft the brief ${TAG}`, { timeout: 5000 }).catch(() => {})
    const pick = ownSection(S1.id).locator(`[data-testid="planner-own-section-pick"][data-task-id="${T1}"]`)
    await pick.click({ timeout: 10_000 }).catch(() => {})
  }
  const listed = S1 ? await waitUntil(async () => same(await itemsOf(S1.id), [T1]), { timeoutMs: 10_000 }) : false
  const heldAfterPick = S1 ? (await sectionsOf(P.as)).find((s) => s.id === S1.id)?.tasks.map((t) => t.id) ?? [] : []
  chk(
    listed && same(heldAfterPick, [T1]),
    'its + finds a task by its title and puts it in: the rail lists it under the section, and the server holds it there',
    `the rail lists ${JSON.stringify(S1 ? await itemsOf(S1.id) : null)}; the server ${JSON.stringify(heldAfterPick)}`,
  )

  // ══ 3. ONE SECTION AT A TIME ═══════════════════════════════════════════════
  console.log('\n▶ the same task put in a second section')
  const s2 = await P.as(`/planner/${WS}/sections`, { method: 'POST', body: { name: `Later ${TAG}` } })
  const S2 = s2.data
  const moved = S2?.id ? await P.as(`/planner/${WS}/sections/${S2.id}/tasks`, { method: 'POST', body: { taskId: T1 } }) : { status: 0 }
  await openPlanner()
  const s1Empty = S1 ? await waitUntil(async () => (await ownSection(S1.id).getByTestId('planner-own-section-empty').count()) === 1, { timeoutMs: 10_000 }) : false
  const s2Items = S2?.id ? await itemsOf(S2.id) : []
  const afterMove = await sectionsOf(P.as)
  chk(
    s2.status === 201 && moved.status === 201 && s1Empty && same(s2Items, [T1]) &&
      same(afterMove.find((s) => s.id === S1?.id)?.tasks.map((t) => t.id), []) &&
      same(afterMove.find((s) => s.id === S2?.id)?.tasks.map((t) => t.id), [T1]),
    'a task is in one of a person’s sections at a time: put in another, it moves — the first says it is empty, the second lists it',
    `made ${said(s2)}; put ${said(moved)}; first empty ${s1Empty}; second draws ${JSON.stringify(s2Items)}; server ${JSON.stringify(afterMove.map((s) => [s.name, s.tasks.map((t) => t.id)]))}`,
  )

  // ══ 4. PLACED AMONG THE FIVE ═══════════════════════════════════════════════
  console.log('\n▶ the section dragged above Priorities')
  await openSidebarPage()
  const dragged = await dragRow(S1KEY, 'priorities')
  const storedFirst = await waitUntil(async () => (await stored())?.[0] === S1KEY, { timeoutMs: 10_000 })
  await closeDialog()
  await openPlanner()
  const railDragged = await rail()
  chk(
    dragged && storedFirst && railDragged[0] === S1KEY && railDragged.indexOf('priorities') === 1,
    'dragged above Priorities on the Sidebar page, it is first in the rail, and the order is kept',
    `dragged ${dragged}; stored ${JSON.stringify(await stored())}; rail ${JSON.stringify(railDragged)}`,
  )

  // ══ 5. ANOTHER WORKSPACE'S ORDER ═══════════════════════════════════════════
  console.log('\n▶ the order saved from the planner’s other workspace')
  const s3 = await P.as(`/planner/${WS2}/sections`, { method: 'POST', body: { name: `Elsewhere ${TAG}` } })
  const S3KEY = `section:${s3.data?.id}`
  const fromWs2 = await P.as(`/planner/${WS2}/settings`, { method: 'PATCH', body: { railSections: ['priorities', S3KEY, 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'] } })
  const orderAfter = await stored()
  await openPlanner()
  const railKept = await rail()
  chk(
    s3.status === 201 && fromWs2.status === 200 && orderAfter?.[0] === S1KEY && orderAfter?.indexOf(S3KEY) === 2 && railKept[0] === S1KEY && !railKept.includes(S3KEY),
    'an order saved from the other workspace keeps this one’s section where it stood, and each rail draws only its own',
    `made ${said(s3)}; saved ${said(fromWs2)}; stored ${JSON.stringify(orderAfter)}; this rail ${JSON.stringify(railKept)}`,
  )

  // ══ 6. A COLLEAGUE'S REACH ═════════════════════════════════════════════════
  console.log('\n▶ a colleague in the same workspace')
  const theirs = await sectionsOf(C.as)
  const cAdd = await C.as(`/planner/${WS}/sections/${S2?.id}/tasks`, { method: 'POST', body: { taskId: T2 } })
  const cDelete = await C.as(`/planner/${WS}/sections/${S2?.id}`, { method: 'DELETE' })
  const cRename = await C.as(`/planner/${WS}/sections/${S2?.id}`, { method: 'PATCH', body: { name: 'Mine now' } })
  const cOrder = await C.as(`/planner/${WS}/settings`, { method: 'PATCH', body: { railSections: [S1KEY, ...FIVE] } })
  const stillThere = (await sectionsOf(P.as)).find((s) => s.id === S2?.id)
  chk(
    theirs.length === 0 && cAdd.status === 404 && cDelete.status === 404 && cRename.status === 404 && cOrder.status === 400 &&
      stillThere?.name === `Later ${TAG}` && same(stillThere?.tasks.map((t) => t.id), [T1]),
    'a section is its maker’s: a colleague is listed none of theirs, reaches none of them (404) and cannot place one in their own rail (400)',
    `listed ${theirs.length}; put ${said(cAdd)}; deleted ${said(cDelete)}; renamed ${said(cRename)}; ordered ${said(cOrder)}; the section now ${JSON.stringify(stillThere && { name: stillThere.name, tasks: stillThere.tasks.map((t) => t.id) })}`,
  )

  // ══ 7. ONLY WHAT THEY MAY OPEN ═════════════════════════════════════════════
  console.log('\n▶ a task the planner may not open, and one of another workspace')
  const privatePut = await P.as(`/planner/${WS}/sections/${S1?.id}/tasks`, { method: 'POST', body: { taskId: TP } })
  const otherPut = await P.as(`/planner/${WS}/sections/${S1?.id}/tasks`, { method: 'POST', body: { taskId: T_OTHER } })
  chk(
    privatePut.status === 403 && privatePut.error?.message === 'This list is private' && otherPut.status === 404,
    'a task goes in only when its putter may open it — a private list’s is refused saying why — and only from this workspace',
    `private ${said(privatePut)}; other workspace ${said(otherPut)}`,
  )

  // ══ 8. ARCHIVED AND IN THE TRASH ═══════════════════════════════════════════
  console.log('\n▶ a task archived after it was put in, and one in the trash')
  const putT2 = await P.as(`/planner/${WS}/sections/${S2?.id}/tasks`, { method: 'POST', body: { taskId: T2 } })
  await sql`update tasks set is_archived = true, archived_at = now() where id = ${T2}`
  await sql`update tasks set is_archived = true, deleted_at = now() where id = ${T3}`
  const afterArchive = (await sectionsOf(P.as)).find((s) => s.id === S2?.id)?.tasks.map((t) => t.id)
  const trashPut = await P.as(`/planner/${WS}/sections/${S2?.id}/tasks`, { method: 'POST', body: { taskId: T3 } })
  chk(
    putT2.status === 201 && same(afterArchive, [T1]) && trashPut.status === 400 && /trash/.test(trashPut.error?.message ?? ''),
    'an archived task drops off its section, and one in the trash is not put in, saying so',
    `put ${said(putT2)}; listed after archiving ${JSON.stringify(afterArchive)}; trash ${said(trashPut)}`,
  )

  // ══ 9. WHAT A SECTION IS CALLED ════════════════════════════════════════════
  console.log('\n▶ names and emoji the server refuses')
  const tooLong = await P.as(`/planner/${WS}/sections`, { method: 'POST', body: { name: 'x'.repeat(61) } })
  const noName = await P.as(`/planner/${WS}/sections`, { method: 'POST', body: { name: '   ' } })
  const wordEmoji = await P.as(`/planner/${WS}/sections`, { method: 'POST', body: { name: 'Words', emoji: 'ab' } })
  const countNow = (await sectionsOf(P.as)).length
  chk(
    tooLong.status === 400 && noName.status === 400 && wordEmoji.status === 400 && countNow === 2,
    'a name past 60 characters, a blank one, and words for an emoji are refused, and nothing is made',
    `61 characters ${said(tooLong)}; blank ${said(noName)}; "ab" ${said(wordEmoji)}; sections now ${countNow}`,
  )

  // ══ 10. DROPPED ON THE GRID ════════════════════════════════════════════════
  console.log('\n▶ a task in one’s own section dropped on the grid')
  const putT4 = await P.as(`/planner/${WS}/sections/${S1?.id}/tasks`, { method: 'POST', body: { taskId: T4 } })
  await openPlanner()
  const item = ownSection(S1?.id).locator(`[data-testid="planner-own-section-item"][data-task-id="${T4}"]`)
  const column = page.locator('[data-testid="planner-day-column"]').first()
  // Home first, and until it is read: the grid jumps to the current hour (as `planner-grid` aims its drop).
  const scrollHome = () => page.evaluate(() => {
    let el = document.querySelector('[data-testid="planner-day-column"]')?.parentElement
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement
    if (el) el.scrollTop = 0
  })
  const viewportHeight = page.viewportSize()?.height ?? 0
  let homeBox = null
  await waitUntil(async () => {
    await scrollHome()
    const first = await column.boundingBox({ timeout: 2000 }).catch(() => null)
    await page.waitForTimeout(100)
    const then = await column.boundingBox({ timeout: 2000 }).catch(() => null)
    homeBox = then
    return !!first && !!then && first.y === then.y && then.y >= 0 && then.y + 127 < viewportHeight
  }, { timeoutMs: 8000, lastLookGraceMs: 5000 })
  const from = await item.boundingBox({ timeout: 6000 }).catch(() => null)
  const to = homeBox
  if (from && to) {
    await page.mouse.move(from.x + 12, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + 127, { steps: 8 })
    await page.mouse.up()
  }
  const weekFrom = new Date(Date.now() - 8 * 86_400_000).toISOString()
  const weekTo = new Date(Date.now() + 8 * 86_400_000).toISOString()
  let blocked = false
  await waitUntil(async () => {
    const blocks = await P.as(`/planner/${WS}/blocks?from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(weekTo)}`)
    blocked = Array.isArray(blocks.data) && blocks.data.some((b) => b.taskId === T4)
    return blocked
  }, { timeoutMs: 10_000 })
  chk(
    putT4.status === 201 && !!from && !!to && blocked,
    'a task in one’s own section is picked up and dropped on the grid as Backlog’s are, and blocks time for it',
    `put ${said(putT4)}; dragged ${!!from && !!to}; a block for it ${blocked}`,
  )

  // ══ 11. DELETED ════════════════════════════════════════════════════════════
  console.log('\n▶ the second section deleted on the Sidebar page')
  // It was there to delete: on the server, and as a row with its delete.
  const before = !!S2?.id && (await sectionsOf(P.as)).some((s) => s.id === S2.id)
  await openSidebarPage()
  const offered = !!S2?.id && (await page.getByTestId(`planner-rail-section-delete-${S2.id}`).count()) === 1
  await page.getByTestId(`planner-rail-section-delete-${S2?.id}`).click({ timeout: 8000 }).catch(() => {})
  const gone = await waitUntil(async () => !(await sectionsOf(P.as)).some((s) => s.id === S2?.id), { timeoutMs: 10_000 })
  await closeDialog()
  await openPlanner()
  const railAfter = await rail()
  const [t1] = await sql`select title, list_id, is_archived, deleted_at from tasks where id = ${T1}`
  const orderLeft = await stored()
  chk(
    before && offered && gone && !railAfter.includes(`section:${S2?.id}`) && !(orderLeft ?? []).includes(`section:${S2?.id}`) &&
      t1?.title === `Draft the brief ${TAG}` && t1?.list_id === list.id && t1?.is_archived === false && t1?.deleted_at === null,
    'deleting a section takes it off the rail and out of the order, and the task it held stays as it was',
    `there before ${before}, its delete offered ${offered}; gone ${gone}; rail ${JSON.stringify(railAfter)}; order ${JSON.stringify(orderLeft)}; the task ${JSON.stringify(t1)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  const leftBehind = []
  for (const { id, as } of workspacesMade) {
    const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
