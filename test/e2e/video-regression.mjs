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
import { makeChain } from './lib/chain.mjs'
import { waitUntil } from './lib/wait.mjs'
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
/*
 * A COUNTED SKIP, for a gate on the INVOCATION rather than on the product.
 *
 * `API` is only set when this suite discovered the workspace itself; given
 * `WS` in the environment it has no client, so neither the notification the
 * three "Clear all" checks need nor the inbox's put-back can be arranged. That
 * made the run's LENGTH depend on how it was invoked — and `EXPECTED_CHECKS` is
 * compared with `!==`, so one of the two invocations had to be wrong about the
 * count.
 *
 * Pushed into `results` so the total is the same either way, and marked
 * `'skip'` rather than `true` so it cannot be read as a pass. Only the
 * machine, the deployment or the invocation may skip; a skip reachable by a
 * product regression is a check that cannot fail. It is the chain's skip
 * too, so `skipRest` reports the Clear-all chain this way.
 */
const skip = (m, why) => {
  results.push([REF, 'skip', m])
  console.log(`  \x1b[2mSKIP\x1b[0m [${REF}] ${m} — ${why}`)
}

/*
 * A CHAIN THAT REPORTS THE SAME NUMBER OF CHECKS WHICHEVER WAY IT GOES.
 *
 * `EXPECTED_CHECKS` is compared with `!==`, so an `if` whose body calls `chk()`
 * and which has no `else` makes a regression read as the harness breaking. The
 * G13-10 block below is where that was found — see its own comment — and this
 * file had eight more of the shape. See `test/e2e/lib/chain.mjs`.
 */
const chain = makeChain(chk, skip)
const ref = (r, what) => { REF = r; console.log(`\n\x1b[1;36m▶ ${r}\x1b[0m  ${what}`) }
const area = (n) => console.log(`\n\x1b[1;35m${'═'.repeat(66)}\n  ${n}\n${'═'.repeat(66)}\x1b[0m`)

const browser = await chromium.launch(launchOptions())
// Nothing is routed on this context (the AI section opens its own, which
// blocks), so the worker is the product's, as a user has it.
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'allow' })).newPage()

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
  const plusMenu = chain(
    'there is a New button in the topbar',
    'the menu offers Task',
    'the menu offers Doc',
    'the menu offers List',
  )
  const haveNew = (await newBtn.count()) > 0
  plusMenu.step(haveNew, 'no New button')
  if (!haveNew) {
    plusMenu.rest('skipped: there was no New button to open a menu from')
  } else {
    await newBtn.click()
    await page.waitForTimeout(1200)
    const menu = await seen()
    for (const item of ['Task', 'Doc', 'List']) {
      plusMenu.step(new RegExp(item, 'i').test(menu), `the menu has no ${item}`)
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
  // Workspace → space → project → list. The space page links to projects, not
  // straight to lists, so this is three hops rather than two.
  const firstHrefOfDepth = (depth) =>
    page.locator('a[href]').evaluateAll((as, { u, d }) => {
      const re = new RegExp(`^/app/${u}${`/${u}`.repeat(d)}$`)
      return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
    }, { u: UUID, d: depth })
  /*
   * EACH HOP'S LINK IS WAITED FOR ON THE PAGE THAT DRAWS IT, not read a fixed
   * 3.5 seconds after landing. Under a sweep's load the space page had not drawn
   * its projects by then, and this reported "no list reachable from the space
   * page" twice (`found-24-sep/three-suites-fail-under-a-full-sweep`). Bounded:
   * a page that never links onward still ends at the same failure below.
   */
  const hrefOfDepthOnceDrawn = async (depth) => {
    let href = null
    await waitUntil(async () => (href = await firstHrefOfDepth(depth)) !== null, { timeoutMs: 20_000 })
    return href
  }
  const spaceHref = await hrefOfDepthOnceDrawn(1)

  let listHref = null
  if (spaceHref) {
    await page.goto(`${BASE}${spaceHref}`, { waitUntil: 'domcontentloaded' })
    const projectHref = await hrefOfDepthOnceDrawn(2)
    if (projectHref) {
      await page.goto(`${BASE}${projectHref}`, { waitUntil: 'domcontentloaded' })
      listHref = await hrefOfDepthOnceDrawn(3)
    }
  }
  /*
   * TWELVE CHECKS WHICHEVER WAY THIS GOES. Everything from here to A1.3 needs a
   * list to stand on, and with none reachable the else used to report ONE
   * `bad()` against the twelve below — so a space page that stopped linking
   * onward read as a run that stopped early. Declared up here so the else can
   * fill each chain with the reason.
   */
  const viewsOffered = chain(
    'the List view is offered',
    'the Board view is offered',
    'the Table view is offered',
    'the Calendar view is offered',
    'the Gantt view is offered',
  )
  const savedView = chain(
    'there is a control to save the current view',
    'and a saved view then sits in the tab strip',
    'under the name it was given',
  )
  const filterBuilder = chain('there is a Filter control', 'the builder offers')
  const inViewSearch = chain('the list has its own task search')
  const addGroup = chain('the board offers + Add group')
  if (listHref) {
    await go(listHref, 4500)
    const listPage = await seen()
    for (const v of ['List', 'Board', 'Table', 'Calendar', 'Gantt']) {
      viewsOffered.step(new RegExp(`\\b${v}\\b`).test(listPage), `no ${v} view`)
    }
    const addView = page.locator('button').filter({ hasText: /^View$/ }).last()
    const haveAddView = (await addView.count()) > 0
    savedView.step(haveAddView, 'no add-a-view control beside the tabs')
    if (!haveAddView) {
      savedView.rest('skipped: there was no control to save a view with')
    } else {
      // Make one rather than assume one is there. Naming is a window.prompt, so
      // it has to be answered before the click resolves.
      const viewName = `Team View ${Math.random().toString(36).slice(2, 8)}`
      page.once('dialog', (d) => d.accept(viewName))
      await addView.click()
      await page.waitForTimeout(3000)
      const savedTabs = await page.locator('button[title^="Actions for the"]').count()
      savedView.step(savedTabs > 0, 'the saved view did not appear as a tab',
        `and a saved view then sits in the tab strip (${savedTabs})`)
      savedView.step((await seen()).includes(viewName), `"${viewName}" is not in the tab strip`)
    }

    ref('A1.4', 'A filter builder, not three fixed fields')
    const filterBtn = page.getByRole('button', { name: /^Filter/i }).first()
    const haveFilter = (await filterBtn.count()) > 0
    filterBuilder.step(haveFilter, 'no Filter control on a list view')
    if (!haveFilter) {
      filterBuilder.rest('skipped: there was no Filter control to open a builder from')
    } else {
      await filterBtn.click()
      await page.waitForTimeout(1500)
      const f = await seen()
      const fields = ['Assignee', 'Priority', 'Due', 'Status'].filter((x) => new RegExp(x, 'i').test(f))
      filterBuilder.step(fields.length >= 3, `only ${fields.length} filter fields offered`,
        `the builder offers ${fields.join(', ')}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }

    ref('A1.4b', 'Search inside the view you are already in')
    inViewSearch.step(await page.getByPlaceholder(/Search tasks/i).count() > 0, 'no in-view task search')

    ref('A1.3', 'Board polish — label pills, inline rename, + Add group')
    const boardTab = page.getByRole('button', { name: /^Board$/ }).first()
    if (await boardTab.count()) {
      await boardTab.click()
      await page.waitForTimeout(3000)
      const board = await seen()
      addGroup.step(/Add group|New group/i.test(board), 'no add-group control on the board')
    } else {
      addGroup.rest('could not switch to the Board view')
    }
  } else {
    const why = 'no list reachable from the space page to test views against'
    viewsOffered.rest(why)
    savedView.rest(why)
    filterBuilder.rest(why)
    inViewSearch.rest(why)
    addGroup.rest(why)
  }

  // ═══════════════════════════════════════════════ A2 search & inbox ════
  area('A2 — Search and inbox')

  ref('A2.1', 'Search is also a command bar')
  await go(`/app/${WS}`)
  await page.keyboard.press('Control+k')
  // The palette's own box, once it is open — not a fixed 1.5 seconds, after
  // which the first visible input could be one the palette had not yet covered.
  await page.locator('[cmdk-input]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const palette = page.locator('input:visible').first()
  const cmdBar = chain(
    'Cmd/Ctrl-K opens a search box',
    'Ask AI is offered as the first move on a query',
    'a leading slash offers commands rather than results',
  )
  const havePalette = (await palette.count()) > 0
  cmdBar.step(havePalette, 'the command palette did not open')
  if (!havePalette) {
    cmdBar.rest('skipped: there was no search box to type into')
  } else {
    ref('A2.3', 'Ask AI from the search box')
    await palette.fill('regr')
    // The row the check reads, waited for (bounded) rather than 2.5 fixed
    // seconds after typing, which a sweep's load outran twice
    // (`found-24-sep/three-suites-fail-under-a-full-sweep`).
    await waitUntil(async () => /Ask AI/i.test(await seen()), { timeoutMs: 15_000 })
    const p = await seen()
    cmdBar.step(/Ask AI/i.test(p), 'no Ask AI row in search')

    ref('A2.1b', 'Slash puts it in command mode')
    await palette.fill('/')
    await page.waitForTimeout(1800)
    const cmds = await seen()
    cmdBar.step(/command/i.test(cmds) || /Create|Go to/i.test(cmds),
      'slash did not switch to commands')
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
   *
   * AN ABSENCE COUNTS ONLY WHERE THE THING COULD HAVE BEEN. `controls` is read
   * through `.catch(() => '')`, and '' holds no "Other" — so a page with no
   * controls row passed this. Other sat beside Primary in the filter group, so
   * the read has to have seen Primary there before Other's absence says anything.
   */
  const sawFilters = /\bPrimary\b/i.test(controls)
  chk(
    sawFilters && !/\bOther\b/i.test(controls),
    'and Other is gone (§2.2)',
    sawFilters
      ? `Other is back among the inbox controls: ${controls.replace(/\s+/g, ' ').slice(0, 120)}`
      : `the read did not see the filter group Other sat in (it read ${JSON.stringify(controls.replace(/\s+/g, ' ').slice(0, 120))}), ` +
          'so Other being absent from it says nothing',
  )

  /*
   * §2.5 — the one-move action is "Clear all", not "Mark all read": clearing
   * is what she asked for, and the row carries a retention clock afterwards.
   * The old copy never existed after that change landed.
   *
   * THREE CHECKS ON EVERY PATH, AND THE SKIP DECIDED BEFORE ANYTHING IS READ.
   * The decision used to sit inside `if (NOTIFIED)`, and NOTIFIED is only ever
   * set by the discovery block — the same block that sets `API`. So the counted
   * skips for a run given `WS` sat behind a condition that run could never meet:
   * it fell into an `else` that printed an uncounted SKIP and reported none of
   * the three, and so did a discovering run whose notification could not be
   * arranged — three checks short either way, under the headline that says the
   * RUN stopped early ("91 of 94 checks ran", measured on the second).
   *
   *   · given WS (no `API`): the INVOCATION — nothing can be arranged or put
   *     back — so all three are counted as skipped;
   *   · discovered, but `ensureNotification` came back null: arranging state
   *     through the product failed (the peer could not sign in, or its task or
   *     its assignment was refused), and a Clear all that renders only when
   *     there is something to clear cannot be asked about — all three FAIL,
   *     with that reason, because a skip reachable by the product is a check
   *     that cannot fail;
   *   · otherwise they run.
   */
  // `chk` prints only its reason on a failure, and `rest` gives all three the
  // same one — so each FAIL here names its own check first, or the three lines
  // would be indistinguishable.
  const clearAll = makeChain((c, g, b) => chk(c, g, `${g} — ${b}`), skip)(
    'the inbox can be cleared in one move',
    'and Clear all survives having read everything',
    'and the check left the inbox exactly as it found it',
  )
  if (!API) {
    // The invocation, not the product — see `skip` above.
    clearAll.skipRest('this run was given WS, so it has no API client to arrange a notification with or to put the inbox back')
  } else if (!NOTIFIED) {
    clearAll.rest(
      'no notification could be arranged (ensureNotification came back null: the peer could not sign in, ' +
        'or its task or its assignment was refused), so there was nothing for Clear all to clear',
    )
  } else {
    // By testid rather than by scanning the page for the words "Clear all" —
    // same reason as the controls row above, and it survives the copy being
    // translated.
    clearAll.step((await page.getByTestId('inbox-clear-all').count()) > 0, 'no Clear all')
    /*
     * §G10-12 — and it is STILL there once nothing is unread.
     *
     * Clear all used to be nested inside the "you have N new" block, so it
     * disappeared the moment you read your mail. That is the inbox that most
     * wants emptying: two hundred rows you have already been through, and the
     * button gone precisely because you went through them. Reading and clearing
     * are different questions and the control must not be gated on the wrong
     * one.
     *
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
    // The control is drawn with the inbox's rows, so it is waited for (bounded)
    // rather than counted 2.5 fixed seconds after the reload — the same shape
    // as [A1.2], and it missed the same way on a loaded machine.
    await page.getByTestId('inbox-clear-all').first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
    clearAll.step((await page.getByTestId('inbox-clear-all').count()) > 0, 'Clear all vanished once nothing was unread')
    // Judged by the count below; a refused one is named in its reason.
    const refused = []
    for (const n of before) {
      const res = await API(`/notifications/${n.id}/unread`, { method: 'POST' })
      if (res.status >= 300) refused.push(`${n.id}: ${res.status}`)
    }
    const after = (await API('/notifications?unreadOnly=true')).data ?? []
    clearAll.step(
      after.length === before.length,
      `unread was ${before.length}, is now ${after.length}${refused.length ? `; marking unread was refused for ${refused.join(', ')}` : ''}`,
    )
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
  const startedFrom = await rootApi('/notifications/preferences', {
    method: 'POST',
    body: { inboxView: { groupByDate: true, sortNewestFirst: true, density: 'comfortable' } },
  })
  if (startedFrom.status >= 300) {
    throw new Error(`could not start the inbox from date groups, newest first, comfortable: POST /notifications/preferences answered ${startedFrom.status}`)
  }
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

  // The three sentences once. The short path used to type all three again,
  // beside the checks that print them, with nothing to keep the copies alike.
  const inboxOrder = chain(
    'turning off "newest first" puts the oldest at the top',
    'and the server remembers the choice',
    'turning off "group by date" removes the date headers',
  )
  if (newestFirst.length >= 2) {
    // Turning the sort off has to change which row is on top. A checkbox that
    // only changes its own tick is the whole defect class this audit is about.
    await openDrawer()
    await page.getByTestId('inbox-sort-newest').click()
    // Stored before the page is read again: under load the save outlasts a
    // fixed wait, and the reload then draws the old order.
    await waitUntil(async () => (await rootApi('/notifications/preferences').catch(() => null))?.data?.inboxView?.sortNewestFirst === false, { timeoutMs: 10_000 })
    await go(readOn, 3200)
    await waitUntil(async () => runsUp(await rowTimes()), { timeoutMs: 8_000 })
    const oldestFirst = await rowTimes()
    inboxOrder.step(
      runsUp(oldestFirst) && oldestFirst.length >= 2,
      `the timestamps do not run oldest-first: ${oldestFirst.map((t) => new Date(t).toISOString()).join(' / ')}`,
    )
    // ...and survived a reload, which is what "stored" means.
    // `apiClient` returns { status, data, error }, so the preferences are one
    // level down. Reading `stored.inboxView` gave undefined, which is
    // indistinguishable from "the server did not store it" — the check failed
    // while the feature worked.
    const stored = (await rootApi('/notifications/preferences').catch(() => null))?.data
    inboxOrder.step(
      stored?.inboxView?.sortNewestFirst === false,
      `server says ${JSON.stringify(stored?.inboxView ?? null)}`,
    )

    await openDrawer()
    await page.getByTestId('inbox-group-by-date').click()
    await waitUntil(async () => (await rootApi('/notifications/preferences').catch(() => null))?.data?.inboxView?.groupByDate === false, { timeoutMs: 10_000 })
    await go(readOn, 3200)
    await waitUntil(async () => (await ungrouped()) === 1, { timeoutMs: 8_000 })
    inboxOrder.step(
      (await dateBuckets()) === 0 && (await ungrouped()) === 1,
      `buckets=${await dateBuckets()} ungrouped=${await ungrouped()}`,
    )
  } else {
    inboxOrder.rest(`skipped: ${newestFirst.length} row(s) on screen — ordering needs two`)
  }

  // Put it back, so the rest of this suite and every other one see the inbox
  // they expect — which makes a refusal this run's failure, not a shrug.
  const putBack = await rootApi('/notifications/preferences', {
    method: 'POST',
    body: { inboxView: { groupByDate: true, sortNewestFirst: true, density: 'comfortable' } },
  })
  chk(
    putBack.status < 300,
    'and the inbox is put back to date groups, newest first, for the suites after this one',
    `putting the inbox back was refused: POST /notifications/preferences answered ${putBack.status}, so every later suite sees this run's settings`,
  )

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
  /*
   * SEVEN CHECKS WHICHEVER WAY THIS GOES: with no composer the else used to
   * report one `bad()` against the Ask AI chain and the link picker's.
   */
  const composerAi = chain(
    'the composer has an Ask AI control',
    'it offers modes to choose from',
    'the draft is untouched until a mode is picked',
  )
  const linkPicker = chain(
    'there is a link control in the toolbar',
    'the Tasks tab is offered',
    'the Docs tab is offered',
    'the Channels tab is offered',
  )
  if (await ta.count()) {
    await ta.fill('we need to shipp this featur by friday pls')
    const before = await ta.inputValue({ timeout: 5000 }).catch(() => '')
    const composer = page.locator('div').filter({ has: page.locator('textarea') }).last()
    const askAi = composer.getByRole('button', { name: /Ask AI/i }).first()
    const haveAskAi = (await askAi.count()) > 0
    composerAi.step(haveAskAi, 'no Ask AI in the composer')
    if (!haveAskAi) {
      composerAi.rest('skipped: there was no Ask AI control to open a prompt from')
    } else {
      await askAi.click()
      await page.waitForTimeout(1600)
      const pop = await seen()
      composerAi.step(/Improve/i.test(pop) && /Shorten/i.test(pop), 'the AI popover offers no modes')
      composerAi.step((await ta.inputValue()) === before,
        'opening the prompt already rewrote the draft')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    ref('A3.6', 'The link picker has Tasks / Docs / Channels')
    const link = page.getByRole('button', { name: /Link a task, doc or channel/i }).first()
    const haveLink = (await link.count()) > 0
    linkPicker.step(haveLink, 'no link control')
    if (!haveLink) {
      linkPicker.rest('skipped: there was no link control to open a picker from')
    } else {
      await link.click()
      await page.waitForTimeout(1500)
      const picker = await seen()
      for (const tab of ['Tasks', 'Docs', 'Channels']) {
        linkPicker.step(new RegExp(tab, 'i').test(picker), `no ${tab} tab`)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
  } else {
    composerAi.rest('no composer on the chat page')
    linkPicker.rest('no composer on the chat page')
  }

  ref('A3.9', 'A DM gets Chat / Calendar / Tasks; a channel does not')
  const strip = () => page.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })
  chk(await strip().count() === 0, 'a channel has no tab strip', 'a channel showed DM tabs')
  const dmRow = page.getByText(DM_NAME, { exact: true }).first()
  // FOUR CHECKS WHICHEVER WAY THIS GOES: with no DM the else used to report
  // one `bad()` against the four the DM's tab strip reports.
  const dmTabs = chain(
    'a DM shows all three tabs',
    'Calendar names whose meetings these are',
    'the composer steps out of the way',
    'Tasks names whose tasks these are',
  )
  if (await dmRow.count()) {
    await dmRow.click()
    await page.waitForTimeout(2500)
    dmTabs.step(await strip().count() === 3, `saw ${await strip().count()} tabs`)
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await page.waitForTimeout(2000)
    dmTabs.step(/Meetings with/i.test(await seen()), 'no Calendar heading')
    dmTabs.step(await page.locator('textarea:visible').count() === 0, 'the composer is still showing under Calendar')
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    await page.waitForTimeout(2000)
    dmTabs.step(/Open tasks with/i.test(await seen()), 'no Tasks heading')
  } else {
    dmTabs.rest('no DM in the sidebar to test the tab strip against')
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
     *
     * THAT LIST IS `lib/chain.mjs` NOW. This block kept its own copy of the
     * helper — an `emitted` counter, a `stopped` reason and a `while` to fill
     * the remainder — which is the module's job, and which the module does
     * with one thing this copy lacked: a step past the last sentence throws
     * instead of reporting `undefined`.
     */
    const g13 = chain(
      'the AI dock can be opened',
      'the AI composer is usable once the model is available',
      'the answer arrives',
      'and the trace of what it read stays with it',
      'naming the workspace read the server reported',
      'and the answer offers next steps drawn from it',
      'phrased as something you could say back',
      'and clicking one actually asks it',
    )
    await (async () => {
      const aiToggle = aiPage.getByTestId('ai-dock-toggle')
      const haveToggle = (await aiToggle.count()) > 0
      g13.step(haveToggle, 'no ai-dock-toggle on the top bar')
      if (!haveToggle) return g13.rest('skipped: there was no dock handle to open')

      await aiToggle.click()
      await aiPage.waitForTimeout(1500)
      const composer = aiPage.locator('input[placeholder*="Ask Rundesk" i]').first()
      // Asserted rather than assumed: with no key the composer is disabled,
      // and `fill` would then time out 30s into a failure whose message says
      // nothing about why.
      const enabled = !(await composer.isDisabled().catch(() => true))
      g13.step(enabled, 'the composer stayed disabled')
      if (!enabled) return g13.rest('skipped: the composer never became usable')

      await composer.fill('what am I working on?')
      await composer.press('Enter')
      const answered = await aiPage
        .locator('text=You have three tasks due today.')
        .first()
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      g13.step(answered, 'the answer never rendered')
      /*
       * Read AFTER the answer, on purpose. A first version looked while the
       * turn was still streaming and found nothing, because the trace was
       * transient — which meant a fast turn showed no trace at all, exactly
       * when you would want to check whether it read your data. The trace
       * now belongs to the message and stays with it.
       */
      g13.step((await aiPage.getByTestId('ai-trace').count()) > 0, 'no trace survived the answer')
      g13.step((await aiPage.getByTestId('ai-trace-step-workspace').count()) > 0, 'the workspace step never rendered')

      /*
       * G13-9 [18:42] — "Follow ups", under the answer they came from.
       *
       * Ours were a static five-item menu shown only while the thread was
       * empty, so the moment you asked anything the guided path vanished —
       * and she drives the whole demo by clicking one of these.
       */
      const chip = aiPage.locator('[data-testid^="ai-followup-"]').first()
      const haveChip = (await chip.count()) > 0
      g13.step(haveChip, 'no follow-up chips under the answer')
      if (!haveChip) return g13.rest('skipped: there was no chip to read or click')

      // The MESSAGE read the chip through a catch and the CONDITION did not, so
      // an absent chip threw out of the assertion describing it — and the press
      // below was bare as well.
      const chipText = await chip.innerText({ timeout: 6000 }).catch(() => null)
      g13.step(chipText?.trim() === 'Show me the overdue one', chipText ?? '(unreadable)')
      // A chip that does not ask the question is a label.
      await chip.click({ timeout: 8000 }).catch(() => {})
      await aiPage.waitForTimeout(2000)
      g13.step(
        (await aiPage.locator('text=Show me the overdue one').count()) >= 2,
        'the chip did not send its suggestion',
      )
    })()
    await aiCtx.close()
  }

  ref('A6.1', 'A meeting can be recorded and reopened')
  await go(`/app/${WS}/ai`, 3500)
  const notesTab = page.getByRole('button', { name: 'Meeting notes', exact: true })
  const meetingNotes = chain(
    'the Meeting notes tab exists',
    'the meeting record panel is there',
    'attendees are part of the record',
    'so is the recording',
    'the panel says plainly that calls are not transcribed',
  )
  const haveNotesTab = (await notesTab.count()) > 0
  meetingNotes.step(haveNotesTab, 'no Meeting notes tab')
  if (!haveNotesTab) {
    meetingNotes.rest('skipped: there was no tab to open, so the panel was never on screen')
  } else {
    await notesTab.click()
    await page.waitForTimeout(2500)
    const notes = await seen()
    meetingNotes.step(/Meeting record/i.test(notes), 'no meeting record panel')
    meetingNotes.step(/Who was there/i.test(notes), 'no attendee picker')
    meetingNotes.step(/Recording link/i.test(notes), 'no recording field')

    ref('A6.2b', 'It does not claim to transcribe')
    meetingNotes.step(/does not transcribe/i.test(notes),
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
const failed = results.filter(([, pass]) => pass === false)
const skipped = results.filter(([, pass]) => pass === 'skip')
if (failed.length) {
  console.log('\x1b[31mFAILURES\x1b[0m')
  for (const [r, , m] of failed) console.log(`  [${r}] ${m}`)
  console.log('═'.repeat(66))
}
// `=== false`, not `!pass`: a counted skip is truthy and must not read as a
// failure, and the totals below must not read it as a pass either. The
// `N passed, M failed` prefix is kept exactly as it was because the harness
// parses it: `wt-break.sh` copies it into each break log, where
// `classify-break-log.awk` and `check-break-reddened.mjs` read it, and
// `verify.sh` and `local-sweep.mjs` read it off the run. (It used to say
// `break-queue.sh`, deleted in `d840b55`.)
console.log(
  `\n\x1b[1m${results.length - failed.length - skipped.length} passed, ${failed.length} failed` +
    `${skipped.length ? `, ${skipped.length} skipped` : ''}\x1b[0m`,
)
/*
 * "0 failed" is not "it ran". Compared with `!==` and never `<`: with `<`, a
 * branch that silently skipped becomes a shorter run that still reports zero
 * failures and exits 0. Ninety-four checks walking the whole product is a lot
 * of places to stop quietly. Observed from a green run, not guessed — the
 * ninth and last suite in this directory to get one.
 *
 * 92 → 93 WHEN THE G13-10 CHAIN STOPPED CHANGING LENGTH. Its three branches
 * reported three, four and seven checks, so a real regression in the AI dock
 * made this line declare the RUN broken instead of the product — and "the AI
 * dock can be opened" was asserted only on the branch where there was no dock
 * to open. It reports eight on every path now, one of which is new. See the
 * block itself: this constant moving is the visible half of that fix.
 *
 * 93 → 94 WHEN PUTTING THE INBOX BACK BECAME A CHECK. A2.6b's restore of the
 * admin's inbox settings, which every later suite reads, ended in
 * `.catch(() => {})` on a client that never throws on a status, so a refused
 * one was invisible. It is counted now, on every path.
 */
const EXPECTED_CHECKS = 94
if (results.length !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${results.length} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped ` +
      'early, so the count above describes the part it reached and nothing else.',
  )
  process.exit(1)
}
await stack?.close?.()
process.exit(failed.length ? 1 : 0)
