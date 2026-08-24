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
  const topbarText = await header.innerText()
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
  check((await toggle.count()) > 0, 'a member can configure the top bar from their profile')
  if ((await toggle.count()) > 0) {
    check(!(await toggle.isChecked()), 'and the bell shows as off there')
    const before = calls.length
    // click + wait, not .check(): .check() asserts the box is checked the
    // instant the click returns, which is a claim about round-trip latency
    // rather than about the control. It failed roughly two runs in five.
    await toggle.click()
    await waitUntil(async () =>
      calls.slice(before).some((c) => c.method === 'PATCH' && c.body.includes('topbarHidden')),
    )
    const patches = calls.slice(before).filter((c) => c.method === 'PATCH')
    check(
      patches.length > 0,
      'turning it on saves the preference to the member, not the browser',
      calls.slice(before).map((c) => c.method).join(','),
    )
    check(
      patches.some((c) => {
        try {
          return !JSON.parse(c.body || '{}').topbarHidden?.includes('notifications')
        } catch {
          return false
        }
      }),
      'and the bell is removed from the hidden set',
      patches.map((c) => c.body).join(' | ').slice(0, 120),
    )
    check(
      await waitUntil(async () => await toggle.isChecked()),
      'and the control reflects the saved state',
    )
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
    (await page.locator(selector).allInnerTexts())
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
  check((await customise.count()) > 0, 'Primary offers the customise control')
  if ((await customise.count()) > 0) {
    await customise.click()
    const panel = page.locator('[data-testid="primary-customise-panel"]')
    check(
      await waitUntil(async () => (await panel.count()) > 0),
      'and it opens a list of what can show there',
    )
    const boxes = await panel.locator('input[type="checkbox"]').count()
    check(boxes >= 8, `offering the long list she described (${boxes} kinds)`)
    // The stub says this member chose mentions + chat, so those are ticked and
    // the rest are not — the panel reflects the stored choice, not a default.
    check(
      await page.locator('[data-testid="primary-type-task_mentioned"]').isChecked(),
      'with the choice this member made already ticked',
    )
    check(
      !(await page.locator('[data-testid="primary-type-task_overdue"]').isChecked()),
      'and what they left off, off',
    )
    const before = calls.length
    await page.locator('[data-testid="primary-type-task_overdue"]').click()
    check(
      await waitUntil(async () =>
        calls
          .slice(before)
          .some((c) => c.method === 'POST' && c.body.includes('primaryTypes')),
      ),
      'ticking one saves it',
    )
  }

  // §2.2 — "Later mein SAVED messages show hote hain."
  await page.goto(`${BASE}/app/${WS}/inbox?view=later`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const saved = page.locator('[data-testid="later-saved-messages"]')
  check((await saved.count()) > 0, 'Later shows the messages she saved')
  if ((await saved.count()) > 0) {
    check(
      /the one she starred/.test(await saved.innerText()),
      'with the message itself, not just a count',
    )
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
  const widthOf = async () => (await sidebar.boundingBox())?.width ?? 0

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
  const railText = (await rail.innerText()).trim()
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
    .boundingBox()
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
  check(hasSelect, 'the create modal offers a task type')
  if (hasSelect) {
    const options = await typeSelect.locator('option').allInnerTexts()
    check(
      options.some((o) => /milestone/i.test(o)),
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
    check(!!post, 'creating posts to /tasks', calls.slice(before).map((c) => c.method + ' ' + c.url).join(' | '))
    check(
      !!post && post.body.includes('tt-milestone'),
      'and the chosen type is in the request body',
      post?.body?.slice(0, 120),
    )
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
  check(hasFilter, 'search offers a Task type filter')
  if (hasFilter) {
    const before = calls.length
    await typeFilter.selectOption('tt-milestone')
    await page.waitForTimeout(1500)
    const search = calls
      .slice(before)
      .find((c) => c.url.includes('/search') && c.url.includes('taskTypeId=tt-milestone'))
    check(!!search, 'and choosing one narrows the search request', calls.slice(before).map((c) => c.url).slice(-3).join(' | '))
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

  if ((await toggle.count()) > 0) {
    await toggle.click()
    await page.waitForTimeout(800)
    const openedOnce = (await child.count()) > 0
    check(openedOnce, 'the chevron opens the space')

    await toggle.click()
    await page.waitForTimeout(800)
    check((await child.count()) === 0, 'and closes it again')

    // The reported bug: closing was easy, reopening was not.
    await toggle.click()
    await page.waitForTimeout(800)
    check((await child.count()) > 0, 'and opens it a second time')
  }

  // Opening a space must never fold it away. Navigating to something and having
  // it disappear underneath you is how the tree became unusable.
  if ((await link.count()) > 0) {
    await link.click()
    await page.waitForTimeout(1200)
    check((await child.count()) > 0, 'clicking the name opens the space, never closes it')
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
  check((await more.count()) > 0, 'there is a ⋯ for the rest')
  if ((await more.count()) > 0) {
    await more.click()
    await page.waitForTimeout(500)
    const addFolder = page.locator('[data-testid="palette-add-type-folder"]')
    check((await addFolder.count()) > 0, 'and Folders is offered in it')
    if ((await addFolder.count()) > 0) {
      await addFolder.click()
      await page.waitForTimeout(500)
      const chip = page.locator('[data-testid="palette-type-folder"]')
      check((await chip.count()) > 0, 'choosing it makes the chip appear in the bar')

      // Revealed but not yet searched — the second click is what narrows.
      const before = calls.length
      await chip.click()
      await page.waitForTimeout(1500)
      const req = calls
        .slice(before)
        .find((c) => c.url.includes('/search/') && c.url.includes('types=') && c.url.includes('folder'))
      check(
        !!req,
        'and clicking it searches in folders',
        calls.slice(before).map((c) => c.url).slice(-3).join(' | '),
      )
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
  check((await space.count()) > 0, 'Location offers a space')
  if ((await space.count()) > 0) {
    const before = calls.length
    await space.selectOption('sp-1')
    await page.waitForTimeout(1600)
    const req = calls.slice(before).find((c) => c.url.includes('/search/') && c.url.includes('spaceId=sp-1'))
    check(!!req, 'and choosing one narrows the search by space', calls.slice(before).map((c) => c.url).slice(-3).join(' | '))

    // The folder step between space and list — "a space, folder or list".
    const folder = page.locator('[data-testid="palette-folder-filter"]')
    if ((await folder.count()) > 0) {
      const beforeF = calls.length
      await folder.selectOption({ index: 1 }).catch(() => {})
      await page.waitForTimeout(1600)
      check(
        calls.slice(beforeF).some((c) => c.url.includes('folderId=')),
        'and by folder',
        calls.slice(beforeF).map((c) => c.url).slice(-3).join(' | '),
      )
    } else {
      // The stub space has no folders, so there is nothing to pick. Said out
      // loud rather than passing on a control that never rendered.
      check(false, 'the folder step is offered once a space is chosen')
    }

    // The list options only mean anything once a space is chosen.
    const list = page.locator('[data-testid="palette-list-filter"]')
    if ((await list.count()) > 0) {
      const before2 = calls.length
      await list.selectOption('li-1')
      await page.waitForTimeout(1600)
      const req2 = calls.slice(before2).find((c) => c.url.includes('listId=li-1'))
      check(!!req2, 'and by list', calls.slice(before2).map((c) => c.url).slice(-3).join(' | '))
    } else {
      check(false, 'the lists for that space are offered')
    }
  }

  // [04:00] "last created date kya thi — dates ke lehaz par".
  const created = page.locator('[data-testid="palette-created-after"]')
  check((await created.count()) > 0, 'there is a created-date filter')
  if ((await created.count()) > 0) {
    const before = calls.length
    await created.fill('2026-01-01')
    await page.waitForTimeout(1600)
    const req = calls.slice(before).find((c) => c.url.includes('createdAfter=2026-01-01'))
    check(
      !!req,
      'and it reaches the request as createdAfter, not dueAfter',
      calls.slice(before).map((c) => c.url).slice(-3).join(' | '),
    )
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
  check((await box.count()) > 0, 'the picker offers Docs — "yeh document ka" [07:58]')
  if ((await box.count()) > 0) {
    const before = calls.length
    await box.check()
    await page.waitForTimeout(1500)

    // It has to reach the server: this is a preference on the person, not the
    // browser they happen to be sitting at.
    const patch = calls
      .slice(before)
      .find((c) => c.method === 'PATCH' && c.url.includes('/users/me') && c.body.includes('topbarPinned'))
    check(!!patch, 'pinning writes topbarPinned', calls.slice(before).map((c) => c.method + ' ' + c.url).join(' | '))
    check(
      !!patch && patch.body.includes('docs'),
      'and names the tool that was pinned',
      patch?.body?.slice(0, 140),
    )
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
    check(there, `a pinned ${tool} shows in the bar`)
    if (there) {
      const href = await el.first().getAttribute('href')
      check(
        !!href && href.startsWith(`/app/${WS}/`),
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

console.log('\n§7  any member can make a workspace; a guest cannot')
// ---------------------------------------------------------------------------
{
  // "WORKSPACE IS A FEATURE jo ke har member kar sakta hai — it's not
  // necessary ke humare paas kuch admin hi aaye jo kar sake" [09:29].
  const { ctx, page } = await openApp(`/app/${WS}/inbox`, {}, { role: 'member' })
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
  check((await unreadRow.count()) > 0 && (await readRow.count()) > 0, 'both replies show in the Inbox')

  if ((await unreadRow.count()) > 0 && (await readRow.count()) > 0) {
    check(
      (await unreadRow.getAttribute('data-unread')) === 'true',
      'the unread one is marked unread',
    )
    check(
      (await readRow.getAttribute('data-unread')) === 'false',
      'and the read one is not',
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
    check(
      !!unreadStyle && !!readStyle && JSON.stringify(unreadStyle) !== JSON.stringify(readStyle),
      'and they are painted differently — the glance she describes',
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
process.exit(failed === 0 ? 0 : 1)
