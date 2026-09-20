/**
 * §V2-06 `[07:56]`, frame `08:00` — the "+" on a space is a MENU.
 *
 * > "Space ke ooper yeh jo PLUS ka option hota hai, us par click karoge to
 * > LIST / FOLDER [aata hai]."
 *
 * The frame, zoomed: a panel headed **Create**, with List *(Track tasks,
 * projects, people & more)* and Folder *(Group Lists, Docs & more)* on top, a
 * rule, then Doc · Dashboard · Whiteboard · Form, a rule, then Imports › and
 * Templates. Eight items.
 *
 * Rundesk's "+" was ONE of them, chosen for you: `createProject(space.id)`
 * behind a `window.prompt`. Seven of the eight were unreachable from the point
 * where a person has just decided to create something inside this space.
 *
 * WHAT THIS SUITE IS ACTUALLY WATCHING FOR, beyond "a menu appeared":
 *
 *   · THE LABEL PER ITEM. Checked one at a time, by name. A menu of eight items
 *     all reading "List" would satisfy any count-and-presence check — that is
 *     not a hypothetical, it is precisely the bug the sibling views panel had.
 *
 *   · LANDING ON THE RIGHT THING. An item that opens the create modal on its
 *     own tab is the claim; an item that opens the modal at all is not. So each
 *     one is opened and the ACTIVE tab is read back, and for the four that
 *     belong to a space, the space selector is read back too — a menu item on
 *     THIS space that lands on a blank "which space?" has answered nothing.
 *
 *   · ONE LIST, TWO SURFACES. Every kind the menu offers has a quick-create tab
 *     of the same name, because both render `lib/create-types.ts`. Two
 *     hand-kept copies is the duplicated-list defect, and this audit has found
 *     five instances of it, two already drifted.
 *
 *   node test/e2e/space-create-menu.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 19

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `scm-${Date.now()}`

/**
 * The eight of frame `08:00`, in `lib/create-types.ts` order — everything
 * creatable EXCEPT `space`, which does not nest inside a space.
 */
const EXPECTED_KINDS = ['task', 'doc', 'reminder', 'whiteboard', 'dashboard', 'list', 'folder', 'project']
/** One specific word per item. Written here so a drifted label names itself. */
const EXPECTED_LABEL = {
  task: 'Task',
  doc: 'Doc',
  reminder: 'Reminder',
  whiteboard: 'Whiteboard',
  dashboard: 'Dashboard',
  list: 'List',
  folder: 'Folder',
  project: 'Project',
}
/** The four whose creator takes a space, and the select that should be filled. */
const SPACE_SELECT = {
  list: 'quick-create-list-space',
  folder: 'quick-create-folder-space',
  project: 'quick-create-project-space',
  task: 'quick-create-space',
}

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/*
 * THIS RUN'S OWN SPACE. The sidebar tree is shared with every other suite and
 * with whatever the seed left behind; a check about "the + on a space" has to
 * be about a space this run made, or it is a check about someone else's data.
 */
const SPACE_NAME = `Create menu ${TAG}`
const spaceRes = await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: SPACE_NAME } })
if (spaceRes.status >= 400 || !spaceRes.data?.id) {
  throw new Error(`could not create this suite's space: ${spaceRes.status} ${JSON.stringify(spaceRes.error)}`)
}
const SPACE = spaceRes.data.id
console.log(`\x1b[2m  workspace ${WS}, space ${SPACE} ("${SPACE_NAME}")\x1b[0m`)

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()

const menuOpen = () => page.locator('[data-testid="space-create-menu"]').count().then((n) => n > 0)
/** The quick-create modal renders all nine tabs, so any one of them proves it is up. */
const modalOpen = () => page.locator('[data-testid="create-tab-task"]').count().then((n) => n > 0)

/**
 * Put the page back to a quiet sidebar, and REFUSE to continue if it will not go.
 *
 * An open Radix menu owns the pointer: it lays a dismiss layer over the page
 * and takes pointer events off everything under it. A hover aimed at the
 * sidebar link beneath one therefore never lands — it waits out its whole
 * timeout and then reports `locator.hover: Timeout`, which names the hover and
 * means "something else was still open". That is the failure this helper
 * exists to make impossible to misread.
 */
const dismissAll = async () => {
  for (let i = 0; i < 4 && ((await menuOpen()) || (await modalOpen())); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
  if (await menuOpen()) throw new Error('the Create menu would not close, so the sidebar under it is unreachable')
  if (await modalOpen()) throw new Error('the quick-create modal would not close, so the sidebar under it is unreachable')
  // Radix restores pointer-events on <body> a frame after its layer unmounts.
  await page.waitForTimeout(250)
}

/**
 * Open the space's Create menu from a known-closed state.
 *
 * ONE CLICK, NEVER TWO. The trigger toggles, so a helper that clicks to "make
 * sure" shuts a menu that was already open, and every later lookup then reads
 * as "the item is missing" when the menu is merely closed — the hazard
 * `task-delete.mjs`'s `openTask` documents. Dismiss first, click once, and
 * assert it really opened rather than letting the next locator time out and
 * blame itself.
 */
const openMenu = async () => {
  await dismissAll()
  await page.getByTestId(`space-link-${SPACE}`).hover({ timeout: 15_000 })
  await page.getByTestId(`space-create-open-${SPACE}`).click({ timeout: 15_000 })
  if (!(await waitUntil(menuOpen, { timeoutMs: 10_000 }))) {
    throw new Error(`the "+" on space ${SPACE} did not open a Create menu`)
  }
}

try {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/${SPACE}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`[data-testid="space-link-${SPACE}"]`, { timeout: 30_000 })

  console.log('\n▶ the "+" on a space opens the Create menu `[frame 08:00]`')
  await openMenu()
  /*
   * `textContent`, NOT `innerText`, and the difference is the assertion.
   *
   * Frame `08:00` heads the menu **Create**, in sentence case. Rundesk's
   * `DropdownMenuLabel` is styled `uppercase` — every menu label in the product
   * is, it is house style and not something this row invented — so `innerText`,
   * which applies text-transform, reports "CREATE". The thing being asserted is
   * that the menu is headed with the WORD the frame shows, which is the string
   * the catalogue supplies and a translator edits; the capitals are the design
   * system's business. `textContent` is that string.
   */
  const heading = ((await page.getByTestId('space-create-menu-title').textContent()) ?? '').trim()
  chk(
    heading === 'Create',
    'the "+" opens a menu headed "Create", as frame `08:00` heads it (drawn capitalised by the menu-label style)',
    `the menu heading\'s text content read ${JSON.stringify(heading)}, not "Create" — the frame heads this menu ` +
      'Create, and the "+" used to be one action behind a window.prompt',
  )

  const kinds = await page.locator('[data-testid^="space-create-"]').evaluateAll((els) =>
    els
      .map((e) => (e.getAttribute('data-testid') ?? '').replace('space-create-', ''))
      .filter((k) => k !== 'menu' && k !== 'menu-title' && !k.startsWith('open-') && !k.startsWith('label-')),
  )
  chk(
    kinds.length === EXPECTED_KINDS.length,
    `it offers ${EXPECTED_KINDS.length} things to create`,
    `the menu offered ${kinds.length}: ${JSON.stringify(kinds)}`,
  )
  chk(
    JSON.stringify(kinds) === JSON.stringify(EXPECTED_KINDS),
    'and they are the eight, in the shared module\'s order',
    `the menu offered ${JSON.stringify(kinds)}, expected ${JSON.stringify(EXPECTED_KINDS)}`,
  )

  /*
   * ONE CHECK PER ITEM, NAMING THE WORD. The menu item carries its label and a
   * one-line blurb, so the label is read from its own element — matching on the
   * item's whole text would pass on a label that had fallen back to a sibling's
   * string as long as the blurb still contained the right word. `textContent`
   * for the same reason as the heading above: the assertion is about the string
   * the catalogue supplies, not about how the stylesheet cases it.
   */
  const itemLabel = async (kind) =>
    ((await page.getByTestId(`space-create-label-${kind}`).textContent()) ?? '').trim()
  const seen = {}
  for (const kind of EXPECTED_KINDS) {
    const text = (await itemLabel(kind).catch(() => '')) || ''
    seen[kind] = text
    chk(
      text === EXPECTED_LABEL[kind],
      `the ${kind} item reads "${EXPECTED_LABEL[kind]}"`,
      `the ${kind} item read ${JSON.stringify(text)}, not ${JSON.stringify(EXPECTED_LABEL[kind])}`,
    )
  }

  chk(
    (await page.locator('[data-testid="space-create-space"]').count()) === 0,
    'and Space is not among them — a space does not nest in a space',
    'the menu offered to create a Space inside a Space, which has nowhere to go',
  )

  console.log('\n▶ each item lands on ITS OWN creator, with this space already answered')
  /**
   * Open one item and report what came up: which tab is pressed, and what the
   * space selector holds. Reading `aria-pressed` on the tab rather than "the
   * modal is open" — a modal that opens on the default tab every time would
   * pass the second and fail the person.
   */
  const landOn = async (kind) => {
    await openMenu()
    await page.getByTestId(`space-create-${kind}`).click()
    await page.waitForSelector(`[data-testid="create-tab-${kind}"]`, { timeout: 15_000 })
    const pressed = await page
      .locator('[data-testid^="create-tab-"][aria-pressed="true"]')
      .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('create-tab-', '')))
    const selectId = SPACE_SELECT[kind]
    const spaceValue = selectId
      ? await page.getByTestId(selectId).inputValue().catch(() => null)
      : null
    return { pressed, spaceValue }
  }

  for (const kind of ['task', 'list', 'folder', 'project']) {
    const landed = await landOn(kind)
    chk(
      JSON.stringify(landed.pressed) === JSON.stringify([kind]) && landed.spaceValue === SPACE,
      `"${EXPECTED_LABEL[kind]}" opens the ${kind} creator with this Space already chosen`,
      `the pressed tab(s) were ${JSON.stringify(landed.pressed)} and the space select held ` +
        `${JSON.stringify(landed.spaceValue)} (wanted ${SPACE})`,
    )
  }

  const doc = await landOn('doc')
  chk(
    JSON.stringify(doc.pressed) === JSON.stringify(['doc']),
    '"Doc" opens the doc creator, not whichever tab the modal defaults to',
    `the pressed tab(s) were ${JSON.stringify(doc.pressed)} — "task" here means the item opened the modal and nothing more`,
  )

  console.log('\n▶ and the thing it creates really lands in this space')
  const PROJECT_NAME = `Menu project ${TAG}`
  await openMenu()
  await page.getByTestId('space-create-project').click()
  await page.waitForSelector('[data-testid="quick-create-project-name"]', { timeout: 15_000 })
  await page.getByTestId('quick-create-project-name').fill(PROJECT_NAME)
  await page.getByTestId('quick-create-project-space').selectOption(SPACE)
  await page.locator('form:has([data-testid="quick-create-project-name"]) button[type=submit]').click()
  await page.waitForTimeout(2500)

  const projects = await api(`/projects/space/${SPACE}`)
  chk(
    projects.status === 200 && (projects.data ?? []).some((p) => p.name === PROJECT_NAME),
    'a project created through the menu is in THIS space, on the server',
    `GET /projects/space/${SPACE} answered ${projects.status} with ` +
      `${JSON.stringify((projects.data ?? []).map((p) => p.name))}`,
  )

  console.log('\n▶ one list, two surfaces')
  await dismissAll()
  await page.getByTestId('quick-create-open').click()
  await page.waitForSelector('[data-testid="create-tab-task"]', { timeout: 15_000 })
  const tabKinds = await page.locator('[data-testid^="create-tab-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('create-tab-', '')),
  )
  chk(
    EXPECTED_KINDS.every((k) => tabKinds.includes(k)) && tabKinds.includes('space'),
    'every kind the space menu offers has a quick-create tab of the same name, plus Space',
    `the tab strip offered ${JSON.stringify(tabKinds)} — the menu and the strip are no longer one list`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/space-create-menu-fail.png', fullPage: true }).catch(() => {})
} finally {
  const del = await api(`/spaces/${SPACE}`, { method: 'DELETE' })
  if (del.status >= 400) console.log(`\x1b[2m  could not clean up space ${SPACE} (${del.status})\x1b[0m`)
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
