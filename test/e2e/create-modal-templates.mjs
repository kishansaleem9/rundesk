/**
 * THE CREATE MODAL'S TEMPLATES MENU — FRAME `00:52`, FOUR ACTIONS IN TWO GROUPS
 * (`ledger-rows/row-1060`).
 *
 * The frame draws the footer's `Templates` button opening a menu of four:
 * **Use Template** and **Create instantly from template**, a divider, then
 * **Save as template** (a floppy) and **Update existing template** (a circular
 * arrow). ClickUp's help centre says the same of its task creation modal
 * ("Create a task", read from search excerpts, since the site is blocked
 * here): "create the task instantly from a template, load a task template,
 * save the task as a template, or update an existing task template". Its "Use
 * task templates" and "Customize a template" add that a template is saved
 * under a name, that updating one lets it be renamed on the way, and that
 * "once a task template is updated, the template cannot be reverted to its
 * previous state".
 *
 * Rundesk had one of the four: a `<select>` that made the submit instantiate
 * the template chosen. Every write claimed here is read back from the server —
 * a task by SQL, with its list, checklist and subtask; a template's payload
 * through the API — and every menu is read for what it OFFERS, because
 * offering what the server refuses is the defect its permission half is about:
 *
 *   · with no templates, a template manager is offered Save as template alone;
 *   · with templates, the four, in the frame's two groups, over the modal;
 *   · Use Template lists the templates and puts the choice on the button (its
 *     X takes it back); the submit then makes the task from it, and opens it;
 *   · Escape with a submenu open closes the menu and keeps the modal;
 *   · Create instantly makes the task the moment a template is chosen, with no
 *     submit and no `POST /tasks`, in the chosen list, then closes the modal
 *     with a toast whose View task opens it;
 *   · Save as template asks for a name in the modal (the typed title first),
 *     makes a template holding the form's fields, makes no task and keeps the
 *     form;
 *   · Update existing template asks under the template's own name, then writes
 *     the form over it and keeps its checklists, subtasks and custom-field
 *     values, which the form cannot say, as its panel says before the press;
 *   · a member, who lacks `template.manage`, is offered the first group only,
 *     and the API refuses their save (403).
 *
 * AND A PEOPLE OR LABELS FIELD'S LIST IS KEPT, `found-30-sep/templates-null-array-field-values`.
 * The payload's type was widened to `string[]` so that a template would not
 * drop a task's people field, and the service's normaliser kept only one-value
 * shapes: every write stored the list as null. Measured on each write that
 * shapes a payload, and on the task made from one:
 *
 *   · made through the API with a People and a Labels list, the template holds
 *     both; Update existing template keeps them as lists, not null;
 *   · a task with both fields set, saved as a template, keeps them, and a task
 *     made from that template carries them in its own fields (read by SQL).
 *
 * ClickUp (help centre, "Use task templates", read from search excerpts): a
 * template saved with "Import everything" includes "all task properties,
 * fields, and settings", and "Custom Fields" leaves out only Formula Fields.
 *
 * AND ONE VALUE IS WRITTEN ONLY WHERE ITS FIELD'S ROUTE WOULD TAKE IT,
 * `found-30-sep/template-values-written-unchecked`. A template names its fields
 * by name, and applied in another project whose field of that name is a Number,
 * a Dropdown without the option or an Email field, it wrote the words, the
 * option and the non-address in anyway. Each is refused by that field's own
 * route (400); applied, each is now left unset, while a value the field can
 * hold is written. ClickUp's help centre says nothing of a template applied
 * where a field of the same name is of another kind, so the route's rule is
 * the one kept: nothing is written that the field itself would refuse.
 *
 * AND WHAT IS SET IN THE FORM BESIDE A TEMPLATE IS KEPT,
 * `found-30-sep/template-submit-ignores-the-form`. With a template chosen,
 * Create task sent the template's route the list and the title alone: the
 * priority, description, dates, estimate, tags, task type and assignees typed
 * into the same form were dropped without a word. ClickUp's help centre says
 * templates "are merged when applied to an existing task" ("Intro to
 * templates"), and its merge keeps the target's "tags, priorities, dates … and
 * estimated time", adds the other's description "to the bottom" and adds its
 * assignees ("Merge tasks"), all read from search excerpts. So the form is the
 * task and the template is merged into it:
 *
 *   · before Create, the modal says what the template brings and that what is
 *     set here wins over it, naming what was set;
 *   · the priority and due date set win over the template's, and its checklist
 *     and subtask come with the task; the tag and assignee set are added to its
 *     own tag; a typed description comes first, the template's after it;
 *   · what was left alone is not sent, and the template's estimate and start
 *     date stand for it;
 *   · what the route takes beside a template is checked as `POST /tasks`
 *     checks the same fields, and refused with the same answer;
 *   · and in a window 700 high the modal scrolls to Create task
 *     (`found-30-sep/create-modal-cuts-off-create`): the form could not scroll,
 *     and the note put Create out of reach at 1000.
 *
 *   node test/e2e/create-modal-templates.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 33

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const MEMBER_PASSWORD = 'Teammate@123!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cmt${stamp}`
const MEMBER_EMAIL = `member-${TAG}@rundesk.invalid`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`),
 * bound once the address it calls is known; like the copy, it answers status 0
 * when nothing answers. */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null
let memberId = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the tasks each action made are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  /* A refused write stops the suite, naming what could not be staged. */
  const must = (what, res) => {
    if (res.status === 0 || res.status >= 300) throw new Error(`could not ${what}: ${said(res)}`)
    return res.data
  }
  WS = must('make the workspace', await A('/workspaces', { method: 'POST', body: { name: TAG } }))?.id
  const SPACE = must('make the space', await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } }))?.id
  const PROJECT = must('make the project', await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } }))?.id
  // Two lists, and the modal is pointed at the SECOND: "in the chosen list"
  // cannot then pass by landing in whichever list comes first.
  must('make the first list', await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} first list` } }))
  const LIST_NAME = `${TAG} chosen list`
  const LIST = must('make the chosen list', await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: LIST_NAME } }))?.id
  if (!WS || !SPACE || !PROJECT || !LIST) throw new Error('the workspace, space, project or list came back without an id')

  /* A member, who may use a template and may not make or change one. `signUpApi` waits out sign-up's ten a minute. */
  const registered = await signUpApi(API, { email: MEMBER_EMAIL, fullName: `Member ${TAG}`, password: MEMBER_PASSWORD, organizationName: `Member ${TAG}` })
  memberId = registered.user?.id ?? null
  const M = apiAs(registered.accessToken)
  must('add the member', await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: MEMBER_EMAIL, role: 'member' } }))

  /* The templates, staged through the API once the menu has been read without any. */
  const T1_NAME = `Onboarding ${TAG}`
  const T1 = {
    title: `Onboard ${TAG}`,
    description: `Template body ${TAG}`,
    priority: 'urgent',
    checklists: [{ title: 'Steps', items: [{ content: 'Step one' }, { content: 'Step two' }] }],
    subtasks: [{ title: `Sub ${TAG}`, description: null, priority: 'low', timeEstimate: null, dueDateOffsetDays: null }],
  }
  const T1_MADE = { checklists: [{ title: 'Steps', items: ['Step one', 'Step two'] }], subtasks: [`Sub ${TAG}`] }
  /*
   * `found-30-sep/templates-null-array-field-values` — a People and a Labels
   * field, whose values are LISTS: two people (the admin and the member, both
   * in this workspace) and two of the Labels field's options.
   */
  const ADMIN_ID = auth.user?.id ?? null
  if (!ADMIN_ID || !memberId) throw new Error('the admin or the member came back without an id')
  const PEOPLE = `People ${TAG}`
  const LABELS = `Labels ${TAG}`
  const LISTS = { [PEOPLE]: [ADMIN_ID, memberId], [LABELS]: ['red', 'blue'] }
  /** A payload's People and Labels values, as it holds them. */
  const listsIn = (p) => Object.fromEntries([PEOPLE, LABELS].map((name) => [name, p?.customFieldValues?.find((v) => v.fieldName === name)?.value ?? null]))
  const T2_NAME = `Update me ${TAG}`
  const T2 = {
    title: `Old title ${TAG}`,
    description: 'Old body',
    priority: 'low',
    timeEstimate: 60,
    startDateOffsetDays: 9,
    dueDateOffsetDays: 10,
    labels: ['old-tag'],
    checklists: [{ title: 'Kept list', items: [{ content: 'Kept item' }] }],
    subtasks: [{ title: `Kept sub ${TAG}`, description: null, priority: 'high', timeEstimate: null, dueDateOffsetDays: null }],
    customFieldValues: [
      { fieldName: `Budget ${TAG}`, value: 5 },
      { fieldName: PEOPLE, value: LISTS[PEOPLE] },
      { fieldName: LABELS, value: LISTS[LABELS] },
    ],
  }

  const templatesNow = async () => {
    const res = await A(`/workspaces/${WS}/task-templates`)
    return res.status === 200 ? (res.data ?? []) : null
  }
  const templateNamed = async (name) => (await templatesNow())?.find((tpl) => tpl.name === name) ?? null
  /** Top-level tasks so titled, with where they are and what they carry. */
  const madeTasks = (title) =>
    sql`select id, list_id, priority::text as priority, description from tasks where title = ${title} and parent_task_id is null`
  const contentOf = async (taskId) => {
    const lists = await sql`select id, title from task_checklists where task_id = ${taskId} order by position`
    const checklists = []
    for (const cl of lists) {
      const items = await sql`select content from task_checklist_items where checklist_id = ${cl.id} order by position`
      checklists.push({ title: cl.title, items: items.map((i) => i.content) })
    }
    const subs = await sql`select title from tasks where parent_task_id = ${taskId} order by position`
    return { checklists, subtasks: subs.map((s) => s.title) }
  }
  /** What the form can say, as a template's payload holds it. */
  const formFields = (p) => p && {
    title: p.title,
    description: p.description,
    priority: p.priority,
    timeEstimate: p.timeEstimate,
    startDateOffsetDays: p.startDateOffsetDays,
    dueDateOffsetDays: p.dueDateOffsetDays,
    labels: p.labels,
  }
  /** What it cannot. */
  const beyondForm = (p) => p && { checklists: p.checklists, subtasks: p.subtasks, customFieldValues: p.customFieldValues }
  const where = (url) => { const u = new URL(url); return `${u.pathname}${u.search}` }
  /** A day from today at an hour, as a `datetime-local` box holds it, on this machine's clock (the browser's). */
  const dayAt = (days, hour) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`
  }

  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // A browser prompt is the thing Save as template must not use.
  let dialogs = 0
  page.on('dialog', (d) => { dialogs += 1; d.dismiss().catch(() => {}) })
  // What the page sent, so "no submit" is a fact about the wire.
  const sent = []
  page.on('request', (r) => sent.push(`${r.method()} ${new URL(r.url()).pathname}`))

  const signIn = async (pg, email, password) => {
    await pg.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await pg.fill('input[type=email]', email, { timeout: 15_000 }).catch(() => {})
    await pg.fill('input[type=password]', password, { timeout: 15_000 }).catch(() => {})
    await pg.click('button[type=submit]', { timeout: 15_000 }).catch(() => {})
    await pg.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {})
    await pg.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  }
  const titleBox = (pg) => pg.getByTestId('quick-create-task-title')
  const modalOpen = (pg) => titleBox(pg).isVisible().catch(() => false)
  /** The workspace's home, with the create modal open on its Task tab. */
  const openModal = async (pg) => {
    await pg.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await pg.getByTestId('quick-create-open').click({ timeout: 25_000 }).catch(() => {})
    await pg.getByTestId('create-tab-task').click({ timeout: 10_000 }).catch(() => {})
    return waitUntil(() => modalOpen(pg), { timeoutMs: 15_000 })
  }
  const chooseList = async (pg) => {
    await pg.getByTestId('quick-create-space').selectOption(SPACE, { timeout: 10_000 }).catch(() => {})
    await pg.getByTestId('quick-create-project').selectOption(PROJECT, { timeout: 10_000 }).catch(() => {})
    await pg.getByTestId('quick-create-list').selectOption(LIST, { timeout: 10_000 }).catch(() => {})
  }
  const menu = (pg) => pg.getByTestId('quick-create-tpl-menu')
  const menuGone = (pg) => waitUntil(async () => (await menu(pg).count().catch(() => 0)) === 0, { timeoutMs: 5000 })
  /*
   * The Templates button, pressed once it is there AND ONCE THE LAST MENU HAS
   * LEFT. A menu that has closed stays mounted through its exit animation, and
   * while it is there a press on the button reads to it as a press outside:
   * measured in a loop on a loaded lane, the new menu opened and closed 3ms
   * apart in two rounds of six, each time with the old one still leaving (355ms
   * after it closed), and never once it had gone. Whether its menu opened.
   */
  const openMenu = async (pg) => {
    await menuGone(pg)
    await waitUntil(() => pg.getByTestId('quick-create-templates').isVisible().catch(() => false), { timeoutMs: 10_000 })
    await pg.getByTestId('quick-create-templates').click({ timeout: 8000 }).catch(() => {})
    return waitUntil(() => menu(pg).isVisible().catch(() => false), { timeoutMs: 5000 })
  }
  /* Escape only on a menu that is open: with none, it would close the modal. */
  const closeMenu = async (pg) => {
    if (await menu(pg).isVisible().catch(() => false)) await pg.keyboard.press('Escape').catch(() => {})
    return menuGone(pg)
  }
  /** The menu's actions as drawn, in order, each by its first line (Create instantly may carry its reason under it). */
  const offered = async (pg) =>
    (await pg.locator('[data-testid^="quick-create-tpl-action-"]').filter({ visible: true }).allInnerTexts().catch(() => []))
      .map((s) => s.split('\n')[0].trim())
  /** One action's submenu, and whether it opened. */
  const openSub = async (pg, which) => {
    await pg.getByTestId(`quick-create-tpl-action-${which}`).click({ timeout: 5000 }).catch(() => {})
    return waitUntil(() => pg.getByTestId(`quick-create-tpl-list-${which}`).isVisible().catch(() => false), { timeoutMs: 5000 })
  }
  /** The templates a submenu lists, as drawn. */
  const listed = async (pg, which) =>
    (await pg.locator(`[data-testid^="quick-create-tpl-${which}-"]`).filter({ visible: true }).allInnerTexts().catch(() => []))
      .map((s) => s.trim())
  /*
   * DRAWN OVER THE MODAL, which Playwright cannot say: while a menu is open the
   * page beneath takes no pointer events, so a menu under the modal is still
   * "visible" and still takes a click (`create-task-chevron` measured it). So
   * the page is asked what is painted at the element's middle, with pointer
   * events back on for that one question.
   */
  const drawnOver = (pg, testId) => pg.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return false
    const box = el.getBoundingClientRect()
    const was = document.body.style.pointerEvents
    document.body.style.pointerEvents = 'auto'
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    document.body.style.pointerEvents = was
    return Boolean(hit && el.contains(hit))
  }, testId).catch(() => false)
  const toasts = (pg) => pg.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  /*
   * THE ROUTE'S ANSWER, NOT THE ROW. Instantiating writes the task, then its
   * checklists, then its subtasks, and answers after the last: the row alone
   * appears first, and a read taken the moment it did found no subtask yet (the
   * first run of this suite). Null when nothing answered.
   */
  const answered = (pg, pathEnd) => pg.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(pathEnd),
    { timeout: 15_000 },
  ).catch(() => null)
  const trigger = page.getByTestId('quick-create-templates').filter({ visible: true })
  const panel = page.getByTestId('quick-create-tpl-panel')
  const nameBox = page.getByTestId('quick-create-tpl-name')

  await signIn(page, ADMIN.email, ADMIN.password)

  // ══ 1. NO TEMPLATES YET ══════════════════════════════════════════════════
  console.log('\n▶ with no templates yet, what a template manager is offered')
  await openModal(page)
  const bareMenu = await openMenu(page)
  let bareOffer = []
  await waitUntil(async () => (bareOffer = await offered(page)).includes('Save as template'), { timeoutMs: 8000 })
  const bareDivider = await page.getByTestId('quick-create-tpl-divider').isVisible().catch(() => false)
  chk(
    bareMenu && JSON.stringify(bareOffer) === JSON.stringify(['Save as template']) && !bareDivider,
    'with no templates, a template manager is offered Save as template and nothing else',
    `the menu opened ${bareMenu}, offering ${JSON.stringify(bareOffer)}${bareDivider ? ' with a divider' : ''}`,
  )
  await closeMenu(page)

  const T1_ID = must('make the first template', await A(`/workspaces/${WS}/task-templates`, { method: 'POST', body: { name: T1_NAME, payload: T1 } }))?.id
  const T2_ID = must('make the second template', await A(`/workspaces/${WS}/task-templates`, { method: 'POST', body: { name: T2_NAME, payload: T2 } }))?.id
  // As the server keeps it, so what Update must keep is compared with what was there.
  const T2_BEFORE = (await templateNamed(T2_NAME))?.payload ?? null
  if (!T1_ID || !T2_ID || !T2_BEFORE) throw new Error('the templates came back without ids, or could not be read back')

  // ══ 2. THE FOUR, IN TWO GROUPS ═══════════════════════════════════════════
  console.log('\n▶ frame `00:52` — the Templates menu, to a template manager')
  await openModal(page)
  await chooseList(page)
  const fullMenu = await openMenu(page)
  const FRAME = ['Use Template', 'Create instantly from template', 'Save as template', 'Update existing template']
  let fullOffer = []
  await waitUntil(async () => (fullOffer = await offered(page)).length === FRAME.length, { timeoutMs: 8000 })
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="quick-create-tpl-menu"]')
    if (!root) return null
    const order = [...root.querySelectorAll('[data-testid^="quick-create-tpl-action-"], [data-testid="quick-create-tpl-divider"]')]
      .map((el) => el.getAttribute('data-testid').replace('quick-create-tpl-', ''))
    const groupOf = (a) => root.querySelector(`[data-testid="quick-create-tpl-action-${a}"]`)?.closest('[role="group"]') ?? null
    const [use, instant, save, update] = ['use', 'instant', 'save', 'update'].map(groupOf)
    return { order, twoGroups: Boolean(use && use === instant && save && save === update && use !== save) }
  }).catch(() => null)
  const ORDER = ['action-use', 'action-instant', 'divider', 'action-save', 'action-update']
  const menuOnTop = fullMenu && await drawnOver(page, 'quick-create-tpl-action-use')
  chk(
    fullMenu && menuOnTop && JSON.stringify(fullOffer) === JSON.stringify(FRAME)
      && JSON.stringify(layout?.order ?? null) === JSON.stringify(ORDER) && layout?.twoGroups === true,
    'to a template manager, Templates opens the frame’s four over the modal, in two groups with the divider between: Use Template and Create instantly from template, then Save as template and Update existing template',
    `the menu opened ${fullMenu}${fullMenu ? `, drawn ${menuOnTop ? 'over' : 'beneath'} the modal` : ''}, offering ${JSON.stringify(fullOffer)}, laid out ${JSON.stringify(layout)}`,
  )

  // ══ 3–6. USE TEMPLATE ════════════════════════════════════════════════════
  console.log('\n▶ Use Template')
  const useOpen = await openSub(page, 'use')
  const serverNames = ((await templatesNow()) ?? []).map((tpl) => tpl.name).sort()
  let useNames = []
  await waitUntil(async () => (useNames = await listed(page, 'use')).length >= serverNames.length, { timeoutMs: 5000 })
  const useOnTop = useOpen && await drawnOver(page, `quick-create-tpl-use-${T1_ID}`)
  chk(
    useOpen && useOnTop && serverNames.length === 2 && JSON.stringify([...useNames].sort()) === JSON.stringify(serverNames),
    'Use Template lists the workspace’s task templates by name, over the modal',
    `the submenu opened ${useOpen}${useOpen ? `, drawn ${useOnTop ? 'over' : 'beneath'} the modal` : ''}, listing ${JSON.stringify(useNames)}; the server holds ${JSON.stringify(serverNames)}`,
  )

  await page.getByTestId(`quick-create-tpl-use-${T1_ID}`).click({ timeout: 5000 }).catch(() => {})
  let chosenLabel = ''
  await waitUntil(async () => (chosenLabel = await readText(trigger, { timeoutMs: 1000 })).includes(T1_NAME), { timeoutMs: 5000 })
  await page.getByTestId('quick-create-templates-clear').click({ timeout: 5000 }).catch(() => {})
  let clearedLabel = ''
  await waitUntil(async () => !(clearedLabel = await readText(trigger, { timeoutMs: 1000 })).includes(T1_NAME), { timeoutMs: 5000 })
  chk(
    chosenLabel.includes(T1_NAME) && clearedLabel.trim() === 'Templates',
    'the template chosen is shown on the Templates button, and the X beside it takes the choice back',
    `the button read ${JSON.stringify(chosenLabel)} once it was chosen and ${JSON.stringify(clearedLabel)} after its X`,
  )

  // Chosen again, for the submit.
  await openMenu(page)
  await openSub(page, 'use')
  await page.getByTestId(`quick-create-tpl-use-${T1_ID}`).click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await readText(trigger, { timeoutMs: 1000 })).includes(T1_NAME), { timeoutMs: 5000 })
  const USED = `Used ${TAG}`
  await titleBox(page).fill(USED, { timeout: 5000 }).catch(() => {})
  await waitUntil(() => page.getByTestId('quick-create-submit').isEnabled().catch(() => false), { timeoutMs: 8000 })
  const usedAnswer = answered(page, `/task-templates/${T1_ID}/instantiate`)
  await page.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const usedStatus = (await usedAnswer)?.status() ?? null
  let usedRows = []
  await waitUntil(async () => (usedRows = await madeTasks(USED)).length > 0, { timeoutMs: 15_000 })
  const used = usedRows[0] ?? null
  const usedContent = used ? await contentOf(used.id) : null
  chk(
    usedRows.length === 1 && used.list_id === LIST && used.priority === T1.priority && used.description === T1.description
      && JSON.stringify(usedContent) === JSON.stringify(T1_MADE),
    'with a template chosen under Use Template, Create task makes the task from it: the typed title, and the template’s priority, description, checklist and subtask, in the chosen list',
    `the template's route answered ${usedStatus ?? 'nothing'}; ${usedRows.length} task(s) so titled; the first ${JSON.stringify(used)}, carrying ${JSON.stringify(usedContent)}; the chosen list is ${LIST}`,
  )
  /*
   * FROM THE TEMPLATE, or this is about the plain create, which opened its task
   * all along: measured before the menu, the submit made a plain task and this
   * passed alone of fifteen. The template's answer is `{ taskId, task }`, and the
   * old submit read `.id` off it: driven through the old select, it posted the
   * watcher to `/tasks/undefined/watchers` and left the page on the list with
   * no task open.
   */
  const usedOpened = !!used && await waitUntil(() => new URL(page.url()).searchParams.get('task') === used.id, { timeoutMs: 10_000 })
  chk(
    usedStatus !== null && usedStatus < 300 && usedOpened,
    'and it opens the task it made from the template, as Create task does without one',
    `the template's route answered ${usedStatus ?? 'nothing'}; the page is ${where(page.url())}${used ? `; the task is ${used.id}` : '; no task was made'}`,
  )

  // ══ 7. ESCAPE WITH A SUBMENU OPEN ════════════════════════════════════════
  console.log('\n▶ Escape, with a submenu open')
  await openModal(page)
  const KEPT = `Escape ${TAG}`
  await titleBox(page).fill(KEPT, { timeout: 5000 }).catch(() => {})
  const escMenu = await openMenu(page)
  const escSub = escMenu && await openSub(page, 'use')
  await page.keyboard.press('Escape').catch(() => {})
  const escShut = await waitUntil(async () => !(await menu(page).isVisible().catch(() => false)), { timeoutMs: 5000 })
  const escModal = await modalOpen(page)
  const escTitle = await titleBox(page).inputValue({ timeout: 3000 }).catch(() => null)
  chk(
    escSub && escShut && escModal && escTitle === KEPT,
    'Escape with a submenu open closes the menu and leaves the modal open with what was typed',
    `the submenu opened ${escSub}; the menu closed ${escShut}; the modal open ${escModal}, its title ${JSON.stringify(escTitle)}`,
  )

  // ══ 8–9. CREATE INSTANTLY FROM TEMPLATE ══════════════════════════════════
  console.log('\n▶ Create instantly from template')
  await openModal(page)
  await chooseList(page)
  const INSTANT = `Instant ${TAG}`
  await titleBox(page).fill(INSTANT, { timeout: 5000 }).catch(() => {})
  const instantMenu = await openMenu(page)
  const instantSub = instantMenu && await openSub(page, 'instant')
  const instantFrom = sent.length
  const instantAnswer = answered(page, `/task-templates/${T1_ID}/instantiate`)
  await page.getByTestId(`quick-create-tpl-instant-${T1_ID}`).click({ timeout: 5000 }).catch(() => {})
  /*
   * THE TOAST FIRST, and its View pressed before the server is read: a toast
   * lives seconds, and a failure anywhere later must not also read as "no
   * toast" (the rule `assign-to-priorities` learnt).
   */
  let instantToast = ''
  const toastSeen = await waitUntil(async () => {
    instantToast = (await toasts(page)).find((s) => s.includes(INSTANT)) ?? ''
    return instantToast.length > 0
  }, { timeoutMs: 15_000 })
  const instantShut = await waitUntil(async () => !(await modalOpen(page)), { timeoutMs: 5000 })
  await page.locator('[data-sonner-toast]').filter({ hasText: INSTANT }).getByRole('button', { name: 'View task' })
    .click({ timeout: 5000 }).catch(() => {})
  await instantAnswer
  let instantRows = []
  await waitUntil(async () => (instantRows = await madeTasks(INSTANT)).length > 0, { timeoutMs: 15_000 })
  const instantTask = instantRows[0] ?? null
  const instantContent = instantTask ? await contentOf(instantTask.id) : null
  const onTheWire = sent.slice(instantFrom)
  const postedTask = onTheWire.includes('POST /api/v1/tasks')
  const postedInstantiate = onTheWire.includes(`POST /api/v1/workspaces/${WS}/task-templates/${T1_ID}/instantiate`)
  chk(
    instantSub && postedInstantiate && !postedTask && instantRows.length === 1 && instantTask.list_id === LIST
      && instantTask.priority === T1.priority && instantTask.description === T1.description
      && JSON.stringify(instantContent) === JSON.stringify(T1_MADE),
    'Create instantly from template makes the task the moment one is chosen, with no submit: in the chosen list, under the typed title, with the template’s priority, description, checklist and subtask',
    `the submenu opened ${instantSub}; the page sent instantiate ${postedInstantiate} and POST /tasks ${postedTask}; ` +
      `${instantRows.length} task(s) so titled, the first ${JSON.stringify(instantTask)}, carrying ${JSON.stringify(instantContent)}`,
  )
  const instantOpened = !!instantTask && await waitUntil(() => {
    const u = new URL(page.url())
    return u.pathname === `/app/${WS}/${SPACE}/${PROJECT}/${LIST}` && u.searchParams.get('task') === instantTask.id
  }, { timeoutMs: 10_000 })
  chk(
    toastSeen && instantShut && instantToast.includes(LIST_NAME) && instantOpened,
    'and it closes the modal like a create, with a toast naming the task and its list whose View task opens it',
    `the toast ${toastSeen ? `read ${JSON.stringify(instantToast)}` : 'never named the task'}; the modal closed ${instantShut}; the page is ${where(page.url())}`,
  )

  // ══ 10–12. SAVE AS TEMPLATE ══════════════════════════════════════════════
  console.log('\n▶ Save as template')
  await openModal(page)
  /*
   * With a list chosen, so Create task is live: the name box sits inside the
   * task's form, and an Enter that reached the form would make the task too.
   * The name is confirmed with Enter below, as people confirm a name.
   */
  await chooseList(page)
  const SAVED = `Saved ${TAG}`
  const SAVED_BODY = `Saved body ${TAG}`
  const TAGS = [`alpha-${TAG}`, `beta-${TAG}`]
  await titleBox(page).fill(SAVED, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-description').fill(SAVED_BODY, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-priority').selectOption('high', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-estimate').fill('1h 30m', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-start').fill(dayAt(2, 9), { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-due').fill(dayAt(5, 17), { timeout: 5000 }).catch(() => {})
  for (const tag of TAGS) {
    await page.getByTestId('quick-create-tag-input').fill(tag, { timeout: 5000 }).catch(() => {})
    await page.getByTestId('quick-create-tag-input').press('Enter', { timeout: 5000 }).catch(() => {})
  }
  const FORM = { title: SAVED, description: SAVED_BODY, priority: 'high', timeEstimate: 5400, startDateOffsetDays: 2, dueDateOffsetDays: 5, labels: TAGS }
  const saveMenu = await openMenu(page)
  await page.getByTestId('quick-create-tpl-action-save').click({ timeout: 5000 }).catch(() => {})
  const saveAsked = await waitUntil(async () => (await panel.getAttribute('data-action', { timeout: 1000 }).catch(() => null)) === 'save', { timeoutMs: 5000 })
  const offeredName = await nameBox.inputValue({ timeout: 2000 }).catch(() => null)
  chk(
    saveMenu && saveAsked && offeredName === SAVED && dialogs === 0,
    'Save as template asks for the template’s name in the modal itself, starting from the typed title, and in no browser prompt',
    `the menu opened ${saveMenu}; the panel asked ${saveAsked}, offering the name ${JSON.stringify(offeredName)}; ${dialogs} browser dialog(s)`,
  )

  await nameBox.press('Enter', { timeout: 5000 }).catch(() => {})
  let saved = null
  await waitUntil(async () => !!(saved = await templateNamed(SAVED)), { timeoutMs: 10_000 })
  chk(
    !!saved && JSON.stringify(formFields(saved.payload)) === JSON.stringify(FORM),
    'Save as template makes a template holding the form’s fields: title, description, priority, the estimate in seconds, start and due as days from today, and the tags',
    `the server holds ${saved ? JSON.stringify(formFields(saved.payload)) : 'no template so named'}; the form said ${JSON.stringify(FORM)}`,
  )

  const panelGone = await waitUntil(async () => !(await panel.isVisible().catch(() => false)), { timeoutMs: 5000 })
  const savedTasks = (await madeTasks(SAVED)).length
  const kept = {
    title: await titleBox(page).inputValue({ timeout: 2000 }).catch(() => null),
    description: await page.getByTestId('quick-create-description').inputValue({ timeout: 2000 }).catch(() => null),
    priority: await page.getByTestId('quick-create-priority').inputValue({ timeout: 2000 }).catch(() => null),
  }
  const reopened = await openMenu(page)
  const reopenedSub = reopened && await openSub(page, 'use')
  let useNow = []
  await waitUntil(async () => (useNow = await listed(page, 'use')).includes(SAVED), { timeoutMs: 8000 })
  chk(
    !!saved && panelGone && savedTasks === 0 && kept.title === SAVED && kept.description === SAVED_BODY && kept.priority === 'high'
      && reopenedSub && useNow.includes(SAVED),
    'and Enter in the name box makes no task, leaves the form as it was, and the new template is under Use Template at once',
    `the panel closed ${panelGone}; ${savedTasks} task(s) so titled; the form now ${JSON.stringify(kept)}; Use Template lists ${JSON.stringify(useNow)}`,
  )
  await closeMenu(page)

  // ══ 13–16. UPDATE EXISTING TEMPLATE ══════════════════════════════════════
  console.log('\n▶ Update existing template')
  const UPDATED = `Updated ${TAG}`
  await titleBox(page).fill(UPDATED, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-priority').selectOption('urgent', { timeout: 5000 }).catch(() => {})
  const WRITTEN = { ...FORM, title: UPDATED, priority: 'urgent' }
  const updateMenu = await openMenu(page)
  const updateSub = updateMenu && await openSub(page, 'update')
  await page.getByTestId(`quick-create-tpl-update-${T2_ID}`).click({ timeout: 5000 }).catch(() => {})
  const updateAsked = await waitUntil(async () => (await panel.getAttribute('data-action', { timeout: 1000 }).catch(() => null)) === 'update', { timeoutMs: 5000 })
  const updateName = await nameBox.inputValue({ timeout: 2000 }).catch(() => null)
  // Read while the panel waits: choosing a template is not yet writing to it.
  const titleBeforePress = (await templateNamed(T2_NAME))?.payload?.title ?? null
  // What the panel promises is kept, as shown beside the button, before it is pressed.
  let updateHint = ''
  await waitUntil(async () => (updateHint = await readText(page.getByTestId('quick-create-tpl-hint').filter({ visible: true }), { timeoutMs: 1000 })).length > 0, { timeoutMs: 5000 })
  await page.getByTestId('quick-create-tpl-confirm').click({ timeout: 5000 }).catch(() => {})
  let updated = null
  await waitUntil(async () => (updated = await templateNamed(T2_NAME))?.payload?.title === UPDATED, { timeoutMs: 10_000 })
  chk(
    updateSub && updateAsked && updateName === T2_NAME && titleBeforePress === T2.title
      && JSON.stringify(formFields(updated?.payload)) === JSON.stringify(WRITTEN),
    'Update existing template asks in the modal under the template’s own name, writes nothing until it is pressed, and then holds the form’s fields',
    `the submenu opened ${updateSub}; the panel asked ${updateAsked} under ${JSON.stringify(updateName)}; before the press the template’s title was ` +
      `${JSON.stringify(titleBeforePress)}; after, it holds ${JSON.stringify(formFields(updated?.payload))} against the form’s ${JSON.stringify(WRITTEN)}`,
  )
  chk(
    updated?.payload?.title === UPDATED && JSON.stringify(beyondForm(updated.payload)) === JSON.stringify(beyondForm(T2_BEFORE)),
    'and it keeps the template’s checklists, subtasks and custom-field values, which the form cannot say',
    `after the update it holds ${JSON.stringify(beyondForm(updated?.payload))}; before, ${JSON.stringify(beyondForm(T2_BEFORE))}`,
  )
  /*
   * THE PANEL'S PROMISE IS WHAT IS KEPT. It promised checklists and subtasks
   * only, because the service turned a list-valued field to null on every
   * PATCH: it was right about what it named and silent about the rest.
   */
  chk(
    /its checklists, subtasks and custom-field values are kept/.test(updateHint),
    'the Update panel says, before it is pressed, that the template keeps its checklists, subtasks and custom-field values',
    `the panel read ${JSON.stringify(updateHint)}`,
  )
  // The update's merge shapes the payload again, and that is where a list turned to null.
  chk(
    JSON.stringify(listsIn(updated?.payload)) === JSON.stringify(LISTS),
    'and the People and Labels values it kept are still lists, not null (read back through the API)',
    `after the update it holds ${JSON.stringify(listsIn(updated?.payload))}; the lists were ${JSON.stringify(LISTS)}`,
  )

  // ══ 17–19. A PEOPLE OR LABELS LIST, IN A TEMPLATE AND BACK ═══════════════
  console.log('\n▶ a People and a Labels field’s lists, in a template and in the task made from it')
  // T2 as the server held it before any update: the create's own write.
  chk(
    JSON.stringify(listsIn(T2_BEFORE)) === JSON.stringify(LISTS),
    'a template made through the API with a People and a Labels value holds both as lists (read back through the API)',
    `it holds ${JSON.stringify(listsIn(T2_BEFORE))}; it was sent ${JSON.stringify(LISTS)}`,
  )
  /*
   * From a TASK: the two fields made in this project, set on a task through
   * their own route (which checks the people are members and the labels are
   * options), and the task saved as a template.
   */
  const peopleField = must('make the People field', await A(`/workspaces/${WS}/projects/${PROJECT}/custom-fields`, { method: 'POST', body: { name: PEOPLE, type: 'people' } }))?.id
  const labelsField = must('make the Labels field', await A(`/workspaces/${WS}/projects/${PROJECT}/custom-fields`, {
    method: 'POST',
    body: { name: LABELS, type: 'labels', options: [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }, { label: 'Green', value: 'green' }] },
  }))?.id
  const SOURCE = `Source ${TAG}`
  const sourceId = must('make the task to save', await A('/tasks', { method: 'POST', body: { listId: LIST, title: SOURCE } }))?.id
  if (!peopleField || !labelsField || !sourceId) throw new Error('the fields or the task came back without an id')
  must('set the task’s people', await A(`/workspaces/${WS}/tasks/${sourceId}/custom-fields/${peopleField}`, { method: 'PUT', body: { value: LISTS[PEOPLE] } }))
  must('set the task’s labels', await A(`/workspaces/${WS}/tasks/${sourceId}/custom-fields/${labelsField}`, { method: 'PUT', body: { value: LISTS[LABELS] } }))
  const FROM_TASK = `From a task ${TAG}`
  const fromTask = await A(`/workspaces/${WS}/task-templates/from-task/${sourceId}`, { method: 'POST', body: { name: FROM_TASK } })
  const fromTaskHeld = fromTask.data?.id ? await A(`/workspaces/${WS}/task-templates/${fromTask.data.id}`) : null
  chk(
    fromTask.status >= 200 && fromTask.status < 300 && fromTaskHeld?.status === 200 && JSON.stringify(listsIn(fromTaskHeld.data?.payload)) === JSON.stringify(LISTS),
    'a task whose People and Labels fields are set, saved as a template, keeps both as lists (read back through the API)',
    `the save answered ${said(fromTask)}; read back ${fromTaskHeld ? said(fromTaskHeld) : 'never'}, it holds ${JSON.stringify(listsIn(fromTaskHeld?.data?.payload))}`,
  )
  /*
   * AND BACK. What the schema widened the value for: a task made from the
   * template has the people and labels its source had, in its own fields —
   * read from the rows, not from any answer.
   */
  const RESTORED = `Restored ${TAG}`
  const restored = fromTask.data?.id
    ? await A(`/workspaces/${WS}/task-templates/${fromTask.data.id}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: RESTORED } })
    : { status: 0, error: { message: 'no template to make it from' } }
  const restoredId = (await madeTasks(RESTORED))[0]?.id ?? null
  const restoredFields = restoredId
    ? Object.fromEntries((await sql`select d.name, v.value from custom_field_values v join custom_field_definitions d on d.id = v.field_id where v.task_id = ${restoredId}`)
      .map((r) => [r.name, (typeof r.value === 'string' ? JSON.parse(r.value) : r.value)?.v ?? null]))
    : {}
  const restoredLists = { [PEOPLE]: restoredFields[PEOPLE] ?? null, [LABELS]: restoredFields[LABELS] ?? null }
  chk(
    restored.status >= 200 && restored.status < 300 && JSON.stringify(restoredLists) === JSON.stringify(LISTS),
    'and a task made from that template carries both lists in its own People and Labels fields (read by SQL)',
    `making it answered ${said(restored)}; ${restoredId ? `its fields hold ${JSON.stringify(restoredFields)}` : 'no task so titled'}; the source's were ${JSON.stringify(LISTS)}`,
  )

  // ══ 20–22. ONE VALUE, WHERE THE FIELD OF THAT NAME TAKES ANOTHER ═════════
  console.log('\n▶ a template’s one-value fields, applied where the field of that name takes something else')
  /*
   * `found-30-sep/template-values-written-unchecked`. A template names its
   * fields by NAME and is applied in any project, where a field of that name
   * may be of another type or define other options. A list was checked against
   * the field it lands in; one value was written into it whatever it was. The
   * field's own route (`PUT …/custom-fields/:fieldId`) refuses each of these
   * with 400, and asked here of a task in the same project, it says so.
   *
   * A second project, with four fields named as the template's: an Estimate
   * that is a Number where the template holds words, a Severity Dropdown
   * without the template's option, a Contact that is an Email field where the
   * template holds no address, and a Note that is Text, as the template's is.
   * The Note is written onto the task, and every check asks for it: a field
   * left unset then says what it was refused for, not that nothing was written.
   */
  const OTHER_PROJECT = must('make the second project', await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} other project` } }))?.id
  const OTHER_LIST = must('make its list', await A('/lists', { method: 'POST', body: { projectId: OTHER_PROJECT, name: `${TAG} other list` } }))?.id
  if (!OTHER_PROJECT || !OTHER_LIST) throw new Error('the second project or its list came back without an id')
  const ESTIMATE = `Estimate ${TAG}`
  const SEVERITY = `Severity ${TAG}`
  const CONTACT = `Contact ${TAG}`
  const NOTE = `Note ${TAG}`
  const OTHER_FIELDS = [
    [ESTIMATE, { type: 'number' }],
    [SEVERITY, { type: 'dropdown', options: [{ label: 'Low', value: 'low' }, { label: 'High', value: 'high' }] }],
    [CONTACT, { type: 'email' }],
    [NOTE, { type: 'text' }],
  ]
  const otherField = {}
  for (const [name, def] of OTHER_FIELDS) {
    otherField[name] = must(`make the field ${name}`, await A(`/workspaces/${WS}/projects/${OTHER_PROJECT}/custom-fields`, { method: 'POST', body: { name, ...def } }))?.id
  }
  const HELD = { [ESTIMATE]: 'about a week', [SEVERITY]: 'critical', [CONTACT]: 'the front desk', [NOTE]: `Kept ${TAG}` }
  const T3_ID = must('make the template applied elsewhere', await A(`/workspaces/${WS}/task-templates`, {
    method: 'POST',
    body: { name: `Elsewhere ${TAG}`, payload: { title: `Elsewhere ${TAG}`, customFieldValues: Object.entries(HELD).map(([fieldName, value]) => ({ fieldName, value })) } },
  }))?.id
  // What the field's own route answers each value, asked on a task of that project.
  const PROBE = must('make the task the route is asked on', await A('/tasks', { method: 'POST', body: { listId: OTHER_LIST, title: `Probe ${TAG}` } }))?.id
  if (!T3_ID || !PROBE) throw new Error('the template or the probe task came back without an id')
  const routeSaid = {}
  for (const [name] of OTHER_FIELDS) {
    routeSaid[name] = (await A(`/workspaces/${WS}/tasks/${PROBE}/custom-fields/${otherField[name]}`, { method: 'PUT', body: { value: HELD[name] } })).status
  }
  const APPLIED = `Applied elsewhere ${TAG}`
  const applied = await A(`/workspaces/${WS}/task-templates/${T3_ID}/instantiate`, { method: 'POST', body: { listId: OTHER_LIST, titleOverride: APPLIED } })
  const appliedId = (await madeTasks(APPLIED))[0]?.id ?? null
  /** The values the made task holds, by field name, read from the rows. */
  const appliedFields = appliedId
    ? Object.fromEntries((await sql`select d.name, v.value from custom_field_values v join custom_field_definitions d on d.id = v.field_id where v.task_id = ${appliedId}`)
      .map((r) => [r.name, (typeof r.value === 'string' ? JSON.parse(r.value) : r.value)?.v ?? null]))
    : {}
  const noteWritten = appliedFields[NOTE] === HELD[NOTE]
  const appliedSaid = `applying it answered ${said(applied)}; ${appliedId ? `the task holds ${JSON.stringify(appliedFields)}` : 'no task so titled'}`
  const leftUnset = (name) =>
    applied.status >= 200 && applied.status < 300 && !!appliedId && noteWritten && !(name in appliedFields) && routeSaid[name] === 400
  chk(
    leftUnset(ESTIMATE),
    'a template’s words, applied where the field of that name is a Number, leave that field unset — as the field’s own route refuses them (400), read by SQL',
    `the route answered ${routeSaid[ESTIMATE]} for ${JSON.stringify(HELD[ESTIMATE])}; ${appliedSaid}`,
  )
  chk(
    leftUnset(SEVERITY),
    'and its option, where that field is a Dropdown without it, leaves the Dropdown unset — as its route refuses it (400)',
    `the route answered ${routeSaid[SEVERITY]} for ${JSON.stringify(HELD[SEVERITY])}; ${appliedSaid}`,
  )
  chk(
    leftUnset(CONTACT),
    'and words that are no address, where that field is an Email field, leave it unset — as its route refuses them (400) — while the Note, a Text field there too, is written',
    `the route answered ${routeSaid[CONTACT]} for ${JSON.stringify(HELD[CONTACT])} and ${routeSaid[NOTE]} for the Note; ${appliedSaid}`,
  )

  // ══ USE TEMPLATE, WITH THE FORM FILLED IN ════════════════════════════════
  console.log('\n▶ Use Template, with the form filled in beside it')
  /*
   * `found-30-sep/template-submit-ignores-the-form`. Measured first on lane 2,
   * three runs of a probe of this scenario on the old build (the admin as the
   * assignee): the page sent instantiate `{ listId, titleOverride }` and
   * nothing else, and the task came out Low,
   * with the template's description alone, no due date, no assignee and the
   * template's tag alone — every value set in the form dropped, with nothing on
   * screen to say so.
   *
   * A template with priority Low, a description, an estimate, a start and a due
   * date, a tag, a checklist and a subtask. In the modal it is chosen under Use
   * Template, and then set beside it: priority High, the member as assignee, a
   * tag, a due date and a description. The estimate and the start date are left
   * alone.
   */
  const T4_NAME = `Merged ${TAG}`
  const T4 = {
    title: `Merged title ${TAG}`,
    description: `Template body ${TAG}`,
    priority: 'low',
    timeEstimate: 3600,
    startDateOffsetDays: 1,
    dueDateOffsetDays: 10,
    labels: [`template-tag-${TAG}`],
    checklists: [{ title: 'Merged steps', items: [{ content: 'First' }, { content: 'Second' }] }],
    subtasks: [{ title: `Merged sub ${TAG}`, description: null, priority: 'normal', timeEstimate: null, dueDateOffsetDays: null }],
  }
  const T4_MADE = { checklists: [{ title: 'Merged steps', items: ['First', 'Second'] }], subtasks: [`Merged sub ${TAG}`] }
  const T4_ID = must('make the template the form is merged with', await A(`/workspaces/${WS}/task-templates`, { method: 'POST', body: { name: T4_NAME, payload: T4 } }))?.id
  if (!T4_ID) throw new Error('the template the form is merged with came back without an id')
  const MERGED = `Typed over ${TAG}`
  const TYPED_BODY = `Typed body ${TAG}`
  const TYPED_TAG = `typed-tag-${TAG}`
  const TYPED_DUE = dayAt(3, 17)
  /*
   * In a window tall enough for the whole form: these checks are about what the
   * task is made of. Whether Create task can be reached in a short window is
   * a check of its own, at the end of this section.
   */
  await page.setViewportSize({ width: 1500, height: 1300 }).catch(() => {})
  await openModal(page)
  await chooseList(page)
  await openMenu(page)
  await openSub(page, 'use')
  await page.getByTestId(`quick-create-tpl-use-${T4_ID}`).click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await readText(trigger, { timeoutMs: 1000 })).includes(T4_NAME), { timeoutMs: 5000 })
  const mergeNote = page.getByTestId('quick-create-tpl-merge').filter({ visible: true })
  // What it says with nothing set yet, then with the form filled in.
  let noteBare = ''
  await waitUntil(async () => (noteBare = await readText(mergeNote, { timeoutMs: 1000 })).includes(T4_NAME), { timeoutMs: 5000 })
  await titleBox(page).fill(MERGED, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-priority').selectOption('high', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-assign').selectOption(memberId, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-tag-input').fill(TYPED_TAG, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-tag-input').press('Enter', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-due').fill(TYPED_DUE, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-description').fill(TYPED_BODY, { timeout: 5000 }).catch(() => {})
  let noteSet = ''
  await waitUntil(async () => /Priority · Due\b/.test(noteSet = await readText(mergeNote, { timeoutMs: 1000 })), { timeoutMs: 5000 })
  chk(
    noteBare.includes(`Made from ${T4_NAME}: its checklists, subtasks and custom-field values come with the task.`)
      && noteBare.includes('Everything else comes from the template. What you set here wins over it.')
      && noteSet.includes("What you set here wins over the template's: Priority · Due. The rest comes from the template.")
      && noteSet.includes("Your description comes first, and the template's follows it.")
      && noteSet.includes("Your tags and assignees are added to the template's."),
    'with a template chosen, the modal says before Create that its checklists, subtasks and custom-field values come with the task and that what is set here wins over it — naming Priority and Due once they are set — with a typed description first and tags and assignees added to its own',
    `with nothing set it read ${JSON.stringify(noteBare)}; with the form filled in, ${JSON.stringify(noteSet)}`,
  )

  await waitUntil(() => page.getByTestId('quick-create-submit').isEnabled().catch(() => false), { timeoutMs: 8000 })
  const mergedAnswer = answered(page, `/task-templates/${T4_ID}/instantiate`)
  const mergedRequest = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(`/task-templates/${T4_ID}/instantiate`),
    { timeout: 15_000 },
  ).catch(() => null)
  await page.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const mergedStatus = (await mergedAnswer)?.status() ?? null
  const mergedSent = await mergedRequest.then((r) => r?.postDataJSON() ?? null).catch(() => null)
  let mergedRows = []
  await waitUntil(async () => (mergedRows = await sql`
    select id, priority::text as priority, description, start_date, due_date, time_estimate
    from tasks where title = ${MERGED} and parent_task_id is null`).length > 0, { timeoutMs: 15_000 })
  const merged = mergedRows[0] ?? null
  const mergedContent = merged ? await contentOf(merged.id) : null
  const mergedAssignees = merged ? (await sql`select user_id from task_assignees where task_id = ${merged.id}`).map((r) => r.user_id) : []
  const mergedTags = merged
    ? (await sql`select l.name from task_label_assignments a join labels l on l.id = a.label_id where a.task_id = ${merged.id}`).map((r) => r.name).sort()
    : []
  const mergedSaid = `the template's route answered ${mergedStatus ?? 'nothing'}; ${mergedRows.length} task(s) so titled`
  const daysAhead = (d) => (d ? Math.round((new Date(d).getTime() - Date.now()) / 86_400_000) : null)
  chk(
    mergedStatus !== null && mergedStatus < 300 && mergedRows.length === 1 && merged.priority === 'high'
      && !!merged.due_date && new Date(merged.due_date).getTime() === new Date(TYPED_DUE).getTime()
      && JSON.stringify(mergedContent) === JSON.stringify(T4_MADE),
    'Create task with the template chosen makes the task with the priority High and the due date set in the form, over the template’s Low and its own due date, and with the template’s checklist and subtask (read by SQL)',
    `${mergedSaid}; the first ${JSON.stringify(merged && { priority: merged.priority, due: merged.due_date })} against High and ${new Date(TYPED_DUE).toISOString()}, carrying ${JSON.stringify(mergedContent)}`,
  )
  const BOTH_TAGS = [TYPED_TAG, `template-tag-${TAG}`].sort()
  chk(
    !!merged && JSON.stringify(mergedAssignees) === JSON.stringify([memberId]) && JSON.stringify(mergedTags) === JSON.stringify(BOTH_TAGS),
    'and the member assigned and the tag added in the form are on it, beside the template’s own tag (read by SQL)',
    `${mergedSaid}; assigned ${JSON.stringify(mergedAssignees)} (the member is ${memberId}); tagged ${JSON.stringify(mergedTags)} against ${JSON.stringify(BOTH_TAGS)}`,
  )
  chk(
    merged?.description === `${TYPED_BODY}\n\n${T4.description}`,
    'and its description is the one typed, then the template’s after it',
    `${mergedSaid}; its description is ${JSON.stringify(merged?.description ?? null)}`,
  )
  /*
   * WHAT WAS LEFT ALONE IS NOT SENT, and the template's value stands for it. A
   * form that sent every box would put an empty or default value over the
   * template's; the request is read off the wire, and the task by SQL.
   */
  const SENT = ['assigneeIds', 'description', 'dueDate', 'labelIds', 'listId', 'priority', 'titleOverride']
  const sentKeys = mergedSent ? Object.keys(mergedSent).sort() : null
  chk(
    JSON.stringify(sentKeys) === JSON.stringify(SENT) && !!merged && merged.time_estimate === T4.timeEstimate
      && daysAhead(merged.start_date) === T4.startDateOffsetDays,
    'Create sends the template’s route what was set in the form and nothing left alone — no estimate, start date or task type — and the task holds the template’s estimate and start date for them',
    `the page sent ${JSON.stringify(mergedSent)}; the task's estimate is ${merged?.time_estimate ?? null} against the template's ${T4.timeEstimate}, ` +
      `and it starts ${daysAhead(merged?.start_date)} day(s) ahead against the template's ${T4.startDateOffsetDays}`,
  )
  /*
   * AND CHECKED AS `POST /tasks` CHECKS THE SAME FIELDS. Each value, sent to
   * both routes: a priority not of the four, a date that is not ISO, an estimate
   * in parts of a second, and a task type, a label and a person that are not
   * this workspace's. The template's route took anything beside its list and
   * title, unread.
   */
  const REFUSED = `Refused ${TAG}`
  const NOBODY = '00000000-0000-4000-8000-00000000abcd'
  const PROBES = [
    ['priority', 'super-urgent'],
    ['dueDate', 'Oct 3 2026'],
    ['timeEstimate', 1.5],
    ['taskTypeId', NOBODY],
    ['labelIds', [NOBODY]],
    ['assigneeIds', [NOBODY]],
  ]
  const answers = []
  for (const [field, value] of PROBES) {
    const plain = await A('/tasks', { method: 'POST', body: { listId: LIST, title: REFUSED, [field]: value } })
    const fromTemplate = await A(`/workspaces/${WS}/task-templates/${T4_ID}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: REFUSED, [field]: value } })
    answers.push({ field, tasks: plain.status, instantiate: fromTemplate.status })
  }
  const refusedMade = (await madeTasks(REFUSED)).length
  chk(
    answers.every((a) => a.tasks >= 400 && a.tasks < 500 && a.instantiate === a.tasks) && refusedMade === 0,
    'and the template’s route refuses each value POST /tasks refuses — a priority not of the four, a date that is not ISO, an estimate in parts of a second, a task type, a label and a person that are not this workspace’s — with the same answer, and makes no task',
    `answered ${JSON.stringify(answers)}; ${refusedMade} task(s) so titled were made`,
  )
  /*
   * `found-30-sep/create-modal-cuts-off-create`. The backdrop is fixed to the
   * window and the card had nothing to scroll in: with a list chosen, Create
   * task sat 859–891px down on the build before, out of reach in a window 768
   * high, and the note a chosen template adds put it out of reach at 1000. In a
   * window 700 high, with the template chosen and the form filled in, Create
   * task lies below the window's edge (where it is in the modal, the scroll
   * added back), and pressing it makes the task.
   */
  const shortCtx = await browser.newContext({ viewport: { width: 1366, height: 700 }, serviceWorkers: 'block' })
  const short = await shortCtx.newPage()
  await signIn(short, ADMIN.email, ADMIN.password)
  await openModal(short)
  await chooseList(short)
  await openMenu(short)
  await openSub(short, 'use')
  await short.getByTestId(`quick-create-tpl-use-${T4_ID}`).click({ timeout: 5000 }).catch(() => {})
  const SHORT = `Short window ${TAG}`
  await titleBox(short).fill(SHORT, { timeout: 5000 }).catch(() => {})
  await short.getByTestId('quick-create-description').fill(TYPED_BODY, { timeout: 5000 }).catch(() => {})
  await waitUntil(() => short.getByTestId('quick-create-submit').isEnabled().catch(() => false), { timeoutMs: 8000 })
  // Where the button lies in the modal, whatever has been scrolled to reach the menu.
  const shortLayout = await short.evaluate(() => {
    const button = document.querySelector('[data-testid="quick-create-submit"]')
    if (!button) return null
    let scrolled = 0
    for (let el = button.parentElement; el; el = el.parentElement) scrolled += el.scrollTop
    return { bottom: Math.round(button.getBoundingClientRect().bottom + scrolled), window: window.innerHeight }
  }).catch(() => null)
  const shortAnswer = answered(short, `/task-templates/${T4_ID}/instantiate`)
  await short.getByTestId('quick-create-submit').click({ timeout: 8000 }).catch(() => {})
  const shortStatus = (await shortAnswer)?.status() ?? null
  let shortRows = []
  await waitUntil(async () => (shortRows = await madeTasks(SHORT)).length > 0, { timeoutMs: shortStatus ? 15_000 : 3000 })
  await shortCtx.close().catch(() => {})
  chk(
    !!shortLayout && shortLayout.bottom > shortLayout.window && shortStatus !== null && shortStatus < 300 && shortRows.length === 1,
    'in a window 700 high, with the template chosen and the form filled in, Create task lies below the window’s edge and the modal scrolls to it: pressing it makes the task',
    `Create task's foot is ${shortLayout ? `${shortLayout.bottom}px down the modal in a window ${shortLayout.window} high` : 'nowhere (the modal had gone)'}; ` +
      `the template's route answered ${shortStatus ?? 'nothing'}; ${shortRows.length} task(s) so titled`,
  )

  // ══ 23. A MEMBER, WITHOUT template.manage ════════════════════════════════
  console.log('\n▶ a member without template.manage')
  const memberCtx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })
  const mpage = await memberCtx.newPage()
  // What they may do is read from the server; "not offered" means something only once it has been.
  let permsRead = false
  mpage.on('response', (r) => {
    if (r.url().includes(`/workspaces/${WS}/roles/me/permissions`) && r.status() === 200) permsRead = true
  })
  await signIn(mpage, MEMBER_EMAIL, MEMBER_PASSWORD)
  await openModal(mpage)
  const permsLoaded = await waitUntil(() => permsRead, { timeoutMs: 15_000 })
  const memberMenu = await openMenu(mpage)
  let memberOffer = []
  await waitUntil(async () => (memberOffer = await offered(mpage)).includes('Use Template'), { timeoutMs: 8000 })
  const memberDivider = await mpage.getByTestId('quick-create-tpl-divider').isVisible().catch(() => false)
  const refused = await M(`/workspaces/${WS}/task-templates`, { method: 'POST', body: { name: `Member's ${TAG}`, payload: { title: TAG } } })
  chk(
    memberMenu && permsLoaded && JSON.stringify(memberOffer) === JSON.stringify(['Use Template', 'Create instantly from template'])
      && !memberDivider && refused.status === 403,
    'a member without template.manage is offered Use Template and Create instantly from template, and not Save or Update, which the server refuses them (403)',
    `the menu opened ${memberMenu} with their permissions read ${permsLoaded}, offering ${JSON.stringify(memberOffer)}${memberDivider ? ' with a divider' : ''}; ` +
      `their save answered ${said(refused)}`,
  )
  await memberCtx.close().catch(() => {})

  // ══ A TASK THE CALLER MAY NOT OPEN ═══════════════════════════════════════
  console.log('\n▶ a task its caller may not open is neither duplicated nor saved as a template')
  /*
   * `found-30-sep/duplicate-reads-what-its-caller-cannot`. Duplicate asked
   * membership and the right to add to the list, and Save as template asked
   * the template key; neither asked whether the caller may open the task. A
   * member refused a private task duplicated it (201) and read its words from
   * the copy. ClickUp copies what you can see: a task you cannot open is not
   * in front of you to duplicate. Refused as a task that is not there (404),
   * as every read of a task one may not open is.
   */
  const SECRET = `Secret ${TAG}`
  const SECRET_WORDS = `Hidden words ${TAG}`
  const secretId = must('make the task to hide', await A('/tasks', { method: 'POST', body: { listId: LIST, title: SECRET, description: SECRET_WORDS } }))?.id
  if (!secretId) throw new Error('the private task came back without an id')
  await sql`update tasks set visibility = 'private' where id = ${secretId}`
  const unseen = await M(`/tasks/${secretId}`)
  const dup = await M(`/workspaces/${WS}/task-templates/duplicate/${secretId}`, { method: 'POST', body: {} })
  const copies = await sql`select id, description from tasks where list_id = ${LIST} and title = ${`${SECRET} (copy)`}`
  chk(
    unseen.status >= 400 && dup.status === 404 && copies.length === 0 && !JSON.stringify(dup.data ?? {}).includes(SECRET_WORDS),
    'a member refused a private task cannot duplicate it: 404, no copy is made, and none of its words come back',
    `reading it answered ${unseen.status}; duplicating it answered ${said(dup)}; ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'} made` +
      `${copies[0] ? `, holding “${copies[0].description}”` : ''}`,
  )
  /* The same member, granted Manage templates, as `project-template-key` grants it. */
  const [memberRow] = await sql`select id from workspace_members where workspace_id = ${WS} and user_id = ${memberId}`
  const keyRole = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} templates`, permissions: ['template.manage'] } })
  const granted = keyRole.data?.id && memberRow
    ? await A(`/workspaces/${WS}/members/${memberRow.id}/roles/${keyRole.data.id}`, { method: 'POST', body: {} })
    : { status: 0, error: { message: 'no role or no membership to grant it on' } }
  if (!granted.ok) throw new Error(`could not grant the member Manage templates: ${said(keyRole)} ${said(granted)}`)
  const STOLEN = `Saved from a hidden task ${TAG}`
  const save = await M(`/workspaces/${WS}/task-templates/from-task/${secretId}`, { method: 'POST', body: { name: STOLEN } })
  const savedHidden = await sql`select id, payload from task_templates where workspace_id = ${WS} and name = ${STOLEN}`
  chk(
    save.status === 404 && savedHidden.length === 0 && !JSON.stringify(save.data ?? {}).includes(SECRET_WORDS),
    'and granted Manage templates, cannot save it as a template: 404, and no template holds it',
    `saving it answered ${said(save)}; ${savedHidden.length} template(s) so named${savedHidden[0] ? `, holding “${savedHidden[0].payload?.description ?? ''}”` : ''}`,
  )
  /* And a task they may open, they duplicate and save, so the refusals above are about the task. */
  const OPEN = `Open ${TAG}`
  const openId = must('make a task anybody here may open', await A('/tasks', { method: 'POST', body: { listId: LIST, title: OPEN } }))?.id
  const dupOpen = await M(`/workspaces/${WS}/task-templates/duplicate/${openId}`, { method: 'POST', body: {} })
  const saveOpen = await M(`/workspaces/${WS}/task-templates/from-task/${openId}`, { method: 'POST', body: { name: `Saved from an open task ${TAG}` } })
  chk(
    dupOpen.status >= 200 && dupOpen.status < 300 && saveOpen.status >= 200 && saveOpen.status < 300,
    'while a task they may open, the same member duplicates and saves as a template',
    `duplicating it answered ${said(dupOpen)}; saving it answered ${said(saveOpen)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // Archived through the API, as a person would; then the row and everything
  // under it removed by id, since an archive keeps them.
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  if (sql && WS) {
    await sql`delete from workspaces where id = ${WS}`
      .catch((e) => console.log(`  cleanup left behind: workspace ${WS} (${e.message})`))
  }
  if (sql && memberId) {
    /*
     * Registering made the member an organization of their own with a
     * personal workspace in it ("Member's Workspace"). Removing only the user
     * left that workspace behind with nobody in it (this suite's first run), so
     * it goes too — and only an organization nobody else belongs to.
     */
    await sql`
      delete from organizations o
      where o.id in (select organization_id from organization_members where user_id = ${memberId})
        and not exists (select 1 from organization_members m where m.organization_id = o.id and m.user_id <> ${memberId})`
      .catch((e) => console.log(`  cleanup left behind: the member's own organization (${e.message})`))
    await sql`delete from workspace_members where user_id = ${memberId}`
      .catch((e) => console.log(`  cleanup left behind: the member's memberships (${e.message})`))
    await sql`delete from users where id = ${memberId}`
      .catch((e) => console.log(`  cleanup left behind: the member ${MEMBER_EMAIL} (${e.message})`))
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
