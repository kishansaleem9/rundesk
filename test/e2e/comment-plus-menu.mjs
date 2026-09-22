/**
 * §V2-S05b — THE COMMENT "+" MENU, frame `04:50`.
 *
 * The frame's menu lists ten items:
 *
 *     Slash commands · Assign comment · Record a Video Clip · Mention a task ·
 *     Add a file · New Task · New Whiteboard · Add emoji · Brain · New Doc
 *
 * THE RE-AUDIT SAID "the ten items exist scattered, no menu gathers them", and
 * checking that was worth the time because it was half wrong:
 *
 *   · Record a Video Clip, Add a file and Mention a task DID exist as their own
 *     controls on the composer.
 *   · Assigning the comment you are WRITING did not. The API can assign a
 *     comment (`POST /comments/:id/assign`) and the UI used it only as a hover
 *     action on a comment already posted, which is a different gesture.
 *   · An emoji inserter did not exist in the composer at all — reactions on
 *     posted comments are not the same thing.
 *   · New Task / New Doc / New Whiteboard had no entry point from here.
 *   · Slash commands and Brain have NO ENGINE, so they are deliberately absent
 *     rather than present as labels. Both are their own rows in the re-audit.
 *
 * So this is a menu plus the three pieces that make its entries real.
 *
 * WHAT THE CHECKS ARE FOR. A menu is the easiest thing in a UI to fake: ten
 * rows that open and close and do nothing photograph perfectly. So no check
 * here stops at "the item is in the menu" — each one follows the item to the
 * thing it claims to do, and the assign check follows it all the way to the
 * database.
 *
 *   node test/e2e/comment-plus-menu.mjs --api 3011 --dist apps/web/dist
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

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
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
const TAG = `e2e-plus-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data

  const made = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG}` } })
  const workspaceId = made.data?.id
  if (!workspaceId) throw new Error(`could not create a workspace: ${JSON.stringify(made.error)}`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the assign check reads the comment row')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Plus subject ${TAG}`}) returning id`
  // A task to mention, so "Mention a task" has something to find.
  await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Mentionable ${TAG}`}) returning id`

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

  /* Deterministic open — see the note in task-menu-favorite-archive.mjs. */
  const item = (id) => page.getByTestId(id).first()
  const openPlus = async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await waitUntil(async () => !(await item('comment-plus-assign').isVisible().catch(() => false)), {
      timeoutMs: 5_000,
    })
    await page.getByTestId('comment-plus').click({ timeout: 20_000 })
    const opened = await waitUntil(
      () => item('comment-plus-assign').isVisible().catch(() => false),
      { timeoutMs: 10_000 },
    )
    if (!opened) throw new Error('the "+" menu did not open')
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `04:50` — the menu exists, and gathers what is real')

  chk(
    await waitUntil(() => page.getByTestId('comment-plus').isVisible().catch(() => false), {
      timeoutMs: 20_000,
    }),
    'the composer has a "+"',
    'the composer controls are still scattered with no menu gathering them',
  )

  await openPlus()
  const wanted = [
    'comment-plus-assign',
    'comment-plus-clip',
    'comment-plus-mention-task',
    'comment-plus-file',
    'comment-plus-emoji',
    'comment-plus-slash',
    'comment-plus-new-task',
    'comment-plus-new-doc',
    'comment-plus-new-whiteboard',
  ]
  const present = []
  for (const id of wanted) {
    if (await item(id).isVisible().catch(() => false)) present.push(id)
  }
  chk(
    present.length === wanted.length,
    `all ${wanted.length} buildable items are in the menu`,
    `only ${present.length} of ${wanted.length}: missing ${wanted.filter((w) => !present.includes(w)).join(', ')}`,
  )

  /*
   * AND THE TWO WITH NO ENGINE ARE NOT. This is the check that keeps the menu
   * honest: Slash commands and Brain would be trivial to add as rows and would
   * do nothing, which is the defect class this codebase keeps removing.
   */
  /*
   * BRAIN STAYS OUT. Slash commands used to be excluded alongside it for the
   * same reason — nothing behind them — and §V2-S05c built the engine, so the
   * item is real now and IS expected. Brain² still does not exist, so that half
   * of this check stands unchanged: the menu must not grow a label over nothing.
   */
  const menuText = (await readText(page.locator('[role="menu"]').first())).toLowerCase()
  chk(
    !menuText.includes('brain'),
    'and Brain, which has nothing behind it, is still absent',
    `the menu offered: ${menuText.replace(/\n/g, ' | ')}`,
  )
  chk(
    menuText.includes('slash'),
    'while Slash commands, which now has an engine, is offered',
    'the composer has a slash menu and the "+" does not mention it',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ Add emoji puts one in the comment')

  await item('comment-plus-emoji').click()
  chk(
    await waitUntil(() => page.getByTestId('comment-emoji-row').isVisible().catch(() => false), {
      timeoutMs: 10_000,
    }),
    'choosing it opens the emoji row',
    'the item did nothing — there is no emoji anything in the composer',
  )
  await page.getByTestId('comment-emoji-🎉').click()
  chk(
    await waitUntil(async () => (await page.getByTestId('comment-input').inputValue()).includes('🎉'),
      { timeoutMs: 10_000 }),
    'and the emoji lands in the comment being written',
    `the composer held "${await page.getByTestId('comment-input').inputValue()}" — the row is decoration`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ Mention a task opens the task picker, not the people one')

  await openPlus()
  await item('comment-plus-mention-task').click()
  chk(
    await waitUntil(
      async () => (await page.getByTestId('comment-input').inputValue()).includes('@'),
      { timeoutMs: 10_000 },
    ),
    'it starts a mention for you',
    'nothing was inserted, so the picker had no reason to open',
  )
  /*
   * SCOPED TO THE PICKER, and the first version was not — it read the whole
   * page, which also renders the list BEHIND the sheet, so the mentionable
   * task's title was on screen no matter which tab the picker was on. A
   * break-test that switched the tab to People failed nothing. Second vacuous
   * check of this pass, same cause: asserting on `body` instead of on the
   * element that is supposed to have changed.
   */
  chk(
    await waitUntil(
      async () =>
        (await readText(page.getByTestId('comment-mention-picker'))).includes(`Mentionable ${TAG}`),
      { timeoutMs: 10_000 },
    ),
    'and the picker is showing TASKS — the tab the item names',
    `the picker held "${await readText(page.getByTestId('comment-mention-picker'))}" — ` +
      '"Mention a task" left you one click from the wrong list',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ New Doc opens the creator, on the Doc tab')

  await openPlus()
  await item('comment-plus-new-doc').click()
  /*
   * THE THIRD `body`-SCOPED CHECK IN THIS FILE, AND THE ONE THAT WAS STILL
   * HERE. The comment two checks above records the same mistake twice — "the
   * first version read the whole page… asserting on `body` instead of on the
   * element that is supposed to have changed" — and this check still carried
   * `|| (await readText(page.locator('body'))).includes('doc')` as a fallback.
   *
   * The task detail sheet behind the modal says "doc" in several places: the
   * Docs relation, Linked docs, Related items. So the fallback was true
   * whether or not the modal opened, and the check could not fail. Its whole
   * subject is a menu row that might open nothing.
   *
   * The modal is addressed by a tab it definitely owns. `create-tab-doc`
   * exists only inside the modal, and its `aria-pressed` says whether the item
   * landed on the DOC tab — which is what this section's own heading claims and
   * nothing asserted.
   */
  const docTab = page.getByTestId('create-tab-doc')
  chk(
    await waitUntil(() => docTab.isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'the quick-create modal opens',
    'the item opened nothing — three "New …" rows with no creator behind them',
  )
  chk(
    (await docTab.getAttribute('aria-pressed').catch(() => null)) === 'true',
    'and it lands on the Doc tab, which is the row that was pressed',
    `the Doc tab reads aria-pressed=${await docTab.getAttribute('aria-pressed').catch(() => null)} — ` +
      '"New Doc" opened the creator on somebody else\'s tab',
  )
  await page.keyboard.press('Escape').catch(() => {})

  // -------------------------------------------------------------------------
  console.log('\n▶ Assign comment assigns the comment you are WRITING')

  /*
   * THE LOAD-BEARING CHECK. The hover action on a posted comment already
   * existed; the frame's menu item is about the one in the box. So the
   * assignment is chosen first, the comment is posted second, and the row is
   * read from the database third.
   */
  await openPlus()
  await item('comment-plus-assign').click()
  chk(
    await waitUntil(
      () => page.getByTestId('comment-assign-select').isVisible().catch(() => false),
      { timeoutMs: 10_000 },
    ),
    'choosing it asks who',
    'the item opened no way to pick a person',
  )
  await page.getByTestId('comment-assign-select').selectOption(me.id)
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('comment-assign-pending'))).length > 0,
      { timeoutMs: 10_000 },
    ),
    'and the composer says who it will go to before you post',
    'the choice vanished — a selection you cannot see is a selection you cannot trust',
  )

  const BODY = `assigned on post ${TAG}`
  await page.getByTestId('comment-input').fill(BODY)
  await page.getByTestId('comment-post').click()
  chk(
    await waitUntil(async () => {
      const rows = await sql`
        select assigned_to_user_id from task_comments
        where task_id = ${task.id} and body = ${BODY}`
      return rows[0]?.assigned_to_user_id === me.id
    }, { timeoutMs: 20_000 }),
    'and the posted comment really carries the assignment',
    'the comment was posted unassigned — the menu collected a choice and dropped it',
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    /*
     * AND THE WORKSPACE. This suite creates one (`WS <TAG>`) and used to leave
     * it behind, so the shared admin account gained one more per run, for ever.
     * That matters because 46 other suites pick their workspace with
     * `workspaces[0]` — a POSITION, not an identity — and the meaning of
     * element zero drifts as the list grows. It is the mechanism behind the
     * `save-comment` 403 fixed in 5b30bd1, which surfaced as a privacy failure
     * when nothing about privacy was wrong.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
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
