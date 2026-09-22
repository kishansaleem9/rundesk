/**
 * §V2-13, frame `09:10` — **"List moved to trash" · Undo (Ctrl+Z)**.
 *
 * WHAT WAS THERE. Deleting a list, project or space from the tree succeeded in
 * SILENCE. No toast, nothing to press, and `window.alert` only if it failed.
 * Trash and restore both existed; getting to them meant knowing that Trash is a
 * settings tab, going there, and finding the row. The frame offers the way back
 * in the second after the mistake, which is the only second in which it is easy.
 *
 * THE CHECK THAT MATTERS IS THE RESTORE, NOT THE TOAST. A toast with an Undo
 * button that does not put the thing back is worse than no button, so every
 * check here reads the list back FROM THE API after pressing it. A suite that
 * asserted "a toast appeared" would pass against a button wired to nothing.
 *
 * AND THAT WAS TRUE OF THE TOAST AND FALSE OF THE THREE RESTORES. The three
 * checks that called `POST …/restore` directly asserted `status < 300` and
 * nothing else, so a restore that answered 200 without clearing `isArchived` —
 * or one that had lost the branch for a type entirely, since the branches are
 * an if/else chain that falls through in silence — passed all three while the
 * item stayed in the bin. Each now reads its row back. The rule this file
 * states in its second paragraph is now the rule it follows.
 *
 *   node test/e2e/undo-delete.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 11

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
const TAG = `e2e-undo-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages its own tree')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`

  /** Is the list still live, according to the server rather than the screen? */
  const listAlive = async (listId) => {
    const rows = (await A(`/lists/project/${project.id}`)).data ?? []
    return rows.some((l) => l.id === listId)
  }
  const makeList = async (name) => {
    const [row] = await sql`
      insert into lists (project_id, name) values (${project.id}, ${name}) returning id`
    return row.id
  }

  /*
   * THE PREMISE, DEMONSTRATED. These deletes are SOFT — `isArchived` — which is
   * the only reason an undo can exist at all. If a delete ever became a real
   * DELETE this check fails first and says why, rather than the undo button
   * quietly becoming an apology.
   */
  console.log('\n▶ §V2-13 — the premise: a deleted list is archived, not gone')
  const probe = await makeList(`Probe ${TAG}`)
  await A(`/lists/${probe}`, { method: 'DELETE' })
  const stillThere = await sql`select is_archived from lists where id = ${probe}`
  chk(
    stillThere.length === 1 && stillThere[0].is_archived === true,
    'the row survives the delete, archived',
    `the list row is ${stillThere.length === 0 ? 'gone entirely' : JSON.stringify(stillThere[0])} — ` +
      'an Undo over a hard delete would be a button that apologises',
  )
  const probeRestore = await A(`/workspaces/${workspaceId}/trash/list/${probe}/restore`, { method: 'POST' })
  chk(
    probeRestore.status < 300,
    'and the trash endpoint answers the restore',
    'restore failed on a freshly deleted list — the undo has nothing to call',
  )
  /*
   * AND THE ROW IS READ BACK, because a 200 is not a restore.
   *
   * This check, and the two like it below, were `status < 300` alone. This
   * file's own header says "every check here reads the list back FROM THE API
   * after pressing it" — and three of its eight checks did not read anything
   * back, so a `restore` that cleared `archivedAt` and left `isArchived` set,
   * or one whose branch for this type had quietly gone missing, answered 200
   * and passed all three. That is the exact facade the suite exists to catch,
   * asserted by its status code.
   */
  const probeBack = await sql`select is_archived from lists where id = ${probe}`
  chk(
    probeBack[0]?.is_archived === false,
    'and the row is un-archived afterwards, not merely answered for',
    `restore returned ${probeRestore.status} and is_archived is still ` +
      `${JSON.stringify(probeBack[0]?.is_archived)} — a 200 is not a restore`,
  )

  // ── In the browser ───────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  /*
   * DRIVEN THROUGH THE REAL MENU, because the whole item is what the tree does
   * after a delete. Deleting through the API instead would exercise the
   * endpoint and never touch the code this adds.
   */
  console.log('\n▶ deleting a list says so, and offers the way back')
  const target = await makeList(`Undo me ${TAG}`)
  page.on('dialog', (d) => void d.accept()) // the delete asks first
  await page.goto(`${stack.base}/app/${workspaceId}/${space.id}/${project.id}`, {
    waitUntil: 'domcontentloaded',
  })
  /*
   * The tree renders every space COLLAPSED, and this workspace has dozens, so
   * both levels have to be opened by id. Clicking blindly at the top of the
   * tree finds somebody else's space.
   */
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 20_000 })
  await page.getByTestId(`project-toggle-${project.id}`).click({ timeout: 20_000 })
  const rowReady = await waitUntil(
    () => page.getByTestId(`list-actions-${target}`).isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(rowReady, 'the list is in the tree to be deleted', 'the staged list never appeared in the sidebar')

  await page.getByTestId(`list-actions-${target}`).click()
  await page.getByTestId(`list-delete-${target}`).click({ timeout: 10_000 })

  const wentAway = await waitUntil(async () => !(await listAlive(target)), { timeoutMs: 15_000 })
  chk(wentAway, 'and deleting it really removes it', 'the list survived its own delete')

  /*
   * THE TOAST, AND THE BUTTON ON IT. Before this item the delete was silent:
   * no toast, nothing to press, and the only way back was knowing that Trash
   * is a settings tab.
   */
  /*
   * SCOPED TO THE TOASTER. `getByRole('button', {name:/undo/i})` matches nine
   * things on this page — every rich-text toolbar has an Undo — and in strict
   * mode that throws inside the `.catch`, which reported the toast as absent
   * when it was there. The toast's own action button is the only one that
   * matters here.
   */
  const undoBtn = page.locator('[data-sonner-toast] button', { hasText: /undo/i }).first()
  const offered = await waitUntil(
    async () => (await undoBtn.count()) > 0 && (await undoBtn.isVisible().catch(() => false)),
    { timeoutMs: 10_000 },
  )
  chk(
    offered,
    'a toast offers Undo, in the second after the mistake',
    'nothing was offered — the list vanished in silence, which is what this item replaces',
  )

  // THE CHECK THAT MATTERS: pressing it puts the list back, read from the API
  // rather than from the screen. A button that only closes the toast would
  // pass every check above this one.
  await undoBtn.click()
  const cameBack = await waitUntil(() => listAlive(target), { timeoutMs: 15_000 })
  chk(
    cameBack,
    'and pressing it brings the list back',
    'Undo was pressed and the list stayed deleted — a button wired to nothing is worse than no button',
  )

  console.log('\n▶ the same for a project and a space, which are the other two')
  const [proj2] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Proj2 ${TAG}`}) returning id`
  await A(`/projects/${proj2.id}`, { method: 'DELETE' })
  const projBack = await A(`/workspaces/${workspaceId}/trash/project/${proj2.id}/restore`, { method: 'POST' })
  chk(
    projBack.status < 300,
    'a project can be deleted and restored by the same pair',
    `restoring a project returned ${projBack.status}`,
  )
  const projRow = await sql`select is_archived from projects where id = ${proj2.id}`
  chk(
    projRow[0]?.is_archived === false,
    'and the project row comes back un-archived',
    `the project restore returned ${projBack.status} and is_archived is ` +
      `${JSON.stringify(projRow[0]?.is_archived)}`,
  )

  const [space2] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space2 ${TAG}`}) returning id`
  await A(`/spaces/${space2.id}`, { method: 'DELETE' })
  const spaceBack = await A(`/workspaces/${workspaceId}/trash/space/${space2.id}/restore`, { method: 'POST' })
  chk(
    spaceBack.status < 300,
    'and so can a space',
    `restoring a space returned ${spaceBack.status}`,
  )
  const spaceRow = await sql`select is_archived from spaces where id = ${space2.id}`
  chk(
    spaceRow[0]?.is_archived === false,
    'and the space row comes back un-archived too',
    `the space restore returned ${spaceBack.status} and is_archived is ` +
      `${JSON.stringify(spaceRow[0]?.is_archived)}`,
  )

  await page.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  if (sql) {
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
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
