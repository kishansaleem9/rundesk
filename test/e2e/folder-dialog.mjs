/**
 * §V2-S09 frame `08:32` — WHAT THE CREATE FOLDER DIALOG ASKS.
 *
 * The frame, read off the pixels rather than off a summary of them:
 *
 *     Create Folder
 *     Use Folders to organize your Lists, Docs, and more.
 *     Name              [ ruruuu ]
 *     Description       [ Tell us a bit about your Folder (optional) ]
 *     Select a Location [ ▾ rundesk ]
 *     Settings  › Statuses — "Use Space statuses"
 *     Make private        — "Only you and invited members have access"   [ ○ ]
 *     ──────────────────────────────────────────────────────────────────
 *     Use Templates                                                [ ✦ ]
 *
 * Rundesk's Folder tab was a name and a space picker. This suite covers the two
 * of the missing pieces that are BUILDABLE and asserts them against the server:
 * the private toggle, and the Use-Templates footer.
 *
 * DELIBERATELY NOT HERE, both recorded rather than faked:
 *
 *   · **Settings › Statuses**. A separate row, owned elsewhere in this pass.
 *
 *   · **Description**. `folders` has no description column, `FoldersService`
 *     whitelists `{name, color}` on create and `{name, color, position,
 *     visibility}` on update, so a description typed here would have nowhere to
 *     go. Adding the column without a writer and a reader is the mirror of the
 *     facade — a row in Postgres standing as evidence for a feature that does
 *     not exist — so it is reported as a gap instead.
 *
 * HOW THE PRIVATE TOGGLE IS HELD TOGETHER. `POST /spaces/:id/folders` does not
 * accept `visibility`; `PATCH …/:folderId` does, and every folder read path
 * already narrows a private folder to its creator and the workspace's managers.
 * So the dialog creates and then patches. That makes TWO things checkable and
 * both are checked separately, because either one alone passes on a facade:
 * the PATCH goes to the folder that was just made and carries `private`, AND
 * the row on the server comes back private. A toggle wired to nothing fails the
 * first; a toggle that patches the wrong id fails the second.
 *
 * AND THE OTHER DIRECTION. Leaving it off must leave the folder public and send
 * no PATCH at all — a dialog that always privatises is the same defect wearing
 * the opposite sign, and it would look identical in a screenshot.
 *
 * ITS OWN FIXTURES: one space this run makes, two folders inside it, both
 * tagged. Nothing here counts rows in the shared database.
 *
 *   node test/e2e/folder-dialog.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 21

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const TAG = `e2e-fd-${Date.now()}`
const OPEN_NAME = `Shared ${TAG}`
const SHUT_NAME = `Hidden ${TAG}`

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

let browser = null
let page = null
let SPACE = null
let api = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  api = apiClient(`${B}/api/v1`, auth.accessToken)

  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call is read off `status` or a failure reads as success.
  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  /*
   * `presetKey`, and the Statuses checks below are why.
   *
   * `POST /spaces` seeds `space_statuses` only through `applyPreset`, so a
   * space created without a preset has **none** — and the run that added those
   * checks reported exactly that: `GET /spaces/:id/statuses answered 200 with
   * 0`. The product was right (the list correctly fell back to its own seeded
   * set rather than showing an empty one); the fixture was not, because a
   * space with no statuses makes "a list in this folder reads the SPACE's
   * statuses" unprovable either way.
   *
   * The guard check that caught it is deliberately the third of the eight, so
   * the failure named the fixture rather than letting the two real checks
   * below fail for a reason that is not the code.
   */
  const spaceRes = await api('/spaces', {
    method: 'POST',
    body: { workspaceId: WS, name: `Folders ${TAG}`, presetKey: 'starter' },
  })
  if (spaceRes.status >= 300 || !spaceRes.data?.id) throw new Error(`could not make a space: ${spaceRes.status}`)
  SPACE = spaceRes.data.id

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await ctx.newPage()

  const folderPosts = []
  const folderPatches = []
  page.on('request', (r) => {
    const url = r.url()
    if (r.method() === 'POST' && /\/spaces\/[^/]+\/folders$/.test(url)) folderPosts.push(url)
    if (r.method() === 'PATCH' && /\/spaces\/[^/]+\/folders\/[^/]+$/.test(url)) {
      folderPatches.push({ url, body: r.postData() ?? '' })
    }
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  const openFolderTab = async () => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
    await page.getByTestId('create-tab-folder').click({ timeout: 20_000 })
    await page.waitForSelector('[data-testid="quick-create-folder-name"]', { timeout: 20_000 })
  }

  await openFolderTab()

  console.log('\n▶ the dialog asks the question frame `08:32` asks')
  chk(
    (await page.locator('[data-testid="quick-create-folder-private"]').count()) === 1,
    'the Create Folder dialog offers a Make private control',
    'there is no private toggle — a folder could only ever be created public, from the one ' +
      'dialog the frame shows the toggle in',
  )
  const privacyText = (await readText(page.getByTestId('quick-create-folder-private').locator('xpath=ancestor::label[1]')))
    .replace(/\s+/g, ' ')
  chk(
    /only you and invited members have access/i.test(privacyText),
    'with the frame\'s own sentence under it, so what "private" means is on screen',
    `the control read "${privacyText}" — a switch labelled only "Make private" leaves who ` +
      'still has access to guesswork',
  )
  chk(
    // `.catch(() => true)` reads an absent control as ON, which REDDENS: with
    // no control at all there is no evidence it starts off, and
    // `fd-8-no-private-control` removes it, so a bare `isChecked()` spent
    // thirty seconds and ended the run (ledger §10). The check below it reads
    // the same control the same way, and has since it was written.
    (await page.getByTestId('quick-create-folder-private').isChecked().catch(() => true)) === false,
    'and it starts off — a create surface must not hide a folder by surprise',
    'the toggle was already on, so a folder made without touching it would vanish for everybody else',
  )

  console.log('\n▶ leaving it off leaves the folder public — and sends no patch at all')
  await page.getByTestId('quick-create-folder-name').fill(OPEN_NAME)
  await page.getByTestId('quick-create-folder-space').selectOption(SPACE)
  const postsBefore = folderPosts.length
  await page.getByTestId('quick-create-folder-submit').click()
  const madeOpen = await waitUntil(() => folderPosts.length > postsBefore, { timeoutMs: 20_000 })
  chk(
    madeOpen,
    'the Folder tab really asks the server to create it',
    'no POST to /spaces/:id/folders left the browser',
  )
  // NON-EMPTY FIRST, in the same check: "no patch carried private" is vacuously
  // true of a run in which nothing was created either.
  await page.waitForTimeout(1200)
  chk(
    madeOpen && folderPatches.length === 0,
    'and with the toggle off nothing follows it — no visibility patch is sent',
    `${folderPatches.length} PATCH(es) went out for a folder nobody asked to make private: ` +
      `${JSON.stringify(folderPatches.map((p) => p.body)).slice(0, 160)}`,
  )

  await openFolderTab()

  console.log('\n▶ turning it on patches the folder that was just made, and says private')
  await page.getByTestId('quick-create-folder-name').fill(SHUT_NAME)
  await page.getByTestId('quick-create-folder-space').selectOption(SPACE)
  await page.getByTestId('quick-create-folder-private').check()
  await page.getByTestId('quick-create-folder-submit').click()
  chk(
    await waitUntil(() => folderPatches.length === 1, { timeoutMs: 20_000 }),
    'exactly one visibility patch goes out',
    `${folderPatches.length} PATCH(es) went out — expected exactly one, for the folder just created`,
  )

  /*
   * AND HERE, AFTER A DIALOG THAT HAD IT ON — which is the only place the
   * question means anything.
   *
   * This check used to sit above, between the public create and the private
   * one, where the PREVIOUS dialog had left the toggle off: there was nothing
   * to carry over, so "it does not remember" was true of a switch that
   * remembers perfectly. `fd-7-toggle-latches` makes the control remember its
   * last answer in a module-level global and ran GREEN for exactly that reason.
   *
   * The first dialog's "it starts off" check above is a different fact and
   * stays where it is.
   *
   * AND IT REOPENS IN THE SAME SESSION, which is both what a person does and
   * the only way this check can see the defect. `openFolderTab` navigates, and
   * a navigation wipes `globalThis` — so the module-level latch the patch adds
   * was gone before the toggle could be read, and the patch ran green a second
   * time for a second reason. Somebody making two folders in a row does not
   * reload the page between them.
   */
  console.log('\n▶ a fresh dialog does not remember the last answer')
  await page.keyboard.press('Escape')
  await waitUntil(
    async () => (await page.getByTestId('quick-create-folder-name').count()) === 0,
    { timeoutMs: 8000 },
  )
  await page.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('create-tab-folder').click({ timeout: 20_000 }).catch(() => {})
  await waitUntil(
    async () => (await page.getByTestId('quick-create-folder-private').count()) === 1,
    { timeoutMs: 20_000 },
  )
  chk(
    (await page.getByTestId('quick-create-folder-private').isChecked().catch(() => true)) === false,
    'reopening the dialog shows the toggle off again',
    'the toggle carried over from the folder just made private — a latched privacy switch ' +
      'privatises the next folder somebody makes without being asked',
  )

  const folders = await api(`/spaces/${SPACE}/folders`)
  chk(
    folders.status < 300,
    `the space's folders can be read back (GET /spaces/${SPACE}/folders)`,
    `GET /spaces/${SPACE}/folders answered ${folders.status}`,
  )
  const rows = folders.data ?? []
  const openRow = rows.find((f) => f.name === OPEN_NAME)
  const shutRow = rows.find((f) => f.name === SHUT_NAME)

  chk(
    // Defined first, separately: `a?.visibility === b?.visibility` is true when
    // neither row exists at all.
    !!shutRow && shutRow.visibility === 'private',
    `"${SHUT_NAME}" is private on the server, not merely toggled on screen`,
    shutRow
      ? `the row came back visibility=${JSON.stringify(shutRow.visibility)}`
      : 'the folder is not in this space at all — the create did not land',
  )
  chk(
    !!openRow && openRow.visibility === 'public',
    `and "${OPEN_NAME}" is still public — the second create did not reach back to the first`,
    openRow
      ? `the row came back visibility=${JSON.stringify(openRow.visibility)}`
      : 'the public folder is not in this space at all',
  )
  chk(
    !!shutRow &&
      folderPatches.length === 1 &&
      folderPatches[0].url.endsWith(`/folders/${shutRow.id}`) &&
      /"visibility"\s*:\s*"private"/.test(folderPatches[0].body),
    'and the patch went to THAT folder\'s id carrying visibility: private',
    `the patch was ${JSON.stringify(folderPatches[0] ?? null)} for folder id ${shutRow?.id}`,
  )

  console.log('\n▶ frame `08:32`\'s Use-Templates footer, from the Folder tab')
  await openFolderTab()
  chk(
    (await page.locator('[data-testid="create-footer-templates"]').count()) === 1,
    'the Folder tab carries a templates entry point, as the frame\'s footer draws',
    'the Folder tab offers no way to start from a template',
  )
  await page.getByTestId('create-footer-templates').click()
  chk(
    await waitUntil(() => /\/templates\b/.test(page.url()), { timeoutMs: 15_000 }),
    'and it lands on the Template Center rather than being a label',
    `pressing it left the browser at ${page.url()}`,
  )

  // ── frame `08:32` — Settings › Statuses, "Use Space statuses" ─────────────
  console.log('\n▶ frame `08:32` — Settings › Statuses, and what it actually does')
  /*
   * THE ROW IS A CONTROL, NOT A CAPTION. The frame draws `Statuses` over the
   * value "Use Space statuses" with a `›` beside it, and the chevron is the
   * whole claim: the inheritance is changeable. A row that named an
   * inheritance it could not alter would be the frame's own words on a dead
   * control.
   *
   * And the check that matters is the LAST one, not the first: a folder that
   * stores `status_scope` and hands it to nobody is the mirror defect, which
   * this audit has found six times. So this asserts the EFFECTIVE statuses of
   * a list created inside the folder — the set `resolveEffectiveStatuses`
   * returns, which is what the list page draws and what the task write path
   * validates against — and it asserts them against the SPACE's own statuses
   * rather than against a number, so a list that happened to seed the same
   * count cannot pass.
   */
  await openFolderTab()
  chk(
    (await page.locator('[data-testid="quick-create-folder-status-scope"]').count()) === 1,
    'the dialog carries a Statuses control, as the frame\'s Settings block draws',
    'there is no Statuses row — frame `08:32` puts one under Settings with a chevron',
  )
  const scopeValue = await page
    .locator('[data-testid="quick-create-folder-status-scope"]')
    .inputValue()
    .catch(() => null)
  chk(
    scopeValue === 'space',
    'and it starts on Use Space statuses, which is the value the frame shows',
    `it started on ${JSON.stringify(scopeValue)} — the frame's dialog reads "Use Space statuses" ` +
      'before anybody touches it',
  )

  /*
   * The space's own statuses, read from the server, so the comparison below is
   * against the real set and not against a count this suite chose.
   */
  const spaceStatuses = await api(`/spaces/${SPACE}/statuses`)
  const spaceKeys = (spaceStatuses.data ?? []).map((x) => x.key).sort()
  chk(
    spaceStatuses.status === 200 && spaceKeys.length > 0,
    `this run's space has statuses of its own to inherit (${spaceKeys.length})`,
    `GET /spaces/:id/statuses answered ${spaceStatuses.status} with ${spaceKeys.length} — with none, ` +
      'a list scoped to the space would show an empty set and every check below would be vacuous',
  )

  const inherit = await api(`/spaces/${SPACE}/folders`, {
    method: 'POST',
    body: { name: `Inherit ${TAG}`, statusScope: 'space' },
  })
  const own = await api(`/spaces/${SPACE}/folders`, {
    method: 'POST',
    body: { name: `Own ${TAG}`, statusScope: 'list' },
  })
  chk(
    inherit.status < 400 && own.status < 400 &&
      inherit.data?.statusScope === 'space' && own.data?.statusScope === 'list',
    'a folder stores the scope it was created with, both ways round',
    `inherit ${inherit.status} → ${JSON.stringify(inherit.data?.statusScope)}, ` +
      `own ${own.status} → ${JSON.stringify(own.data?.statusScope)}`,
  )

  const badScope = await api(`/spaces/${SPACE}/folders`, {
    method: 'POST',
    body: { name: `Bad ${TAG}`, statusScope: 'project' },
  })
  chk(
    badScope.status === 400 && /statusScope/.test(String(badScope.error?.message ?? badScope.error ?? '')),
    'and a scope it does not have is refused in words, not quietly defaulted',
    `it answered ${badScope.status} ${JSON.stringify(badScope.error ?? null)} — a value rewritten to ` +
      'the default is a setting that appears to have been accepted and was not',
  )

  /* A project in each folder, then a list in each project. */
  const mkList = async (folderId, label) => {
    const proj = await api('/projects', {
      method: 'POST',
      body: { spaceId: SPACE, name: `P-${label}-${TAG}`, folderId },
    })
    if (proj.status >= 400) return { proj, list: null }
    const list = await api('/lists', {
      method: 'POST',
      body: { projectId: proj.data.id, name: `L-${label}-${TAG}` },
    })
    return { proj, list }
  }
  const inheriting = await mkList(inherit.data?.id, 'inherit')
  const owning = await mkList(own.data?.id, 'own')
  chk(
    !!inheriting.list?.data?.id && !!owning.list?.data?.id,
    'a list exists inside each folder to read the setting off',
    `inherit list ${inheriting.list?.status}, own list ${owning.list?.status}`,
  )

  /*
   * THE ONE THAT MAKES THE COLUMN REAL. Not "the list stored scope=space" —
   * the EFFECTIVE set, which is what the page draws and what the task write
   * path validates against. Compared key-for-key with the space's own, so a
   * list that seeded a same-sized default cannot pass.
   */
  const effective = async (listId) => {
    // NO ID IS AN ANSWER, NOT A CRASH. The check above reports whether a list
    // could be made in each folder, and `folder-statuses-19-new-reader-breaks-the-writer`
    // makes both creates answer 500 — after which `inheriting.list.data.id`
    // threw `Cannot read properties of null` and ended the run at 20 of 21,
    // one check short, under a headline about the harness.
    if (!listId) return { status: 0, keys: [] }
    const r = await api(`/lists/${listId}/statuses`)
    return { status: r.status, keys: (r.data ?? []).map((x) => x.key).sort() }
  }
  const inheritStatuses = await effective(inheriting.list?.data?.id)
  chk(
    inheritStatuses.status === 200 &&
      inheritStatuses.keys.length === spaceKeys.length &&
      inheritStatuses.keys.every((k, i) => k === spaceKeys[i]),
    'a list in a "Use Space statuses" folder really reads the SPACE\'s statuses',
    `it returned ${JSON.stringify(inheritStatuses.keys)} where the space has ` +
      `${JSON.stringify(spaceKeys)} — a folder that stores the scope and hands it to nobody is ` +
      'the mirror defect this row exists to avoid',
  )

  const ownStatuses = await effective(owning.list.data.id)
  chk(
    ownStatuses.status === 200 && ownStatuses.keys.length > 0,
    'and a list in the other kind of folder has a usable set of its own',
    `it returned ${JSON.stringify(ownStatuses.keys)} — the override must not leave a list with ` +
      'no statuses at all, which would refuse every status a task tried to take',
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page?.screenshot({ path: '/tmp/claude-0/shots/folder-dialog-fail.png', fullPage: true }).catch(() => {})
} finally {
  if (SPACE && api) {
    const del = await api(`/spaces/${SPACE}`, { method: 'DELETE' })
    if (del.status >= 400) console.log(`\x1b[2m  could not clean up space ${SPACE} (${del.status})\x1b[0m`)
  }
  await browser?.close?.().catch(() => {})
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)
