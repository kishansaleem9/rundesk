/**
 * §1.3 [10:13] — the SECOND-level panel collapses too.
 *
 * > "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai, aur jab
 * > hum kaam kar rahe hote hain to it's kind of frustrating"
 *
 * The outer sidebar's collapse shipped and was verified live, and it was half
 * the answer. On /chat we stacked 288px of workspace sidebar against 272px of
 * channel list; on /docs against a 240px tree that could sit beside two more
 * 300px panels. Collapsing only the outer column left the screen she was
 * pointing at still carrying two of them.
 *
 * This is measured rather than asserted from markup: the claim is about SPACE,
 * so the checks read bounding boxes. The one that matters most is the last —
 * a second browser context, signed in fresh, opening the panel collapsed,
 * because a preference stored only in localStorage is a preference that is
 * forgotten on the next machine.
 *
 *   node test/e2e/panel-collapse.mjs --api 3011 --dist apps/web/dist
 *   BASE=https://rundesk.theaura.agency node test/e2e/panel-collapse.mjs
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
const EXPECTED_CHECKS = 56

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

  // Start from a known state: the checks below are about what a collapse does,
  // not about what this account happened to leave behind last time.
  await A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {} } })
  restore = () => A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {} } })

  const origin = REMOTE
    ? BASE
    : await (async () => {
        stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
        return stack.base
      })()

  browser = await chromium.launch(LAUNCH)
  const signIn = async (page) => {
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', ADMIN.email)
    await page.fill('input[type=password]', ADMIN.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  }

  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await signIn(page)

  // ---------------------------------------------------------------------
  console.log('\n▶ the chat channel list collapses')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const panel = page.getByTestId('chat-panel')
  check(await panel.isVisible().catch(() => false), 'the channel list starts expanded')
  const wide = await panel.boundingBox()
  check(Math.round(wide?.width ?? 0) === 272, 'and is 272px wide — half the double navigation', `${wide?.width}`)

  await page.getByTestId('chat-panel-collapse').click()
  await page.waitForTimeout(1400)
  const rail = page.getByTestId('chat-panel-rail')
  check(await rail.isVisible().catch(() => false), 'collapsing leaves a rail')
  const narrow = await rail.boundingBox()
  check(Math.round(narrow?.width ?? 0) === 56, 'at 56px, not zero — channels stay one click away', `${narrow?.width}`)
  check(
    Math.round((wide?.width ?? 0) - (narrow?.width ?? 0)) === 216,
    'reclaiming 216px of chrome, which is the whole complaint',
    `${wide?.width} -> ${narrow?.width}`,
  )
  const railButtons = await page.locator('[data-testid="chat-panel-rail"] button').count()
  check(railButtons > 1, 'and the rail still carries the channels', `${railButtons} buttons`)

  // ---------------------------------------------------------------------
  console.log('\n▶ …and a SECOND browser opens it collapsed')
  // ---------------------------------------------------------------------
  // The point of storing this on the person rather than the browser. A local
  // -only preference passes every check above and still fails the user the
  // first time they sit at another machine.
  await page.waitForTimeout(1800)
  const other = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await signIn(other)
  await other.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  await other.waitForTimeout(4500)
  check(
    await other.getByTestId('chat-panel-rail').isVisible().catch(() => false),
    'the preference is the person’s, not the machine’s',
    'a fresh context showed the expanded list',
  )
  await other.close()

  await page.getByTestId('chat-panel-expand').click()
  await page.waitForTimeout(1400)
  check(await page.getByTestId('chat-panel').isVisible().catch(() => false), 'and it expands again')

  // ---------------------------------------------------------------------
  console.log('\n▶ the docs tree collapses independently')
  // ---------------------------------------------------------------------
  await page.goto(`${origin}/app/${workspaceId}/docs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const tree = page.getByTestId('docs-tree')
  check(await tree.isVisible().catch(() => false), 'the page tree starts expanded')
  const treeWide = await tree.boundingBox()
  check(Math.round(treeWide?.width ?? 0) === 240, 'at 240px', `${treeWide?.width}`)

  await page.getByTestId('docs-tree-collapse').click()
  await page.waitForTimeout(1400)
  const strip = await page.getByTestId('docs-tree-rail').boundingBox()
  check(Math.round(strip?.width ?? 0) === 48, 'collapsing leaves a 48px strip', `${strip?.width}`)

  await page.waitForTimeout(1500)
  const me = await A('/users/me')
  check(
    me.data?.panelsCollapsed?.docs === true && me.data?.panelsCollapsed?.chat === false,
    'collapsing the docs tree said nothing about the chat list',
    JSON.stringify(me.data?.panelsCollapsed),
  )

  await page.getByTestId('docs-tree-expand').click()
  await page.waitForTimeout(1400)
  check(await page.getByTestId('docs-tree').isVisible().catch(() => false), 'and the tree comes back')

  // ---------------------------------------------------------------------
  console.log('\n▶ Which doc is open is an address')
  // ---------------------------------------------------------------------
  /*
   * `?doc=` was read once at mount out of window.location.search and never
   * written — docs-panel.tsx contained no navigate at all. So clicking a page
   * changed nothing in the address, a reload put you on whichever doc sorted
   * first, and copying the address bar sent the docs index. The app was
   * already generating this exact link: the insert menu writes
   * /app/<ws>/docs?doc=<id> into doc bodies, and the search indexer builds it.
   */
  const DOC_A = `addr probe A ${Date.now()}`
  const DOC_B = `addr probe B ${Date.now()}`
  const docA = await A(`/workspaces/${workspaceId}/docs`, { method: 'POST', body: { title: DOC_A } })
  const docB = await A(`/workspaces/${workspaceId}/docs`, { method: 'POST', body: { title: DOC_B } })
  const idA = docA.data?.id
  const idB = docB.data?.id

  if (!idA || !idB) {
    check(false, 'could not seed two docs to switch between')
    check(false, 'so the doc address was never exercised')
    check(false, 'and neither was the bucket rail')
  } else {
    await page.goto(`${origin}/app/${workspaceId}/docs`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    check(
      /[?&]doc=/.test(page.url()),
      'landing on /docs names the doc it opened',
      page.url(),
    )

    await page.getByTestId(`docs-tree-item-${idB}`).first().click()
    await page.waitForTimeout(1800)
    check(page.url().includes(`doc=${idB}`), 'clicking a page puts it in the address', page.url())

    /*
     * The point of an address: reopening it returns the SAME doc rather than
     * whichever sorts first. Asserted on the active-doc heading, not on page
     * text — the tree lists every doc, so "DOC_B appears somewhere" is true
     * even when the editor is showing something else, and it passed against
     * the unfixed code for exactly that reason.
     */
    const opened = page.url()
    await page.goto(`${origin}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.goto(opened, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    const activeTitle = await page.getByTestId('docs-active-title').innerText().catch(() => '')
    check(
      activeTitle.includes(DOC_B),
      `and reopening that address returns the same doc (${activeTitle.trim()})`,
      `the editor opened "${activeTitle.trim()}" instead`,
    )

    await A(`/docs/${idA}`, { method: 'DELETE' }).catch(() => {})
    await A(`/docs/${idB}`, { method: 'DELETE' }).catch(() => {})
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ A dashboard preset you can share is a preset you can link')
  // ---------------------------------------------------------------------
  /*
   * Presets carry shareCount / isSharedWithMe and have a Share dialog on every
   * row, but the route declared no search schema at all — which one you were
   * looking at was component state. Share "Q3 Exec", send the URL, and the
   * recipient lands on the Overview tab and has to hunt for it; your own
   * reload does the same to you.
   */
  const PRESET = `addr preset ${Date.now()}`
  // POST /dashboards with workspaceId in the body, and `layout` an array —
  // CreateDashboardPresetDto validates both.
  const preset = await A('/dashboards', {
    method: 'POST',
    body: { workspaceId, name: PRESET, layout: [] },
  })
  const presetId = preset.data?.id
  if (!presetId) {
    check(false, 'could not create a preset to link to')
    check(false, 'so the preset address was never exercised')
  } else {
    await page.goto(`${origin}/app/${workspaceId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    check(!/[?&]preset=/.test(page.url()), 'the dashboard starts with no preset in the address', page.url())

    // Custom is where presets are listed.
    await page.getByText('Custom', { exact: false }).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const row = page.getByTestId(`dashboard-preset-${presetId}`)
    if ((await row.count()) === 0) {
      check(false, `the preset "${PRESET}" was not listed to click`)
    } else {
      await row.first().click()
      await page.waitForTimeout(1800)
      check(
        page.url().includes(`preset=${presetId}`),
        'choosing a preset puts it in the address',
        page.url(),
      )
    }
    await A(`/dashboards/${presetId}`, { method: 'DELETE' }).catch(() => {})
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ …and the keyboard does it too')
  // ---------------------------------------------------------------------
  /*
   * §1.3 [10:46] — "kyunke yeh SPACE leta hai, aur jab hum kaam kar rahe hote
   * hain to it's kind of frustrating."
   *
   * The chord is advertised in the shortcuts overlay and handled in the
   * sidebar, and the frame cross-check found that nothing had ever pressed it.
   * A shortcut listed in a help panel and wired to nothing is worse than an
   * unlisted one: the person learns it, uses it mid-task, and concludes the app
   * is broken.
   *
   * The third check is the one worth having. `\` is an ordinary character, so
   * the handler deliberately stands down inside a text field — and that guard
   * is pure omission. Nothing about the sidebar looks wrong if it is dropped;
   * you only find out when somebody types a Windows path into a task title and
   * their sidebar disappears.
   */
  /*
   * Put the sidebar back to expanded FIRST, and on the server.
   *
   * `toggle()` writes through to the user record, so the collapse survives the
   * browser context, the port and the run. Written the first time without this,
   * the section passed on a machine where an earlier run had left it collapsed:
   * "the chord collapsed it" was true before a key was pressed, and a build
   * with the handler deleted outright still went green on that line. Which is
   * the whole reason these are pressed against a deliberately broken build
   * before being believed.
   */
  await A('/users/me', { method: 'PATCH', body: { sidebarCollapsed: false } })
  restore = () =>
    A('/users/me', { method: 'PATCH', body: { panelsCollapsed: {}, sidebarCollapsed: false } })

  await page.goto(`${origin}/app/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  /*
   * `data-collapsed` on the <aside>, not `aria-expanded` on a toggle. The rail
   * and the full sidebar are different branches with a button each, so a
   * `querySelector` for the toggle answers about whichever branch happens to be
   * mounted — which is the state being measured. The attribute is on the one
   * element that is present either way.
   */
  const sidebarState = () =>
    page.evaluate(() => document.querySelector('[data-testid="workspace-sidebar"]')?.getAttribute('data-collapsed') ?? null)
  const settlesTo = (want) =>
    page
      .waitForFunction(
        (w) => document.querySelector('[data-testid="workspace-sidebar"]')?.getAttribute('data-collapsed') === w,
        want,
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false)

  check((await sidebarState()) === 'false', 'the workspace sidebar starts expanded', `data-collapsed=${await sidebarState()}`)

  // Ctrl rather than Meta: the handler accepts either, and Meta is not the
  // modifier on the platform CI runs on.
  await page.keyboard.press('Control+\\')
  const collapsedByKey = await settlesTo('true')
  check(collapsedByKey, 'Ctrl+\\ collapses it without reaching for the mouse', 'the chord did nothing')

  /*
   * Everything below asks whether a state CHANGED, so it can only be asked
   * once a change has happened. Run unconditionally, both of these go green on
   * a build where the chord is not wired at all — the sidebar never left
   * expanded, so "it came back" and "it did not collapse while typing" are
   * both true and both meaningless. Said as failures with the reason attached
   * rather than skipped, because the behaviour really is broken.
   */
  if (!collapsedByKey) {
    check(false, 'and pressing it again brings it back', 'never collapsed, so expanding could not be tested')
    check(false, 'with the caret in a text field', 'the chord does nothing, so the typing guard is untestable')
    check(false, 'typing a backslash does NOT collapse the sidebar out from under you', 'the chord does nothing at all')
  } else {
    await page.keyboard.press('Control+\\')
    check(await settlesTo('false'), 'and pressing it again brings it back', 'the chord collapsed but could not expand')

    // Now the guard: the same chord, with the caret in a text field. Asserted
    // against the expanded state re-established above, so "it did not move"
    // means the guard held rather than that nothing was listening.
    const composer = page.locator('textarea, [contenteditable="true"], input[type="text"]').first()
    if ((await composer.count()) === 0) {
      check(false, 'with the caret in a text field', 'no text field on this page to test the guard against')
      check(false, 'typing a backslash does NOT collapse the sidebar out from under you', 'nowhere to type')
    } else {
      await composer.click({ timeout: 5000 }).catch(() => {})
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      })
      check(focused, 'with the caret in a text field', 'could not focus a text field, so the guard was never exercised')
      await page.keyboard.press('Control+\\')
      await page.waitForTimeout(1200)
      check(
        (await sidebarState()) === 'false',
        'typing a backslash does NOT collapse the sidebar out from under you',
        'the sidebar collapsed while somebody was typing',
      )
    }
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ G12-8 — a notification can be put back to unread')
  // ---------------------------------------------------------------------
  /*
   * The Inbox could mark read, mark ALL read, clear one and clear all — and had
   * no way back from the first. Opening a notification to see what it was
   * destroyed the only signal that you had not dealt with it yet.
   *
   * Driven through the API for the setup (seed a row, read it) so the state is
   * known, then through the UI for the act, then read back off the server —
   * a button that toggles a class and posts nothing looks identical on screen.
   */
  await A('/notifications/test', { method: 'POST', body: { workspaceId } })
  const seeded = ((await A('/notifications?view=inbox')).data ?? []).find((n) => n.type === 'test_notification')
  check(!!seeded, 'a notification exists to mark unread', 'could not seed one')
  if (seeded) {
    await A(`/notifications/${seeded.id}/read`, { method: 'POST' })
    const afterRead = ((await A('/notifications?view=inbox')).data ?? []).find((n) => n.id === seeded.id)
    check(!!afterRead?.readAt, 'and it can be marked read first', `readAt=${afterRead?.readAt}`)

    await page.goto(`${origin}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    const row = page.getByTestId(`notif-${seeded.id}`)
    if ((await row.count()) === 0) {
      check(false, 'the read row is on the Inbox', 'the seeded row did not render')
    } else {
      await row.hover()
      await page.waitForTimeout(400)
      const btn = page.getByTestId(`notif-unread-${seeded.id}`)
      const offered = await btn.isVisible().catch(() => false)
      check(offered, 'a read row offers Mark unread', 'no way back from read')
      if (offered) {
        await btn.click()
        await page.waitForTimeout(2000)
        const afterUnread = ((await A('/notifications?view=inbox')).data ?? []).find((n) => n.id === seeded.id)
        check(afterUnread?.readAt == null, 'and pressing it really un-reads it', `readAt=${afterUnread?.readAt}`)
      }
    }
    await A(`/notifications/${seeded.id}/clear`, { method: 'POST' }).catch(() => {})
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ G12-7 — Replies is somewhere you can go')
  // ---------------------------------------------------------------------
  /*
   * The Replies page shipped and was reachable only from the command palette,
   * so a reply you were notified about had nowhere you could go and look. It
   * belongs next to the Inbox because it answers the same question.
   */
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const repliesLink = page.locator(`[data-testid="workspace-sidebar"] a[href$="/replies"]`).first()
  const hasReplies = (await repliesLink.count()) > 0
  check(hasReplies, 'the sidebar carries a Replies entry', 'Replies is still palette-only')
  if (hasReplies) {
    await repliesLink.click()
    await page.waitForTimeout(2500)
    check(/\/replies$/.test(new URL(page.url()).pathname), 'and it goes to the Replies page', page.url())
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ G09-5 — on a phone there is navigation at all')
  // ---------------------------------------------------------------------
  /*
   * The sidebar is `hidden lg:flex`, and the hamburger in AppTopbar renders
   * only when it is handed `onMenuOpen` — which nothing ever passed. So the
   * breakpoint existed, the control existed, and below 1024px the app had NO
   * way to move between pages. Checked at 390x844, which is a phone, not a
   * narrow desktop.
   */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const small = await phone.newPage()
  await signIn(small)
  await small.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await small.waitForTimeout(3500)

  check(
    !(await small.getByTestId('workspace-sidebar').isVisible().catch(() => false)),
    'the docked sidebar is correctly hidden on a phone',
    'the full sidebar is on screen at 390px',
  )
  /*
   * By testid. Matched by accessible name (/open sidebar|menu/i) this passed
   * with the hamburger unmounted entirely — it was finding a different button
   * whose label happens to contain "menu". A check that green-lights the exact
   * bug it exists to catch is worse than no check.
   */
  const burger = small.getByTestId('nav-menu-open')
  const hasBurger = await burger.isVisible().catch(() => false)
  check(hasBurger, 'and a menu button is offered instead', 'no way to open navigation below 1024px')

  if (hasBurger) {
    await burger.click()
    const drawer = await small
      .getByTestId('workspace-sidebar-drawer')
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false)
    check(drawer, 'which opens the navigation', 'the menu button opened nothing')
    if (drawer) {
      const links = await small.locator('[data-testid="workspace-sidebar-drawer"] a').count()
      check(links >= 3, `carrying the destinations (${links} links)`, `only ${links} link(s) in the drawer`)
      // A nav that stays open over the page it navigated to is its own dead end.
      await small.locator('[data-testid="workspace-sidebar-drawer"] a').first().click().catch(() => {})
      await small.waitForTimeout(1200)
      check(
        !(await small.getByTestId('workspace-sidebar-drawer').isVisible().catch(() => false)),
        'and closes once you go somewhere',
        'the drawer stayed open over the page it opened',
      )
    }
  }
  await phone.close()

  // ---------------------------------------------------------------------
  console.log('\n▶ G09-7 — "Reset dock position" actually resets it')
  // ---------------------------------------------------------------------
  /*
   * The menu item dispatched `rundesk:reset-dock` and nothing listened, so the
   * only escape for a dock dragged off-screen did nothing at all. Driven by
   * putting the dock somewhere absurd first — otherwise "it is at 16,16
   * afterwards" is true before the button is pressed.
   */
  await page.evaluate(() =>
    localStorage.setItem('rundesk.floatingDockPos', JSON.stringify({ x: 900, y: 700 })),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const dockLeft = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="floating-dock"]')
      return el ? Math.round(el.getBoundingClientRect().left) : null
    })
  const moved = await dockLeft()
  check(moved !== null && moved > 400, `the dock can be moved away (left=${moved})`, `dock left=${moved}`)
  if (moved !== null && moved > 400) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('rundesk:reset-dock')))
    const back = await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="floating-dock"]')
          return !!el && el.getBoundingClientRect().left < 100
        },
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false)
    check(back, 'and Reset dock position brings it home', 'the reset event did nothing')
    check(
      await page.evaluate(() => localStorage.getItem('rundesk.floatingDockPos') === null),
      'and forgets the old spot, so a reload does not undo it',
      'the stored position survived the reset',
    )
  }

  /*
   * ---------------------------------------------------------------------
   * G07-7 [08:29–08:31] — the dock carries what the user chose
   *
   * > "hum limited de dein … woh us ko choose karna parega"
   *
   * The settings panel offered Orientation, Opacity, Size and Reset —
   * everything about how the dock LOOKS and nothing about what is in it. The
   * `pinned_links` column and its endpoint had existed the whole time with
   * nothing in the web app ever writing to them, which is the defect class
   * this audit keeps turning up: built, and joined to nothing.
   *
   * Driven through the real panel and read back off the API, because a
   * checkbox that toggles local state and never persists looks identical on
   * screen to one that works.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G07-7 — the dock carries the tools the user picked')
  /*
   * Reset to the default set first, and put it back afterwards.
   *
   * `pinnedLinks` persists per user per workspace, so a run that died between
   * the two toggles below left Docs switched off — and the NEXT run then
   * failed on "Docs is in the dock to begin with" for a reason that had
   * nothing to do with the code. A break test surfaced exactly that cascade.
   */
  const DEFAULT_DOCK = ['home', 'inbox', 'chat', 'ai', 'docs', 'dashboards', 'settings']
  await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { pinnedLinks: DEFAULT_DOCK } })
  const priorRestore = restore
  restore = async () => {
    await priorRestore?.()
    await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { pinnedLinks: DEFAULT_DOCK } })
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const dockSettings = page.locator('[title="Dock settings"], [data-testid="floating-dock"] button').first()
  await dockSettings.click().catch(() => {})
  await page.waitForTimeout(800)
  const picker = page.getByTestId('dock-tool-picker')
  check(
    await picker.isVisible().catch(() => false),
    'dock settings offers what goes in it, not only how it looks',
  )

  const docsToggle = page.getByTestId('dock-tool-toggle-docs')
  if (!(await docsToggle.count())) {
    check(false, 'a tool can be turned off', 'no docs toggle in the picker')
    check(false, 'and the choice is stored on the person, not the browser', 'skipped')
    check(false, 'and the dock stops carrying it', 'skipped')
    check(false, 'and turning it back on brings it back', 'skipped')
  } else {
    const wasOn = await docsToggle.isChecked()
    check(wasOn, 'Docs is in the dock to begin with', 'docs was not in the default set')
    await docsToggle.click()
    await page.waitForTimeout(1800)

    // Read back from the API: this is the half a screenshot cannot show.
    const stored = await A(`/dashboards/dock/${workspaceId}`)
    check(
      Array.isArray(stored.data?.pinnedLinks) && !stored.data.pinnedLinks.includes('docs'),
      'and the choice is stored on the person, not the browser',
      `pinnedLinks=${JSON.stringify(stored.data?.pinnedLinks)}`,
    )
    check(
      (await page.getByTestId('dock-tool-docs').count()) === 0,
      'and the dock stops carrying it',
      'the dock still shows a tool that was switched off',
    )

    await docsToggle.click()
    await page.waitForTimeout(1800)
    check(
      (await page.getByTestId('dock-tool-docs').count()) > 0,
      'and turning it back on brings it back',
      'the tool did not return',
    )

    /*
     * "I want none" is an answer, and it is not the same as "never chose".
     *
     * An absent value falls back to the default set; an empty array must not.
     * The obvious `stored?.length ? stored : DEFAULT` reads the two as one and
     * silently repopulates the dock somebody just emptied — a break test using
     * exactly that expression failed nothing until this check existed, because
     * every other case has a non-empty list.
     */
    await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { pinnedLinks: [] } })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    check(
      (await page.locator('[data-testid^="dock-tool-"]').count()) === 0,
      'and emptying it entirely is respected, not treated as "never chose"',
      `${await page.locator('[data-testid^="dock-tool-"]').count()} tool(s) came back`,
    )
    await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { pinnedLinks: DEFAULT_DOCK } })
  }

  /*
   * ---------------------------------------------------------------------
   * G04-7 [05:29] / G07-6 [08:26–08:31] — the sidebar arrangement is the
   * person's, not the browser's
   *
   * FAVORITES and RECENTS lived in localStorage while everything else about a
   * user — theme, locale, notification preferences, and the dock appearance in
   * that very same row — was server-persisted. Sign in on another machine, or
   * open a private window, and a sidebar somebody had arranged reverted to
   * four hard-coded defaults.
   *
   * G07-6 adds a second complaint: the only way to ADD a favourite was the
   * star on a RECENTS row, so a page you had never opened could not be
   * favourited at all — you had to visit it, find it in Recents, then star it.
   * ---------------------------------------------------------------------
   */
  console.log('\n▶ G04-7 / G07-6 — the sidebar you arranged follows you')
  await A(`/dashboards/dock/${workspaceId}`, {
    method: 'POST',
    body: { navFavorites: null, navRecents: null },
  })
  const priorRestore2 = restore
  restore = async () => {
    await priorRestore2?.()
    await A(`/dashboards/dock/${workspaceId}`, {
      method: 'POST',
      body: { navFavorites: null, navRecents: null },
    })
  }
  await page.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // Templates: a Browse row, and one this run has never navigated to — which
  // is exactly the page the old star-on-Recents could not reach.
  const star = page.getByTestId('nav-favorite-templates')
  check(
    (await star.count()) > 0,
    'a page you have never opened can still be favourited',
    'no star on a Browse row — favouriting still needs a visit first',
  )
  if ((await star.count()) === 0) {
    check(false, 'and the choice is stored on the account', 'skipped')
    check(false, 'so a different browser sees it too', 'skipped')
    check(false, 'and an emptied list is not silently refilled', 'skipped')
  } else {
    await star.click({ force: true })
    await page.waitForTimeout(2000)

    const saved = await A(`/dashboards/dock/${workspaceId}`)
    check(
      (saved.data?.navFavorites ?? []).some((f) => String(f.path).endsWith('/templates')),
      'and the choice is stored on the account',
      `navFavorites=${JSON.stringify(saved.data?.navFavorites)}`,
    )

    /*
     * The claim itself: a brand-new context has no localStorage at all, so
     * this is the "another machine" case rather than a reload.
     */
    const fresh = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
    await signIn(fresh)
    await fresh.goto(`${origin}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
    await fresh.waitForTimeout(4500)
    /*
     * Scoped to the FAVORITES list, not the whole sidebar.
     *
     * Templates is a permanent Browse row, so `/Templates/` over the sidebar's
     * text is true whether or not anything was ever favourited — a check that
     * cannot fail. Only its presence in this container means the star did
     * something that crossed a machine.
     */
    const freshFavorites = (await fresh
      .getByTestId('nav-favorites-list')
      .innerText()
      .catch(() => '')).replace(/\s+/g, ' ')
    check(
      /Templates/i.test(freshFavorites),
      'so a different browser sees it too',
      `fresh favourites: ${freshFavorites.slice(0, 120) || '(none rendered)'}`,
    )
    await fresh.close()

    // "I want none" is an answer here too: an empty list must not be read as
    // "never arranged it" and refilled with Inbox/Teams/Docs/Dashboards.
    await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { navFavorites: [] } })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    /*
     * Read off the SIDEBAR, not the API.
     *
     * The failure this guards is a client-side read: `Array.isArray(stored) &&
     * stored.length` falls through to the defaults branch, which sets the four
     * hard-coded rows on screen WITHOUT writing them back. The stored value
     * stays `[]`, so an API-side assertion passes while the user is looking at
     * a list they deleted — which is exactly what a break using that
     * expression did.
     */
    const emptied = (await page
      .getByTestId('nav-favorites-list')
      .innerText()
      .catch(() => '')).replace(/\s+/g, ' ')
    check(
      !/Dashboards/i.test(emptied) && !/Templates/i.test(emptied),
      'and an emptied list is not silently refilled',
      `favourites still showing: ${emptied.slice(0, 120)}`,
    )

    /*
     * …and there is a way back. `null` means "never arranged it", so the
     * defaults return.
     *
     * This exists because folding null in with the array case made clearing
     * impossible — navList(null) returns [], so a reset stored a deliberate
     * empty list. It surfaced as a CROSS-SUITE failure: this suite's teardown
     * passed null, left [] behind, and video-regression then reported Docs and
     * Dashboards missing from the sidebar. A check that only ever sets a list
     * cannot see that, so it is driven here.
     */
    await A(`/dashboards/dock/${workspaceId}`, { method: 'POST', body: { navFavorites: null } })
    const cleared = await A(`/dashboards/dock/${workspaceId}`)
    check(
      cleared.data?.navFavorites === null,
      'and clearing it restores "never arranged", not an empty list',
      `navFavorites=${JSON.stringify(cleared.data?.navFavorites)}`,
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    const restored = (await page
      .getByTestId('nav-favorites-list')
      .innerText()
      .catch(() => '')).replace(/\s+/g, ' ')
    check(
      /Docs/i.test(restored) && /Dashboards/i.test(restored),
      'so the defaults come back on screen',
      `favourites: ${restored.slice(0, 120)}`,
    )
  }

  // ---------------------------------------------------------------------
  console.log('\n▶ the space tree can be searched')
  // ---------------------------------------------------------------------
  /*
   * Seeded with THREE spaces, and the target list buried in one of them.
   *
   * The seeded workspace has a single space. Against that, a filter that
   * matched everything and a filter that worked would both leave one row on
   * screen and both read as a pass — the same shape as the forward modal's
   * ten-item cap, which only showed itself past the tenth conversation.
   *
   * The list is what gets typed, not the space. Matching only top-level names
   * would hide every list whose space is called something else, which is most
   * of them, and that failure is invisible if you search for a space name.
   */
  {
    const tag = Date.now()
    const names = [`treefind-alpha-${tag}`, `treefind-beta-${tag}`, `treefind-gamma-${tag}`]
    const madeSpaces = []
    for (const name of names) {
      const sp = await A(`/spaces`, { method: 'POST', body: { workspaceId, name } })
      if (sp.data?.id) madeSpaces.push(sp.data.id)
    }
    const LIST_NEEDLE = `needle-list-${tag}`
    let listMade = false
    if (madeSpaces.length === 3) {
      const proj = await A(`/projects`, {
        method: 'POST',
        body: { spaceId: madeSpaces[2], name: `treefind-project-${tag}` },
      })
      if (proj.data?.id) {
        const list = await A(`/lists`, {
          method: 'POST',
          body: { projectId: proj.data.id, name: LIST_NEEDLE },
        })
        listMade = !!list.data?.id
      }
    }
    check(madeSpaces.length === 3 && listMade, 'three spaces and a buried list could be seeded',
      `spaces=${madeSpaces.length} list=${listMade}`)

    const cleanupTree = async () => {
      for (const id of madeSpaces) await A(`/spaces/${id}`, { method: 'DELETE' }).catch(() => {})
    }

    try {
      if (madeSpaces.length === 3 && listMade) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(4000)

        const rows = () => page.locator('[data-testid^="space-link-"]').count()
        const box = page.getByTestId('tree-filter')
        check(await box.isVisible().catch(() => false), 'the tree has a search box')

        const before = await rows()
        check(before >= 3, `all the spaces are listed to begin with (${before})`)

        // Typing a LIST name: its space survives, the other two do not.
        await box.fill(LIST_NEEDLE)
        await page.waitForTimeout(900)
        const narrowed = await rows()
        check(
          narrowed === 1,
          `searching a list name narrows to the one space holding it (${narrowed} of ${before})`,
          `${narrowed} spaces still shown — the filter is not matching descendants`,
        )
        check(
          await page.locator(`text=${JSON.stringify(LIST_NEEDLE)}`).first().isVisible().catch(() => false),
          'and the list itself is on screen without expanding anything',
          'the match is in the tree but still hidden inside a collapsed space',
        )

        await box.fill(`nothing-matches-${tag}`)
        await page.waitForTimeout(700)
        /*
         * Read for words, not for the element.
         *
         * The first version asked `isVisible()`, and that passed with the
         * message emptied to `{''}` — the div still renders, still has
         * padding, still has a box. It was checking that a container existed,
         * which is the opposite of what "says so" means. Break-testing is the
         * only reason that showed up.
         */
        const emptyText = (
          await page.getByTestId('tree-filter-empty').innerText().catch(() => '')
        ).trim()
        check(
          emptyText.length > 0,
          `a search that matches nothing says so ("${emptyText}")`,
          'an empty tree renders blank, or an empty box with nothing in it',
        )

        await page.getByTestId('tree-filter-clear').click()
        await page.waitForTimeout(900)
        const after = await rows()
        check(after === before, `clearing brings every space back (${after})`, `${after} vs ${before}`)
      } else {
        for (const label of [
          'the tree has a search box',
          'all the spaces are listed to begin with',
          'searching a list name narrows to the one space holding it',
          'and the list itself is on screen without expanding anything',
          'a search that matches nothing says so',
          'clearing brings every space back',
        ]) {
          check(false, label, 'seeding failed')
        }
      }
    } finally {
      await cleanupTree()
    }
  }

  await done(browser, stack, restore)
} catch (err) {
  console.error(`\n\x1b[31m✗ ${err?.stack ?? err}\x1b[0m`)
  failed++
  await done(browser, stack, restore)
}
