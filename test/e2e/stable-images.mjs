/**
 * AN UPLOADED AVATAR OR LOGO IS SAVED AT AN ADDRESS THAT DOES NOT EXPIRE.
 *
 * NOT A FRAME ROW: `product-siblings/avatar-logo-persist-expiring-signed-url`.
 * Both uploads saved `getObjectUrl(key)` — with no public R2/CDN domain, which
 * is the default (`R2_PUBLIC_URL` is optional and empty in the production
 * template), a presigned GET that expires in 900 seconds. Every uploaded avatar
 * and logo became a broken image a quarter of an hour after it was set.
 *
 * The lanes run exactly that default: a store with no public domain. So the
 * saved address is checked for having no signature in it, then followed — to a
 * freshly signed URL and the very bytes uploaded — and drawn on screen. The
 * route that answers it is checked for handing out avatars and logos and
 * nothing else. (Existing rows are repaired by migration 0161, which runs where
 * migrations run — production — and was measured against a lane database.)
 *
 *   node test/e2e/stable-images.mjs --api 3011
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 6

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const PASSWORD = 'Member@12345!'
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=',
  'base64',
)

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null
let api = null
let WS = null

/** Upload the product's own way: presign, PUT the bytes, save the address. */
const upload = async (presignRoute, save) => {
  const pre = await api(presignRoute, { method: 'POST', body: { contentType: 'image/png', sizeBytes: TINY_PNG.length } })
  const put = pre.data?.uploadUrl
    ? await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY_PNG })
    : null
  const saved = pre.data?.publicUrl ? await save(pre.data.publicUrl) : { status: 0 }
  return { pre, put: put?.status ?? 0, saved: saved.status, address: pre.data?.publicUrl ?? '' }
}
/** Follow a saved address the way an <img> does, one hop at a time. */
const follow = async (address) => {
  // An absolute address is taken as it is — that is what the old uploads
  // saved, and the check below should say so rather than this throwing.
  const first = await fetch(/^https?:\/\//.test(address) ? address : `${B}${address}`, { redirect: 'manual' })
  const location = first.headers.get('location') ?? ''
  const cache = first.headers.get('cache-control') ?? ''
  const image = location ? await fetch(location) : null
  const bytes = image?.ok ? Buffer.from(await image.arrayBuffer()) : Buffer.alloc(0)
  return { status: first.status, location, cache, imageStatus: image?.status ?? 0, same: bytes.equals(TINY_PNG) }
}
const noSignature = (address) => address.startsWith('/api/v1/public/images/') && !/X-Amz-|Signature|Expires/i.test(address)

try {
  // A fresh account: its avatar is its own, and its workspace is its own.
  const email = `stable-images-${stamp}@rundesk.invalid`
  const signup = await fetch(`${B}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Stable Images', email, password: PASSWORD, organizationName: `Stable ${stamp}`, organizationSlug: `stable-${stamp}` }),
  })
  const session = (await signup.json().catch(() => null))?.data
  if (!session?.accessToken) throw new Error(`could not sign up: ${signup.status}`)
  api = apiClient(`${B}/api/v1`, session.accessToken)
  WS = session.workspaces?.[0]?.id
  if (!WS) throw new Error('the signup answered without a workspace')

  // ══ 1. THE AVATAR ════════════════════════════════════════════════════════
  console.log('\n▶ an uploaded avatar is saved at an address that does not expire')

  const avatar = await upload('/users/me/avatar/presign', (address) => api('/users/me', { method: 'PATCH', body: { avatarUrl: address } }))
  const me = await api('/users/me')
  chk(
    avatar.pre.status < 300 && avatar.put < 300 && avatar.saved < 300 && noSignature(avatar.address) && me.data?.avatarUrl === avatar.address,
    'the address saved for an uploaded avatar carries no signature and no expiry',
    `presign ${avatar.pre.status}, PUT ${avatar.put}, save ${avatar.saved}; saved ${JSON.stringify(me.data?.avatarUrl)}`,
  )
  const avatarServed = await follow(avatar.address)
  chk(
    avatarServed.status === 302 && /X-Amz-Signature=/.test(avatarServed.location) && avatarServed.imageStatus === 200 && avatarServed.same &&
      /max-age=(\d+)/.test(avatarServed.cache) && Number(avatarServed.cache.match(/max-age=(\d+)/)[1]) < 900,
    'and it answers with a freshly signed URL — cached for less than that URL lives — to the very bytes uploaded',
    `answered ${avatarServed.status} → ${avatarServed.location.slice(0, 80)}; image ${avatarServed.imageStatus}, same bytes ${avatarServed.same}; cache ${JSON.stringify(avatarServed.cache)}`,
  )

  // ══ 2. THE LOGO ══════════════════════════════════════════════════════════
  console.log('\n▶ and so is a workspace logo')

  const logo = await upload(`/workspaces/${WS}/logo/presign`, (address) => api(`/workspaces/${WS}`, { method: 'PATCH', body: { logoUrl: address } }))
  const ws = await api(`/workspaces/${WS}`)
  const logoServed = await follow(logo.address)
  chk(
    logo.pre.status < 300 && logo.put < 300 && logo.saved < 300 && noSignature(logo.address) && ws.data?.logoUrl === logo.address &&
      logoServed.status === 302 && logoServed.imageStatus === 200 && logoServed.same,
    'a workspace logo is saved the same way, and answers with its bytes',
    `presign ${logo.pre.status}, PUT ${logo.put}, save ${logo.saved}; saved ${JSON.stringify(ws.data?.logoUrl)}; served ${logoServed.status}/${logoServed.imageStatus}, same ${logoServed.same}`,
  )

  // ══ 3. WHAT THE ROUTE HANDS OUT ══════════════════════════════════════════
  console.log('\n▶ the route hands out avatars and logos, and nothing else')

  const refusals = []
  for (const probe of [
    'attachments/secret.png',
    'workspaces/some-file.pdf',
    'avatars/..%2F..%2Fattachments%2Fsecret.png',
    'avatars/%2E%2E',
  ]) {
    const res = await fetch(`${B}/api/v1/public/images/${probe}`, { redirect: 'manual' })
    if (res.status !== 404 || res.headers.get('location')) refusals.push(`${probe} → ${res.status} ${res.headers.get('location') ?? ''}`)
  }
  chk(
    refusals.length === 0,
    'another prefix, an encoded dot segment or an escape from the folder is answered 404, with nowhere to go',
    `answered: ${JSON.stringify(refusals)}`,
  )

  // ══ 4. ON SCREEN ═════════════════════════════════════════════════════════
  console.log('\n▶ and the picture is drawn')

  browser = await chromium.launch(launchOptions())
  const tab = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage()
  await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await tab.fill('input[type=email]', email)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const drawn = (address) =>
    tab.evaluate((a) => {
      const imgs = [...document.querySelectorAll('img')].filter((img) => img.getAttribute('src') === a)
      return { count: imgs.length, loaded: imgs.filter((img) => img.complete && img.naturalWidth > 0).length }
    }, address).catch(() => ({ count: 0, loaded: 0 }))
  await waitUntil(async () => (await drawn(avatar.address)).loaded > 0, { timeoutMs: 20_000 })
  const avatarOnScreen = await drawn(avatar.address)
  chk(
    avatarOnScreen.count > 0 && avatarOnScreen.loaded === avatarOnScreen.count,
    'the avatar is drawn from its saved address, every place it appears',
    `${avatarOnScreen.count} image(s) with that address, ${avatarOnScreen.loaded} loaded`,
  )
  await tab.goto(`${B}/app/${WS}/settings?tab=general`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await drawn(logo.address)).loaded > 0, { timeoutMs: 20_000 })
  const logoOnScreen = await drawn(logo.address)
  chk(
    logoOnScreen.count > 0 && logoOnScreen.loaded === logoOnScreen.count,
    'and the workspace logo from its own',
    `${logoOnScreen.count} image(s) with that address, ${logoOnScreen.loaded} loaded`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
