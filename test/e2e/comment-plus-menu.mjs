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
 *   · Slash commands and Brain had NO ENGINE, so they were deliberately absent
 *     rather than present as labels. Both were their own rows in the re-audit,
 *     and both are in now: the composer gained a slash menu (§V2-S05c), and
 *     Brain opens the comment AI panel the space bar opens
 *     (`ledger-rows/row-751`, 29 September) — so the last section follows
 *     Brain to that panel.
 *
 * So this is a menu plus the three pieces that make its entries real.
 *
 * AND THE THREE "NEW …" ROWS HAND THE CURSOR ON
 * (`found-29-sep/comment-plus-menu-keeps-focus-after-create`, 29 September).
 * They opened the create modal while the menu was still closing: the menu kept
 * the cursor and then gave it to the "+" behind the modal, so a name typed
 * straight after New Task never reached the title, and the menu, still
 * mounted, marked the first Escape as its own. The New Doc, New Whiteboard and
 * New Task sections read where the cursor is once the creator has opened —
 * `document.activeElement`, by its test id — and the last types a title the
 * moment the creator is on screen and presses Escape once. Since
 * `found-29-sep/create-modal-returns-focus-to-nothing` it also reads where the
 * cursor went after that Escape: back to the "+", not to the page.
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
const EXPECTED_CHECKS = 19

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
  /*
   * WHERE THE CURSOR IS, read in the page: the focused element's test id (its
   * tag when it has none, `body` when nothing has it), and whether it sits in a
   * menu, open or still closing. The "New …" sections compare it with the
   * creator's title once the creator has opened. (`dataset`, the page's own
   * property: nothing here can throw.)
   */
  const cursor = () =>
    page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return 'body'
      const where = el.dataset?.testid ?? el.tagName.toLowerCase()
      return el.closest('[role="menu"]') ? `${where} (in a menu)` : where
    })

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
    'comment-plus-brain',
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
   * THE TWO THAT HAD NO ENGINE. This used to be where they were kept OUT: Slash
   * commands and Brain would be trivial to add as rows that do nothing, which
   * is the defect class this codebase keeps removing. §V2-S05c built the slash
   * menu, so that item is expected by name below; Brain has the comment AI
   * panel behind it since `ledger-rows/row-751`, so it is in `wanted` above,
   * and the last section follows it to the panel — the check that kept it out
   * stood here.
   */
  const menuText = (await readText(page.locator('[role="menu"]').first())).toLowerCase()
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
  // Bounded and caught: what stands above it — a check, or a gate whose answer
  // nobody reads — is allowed to fail, so this has to report rather than throw.
  // Bounding one step and leaving the next unbounded only moves the thirty
  // seconds one line down (ledger §10).
  await page.getByTestId('comment-emoji-🎉').click({ timeout: 8000 }).catch(() => {})
  const emojiLanded = await waitUntil(
    async () => (await page.getByTestId('comment-input').inputValue()).includes('🎉'),
    { timeoutMs: 10_000 },
  )
  // The condition above is safe — `waitUntil` catches its predicate's throws —
  // and the message below had nothing. A `chk` message is evaluated whether the
  // check passes or fails, so a composer this section has removed would end the
  // section here rather than report the failure the check is for.
  const composerHeld = await page
    .getByTestId('comment-input')
    .inputValue({ timeout: 6000 })
    .catch(() => null)
  chk(
    emojiLanded,
    'and the emoji lands in the comment being written',
    `the composer held ${JSON.stringify(composerHeld)} — the row is decoration`,
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
  /*
   * AND THE CURSOR WENT WITH IT
   * (`found-29-sep/comment-plus-menu-keeps-focus-after-create`). The modal
   * opened while the menu was closing, the menu kept the cursor and gave it
   * back to the "+" behind the modal: a doc named by typing was named nowhere.
   * Read once the creator is on its Doc tab.
   */
  const docCursor = await waitUntil(async () => (await cursor()) === 'quick-create-doc-title', {
    timeoutMs: 10_000,
  })
  const docCursorOn = docCursor ? 'quick-create-doc-title' : await cursor().catch(() => null)
  chk(
    docCursor,
    'and the cursor is in the doc’s title, not left in the “+” menu or on the “+” behind the creator',
    `the cursor is on ${JSON.stringify(docCursorOn)}`,
  )
  await page.keyboard.press('Escape').catch(() => {})

  // -------------------------------------------------------------------------
  console.log('\n▶ New Whiteboard opens its creator, with the cursor in the title')

  /*
   * The frame's third "New …" row, which nothing followed: the "all buildable
   * items" check above sees it in the menu and stops there. It opens the same
   * creator on the Whiteboard form, and the cursor goes to that form's title.
   */
  await openPlus()
  await item('comment-plus-new-whiteboard').click({ timeout: 8000 }).catch(() => {})
  const whiteboardOpened = await waitUntil(
    () => page.getByTestId('create-tab-whiteboard').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  const whiteboardCursor =
    whiteboardOpened &&
    (await waitUntil(async () => (await cursor()) === 'whiteboard-title', { timeoutMs: 10_000 }))
  const whiteboardCursorOn = whiteboardCursor ? 'whiteboard-title' : await cursor().catch(() => null)
  chk(
    whiteboardCursor,
    'New Whiteboard opens the creator on the Whiteboard form, with the cursor in the whiteboard’s title',
    whiteboardOpened
      ? `the creator opened with the cursor on ${JSON.stringify(whiteboardCursorOn)}`
      : 'the row opened no creator',
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
  await page.getByTestId('comment-assign-select').selectOption(me.id, { timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('comment-assign-pending'))).length > 0,
      { timeoutMs: 10_000 },
    ),
    'and the composer says who it will go to before you post',
    'the choice vanished — a selection you cannot see is a selection you cannot trust',
  )

  const BODY = `assigned on post ${TAG}`
  // Both bounded: a check in this suite asserts the composer exists, so it can
  // be taken away, and bounding the fill alone would move the thirty seconds
  // onto the post beneath it. The check below reads the DATABASE for this
  // exact body, so neither press decides it — nothing typed, nothing posted,
  // no row, and it fails on the row.
  await page.getByTestId('comment-input').fill(BODY, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-post').click({ timeout: 8000 }).catch(() => {})
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

  // -------------------------------------------------------------------------
  console.log('\n▶ Brain opens the comment AI panel — the one the space bar opens')

  /*
   * THIS REPLACES "and Brain, which has nothing behind it, is still absent",
   * which was right while nothing stood behind it. The comment AI panel could
   * have all along, and does since `ledger-rows/row-751`. A Brain row that
   * opens nothing is still the facade that check kept out, so this one follows
   * the row to the panel instead of stopping at the label;
   * `brain-entry-points.mjs` follows the panel on to the task.
   */
  await openPlus()
  await item('comment-plus-brain').click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => page.getByTestId('comment-ai-panel').isVisible().catch(() => false), {
      timeoutMs: 10_000,
    }),
    'and Brain, which now has the comment AI panel behind it, opens that panel',
    'the Brain row opened nothing — a label over nothing, which is what this check used to keep out',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ New Task gives the creator’s title the cursor, and ONE Escape closes it')

  /*
   * `found-29-sep/comment-plus-menu-keeps-focus-after-create`, as a person
   * meets it: New Task, then the task's name typed the moment the creator is on
   * screen, with no wait for the cursor and no click into the title, then one
   * Escape. Before the fix, on lane 2: the name went into the closing menu and
   * the cursor ended on the "+" behind the modal (typed a moment later, it went
   * to the "+", whose first space opened the menu again under the modal).
   *
   * THE TYPING COMES FIRST, the cursor is read after it. A creator whose title
   * takes the cursor only some time after it is drawn passes a check that
   * waits for the cursor, and still loses the first thing typed.
   *
   * THE ESCAPE HELD BEFORE THE FIX TOO: the closing menu marked it, and the
   * modal, which ignores the mark, closed on it anyway. It is here for the day
   * either changes — a modal that honours the mark, or anything else that
   * keeps the first Escape from it.
   *
   * LAST IN THE FILE ON PURPOSE: a creator that one Escape does not close
   * stays over the page, and a section after it could not reach the "+".
   */
  await openPlus()
  await item('comment-plus-new-task').click({ timeout: 8000 }).catch(() => {})
  const taskTab = page.getByTestId('create-tab-task')
  const taskTitle = page.getByTestId('quick-create-task-title').filter({ visible: true })
  const taskCreatorOpened = await waitUntil(() => taskTab.isVisible().catch(() => false), {
    timeoutMs: 10_000,
  })
  const TYPED = 'Follow up on this comment'
  await page.keyboard.type(TYPED).catch(() => {})
  const taskCursor =
    taskCreatorOpened &&
    (await waitUntil(async () => (await cursor()) === 'quick-create-task-title', { timeoutMs: 10_000 }))
  const taskCursorOn = taskCursor ? 'quick-create-task-title' : await cursor().catch(() => null)
  chk(
    taskCursor,
    'New Task opens the creator with the cursor in its title — not in the closing “+” menu, nor on the “+” behind it',
    taskCreatorOpened ? `the cursor is on ${JSON.stringify(taskCursorOn)}` : 'the row opened no creator',
  )
  const typedLanded =
    taskCreatorOpened &&
    (await waitUntil(async () => (await taskTitle.inputValue({ timeout: 1000 })) === TYPED, { timeoutMs: 5_000 }))
  const titleHeld = await taskTitle.inputValue({ timeout: 3000 }).catch(() => null)
  chk(
    typedLanded,
    'and a name typed straight after lands in the title, every character of it',
    `the title holds ${JSON.stringify(titleHeld)} of the ${JSON.stringify(TYPED)} typed`,
  )
  await page.keyboard.press('Escape').catch(() => {})
  const oneEscapeClosed =
    taskCreatorOpened &&
    (await waitUntil(async () => !(await taskTab.isVisible().catch(() => false)), { timeoutMs: 5_000 }))
  chk(
    oneEscapeClosed,
    'and ONE Escape closes the creator — nothing left under it takes the key first',
    taskCreatorOpened ? 'the creator is still open after one Escape' : 'the row opened no creator for an Escape to close',
  )
  /*
   * AND THE CURSOR GOES BACK (`found-29-sep/create-modal-returns-focus-to-nothing`).
   * The creator is a portal with a document Escape listener, not a dialog,
   * and it gave the cursor back to nothing: after the Escape above it was on
   * `<body>`. It goes back to the "+" the creator was opened from.
   */
  const cursorBack =
    oneEscapeClosed &&
    (await waitUntil(async () => (await cursor()) === 'comment-plus', { timeoutMs: 5_000 }))
  const cursorBackOn = cursorBack ? 'comment-plus' : await cursor().catch(() => null)
  chk(
    cursorBack,
    'and the cursor goes back to the “+” the creator was opened from, not to the page',
    oneEscapeClosed ? `the cursor is on ${JSON.stringify(cursorBackOn)}` : 'the creator did not close, so nothing was given back',
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
