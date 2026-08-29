/**
 * §1.3 [10:13] — the SECOND-level panel collapses too.
 *
 * > "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai, aur jab
 * > hum kaam kar rahe hote hain to it's kind of frustrating"
 *
 * The outer sidebar's collapse shipped and was verified live, and it was half
 * the answer. On /chat we stacked 288px of workspace sidebar against 272px of
 * channel list; on /docs against a 240px tree that could sit beside two more
 * 300px panels. Collapsing only the outer column left the screen she was
 * pointing at still carrying two of them.
 *
 * This is measured rather than asserted from markup: the claim is about SPACE,
 * so the checks read bounding boxes. The one that matters most is the last —
 * a second browser context, signed in fresh, opening the panel collapsed,
 * because a preference stored only in localStorage is a preference that is
 * forgotten on the next machine.
 *
 *   node test/e2e/panel-collapse.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/panel-collapse.mjs
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
const EXPECTED_CHECKS = 18

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

  // Start from a known state: the checks below are about what a collapse does,
  // not about what this account happened to leave behind last time.
  await A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {} } })
  restore = () => A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {} } })

  const origin = REMOTE
    ? BASE
    : await (async () => {
        stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
        return stack.base
      })()

  browser = await chromium.launch(LAUNCH)
  const signIn = async (page) => {
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', ADMIN.email)
    await page.fill('input[type=password]', ADMIN.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app\//, { timeout: 30000 })
  }

  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await signIn(page)

  // ---------------------------------------------------------------------
  console.log('\n▶ the chat channel list collapses')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const panel = page.getByTestId('chat-panel')
  check(await panel.isVisible().catch(() => false), 'the channel list starts expanded')
  const wide = await panel.boundingBox()
  check(Math.round(wide?.width ?? 0) === 272, 'and is 272px wide — half the double navigation', `${wide?.width}`)

  await page.getByTestId('chat-panel-collapse').click()
  await page.waitForTimeout(1400)
  const rail = page.getByTestId('chat-panel-rail')
  check(await rail.isVisible().catch(() => false), 'collapsing leaves a rail')
  const narrow = await rail.boundingBox()
  check(Math.round(narrow?.width ?? 0) === 56, 'at 56px, not zero — channels stay one click away', `${narrow?.width}`)
  check(
    Math.round((wide?.width ?? 0) - (narrow?.width ?? 0)) === 216,
    'reclaiming 216px of chrome, which is the whole complaint',
    `${wide?.width} -> ${narrow?.width}`,
  )
  const railButtons = await page.locator('[data-testid="chat-panel-rail"] button').count()
  check(railButtons > 1, 'and the rail still carries the channels', `${railButtons} buttons`)

  // ---------------------------------------------------------------------
  console.log('\n▶ …and a SECOND browser opens it collapsed')
  // ---------------------------------------------------------------------
  // The point of storing this on the person rather than the browser. A local
  // -only preference passes every check above and still fails the user the
  // first time they sit at another machine.
  await page.waitForTimeout(1800)
  const other = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await signIn(other)
  await other.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  await other.waitForTimeout(4500)
  check(
    await other.getByTestId('chat-panel-rail').isVisible().catch(() => false),
    'the preference is the person’s, not the machine’s',
    'a fresh context showed the expanded list',
  )
  await other.close()

  await page.getByTestId('chat-panel-expand').click()
  await page.waitForTimeout(1400)
  check(await page.getByTestId('chat-panel').isVisible().catch(() => false), 'and it expands again')

  // ---------------------------------------------------------------------
  console.log('\n▶ the docs tree collapses independently')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/docs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const tree = page.getByTestId('docs-tree')
  check(await tree.isVisible().catch(() => false), 'the page tree starts expanded')
  const treeWide = await tree.boundingBox()
  check(Math.round(treeWide?.width ?? 0) === 240, 'at 240px', `${treeWide?.width}`)

  await page.getByTestId('docs-tree-collapse').click()
  await page.waitForTimeout(1400)
  const strip = await page.getByTestId('docs-tree-rail').boundingBox()
  check(Math.round(strip?.width ?? 0) === 48, 'collapsing leaves a 48px strip', `${strip?.width}`)

  await page.waitForTimeout(1500)
  const me = await A('/users/me')
  check(
    me.data?.panelsCollapsed?.docs === true && me.data?.panelsCollapsed?.chat === false,
    'collapsing the docs tree said nothing about the chat list',
    JSON.stringify(me.data?.panelsCollapsed),
  )

  await page.getByTestId('docs-tree-expand').click()
  await page.waitForTimeout(1400)
  check(await page.getByTestId('docs-tree').isVisible().catch(() => false), 'and the tree comes back')

  // ---------------------------------------------------------------------
  console.log('\n▶ Which doc is open is an address')
  // ---------------------------------------------------------------------
  /*
   * `?doc=` was read once at mount out of window.location.search and never
   * written — docs-panel.tsx contained no navigate at all. So clicking a page
   * changed nothing in the address, a reload put you on whichever doc sorted
   * first, and copying the address bar sent the docs index. The app was
   * already generating this exact link: the insert menu writes
   * /app/<ws>/docs?doc=<id> into doc bodies, and the search indexer builds it.
   */
  const DOC_A = `addr probe A ${Date.now()}`
  const DOC_B = `addr probe B ${Date.now()}`
  const docA = await A(`/workspaces/${workspaceId}/docs`, { method: 'POST', body: { title: DOC_A } })
  const docB = await A(`/workspaces/${workspaceId}/docs`, { method: 'POST', body: { title: DOC_B } })
  const idA = docA.data?.id
  const idB = docB.data?.id

  if (!idA || !idB) {
    check(false, 'could not seed two docs to switch between')
    check(false, 'so the doc address was never exercised')
    check(false, 'and neither was the bucket rail')
  } else {
    await page.goto(`${origin}/app/${workspaceId}/docs`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    check(
      /[?&]doc=/.test(page.url()),
      'landing on /docs names the doc it opened',
      page.url(),
    )

    await page.getByTestId(`docs-tree-item-${idB}`).first().click()
    await page.waitForTimeout(1800)
    check(page.url().includes(`doc=${idB}`), 'clicking a page puts it in the address', page.url())

    /*
     * The point of an address: reopening it returns the SAME doc rather than
     * whichever sorts first. Asserted on the active-doc heading, not on page
     * text — the tree lists every doc, so "DOC_B appears somewhere" is true
     * even when the editor is showing something else, and it passed against
     * the unfixed code for exactly that reason.
     */
    const opened = page.url()
    await page.goto(`${origin}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.goto(opened, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    const activeTitle = await page.getByTestId('docs-active-title').innerText().catch(() => '')
    check(
      activeTitle.includes(DOC_B),
      `and reopening that address returns the same doc (${activeTitle.trim()})`,
      `the editor opened "${activeTitle.trim()}" instead`,
    )

    await A(`/docs/${idA}`, { method: 'DELETE' }).catch(() => {})
    await A(`/docs/${idB}`, { method: 'DELETE' }).catch(() => {})
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ A dashboard preset you can share is a preset you can link')
  // ---------------------------------------------------------------------
  /*
   * Presets carry shareCount / isSharedWithMe and have a Share dialog on every
   * row, but the route declared no search schema at all — which one you were
   * looking at was component state. Share "Q3 Exec", send the URL, and the
   * recipient lands on the Overview tab and has to hunt for it; your own
   * reload does the same to you.
   */
  const PRESET = `addr preset ${Date.now()}`
  // POST /dashboards with workspaceId in the body, and `layout` an array —
  // CreateDashboardPresetDto validates both.
  const preset = await A('/dashboards', {
    method: 'POST',
    body: { workspaceId, name: PRESET, layout: [] },
  })
  const presetId = preset.data?.id
  if (!presetId) {
    check(false, 'could not create a preset to link to')
    check(false, 'so the preset address was never exercised')
  } else {
    await page.goto(`${origin}/app/${workspaceId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    check(!/[?&]preset=/.test(page.url()), 'the dashboard starts with no preset in the address', page.url())

    // Custom is where presets are listed.
    await page.getByText('Custom', { exact: false }).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const row = page.getByTestId(`dashboard-preset-${presetId}`)
    if ((await row.count()) === 0) {
      check(false, `the preset "${PRESET}" was not listed to click`)
    } else {
      await row.first().click()
      await page.waitForTimeout(1800)
      check(
        page.url().includes(`preset=${presetId}`),
        'choosing a preset puts it in the address',
        page.url(),
      )
    }
    await A(`/dashboards/${presetId}`, { method: 'DELETE' }).catch(() => {})
  }

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
