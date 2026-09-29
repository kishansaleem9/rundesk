/**
 * A DAY AND A TIME ARE THE READER'S OWN, EAST OF GREENWICH TOO.
 *
 * NOT FRAME ROWS. Two ledger rows, one defect twice: a local date or time
 * written with `toISOString()`, which is UTC.
 *
 * `product-siblings/workload-csv-dates-shifted-east-of-utc`: the workload CSV
 * labelled its columns `d.toISOString().slice(0, 10)` of LOCAL midnights, so
 * in Asia/Karachi (the walkthrough's own zone) every column carried the day
 * before the load under it.
 *
 * `product-siblings/meeting-record-panel-startsat-utc-shift`: the AI page's
 * meeting card filled its "When" box with the UTC wall clock and saved it as
 * local time, so every open-and-save moved a meeting by the reader's offset.
 *
 * And the file names: the workload CSV, "Download my data" and the audit log's
 * Export CSV were each named `toISOString().slice(0, 10)` of the moment they
 * were saved, so a file saved before 05:00 in Karachi was dated the day before.
 *
 * The browser runs in Asia/Karachi (UTC+5, no daylight saving); the meeting is
 * planted at a fixed instant, and its saved instant is read back by SQL. The
 * file names are read on a clock held at 02:00 in Karachi, when the UTC date
 * is still the day before, so the check does not depend on when it runs.
 *
 *   node test/e2e/local-dates.mjs --api 3021
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const ZONE = 'Asia/Karachi'

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
const stamp = Date.now()
const TAG = `ldt-${stamp}`
let browser = null
let sql = null
let WS = null
let token = null

/** An instant's date in the zone, as YYYY-MM-DD — today's when none is given. */
const todayIn = (zone, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the meeting’s saved instant is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  // 10:00 UTC today: 15:00 in Karachi.
  const at = new Date()
  at.setUTCHours(10, 0, 0, 0)
  const meeting = await call(`/workspaces/${WS}/meetings`, { method: 'POST', body: { title: `${TAG} the meeting`, startsAt: at.toISOString() } })
  if (meeting.status >= 300 || !meeting.data?.id) throw new Error(`could not make the meeting: ${meeting.status}`)
  // The MEETING's day in Karachi, not today's: from 19:00 UTC Karachi is already
  // on tomorrow, and the card was right while this said it was a day out.
  const expectedWall = `${todayIn(ZONE, at)}T15:00`

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: ZONE, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // ══ 1. THE WORKLOAD CSV ══════════════════════════════════════════════════
  console.log(`\n▶ the workload CSV, in ${ZONE}`)
  await page.goto(`${B}/app/${WS}/workload`, { waitUntil: 'domcontentloaded' })
  const exportButton = page.getByRole('button', { name: /Export CSV/ }).first()
  await exportButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => await exportButton.isEnabled().catch(() => false), { timeoutMs: 20_000 })
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
    exportButton.click({ timeout: 10_000 }).catch(() => {}),
  ])
  const csv = dl ? fs.readFileSync(await dl.path()).toString('utf8') : ''
  const headerDates = (csv.split(/\r?\n/)[0] ?? '').split(',').map((c) => c.replace(/^"|"$/g, '')).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
  chk(
    headerDates[0] === todayIn(ZONE),
    `the workload CSV's first day is today in ${ZONE}, not the day before`,
    dl ? `the first dated column is ${JSON.stringify(headerDates[0] ?? null)}; today there is ${todayIn(ZONE)}` : 'nothing was saved',
  )

  // ══ 2. THE MEETING CARD ══════════════════════════════════════════════════
  console.log(`\n▶ a meeting at 10:00 UTC, opened and saved in ${ZONE}`)
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Meeting notes/ }).first().click({ timeout: 20_000 }).catch(() => {})
  const opener = page.locator('select').filter({ has: page.locator(`option[value="${meeting.data.id}"]`) }).first()
  await opener.selectOption(meeting.data.id, { timeout: 15_000 }).catch(() => {})
  const when = page.locator('input[type="datetime-local"]').first()
  await waitUntil(async () => ((await when.inputValue().catch(() => '')) ?? '') !== '', { timeoutMs: 10_000 })
  const shown = await when.inputValue().catch(() => '')
  await page.getByRole('button', { name: /Update meeting|Save meeting/ }).first().click({ timeout: 10_000 }).catch(() => {})
  // The save answers the card; the row is what the next reader sees.
  await page.waitForTimeout(3000)
  const [final] = await sql`select starts_at from meetings where id = ${meeting.data.id}`
  const after = final?.starts_at ? new Date(final.starts_at).toISOString() : null
  chk(
    shown === expectedWall && after === at.toISOString(),
    `the meeting card shows 15:00 for a meeting at 10:00 UTC in ${ZONE}, and saving it leaves the meeting where it was`,
    `the card showed ${JSON.stringify(shown)} (expected ${expectedWall}); saved, the meeting is at ${after} (was ${at.toISOString()})`,
  )

  // ══ 3. THE FILES' NAMES ══════════════════════════════════════════════════
  // 02:00 today in Karachi is 21:00 yesterday in UTC.
  const today = todayIn(ZONE)
  const earlyHours = new Date(`${today}T02:00:00+05:00`)
  console.log(`\n▶ three exports saved at 02:00 on ${today} in ${ZONE} (${earlyHours.toISOString()})`)
  const early = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: ZONE, acceptDownloads: true })
  await early.clock.setFixedTime(earlyHours)
  const ep = await early.newPage()
  await ep.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await ep.fill('input[type=email]', ADMIN.email)
  await ep.fill('input[type=password]', ADMIN.password)
  await ep.click('button[type=submit]')
  await ep.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await ep.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const saveFrom = async (route, button) => {
    await ep.goto(`${B}${route}`, { waitUntil: 'domcontentloaded' })
    const b = ep.getByRole('button', { name: button }).first()
    await b.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => await b.isEnabled().catch(() => false), { timeoutMs: 20_000 })
    const [file] = await Promise.all([
      ep.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
      b.click({ timeout: 10_000 }).catch(() => {}),
    ])
    return file?.suggestedFilename() ?? null
  }
  const names = {
    workload: await saveFrom(`/app/${WS}/workload`, /Export CSV/),
    myData: await saveFrom('/app/profile?tab=security', /Download my data/),
    audit: await saveFrom('/app/admin/audit', /Export CSV/),
  }
  const dated = Object.values(names).filter((n) => typeof n === 'string' && n.includes(today)).length
  chk(
    dated === 3,
    `a file saved at 02:00 in ${ZONE} is named for that day, not the UTC day before it — the workload CSV, "Download my data" and the audit log`,
    `saved as ${JSON.stringify(names)}; the day there is ${today}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && token) {
    const gone = await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (![200, 204, 404].includes(gone?.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone?.status ?? 'nothing'}`)
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
