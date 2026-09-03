/**
 * §G02-9 [01:12] — the source strip under the query.
 *
 * "All | ClickUp | Google Drive | Gmail | SharePoint | Apps" is on screen in
 * every search frame of the section, and we had no concept of a SOURCE at all:
 * nothing to scope to, and nothing to say when a source was not connected.
 *
 * The half these checks care most about is the second one. Drive federation
 * already existed and returned `[]` when the workspace had no connection —
 * which reads to a person as "you have no matching files in Drive", and that is
 * false. **Silence is a wrong answer wearing the clothes of a right one**, so
 * an unconnected source has to say so and offer the way to connect it.
 *
 * WHAT IS NOT CHECKED HERE, and the reason. The Gmail and SharePoint QUERIES
 * cannot run: they need OAuth credentials for those providers, which no test
 * environment holds. What is exercised is everything up to the credential —
 * the strip, the scoping, and the honest "not connected". The federated
 * requests themselves are unexercised, and saying so is better than implying a
 * coverage that does not exist.
 *
 *   node test/e2e/search-sources.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 7

const chromium = await resolveChromium()
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
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const login = await apiAs(null)('/auth/login', { method: 'POST', body: ME })
  if (!login.data?.accessToken) throw new Error(`login failed: ${login.status}`)
  const A = apiAs(login.data.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  console.log('\n▶ §G02-9 — a source that cannot answer says so')

  const sources = (await A(`/search/sources/${workspaceId}`)).data ?? []
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]))
  chk(
    ['rundesk', 'google-drive', 'gmail', 'sharepoint'].every((id) => id in byId),
    'the workspace can be asked what it can search',
    `sources returned ${JSON.stringify(sources.map((s) => s.id))}`,
  )
  /*
   * Our own data needs no credential, so it is the one source that must always
   * be answerable. A registry that reported it unconnected would put the whole
   * product behind a "connect" prompt.
   */
  chk(byId.rundesk?.connected === true, 'and Rundesk itself is always answerable',
    `rundesk reported connected=${byId.rundesk?.connected}`)
  /*
   * These are unconnected in any test environment, which is what makes this
   * suite able to check the honest-empty behaviour at all — the state a real
   * workspace is in before anybody connects anything.
   */
  chk(
    byId.gmail?.connected === false && byId.sharepoint?.connected === false,
    'and a provider with no stored credential reports itself unconnected',
    `gmail=${byId.gmail?.connected} sharepoint=${byId.sharepoint?.connected}`,
  )

  // ── On screen ─────────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: 30000 })
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(1500)

  chk(
    await page.getByTestId('palette-sources').isVisible().catch(() => false),
    'the palette carries a source strip',
    'no source strip under the query',
  )
  chk(
    await page.getByTestId('palette-source-gmail').isVisible().catch(() => false),
    'with a tab for each source',
    'Gmail has no tab',
  )

  /*
   * The whole point. Before this, choosing an unconnected source produced an
   * empty result list and nothing else — indistinguishable from "there is
   * nothing there".
   */
  await page.getByTestId('palette-source-gmail').click()
  await page.waitForTimeout(1500)
  chk(
    await page.getByTestId('palette-source-disconnected').isVisible().catch(() => false),
    'and choosing an unconnected one says so, instead of showing an empty list',
    'an unconnected source returned silence — indistinguishable from having nothing',
  )
  chk(
    await page.getByTestId('palette-source-connect').isVisible().catch(() => false),
    'and offers the way to connect it',
    'the message names no way out',
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
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
