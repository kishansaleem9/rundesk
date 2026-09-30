/**
 * A MEETING TAG FINDS EVERY MEETING THAT CARRIES IT, WHATEVER ITS CASE, HOWEVER OLD.
 *
 * NOT A FRAME ROW: `product-siblings/meetings-tag-filter-client-side`. The
 * meetings page built its tag chips from the list it had loaded, the newest
 * 200 meetings, and filtered that list in the browser. So a tag carried only
 * by an older meeting had no chip, and the list could never reach it; the
 * server's own comment on its limit says exactly that must not happen. And the
 * chips are one per tag whatever its case ("Standup" and "standup" are one
 * chip), while the filter compared exact case, so under "Standup" the meetings
 * tagged "standup" vanished. The server's `?tag=` compared exact case too.
 *
 * The workspace is this run's own. Its 200 newer meetings are planted by SQL;
 * the four that carry the tags are made through the API.
 *
 *   node test/e2e/meeting-tags.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* lib/fixture.mjs's one API client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the `call` helper it replaces, it throws when nothing answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })
const stamp = Date.now()
const TAG = `mtg-${stamp}`
const OLD_TAG = `Archive ${stamp}`
let browser = null
let sql = null
let WS = null
let token = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the 200 newer meetings are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = apiAs(token)
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString()
  const meeting = async (title, tags, startsAt) => {
    const res = await call(`/workspaces/${WS}/meetings`, { method: 'POST', body: { title: `${TAG} ${title}`, tags, startsAt } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make "${title}": ${res.status}`)
    return res.data.id
  }
  const UPPER = await meeting('standup, capitalised', ['Standup'], hoursAgo(1))
  const LOWER = await meeting('standup, lower case', ['standup'], hoursAgo(2))
  const RETRO = await meeting('retro', ['Retro'], hoursAgo(3))
  const OLD = await meeting('the old one', [OLD_TAG], hoursAgo(24 * 400))
  // Two hundred newer meetings, so the old one is past the list's first 200.
  await sql`
    insert into meetings (workspace_id, title, starts_at)
    select ${WS}, ${`${TAG} filler `} || n, now() - make_interval(days => n)
    from generate_series(1, 200) as n`

  // ══ 1. THE LIST, ASKED FOR A TAG ═════════════════════════════════════════
  console.log('\n▶ the list, asked for "standup" and for "STANDUP"')
  const ids = (res) => (res.data ?? []).map((m) => m.id)
  const lower = await call(`/workspaces/${WS}/meetings?tag=standup`)
  const upper = await call(`/workspaces/${WS}/meetings?tag=STANDUP`)
  const both = (list) => list.includes(UPPER) && list.includes(LOWER) && !list.includes(RETRO)
  chk(
    lower.status === 200 && both(ids(lower)) && both(ids(upper)),
    'the list asked for a tag finds every meeting carrying it, whatever its case — and no other',
    `"standup" found ${JSON.stringify(ids(lower).map((id) => (id === UPPER ? 'Standup' : id === LOWER ? 'standup' : id === RETRO ? 'Retro' : id)))}; ` +
      `"STANDUP" found ${ids(upper).length}`,
  )

  // ══ 2. THE TAGS IN USE ═══════════════════════════════════════════════════
  console.log('\n▶ the tags in use, across every meeting')
  const tags = await call(`/workspaces/${WS}/meetings/tags`)
  const list = Array.isArray(tags.data) ? tags.data : []
  chk(
    tags.status === 200 && list.filter((t) => t.toLowerCase() === 'standup').length === 1 && list.includes('Retro') && list.includes(OLD_TAG),
    'the tags in use are listed from every meeting — Standup once, and a tag only an old meeting carries',
    `${tags.status}: ${JSON.stringify(list)}`,
  )

  // ══ 3. THE PAGE ══════════════════════════════════════════════════════════
  console.log('\n▶ the meetings page, a chip for the old tag, and one for Standup')
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/meetings`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('meetings-page').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const row = (id) => page.getByTestId(`meeting-${id}`)
  const oldChip = page.getByTestId(`meetings-tag-${OLD_TAG}`)
  const offered = await oldChip.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
  if (offered) await oldChip.click({ timeout: 5000 }).catch(() => {})
  const oldShown = offered && await waitUntil(async () => (await row(OLD).count()) === 1, { timeoutMs: 10_000 })
  chk(
    oldShown,
    'the page offers a chip for a tag only a meeting beyond the newest 200 carries, and choosing it shows that meeting',
    `the chip offered: ${offered}; the old meeting shown: ${oldShown}`,
  )
  if (offered) await oldChip.click({ timeout: 5000 }).catch(() => {})

  const standupChip = page.locator('[data-testid="meetings-tag-Standup"], [data-testid="meetings-tag-standup"]').first()
  const standupOffered = await standupChip.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
  if (standupOffered) await standupChip.click({ timeout: 5000 }).catch(() => {})
  const bothShown = standupOffered && await waitUntil(async () => (await row(UPPER).count()) === 1 && (await row(LOWER).count()) === 1 && (await row(RETRO).count()) === 0, { timeoutMs: 10_000 })
  chk(
    bothShown,
    'choosing the Standup chip shows the meetings tagged “standup” as well as “Standup”, and not the others',
    `the chip offered: ${standupOffered}; Standup ×${await row(UPPER).count()}, standup ×${await row(LOWER).count()}, Retro ×${await row(RETRO).count()}`,
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
