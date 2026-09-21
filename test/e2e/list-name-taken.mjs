/**
 * §V2-S11 — "LIST NAME TAKEN", frame `08:50`, and the toasts around it.
 *
 * The frame shows two error toasts stacked BOTTOM-LEFT, both reading *"List
 * name taken"*, as she tries twice to reuse a name. Frame `00:35` shows the
 * other one: *"Created field progress"*, also bottom-left.
 *
 * THREE THINGS WERE WRONG, and they only make sense together.
 *
 *   1. `createList` inserted whatever it was given. A project could hold three
 *      lists called "Backlog" and the sidebar gave you no way to tell them
 *      apart. There was no constraint in the database and no check in the
 *      service.
 *   2. The quick-create list mutation had `onSuccess` and NO `onError`. So even
 *      once the API refused a duplicate, the dialog would have sat there
 *      silently — the frame's toast could not have appeared however the server
 *      answered. A refusal nobody is shown is indistinguishable from a hang.
 *   3. Toasts were bottom-RIGHT, where the privacy banner lives.
 *
 * WHERE THE RULE ACTUALLY LIVES. Migration 0147 adds a partial,
 * case-insensitive unique index — `(project_id, lower(name)) where is_archived
 * = false`. The service check exists so the answer is a 409 carrying the
 * frame's words rather than a Postgres unique violation surfacing as a 500, and
 * this suite checks BOTH: the API's answer, and that the constraint holds when
 * the service is bypassed entirely.
 *
 * AGAINST THE REAL STACK, necessarily — the load-bearing claim is a database
 * constraint, and a stub cannot have one.
 *
 *   node test/e2e/list-name-taken.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 14

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
const TAG = `e2e-taken-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the load-bearing claim here is an index')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [other] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Other ${TAG}`}) returning id`

  const NAME = `Backlog ${TAG}`

  // -------------------------------------------------------------------------
  console.log('\n▶ the API refuses a duplicate, in the frame\'s words')

  const first = await A('/lists', { method: 'POST', body: { projectId: project.id, name: NAME } })
  chk(first.status < 400 && !!first.data?.id, 'the first list is created', `it answered ${first.status}`)

  const second = await A('/lists', { method: 'POST', body: { projectId: project.id, name: NAME } })
  chk(
    second.status === 409,
    'the second is refused with a 409',
    `it answered ${second.status} — a duplicate name was accepted, or refused as something else`,
  )
  chk(
    /taken/i.test(JSON.stringify(second.error ?? '')),
    'and the message is "List name taken", as the frame reads',
    `the error was ${JSON.stringify(second.error)}`,
  )

  /*
   * CASE-INSENSITIVE. "backlog" and "Backlog" are the same name to the person
   * reading the sidebar, and a rule that let both through would be enforcing
   * something nobody means.
   */
  const cased = await A('/lists', {
    method: 'POST',
    body: { projectId: project.id, name: NAME.toUpperCase() },
  })
  chk(
    cased.status === 409,
    'and case does not get around it',
    `"${NAME.toUpperCase()}" was accepted alongside "${NAME}" (${cased.status})`,
  )

  /*
   * AND BY THE SERVICE, WHICH IS WHERE THE FRAME'S WORDS LIVE.
   *
   * The 409 has two sources. `assertListNameFree` raises one with the
   * sentence frame `08:50` shows; the partial unique index on `lower(name)`
   * raises a Postgres 23505, which `AllExceptionsFilter` maps to 409 with the
   * generic "That resource already exists". Asserting the status alone cannot
   * tell them apart — a break patch making the service check case-SENSITIVE
   * left this green, because the index caught it and the filter dressed it up.
   *
   * The service's own comment says this is the point: "This check exists so
   * the ANSWER is a 409 with the frame's words rather than a bare Postgres
   * unique-violation surfacing as a 500." So the words are what to assert.
   */
  chk(
    /taken/i.test(JSON.stringify(cased.error ?? '')),
    'and says so in the frame\'s words, not the database\'s',
    `the error was ${JSON.stringify(cased.error)} — a generic conflict here means the service ` +
      'check missed the case variant and the unique index caught it instead, which is a 409 ' +
      'either way and a different sentence to the person who typed the name',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ but the rule is scoped to the project, and to live lists')

  const elsewhere = await A('/lists', { method: 'POST', body: { projectId: other.id, name: NAME } })
  chk(
    elsewhere.status < 400,
    'the same name is fine in a different project',
    `a second project could not have its own "${NAME}" (${elsewhere.status})`,
  )

  /*
   * A name in the bin does not reserve itself forever. Deleting a list and
   * making a new one with the same name is an ordinary thing to do.
   */
  await sql`update lists set is_archived = true where id = ${first.data.id}`
  const reused = await A('/lists', { method: 'POST', body: { projectId: project.id, name: NAME } })
  chk(
    reused.status < 400,
    'and an archived list does not hold its name hostage',
    `the name stayed reserved by a binned list (${reused.status})`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ THE CONSTRAINT IS IN THE DATABASE, not only in the service')

  /*
   * The service check exists to produce a good error. The index is what makes
   * the rule true — including for two requests racing, and for any code path
   * that forgets to ask. So this writes straight past the service.
   */
  let rawRefused = false
  try {
    await sql`insert into lists (project_id, name) values (${project.id}, ${NAME})`
  } catch {
    rawRefused = true
  }
  chk(
    rawRefused,
    'a direct insert of a duplicate is refused by the index itself',
    'the database accepted it — the rule lives only in the service, so anything ' +
      'that writes lists another way can still make two',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the refusal reaches the person, bottom-left')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  /*
   * DRIVEN THROUGH THE UI, and the toast is read off the SCREEN.
   *
   * The position is the frame's claim, so the check is the toast's bounding box
   * rather than an attribute of the toast library — a person cannot read
   * `data-x-position`. And driving it through the dialog is what proves the
   * refusal reaches them at all: the List tab's own mutation had no `onError`,
   * so on that path the server said no and nothing happened.
   */
  await page.goto(`${stack.base}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('quick-create-space').selectOption(space.id)
  await page.getByTestId('quick-create-project').selectOption(project.id)
  await page.getByTestId('quick-create-new-list').click()
  await page.getByTestId('quick-create-new-list-name').fill(NAME)
  await page.getByTestId('quick-create-new-list-save').click()

  const toast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(() => toast.isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'the refusal reaches the person as a toast',
    'the server refused the duplicate and the dialog said nothing at all',
  )
  const toastText = await readText(toast)
  chk(
    /taken/i.test(toastText),
    'and it reads "List name taken", the frame\'s words',
    `the toast read "${toastText}"`,
  )

  const box = await toast.boundingBox()
  const viewport = page.viewportSize()
  chk(
    !!box && !!viewport && box.y + box.height / 2 > viewport.height / 2,
    'it sits in the bottom half of the window',
    `the toast's centre was at y=${box ? Math.round(box.y + box.height / 2) : '?'} of ${viewport?.height}`,
  )
  chk(
    !!box && !!viewport && box.x + box.width / 2 < viewport.width / 2,
    'and on the LEFT, where both frames put it',
    `the toast's centre was at x=${box ? Math.round(box.x + box.width / 2) : '?'} of ${viewport?.width} — ` +
      'the frames show bottom-left, and bottom-right is where the privacy banner sits',
  )
  // -------------------------------------------------------------------------
  console.log('\n▶ and on the OTHER list-creation path, the one that was silent')

  /*
   * TWO PATHS CREATE A LIST IN THIS DIALOG. The inline form inside the Task tab
   * (above) always had an `onError`. The List TAB's own mutation did not — which
   * is the defect the re-audit named, and the path this section drives. Without
   * it the fix would have been untested, which is how a fix becomes a belief.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-tab-list').click()
  await page.getByTestId('quick-create-list-name').fill(NAME)
  await page.getByTestId('quick-create-list-space').selectOption(space.id)
  await page.getByTestId('quick-create-list-project').selectOption(project.id)
  await page.getByTestId('quick-create-list-submit').click()

  const tabToast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(() => tabToast.isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'the List tab reports the refusal too',
    'the List tab swallowed it — this mutation had no onError, so the server said ' +
      'no and the dialog sat there looking un-pressed',
  )
  chk(
    /taken/i.test(await readText(tabToast)),
    'with the same words',
    `it read "${await readText(tabToast)}"`,
  )

} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
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
