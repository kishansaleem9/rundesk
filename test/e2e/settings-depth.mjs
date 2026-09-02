/**
 * §G06 [06:42–07:39] — four things the settings menu she walked could do.
 *
 * Each of these is checked over HTTP too, and that is not the same question.
 * A status you can PUT but cannot find a box for is not a status; a contrast
 * toggle that stores a boolean and changes no pixel is not an accessibility
 * mode. So this drives the real UI and, for contrast, reads the computed
 * colour off the page rather than trusting the class.
 *
 *   node test/e2e/settings-depth.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/settings-depth.mjs
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
const EXPECTED_CHECKS = 31

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

  // Known starting point, and put it back afterwards.
  await A('/presence/me/status', { method: 'PUT', body: { emoji: null, text: null } })
  await A('/notifications/mute', { method: 'POST', body: { minutes: null } })
  await A('/users/me', { method: 'PATCH', body: { highContrast: false } })
  restore = async () => {
    await A('/presence/me/status', { method: 'PUT', body: { emoji: null, text: null } })
    await A('/notifications/mute', { method: 'POST', body: { minutes: null } })
    await A('/users/me', { method: 'PATCH', body: { highContrast: false } })
  }

  const origin = REMOTE
    ? BASE
    : await (async () => {
        stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
        return stack.base
      })()

  browser = await chromium.launch(LAUNCH)
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 30000 })
  // Land in the workspace explicitly. A platform super-admin is redirected to
  // /app/admin on sign-in, and that console has no top bar — so a suite that
  // trusts wherever login left it fails looking for a menu that is not on the
  // page it happens to be on.
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [06:42] — a status in your own words')
  // ---------------------------------------------------------------------
  await page.getByTestId('user-menu').click()
  await page.waitForTimeout(1000)
  check(
    await page.getByTestId('menu-set-status').isVisible().catch(() => false),
    'the avatar menu offers "Set a status"',
  )
  await page.getByTestId('menu-set-status').click()
  await page.waitForTimeout(600)
  check(
    await page.getByTestId('status-composer').isVisible().catch(() => false),
    'it opens a composer, not a list of four fixed words',
  )
  await page.getByTestId('status-emoji').fill('🕌')
  await page.getByTestId('status-text').fill('Namaz break, back in 30')
  // "30 minutes" is her own example, and the part four presences cannot do.
  await page.getByTestId('status-for-30').click()
  await page.getByTestId('status-save').click()
  await page.waitForTimeout(2200)

  const me = await A('/users/me')
  check(me.data?.statusText === 'Namaz break, back in 30', 'the status is stored', JSON.stringify(me.data?.statusText))
  check(me.data?.statusEmoji === '🕌', 'with its emoji')
  const expiresIn = me.data?.statusExpiresAt
    ? new Date(me.data.statusExpiresAt).getTime() - Date.now()
    : 0
  check(
    expiresIn > 25 * 60_000 && expiresIn < 31 * 60_000,
    'and it stops being true in about thirty minutes',
    `${Math.round(expiresIn / 60000)} min`,
  )

  const presence = await A(`/workspaces/${workspaceId}/presence`)
  check(
    (presence.data ?? []).some((p) => p.customStatus?.text === 'Namaz break, back in 30'),
    'a teammate reading presence sees it — the whole point',
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [06:53] — mute for a length of time')
  // ---------------------------------------------------------------------
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.getByTestId('user-menu').click()
  await page.waitForTimeout(900)
  check(
    await page.getByTestId('menu-mute-30').isVisible().catch(() => false),
    'the menu offers durations, not just on/off',
  )
  await page.getByTestId('menu-mute-60').click()
  await page.waitForTimeout(2000)
  const mute = await A('/notifications/mute')
  const muteMs = mute.data?.mutedUntil ? new Date(mute.data.mutedUntil).getTime() - Date.now() : 0
  check(muteMs > 55 * 60_000 && muteMs < 61 * 60_000, 'pressing 1h mutes for an hour', `${Math.round(muteMs / 60000)} min`)

  // A mute that ends is the whole difference from the switch this replaced.
  check(mute.data?.mutedUntil != null, 'and it has an end, unlike the switch it sits above')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [07:03] — high contrast')
  // ---------------------------------------------------------------------
  await page.keyboard.press('Escape')
  await page.goto(`${origin}/app/profile`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const toggle = page.getByTestId('high-contrast-toggle')
  check(await toggle.isVisible().catch(() => false), 'the profile page offers a high-contrast toggle')

  // The colour BEFORE, read off the page rather than assumed.
  const mutedBefore = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim(),
  )
  await toggle.click()
  await page.waitForTimeout(1200)
  check(
    await page.evaluate(() => document.documentElement.classList.contains('high-contrast')),
    'switching it on marks the document',
  )
  const mutedAfter = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim(),
  )
  // The claim is about pixels, so this reads the resolved token. A toggle that
  // stores a boolean and changes no colour is not an accessibility mode.
  check(mutedAfter !== mutedBefore, 'and muted text actually changes colour', `${mutedBefore} -> ${mutedAfter}`)
  check(
    /^0 0% (1[0-9]|[0-9])%$/.test(mutedAfter) || /^0 0% 8[0-9]%$/.test(mutedAfter),
    'to something near black or near white, not another grey',
    mutedAfter,
  )

  await page.waitForTimeout(1200)
  const hc = await A('/users/me')
  check(hc.data?.highContrast === true, 'and the choice follows the person to their next device')

  /*
   * ---------------------------------------------------------------------
   * G06-6 [07:03] — the timezone, from the same panel
   *
   * It was a free-text box you typed an IANA name into from memory. A typo was
   * accepted, and `startOfDayIn` falls back to UTC on a zone it cannot read
   * rather than throwing — deliberately, so one bad row cannot take down a
   * profile page. The cost of that kindness is silence: "Asia/Karach" bought
   * you UTC for every due date, reminder, digest and TODAY bucket, with
   * nothing anywhere saying so.
   *
   * The picker is the visible half. The API refusing the value is the half
   * that matters, because the form is not the only writer — so both are
   * driven here, and the refusal is driven through the API directly.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G06-6 [07:03] — a timezone you pick, and one the server will vouch for')
  const tzBefore = (await A('/users/me')).data?.timezone ?? 'UTC'

  const tzPicker = page.getByTestId('profile-timezone')
  check(await tzPicker.isVisible().catch(() => false), 'the timezone is a picker, not a box to type into')
  check(
    (await tzPicker.evaluate((el) => el.tagName).catch(() => '')) === 'SELECT',
    'and it really is a list of zones',
    await tzPicker.evaluate((el) => el.tagName).catch(() => '(missing)'),
  )
  // A handful would mean a fallback list rendered because the real one failed.
  const zoneCount = await tzPicker.evaluate((el) => el.options.length).catch(() => 0)
  check(zoneCount > 100, 'holding the world, not a shortlist', `${zoneCount} options`)
  /*
   * Driven with a LEGACY alias on the account, not whatever it happened to be.
   *
   * The first version of this check used the seeded zone, which is a canonical
   * name and therefore already in the list — so deleting the "offer the stored
   * value even if we do not know it" line broke nothing and the check still
   * passed. `US/Pacific` is real, in use, accepted by the server, and absent
   * from `Intl.supportedValuesOf`, which is exactly the case that would
   * silently rewrite somebody's zone on page load.
   */
  await A('/users/me', { method: 'PATCH', body: { timezone: 'US/Pacific' } })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  check(
    (await page.getByTestId('profile-timezone').inputValue().catch(() => '')) === 'US/Pacific',
    'and a stored zone the list does not contain is still the one selected',
    `picker=${await page.getByTestId('profile-timezone').inputValue().catch(() => '')}`,
  )
  await A('/users/me', { method: 'PATCH', body: { timezone: tzBefore } })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  check(
    (await page.getByTestId('profile-timezone').inputValue().catch(() => '')) === tzBefore,
    'and it opens on the zone already stored, rather than rewriting it',
    `picker=${await page.getByTestId('profile-timezone').inputValue().catch(() => '')} stored=${tzBefore}`,
  )

  check(
    await page.getByTestId('profile-timezone-notice').isVisible().catch(() => false),
    'with "notify me of timezone changes" beside it, as her frame has',
  )

  /*
   * The refusal. Sent straight to the API: a picker cannot stop another client
   * — or the next form somebody writes — from storing a typo, so validation
   * has to live on the server and be checked there.
   */
  const badTz = await A('/users/me', { method: 'PATCH', body: { timezone: 'Asia/Karach' } })
  check(badTz.status === 400, 'a zone the system cannot read is refused', `PATCH returned ${badTz.status}`)
  const stillGood = await A('/users/me')
  check(
    stillGood.data?.timezone === tzBefore,
    'and the stored zone is untouched by the attempt',
    `stored=${stillGood.data?.timezone}`,
  )
  // Legacy aliases are real and in use, and the server accepts them — so the
  // validator must not be a whitelist of canonical names only.
  const legacy = await A('/users/me', { method: 'PATCH', body: { timezone: 'US/Pacific' } })
  check(legacy.status === 200, 'but a legacy alias somebody actually has is still allowed', `${legacy.status}`)
  await A('/users/me', { method: 'PATCH', body: { timezone: tzBefore } })

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [07:30] — Help can ask for a call')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/help`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    await page.getByTestId('book-call-open').isVisible().catch(() => false),
    'Help offers a call, not only a mailto:',
  )
  await page.getByTestId('book-call-open').click()
  await page.waitForTimeout(700)
  await page.getByTestId('book-call-reason').fill('Walk me through onboarding')
  await page.getByTestId('book-call-add-slot').click()
  await page.waitForTimeout(400)
  check(await page.getByTestId('book-call-slot-1').isVisible().catch(() => false), 'and more than one time can be offered')
  await page.getByTestId('book-call-submit').click()
  await page.waitForTimeout(2500)
  check(await page.getByTestId('book-call-sent').isVisible().catch(() => false), 'the request goes through')

  const tickets = await A('/support/tickets')
  const call = (tickets.data ?? []).find((x) => x.subject === 'Walk me through onboarding')
  check(!!call && call.kind === 'call', 'and lands in the queue as a call', JSON.stringify(call?.kind))
  check(
    (call?.requestedSlots ?? []).length === 2 && call?.scheduledAt == null,
    'carrying both times, with nothing booked until somebody answers',
    JSON.stringify({ slots: call?.requestedSlots?.length, scheduledAt: call?.scheduledAt }),
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ The settings tab you are on is the address you can send')
  // ---------------------------------------------------------------------
  /*
   * `?tab=` was read once into state and never written back. Sixteen tabs,
   * Trash and Archived among them: land on Members from the workspace panel,
   * click through to Trash, find the list somebody deleted, and the URL still
   * says ?tab=members — so what you send is not what you are looking at, and
   * your own reload throws the navigation away. The route already validated
   * all sixteen values; only the write was missing.
   */
  await page.goto(`${origin}/app/${workspaceId}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(/[?&]tab=members/.test(page.url()), 'arriving at a named tab keeps it', page.url())

  const trashTab = page.getByTestId('settings-tab-trash')
  if ((await trashTab.count()) === 0) {
    check(false, 'no Trash tab to move to')
    check(false, 'so the tab address was never exercised')
  } else {
    await trashTab.first().click()
    await page.waitForTimeout(2000)
    check(
      /[?&]tab=trash/.test(page.url()) && !/tab=members/.test(page.url()),
      'moving to another tab replaces it in the address',
      page.url(),
    )
    // The point of the address: reopening it returns the same tab.
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    check(
      /[?&]tab=trash/.test(page.url()),
      'and reopening that address returns the same tab',
      page.url(),
    )
  }

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
