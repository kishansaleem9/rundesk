/**
 * A MENU PRESSED WHILE IT IS STILL CLOSING OPENS, AND STAYS OPEN
 * (`found-30-sep/menus-drop-a-press-while-closing`).
 *
 * A closed `DropdownMenu` (the shared `@rundesk/ui` one, Radix underneath)
 * stays in the page through its exit animation: Radix's Presence keeps it
 * mounted until `animationend`, and its DismissableLayer keeps a `pointerdown`
 * listener on the document for as long as it is mounted. A press on the
 * menu's button in that window re-opens the menu from React's root listener,
 * and the same press then bubbles on to the document, where the leaving layer
 * counts it as a press outside and dismisses the menu it has just become. The
 * menu opened and shut on one press, a few milliseconds apart. It was measured
 * on the create modal's Templates menu first: 2 rounds of 6 under load. Here,
 * on lane 6's build of the unchanged web, all four menus below did it on every
 * run: open again 4–16 ms after the press, then shut 3–8 ms later, by the
 * leaving layer's `pointerDownOutside`.
 *
 * ClickUp (help centre, "Task settings menu" and "List, Folder, and Space
 * settings", read through search results): "In the upper-right corner, click
 * the ellipsis ... icon to open the task settings menu"; a List's settings are
 * opened by clicking "the ellipsis (...) icon to the right of a List". A press
 * on a menu's button opens its menu; nothing there makes that depend on how
 * long ago the menu last closed.
 *
 * DRIVEN, NOT RACED. The window is the exit animation, 150 ms on an idle
 * machine, so a suite that presses "soon after" Escape measures the machine.
 * Here the page itself holds the exit where it starts: a MutationObserver sees
 * the menu's `data-state` turn `closed` and pauses the animation the exit
 * started, so the old menu stays in the page, leaving, for as long as the
 * press takes to arrive. Holding it changes nothing but the time — Presence
 * is still waiting for the same `animationend`, and the leaving layer still
 * listens — and each round asserts that the press did land in the window (the
 * old menu in the page with `data-state="closed"`), so a round that missed it
 * fails rather than passing for nothing. Then the exit is let go, and the menu
 * is read once it has stopped animating and the page's own clock has run two
 * of its animations' length past the press. A build whose menus had no exit
 * animation would have no window to press in, and the rounds would say so
 * here rather than pass: a fix of that kind changes these checks too.
 *
 * Four menus on the component, on three surfaces: the task sheet's ⋯, the
 * sidebar's ⋯ on a list and + on a space, and the top bar's user menu. And one
 * menu opened and closed the ordinary way, so a fix that stops a menu closing
 * cannot pass here.
 *
 *   node test/e2e/menu-reopen.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client (`suite-hygiene/apiAs-duplicated-62`); it
 * answers status 0 when nothing answers. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`

const TAG = `e2e-menu-reopen-${Date.now()}`

/**
 * WATCHED IN THE PAGE, installed before the app's first script (`addInitScript`).
 *
 * A menu is found by its button: Radix labels the content with the button's id
 * (`aria-labelledby`) whether it is open or leaving. For each button watched,
 * every change of its menu — `open`, `closed` (leaving), `gone` — is logged
 * with the page's clock. Every press is logged in the capture phase, before the
 * app sees it, with the state each watched menu was in at that moment. And one
 * exit at a time can be held: armed for a button, the next time its menu reads
 * `closed` the animations then running on it are paused, and `release` plays
 * whichever of them is still paused.
 *
 * For a failing check's reason only, and never its verdict: the outside-press
 * and focus-outside events Radix's layers dispatch (non-bubbling, so read in
 * the capture phase), and whether the menu's handler refused each one.
 */
const INSTRUMENT = () => {
  if (window.__menus) return
  const contentOf = (id) => {
    for (const el of document.querySelectorAll('[role="menu"]')) {
      if (el.getAttribute('aria-labelledby') === id) return el
    }
    return null
  }
  const stateOf = (id) => {
    const el = contentOf(id)
    return el ? el.getAttribute('data-state') || 'unknown' : 'gone'
  }
  const menus = { presses: [], log: [], outside: [], watched: new Map(), animMs: new Map(), hold: null }
  window.__menus = menus
  const sweep = () => {
    for (const [id, last] of menus.watched) {
      const el = contentOf(id)
      if (el) {
        const ms = parseFloat(getComputedStyle(el).animationDuration) * 1000
        if (ms > 0) menus.animMs.set(id, ms)
      }
      const now = el ? el.getAttribute('data-state') || 'unknown' : 'gone'
      if (now !== last) {
        menus.watched.set(id, now)
        menus.log.push({ id, state: now, at: performance.now() })
      }
    }
    const hold = menus.hold
    if (hold && !hold.held) {
      const el = contentOf(hold.id)
      if (el && el.getAttribute('data-state') === 'closed') {
        const running = el.getAnimations().filter((a) => a.playState === 'running')
        if (running.length > 0) {
          for (const a of running) a.pause()
          hold.held = running
        }
      }
    }
  }
  new MutationObserver(sweep).observe(document, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'],
  })
  window.addEventListener('pointerdown', (e) => {
    const on = e.target instanceof Element ? e.target.closest('[aria-haspopup="menu"][id]') : null
    const states = {}
    for (const id of menus.watched.keys()) states[id] = stateOf(id)
    menus.presses.push({
      on: on ? on.id : null,
      states,
      held: !!(menus.hold && menus.hold.held && on && menus.hold.id === on.id),
      at: performance.now(),
    })
  }, true)
  for (const type of ['dismissableLayer.pointerDownOutside', 'dismissableLayer.focusOutside']) {
    window.addEventListener(type, (e) => {
      const seen = { type: type.slice('dismissableLayer.'.length), at: performance.now(), refused: null }
      menus.outside.push(seen)
      // Read once the dispatch has returned, when the handlers have had their say.
      queueMicrotask(() => { seen.refused = e.defaultPrevented })
    }, true)
  }
  menus.watch = (id) => {
    if (id && !menus.watched.has(id)) menus.watched.set(id, stateOf(id))
  }
  menus.arm = (id) => {
    menus.hold = id ? { id, held: null } : null
  }
  menus.release = () => {
    const hold = menus.hold
    menus.hold = null
    for (const a of hold?.held ?? []) if (a.playState === 'paused') a.play()
  }
  menus.read = (id) => {
    if (!id) return null
    const el = contentOf(id)
    const button = document.getElementById(id)
    const last = menus.presses[menus.presses.length - 1] ?? null
    return {
      state: el ? el.getAttribute('data-state') || 'unknown' : 'gone',
      shown: el ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : false,
      animating: el ? el.getAnimations().some((a) => a.playState === 'running') : false,
      animMs: menus.animMs.get(id) ?? 0,
      expanded: button ? button.getAttribute('aria-expanded') : null,
      held: !!(menus.hold && menus.hold.id === id && menus.hold.held),
      lastPress: last,
      sinceLastPress: last ? performance.now() - last.at : null,
      since: last
        ? menus.log.filter((l) => l.id === id && l.at >= last.at).map((l) => ({ state: l.state, ms: Math.round(l.at - last.at) }))
        : [],
      outside: last
        ? menus.outside.filter((o) => o.at >= last.at).map((o) => ({ type: o.type, ms: Math.round(o.at - last.at), refused: o.refused }))
        : [],
    }
  }
}

/** One menu as the page holds it; null when the page could not answer. */
const menuOf = (page, id) => page.evaluate((id) => window.__menus?.read(id) ?? null, id).catch(() => null)
/** Start logging one button's menu. */
const watch = (page, id) => page.evaluate((id) => window.__menus?.watch(id), id).catch(() => {})
/**
 * WAITS FOR WHAT IT READS: the menu has changed since the last press (every
 * press here changes one), it has stopped animating, and the page's own clock
 * has run two of its animations' length past the press. A menu the leaving
 * layer shut has finished leaving by then, and one that stays open has been
 * open for longer than any exit it could still be in. A press that changed
 * nothing is waited out, and its check then says what it found.
 */
const settle = (page, id) =>
  waitUntil(async () => {
    const m = await menuOf(page, id)
    return !!m && m.since.length > 0 && !m.animating && m.sinceLastPress !== null && m.sinceLastPress >= 2 * m.animMs
  }, { timeoutMs: 10_000 })
const gone = (page, id) => waitUntil(async () => (await menuOf(page, id))?.state === 'gone', { timeoutMs: 10_000 })
/** What a menu did after the last press, for a failing check's reason. */
const story = (m) =>
  !m
    ? 'the page could not be read'
    : `after the press its menu went ${m.since.map((s) => `${s.state} (+${s.ms} ms)`).join(', ') || 'nowhere'}; ` +
      `it is ${m.state}${m.shown ? ', drawn' : ', not drawn'}, the button says aria-expanded=${m.expanded}; ` +
      `when pressed it was ${JSON.stringify(m.lastPress?.states ?? null)}; a layer took the press as ` +
      `${m.outside.map((o) => `${o.type} (+${o.ms} ms, ${o.refused ? 'refused' : 'dismissing'})`).join(', ') || 'nothing outside'}`

/**
 * ONE ROUND: open the menu, close it with Escape with its exit held where it
 * starts, press its button again, let the exit go, and read the menu once it
 * has settled. Put away afterwards, so the next round starts from nothing.
 */
const pressWhileClosing = async (page, button) => {
  const id = await button.getAttribute('id', { timeout: 20_000 }).catch(() => null)
  await watch(page, id)
  await gone(page, id)
  await button.click({ timeout: 10_000 }).catch(() => {})
  const opened = await waitUntil(async () => {
    const m = await menuOf(page, id)
    return m?.state === 'open' && !m.animating
  }, { timeoutMs: 10_000 })
  await page.evaluate((id) => window.__menus?.arm(id), id).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  const held = await waitUntil(async () => (await menuOf(page, id))?.held === true, { timeoutMs: 5000 })
  await button.click({ timeout: 10_000 }).catch(() => {})
  await page.evaluate(() => window.__menus?.release()).catch(() => {})
  await settle(page, id)
  const after = await menuOf(page, id)
  await page.keyboard.press('Escape').catch(() => {})
  await gone(page, id)
  return { id, opened, held, after }
}
/** The press landed on the button while the menu it had closed was still leaving. */
const landedWhileLeaving = (r) =>
  r.held && r.after?.lastPress?.on === r.id && r.after.lastPress.held === true && r.after.lastPress.states?.[r.id] === 'closed'
const whyNotLeaving = (r) =>
  `the menu ${r.opened ? 'opened' : 'never opened'}; its exit ${r.held ? 'was held' : 'was never held — no exit animation was running when it closed'}; ` +
  `the last press was ${r.after?.lastPress ? `on ${r.after.lastPress.on === r.id ? 'its button' : JSON.stringify(r.after.lastPress.on)}, with the menu ${r.after.lastPress.states?.[r.id] ?? 'unwatched'}` : 'never seen'}`
/** Open now, drawn, the button saying so, and nothing but `open` since the press. */
const openAndStayed = (m) =>
  m?.state === 'open' && m.shown && m.expanded === 'true' && m.since.length > 0 && m.since.every((s) => s.state === 'open')

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let A = null
/** Made here and taken back in `finally`, read by its status. */
const workspacesMade = []
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)

  /* A WORKSPACE OF ITS OWN, so its sidebar holds this suite's space, project and list and nothing else. */
  const madeWs = await A('/workspaces', { method: 'POST', body: { name: `Menu reopen ${TAG}` } })
  if (madeWs.status >= 300 || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  const WS = madeWs.data.id
  workspacesMade.push(WS)
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Space ${TAG}` } })
  if (space.status >= 300 || !space.data?.id) throw new Error(`could not make a space: ${said(space)}`)
  const SPACE = space.data.id
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `Project ${TAG}` } })
  if (project.status >= 300 || !project.data?.id) throw new Error(`could not make a project: ${said(project)}`)
  const PROJECT = project.data.id
  const list = await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `List ${TAG}` } })
  if (list.status >= 300 || !list.data?.id) throw new Error(`could not make a list: ${said(list)}`)
  const LIST = list.data.id
  const task = await A('/tasks', { method: 'POST', body: { listId: LIST, title: `Task ${TAG}` } })
  if (task.status >= 300 || !task.data?.id) throw new Error(`could not make a task: ${said(task)}`)
  const TASK = task.data.id

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(INSTRUMENT)
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  /* The privacy banner swallows presses meant for what is behind it: dismissed as a person dismisses it. */
  const accept = page.locator('button:has-text("Accept")').first()
  if (await accept.isVisible().catch(() => false)) await accept.click({ timeout: 5000 }).catch(() => {})

  const listPage = `${stack.base}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`
  await page.goto(`${listPage}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
  const more = page.getByTestId('task-more-menu')
  await waitUntil(() => more.isVisible().catch(() => false), { timeoutMs: 25_000 })
  const moreId = await more.getAttribute('id', { timeout: 10_000 }).catch(() => null)
  await watch(page, moreId)

  console.log('\n▶ one press opens a menu, and one more closes it')
  await more.click({ timeout: 10_000 }).catch(() => {})
  await settle(page, moreId)
  const opened = await menuOf(page, moreId)
  chk(
    openAndStayed(opened) && opened.lastPress?.on === moreId && opened.lastPress.states?.[moreId] === 'gone',
    'one press on the task’s ⋯ opens its menu, and it stays open',
    story(opened),
  )

  /* Pressed where the button is: the open menu disables the rest of the page, so the press is the page's, as a person's is. */
  const moreBox = await more.boundingBox({ timeout: 5000 }).catch(() => null)
  if (moreBox) await page.mouse.click(moreBox.x + moreBox.width / 2, moreBox.y + moreBox.height / 2).catch(() => {})
  await settle(page, moreId)
  const shut = await menuOf(page, moreId)
  chk(
    shut?.state === 'gone' && shut.expanded === 'false' && shut.lastPress?.states?.[moreId] === 'open' &&
      !shut.since.some((s) => s.state === 'open'),
    'pressed again, the task’s ⋯ closes its menu, and it stays closed',
    moreBox ? story(shut) : 'the ⋯ had no box to press',
  )

  await gone(page, moreId)
  await more.click({ timeout: 10_000 }).catch(() => {})
  await settle(page, moreId)
  const openBeforeAway = (await menuOf(page, moreId))?.state === 'open'
  /*
   * On the sheet's own left padding, half way down: far from the menu and its
   * button, and a spot where a press does nothing when no menu is open. The
   * page's top-left corner is the sheet's overlay, which a press closes — so a
   * build whose menu never opened lost the sheet there, and every round after.
   */
  const sheetBox = await page.getByTestId('task-sheet').boundingBox({ timeout: 5000 }).catch(() => null)
  if (sheetBox) await page.mouse.click(sheetBox.x + 6, sheetBox.y + sheetBox.height / 2).catch(() => {})
  await settle(page, moreId)
  const away = await menuOf(page, moreId)
  chk(
    openBeforeAway && away?.state === 'gone' && away.expanded === 'false' && away.lastPress?.on === null &&
      away.lastPress.states?.[moreId] === 'open',
    'a press away from the open menu closes it',
    `the menu ${openBeforeAway ? 'was open' : 'was not open'} before the press; ${sheetBox ? story(away) : 'the sheet had no box to press beside'}`,
  )

  console.log('\n▶ a menu’s button pressed while that menu is still closing')
  const taskRound = await pressWhileClosing(page, more)
  chk(
    landedWhileLeaving(taskRound),
    'the task’s ⋯ is pressed again while the menu it closed is still leaving (in the page, data-state="closed")',
    whyNotLeaving(taskRound),
  )
  chk(
    openAndStayed(taskRound.after),
    'the task’s ⋯, pressed while its menu is leaving, opens the menu again, and it stays open',
    story(taskRound.after),
  )

  /* The sidebar and the top bar, with no task open over them. */
  await page.goto(listPage, { waitUntil: 'domcontentloaded' })
  const expand = async (testId) => {
    const toggle = page.getByTestId(testId)
    if ((await toggle.getAttribute('aria-expanded', { timeout: 20_000 }).catch(() => null)) === 'false') {
      await toggle.click({ timeout: 10_000 }).catch(() => {})
    }
  }
  await expand(`space-toggle-${SPACE}`)
  await expand(`project-toggle-${PROJECT}`)
  const listMenu = page.getByTestId(`list-actions-${LIST}`)
  await waitUntil(() => listMenu.isVisible().catch(() => false), { timeoutMs: 20_000 })

  const listRound = await pressWhileClosing(page, listMenu)
  chk(
    landedWhileLeaving(listRound),
    'the sidebar’s ⋯ on a list is pressed again while the menu it closed is still leaving (in the page, data-state="closed")',
    whyNotLeaving(listRound),
  )
  chk(
    openAndStayed(listRound.after),
    'the sidebar’s ⋯ on a list, pressed while its menu is leaving, opens the menu again, and it stays open',
    story(listRound.after),
  )

  const spaceRound = await pressWhileClosing(page, page.getByTestId(`space-create-open-${SPACE}`))
  chk(
    landedWhileLeaving(spaceRound),
    'the sidebar’s + on a space is pressed again while the menu it closed is still leaving (in the page, data-state="closed")',
    whyNotLeaving(spaceRound),
  )
  chk(
    openAndStayed(spaceRound.after),
    'the sidebar’s + on a space, pressed while its menu is leaving, opens the menu again, and it stays open',
    story(spaceRound.after),
  )

  const userRound = await pressWhileClosing(page, page.getByTestId('user-menu'))
  chk(
    landedWhileLeaving(userRound),
    'the top bar’s user menu is pressed again while the menu it closed is still leaving (in the page, data-state="closed")',
    whyNotLeaving(userRound),
  )
  chk(
    openAndStayed(userRound.after),
    'the top bar’s user menu, pressed while its menu is leaving, opens the menu again, and it stays open',
    story(userRound.after),
  )
  await ctx.close().catch(() => {})
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('menu-reopen.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (A) {
    for (const id of workspacesMade) {
      const goneWs = await A(`/workspaces/${id}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(goneWs.status)) leftBehind.push(`DELETE workspace ${id} answered ${goneWs.status}`)
    }
  }
  await browser.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
