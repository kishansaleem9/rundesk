/**
 * §G01-9 [00:35] — the Overview's Bookmarks card.
 *
 * > "Bookmarks make it easy to save ClickUp items or any URL from around the
 * >  web." + "Add Bookmark"
 *
 * The "any URL from around the web" half is the whole reason this is not just
 * another favourite: favourites hold internal nav paths and are handed to the
 * router, and a router given `https://…` goes nowhere. So the checks here care
 * about BOTH kinds — an in-app path and an external link — and about what the
 * card does with each, because getting one right and the other wrong is the
 * likeliest way to half-build this.
 *
 *   node test/e2e/bookmarks.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran": a selector matching nothing sweeps clean. */
const EXPECTED_CHECKS = 9

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
  const login = await signInApi(API, ME.email, ME.password)
  const A = apiAs(login.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  // Start from a known slate: earlier runs must not decide what this one sees.
  for (const b of (await A(`/workspaces/${workspaceId}/bookmarks`)).data ?? []) {
    await A(`/workspaces/${workspaceId}/bookmarks/${b.id}`, { method: 'DELETE' }).catch(() => {})
  }

  console.log('\n▶ §G01-9 — a Rundesk item, or any URL from around the web')

  // ── What may be saved ─────────────────────────────────────────────────────
  const external = await A(`/workspaces/${workspaceId}/bookmarks`, {
    method: 'POST',
    body: { url: `https://example.com/spec-${stamp}`, title: `The spec ${stamp}` },
  })
  chk(
    external.status < 400 && external.data?.url?.startsWith('https://'),
    'an external URL can be saved — the thing a favourite cannot hold',
    `POST returned ${external.status}: ${JSON.stringify(external.error)}`,
  )

  const internal = await A(`/workspaces/${workspaceId}/bookmarks`, {
    method: 'POST',
    body: { url: `/app/${workspaceId}/inbox` },
  })
  chk(
    internal.status < 400 && internal.data?.title === `/app/${workspaceId}/inbox`,
    'and an in-app path, standing in its own URL when no name is given',
    `title came back as ${JSON.stringify(internal.data?.title)}`,
  )

  /*
   * A bookmark is rendered as a link, so `javascript:` would be script running
   * on this origin the moment somebody clicks their own saved item. Refused on
   * the way IN, so a row that exists is a row that is safe to render.
   */
  const nasty = await A(`/workspaces/${workspaceId}/bookmarks`, {
    method: 'POST',
    body: { url: 'javascript:alert(1)' },
  })
  chk(nasty.status === 400, 'a javascript: url is refused, not stored',
    `POST javascript: returned ${nasty.status}`)

  /*
   * ── Somebody else's bookmark is not yours to delete ───────────────────────
   *
   * Checked against ANOTHER SIGNED-IN PERSON, not against an anonymous caller.
   * The first version did the latter and passed cleanly against a DELETE with
   * the owner dropped from its WHERE — of course it did: the auth guard stops
   * a stranger, and what the scoping protects against is a colleague who knows
   * an id. Break-testing found it.
   */
  const mine = external.data?.id
  const peer = await signInApi(
    API,
    process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal',
    process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!',
  )
  const B = apiAs(peer.accessToken)
  const stray = await B(`/workspaces/${workspaceId}/bookmarks/${mine}`, { method: 'DELETE' })
  const survives = ((await A(`/workspaces/${workspaceId}/bookmarks`)).data ?? []).some((b) => b.id === mine)
  chk(
    stray.status >= 400 && survives,
    'and a colleague who knows the id still cannot delete it',
    `peer DELETE returned ${stray.status}; the bookmark ${survives ? 'survived' : 'is GONE'}`,
  )

  // ── On the page ───────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)

  chk(
    await page.getByTestId('home-bookmarks').isVisible().catch(() => false),
    'the Overview carries a Bookmarks card',
    'no bookmarks card on the workspace home',
  )
  const listed = (await page.getByTestId('bookmarks-list').innerText().catch(() => '')).trim()
  chk(listed.includes(`The spec ${stamp}`), 'and shows what was saved',
    `the card read ${JSON.stringify(listed.slice(0, 120))}`)

  /*
   * The external one is an ANCHOR opening a new tab; the internal one is a
   * button that navigates. Getting this backwards is the defect the whole
   * table exists to avoid — a router handed an absolute URL goes nowhere — so
   * the element kind is checked, not just that something rendered.
   */
  const externalEl = page.getByTestId(`bookmark-${external.data.id}`)
  const tag = await externalEl.evaluate((el) => el.tagName.toLowerCase()).catch(() => '')
  const target = await externalEl.getAttribute('target').catch(() => null)
  chk(
    tag === 'a' && target === '_blank',
    'an external bookmark is a real link that opens a new tab',
    `rendered as <${tag}> target=${target}`,
  )
  const internalTag = await page
    .getByTestId(`bookmark-${internal.data.id}`)
    .evaluate((el) => el.tagName.toLowerCase())
    .catch(() => '')
  chk(
    internalTag === 'button',
    'and an in-app one navigates instead of leaving the app',
    `rendered as <${internalTag}>`,
  )

  // ── Adding one from the card ──────────────────────────────────────────────
  await page.getByTestId('bookmark-add-open').click()
  await page.getByTestId('bookmark-url').fill(`https://example.com/added-${stamp}`)
  await page.getByTestId('bookmark-title').fill(`Added from the card ${stamp}`)
  await page.getByTestId('bookmark-save').click()
  await page.waitForTimeout(2500)
  const after = (await A(`/workspaces/${workspaceId}/bookmarks`)).data ?? []
  chk(
    after.some((b) => b.title === `Added from the card ${stamp}`),
    'and Add Bookmark actually saves one, rather than only closing the form',
    `server holds ${JSON.stringify(after.map((b) => b.title))}`,
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
