/**
 * §V2-S10 — "Folder name taken", frames `08:25` / `08:55`.
 *
 * WHAT THE FRAMES AND THE WORDS SAY. At `08:25` the Create menu is open on a
 * space and she picks **Folder**; at `[08:23]` she says it outright — *"FOLDER
 * banaya; main folder banaoongi, folder ka bhi SAME NAAM dete hain"* — she is
 * deliberately reusing a name. At `08:55` two error toasts are stacked
 * BOTTOM-LEFT reading *"List name taken"*, and she narrates them: *"Yahan pe na
 * yeh ERROR de raha hai filhaal, lekin agar koi error aata hai to yeh yahan show
 * kar deta hai."* The toast is the general answer to a refused create, not a
 * list-only one.
 *
 * THREE THINGS WERE WRONG, and they are the same three `88830db` fixed for
 * lists — on the sibling container created from the same eight-item menu:
 *
 *   1. `FoldersService.create` inserted whatever it was handed. No constraint
 *      and no check, so one space could hold three folders called "Clients" and
 *      the tree gave you nothing but their ids to tell them apart.
 *   2. The quick-create dialog's FOLDER tab had `onSuccess` and NO `onError` —
 *      the exact line `88830db` added to the List tab a few hundred lines above
 *      it. A refused create did nothing at all.
 *   3. The sidebar's "New folder" was `window.prompt` + `window.alert`, so the
 *      two folder paths disagreed about whether a failure was even mentioned,
 *      and in a headless browser `alert` is no surface at all.
 *
 * AND THEN THE SIDEBAR HAD A DIALOG OF ITS OWN, which asked for a name and
 * posted only that: no description, no Make private, no statuses, all of which
 * the Create menu's Folder form sends (`commit-log/log-a0b4108-1`). ClickUp's
 * sidebar opens its one Create Folder dialog. The sidebar's "New folder" now
 * opens the Create menu's Folder form with the space chosen, so there is one
 * folder form, and path 2 below drives it from the sidebar.
 *
 * WHERE THE RULE LIVES: migration 0157, a partial case-insensitive unique index
 * on `(space_id, lower(name)) where is_archived = false` — 0147's index for the
 * other container. The service check on top exists ONLY so the answer carries
 * words a person can read, so this suite checks BOTH, including one write that
 * goes straight past the service to the index.
 *
 * THREE DOORS reach that namespace and all three are driven here: create,
 * rename, and move-into-another-space. The third is the one that is easy to
 * forget and the one that would have surfaced as a 500.
 *
 * AGAINST THE REAL STACK, necessarily: the load-bearing claim is a database
 * constraint and a stub cannot have one.
 *
 * ITS OWN FIXTURES: two spaces named with this run's tag, and every folder name
 * carries it. Nothing here counts rows in the shared database.
 *
 *   node test/e2e/folder-create.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 22

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const chromium = await resolveChromium()
let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const TAG = `e2e-fc-${Date.now()}`
/** The name she reuses on camera. Tagged, so it is this run's name and nobody else's. */
const NAME = `Clients ${TAG}`

let browser = null
let ctx = null
let sql = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${B}/api/v1`, auth.accessToken)

  const wsRes = await api('/workspaces')
  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so a bad call has to be read off `status` or it reads as success.
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const rows = wsRes.data ?? []
  const WS = (rows[0]?.workspace ?? rows[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the load-bearing claim here is an index')

  const mkSpace = async (label) => {
    const res = await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${label} ${TAG}` } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make space ${label}: ${res.status}`)
    return res.data.id
  }
  const SPACE_A = await mkSpace('SpaceA')
  const SPACE_B = await mkSpace('SpaceB')

  // ---------------------------------------------------------------------------
  console.log('\n▶ the API refuses a duplicate folder name, in the frame\'s words')

  const first = await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: NAME } })
  chk(
    first.status < 300 && !!first.data?.id,
    'the first folder is created',
    `POST /spaces/:id/folders answered ${first.status}`,
  )

  const second = await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: NAME } })
  chk(
    second.status === 409,
    'the second is refused with a 409',
    `it answered ${second.status} — a duplicate folder name was accepted, or refused as ` +
      'something else. Before 0157 this was a 201 and the space had two folders with one name.',
  )
  chk(
    /folder name taken/i.test(JSON.stringify(second.error ?? '')),
    'and the message reads "Folder name taken"',
    `the error was ${JSON.stringify(second.error)} — a Postgres unique violation surfacing ` +
      'as "That resource already exists" is the index working and the service not answering',
  )

  /*
   * CASE-INSENSITIVE. "Clients" and "clients" are the same name to whoever is
   * reading the tree, and a rule that let both through would be enforcing
   * something nobody means.
   */
  const cased = await api(`/spaces/${SPACE_A}/folders`, {
    method: 'POST',
    body: { name: NAME.toUpperCase() },
  })
  /*
   * The SERVICE has to fold case, not just the index. Both refuse with a 409 —
   * the filter maps 23505 to the same status — so a status-only check passes
   * even with `lower()` taken out of the service query, and the person gets
   * "That resource already exists" where they should get "Folder name taken".
   */
  const casedMsg = String(cased.error?.message ?? cased.error ?? '')
  chk(
    cased.status === 409 && /folder name taken/i.test(casedMsg),
    'and case does not get around it — the service folds it, not only the index',
    `"${NAME.toUpperCase()}" alongside "${NAME}" gave ${cased.status} "${casedMsg}" — ` +
      'a 409 in the filter\'s words means the service compared the names verbatim and the ' +
      'database caught what it missed',
  )

  // ---------------------------------------------------------------------------
  console.log('\n▶ but the rule is scoped to the SPACE, and to live folders')

  const elsewhere = await api(`/spaces/${SPACE_B}/folders`, { method: 'POST', body: { name: NAME } })
  chk(
    elsewhere.status < 300,
    'the same name is fine in a different space',
    `a second space could not have its own "${NAME}" (${elsewhere.status})`,
  )

  /*
   * `remove()` ARCHIVES a folder so it can come back out of the Trash, so a name
   * sitting in the bin must not be reserved for ever — the index is partial on
   * `is_archived = false` for exactly this.
   */
  const binned = await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: `Binned ${TAG}` } })
  if (binned.status >= 300) throw new Error(`could not make the folder to bin: ${binned.status}`)
  const delRes = await api(`/spaces/${SPACE_A}/folders/${binned.data.id}`, { method: 'DELETE' })
  chk(delRes.status < 300, 'a folder can be deleted', `DELETE answered ${delRes.status}`)
  const reused = await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: `Binned ${TAG}` } })
  chk(
    reused.status < 300,
    'and a deleted folder does not hold its name hostage',
    `the name stayed reserved by a binned folder (${reused.status})`,
  )

  // ---------------------------------------------------------------------------
  console.log('\n▶ THE CONSTRAINT IS IN THE DATABASE, not only in the service')

  /*
   * The service check produces a good error. The INDEX is what makes the rule
   * true — for two requests racing, and for any code path that forgets to ask.
   * So this writes straight past the service.
   */
  let rawRefused = false
  try {
    await sql`insert into folders (space_id, name) values (${SPACE_A}, ${NAME})`
  } catch {
    rawRefused = true
  }
  chk(
    rawRefused,
    'a direct insert of a duplicate is refused by the index itself',
    'the database accepted it — the rule lives only in the service, so anything that ' +
      'writes folders another way can still make two, and a schema declared without a ' +
      'migration behind it is a constraint that exists on one machine',
  )

  // ---------------------------------------------------------------------------
  console.log('\n▶ and the other two doors onto the same namespace')

  /*
   * RENAME. Guarding only `create` leaves the rule reachable-around: make
   * "Clients 2", rename it to "Clients", and the index — not the API — answers,
   * with a 500 out of an ordinary edit.
   */
  const spare = await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: `Spare ${TAG}` } })
  if (spare.status >= 300) throw new Error(`could not make the spare folder: ${spare.status}`)
  const renamed = await api(`/spaces/${SPACE_A}/folders/${spare.data.id}`, {
    method: 'PATCH',
    body: { name: NAME },
  })
  /*
   * THE STATUS IS NOT ENOUGH, and this check used to be only the status.
   *
   * Its own failure message said "500 means the index answered instead of the
   * service" — but `all-exceptions.filter.ts:11` maps Postgres 23505 to 409,
   * so an UNGUARDED rename that reaches the index answers 409 as well. Two
   * different mechanisms, one status code, and a check that cannot tell them
   * apart: deleting `assertFolderNameFree` from the rename path left this
   * suite entirely green.
   *
   * The message is what distinguishes them. The service says "Folder name
   * taken"; the filter says "That resource already exists", which is what a
   * person would see out of an ordinary rename if the guard went away.
   */
  const renamedMsg = String(renamed.error?.message ?? renamed.error ?? '')
  chk(
    renamed.status === 409 && /folder name taken/i.test(renamedMsg),
    'renaming a folder onto a taken name is refused by the SERVICE, in its own words',
    `PATCH answered ${renamed.status} with "${renamedMsg}" — 200 means the rule has a second ` +
      'door standing open; a 409 reading "That resource already exists" means the guard is gone ' +
      'and the database is answering a question the service never asked',
  )
  // ...and renaming a folder to the name it already has is not a clash with itself.
  const noop = await api(`/spaces/${SPACE_A}/folders/${spare.data.id}`, {
    method: 'PATCH',
    body: { name: `Spare ${TAG}` },
  })
  chk(
    noop.status < 300,
    'while renaming a folder to its own name is still allowed',
    `a folder could not keep its own name (${noop.status}) — the check is not excluding itself`,
  )

  /*
   * MOVE. The index is on `(space_id, lower(name))`, so carrying "Clients" into
   * a space that already has a "Clients" is a unique violation, out of a move
   * that looked ordinary.
   */
  const clash = await api(`/spaces/${SPACE_B}/folders`, { method: 'POST', body: { name: `Movable ${TAG}` } })
  if (clash.status >= 300) throw new Error(`could not make the movable folder: ${clash.status}`)
  await api(`/spaces/${SPACE_A}/folders`, { method: 'POST', body: { name: `Movable ${TAG}` } })
  const moved = await api(`/spaces/${SPACE_B}/folders/${clash.data.id}/move`, {
    method: 'POST',
    body: { targetSpaceId: SPACE_A },
  })
  // Same reasoning as the rename check above: the status alone cannot tell the
  // guard from the index, because the filter gives both of them a 409.
  const movedMsg = String(moved.error?.message ?? moved.error ?? '')
  chk(
    moved.status === 409 && /folder name taken/i.test(movedMsg),
    'and moving a folder into a space that already has that name is refused by the SERVICE',
    `the move answered ${moved.status} with "${movedMsg}" — 200 means two folders now share a ` +
      'name in one space; a 409 reading "That resource already exists" means the third door is ' +
      'open and the index caught what the service should have',
  )

  // ---------------------------------------------------------------------------
  console.log('\n▶ and the refusal reaches the person, on BOTH create paths')

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()

  /*
   * Every folder POST the browser makes. The toast is only evidence of the fix
   * if the request that provoked it actually left — a dialog that refused
   * client-side would raise the same toast and prove nothing.
   */
  const folderPosts = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/spaces\/[^/]+\/folders$/.test(new URL(r.url()).pathname)) {
      folderPosts.push(r.url())
    }
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  // ── path 1: the quick-create dialog's Folder tab (the one with no onError) ──
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-tab-folder').click({ timeout: 20_000 })
  await page.getByTestId('quick-create-folder-name').fill(NAME, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('quick-create-folder-space').selectOption(SPACE_A, { timeout: 8000 }).catch(() => {})
  const postsBefore = folderPosts.length
  await page.getByTestId('quick-create-folder-submit').click({ timeout: 8000 }).catch(() => {})

  chk(
    await waitUntil(() => folderPosts.length > postsBefore, { timeoutMs: 15_000 }),
    'the Folder tab really asks the server to create it',
    'no POST to /spaces/:id/folders left the browser — whatever happened next was ' +
      'not the server answering',
  )

  const toast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(() => toast.isVisible().catch(() => false), { timeoutMs: 15_000 }),
    'the refusal reaches the person as a toast',
    'the Folder tab swallowed it — this mutation had no onError, so the server said no ' +
      'and the dialog sat there with the button looking un-pressed',
  )
  const toastText = await readText(toast)
  chk(
    /taken/i.test(toastText),
    'and it reads "Folder name taken", the frame\'s shape of words',
    `the toast read "${toastText}"`,
  )

  /*
   * POSITION IS THE FRAME'S CLAIM, so it is read off the bounding box rather
   * than an attribute of the toast library — a person cannot read
   * `data-x-position`. Bottom-LEFT, as `08:55` draws both of them.
   */
  // `boundingBox()` THROWS when the locator matches nothing — it waits for the
  // element first — and returns null only for one that exists with no box. Every
  // check below reads the size through `?? 0` or a null test, so absence reports
  // as zero and reddens; unguarded it spent thirty seconds and ended the section
  // (ledger §10).
  const box = await toast.boundingBox({ timeout: 6000 }).catch(() => null)
  const viewport = page.viewportSize()
  chk(
    !!box && !!viewport &&
      box.y + box.height / 2 > viewport.height / 2 &&
      box.x + box.width / 2 < viewport.width / 2,
    'and it sits bottom-left, where frame `08:55` stacks them',
    `the toast's centre was at (${box ? Math.round(box.x + box.width / 2) : '?'}, ` +
      `${box ? Math.round(box.y + box.height / 2) : '?'}) of ${viewport?.width}×${viewport?.height}`,
  )

  // ── path 2: the sidebar's "New folder", which opens the same Folder form ──
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-toggle-${SPACE_A}`).click({ timeout: 25_000 })
  await page.getByTestId(`space-new-folder-${SPACE_A}`).click({ timeout: 20_000 })
  const folderTab = page.getByTestId('create-tab-folder')
  await folderTab.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const tabPressed = await folderTab.getAttribute('aria-pressed', { timeout: 3000 }).catch(() => null)
  const spaceChosen = await page.getByTestId('quick-create-folder-space').inputValue({ timeout: 3000 }).catch(() => null)
  chk(
    tabPressed === 'true' && spaceChosen === SPACE_A,
    'the sidebar’s New folder opens the Create menu’s Folder form, with this space chosen',
    `the Folder tab pressed: ${JSON.stringify(tabPressed)}; the space chosen: ${spaceChosen === SPACE_A ? 'this one' : JSON.stringify(spaceChosen)}. ` +
      'A dialog of the sidebar’s own asks for a name and sends nothing else',
  )
  await page.getByTestId('quick-create-folder-name').fill(NAME, { timeout: 8000 }).catch(() => {})
  const sidebarPostsBefore = folderPosts.length
  await page.getByTestId('quick-create-folder-submit').click({ timeout: 8000 }).catch(() => {})

  chk(
    await waitUntil(() => folderPosts.length > sidebarPostsBefore, { timeoutMs: 15_000 }),
    'the sidebar path asks the server too',
    'the sidebar create sent nothing',
  )
  const sidebarToast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(async () => /taken/i.test(await readText(sidebarToast, { timeoutMs: 1500 })), {
      timeoutMs: 15_000,
    }),
    'the sidebar path reports the refusal with the same words',
    'the sidebar swallowed it — this was window.alert, which in a headless browser is ' +
      'no surface at all, so the two folder paths disagreed about whether a failure exists',
  )

  /*
   * AND THE DIALOG STAYS OPEN, with the name still in the box. A refusal you
   * have to retype your way back to is a refusal you cannot act on, and this is
   * the reason this path does not reuse `ContainerEditDialog`.
   */
  chk(
    (await page.getByTestId('quick-create-folder-name').isVisible().catch(() => false)) &&
      (await page.getByTestId('quick-create-folder-name').inputValue().catch(() => '')) === NAME,
    'and the dialog stays open with the rejected name still in the box',
    'the dialog closed on a refusal, so the name has to be retyped to try again',
  )

  /*
   * THE SUCCESS PATH, by construction rather than by timing: a name nothing has
   * used, so the create cannot be refused, and the tree read AFTER the row
   * exists rather than after a sleep.
   */
  const FRESH = `Fresh ${TAG}`
  const WORDS = `What goes in here ${TAG}`
  // Every step bounded. `folder-create-11-dialog-closes-on-error` closes the
  // dialog on the refusal above — which the check above reports — so neither
  // the box nor the submit is there for this success path, and an unbounded
  // press spent thirty seconds where the fill had been spared.
  //
  // Rule four does not cover this and should not be widened to: it pairs the
  // SAME locator guarded then bare, and these are different testids in one
  // sequence — the shape that can only be stated by reading formatting, left to
  // measurement on purpose. Measurement found it, in one set, at one line.
  // Open before, or "it closed" says nothing: a dialog that never opened is
  // not open afterwards either, and this check passed on exactly that.
  const openBefore = await page.getByTestId('quick-create-folder-name').isVisible().catch(() => false)
  await page.getByTestId('quick-create-folder-name').fill(FRESH, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('quick-create-folder-description').fill(WORDS, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('quick-create-folder-private').check({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('quick-create-folder-submit').click({ timeout: 8000 }).catch(() => {})
  chk(
    openBefore &&
      await waitUntil(
        async () => !(await page.getByTestId('quick-create-folder-name').isVisible().catch(() => false)),
        { timeoutMs: 15_000 },
      ),
    'a name that is free closes the dialog',
    openBefore ? 'the dialog stayed open on a create that should have succeeded' : 'the dialog was not open to be closed',
  )
  // The private flag is a second write, after the create (`FolderForm`).
  await waitUntil(async () => (await sql`
    select 1 from folders
    where space_id = ${SPACE_A} and name = ${FRESH} and is_archived = false and visibility = 'private'`).length > 0,
  { timeoutMs: 10_000 })
  const rowsAfter = await sql`
    select id, description, visibility from folders
    where space_id = ${SPACE_A} and name = ${FRESH} and is_archived = false`
  chk(
    rowsAfter.length === 1,
    'and exactly one folder with that name now exists in the space',
    `the database holds ${rowsAfter.length} folders called "${FRESH}" in this space`,
  )
  chk(
    rowsAfter.length === 1 && rowsAfter[0].description === WORDS && rowsAfter[0].visibility === 'private',
    'and it holds what the dialog was given from the sidebar — its description, and private',
    `the folder's description is ${JSON.stringify(rowsAfter[0]?.description ?? null)} and its visibility ` +
      `${JSON.stringify(rowsAfter[0]?.visibility ?? null)}: a sidebar form that posts only a name drops both`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * Only this run's rows: every space and folder made here carries the tag, so
   * nothing belonging to another suite on the shared database is touched.
   */
  if (sql) {
    await sql`delete from folders where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
