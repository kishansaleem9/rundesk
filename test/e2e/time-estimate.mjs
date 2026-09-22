/**
 * §V2-S02 — THE TIME-ESTIMATE BOX, frames `01:35` and `01:45`.
 *
 * `01:35` is a popover with `12` typed into it and a row underneath reading
 * **"12 hours"**; `01:45` shows the field afterwards reading **`12h`**.
 *
 * Rundesk had `<input type="number">` in hours. Ninety minutes had to be
 * entered as `1.5`, `2h 30m` could not be said at all, and the unit appeared
 * nowhere except the field's label — so the box showed `12` and you had to know
 * what that meant.
 *
 * WHAT THIS SUITE IS REALLY FOR. Two places in the product turn what somebody
 * types into an estimate — this field and the quick-create modal — and each had
 * its own `Number(hours) * 3600`. Teaching one of them to understand `90m`
 * would make them DISAGREE about the same words, which is worse than neither
 * understanding it. So the last checks here type the same thing into the other
 * box and read the answer out of the database.
 *
 *   node test/e2e/time-estimate.mjs --api 3011 --dist apps/web/dist
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

/**
 * "0 failed" is not "it ran".
 *
 * 13 since the two "12x" checks were added; 11 before that.
 *
 * It was once 10 while the file had eleven unconditional checks — an
 * eleventh was added and this constant was not raised. Nothing noticed,
 * because the comparison was `ran < EXPECTED_CHECKS`: running MORE than the
 * floor never trips it, so the constant drifts upward-blind and quietly stops
 * guarding the thing it exists for. Exact comparison is what surfaced it.
 *
 * Raise this when a check is added; that is the whole contract.
 */
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
const TAG = `e2e-estimate-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads the stored estimate back in seconds')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Estimate subject ${TAG}`}) returning id`

  const storedSeconds = async (taskId) =>
    (await sql`select time_estimate from tasks where id = ${taskId}`)[0]?.time_estimate ?? null

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settle = async () => {
    const accept = page.getByTestId('cookie-accept')
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settle()

  const openTask = async () => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settle()
    const ready = await waitUntil(
      () => page.getByTestId('task-estimate-input').isVisible().catch(() => false),
      { timeoutMs: 25_000 },
    )
    if (!ready) throw new Error('the task sheet never showed the estimate field')
    await settle()
  }

  await openTask()
  const box = page.getByTestId('task-estimate-input')

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `01:35` — typing `12` offers "12 hours"')

  await box.click()
  await box.fill('12')
  const suggestion = await waitUntil(
    async () => (await readText(page.getByTestId('task-estimate-suggestion'))).length > 0,
    { timeoutMs: 10_000 },
  )
  chk(suggestion, 'a suggestion row appears', 'nothing says what the box heard')
  const suggestionText = await readText(page.getByTestId('task-estimate-suggestion'))
  chk(
    /12/.test(suggestionText) && /hour/i.test(suggestionText),
    `and it reads the frame's own words — "${suggestionText}"`,
    `the row reads "${suggestionText}" — the frame offers "12 hours"`,
  )

  await page.getByTestId('task-estimate-suggestion').click()
  chk(
    await waitUntil(async () => (await storedSeconds(task.id)) === 12 * 3600, { timeoutMs: 20_000 }),
    'choosing it stores twelve hours',
    `the task holds ${await storedSeconds(task.id)}s after choosing "12 hours"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `01:45` — the field reads back `12h`, not `12`')

  await openTask()
  chk(
    (await box.inputValue()).trim() === '12h',
    'the stored estimate reads back with its unit',
    `the box reads "${await box.inputValue()}" — a number with no unit beside it is a question`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ ninety minutes, which the old hours-only box could not say')

  await box.click()
  await box.fill('90m')
  await box.press('Enter')
  chk(
    await waitUntil(async () => (await storedSeconds(task.id)) === 90 * 60, { timeoutMs: 20_000 }),
    '`90m` is ninety minutes',
    `the task holds ${await storedSeconds(task.id)}s for "90m" — 5400 was expected`,
  )
  await openTask()
  chk(
    (await box.inputValue()).trim() === '1h 30m',
    'and reads back as 1h 30m',
    `the box reads "${await box.inputValue()}"`,
  )

  await box.click()
  await box.fill('2h 15m')
  await box.press('Enter')
  chk(
    await waitUntil(async () => (await storedSeconds(task.id)) === 2 * 3600 + 15 * 60, { timeoutMs: 20_000 }),
    'and a compound estimate adds its parts',
    `the task holds ${await storedSeconds(task.id)}s for "2h 15m"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ nonsense is refused, not rounded into a number nobody meant')

  const before = await storedSeconds(task.id)
  await box.click()
  await box.fill('soon')
  await box.press('Enter')
  /*
   * THE CHECK THAT KEEPS THIS HONEST. A box that read "soon" as 0 — or that
   * wiped the estimate — would destroy a real number because somebody typed a
   * word. So it must put back what is stored and leave it alone.
   */
  await page.waitForTimeout(1500)
  chk(
    (await storedSeconds(task.id)) === before,
    'typing a word leaves the estimate alone',
    `the estimate went from ${before}s to ${await storedSeconds(task.id)}s because "soon" was typed`,
  )
  chk(
    (await box.inputValue()).trim() === '2h 15m',
    'and the box puts back what is really stored',
    `the box is left reading "${await box.inputValue()}"`,
  )
  chk(
    !(await page.getByTestId('task-estimate-suggestion').isVisible().catch(() => false)),
    'and offers no suggestion for it',
    'a suggestion row appeared under text the field did not understand',
  )

  /*
   * AND NONSENSE WITH A NUMBER IN IT, which is the harder half and was missing.
   *
   * "soon" is refused by having no digits at all — the parser finds no parts
   * and gives up — so the three checks above pass under a parser that matched
   * duration parts ANYWHERE in the box instead of requiring the whole of it.
   * `estimate.ts` says what that costs in its own words: it "would read '12x'
   * as twelve hours and 'due soon 3h' as three — recording an estimate nobody
   * made." The unit test covers "12x"; nothing drove it through the field, so
   * the field's own refusal was only ever exercised against a word.
   */
  const beforeX = await storedSeconds(task.id)
  await box.click()
  await box.fill('12x')
  await page.waitForTimeout(800)
  chk(
    !(await page.getByTestId('task-estimate-suggestion').isVisible().catch(() => false)),
    'and "12x" is not twelve hours — no suggestion under a number with rubbish attached',
    'the field offered to read "12x" as a duration, which is an estimate nobody typed',
  )
  await box.press('Enter')
  await page.waitForTimeout(1500)
  chk(
    (await storedSeconds(task.id)) === beforeX,
    'and committing it changes nothing',
    `the estimate went from ${beforeX}s to ${await storedSeconds(task.id)}s because "12x" was typed`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the OTHER estimate box means the same thing')

  /*
   * The quick-create modal had its own `Number(hours) * 3600`. If only one of
   * the two boxes learned what `90m` means, the same words would produce two
   * different estimates depending on where they were typed.
   */
  await page.goto(`${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await settle()
  /*
   * DRIVEN, not asserted from the source. The quick-create modal is where the
   * second `Number(hours) * 3600` lived, so the check has to type the same
   * words into that box and read the seconds out of the database.
   */
  await page.goto(`${stack.base}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await settle()
  await page.getByTestId('quick-create-open').click({ timeout: 20_000 })
  await page.getByTestId('create-tab-task').click({ timeout: 20_000 })
  await page.getByTestId('quick-create-space').selectOption({ label: `Space ${TAG}` })
  await page.getByTestId('quick-create-project').selectOption({ label: `Project ${TAG}` })
  await page.getByTestId('quick-create-list').selectOption({ label: `List ${TAG}` })
  const QUICK_TITLE = `Quick estimate ${TAG}`
  await page.getByTestId('quick-create-task-title').fill(QUICK_TITLE)
  await page.getByTestId('quick-create-estimate').fill('90m')
  await page.getByTestId('quick-create-submit').click({ timeout: 20_000 })

  let quickSeconds = null
  const quickStored = await waitUntil(async () => {
    const rows = await sql`select time_estimate from tasks where title = ${QUICK_TITLE}`
    quickSeconds = rows[0]?.time_estimate ?? null
    return rows.length === 1 && quickSeconds === 5400
  }, { timeoutMs: 25_000 })
  chk(
    quickStored,
    'the OTHER estimate box reads `90m` the same way — 5400s',
    `quick-create stored ${quickSeconds}s for "90m"; the detail field stores 5400. Two boxes, ` +
      'two answers to the same words, is the bug this parser exists to prevent',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('time-estimate.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (sql) {
    await sql`delete from tasks where list_id in (select id from lists where name like ${'%' + TAG})`.catch(() => {})
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
