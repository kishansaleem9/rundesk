/**
 * §V2-S06 — SAVE A COMMENT, frame `05:55`.
 *
 * The frame's hover row is react · reply · assign · save · more, and the
 * narration at [05:47]–[06:02] says what kind of thing the save is:
 * "reply/thread, assign, save — same like messages". Rundesk already had the
 * first two on a comment and the third on a chat message; a comment could not
 * be saved at all.
 *
 * WHERE A SAVED COMMENT GOES is not a free choice. §2.2 already put saved chat
 * messages in the Inbox's **Later** tab ("Later mein SAVED messages show hote
 * hain"), and ClickUp's own answer is the same tab — "hover over the comment or
 * message and click the bookmark icon … it will be added to the Later tab in
 * your Inbox". So this suite does not stop at "the row exists": it follows the
 * save to Later and back to the sentence it was made on.
 *
 * THE THREE WAYS THIS FEATURE IS USUALLY A FACADE, each checked here:
 *   1. the button stores nothing — checked against the table, not the icon;
 *   2. the button stores something nobody reads back — so the page is RELOADED
 *      and the control has to still read Saved;
 *   3. the bookmark cannot be found again — so the Later tab is opened, the row
 *      clicked, and the comment has to be the one marked on arrival.
 *
 * AND ONE THING IT MUST NOT BE: shared. A bookmark is private, so a colleague
 * saving the same comment must not be able to see mine, in either direction.
 *
 *   node test/e2e/save-comment.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 13

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PEER = {
  email: process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal',
  password: process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!',
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-savecmt-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite checks the save against the table')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Save subject ${TAG}`}) returning id`

  /*
   * The comment to save, and a REPLY under it. The reply is not decoration: the
   * comment action row is rendered twice in the sheet, once for roots and once
   * for replies, and a save added to only the first is a control that exists on
   * half the comments in a thread.
   */
  const me = (await A('/users/me')).data
  /*
   * The two bodies share no substring. `reply worth keeping <tag>` CONTAINED
   * `worth keeping <tag>`, so "the root is gone from Later" could be satisfied
   * — or defeated — by the reply. A fixture that contains the other fixture is
   * how a check stops being about what it names.
   */
  const BODY = `worth keeping ${TAG}`
  const REPLY_BODY = `a follow-up ${TAG}`
  const rootPost = await A(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: BODY } })
  const commentId = rootPost.data?.id
  const replyPost = await A(`/tasks/${task.id}/comments`, {
    method: 'POST',
    body: { body: REPLY_BODY, parentCommentId: commentId },
  })
  const replyId = replyPost.data?.id
  if (!commentId || !replyId) throw new Error(`could not seed comments: ${rootPost.status}/${replyPost.status}`)

  const savedRows = (id) => sql`
    select count(*)::int c from task_comment_saves
    where comment_id = ${id} and user_id = ${me.id}`

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

  const openComments = async (search = `?task=${task.id}`) => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}${search}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settleCookies()
    /*
     * WAIT for the tab, then click it — never `if (visible) click`. The sheet
     * takes a moment to mount, so a conditional click silently skips, the panel
     * never opens, and the first check reads as "the product has no Save".
     * That is how this suite failed the first time it ran.
     */
    const tab = page.getByTestId('task-tab-comments')
    const ready = await waitUntil(() => tab.isVisible().catch(() => false), { timeoutMs: 25_000 })
    if (!ready) throw new Error('the task sheet never showed its Comments tab')
    await tab.click({ timeout: 25_000 })
    await settleCookies()
  }

  await openComments()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `05:55` — the comment hover row has a Save')

  const saveBtn = page.getByTestId(`comment-save-${commentId}`)
  chk(
    await waitUntil(() => saveBtn.isVisible().catch(() => false), { timeoutMs: 20_000 }),
    'a comment carries a Save control',
    'no Save on a comment — the frame\'s fourth hover action is missing',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and pressing it STORES something')

  await saveBtn.click()

  /*
   * THE TOAST FIRST, and not for tidiness: a toast auto-dismisses, so asserting
   * it after a twenty-second database poll makes this check fail for a reason
   * that has nothing to do with the toast. Break-testing the facade is what
   * showed that up — the row never arrived, the poll ran its full timeout, and
   * this read "" on a build whose toast was fine.
   *
   * WHAT IT HAS TO SAY. A bookmark you cannot find again is the same as no
   * bookmark, and "Saved" alone does not name Inbox › Later.
   */
  const toastText = await waitUntil(
    async () => (await readText(page.locator('[data-sonner-toast]').first())).includes('Later'),
    { timeoutMs: 10_000 },
  )
  chk(
    toastText,
    'the toast says where to find it again — Inbox › Later',
    `the toast read "${await readText(page.locator('[data-sonner-toast]').first())}" — ` +
      'it does not tell you which tab the comment went to',
  )

  /*
   * And against the table, not the icon. A button that turns blue and writes
   * nothing is this codebase's named facade, and the icon is exactly what such
   * a button gets right.
   */
  chk(
    await waitUntil(async () => (await savedRows(commentId))[0].c === 1, { timeoutMs: 20_000 }),
    'and the save reaches the database',
    'the button changed and no row was written — the facade',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the state SURVIVES A RELOAD')

  /*
   * The mirror of the facade: a save the server stores that no reader honours.
   * After a reload nothing is left of the click but what the API returns, so
   * this is the check that `savedByMe` is really being read.
   */
  await openComments()
  const afterReload = await waitUntil(async () => {
    const label = await readText(page.getByTestId(`comment-save-${commentId}`))
    return label.trim().toLowerCase() === 'saved'
  }, { timeoutMs: 20_000 })
  chk(
    afterReload,
    'a reload still shows the comment as saved',
    `after reload the control reads "${await readText(page.getByTestId(`comment-save-${commentId}`))}" — ` +
      'the save is stored and never read back',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ Inbox › Later is where it turns up')

  await page.goto(`${stack.base}/app/${workspaceId}/inbox?view=later`, { waitUntil: 'domcontentloaded' })
  await settleCookies()
  const inLater = await waitUntil(
    async () => (await readText(page.getByTestId('later-saved-comments'))).includes(BODY),
    { timeoutMs: 20_000 },
  )
  chk(
    inLater,
    'the Later tab lists the saved comment',
    'the comment is saved and Later does not show it — which is where §2.2 put ' +
      'saved messages and where ClickUp puts saved comments',
  )

  /*
   * AND ONLY THERE. If the section rendered in every bucket, the check above
   * would pass on a build that had simply put the list on the page.
   */
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await settleCookies()
  /*
   * ANCHOR FIRST. An absence asserted against a page that has not rendered yet
   * is satisfied by the loading spinner, and passes on a build that does render
   * the section in every bucket. So wait for the Inbox's own controls, THEN
   * look for the section.
   */
  const inboxReady = await waitUntil(
    () => page.getByTestId('inbox-controls').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  if (!inboxReady) throw new Error('the Inbox tab never rendered its controls')
  const strayInInbox = await waitUntil(
    () => page.getByTestId('later-saved-comments').isVisible().catch(() => false),
    { timeoutMs: 4_000 },
  )
  chk(
    !strayInInbox,
    'and the Inbox tab does not — Later is a bucket, not a banner',
    'saved comments render in the Inbox tab too, so the Later check proves nothing',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ clicking the row lands on THE COMMENT, not just the task')

  await page.goto(`${stack.base}/app/${workspaceId}/inbox?view=later`, { waitUntil: 'domcontentloaded' })
  await settleCookies()
  await page.getByTestId(`saved-comment-${commentId}`).click({ timeout: 25_000 })
  chk(
    await waitUntil(() => page.url().includes(`comment=${commentId}`), { timeoutMs: 15_000 }),
    'the link carries the comment, not only the task',
    `landed on ${page.url()} — a saved comment that opens a busy thread at the ` +
      'top is most of the way back to not having saved it',
  )
  const focusedText = await waitUntil(
    async () => (await readText(page.getByTestId('comment-focused'))).includes(BODY),
    { timeoutMs: 20_000 },
  )
  chk(
    focusedText,
    'and the comment it marks on arrival is the one that was saved',
    `nothing is marked, or the wrong comment is: "${await readText(page.getByTestId('comment-focused'))}"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a bookmark is PRIVATE, in both directions')

  const peer = await signInApi(API, PEER.email, PEER.password)
  const B = apiAs(peer.accessToken)
  const peerBefore = (await B(`/workspaces/${workspaceId}/comments/saved`)).data ?? []
  const peerSave = await B(`/tasks/${task.id}/comments/${replyId}/save`, { method: 'POST' })
  const peerAfter = (await B(`/workspaces/${workspaceId}/comments/saved`)).data ?? []
  const mineNow = (await A(`/workspaces/${workspaceId}/comments/saved`)).data ?? []
  chk(
    peerSave.status < 400 &&
      !peerBefore.some((c) => c.id === commentId) &&
      peerAfter.some((c) => c.id === replyId) &&
      !peerAfter.some((c) => c.id === commentId) &&
      !mineNow.some((c) => c.id === replyId),
    'a colleague saving the reply sees only their own, and I see only mine',
    `peer save ${peerSave.status}; peer sees my comment: ` +
      `${peerAfter.some((c) => c.id === commentId)}; I see theirs: ` +
      `${mineNow.some((c) => c.id === replyId)} — a bookmark is not shared state`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a reply saves too — the row is rendered twice')

  await openComments()
  const replyBtn = page.getByTestId(`comment-save-${replyId}`)
  chk(
    await waitUntil(() => replyBtn.isVisible().catch(() => false), { timeoutMs: 20_000 }),
    'a reply carries the same Save',
    'replies have no Save — the action row is duplicated and only one copy got it',
  )
  await replyBtn.click()
  chk(
    await waitUntil(async () => (await savedRows(replyId))[0].c === 1, { timeoutMs: 20_000 }),
    'and saving a reply stores a row of its own',
    'the reply\'s Save wrote nothing',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and unsaving takes it back out of Later')

  await openComments()
  await page.getByTestId(`comment-save-${commentId}`).click({ timeout: 25_000 })
  chk(
    await waitUntil(async () => (await savedRows(commentId))[0].c === 0, { timeoutMs: 20_000 }),
    'pressing it again removes the save',
    'the second press left the row behind — the control only saves',
  )
  await page.goto(`${stack.base}/app/${workspaceId}/inbox?view=later`, { waitUntil: 'domcontentloaded' })
  await settleCookies()
  /*
   * THE REPLY IS THE ANCHOR, and it is load-bearing. The first version read
   * `if (!section.isVisible()) return true`, which is satisfied on the very
   * first poll — before React has rendered anything — so it passed on a build
   * whose unsave deleted nothing. Requiring the reply to be PRESENT proves the
   * section rendered and its data arrived; only then does the root's absence
   * mean the unsave took effect.
   */
  const goneFromLater = await waitUntil(async () => {
    const section = page.getByTestId('later-saved-comments')
    if (!(await section.isVisible().catch(() => false))) return false
    const text = await readText(section)
    return text.includes(REPLY_BODY) && !text.includes(BODY)
  }, { timeoutMs: 20_000 })
  chk(
    goneFromLater,
    'and Later lists the reply I still have saved, but no longer the comment',
    `Later reads "${await readText(page.getByTestId('later-saved-comments'))}" — the ` +
      'unsaved comment is still there, or the section never rendered at all',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('save-comment.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
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
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
