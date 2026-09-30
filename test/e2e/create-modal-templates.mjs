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
 *     value, which the form cannot say;
 *   · a member, who lacks `template.manage`, is offered the first group only,
 *     and the API refuses their save (403).
 *
 *   node test/e2e/create-modal-templates.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 15

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

  /* A member, who may use a template and may not make or change one. */
  const anon = apiAs(null)
  const registered = await anon('/auth/register', {
    method: 'POST',
    body: { email: MEMBER_EMAIL, displayName: `Member ${TAG}`, password: MEMBER_PASSWORD },
  })
  if (registered.status >= 300 || !registered.data?.accessToken) throw new Error(`could not register the member: ${said(registered)}`)
  memberId = registered.data.user?.id ?? null
  const M = apiAs(registered.data.accessToken)
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
    customFieldValues: [{ fieldName: `Budget ${TAG}`, value: 5 }],
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

  // ══ 13–14. UPDATE EXISTING TEMPLATE ══════════════════════════════════════
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
    'and it keeps the template’s checklists, subtasks and custom-field value, which the form cannot say',
    `after the update it holds ${JSON.stringify(beyondForm(updated?.payload))}; before, ${JSON.stringify(beyondForm(T2_BEFORE))}`,
  )

  // ══ 15. A MEMBER, WITHOUT template.manage ════════════════════════════════
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
