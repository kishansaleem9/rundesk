/**
 * A SETTINGS SAVE WRITES WHAT IT MAY, AND A PICTURE IS ONE WE STORE.
 *
 * NOT A FRAME ROW. Two found items:
 *
 * `found-24-sep/workspace-settings-mass-assign`: `PATCH /workspaces/:id`
 * spread its body into the row, so a workspace admin's save set the plan, its
 * limits, and a custom domain's verification and token (measured, 200 each).
 * The plan is the platform admin's; verification is the DNS check's, and a
 * verified domain is served a branded sign-in page and a certificate.
 *
 * `found-23-sep/avatar-and-logo-accept-any-url`: a profile picture and a
 * workspace logo were saved as whatever string arrived, so a picture could
 * point at any host, and every viewer's browser would ask it. ClickUp takes an
 * upload and nothing else.
 *
 * Every refusal is read back from the row, beside the change the same save or
 * the same person is allowed. And the settings page offers a logo as an upload,
 * with no address box inviting what the save refuses.
 *
 *   node test/e2e/settings-writes.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `stw-${stamp}`
const FOREIGN = `https://tracker-${stamp}.example.com/pixel.png`
let sql = null
let WS = null
let W = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every write is read back from its row')
  // A workspace admin who is NOT a platform admin: the plan route refuses them.
  const email = `${TAG}-admin@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Settings admin', email, password: 'Member@12345!',
    organizationName: `Settings ${stamp}`, organizationSlug: `settings-${stamp}`,
  })
  W = apiAs(signed.accessToken)
  const userId = signed.user?.id
  const made = await W('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const row = async () => (await sql`select name, plan, plan_limits, custom_domain_verified, custom_domain_token, logo_url from workspaces where id = ${WS}`)[0]
  const userRow = async () => (await sql`select avatar_url from users where id = ${userId}`)[0]

  // ══ 1. WHAT A SETTINGS SAVE MAY WRITE ════════════════════════════════════
  console.log('\n▶ a settings save that names the plan and the domain’s verification')
  await W(`/workspaces/${WS}`, { method: 'PATCH', body: { customDomain: `${TAG}.example.com` } })
  const before = await row()
  const saved = await W(`/workspaces/${WS}`, {
    method: 'PATCH',
    body: { name: `${TAG} renamed`, plan: before.plan === 'free' ? 'enterprise' : 'free', planLimits: { seats: 99999 }, customDomainVerified: true, customDomainToken: 'chosen-by-the-caller' },
  })
  const after = await row()
  chk(
    saved.status === 200 && after.name === `${TAG} renamed` && after.plan === before.plan &&
      JSON.stringify(after.plan_limits) === JSON.stringify(before.plan_limits) &&
      after.custom_domain_verified === false && after.custom_domain_token === before.custom_domain_token,
    'a workspace admin’s save renames the workspace and changes neither its plan, its limits, nor its domain’s verification or token',
    `${said(saved)}; name ${JSON.stringify(after.name)}, plan ${before.plan} → ${after.plan}, limits ${JSON.stringify(after.plan_limits)}, verified ${after.custom_domain_verified}, token ${after.custom_domain_token === 'chosen-by-the-caller' ? 'THE CALLER’S' : 'kept'}`,
  )

  // ══ 2. A WORKSPACE LOGO ══════════════════════════════════════════════════
  console.log('\n▶ a workspace logo at another host, and an uploaded one')
  const outside = await W(`/workspaces/${WS}`, { method: 'PATCH', body: { logoUrl: FOREIGN } })
  const logoAfterOutside = (await row()).logo_url
  const presigned = await W(`/workspaces/${WS}/logo/presign`, { method: 'POST', body: { contentType: 'image/png', sizeBytes: 100 } })
  const own = presigned.data?.publicUrl
  const inside = own ? await W(`/workspaces/${WS}`, { method: 'PATCH', body: { logoUrl: own } }) : { status: 0 }
  const logoAfterOwn = (await row()).logo_url
  chk(
    outside.status === 400 && logoAfterOutside !== FOREIGN && presigned.status < 300 && inside.status === 200 && logoAfterOwn === own,
    'a logo at another host is refused and not saved — the workspace’s own upload is',
    `another host ${said(outside)}, saved: ${logoAfterOutside === FOREIGN}; presign ${said(presigned)}; the upload's address ${inside.status}, saved: ${logoAfterOwn === own}`,
  )

  // ══ 3. A PROFILE PICTURE ═════════════════════════════════════════════════
  console.log('\n▶ a profile picture at another host, an uploaded one, and none')
  const pOutside = await W('/users/me', { method: 'PATCH', body: { avatarUrl: FOREIGN } })
  const avatarAfterOutside = (await userRow()).avatar_url
  const avPresign = await W('/users/me/avatar/presign', { method: 'POST', body: { contentType: 'image/png', sizeBytes: 100 } })
  const avOwn = avPresign.data?.publicUrl
  const pInside = avOwn ? await W('/users/me', { method: 'PATCH', body: { avatarUrl: avOwn } }) : { status: 0 }
  const avatarAfterOwn = (await userRow()).avatar_url
  const pNone = await W('/users/me', { method: 'PATCH', body: { avatarUrl: null } })
  const avatarAfterNone = (await userRow()).avatar_url
  chk(
    pOutside.status === 400 && avatarAfterOutside !== FOREIGN && pInside.status === 200 && avatarAfterOwn === avOwn && pNone.status === 200 && avatarAfterNone === null,
    'a profile picture at another host is refused and not saved — an uploaded one is, and none removes it',
    `another host ${said(pOutside)}, saved: ${avatarAfterOutside === FOREIGN}; the upload ${pInside.status}, saved: ${avatarAfterOwn === avOwn}; none ${pNone.status}, now ${JSON.stringify(avatarAfterNone)}`,
  )

  // ══ 4. THE PICTURE A SIGN-IN PROVIDER SAVED, AND A WALK OUT ══════════════
  console.log('\n▶ the picture a sign-in provider saved, sent back unchanged; and a walk out of the avatars')
  const PROVIDER = `https://lh3.googleusercontent.com/a/${TAG}`
  await sql`update users set avatar_url = ${PROVIDER} where id = ${userId}`
  const kept = await W('/users/me', { method: 'PATCH', body: { displayName: 'Settings admin', avatarUrl: PROVIDER } })
  const avatarKept = (await userRow()).avatar_url
  const walk = await W('/users/me', { method: 'PATCH', body: { avatarUrl: '/api/v1/public/images/avatars/../attachments/x.png' } })
  const avatarAfterWalk = (await userRow()).avatar_url
  chk(
    kept.status === 200 && avatarKept === PROVIDER && walk.status === 400 && avatarAfterWalk === PROVIDER,
    'a save that sends back the picture a sign-in provider saved keeps it — and an address that walks out of the avatars is refused',
    `sent back ${said(kept)}, kept: ${avatarKept === PROVIDER}; the walk ${said(walk)}, now ${JSON.stringify(avatarAfterWalk)}`,
  )

  // ══ 5. THE SETTINGS PAGE'S LOGO ══════════════════════════════════════════
  console.log('\n▶ the settings page’s logo')
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'Member@12345!')
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
  const upload = page.getByRole('button', { name: /Upload logo/ })
  const drawn = await upload.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  const addressBoxes = await page.locator('input[placeholder="https://…/logo.png"], input#logo').count()
  chk(
    drawn && addressBoxes === 0,
    'the settings page offers the logo as an upload, with no address box for what the save refuses',
    `the upload offered: ${drawn}; address boxes: ${addressBoxes}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && W) {
    const gone = await W(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
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
