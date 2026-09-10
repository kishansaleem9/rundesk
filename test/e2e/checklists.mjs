/**
 * §V2-S03 — CHECKLISTS, frames `02:15`–`02:55`.
 *
 * What the frames show: a **named checklist block** with its own "Add item",
 * an **"Add checklist"** button beside the heading — "MULTIPLE named checklists
 * per task" is the note the frame pass wrote against it — a header that
 * **counts open items** ("Checklists 2 open"), and an activity feed that reads
 * "You added item task required to checklist Checklist".
 *
 * WHAT WAS ACTUALLY THERE. The API had supported many checklists per task since
 * it was written. The UI could not make a second one. There was no "Add
 * checklist" control at all; the only creation path was implicit, inside the
 * add-an-item mutation, and it began:
 *
 *     if (firstChecklist) return firstChecklist
 *
 * So the first item created "Checklist", and every item after that went into
 * it, forever. A second checklist could only arrive from a template — and when
 * one did, the single add-item form at the BOTTOM of the panel still wrote into
 * `checklists[0]`, whichever list you thought you were typing under. That is
 * the check this suite leans on hardest: it is the one that passes on a screen
 * that photographs correctly and is wrong.
 *
 * WHY THE SECOND-LIST CHECK IS PHRASED BY DESTINATION. "An item was added"
 * passes on the broken build too — the item existed, it was just in the wrong
 * list. The assertion has to name which list it landed in.
 *
 * AGAINST THE REAL STACK. The activity assertions read rows the API writes, and
 * the enum value behind them (`checklist_item_added`, migration 0146) is not
 * something a stub can be honest about.
 *
 *   node test/e2e/checklists.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 13

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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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
const TAG = `e2e-cl-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads activity rows directly')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Launch ${TAG}`}) returning id`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.getByTestId('task-tab-checklists').click({ timeout: 20_000 })

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `02:15` — "Add checklist" is a control, not an accident')

  const addButton = page.getByTestId('checklist-add')
  chk(
    await waitUntil(() => addButton.isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'the panel offers "Add checklist"',
    'there is no way to start a checklist except by adding an item to an implicit one',
  )

  const newChecklist = async (title) => {
    await page.getByTestId('checklist-add').click()
    await page.getByTestId('checklist-name-input').fill(title)
    await page.getByTestId('checklist-create-confirm').click()
    return waitUntil(
      async () => (await sql`
        select 1 from task_checklists where task_id = ${task.id} and title = ${title}`).length > 0,
      { timeoutMs: 15_000 },
    )
  }

  const FIRST = `Before launch ${TAG}`
  const SECOND = `After launch ${TAG}`
  chk(await newChecklist(FIRST), 'and it makes one, with the name that was typed',
    `no checklist named "${FIRST}" exists on the task`)

  /*
   * THE ONE THAT MATTERS. The old panel short-circuited on `checklists[0]`, so
   * this second creation was unreachable from the UI entirely.
   */
  chk(await newChecklist(SECOND), 'and a SECOND one — a task holds several named checklists',
    'the second checklist never appeared: the UI can still only ever have one')

  const listRows = await sql`
    select id, title from task_checklists where task_id = ${task.id} order by position asc`
  chk(
    listRows.length === 2 && listRows[0].title === FIRST && listRows[1].title === SECOND,
    'both survive, in the order they were made',
    `the task has ${listRows.length} checklists: ${listRows.map((r) => r.title).join(' | ')}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `02:15` — "Add item" belongs to the checklist it sits under')

  const panel = page.getByTestId('checklists-panel')
  const blocks = panel.getByTestId('checklist-progress')
  chk(
    (await blocks.count()) === 2,
    'each checklist draws its own block',
    `${await blocks.count()} checklist blocks rendered for 2 checklists`,
  )

  const forms = panel.getByTestId('checklist-item-form')
  chk(
    (await forms.count()) === 2,
    'and each block has its own add-item row',
    `${await forms.count()} add-item forms for 2 checklists — one shared form can only feed the first list`,
  )

  /*
   * Type into the SECOND list's form. On the old build the item was created —
   * in the FIRST list. So the assertion is about destination, not existence.
   */
  const SECOND_ITEM = `queries notedown ${TAG}`
  const secondForm = forms.nth(1)
  await secondForm.getByTestId('checklist-item-input').fill(SECOND_ITEM)
  await secondForm.locator('button[type=submit]').click()

  // `waitUntil` answers "did it converge", not "with what" — so the destination
  // is captured on the way past rather than read off its return value.
  let landed = null
  await waitUntil(async () => {
    const rows = await sql`
      select cl.title from task_checklist_items i
      join task_checklists cl on cl.id = i.checklist_id
      where i.content = ${SECOND_ITEM}`
    landed = rows[0]?.title ?? null
    return landed !== null
  }, { timeoutMs: 15_000 })
  chk(
    landed === SECOND,
    'an item typed under the second checklist lands in the second checklist',
    `it landed in "${landed}" instead of "${SECOND}" — the form wrote into checklists[0] regardless of which list it sat under`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `02:15` — the header counts what is still OPEN')

  const FIRST_ITEM = `task required ${TAG}`
  const firstForm = forms.nth(0)
  await firstForm.getByTestId('checklist-item-input').fill(FIRST_ITEM)
  await firstForm.locator('button[type=submit]').click()

  const countText = () => readText(page.getByTestId('checklist-open-count'))
  chk(
    await waitUntil(async () => /\b2\b/.test(await countText()), { timeoutMs: 15_000 }),
    'two unticked items across two lists read as 2 open',
    `the header says "${await countText()}" with two open items`,
  )

  // Tick one. "Open" has to mean open, not total — a count that never moves is
  // the same picture whether or not the work got done.
  //
  // `.click()`, not `.check()`: the box is controlled by `item.isDone`, which
  // only flips once the PATCH lands and the task refetches. `.check()` asserts
  // the state changed the instant it clicked and fails on a control that is
  // behaving correctly — the second hazard named at the top of `lib/wait.mjs`.
  await panel.getByTestId('checklist-item-checkbox').first().click()
  chk(
    await waitUntil(async () => {
      const [row] = await sql`
        select count(*)::int as n from task_checklist_items i
        join task_checklists cl on cl.id = i.checklist_id
        where cl.task_id = ${task.id} and i.is_done = true`
      return row?.n === 1
    }, { timeoutMs: 15_000 }),
    'ticking an item is saved',
    'the checkbox click never reached the server',
  )
  chk(
    await waitUntil(async () => /\b1\b/.test(await countText()), { timeoutMs: 15_000 }),
    'ticking one drops the count to 1 — it counts open, not total',
    `after ticking an item the header still says "${await countText()}"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `02:47` — the activity feed names the item AND the list')

  let added = []
  const logged = await waitUntil(async () => {
    added = await sql`
      select meta from task_activity
      where task_id = ${task.id} and action = 'checklist_item_added'
      order by created_at asc`
    return added.length >= 2
  }, { timeoutMs: 15_000 })
  chk(
    logged,
    'adding an item is logged at all',
    `${added.length} checklist_item_added rows for two added items — ` +
      'a checklist could gain ten lines in silence',
  )
  chk(
    added.some((r) => r.meta?.content === SECOND_ITEM && r.meta?.checklist === SECOND),
    'and the entry says which item went into which checklist',
    `the logged meta was ${JSON.stringify(added.map((r) => r.meta))} — ` +
      '"added a checklist item" cannot say which of several lists grew',
  )

  const feed = await (async () => {
    await page.getByTestId('task-tab-activity').click({ timeout: 20_000 })
    await waitUntil(
      async () => (await readText(page.getByTestId('activity-time'))).length > 0,
      { timeoutMs: 15_000 },
    )
    return page.locator('ol').first().innerText().catch(() => '')
  })()
  chk(
    feed.includes(SECOND_ITEM) && feed.includes(SECOND),
    'and the feed on screen reads back both names',
    `the activity feed rendered: ${feed.slice(0, 240)}`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
}

const ran = passed + failed
console.log(`\n${passed}/${ran} passed`)
if (ran < EXPECTED_CHECKS) {
  console.error(`\x1b[31monly ${ran} of ${EXPECTED_CHECKS} checks ran — the suite stopped early\x1b[0m`)
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)
