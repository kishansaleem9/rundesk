/**
 * §V2-S06 frame `05:50` — THE THREAD ON A COMMENT.
 *
 * The frame, read off the pixels rather than off a summary of them:
 *
 *     Thread by Hamda Tahir
 *     ────────────────────────────────────────
 *     [the comment, with its clip]
 *     👍 🎉 ❤️                       ← the comment's reactions, in the thread
 *     [replies]
 *     ────────────────────────────────────────
 *     [ Reply to comment…                    ]
 *
 * WHAT THIS IS NOT ABOUT. Replies have nested inline under their root comment
 * for a long time and `parentCommentId` has been stored for longer, so the
 * data path is not new and this suite does not re-prove it. What the frame has
 * and the inline list does not is a PLACE that is about one comment: headed by
 * whose comment it is, carrying that comment's own reactions, with a composer
 * that can only ever answer this thread. In the list, the composer at the
 * bottom of the page answers whichever comment you last pressed Reply on.
 *
 * SO THE CHECK THAT MATTERS IS THE PARENT, READ OFF POSTGRES. A panel that
 * looks like the frame and posts a root comment is the facade this audit names
 * first, and on screen the two are identical: the reply appears in the panel
 * either way, because the panel is showing the comment list it just refetched.
 * Only the `parent_comment_id` column tells them apart.
 *
 * AND THE ONE THAT MATTERS NEXT is the reaction row. The frame draws it inside
 * the thread; three buttons that light up and record nothing would pass every
 * screenshot, so the row is pressed and the row in `task_comment_reactions` is
 * read. The first draft of this suite queried `comment_reactions`, which does
 * not exist, and reported a working reaction row as a button that stores
 * nothing — the fixture failing in the product's voice.
 *
 * ITS OWN FIXTURES: a workspace this run makes, one task, two comments — one
 * answered, one untouched, because starting a thread on a comment nobody has
 * replied to is the case a control hung off the replies count would lose.
 *
 *   node test/e2e/comment-thread.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 13

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
let ran = 0
const check = (cond, good, bad) => {
  ran += 1
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-thread-${Date.now()}`
const ROOT_BODY = `Root comment ${TAG}`
const LONE_BODY = `Unanswered comment ${TAG}`
const SEEDED_REPLY = `Seeded reply ${TAG}`
const NEW_REPLY = `Answered in the thread ${TAG}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  if (!me?.id) throw new Error('could not read the signed-in user')

  const made = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG}` } })
  const workspaceId = made.data?.id
  if (!workspaceId) throw new Error(`could not create a workspace: ${JSON.stringify(made.error)}`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the parent and the reaction are read off the rows')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Thread subject ${TAG}`}) returning id`

  /*
   * THE COMMENTS GO IN THROUGH THE API, not through SQL, because the author is
   * the fact the panel's header is about and the route is what sets it. A row
   * inserted by hand with a `user_id` column filled in would prove the header
   * can render a name and nothing about whether the product puts the right one
   * there.
   */
  const post = async (body, parentCommentId) => {
    const r = await A(`/tasks/${task.id}/comments`, { method: 'POST', body: { body, parentCommentId } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not post a comment: ${r.status}`)
    return r.data.id
  }
  const rootId = await post(ROOT_BODY)
  await post(SEEDED_REPLY, rootId)
  const loneId = await post(LONE_BODY)

  const MY_NAME = me.displayName || me.email

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
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.getByTestId('task-tab-comments').click({ timeout: 25_000 })
  await settleCookies()

  // ══ 1. THE WAY IN ═════════════════════════════════════════════════════════
  console.log('\n▶ frame `05:50` — a comment has a thread to open')

  const opener = page.getByTestId(`comment-thread-open-${rootId}`)
  const openerThere = await waitUntil(() => opener.isVisible().catch(() => false), { timeoutMs: 25_000 })
  check(
    openerThere,
    'a root comment offers a way into its thread',
    'no thread control on the comment — the frame\'s panel is reachable from the comment it is about ' +
      'or it is reachable from nowhere',
  )
  // Bounded and caught: the check above is allowed to find the control absent,
  // and an unbounded press on a missing one is thirty seconds and a throw that
  // would take every check below it.
  await opener.click({ timeout: 10_000 }).catch(() => {})
  const panelOpen = await waitUntil(
    () => page.getByTestId('comment-thread-panel').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  check(panelOpen, 'and pressing it opens a thread panel', 'nothing opened')

  // ══ 2. WHAT THE PANEL SAYS IT IS ══════════════════════════════════════════
  console.log('\n▶ and the panel is headed by WHOSE comment it is')

  const title = panelOpen ? (await readText(page.getByTestId('comment-thread-title').filter({ visible: true }))).trim() : ''
  check(
    title.includes(MY_NAME) && /thread/i.test(title),
    'the header reads "Thread by <name>", with the comment author\'s real name in it',
    `the header read "${title}" for a comment written by "${MY_NAME}" — a panel headed just ` +
      '"Thread" is the same panel with the one fact that orients you taken out',
  )
  const rootText = panelOpen ? await readText(page.getByTestId('comment-thread-root').filter({ visible: true })) : ''
  check(
    rootText.includes(ROOT_BODY),
    'and the comment itself is in the panel, not just its replies',
    `the panel's root block read "${rootText.slice(0, 120)}" — the frame draws the comment at the ` +
      'top of its own thread',
  )
  const repliesText = panelOpen ? await readText(page.getByTestId('comment-thread-replies').filter({ visible: true })).catch(() => '') : ''
  check(
    repliesText.includes(SEEDED_REPLY),
    'with the replies it already has under it',
    `the replies block read "${repliesText.slice(0, 120)}"`,
  )

  // ══ 3. THE REACTIONS, WHICH THE FRAME PUTS INSIDE THE THREAD ══════════════
  console.log('\n▶ the comment\'s reactions are in the thread, and they record')

  const reactionsThere = panelOpen
    ? (await page.getByTestId('comment-thread-reactions').count()) === 1
    : false
  await page.getByTestId('comment-thread-react-🎉').click({ timeout: 10_000 }).catch(() => {})
  const reacted = await waitUntil(
    async () => {
      const rows = await sql`
        select emoji from task_comment_reactions where comment_id = ${rootId} and user_id = ${me.id}`
      return rows.some((r) => r.emoji === '🎉')
    },
    { timeoutMs: 15_000 },
  )
  check(
    reactionsThere && reacted,
    'pressing a reaction in the thread really records one against THIS comment',
    reactionsThere
      ? 'no reaction row for this comment reached the database — three buttons that light up and ' +
        'store nothing pass every screenshot of this frame'
      : 'the panel has no reaction row at all, so nothing here was measured',
  )

  // ══ 4. THE COMPOSER, AND WHERE ITS REPLY LANDS ════════════════════════════
  console.log('\n▶ the composer says what it is for, and its reply lands on this comment')

  const placeholder = panelOpen
    ? await page.getByTestId('comment-thread-composer').getAttribute('placeholder', { timeout: 8000 }).catch(() => null)
    : null
  check(
    placeholder === 'Reply to comment…',
    'the composer carries the frame\'s own words, "Reply to comment…"',
    `the placeholder read ${JSON.stringify(placeholder)} — the frame's composer says what it answers, ` +
      'which is the thing the page composer cannot say',
  )

  await page.getByTestId('comment-thread-composer').fill(NEW_REPLY, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-thread-send').click({ timeout: 10_000 }).catch(() => {})

  /*
   * THE CHECK A FACADE CANNOT PASS. On screen a reply posted as a ROOT comment
   * and a reply posted as a child look the same in this panel, because the
   * panel is drawing a list it just refetched. `parent_comment_id` is the only
   * thing that tells them apart, so it is what is read.
   */
  const parentOf = async () => {
    const rows = await sql`
      select id, parent_comment_id from task_comments where body = ${NEW_REPLY} limit 1`
    return rows[0] ?? null
  }
  const landed = await waitUntil(async () => (await parentOf())?.parent_comment_id === rootId, { timeoutMs: 20_000 })
  const row = await parentOf()
  check(
    landed,
    'the reply is stored as a child of the comment the panel is about',
    row
      ? `the reply exists with parent_comment_id=${JSON.stringify(row.parent_comment_id)} where ` +
        `${JSON.stringify(rootId)} was the thread — a composer inside a thread that posts a ROOT ` +
        'comment is the facade this frame is most likely to get'
      : 'no comment with that body reached the database at all',
  )
  check(
    await waitUntil(
      async () => (await readText(page.getByTestId('comment-thread-panel').filter({ visible: true }))).includes(NEW_REPLY),
      { timeoutMs: 15_000 },
    ),
    'and it appears in the thread without leaving it',
    'the reply was stored and the panel did not show it — a thread you have to reload to read is ' +
      'the page you already had',
  )

  // ══ 5. THE WAY BACK, AND THE COUNT THAT FOLLOWS ═══════════════════════════
  console.log('\n▶ the way back, and the list knows what happened')

  await page.getByTestId('comment-thread-back').click({ timeout: 10_000 }).catch(() => {})
  const backOnList = await waitUntil(
    async () =>
      (await page.getByTestId('comment-thread-panel').count()) === 0 &&
      (await page.getByTestId(`comment-thread-open-${rootId}`).isVisible().catch(() => false)),
    { timeoutMs: 15_000 },
  )
  check(
    backOnList,
    'the header\'s back control returns to the comment list',
    'the panel would not close — a thread that replaces the list and cannot be left is a trap, ' +
      'not a panel',
  )
  const listText = backOnList ? await readText(page.locator('[data-comment-id]').first().filter({ visible: true })) : ''
  check(
    listText.includes('2 replies'),
    'and the list counts the reply that was written in the thread',
    `the root comment's row read "${listText.replace(/\s+/g, ' ').slice(0, 140)}" — a count that does ` +
      'not follow a reply written one panel away is a number about the past',
  )

  // ══ 6. THE CASE A CONTROL ON THE COUNT WOULD LOSE ═════════════════════════
  console.log('\n▶ and a comment nobody has answered can still start one')

  await page.getByTestId(`comment-thread-open-${loneId}`).click({ timeout: 10_000 }).catch(() => {})
  const loneOpen = await waitUntil(
    async () =>
      (await page.getByTestId('comment-thread-panel').getAttribute('data-root-comment-id').catch(() => null)) === loneId,
    { timeoutMs: 15_000 },
  )
  check(
    loneOpen,
    'a comment with no replies opens a thread of its own',
    'no thread opened on the unanswered comment — hanging the control off the replies count makes ' +
      'the first reply the one you cannot write there',
  )
  check(
    loneOpen && (await page.getByTestId('comment-thread-composer').isVisible().catch(() => false)),
    'and it has the composer, so the first reply can be written in it',
    'the empty thread drew no composer',
  )
} catch (e) {
  failed += 1
  ran += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close?.().catch(() => {})
  await stack?.close?.()
  await sql?.end?.().catch(() => {})
}

if (ran !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${ran} checks, expected ${EXPECTED_CHECKS}`)
  failed += 1
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
