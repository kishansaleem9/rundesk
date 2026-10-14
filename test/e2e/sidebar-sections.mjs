/**
 * §V2-S01 / S02 / S09 / S12 — the five things frames `00:05`, `06:25`, `08:00`
 * and `08:35` draw in the sidebar that Rundesk either did not have or could not
 * get past.
 *
 * FRAME `00:05` and `06:25`, the tree pane, top to bottom: **My Tasks** (person
 * icon) over Assigned to me · Today & Overdue · **Personal List** carrying a
 * count badge `1`, then `⋯ More`; **AI Chats** over three conversations and
 * another `⋯ More`; **Channels** over `# General - Leo` · `# Welcome` ·
 * `+ Add Channel`; then **Direct Messages** as its own section. At `[06:21]`:
 * *"yahan saari chats show hoti hain — yeh group communication channels, direct
 * messages, aur SPACES."*
 *
 * FRAME `08:00` is the space "+" menu: a **Create** heading over eight items in
 * three ruled groups, the last of which is **Imports ›** and **Templates**.
 * `[12:04]` names them.
 *
 * FRAME `08:35` is a list sitting inside a folder — `rundesk › ruruuu › List`,
 * breadcrumb and tree agreeing — after `[08:23]`: *"[Kuch] cheezein folder mein
 * MOVE kar sakti hoon — DRAG AND DROP ka option hai."*
 *
 * WHAT WAS ACTUALLY WRONG, one line each:
 *
 *   · Channels: absent from the workspace tree entirely. The data was there and
 *     the surface was not — channels existed only on the chat page, which you
 *     had to already be on to see that you had any.
 *   · AI Chats: `.slice(0, 5)` with no "More". `GET /ai-chats` returns every
 *     thread; the sixth onward was unreachable from the UI. Not collapsed, not
 *     paginated — absent, with no control anywhere that could have shown it.
 *   · The "+" menu: eight items, but a DIFFERENT eight. Imports and Templates
 *     are not `CreateKind`s, so neither could appear, while both destinations
 *     had been shipped and reachable from elsewhere for some time.
 *   · Drag: zero drag handlers in the whole file. The destinations and the
 *     endpoints existed (`move-dialog.tsx` posts to all three); the gesture did
 *     not.
 *   · Personal List: the section was built by `3d81f04` — the row claiming it
 *     absent is STALE — but its count badge was not.
 *
 * ITS OWN FIXTURES throughout: a tagged space with a tagged folder and two
 * tagged projects, tagged channels, tagged threads, tagged personal tasks.
 * Nothing here counts rows over the shared database, and every count that
 * matters is read off the page and compared with the server's own answer.
 *
 *   node test/e2e/sidebar-sections.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, ensureDm, madeRow } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 25

const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

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

const TAG = `e2e-ss-${Date.now()}`
/** How many threads to seed: more than the preview, so "More" has work to do. */
const SEEDED_THREADS = 7

/**
 * A synthesised HTML5 drag, in THREE round trips on purpose.
 *
 * `dragstart` sets React state that `dragover` then has to read to decide
 * whether the drop is allowed. Dispatching both inside one `page.evaluate`
 * runs them in the same task, React has not committed the update yet, and the
 * target answers "nothing is being dragged" — the drop is then a legitimate
 * no-op and the suite reads it as the feature being broken. One evaluate per
 * event forces a commit between them.
 *
 * The DataTransfer is stashed on `window` because it cannot cross the boundary.
 */
const html5Drag = async (page, fromTestId, toTestId) => {
  const sel = (id) => `[data-testid="${id}"]`
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) throw new Error(`no drag source ${s}`)
    window.__dt = new DataTransfer()
    el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, sel(fromTestId))
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) throw new Error(`no drop target ${s}`)
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, sel(toTestId))
  // The target only says `data-drop-active` when a drop here would REALLY move
  // something, so this is the state machine arming and not a hover style.
  const armed = await waitUntil(
    () => page.locator(sel(toTestId)).getAttribute('data-drop-active').then((v) => v === 'true'),
    { timeoutMs: 5_000 },
  )
  /*
   * GUARDED, AND THE ANSWER FOLDED INTO THE RETURN — see the twin of this
   * helper in `sidebar-reorder.mjs` for the reasoning. In short: a
   * `querySelector` inside an evaluate does not wait, the dragover above
   * already covered "never there", so a null here means the node detached
   * mid-drag; reporting it beats a `Cannot read properties of null` that ends
   * the section, and ANDing it into the return keeps a drop that never fired
   * from reading as an accepted drag.
   */
  const dropped = await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
    return true
  }, sel(toTestId))
  return armed && dropped
}

let browser = null
let ctx = null
let sql = null
/*
 * Hoisted so the cleanup can delete EXACTLY these. A thread carries no name to
 * tag, so the only honest filter is the ids this run made — "every empty thread
 * from the last hour" would reach into whatever else is running against the
 * shared database.
 */
const seededThreadIds = []

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${B}/api/v1`, auth.accessToken)
  const ME = auth.user?.id ?? auth.id

  const wsRes = await api('/workspaces')
  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call here is read off `status` rather than wrapped in a catch.
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — two checks here read the moved row back')

  // ── the tree fixture: one space, one folder, two projects, one list ────────
  const post = async (route, body, what) => {
    const res = await api(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data
  }
  const space = await post('/spaces', { workspaceId: WS, name: `Space ${TAG}` }, 'the space')
  const folder = await post(`/spaces/${space.id}/folders`, { name: `Folder ${TAG}` }, 'the folder')
  const rootProject = await post('/projects', { spaceId: space.id, name: `Root ${TAG}` }, 'the root project')
  const otherProject = await post('/projects', { spaceId: space.id, name: `Other ${TAG}` }, 'the other project')
  const list = await post('/lists', { projectId: rootProject.id, name: `List ${TAG}` }, 'the list')

  // ── channels, threads and personal tasks ──────────────────────────────────
  const myChannels = []
  for (let i = 0; i < 3; i++) {
    myChannels.push(await post(`/workspaces/${WS}/chat/channels`, { name: `chan-${TAG}-${i}` }, 'a channel'))
  }
  const dm = await ensureDm(api, WS, ME)

  const myThreads = []
  for (let i = 0; i < SEEDED_THREADS; i++) {
    const thread = await post(`/workspaces/${WS}/ai-chats`, {}, 'a thread')
    // The section hides empty threads, so each one needs a turn in it.
    await post(
      `/workspaces/${WS}/ai-chats/${thread.id}/messages`,
      { role: 'user', content: `${TAG} turn ${i}` },
      'a thread message',
    )
    myThreads.push(thread)
    seededThreadIds.push(thread.id)
  }

  const personal = []
  for (let i = 0; i < 3; i++) {
    personal.push(await post(`/workspaces/${WS}/personal-tasks`, { title: `todo ${TAG} ${i}` }, 'a personal task'))
    // Tasks of the admin's Personal List now (`found-24-sep/planner-default-list-read-by-nothing`): this run's, and removed with it.
    madeRow('tasks', personal[i].id)
  }

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
  const page = await ctx.newPage()

  /*
   * Every move the browser asks for, with its body. This is the only way to
   * tell "the server was told where to put it" apart from "the tree redrew
   * itself" — and that distinction IS the defect a drag handler can have.
   */
  const moves = []
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname
    if (r.method() === 'POST' && /\/(projects|lists)\/[^/]+\/move$/.test(p)) {
      moves.push({ path: p, body: r.postData() ?? '' })
    }
  })
  const channelPosts = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/chat\/channels$/.test(new URL(r.url()).pathname)) {
      channelPosts.push(r.postData() ?? '')
    }
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })

  // ==========================================================================
  console.log('\n▶ §V2-S02 — the Channels section frames `00:05` / `06:25` draw')

  const section = page.getByTestId('sidebar-channels')
  chk(
    await waitUntil(() => section.isVisible().catch(() => false), { timeoutMs: 25_000 }),
    'the workspace tree has a Channels section',
    'no Channels section in the tree — channels were reachable only from the chat page, ' +
      'which you had to already be on to see that you had any',
  )

  /*
   * EXACTLY the public channels the server returns, counted on the page. Not
   * "at least three": a section that renders everything it is handed passes a
   * lower bound while quietly including the DMs.
   */
  const listed = await api(`/workspaces/${WS}/chat/channels`)
  if (listed.status >= 300) throw new Error(`GET chat/channels answered ${listed.status}`)
  const publicIds = (listed.data ?? []).filter((c) => !c.isDm).map((c) => c.id)
  const dmIds = (listed.data ?? []).filter((c) => c.isDm).map((c) => c.id)
  const renderedRows = page.locator('[data-testid^="sidebar-channel-"]')
  chk(
    await waitUntil(async () => (await renderedRows.count()) === publicIds.length, { timeoutMs: 20_000 }),
    `the section draws exactly the ${publicIds.length} public channels the server returns`,
    `the tree drew ${await renderedRows.count()} rows for ${publicIds.length} public channels`,
  )
  chk(
    myChannels.every((c) => publicIds.includes(c.id)) &&
      (await Promise.all(
        myChannels.map((c) => page.getByTestId(`sidebar-channel-${c.id}`).isVisible().catch(() => false)),
      )).every(Boolean),
    'including all three of this run\'s own channels',
    'a channel this run created was missing from the section',
  )

  /*
   * DIRECT MESSAGES ARE A SEPARATE SECTION in both frames, with their own
   * `+ New message`. Folding them in here would make `+ Add Channel` the
   * button that also makes a DM. Proven against a DM that really exists, so
   * the check cannot pass by there being none.
   *
   * THAT SIBLING SECTION NOW EXISTS (§V2-S07, `sidebar-dms.mjs`), which makes
   * this check sharper rather than redundant: "a DM is not under Channels" and
   * "a DM is under Direct Messages" are two different facts, and a day when
   * somebody folds the two lists back together has to redden both suites
   * rather than one. `sidebar-dms.mjs` asserts this same exclusion from the
   * other side, against the same real DM, for exactly that reason.
   */
  const dmAbsent = dmIds.length > 0 && (await Promise.all(
    dmIds.map((id) => page.getByTestId(`sidebar-channel-${id}`).count()),
  )).every((n) => n === 0)
  chk(
    dmAbsent,
    `and none of the ${dmIds.length} direct messages, which frame \`06:25\` puts in its own section`,
    dmIds.length === 0
      ? `no DM exists to prove the exclusion with (ensureDm returned ${dm ? 'a channel' : 'null'}) — ` +
        'this check would otherwise pass vacuously for ever'
      : 'a direct message was drawn in the Channels section',
  )

  // Bounded and caught: `sidebar-sections-1-no-channels-section` removes the
  // section this row lives in, and an unbounded press on a row that is not
  // drawn threw after thirty seconds and ended the run at 5 of 25 checks. The
  // check below now reports the address it was left at instead (ledger §10).
  await page.getByTestId(`sidebar-channel-${myChannels[0].id}`).click({ timeout: 10_000 }).catch(() => {})
  chk(
    await waitUntil(() => page.url().includes(`channel=${myChannels[0].id}`), { timeoutMs: 15_000 }),
    'a channel row opens that conversation, by its id',
    `clicking the row left the address at ${page.url()} — the row navigates somewhere generic`,
  )

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  // `sidebar-sections-1-no-channels-section` removes the section this button
  // lives in, so the press was bounded at 25s and still THREW — bounding is not
  // catching. The run ended at 6 of 25 (ledger §10).
  await page.getByTestId('sidebar-add-channel').click({ timeout: 25_000 }).catch(() => {})
  const NEW_CHANNEL = `added-${TAG}`
  await page.getByTestId('sidebar-add-channel-name').fill(NEW_CHANNEL, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('sidebar-add-channel-save').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => channelPosts.some((b) => b.includes(NEW_CHANNEL)), { timeoutMs: 15_000 }),
    '"+ Add Channel" really creates one — the name left the browser in a POST',
    `no channel POST carried "${NEW_CHANNEL}". Bodies seen: ${JSON.stringify(channelPosts)}`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S02 — the `⋯ More` under AI Chats, frame `06:25`')

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  const chats = page.getByTestId('ai-chats-section')
  chk(
    await waitUntil(() => chats.isVisible().catch(() => false), { timeoutMs: 25_000 }),
    'the AI Chats section is drawn',
    'no AI Chats section',
  )
  // `null` reads as NaN, and every comparison below it is then false rather
  // than a thirty-second throw that ends the section — the section's own
  // "is it drawn" check above is allowed to fail.
  const total = Number(await chats.getAttribute('data-total', { timeout: 3_000 }).catch(() => null))
  const chatRows = page.locator('[data-testid^="ai-chat-"]')
  chk(
    total >= SEEDED_THREADS && (await chatRows.count()) === 5,
    `${total} conversations exist and exactly 5 are shown`,
    `total=${total} shown=${await chatRows.count()} — the preview is not five, or the ` +
      `${SEEDED_THREADS} seeded threads did not arrive`,
  )

  const more = page.getByTestId('ai-chats-more')
  // Read once, bounded and caught: a `chk` message is evaluated whether the check
  // passes or fails, so a removed "More" row would wait out the default thirty
  // seconds here and end the section. `more` is a locator held in a VARIABLE —
  // the shape rule six could not see until it learnt to track locator variables.
  const moreHidden = await more.getAttribute('data-hidden', { timeout: 8000 }).catch(() => null)
  chk(
    moreHidden !== null && Number(moreHidden) === total - 5,
    `the "More" row says ${total - 5} are hidden`,
    `"More" claimed ${JSON.stringify(moreHidden)} hidden of ${total} total — ` +
      'a "More" that does not know how many cannot tell you whether it is holding one ' +
      'conversation back or forty. Before this the sixth was simply unreachable.',
  )

  await more.click()
  chk(
    await waitUntil(async () => (await chatRows.count()) === total, { timeoutMs: 10_000 }),
    'and pressing it reaches every conversation, including the sixth',
    `after "More" the section drew ${await chatRows.count()} of ${total}`,
  )
  // `sidebar-sections-7-more-is-one-way` removes the collapse control, which is
  // what the checks below report: an unqualified click ended the run at 11 of 25.
  await page.getByTestId('ai-chats-less').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(async () => (await chatRows.count()) === 5, { timeoutMs: 10_000 }),
    'and it folds back to the preview',
    `folding back left ${await chatRows.count()} rows — the control is one-way`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S09 — Imports and Templates on the space "+" menu, frame `08:00`')

  /*
   * Hover the space row FIRST. The "+" is `opacity-0 group-hover:opacity-100`,
   * and reaching for it cold is the failure `space-create-menu.mjs` documents:
   * the locator waits out its whole timeout and then blames itself.
   */
  await page.getByTestId(`space-link-${space.id}`).hover({ timeout: 20_000 })
  await page.getByTestId(`space-create-open-${space.id}`).click({ timeout: 20_000 })
  await page.getByTestId('space-create-menu').waitFor({ timeout: 15_000 })
  const imports = page.getByTestId('space-create-imports')
  const templates = page.getByTestId('space-create-templates')
  const folderItem = page.getByTestId('space-create-folder')
  const [impBox, tplBox, folBox] = await Promise.all([
    imports.boundingBox().catch(() => null),
    templates.boundingBox().catch(() => null),
    folderItem.boundingBox().catch(() => null),
  ])
  chk(
    !!impBox && !!tplBox,
    'the menu offers Imports and Templates',
    `missing: imports=${!!impBox} templates=${!!tplBox} — neither is a CreateKind, so ` +
      'neither could appear, though both destinations have been shipped for some time',
  )
  /*
   * POSITION, not just presence. Frame `08:00` rules them into the LAST group,
   * below every create item — they fetch something that already exists rather
   * than making a new empty one, and a menu that mixes the two reads as eight
   * ways to create.
   */
  chk(
    !!impBox && !!tplBox && !!folBox && impBox.y > folBox.y && tplBox.y > impBox.y,
    'in the last group, below the create items, Imports over Templates',
    `y: folder=${folBox?.y} imports=${impBox?.y} templates=${tplBox?.y}`,
  )

  // `sidebar-sections-8-no-imports-templates` removes the two rows, which the
  // check above reports; clicking one ended the run at 14 of 25.
  // Imports, for whoever may import (this run's admin), is Settings › Imports / Exports with this
  // space its destination, as `space-create-menu` reads it — the imports/exports merge
  // (`found-14-oct/imports-exports-branch-unmerged`) moved it there from the importers' page.
  await imports.click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => {
      const url = new URL(page.url())
      return url.pathname === `/app/${WS}/settings` && url.searchParams.get('tab') === 'importsExports' &&
        url.searchParams.get('locationType') === 'space' && url.searchParams.get('locationId') === space.id
    }, { timeoutMs: 15_000 }),
    'Imports goes to Settings › Imports / Exports, this space its destination',
    `it left the address at ${page.url()}`,
  )
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-link-${space.id}`).hover({ timeout: 20_000 })
  await page.getByTestId(`space-create-open-${space.id}`).click({ timeout: 20_000 })
  await page.getByTestId('space-create-menu').waitFor({ timeout: 15_000 })
  await page.getByTestId('space-create-templates').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => page.url().includes(`/app/${WS}/templates`), { timeoutMs: 15_000 }),
    'and Templates goes to the templates page',
    `it left the address at ${page.url()}`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S12 — drag into a folder, `[08:23]`')

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 25_000 })
  await page.getByTestId(`tree-folder-${folder.id}`).waitFor({ timeout: 20_000 })

  const armedIn = await html5Drag(page, `tree-project-${rootProject.id}`, `tree-folder-${folder.id}`)
  chk(armedIn, 'the folder arms as a drop target while a project is over it', 'the folder never said it would take the drop')
  chk(
    await waitUntil(
      () => moves.some((m) => m.path.endsWith(`/projects/${rootProject.id}/move`) && m.body.includes(folder.id)),
      { timeoutMs: 15_000 },
    ),
    'dropping it asks the server to put it in THAT folder',
    'no move carrying the folder id left the browser — a tree that re-parents on screen ' +
      `and tells the server nothing is the same picture. Moves seen: ${JSON.stringify(moves)}`,
  )
  chk(
    await waitUntil(async () => {
      const [row] = await sql`select folder_id from projects where id = ${rootProject.id}`
      return row?.folder_id === folder.id
    }, { timeoutMs: 15_000 }),
    'and the project really is in the folder afterwards',
    'the database still has the project outside the folder',
  )

  /*
   * AND THE TREE ITSELF, not only the column. The database check above passes
   * the instant the API returns, while the sidebar is still a refetch behind —
   * which is exactly the gap the one-way bug hid in. Asking whether the row is
   * a descendant of THIS folder's children container is the same question the
   * person is answering by looking at it.
   */
  const inFolder = page.locator(
    `[data-testid="tree-folder-children-${folder.id}"] [data-testid="tree-project-${rootProject.id}"]`,
  )
  chk(
    await waitUntil(async () => (await inFolder.count()) === 1, { timeoutMs: 20_000 }),
    'and the sidebar redraws the row inside the folder',
    'the column moved and the tree did not — the move is invisible until something ' +
      'else refetches, and every later gesture is then deciding from stale data',
  )

  /*
   * BACK OUT AGAIN. A gesture that only goes one way means a project dropped in
   * by accident needs a different control to undo, so the space row is the
   * other target — and this also proves the drop is keyed on the target rather
   * than on "a drag happened".
   */
  // No reload between drags: the tree's expansion is component state, so a
  // reload would collapse the space and the next source would not be on screen
  // at all — which reads as the gesture failing. The move invalidates the tree
  // query, so the row is already where it belongs.
  await page.getByTestId(`tree-project-${rootProject.id}`).waitFor({ timeout: 20_000 })
  const movesBefore = moves.length
  const armedOut = await html5Drag(page, `tree-project-${rootProject.id}`, `tree-space-${space.id}`)
  /*
   * ARMING IS ITS OWN CHECK on this leg, because the two ways it can fail look
   * identical from the row alone. This is the check that would have named the
   * one-way bug immediately: `canDropOn` refused the space target for a project
   * whose `parentId` the tree still reported as null, so the row never armed
   * and the drop was a no-op — indistinguishable, without this, from a request
   * that went out and cleared nothing.
   */
  chk(
    armedOut,
    'the space row arms as a drop target for a project that is in a folder',
    'the space row never accepted the drag, so no request was ever going to be sent — ' +
      'the gesture is one-way at the TARGET, not at the endpoint',
  )
  chk(
    await waitUntil(async () => {
      const [row] = await sql`select folder_id from projects where id = ${rootProject.id}`
      return row?.folder_id === null
    }, { timeoutMs: 15_000 }),
    'dragging it back onto the space takes it out of the folder',
    // WHAT WAS SENT, not just what stayed put. "No request at all" and "a
    // request that cleared nothing" are different bugs in different files, and
    // the row alone cannot tell them apart.
    `the project stayed in the folder. Moves sent during this drag: ` +
      `${JSON.stringify(moves.slice(movesBefore))} (none = the drop never fired or was ` +
      `refused by canDropOn; one carrying "folderId":null = the endpoint ignored it)`,
  )

  /*
   * AND A LIST. Rundesk's `folderId` lives on `projects`, so a list lands in a
   * project; dragging the project that owns it into a folder is what produces
   * the frame's `space › folder › project › list`.
   */
  await page.getByTestId(`project-toggle-${rootProject.id}`).click({ timeout: 20_000 })
  await page.getByTestId(`tree-list-${list.id}`).waitFor({ timeout: 20_000 })
  const listMovesBefore = moves.length
  await html5Drag(page, `tree-list-${list.id}`, `tree-project-${otherProject.id}`)
  chk(
    await waitUntil(async () => {
      const [row] = await sql`select project_id from lists where id = ${list.id}`
      return row?.project_id === otherProject.id
    }, { timeoutMs: 15_000 }),
    'and a list can be dragged into another project',
    'the list did not move — the tree has drag for projects only. Moves sent during ' +
      `this drag: ${JSON.stringify(moves.slice(listMovesBefore))}`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S01 — the count on Personal List, frame `06:25`')

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  const badge = page.getByTestId('sidebar-my-tasks-personal-list-count')
  const openNow = ((await api(`/workspaces/${WS}/personal-tasks`)).data ?? []).filter((p) => !p.done).length
  chk(
    await waitUntil(async () => Number(await badge.filter({ visible: true }).innerText().catch(() => 'x')) === openNow, { timeoutMs: 25_000 }),
    `the badge reads the ${openNow} open personal tasks the server has`,
    `the badge read "${await badge.innerText().catch(() => '<absent>')}" for ${openNow} open tasks`,
  )

  /*
   * A CONSTANT WOULD PASS THE CHECK ABOVE, so the number has to be shown to
   * MOVE. Ticking one off must take it down by exactly one — a badge that never
   * falls is a number about the past.
   *
   * The cache miss is forced BY CONSTRUCTION: a full navigation builds a new
   * query client, so `staleTime: 30_000` cannot serve the old count. Waiting
   * thirty seconds would be a bet on the clock.
   */
  const done = await api(`/personal-tasks/${personal[0].id}`, { method: 'PATCH', body: { done: true } })
  chk(done.status < 300, 'a personal task can be ticked off', `PATCH answered ${done.status}`)
  // A full document load, so the query client is new and the old count cannot
  // be served from it.
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  chk(
    await waitUntil(
      async () => Number(await badge.filter({ visible: true }).innerText().catch(() => 'x')) === openNow - 1,
      { timeoutMs: 25_000 },
    ),
    'and ticking one off takes the badge down by exactly one',
    `the badge read "${await badge.innerText().catch(() => '<absent>')}" where ${openNow - 1} ` +
      'was expected — a badge that does not fall is counting something other than open work',
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * Only this run's rows. Every fixture above carries the tag, so nothing
   * belonging to another suite on the shared database is touched — and the
   * order is children first, because the tree is referenced.
   */
  if (sql) {
    // Messages cascade with their thread, so the ids are enough.
    if (seededThreadIds.length) {
      await sql`delete from ai_chat_threads where id = any(${seededThreadIds})`.catch(() => {})
    }
    await sql`delete from chat_channels where name like ${'%' + TAG + '%'}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
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
