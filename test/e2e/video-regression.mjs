/**
 * The half of the ClickUp overview that only exists in a browser.
 *
 * `video-regression.py` covers what the API can answer for. Everything here is
 * a thing she pointed at on screen — a tab strip, a padlock, a filter builder,
 * a menu — where "the endpoint answers" proves nothing about whether anyone
 * can reach it.
 *
 *   BASE=http://127.0.0.1:5173 WS=<workspace-id> node test/e2e/video-regression.mjs
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture, ensureDm, ensureNotification } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
const chromium = await resolveChromium()

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EMAIL = process.env.E2E_EMAIL ?? 'verify@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Verify@123!'

/*
 * Serve the app and find a workspace, rather than assume both.
 *
 * BASE and WS were a dev server that had to already be running and the UUID of
 * one particular workspace, which is why this could only ever run on one
 * machine — and why it was not in CI. Given neither, it now serves the built
 * dist itself and takes the first workspace its login can see, making sure
 * that workspace has something in it first: most of what this suite reads is a
 * list view, and an empty list fails almost every check for reasons that have
 * nothing to do with the UI.
 */
const REPO = path.resolve(import.meta.dirname, '../..')
/** Who the DM in the sidebar is with — 'Colleague' was one workspace's person. */
let DM_NAME = process.env.E2E_DM_NAME ?? 'Colleague'
/** Whether an inbox notification could be arranged; null means "could not". */
let NOTIFIED = null
/**
 * §G10-12 — the authenticated client, hoisted so a check can arrange state the
 * UI has no button for. Marking every row read is exactly that: the point of
 * the check below is what the page looks like once nothing is unread.
 */
let API = null
let stack = null
let BASE = (process.env.BASE ?? '').replace(/\/$/, '')
if (!BASE) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  BASE = stack.base
}
let WS = process.env.WS
if (!WS) {
  const auth = await login(`${BASE}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${BASE}/api/v1`, auth.accessToken)
  API = api
  WS = (await pickWorkspace(api)).id
  const myId = auth.user?.id ?? auth.id
  const fixture = await ensureSweepFixture(api, WS)
  // A3.9 reads the DM tab strip, which needs a conversation to exist.
  const dm = await ensureDm(api, WS, myId)
  if (dm?.name) DM_NAME = dm.name
  // A2.6 reads "Clear all", which only renders when there is something to clear.
  NOTIFIED = await ensureNotification(api, `${BASE}/api/v1`, WS, myId, fixture.listId)
  console.log(
    `\x1b[2m  discovered workspace ${WS}` +
      (fixture.created ? `, created ${fixture.created} task(s)` : '') +
      (dm ? `, ensured a DM with ${DM_NAME}` : '') +
      (NOTIFIED ? ', ensured a notification' : '') + `\x1b[0m`,
  )
}

/*
 * A client that outlives the discovery block above, whose own `api` is scoped
 * to it. The inbox display checks need to read a preference back from the
 * server, because a setting that only redraws the screen is the defect this
 * suite keeps finding.
 */
const API_ROOT = `${BASE}/api/v1`
const rootAuth = await login(API_ROOT, EMAIL, PASSWORD)
const rootApi = apiClient(API_ROOT, rootAuth.accessToken)
const MY_ID = rootAuth.user?.id ?? rootAuth.id

/**
 * At least two notifications, because one cannot be reordered.
 *
 * `ensureNotification` makes exactly one, and only when there are none — which
 * is right for "Clear all", the check it was written for. A2.6b compares the
 * order of the list before and after flipping the sort, and against a single
 * row that comparison is identical either way: the check passed on a developer
 * box holding fifty notifications and failed in CI holding one, which is the
 * check depending on ambient data rather than on what it needs.
 */
async function ensureTwoNotifications() {
  const count = () => rootApi('/notifications?limit=50').then((r) => (r.data ?? []).length)
  // Three, not two. Notifications on the same entity collapse into one row
  // (`groupNotifications` keys on type:entityType:entityId), and the Primary
  // chip hides types outside the user's set — so "two exist" does not mean
  // "two are on screen", which is exactly how the last version failed.
  if ((await count()) >= 3) return await count()

  const peerEmail = process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal'
  const peerPassword = process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!'
  let peerApi
  try {
    const peerAuth = await login(API_ROOT, peerEmail, peerPassword)
    peerApi = apiClient(API_ROOT, peerAuth.accessToken)
  } catch {
    return await count()
  }

  // Any list will do; the notification comes from the assignment, not the task.
  const spaces = (await rootApi(`/spaces/workspace/${WS}`)).data ?? []
  let listId = null
  for (const sp of spaces) {
    const projects = (await rootApi(`/projects/space/${sp.id}`)).data ?? []
    for (const pr of projects) {
      const lists = (await rootApi(`/lists/project/${pr.id}`)).data ?? []
      if (lists.length) { listId = lists[0].id; break }
    }
    if (listId) break
  }
  if (!listId) return await count()

  for (let i = 0; i < 3; i++) {
    const task = (await peerApi('/tasks', {
      method: 'POST',
      body: { listId, title: `a2.6b order fixture ${i} ${Date.now()}` },
    })).data
    if (task?.id) {
      await peerApi(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId: MY_ID } })
    }
    // Distinct timestamps, so "newest first" has something to be first about.
    await new Promise((r) => setTimeout(r, 1100))
  }
  for (let i = 0; i < 12 && (await count()) < 3; i++) await new Promise((r) => setTimeout(r, 500))
  return await count()
}

const results = []
let REF = '—'
const ok = (m) => { results.push([REF, true, m]); console.log(`  \x1b[32mPASS\x1b[0m [${REF}] ${m}`) }
const bad = (m) => { results.push([REF, false, m]); console.log(`  \x1b[31mFAIL\x1b[0m [${REF}] ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))
const ref = (r, what) => { REF = r; console.log(`\n\x1b[1;36m▶ ${r}\x1b[0m  ${what}`) }
const area = (n) => console.log(`\n\x1b[1;35m${'═'.repeat(66)}\n  ${n}\n${'═'.repeat(66)}\x1b[0m`)

const browser = await chromium.launch(launchOptions())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()

/** Text of the page as a user would read it. */
const seen = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const go = async (path, settle = 3000) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
}

try {
  await go('/login', 1500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  console.log(`signed in as ${EMAIL}`)

  // ══════════════════════════════════════════════════ A1 hierarchy ════
  area('A1 — Hierarchy and views')

  ref('A1.8', 'The sidebar names the workspace and shows the tree')
  await go(`/app/${WS}`)
  const shell = await seen()
  chk(/Spaces/i.test(shell), 'the sidebar has a Spaces section', 'no Spaces section in the shell')
  chk(/Workspace/i.test(shell), 'the workspace is named in the sidebar', 'the workspace name is missing')

  ref('A1.9', 'The + menu offers more than a task')
  const newBtn = page.getByRole('button', { name: /^New$/ }).first()
  chk(await newBtn.count() > 0, 'there is a New button in the topbar', 'no New button')
  if (await newBtn.count()) {
    await newBtn.click()
    await page.waitForTimeout(1200)
    const menu = await seen()
    for (const item of ['Task', 'Doc', 'List']) {
      chk(new RegExp(item, 'i').test(menu), `the menu offers ${item}`, `the menu has no ${item}`)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  ref('A1.5', 'The whole nav she walked through is reachable')
  const nav = await seen()
  for (const dest of ['Inbox', 'Docs', 'Dashboards', 'Goals', 'Reports', 'Workload', 'Timeline', 'Forms', 'Automations']) {
    chk(new RegExp(`\\b${dest}\\b`, 'i').test(nav), `${dest} is in the sidebar`, `${dest} is not reachable from the sidebar`)
  }

  ref('A1.2', 'Named views as tabs, with + View')
  // A list is the only link with four path segments, which beats matching on
  // text — "Task list" in RECENTS is not a list.
  // The named routes (/inbox, /chat, …) are the same shape as a space, so match
  // on the id itself rather than on how many segments there are.
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const spaceHref = await page.locator('a[href]').evaluateAll((as, u) => {
    const re = new RegExp(`^/app/${u}/${u}$`)
    return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
  }, UUID)
  // Workspace → space → project → list. The space page links to projects, not
  // straight to lists, so this is three hops rather than two.
  const firstHrefOfDepth = (depth) =>
    page.locator('a[href]').evaluateAll((as, { u, d }) => {
      const re = new RegExp(`^/app/${u}${`/${u}`.repeat(d)}$`)
      return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
    }, { u: UUID, d: depth })

  let listHref = null
  if (spaceHref) {
    await go(spaceHref, 3500)
    const projectHref = await firstHrefOfDepth(2)
    if (projectHref) {
      await go(projectHref, 3500)
      listHref = await firstHrefOfDepth(3)
    }
  }
  if (listHref) {
    await go(listHref, 4500)
    const listPage = await seen()
    for (const v of ['List', 'Board', 'Table', 'Calendar', 'Gantt']) {
      chk(new RegExp(`\\b${v}\\b`).test(listPage), `the ${v} view is offered`, `no ${v} view`)
    }
    const addView = page.locator('button').filter({ hasText: /^View$/ }).last()
    chk(await addView.count() > 0, 'there is a control to save the current view',
      'no add-a-view control beside the tabs')
    if (await addView.count()) {
      // Make one rather than assume one is there. Naming is a window.prompt, so
      // it has to be answered before the click resolves.
      const viewName = `Team View ${Math.random().toString(36).slice(2, 8)}`
      page.once('dialog', (d) => d.accept(viewName))
      await addView.click()
      await page.waitForTimeout(3000)
      const savedTabs = await page.locator('button[title^="Actions for the"]').count()
      chk(savedTabs > 0, `and a saved view then sits in the tab strip (${savedTabs})`,
        'the saved view did not appear as a tab')
      chk((await seen()).includes(viewName), 'under the name it was given',
        `"${viewName}" is not in the tab strip`)
    }

    ref('A1.4', 'A filter builder, not three fixed fields')
    const filterBtn = page.getByRole('button', { name: /^Filter/i }).first()
    chk(await filterBtn.count() > 0, 'there is a Filter control', 'no Filter control on a list view')
    if (await filterBtn.count()) {
      await filterBtn.click()
      await page.waitForTimeout(1500)
      const f = await seen()
      const fields = ['Assignee', 'Priority', 'Due', 'Status'].filter((x) => new RegExp(x, 'i').test(f))
      chk(fields.length >= 3, `the builder offers ${fields.join(', ')}`, `only ${fields.length} filter fields offered`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }

    ref('A1.4b', 'Search inside the view you are already in')
    chk(await page.getByPlaceholder(/Search tasks/i).count() > 0,
      'the list has its own task search', 'no in-view task search')

    ref('A1.3', 'Board polish — label pills, inline rename, + Add group')
    const boardTab = page.getByRole('button', { name: /^Board$/ }).first()
    if (await boardTab.count()) {
      await boardTab.click()
      await page.waitForTimeout(3000)
      const board = await seen()
      chk(/Add group|New group/i.test(board), 'the board offers + Add group', 'no add-group control on the board')
    } else {
      bad('could not switch to the Board view')
    }
  } else {
    bad('no list reachable from the space page to test views against')
  }

  // ═══════════════════════════════════════════════ A2 search & inbox ════
  area('A2 — Search and inbox')

  ref('A2.1', 'Search is also a command bar')
  await go(`/app/${WS}`)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(1500)
  const palette = page.locator('input:visible').first()
  chk(await palette.count() > 0, 'Cmd/Ctrl-K opens a search box', 'the command palette did not open')
  if (await palette.count()) {
    ref('A2.3', 'Ask AI from the search box')
    await palette.fill('regr')
    await page.waitForTimeout(2500)
    const p = await seen()
    chk(/Ask AI/i.test(p), 'Ask AI is offered as the first move on a query', 'no Ask AI row in search')

    ref('A2.1b', 'Slash puts it in command mode')
    await palette.fill('/')
    await page.waitForTimeout(1800)
    const cmds = await seen()
    chk(/command/i.test(cmds) || /Create|Go to/i.test(cmds),
      'a leading slash offers commands rather than results', 'slash did not switch to commands')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  }

  ref('A2.6', 'Inbox: All / Primary / Other, and Later / Cleared')
  await go(`/app/${WS}/inbox`, 3500)
  /*
   * Read off the controls row, not the whole page.
   *
   * These assertions are about which buckets the inbox *offers*, and the page
   * text also contains every notification in the list. Scanning all of it made
   * the checks answer a different question than they asked: this failed once on
   * a notification whose body happened to contain the word "other", which is
   * ordinary content — "ask the other team" would do it — and it would have
   * gone the other way too, passing "Later is reachable" off a message with the
   * word "later" in it while the tab was missing.
   *
   * A check that a real message can turn red is one people learn to re-run
   * until it goes green.
   */
  const controls = await page
    .getByTestId('inbox-controls')
    .innerText()
    .catch(() => '')
  chk(controls.length > 0, 'the inbox offers its bucket controls', 'no inbox controls row on the page')
  for (const state of ['Later', 'Cleared', 'Primary']) {
    chk(
      new RegExp(`\\b${state}\\b`, 'i').test(controls),
      `${state} is reachable`,
      `${state} is not among the inbox controls: ${controls.replace(/\s+/g, ' ').slice(0, 120)}`,
    )
  }
  /*
   * §2.2 — Other is gone on her instruction ("yeh mujhe NAHI CHAHIYE humari
   * list mein"), so its absence is the assertion now. This suite listed it
   * among the buckets that must be reachable, and went on failing for the
   * shipped behaviour the whole time it was out of CI.
   */
  chk(
    !/\bOther\b/i.test(controls),
    'and Other is gone (§2.2)',
    `Other is back among the inbox controls: ${controls.replace(/\s+/g, ' ').slice(0, 120)}`,
  )

  /*
   * §2.5 — the one-move action is "Clear all", not "Mark all read": clearing
   * is what she asked for, and the row carries a retention clock afterwards.
   * The old copy never existed after that change landed.
   */
  if (NOTIFIED) {
    // By testid rather than by scanning the page for the words "Clear all" —
    // same reason as the controls row above, and it survives the copy being
    // translated.
    chk(
      (await page.getByTestId('inbox-clear-all').count()) > 0,
      'the inbox can be cleared in one move',
      'no Clear all',
    )
    /*
     * §G10-12 — and it is STILL there once nothing is unread.
     *
     * Clear all used to be nested inside the "you have N new" block, so it
     * disappeared the moment you read your mail. That is the inbox that most
     * wants emptying: two hundred rows you have already been through, and the
     * button gone precisely because you went through them. Reading and clearing
     * are different questions and the control must not be gated on the wrong
     * one.
     */
    if (API) {
      /*
       * The rows that were unread are recorded and PUT BACK afterwards.
       *
       * An earlier fixture in this suite emptied the top bar for every later
       * suite and cost two CI runs to find; the lesson stuck. Marking every
       * notification read is a global change to this account, and leaving it
       * that way makes the very check above — which needs something unread —
       * fail on the next run for a reason that has nothing to do with the code.
       */
      const before = (await API('/notifications?unreadOnly=true')).data ?? []
      await API('/notifications/mark-all-read', { method: 'POST' })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      chk(
        (await page.getByTestId('inbox-clear-all').count()) > 0,
        'and Clear all survives having read everything',
        'Clear all vanished once nothing was unread',
      )
      for (const n of before) {
        await API(`/notifications/${n.id}/unread`, { method: 'POST' }).catch(() => {})
      }
      const after = (await API('/notifications?unreadOnly=true')).data ?? []
      chk(
        after.length === before.length,
        'and the check left the inbox exactly as it found it',
        `unread was ${before.length}, is now ${after.length}`,
      )
    }
  } else {
    // Said out loud, not skipped silently: the control is correctly absent on
    // an empty inbox, so with nothing to clear this check cannot be answered.
    console.log('  \x1b[2mSKIP  no notification could be arranged — "Clear all" not checked\x1b[0m')
  }

  /*
   * §2.2 — the gear opens "Customize Inbox", not just an importance list.
   *
   * The frame audit names the drawer's contents: "Show All tab, Group by date,
   * Sort by newest first, Display mode". We had the importance list she walks
   * into *through* that drawer, and none of the three settings the drawer is
   * named for.
   *
   * Driven rather than looked at. Each of these has an obvious way to be a lie
   * — a checkbox that redraws itself and changes no rows, or one that changes
   * rows and forgets by the next visit — so the checks read the list back and
   * then read the server back.
   */
  ref('A2.6b', 'The gear opens Customize Inbox: grouping, order and density')
  await rootApi('/notifications/preferences', {
    method: 'POST',
    body: { inboxView: { groupByDate: true, sortNewestFirst: true, density: 'comfortable' } },
  }).catch(() => {})
  await go(`/app/${WS}/inbox?filter=primary`, 3200)

  const gear = page.getByTestId('primary-customise')
  chk(await gear.isVisible().catch(() => false), 'the gear is on the Primary tab', 'no gear on Primary')
  /*
   * Reopened before every interaction rather than assumed open. Each `go()`
   * below is a real page load, which closes the drawer — and a click into a
   * closed drawer fails as a 30s timeout that reads like the control being
   * broken rather than like the check losing its place.
   */
  const openDrawer = async () => {
    if (await page.getByTestId('primary-customise-panel').isVisible().catch(() => false)) return
    // The gear only renders on Primary, so get there before reaching for it.
    if (!(await page.getByTestId('primary-customise').isVisible().catch(() => false))) {
      await go(`/app/${WS}/inbox?filter=primary`, 3000)
    }
    await page.getByTestId('primary-customise').click().catch(() => {})
    await page.waitForTimeout(700)
  }
  await openDrawer()
  for (const [id, what] of [
    ['inbox-group-by-date', 'Group by date'],
    ['inbox-sort-newest', 'Sort by newest first'],
    ['inbox-density-compact', 'a display mode'],
  ]) {
    chk(
      await page.getByTestId(id).isVisible().catch(() => false),
      `${what} is in the drawer`,
      `${what} is missing from Customize Inbox`,
    )
  }

  /*
   * Read the instants the rows are ordered by, not their text.
   *
   * Two earlier versions of this were wrong in instructive ways. Comparing the
   * top row's text says nothing about direction and agrees with itself when
   * there is one row. Comparing the whole sequence against its own reverse is
   * too strict: `sort` is stable, so rows sharing a timestamp keep their
   * relative order in BOTH directions and an exact reversal never happens.
   *
   * The promise being made is "newest first", so the check reads the timestamps
   * and asks whether they run the way the setting says. Ties are allowed to sit
   * either way round, because nothing has promised otherwise.
   */
  const rowTimes = async () =>
    (await page.locator('[data-testid^="notif-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-created')),
    ))
      .filter(Boolean)
      .map((t) => new Date(t).getTime())

  const runsDown = (xs) => xs.every((v, i) => i === 0 || xs[i - 1] >= v)
  const runsUp = (xs) => xs.every((v, i) => i === 0 || xs[i - 1] <= v)
  const dateBuckets = () => page.locator('[data-testid^="inbox-bucket-"]').count()
  const ungrouped = () => page.locator('[data-testid="inbox-ungrouped"]').count()

  const seeded = await ensureTwoNotifications()
  chk(seeded >= 2, `there are at least two notifications to reorder (${seeded})`,
    `only ${seeded} notification(s) — an order check needs two`)

  /*
   * The rows are read on All, not Primary.
   *
   * The gear lives on Primary, so the drawer has to be opened there — but
   * Primary shows only the types in the user's set, and rows about the same
   * entity collapse into one. Reading the order there made the check depend on
   * both, and it failed in CI with "2 notifications, 1 row on screen" while the
   * feature worked. All hides nothing, and the settings are claimed to apply to
   * every tab, so reading them here checks that claim too.
   */
  const readOn = `/app/${WS}/inbox?filter=all`
  await go(readOn, 3200)

  const newestFirst = await rowTimes()
  const groupedCount = await dateBuckets()
  chk(groupedCount > 0 && (await ungrouped()) === 0, 'by default the rows sit under date headers',
    `buckets=${groupedCount} ungrouped=${await ungrouped()}`)
  chk(
    newestFirst.length >= 2,
    `the list has rows to order (${newestFirst.length})`,
    `${seeded} notification(s) exist but only ${newestFirst.length} row(s) render — ` +
      'they are grouping onto one row, or the view is hiding them',
  )
  chk(
    runsDown(newestFirst),
    'and by default they run newest first',
    `the default order is not newest-first: ${newestFirst.map((t) => new Date(t).toISOString()).join(' / ')}`,
  )

  if (newestFirst.length >= 2) {
    // Turning the sort off has to change which row is on top. A checkbox that
    // only changes its own tick is the whole defect class this audit is about.
    await openDrawer()
    await page.getByTestId('inbox-sort-newest').click()
    await page.waitForTimeout(1600)
    await go(readOn, 3200)
    const oldestFirst = await rowTimes()
    chk(
      runsUp(oldestFirst) && oldestFirst.length >= 2,
      'turning off "newest first" puts the oldest at the top',
      `the timestamps do not run oldest-first: ${oldestFirst.map((t) => new Date(t).toISOString()).join(' / ')}`,
    )
    // ...and survived a reload, which is what "stored" means.
    // `apiClient` returns { status, data, error }, so the preferences are one
    // level down. Reading `stored.inboxView` gave undefined, which is
    // indistinguishable from "the server did not store it" — the check failed
    // while the feature worked.
    const stored = (await rootApi('/notifications/preferences').catch(() => null))?.data
    chk(
      stored?.inboxView?.sortNewestFirst === false,
      'and the server remembers the choice',
      `server says ${JSON.stringify(stored?.inboxView ?? null)}`,
    )

    await openDrawer()
    await page.getByTestId('inbox-group-by-date').click()
    await page.waitForTimeout(1600)
    await go(readOn, 3200)
    chk(
      (await dateBuckets()) === 0 && (await ungrouped()) === 1,
      'turning off "group by date" removes the date headers',
      `buckets=${await dateBuckets()} ungrouped=${await ungrouped()}`,
    )
  } else {
    chk(false, 'turning off "newest first" puts the oldest at the top', 'not enough rows')
    chk(false, 'and the server remembers the choice', 'not enough rows')
    chk(false, 'turning off "group by date" removes the date headers', 'not enough rows')
  }

  // Put it back, so the rest of this suite and every other one see the inbox
  // they expect.
  await rootApi('/notifications/preferences', {
    method: 'POST',
    body: { inboxView: { groupByDate: true, sortNewestFirst: true, density: 'comfortable' } },
  }).catch(() => {})

  ref('A2.9', 'Replies get their own route, with unread against read')
  await go(`/app/${WS}/replies`, 3500)
  const replies = await seen()
  for (const state of ['Unread', 'Read', 'All']) {
    chk(new RegExp(`\\b${state}\\b`, 'i').test(replies), `${state} is a sub-tab`, `no ${state} sub-tab on replies`)
  }
  await go(`/app/${WS}/replies?filter=read`, 3000)
  chk(page.url().includes('filter=read'), 'and the sub-tab is addressable — a read reply survives a reload',
    'the replies filter is not in the URL')

  // ══════════════════════════════════════════════════════════ A3 chat ════
  area('A3 — Chat')

  await go(`/app/${WS}/chat`, 4000)
  const chat = await seen()

  ref('A3.4', 'Channels and DMs are separate, named groups')
  chk(/Channels/i.test(chat) && /Direct messages/i.test(chat),
    'the sidebar separates channels from DMs', 'channels and DMs are not separated')

  ref('A3.5', 'Ask AI opens a prompt rather than rewriting the draft')
  const ta = page.locator('textarea:visible').first()
  if (await ta.count()) {
    await ta.fill('we need to shipp this featur by friday pls')
    const before = await ta.inputValue()
    const composer = page.locator('div').filter({ has: page.locator('textarea') }).last()
    const askAi = composer.getByRole('button', { name: /Ask AI/i }).first()
    chk(await askAi.count() > 0, 'the composer has an Ask AI control', 'no Ask AI in the composer')
    if (await askAi.count()) {
      await askAi.click()
      await page.waitForTimeout(1600)
      const pop = await seen()
      chk(/Improve/i.test(pop) && /Shorten/i.test(pop),
        'it offers modes to choose from', 'the AI popover offers no modes')
      chk((await ta.inputValue()) === before,
        'the draft is untouched until a mode is picked', 'opening the prompt already rewrote the draft')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    ref('A3.6', 'The link picker has Tasks / Docs / Channels')
    const link = page.getByRole('button', { name: /Link a task, doc or channel/i }).first()
    chk(await link.count() > 0, 'there is a link control in the toolbar', 'no link control')
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(1500)
      const picker = await seen()
      for (const tab of ['Tasks', 'Docs', 'Channels']) {
        chk(new RegExp(tab, 'i').test(picker), `the ${tab} tab is offered`, `no ${tab} tab`)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
  } else {
    bad('no composer on the chat page')
  }

  ref('A3.9', 'A DM gets Chat / Calendar / Tasks; a channel does not')
  const strip = () => page.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })
  chk(await strip().count() === 0, 'a channel has no tab strip', 'a channel showed DM tabs')
  const dmRow = page.getByText(DM_NAME, { exact: true }).first()
  if (await dmRow.count()) {
    await dmRow.click()
    await page.waitForTimeout(2500)
    chk(await strip().count() === 3, 'a DM shows all three tabs', `saw ${await strip().count()} tabs`)
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await page.waitForTimeout(2000)
    chk(/Meetings with/i.test(await seen()), 'Calendar names whose meetings these are', 'no Calendar heading')
    chk(await page.locator('textarea:visible').count() === 0,
      'the composer steps out of the way', 'the composer is still showing under Calendar')
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    await page.waitForTimeout(2000)
    chk(/Open tasks with/i.test(await seen()), 'Tasks names whose tasks these are', 'no Tasks heading')
  } else {
    bad('no DM in the sidebar to test the tab strip against')
  }

  // ═════════════════════════════════════════════════════════ A4 admin ════
  area('A4 — Admin')

  ref('A4.4', 'One settings console, grouped')
  await go(`/app/${WS}/settings`, 3500)
  const settings = await seen()
  const tabs = ['Members', 'Security', 'Spaces', 'Groups', 'Roles', 'Work schedule', 'Features', 'Labels']
  const present = tabs.filter((x) => new RegExp(x, 'i').test(settings))
  chk(present.length >= 5, `settings groups ${present.join(', ')}`, `only ${present.length} settings groups found`)

  ref('A4.10', 'Work schedule is editable, not just stored')
  await page.getByRole('button', { name: 'Work schedule', exact: true }).click()
  await page.waitForTimeout(3000)
  const sched = await seen()
  chk(/Monday|Mon\b/i.test(sched) && /Holiday/i.test(sched),
    'the schedule offers work days and holidays', `the schedule tab reads: ${sched.slice(0, 140)}`)

  ref('A4.6', 'Trash, with what it was and who deleted it')
  await go(`/app/${WS}/settings`, 3500)
  await page.getByRole('button', { name: 'Trash', exact: true }).click().catch(() => {})
  await page.waitForTimeout(3000)
  const trash = await seen()
  /*
   * A4.6 is "what it was, where it was, and who deleted it" — so the columns
   * are the claim, and they render whether or not anything is in there.
   *
   * This used to look for the word "Restore" or the word "empty", and found
   * neither on a working screen: Restore lives inside the row's ⋯ menu, and
   * the empty state reads "Nothing in the trash." It then printed the first
   * 140 characters of the page, which are all sidebar, so the failure looked
   * like the tab had not opened at all.
   */
  chk(/Deleted on/i.test(trash) && /Deleted by/i.test(trash),
    'trash says what was deleted and who deleted it', `no deleted-on/by columns: ${trash.slice(0, 200)}`)
  chk(/deleted forever after \d+ days/i.test(trash),
    'and how long it keeps things', 'the retention notice is missing')
  /*
   * TESTIDS, NOT GLYPHS — and this one failed on a tree with nothing wrong.
   *
   * It read `/Nothing in the trash/ || /\bRestore\b/ || /⋯|More/` over the
   * page text, and passed for months because the lane's trash was EMPTY, so
   * the first branch matched. Once other suites had created and deleted their
   * own fixtures the empty state went away, and with rows present none of the
   * three matched: the row's action is a lucide icon, so `innerText` carries
   * no `⋯` and no "More", and Restore lives inside the menu that icon opens.
   *
   * So the check reported "no rows to act on" about a tab full of rows with
   * actions — a check failing for a reason that is not the code, and one that
   * would have gone on passing forever on a lane nobody else used.
   * `trash-empty` and `trash-row` are both already in `trash-tab.tsx`; the
   * claim is "one of these two states is on screen", and that is what it now
   * asks.
   */
  const trashRows = await page.locator('[data-testid="trash-row"]').count()
  const trashEmpty = await page.locator('[data-testid="trash-empty"]').count()
  const rowActions = trashRows
    ? await page.locator('[data-testid^="trash-actions-"]').count()
    : 0
  chk(
    (trashRows > 0 && rowActions === trashRows) || (trashRows === 0 && trashEmpty === 1),
    'with rows to act on, or an honest empty state',
    `${trashRows} row(s) carrying ${rowActions} action control(s), and ${trashEmpty} empty-state ` +
      'cell — a row you cannot act on is the dead control, and no rows with no empty state is a ' +
      'table that rendered nothing and said nothing',
  )

  ref('A4.11', 'Reports-to is set where members are managed')
  await go(`/app/${WS}/settings`, 3500)
  await page.getByRole('button', { name: 'Members', exact: true }).click().catch(() => {})
  await page.waitForTimeout(3000)
  const mem = await seen()
  chk(/Manager|Reports to/i.test(mem), 'a reporting line is offered on a member',
    `the members tab reads: ${mem.slice(0, 140)}`)

  // ══════════════════════════════════════════ A5 forms/docs/reports ════
  area('A5 — Forms, docs, dashboards, reports')

  ref('A5.1', 'A form says which list it feeds')
  await go(`/app/${WS}/forms`, 3500)
  chk(/Form/i.test(await seen()), 'the forms page renders', 'the forms page did not render')

  ref('A5.2', 'Docs')
  await go(`/app/${WS}/docs`, 3500)
  chk(/Doc/i.test(await seen()), 'the docs page renders', 'the docs page did not render')

  /*
   * The route is `dashboard`, singular.
   *
   * This asked for `/dashboards` and passed anyway, for two compounding
   * reasons. There is no literal `dashboards` route, so the URL fell through to
   * `$spaceId` and rendered the SPACE page with the id "dashboards" — which
   * then asked the API for `/projects/space/dashboards` and `/lists/space/
   * dashboards`, leaving `invalid input syntax for type uuid: "dashboards"` all
   * over the CI Postgres log. And the check could not notice, because
   * `/Dashboard|Widget/` against the whole document is satisfied by the word
   * "Dashboards" in the sidebar — on every page in the app, including this
   * wrong one.
   *
   * So: the right address, and a check that only the dashboards page can pass.
   */
  ref('A5.3', 'Dashboards')
  await go(`/app/${WS}/dashboard`, 3500)
  chk(
    (await page.getByTestId('dashboard-page').count()) > 0,
    'the dashboards page renders',
    `the dashboards page did not render — landed on ${page.url()}`,
  )

  ref('A5.7', 'Reporting')
  await go(`/app/${WS}/reports`, 4000)
  chk(/Report|Overview|Completion/i.test(await seen()), 'the reports page renders', 'the reports page did not render')

  ref('A4.12', 'Workload')
  await go(`/app/${WS}/workload`, 4000)
  const workload = await seen()
  chk(/Workload|Capacity/i.test(workload), 'the workload page renders', 'the workload page did not render')

  // ═══════════════════════════════════════════════════ A6 AI surface ════
  area('A6 — AI and meetings')

  ref('A6.4', 'AI is docked and reachable from anywhere')
  await go(`/app/${WS}`, 3000)
  const dock = page.locator('button[aria-label*="AI" i], button[title*="AI" i]').first()
  chk(await dock.count() > 0, 'the AI dock is on screen outside the AI page', 'no global AI affordance')

  /*
   * G13-10 [18:33–18:36] — the assistant says what it is reading.
   *
   * Her frames show retrieval steps before any answer: "Checking what you're
   * working on", "Checking the latest Skills basics". Ours showed a blinking
   * caret, so a turn spending seconds inspecting a real workspace looked
   * identical to one doing nothing.
   *
   * Its OWN context, for two reasons that both cost a debugging round:
   *
   *  - `serviceWorkers: 'block'`. The PWA worker serves from its own cache and
   *    steps around page.route entirely, so the stubs below were silently
   *    ignored and the real (unavailable) answers came through. Blocking it
   *    for the whole suite would change the environment of forty other checks;
   *    a separate context changes nothing outside this one.
   *  - two endpoints are stubbed, both environment facts rather than the
   *    behaviour under test: /ai/chat needs an Anthropic key this box does not
   *    have, and /ai/status decides whether the composer is even ENABLED —
   *    with no key the panel correctly disables it, so nothing could ever be
   *    sent and the trace could not appear however well it worked.
   *
   * The server half — that a step is written immediately before the work it
   * names, and never for work that was skipped — is covered without a key by
   * apps/api/src/modules/ai/chat-trace.test.ts.
   */
  ref('G13-10', 'the assistant says what it is reading, before it answers')
  {
    const aiCtx = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      serviceWorkers: 'block',
    })
    const aiPage = await aiCtx.newPage()
    await aiPage.route('**/api/v1/ai/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: true }, error: null }),
      }),
    )
    await aiPage.route('**/api/v1/ai/chat', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body:
          `data: ${JSON.stringify({ step: 'workspace' })}\n\n` +
          `data: ${JSON.stringify({ step: 'writing' })}\n\n` +
          `data: ${JSON.stringify({ delta: 'You have three tasks due today.' })}\n\n` +
          // G13-9 — the follow-ups frame the server emits once it has stripped
          // the marker off the completion. The client never sees the marker.
          `data: ${JSON.stringify({ followUps: ['Show me the overdue one', 'Move it to tomorrow'] })}\n\n` +
          'data: [DONE]\n\n',
      }),
    )

    await aiPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await aiPage.fill('input[type=email]', EMAIL)
    await aiPage.fill('input[type=password]', PASSWORD)
    await aiPage.click('button[type=submit]')
    await aiPage.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await aiPage.goto(`${BASE}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await aiPage.waitForTimeout(3500)

    /*
     * EIGHT CHECKS, WHICHEVER WAY THIS GOES — AND IT USED TO BE THREE, FOUR OR
     * SEVEN, DEPENDING ON THE BRANCH.
     *
     * This chain is written so a missing entry point reports a cause and then
     * says plainly that the rest could not be evaluated, rather than passing
     * vacuously or throwing. That instinct was right and the arithmetic was
     * not: the no-toggle branch emitted 3 checks, composer-disabled emitted 4,
     * and the full path 7 — one of which ("the AI dock can be opened") existed
     * ONLY in the no-toggle branch, so the path that actually clicked the dock
     * never asserted it was there.
     *
     * `EXPECTED_CHECKS` is compared with `!==`, so any short branch makes the
     * suite exit 1 with `✗ 88 of 92 checks ran` — and that is the headline a
     * real regression produces. `vr-4-the-ai-dock-is-only-on-the-ai-page`
     * removes the dock handle: the three FAIL lines were right there, under a
     * summary declaring the RUN broken rather than the product. A person
     * reading that reaches for the harness.
     *
     * So the sentences live in one list, each branch reports the one it
     * reached, and whatever is left over is reported as failed with the reason
     * the chain stopped. Eight by construction — a branch that forgets a check
     * cannot shorten the run, it fails that check with its own sentence.
     */
    const G13 = [
      ['the AI dock can be opened', 'no ai-dock-toggle on the top bar'],
      ['the AI composer is usable once the model is available', 'the composer stayed disabled'],
      ['the answer arrives', 'the answer never rendered'],
      ['and the trace of what it read stays with it', 'no trace survived the answer'],
      ['naming the workspace read the server reported', 'the workspace step never rendered'],
      ['and the answer offers next steps drawn from it', 'no follow-up chips under the answer'],
      ['phrased as something you could say back', 'the chip did not read as something to say'],
      ['and clicking one actually asks it', 'the chip did not send its suggestion'],
    ]
    let emitted = 0
    const g13 = (cond, why) => {
      const [good, bad] = G13[emitted++]
      chk(cond, good, why ?? bad)
    }
    let stopped = ''
    await (async () => {
      const aiToggle = aiPage.getByTestId('ai-dock-toggle')
      const haveToggle = (await aiToggle.count()) > 0
      g13(haveToggle)
      if (!haveToggle) return (stopped = 'skipped: there was no dock handle to open')

      await aiToggle.click()
      await aiPage.waitForTimeout(1500)
      const composer = aiPage.locator('input[placeholder*="Ask Rundesk" i]').first()
      // Asserted rather than assumed: with no key the composer is disabled,
      // and `fill` would then time out 30s into a failure whose message says
      // nothing about why.
      const enabled = !(await composer.isDisabled().catch(() => true))
      g13(enabled)
      if (!enabled) return (stopped = 'skipped: the composer never became usable')

      await composer.fill('what am I working on?')
      await composer.press('Enter')
      const answered = await aiPage
        .locator('text=You have three tasks due today.')
        .first()
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      g13(answered)
      /*
       * Read AFTER the answer, on purpose. A first version looked while the
       * turn was still streaming and found nothing, because the trace was
       * transient — which meant a fast turn showed no trace at all, exactly
       * when you would want to check whether it read your data. The trace
       * now belongs to the message and stays with it.
       */
      g13((await aiPage.getByTestId('ai-trace').count()) > 0)
      g13((await aiPage.getByTestId('ai-trace-step-workspace').count()) > 0)

      /*
       * G13-9 [18:42] — "Follow ups", under the answer they came from.
       *
       * Ours were a static five-item menu shown only while the thread was
       * empty, so the moment you asked anything the guided path vanished —
       * and she drives the whole demo by clicking one of these.
       */
      const chip = aiPage.locator('[data-testid^="ai-followup-"]').first()
      const haveChip = (await chip.count()) > 0
      g13(haveChip)
      if (!haveChip) return (stopped = 'skipped: there was no chip to read or click')

      g13(
        (await chip.innerText()).trim() === 'Show me the overdue one',
        await chip.innerText().catch(() => '(unreadable)'),
      )
      // A chip that does not ask the question is a label.
      await chip.click()
      await aiPage.waitForTimeout(2000)
      g13((await aiPage.locator('text=Show me the overdue one').count()) >= 2)
    })()
    while (emitted < G13.length) g13(false, stopped || 'skipped: the chain stopped earlier')
    await aiCtx.close()
  }

  ref('A6.1', 'A meeting can be recorded and reopened')
  await go(`/app/${WS}/ai`, 3500)
  const notesTab = page.getByRole('button', { name: 'Meeting notes', exact: true })
  chk(await notesTab.count() > 0, 'the Meeting notes tab exists', 'no Meeting notes tab')
  if (await notesTab.count()) {
    await notesTab.click()
    await page.waitForTimeout(2500)
    const notes = await seen()
    chk(/Meeting record/i.test(notes), 'the meeting record panel is there', 'no meeting record panel')
    chk(/Who was there/i.test(notes), 'attendees are part of the record', 'no attendee picker')
    chk(/Recording link/i.test(notes), 'so is the recording', 'no recording field')

    ref('A6.2b', 'It does not claim to transcribe')
    chk(/does not transcribe/i.test(notes),
      'the panel says plainly that calls are not transcribed',
      'nothing tells the user transcription is not happening')
  }

  ref('A6.9', 'Clips')
  await go(`/app/${WS}/clips`, 3500)
  const clips = await seen()
  chk(/Clip/i.test(clips), 'the clips page renders', 'the clips page did not render')
  chk(!/auto[- ]?transcri/i.test(clips), 'and does not promise auto-transcription',
    'the clips page still claims clips are transcribed automatically')
} catch (e) {
  bad(`threw: ${e.message}`)
  await page.screenshot({ path: '/tmp/video-regression-fail.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

console.log(`\n${'═'.repeat(66)}`)
const failed = results.filter(([, pass]) => !pass)
if (failed.length) {
  console.log('\x1b[31mFAILURES\x1b[0m')
  for (const [r, , m] of failed) console.log(`  [${r}] ${m}`)
  console.log('═'.repeat(66))
}
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
/*
 * "0 failed" is not "it ran". Compared with `!==` and never `<`: with `<`, a
 * branch that silently skipped becomes a shorter run that still reports zero
 * failures and exits 0. Ninety-three checks walking the whole product is a lot
 * of places to stop quietly. Observed from a green run, not guessed — the
 * ninth and last suite in this directory to get one.
 *
 * 92 → 93 WHEN THE G13-10 CHAIN STOPPED CHANGING LENGTH. Its three branches
 * reported three, four and seven checks, so a real regression in the AI dock
 * made this line declare the RUN broken instead of the product — and "the AI
 * dock can be opened" was asserted only on the branch where there was no dock
 * to open. It reports eight on every path now, one of which is new. See the
 * block itself: this constant moving is the visible half of that fix.
 */
const EXPECTED_CHECKS = 93
if (results.length !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${results.length} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped ` +
      'early, so the count above describes the part it reached and nothing else.',
  )
  process.exit(1)
}
await stack?.close?.()
process.exit(failed.length ? 1 : 0)
