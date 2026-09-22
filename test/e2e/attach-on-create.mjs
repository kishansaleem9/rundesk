/**
 * §V2-S02 frame `01:10` — ATTACHING FILES WHILE THE TASK IS STILL BEING WRITTEN.
 *
 * The frame draws an **Attachments** section inside the create modal, above the
 * footer, listing `Rectangle 25127.png` with a tick and an **X** beside it, and
 * a second row starting under it. So: several files, listed by name, each one
 * removable, all of it BEFORE the task exists.
 *
 * What stood in Rundesk was `const [attachment, setAttachment] = useState<File
 * | null>(null)` behind a paperclip with no `multiple`. One file. No list. No
 * way to take one back off, and picking a second one REPLACED the first with
 * nothing on screen to say so — a create surface that silently discards a file
 * somebody chose.
 *
 * WHAT THIS SUITE ACTUALLY WATCHES FOR:
 *
 *   · THE LIST IS THE CLAIM. Not "a paperclip is present": one row per staged
 *     file, each naming ITS file, and an X that removes exactly the row it sits
 *     on. A list that renders `files[0]` twice satisfies any count check.
 *
 *   · REMOVE AND RE-PICK. `<input type=file>` fires no change event when the
 *     same file is chosen again unless the value is cleared, so "remove it,
 *     change your mind, put it back" is the one interaction a naive list gets
 *     wrong. It is checked, because the frame's X invites exactly that.
 *
 *   · EVERY STAGED FILE IS UPLOADED, not just the last. The presign requests
 *     are captured and matched to the staged names, and the collection is
 *     asserted non-empty in the same check — "no request carried the wrong
 *     name" is *true* when there were no requests.
 *
 *   · AND ONLY AFTER THE TASK EXISTS. The presign route is
 *     `/tasks/:id/attachments/presign`; there is no id to presign against until
 *     the POST comes back. The ORDER is asserted rather than assumed, because
 *     an upload that went out first would be going somewhere else.
 *
 * WHERE THE ROUND TRIP STOPS HERE, said out loud rather than worked around:
 * R2 is unconfigured in this environment (`R2_ACCOUNT_ID` is empty), so
 * `createAttachmentUploadUrl` refuses and no object is ever stored. That is a
 * real failure path, and it is what makes the LAST check worth having — a list
 * of four files whose uploads fail must say WHICH ones, and this build names
 * each one. The task itself is asserted against the server, which is the part
 * that does not depend on storage.
 *
 * ITS OWN FIXTURES: one space, one project, one list, all tagged with this
 * run's stamp, and every server-side read narrowed to them.
 *
 *   node test/e2e/attach-on-create.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 13

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const TAG = `e2e-aoc-${Date.now()}`
const TITLE = `Attach ${TAG}`
const FILE_A = `alpha-${TAG}.txt`
const FILE_B = `beta-${TAG}.txt`

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
let ctx = null
let page = null
let SPACE = null
let api = null

/**
 * Stage a file on the hidden input without a file on disk.
 *
 * BOUNDED, BECAUSE AN ABSENT INPUT IS WHAT ONE OF THIS SUITE'S PATCHES MAKES.
 * `aoc-4-attach-input-unnamed` removes the testid, and an unqualified
 * `setInputFiles` then waited out the default timeout and threw — so the run
 * ended rather than reporting thirteen absences, and the patch's own header
 * said its evidence was "the whole run".
 */
const stage = (page, name, body) =>
  page
    .setInputFiles(
      '[data-testid="quick-create-attach"]',
      [{ name, mimeType: 'text/plain', buffer: Buffer.from(body) }],
      { timeout: 8000 },
    )
    .catch(() => {})

const rowNames = (page) =>
  page.locator('[data-testid^="quick-create-attachname-"]').evaluateAll((els) =>
    els.map((e) => (e.textContent ?? '').trim()),
  )

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  api = apiClient(`${B}/api/v1`, auth.accessToken)

  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call below is read off `status` or a failure reads as success.
  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  const spaceRes = await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Attach ${TAG}` } })
  if (spaceRes.status >= 300 || !spaceRes.data?.id) throw new Error(`could not make a space: ${spaceRes.status}`)
  SPACE = spaceRes.data.id
  const projRes = await api('/projects', { method: 'POST', body: { spaceId: SPACE, name: `Proj ${TAG}` } })
  if (projRes.status >= 300 || !projRes.data?.id) throw new Error(`could not make a project: ${projRes.status}`)
  const PROJECT = projRes.data.id
  const listRes = await api('/lists', { method: 'POST', body: { projectId: PROJECT, name: `List ${TAG}` } })
  if (listRes.status >= 300 || !listRes.data?.id) throw new Error(`could not make a list: ${listRes.status}`)
  const LIST = listRes.data.id

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await ctx.newPage()

  /*
   * Captured in ORDER, with a stamp, so "the uploads came after the task" is a
   * claim about sequence rather than about wall-clock timing.
   */
  const wire = []
  page.on('request', (r) => {
    const url = r.url()
    if (r.method() !== 'POST') return
    if (/\/api\/v1\/tasks(\?|$)/.test(url)) wire.push({ kind: 'task', url, body: r.postData() ?? '' })
    else if (/\/attachments\/presign$/.test(url)) wire.push({ kind: 'presign', url, body: r.postData() ?? '' })
    else if (/\/attachments$/.test(url)) wire.push({ kind: 'record', url, body: r.postData() ?? '' })
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  await page.getByTestId('create-tab-task').click({ timeout: 20_000 })
  /*
   * `state: 'attached'`, NOT the default `'visible'`.
   *
   * `quick-create-attach` is the `<input type=file>` itself, and it is
   * `className="hidden"` inside the paperclip `<label>` that wraps it — the
   * ordinary way to put a styled control over a file picker, and the thing the
   * frame actually draws. `display: none` means the default `waitForSelector`
   * can NEVER resolve, so this line was a gate no build could pass; the two
   * things the suite then does with the input — `evaluate(el => el.multiple)`
   * and `setInputFiles` — both work on a hidden input by design.
   *
   * What it no longer demands is that a raw file input be painted on screen,
   * which no frame asks for and which the visible half of the control is
   * checked for below.
   *
   * AND IT IS NO LONGER A GATE THAT THROWS. It used to, and the check
   * immediately below asserts the same thing — the input is there, takes
   * several files, and sits behind a pressable label — so removing the input
   * ended the run BEFORE the check that would have said so. `aoc-4` was the
   * patch that proved the gate was a gate, and what it proved was that a
   * thirteen-check suite could report nothing at all.
   */
  const attachThere = await page
    .waitForSelector('[data-testid="quick-create-attach"]', { state: 'attached', timeout: 20_000 })
    .then(() => true)
    .catch(() => false)

  console.log('\n▶ the picker takes more than one file `[frame 01:10]`')
  chk(
    attachThere &&
      (await page
        .locator('[data-testid="quick-create-attach"]')
        .evaluate((el) => el.multiple === true)
        .catch(() => false)) &&
      // …and it is REACHABLE: the hidden input is only a control if the label
      // wrapping it is on screen to be pressed. A `display:none` input with no
      // visible label is a picker nobody can open.
      (await page
        .locator('label:has([data-testid="quick-create-attach"])')
        .first()
        .isVisible()
        .catch(() => false)),
    'the file input accepts several files at once, behind a paperclip a person can press',
    attachThere
      ? 'the input is single-file — picking a second one replaced the first, with nothing on screen to say so — ' +
        'or it is hidden behind nothing pressable'
      : 'there is no file input on the task tab at all, so every check below is reading an absence',
  )

  console.log('\n▶ and lists them, one row each, by name')
  await stage(page, FILE_A, 'alpha')
  await stage(page, FILE_B, 'beta')
  chk(
    await waitUntil(async () => (await rowNames(page)).length === 2, { timeoutMs: 10_000 }),
    'two files staged draw two rows',
    `the Attachments list drew ${(await rowNames(page)).length} row(s) for two files`,
  )
  const staged = await rowNames(page)
  chk(
    staged[0] === FILE_A && staged[1] === FILE_B,
    'and each row names ITS OWN file, in the order they were picked',
    `the rows read ${JSON.stringify(staged)} — a list that renders files[0] twice passes any count check`,
  )
  chk(
    (await page.getByTestId('quick-create-attachments').count()) === 1 &&
      (await readText(page.getByTestId('quick-create-attachments'))).toLowerCase().includes('attachment'),
    'under an Attachments heading, as the frame draws it',
    'there is no Attachments section — the files were staged somewhere invisible',
  )

  console.log('\n▶ the X removes the row it sits on, and only that one')
  await page.getByTestId('quick-create-attachremove-0').click()
  chk(
    await waitUntil(async () => {
      const now = await rowNames(page)
      return now.length === 1 && now[0] === FILE_B
    }, { timeoutMs: 8000 }),
    `removing the first row leaves exactly ${FILE_B}`,
    `after removing row 0 the list read ${JSON.stringify(await rowNames(page))}`,
  )

  console.log('\n▶ removed, then chosen again — the interaction the X invites')
  await stage(page, FILE_A, 'alpha')
  chk(
    await waitUntil(async () => (await rowNames(page)).length === 2, { timeoutMs: 8000 }),
    're-picking a file that was removed brings its row back',
    'the row never came back — the file input still held the old value, so choosing the same ' +
      'file fired no change event at all',
  )

  console.log('\n▶ the same file twice is one file')
  await stage(page, FILE_A, 'alpha')
  const afterDupe = await rowNames(page)
  chk(
    afterDupe.length === 2 && afterDupe.filter((n) => n === FILE_A).length === 1,
    'picking an already-staged file again does not draw a second row for it',
    `the list read ${JSON.stringify(afterDupe)} — two rows you cannot tell apart is worse than dropping the pick`,
  )

  console.log('\n▶ then the task is created, and every staged file is uploaded to it')
  await page.getByTestId('quick-create-space').selectOption(SPACE)
  await page.getByTestId('quick-create-project').selectOption(PROJECT)
  await page.getByTestId('quick-create-list').selectOption(LIST)
  await page.getByTestId('quick-create-task-title').fill(TITLE)
  await page.getByTestId('quick-create-submit').click()

  chk(
    await waitUntil(() => wire.filter((w) => w.kind === 'presign').length === 2, { timeoutMs: 25_000 }),
    'both staged files are uploaded — not just the last one picked',
    `${wire.filter((w) => w.kind === 'presign').length} presign request(s) went out for 2 staged files`,
  )

  const presigns = wire.filter((w) => w.kind === 'presign')
  const names = presigns.map((p) => { try { return JSON.parse(p.body)?.fileName } catch { return null } })
  chk(
    // NON-EMPTY FIRST, in the same check: "every request carried a staged name"
    // is vacuously true of an empty list.
    presigns.length === 2 && names.includes(FILE_A) && names.includes(FILE_B),
    'and each upload carries the name of the file it is for',
    `the presign bodies carried ${JSON.stringify(names)}`,
  )

  const taskAt = wire.findIndex((w) => w.kind === 'task')
  const firstUpload = wire.findIndex((w) => w.kind === 'presign')
  chk(
    taskAt !== -1 && firstUpload !== -1 && taskAt < firstUpload,
    'the task is created first and the uploads hang off its id — there is no id to presign against before it',
    `the task POST was at index ${taskAt} and the first presign at ${firstUpload}`,
  )

  const sameTask = new Set(presigns.map((p) => p.url.replace(/\/attachments\/presign$/, '')))
  chk(
    sameTask.size === 1,
    'and both go to the SAME task, not to two different ones',
    `the uploads were addressed to ${JSON.stringify([...sameTask])}`,
  )

  console.log('\n▶ storage is unconfigured here, so every upload fails — and it says which')
  const toastText = await waitUntil(
    async () => (await readText(page.locator('[data-sonner-toast]').first())).includes(FILE_A),
    { timeoutMs: 20_000 },
  )
  chk(
    toastText,
    'a failed upload names the file it lost, so a four-file task can be retried',
    'the failure did not name the file — "an attachment failed" on a multi-file task tells nobody which one',
  )

  console.log('\n▶ and none of that loses you the task')
  const listed = await api(`/tasks/list/${LIST}`)
  chk(
    listed.status < 300 && (listed.data ?? []).some((task) => task.title === TITLE),
    'the task itself is on the server, in this run\'s own list',
    `GET /tasks/list/${LIST} answered ${listed.status} with ` +
      `${JSON.stringify((listed.data ?? []).map((task) => task.title)).slice(0, 200)}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page?.screenshot({ path: '/tmp/claude-0/shots/attach-on-create-fail.png', fullPage: true }).catch(() => {})
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
