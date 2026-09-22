/**
 * §V2-S02 — "COLLAPSE EMPTY FIELDS", frame `01:20`.
 *
 * The task detail page in the walkthrough shows a two-column field grid — the
 * frame pass recorded `Time estimate  Empty` in it — with a **"Collapse empty
 * fields"** control beside the grid. Rundesk had no such control anywhere:
 * `grep -ri "collapse.*field\|emptyField\|hideEmpty"` over `apps/` returned
 * nothing at all.
 *
 * WHAT MAKES THIS EASY TO FAKE. A toggle that hides things is trivial to build
 * and trivial to build wrongly, in three specific ways, and each has a check
 * here:
 *
 *  1. It hides fields that HAVE values. Checked by counting the fields that
 *     hold something before and after — Status and Priority always do, and the
 *     custom-field checks add one that was filled deliberately.
 *  2. It hides silently. Collapsed, an empty field and a field that does not
 *     exist look identical, and somebody who forgot the toggle files a bug
 *     about a missing field. The count is the difference between hidden and
 *     gone, so it is asserted, with its arithmetic.
 *  3. It forgets. A view preference that resets on every reload is a control
 *     that appears to work and does nothing, which is this codebase's most
 *     common defect class. Checked across a full page reload.
 *
 * AND ONE THE FRAME DOES NOT SHOW BUT THE PRODUCT NEEDS. A required custom
 * field with nothing in it is the one empty field on the page that somebody
 * has to see. It is exempt, and that is checked.
 *
 * AGAINST THE REAL STACK: custom-field definitions are project-scoped rows
 * (`POST /workspaces/:id/projects/:id/custom-fields`) and the required flag
 * lives on them, so a stub would be inventing the distinction under test.
 *
 *   node test/e2e/collapse-empty-fields.mjs --api 3011 --dist apps/web/dist
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
const TAG = `e2e-cef-${Date.now()}`
let createdFieldIds = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages a task directly')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  // A task with NOTHING optional filled in — no dates, no estimate, no
  // assignee — which is what an ordinary freshly-created task looks like.
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Bare ${TAG}`}) returning id`

  /*
   * Three custom fields: one that will hold a value, one empty and optional,
   * one empty and REQUIRED. Only the middle one may ever be hidden.
   */
  const mkField = async (name, isRequired, type = 'text') => {
    // Definitions are PROJECT-scoped: `POST /workspaces/:id/projects/:id/custom-fields`.
    const res = await A(`/workspaces/${workspaceId}/projects/${project.id}/custom-fields`, {
      method: 'POST',
      body: { name: `${name} ${TAG}`, type, isRequired },
    })
    if (!res.data?.id) throw new Error(`could not create field ${name}: ${JSON.stringify(res.error)}`)
    createdFieldIds.push(res.data.id)
    return res.data.id
  }
  const filledField = await mkField('Filled', false)
  await mkField('Blank optional', false)
  await mkField('Blank required', true)
  /*
   * AND THE TWO VALUES THAT ARE NOT EMPTY AND LOOK LIKE IT.
   *
   * `isEmptyFieldValue` ends with `return false` and its comment is entirely
   * about these two: "An unticked checkbox that has never been touched arrives
   * as null; one somebody deliberately set to 'no' arrives as `false`, and
   * hiding that would hide an answer. Same for a number field holding zero —
   * zero is a measurement, not the absence of one."
   *
   * Every field in this fixture used to be `type: 'text'` with a non-empty
   * string in the filled one, so `cef-1-false-and-zero-are-empty` — which
   * replaces that predicate with `!value` — ran GREEN through the whole suite.
   * The unit test sees it; nothing here could, because the suite never put
   * either value on a task. The predicate was proven and no READER of it was.
   */
  const noField = await mkField('Said no', false, 'checkbox')
  const zeroField = await mkField('Measured zero', false, 'number')
  await A(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${filledField}`, {
    method: 'PUT',
    body: { value: `has a value ${TAG}` },
  })
  await A(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${noField}`, {
    method: 'PUT',
    body: { value: false },
  })
  await A(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${zeroField}`, {
    method: 'PUT',
    body: { value: 0 },
  })

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

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `01:20` — the control exists, on the field grid')

  const toggle = page.getByTestId('collapse-empty-fields')
  chk(
    await waitUntil(() => toggle.first().isVisible().catch(() => false), { timeoutMs: 20_000 }),
    'the field grid offers "Collapse empty fields"',
    'there is no collapse control on the task detail grid',
  )

  const emptyOnScreen = () => page.getByTestId('task-field-empty').count()
  const filledOnScreen = () => page.getByTestId('task-field').count()

  const emptiesBefore = await emptyOnScreen()
  const filledBefore = await filledOnScreen()
  chk(
    emptiesBefore > 0,
    `the bare task shows ${emptiesBefore} empty built-in fields to collapse`,
    'nothing on this task counted as empty, so the rest of this suite would pass vacuously',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ collapsing hides the empty ones and ONLY the empty ones')

  await toggle.first().click()
  chk(
    await waitUntil(async () => (await emptyOnScreen()) === 0, { timeoutMs: 10_000 }),
    'the empty fields go',
    `${await emptyOnScreen()} empty fields still on screen after collapsing`,
  )
  chk(
    (await filledOnScreen()) === filledBefore,
    'and every field that had a value stays',
    `fields with values went from ${filledBefore} to ${await filledOnScreen()} — ` +
      'the collapse is eating real data, not blanks',
  )

  const hiddenLabel = () => readText(page.getByTestId('empty-fields-hidden').first())
  chk(
    new RegExp(`\\b${emptiesBefore}\\b`).test(await hiddenLabel()),
    `and it says how many it hid (${emptiesBefore})`,
    `the count reads "${await hiddenLabel()}" for ${emptiesBefore} hidden fields — ` +
      'hiding without saying how much is how a collapsed field becomes a bug report',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ it is a preference, not a mood — it survives a reload')

  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => toggle.first().isVisible().catch(() => false), { timeoutMs: 20_000 })
  chk(
    (await emptyOnScreen()) === 0,
    'the empty fields are still hidden after a full page load',
    'the collapse reset on reload — a view preference that forgets is a control that does nothing',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the custom-field list obeys the SAME preference')

  await page.getByTestId('task-tab-fields').click({ timeout: 20_000 })
  /*
   * Lower-cased on the way out: the field-name line is `text-xs uppercase`, and
   * `innerText` reports what is RENDERED, so a case-sensitive match here fails
   * against "FILLED" while the panel is behaving correctly.
   */
  const rows = async () =>
    (await page.getByTestId('custom-field-row').allInnerTexts()).map((r) => r.toLowerCase())
  await waitUntil(async () => (await rows()).length > 0, { timeoutMs: 20_000 })

  const collapsedRows = await rows()
  chk(
    collapsedRows.some((r) => r.includes('filled')),
    'the field with a value is listed',
    `the custom fields on screen were: ${collapsedRows.join(' | ')}`,
  )
  chk(
    !collapsedRows.some((r) => r.includes('blank optional')),
    'the empty optional field is hidden — one preference, both surfaces',
    'the Fields tab kept its own idea of the setting: two copies of one preference is two bugs',
  )
  /*
   * THE TWO ANSWERS THAT LOOK LIKE BLANKS. A checkbox somebody deliberately set
   * to "no" and a number field holding zero are values, and a collapse that
   * ate them would be hiding what the task says rather than what it does not.
   * Asserted on the Fields tab because that is where a custom field's value
   * lives; the Overview grid's built-ins have no falsy-but-present case.
   */
  chk(
    collapsedRows.some((r) => r.includes('said no')),
    'a checkbox set to "no" stays — false is an answer, not a blank',
    `the custom fields on screen were: ${collapsedRows.join(' | ')}`,
  )
  chk(
    collapsedRows.some((r) => r.includes('measured zero')),
    'and a number field holding zero stays — zero is a measurement',
    `the custom fields on screen were: ${collapsedRows.join(' | ')}`,
  )
  /*
   * The exemption. An empty REQUIRED field is the one blank on the page that
   * somebody has to act on; hiding it turns "you must fill this in" into
   * "this field does not exist".
   */
  chk(
    collapsedRows.some((r) => r.includes('blank required')),
    'and the empty REQUIRED field is not hidden',
    'a required field with nothing in it was collapsed away — the one blank that must stay visible',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ turning it back off brings everything back')

  await page.getByTestId('collapse-empty-fields').first().click()
  chk(
    await waitUntil(async () => (await rows()).some((r) => r.includes('blank optional')), {
      timeoutMs: 10_000,
    }),
    'the hidden custom field comes back',
    'expanding did not restore the hidden field — it hides one way only',
  )

  await page.getByTestId('task-tab-overview').click({ timeout: 20_000 })
  chk(
    await waitUntil(async () => (await emptyOnScreen()) === emptiesBefore, { timeoutMs: 10_000 }),
    'and so do the built-in ones, all of them',
    `${await emptyOnScreen()} empty fields came back out of ${emptiesBefore}`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    for (const id of createdFieldIds) {
      await sql`delete from custom_field_values where field_id = ${id}`.catch(() => {})
      await sql`delete from custom_field_definitions where id = ${id}`.catch(() => {})
    }
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
