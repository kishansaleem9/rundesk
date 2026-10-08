/**
 * The fast items from docs/video1-rundesk-gap-audit.md, driven in a browser.
 *
 *   §1.3  the workspace sidebar collapses to icons
 *   §1.5  the language switcher is out of the top bar
 *   §2.2  the Inbox "Other" chip is gone
 *   §1.1  the create modal offers a task type, and search filters by one
 *
 * Each of these is a change you can convince yourself of by reading the diff
 * and be wrong about — a control removed from one file and still rendered from
 * another, a chip dropped from an array but still reachable by URL. So they are
 * checked against the built app.
 *
 *   node test/e2e/video1-fast-items.mjs [--dist <dir>]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { waitUntil } from './lib/wait.mjs'
import { makeChain } from './lib/chain.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const WEB = path.join(REPO, 'apps/web')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const { chromium } = (() => {
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return require_(id)
    } catch {
      /* next */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

const CHROME =
  process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] }

const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
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
 * A CHAIN THAT REPORTS THE SAME NUMBER OF CHECKS WHICHEVER WAY IT GOES.
 *
 * Fifteen `if`s in this file guarded follow-up checks with no `else` — more
 * than any other suite in the directory — so losing a control made the run
 * SHORTER rather than failing the checks that depend on it. `EXPECTED_CHECKS`
 * is compared with `!==`, so that reads as the harness breaking rather than
 * the feature being gone. See `test/e2e/lib/chain.mjs`.
 */
const chain = makeChain(check)
let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const USER = {
  id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin',
  role: 'owner', avatarUrl: null,
}
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [
      { id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' },
    ],
  },
  version: 0,
}

/**
 * Enough of the API for the shell and the surfaces under test to render.
 * Responses are enveloped: lib/api.ts returns `body.data` and rejects anything
 * without a `data` key, so a bare object reads as null and pages quietly render
 * nothing — which is what a first pass at this file did.
 */
const TASK_TYPES = [
  { id: 'tt-task', name: 'Task', icon: 'check', isDefault: true },
  { id: 'tt-milestone', name: 'Milestone', icon: 'flag', isDefault: false },
]
function stubBody(url) {
  // The create form will not submit without a list, so the whole
  // space -> project -> list chain has to answer.
  const data = url.includes('/users/me')
    ? USER
    // §14 — one unread and one already read, so the row treatments can be told
    // apart. Both are chat replies: her case is "aap bhi yahan reply karte ho".
    : /\/notifications(\?|$)/.test(url)
      ? [
          {
            id: 'n-unread',
            type: 'chat_message',
            title: 'New message in #general',
            body: 'a reply nobody has read',
            readAt: null,
            createdAt: new Date(0).toISOString(),
            target: { entityType: 'chat_message', entityId: 'm1', url: '/app/x/chat' },
          },
          {
            id: 'n-read',
            type: 'chat_message',
            title: 'New message in #random',
            body: 'a reply already read',
            readAt: new Date(0).toISOString(),
            createdAt: new Date(0).toISOString(),
            target: { entityType: 'chat_message', entityId: 'm2', url: '/app/x/chat' },
          },
        ]
    : url.includes('/notifications/preferences')
      ? { primaryTypes: ['task_mentioned', 'chat_message'] }
      : url.includes('/chat/saved')
        ? [
            {
              id: 'm1',
              channelId: 'c1',
              channelName: 'general',
              body: 'the one she starred',
              authorName: 'Sam',
              createdAt: new Date(0).toISOString(),
              savedAt: new Date(0).toISOString(),
            },
          ]
        : url.includes('/task-types')
          ? TASK_TYPES
      : url.includes('/plan')
        ? { label: 'Free', usage: { members: 2 } }
        : /\/spaces\/[^/]+\/folders$/.test(url.split('?')[0])
          ? [{ id: 'fo-1', name: 'Folder One' }]
        : url.includes('/spaces/workspace/')
          ? [{ id: 'sp-1', name: 'Space One' }]
          : url.includes('/projects/space/')
            ? [{ id: 'pr-1', name: 'Project One' }]
            : url.includes('/lists/project/')
              ? [{ id: 'li-1', name: 'List One' }]
              : url.endsWith('/tasks') || url.includes('/tasks?')
                ? { id: 'task-1' }
                : url.includes('/branding') || url.includes('/counts')
                  ? {}
                  : []
  return JSON.stringify({ data, error: null })
}

const browser = await chromium.launch(LAUNCH)
async function openApp(route = `/app/${WS}/inbox`, seed = {}, profile = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  })
  /** Every API call the app made, so a test can assert what it actually sent. */
  const calls = []
  // The profile is mutable, and a PATCH to it is applied. A stub that accepts a
  // write and then keeps answering with the old value is not a stand-in for the
  // server, it is a contradiction: the UI writes, re-reads, sees no change and
  // reverts — which is a test failure that says nothing about the app.
  const me = { ...USER, ...profile }
  await ctx.route('**/api/**', (route_) => {
    const request = route_.request()
    const body = request.postData() ?? ''
    calls.push({ method: request.method(), url: request.url(), body })
    if (request.method() === 'PATCH' && request.url().includes('/users/me')) {
      try {
        Object.assign(me, JSON.parse(body || '{}'))
      } catch {
        /* a malformed body is the test's problem, not the app's */
      }
      return route_.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: me, error: null }),
      })
    }
    if (request.url().includes('/users/me')) {
      return route_.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: me, error: null }),
      })
    }
    return route_.fulfill({
      status: 200,
      contentType: 'application/json',
      body: stubBody(request.url()),
    })
  })
  const page = await ctx.newPage()
  await page.addInitScript(
    (entries) => {
      for (const [k, v] of entries) window.localStorage.setItem(k, v)
    },
    [['rundesk.auth', JSON.stringify(SESSION)], ...Object.entries(seed)],
  )
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  return { ctx, page, calls }
}

// ---------------------------------------------------------------------------
console.log('\n§1.5  the language switcher is out of the top bar')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openApp()
  const header = page.locator('header').first()
  const inTopbar = await header.getByRole('combobox').count()
  // Unfiltered: an absence, where a hidden top bar read whole is the stricter read.
  const topbarText = await header.innerText({ timeout: 5000 }).catch(() => '') // text-read: absence — no language named in the top bar
  check(
    !/english|urdu|español|العربية/i.test(topbarText),
    'no language control in the top bar',
    topbarText.replace(/\n/g, ' ').slice(0, 80),
  )
  check(inTopbar === 0, 'and no select left behind either')

  // It has to still exist somewhere, or this is a deletion, not a move.
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const profileText = await page.evaluate(() => document.body.innerText)
  check(
    /language/i.test(profileText),
    'it is in personal settings instead — a move, not a deletion',
    profileText.slice(0, 100),
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§1.5  the notification bell — off by default, and a member can put it back')
// ---------------------------------------------------------------------------
{
  // "hum notification yahan le ke jaa rahe hain, to humein yahan bhi rakhne ki
  // zaroorat nahi hai … [Default par]" — and, if kept, "yeh option jo hai woh
  // humare members ke paas hona chahiye". Both halves, plus the general
  // complaint underneath them: "humare paas NAV BAR ko set down karne ka option
  // nahi hai".
  const { ctx, page, calls } = await openApp()
  const bell = page.locator('header [data-testid="notifications-bell"]')
  check((await bell.count()) === 0, 'the bell is not in the top bar by default')

  // The control she said does not exist.
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const toggle = page.locator('[data-testid="topbar-toggle-notifications"]')
  const bellPref = chain(
    'a member can configure the top bar from their profile',
    'and the bell shows as off there',
    'turning it on saves the preference to the member, not the browser',
    'and the bell is removed from the hidden set',
    'and the control reflects the saved state',
  )
  const haveToggle = (await toggle.count()) > 0
  bellPref.step(haveToggle, 'no top-bar control on the profile page')
  if (!haveToggle) {
    bellPref.rest('skipped: there was no control to read or click')
  } else {
    bellPref.step(!(await toggle.isChecked({ timeout: 5000 }).catch(() => false)), 'the bell already shows as on')
    const before = calls.length
    // click + wait, not .check(): .check() asserts the box is checked the
    // instant the click returns, which is a claim about round-trip latency
    // rather than about the control. It failed roughly two runs in five.
    await toggle.click({ timeout: 10_000 }).catch(() => {})
    await waitUntil(async () =>
      calls.slice(before).some((c) => c.method === 'PATCH' && c.body.includes('topbarHidden')),
    )
    const patches = calls.slice(before).filter((c) => c.method === 'PATCH')
    bellPref.step(patches.length > 0, calls.slice(before).map((c) => c.method).join(','))
    bellPref.step(
      patches.some((c) => {
        try {
          return !JSON.parse(c.body || '{}').topbarHidden?.includes('notifications')
        } catch {
          return false
        }
      }),
      patches.map((c) => c.body).join(' | ').slice(0, 120),
    )
    bellPref.step(await waitUntil(async () => await toggle.isChecked({ timeout: 5000 }).catch(() => false)), 'the control did not update')
  }
  await ctx.close()
}

// The bell is back on for a member who asked for it.
{
  const { ctx, page } = await openApp(
    `/app/${WS}/inbox`,
    { 'rundesk.auth': JSON.stringify({ ...SESSION, state: { ...SESSION.state, user: { ...USER, topbarHidden: [] } } }) },
    { topbarHidden: [] },
  )
  await page.waitForTimeout(1200)
  const bell = page.locator('header [data-testid="notifications-bell"]')
  check((await bell.count()) > 0, 'a member who turns it back on gets it back')

  /*
   * G04-3 [05:13–05:25] — the other half of the same sentence.
   *
   * "yeh option jo hai woh humare members ke paas hona chahiye, kyunke yahan
   * se set down kar sakein." Making the bell hideable answered "should it be
   * here at all"; this answers "and if it stays, I must be able to turn a
   * notification off from it". The preference matrix already existed and was
   * already member-accessible — it just had no door from the bell, so the
   * only way to stop a notification was to already know it lived on your
   * profile page.
   */
  await bell.click()
  await page.waitForTimeout(900)
  const gear = page.locator('[data-testid="bell-notification-settings"]')
  check((await gear.count()) > 0, 'and the bell offers a way to configure notifications from it')
  const href = (await gear.first().getAttribute('href', { timeout: 5000 }).catch(() => null)) ?? ''
  check(
    /\/app\/profile/.test(href) && /tab=notifications/.test(href),
    'which lands on the notification preferences, not just the profile',
    `gear points at ${href || '(nothing)'}`,
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§2.2  the Inbox "Other" chip is gone')
// ---------------------------------------------------------------------------
{
  const { ctx, page, calls } = await openApp(`/app/${WS}/inbox`)
  await page.waitForTimeout(800)
  // Two rows of controls in the header: the triage views (Inbox / Later /
  // Cleared) and the filter chips over them (All / Primary).
  const labelsOf = async (selector) =>
    (await page.locator(selector).filter({ visible: true }).allInnerTexts())
      .map((c) => c.split('\n')[0].trim())
      .filter(Boolean)
  const chipLabels = await labelsOf('header button[aria-pressed]')
  const allHeaderLabels = await labelsOf('header button')

  check(
    !allHeaderLabels.some((l) => /^other$/i.test(l)),
    `no Other control anywhere in the header (${allHeaderLabels.join(', ')})`,
  )
  check(
    chipLabels.some((l) => /^all$/i.test(l)) && chipLabels.some((l) => /^primary$/i.test(l)),
    `All and Primary are still there (${chipLabels.join(', ')})`,
  )
  check(
    allHeaderLabels.some((l) => /^later$/i.test(l)),
    'and Later — the one she asked to keep',
    allHeaderLabels.join(', '),
  )

  // §2.2 — "Primary pe yeh setting ka option hai … yeh mujh se poochta hai ke
  // mujhe kya cheezein show karwani hain."
  await page.goto(`${BASE}/app/${WS}/inbox?filter=primary`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const customise = page.locator('[data-testid="primary-customise"]')
  const primary = chain(
    'Primary offers the customise control',
    'and it opens a list of what can show there',
    'offering the long list she described',
    'with the choice this member made already ticked',
    'and what they left off, off',
    'ticking one saves it',
  )
  const haveCustomise = (await customise.count()) > 0
  primary.step(haveCustomise, 'no customise control on Primary')
  if (!haveCustomise) {
    primary.rest('skipped: there was no customise control to open')
  } else {
    await customise.click()
    const panel = page.locator('[data-testid="primary-customise-panel"]')
    const opened = await waitUntil(async () => (await panel.count()) > 0)
    primary.step(opened, 'the control opened nothing')
    if (!opened) {
      primary.rest('skipped: the panel never opened, so nothing in it could be read')
    } else {
      const boxes = await panel.locator('input[type="checkbox"]').count()
      primary.step(boxes >= 8, '', `offering the long list she described (${boxes} kinds)`)
      // The stub says this member chose mentions + chat, so those are ticked and
      // the rest are not — the panel reflects the stored choice, not a default.
      primary.step(
        await page.locator('[data-testid="primary-type-task_mentioned"]').isChecked(),
        'the stored choice is not reflected',
      )
      primary.step(
        !(await page.locator('[data-testid="primary-type-task_overdue"]').isChecked()),
        'something they left off is ticked',
      )
      const before = calls.length
      await page.locator('[data-testid="primary-type-task_overdue"]').click()
      primary.step(
        await waitUntil(async () =>
          calls
            .slice(before)
            .some((c) => c.method === 'POST' && c.body.includes('primaryTypes')),
        ),
        'nothing was posted',
      )
    }
  }

  // §2.2 — "Later mein SAVED messages show hote hain."
  await page.goto(`${BASE}/app/${WS}/inbox?view=later`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const saved = page.locator('[data-testid="later-saved-messages"]')
  const later = chain(
    'Later shows the messages she saved',
    'with the message itself, not just a count',
  )
  const haveSaved = (await saved.count()) > 0
  later.step(haveSaved, 'no saved-messages panel under Later')
  if (!haveSaved) {
    later.rest('skipped: there was no panel to read the message out of')
  } else {
    later.step(/the one she starred/.test(await saved.filter({ visible: true }).innerText().catch(() => '')), 'the panel showed no message')
  }

  // A bookmark to the removed filter must not strand anyone.
  await page.goto(`${BASE}/app/${WS}/inbox?filter=other`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const body = await page.evaluate(() => document.body.innerText)
  check(
    !/something went wrong/i.test(body) && /notifications/i.test(body),
    'an old ?filter=other link still lands on a working inbox',
    body.slice(0, 90),
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§1.3  the sidebar collapses to icons')
// ---------------------------------------------------------------------------
{
  const { ctx, page, calls } = await openApp()
  const sidebar = page.locator('[data-testid="workspace-sidebar"]')
  // `boundingBox()` THROWS when the locator matches nothing — it waits for the
  // element first — and returns null only for one that exists with no box. Every
  // check below reads the size through `?? 0` or a null test, so absence reports
  // as zero and reddens; unguarded it spent thirty seconds and ended the section
  // (ledger §10).
  const widthOf = async () => (await sidebar.boundingBox({ timeout: 6000 }).catch(() => null))?.width ?? 0

  const expanded = await widthOf()
  check(expanded > 200, `starts expanded (${Math.round(expanded)}px)`)

  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await waitUntil(async () => {
    const w = await widthOf()
    return w > 0 && w < 90
  })
  const collapsed = await widthOf()
  check(collapsed > 0 && collapsed < 90, `collapses to a rail (${Math.round(collapsed)}px)`)

  // "mujhe bas ICONS show hon" — the icon rail, not the wide sidebar. This used
  // to assert the rail carried no text at all, which read the line too
  // literally: what she was pointing at when she said it was ClickUp's own app
  // bar ("yeh NAVIGATION hai IN KI"), and that labels every icon. A column of
  // unlabelled pictograms you have to hover to identify is not what she asked
  // for; it is what "sirf icons" sounds like out of context.
  //
  // Scoped to the rail's own nav, not the whole <aside>: the floating dock is a
  // DOM descendant of the sidebar even though it is fixed-position chrome, so
  // measuring the aside counts the dock's links and its drag handle too.
  const rail = page.locator('[data-testid="workspace-sidebar"][data-collapsed="true"] > nav')
  const railLinks = await rail.locator('a').count()
  const railText = (await rail.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  check(railLinks >= 5, `the destinations are still reachable (${railLinks} icons)`)
  check(
    /home/i.test(railText) && /inbox/i.test(railText),
    'and each icon says what it is',
    railText.slice(0, 60) || '(the rail is unlabelled)',
  )
  // Labelled, but still a rail: the whole point was the space the wide sidebar
  // took. If this ever creeps past ~90px it has stopped being the thing she
  // asked for.
  check(collapsed < 90, `and it is still narrow (${Math.round(collapsed)}px)`)

  // "kyunke yeh SPACE leta hai" — the point is the page getting the room.
  const mainWidth = await page
    .locator('main')
    .first()
    .boundingBox({ timeout: 6000 }).catch(() => null)
    .then((b) => b?.width ?? 0)
  check(mainWidth > 1300, `the page takes the space back (${Math.round(mainWidth)}px)`)

  // The dock is fixed-position chrome that lives inside the sidebar component.
  // As an early return, the collapsed branch never reached it, so collapsing
  // deleted the quick-nav pill with no way back except expanding again.
  const dock = page.locator('nav, div').filter({ has: page.locator('a[href$="/inbox"]') })
  const dockVisible = async () =>
    await page.evaluate(() => {
      const fixed = [...document.querySelectorAll('div')].filter(
        (el) => getComputedStyle(el).position === 'fixed' && el.querySelector('a[href*="/app/"]'),
      )
      return fixed.length > 0
    })
  check(await dockVisible(), 'the floating dock survives collapsing')
  void dock

  // Every icon keeps its size rather than squashing — the rail must scroll.
  const squashed = await page.evaluate(() => {
    const nav = document.querySelector(
      '[data-testid="workspace-sidebar"][data-collapsed="true"] > nav',
    )
    if (!nav) return -1
    return [...nav.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().height < 30)
      .length
  })
  check(squashed === 0, `no icon is squashed (${squashed} under 30px)`)

  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await waitUntil(async () => (await widthOf()) > 200)
  check((await widthOf()) > 200, 'and it expands again')

  // The preference has to survive a reload, or it is not a preference.
  const beforeCollapse = calls.length
  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await waitUntil(async () => (await widthOf()) < 90)

  /*
   * …and it has to leave this browser. It was localStorage only, so "mujhe nahi
   * chahiye to space le" [10:24] held on one machine and was forgotten on the
   * next — the frame pass caught that, the transcript on its own did not.
   */
  const wrote = await waitUntil(() =>
    calls
      .slice(beforeCollapse)
      .some((c) => c.method === 'PATCH' && c.url.includes('/users/me') && c.body.includes('sidebarCollapsed')),
    { timeoutMs: 10000 },
  )
  check(
    wrote,
    'and is written to the member, not just this browser',
    calls.slice(beforeCollapse).map((c) => c.method + ' ' + c.url).slice(-4).join(' | '),
  )

  await page.reload({ waitUntil: 'networkidle' })
  const persisted = await waitUntil(async () => {
    const w = await widthOf()
    return w > 0 && w < 90
  })
  check(persisted, 'the choice survives a reload', `${Math.round(await widthOf())}px after reload`)
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§1.1  task type at create time, and as a search filter')
// ---------------------------------------------------------------------------
{
  const { ctx, page, calls } = await openApp()

  // The create modal. "yahan pe humein woh option hi nahi deta ke hum task type
  // ko select kar sakein."
  await page.getByRole('button', { name: /^new$/i }).first().click()
  await page.waitForTimeout(900)
  const typeSelect = page.locator('[data-testid="quick-create-task-type"]')
  const hasSelect = (await typeSelect.count()) > 0
  const createType = chain(
    'the create modal offers a task type',
    "the workspace's types are listed",
    'creating posts to /tasks',
    'and the chosen type is in the request body',
  )
  createType.step(hasSelect, 'no task-type select in the create modal')
  if (!hasSelect) {
    createType.rest('skipped: there was no type to choose, so nothing could be sent')
  } else {
    // Offered by a DRAWN select: Playwright counts no <option> as visible, so the guard
    // is on the select (`found-29-sep/innertext-reads-hidden-leaves`).
    const options = await typeSelect.filter({ visible: true }).locator('option').allInnerTexts()
    createType.step(
      options.some((o) => /milestone/i.test(o)),
      '',
      `the workspace's types are listed (${options.join(', ')})`,
    )

    // …and it has to reach the server, not just render. The DTO ran with
    // whitelist:true and no taskTypeId field, so it was stripped in transit.
    await page.locator('form input').first().fill('Ship the milestone')
    const selects = page.locator('form select')
    await selects.nth(0).selectOption('sp-1')
    await page.waitForTimeout(400)
    await selects.nth(1).selectOption('pr-1')
    await page.waitForTimeout(400)
    await selects.nth(2).selectOption('li-1')
    await page.waitForTimeout(400)
    await typeSelect.selectOption('tt-milestone')
    const before = calls.length
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForTimeout(1200)
    const post = calls
      .slice(before)
      .find((c) => c.method === 'POST' && /\/tasks(\?|$)/.test(c.url))
    createType.step(!!post, calls.slice(before).map((c) => c.method + ' ' + c.url).join(' | '))
    createType.step(!!post && post.body.includes('tt-milestone'), post?.body?.slice(0, 120))
  }
  await ctx.close()
}

{
  const { ctx, page, calls } = await openApp()
  // The search half.
  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(1500)
  const filtersToggle = page.getByRole('button', { name: /filter/i }).first()
  if ((await filtersToggle.count()) > 0) await filtersToggle.click().catch(() => {})
  await page.waitForTimeout(600)

  const typeFilter = page.locator('[data-testid="palette-task-type-filter"]')
  const hasFilter = (await typeFilter.count()) > 0
  const searchType = chain(
    'search offers a Task type filter',
    'and choosing one narrows the search request',
  )
  searchType.step(hasFilter, 'no Task type filter in the palette')
  if (!hasFilter) {
    searchType.rest('skipped: there was no filter to choose from')
  } else {
    const before = calls.length
    await typeFilter.selectOption('tt-milestone')
    await page.waitForTimeout(1500)
    const search = calls
      .slice(before)
      .find((c) => c.url.includes('/search') && c.url.includes('taskTypeId=tt-milestone'))
    searchType.step(!!search, calls.slice(before).map((c) => c.url).slice(-3).join(' | '))
  }
  await ctx.close()
}

console.log('\n§1.3b  the tree opens, closes, and opens again — and the dock stays off it')
{
  // Same route the section above uses: the sidebar is shell chrome and renders
  // on any workspace route, and this one is known to reach the stubs it needs.
  const { ctx, page } = await openApp()
  await page.waitForTimeout(3000)

  const toggle = page.locator('[data-testid="space-toggle-sp-1"]')
  const link = page.locator('[data-testid="space-link-sp-1"]')
  const child = page.locator('[data-testid="project-link-pr-1"]')

  check((await toggle.count()) > 0, 'the space row has its own expand control')
  check((await link.count()) > 0, 'and the name is a separate target')

  // The nesting this replaced was a <Link> inside the toggle <button>: invalid
  // HTML, and one click both navigated and toggled, so whether a space opened
  // depended on which half of the row you hit.
  const nested = await page.evaluate(
    () => document.querySelectorAll('button a').length,
  )
  check(nested === 0, 'no link is nested inside a button', `${nested} found`)

  const tree = chain(
    'the chevron opens the space',
    'and closes it again',
    'and opens it a second time',
  )
  if ((await toggle.count()) === 0) {
    tree.rest('skipped: there was no expand control to click')
  } else {
    await toggle.click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(800)
    tree.step((await child.count()) > 0, 'the space did not open')

    await toggle.click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(800)
    tree.step((await child.count()) === 0, 'the space did not close')

    // The reported bug: closing was easy, reopening was not.
    await toggle.click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(800)
    tree.step((await child.count()) > 0, 'the space would not reopen')
  }

  // Opening a space must never fold it away. Navigating to something and having
  // it disappear underneath you is how the tree became unusable.
  const nameOpens = chain('clicking the name opens the space, never closes it')
  if ((await link.count()) === 0) {
    nameOpens.rest('skipped: the name was not a separate target to click')
  } else {
    await link.click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    nameOpens.step((await child.count()) > 0, 'the space was not open after its name was clicked')
  }

  /*
   * The floating dock is `fixed` at the bottom-left — on top of the sidebar,
   * not beside it. Rows underneath it are hidden and, worse, unclickable: a
   * fixed z-50 layer takes the click. The tree has to reserve room for it.
   */
  const overlap = await page.evaluate(() => {
    const tree = document.querySelector('[data-testid="sidebar-tree"]')
    const dock = [...document.querySelectorAll('div')].find(
      (el) => getComputedStyle(el).position === 'fixed' && !!el.querySelector('a[href*="/app/"]'),
    )
    if (!tree || !dock) return { ok: false, why: 'tree or dock missing' }
    const d = dock.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(tree).paddingBottom) || 0
    // Anything the tree can scroll to must be able to clear the dock.
    const last = [...tree.querySelectorAll('a,button')].pop()
    const lastBottom = last ? last.getBoundingClientRect().bottom : 0
    return { ok: pad >= d.height, pad, dockH: d.height, lastBottom, dockTop: d.top }
  })
  check(
    overlap.ok,
    `the tree reserves room for the dock (pad ${Math.round(overlap.pad ?? 0)}px >= dock ${Math.round(overlap.dockH ?? 0)}px)`,
    JSON.stringify(overlap),
  )

  await ctx.close()
}

console.log('\n§2  the search bar she walked through')
// ---------------------------------------------------------------------------
{
  const { ctx, page, calls } = await openApp()
  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(1500)

  /*
   * [01:33] — "main 'Task' par click karoongi na". Checked *before* touching
   * the Filters toggle: she reaches for a type straight away, and this row used
   * to be hidden until you opened that panel.
   */
  check(
    (await page.locator('[data-testid="palette-type-task"]').count()) > 0,
    'the type chips are on the bar without opening Filters',
  )

  const filtersToggle = page.getByRole('button', { name: /filter/i }).first()
  if ((await filtersToggle.count()) > 0) await filtersToggle.click().catch(() => {})
  await page.waitForTimeout(800)
  check(
    (await page.locator('[data-testid="palette-type-folder"]').count()) === 0,
    'and Folders is not one of them yet — it lives behind the ⋯',
  )

  /*
   * [02:01] "yeh 3 DOTS dekh rahe hain? Main yahan se aur points pe click out
   * kar ke, let's suppose ke mujhe FOLDERS mein search karna hai, to folders
   * yahan pe appear ho jayega. To main woh cheez search kar sakti hoon us ke
   * ooper click kar ke." — two steps: reveal, then select.
   */
  const more = page.locator('[data-testid="palette-more-types"]')
  const overflow = chain(
    'there is a ⋯ for the rest',
    'and Folders is offered in it',
    'choosing it makes the chip appear in the bar',
    'and clicking it searches in folders',
  )
  const haveMore = (await more.count()) > 0
  overflow.step(haveMore, 'no ⋯ in the type bar')
  if (!haveMore) {
    overflow.rest('skipped: there was no ⋯ to open')
  } else {
    await more.click()
    await page.waitForTimeout(500)
    const addFolder = page.locator('[data-testid="palette-add-type-folder"]')
    const haveAdd = (await addFolder.count()) > 0
    overflow.step(haveAdd, 'Folders was not in the ⋯')
    if (!haveAdd) {
      overflow.rest('skipped: Folders could not be revealed, so nothing followed from it')
    } else {
      await addFolder.click()
      await page.waitForTimeout(500)
      const chip = page.locator('[data-testid="palette-type-folder"]')
      const haveChip = (await chip.count()) > 0
      overflow.step(haveChip, 'no chip appeared in the bar')
      if (!haveChip) {
        overflow.rest('skipped: there was no chip to click')
      } else {
        // Revealed but not yet searched — the second click is what narrows.
        const before = calls.length
        await chip.click({ timeout: 10_000 }).catch(() => {})
        await page.waitForTimeout(1500)
        const req = calls
          .slice(before)
          .find((c) => c.url.includes('/search/') && c.url.includes('types=') && c.url.includes('folder'))
        overflow.step(!!req, calls.slice(before).map((c) => c.url).slice(-3).join(' | '))
      }
    }
  }
  await ctx.close()
}

{
  const { ctx, page, calls } = await openApp()
  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(1500)
  const filtersToggle = page.getByRole('button', { name: /filter/i }).first()
  if ((await filtersToggle.count()) > 0) await filtersToggle.click().catch(() => {})
  await page.waitForTimeout(800)

  // [02:35] "LOCATION ka matlab yeh hota hai ke woh kis space mein para hai,
  // ya kis list mein para hai."
  const space = page.locator('[data-testid="palette-space-filter"]')
  const location = chain(
    'Location offers a space',
    'and choosing one narrows the search by space',
    'the folder step is offered once a space is chosen',
    'the lists for that space are offered',
  )
  const haveSpace = (await space.count()) > 0
  location.step(haveSpace, 'Location offered no space')
  if (!haveSpace) {
    location.rest('skipped: no space could be chosen, so nothing below it applies')
  } else {
    const before = calls.length
    await space.selectOption('sp-1')
    await page.waitForTimeout(1600)
    const req = calls.slice(before).find((c) => c.url.includes('/search/') && c.url.includes('spaceId=sp-1'))
    location.step(!!req, calls.slice(before).map((c) => c.url).slice(-3).join(' | '))

    // The folder step between space and list — "a space, folder or list".
    const folder = page.locator('[data-testid="palette-folder-filter"]')
    if ((await folder.count()) > 0) {
      const beforeF = calls.length
      await folder.selectOption({ index: 1 }).catch(() => {})
      await page.waitForTimeout(1600)
      location.step(
        calls.slice(beforeF).some((c) => c.url.includes('folderId=')),
        calls.slice(beforeF).map((c) => c.url).slice(-3).join(' | '),
        'and by folder',
      )
    } else {
      // The stub space has no folders, so there is nothing to pick. Said out
      // loud rather than passing on a control that never rendered.
      location.step(false, 'the folder select never rendered')
    }

    // The list options only mean anything once a space is chosen.
    const list = page.locator('[data-testid="palette-list-filter"]')
    if ((await list.count()) > 0) {
      const before2 = calls.length
      await list.selectOption('li-1')
      await page.waitForTimeout(1600)
      const req2 = calls.slice(before2).find((c) => c.url.includes('listId=li-1'))
      location.step(!!req2, calls.slice(before2).map((c) => c.url).slice(-3).join(' | '), 'and by list')
    } else {
      location.step(false, 'the list select never rendered')
    }
  }

  // [04:00] "last created date kya thi — dates ke lehaz par".
  const created = page.locator('[data-testid="palette-created-after"]')
  const createdFilter = chain(
    'there is a created-date filter',
    'and it reaches the request as createdAfter, not dueAfter',
  )
  const haveCreated = (await created.count()) > 0
  createdFilter.step(haveCreated, 'no created-date filter in the palette')
  if (!haveCreated) {
    createdFilter.rest('skipped: there was no date field to fill')
  } else {
    const before = calls.length
    await created.fill('2026-01-01')
    await page.waitForTimeout(1600)
    const req = calls.slice(before).find((c) => c.url.includes('createdAfter=2026-01-01'))
    createdFilter.step(!!req, calls.slice(before).map((c) => c.url).slice(-3).join(' | '))
  }
  await ctx.close()
}

console.log('\n§6  pinning a tool puts it in the top bar')
// ---------------------------------------------------------------------------
{
  // Starts from a profile that has pinned nothing beyond the defaults, so the
  // tool under test is genuinely absent before the click.
  const { ctx, page, calls } = await openApp('/app/profile', {}, { topbarPinned: ['create'] })
  await page.waitForTimeout(2500)

  check(
    (await page.locator('[data-testid="topbar-tool-docs"]').count()) === 0,
    'an unpinned tool is not in the bar',
  )

  const box = page.locator('[data-testid="topbar-toggle-docs"]')
  const pinning = chain(
    'the picker offers Docs — "yeh document ka" [07:58]',
    'pinning writes topbarPinned',
    'and names the tool that was pinned',
  )
  const haveBox = (await box.count()) > 0
  pinning.step(haveBox, 'Docs is not offered in the picker')
  if (!haveBox) {
    pinning.rest('skipped: there was no box to tick, so nothing was pinned')
  } else {
    const before = calls.length
    await box.check()
    await page.waitForTimeout(1500)

    // It has to reach the server: this is a preference on the person, not the
    // browser they happen to be sitting at.
    const patch = calls
      .slice(before)
      .find((c) => c.method === 'PATCH' && c.url.includes('/users/me') && c.body.includes('topbarPinned'))
    pinning.step(!!patch, calls.slice(before).map((c) => c.method + ' ' + c.url).join(' | '))
    pinning.step(!!patch && patch.body.includes('docs'), patch?.body?.slice(0, 140))
  }
  await ctx.close()
}

{
  // …and with it pinned, the bar carries it and it leads somewhere. A tool that
  // is offered in the picker and then goes nowhere is worse than no tool.
  // The inbox route rather than the workspace home: the home route does not
  // fully render against these stubs (the same reason §1.3b uses it), and the
  // top bar is shell chrome that shows on either.
  const { ctx, page } = await openApp(`/app/${WS}/inbox`, {}, {
    topbarPinned: ['create', 'docs', 'whiteboards', 'dashboards'],
  })
  await page.waitForTimeout(2500)
  for (const tool of ['docs', 'whiteboards', 'dashboards']) {
    const el = page.locator(`[data-testid="topbar-tool-${tool}"]`)
    const there = (await el.count()) > 0
    // Two checks per tool whichever way it goes: a pinned tool missing from the
    // bar used to shorten the run by one rather than failing the claim that it
    // leads somewhere.
    const pinned = chain(`a pinned ${tool} shows in the bar`, 'and points into the workspace')
    pinned.step(there, `no ${tool} in the bar`)
    if (!there) {
      pinned.rest(`skipped: ${tool} is not in the bar, so it points nowhere`)
    } else {
      const href = await el.first().getAttribute('href', { timeout: 5000 }).catch(() => null)
      pinned.step(
        !!href && href.startsWith(`/app/${WS}/`),
        '',
        `and points into the workspace (${href})`,
      )
    }
  }
  // The bell stays off unless asked for — §1.5 "[Default par]".
  check(
    (await page.locator('[data-testid="topbar-tool-notifications"]').count()) === 0,
    'and nothing unpinned crept in',
  )
  await ctx.close()
}

console.log('\n§6b  pinning from the avatar menu, where she does it')
// ---------------------------------------------------------------------------
{
  /*
   * "Jab apni profile pe click karti hoon, yahan pe TOOLS hai. Ab main yahan
   * koi bhi tool PIN kar sakti hoon" [07:48] — and unpinning takes it straight
   * off the bar: "maine unpin ki hai to ooper se saare ke saare jo hain woh
   * khatam ho gaye hain" [08:07].
   *
   * The picker existed only in profile settings, two navigations away from the
   * place she opens it.
   */
  const { ctx, page, calls } = await openApp(`/app/${WS}/inbox`, {}, {
    topbarPinned: ['create', 'docs'],
  })
  await page.waitForTimeout(2500)

  check(
    (await page.locator('[data-testid="topbar-tool-docs"]').count()) > 0,
    'docs starts pinned, so there is something to unpin',
  )

  // Open the avatar menu. Addressed directly: `header button` .last() is a
  // guess about layout, and it guessed wrong.
  await page.locator('[data-testid="user-menu"]').click()
  // Its tools open from a row of their own, as ClickUp's "Personal Tools" do
  // (`found-6-oct/user-menu-hides-sign-out-below-a-scroll`).
  await page.locator('[data-testid="menu-tools"]').click({ timeout: 10_000 }).catch(() => {})
  const pinDocs = page.locator('[data-testid="menu-pin-docs"]')
  await waitUntil(async () => (await pinDocs.count()) > 0, { timeoutMs: 8000 })
  const menuPin = chain(
    'the avatar menu offers Tools',
    'and shows docs as pinned',
    'unpinning writes the preference',
    'and it leaves the top bar straight away',
  )
  const havePinDocs = (await pinDocs.count()) > 0
  menuPin.step(havePinDocs, 'no Tools entry in the avatar menu')
  if (!havePinDocs) {
    menuPin.rest('skipped: there was no menu entry to read or click')
  } else {
    menuPin.step(
      (await pinDocs.getAttribute('aria-pressed')) === 'true',
      'the menu does not show docs as pinned',
    )
    const before = calls.length
    await pinDocs.click()
    const wrote = await waitUntil(
      () =>
        calls
          .slice(before)
          .some((c) => c.method === 'PATCH' && c.url.includes('/users/me') && c.body.includes('topbarPinned')),
      { timeoutMs: 10000 },
    )
    menuPin.step(wrote, calls.slice(before).map((c) => c.method + ' ' + c.url).slice(-3).join(' | '))

    // "ooper se saare ke saare jo hain woh khatam ho gaye hain" — off the bar.
    const gone = await waitUntil(
      async () => (await page.locator('[data-testid="topbar-tool-docs"]').count()) === 0,
      { timeoutMs: 8000 },
    )
    menuPin.step(gone, 'docs is still in the bar')
  }
  await ctx.close()
}

console.log('\n§7  any member can make a workspace; a guest cannot')
// ---------------------------------------------------------------------------
{
  // "WORKSPACE IS A FEATURE jo ke har member kar sakta hai — it's not
  // necessary ke humare paas kuch admin hi aaye jo kar sake" [09:29].
  const { ctx, page, calls } = await openApp(`/app/${WS}/inbox`, {}, { role: 'member' })
  await page.waitForTimeout(2500)
  // The switcher holds it.
  // Address the switcher directly. `sidebar button` .first() hits the collapse
  // toggle, which folds the sidebar away — and then BOTH cases below see zero
  // buttons, so the guest one passes for the wrong reason. It did, on the first
  // run of this section.
  const openSwitcher = async (p) => {
    await p.locator('[data-testid="workspace-switcher"]').click()
    await p.waitForTimeout(800)
  }
  await openSwitcher(page)
  check(
    (await page.locator('[data-testid="new-workspace"]').count()) > 0,
    'a member is offered New Workspace',
  )

  /*
   * …and it opens the flow she describes, not a single name field.
   * "same layout jo aap ne abhi kiya tha [signup ke waqt]" [08:43],
   * "Skip ya step, aur yahan se different tool search kar sakti hoon" [08:54],
   * "'xyz' likhoongi to meri new workspace ka naam hai, aur main is ko Finish
   * karoongi to meri workspace ban jayegi" [09:02].
   */
  await page.locator('[data-testid="new-workspace"]').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(900)
  check((await page.locator('[data-testid="create-workspace-flow"]').count()) > 0, 'it opens a stepped flow')

  await page.locator('[data-testid="workspace-name"]').fill('xyz')
  await page.locator('[data-testid="workspace-next"]').click()
  await page.waitForTimeout(500)
  check(
    (await page.locator('[data-testid="workspace-purpose-work"]').count()) > 0,
    'and asks what the workspace is for',
  )
  await page.locator('[data-testid="workspace-purpose-personal"]').click()
  await page.waitForTimeout(500)

  const toolSearch = page.locator('[data-testid="workspace-tool-search"]')
  check((await toolSearch.count()) > 0, 'then which tool you are coming from, searchable')
  await toolSearch.fill('trel', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.locator('[data-testid="workspace-tool-trello"]').click()

  const before = calls.length
  await page.locator('[data-testid="workspace-finish"]').click()
  const posted = await waitUntil(
    () => calls.slice(before).some((c) => c.method === 'POST' && /\/workspaces$/.test(c.url.split('?')[0])),
    { timeoutMs: 10000 },
  )
  check(posted, 'Finish creates it', calls.slice(before).map((c) => c.method + ' ' + c.url).slice(-3).join(' | '))
  const post = calls.slice(before).find((c) => c.method === 'POST' && /\/workspaces$/.test(c.url.split('?')[0]))
  check(!!post && post.body.includes('xyz'), 'with the name typed', post?.body?.slice(0, 120))
  check(
    !!post && post.body.includes('personal') && post.body.includes('Trello'),
    'and the answers it collected — asked and then discarded is worse than not asking',
    post?.body?.slice(0, 160),
  )
  await ctx.close()
}

{
  // "Skip ya step" [08:54] — a skip finishes, it does not stall.
  const { ctx, page, calls } = await openApp(`/app/${WS}/inbox`, {}, { role: 'member' })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="workspace-switcher"]').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.locator('[data-testid="new-workspace"]').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.locator('[data-testid="workspace-name"]').fill('skipped')
  await page.locator('[data-testid="workspace-next"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="workspace-skip-purpose"]').click()
  await page.waitForTimeout(500)
  const before = calls.length
  await page.locator('[data-testid="workspace-skip-tool"]').click()
  const posted = await waitUntil(
    () => calls.slice(before).some((c) => c.method === 'POST' && /\/workspaces$/.test(c.url.split('?')[0])),
    { timeoutMs: 10000 },
  )
  check(posted, 'skipping every optional step still creates the workspace')
  const post = calls.slice(before).find((c) => c.method === 'POST' && /\/workspaces$/.test(c.url.split('?')[0]))
  check(
    !!post && post.body.includes('skipped') && !post.body.includes('comingFrom'),
    'and sends only what was actually answered',
    post?.body?.slice(0, 140),
  )
  await ctx.close()
}

{
  // "jo GUEST hai sirf woh create NAHI kar sakta" [09:22]. Offering a button
  // that comes back 403 is worse than not offering it.
  const { ctx, page } = await openApp(`/app/${WS}/inbox`, {}, { role: 'guest' })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="workspace-switcher"]').click()
  await page.waitForTimeout(800)
  // Proves the switcher really opened, so "no button" means denied rather than
  // "nothing rendered at all".
  const switcherOpen = await page
    .locator('[data-testid="workspace-switcher"][aria-expanded="true"]')
    .count()
  check(switcherOpen > 0, 'the switcher opens for a guest too')
  check(
    (await page.locator('[data-testid="new-workspace"]').count()) === 0,
    'a guest is not',
  )
  await ctx.close()
}

console.log('\n§14  you can tell what is unread without opening the chat')
// ---------------------------------------------------------------------------
{
  /*
   * "woh 10 groups mein hai — ab us ko har baar chat open karne ki zaroorat
   * nahi honi chahiye ke woh dekhe ke is mein reply aaya ya nahi. Woh yahan pe
   * aaye, us ko yahan notification ho jaye — acha, yeh unread message hai"
   * [17:16]. The Inbox has to answer that at a glance, which means an unread
   * row must not look like a read one.
   */
  const { ctx, page } = await openApp()
  await page.waitForTimeout(2500)

  const unreadRow = page.locator('[data-testid="notif-n-unread"]')
  const readRow = page.locator('[data-testid="notif-n-read"]')
  const glance = chain(
    'both replies show in the Inbox',
    'the unread one is marked unread',
    'and the read one is not',
    'and they are painted differently — the glance she describes',
  )
  const bothRows = (await unreadRow.count()) > 0 && (await readRow.count()) > 0
  glance.step(bothRows, 'one or both rows are missing from the Inbox')
  if (!bothRows) {
    glance.rest('skipped: without both rows there is nothing to tell apart')
  } else {
    glance.step(
      (await unreadRow.getAttribute('data-unread')) === 'true',
      'the unread row is not marked unread',
    )
    glance.step(
      (await readRow.getAttribute('data-unread')) === 'false',
      'the read row is marked unread',
    )

    // Marked is not the same as *looking* different. Compare what is painted.
    const [unreadStyle, readStyle] = await page.evaluate(() => {
      const pick = (id) => {
        const el = document.querySelector(`[data-testid="notif-${id}"]`)
        const cs = el ? getComputedStyle(el) : null
        return cs ? { bg: cs.backgroundColor, border: cs.borderLeftWidth + ' ' + cs.borderLeftColor } : null
      }
      return [pick('n-unread'), pick('n-read')]
    })
    glance.step(
      !!unreadStyle && !!readStyle && JSON.stringify(unreadStyle) !== JSON.stringify(readStyle),
      `unread ${JSON.stringify(unreadStyle)} vs read ${JSON.stringify(readStyle)}`,
    )

    /*
     * Not asserted here: that opening it marks it read.
     *
     * The code path is plainly there — onOpen awaits markRead for every unread
     * id before it navigates. But the POST it should produce is not observable
     * through this harness: the click navigates (the destination's own fetches
     * show up), which means onOpen ran and the mark-read promise resolved, yet
     * no non-GET request is ever recorded for this context. I could not account
     * for that, and an assertion whose passing I cannot explain is worth less
     * than no assertion at all — it would read as coverage of something never
     * actually checked.
     *
     * What she asked for — telling unread from read at a glance, without
     * opening ten chats — is covered above. The read transition is exercised by
     * the API's own markRead tests.
     */
  }
  await ctx.close()
}

await browser.close()
server.close()

console.log(`\n${passed} passed, ${failed} failed`)
/*
 * "0 failed" is not "it ran". Compared with `!==` and never `<`: with `<`, a
 * branch that silently skipped becomes a shorter run that still reports zero
 * failures and exits 0. Ninety-two checks over a long walk is a lot of places
 * to stop quietly. Observed from a green run, not guessed.
 */
const EXPECTED_CHECKS = 92
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped ` +
      'early, so the count above describes the part it reached and nothing else.',
  )
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)
