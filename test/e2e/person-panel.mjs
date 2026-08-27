/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * A full minute of the walkthrough on one panel, and six of the 157 gaps in
 * it. The API is checked separately; what needs a browser is that the panel
 * exists, opens over whatever page you were on, and answers her six questions
 * — and, specifically, that it renders BELOW 1280px, because the member card
 * it replaced was `hidden xl:flex` and simply did not exist for anybody on a
 * laptop.
 *
 *   node test/e2e/person-panel.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/person-panel.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { startLocalStack } from './lib/local-stack.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const BASE = (process.env.BASE ?? argOf('--base', '')).replace(/\/$/, '')
const REMOTE = BASE.length > 0
const HOST = REMOTE ? new URL(BASE).hostname : ''
const IS_LOOPBACK = REMOTE && /^(127\.|localhost$|\[?::1)/.test(HOST)

const fromEnvFile = (key) => {
  try {
    const txt = fs.readFileSync(path.join(REPO, '.env'), 'utf8')
    return new RegExp(`^${key}=(.*)$`, 'm').exec(txt)?.[1].trim().replace(/^["']|["']$/g, '') || null
  } catch {
    return null
  }
}

const API_PORT =
  Number(process.env.API_HOST_PORT) ||
  Number(argOf('--api', '')) ||
  (REMOTE ? Number(fromEnvFile('API_HOST_PORT')) || 3010 : 3011)
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))

const PW_DIRS = [
  process.env.PLAYWRIGHT_DIR,
  '/opt/rundesk-pw/node_modules',
  `${process.env.HOME ?? '/root'}/.rundesk-pw/node_modules`,
  '/usr/lib/node_modules',
].filter(Boolean)

let chromium
for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
  try {
    ;({ chromium } = require_(id))
  } catch {
    /* next */
  }
  if (chromium) break
}
if (!chromium) {
  for (const dir of PW_DIRS) {
    for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
      const file = `${dir}/${entry}`
      if (!fs.existsSync(file)) continue
      try {
        ;({ chromium } = await import(pathToFileURL(file).href))
      } catch {
        /* try the next */
      }
      if (chromium) break
    }
    if (chromium) break
  }
}
if (!chromium) {
  console.error(
    '\x1b[31m✗ playwright is not installed anywhere this script can see.\x1b[0m\n' +
      `  Searched: ${PW_DIRS.join(', ')}\n` +
      '  Exiting 2 rather than reporting checks nobody ran.',
  )
  process.exit(2)
}

const CHROME = process.env.CHROME || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = {
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(REMOTE && !IS_LOOPBACK ? [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] : []),
  ],
}

let passed = 0
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Raise this when checks are added — a suite that quietly shrinks reads as green. */
const EXPECTED_CHECKS = 19

const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}

const API = `http://127.0.0.1:${API_PORT}/api/v1`

const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const done = async (browser, stack, restore) => {
  await restore?.().catch(() => {})
  await browser?.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

let browser
let stack
let restore

try {
  try {
    const ping = await fetch(`${API}/health`)
    if (!ping.ok) throw new Error(`health returned ${ping.status}`)
  } catch (err) {
    console.error(
      `\x1b[31m✗ no API on 127.0.0.1:${API_PORT}\x1b[0m — ${err.message}\n` +
        '  Start one there, or pass --api <port> / API_HOST_PORT=<port>.',
    )
    process.exit(2)
  }

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  })
  const admin = (await loginRes.json())?.data
  if (!admin?.accessToken) throw new Error(`could not sign in as ${ADMIN.email}`)
  const A = apiAs(admin.accessToken)
  const workspaceId = admin.workspaces[0].id

  // A known timezone, so the clock check is about rendering rather than about
  // whatever this account happened to be set to.
  const before = await A('/users/me')
  const priorTz = before.data?.timezone ?? null
  await A('/users/me', { method: 'PATCH', body: { timezone: 'Asia/Karachi' } })
  restore = async () => {
    if (priorTz) await A('/users/me', { method: 'PATCH', body: { timezone: priorTz } })
    const mine = await A(`/workspaces/${workspaceId}/priorities`)
    for (const p of mine.data ?? []) {
      await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
    }
  }
  // Start from an empty list so the empty state is checkable.
  const existing = await A(`/workspaces/${workspaceId}/priorities`)
  for (const p of existing.data ?? []) {
    await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
  }

  const origin = REMOTE
    ? BASE
    : await (async () => {
        stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
        return stack.base
      })()

  browser = await chromium.launch(LAUNCH)
  /*
   * 1100px wide, on purpose.
   *
   * The card this panel replaced was `hidden xl:flex` — it did not render
   * below 1280px at all, so clicking a name on a 13" laptop did nothing. A
   * suite that runs at 1680 would pass on the old code too.
   */
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 30000 })
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [05:43] — the panel exists, and opens over the page')
  // ---------------------------------------------------------------------
  const urlBefore = page.url()
  await page.getByTestId('user-menu').click()
  await page.waitForTimeout(900)
  check(
    await page.getByTestId('menu-my-profile').isVisible().catch(() => false),
    'the avatar menu offers a profile that is not account settings',
  )
  await page.getByTestId('menu-my-profile').click()
  await page.waitForTimeout(1800)

  const panel = page.getByTestId('person-panel')
  check(await panel.isVisible().catch(() => false), 'the panel opens')
  check(page.url() === urlBefore, 'over the page you were on — no navigation, no lost place', page.url())
  const box = await panel.boundingBox()
  check((box?.width ?? 0) > 300, 'and it renders at 1100px, where the old card did not exist', `${box?.width}`)

  // ---------------------------------------------------------------------
  console.log('\n▶ …and answers what she asked it to')
  // ---------------------------------------------------------------------
  check(await page.getByTestId('person-name').isVisible().catch(() => false), 'it names the person')
  check(await page.getByTestId('person-email').isVisible().catch(() => false), 'shows their email')
  // §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
  const clock = await page.getByTestId('person-local-time').innerText().catch(() => '')
  check(/\d/.test(clock), 'and their LOCAL TIME as a clock, not a zone name', clock)
  check(
    await page.getByTestId('person-reporting').isVisible().catch(() => false),
    'the reporting line is a section on the person (§G06 [06:28])',
  )
  check(
    (await page.getByTestId('person-no-manager').isVisible().catch(() => false)) ||
      (await page.getByTestId('person-manager').isVisible().catch(() => false)),
    '"No manager" is rendered as an answer, not left blank',
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [05:54] — Priorities, the one thing that is a decision')
  // ---------------------------------------------------------------------
  check(
    await page.getByTestId('person-priorities').isVisible().catch(() => false),
    'Priorities is the tab it opens on',
  )
  const emptyText = await page.getByTestId('person-priorities').innerText()
  check(/most important/i.test(emptyText), 'the empty state invites you to add them', emptyText.slice(0, 90))

  await page.getByTestId('priority-input').fill('Ship the release')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  const stored = await A(`/workspaces/${workspaceId}/priorities`)
  check(
    (stored.data ?? []).some((p) => p.title === 'Ship the release'),
    'typing one and pressing Enter stores it',
    JSON.stringify((stored.data ?? []).map((p) => p.title)),
  )

  const first = (stored.data ?? [])[0]
  await page.getByTestId(`priority-done-${first.id}`).click()
  await page.waitForTimeout(1800)
  const afterDone = await A(`/workspaces/${workspaceId}/priorities`)
  const doneRow = (afterDone.data ?? []).find((p) => p.id === first.id)
  check(!!doneRow?.doneAt, 'ticking one off marks it done')
  check(!!doneRow, 'and it stays on the list — "I did that today" survives')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [06:00] / [06:22] — activity and calendar')
  // ---------------------------------------------------------------------
  await page.getByTestId('person-tab-activity').click()
  await page.waitForTimeout(1500)
  check(await page.getByTestId('person-activity').isVisible().catch(() => false), 'the activity feed opens')
  check(
    await page.getByTestId('activity-search').isVisible().catch(() => false),
    'with the search box the frames show on its header',
  )

  await page.getByTestId('person-tab-calendar').click()
  await page.waitForTimeout(1500)
  check(await page.getByTestId('person-calendar').isVisible().catch(() => false), 'and a calendar for the person')

  // ---------------------------------------------------------------------
  console.log('\n▶ it closes without taking you anywhere')
  // ---------------------------------------------------------------------
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  check(!(await page.getByTestId('person-panel').isVisible().catch(() => false)), 'Escape closes it')
  check(page.url() === urlBefore, 'and you are still where you started', page.url())

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
