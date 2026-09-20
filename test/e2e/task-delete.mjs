/**
 * §V2-08 frame `15:32` — **A PERMANENT DELETE FOR A TASK**.
 *
 * The task context menu in the frame ends with two rows, one above the other:
 *
 *     🗃  Archive
 *     🗑  Delete          ← red, and the one under the cursor
 *
 * Rundesk had ONE soft archive and no delete at all. `DELETE /tasks/:id` set
 * `is_archived`, and the workspace Trash listed tasks on that same flag — so
 * archiving a task put it in the Trash with a thirty-day countdown on it, and
 * "delete" was a word with no code behind it. Two names, one state.
 *
 * THE CHECK THAT DECIDES THIS ROW IS THE ONE THAT SEPARATES THEM. A Delete that
 * fires the archive request, or an Archive that now writes `deleted_at`, would
 * pass every "the menu has two items" check ever written. So this suite deletes
 * one task and archives another and then asserts they ended up in DIFFERENT
 * places: the deleted one in the Trash and out of the list, the archived one in
 * neither the Trash nor the purge queue. If those two ever converge again the
 * suite goes red on the facade, not on the label.
 *
 * AND IT PROVES THE SERVER, NOT THE SCREEN. Every state claim is read back from
 * Postgres or from the API — `deleted_at`, `deleted_by_id`, `archived_at`, the
 * row's continued existence — because a menu item that closes a sheet and
 * writes nothing looks identical from the front.
 *
 * NARROWED TO ITS OWN FIXTURES. The e2e database is shared and the Trash is a
 * workspace-wide table; every assertion here is about tasks this run created,
 * found by id, never by counting rows.
 *
 *   node test/e2e/task-delete.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * "0 failed" is not "it ran", and `<` is not "it ran either": with `<`, a
 * branch that quietly skipped becomes a shorter run that still passes. Exact,
 * so a skipped branch is a failure.
 */
const EXPECTED_CHECKS = 15

/** What the product promises in the Trash header, and what the purge uses. */
const RETENTION_DAYS = 30

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const TAG = `tdel-${Date.now()}`

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const API = `${stack.base}/api/v1`
const browser = await chromium.launch(launchOptions())
let sql = null

try {
  const auth = await login(API, EMAIL, PASSWORD)
  /*
   * THIS CLIENT NEVER THROWS. It answers `{status, data, error}`, so a `.catch`
   * on it is inert and a 500 reads exactly like a 200. Every call below checks
   * `status` itself.
   */
  const api = apiClient(API, auth.accessToken)

  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const workspaceId = (wsRes.data ?? [])[0]?.workspace?.id ?? (wsRes.data ?? [])[0]?.id
  if (!workspaceId) throw new Error('this account can see no workspace')

  const meRes = await api('/auth/me')
  const myUserId = meRes.data?.id ?? meRes.data?.user?.id ?? auth.user?.id
  if (!myUserId) throw new Error(`could not resolve the signed-in user id (GET /auth/me → ${meRes.status})`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads deleted_at back from the row')

  /*
   * Its own tree, so "the task left the list" is a claim about THIS list and
   * not about whatever another run happened to leave lying around.
   */
  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const makeTask = async (label) => {
    const [row] = await sql`
      insert into tasks (list_id, title) values (${list.id}, ${`${label} ${TAG}`}) returning id`
    return row.id
  }

  const T_MENU = await makeTask('Menu delete')     // deleted through the real menu
  const T_API = await makeTask('Api delete')       // deleted through the endpoint
  const T_ARCHIVE = await makeTask('Archive me')   // archived, never deleted
  const T_LIVE = await makeTask('Untouched')       // the control: never touched
  console.log(`\x1b[2m  workspace ${workspaceId}, list ${list.id}\x1b[0m`)

  // ── helpers, all reading the server ────────────────────────────────────────
  const rowOf = async (id) => {
    const [row] = await sql`
      select id, is_archived, archived_at, archived_by_id, deleted_at, deleted_by_id
      from tasks where id = ${id}`
    return row ?? null
  }
  /** Ids the list endpoint is currently willing to show. */
  const listIds = async () => {
    const res = await api(`/tasks/list/${list.id}`)
    if (res.status >= 300) throw new Error(`GET /tasks/list answered ${res.status}`)
    const rows = Array.isArray(res.data) ? res.data : (res.data?.tasks ?? [])
    return rows.map((r) => r.id)
  }
  /** The workspace Trash, narrowed to tasks, as the API reports it. */
  const trash = async () => {
    const res = await api(`/workspaces/${workspaceId}/trash?types=task`)
    if (res.status >= 300) throw new Error(`GET /trash answered ${res.status}`)
    return res.data ?? {}
  }
  const trashEntry = async (id) => ((await trash()).items ?? []).find((i) => i.id === id) ?? null

  // ══ 1. THE MENU ════════════════════════════════════════════════════════════
  console.log('\n▶ frame `15:32` — Archive and Delete are two rows, in that order')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  const openTask = async (taskId) => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${taskId}`,
      { waitUntil: 'domcontentloaded' },
    )
    /*
     * Clicking the trigger TOGGLES, so a helper that just clicks closes a menu
     * that is already open — and then every later timeout reads as "the item is
     * missing" when the menu is simply shut. Escape, click once, and refuse to
     * go on unless it really opened.
     */
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByTestId('task-more-menu').click({ timeout: 25_000 })
    const opened = await waitUntil(
      () => page.getByTestId('task-menu-archive').first().isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    )
    if (!opened) throw new Error('the task menu did not open')
  }

  await openTask(T_MENU)
  /*
   * MEASURED, not merely present. The frame puts Delete directly under Archive
   * as the last pair in the menu; a Delete that rendered somewhere else, or an
   * Archive that had quietly become the only row again, both have to fail here.
   */
  const archiveBox = await page.getByTestId('task-menu-archive').first().boundingBox()
  const deleteBox = await page.getByTestId('task-menu-delete').first().boundingBox()
  const gap = archiveBox && deleteBox ? deleteBox.y - (archiveBox.y + archiveBox.height) : null
  chk(
    Boolean(archiveBox) && Boolean(deleteBox) && gap !== null && gap >= -2 && gap <= 24,
    `the menu draws Archive and Delete as adjacent rows, Delete under Archive (gap ${gap === null ? 'n/a' : gap.toFixed(1)}px)`,
    deleteBox
      ? `Delete is not directly under Archive: archive y=${archiveBox?.y}, delete y=${deleteBox.y}, gap ${gap}`
      : 'there is no Delete row in the task menu — the frame draws two and Rundesk drew one',
  )

  console.log('\n▶ and it says where the task goes, and for how long')
  let confirmText = ''
  page.once('dialog', (d) => { confirmText = d.message(); void d.accept() })
  await page.getByTestId('task-menu-delete').first().click()
  await waitUntil(() => confirmText.length > 0, { timeoutMs: 10_000 })
  /*
   * The archive confirmation's sin was claiming an action was permanent when it
   * was not. This one's risk is the mirror: a delete that says nothing about the
   * Trash reads as final, and a person who believes that will use Archive for
   * everything. Both facts have to be on the dialog.
   */
  chk(
    /trash/i.test(confirmText) && /\b30\b/.test(confirmText) && !/cannot be undone/i.test(confirmText),
    'the confirmation names the Trash and the 30-day window',
    `the confirmation read "${confirmText}"`,
  )

  // ══ 2. WHAT DELETE WROTE ═══════════════════════════════════════════════════
  console.log('\n▶ what the server actually recorded')

  const stamped = await waitUntil(async () => (await rowOf(T_MENU))?.deleted_at != null, { timeoutMs: 20_000 })
  const menuRow = await rowOf(T_MENU)
  /*
   * THE COLUMNS ARE THE WHOLE SPLIT. `deleted_at` + `deleted_by_id` and NOT
   * `archived_at`: filling both would make one deletion show up under Archived
   * tasks and in the Trash at once, which is the state this row exists to end.
   * `is_archived` does go true — every read path in the product hides a task on
   * that one flag, so a delete that left it false would take the task out of
   * nothing at all.
   */
  chk(
    stamped &&
      menuRow?.deleted_at != null &&
      menuRow?.deleted_by_id === myUserId &&
      menuRow?.archived_at == null &&
      menuRow?.is_archived === true,
    'Delete stamps deleted_at + deleted_by_id, leaves archived_at empty, and hides the task',
    `after Delete the row reads ${JSON.stringify(menuRow)} — deleted_by ${myUserId} expected, archived_at expected null`,
  )

  console.log('\n▶ the Undo on the toast restores it — the same offer the sidebar makes')
  const undoBtn = page.locator('[data-sonner-toast] button', { hasText: /undo/i }).first()
  const offered = await waitUntil(
    async () => (await undoBtn.count()) > 0 && (await undoBtn.isVisible().catch(() => false)),
    { timeoutMs: 10_000 },
  )
  if (offered) await undoBtn.click()
  const undone = offered && (await waitUntil(async () => (await rowOf(T_MENU))?.deleted_at == null, { timeoutMs: 20_000 }))
  chk(
    undone,
    'a toast offers Undo and pressing it clears deleted_at on the server',
    offered
      ? 'Undo was pressed and the task stayed in the bin — a button wired to nothing is worse than no button'
      : 'nothing was offered — the task vanished in silence',
  )

  // ══ 3. THE TWO STATES, THROUGH THE API ═════════════════════════════════════
  console.log('\n▶ Delete and Archive are two different things')

  const binned = await api(`/tasks/${T_API}/trash`, { method: 'POST' })
  const trashHeader = await trash()
  /*
   * ONE source for the retention number. The confirmation, the Trash header and
   * the purge job all have to be quoting the same thirty days; a literal copied
   * into the delete path is how the UI ends up promising a window the cron does
   * not honour. Both sides are asserted to be a real number first — two
   * `undefined`s compare equal and would pass on nothing.
   */
  chk(
    binned.status < 300 &&
      typeof binned.data?.retentionDays === 'number' &&
      typeof trashHeader.retentionDays === 'number' &&
      binned.data.retentionDays === trashHeader.retentionDays &&
      binned.data.retentionDays === RETENTION_DAYS,
    `POST /tasks/:id/trash reports the same ${RETENTION_DAYS}-day retention the Trash does`,
    `delete answered ${binned.status} with retentionDays=${JSON.stringify(binned.data?.retentionDays)} ` +
      `while the Trash reports ${JSON.stringify(trashHeader.retentionDays)}`,
  )

  const afterDelete = await listIds()
  chk(
    !afterDelete.includes(T_API) && afterDelete.includes(T_LIVE),
    'the deleted task leaves the list and the untouched one stays',
    `the list endpoint returned deleted=${afterDelete.includes(T_API)}, control=${afterDelete.includes(T_LIVE)} ` +
      '— a delete that leaves the task on screen is not a delete',
  )

  const binEntry = await trashEntry(T_API)
  chk(
    binEntry != null &&
      binEntry.type === 'task' &&
      binEntry.deletedAt != null &&
      binEntry.deletedBy?.id === myUserId &&
      binEntry.location.includes(`List ${TAG}`),
    'and it arrives in the same Trash as every other deleted thing, with who and where',
    binEntry
      ? `the trash row reads ${JSON.stringify(binEntry)} — deletedBy ${myUserId} expected`
      : 'the deleted task is not in the workspace Trash at all',
  )

  const archived = await api(`/tasks/${T_ARCHIVE}`, { method: 'DELETE' })
  const archRow = await rowOf(T_ARCHIVE)
  chk(
    archived.status < 300 &&
      archRow?.is_archived === true &&
      archRow?.archived_at != null &&
      archRow?.deleted_at == null,
    'Archive stamps archived_at and leaves deleted_at empty',
    `archive answered ${archived.status} and the row reads ${JSON.stringify(archRow)}`,
  )

  /*
   * THE CHECK THIS ROW EXISTS FOR. Before this change the Trash listed tasks on
   * `is_archived`, so this assertion was impossible to satisfy: archiving WAS
   * binning. If Delete is ever re-pointed at the archive request, or Archive
   * starts writing `deleted_at`, the archived task turns up here and this goes
   * red — on the facade, not on the wording.
   */
  chk(
    (await trashEntry(T_ARCHIVE)) === null,
    'an archived task is NOT in the Trash — it is kept, not counting down',
    'the archived task is sitting in the Trash: Archive and Delete are still one state under two names',
  )

  /*
   * The two restores are two doors and must not be interchangeable. Un-archiving
   * a binned task would make it live everywhere while the Trash still offered to
   * destroy it — live and deleted at once.
   */
  const wrongDoor = await api(`/tasks/${T_API}/restore`, { method: 'POST' })
  const afterWrongDoor = await rowOf(T_API)
  chk(
    wrongDoor.status === 409 && afterWrongDoor?.deleted_at != null,
    'the archive restore refuses a task that is in the Trash (409), leaving it binned',
    `POST /tasks/:id/restore answered ${wrongDoor.status} and deleted_at is now ${afterWrongDoor?.deleted_at}`,
  )

  // ══ 4. THE TRASH SURFACE ═══════════════════════════════════════════════════
  console.log('\n▶ Settings → Trash shows it, and puts it back')

  await page.goto(`${stack.base}/app/${workspaceId}/settings?tab=trash`, { waitUntil: 'domcontentloaded' })
  const deletedRow = page.locator(`[data-testid="trash-row"][data-trash-type="task"][data-trash-id="${T_API}"]`)
  const rowShown = await waitUntil(async () => (await deletedRow.count()) > 0, { timeoutMs: 25_000 })
  chk(
    rowShown,
    'the Trash tab draws a row for the deleted task, tagged with its type and id',
    'the deleted task is not drawn in the Trash tab — the endpoint has it and the surface does not',
  )

  await page.getByTestId(`trash-actions-task-${T_API}`).click({ timeout: 15_000 })
  await page.getByTestId(`trash-restore-task-${T_API}`).click({ timeout: 15_000 })
  const cameBack = await waitUntil(async () => (await rowOf(T_API))?.deleted_at == null, { timeoutMs: 25_000 })
  const restoredRow = await rowOf(T_API)
  const backInList = cameBack && (await listIds()).includes(T_API)
  /*
   * Restoring has to clear BOTH flags. `deleted_at` alone would take the task
   * out of the Trash and leave `is_archived` true — invisible in every list and
   * no longer anywhere that offers to bring it back, which is worse than the
   * state it was in.
   */
  chk(
    cameBack && restoredRow?.is_archived === false && backInList,
    'Restore in the Trash clears deleted_at AND is_archived, and the task is back in the list',
    `after Restore the row reads ${JSON.stringify(restoredRow)} and the list ${backInList ? 'has' : 'does not have'} it`,
  )

  // ══ 5. PERMANENT ═══════════════════════════════════════════════════════════
  console.log('\n▶ Delete forever — the half that makes it a real delete')

  // Setup, not a check: bin it again so there is something to destroy. A throw
  // here is a fixture failure, and `ran !== EXPECTED_CHECKS` reports it as one
  // rather than as a shorter passing run.
  const rebinned = await api(`/tasks/${T_API}/trash`, { method: 'POST' })
  if (rebinned.status >= 300 || (await rowOf(T_API))?.deleted_at == null) {
    throw new Error(`could not re-delete the restored task (POST answered ${rebinned.status})`)
  }

  const forever = await api(`/workspaces/${workspaceId}/trash/task/${T_API}`, { method: 'DELETE' })
  const goneRow = await rowOf(T_API)
  const goneFromTrash = (await trashEntry(T_API)) === null
  chk(
    forever.status < 300 && goneRow === null && goneFromTrash,
    'Delete forever removes the row itself — nothing left in the table or the Trash',
    `delete-forever answered ${forever.status}, the row is ${goneRow ? 'still there' : 'gone'} ` +
      `and the Trash ${goneFromTrash ? 'no longer lists it' : 'still lists it'}`,
  )

  /*
   * AND IT ONLY ACTS ON THINGS THAT ARE IN THE TRASH. The endpoint looked its
   * target up by id alone, so this same call on a task nobody had deleted
   * destroyed it — a hard delete, through a route whose entire contract is
   * "this is already in the bin".
   */
  const liveBefore = await rowOf(T_LIVE)
  const notTrashed = await api(`/workspaces/${workspaceId}/trash/task/${T_LIVE}`, { method: 'DELETE' })
  const liveAfter = await rowOf(T_LIVE)
  chk(
    notTrashed.status === 404 && liveBefore !== null && liveAfter !== null,
    'and it refuses a task that was never deleted (404), leaving the row alone',
    `delete-forever on a live task answered ${notTrashed.status} and the row is ${liveAfter ? 'intact' : 'GONE'}`,
  )

  console.log('\n▶ the archived task is still there, and still restorable the archive way')
  const archRestore = await api(`/tasks/${T_ARCHIVE}/restore`, { method: 'POST' })
  const archAfter = await rowOf(T_ARCHIVE)
  chk(
    archRestore.status < 300 && archAfter !== null && archAfter.is_archived === false && archAfter.deleted_at == null,
    'archiving never put the task near the bin: it restores intact through its own door',
    `restore answered ${archRestore.status} and the row reads ${JSON.stringify(archAfter)}`,
  )

  await page.close()
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that skipped a branch is not a ` +
        'shorter pass, it is a failure, and "0 failed" would describe only the part it reached.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
