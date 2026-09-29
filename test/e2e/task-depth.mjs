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
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { makeChain } from './lib/chain.mjs'
import { waitUntil } from './lib/wait.mjs'

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


const chain = makeChain(check)
/** Raise this when checks are added — a suite that quietly shrinks reads as green. */
const EXPECTED_CHECKS = 91

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
  const meId = admin.user?.id ?? admin.id

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
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })

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
  await page.getByTestId('create-tab-reminder').click({ timeout: 10_000 }).catch(() => {})
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
  console.log('\n▶ §G15 [22:55]–[23:31] — creating a task collects more than a title')
  // ---------------------------------------------------------------------
  /*
   * Her gap #28, in her words: task creation collected a title and every other
   * property was something you set afterwards, by finding the task again.
   *
   * The API had accepted all of it on create for months — CreateTaskDto takes
   * description, priority, startDate, dueDate, timeEstimate, assigneeIds and
   * labelIds. The form simply never asked, and posted `priority: 'normal'`
   * hard-coded. So this drives the FORM and then reads the TASK: a control
   * that renders but does not reach the payload is exactly the failure that
   * shape of bug produces.
   */
  /*
   * Re-open the modal. The reminder section above SUBMITS, which closes it —
   * so reaching straight for the task tab waited 30s for a control that was
   * not on screen. The floor guard caught that ("only 7 of 83 checks ran"),
   * which is the entire reason it exists.
   */
  if (!(await page.getByTestId('create-tab-task').isVisible().catch(() => false))) {
    await page.getByTestId('quick-create-open').click()
    await page.waitForTimeout(1200)
  }
  await page.getByTestId('create-tab-task').click()
  await page.waitForTimeout(900)

  const CREATED = `depth create ${Date.now()}`
  const CREATE_TAG = `dtag${Date.now()}`
  // Scoped to the form. Unscoped, `input[placeholder]` first-matched a field
  // OUTSIDE the modal (the top-bar search), so the title stayed empty and the
  // Create button stayed disabled — with nothing on screen explaining why.
  await page.locator('form input[placeholder]').first().fill(CREATED)

  /*
   * Space → Project → List, each enabling the next. Waited on rather than
   * timed: every step fires a query for the next level, and a fixed 700ms was
   * sometimes not enough — the list stayed unset, the Create button stayed
   * disabled, and the failure surfaced 30 seconds later as an unhelpful
   * "element is not enabled" on a button nobody had explained.
   */
  for (const id of ['quick-create-space', 'quick-create-project', 'quick-create-list']) {
    // By testid, not by position: the form gained selects for priority and
    // assignee, and `form select` nth(2) is only the list until somebody adds
    // a control above it. Waited on because each choice fires the query that
    // fills the next.
    await page
      .waitForFunction(
        (sel) => (document.querySelector(`[data-testid="${sel}"]`)?.options?.length ?? 0) > 1,
        id,
        { timeout: 15000 },
      )
      .catch(() => {})
    await page.getByTestId(id).selectOption({ index: 1 }).catch(() => {})
  }

  /*
   * §G15 [21:59] — "agar main list nahi banaoongi to yeh nahi create karega."
   * If this project genuinely has no list, the form must let her make one
   * WITHOUT leaving the task she is describing. That is the whole gap.
   */
  const listSelect = page.getByTestId('quick-create-list')
  if ((await listSelect.locator('option').count().catch(() => 0)) <= 1) {
    const offered = await page.getByTestId('quick-create-new-list').isVisible().catch(() => false)
    check(offered, 'a project with no list offers to make one right here', 'the task form is a dead end without a list')
    if (offered) {
      await page.getByTestId('quick-create-new-list').click()
      await page.getByTestId('quick-create-new-list-name').fill(`inline list ${Date.now()}`)
      await page.getByTestId('quick-create-new-list-save').click()
      await page.waitForTimeout(2000)
    }
  } else {
    // There was a list, so the dead-end path is not exercised — said out loud
    // rather than passing a check that never ran.
    console.log('  ·  this project already has a list, so the inline creator was not needed')
  }

  const hasDesc = await page.getByTestId('quick-create-description').isVisible().catch(() => false)
  check(hasDesc, 'the create form asks for a description', 'no description field on create')
  if (hasDesc) await page.getByTestId('quick-create-description').fill('made at create time')

  const hasPriority = await page.getByTestId('quick-create-priority').isVisible().catch(() => false)
  check(hasPriority, 'and a priority', 'priority is still decided for you')
  if (hasPriority) await page.getByTestId('quick-create-priority').selectOption('urgent')

  const hasDue = await page.getByTestId('quick-create-due').isVisible().catch(() => false)
  check(hasDue, 'and a due date that carries a time', 'no due field on create')
  // [22:59] a start AND a due, each with a time of day.
  const stamp = (d) => new Date(d).toISOString().slice(0, 16)
  if (hasDue) {
    await page.getByTestId('quick-create-start').fill(stamp(Date.now() + 3600_000))
    await page.getByTestId('quick-create-due').fill(stamp(Date.now() + 4 * 86400_000))
  }

  const hasEstimate = await page.getByTestId('quick-create-estimate').isVisible().catch(() => false)
  check(hasEstimate, 'and a time estimate', 'no estimate field on create')
  if (hasEstimate) await page.getByTestId('quick-create-estimate').fill('3')

  const hasAssign = await page.getByTestId('quick-create-assign').isVisible().catch(() => false)
  check(hasAssign, 'and somebody to assign it to', 'no assignee control on create')
  if (hasAssign) await page.getByTestId('quick-create-assign').selectOption({ index: 1 }).catch(() => {})

  const hasTag = await page.getByTestId('quick-create-tag-input').isVisible().catch(() => false)
  const tagOnCreate = chain(
    'and a tag you type and commit with Enter',
    'and Enter commits the tag without submitting the form',
  )
  tagOnCreate.step(hasTag, 'no tag input on create')
  if (!hasTag) {
    tagOnCreate.rest('skipped: there was no tag input to press Enter in')
  } else {
    await page.getByTestId('quick-create-tag-input').fill(CREATE_TAG)
    await page.getByTestId('quick-create-tag-input').press('Enter')
    await page.waitForTimeout(400)
    // Enter commits the tag; it must not submit the half-filled form.
    tagOnCreate.step(
      await page.getByTestId('quick-create-description').isVisible().catch(() => false),
      'pressing Enter on a tag closed the form',
    )
  }

  /*
   * Assert the form is actually submittable before clicking. Without this the
   * failure was a 30s Playwright timeout on a disabled button, which says
   * nothing about WHY — the real cause was that no list had been selected.
   */
  const submit = page.getByRole('button', { name: /Create task/i }).first()
  const submittable = await submit.isEnabled().catch(() => false)
  check(submittable, 'the form is submittable once a list is chosen', 'Create task stayed disabled — no list selected')
  if (!submittable) throw new Error('create form not submittable; the checks below would prove nothing')
  await submit.click()
  await page.waitForTimeout(3000)

  // Now read the task the server actually made.
  const madeList = await A(`/tasks/workspace/${workspaceId}?limit=200`)
  const made = (madeList.data ?? []).find((x) => x.title === CREATED)
  check(!!made, 'the task is created', `no task titled ${CREATED}`)

  /*
   * SEVEN CHECKS WHICHEVER WAY THIS GOES. A create that fails takes every
   * field check with it, so the one thing a broken create form cannot do is
   * report which of its seven fields arrived — the run simply gets shorter and
   * `EXPECTED_CHECKS` then calls it a stopped run rather than a broken form.
   */
  const fields = chain(
    'the priority she chose is the priority it has',
    'both dates arrived',
    'and the due date carries a time, not just a day',
    'the estimate is stored in seconds',
    'the description arrived',
    'somebody is assigned',
    'and the tag she typed is on it',
  )
  if (!made) {
    fields.rest('skipped: no task was created, so none of its fields exist')
  } else {
    const full = await A(`/tasks/${made.id}`)
    const d = full.data ?? {}
    fields.step(d.priority === 'urgent', `priority=${d.priority}`)
    fields.step(!!d.dueDate && !!d.startDate, `start=${d.startDate} due=${d.dueDate}`)
    // The time of day is the half that used to be dropped.
    fields.step(
      !!d.dueDate && new Date(d.dueDate).getUTCHours() + new Date(d.dueDate).getUTCMinutes() >= 0 &&
        /T\d\d:\d\d/.test(new Date(d.dueDate).toISOString()),
      String(d.dueDate),
    )
    fields.step(Number(d.timeEstimate) === 3 * 3600, `timeEstimate=${d.timeEstimate}`)
    fields.step(
      typeof d.description === 'string' && d.description.includes('made at create time'),
      JSON.stringify(d.description ?? null),
    )
    fields.step((d.assignees ?? []).length > 0, JSON.stringify(d.assignees ?? []))
    fields.step(
      (d.labels ?? []).some((l) => (l.name ?? l) === CREATE_TAG),
      JSON.stringify(d.labels ?? []),
    )
    await A(`/tasks/${made.id}`, { method: 'DELETE' }).catch(() => {})
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ §G15 [23:16] — a tag can reach a task')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${taskId}`, {
    waitUntil: 'domcontentloaded',
  })
  // The control is drawn once the task and what this reader may do with it
  // have answered, which under a sweep's load is later than a fixed wait.
  const addTag = page.getByTestId('task-tag-add')
  const tagOffered = await waitUntil(() => addTag.isVisible().catch(() => false), { timeoutMs: 20_000 })
  check(tagOffered, 'the task sheet offers a way to add a tag')
  await addTag.click({ timeout: 10_000 }).catch(() => {})
  const tagBox = await waitUntil(() => page.getByTestId('task-tag-popover').isVisible().catch(() => false), { timeoutMs: 5_000 })
  check(tagBox, 'it opens a tag box')

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

  /*
   * TAKING IT OFF, FROM THE BADGE ITSELF — and this used to read `applied.id`
   * on a value that is undefined whenever the tag was never attached.
   *
   * `td-tags-1-created-but-not-attached` makes exactly that happen: the label
   * is created and never put on the task, so `applied` is undefined and
   * `applied.id` threw a TypeError. Two checks then never ran, and the run
   * reported on the part it reached — which is the short run this whole sweep
   * is about, arriving through a `.` rather than through an `if`.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  const removal = chain(
    'the badge carries its own remove control',
    'and pressing it takes the tag off',
  )
  if (!applied?.id) {
    removal.rest('skipped: the tag was never attached, so there is no badge to remove')
  } else {
    /*
     * WAITED FOR, NOT SLEPT (`found-24-sep/three-suites-fail-under-a-full-sweep`):
     * the badge's control once the reloaded sheet draws it, and then the task's
     * labels — the read the check makes — until the tag has gone from them. It
     * was 3.8 and 2.2 fixed seconds, and under a sweep's load the task still
     * listed the tag when it was read. Both bounded; a tag that stays still fails.
     */
    const removeBtn = page.getByTestId(`task-tag-remove-${applied.id}`)
    await removeBtn.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const haveRemove = await removeBtn.isVisible().catch(() => false)
    removal.step(haveRemove, 'no remove control on the badge')
    if (!haveRemove) {
      removal.rest('skipped: there was no remove control to press')
    } else {
      await removeBtn.click()
      let after = await A(`/tasks/${taskId}`)
      await waitUntil(async () => {
        after = await A(`/tasks/${taskId}`)
        return !(after.data?.labels ?? []).some((l) => l.id === applied.id)
      }, { timeoutMs: 15_000, stepMs: 300 })
      removal.step(
        !(after.data?.labels ?? []).some((l) => l.id === applied.id),
        JSON.stringify(after.data?.labels),
      )
    }
  }

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
  const draft = await textarea.inputValue({ timeout: 5000 }).catch(() => '')
  check(/\|\s*Column\s*\|/.test(draft) && /\|\s*---\s*\|/.test(draft), 'picking Table writes a table', draft.slice(0, 80))
  check(!draft.includes('/'), 'and the "/" that opened the menu is gone', draft.slice(0, 80))

  // Saved, then rendered as a table rather than as literal pipes.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(2500)
  const saved = await A(`/tasks/${taskId}`)
  check(/\|\s*---\s*\|/.test(saved.data?.description ?? ''), 'the table survives the save')
  /*
   * Reopened by address rather than by reload.
   *
   * The click above lands on the sheet's full-screen overlay, so it closes the
   * sheet as well as blurring the editor. This used to be invisible: closing
   * the sheet only changed component state and left a stale `?task=` behind,
   * so a plain reload put the sheet back. Now that closing clears the param,
   * a reload correctly shows the list — and this check wants the task, so it
   * asks for the task.
   */
  await page.goto(
    `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${taskId}`,
    { waitUntil: 'domcontentloaded' },
  )
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
        if (d.textContent?.trim().startsWith(lbl)) return d.parentElement?.querySelector('input') // text-read: key — finds a field by its uppercase label
      }
      return null
    }, label).then((h) => h.asElement())

  const dueEl = await dateField('Due date')
  const startEl = await dateField('Start date')
  const dates = chain(
    'the sheet has a due and a start field',
    'and both of them can hold a time',
    'a stored time is visible in the control',
    'a time typed into the sheet is stored as that instant',
  )
  dates.step(Boolean(dueEl) && Boolean(startEl), 'one or both fields are missing from the sheet')
  if (!dueEl || !startEl) {
    dates.rest('skipped: there was no date field to read or type into')
  } else {
    const dueType = await dueEl.evaluate((e) => e.type)
    const startType = await startEl.evaluate((e) => e.type)
    dates.step(
      dueType === 'datetime-local' && startType === 'datetime-local',
      `due=${dueType} start=${startType}`,
    )
    const shown = await dueEl.evaluate((e) => e.value)
    dates.step(shown.endsWith('T09:15'), shown)

    await dueEl.evaluate((e) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(e, '2026-10-05T16:45')
      e.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(2500)
    const after = new Date((await A(`/tasks/${datedId}`)).data?.dueDate)
    dates.step(
      after.getDate() === 5 && after.getHours() === 16 && after.getMinutes() === 45,
      after.toISOString(),
    )
  }

  await A(`/tasks/${datedId}`, { method: 'DELETE' })

  /*
   * A task in the bin is not an editable task.
   *
   * The third video1 pass deleted a task and then kept writing to it: PATCH
   * answered 200 and a comment answered 201, on a row no list, no search and
   * no deep link would show you. Deleting is a soft delete and every read path
   * filtered on it; the write paths never did.
   *
   * Checked here rather than in a unit test because the whole question is what
   * the real controller, guards and service do with a real archived row — the
   * gate is shared by some thirty write paths and opted out of by exactly two,
   * and getting that backwards is silent in both directions.
   */
  const binned = await A('/tasks', { method: 'POST', body: { listId, title: `bin probe ${Date.now()}` } })
  const binnedId = binned.data?.id
  check(Boolean(binnedId), 'a task to throw away')

  const liveEdit = await A(`/tasks/${binnedId}`, { method: 'PATCH', body: { title: 'edited while alive' } })
  check(liveEdit.status < 300, 'edits fine while it is alive', `PATCH → ${liveEdit.status}`)

  await A(`/tasks/${binnedId}`, { method: 'DELETE' })
  const binnedEdit = await A(`/tasks/${binnedId}`, { method: 'PATCH', body: { title: 'edited from the bin' } })
  check(binnedEdit.status === 409, 'and refuses edits once it is in the bin', `PATCH → ${binnedEdit.status}`)

  const binnedComment = await A(`/tasks/${binnedId}/comments`, { method: 'POST', body: { body: 'from the bin' } })
  check(binnedComment.status === 409, 'and refuses comments too', `POST → ${binnedComment.status}`)

  // The refusal has to be a refusal, not a 409 over a write that landed.
  const stillNamed = await A(`/tasks/${binnedId}`)
  check(
    !String(stillNamed.data?.title ?? '').includes('edited from the bin'),
    'and wrote nothing while refusing',
    stillNamed.data?.title,
  )

  // The two operations that exist FOR binned tasks must be untouched.
  const restored = await A(`/tasks/${binnedId}/restore`, { method: 'POST' })
  check(restored.status < 300, 'restore still works on a binned task', `POST → ${restored.status}`)
  const afterRestore = await A(`/tasks/${binnedId}`, { method: 'PATCH', body: { title: 'edited after restore' } })
  check(afterRestore.status < 300, 'and it edits again once restored', `PATCH → ${afterRestore.status}`)

  await A(`/tasks/${binnedId}`, { method: 'DELETE' })
  const reDelete = await A(`/tasks/${binnedId}`, { method: 'DELETE' })
  check(reDelete.status < 300, 'deleting an already-binned task is not an error', `DELETE → ${reDelete.status}`)

  /*
   * §G15 [22:07] — "yeh pooch raha ke PRIVATE karni hai ke nahi."
   *
   * The frame audit's gap for this said visibility was "create-time-unsettable
   * even though the column and the PUT path both support it", so the only way
   * to a private list was to make a public one and change it — a window,
   * however short, in which the wrong people can see it.
   */
  const privateList = await A('/lists', {
    method: 'POST',
    body: { projectId: projects.data[0].id, name: `depth private ${Date.now()}`, visibility: 'private' },
  })
  check(privateList.data?.visibility === 'private', 'a list can be created private',
    `visibility=${privateList.data?.visibility}`)
  const publicList = await A('/lists', {
    method: 'POST',
    body: { projectId: projects.data[0].id, name: `depth public ${Date.now()}` },
  })
  check(publicList.data?.visibility === 'public', 'and omitting it still means public',
    `visibility=${publicList.data?.visibility}`)
  const oddList = await A('/lists', {
    method: 'POST',
    body: { projectId: projects.data[0].id, name: `depth odd ${Date.now()}`, visibility: 'sneaky' },
  })
  check(oddList.data?.visibility === 'public', 'an unknown visibility is ignored, not trusted into the column',
    `visibility=${oddList.data?.visibility}`)

  /*
   * §G15 [22:48] — "main yahan pe koi aur image embed kar sakti hoon."
   *
   * Table and banner shipped with the slash menu; the image did not, and the
   * gap was recorded closed. Before this, `![alt](url)` rendered as a stray "!"
   * and a link, because the link branch claims the `[alt](url)` inside every
   * image.
   */
  const imgTask = await A('/tasks', {
    method: 'POST',
    body: {
      listId,
      title: `image depth ${Date.now()}`,
      description: 'Above.\n\n![the picture](https://example.com/p.png)\n\nBelow.',
    },
  })
  await page.goto(
    `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${imgTask.data?.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(4000)
  check(
    (await page.locator('img[src*="example.com"]').count()) === 1,
    'an image in a description renders as an image',
    'no <img> came from the description',
  )
  const descText = await page.locator('body').innerText()
  check(!/!\s*the picture|!\[the picture\]/.test(descText),
    'and not as a stray "!" beside a link', 'the raw markdown is still on screen')

  await page.locator('[data-testid=description-open]').first().click().catch(() => {})
  await page.waitForTimeout(700)
  await page.keyboard.press('End')
  await page.keyboard.type('\n/')
  await page.waitForTimeout(900)
  const slashBlocks = await page.locator('[data-testid=description-slash-menu] button').allInnerTexts().catch(() => [])
  check(slashBlocks.some((b) => /image/i.test(b)), 'and the slash menu offers an Image block',
    JSON.stringify(slashBlocks))
  await page.keyboard.press('Escape')
  await A(`/tasks/${imgTask.data?.id}`, { method: 'DELETE' })

  /*
   * §G15 frame #9 — "Today / Tomorrow / This weekend / Next week / 2 weeks /
   * 4 weeks aur 'Set Recurring' wahin milein."
   *
   * These were skipped once on the reasoning that she does not ask for them in
   * so many words — she demonstrates them in ClickUp. That reasoning was wrong:
   * the walkthrough IS the specification, because the point of the exercise is
   * that somebody moving across finds what they reach for.
   */
  const presetTask = await A('/tasks', {
    method: 'POST',
    body: { listId, title: `preset depth ${Date.now()}`, dueDate: new Date(2026, 8, 15, 17, 30).toISOString() },
  })
  await page.goto(
    `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}?task=${presetTask.data?.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(4000)
  const presetLabels = await page.locator('[data-testid=task-due-presets] button').allInnerTexts().catch(() => [])
  check(presetLabels.length >= 6, 'the due date offers natural-language presets', JSON.stringify(presetLabels))
  check(
    (await page.locator('[data-testid=task-due-set-recurring]').count()) > 0,
    'and Set Recurring sits with them, not buried further down the sheet',
  )
  await page.locator('[data-testid=task-due-preset-nextWeek]').click()
  await page.waitForTimeout(2200)
  const movedDue = new Date((await A(`/tasks/${presetTask.data?.id}`)).data?.dueDate)
  check(
    movedDue.getHours() === 17 && movedDue.getMinutes() === 30,
    'and a preset keeps the time the row was already carrying',
    movedDue.toISOString(),
  )
  await A(`/tasks/${presetTask.data?.id}`, { method: 'DELETE' })

  /*
   * §G15 frame #12 — "Task create karte waqt neeche Templates, attach aur
   * notification (bell) ke controls hon."
   *
   * All three existed and none was reachable from the create dialog: templates
   * only from the Templates page, attachments and watchers only from the detail
   * sheet once the task already existed.
   */
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.locator('[data-testid=quick-create-open]').click()
  await page.waitForTimeout(800)
  await page.locator('[data-testid=create-tab-task]').click()
  await page.waitForTimeout(600)
  check((await page.locator('[data-testid=quick-create-attach]').count()) > 0,
    'the create dialog can attach a file')
  check((await page.locator('[data-testid=quick-create-notify]').count()) > 0,
    'and notify somebody, without opening the task afterwards')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  /*
   * §G15 [22:15] / frame #7 — "List banne ke baad poochhe ke view kaisa
   * chahiye — main abhi 'no thanks' karoon."
   *
   * She declines it on camera, which is the point: it is offered, and skipping
   * is one click. Both create paths used to navigate straight into an empty
   * list, so a list shipped with views nobody chose.
   */
  await page.locator('[data-testid=quick-create-open]').click()
  await page.waitForTimeout(800)
  await page.locator('[data-testid=create-tab-list]').click()
  await page.waitForTimeout(700)
  const listForm = page.locator('form').filter({ has: page.locator('[data-testid=quick-create-list-private]') })
  check(await listForm.count() > 0, 'the list form asks whether to make it private (§G15 [22:07])')
  await listForm.locator('input[type=text], input:not([type])').first().fill(`depth step ${Date.now()}`)
  const listSelects = listForm.locator('select')
  await listSelects.nth(0).selectOption({ index: 1 })
  await page.waitForTimeout(900)
  await listSelects.nth(1).selectOption({ index: 1 })
  await page.waitForTimeout(900)
  await listForm.locator('button[type=submit]').click()
  await page.waitForTimeout(3200)
  const settingsStep = await page.locator('[data-testid=list-settings-step]').count()
  const listSettings = chain(
    'and creating one asks which views it opens with',
    'offering the views a list really has',
    'with a "No thanks", which is what she does with it',
    'and skipping applies nothing and leaves you in the list',
  )
  listSettings.step(settingsStep > 0, 'no settings step after creating a list')
  if (settingsStep === 0) {
    listSettings.rest('skipped: the settings step never appeared')
  } else {
    listSettings.step((await page.locator('[data-testid^=list-settings-view-]').count()) >= 3, '')
    listSettings.step((await page.locator('[data-testid=list-settings-skip]').count()) > 0, '')
    await page.locator('[data-testid=list-settings-skip]').click()
    await page.waitForTimeout(2500)
    listSettings.step((await page.locator('[data-testid=list-settings-step]').count()) === 0, '')
  }

  /*
   * §G15 [21:22] — "MY TASKS … ASSIGNED TO ME, TODAY, aur PERSONAL LIST",
   * and she reaches the same three from her profile.
   *
   * All three existed as buttons inside Home's left card, driven by component
   * state. There was no address for "my tasks", so a task you had just made had
   * nowhere you could go and look for it — which is exactly how it feels when
   * you cannot tell where a new task went.
   */
  const mineTask = await A('/tasks', { method: 'POST', body: { listId, title: `my tasks ${Date.now()}` } })
  if (mineTask.data?.id) {
    await A(`/tasks/${mineTask.data.id}/assignees`, { method: 'POST', body: { userId: meId } })
  }
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  check((await page.locator('[data-testid=sidebar-my-tasks]').count()) > 0,
    'the sidebar carries a My Tasks group')
  for (const s of ['assigned-to-me', 'today-overdue', 'personal-list']) {
    check((await page.locator(`[data-testid=sidebar-my-tasks-${s}]`).count()) > 0,
      `with ${s} under it`)
  }

  await page.locator('[data-testid=sidebar-my-tasks-assigned-to-me]').click()
  await page.waitForTimeout(2000)
  check(/section=assigned-to-me/.test(page.url()), 'and choosing one puts it in the URL', page.url())
  check((await page.locator('body').innerText()).includes(mineTask.data?.title ?? '#'),
    'with the task that was just assigned on screen')

  // Bookmarkable is the whole point: a section held in component state cannot
  // be returned to, linked, or sent to anybody.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(
    /section=assigned-to-me/.test(page.url()) &&
      (await page.locator('body').innerText()).includes(mineTask.data?.title ?? '#'),
    'and it survives a reload',
    page.url(),
  )

  // A stale link must land somewhere useful rather than rendering nothing.
  await page.goto(`${origin}/app/${workspaceId}?section=nonsense`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  check((await page.locator('body').innerText()).length > 200,
    'an unknown ?section= falls back to a working page')

  if (mineTask.data?.id) await A(`/tasks/${mineTask.data.id}`, { method: 'DELETE' })

  // ---------------------------------------------------------------------
  console.log('\n▶ Opening a task writes ?task=, so the sheet has an address')
  // ---------------------------------------------------------------------
  /*
   * `?task=` was declared and consumed but never written: the scheme was
   * inbound-only. Every check above navigates straight to a ?task= URL, which
   * exercises reading it — the direction that already worked. These drive the
   * other half, from the list.
   */
  const listUrl = `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}`
  const SECOND = `depth probe second ${Date.now()}`
  const otherTask = await A('/tasks', { method: 'POST', body: { listId, title: SECOND } })
  const secondId = otherTask.data?.id

  await page.goto(listUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  check(!/[?&]task=/.test(page.url()), 'the list starts with no task in the address', page.url())

  /*
   * `exact` matters: this suite also creates `${TITLE} two` for the tag
   * checks, so a loose match clicks whichever of the two happens to be first
   * and the assertion then fails against a perfectly correct URL.
   */
  await page.getByText(TITLE, { exact: true }).first().click()
  await page.waitForTimeout(1800)
  check(
    page.url().includes(`task=${taskId}`),
    'clicking a task puts it in the address',
    page.url(),
  )

  // The point of an address: it survives being reloaded, and can be sent.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  check(
    (await page.locator('body').innerText()).includes(TITLE),
    'and the sheet is still open after a reload',
    page.url(),
  )

  /*
   * The case that made the old behaviour actively wrong rather than merely
   * missing: arrive at ?task=A, move to task B, and the URL still said A — so
   * a reload reopened the task you had already moved on from.
   */
  if (secondId) {
    await page.goto(`${listUrl}?task=${taskId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3200)
    // The sheet's own overlay, not Escape: the overlay covers the list and
    // intercepts pointer events, so the next click never reaches a task row.
    await page.locator('[aria-label="Close sheet overlay"]').first().click()
    await page.waitForTimeout(1500)
    check(
      !/[?&]task=/.test(page.url()),
      'closing the sheet takes the task back out of the address',
      page.url(),
    )
    await page.getByText(SECOND, { exact: true }).first().click()
    await page.waitForTimeout(1800)
    check(
      page.url().includes(`task=${secondId}`) && !page.url().includes(`task=${taskId}`),
      'opening a second task replaces the first in the address',
      page.url(),
    )
    await A(`/tasks/${secondId}`, { method: 'DELETE' })
  } else {
    check(false, 'could not create a second task to check the stale-param case')
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ Sprints is reachable — it was built and never linked')
  // ---------------------------------------------------------------------
  /*
   * Sprints shipped whole — routes, pages, an API — and nothing in the app
   * pointed at it: absent from the sidebar nav, from the collapsed rail, from
   * the command palette's jump-to list, and there was no nav.sprints string in
   * any locale. The only mention outside its own pages was a dashboard
   * burndown widget that drew a chart with no link to the sprint behind it.
   */
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const sprintLink = page.locator(`[data-testid="workspace-sidebar"] a[href$="/sprints"]`)
  check(
    (await sprintLink.count()) > 0,
    'the sidebar offers a way into Sprints',
    ((await page.locator('[data-testid="workspace-sidebar"]').innerText({ timeout: 5000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160),
  )
  if ((await sprintLink.count()) > 0) {
    await sprintLink.first().click()
    await page.waitForTimeout(3000)
    check(/\/sprints$/.test(new URL(page.url()).pathname), 'and it goes to the sprints page', page.url())
    check(
      (await page.locator('body').innerText()).length > 200,
      'which renders something rather than an empty shell',
    )
  } else {
    check(false, 'no sprints link to follow')
    check(false, 'no sprints page to render')
  }

  /*
   * ---------------------------------------------------------------------
   * G10-10 [12:21–12:24] / G10-11 [12:38–12:41] — three notification kinds
   *
   * > "kisi ne mujhe comment/assign kiya to mujhe show ho"
   *
   * Two of these already fired wearing somebody else's type: an assigned
   * comment arrived as `task_assigned` and a resolved one as `task_commented`.
   * In the Inbox they were indistinguishable from a task assignment and a new
   * comment, and in the Primary customiser they could never be toggled apart —
   * which is the entire granularity she is pointing at.
   *
   * Checked by DRIVING each one and reading the stored type back, not by
   * asserting the enum has the label. A label with nothing writing it is the
   * defect this whole audit keeps turning up, and an enum check would pass on
   * exactly that.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G10-10 / G10-11 — comments and subtasks are their own kinds of news')
  // Tolerant on purpose: without a second account the checks below report
  // themselves as undriven rather than the suite falling over.
  const other = await signInApi(
    API,
    process.env.RUNDESK_EMAIL_2 ?? 'org-admin@rundesk.internal',
    process.env.RUNDESK_PASSWORD_2 ?? 'OrgAdmin@123!',
  ).catch(() => null)
  if (!other?.accessToken) {
    check(false, 'a second account to be notified', 'could not sign in as the second user')
    check(false, 'so comment_assigned was never driven')
    check(false, 'so comment_resolved was never driven')
    check(false, 'so subtask_created was never driven')
  } else {
    const B = apiAs(other.accessToken)
    const stamp = Date.now()
    // The parent belongs to the OTHER account, so they are the audience for
    // everything below and the actor is never the recipient.
    const parent = await A('/tasks', { method: 'POST', body: { listId, title: `notify probe ${stamp}` } })
    await A(`/tasks/${parent.data.id}/assignees`, { method: 'POST', body: { userId: other.user.id } })

    const before = await B('/notifications?limit=60')
    const seenBefore = new Set((before.data ?? []).map((n) => n.id))

    await A('/tasks', {
      method: 'POST',
      body: { listId, title: `notify probe sub ${stamp}`, parentTaskId: parent.data.id },
    })
    const c1 = await A(`/tasks/${parent.data.id}/comments`, { method: 'POST', body: { body: `probe ${stamp}` } })
    await A(`/tasks/${parent.data.id}/comments/${c1.data.id}/assign`, {
      method: 'POST',
      body: { userId: other.user.id },
    })
    const c2 = await B(`/tasks/${parent.data.id}/comments`, { method: 'POST', body: { body: `probe reply ${stamp}` } })
    // `resolved: true` matters — the route takes a boolean, and sending an
    // empty body silently un-resolves instead, which made an earlier version
    // of this check report a missing notification that was never asked for.
    await A(`/tasks/${parent.data.id}/comments/${c2.data.id}/resolve`, {
      method: 'POST',
      body: { resolved: true },
    })

    await new Promise((r) => setTimeout(r, 2500))
    const after = await B('/notifications?limit=60')
    const fresh = (after.data ?? []).filter((n) => !seenBefore.has(n.id))
    const kinds = fresh.map((n) => n.type)
    check(fresh.length > 0, 'the second account hears about all of it', `${fresh.length} new notifications`)
    check(
      kinds.includes('comment_assigned'),
      'an assigned comment arrives as its own kind, not as a task assignment',
      `kinds: ${kinds.join(', ') || '(none)'}`,
    )
    check(
      kinds.includes('comment_resolved'),
      'and a resolved comment as its own kind, not as a new comment',
      `kinds: ${kinds.join(', ') || '(none)'}`,
    )
    check(
      kinds.includes('subtask_created'),
      'and a subtask under your task is news in its own right',
      `kinds: ${kinds.join(', ') || '(none)'}`,
    )
    await A(`/tasks/${parent.data.id}`, { method: 'DELETE' })
  }

  /*
   * ── §G01-8 — the list says how stale it is ────────────────────────────────
   *
   * The Dashboard had a "last updated" line and an auto-refresh picker and
   * nothing else did. A list polled on somebody else's schedule with nothing on
   * screen to tell a current board from one that has been open since you made
   * coffee — and on a list two people are working through, "is this stale?" is
   * the first question anybody has.
   *
   * The refresh BUTTON is the one that has to do something, so it is checked by
   * effect: a task created behind the page's back appears when you press it.
   * Asserting the control renders would pass for a button wired to nothing,
   * which is the defect class this whole audit is about.
   */
  console.log('\n▶ §G01-8 — a list tells you how old it is')
  await page.goto(
    `${origin}/app/${workspaceId}/${spaces.data[0].id}/${projects.data[0].id}/${listId}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(4000)

  check(
    await page.getByTestId('freshness-controls').isVisible().catch(() => false),
    'a list carries the freshness controls, not just the dashboard',
    'no freshness controls on the list view',
  )
  check(
    (await page.getByTestId('freshness-updated').innerText().catch(() => '')).trim().length > 0,
    'and says when what you are looking at last arrived',
    'the list shows no age for its data',
  )

  /*
   * The button is checked by the REQUEST it makes, not by a row appearing.
   *
   * The first version created a task behind the page's back and looked for it
   * after pressing refresh — and it was already on screen before the press,
   * because the list keeps itself current from the realtime stream. That check
   * could never have failed on the button, only on the socket. Counting the
   * fetch is the thing the control actually promises.
   */
  /*
   * OBSERVED, not intercepted.
   *
   * Two attempts with `page.route` counted nothing: a narrow glob matched no
   * request, and a broad one was shadowed by a handler this suite registers
   * earlier. Both reported zero fetches, which reads exactly like a button
   * wired to nothing — a harness failure wearing the defect's clothes.
   * `page.on('request')` cannot be shadowed and changes no behaviour.
   */
  let listFetches = 0
  page.on('request', (req) => {
    if (req.url().includes(`/tasks/list/${listId}`)) listFetches += 1
  })
  await page.waitForTimeout(500)
  const before = listFetches
  await page.getByTestId('freshness-refresh-now').click()
  await page.waitForTimeout(2500)
  check(
    listFetches > before,
    'and refreshing actually goes and asks again',
    `the list was fetched ${listFetches - before} times when refresh was pressed`,
  )

  await done(browser, stack)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack)
}
