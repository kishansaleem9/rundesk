/**
 * §V2-S13 `| M | Sidebar: drag-reorder, "+ Add a new section" |` — the FIRST
 * half of that row: putting the sidebar tree's siblings in an order and having
 * the order stay.
 *
 * WHAT THE FRAMES SHOW. `14:16` is Calendar settings › **Sidebar**: "Sidebar
 * sections — Show, hide and REORDER the sections that appear in the planner
 * sidebar", five rows each carrying a drag handle, and `+ Add a new section`
 * under them. `[08:23]` names the gesture outright for the tree itself:
 * *"[Kuch] cheezein folder mein MOVE kar sakti hoon — DRAG AND DROP ka option
 * hai."* Frames `00:05` and `06:25` draw the tree as an ORDERED column.
 *
 * WHAT WAS ACTUALLY WRONG. `projects.position` has existed since the table
 * did, and had neither end of a feature attached to it:
 *
 *   · nothing WROTE it — `updateProject` whitelists its updatable columns and
 *     leaves `position` out on purpose;
 *   · nothing READ it — `getProjectsBySpace` has no `ORDER BY` at all, so the
 *     tree drew whatever order the query plan produced, which changes as rows
 *     are updated and after a vacuum.
 *
 * A column with no writer and no reader is the mirror defect with the mirror
 * missing too: schema that is evidence for an arrangement the product cannot
 * store. `POST /workspaces/:id/sidebar/reorder` is its writer and the tree's
 * sort is its reader. Lists already had both (`POST /lists/project/:id/reorder`
 * and `orderBy(asc(lists.position))`) and the sidebar simply never called it —
 * so lists keep that route rather than getting a second writer for one column.
 *
 * THE DEFECT THIS SUITE IS SHAPED AROUND is the one `canDropOn` documents in
 * `workspace-sidebar.tsx`: a drop predicate that decided "can this land here"
 * from a `parentId` the client captured at dragstart, which six invalidating
 * refetches always beat. The drag was refused IN THE BROWSER and no request
 * was ever sent — so a suite that only reads the database afterwards sees the
 * same "nothing moved" for a refused gesture and a broken endpoint. Every
 * reorder check here therefore asks three separate questions: did the target
 * ARM, what left the browser, and what is stored.
 *
 * ITS OWN FIXTURES: one tagged space, one tagged folder, tagged projects and
 * tagged lists, and every order read off the page is filtered to those ids
 * before it is compared. Nothing here counts rows over the shared database.
 *
 *   node test/e2e/sidebar-reorder.mjs --api 3011 --dist apps/web/dist
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

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 23

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

const TAG = `e2e-sr-${Date.now()}`

/**
 * A synthesised HTML5 drag onto a BETWEEN-ROWS strip, in three round trips.
 *
 * The same three-evaluate shape `sidebar-sections.mjs` explains for row
 * targets, and for the same reason: `dragstart` sets React state that
 * `dragover` has to read to decide whether the drop is allowed, and dispatching
 * both inside one `page.evaluate` runs them in the same task with the update
 * uncommitted. The target then answers "nothing is being dragged", the drop is
 * a legitimate no-op, and the suite reads it as the feature being broken.
 *
 * Deliberately a SECOND copy rather than an import: `sidebar-sections.mjs`
 * keeps its own, and reaching across two suites for a helper makes either of
 * them impossible to change alone.
 */
const html5DragTo = async (page, fromTestId, toTestId) => {
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
  // `data-drop-active` only ever appears while a drop HERE would really write
  // something, so this is the state machine arming and not a hover style.
  const armed = await waitUntil(
    () => page.locator(sel(toTestId)).getAttribute('data-drop-active').then((v) => v === 'true'),
    { timeoutMs: 5_000 },
  )
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, sel(toTestId))
  return armed
}

/**
 * The order the TREE is drawing, narrowed to this run's rows.
 *
 * `querySelectorAll` answers in document order, which for a column of siblings
 * is the order a person reads them in — the same question they are answering by
 * looking at it. Filtering to `mine` is what keeps this off everybody else's
 * data on the shared database, and it is also why the `tree-folder-` prefix is
 * safe to use here although `tree-folder-children-<id>` lives under it: an id
 * that is not one of ours never survives the filter.
 */
const renderedOrder = (page, prefix, mine) =>
  page.evaluate(
    ({ prefix, mine }) =>
      [...document.querySelectorAll(`[data-testid^="${prefix}"]`)]
        .map((el) => el.getAttribute('data-testid').slice(prefix.length))
        .filter((id) => mine.includes(id)),
    { prefix, mine },
  )

let browser = null
let ctx = null
let sql = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  const api = apiClient(`${B}/api/v1`, auth.accessToken)

  const wsRes = await api('/workspaces')
  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call here is read off `status` rather than wrapped in a catch.
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const WS = ((wsRes.data ?? [])[0]?.workspace ?? (wsRes.data ?? [])[0])?.id
  if (!WS) throw new Error('this account can see no workspace')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the stored order is read back from `position` directly')

  const post = async (route, body, what) => {
    const res = await api(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data
  }

  // ── the fixture: three projects under a space, two folders, three lists ────
  const space = await post('/spaces', { workspaceId: WS, name: `Space ${TAG}` }, 'the space')
  const folderA = await post(`/spaces/${space.id}/folders`, { name: `FolderA ${TAG}` }, 'folder A')
  const folderB = await post(`/spaces/${space.id}/folders`, { name: `FolderB ${TAG}` }, 'folder B')
  const P = []
  for (let i = 0; i < 3; i++) {
    P.push(await post('/projects', { spaceId: space.id, name: `P${i} ${TAG}` }, `project ${i}`))
  }
  const L = []
  for (let i = 0; i < 3; i++) {
    L.push(await post('/lists', { projectId: P[0].id, name: `L${i} ${TAG}` }, `list ${i}`))
  }
  const projectIds = P.map((p) => p.id)
  const listIds = L.map((l) => l.id)
  const folderIds = [folderA.id, folderB.id]

  // ==========================================================================
  console.log('\n▶ §V2-S13 — the endpoint that gives `projects.position` a writer')

  /*
   * THE BASELINE IS SET, NOT OBSERVED. Three projects made in a row all carry
   * `position = 0` and would be ordered by `createdAt`, which can tie inside
   * one millisecond once it is serialised to JSON — a baseline that is a race
   * is a flake wearing an assertion's clothes. So the order is written first,
   * through the endpoint under test, and the first check is that the endpoint
   * answers with what it STORED rather than echoing what it was handed.
   */
  const seeded = await api(`/workspaces/${WS}/sidebar/reorder`, {
    method: 'POST',
    body: { kind: 'project', containerKind: 'space', containerId: space.id, orderedIds: projectIds },
  })
  chk(
    seeded.status < 300 && JSON.stringify(seeded.data?.orderedIds) === JSON.stringify(projectIds),
    'POST /workspaces/:id/sidebar/reorder stores an order and answers with the stored one',
    `answered ${seeded.status} with ${JSON.stringify(seeded.data ?? seeded.error)} — sent ` +
      `${JSON.stringify(projectIds)}`,
  )

  const seededRows = await sql`select id, position from projects where id = any(${projectIds})`
  const seededMap = new Map(seededRows.map((r) => [r.id, r.position]))
  chk(
    projectIds.every((id, i) => seededMap.get(id) === i),
    'and the positions in the database are 0,1,2 — contiguous, not merely different',
    `positions were ${JSON.stringify(projectIds.map((id) => seededMap.get(id)))}; a reorder that ` +
      'leaves gaps or duplicates has not put the siblings in an order, it has disturbed one',
  )

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
  const page = await ctx.newPage()

  /*
   * Every reorder and every move the browser asks for, WITH ITS BODY. This is
   * the only way to tell "the server was told" apart from "the tree rearranged
   * itself on screen" — and that distinction is the whole defect a drag handler
   * can have. A tree that redraws optimistically and posts nothing photographs
   * exactly like one that works, until the next page load.
   */
  const reorders = []
  const moves = []
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname
    if (r.method() !== 'POST') return
    if (/\/sidebar\/reorder$/.test(p) || /\/lists\/project\/[^/]+\/reorder$/.test(p)) {
      reorders.push({ path: p, body: r.postData() ?? '' })
    }
    if (/\/(projects|lists)\/[^/]+\/move$/.test(p)) moves.push({ path: p, body: r.postData() ?? '' })
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 25_000 })
  await page.getByTestId(`tree-project-${P[0].id}`).waitFor({ timeout: 25_000 })

  /*
   * THE READER, asked as its own check. Before this row the tree drew whatever
   * order Postgres returned, so "the sidebar shows them in the stored order"
   * was not a thing that could be true — and every reorder check below would
   * have been measuring a write nothing consumed.
   */
  chk(
    await waitUntil(
      async () => JSON.stringify(await renderedOrder(page, 'tree-project-', projectIds)) === JSON.stringify(projectIds),
      { timeoutMs: 20_000 },
    ),
    'the tree draws the projects in the order the server stored',
    `the tree drew ${JSON.stringify(await renderedOrder(page, 'tree-project-', projectIds))} for a ` +
      `stored ${JSON.stringify(projectIds)} — the sort that reads \`position\` is gone, so the ` +
      'column is a write nothing consumes',
  )

  // ==========================================================================
  console.log('\n▶ §V2-S13 — dragging a project to the top of its space')

  const wantProjects = [projectIds[2], projectIds[0], projectIds[1]]
  const beforeProjectReorders = reorders.length
  const armedTop = await html5DragTo(page, `tree-project-${P[2].id}`, `tree-gap-project-${space.id}-0`)
  chk(
    armedTop,
    'the strip above the first project arms while a project is over it',
    'the gap never said it would take the drop, so no request was ever going to be sent — ' +
      'this is the shape of the bug where the client refuses before the endpoint is reached',
  )
  chk(
    await waitUntil(
      () =>
        reorders
          .slice(beforeProjectReorders)
          .some((r) => r.path.endsWith('/sidebar/reorder') && r.body.includes(JSON.stringify(wantProjects).slice(1, -1))),
      { timeoutMs: 15_000 },
    ),
    'dropping it sends the new order to the server, in full',
    'no reorder carrying the new order left the browser. Reorders sent during this drag: ' +
      `${JSON.stringify(reorders.slice(beforeProjectReorders))} (none = the drop never fired or the ` +
      `tree only rearranged itself on screen). Wanted the ids ${JSON.stringify(wantProjects)}`,
  )
  chk(
    await waitUntil(async () => {
      const rows = await sql`select id, position from projects where id = any(${projectIds})`
      const m = new Map(rows.map((r) => [r.id, r.position]))
      return wantProjects.every((id, i) => m.get(id) === i)
    }, { timeoutMs: 15_000 }),
    'and the server kept it — the stored positions are the new order',
    'the database still has the old order. Reorders sent during this drag: ' +
      `${JSON.stringify(reorders.slice(beforeProjectReorders))} (one present but the order unchanged ` +
      '= the endpoint ignored the body)',
  )

  /*
   * AND THE TREE REDRAWS IT, after a FULL document load. The database check
   * above passes the instant the API returns, while the column on screen may
   * still be showing the old arrangement — which is exactly the gap the
   * one-way drag bug hid in. The reload also forces the cache miss BY
   * CONSTRUCTION: a new document builds a new query client, so `staleTime:
   * 30_000` cannot serve the order fetched a moment ago. Waiting thirty
   * seconds would be a bet on the clock.
   */
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 25_000 })
  chk(
    await waitUntil(
      async () => JSON.stringify(await renderedOrder(page, 'tree-project-', projectIds)) === JSON.stringify(wantProjects),
      { timeoutMs: 20_000 },
    ),
    'and the tree redraws the new order on a fresh load',
    `after reloading, the tree drew ${JSON.stringify(await renderedOrder(page, 'tree-project-', projectIds))} ` +
      `where ${JSON.stringify(wantProjects)} was stored — the arrangement is invisible until ` +
      'something else refetches',
  )

  // ==========================================================================
  console.log('\n▶ §V2-S13 — lists keep the reorder route they already had')

  await page.getByTestId(`project-toggle-${P[0].id}`).click({ timeout: 25_000 })
  await page.getByTestId(`tree-list-${L[0].id}`).waitFor({ timeout: 20_000 })
  // All three, not just the first: reading the order out of a half-drawn
  // column and then asserting the result of moving within it is the race
  // `waitForCount` exists for.
  await waitUntil(async () => (await renderedOrder(page, 'tree-list-', listIds)).length === 3, { timeoutMs: 20_000 })
  const drawnLists = await renderedOrder(page, 'tree-list-', listIds)
  const wantLists = [drawnLists[2], drawnLists[0], drawnLists[1]]
  const beforeListReorders = reorders.length
  const armedList = await html5DragTo(page, `tree-list-${drawnLists[2]}`, `tree-gap-list-${P[0].id}-0`)
  chk(armedList, 'the strip above the first list arms while a list is over it', 'the list gap never armed')
  chk(
    await waitUntil(
      () =>
        reorders
          .slice(beforeListReorders)
          .some((r) => /\/lists\/project\/[^/]+\/reorder$/.test(r.path) && r.body.includes(wantLists[0])),
      { timeoutMs: 15_000 },
    ),
    'a list reorder goes to `POST /lists/project/:id/reorder`, not to a second writer for the same column',
    'nothing reached the lists reorder route. Reorders sent during this drag: ' +
      `${JSON.stringify(reorders.slice(beforeListReorders))}`,
  )
  chk(
    await waitUntil(async () => {
      const rows = await sql`select id, position from lists where id = any(${listIds})`
      const m = new Map(rows.map((r) => [r.id, r.position]))
      return wantLists.every((id, i) => m.get(id) === i)
    }, { timeoutMs: 15_000 }),
    'and the lists are stored in the new order',
    'the lists did not move. Reorders sent during this drag: ' +
      `${JSON.stringify(reorders.slice(beforeListReorders))}`,
  )

  // ==========================================================================
  console.log('\n▶ §V2-S13 — folders reorder too, and cannot re-parent')

  await waitUntil(async () => (await renderedOrder(page, 'tree-folder-', folderIds)).length === 2, { timeoutMs: 20_000 })
  const drawnFolders = await renderedOrder(page, 'tree-folder-', folderIds)
  const wantFolders = [drawnFolders[1], drawnFolders[0]]
  const beforeFolderReorders = reorders.length
  const armedFolder = await html5DragTo(page, `tree-folder-${drawnFolders[1]}`, `tree-gap-folder-${space.id}-0`)
  chk(armedFolder, 'the strip above the first folder arms while a folder is over it', 'the folder gap never armed')
  chk(
    await waitUntil(async () => {
      const rows = await sql`select id, position from folders where id = any(${folderIds})`
      const m = new Map(rows.map((r) => [r.id, r.position]))
      return wantFolders.every((id, i) => m.get(id) === i)
    }, { timeoutMs: 15_000 }),
    'dragging a folder above its sibling stores the swap',
    'the folders did not swap. Reorders sent during this drag: ' +
      `${JSON.stringify(reorders.slice(beforeFolderReorders))}`,
  )

  /*
   * A FOLDER IS DRAGGABLE ONLY FOR THE STRIPS. `canDropOn` answers `false` for
   * every ROW target when a folder is in flight, and it has to say so
   * explicitly: the moment `folder` joined the drag union it would otherwise
   * have fallen through the list branch, been accepted on a project row, and
   * posted to `/lists/<folderId>/move` — a real route, a 404 id.
   */
  const beforeFolderMoves = moves.length
  await html5DragTo(page, `tree-folder-${folderIds[0]}`, `tree-project-${P[0].id}`)
  chk(
    moves.slice(beforeFolderMoves).length === 0,
    'and a folder dropped on a project sends nothing — there is no route that re-parents one',
    `a folder drop produced ${JSON.stringify(moves.slice(beforeFolderMoves))}; ` +
      '`/lists/<folderId>/move` is a real route and a folder id is not a list',
  )

  /*
   * AND THE PERMISSION, NOT ONLY THE REFUSAL. The check above says a folder on
   * a project row sends nothing. Nothing said a LIST on a project row sends
   * something — so `canDropOn`'s entire list rule,
   *
   *     if (dragItem.kind === 'list') return target.kind === 'project'
   *
   * could be deleted and all 21 checks stayed green. That was found by a break
   * patch aimed at something else: `sidebar-reorder-6` meant to model a folder
   * FALLING THROUGH into this rule, and modelled deleting the rule instead, so
   * folders still hit `return false`, the behaviour it claimed to break was
   * unchanged, and the only thing it really broke had no check on it.
   *
   * A refusal asserted without its permission is half a rule. The half with no
   * check is the half that can be deleted.
   */
  const beforeListOnProject = moves.length
  const movedList = drawnLists[0]
  const armedListRow = await html5DragTo(page, `tree-list-${movedList}`, `tree-project-${P[1].id}`)
  chk(
    armedListRow,
    'a list dropped ON a project row is accepted',
    'the project row refused a list — `canDropOn` permits exactly this, and without the drop ' +
      'there is no way to move a list between projects from the tree at all',
  )
  chk(
    await waitUntil(async () => {
      const [row] = await sql`select project_id from lists where id = ${movedList}`
      return row?.project_id === P[1].id
    }, { timeoutMs: 20_000 }),
    'and it lands in that project',
    'the list did not re-parent. Sent during this drag: ' +
      `${JSON.stringify(moves.slice(beforeListOnProject))} (no move = the drop was accepted and ` +
      'then did nothing, which is the facade; a move with no re-parent = the route was called ' +
      'with the wrong body)',
  )

  // ==========================================================================
  console.log('\n▶ §V2-S13 — the strip is keyed on the KIND, never on a stale parent')

  /*
   * THE CHECK THAT NAMES THE OLD BUG. A list in flight must NOT arm a project
   * strip: the predicate asks "can an item of this kind be ordered here", and
   * nothing else. If it ever asks where the dragged item currently lives it
   * will be answering from tree data that is a refetch behind, and the refusal
   * will happen in the browser with no request sent — silently.
   */
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    window.__dt = new DataTransfer()
    el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, `[data-testid="tree-list-${listIds[0]}"]`)
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: window.__dt, bubbles: true, cancelable: true }))
  }, `[data-testid="tree-gap-project-${space.id}-0"]`)
  /*
   * BOUNDED, WITH THE STRIP'S EXISTENCE REQUIRED ALONGSIDE.
   *
   * The check below asserts a NEGATIVE — the project strip did not arm for a
   * list in flight. Unbounded, an absent strip threw and ended the section;
   * caught, `null !== 'true'` is TRUE and the check passes on a tree that
   * never drew the strip at all, which is a strictly worse failure than the
   * one it was written to catch. So the strip being THERE is measured and
   * carried in: it is the thing the drag is over.
   */
  const wrongKindStrip = await page
    .locator(`[data-testid="tree-gap-project-${space.id}-0"]`)
    .count()
  const wrongKindArmed = await page
    .locator(`[data-testid="tree-gap-project-${space.id}-0"]`)
    .getAttribute('data-drop-active', { timeout: 8000 })
    .catch(() => null)
  chk(
    wrongKindStrip === 1 && wrongKindArmed !== 'true',
    'a list over a project strip does not arm it',
    'the project strip armed for a list — the strip accepts anything in flight, so the ' +
      'next drop would reorder a container with an id that is not one of its children',
  )
  await page.evaluate(() => document.querySelector('[data-dragging="true"]')?.dispatchEvent(
    new DragEvent('dragend', { bubbles: true }),
  ))

  /*
   * AND THE OTHER DIRECTION: a project dragged from the space into a FOLDER's
   * strip has to land, although the tree still believes it lives under the
   * space. This is the drag-out bug read forwards — the gesture must move it
   * AND place it, rather than refuse because the client is one request behind.
   */
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 25_000 })
  await page.getByTestId(`tree-folder-${folderIds[0]}`).waitFor({ timeout: 20_000 })
  // Something has to already be in the folder for it to have a strip at all.
  const seedMove = await api(`/projects/${P[1].id}/move`, {
    method: 'POST',
    body: { spaceId: space.id, folderId: folderIds[0] },
  })
  chk(seedMove.status < 300, 'a project can be put in a folder to give it a strip', `move answered ${seedMove.status}`)
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  // ONE options object. The rule-five pass appended `{ timeout: 8000 }` to a
  // call that already carried `{ timeout: 25_000 }`, and Playwright's `click`
  // takes a single argument — so the second was silently ignored. Harmless at
  // runtime and wrong on the page, which is the kind of thing a mechanical
  // transform produces when it appends instead of merging.
  await page.getByTestId(`space-toggle-${space.id}`).click({ timeout: 25_000 }).catch(() => {})
  // And the gate under it, which that same pass left throwing: the press above
  // is allowed to fail, so this cannot be the line that ends the section.
  await page.getByTestId(`tree-gap-project-${folderIds[0]}-0`).waitFor({ timeout: 20_000 }).catch(() => {})

  const beforeCross = { moves: moves.length, reorders: reorders.length }
  const armedCross = await html5DragTo(page, `tree-project-${P[2].id}`, `tree-gap-project-${folderIds[0]}-0`)
  chk(
    armedCross,
    "a folder's strip arms for a project that is not in that folder yet",
    'the strip refused a project the client believes lives elsewhere — this is the stale-parentId ' +
      'refusal, and it sends no request at all',
  )
  chk(
    await waitUntil(async () => {
      const [row] = await sql`select folder_id, position from projects where id = ${P[2].id}`
      return row?.folder_id === folderIds[0] && row?.position === 0
    }, { timeoutMs: 20_000 }),
    'and the drop both moves it in and places it first',
    'the project is not first inside that folder. Sent during this drag — moves: ' +
      `${JSON.stringify(moves.slice(beforeCross.moves))}, reorders: ` +
      `${JSON.stringify(reorders.slice(beforeCross.reorders))} (no move = it was never re-parented; ` +
      'a move with no reorder = it landed at whatever position it happened to carry)',
  )
  chk(
    await waitUntil(async () => {
      const inFolder = page.locator(
        `[data-testid="tree-folder-children-${folderIds[0]}"] [data-testid="tree-project-${P[2].id}"]`,
      )
      return (await inFolder.count()) === 1
    }, { timeoutMs: 20_000 }),
    'and the tree redraws it inside that folder',
    'the database moved and the tree did not',
  )

  // ==========================================================================
  console.log('\n▶ §V2-S13 — the endpoint refuses in its own words')

  /*
   * TWO REFUSALS, ONE STATUS CODE. "An id that is not in this container" and
   * "you left a sibling out" are both 400, and a check that only reads the
   * status cannot tell a mis-addressed container from a stale tree. So each
   * asserts the SENTENCE.
   */
  const stray = await api(`/workspaces/${WS}/sidebar/reorder`, {
    method: 'POST',
    body: {
      kind: 'project',
      containerKind: 'space',
      containerId: space.id,
      orderedIds: [...projectIds.filter((id) => id !== P[2].id), folderIds[0]],
    },
  })
  chk(
    stray.status === 400 && /are not projects of space/.test(JSON.stringify(stray.data ?? stray.error ?? '')),
    'a stranger in the order is refused, and the refusal names it',
    `answered ${stray.status}: ${JSON.stringify(stray.data ?? stray.error)}`,
  )
  /*
   * Aimed at the FOLDER, which by now holds two projects. Aiming it at the
   * space would have been the vacuous version: after the moves above the space
   * has exactly one project left, so a one-id "partial" order is the complete
   * order and the endpoint would rightly accept it — a check that passes
   * because the case it names cannot arise.
   */
  const short = await api(`/workspaces/${WS}/sidebar/reorder`, {
    method: 'POST',
    body: { kind: 'project', containerKind: 'folder', containerId: folderIds[0], orderedIds: [P[1].id] },
  })
  chk(
    short.status === 400 && /exactly once/.test(JSON.stringify(short.data ?? short.error ?? '')),
    'and a partial order is refused with a DIFFERENT sentence, not the same 400',
    `answered ${short.status}: ${JSON.stringify(short.data ?? short.error)} — two mechanisms that ` +
      'produce one status code have to be told apart by their message',
  )
  const foreign = await api(`/workspaces/${WS}/sidebar/reorder`, {
    method: 'POST',
    body: { kind: 'project', containerKind: 'folder', containerId: WS, orderedIds: [] },
  })
  chk(
    foreign.status === 404,
    'and a container id that is not a folder is a 404, not an empty success',
    `answered ${foreign.status}: ${JSON.stringify(foreign.data ?? foreign.error)}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * Only this run's rows, children first — every fixture above carries the tag,
   * so nothing belonging to another suite on the shared database is touched.
   */
  if (sql) {
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from folders where name like ${'%' + TAG}`.catch(() => {})
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
