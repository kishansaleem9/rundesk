/**
 * §V2-S15 — FAVORITE AND ARCHIVE IN THE TASK MENU, frame `15:25`.
 *
 * The frame's task context menu runs:
 *
 *     Copy link | Copy ID | New tab
 *     Favorite · Unfollow task · Remind me in Inbox › · Move to › · Add to › ·
 *     Merge · Duplicate · Convert to › · … · Print · Send email to task ·
 *     Archive · Delete
 *
 * The re-audit recorded these two as "exist elsewhere, not in the task menu".
 * Half of that was true and the other half hid a worse problem.
 *
 * FAVORITE did exist — a star beside the "..." — just not in the menu.
 *
 * ARCHIVE DID NOT EXIST ANYWHERE, and the reason it looked absent is that it
 * was wearing the wrong name. `DELETE /tasks/:id` sets `isArchived`, stamps
 * `archivedAt`/`archivedById`, logs the activity as `archived`, lists the task
 * under `GET /workspaces/:id/archived-tasks` and restores it with
 * `POST /tasks/:id/restore`. Every layer called that archiving except the
 * button, which called it Delete and asked
 *
 *     "Delete this task? This cannot be undone."
 *
 * about an action that can be undone from Settings → Trash. That is not a
 * wording nit: a reversible action presented as permanent is one people avoid,
 * and it is why the product appeared to have no Archive.
 *
 * NO SECOND "DELETE" ITEM. The frame lists Archive and Delete separately;
 * Rundesk has one soft-archive and no permanent task delete. Adding a menu item
 * called "Delete" that fired this same request would be two names for one
 * behaviour — the facade this codebase has spent two videos removing. The gap
 * is recorded in the re-audit instead of being papered over.
 *
 * AGAINST THE REAL STACK, because the load-bearing claim is about what the row
 * looks like AFTER the action: archived, restorable, still there.
 *
 *   node test/e2e/task-menu-favorite-archive.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 11

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-menu-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads the archived flag directly')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Menu subject ${TAG}`}) returning id`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const taskUrl =
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })

  /*
   * Deterministic open. Clicking the trigger TOGGLES, so a helper that just
   * clicks will close a menu that is already open — and `waitUntil` answers
   * false without throwing, so the suite then sails on with the menu shut and
   * reports the next timeout as if the item were missing. Escape first, click
   * once, and refuse to continue unless it actually opened.
   */
  const menuItem = (id) => page.getByTestId(id).first()
  const openMenu = async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await waitUntil(
      async () => !(await menuItem('task-menu-favorite').isVisible().catch(() => false)),
      { timeoutMs: 5_000 },
    )
    await page.getByTestId('task-more-menu').click({ timeout: 20_000 })
    const opened = await waitUntil(
      () => menuItem('task-menu-favorite').isVisible().catch(() => false),
      { timeoutMs: 10_000 },
    )
    if (!opened) throw new Error('the task menu did not open')
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:25` — both items are in the menu')

  await page.getByTestId('task-more-menu').click({ timeout: 20_000 })
  chk(
    await waitUntil(
      () => menuItem('task-menu-favorite').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    ),
    'the task menu offers Favorite',
    'Favorite is only the star beside the "..." — the frame puts it in the menu',
  )
  chk(
    await menuItem('task-menu-archive').isVisible().catch(() => false),
    'and Archive',
    'there is no Archive in the task menu',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ Favorite actually pins, and the two controls agree')

  const favouritedInDb = async () => {
    const rows = await sql`
      select 1 from favorites where entity_type = 'task' and entity_id = ${task.id}`
    return rows.length > 0
  }
  chk(!(await favouritedInDb()), 'the task starts unpinned', 'the fixture was already a favourite')

  await menuItem('task-menu-favorite').click()
  chk(
    await waitUntil(favouritedInDb, { timeoutMs: 15_000 }),
    'choosing it pins the task for real, not just on screen',
    'nothing was written — the menu item changed a label and no favourite exists',
  )

  /*
   * THE ONE THAT MATTERS FOR FAVORITE. Two controls for one piece of state is
   * how they drift: the menu says "Remove from favorites" while the star sits
   * hollow. Both read the same hook, so both must have moved.
   */
  await openMenu()
  const menuLabel = (await readText(menuItem('task-menu-favorite'))).toLowerCase()
  chk(
    menuLabel.includes('remove'),
    'and reopening the menu offers to remove it',
    `the menu still reads "${menuLabel}" on a task that IS a favourite`,
  )
  await page.keyboard.press('Escape')
  const starPressed = await page
    .locator('button[aria-pressed="true"]')
    .filter({ has: page.locator('svg.lucide-star') })
    .count()
  chk(
    starPressed > 0,
    'and the star beside it agrees — one piece of state, two controls',
    'the star still reads unpinned while the menu says pinned: two copies of one fact',
  )

  // Put it back, so the check below is not standing on a mutated fixture.
  await openMenu()
  await menuItem('task-menu-favorite').click()
  await waitUntil(async () => !(await favouritedInDb()), { timeoutMs: 15_000 })

  // -------------------------------------------------------------------------
  console.log('\n▶ Archive says what it does, and does what it says')

  /*
   * The confirmation used to read "Delete this task? This cannot be undone."
   * about a soft, restorable archive. The dialog text is the assertion: a
   * reversible action presented as permanent is one nobody uses.
   */
  let confirmText = ''
  page.once('dialog', (d) => {
    confirmText = d.message()
    void d.accept()
  })
  await openMenu()
  await menuItem('task-menu-archive').click()
  await waitUntil(() => confirmText.length > 0, { timeoutMs: 10_000 })
  chk(
    /archive/i.test(confirmText),
    'it asks about archiving, not deleting',
    `the confirmation read "${confirmText}"`,
  )
  chk(
    !/cannot be undone/i.test(confirmText) && /restore|trash/i.test(confirmText),
    'and it says the task can be restored, which is true',
    `the confirmation read "${confirmText}" — the action is reversible and the ` +
      'copy claimed otherwise, which is why nobody would use it',
  )

  const rowState = await waitUntil(async () => {
    const [row] = await sql`select is_archived from tasks where id = ${task.id}`
    return row?.is_archived === true
  }, { timeoutMs: 15_000 })
  chk(rowState, 'the task is archived', 'the task was not archived at all')

  const [after] = await sql`select is_archived, archived_at from tasks where id = ${task.id}`
  chk(
    after?.archived_at != null,
    'and stamped with when — which is what makes it restorable rather than gone',
    'the row was flagged archived with no timestamp',
  )

  const restored = await A(`/tasks/${task.id}/restore`, { method: 'POST' })
  const [back] = await sql`select is_archived from tasks where id = ${task.id}`
  chk(
    restored.status < 400 && back?.is_archived === false,
    'and restoring really brings it back — the copy is not making a promise the API cannot keep',
    `restore answered ${restored.status} and the row reads is_archived=${back?.is_archived}`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from favorites where entity_id in (select id from tasks where title like ${'%' + TAG})`.catch(() => {})
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
