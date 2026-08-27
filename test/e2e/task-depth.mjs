/**
 * §G15 [21:36–23:31] — the three things task creation was missing.
 *
 * All three are UI-shaped failures over working backends, which is why they
 * need a browser rather than a route check:
 *
 *  - **Tags** (#147). `labels`, `task_label_assignments` and
 *    `POST`/`DELETE /tasks/:id/labels/:id` all shipped long ago, and the task
 *    sheet even rendered the badges. Nothing in the web app ever called them.
 *    A passing HTTP check for "can a tag be attached" was already true before
 *    this work and told you nothing about whether anybody could do it.
 *  - **The create modal** (#149). Reminders, whiteboards and dashboards were
 *    whole features reachable only by first navigating to the page that owns
 *    them.
 *  - **The slash editor** (#148). "main SLASH click karoongi, phir table bana
 *    loon, banners rakhoon."
 *
 *   node test/e2e/task-depth.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/task-depth.mjs
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
const EXPECTED_CHECKS = 28

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

const done = async (browser, stack) => {
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

  // A task of this suite's own, so the tag checks are not reading somebody's
  // real task and the description starts empty.
  const spaces = await A(`/spaces/workspace/${workspaceId}`)
  const projects = await A(`/projects/space/${spaces.data[0].id}`)
  const lists = await A(`/lists/project/${projects.data[0].id}`)
  const listId = lists.data?.[0]?.id
  if (!listId) throw new Error('no list to create a task in — seed a space/project/list first')
  const TITLE = `depth probe ${Date.now()}`
  const created = await A('/tasks', { method: 'POST', body: { listId, title: TITLE } })
  const taskId = created.data?.id
  if (!taskId) throw new Error(`could not create a task: ${JSON.stringify(created).slice(0, 200)}`)

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

  // ---------------------------------------------------------------------
  console.log('\n▶ §G15 [21:36] — the create modal offers what she listed')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  // The "+ New" button in the top bar is the one way in, and its label is a
  // translated string — so this goes through the testid rather than matching
  // words that also appear in the sidebar. An earlier version of this check
  // read the whole page for "Dashboard" and passed on the sidebar's own
  // "Dashboards" link while the modal was never opening at all.
  await page.getByTestId('quick-create-open').click()
  await page.waitForTimeout(1500)

  check(
    await page.getByTestId('create-tab-reminder').isVisible().catch(() => false),
    'the create modal offers Reminder',
  )
  check(
    await page.getByTestId('create-tab-whiteboard').isVisible().catch(() => false),
    'the create modal offers Whiteboard',
  )
  check(
    await page.getByTestId('create-tab-dashboard').isVisible().catch(() => false),
    'the create modal offers Dashboard',
  )

  // And the tab does something, which is the half a tab strip cannot prove.
  await page.getByTestId('create-tab-reminder').click()
  await page.waitForTimeout(800)
  check(
    await page.getByTestId('quick-create-reminder').isVisible().catch(() => false),
    'the Reminder tab opens a form',
  )
  const NOTE = `depth reminder ${Date.now()}`
  await page.getByTestId('reminder-note').fill(NOTE)
  await page.getByRole('button', { name: /Set reminder/i }).first().click()
  await page.waitForTimeout(2200)
  const reminders = await A(`/workspaces/${workspaceId}/reminders`)
  check(
    (reminders.data ?? []).some((r) => r.note === NOTE),
    'and the reminder it makes is real',
    JSON.stringify(reminders.data ?? []).slice(0, 200),
  )
  check(
    (reminders.data ?? []).find((r) => r.note === NOTE)?.taskId == null,
    'made with no task invented to hold it',
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G15 [23:16] — a tag can reach a task')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${taskId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(3800)

  const addTag = page.getByTestId('task-tag-add')
  check(await addTag.isVisible().catch(() => false), 'the task sheet offers a way to add a tag')
  await addTag.click()
  await page.waitForTimeout(900)
  check(
    await page.getByTestId('task-tag-popover').isVisible().catch(() => false),
    'it opens a tag box',
  )

  // "likhke ENTER dabao to naya tag ban jaye" — the whole interaction.
  const TAG = `ui-tag-${Date.now()}`
  await page.getByTestId('task-tag-input').fill(TAG)
  await page.waitForTimeout(500)
  check(
    await page.getByTestId('task-tag-create').isVisible().catch(() => false),
    'a name that does not exist offers to create it',
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)

  const detail = await A(`/tasks/${taskId}`)
  const applied = (detail.data?.labels ?? []).find((l) => l.name === TAG)
  check(!!applied, 'pressing Enter creates the tag AND puts it on the task', JSON.stringify(detail.data?.labels))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  const sheetText = await page.locator('body').innerText()
  check(sheetText.includes(TAG), 'and the tag is visible on the task', sheetText.slice(0, 160))

  // Pressing Enter on a tag that already exists must attach it, not 500 on the
  // unique index — which is what happens the second time anybody tags with it.
  const second = await A('/tasks', { method: 'POST', body: { listId, title: `${TITLE} two` } })
  const reuse = await A(`/workspaces/${workspaceId}/labels`, {
    method: 'POST',
    body: { name: TAG, color: '#111111' },
  })
  check(reuse.status < 300 && reuse.data?.id === applied?.id, 'reusing the same name returns the same tag')
  await A(`/tasks/${second.data.id}/labels/${reuse.data.id}`, { method: 'POST' })
  const secondDetail = await A(`/tasks/${second.data.id}`)
  check(
    (secondDetail.data?.labels ?? []).some((l) => l.id === applied?.id),
    'so a second task can carry the same tag',
  )

  // Taking it off, from the badge itself.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3800)
  const removeBtn = page.getByTestId(`task-tag-remove-${applied.id}`)
  check(await removeBtn.isVisible().catch(() => false), 'the badge carries its own remove control')
  await removeBtn.click()
  await page.waitForTimeout(2200)
  const after = await A(`/tasks/${taskId}`)
  check(
    !(after.data?.labels ?? []).some((l) => l.id === applied.id),
    'and pressing it takes the tag off',
    JSON.stringify(after.data?.labels),
  )

  // ---------------------------------------------------------------------
  console.log('\n▶ §G15 [22:28] — "/" in the description')
  // ---------------------------------------------------------------------
  // One testid on BOTH entry points — the description renders as a button when
  // empty and a click-to-edit div when it has content, and a test that guesses
  // which branch it is looking at fails for the wrong reason.
  await page.getByTestId('description-open').click()
  await page.waitForTimeout(1200)
  const textarea = page.locator('textarea:visible').first()
  check(await textarea.count() > 0, 'the description opens for editing')

  await textarea.fill('')
  await textarea.type('/')
  await page.waitForTimeout(800)
  const slashMenu = page.getByTestId('description-slash-menu')
  check(await slashMenu.isVisible().catch(() => false), 'typing "/" opens the block menu')
  const slashText = await slashMenu.innerText().catch(() => '')
  check(/Table/i.test(slashText), 'the menu offers a Table — the block she names', slashText.slice(0, 140))
  check(/Banner/i.test(slashText), 'and a Banner — the other one she names')

  await page.getByTestId('description-slash-table').click()
  await page.waitForTimeout(1200)
  const draft = await textarea.inputValue()
  check(/\|\s*Column\s*\|/.test(draft) && /\|\s*---\s*\|/.test(draft), 'picking Table writes a table', draft.slice(0, 80))
  check(!draft.includes('/'), 'and the "/" that opened the menu is gone', draft.slice(0, 80))

  // Saved, then rendered as a table rather than as literal pipes.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(2500)
  const saved = await A(`/tasks/${taskId}`)
  check(/\|\s*---\s*\|/.test(saved.data?.description ?? ''), 'the table survives the save')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3800)
  check(
    await page.locator('table').first().isVisible().catch(() => false),
    'and renders as a real table, not a row of pipes',
  )

  /*
   * §G [21:36] — "START date aur DUE date … TIME ke saath."
   *
   * The re-audit's one real find in this area. Both fields were
   * `<input type="date">` over `timestamp with time zone` columns, so the only
   * instant a person could write was midnight — and nudging a day threw away a
   * time the row was already holding, silently, with nothing on screen to show
   * it had gone.
   *
   * Exercised in the order that made the bug visible: store a time, see that
   * the control can show it, change the day, and check the clock survived.
   */
  const dated = await A('/tasks', {
    method: 'POST',
    body: { listId, title: `date depth ${Date.now()}`, dueDate: new Date(2026, 9, 2, 9, 15).toISOString() },
  })
  const datedId = dated.data?.id
  check(Boolean(datedId), 'a task with a due time can be created')

  await page.goto(
    `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${datedId}`,
    {
      waitUntil: 'domcontentloaded',
    },
  )
  await page.waitForTimeout(4000)

  // Field labels are plain divs, not <label>s, so this reads the label text.
  const dateField = (label) =>
    page.evaluateHandle((lbl) => {
      for (const d of Array.from(document.querySelectorAll('div.text-xs.uppercase'))) {
        if (d.textContent?.trim().startsWith(lbl)) return d.parentElement?.querySelector('input')
      }
      return null
    }, label).then((h) => h.asElement())

  const dueEl = await dateField('Due date')
  const startEl = await dateField('Start date')
  check(Boolean(dueEl) && Boolean(startEl), 'the sheet has a due and a start field')
  if (dueEl && startEl) {
    const dueType = await dueEl.evaluate((e) => e.type)
    const startType = await startEl.evaluate((e) => e.type)
    check(
      dueType === 'datetime-local' && startType === 'datetime-local',
      'and both of them can hold a time',
      `due=${dueType} start=${startType}`,
    )
    const shown = await dueEl.evaluate((e) => e.value)
    check(shown.endsWith('T09:15'), 'a stored time is visible in the control', shown)

    await dueEl.evaluate((e) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(e, '2026-10-05T16:45')
      e.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(2500)
    const after = new Date((await A(`/tasks/${datedId}`)).data?.dueDate)
    check(
      after.getDate() === 5 && after.getHours() === 16 && after.getMinutes() === 45,
      'a time typed into the sheet is stored as that instant',
      after.toISOString(),
    )
  }

  await A(`/tasks/${datedId}`, { method: 'DELETE' })

  await done(browser, stack)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack)
}
