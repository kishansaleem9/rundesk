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
const EXPECTED_CHECKS = 62

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
  // Clipboard granted up front: "Copy link" is checked by reading back what it
  // actually put on the clipboard, and an ungranted read rejects in a way that
  // looks exactly like a feature that copied nothing.
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await ctx.newPage()
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
  await page.waitForTimeout(3500)
  check(
    /[?&]channel=/.test(page.url()),
    'landing on /chat puts the channel it chose in the address',
    page.url(),
  )

  const sidebarChannel = page.locator(`[data-testid="channel-row-${channelId}"]`).first()
  check((await sidebarChannel.count()) > 0, 'the channel is listed in the sidebar')
  await sidebarChannel.click()
  await page.waitForTimeout(2500)
  check(
    page.url().includes(`channel=${channelId}`),
    'and clicking it puts that channel in the address',
    page.url(),
  )

  // An open thread survives a reload and can be sent to somebody.
  const openThread = page.locator('[data-testid^="view-thread-"]').first()
  if ((await openThread.count()) > 0) {
    await openThread.click()
    await page.waitForTimeout(1800)
    check(/[?&]thread=/.test(page.url()), 'opening a thread puts it in the address', page.url())
    const threadUrl = page.url()
    await page.goto(threadUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    check(
      /[?&]thread=/.test(page.url()) &&
        (await page.locator('[data-testid="chat-thread-panel"]').count()) > 0,
      'and the thread is still open when that address is reopened',
      page.url(),
    )
  } else {
    check(false, 'no "open thread" control to drive')
    check(false, 'so the thread address was never exercised')
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
  if ((await page.locator('[data-testid="chat-thread-panel"]').count()) > 0) {
    const title = await page.getByTestId('thread-panel-title').innerText().catch(() => '')
    check(
      title.trim().length > 0 && !/^thread$/i.test(title.trim()),
      'the panel is named after whoever started the thread, not "Thread"',
      `the title reads "${title.trim()}"`,
    )
    check(
      (await page.getByTestId('thread-create-task').count()) > 0,
      'and "Create Task" is offered on the header',
      'no create-task control in the thread header',
    )
    const assign = page.getByTestId('thread-assign-to')
    check((await assign.count()) > 0, 'and "Assign to" beside it')

    // The picker must offer real people, not an empty menu — the failure this
    // would otherwise hide is a members read that returned nothing.
    await assign.click().catch(() => {})
    await page.waitForTimeout(800)
    const candidates = page.locator('[data-testid^="thread-assign-"]').filter({ hasNotText: /^$/ })
    check(
      (await page.locator('[data-testid^="thread-assign-"]').count()) > 1,
      'which opens the people it could be assigned to',
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
    await page.waitForTimeout(1200)
    check(
      (await page.getByTestId('chat-task-draft').count()) > 0,
      'and picking somebody opens the task draft',
      'nothing opened after picking a person',
    )
    /*
     * The assertion that matters. "The draft opened" would also pass if the
     * picker merely opened an empty dialog — and the point of Assign to is
     * that the person you chose is already on it, not that you get a second
     * form to fill in.
     */
    check(
      (await page.getByTestId('chat-task-draft-assignee').inputValue().catch(() => '')) === pickedId &&
        pickedId.length > 0,
      'with that person already on it, not a blank form',
      `draft assignee is "${await page.getByTestId('chat-task-draft-assignee').inputValue().catch(() => '')}", expected "${pickedId}"`,
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  } else {
    check(false, 'no thread panel open to read its header')
    check(false, 'so "Create Task" was never checked')
    check(false, 'so "Assign to" was never checked')
    check(false, 'so the assign menu was never opened')
    check(false, 'so assigning was never driven')
    check(false, 'so the pre-filled assignee was never checked')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G11 [15:11] — saving a message leaves a trace')
  // ---------------------------------------------------------------------
  /*
   * The bookmark tinted when saved — inside a toolbar that only exists while
   * the pointer is over the row. Move the mouse and there was nothing to say
   * the message was in Later, so "did that work?" meant hovering again. The
   * badge is checked with the pointer moved AWAY, which is the whole point.
   */
  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const saveRow = page.locator('.group').filter({ hasText: BODY }).first()
  const saveId = await saveRow
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  check(!!saveId, 'a message to save is on screen', 'no message row found')

  check(
    !(await page.getByTestId(`message-saved-badge-${saveId}`).isVisible().catch(() => false)),
    'and it is not marked saved before anybody saves it',
    'the saved badge was already showing',
  )

  await saveRow.hover()
  await page.waitForTimeout(400)
  // The bookmark is found by its title, which is the only stable handle the
  // action bar gives it. Emphatically NOT "click the first button with a
  // title" — that is a coin flip over a row whose toolbar includes Delete.
  const saveBtn = page.locator(`[data-testid="message-row-${saveId}"] button`).filter({ has: page.locator('svg') })
  const count = await saveBtn.count()
  let clicked = false
  for (let i = 0; i < count; i += 1) {
    const title = (await saveBtn.nth(i).getAttribute('title')) ?? ''
    if (/save/i.test(title) && !/unsave/i.test(title)) {
      await saveBtn.nth(i).click().catch(() => {})
      clicked = true
      break
    }
  }
  check(clicked, 'the toolbar offers Save', 'no save control on the message')
  await page.waitForTimeout(2000)

  // Pointer deliberately moved off the row before looking.
  await page.mouse.move(5, 5)
  await page.waitForTimeout(600)
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
  await page.waitForTimeout(3500)
  const reactRow = page.locator('.group').filter({ hasText: BODY }).first()
  const reactId = await reactRow
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  await reactRow.hover()
  await page.waitForTimeout(400)
  for (const emoji of ['👍', '✅', '🔥']) {
    check(
      await page.getByTestId(`message-quick-${emoji}-${reactId}`).isVisible().catch(() => false),
      `the toolbar offers ${emoji}`,
      `${emoji} is not offered on a channel message`,
    )
  }
  await page.getByTestId(`message-quick-✅-${reactId}`).click().catch(() => {})
  await page.waitForTimeout(1800)
  const reacted = await A(`/chat/channels/${channelId}/messages?limit=50`)
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
  await page.waitForTimeout(3500)

  const linkTarget = page.locator('.group').filter({ hasText: BODY }).first()
  const targetId = await linkTarget
    .evaluate((el) => el.closest('[data-testid^="message-row-"]')?.getAttribute('data-testid')?.replace('message-row-', '') ?? null)
    .catch(() => null)
  check(!!targetId, 'the probe message can be identified to link to', 'no message row id found')

  await linkTarget.hover()
  await page.waitForTimeout(400)
  await page.locator('[data-testid^="message-overflow-"]').first().click()
  await page.waitForTimeout(600)

  const copyItem = page.locator(`[data-testid="message-copy-link-${targetId}"]`)
  const hasCopy = await copyItem.isVisible().catch(() => false)
  check(hasCopy, 'the message menu offers "Copy link"', 'no per-message copy-link action')

  if (!hasCopy || !targetId) {
    check(false, 'and it copies an address for THAT message', 'there was no control to press')
    check(false, 'and opening it lands on the message, highlighted', 'nothing was copied to open')
  } else {
    await copyItem.click()
    await page.waitForTimeout(900)

    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
    check(
      copied.includes(`message=${targetId}`) && copied.includes(`channel=${channelId}`),
      'and it copies an address for THAT message',
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
    check(landed, 'and opening it lands on the message, highlighted', `${copied} did not highlight the message`)
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
    await priorCleanup?.()
    for (const id of seededChannels) await A(`/chat/channels/${id}/archive`, { method: 'POST' })
  }
  check(seededChannels.length === 12, 'twelve conversations to choose between', `${seededChannels.length} made`)

  await page.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const fwdRow = page.locator('.group').filter({ hasText: BODY }).first()
  await fwdRow.hover()
  await page.waitForTimeout(500)
  const fwdOverflow = fwdRow.locator('button[data-testid^="message-overflow-"]').first()
  await fwdOverflow.click().catch(() => {})
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^forward$/i }).first().click().catch(() => {})
  await page.waitForTimeout(900)

  const modal = page.getByTestId('forward-modal')
  check(await modal.isVisible().catch(() => false), 'Forward opens a modal, not a ten-item popover')
  if (!(await modal.isVisible().catch(() => false))) {
    check(false, 'with the message it is about', 'no modal')
    check(false, 'and the eleventh conversation is reachable', 'no modal')
    check(false, 'and it will not send until somebody is chosen', 'no modal')
    check(false, 'and the note travels with it', 'no modal')
  } else {
    check(
      (await page.getByTestId('forward-preview').innerText().catch(() => '')).includes(BODY.slice(0, 20)),
      'with the message it is about, so you can see you picked the right one',
    )
    check(
      await page.getByTestId('forward-confirm').isDisabled().catch(() => true),
      'and it will not send until somebody is chosen',
      'the confirm button was live before a recipient was picked',
    )

    /*
     * The bug itself. `-11` is the twelfth seeded channel, well past the old
     * ten-item cap, and it is only reachable because the search filters BEFORE
     * the list is capped.
     */
    await page.getByTestId('forward-search').fill(`${FWD_TAG}-11`)
    await page.waitForTimeout(600)
    const eleventh = page.locator('[data-testid^="forward-target-"]')
    check(
      (await eleventh.count()) === 1,
      'and a conversation past the old ten-item cap can still be found',
      `${await eleventh.count()} matches for ${FWD_TAG}-11`,
    )

    if ((await eleventh.count()) === 1) {
      const targetId = (await eleventh.first().getAttribute('data-testid')).replace('forward-target-', '')
      await eleventh.first().click()
      await page.getByTestId('forward-note').fill('sharing this for context')
      await page.waitForTimeout(300)
      check(
        !(await page.getByTestId('forward-confirm').isDisabled().catch(() => true)),
        'picking somebody makes it sendable',
      )
      await page.getByTestId('forward-confirm').click()
      await page.waitForTimeout(2500)

      const landed = await A(`/chat/channels/${targetId}/messages`)
      const got = (landed.data ?? []).find((msg) => String(msg.body).includes(BODY.slice(0, 20)))
      check(!!got, 'and it arrives in the conversation you chose', `${(landed.data ?? []).length} messages there`)
      check(
        !!got && String(got.body).includes('sharing this for context'),
        'and the note travels with it',
        `body: ${String(got?.body ?? '').slice(0, 80)}`,
      )
    } else {
      check(false, 'picking somebody makes it sendable', 'no match to pick')
      check(false, 'and it arrives in the conversation you chose', 'no match to pick')
      check(false, 'and the note travels with it', 'no match to pick')
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
    await np.waitForTimeout(4000)

    const threadLink = np.locator('[data-testid^="view-thread-"]').first()
    const linkThere = await threadLink.isVisible().catch(() => false)
    check(linkThere, 'a message with replies offers to open the thread at 1200px')

    if (linkThere) {
      await threadLink.click()
      await np.waitForTimeout(1200)
      check(
        await np.getByTestId('chat-thread-panel').isVisible().catch(() => false),
        'and clicking it actually opens the thread',
        'the panel stayed hidden — the control is inert at this width',
      )
      const scrim = np.getByTestId('thread-scrim')
      check(
        await scrim.isVisible().catch(() => false),
        'the drawer dims the conversation behind it',
        'no scrim, so there is nothing to click to dismiss it',
      )
      await scrim.click({ position: { x: 5, y: 5 } }).catch(() => {})
      await np.waitForTimeout(700)
      check(
        !(await np.getByTestId('chat-thread-panel').isVisible().catch(() => false)),
        'and clicking away closes it again',
        'the drawer would not close',
      )
    } else {
      check(false, 'and clicking it actually opens the thread', 'no thread link at 1200px')
      check(false, 'the drawer dims the conversation behind it', 'no thread link at 1200px')
      check(false, 'and clicking away closes it again', 'no thread link at 1200px')
    }
    await narrow.close()
  }

  // The control. At 1680 the panel is a column in the flow, so no scrim.
  {
    const wide = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    const wp = await wide.newPage()
    await signIn(wp, origin, ADMIN)
    await wp.goto(`${origin}/app/${workspaceId}/chat?channel=${channelId}`, {
      waitUntil: 'domcontentloaded',
    })
    await wp.waitForTimeout(4000)
    const wideLink = wp.locator('[data-testid^="view-thread-"]').first()
    if (await wideLink.isVisible().catch(() => false)) {
      await wideLink.click()
      await wp.waitForTimeout(1200)
      check(
        await wp.getByTestId('chat-thread-panel').isVisible().catch(() => false),
        'and the wide layout still opens it too',
        'the panel does not open at 1680 either — this check is misfiring, not finding a bug',
      )
      check(
        !(await wp.getByTestId('thread-scrim').isVisible().catch(() => false)),
        'with no scrim, because there it is a column beside the conversation',
        'the wide layout dims the conversation it sits next to',
      )
    } else {
      check(false, 'and the wide layout still opens it too', 'no thread link at 1680px')
      check(false, 'with no scrim, because there it is a column beside the conversation', 'no link')
    }
    await wide.close()
  }

  await done(browser, stack, cleanup)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, cleanup)
}
