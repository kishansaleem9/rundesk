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
 * AND TWO MORE THINGS A LEAVING MENU DID WITH WHAT CAME AFTER IT
 * (`found-30-sep/menu-items-take-a-press-while-closing`,
 * `found-30-sep/leaving-menu-takes-the-next-escape`).
 *
 * A ROW PRESSED AGAIN WHILE ITS MENU LEAVES RUNS ONCE. The first press of a
 * double-click chooses the row and the menu closes; the second lands on the
 * same row, still in the page for the exit. On lane 6's build of HEAD the task
 * menu's “Add to favorites” sent two toggles and the task ended as it began.
 * Three rounds, each with the exit held from its start so that the second
 * press lands in it, and each checking that it did: a double-click on the task
 * menu's row; two presses on it, the second sent once the exit is held, as a
 * person double-clicks at their own pace; and a double-click on the chat
 * header menu's row, which runs through `onClick` rather than `onSelect`. What
 * each did is read from the server once every toggle the page sent has been
 * answered: the pin changed, and the page sent one toggle (two sent together
 * can race on the server and read back like one). And the boundary beside them: a
 * submenu that closes on its own while its menu stays open has had nothing
 * chosen, so a first press on its row still runs ("Add to" › you, read back
 * from your priorities). `assign-to-priorities` presses a row in that state.
 *
 * AN ESCAPE PRESSED WHILE A MENU LEAVES IS NOT THE MENU'S. On HEAD the leaving
 * layer took it: marked it `defaultPrevented`, and in the create modal, whose
 * menus stop the Escape that closes them so that it does not close the modal
 * too, stopped it, and the modal stayed open. Two rounds, the exit held and a
 * second Escape pressed in it: the task's ⋯, where the page's own log says
 * whether that Escape reached the window, and unmarked; and the create modal's
 * Templates menu, where the modal has to close. And the ordinary case beside
 * them: an open menu still takes its Escape, and the modal under it stays.
 *
 * ClickUp's help centre says Esc "closes any task or window" ("Use keyboard
 * shortcuts", read through search results), and two of its feature requests
 * ask that an Escape close a small menu first rather than the whole task.
 * Nothing it publishes covers a press or an Escape during a menu's exit, so
 * these hold to the safe rule: a press runs a row once, and an Escape pressed
 * after a menu has closed belongs to what is under it.
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
const EXPECTED_CHECKS = 28

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
 *
 * ROWS AND ESCAPES, for the two rounds that follow a menu's exit past its
 * button. A row is marked by the suite (`markRow`, the element itself, so no
 * text is read to find it), and every press says whether it was on that row,
 * what the menu around the row read (`open`, or `closed` while it leaves), and
 * whether the row was inside the held exit. Every Escape is logged twice: in
 * the window's capture phase, first of all, with the state of each watched
 * menu and whether an exit was held; and in the window's bubble phase, last,
 * whether it got there and whether anything had marked it `defaultPrevented`.
 * An Escape stopped on its way never reaches the second, which is the point.
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
  const menus = { presses: [], log: [], outside: [], escapes: [], row: null, watched: new Map(), animMs: new Map(), hold: null }
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
    const row = e.target instanceof Element ? e.target.closest('[role^="menuitem"]') : null
    const heldMenu = menus.hold && menus.hold.held ? contentOf(menus.hold.id) : null
    const states = {}
    for (const id of menus.watched.keys()) states[id] = stateOf(id)
    menus.presses.push({
      on: on ? on.id : null,
      states,
      held: !!(menus.hold && menus.hold.held && on && menus.hold.id === on.id),
      onRow: !!row && row === menus.row,
      rowMenu: row ? row.closest('[data-radix-menu-content]')?.getAttribute('data-state') ?? 'none' : null,
      rowHeld: !!(row && heldMenu && heldMenu.contains(row)),
      at: performance.now(),
    })
  }, true)
  const escapeSeen = new WeakMap()
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const states = {}
    for (const id of menus.watched.keys()) states[id] = stateOf(id)
    const seen = {
      states,
      heldId: menus.hold && menus.hold.held ? menus.hold.id : null,
      reached: false,
      prevented: null,
      at: performance.now(),
    }
    menus.escapes.push(seen)
    escapeSeen.set(e, seen)
  }, true)
  window.addEventListener('keydown', (e) => {
    const seen = escapeSeen.get(e)
    if (!seen) return
    seen.reached = true
    seen.prevented = e.defaultPrevented
  })
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
  menus.markRow = (el) => {
    menus.row = el
  }
  /** The presses and Escapes logged since `from` (the page's clock). */
  menus.since = (from) => ({
    presses: menus.presses.filter((p) => p.at >= from),
    escapes: menus.escapes.filter((k) => k.at >= from),
  })
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

/** The page's own clock, so a round can ask for what the page logged since it began. */
const pageNow = (page) => page.evaluate(() => performance.now()).catch(() => 0)
const loggedSince = (page, from) =>
  page
    .evaluate((from) => window.__menus?.since(from) ?? { presses: [], escapes: [] }, from)
    .catch(() => ({ presses: [], escapes: [] }))
/** A button's menu opened from nothing: the last one gone first, then open and done animating. */
const openFresh = async (page, button) => {
  const id = await button.getAttribute('id', { timeout: 20_000 }).catch(() => null)
  await watch(page, id)
  await gone(page, id)
  await button.click({ timeout: 10_000 }).catch(() => {})
  const opened = await waitUntil(async () => {
    const m = await menuOf(page, id)
    return m?.state === 'open' && !m.animating
  }, { timeoutMs: 10_000 })
  return { id, opened }
}
const heldNow = (page, id) => waitUntil(async () => (await menuOf(page, id))?.held === true, { timeoutMs: 5000 })

/**
 * ONE ROUND OF A ROW PRESSED TWICE: the menu opened, its exit armed to be held
 * where it starts, the row pressed (the menu closes) and pressed again while
 * the menu leaves, then the exit let go. `how` is 'dblclick', one double-click
 * as the mouse sends it, or 'twice', two presses with the second sent once the
 * exit is held, as a person double-clicks at their own pace. Both presses go
 * where the row is drawn, as a person's do. What the row did is the server's to
 * say, and the caller reads it.
 */
const pressRowTwice = async (page, button, rowIn, how) => {
  const { id, opened } = await openFresh(page, button)
  const row = rowIn(id)
  const box = await row.boundingBox({ timeout: 5000 }).catch(() => null)
  await row.evaluate((el) => window.__menus?.markRow(el), null, { timeout: 5000 }).catch(() => {})
  const from = await pageNow(page)
  await page.evaluate((id) => window.__menus?.arm(id), id).catch(() => {})
  if (box) {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    if (how === 'dblclick') {
      await page.mouse.dblclick(x, y).catch(() => {})
    } else {
      await page.mouse.click(x, y).catch(() => {})
      await heldNow(page, id)
      await page.mouse.click(x, y).catch(() => {})
    }
  }
  const held = await heldNow(page, id)
  const { presses } = await loggedSince(page, from)
  const left = (await menuOf(page, id))?.state ?? 'unread'
  await page.evaluate(() => window.__menus?.release()).catch(() => {})
  await gone(page, id)
  return { id, opened, box: !!box, held, left, presses }
}
/** Why an exit was not held: the menu never opened, or never closed, or closed with no exit animation to hold. */
const whyNotHeld = (r) =>
  r.held
    ? 'was held'
    : !r.opened
      ? 'never began'
      : r.left === 'open'
        ? 'never began — the menu is still open'
        : 'was never held — no exit animation was running when it closed'
/** Two presses, both on the row: the first with its menu open, the second on it leaving, inside the held exit. */
const rowLanded = (r) =>
  r.held && r.presses.length === 2 &&
  r.presses[0].onRow && r.presses[0].rowMenu === 'open' &&
  r.presses[1].onRow && r.presses[1].rowMenu === 'closed' && r.presses[1].rowHeld
const whyRowNotLanded = (r) =>
  `the menu ${r.opened ? 'opened' : 'never opened'}; the row ${r.box ? 'was drawn' : 'had no box to press'}; ` +
  `its exit ${whyNotHeld(r)}; the presses were ` +
  JSON.stringify(r.presses.map((p) => ({ onRow: p.onRow, menu: p.rowMenu, insideHeldExit: p.rowHeld })))

/**
 * ONE ROUND OF AN ESCAPE AFTER A MENU CLOSED: the menu opened, closed with
 * Escape with its exit held where it starts, and a second Escape pressed while
 * it leaves. The page logged where that second Escape went: the state of the
 * menu as it was pressed, and whether it reached the window, and unmarked.
 * Then the exit is let go.
 */
const escapeWhileLeaving = async (page, button) => {
  const { id, opened } = await openFresh(page, button)
  await page.evaluate((id) => window.__menus?.arm(id), id).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  const held = await heldNow(page, id)
  const left = (await menuOf(page, id))?.state ?? 'unread'
  const from = await pageNow(page)
  await page.keyboard.press('Escape').catch(() => {})
  const { escapes } = await loggedSince(page, from)
  await page.evaluate(() => window.__menus?.release()).catch(() => {})
  await gone(page, id)
  return { id, opened, held, left, escape: escapes[escapes.length - 1] ?? null }
}
const escapeLanded = (r) => !!r.id && r.held && r.escape?.states?.[r.id] === 'closed' && r.escape.heldId === r.id
const whyEscapeNotLanded = (r) =>
  `the menu ${r.id ? (r.opened ? 'opened' : 'never opened') : 'had no button to press'}; its exit ${whyNotHeld(r)}; ` +
  `the second Escape ${r.escape ? `found the menu ${r.escape.states?.[r.id] ?? 'unwatched'}, ${r.id && r.escape.heldId === r.id ? 'held' : 'not held'}` : 'was never seen'}`
const escapeStory = (r) =>
  !r.escape
    ? 'the second Escape was never seen'
    : r.escape.reached
      ? `the second Escape reached the window ${r.escape.prevented ? 'marked defaultPrevented — a layer took it' : 'unmarked'}`
      : 'the second Escape was stopped before it reached the window'

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
  if (!madeWs.ok || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  const WS = madeWs.data.id
  workspacesMade.push(WS)
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Space ${TAG}` } })
  if (!space.ok || !space.data?.id) throw new Error(`could not make a space: ${said(space)}`)
  const SPACE = space.data.id
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `Project ${TAG}` } })
  if (!project.ok || !project.data?.id) throw new Error(`could not make a project: ${said(project)}`)
  const PROJECT = project.data.id
  const list = await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `List ${TAG}` } })
  if (!list.ok || !list.data?.id) throw new Error(`could not make a list: ${said(list)}`)
  const LIST = list.data.id
  const task = await A('/tasks', { method: 'POST', body: { listId: LIST, title: `Task ${TAG}` } })
  if (!task.ok || !task.data?.id) throw new Error(`could not make a task: ${said(task)}`)
  const TASK = task.data.id
  /* A channel, for a second menu with an “Add to favorites” row: the chat header's ⋯. Goes with the workspace. */
  const channel = await A(`/workspaces/${WS}/chat/channels`, {
    method: 'POST',
    body: { name: `menu-reopen-${Date.now()}`, description: 'menu-reopen' },
  })
  if (!channel.ok || !channel.data?.id) throw new Error(`could not make a channel: ${said(channel)}`)
  const CHANNEL = channel.data.id
  /** Whether the server has the entity among this workspace's favourites; null when it did not answer. */
  const pinned = async (entityType, entityId) => {
    const res = await A(`/workspaces/${WS}/favorites`)
    if (res.status !== 200 || !Array.isArray(res.data)) return null
    return res.data.some((f) => f.entityType === entityType && f.entityId === entityId)
  }
  const pinnedWord = (v) => (v === null ? 'unread (the favourites did not answer)' : v ? 'pinned' : 'not pinned')

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(INSTRUMENT)
  const page = await ctx.newPage()
  /* The favourite toggles the page sends, so a read of the server waits until each one has been answered. */
  const toggles = { sent: 0, done: 0 }
  const isToggle = (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/favorites/toggle')
  page.on('request', (r) => { if (isToggle(r)) toggles.sent += 1 })
  page.on('requestfinished', (r) => { if (isToggle(r)) toggles.done += 1 })
  page.on('requestfailed', (r) => { if (isToggle(r)) toggles.done += 1 })
  const togglesAnswered = () => waitUntil(() => toggles.sent > 0 && toggles.done === toggles.sent, { timeoutMs: 15_000 })
  /* And the adds to your priorities, for the submenu round. */
  const adds = { sent: 0, done: 0 }
  const isAdd = (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(`/workspaces/${WS}/priorities`)
  page.on('request', (r) => { if (isAdd(r)) adds.sent += 1 })
  page.on('requestfinished', (r) => { if (isAdd(r)) adds.done += 1 })
  page.on('requestfailed', (r) => { if (isAdd(r)) adds.done += 1 })
  const addsAnswered = () => waitUntil(() => adds.sent > 0 && adds.done === adds.sent, { timeoutMs: 15_000 })
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

  console.log('\n▶ a row pressed again while its menu is leaving runs once')
  await page.goto(`${listPage}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => more.isVisible().catch(() => false), { timeoutMs: 25_000 })
  const favoriteRow = () => page.getByTestId('task-menu-favorite')

  toggles.sent = 0
  toggles.done = 0
  const dblBefore = await pinned('task', TASK)
  const dbl = await pressRowTwice(page, more, favoriteRow, 'dblclick')
  await togglesAnswered()
  const dblAfter = await pinned('task', TASK)
  chk(
    rowLanded(dbl),
    'the second click of a double-click on the task menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state="closed")',
    whyRowNotLanded(dbl),
  )
  /*
   * AND THE PAGE SENT ONE TOGGLE. The server's toggle reads, then deletes or
   * inserts, with no lock: two toggles sent together can both read "not
   * pinned" and both pin, which reads back exactly like one. Measured: under
   * `menu-reopen-10`, which lets the chat row's second press run its
   * `onClick`, this check once passed with the channel pinned. So the
   * server's answer and the wire are read together.
   */
  chk(
    dblBefore !== null && dblAfter === !dblBefore && toggles.sent === 1,
    'a double-click on the task menu’s “Add to favorites” runs it once: the server has the task’s pin changed, and changed once',
    `the server had the task ${pinnedWord(dblBefore)} and now has it ${pinnedWord(dblAfter)}; the page sent ${toggles.sent} toggle request(s)`,
  )

  toggles.sent = 0
  toggles.done = 0
  const twiceBefore = await pinned('task', TASK)
  const twice = await pressRowTwice(page, more, favoriteRow, 'twice')
  await togglesAnswered()
  const twiceAfter = await pinned('task', TASK)
  chk(
    rowLanded(twice),
    'the task menu’s “Add to favorites” is pressed, and pressed again while its menu is leaving (in the page, data-state="closed")',
    whyRowNotLanded(twice),
  )
  chk(
    twiceBefore !== null && twiceAfter === !twiceBefore && toggles.sent === 1,
    'two presses on “Add to favorites”, the second while its menu is leaving, run it once: the server has the pin changed once',
    `the server had the task ${pinnedWord(twiceBefore)} and now has it ${pinnedWord(twiceAfter)}; the page sent ${toggles.sent} toggle request(s)`,
  )

  /*
   * BUT A FIRST PRESS ON A SUBMENU THAT CLOSES ON ITS OWN STILL RUNS, while the
   * menu it opened from stays open. Radix closes a submenu when the pointer or
   * focus leaves it, and `assign-to-priorities` presses "Add to" › a person in
   * exactly that state: measured, the submenu `closed` and the menu `open` at
   * the press, and on HEAD the row ran. Nothing has been chosen yet there;
   * choosing a row closes the whole menu. So the guard asks the menu the button
   * opened. Here the submenu is closed by the keyboard (→ into it, ← out of it,
   * which Radix answers by closing it and nothing else), its exit held, and
   * "Add to" › you pressed where it is drawn. The server says whether the task
   * went on your priorities.
   */
  const addTo = page.getByTestId('task-menu-add-to')
  const onMyPriorities = async () => {
    const res = await A(`/workspaces/${WS}/priorities`)
    if (res.status !== 200 || !Array.isArray(res.data)) return null
    return res.data.some((p) => p.taskId === TASK)
  }
  adds.sent = 0
  adds.done = 0
  const subBefore = await onMyPriorities()
  const { id: taskMenuId, opened: taskMenuOpened } = await openFresh(page, more)
  await addTo.click({ timeout: 8000 }).catch(() => {})
  const subId = await addTo.getAttribute('id', { timeout: 5000 }).catch(() => null)
  await watch(page, subId)
  const subOpened = await waitUntil(async () => {
    const m = await menuOf(page, subId)
    return m?.state === 'open' && !m.animating
  }, { timeoutMs: 10_000 })
  const mine = page.getByTestId(`task-menu-priority-person-${auth.user?.id}`)
  const mineBox = await mine.boundingBox({ timeout: 5000 }).catch(() => null)
  await mine.evaluate((el) => window.__menus?.markRow(el), null, { timeout: 5000 }).catch(() => {})
  await page.evaluate((id) => window.__menus?.arm(id), subId).catch(() => {})
  await page.keyboard.press('ArrowRight').catch(() => {})
  await page.keyboard.press('ArrowLeft').catch(() => {})
  const subHeld = await heldNow(page, subId)
  const subFrom = await pageNow(page)
  if (mineBox) await page.mouse.click(mineBox.x + mineBox.width / 2, mineBox.y + mineBox.height / 2).catch(() => {})
  const { presses: subPresses } = await loggedSince(page, subFrom)
  await page.evaluate(() => window.__menus?.release()).catch(() => {})
  await gone(page, taskMenuId)
  await addsAnswered()
  const subAfter = await onMyPriorities()
  const subPress = subPresses[subPresses.length - 1] ?? null
  chk(
    taskMenuOpened && subOpened && subHeld && subPresses.length === 1 && !!subPress?.onRow &&
      subPress.rowMenu === 'closed' && subPress.rowHeld && subPress.states?.[taskMenuId] === 'open',
    'a row of the task menu’s “Add to” submenu is pressed while that submenu is leaving and the menu it opened from is still open',
    `the menu ${taskMenuOpened ? 'opened' : 'never opened'}; the submenu ${subOpened ? 'opened' : 'never opened'} and ${subHeld ? 'was held leaving' : 'was never held'}; ` +
      `the press was ${subPress ? JSON.stringify({ onRow: subPress.onRow, submenu: subPress.rowMenu, insideHeldExit: subPress.rowHeld, menu: subPress.states?.[taskMenuId] ?? 'unwatched' }) : 'never seen'}`,
  )
  chk(
    subBefore === false && subAfter === true,
    'and that first press still runs the row: the server has the task on your priorities',
    `the server had it ${subBefore === null ? 'unread' : subBefore ? 'on your priorities' : 'off your priorities'} before and ` +
      `${subAfter === null ? 'unread' : subAfter ? 'on them' : 'off them'} after; the page sent ${adds.sent} add request(s)`,
  )

  /*
   * A SECOND MENU, AND A ROW THAT RUNS THROUGH `onClick`: the chat header's ⋯
   * and its “Add to favorites”, found as a person finds them — the one button
   * titled “More” that opens a menu, and the row by its name — since neither
   * carries a test id. Its button is live once the channel has loaded.
   */
  await page.goto(`${stack.base}/app/${WS}/chat?channel=${CHANNEL}`, { waitUntil: 'domcontentloaded' })
  const chatMore = page.locator('button[title="More"][aria-haspopup="menu"]')
  await waitUntil(() => chatMore.isEnabled({ timeout: 1000 }).catch(() => false), { timeoutMs: 25_000 })
  const chatFavoriteRow = (id) =>
    page.locator(`[role="menu"][aria-labelledby="${id}"]`).getByRole('menuitem', { name: 'Add to favorites', exact: true })
  toggles.sent = 0
  toggles.done = 0
  const chatBefore = await pinned('channel', CHANNEL)
  const chatDbl = await pressRowTwice(page, chatMore, chatFavoriteRow, 'dblclick')
  await togglesAnswered()
  const chatAfter = await pinned('channel', CHANNEL)
  chk(
    rowLanded(chatDbl),
    'the second click of a double-click on the chat header menu’s “Add to favorites” lands on the row while its menu is leaving (in the page, data-state="closed")',
    whyRowNotLanded(chatDbl),
  )
  chk(
    chatBefore !== null && chatAfter === !chatBefore && toggles.sent === 1,
    'a double-click on the chat header menu’s “Add to favorites” runs it once: the server has the channel’s pin changed, and changed once',
    `the server had the channel ${pinnedWord(chatBefore)} and now has it ${pinnedWord(chatAfter)}; the page sent ${toggles.sent} toggle request(s)`,
  )

  console.log('\n▶ an Escape pressed while a menu is leaving is not the menu’s')
  await page.goto(`${listPage}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => more.isVisible().catch(() => false), { timeoutMs: 25_000 })
  const taskEscape = await escapeWhileLeaving(page, more)
  chk(
    escapeLanded(taskEscape),
    'the task’s ⋯ menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state="closed")',
    whyEscapeNotLanded(taskEscape),
  )
  /* With the round landed in the exit, or an Escape with no menu at all would pass for one that got past a menu. */
  chk(
    escapeLanded(taskEscape) && taskEscape.escape.reached === true && taskEscape.escape.prevented === false,
    'that second Escape goes on to the page as though no menu were there: not stopped, and not marked handled',
    escapeLanded(taskEscape) ? escapeStory(taskEscape) : whyEscapeNotLanded(taskEscape),
  )

  /*
   * BUT AN ESCAPE MEANT FOR A LAYER OPENED ON TOP OF THE LEAVING MENU IS THAT
   * LAYER'S. The task menu's "Merge" opens its dialog as the menu closes, so
   * the dialog is drawn over a menu still leaving. Ending the menu's exit on
   * that Escape took the menu out of Radix's stack while the dialog still
   * counted itself second, and the dialog let the Escape by: it stayed open
   * (found by a review of `found-30-sep/leaving-menu-takes-the-next-escape`;
   * the sidebar's "Share" and a second menu opened during the exit are the same
   * case). Measured on lane 6, it does not happen: the dialog closes. A second
   * menu cannot be opened during the exit at all, since a leaving modal menu
   * keeps pointer events off the page until it has gone (the user menu's
   * button, pressed then, did nothing). So this holds the dialog's case, which
   * can happen. The menu's exit is held where it starts, so the Escape lands in
   * it.
   */
  const mergeRow = page.getByTestId('task-menu-merge')
  const mergeDialog = page.getByTestId('task-merge-dialog')
  const mergeShown = () => mergeDialog.isVisible().catch(() => false)
  const { id: mergeMenuId, opened: mergeMenuOpened } = await openFresh(page, more)
  await page.evaluate((id) => window.__menus?.arm(id), mergeMenuId).catch(() => {})
  await mergeRow.click({ timeout: 8000 }).catch(() => {})
  const mergeMenuHeld = await heldNow(page, mergeMenuId)
  const mergeUp = await waitUntil(mergeShown, { timeoutMs: 8000 })
  const mergeFrom = await pageNow(page)
  await page.keyboard.press('Escape').catch(() => {})
  const { escapes: mergeEscapes } = await loggedSince(page, mergeFrom)
  const mergeEscape = mergeEscapes[mergeEscapes.length - 1] ?? null
  const mergeShut = await waitUntil(async () => !(await mergeShown()), { timeoutMs: 5000 })
  await page.evaluate(() => window.__menus?.release()).catch(() => {})
  await gone(page, mergeMenuId)
  if (!mergeShut) await page.keyboard.press('Escape').catch(() => {})
  const mergeLanded =
    mergeMenuOpened && mergeMenuHeld && mergeUp && mergeEscape?.states?.[mergeMenuId] === 'closed' && mergeEscape.heldId === mergeMenuId
  chk(
    mergeLanded,
    'the task menu’s “Merge” opens its dialog over the menu, and Escape is pressed while the menu is still leaving (in the page, data-state="closed")',
    `the menu ${mergeMenuOpened ? 'opened' : 'never opened'} and ${mergeMenuHeld ? 'was held leaving' : 'was never held'}; ` +
      `the dialog ${mergeUp ? 'opened' : 'never opened'}; the Escape ${mergeEscape ? `found the menu ${mergeEscape.states?.[mergeMenuId] ?? 'unwatched'}` : 'was never seen'}`,
  )
  /* Landed first: a dialog that never opened reads as closed too. */
  chk(
    mergeLanded && mergeShut,
    'that Escape closes the dialog opened on top of the leaving menu',
    mergeLanded ? `the dialog ${mergeShut ? 'closed' : 'is still open'} after the Escape` : 'the Escape never landed in the menu’s exit',
  )

  /*
   * A DOUBLE-CLICK IS ONE GESTURE (`found-30-sep/a-double-click-on-a-dialog-row-shuts-the-dialog`).
   * Two presses on the task menu's "Merge" 156–218 ms apart, as a person
   * double-clicks: the first opened the dialog, and the second landed on its
   * overlay, a press outside, and shut it, 9 rounds of 9. ClickUp documents
   * nothing on it, and a double-click is one gesture everywhere. So a dialog
   * takes no press outside that comes within a double-click's interval of its
   * opening; one after that still closes it.
   */
  const { opened: dblMenuOpened } = await openFresh(page, more)
  const dblRow = await mergeRow.boundingBox({ timeout: 8000 }).catch(() => null)
  if (dblRow) {
    const [x, y] = [dblRow.x + dblRow.width / 2, dblRow.y + dblRow.height / 2]
    await page.mouse.click(x, y).catch(() => {})
    // A person's double-click, not Playwright's: the second press comes a beat after the first.
    await page.waitForTimeout(180)
    await page.mouse.click(x, y).catch(() => {})
  }
  const dblUp = await waitUntil(mergeShown, { timeoutMs: 8000 })
  // Shut by the second press, it read closed within 40 ms and was gone within 450 (the ledger's measure).
  const dblShut = await waitUntil(async () => !(await mergeShown()), { timeoutMs: 1500, lastLookGraceMs: 0 })
  chk(
    dblMenuOpened && !!dblRow && dblUp && !dblShut,
    'a person-paced double-click on the task menu’s “Merge” opens its dialog and leaves it open: the second press is the same gesture, not a press outside',
    `the menu ${dblMenuOpened ? 'opened' : 'never opened'}; the row ${dblRow ? 'was pressed twice, 180 ms apart' : 'had no box to press'}; ` +
      `the dialog ${dblUp ? (dblShut ? 'opened and was shut by the second press' : 'opened') : 'never opened'}`,
  )
  if (await mergeShown()) {
    await page.keyboard.press('Escape').catch(() => {})
    await waitUntil(async () => !(await mergeShown()), { timeoutMs: 5000 })
  }

  // A fresh dialog, opened with one press: a press on its overlay once the interval has passed is a press outside.
  const { opened: oneMenuOpened } = await openFresh(page, more)
  await mergeRow.click({ timeout: 8000 }).catch(() => {})
  const oneUp = await waitUntil(mergeShown, { timeoutMs: 8000 })
  await page.waitForTimeout(700)
  if (oneUp) await page.mouse.click(4, 4).catch(() => {})
  const oneShut = oneUp ? await waitUntil(async () => !(await mergeShown()), { timeoutMs: 5000 }) : false
  chk(
    oneMenuOpened && oneUp && oneShut,
    'and a press outside a dialog, once a double-click’s interval has passed since it opened, still closes it',
    `the menu ${oneMenuOpened ? 'opened' : 'never opened'}; the dialog ${oneUp ? (oneShut ? 'closed' : 'stayed open after a press on its overlay 0.7 s after opening') : 'never opened'}`,
  )
  if (!oneShut) await page.keyboard.press('Escape').catch(() => {})

  /*
   * THE CREATE MODAL, where an Escape that is not the menu's shows: the modal
   * closes on any Escape that reaches the document, and each of its menus stops
   * the Escape that closes it, so that one does not close the modal as well.
   */
  await page.goto(listPage, { waitUntil: 'domcontentloaded' })
  const modalOpen = () => page.getByTestId('quick-create-task-title').isVisible().catch(() => false)
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 }).catch(() => {})
  await page.getByTestId('create-tab-task').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(modalOpen, { timeoutMs: 15_000 })
  const templates = page.getByTestId('quick-create-templates')
  await waitUntil(() => templates.isVisible().catch(() => false), { timeoutMs: 10_000 })

  const { id: tplId, opened: tplOpened } = await openFresh(page, templates)
  const fromOpen = await pageNow(page)
  await page.keyboard.press('Escape').catch(() => {})
  await gone(page, tplId)
  const tplShut = await menuOf(page, tplId)
  const { escapes: openEscapes } = await loggedSince(page, fromOpen)
  const closingEscape = openEscapes[openEscapes.length - 1] ?? null
  const modalStayed = await modalOpen()
  chk(
    tplOpened && closingEscape?.states?.[tplId] === 'open' && tplShut?.state === 'gone' && modalStayed,
    'Escape closes the create modal’s open Templates menu, and the modal under it stays open',
    `the menu ${tplOpened ? 'opened' : 'never opened'}; the Escape found it ${closingEscape?.states?.[tplId] ?? 'unseen'}; ` +
      `it is ${tplShut?.state ?? 'unread'} now; the modal ${modalStayed ? 'stayed open' : 'closed'}`,
  )

  const tplEscape = await escapeWhileLeaving(page, templates)
  const modalClosed = await waitUntil(async () => !(await modalOpen()), { timeoutMs: 5000 })
  chk(
    escapeLanded(tplEscape),
    'the create modal’s Templates menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state="closed")',
    whyEscapeNotLanded(tplEscape),
  )
  /* Landed first: a modal that an earlier Escape had already closed reads as closed too. */
  chk(
    escapeLanded(tplEscape) && modalClosed,
    'that second Escape reaches the create modal under the menu, and closes it',
    escapeLanded(tplEscape)
      ? `${escapeStory(tplEscape)}; the modal ${modalClosed ? 'closed' : 'is still open'}`
      : `${whyEscapeNotLanded(tplEscape)}; the modal ${modalClosed ? 'is closed' : 'is still open'}`,
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
