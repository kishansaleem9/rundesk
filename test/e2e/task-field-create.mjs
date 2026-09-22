/**
 * §V2-S16 — DEFINE A CUSTOM FIELD FROM AN OPEN TASK, frames `15:20` and `15:30`.
 *
 * `15:20` draws five stacked actions under the description — **Add fields** ·
 * Add subtask · Relate items or add dependencies · Create checklist · Attach
 * file. The other four all have homes in Rundesk's tab strip; "Add fields" had
 * no destination at all. `15:30` reaches the same gap a second way: the `···`
 * menu carries **Custom Fields** as its own row, and the frame draws it with no
 * chevron while Templates, Relationships, Convert to, Add to, Favorite, Remind
 * me and Task Type all have one — so it is an action, not a submenu.
 *
 * What the Fields tab could do was SET values. Its own empty state said so:
 * "Add fields at the project level — they'll appear here for every task", which
 * is a signpost to a different screen.
 *
 * THE TWO THINGS THIS SUITE IS REALLY FOR.
 *
 *   · The picker must offer every type. Three creation paths already existed
 *     and the list route's offers six of the twenty-two; nobody noticed, because
 *     each picker is individually plausible. That is the *duplicated list*, and
 *     a fourth hand-written copy is how it happens again. So the count is
 *     asserted, and so is the presence of types only the long list has.
 *
 *   · `scope: 'list'` must really narrow. `listId` on a definition has meant
 *     "this list only" since custom fields shipped and no reader honoured it
 *     for a long time — *its mirror*, a stored value nothing reads. Creating
 *     from a task is the first place where "just this list" is the obvious
 *     thing to want, so the check is made against a SIBLING list in the same
 *     project, where a field that ignored the scope would show up.
 *
 *   node test/e2e/task-field-create.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 18

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

/* `apiClient` never throws — it resolves `{status, data, error}`, so a
 * `.catch()` on it is inert. Every call is judged on `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

const TAG = `e2e-fieldcreate-${Date.now()}`
/**
 * Every type `custom_field_type` holds. Written here and not imported, so this
 * is an independent statement of the spec rather than a mirror of whatever the
 * picker happens to render.
 */
const ALL_TYPES = [
  'text', 'number', 'dropdown', 'date', 'checkbox', 'url', 'email', 'phone',
  'money', 'rating', 'progress_auto', 'long_text', 'labels', 'people',
  'location', 'tshirt_size', 'progress_manual', 'files', 'voting',
  // 0158
  'formula', 'tasks', 'signature',
]
/** The six the list route's picker offers. A picker holding only these is the drifted copy. */
const THE_SHORT_LIST = ['text', 'number', 'date', 'checkbox', 'url', 'dropdown']
/** Types no drifted copy has ever carried, so their presence is the real test. */
const ONLY_THE_LONG_LIST = [
  'voting', 'people', 'tshirt_size', 'files', 'progress_auto', 'formula', 'tasks', 'signature',
]

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  // Its own project with TWO lists, because the scope check needs a sibling.
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  const listA = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List A ${TAG}` } })).data
  const listB = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List B ${TAG}` } })).data
  if (!listA?.id || !listB?.id) throw new Error('could not make the two lists')
  const taskA = (await A('/tasks', { method: 'POST', body: { listId: listA.id, title: `Subject A ${TAG}` } })).data
  const taskB = (await A('/tasks', { method: 'POST', body: { listId: listB.id, title: `Subject B ${TAG}` } })).data
  if (!taskA?.id || !taskB?.id) throw new Error('could not make the two tasks')

  const fieldsOn = async (taskId) => {
    const r = await A(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`)
    return { status: r.status, names: (r.data ?? []).map((row) => row.definition?.name) }
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ the endpoint: a task can define a field, not only fill one in')

  const projectWide = await A(`/workspaces/${workspaceId}/tasks/${taskA.id}/custom-fields`, {
    method: 'POST',
    body: { name: `Owner ${TAG}`, type: 'people', scope: 'project' },
  })
  chk(
    projectWide.status < 400 && projectWide.data?.id && projectWide.data?.projectId === project.id,
    'POSTing to the task creates a definition on the task\'s own project',
    `it answered ${projectWide.status} ${projectWide.error ?? ''} — a task still cannot define a field`,
  )
  chk(
    projectWide.data?.listId == null,
    'and `scope: project` leaves the definition unscoped to any one list',
    `the definition came back with listId=${projectWide.data?.listId}, which narrows a field ` +
      'that was asked for across the project',
  )

  const onA = await fieldsOn(taskA.id)
  const onB = await fieldsOn(taskB.id)
  chk(
    onA.status === 200 && onA.names.includes(`Owner ${TAG}`)
      && onB.status === 200 && onB.names.includes(`Owner ${TAG}`),
    'the new field appears on the task that made it AND on a task in the sibling list',
    `list A sees [${onA.names.join(', ')}] and list B sees [${onB.names.join(', ')}]`,
  )

  console.log('\n▶ and `scope: list` really narrows — the stored `listId` is honoured')
  const listScoped = await A(`/workspaces/${workspaceId}/tasks/${taskA.id}/custom-fields`, {
    method: 'POST',
    body: { name: `Sprint only ${TAG}`, type: 'text', scope: 'list' },
  })
  chk(
    listScoped.status < 400 && listScoped.data?.listId === listA.id,
    'the definition is stamped with this task\'s list',
    `it came back with listId=${listScoped.data?.listId} against list ${listA.id}`,
  )
  const narrowA = await fieldsOn(taskA.id)
  const narrowB = await fieldsOn(taskB.id)
  chk(
    narrowA.names.includes(`Sprint only ${TAG}`) && !narrowB.names.includes(`Sprint only ${TAG}`),
    'it shows on this list\'s task and NOT on the sibling list\'s',
    narrowA.names.includes(`Sprint only ${TAG}`)
      ? 'the sibling list sees it too — the `listId` is stored and not read, which is the ' +
        'stored-value-nobody-honours defect'
      : `the task that created it cannot see it either: [${narrowA.names.join(', ')}]`,
  )

  console.log('\n▶ the refusals, which are the reason a fourth copy of the validation is wrong')
  const badType = await A(`/workspaces/${workspaceId}/tasks/${taskA.id}/custom-fields`, {
    method: 'POST',
    body: { name: `Nope ${TAG}`, type: 'banana' },
  })
  chk(
    badType.status === 400,
    'a type the enum has not got is refused with 400, not a cast error',
    `it answered ${badType.status}; an unknown enum member reaching the insert is a 500 that ` +
      'reads as a broken server',
  )
  /*
   * AND IT REALLY IS NOT A CAST ERROR, which the check above says and cannot
   * enforce. `custom_field_type` is a Postgres enum, so an unknown value
   * reaching the insert raises 22P02, and `AllExceptionsFilter` maps that to
   * 400 with "A value has an invalid format". The status is identical whether
   * the service refused it or the column did.
   *
   * A break patch deleting the service's type check left the status check
   * green, which is how this was found — the sixth time in one session that a
   * status-only assertion on a refusal turned out to be measuring the database.
   *
   * The service's sentence NAMES THE VALID TYPES, and that is the whole
   * difference: somebody who sent `banana` needs the list, not the news that a
   * format was invalid.
   */
  chk(
    /One of:/.test(JSON.stringify(badType.error ?? '')),
    'and the refusal lists the types it would have taken',
    `it said ${JSON.stringify(badType.error)} — a generic format message means the service ` +
      'check is gone and the enum column refused it instead, which is the cast error this ' +
      'check was written to rule out',
  )
  const noOptions = await A(`/workspaces/${workspaceId}/tasks/${taskA.id}/custom-fields`, {
    method: 'POST',
    body: { name: `Empty dropdown ${TAG}`, type: 'dropdown' },
  })
  chk(
    noOptions.status === 400,
    'a dropdown with no options is refused — the same rule the project-scoped POST applies',
    `it answered ${noOptions.status}, so this door skips the validation the other one does`,
  )
  const foreign = await A(`/workspaces/${workspaceId}/tasks/${'00000000-0000-0000-0000-000000000000'}/custom-fields`, {
    method: 'POST',
    body: { name: `Ghost ${TAG}`, type: 'text' },
  })
  chk(
    foreign.status >= 400,
    'and a task that is not in this workspace cannot be used to define a field in it',
    `it answered ${foreign.status} for a task id that does not exist`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the panel: the form the frame\'s "Add fields" opens')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${listA.id}?task=${taskA.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never mounted')
  }

  chk(
    await page.getByTestId('task-add-fields').isVisible().catch(() => false),
    'frame `15:20` — "Add fields" sits under the description with the rest of the action row',
    'no "Add fields" control on the task; the one item of the five with no destination still has none',
  )

  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('task-add-fields').click({ timeout: 10_000 }).catch(() => {})
  const formOpen = await waitUntil(
    () => page.getByTestId('task-field-create-form').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(
    formOpen,
    'pressing it lands on the Fields tab with the create form already open',
    'the form did not open — "Add fields" moved tabs and left the reader to find the control',
  )

  /*
   * THE PICKER'S LENGTH, AGAINST A LIST WRITTEN OUT INDEPENDENTLY ABOVE. The
   * count and the membership are separate questions: twenty-two of the wrong
   * types would pass a count alone.
   */
  const offered = await page.getByTestId('task-field-create-type').locator('option').evaluateAll(
    (nodes) => nodes.map((n) => n.value),
  )
  chk(
    offered.length === ALL_TYPES.length && ALL_TYPES.every((t) => offered.includes(t)),
    `the type picker offers all ${ALL_TYPES.length} field types`,
    `it offers ${offered.length}: [${offered.join(', ')}]` +
      (offered.length === THE_SHORT_LIST.length ? ' — that is the list route\'s six, copied' : ''),
  )
  chk(
    ONLY_THE_LONG_LIST.every((t) => offered.includes(t)),
    'including the eight that only the long list has, so it is not the drifted six-item copy',
    `missing: [${ONLY_THE_LONG_LIST.filter((t) => !offered.includes(t)).join(', ')}]`,
  )

  /*
   * A name this run has never used, so the field that comes back cannot be one
   * somebody else's fixture left behind in the shared database.
   */
  const UI_FIELD = `Made on the task ${TAG}`
  await page.getByTestId('task-field-create-name').fill(UI_FIELD)
  await page.getByTestId('task-field-create-type').selectOption('rating')
  await page.getByTestId('task-field-create-scope').selectOption('list')
  await page.getByTestId('task-field-create-submit').click()

  const landed = await waitUntil(async () => {
    const r = await A(`/workspaces/${workspaceId}/projects/${project.id}/custom-fields`)
    return (r.data ?? []).some((d) => d.name === UI_FIELD)
  }, { timeoutMs: 20_000 })
  const made = ((await A(`/workspaces/${workspaceId}/projects/${project.id}/custom-fields`)).data ?? [])
    .find((d) => d.name === UI_FIELD)
  chk(
    landed && made?.type === 'rating' && made?.listId === listA.id,
    'submitting the form writes the field the form described — type and scope included',
    `the server holds ${made ? `type=${made.type} listId=${made.listId}` : 'no such field'}; ` +
      'a form that posts a fixed type is the same defect in a smaller box',
  )

  const shows = await waitUntil(
    async () => (await page.getByTestId('custom-field-row').filter({ hasText: UI_FIELD }).count()) === 1,
    { timeoutMs: 20_000 },
  )
  chk(
    shows,
    'and the panel refetches, so the new field is on screen without a reload',
    'the field exists on the server and the panel still shows the list it had before — ' +
      'the create path does not invalidate what it changed',
  )

  console.log('\n▶ frame `15:30` — "Custom Fields" in the `···` menu reaches the same form')
  await page.getByTestId('task-tab-overview').click()
  await waitUntil(() => page.getByTestId('task-more-menu').isVisible().catch(() => false), { timeoutMs: 15_000 })
  await page.getByTestId('task-more-menu').click()
  const menuItem = page.getByTestId('task-menu-custom-fields')
  const inMenu = await waitUntil(() => menuItem.isVisible().catch(() => false), { timeoutMs: 15_000 })
  chk(
    inMenu,
    'the menu carries a Custom Fields row of its own',
    'no Custom Fields item in the task menu; the frame draws it between Convert to and Templates',
  )
  if (inMenu) await menuItem.click()
  const reopened = await waitUntil(
    () => page.getByTestId('task-field-create-form').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(
    reopened,
    'and choosing it opens the same create form — it is an action, not a submenu',
    'the menu item moved tabs without opening the form, so the second route to the gap is a different feature',
  )

  /*
   * AND A PLAIN REVISIT TO THE TAB DOES NOT OPEN IT.
   *
   * The panel lives behind `activeTab === 'fields'`, so leaving the tab
   * unmounts it and returning mounts it again. The open-on-stamp effect used to
   * read `if (openCreateStamp) setCreating(true)` — true on every mount once the
   * stamp had ever been bumped — so after one press of "Add fields" the create
   * form appeared on every later visit to Fields, unasked.
   *
   * That is also why the check above could not fail: `tfc-6` removes the bump
   * from the menu row and the form still appeared, because the REMOUNT was
   * opening it. Two ways of arriving at a visible form, one assertion, and the
   * wrong one was doing the work.
   */
  await page.getByTestId('task-field-create-cancel').click().catch(() => {})
  await page.getByTestId('task-tab-overview').click()
  await waitUntil(() => page.getByTestId('task-add-fields').isVisible().catch(() => false), { timeoutMs: 15_000 })
  await page.getByTestId('task-tab-fields').click()
  const quiet = await waitUntil(
    async () => !(await page.getByTestId('task-field-create-form').isVisible().catch(() => false)),
    { timeoutMs: 8_000 },
  )
  chk(
    quiet,
    'and coming back to the tab later does not reopen it unasked',
    'the create form was open on a plain revisit — the stamp is being read on mount rather ' +
      'than on a change, so every return to Fields opens a form nobody asked for',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-field-create.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  await browser.close().catch(() => {})
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
