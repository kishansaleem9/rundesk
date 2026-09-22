/**
 * §V2-06 `[07:56]`, frame `08:00` — the "+" on a space is a MENU.
 *
 * > "Space ke ooper yeh jo PLUS ka option hota hai, us par click karoge to
 * > LIST / FOLDER [aata hai]."
 *
 * The frame, zoomed: a panel headed **Create**, with List *(Track tasks,
 * projects, people & more)* and Folder *(Group Lists, Docs & more)* on top, a
 * rule, then Doc · Dashboard · Whiteboard · Form, a rule, then Imports › and
 * Templates. Eight items in THREE groups, and the rules between them carry
 * meaning: the last two do not create anything.
 *
 * Rundesk's "+" was ONE of them, chosen for you: `createProject(space.id)`
 * behind a `window.prompt`. Seven of the eight were unreachable from the point
 * where a person has just decided to create something inside this space.
 *
 * THE GROUPS ARE ASSERTED SEPARATELY, and that is a correction. This suite
 * originally scraped every `space-create-*` item into one array and compared
 * it to the create kinds, so when the Imports/Templates footer shipped — which
 * is the frame's own bottom group — the baseline went red for a menu that had
 * just become more correct, and stayed red. A test that reports a fix as a
 * regression is worse than no test: it trains you to skip the red.
 *
 * WHAT THIS SUITE IS ACTUALLY WATCHING FOR, beyond "a menu appeared":
 *
 *   · THE LABEL PER ITEM. Checked one at a time, by name. A menu whose every
 *     item read "List" would satisfy any count-and-presence check — that is
 *     not a hypothetical, it is precisely the bug the sibling views panel had.
 *
 *   · LANDING ON THE RIGHT THING. An item that opens the create modal on its
 *     own tab is the claim; an item that opens the modal at all is not. So each
 *     one is opened and the ACTIVE tab is read back, and for the five whose
 *     creator takes a space, the space selector is read back too — a menu item
 *     on THIS space that lands on a blank "which space?" has answered nothing.
 *
 *   · ONE LIST, TWO SURFACES. Every kind the menu offers has a quick-create tab
 *     of the same name, because both render `lib/create-types.ts`. Two
 *     hand-kept copies is the duplicated-list defect, and this audit has found
 *     five instances of it, two already drifted.
 *
 *   node test/e2e/space-create-menu.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
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
const EXPECTED_CHECKS = 28

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `scm-${Date.now()}`

/**
 * Everything creatable INSIDE a space, in `lib/create-types.ts` order —
 * i.e. every `CreateKind` except `space`, which does not nest in a space.
 *
 * THIS IS NOT "THE EIGHT OF FRAME `08:00`", and the sentence that used to say
 * so was this file's own stale reason: the frame's eight are List · Folder ·
 * Doc · Dashboard · Whiteboard · **Form** · Imports · Templates, and these
 * eight are a different set. Read against each other:
 *
 *   · `list`, `folder`, `doc`, `dashboard`, `whiteboard` — in both.
 *   · `task`, `reminder`, `project` — Rundesk's, not the frame's. They are
 *     things Rundesk can genuinely make in a space, so the menu offers them.
 *   · `imports`, `templates` — the frame's, and Rundesk's, but NOT
 *     `CreateKind`s: they navigate to something that already exists rather
 *     than making a new empty one. They are asserted separately, below.
 *   · `form` — the frame's, and now Rundesk's. The module had been complete
 *     for a long time (builder, public submit page, uploads, routing) and was
 *     reachable only from the Forms rail; it was absent from this menu, which
 *     is the one place somebody has already decided to put something in this
 *     space. Its creator asks which list submissions file into and refuses
 *     without one, because a form with no destination takes replies and makes
 *     nothing.
 */
/*
 * READ FROM `create-types.ts` RATHER THAN KEPT BESIDE IT, and the reason is a
 * suite next door. `create-menu-ai` held the same list by hand under a comment
 * saying it was "the place that says so out loud" when a tenth type arrived;
 * `form` arrived, the line said nothing, the baseline went red, and because
 * that suite's break set had never been run the refusal sat on disk unread.
 *
 * The space menu is `CREATE_TYPES.filter((t) => t.inSpace)` — one line in the
 * product — so that is what this reads: the entries whose `inSpace` is true, in
 * file order. `space` is excluded by the product's own filter and asserted
 * separately below, which is the distinction the checks are built on.
 */
const CREATE_TYPES_SRC = path.resolve(REPO, 'apps/web/src/lib/create-types.ts')
const EXPECTED_KINDS = readFileSync(CREATE_TYPES_SRC, 'utf8')
  .split('\n')
  .filter((l) => /^\s*\{\s*value:\s*'/.test(l) && /inSpace:\s*true/.test(l))
  .map((l) => l.match(/value:\s*'([a-z-]+)'/)[1])
// A parse that came back short would let every check below pass against a list
// of nothing.
if (EXPECTED_KINDS.length < 8) {
  throw new Error(
    `only ${EXPECTED_KINDS.length} in-space creatable types could be read out of ` +
      `${CREATE_TYPES_SRC} — the shape of that file changed and this fixture reads the wrong thing`,
  )
}

/**
 * The frame's bottom group, under its own rule: `[12:04]` "IMPORT — kuch aur
 * cheezein hum kahin aur se [la] sakte hain", `[12:10]` "TEMPLATES wali cheez
 * hai … yahan aap use kar sakte hain."
 *
 * Held apart from `EXPECTED_KINDS` on purpose, because they are a different
 * kind of thing and the product says so in `workspace-sidebar.tsx`: these two
 * navigate, everything above creates. This suite used to scrape both groups
 * into one array and compare it to the create kinds, so the day the footer
 * shipped the baseline went red for a menu that had become MORE correct.
 */
const EXPECTED_NAV = ['imports', 'templates']
/** One specific word per item. Written here so a drifted label names itself. */
const EXPECTED_LABEL = {
  task: 'Task',
  doc: 'Doc',
  reminder: 'Reminder',
  whiteboard: 'Whiteboard',
  dashboard: 'Dashboard',
  form: 'Form',
  list: 'List',
  folder: 'Folder',
  project: 'Project',
}
/** The five whose creator takes a space, and the select that should be filled. */
const SPACE_SELECT = {
  list: 'quick-create-list-space',
  folder: 'quick-create-folder-space',
  project: 'quick-create-project-space',
  task: 'quick-create-space',
  /*
   * §V2-06 frame `08:00` — Form is `scopedToSpace` for a reason the other four
   * do not have: a form's destination is a LIST, and the space picker is what
   * narrows the list picker to the space the "+" was pressed on.
   */
  form: 'quick-create-form-space',
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

  const offered = await page.locator('[data-testid^="space-create-"]').evaluateAll((els) =>
    els
      .map((e) => (e.getAttribute('data-testid') ?? '').replace('space-create-', ''))
      .filter((k) => k !== 'menu' && k !== 'menu-title' && !k.startsWith('open-') && !k.startsWith('label-')),
  )
  /* The frame rules the menu into groups; so does this. */
  const nav = offered.filter((k) => EXPECTED_NAV.includes(k))
  const kinds = offered.filter((k) => !EXPECTED_NAV.includes(k))
  chk(
    kinds.length === EXPECTED_KINDS.length,
    `it offers ${EXPECTED_KINDS.length} things to create`,
    `the menu's create group offered ${kinds.length}: ${JSON.stringify(kinds)}`,
  )
  chk(
    JSON.stringify(kinds) === JSON.stringify(EXPECTED_KINDS),
    'and they are the create kinds, in the shared module\'s order',
    `the menu offered ${JSON.stringify(kinds)}, expected ${JSON.stringify(EXPECTED_KINDS)}`,
  )
  /*
   * THE FOOTER IS ITS OWN CLAIM. Frame `08:00` rules Imports and Templates off
   * below the creatable things, and `[12:04]`/`[12:10]` say what they are for.
   * Asserted here rather than folded into the count above, so that a footer
   * item that went missing is reported as a missing footer item and not as a
   * create kind that vanished.
   */
  chk(
    JSON.stringify(nav) === JSON.stringify(EXPECTED_NAV),
    'and below the rule it offers Imports and Templates, as the frame\'s bottom group does',
    `the menu's footer group offered ${JSON.stringify(nav)}, expected ${JSON.stringify(EXPECTED_NAV)}`,
  )
  /*
   * THE RULE IS WHERE THE CONTAINERS START, and this check exists because the
   * rule moved once without anybody noticing. It was drawn at a literal index
   * into `SPACE_CREATE_TYPES` — `{i === 5 && <DropdownMenuSeparator />}` — so
   * inserting Form at position five separated Dashboard from Form instead of
   * Form from List. Every other check still passed: same items, same order,
   * same labels. Asked of the DOM rather than of the array, because the array
   * is what was wrong.
   */
  const ruleBeforeList = await page.evaluate(() => {
    const first = document.querySelector('[data-testid="space-create-list"]')
    const prev = first?.previousElementSibling
    return {
      found: !!first,
      prevRole: prev?.getAttribute('role') ?? prev?.tagName ?? null,
      prevTestId: prev?.getAttribute('data-testid') ?? null,
    }
  })
  chk(
    ruleBeforeList.found && ruleBeforeList.prevRole === 'separator',
    'and the rule falls where the containers begin, immediately above List',
    `the element before List was ${JSON.stringify(ruleBeforeList)} — the frame rules this menu into ` +
      'groups, and a rule drawn at a hardcoded index moves to the wrong boundary the first time ' +
      'anything is inserted above List',
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

  for (const kind of ['task', 'list', 'folder', 'project', 'form']) {
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

  /*
   * §V2-06 frame `08:00` — AND THE NEW ONE, ALL THE WAY TO THE SERVER.
   *
   * `targetListId` is the whole difference between a form and a page that
   * collects nothing: `FormsService.createTaskForSubmission` returns early
   * when a form has neither that nor a routing field, so a form created
   * without one accepts replies and produces nothing at all. The tab is
   * therefore checked on the row it wrote, not on having opened — and on the
   * target specifically, because a form that saved its title and dropped its
   * destination is the mirror defect and looks identical in the Forms list.
   *
   * WHAT IS DELIBERATELY NOT RE-TESTED HERE: that a submission to a form with
   * a `targetListId` becomes a task in that list. `task-provenance.mjs`
   * already submits to a real slug and reads the task back. This row is the
   * SURFACE that was missing — the menu item and a creator that fills in the
   * one field which decides whether the form does anything — and re-proving
   * the routing would be a second copy of a check that already exists.
   */
  console.log('\n▶ `08:00` — and the Form item makes a form that files somewhere')
  const FORM_NAME = `Menu form ${TAG}`

  /*
   * FIRST, THE SPACE AS IT IS: no lists in it yet, because nothing above made
   * one. This is the state a brand-new space is in, and it is the one that
   * found a defect — the destination picker was empty, the button was
   * disabled, and nothing said why. `[21:49]` is the same dead end the List
   * tab had ("a space with no project … which is the extra level she does not
   * have"), and a silently disabled button is the version of it that cannot
   * even be complained about.
   */
  /*
   * COUNTED THE WAY THE PICKER COUNTS. `/lists/space/:id` answers a narrower
   * question — `getListsBySpace` returns the lists of the space's hidden
   * default container, which is "lists directly under a space" — and asking
   * it here would make this check agree with a picker that was wrong for
   * exactly that reason.
   */
  const before = ((await api(`/lists/workspace/${WS}`)).data ?? []).filter((l) => l.spaceId === SPACE)
  await openMenu()
  await page.getByTestId('space-create-form').click()
  await page.waitForSelector('[data-testid="quick-create-form-title"]', { timeout: 15_000 })
  await page.getByTestId('quick-create-form-space').selectOption(SPACE)
  await page.waitForTimeout(900)
  const noListNote = await page.getByTestId('quick-create-form-no-lists').count()
  const disabledWhenEmpty = await page.getByTestId('quick-create-form-submit').isDisabled()
  chk(
    before.length === 0 && noListNote === 1 && disabledWhenEmpty,
    'a Space with no Lists says so instead of leaving a disabled button unexplained',
    `the space held ${before.length} list(s), the note was drawn ${noListNote} time(s) and the button ` +
      `was ${disabledWhenEmpty ? '' : 'NOT '}disabled — a form filed nowhere makes nothing, so refusing ` +
      'is right and refusing in silence is not',
  )
  await dismissAll()

  /*
   * THEN WITH SOMEWHERE TO FILE. Seeded through the API rather than through
   * the UI: what is under test here is the Form tab, and driving three other
   * dialogs to reach it would make every failure below ambiguous.
   */
  const projForList = (await api(`/projects/space/${SPACE}`)).data ?? []
  const seeded = await api('/lists', {
    method: 'POST',
    body: { projectId: projForList[0]?.id, name: `Form target ${TAG}` },
  })
  const targetList = seeded.data?.id ?? null
  /*
   * RELOADED, because this list was made through the API and no invalidation
   * can follow a write the page never saw. React Query holds the workspace's
   * list result for 30 seconds, so reopening the modal serves the cached
   * version — which is how the PRODUCT bug beside this was found: a list
   * created through the List tab in the same modal was missing from this
   * picker for the same reason, because `['lists', projectId]` is not a prefix
   * of the other list keys. Those paths invalidate the bare `['lists']` prefix
   * now; this one cannot invalidate anything, so it starts the page again.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`[data-testid="space-link-${SPACE}"]`, { timeout: 20_000 })
  await openMenu()
  await page.getByTestId('space-create-form').click()
  await page.waitForSelector('[data-testid="quick-create-form-title"]', { timeout: 15_000 })
  await page.getByTestId('quick-create-form-title').fill(FORM_NAME)
  await page.getByTestId('quick-create-form-space').selectOption(SPACE)
  await waitUntil(
    () => page.getByTestId('quick-create-form-list').locator('option').count().then((n) => n > 1),
    { timeoutMs: 10_000 },
  )
  const submitDisabledWithNoList = await page.getByTestId('quick-create-form-submit').isDisabled()
  if (targetList) await page.getByTestId('quick-create-form-list').selectOption(targetList)
  await page.getByTestId('quick-create-form-submit').click()
  await page.waitForTimeout(2500)

  const forms = await api(`/workspaces/${WS}/forms`)
  const made = (forms.data ?? []).find((f) => f.title === FORM_NAME)
  chk(
    !!targetList && submitDisabledWithNoList && !!made && made.targetListId === targetList,
    'a form created through the menu exists and files into the list it was given',
    `the seeded list answered ${seeded.status}; the button was ${submitDisabledWithNoList ? '' : 'NOT '}` +
      `disabled before one was picked; GET /workspaces/:id/forms answered ${forms.status} and the row is ` +
      `${JSON.stringify(made ? { title: made.title, targetListId: made.targetListId } : null)} (wanted ` +
      `targetListId ${targetList})`,
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
  /*
   * AND THE FOOTER TWO MUST NOT HAVE GROWN ONE. `workspace-sidebar.tsx` says
   * in so many words that putting Imports and Templates through
   * `SPACE_CREATE_TYPES` "would mean inventing a creator for each that only
   * ever navigates away — the dead control, twice". A comment saying that is
   * not a guarantee; this is.
   */
  chk(
    EXPECTED_NAV.every((k) => !tabKinds.includes(k)),
    'and neither footer item has grown a creator tab it would have nothing to put in',
    `the tab strip offered ${JSON.stringify(tabKinds)} — one of ${JSON.stringify(EXPECTED_NAV)} became a ` +
      'CreateKind, which means a tab whose only behaviour can be to navigate away from itself',
  )

  /*
   * THE FOOTER ITEMS GO SOMEWHERE. Last, because it leaves the space route.
   * Two items, one check each, so a footer where both were wired to the same
   * destination is not reported as a working menu.
   */
  console.log('\n▶ and the footer two actually go where they say')
  for (const [kind, tail] of [['imports', '/import'], ['templates', '/templates']]) {
    await dismissAll()
    // Back to the space route each time: the previous iteration navigated away,
    // and `openMenu` needs the space's row in the sidebar to hover.
    await page.goto(`${B}/app/${WS}/${SPACE}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(`[data-testid="space-link-${SPACE}"]`, { timeout: 15_000 })
    await openMenu()
    await page.getByTestId(`space-create-${kind}`).click({ timeout: 15_000 })
    const landed = await waitUntil(() => page.url().endsWith(tail), { timeoutMs: 10_000 })
    chk(
      landed,
      `"${kind}" goes to ${tail}`,
      `"${kind}" left the page at ${page.url()}, which does not end ${tail} — an item that opens the ` +
        'menu and then does nothing is the dead control the sidebar comment promises it is not',
    )
  }
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
