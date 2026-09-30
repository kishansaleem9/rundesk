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
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { makeChain } from './lib/chain.mjs'
import { waitUntil, readText, waitForCount } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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


const chain = makeChain(check)
/*
 * How many checks a complete run performs.
 *
 * "0 failed" is not the same as "it ran". A selector that silently matched
 * nothing, or an early exit, reports a clean sweep of whatever it reached, and
 * that reads exactly like success. Raise this when checks are added.
 */
const EXPECTED_CHECKS = 73

const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}
const OTHER = {
  email: process.env.RUNDESK_EMAIL_2 ?? 'org-admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD_2 ?? 'OrgAdmin@123!',
}

const API = REMOTE ? `http://127.0.0.1:${API_PORT}/api/v1` : `http://127.0.0.1:${API_PORT}/api/v1`

const apiLogin = (who) => signInApi(API, who.email, who.password)

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

async function signIn(page, origin, who) {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', who.email)
  await page.fill('input[type=password]', who.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
}

/**
 * Whether a control on the message's hover toolbar is SHOWN to a person: drawn,
 * not `visibility: hidden`, and not at opacity 0 — or null when it is not there.
 *
 * `isVisible()` is not that question. Playwright counts an element at opacity 0
 * as visible, and the toolbar is always in the DOM at opacity 0, shown by
 * `group-hover`. So the toolbar checks passed on a build whose toolbar never
 * appeared at all: 73/73 on lane 5, 29 September. `checkVisibility` with
 * `opacityProperty` answers for the control and every ancestor, the toolbar's
 * own `opacity-0` among them.
 */
const shownToAPerson = (control) =>
  control
    .evaluate((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }), undefined, {
      timeout: 1000,
    })
    .catch(() => null)

/**
 * Each control's state before and after `hover()`, each read once settled
 * (bounded): hidden with the pointer moved off the row, then shown with it on
 * the row. That the hover is what shows the toolbar is the claim — one already
 * showing before it proves nothing about the hover, and one still hidden after
 * it is offered to nobody.
 */
async function shownOnHover(page, controls, hover) {
  await page.mouse.move(5, 5)
  const before = []
  for (const control of controls) {
    await waitUntil(async () => (await shownToAPerson(control)) === false, { timeoutMs: 10_000 })
    before.push(await shownToAPerson(control))
  }
  await hover()
  const after = []
  for (const control of controls) {
    await waitUntil(async () => (await shownToAPerson(control)) === true, { timeoutMs: 10_000 })
    after.push(await shownToAPerson(control))
  }
  return controls.map((_, i) => ({ before: before[i], after: after[i] }))
}

/** A toolbar control's state, in a check's words. */
const stateOf = (shown) => (shown === true ? 'shown' : shown === false ? 'hidden' : 'not there')

const done = async (browser, stack, cleanup) => {
  // The cleanup returns [route, answer] for each channel it archives; one that
  // is refused stays behind, and is said above the totals.
  let leftBehind
  try {
    leftBehind = ((await cleanup?.()) ?? [])
      .filter(([, res]) => ![200, 201, 204, 404].includes(res.status))
      .map(([route, res]) => `POST ${route} answered ${res.status}`)
  } catch (err) {
    leftBehind = [`archiving this run's channels got no answer (${err?.message ?? err})`]
  }
  await browser?.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
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
  const archive = async (id) => [`/chat/channels/${id}/archive`, await A(`/chat/channels/${id}/archive`, { method: 'POST' })]
  cleanup = async () => [await archive(channelId)]

  const origin = REMOTE ? BASE : await (async () => {
    stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
    return stack.base
  })()

  browser = await chromium.launch(LAUNCH)
  // Clipboard granted up front: "Copy link" is checked by reading back what it
  // actually put on the clipboard, and an ungranted read rejects in a way that
  // looks exactly like a feature that copied nothing.
  /*
   * NOT UTC, ON PURPOSE. A run in UTC is a run in the one zone where every
   * timezone bug is invisible: the offset is zero, so a value computed in UTC
   * and a value computed in local time are the same string, and a check
   * comparing them cannot fail. This container is UTC.
   *
   * `Asia/Karachi` is +05:00, has no DST, and is where the person in the
   * walkthrough is — so the reminder pre-fill below is read on a clock five
   * hours from the server's, which is the whole point of calling it local.
   */
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    timezoneId: 'Asia/Karachi',
  })
  const page = await ctx.newPage()
  await signIn(page, origin, ADMIN)
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })

  /*
   * EVERY READ BELOW WAITS FOR WHAT IT READS, BOUNDED
   * (`found-29-sep/chat-message-actions-reads-after-fixed-waits`).
   *
   * This suite slept a fixed time and then read, 53 times: 4 seconds before the
   * empty channel's cards, 3.5 before the address /chat writes, 1.5 before the
   * Replies row's next control. Under a sweep's load each of those was
   * sometimes too short, and a different check failed each time — the cards,
   * the address, the two Mark unread checks. So each read now waits for the
   * thing it reads: the element, its state, the address, or the server's
   * answer. Every wait is bounded and none of them fails anything itself — a
   * check that never comes true still fails below it, in its own words, a
   * few seconds later than a passing one would have read it.
   *
   * What the sleeps were standing in for, found by reading the page: every
   * mutation here is answered by the server first and then refetched (none is
   * optimistic), the hover toolbar is always in the DOM at opacity 0 (which
   * Playwright counts as visible, so the pauses after a hover were padding),
   * and the thread panel and its scrim mount in the same render.
   */
  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [14:16] — an empty channel offers something to do')
  // ---------------------------------------------------------------------
  // The four cards are drawn in the same render as the box that holds them.
  const emptyActions = page.getByTestId('channel-empty-actions')
  await waitUntil(() => emptyActions.isVisible(), { timeoutMs: 30_000 })
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
  await waitUntil(() => /\/docs/.test(page.url()), { timeoutMs: 15_000 })
  check(/\/docs/.test(page.url()), '"Add a doc" actually opens Docs', page.url())
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  /*
   * Back in the channel, the probe is typed once the channel has been READ —
   * its empty state drawn again — not three fixed seconds after landing. A
   * message sent before that read answers is appended to no list, and the
   * read that answers after it may not hold it either.
   */
  await waitUntil(() => emptyActions.isVisible(), { timeoutMs: 30_000 })

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [14:16] — the action bar ends in ⋯')
  // ---------------------------------------------------------------------
  const BODY = `batch2 probe ${Date.now()}`
  await page.locator('textarea:visible').first().fill(BODY)
  await page.keyboard.press('Enter')
  const message = page.locator('.group').filter({ hasText: BODY }).first()
  // Drawn once the send is answered.
  await waitUntil(async () => (await message.count()) > 0, { timeoutMs: 20_000 })
  check(await message.count() > 0, 'the probe message is on screen')

  // Hidden until the pointer is on the message, and shown once it is.
  const overflow = page.locator('[data-testid^="message-overflow-"]').first()
  const [overflowShown] = await shownOnHover(page, [overflow], () => message.hover())
  check(
    overflowShown.before === false && overflowShown.after === true,
    'the message toolbar has a ⋯ overflow',
    `the ⋯ is ${stateOf(overflowShown.before)} before the hover and ${stateOf(overflowShown.after)} after it`,
  )
  await overflow.click()
  const menu = page.getByTestId('message-overflow-menu').filter({ visible: true })
  await waitUntil(() => menu.isVisible(), { timeoutMs: 10_000 })
  check(await menu.isVisible().catch(() => false), 'the ⋯ opens a menu')
  // Read once it holds what the two checks below look for (bounded: a menu
  // without them is still read, and still fails them).
  await waitUntil(async () => {
    const shown = await menu.innerText({ timeout: 1000 })
    return /Set reminder/i.test(shown) && /Forward/i.test(shown) && /Pin/i.test(shown)
  }, { timeoutMs: 5_000 })
  const menuText = await readText(menu, { timeoutMs: 2000 })
  check(/Set reminder/i.test(menuText), 'the overflow carries "Set reminder"', menuText.slice(0, 120))
  check(/Forward/i.test(menuText) && /Pin/i.test(menuText), 'the overflow carries the long tail (Forward, Pin)')
  await page.keyboard.press('Escape')
  // Closed before the next press, which would otherwise land beside an open menu.
  await waitUntil(async () => !(await menu.isVisible()), { timeoutMs: 10_000 })

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:36] — Assign actually assigns')
  // ---------------------------------------------------------------------
  await message.hover()
  const composerBefore = await page.locator('textarea:visible').first().inputValue().catch(() => '')
  await page.locator('[data-testid^="message-assign-"]').first().click()
  const optionOther = page.getByTestId(`assign-option-${other.user.id}`)
  await waitUntil(() => optionOther.isVisible(), { timeoutMs: 10_000 })
  check(await optionOther.isVisible().catch(() => false), 'Assign opens a list of people who can see the channel')
  await optionOther.click({ timeout: 10_000 }).catch(() => {})

  // The chip is drawn from the messages read again once the server has
  // answered the assignment; it is read when it says so.
  const chip = page.locator('[data-testid^="message-assignments-"]').filter({ visible: true }).first()
  await waitUntil(async () => /Assigned to/i.test(await chip.innerText({ timeout: 1000 })), { timeoutMs: 15_000 })
  check(await chip.isVisible().catch(() => false), 'the message now shows who it is assigned to')
  const chipText = await readText(chip, { timeoutMs: 2000 })
  check(/Assigned to/i.test(chipText), 'the chip says "Assigned to …"', chipText.slice(0, 80))

  // The old behaviour, named so a regression is unmistakable. Read after the
  // wait for the chip: a mention is typed into the box on the press itself.
  const composerAfter = await page.locator('textarea:visible').first().inputValue().catch(() => '')
  check(
    composerAfter === composerBefore && !/<@/.test(composerAfter),
    'Assign no longer just types a mention into the composer',
    `composer became ${JSON.stringify(composerAfter)}`,
  )

  // The server agrees, which is the difference between an assignment and a chip.
  const B = apiAs(other.accessToken)
  let assignedToThem = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
  await waitUntil(async () => {
    assignedToThem = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
    return (assignedToThem.data ?? []).some((a) => a.body === BODY)
  }, { timeoutMs: 10_000, stepMs: 300 })
  check(
    (assignedToThem.data ?? []).some((a) => a.body === BODY),
    'the assignee sees it in their own assigned list',
    JSON.stringify(assignedToThem.data ?? []).slice(0, 200),
  )

  console.log('\n▶ …and it can be marked done')
  /*
   * BOUNDED, AND THE TWO CHECKS REPORT EITHER WAY. This clicked the resolve
   * control unconditionally, and `cma-1-assign-types-a-mention` leaves no
   * assignment to resolve — so the click spent thirty seconds retrying, threw,
   * and the run ended on `12 passed, 5 failed` with `✗ only 17 of 73 checks
   * ran`. Fifty-six checks did not run, under a headline about the harness.
   */
  const resolve = chain(
    'resolving takes it off the assignee’s list',
    'the resolved assignment stays on the message',
  )
  const resolveControl = chip.locator(`[data-testid="assignment-resolve-${other.user.id}"]`)
  // What the tick is titled while the assignment is open, so the page's
  // resolved state can be told from it below. Short: the chip was waited for.
  const openTitle = await resolveControl.getAttribute('title', { timeout: 2000 }).catch(() => null)
  const resolved = await resolveControl
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (!resolved) {
    resolve.rest('skipped: there was no assignment chip to resolve')
  } else {
    let stillAssigned = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
    await waitUntil(async () => {
      stillAssigned = await B(`/workspaces/${workspaceId}/chat/assigned-to-me`)
      return !(stillAssigned.data ?? []).some((a) => a.body === BODY)
    }, { timeoutMs: 15_000, stepMs: 300 })
    resolve.step(!(stillAssigned.data ?? []).some((a) => a.body === BODY), '')
    /*
     * Resolved, not deleted: who did it is a fact worth keeping. Read once the
     * page has the resolved assignment back — its tick no longer titled as it
     * was while open — or once the chip is gone, which is what this catches.
     */
    await waitUntil(
      async () =>
        !(await chip.isVisible()) || (await resolveControl.getAttribute('title', { timeout: 1000 })) !== openTitle,
      { timeoutMs: 15_000 },
    )
    resolve.step(await chip.isVisible().catch(() => false), 'the chip went away instead of staying resolved')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:19] — a reminder on the message')
  // ---------------------------------------------------------------------
  // Each press waits for its own target; the dialog is waited for.
  await message.hover()
  await page.locator('[data-testid^="message-overflow-"]').first().click()
  await page.locator('[data-testid^="message-remind-"]').first().click()
  const dialog = page.getByTestId('remind-dialog')
  await waitUntil(() => dialog.isVisible(), { timeoutMs: 10_000 })
  check(await dialog.isVisible().catch(() => false), 'the reminder dialog opens')
  const prefilled = await page.getByTestId('remind-when').inputValue().catch(() => '')
  /*
   * THE VALUE, NOT JUST THE SHAPE. This asserted the regex alone — so a box
   * pre-filled from a UTC instant, which is five hours out on this context's
   * clock, matched `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` perfectly and passed.
   * The word "local" in the sentence was doing no work at all.
   *
   * `datetime-local` shows wall-clock time with no zone attached, so the
   * expected string is computed IN THE PAGE, from the page's own clock, rather
   * than from this process's. That is a definition of "an hour from now,
   * locally" and not a copy of the component: if the component stops
   * translating, the two differ by the offset.
   */
  const wantLocal = await page.evaluate(() => {
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000)
    const local = new Date(inAnHour.getTime() - inAnHour.getTimezoneOffset() * 60 * 1000)
    return local.toISOString().slice(0, 16)
  })
  const wellFormed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(prefilled)
  const drift = wellFormed
    ? Math.abs(new Date(`${prefilled}:00Z`).getTime() - new Date(`${wantLocal}:00Z`).getTime())
    : Infinity
  check(
    wellFormed && drift <= 3 * 60_000,
    'the time field is pre-filled and local',
    `${prefilled} where about ${wantLocal} was expected on this clock`,
  )
  await page.getByTestId('remind-confirm').click()
  // The dialog closes when the server has answered the reminder.
  await waitUntil(async () => !(await dialog.isVisible()), { timeoutMs: 15_000 })
  check(!(await dialog.isVisible().catch(() => false)), 'the dialog closes once the reminder is set')

  let upcoming = await A(`/workspaces/${workspaceId}/reminders`)
  await waitUntil(async () => {
    upcoming = await A(`/workspaces/${workspaceId}/reminders`)
    return (upcoming.data ?? []).some((r) => r.messageBody === BODY)
  }, { timeoutMs: 10_000, stepMs: 300 })
  const forThis = (upcoming.data ?? []).find((r) => r.messageBody === BODY)
  check(!!forThis, 'the reminder is stored against the message', JSON.stringify(upcoming.data ?? []).slice(0, 200))
  check(forThis?.taskId == null, 'the reminder invented no task to hang off')

  // ---------------------------------------------------------------------
  console.log('\n▶ §G12 [17:13] — mute one thread')
  // ---------------------------------------------------------------------
  // A thread needs a reply before there is anything to be noisy about.
  /*
   * THE PARENT'S ID IS READ OPTIONALLY, AND THE MUTE CHECKS ARE GATED ON IT.
   * This was `(await A(…)).data.find(…).id` inline in the reply's body: a read
   * that answered with no `data`, or a channel that did not hold the probe,
   * threw two ways here and ended the run with most of its checks unreported.
   * Now a missing parent fails the two checks that needed a thread, naming it.
   */
  const channelRead = await A(`/chat/channels/${channelId}/messages`)
  const parentId = (channelRead.data ?? []).find((m) => m.body === BODY)?.id
  const mute = chain('a thread offers "Mute this thread"', 'the mute survives a reload')
  if (!parentId) {
    mute.rest(
      `skipped: the probe message was not in the channel's messages (GET answered ${channelRead.status}), ` +
        'so there was no thread to mute',
    )
  } else {
    const reply = await A(`/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: { body: 'a reply, so this is a thread', parentMessageId: parentId },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    // The hover waits for the row, and the row is drawn with its reply count.
    const msg2 = page.locator('.group').filter({ hasText: BODY }).first()
    await msg2.hover()
    await page.locator('[data-testid^="message-overflow-"]').first().click()
    const muteItem = page.locator('[data-testid^="thread-mute-"]').first()
    await waitUntil(() => muteItem.isVisible(), { timeoutMs: 10_000 })
    const offered = await muteItem.isVisible().catch(() => false)
    mute.step(offered, reply.status < 300 ? '' : `the reply that makes it a thread answered ${reply.status}`)
    if (!offered) {
      mute.rest('skipped: there was no "Mute this thread" to press')
    } else {
      await muteItem.click()
      /*
       * The claim is that it PERSISTS — a toast is not state. So the reload
       * waits for the server to hold the mute (bounded: a press that stores
       * nothing is reloaded all the same, and the check below says so).
       */
      await waitUntil(async () => {
        const held = await A(`/chat/channels/${channelId}/messages`)
        return (held.data ?? []).find((m) => m.id === parentId)?.threadFollowState === 'muted'
      }, { timeoutMs: 15_000, stepMs: 300 })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.group').filter({ hasText: BODY }).first().hover()
      await page.locator('[data-testid^="message-overflow-"]').first().click()
      const muteAfter = page.locator('[data-testid^="thread-mute-"]').filter({ visible: true }).first()
      await waitUntil(async () => /Unmute/i.test(await muteAfter.innerText({ timeout: 1000 })), { timeoutMs: 10_000 })
      const afterReload = await readText(muteAfter, { timeoutMs: 2000 })
      mute.step(/Unmute/i.test(afterReload), afterReload)
    }
  }
  await page.keyboard.press('Escape')

  // ---------------------------------------------------------------------
  console.log('\n▶ The channel you are in, and the thread you opened, are addresses')
  // ---------------------------------------------------------------------
  /*
   * `?channel=` was read on arrival and never written. Every check above
   * navigates straight to a ?channel= URL, which exercises the direction that
   * already worked. These drive the other one: clicking a channel in the
   * sidebar wrote nothing, so you could be sent into a channel but never send
   * anyone there — copying the address bar gave /chat, which lands in #general.
   */
  await page.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  // The page writes its choice into the address once the channel list answers.
  await waitUntil(() => /[?&]channel=/.test(page.url()), { timeoutMs: 30_000 })
  check(
    /[?&]channel=/.test(page.url()),
    'landing on /chat puts the channel it chose in the address',
    page.url(),
  )

  const sidebarChannel = page.locator(`[data-testid="channel-row-${channelId}"]`).first()
  // count() does not wait, and the sidebar draws its own read of the channels.
  await waitUntil(async () => (await sidebarChannel.count()) > 0, { timeoutMs: 20_000 })
  check((await sidebarChannel.count()) > 0, 'the channel is listed in the sidebar')
  await sidebarChannel.click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(() => page.url().includes(`channel=${channelId}`), { timeoutMs: 15_000 })
  check(
    page.url().includes(`channel=${channelId}`),
    'and clicking it puts that channel in the address',
    page.url(),
  )

  // An open thread survives a reload and can be sent to somebody.
  /*
   * WAITED FOR, NOT SLEPT (`found-24-sep/three-suites-fail-under-a-full-sweep`).
   * Under a sweep's load this found no thread panel: the address was taken
   * 1.8 fixed seconds after the press, before `thread=` had been written into
   * it, so the address reopened below named no thread at all; and the panel was
   * counted 3.5 fixed seconds after that. Now the thread control is waited for,
   * the address is taken once it names the thread, and the panel is waited for
   * on the reopened page — each bounded, so a missing one still fails here.
   */
  const openThread = page.locator('[data-testid^="view-thread-"]').first()
  await openThread.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
  const threadAddress = chain(
    'opening a thread puts it in the address',
    'and the thread is still open when that address is reopened',
  )
  if ((await openThread.count()) > 0) {
    await openThread.click()
    await waitUntil(() => /[?&]thread=/.test(page.url()), { timeoutMs: 15_000 })
    threadAddress.step(/[?&]thread=/.test(page.url()), page.url())
    const threadUrl = page.url()
    await page.goto(threadUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="chat-thread-panel"]').first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
    threadAddress.step(
      /[?&]thread=/.test(page.url()) &&
        (await page.locator('[data-testid="chat-thread-panel"]').count()) > 0,
      page.url(),
    )
  } else {
    threadAddress.rest('skipped: there was no "open thread" control to drive')
  }

  /*
   * ── G11-9 / G12-10 [14:37–14:48], [16:50] — the thread header ────────────
   *
   * > "…'Assign to' and 'Create Task' sitting right under the title"
   *
   * The panel was titled the literal word "Thread", and the two actions that
   * turn a conversation into work existed only inside a per-message hover
   * menu. That is the wrong place for a decision about the whole thread: by
   * the time you have read it and concluded somebody should act, you are
   * looking at the panel, not hovering a row.
   *
   * Driven from the panel that is already open above.
   */
  console.log('\n▶ G11-9 / G12-10 — the thread header names the thread, and can turn it into work')
  const header = chain(
    'the panel is named after whoever started the thread, not "Thread"',
    'and "Create Task" is offered on the header',
    'and "Assign to" beside it',
    'which opens the people it could be assigned to',
    'and picking somebody opens the task draft',
    'with that person already on it, not a blank form',
  )
  if ((await page.locator('[data-testid="chat-thread-panel"]').count()) > 0) {
    /*
     * THE STARTER'S NAME, NOT THE ABSENCE OF THE WORD "Thread". The probe that
     * starts this thread was posted by the admin, so the title has to carry
     * the admin's own display name. `!/^thread$/i` passed on any title that was
     * not that one word — a missing name, or the generic title reworded.
     *
     * Read when it names them (bounded): the panel says plain "Thread" until
     * it has the parent's author. The header's two controls are drawn with it.
     */
    const starter = ((await A('/users/me')).data?.displayName ?? '').trim()
    const titleShown = page.getByTestId('thread-panel-title').filter({ visible: true })
    await waitUntil(
      async () => starter.length > 0 && (await titleShown.innerText({ timeout: 1000 })).includes(starter),
      { timeoutMs: 10_000 },
    )
    const title = await readText(titleShown, { timeoutMs: 2000 })
    header.step(
      starter.length > 0 && title.includes(starter),
      `the title reads "${title.trim()}" — the thread was started by ${JSON.stringify(starter)}`,
    )
    header.step((await page.getByTestId('thread-create-task').count()) > 0, 'no create-task control in the thread header')
    const assign = page.getByTestId('thread-assign-to')
    header.step((await assign.count()) > 0, 'no assign-to control in the thread header')

    // The picker must offer real people, not an empty menu — the failure this
    // would otherwise hide is a members read that returned nothing.
    await assign.click().catch(() => {})
    // The rows are the workspace's members, read on their own; counted once
    // there is one beyond the trigger (count() does not wait).
    await waitUntil(async () => (await page.locator('[data-testid^="thread-assign-"]').count()) > 1, { timeoutMs: 10_000 })
    const candidates = page.locator('[data-testid^="thread-assign-"]').filter({ hasNotText: /^$/ })
    header.step(
      (await page.locator('[data-testid^="thread-assign-"]').count()) > 1,
      `${await candidates.count()} row(s) in the assign menu`,
    )

    /*
     * Assigning must reach the create-task draft with the person already on
     * it. Checked by driving it rather than by looking: a picker that opens
     * and does nothing is the exact defect this section exists to catch.
     */
    const someone = page.locator('[data-testid^="thread-assign-"]').nth(1)
    const pickedId = (await someone.getAttribute('data-testid').catch(() => '') ?? '').replace('thread-assign-', '')
    await someone.click().catch(() => {})
    // The draft opens with its assignee already set, in one render.
    await waitUntil(async () => (await page.getByTestId('chat-task-draft').count()) > 0, { timeoutMs: 10_000 })
    header.step((await page.getByTestId('chat-task-draft').count()) > 0, 'nothing opened after picking a person')
    /*
     * The assertion that matters. "The draft opened" would also pass if the
     * picker merely opened an empty dialog — and the point of Assign to is
     * that the person you chose is already on it, not that you get a second
     * form to fill in.
     */
    header.step(
      (await page.getByTestId('chat-task-draft-assignee').inputValue().catch(() => '')) === pickedId &&
        pickedId.length > 0,
      `draft assignee is "${await page.getByTestId('chat-task-draft-assignee').inputValue().catch(() => '')}", expected "${pickedId}"`,
    )
    // Nothing is read after this before the next section navigates away.
    await page.keyboard.press('Escape')
  } else {
    header.rest('skipped: there was no thread panel open to read its header')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:11] — saving a message leaves a trace')
  // ---------------------------------------------------------------------
  /*
   * The bookmark tinted when saved — inside a toolbar that only exists while
   * the pointer is over the row. Move the mouse and there was nothing to say
   * the message was in Later, so "did that work?" meant hovering again. The
   * badge is checked with the pointer moved AWAY, which is the whole point.
   *
   * The badge is drawn from the page's own read of the saved list, not from
   * the message — so "not marked saved" is read once that read has answered,
   * and not merely before it has (bounded, like everything else here).
   */
  const savedListRead = page
    .waitForResponse((r) => r.url().includes(`/workspaces/${workspaceId}/chat/saved`) && r.request().method() === 'GET', {
      timeout: 30_000,
    })
    .catch(() => null)
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  const saveRow = page.locator('.group').filter({ hasText: BODY }).first()
  await saveRow.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  await savedListRead
  const saveId = await saveRow
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  check(!!saveId, 'a message to save is on screen', 'no message row found')

  check(
    !(await page.getByTestId(`message-saved-badge-${saveId}`).isVisible().catch(() => false)),
    'and it is not marked saved before anybody saves it',
    'the saved badge was already showing',
  )

  // The row's toolbar is in the DOM whether or not the pointer is on it; its
  // buttons are counted once it is drawn (bounded — count() does not wait).
  await page.getByTestId(`message-overflow-${saveId}`).waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {})
  // The bookmark is found by its title, which is the only stable handle the
  // action bar gives it. Emphatically NOT "click the first button with a
  // title" — that is a coin flip over a row whose toolbar includes Delete.
  const saveBtn = page.locator(`[data-testid="message-row-${saveId}"] button`).filter({ has: page.locator('svg') })
  const count = await saveBtn.count()
  let saveControl = null
  for (let i = 0; i < count; i += 1) {
    const title = (await saveBtn.nth(i).getAttribute('title', { timeout: 5000 }).catch(() => null)) ?? ''
    if (/save/i.test(title) && !/unsave/i.test(title)) {
      saveControl = saveBtn.nth(i)
      break
    }
  }
  // Offered means shown by the hover, like the rest of the toolbar.
  const [saveShown] = saveControl
    ? await shownOnHover(page, [saveControl], () => saveRow.hover())
    : [{ before: null, after: null }]
  let clicked = false
  if (saveControl) {
    await saveControl.click().catch(() => {})
    clicked = true
  }
  check(
    clicked && saveShown.before === false && saveShown.after === true,
    'the toolbar offers Save',
    clicked
      ? `the Save control is ${stateOf(saveShown.before)} before the hover and ${stateOf(saveShown.after)} after it`
      : 'no save control on the message',
  )

  // Pointer deliberately moved off the row before looking — and then the badge
  // is waited for, bounded: it is drawn once the save has been answered, which
  // under a sweep's load came after the 2.6 fixed seconds this used to allow.
  // A marker that lives only in the hover toolbar is still not visible here.
  await page.mouse.move(5, 5)
  await page.getByTestId(`message-saved-badge-${saveId}`).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  check(
    await page.getByTestId(`message-saved-badge-${saveId}`).isVisible().catch(() => false),
    'and once saved the row says so without hovering',
    'the only marker is still inside the hover toolbar',
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [14:16] — the hover toolbar offers real quick reactions')
  // ---------------------------------------------------------------------
  /*
   * "hovering a message reveals quick reactions 👍 ✅ 🔥". The channel toolbar
   * carried ONE of them, drawn as a ThumbsUp icon — a picture of a reaction
   * rather than the reaction. The thread panel already had all three as emoji,
   * so the same message offered different reactions depending on where you
   * hovered it. Checked by clicking one and reading the reaction back off the
   * server, because a row of emoji that posts nothing looks identical.
   */
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  const reactRow = page.locator('.group').filter({ hasText: BODY }).first()
  await reactRow.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  const reactId = await reactRow
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  // Each hidden until the pointer is on the message, and shown once it is.
  const QUICK = ['👍', '✅', '🔥']
  const quickShown = await shownOnHover(
    page,
    QUICK.map((emoji) => page.getByTestId(`message-quick-${emoji}-${reactId}`)),
    () => reactRow.hover(),
  )
  for (const emoji of ['👍', '✅', '🔥']) {
    const { before, after } = quickShown[QUICK.indexOf(emoji)]
    check(
      before === false && after === true,
      `the toolbar offers ${emoji}`,
      after === null
        ? `${emoji} is not offered on a channel message`
        : `${emoji} is ${stateOf(before)} before the hover and ${stateOf(after)} after it`,
    )
  }
  await page.getByTestId(`message-quick-✅-${reactId}`).click().catch(() => {})
  // Read back off the server until the reaction is there — bounded, so a click
  // that posts nothing still fails — not 1.8 fixed seconds after the press, which
  // under a sweep's load read the message before the reaction had been written.
  let reacted = await A(`/chat/channels/${channelId}/messages?limit=50`)
  await waitUntil(async () => {
    reacted = await A(`/chat/channels/${channelId}/messages?limit=50`)
    return ((reacted.data ?? []).find((m) => m.id === reactId)?.reactions ?? []).some((r) => r.emoji === '✅')
  }, { timeoutMs: 15_000, stepMs: 300 })
  const target = (reacted.data ?? []).find((m) => m.id === reactId)
  check(
    (target?.reactions ?? []).some((r) => r.emoji === '✅'),
    'and clicking one actually reacts',
    JSON.stringify(target?.reactions ?? []),
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 — a link to one message, that a person can make')
  // ---------------------------------------------------------------------
  /*
   * The frame cross-check found the two halves of this built and not joined
   * up. `?channel=&message=` already worked — the inbox and the search results
   * navigate to it, and the page scrolls to and highlights whatever it names —
   * but nothing anywhere would GIVE you one. You could follow a link to a
   * message and never make one, so pointing a colleague at what somebody said
   * meant pasting the text.
   *
   * Checked by following it, not by matching it. A permalink is a promise that
   * the address goes somewhere, and a regex proving the URL has the right
   * shape is satisfied just as well by one that lands on an empty channel.
   */
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })

  const linkTarget = page.locator('.group').filter({ hasText: BODY }).first()
  await linkTarget.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  const targetId = await linkTarget
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  check(!!targetId, 'the probe message can be identified to link to', 'no message row id found')

  await linkTarget.hover()
  await page.locator('[data-testid^="message-overflow-"]').first().click()

  const copyItem = page.locator(`[data-testid="message-copy-link-${targetId}"]`)
  await waitUntil(() => copyItem.isVisible(), { timeoutMs: 10_000 })
  const hasCopy = await copyItem.isVisible().catch(() => false)
  check(hasCopy, 'the message menu offers "Copy link"', 'no per-message copy-link action')

  const permalink = chain(
    'and it copies an address for THAT message',
    'and opening it lands on the message, highlighted',
  )
  if (!hasCopy || !targetId) {
    permalink.rest(
      !targetId
        ? 'skipped: the probe message had no row id to link to, so nothing was copied to open'
        : 'skipped: there was no Copy link to press, so nothing was copied to open',
    )
  } else {
    await copyItem.click()
    // The clipboard is written asynchronously; read it once it holds the link.
    await waitUntil(async () => {
      const held = await page.evaluate(() => navigator.clipboard.readText())
      return held.includes(`message=${targetId}`) && held.includes(`channel=${channelId}`)
    }, { timeoutMs: 10_000 })

    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
    permalink.step(
      copied.includes(`message=${targetId}`) && copied.includes(`channel=${channelId}`),
      `clipboard held ${JSON.stringify(copied.slice(0, 160))}`,
    )

    /*
     * Opened in a SECOND page, from the clipboard, with no shared component
     * state — the way the person receiving it opens it. Re-navigating the page
     * that made the link can be satisfied by state that is already in memory.
     */
    const recipient = await ctx.newPage()
    await recipient.goto(copied || `${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
    const landed = await recipient
      .waitForFunction(
        (id) => document.querySelector(`[data-testid="message-row-${id}"]`)?.getAttribute('data-highlighted') === 'true',
        targetId,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false)
    permalink.step(landed, `${copied} did not highlight the message`)
    await recipient.close()
  }

  /*
   * ---------------------------------------------------------------------
   * G11-2 [14:52] — "Forward this message", as a modal
   *
   * The old control was an inline popover listing
   * `[...publicChannels, ...dmChannels].slice(0, 10)`. Three things were wrong
   * and only one is cosmetic:
   *
   *   - a workspace with more than ten conversations could not forward to the
   *     eleventh AT ALL, however precisely you knew its name
   *   - there was nowhere to say why you were forwarding
   *   - one click sent it. No confirm, no undo.
   *
   * The eleventh-conversation case is the one worth seeding for: with ten or
   * fewer channels the old code and the new one behave identically, so a check
   * against ambient data would pass on the bug.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G11-2 [14:52] — forwarding is a decision, not a click')
  const FWD_TAG = `fwdtarget${Date.now()}`
  const seededChannels = []
  for (let i = 0; i < 12; i++) {
    const made = await A(`/workspaces/${workspaceId}/chat/channels`, {
      method: 'POST',
      body: { name: `${FWD_TAG}-${i}`, isPrivate: false },
    })
    if (made.data?.id) seededChannels.push(made.data.id)
  }
  const priorCleanup = cleanup
  cleanup = async () => {
    const answers = (await priorCleanup?.()) ?? []
    for (const id of seededChannels) answers.push(await archive(id))
    return answers
  }
  check(seededChannels.length === 12, 'twelve conversations to choose between', `${seededChannels.length} made`)

  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  // Each press waits for its own target (the menu's Forward among them); the
  // modal is waited for.
  const fwdRow = page.locator('.group').filter({ hasText: BODY }).first()
  await fwdRow.hover()
  const fwdOverflow = fwdRow.locator('button[data-testid^="message-overflow-"]').first()
  await fwdOverflow.click().catch(() => {})
  await page.getByRole('button', { name: /^forward$/i }).first().click().catch(() => {})

  const modal = page.getByTestId('forward-modal')
  await waitUntil(() => modal.isVisible(), { timeoutMs: 10_000 })
  const modalOpen = await modal.isVisible().catch(() => false)
  check(modalOpen, 'Forward opens a modal, not a ten-item popover')
  /*
   * ONE CHAIN FOR EVERYTHING THE MODAL LEADS TO. Without a modal this reported
   * four checks — two of them under sentences of their own that no passing run
   * prints ("with the message it is about", "and the eleventh conversation is
   * reachable") — where the modal's path reports eleven, so losing the modal
   * read as the run stopping early. Every path reports these eleven now, and a
   * path that stops fails the rest with the reason it stopped.
   */
  const forward = chain(
    'with the message it is about, so you can see you picked the right one',
    'and it will not send until somebody is chosen',
    'and a conversation past the old ten-item cap can still be found',
    'picking somebody makes it sendable',
    'and it arrives in the conversation you chose',
    'and the note travels with it',
    'the forward carries the channel it came from',
    'and who wrote it',
    'and when they wrote it',
    'and the banner on screen names that channel, not just "Forwarded"',
    'and names the person who wrote it',
  )
  if (!modalOpen) {
    forward.rest('skipped: Forward opened no modal, so there was nothing in it to use')
  } else {
    // The preview, the confirm button and the list are drawn with the modal.
    forward.step(
      (await readText(page.getByTestId('forward-preview').filter({ visible: true }), { timeoutMs: 2000 })).includes(
        BODY.slice(0, 20),
      ),
      'the preview does not show the message being forwarded',
    )
    /*
     * THERE, AND DISABLED. This read `isDisabled().catch(() => true)`, so a
     * modal with no Forward button in it passed as one holding the forward
     * back: the read threw on the missing button, and the catch said
     * "disabled".
     */
    const confirm = page.getByTestId('forward-confirm')
    const confirmThere = await confirm.isVisible().catch(() => false)
    forward.step(
      confirmThere && (await confirm.isDisabled({ timeout: 2000 }).catch(() => false)),
      confirmThere
        ? 'the confirm button was live before a recipient was picked'
        : 'the modal has no Forward button to hold back',
    )

    /*
     * The bug itself. `-11` is the twelfth seeded channel, well past the old
     * ten-item cap, and it is only reachable because the search filters BEFORE
     * the list is capped.
     */
    await page.getByTestId('forward-search').fill(`${FWD_TAG}-11`)
    const eleventh = page.locator('[data-testid^="forward-target-"]')
    // Counted once the list has narrowed to the one it should (bounded).
    await waitForCount(eleventh, 1, { timeoutMs: 10_000 })
    const matches = await eleventh.count()
    forward.step(matches === 1, `${matches} matches for ${FWD_TAG}-11`)

    if (matches !== 1) {
      forward.rest(`skipped: ${matches} conversations matched ${FWD_TAG}-11, so there was no one match to pick`)
    } else {
      // `?? ''` before `.replace`: the row is one a check above may find
      // absent, and `.replace` on a caught null throws.
      const targetId = (
        (await eleventh.first().getAttribute('data-testid', { timeout: 8000 }).catch(() => null)) ?? ''
      ).replace('forward-target-', '')
      await eleventh.first().click()
      await page.getByTestId('forward-note').fill('sharing this for context')
      await waitUntil(async () => !(await confirm.isDisabled({ timeout: 1000 })), { timeoutMs: 10_000 })
      forward.step(
        !(await confirm.isDisabled({ timeout: 2000 }).catch(() => true)),
        confirmThere
          ? 'the confirm button stayed disabled with a recipient picked'
          : 'there is no Forward button to make sendable',
      )
      // Bounded: with no button to press, the checks below fail in their own
      // words rather than the run ending here on a thirty-second click.
      await confirm.click({ timeout: 10_000 }).catch(() => {})

      // Read off the server once the forward is there (bounded).
      let landed = await A(`/chat/channels/${targetId}/messages`)
      await waitUntil(async () => {
        landed = await A(`/chat/channels/${targetId}/messages`)
        return (landed.data ?? []).some((msg) => String(msg.body).includes(BODY.slice(0, 20)))
      }, { timeoutMs: 15_000, stepMs: 300 })
      const got = (landed.data ?? []).find((msg) => String(msg.body).includes(BODY.slice(0, 20)))
      forward.step(!!got, `${(landed.data ?? []).length} messages there`)
      forward.step(
        !!got && String(got.body).includes('sharing this for context'),
        `body: ${String(got?.body ?? '').slice(0, 80)}`,
      )

      /*
       * G11-1 — the forward has to say WHERE it came from, WHO wrote it and
       * WHEN.
       *
       * "Forwarded" on its own is a quote with the attribution torn off, and
       * that is exactly what shipped: the channel name was fetched by the
       * server, typed on the client, and rendered nowhere. Read off the wire
       * first — a banner cannot show a field the API never sends — and then off
       * the screen, because the API sending it was never the half that was
       * broken.
       */
      const prov = got?.forwardedFrom
      forward.step(
        !!prov && typeof prov.channelName === 'string' && prov.channelName.length > 0,
        `forwardedFrom: ${JSON.stringify(prov)}`,
      )
      forward.step(
        !!prov && typeof prov.authorName === 'string' && prov.authorName.length > 0,
        `authorName: ${JSON.stringify(prov?.authorName)}`,
      )
      forward.step(
        !!prov && !!prov.sentAt && !Number.isNaN(new Date(prov.sentAt).getTime()),
        `sentAt: ${JSON.stringify(prov?.sentAt)}`,
      )

      await page.goto(`${origin}/app/${workspaceId}/chat?channel=${targetId}`, {
        waitUntil: 'domcontentloaded',
      })
      // Read once the banner names what the wire said it would (bounded).
      const banner = page.locator('[data-testid^="forwarded-"]').filter({ visible: true }).first()
      await waitUntil(async () => {
        const shown = await banner.innerText({ timeout: 1000 })
        return (!prov?.channelName || shown.includes(prov.channelName)) && (!prov?.authorName || shown.includes(prov.authorName))
      }, { timeoutMs: 30_000 })
      const bannerText = (await readText(banner, { timeoutMs: 2000 })).trim()
      forward.step(
        !!prov?.channelName && bannerText.includes(prov.channelName),
        `banner read ${JSON.stringify(bannerText)}`,
      )
      forward.step(
        !!prov?.authorName && bannerText.includes(prov.authorName),
        `banner read ${JSON.stringify(bannerText)}`,
      )
    }
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ a thread is reachable on a narrow screen')
  // ---------------------------------------------------------------------
  /*
   * In its own context, at 1200 wide, because that is the whole point.
   *
   * ThreadPanel was `hidden xl:flex` and is rendered exactly once, so below
   * 1280px every control that sets threadParentId was inert — while the
   * "N replies" link went on advertising a thread you could not open. Nothing
   * caught it because every suite in this repo runs at 1680×1000, where the
   * panel is always there.
   *
   * So this is not really a check about threads. It is a check that the
   * viewport a person actually has is one the harness ever visits. The 1680
   * assertion at the end is the control: without it, a selector that matched
   * nothing would report the same "not visible" at every width and read as a
   * defect confirmed rather than a check misfiring — which is exactly what
   * happened on the first measurement.
   */
  {
    const narrow = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const np = await narrow.newPage()
    await signIn(np, origin, ADMIN)
    await np.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Drawn once the channel's messages are (bounded).
    const threadLink = np.locator('[data-testid^="view-thread-"]').first()
    await waitUntil(() => threadLink.isVisible(), { timeoutMs: 30_000 })
    const linkThere = await threadLink.isVisible().catch(() => false)
    check(linkThere, 'a message with replies offers to open the thread at 1200px')

    /*
     * THREE CHAINS, IN THE ORDER THEY RUN, so each `rest` fills its own section
     * and nothing else. The no-link path reported three of these five and the
     * no-Create-task path four, where the full path reports five — a short run
     * either way — and one of the three the no-link path did report was typed
     * again rather than taken from its pass twin.
     */
    const narrowOpens = chain('and clicking it actually opens the thread', 'the drawer dims the conversation behind it')
    const narrowDialog = chain(
      'and a dialog opened from inside the drawer is clickable, not buried under it',
      'and that dialog closes again',
    )
    const narrowCloses = chain('and clicking away closes it again')
    if (!linkThere) {
      for (const section of [narrowOpens, narrowDialog, narrowCloses]) {
        section.rest('skipped: there was no thread link at 1200px to open')
      }
    } else {
      await threadLink.click()
      // The scrim and the header's Create task are drawn with the panel.
      await waitUntil(() => np.getByTestId('chat-thread-panel').isVisible(), { timeoutMs: 15_000 })
      narrowOpens.step(
        await np.getByTestId('chat-thread-panel').isVisible().catch(() => false),
        'the panel stayed hidden — the control is inert at this width',
      )
      const scrim = np.getByTestId('thread-scrim')
      narrowOpens.step(
        await scrim.isVisible().catch(() => false),
        'no scrim, so there is nothing to click to dismiss it',
      )

      /*
       * ...and the controls INSIDE it still work.
       *
       * The drawer first shipped at z-[65] over a z-[60] scrim, which put it
       * above every `fixed inset-0 z-50` modal on this page. "Create task" from
       * the thread header opened its modal UNDERNEATH the scrim: present in the
       * DOM, impossible to click. The checks above did not catch it because
       * they only opened and closed the drawer — a drawer that opens is not a
       * drawer you can use.
       *
       * Read by hit-testing the card's own centre, the point a person clicks.
       * Asking whether the modal is "visible" says nothing: it was visible the
       * whole time, just buried.
       */
      const ct = np.getByTestId('thread-create-task')
      if (await ct.isVisible().catch(() => false)) {
        await ct.click({ timeout: 8000 }).catch(() => {})
        // Hit-tested once the card is drawn (bounded; one that never is fails
        // below as "the modal did not open").
        await waitUntil(() => np.getByTestId('chat-task-draft').isVisible(), { timeoutMs: 10_000 })
        const reachable = await np.evaluate(() => {
          const card = document.querySelector('[data-testid="chat-task-draft"]')
          if (!card) return 'the modal did not open'
          const r = card.getBoundingClientRect()
          if (!r.width) return 'the modal has no box'
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return card.contains(top) || card === top
            ? 'ok'
            : 'buried under ' + (top?.getAttribute('data-testid') || String(top?.className).slice(0, 60))
        })
        narrowDialog.step(reachable === 'ok', reachable)
        /*
         * Dismissed by clicking its own backdrop, and confirmed gone.
         *
         * Escape is not wired on this modal, so pressing it left the dialog up
         * — and the dialog's backdrop is `fixed inset-0`, so the NEXT check's
         * click on the scrim landed on the backdrop instead and the drawer
         * never closed. A step that leaves state behind fails the check after
         * it, which reads as a defect in something that is fine.
         *
         * AND ONLY A DIALOG THAT OPENED CAN BE SHOWN TO CLOSE. "It is not on
         * screen" is also what a dialog that never opened looks like, so that
         * case fails here with its reason rather than passing on nothing.
         */
        if (reachable === 'the modal did not open') {
          narrowDialog.rest('skipped: Create task opened no dialog, so there was none to close')
        } else {
          await np.locator('.fixed.inset-0.z-50').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
          await waitUntil(async () => !(await np.getByTestId('chat-task-draft').isVisible()), { timeoutMs: 10_000 })
          narrowDialog.step(
            !(await np.getByTestId('chat-task-draft').isVisible().catch(() => false)),
            'the task draft stayed open, which would block everything behind it',
          )
        }
      } else {
        narrowDialog.rest('skipped: there was no create-task control in the thread header')
      }
      await scrim.click({ position: { x: 5, y: 5 } }).catch(() => {})
      await waitUntil(async () => !(await np.getByTestId('chat-thread-panel').isVisible()), { timeoutMs: 10_000 })
      narrowCloses.step(
        !(await np.getByTestId('chat-thread-panel').isVisible().catch(() => false)),
        'the drawer would not close',
      )
    }
    await narrow.close()
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ a reply you have read can be put back')
  // ---------------------------------------------------------------------
  /*
   * The Replies page moved in one direction only. Opening a row marked it read
   * on the way out, and its single button did the same thing again — while
   * `POST /notifications/:id/unread` had existed all along and the Inbox had
   * been calling it all along. Built, never joined up here.
   *
   * On a page whose whole job is "replies I still owe somebody", that means
   * reading the queue is what destroys it. Losing your place by browsing is
   * worse than a missing feature, because it punishes the thing the page is
   * for.
   *
   * Seeded rather than borrowed from ambient data: the reply has to come from
   * somebody else, or there is no notification to put back, and a check with
   * nothing to act on passes by not running.
   */
  {
    const seedBody = `putback-${Date.now()}`
    const seed = await A(`/chat/channels/${channelId}/messages`, { method: 'POST', body: { body: seedBody } })
    const theirReply = await B(`/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: { body: 'someone else replies to it', parentMessageId: seed.data?.id },
    })

    /*
     * THE REPLY'S OWN ID NAMES ITS NOTIFICATION. The notification's title is
     * the channel's name and its body the reply's words, which are the same on
     * every run, so this took the first unread `chat_reply` that was not there
     * before the reply was sent. With a second run on the same lane, that can
     * be the second run's: the list is newest first, and a reply of theirs that
     * lands after this one and before the read comes first. Measured against
     * lane 5's API with exactly that interleaving, 29 September — the old read
     * took the other run's notification, this one its own. The notification
     * points at the reply it is about (`target.entityId`), and the reply's id is
     * in the answer to posting it, which used to be thrown away.
     *
     * Polled, not slept against. The notification is written after the reply's
     * response returns, so reading immediately finds nothing — which is how
     * the first version of this check failed on working code. A fixed sleep
     * would trade that for a slower suite and a flake on a loaded runner.
     */
    const replyId = theirReply.data?.id ?? null
    let mine = null
    let seen = 0
    if (replyId) {
      await waitUntil(async () => {
        const notifs = (await A('/notifications?limit=50')).data ?? []
        seen = notifs.length
        mine = notifs.find((n) => n.type === 'chat_reply' && !n.readAt && n.target?.entityId === replyId) ?? null
        return !!mine
      }, { timeoutMs: 15_000, stepMs: 500 })
    }
    check(
      !!mine,
      'a reply from somebody else lands in Replies',
      replyId
        ? `no unread chat_reply about reply ${replyId} among ${seen}`
        : `the reply was not posted (it answered ${theirReply.status})`,
    )

    const putBack = chain(
      'an unread reply offers to resolve it',
      'and once read, it offers to mark it unread again',
      'and the server agrees it is unread again',
    )
    if (!mine) {
      putBack.rest('skipped: no reply from somebody else arrived, so there was nothing to read or put back')
    } else {
      /*
       * On the All tab, because the page defaults to `unread`
       * (workspace-replies-page.tsx:65) and a resolved row leaves that list
       * immediately. Watching it vanish would say nothing about whether there
       * is a way back — All is where both states of the same row are visible,
       * which is the only place the question can be asked.
       */
      await page.goto(`${origin}/app/${workspaceId}/replies?filter=all`, {
        waitUntil: 'domcontentloaded',
      })

      // Each control is read once the page's read of the replies has drawn it:
      // the row's resolve here, its Mark unread once the resolve is answered.
      const resolve = page.getByTestId(`reply-resolve-${mine.id}`)
      await waitUntil(() => resolve.isVisible(), { timeoutMs: 30_000 })
      putBack.step(await resolve.isVisible().catch(() => false), 'no resolve control on the unread reply')
      await resolve.click({ timeout: 10_000 }).catch(() => {})

      // The whole point: once read, there is a way back.
      const unread = page.getByTestId(`reply-unread-${mine.id}`)
      await waitUntil(() => unread.isVisible(), { timeoutMs: 15_000 })
      const offered = await unread.isVisible().catch(() => false)
      putBack.step(offered, 'the row is read with no way back — the queue is destroyed by reading it')
      /*
       * "Unread again" is only a claim about a row that was read and then put
       * back. Without the control the row may never have been read at all, and
       * a row that was never read reads as unread — so that path fails here
       * with its reason, and the server's copy has to be FOUND to be believed.
       */
      if (!offered) {
        putBack.rest('skipped: there was no Mark unread to press')
      } else {
        await unread.click({ timeout: 10_000 }).catch(() => {})
        // Read back off the server until it agrees (bounded: a press that
        // changes only the screen is still read, and still fails).
        let row = null
        await waitUntil(async () => {
          row = ((await A(`/notifications?limit=50`)).data ?? []).find((n) => n.id === mine.id)
          return !!row && row.readAt == null
        }, { timeoutMs: 15_000, stepMs: 300 })
        putBack.step(
          !!row && row.readAt == null,
          row ? 'the button changed the screen but not the record' : 'the reply is no longer among the notifications to read back',
        )
      }
    }
  }

  // The control. At 1680 the panel is a column in the flow, so no scrim.
  {
    const wide = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    const wp = await wide.newPage()
    await signIn(wp, origin, ADMIN)
    await wp.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, {
      waitUntil: 'domcontentloaded',
    })
    const wideLink = wp.locator('[data-testid^="view-thread-"]').first()
    await waitUntil(() => wideLink.isVisible(), { timeoutMs: 30_000 })
    const wideThread = chain(
      'and the wide layout still opens it too',
      'with no scrim, because there it is a column beside the conversation',
    )
    if (!(await wideLink.isVisible().catch(() => false))) {
      wideThread.rest('skipped: there was no thread link at 1680px to open')
    } else {
      await wideLink.click()
      // The scrim, when there is one, mounts in the same render as the panel.
      await waitUntil(() => wp.getByTestId('chat-thread-panel').isVisible(), { timeoutMs: 15_000 })
      const wideOpen = await wp.getByTestId('chat-thread-panel').isVisible().catch(() => false)
      wideThread.step(wideOpen, 'the panel does not open at 1680 either — this check is misfiring, not finding a bug')
      // "No scrim" is a claim about an OPEN panel: a panel that never opened has none either.
      if (!wideOpen) {
        wideThread.rest('skipped: the panel did not open, so there was no scrim to be absent beside it')
      } else {
        wideThread.step(
          !(await wp.getByTestId('thread-scrim').isVisible().catch(() => false)),
          'the wide layout dims the conversation it sits next to',
        )
      }
    }
    await wide.close()
  }

  await done(browser, stack, cleanup)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, cleanup)
}
