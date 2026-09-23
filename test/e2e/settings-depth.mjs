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
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

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
const EXPECTED_CHECKS = 61

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
  if (ran !== EXPECTED_CHECKS) {
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

  const admin = await signInApi(API, ADMIN.email, ADMIN.password)
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
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
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
  await page.getByTestId('menu-set-status').click({ timeout: 10_000 }).catch(() => {})
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
  await toggle.click({ timeout: 10_000 }).catch(() => {})
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

  /*
   * ---------------------------------------------------------------------
   * G08-9 [08:35] — "which workspaces am I in, and as what?"
   *
   * Frames 133/136: her account settings has a My Settings group with a
   * Workspaces page in it. The data and the grid already existed at `/app` and
   * were effectively unreachable — that route redirects straight into the
   * workspace when you have exactly one, and nothing links to it. So the only
   * page that answered the question bounced you off itself.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G08-9 [08:35] — every workspace this account is in, somewhere you can get to')
  await page.goto(`${origin}/app/profile?tab=workspaces`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    /[?&]tab=workspaces/.test(page.url()),
    'the tab has an address that survives being opened directly',
    page.url(),
  )
  const wsPanel = page.getByTestId('profile-workspaces')
  check(await wsPanel.isVisible().catch(() => false), 'and it renders a Workspaces page')

  const mine = (await A('/workspaces')).data ?? []
  check(mine.length > 0, 'this account is in at least one workspace to list', `${mine.length}`)
  if (mine.length > 0) {
    const row = page.getByTestId(`profile-workspace-${mine[0].workspace.id}`)
    check(
      await row.isVisible().catch(() => false),
      'the workspace the API returns is the one on the page',
      `looked for ${mine[0].workspace.id}`,
    )
    /*
     * The role is the half you cannot read off the sidebar, and the reason to
     * open this page rather than just looking at the app.
     */
    const rowText = (await row.innerText().catch(() => '')).toLowerCase()
    check(
      rowText.includes(String(mine[0].role).replace(/_/g, ' ').toLowerCase()),
      'and it says what you are in it, not just that you are in it',
      `row read "${rowText.replace(/\s+/g, ' ').slice(0, 80)}" expected role ${mine[0].role}`,
    )
    // A list you cannot act on is a screenshot.
    await page.getByTestId(`profile-workspace-open-${mine[0].workspace.id}`).click().catch(() => {})
    await page.waitForTimeout(2500)
    check(
      page.url().includes(`/app/${mine[0].workspace.id}`),
      'and opening one takes you into it',
      page.url(),
    )
  } else {
    check(false, 'no workspace row to read')
    check(false, 'so the role caption was never checked')
    check(false, 'so opening one was never driven')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 [07:30] — Help can ask for a call')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/help`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    await page.getByTestId('book-call-open').isVisible().catch(() => false),
    'Help offers a call, not only a mailto:',
  )

  /*
   * Every curated topic has a card, so no citation is a dead link.
   *
   * `answerHelp` cites its sources as `/app/help#help-<id>`, and the page hand
   * wrote four cards out of ten topics. For the other six the product
   * generated its own dead link: the assistant answered, offered a source, and
   * clicking it did nothing — `openSource` looked the element up, found
   * nothing, and returned.
   *
   * Driven off the server's own list rather than a literal ten, so adding a
   * topic tightens this check instead of leaving it behind.
   */
  {
    const topics = (await A('/ai/help/topics')).data ?? []
    check(topics.length >= 10, `the API serves the curated library (${topics.length} topics)`)
    const missing = []
    for (const topic of topics) {
      if ((await page.locator(`#help-${topic.id}`).count()) === 0) missing.push(topic.id)
    }
    check(
      missing.length === 0,
      `every cited topic has somewhere to land (${topics.length - missing.length}/${topics.length})`,
      `no card for: ${missing.join(', ')}`,
    )
  }
  await page.getByTestId('book-call-open').click({ timeout: 10_000 }).catch(() => {})
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

  // ---------------------------------------------------------------------
  console.log('\n▶ §G06 — Themes as a choice, and the preferences screen from the menu')
  // ---------------------------------------------------------------------
  /*
   * The bar's theme button calls toggle(), which walks light → dark → system.
   * To reach a specific mode you press it until it lands, and nothing says what
   * the next press gives you. The three-way choice already existed on
   * /app/profile, so this was a capability with no door on the surface her
   * frames show it on.
   *
   * The preferences link was reachable only from the bell popover's footer, and
   * the bell is not pinned by default — so the one door to "why am I getting
   * this?" sat behind a control most accounts never turn on.
   */
  {
    const startTheme = (await A('/users/me')).data?.theme ?? 'system'
    await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByTestId('user-menu').click()
    await page.waitForTimeout(900)

    /*
     * Counted, not just present. An empty <div data-testid="menu-themes"> is
     * visible and offers nothing — the same "the container exists" mistake this
     * audit has now made four times. Three is the point: fewer than three is a
     * cycle wearing a menu row's clothes.
     */
    const themeChoices = await page.getByTestId('menu-themes').locator('button').count()
    check(
      themeChoices === 3,
      `the avatar menu offers all three themes (${themeChoices})`,
      `the Themes row offers ${themeChoices} choice(s), not three`,
    )
    for (const mode of ['light', 'dark', 'system']) {
      check(
        await page.getByTestId(`menu-theme-${mode}`).isVisible().catch(() => false),
        `${mode} can be chosen directly`,
        `${mode} is not offered as a choice`,
      )
    }
    check(
      await page.getByTestId('menu-notification-prefs').isVisible().catch(() => false),
      'and the notification preferences screen has a door that is not the bell',
      'notification preferences are only reachable from the unpinned bell',
    )

    // Pick the one it is NOT on, so "it was already that" cannot pass this.
    const target = startTheme === 'dark' ? 'light' : 'dark'
    await page.getByTestId(`menu-theme-${target}`).click()
    await page.waitForTimeout(1500)
    check(
      await page.evaluate((m) => document.documentElement.classList.contains(m), target),
      `choosing ${target} applies it to the page`,
      `the page did not switch to ${target}`,
    )
    check(
      ((await A('/users/me')).data?.theme ?? '') === target,
      'and the server records it, so it follows you to another machine',
      `the server still says ${(await A('/users/me')).data?.theme}`,
    )
    await A('/users/me', { method: 'PATCH', body: { theme: startTheme } })

    /*
     * §G06 [07:11], frame 113_0716 — "Theme: Light / Dark / Auto + an accent
     * palette". Colour was workspace-only: one admin's choice repainted the app
     * for everybody and no individual could pick their own.
     *
     * Driven rather than looked at. The palette has two ways to be a lie — a
     * swatch that stores a value and repaints nothing, or one that repaints and
     * is forgotten — so this reads the CSS variable off the page AND the column
     * off the server, then clears it and checks the fallback.
     */
    const startAccent = (await A('/users/me')).data?.accentColor ?? null
    await A('/users/me', { method: 'PATCH', body: { accentColor: null } })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByTestId('user-menu').click()
    await page.waitForTimeout(900)

    const swatches = await page.getByTestId('menu-accents').locator('button').count()
    check(
      swatches >= 11,
      `the menu offers the accent palette (${swatches} incl. the workspace default)`,
      `only ${swatches} accent control(s) — her frame shows a named palette, not one colour`,
    )

    const accentVar = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim())
    const beforePick = await accentVar()
    await page.getByTestId('menu-accent-teal').click()
    await page.waitForTimeout(1800)
    const afterPick = await accentVar()
    check(
      afterPick.length > 0 && afterPick !== beforePick,
      'picking one repaints the app',
      `--accent did not change (was "${beforePick}", now "${afterPick}")`,
    )
    check(
      ((await A('/users/me')).data?.accentColor ?? null) === 'teal',
      'and the server records it against the person, not the workspace',
      `the server says ${JSON.stringify((await A('/users/me')).data?.accentColor ?? null)}`,
    )
    check(
      (await A(`/workspaces/${workspaceId}`)).data?.accentColor !== 'teal',
      'without changing it for everybody else',
      'the personal pick leaked onto the workspace',
    )

    /*
     * Clearing falls back rather than blanking — the reason the column is
     * nullable. No reopen first: the swatches are plain buttons inside the
     * menu, so picking one leaves it open on purpose (trying colours is the
     * point). Clicking the avatar again would CLOSE it, and the next click
     * then lands on the overlay — which reads as a broken control.
     */
    await page.getByTestId('menu-accent-default').click()
    await page.waitForTimeout(1800)
    check(
      ((await A('/users/me')).data?.accentColor ?? null) === null,
      'and choosing Workspace clears it back',
      `the server still says ${JSON.stringify((await A('/users/me')).data?.accentColor ?? null)}`,
    )
    await A('/users/me', { method: 'PATCH', body: { accentColor: startAccent } })
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §6 frame 087_0535 — the Notepad from Personal Tools')
  // ---------------------------------------------------------------------
  /*
   * A scratch pad, not a document: no title, no sharing, no place in the tree.
   * It opens in place rather than routing, because leaving the page you are on
   * is the opposite of jotting something down.
   *
   * Driven, then read back off the SERVER. A textarea that holds text until you
   * reload is the defect this audit keeps finding, and it would pass any check
   * that only looked at the DOM.
   */
  {
    /*
     * An UNSET pinned list is not an empty one.
     *
     * resolvePinned (topbar-prefs.ts:84) reads an array literally — `[]` means
     * "pin nothing" — and falls back to DEFAULT_PINNED only when the value is
     * absent. Restoring `?? []` therefore wrote an explicit empty list over an
     * account that had simply never chosen, emptying its top bar for every
     * suite that ran afterwards. It cost a CI run: video-regression lost the
     * New button, the AI affordance and the dock toggle, none of which had
     * anything to do with the change under test.
     *
     * Same defect this audit already fixed once in the product, where clearing
     * nav favourites stored a deliberate empty list instead of falling back —
     * reproduced here in a fixture.
     */
    /*
     * Restore the RESOLVED set, because "unset" cannot be written back.
     *
     * PATCH /users/me refuses a null topbarPinned ("must be an array"), so once
     * this fixture writes one it can never put the account back to unset. What
     * it can do is restore the set that was in effect — which means mirroring
     * resolvePinned's own fallback chain rather than guessing a default.
     *
     * Guessing cost a second CI run. DEFAULT_PINNED omits 'ai', but an account
     * with a legacy `topbarHidden` resolves through LEGACY_ITEMS, which
     * INCLUDES it — so writing the defaults over it removed the AI dock toggle
     * and video-regression lost A6.4 and G13-10.
     */
    const DEFAULT_PINNED = ['create', 'timer', 'theme']
    const LEGACY_ITEMS = ['notifications', 'theme', 'timer', 'ai', 'create']
    const meNow = (await A('/users/me')).data ?? {}
    const pinnedBefore = Array.isArray(meNow.topbarPinned)
      ? meNow.topbarPinned
      : Array.isArray(meNow.topbarHidden)
        ? LEGACY_ITEMS.filter((i) => !meNow.topbarHidden.includes(i))
        : DEFAULT_PINNED
    await A('/users/me', {
      method: 'PATCH',
      body: { topbarPinned: [...new Set([...pinnedBefore, 'notepad'])] },
    })
    await A('/users/me/notepad', { method: 'PUT', body: { content: '' } })

    await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const opener = page.getByTestId('notepad-open')
    check(await opener.isVisible().catch(() => false), 'a pinned Notepad reaches the top bar')
    await opener.click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(900)
    check(
      await page.getByTestId('notepad-panel').isVisible().catch(() => false),
      'and opens in place rather than navigating away',
      'the notepad did not open',
    )
    check(page.url().includes(`/app/${workspaceId}`), 'without leaving the page you were on', page.url())

    const jotted = `scratch ${Date.now()}`
    await page.getByTestId('notepad-text').fill(jotted)
    // Longer than the 800ms debounce, so this measures the save rather than
    // the keystroke.
    await page.waitForTimeout(2200)
    check(
      ((await A('/users/me/notepad')).data?.content ?? '') === jotted,
      'what you type is on the server, not just in the box',
      `server has ${JSON.stringify((await A('/users/me/notepad')).data?.content ?? '')}`,
    )

    // And it is still there on the next visit — the whole point of a pad.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByTestId('notepad-open').click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    check(
      (await page.getByTestId('notepad-text').inputValue().catch(() => '')) === jotted,
      'and it is still there when you come back',
      'the note did not survive a reload',
    )

    await A('/users/me/notepad', { method: 'PUT', body: { content: '' } })
    // Put back what was there. When nothing was, write the defaults explicitly:
    // that resolves identically to unset, and never leaves a bare [] behind.
    await A('/users/me', { method: 'PATCH', body: { topbarPinned: pinnedBefore } })

    // And prove the cleanup left a usable bar, rather than trusting it did.
    // A fixture that quietly disarms later suites is worse than a failing one.
    const expected = [...pinnedBefore].sort()
    const after = [...((await A('/users/me')).data?.topbarPinned ?? [])].sort()
    check(
      after.join(',') === expected.join(','),
      'and the top bar is left exactly as it was found',
      `cleanup left ${JSON.stringify(after)}, expected ${JSON.stringify(expected)}`,
    )
  }

  /*
   * ── §G07-5 [08:35] — "Record a Clip" and "Talk to Text" are two tools ──────
   *
   * The top bar offers both as pinnable icons, pointing at `/clips` and
   * `/clips?kind=audio`. Nothing read the parameter, so pinning both gave two
   * different icons onto the identical page — a control that looks like a
   * choice and is not one.
   *
   * Checked on the CHROME rather than on the list. Clips live in object
   * storage, which is unconfigured here and in CI, so the library is empty
   * everywhere and a count-the-cards check would pass against a page that had
   * never learned to filter. What the parameter being READ looks like is the
   * chip; the filtering rule itself is unit-tested in lib/clip-kind.test.ts,
   * where it can be given clips without a bucket.
   */
  console.log('\n▶ §G07-5 — the two clip tools are two libraries')
  await page.goto(`${origin}/app/${workspaceId}/clips`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    !(await page.getByTestId('clips-kind-filter').isVisible().catch(() => false)),
    'the plain clips page says nothing about a filter',
    'a filter chip appears with no kind asked for',
  )

  await page.goto(`${origin}/app/${workspaceId}/clips?kind=audio`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    await page.getByTestId('clips-kind-filter').isVisible().catch(() => false),
    'and ?kind=audio lands somewhere that knows it is a different library',
    'the kind parameter is ignored — both pinned tools open the same page',
  )
  check(
    await page.getByTestId('clips-kind-clear').isVisible().catch(() => false),
    'with a way back to everything',
    'no way out of the filtered library',
  )
  await page.getByTestId('clips-kind-clear').click().catch(() => {})
  await page.waitForTimeout(1500)
  check(
    !(await page.getByTestId('clips-kind-filter').isVisible().catch(() => false)),
    'and taking it clears the filter',
    'Show all left the filter in place',
  )

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
