/**
 * §V2-01b — "Progress (Auto)", the custom field she actually demonstrates.
 *
 * `[00:12]` "humein ek task ke andar aur bhi option chahiye … hum woh FIELD ke
 * through add kar sakte hain", and `[00:24]` she creates one called
 * **Progress**. Frame `00:25` is the whole specification: *Track completion of*
 * → Subtasks · Checklists · Assigned comments, and *Tasks without active items*
 * → "Display 100% when task is in a done status".
 *
 * WHAT THESE CHECKS ARE FOR. A derived number goes wrong in three ways, and
 * each one is here: counting the wrong things, claiming a figure when there is
 * nothing to count, and going stale because somebody wrote it down. The last is
 * the reason `setValue` is asserted to REFUSE — a field called Auto that can be
 * set by hand is not automatic, it is a number that happens to be right once.
 *
 * ITS OWN SPACE, PROJECT AND LIST. Custom fields are defined per project, so a
 * field created on the seeded project would appear on every task in it and
 * every other suite's task rows would change shape underneath them.
 *
 *   node test/e2e/custom-field-progress.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 18

const chromium = await resolveChromium()
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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-prog-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages subtasks and checklists directly')

  // ── A space of this suite's own ──────────────────────────────────────────
  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Parent ${TAG}`}) returning id`

  const valuesFor = async (taskId = task.id) =>
    ((await A(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`)).data ?? [])
  const progressOf = async (taskId = task.id) =>
    (await valuesFor(taskId)).find((r) => r.definition.type === 'progress_auto')?.value

  console.log('\n▶ §V2-01b — the field she creates at [00:24]')
  const created = await A(`/workspaces/${workspaceId}/projects/${project.id}/custom-fields`, {
    method: 'POST',
    body: { name: 'Progress', type: 'progress_auto' },
  })
  chk(
    created.status === 201 || created.status === 200,
    'a Progress (Auto) field can be created at all',
    `creating it returned ${created.status} ${JSON.stringify(created.error)} — before this item ` +
      'the type did not exist, and she creates one in the first half-minute of the video',
  )
  const fieldId = created.data?.id
  chk(
    created.data?.config?.sources?.subtasks === true &&
      created.data?.config?.sources?.checklists === true &&
      created.data?.config?.sources?.assignedComments === true &&
      created.data?.config?.doneStatusIs100 === true,
    'and it tracks all three sources the frame lists, by default',
    `its config came back as ${JSON.stringify(created.data?.config)} — a Progress field that ` +
      'counts nothing on the day it is made looks broken',
  )

  console.log('\n▶ nothing to count says nothing, rather than zero')
  chk(
    (await progressOf()) === null,
    'a task with no subtasks, checklist or assigned comments reports null',
    `it reported ${JSON.stringify(await progressOf())} — "0%" claims none of the work is done, ` +
      'and there is no work here to make that claim about',
  )

  console.log('\n▶ it counts subtasks')
  const [subA] = await sql`
    insert into tasks (list_id, title, parent_task_id, status_category)
    values (${list.id}, ${`Sub A ${TAG}`}, ${task.id}, 'closed') returning id`
  await sql`
    insert into tasks (list_id, title, parent_task_id, status_category)
    values (${list.id}, ${`Sub B ${TAG}`}, ${task.id}, 'open')`
  chk(
    (await progressOf()) === 50,
    'one of two subtasks closed is half way',
    `it reported ${JSON.stringify(await progressOf())} for 1 of 2 closed subtasks`,
  )

  console.log('\n▶ and checklists, and assigned comments')
  const [cl] = await sql`
    insert into task_checklists (task_id, title) values (${task.id}, ${`CL ${TAG}`}) returning id`
  await sql`
    insert into task_checklist_items (checklist_id, content, is_done)
    values (${cl.id}, ${'done item'}, true), (${cl.id}, ${'open item'}, false)`
  // 2 of 4 now: one closed subtask, one ticked item.
  chk(
    (await progressOf()) === 50,
    'checklist items join the same pool rather than forming their own average',
    `it reported ${JSON.stringify(await progressOf())} for 2 done of 4 items`,
  )

  await sql`
    insert into task_comments (task_id, author_id, body, assigned_to_user_id, resolved_at)
    values (${task.id}, ${me.id}, ${'do this'}, ${me.id}, now())`
  // 3 of 5.
  chk(
    (await progressOf()) === 60,
    'a resolved assigned comment counts as done',
    `it reported ${JSON.stringify(await progressOf())} for 3 done of 5 items`,
  )

  /*
   * SHE SAYS "ASSIGNED COMMENTS", NOT "COMMENTS". An ordinary comment is a
   * remark, not a piece of work, and counting one would make the percentage
   * fall every time somebody said something.
   */
  await sql`
    insert into task_comments (task_id, author_id, body)
    values (${task.id}, ${me.id}, ${'just talking'})`
  chk(
    (await progressOf()) === 60,
    'but an ordinary comment is not work, and does not move the number',
    `it moved to ${JSON.stringify(await progressOf())} — a plain remark was counted as a task`,
  )

  console.log('\n▶ the number cannot be written by hand')
  const wrote = await A(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${fieldId}`, {
    method: 'PUT', body: { value: 99 },
  })
  chk(
    wrote.status === 400,
    'setting it directly is refused',
    `it returned ${wrote.status} — a field called Auto that can be set by hand is a number ` +
      'that goes stale the moment somebody ticks a checklist item',
  )
  const stored = await sql`
    select count(*)::int as n from custom_field_values where field_id = ${fieldId}`
  chk(
    stored[0].n === 0,
    'and nothing was stored for it either',
    `${stored[0].n} value rows exist — accepting the write and ignoring it is worse than refusing, ` +
      'because the caller is told it was saved',
  )
  chk(
    (await progressOf()) === 60,
    'so the reported figure is still the one the work says',
    `it reported ${JSON.stringify(await progressOf())} after a refused write`,
  )

  console.log('\n▶ turning a source off changes what is counted')
  await A(`/workspaces/${workspaceId}/custom-fields/${fieldId}`, {
    method: 'PATCH',
    body: { config: { sources: { subtasks: false }, doneStatusIs100: true } },
  })
  // Without the subtasks: 1 ticked item + 1 resolved comment of 3.
  chk(
    (await progressOf()) === 67,
    'dropping subtasks leaves the checklist and the comment',
    `it reported ${JSON.stringify(await progressOf())} with subtasks switched off — expected 2 of 3`,
  )

  console.log('\n▶ "Tasks without active items" — the frame’s second setting')
  const [bare] = await sql`
    insert into tasks (list_id, title, status_category)
    values (${list.id}, ${`Bare ${TAG}`}, 'open') returning id`
  chk(
    (await progressOf(bare.id)) === null,
    'an empty task that is not finished still reports nothing',
    `it reported ${JSON.stringify(await progressOf(bare.id))}`,
  )
  await sql`update tasks set status_category = 'closed' where id = ${bare.id}`
  chk(
    (await progressOf(bare.id)) === 100,
    'but an empty task in a done status reads 100%, exactly as the frame says',
    `it reported ${JSON.stringify(await progressOf(bare.id))} for a closed task with nothing to count`,
  )
  /*
   * The setting is for tasks with NOTHING to count, not a shortcut for all
   * closed ones. A finished parent whose checklist is half ticked still reports
   * the checklist — otherwise closing a task would erase what is left in it.
   */
  await sql`update tasks set status_category = 'closed' where id = ${task.id}`
  chk(
    (await progressOf()) === 67,
    'while a done task that still has items reports the items, not 100%',
    `it reported ${JSON.stringify(await progressOf())} — the done-status setting is for tasks ` +
      'with nothing to count, not for every closed task',
  )

  // ── On the task itself ───────────────────────────────────────────────────
  console.log('\n▶ and it is drawn on the task, read-only')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: 30000 })
  /*
   * THE CUSTOM FIELDS LIVE BEHIND THE "Fields" TAB, and the sheet opens on
   * Overview. The first version of this navigated to the task and looked
   * straight for the bar, which of course was not mounted — and the check below
   * it then PASSED VACUOUSLY, counting zero editable controls inside an element
   * that was not on the page. So the tab is opened explicitly, and the
   * read-only check is written to require the bar's presence rather than to be
   * satisfied by its absence.
   */
  /*
   * THERE IS NO `/tasks/:id` ROUTE. The detail sheet is rendered by the LIST
   * route and opened with `?task=<id>` — which is what quick-create and a task
   * link in chat both navigate to. The first version of this invented a URL
   * that does not exist, got the SPA's fallback, and reported it as the panel
   * failing to render.
   */
  const openFields = async (taskId) => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${taskId}`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.getByTestId('task-tab-fields').click({ timeout: 20_000 })
  }
  await openFields(task.id)

  const shown = await waitUntil(
    () => page.getByTestId('custom-field-progress').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(
    shown,
    'the bar is on the task',
    'no progress bar rendered — the API would be computing a number nobody can see',
  )
  chk(
    (await page.getByTestId('custom-field-progress-pct').innerText().catch(() => '')).includes('67'),
    'showing the figure the API computed, not a different one',
    `the task read ${JSON.stringify(await page.getByTestId('custom-field-progress-pct').innerText().catch(() => null))}, expected 67%`,
  )
  /*
   * READ-ONLY ON PURPOSE. The API refuses writes, so an input here would be a
   * control whose only outcome is an error — the facade this audit removes.
   * `shown &&` is the guard that stops this passing when there is nothing there.
   */
  const editable = await page
    .getByTestId('custom-field-progress')
    .locator('input, textarea, select, button')
    .count()
    .catch(() => -1)
  chk(
    shown && editable === 0,
    'and offering no way to type over it',
    `${editable} editable controls sit inside the progress field — every one of them would ` +
      'produce a 400, because the value is derived',
  )

  await openFields(bare.id)
  const emptyShown = await waitUntil(
    async () =>
      (await page.getByTestId('custom-field-progress-pct').innerText().catch(() => '')).includes('100'),
    { timeoutMs: 20_000 },
  )
  chk(
    emptyShown,
    'and a finished empty task shows 100%, not an empty bar',
    `the closed task with nothing to count read ` +
      `${JSON.stringify(await page.getByTestId('custom-field-progress-pct').innerText().catch(() => null))}`,
  )

} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  if (sql) {
    // Space first: project, list, tasks, fields and values all cascade from it.
    await sql`delete from spaces where name = ${`Space ${TAG}`}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
