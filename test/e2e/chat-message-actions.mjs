/**
 * §G11/§G12 — the five message actions, driven through the real UI.
 *
 * The API for these is covered by HTTP checks, and that is not the question
 * here. Four of the five gaps this closes were *user-interface* failures with
 * working backends behind them or beside them: "Assign" posted a mention into
 * the composer, the reminder had no control at all, the action bar showed
 * twelve icons with the short menu hidden behind right-click, and an empty
 * channel offered a sentence. A route returning 200 says nothing about any of
 * that.
 *
 * So this drives the built SPA against the real API and asks what a person
 * would ask: I pressed Assign — is somebody assigned? I pressed the tick — does
 * it say done? I muted the thread — does the bell show it, after a reload?
 *
 *   # a database, a seeded workspace, and the API running against it
 *   cd apps/api && DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... \
 *     PORT=3011 npx tsx dist/apps/api/src/main.js
 *   cd apps/web && npx vite build
 *
 *   node test/e2e/chat-message-actions.mjs --api 3011 --dist apps/web/dist
 *
 * Against a deployed instance:
 *
 *   BASE=https://rundesk.theaura.agency node test/e2e/chat-message-actions.mjs
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

/** The deployed .env, for the port the API container is published on. */
const fromEnvFile = (key) => {
  try {
    const txt = fs.readFileSync(path.join(REPO, '.env'), 'utf8')
    return new RegExp(`^${key}=(.*)$`, 'm').exec(txt)?.[1].trim().replace(/^["']|["']$/g, '') || null
  } catch {
    return null
  }
}

// 3011 is the local dev port; 3010 is what deploy publishes. Defaulting a
// deployed run to the dev port is how a sibling suite first failed on a real
// box, with ECONNREFUSED and nothing naming the port.
const API_PORT =
  Number(process.env.API_HOST_PORT) ||
  Number(argOf('--api', '')) ||
  (REMOTE ? Number(fromEnvFile('API_HOST_PORT')) || 3010 : 3011)
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))

// `npm i playwright` inside this pnpm workspace fails on the `link:` protocol
// the internal packages use, so on a server it lives outside the repo — and
// ESM ignores NODE_PATH, so a bare import cannot find it there.
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
        /* try the next candidate */
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
      '  Set PLAYWRIGHT_DIR to the node_modules holding it.\n' +
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

/*
 * How many checks a complete run performs.
 *
 * "0 failed" is not the same as "it ran". A selector that silently matched
 * nothing, or an early exit, reports a clean sweep of whatever it reached, and
 * that reads exactly like success. Raise this when checks are added.
 */
const EXPECTED_CHECKS = 25

const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}
const OTHER = {
  email: process.env.RUNDESK_EMAIL_2 ?? 'org-admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD_2 ?? 'OrgAdmin@123!',
}

const API = REMOTE ? `http://127.0.0.1:${API_PORT}/api/v1` : `http://127.0.0.1:${API_PORT}/api/v1`

async function apiLogin(who) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(who),
  })
  const json = await res.json().catch(() => null)
  if (!json?.data?.accessToken) {
    throw new Error(`could not sign in as ${who.email}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json.data
}

const apiAs = (token) => async (route, init = {}) => {
  // Only declare a JSON body when there is one: Fastify refuses an empty body
  // that claims to be JSON, which is exactly what a bodyless DELETE sends.
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

async function signIn(page, origin, who) {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', who.email)
  await page.fill('input[type=password]', who.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 30000 })
}

const done = async (browser, stack, cleanup) => {
  await cleanup?.().catch(() => {})
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
let cleanup

try {
  // Reachability first, and say which port. A bare `fetch failed` stack is the
  // least useful thing this can print.
  try {
    const ping = await fetch(`${API}/health`)
    if (!ping.ok) throw new Error(`health returned ${ping.status}`)
  } catch (err) {
    console.error(
      `\x1b[31m✗ no API on 127.0.0.1:${API_PORT}\x1b[0m — ${err.message}\n` +
        `  Start one there, or pass --api <port> / API_HOST_PORT=<port>.`,
    )
    process.exit(2)
  }

  const admin = await apiLogin(ADMIN)
  const other = await apiLogin(OTHER)
  const A = apiAs(admin.accessToken)
  const workspaceId = admin.workspaces[0].id

  /*
   * A channel of this suite's own.
   *
   * Reusing whatever channel happens to exist makes the empty-state checks
   * meaningless — a channel with history has no empty state — and leaves
   * probe messages in somebody's real conversation.
   */
  const name = `batch2-${Date.now()}`
  const created = await A(`/workspaces/${workspaceId}/chat/channels`, {
    method: 'POST',
    body: { name, description: 'Batch 2 UI checks' },
  })
  const channelId = created.data?.id
  if (!channelId) throw new Error(`could not create a channel: ${JSON.stringify(created).slice(0, 200)}`)
  await A(`/chat/channels/${channelId}/members`, { method: 'POST', body: { userIds: [other.user.id] } })
  cleanup = () => A(`/chat/channels/${channelId}/archive`, { method: 'POST' })

  const origin = REMOTE ? BASE : await (async () => {
    stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
    return stack.base
  })()

  browser = await chromium.launch(LAUNCH)
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await signIn(page, origin, ADMIN)
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [14:16] — an empty channel offers something to do')
  // ---------------------------------------------------------------------
  const emptyActions = page.getByTestId('channel-empty-actions')
  check(await emptyActions.isVisible().catch(() => false), 'the empty channel shows action cards')
  for (const [id, label] of [
    ['empty-add-people', 'Add people'],
    ['empty-track-tasks', 'Track tasks'],
    ['empty-add-doc', 'Add a doc'],
    ['empty-start-syncup', 'Start a SyncUp'],
  ]) {
    check(await page.getByTestId(id).isVisible().catch(() => false), `the empty channel offers "${label}"`)
  }
  // Every card must go somewhere. A card that opens nothing is worse than no
  // card, because it reads as a broken product rather than a missing feature.
  await page.getByTestId('empty-add-doc').click()
  await page.waitForTimeout(1800)
  check(/\/docs/.test(page.url()), '"Add a doc" actually opens Docs', page.url())
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [14:16] — the action bar ends in ⋯')
  // ---------------------------------------------------------------------
  const BODY = `batch2 probe ${Date.now()}`
  await page.locator('textarea:visible').first().fill(BODY)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const message = page.locator('.group').filter({ hasText: BODY }).first()
  check(await message.count() > 0, 'the probe message is on screen')
  await message.hover()
  await page.waitForTimeout(400)

  const overflow = page.locator('[data-testid^="message-overflow-"]').first()
  check(await overflow.isVisible().catch(() => false), 'the message toolbar has a ⋯ overflow')
  await overflow.click()
  await page.waitForTimeout(600)
  const menu = page.getByTestId('message-overflow-menu')
  check(await menu.isVisible().catch(() => false), 'the ⋯ opens a menu')
  const menuText = await menu.innerText().catch(() => '')
  check(/Set reminder/i.test(menuText), 'the overflow carries "Set reminder"', menuText.slice(0, 120))
  check(/Forward/i.test(menuText) && /Pin/i.test(menuText), 'the overflow carries the long tail (Forward, Pin)')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:36] — Assign actually assigns')
  // ---------------------------------------------------------------------
  await message.hover()
  await page.waitForTimeout(300)
  const composerBefore = await page.locator('textarea:visible').first().inputValue().catch(() => '')
  await page.locator('[data-testid^="message-assign-"]').first().click()
  await page.waitForTimeout(700)
  const optionOther = page.getByTestId(`assign-option-${other.user.id}`)
  check(await optionOther.isVisible().catch(() => false), 'Assign opens a list of people who can see the channel')
  await optionOther.click()
  await page.waitForTimeout(2200)

  const chip = page.locator('[data-testid^="message-assignments-"]').first()
  check(await chip.isVisible().catch(() => false), 'the message now shows who it is assigned to')
  const chipText = await chip.innerText().catch(() => '')
  check(/Assigned to/i.test(chipText), 'the chip says "Assigned to …"', chipText.slice(0, 80))

  // The old behaviour, named so a regression is unmistakable.
  const composerAfter = await page.locator('textarea:visible').first().inputValue().catch(() => '')
  check(
    composerAfter === composerBefore && !/<@/.test(composerAfter),
    'Assign no longer just types a mention into the composer',
    `composer became ${JSON.stringify(composerAfter)}`,
  )

  // The server agrees, which is the difference between an assignment and a chip.
  const B = apiAs(other.accessToken)
  const assignedToThem = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
  check(
    (assignedToThem.data ?? []).some((a) => a.body === BODY),
    'the assignee sees it in their own assigned list',
    JSON.stringify(assignedToThem.data ?? []).slice(0, 200),
  )

  console.log('\n▶ …and it can be marked done')
  await chip.locator(`[data-testid="assignment-resolve-${other.user.id}"]`).click()
  await page.waitForTimeout(2000)
  const stillAssigned = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
  check(
    !(stillAssigned.data ?? []).some((a) => a.body === BODY),
    'resolving takes it off the assignee’s list',
  )
  // Resolved, not deleted: who did it is a fact worth keeping.
  check(await chip.isVisible().catch(() => false), 'the resolved assignment stays on the message')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:19] — a reminder on the message')
  // ---------------------------------------------------------------------
  await message.hover()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="message-overflow-"]').first().click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid^="message-remind-"]').first().click()
  await page.waitForTimeout(700)
  const dialog = page.getByTestId('remind-dialog')
  check(await dialog.isVisible().catch(() => false), 'the reminder dialog opens')
  const prefilled = await page.getByTestId('remind-when').inputValue().catch(() => '')
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(prefilled), 'the time field is pre-filled and local', prefilled)
  await page.getByTestId('remind-confirm').click()
  await page.waitForTimeout(2200)
  check(!(await dialog.isVisible().catch(() => false)), 'the dialog closes once the reminder is set')

  const upcoming = await A(`/workspaces/${workspaceId}/reminders`)
  const forThis = (upcoming.data ?? []).find((r) => r.messageBody === BODY)
  check(!!forThis, 'the reminder is stored against the message', JSON.stringify(upcoming.data ?? []).slice(0, 200))
  check(forThis?.taskId == null, 'the reminder invented no task to hang off')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G12 [17:13] — mute one thread')
  // ---------------------------------------------------------------------
  // A thread needs a reply before there is anything to be noisy about.
  await A(`/chat/channels/${channelId}/messages`, {
    method: 'POST',
    body: { body: 'a reply, so this is a thread', parentMessageId: (await A(`/chat/channels/${channelId}/messages`)).data.find((m) => m.body === BODY).id },
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const msg2 = page.locator('.group').filter({ hasText: BODY }).first()
  await msg2.hover()
  await page.waitForTimeout(400)
  await page.locator('[data-testid^="message-overflow-"]').first().click()
  await page.waitForTimeout(600)
  const muteItem = page.locator('[data-testid^="thread-mute-"]').first()
  check(await muteItem.isVisible().catch(() => false), 'a thread offers "Mute this thread"')
  await muteItem.click()
  await page.waitForTimeout(2000)

  // The claim is that it PERSISTS — a toast is not state.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.locator('.group').filter({ hasText: BODY }).first().hover()
  await page.waitForTimeout(400)
  await page.locator('[data-testid^="message-overflow-"]').first().click()
  await page.waitForTimeout(600)
  const afterReload = await page.locator('[data-testid^="thread-mute-"]').first().innerText().catch(() => '')
  check(/Unmute/i.test(afterReload), 'the mute survives a reload', afterReload)
  await page.keyboard.press('Escape')

  await done(browser, stack, cleanup)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, cleanup)
}
