/**
 * EVERYBODY HAS A PERSONAL LIST, WHERE A TASK WITH NO PLACE GOES
 * (`found-24-sep/planner-default-list-read-by-nothing`).
 *
 * ClickUp (help centre, "Use Personal List", "Create and add tasks to your
 * Personal List" and "My Tasks", through search excerpts, 9 October): "Your
 * Personal List is the default location for new tasks" — a task made with no
 * location lands there; it is under My Tasks in Home, "not part of the
 * Workspace hierarchy", and a task moved into it takes its sharing, so only
 * those with access to it see it. Renaming it is still asked for on ClickUp's
 * feedback board.
 *
 * Measured before it was built (9 October, the main lanes): Home's "Personal
 * List" was a to-do card of its own (`personal_tasks`) whose rows opened
 * nothing and moved nowhere; `/task` with no list chosen filed into the oldest
 * list the person could add to — a list of the hierarchy, open to everybody
 * who could open it; the Move picker had no Personal List; and there was no
 * `GET /workspaces/:id/personal-list` (404).
 *
 * A workspace of this run's own, made by Olga, who owns it — an account like
 * any other, not the platform's admin, who reads anything by id — two members
 * (Mia and Max) and a guest, a shared list with a task in it. Mia had two to-dos in
 * the old card before her Personal List existed, planted by SQL as the old
 * card wrote them.
 *
 *   node test/e2e/personal-list.mjs --api 3011 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 13

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// The API's own words (`container-access.ts`, `personal-tasks.service.ts`).
const KEEPS_ITS_PLACE = 'A Personal List keeps its name and its place: it cannot be renamed, moved or deleted'
const HOLDS_TASKS = 'A Personal List holds tasks: nothing else can be made in it'
const NO_GUEST_LIST = 'Guests have no Personal List'
const NO_FORM_INTO_IT = 'A form cannot file into a Personal List'

const stamp = Date.now()
const TAG = `pl${stamp}`
const PASSWORD = 'PersonalList@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const refused = (res) => res.status === 403 || res.status === 404

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — where each task lands is read back by SQL')
  const owner = await signUpApi(API, { fullName: `olga ${stamp}`, email: `${TAG}-olga@rundesk.invalid`, password: PASSWORD, organizationName: `Personal olga ${stamp}`, organizationSlug: `personal-olga-${stamp}` })
  A = apiAs(owner.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Personal ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Personal ${who} ${stamp}`, organizationSlug: `personal-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    return { email, id: signed.user.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const gus = await person('gus', 'guest')
  const M = mia.api

  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const shared = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} shared list` } })
  if (!shared.ok) throw new Error(`could not make the shared list: ${said(shared)}`)
  const MOVING_TITLE = `Book the venue ${TAG}`
  const moving = await A('/tasks', { method: 'POST', body: { listId: shared.data.id, title: MOVING_TITLE } })
  if (!moving.ok || !moving.data?.id) throw new Error(`could not make the shared task: ${said(moving)}`)

  // ══ 1. THE OLD CARD'S TO-DOS ═════════════════════════════════════════════
  console.log('\n▶ Mia’s two to-dos from the old card, the first time her Personal List is asked for')
  const OLD_OPEN = `Call the bank ${TAG}`
  const OLD_DONE = `Renew the passport ${TAG}`
  await sql`insert into personal_tasks (workspace_id, user_id, title, done, position) values (${WS}, ${mia.id}, ${OLD_OPEN}, false, 0), (${WS}, ${mia.id}, ${OLD_DONE}, true, 1)`
  const home = await M(`/workspaces/${WS}/personal-tasks`)
  const rows = Array.isArray(home.data) ? home.data : []
  const [mine] = await sql`
    select l.id, l.name, l.visibility, p.id as project_id, s.id as space_id, s.is_personal from lists l
    join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
    where s.workspace_id = ${WS} and l.personal_of = ${mia.id}`
  const moved = mine ? await sql`select title, status_category from tasks where list_id = ${mine.id} and title in (${OLD_OPEN}, ${OLD_DONE})` : []
  const [{ n: oldLeft }] = await sql`select count(*)::int as n from personal_tasks where workspace_id = ${WS} and user_id = ${mia.id}`
  const category = (t) => moved.find((r) => r.title === t)?.status_category ?? null
  chk(
    home.ok && rows.some((r) => r.title === OLD_OPEN && r.done === false) && rows.some((r) => r.title === OLD_DONE && r.done === true)
      && !!mine && mine.is_personal === true && mine.visibility === 'private' && mine.name === 'Personal List'
      && category(OLD_OPEN) !== 'closed' && category(OLD_DONE) === 'closed' && oldLeft === 0,
    'the to-dos the old card kept are her Personal List’s first tasks — the done one done — in a private list of hers in the workspace’s personal space, and none is left in the old card (read by SQL)',
    `Home ${said(home)} listed ${JSON.stringify(rows.map((r) => [r.title.slice(0, 14), r.done]))}; her list ${JSON.stringify(mine ?? null)}; the tasks ${JSON.stringify(moved)}; ${oldLeft} left in the old card`,
  )
  if (!mine) throw new Error('Mia has no Personal List to go on with')
  const PERSONAL = mine.id

  // ══ 2. A TASK WITH NO PLACE ══════════════════════════════════════════════
  console.log('\n▶ /task in a channel, no list chosen')
  const channel = await M(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-mia` } })
  if (!channel.ok || !channel.data?.id) throw new Error(`could not make Mia’s channel: ${said(channel)}`)
  const SLASH = `Send the invoice ${TAG}`
  const slash = await M(`/chat/channels/${channel.data.id}/commands`, { method: 'POST', body: { command: 'task', text: SLASH } })
  const [slashed] = await sql`select id, list_id from tasks where title = ${SLASH}`
  const listed = ((await M(`/workspaces/${WS}/personal-tasks`)).data ?? []).some((r) => r.id === slashed?.id)
  const place = await M(`/workspaces/${WS}/personal-list`)
  chk(
    slash.ok && slashed?.list_id === PERSONAL && listed && place.ok && place.data?.id === PERSONAL && place.data?.openCount === 2,
    'a task made with no list chosen — /task — lands in her Personal List, and Home lists it, the list counting her two open tasks',
    `/task ${said(slash)}, the task in ${slashed?.list_id === PERSONAL ? 'her Personal List' : JSON.stringify(slashed?.list_id ?? null)}; Home lists it: ${listed}; the list ${said(place)} ${JSON.stringify(place.data ?? null)}`,
  )
  const SLASHED = slashed?.id

  // ══ 3. HERS ALONE ════════════════════════════════════════════════════════
  console.log('\n▶ Max, the guest and the workspace’s owner reach for it')
  // Search reads an index written as the task is made: let it see the task for her first.
  await waitUntil(async () => JSON.stringify((await M(`/search/${WS}?q=${encodeURIComponent(SLASH)}`)).data ?? null).includes(SLASHED), { timeoutMs: 15_000 })
  const reach = async (C) => ({
    task: (await C(`/tasks/${SLASHED}`)).status,
    list: (await C(`/lists/${PERSONAL}`)).status,
    tasks: (await C(`/tasks/list/${PERSONAL}`)).status,
    found: JSON.stringify((await C(`/search/${WS}?q=${encodeURIComponent(SLASH)}`)).data ?? null).includes(SLASHED),
  })
  const [byMax, byGus, byOwner, byMia] = [await reach(max.api), await reach(gus.api), await reach(A), await reach(M)]
  const kept = (r) => [r.task, r.list, r.tasks].every((s) => s === 403 || s === 404) && !r.found
  chk(
    !!SLASHED && kept(byMax) && kept(byGus) && kept(byOwner) && byMia.task === 200 && byMia.list === 200 && byMia.found,
    'it is hers alone: Max, the guest and the workspace’s owner are each refused its task and its list by id, and search finds it for none of them — it does for her',
    `Max ${JSON.stringify(byMax)}; the guest ${JSON.stringify(byGus)}; the owner ${JSON.stringify(byOwner)}; Mia ${JSON.stringify(byMia)}`,
  )

  // ══ 4. NOBODY SHAPES IT ══════════════════════════════════════════════════
  console.log('\n▶ renaming, moving, deleting it — and making something else in its place')
  const rename = await M(`/lists/${PERSONAL}`, { method: 'PUT', body: { name: `Mine ${TAG}` } })
  const relocate = await M(`/lists/${PERSONAL}/move`, { method: 'POST', body: { projectId: project.data.id } })
  const remove = await M(`/lists/${PERSONAL}`, { method: 'DELETE' })
  const ownerRemove = await A(`/lists/${PERSONAL}`, { method: 'DELETE' })
  const caps = await M(`/lists/${PERSONAL}/capabilities`)
  const [still] = await sql`select name, project_id, is_archived from lists where id = ${PERSONAL}`
  chk(
    rename.status === 403 && rename.message === KEEPS_ITS_PLACE && relocate.status === 403 && relocate.message === KEEPS_ITS_PLACE
      && remove.status === 403 && remove.message === KEEPS_ITS_PLACE && refused(ownerRemove)
      && caps.ok && caps.data?.manage === false && caps.data?.delete === false
      && still?.name === 'Personal List' && still?.project_id === mine.project_id && still?.is_archived === false,
    'nobody renames, moves or deletes it: Mia is refused each in words (403), the owner is refused too, its menus are told so, and it is as it was (read by SQL)',
    `rename ${said(rename)}; move ${said(relocate)}; delete ${said(remove)}; the owner’s delete ${said(ownerRemove)}; capabilities ${JSON.stringify(caps.data ?? null)}; the list ${JSON.stringify(still ?? null)}`,
  )
  const aList = await M('/lists', { method: 'POST', body: { projectId: mine.project_id, name: `${TAG} a list beside it` } })
  const aFolder = await M(`/spaces/${mine.space_id}/folders`, { method: 'POST', body: { name: `${TAG} a folder` } })
  const aDoc = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} a doc`, spaceId: mine.space_id } })
  const aForm = await M(`/workspaces/${WS}/forms`, { method: 'POST', body: { title: `${TAG} a form`, targetListId: PERSONAL } })
  const renameSpace = await A(`/spaces/${mine.space_id}`, { method: 'PUT', body: { name: `${TAG} renamed` } })
  const [{ n: besides }] = await sql`
    select (select count(*) from lists where project_id = ${mine.project_id} and personal_of is null)
         + (select count(*) from folders where space_id = ${mine.space_id})
         + (select count(*) from docs where space_id = ${mine.space_id})
         + (select count(*) from forms where target_list_id = ${PERSONAL})::int as n`
  const [personalSpace] = await sql`select name from spaces where id = ${mine.space_id}`
  chk(
    aList.status === 403 && aList.message === HOLDS_TASKS && aFolder.status === 403 && aFolder.message === HOLDS_TASKS
      && aDoc.status === 403 && aDoc.message === HOLDS_TASKS && aForm.status === 400 && aForm.message === NO_FORM_INTO_IT
      && refused(renameSpace) && Number(besides) === 0 && personalSpace?.name === 'Personal',
    'and nothing but tasks is made in its place — a list, a folder, a doc each refused in words (403), and no form files into it (400) — and the owner does not rename the space it lives in (read by SQL)',
    `a list ${said(aList)}; a folder ${said(aFolder)}; a doc ${said(aDoc)}; a form ${said(aForm)}; the space renamed ${said(renameSpace)}; ${besides} made there; the space is ${JSON.stringify(personalSpace?.name ?? null)}`,
  )

  // ══ 5. NO PLACE IN THE HIERARCHY ═════════════════════════════════════════
  console.log('\n▶ the hierarchy’s reads: the sidebar’s spaces, search, the sync places, the onboarding counts')
  const spacesRead = await M(`/spaces/workspace/${WS}`)
  const spaceHit = JSON.stringify((await A(`/search/${WS}?q=Personal&types=space`)).data ?? null).includes(mine.space_id)
  const syncPlaces = await M(`/workspaces/${WS}/calendar-sync/places`)
  const pickers = await M(`/lists/workspace/${WS}`)
  // A workspace of Mia's own: what getting started counts there is not moved by her Personal List being made in it.
  const hers = await M('/workspaces', { method: 'POST', body: { name: `Mia's own ${TAG}` } })
  const counted = async () => (hers.ok ? await M(`/workspaces/${hers.data.id}/onboarding`) : { status: hers.status, data: null })
  const onboardingBefore = await counted()
  if (hers.ok && hers.data?.id) await M(`/workspaces/${hers.data.id}/personal-list`)
  const onboarding = await counted()
  const [{ n: hersPersonal }] = hers.ok ? await sql`select count(*)::int as n from spaces where workspace_id = ${hers.data.id} and is_personal` : [{ n: 0 }]
  const ids = (res) => (Array.isArray(res.data) ? res.data : []).map((s) => s.id)
  const placeIds = JSON.stringify(syncPlaces.data ?? null)
  chk(
    spacesRead.ok && !ids(spacesRead).includes(mine.space_id) && !spaceHit && syncPlaces.ok && !placeIds.includes(mine.space_id)
      && pickers.ok && !ids(pickers).includes(PERSONAL)
      && hersPersonal === 1 && onboarding.status === 200 && typeof onboardingBefore.data?.counts?.spaces === 'number'
      && onboarding.data?.counts?.spaces === onboardingBefore.data.counts.spaces && onboarding.data?.counts?.projects === onboardingBefore.data.counts.projects,
    'it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made',
    `the sidebar’s spaces ${spacesRead.status}, has it: ${ids(spacesRead).includes(mine.space_id)}; search finds the space: ${spaceHit}; the sync places ${syncPlaces.status}, has it: ${placeIds.includes(mine.space_id)}; the list picker ${pickers.status}, has it: ${ids(pickers).includes(PERSONAL)}; her own workspace’s personal spaces ${hersPersonal}, getting started counted ${JSON.stringify(onboardingBefore.data?.counts ?? null)} before and ${onboarding.status} ${JSON.stringify(onboarding.data?.counts ?? null)} after`,
  )
  if (hers.ok && hers.data?.id) await M(`/workspaces/${hers.data.id}`, { method: 'DELETE' })

  // ══ 6. A TASK MOVED IN TAKES ITS SHARING ═════════════════════════════════
  console.log('\n▶ the Move picker, and the shared task moved into her Personal List')
  const targets = await M(`/spaces/workspace/${WS}/move-targets`)
  const personalTargets = (Array.isArray(targets.data) ? targets.data : []).filter((s) => s.personal)
  const maxTargets = await max.api(`/spaces/workspace/${WS}/move-targets`)
  const maxOffered = JSON.stringify(maxTargets.data ?? null).includes(PERSONAL)
  const beforeMax = (await max.api(`/tasks/${moving.data.id}`)).status
  const moveIn = await M(`/tasks/${moving.data.id}/move`, { method: 'POST', body: { listId: PERSONAL } })
  const [movedRow] = await sql`select list_id from tasks where id = ${moving.data.id}`
  const afterMax = (await max.api(`/tasks/${moving.data.id}`)).status
  chk(
    personalTargets.length === 1 && personalTargets[0].lists?.length === 1 && personalTargets[0].lists[0].id === PERSONAL && !maxOffered
      && beforeMax === 200 && moveIn.ok && movedRow?.list_id === PERSONAL && (afterMax === 403 || afterMax === 404),
    'the Move picker offers her her own Personal List — and Max not hers — and the shared task moved into it takes its sharing: Max read it before, and is refused it after',
    `her Personal List entries ${JSON.stringify(personalTargets)}; Max offered hers: ${maxOffered}; Max read it ${beforeMax} before; the move ${said(moveIn)}, now in ${movedRow?.list_id === PERSONAL ? 'her Personal List' : JSON.stringify(movedRow?.list_id ?? null)}; Max reads it ${afterMax} after`,
  )

  // ══ 7. A GUEST HAS NONE ══════════════════════════════════════════════════
  console.log('\n▶ the guest’s Personal List')
  const gPlace = await gus.api(`/workspaces/${WS}/personal-list`)
  const gTasks = await gus.api(`/workspaces/${WS}/personal-tasks`)
  const gMake = await gus.api(`/workspaces/${WS}/personal-tasks`, { method: 'POST', body: { title: `${TAG} the guest's` } })
  const [{ n: gLists }] = await sql`select count(*)::int as n from lists where personal_of = ${gus.id}`
  chk(
    gPlace.status === 200 && gPlace.data === null && gTasks.status === 200 && Array.isArray(gTasks.data) && gTasks.data.length === 0
      && gMake.status === 403 && gMake.message === NO_GUEST_LIST && gLists === 0,
    'a guest has none: asked for, it is nothing; Home’s card of it is empty; adding to it is refused in words (403); and none is made (read by SQL)',
    `the list ${said(gPlace)} ${JSON.stringify(gPlace.data)}; Home ${said(gTasks)}; adding ${said(gMake)}; ${gLists} made`,
  )

  // ══ 8. HER TRASH, NOBODY ELSE'S ══════════════════════════════════════════
  console.log('\n▶ one of her tasks deleted, and the Trash')
  const binned = await M(`/personal-tasks/${SLASHED}`, { method: 'DELETE' })
  const trashOf = async (C) => {
    const res = await C(`/workspaces/${WS}/trash?types=task`)
    return { status: res.status, row: (Array.isArray(res.data?.items) ? res.data.items : []).find((r) => r.id === SLASHED) ?? null }
  }
  const [miaTrash, ownerTrash] = [await trashOf(M), await trashOf(A)]
  const ownerPurge = await A(`/workspaces/${WS}/trash/task/${SLASHED}`, { method: 'DELETE' })
  const [{ n: stillThere }] = await sql`select count(*)::int as n from tasks where id = ${SLASHED} and deleted_at is not null`
  chk(
    binned.ok && miaTrash.status === 200 && miaTrash.row?.location === 'Personal List'
      && ownerTrash.status === 200 && ownerTrash.row === null && ownerPurge.status === 404 && stillThere === 1,
    'deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)',
    `the delete ${said(binned)}; her Trash ${miaTrash.status} ${JSON.stringify(miaTrash.row)}; the owner’s ${ownerTrash.status} ${JSON.stringify(ownerTrash.row)}; the owner’s purge ${said(ownerPurge)}; still in the bin: ${stillThere}`,
  )

  // ══ 9–12. HOME, IN THE BROWSER ══════════════════════════════════════════
  console.log('\n▶ Home → Personal List, as Mia')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', mia.email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  await page.goto(`${B}/app/${WS}?section=personal-list`, { waitUntil: 'domcontentloaded' })
  const section = page.getByTestId('home-section-personal-list')
  const rowOf = (title) => section.getByTestId('home-personal-task').filter({ hasText: title })
  const drawn = await waitUntil(async () => (await rowOf(MOVING_TITLE).count()) === 1 && (await rowOf(OLD_OPEN).count()) === 1, { timeoutMs: 20_000 })
  // The sidebar's tree, once it has drawn the workspace's own space.
  await waitUntil(async () => (await page.getByTestId(`tree-space-${space.data.id}`).count()) > 0, { timeoutMs: 15_000 })
  const sidebarHas = await page.getByTestId(`tree-space-${mine.space_id}`).count()
  const sidebarShared = await page.getByTestId(`tree-space-${space.data.id}`).count()
  chk(
    drawn && (await rowOf(OLD_DONE).count()) === 1 && sidebarHas === 0 && sidebarShared === 1,
    'Home’s Personal List draws her tasks — the old to-dos and the task moved in — and the sidebar draws the workspace’s space and no personal one',
    `drawn: ${drawn} (the done one ${await rowOf(OLD_DONE).count()}); the sidebar draws the personal space ${sidebarHas} time(s), the shared one ${sidebarShared}`,
  )

  // A row is a task: it opens in its list, as Assigned to me's rows do.
  await rowOf(MOVING_TITLE).getByTestId('home-personal-task-open').click({ timeout: 8000 }).catch(() => {})
  const opened = await waitUntil(async () => page.url().includes(`task=${moving.data.id}`) && page.url().includes(`/${PERSONAL}`)
    && (await page.getByTestId('task-tab-overview').isVisible().catch(() => false)), { timeoutMs: 20_000 })
  chk(
    opened,
    'a row opens its task, in her Personal List, as any task opens',
    `the page went to ${page.url().replace(B, '')}; the task sheet open: ${await page.getByTestId('task-tab-overview').isVisible().catch(() => false)}`,
  )

  await page.goto(`${B}/app/${WS}?section=personal-list`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('home-personal-open-list').click({ timeout: 15_000 }).catch(() => {})
  const asList = await waitUntil(async () => page.url().includes(`/${mine.space_id}/${mine.project_id}/${PERSONAL}`)
    && (await page.getByText(OLD_OPEN, { exact: true }).first().isVisible().catch(() => false)), { timeoutMs: 20_000 })
  chk(
    asList,
    '“Open as a list” opens her Personal List as a list, her tasks in it',
    `the page went to ${page.url().replace(B, '')}; "${OLD_OPEN}" drawn: ${await page.getByText(OLD_OPEN, { exact: true }).first().isVisible().catch(() => false)}`,
  )

  // Added on Home, ticked on Home: a task of the list, made and closed.
  await page.goto(`${B}/app/${WS}?section=personal-list`, { waitUntil: 'domcontentloaded' })
  const ADDED = `Water the plants ${TAG}`
  const box = section.getByPlaceholder(/personal task/i)
  await box.fill(ADDED, { timeout: 15_000 }).catch(() => {})
  await box.press('Enter').catch(() => {})
  let addedRow = null
  await waitUntil(async () => (addedRow = (await sql`select id, list_id, status_category from tasks where title = ${ADDED}`)[0] ?? null) !== null, { timeoutMs: 15_000 })
  await rowOf(ADDED).getByRole('button', { name: 'Mark done', exact: true }).click({ timeout: 10_000 }).catch(() => {})
  let closedRow = null
  await waitUntil(async () => (closedRow = (await sql`select status_category from tasks where title = ${ADDED}`)[0] ?? null)?.status_category === 'closed', { timeoutMs: 15_000 })
  chk(
    addedRow?.list_id === PERSONAL && closedRow?.status_category === 'closed',
    'a to-do added on Home is a task of her Personal List, and ticking it closes the task (read by SQL)',
    `added: ${JSON.stringify(addedRow)}; after the tick: ${JSON.stringify(closedRow)}`,
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
