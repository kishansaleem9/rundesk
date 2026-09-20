/**
 * §V2-08 — the task menu of frame `15:32`, and the two items she names.
 *
 * `[15:27]` "yahan par aap ko HISTORY wagera sab cheezein show hoti hain" — the
 * first item she names in the task menu. Before this, `grep -r task_revisions`
 * returned nothing: only docs kept revisions, and a description somebody
 * overwrote was simply gone.
 *
 * WHAT THIS WATCHES FOR, and it is not "does a list render".
 *
 * The design choice worth testing is that a revision stores the text that was
 * REPLACED, not the text that replaced it. `doc_revisions` does the opposite,
 * so this is the kind of thing a later refactor "corrects" into consistency and
 * quietly breaks: with the other design, the description every task has right
 * now is never recorded anywhere, and the first edit destroys exactly the text
 * somebody opens history to recover. The checks below assert the OLD text is
 * what comes back, and that the first edit of a long-lived task captures its
 * original description.
 *
 * The second thing is that restoring is an ordinary edit. A restore that wrote
 * the column directly would be the one description change in the product with
 * no history — inside the history feature. So restoring twice has to be able to
 * get back to where it started.
 *
 *   node test/e2e/task-menu.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 37

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

/**
 * Open the task menu, or leave it open if it already is.
 *
 * Clicking the trigger TOGGLES. After the print item is selected the menu is
 * still open — the item's handler mounts a portal rather than navigating — so a
 * blind click closed it, and every lookup afterwards found an empty menu and
 * reported each item as missing. Which is a much more alarming failure than
 * "the menu was already open".
 */
const menuIsOpen = (page) =>
  // VISIBILITY, not presence. A closing Radix menu leaves its content in the
  // DOM for a moment, so `count() > 0` is true while the menu is shut — which
  // made this skip the click, and every item then timed out as unclickable
  // despite being counted a line earlier.
  page.getByTestId('task-menu-description-history').isVisible().catch(() => false)

const openTaskMenu = async (page) => {
  if (!(await menuIsOpen(page))) await page.getByTestId('task-more-menu').click({ timeout: 20000 })
  return waitUntil(() => menuIsOpen(page), { timeoutMs: 10_000 })
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

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let spaceId = null, projectId = null, listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { spaceId = s.id; projectId = p.id; listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make a task in')

  /*
   * The task is created WITH a description, and that description is never
   * written to history by anything except the first edit. That is the case the
   * storage design exists for, so it is the case the suite is built around.
   */
  const ORIGINAL = `The original brief, written at creation ${stamp}`
  const task = (await A('/tasks', {
    method: 'POST',
    body: { listId, title: `History check ${stamp}`, description: ORIGINAL },
  })).data
  if (!task?.id) throw new Error('could not make a task')
  const history = () => A(`/tasks/${task.id}/description-history`)
  const setDescription = (description) => A(`/tasks/${task.id}`, { method: 'PATCH', body: { description } })

  console.log('\n▶ §V2-08 `[15:27]` — a description that has never changed')
  let rows = (await history()).data ?? []
  chk(
    Array.isArray(rows) && rows.length === 0,
    'a task nobody has edited has an empty history, not an error',
    `it returned ${JSON.stringify(rows).slice(0, 120)}`,
  )

  console.log('\n▶ the first edit preserves what was there before it')
  const SECOND = `A rewrite ${stamp}`
  await setDescription(SECOND)
  rows = (await history()).data ?? []
  chk(rows.length === 1, 'editing the description records one entry',
    `the history has ${rows.length} entries after one edit`)
  /*
   * THE CHECK THIS SUITE EXISTS FOR. If revisions stored the NEW text, this
   * would come back as the rewrite and the original brief — written before the
   * feature existed — would be gone for good.
   */
  chk(
    rows[0]?.description === ORIGINAL,
    'and the entry holds the text that was REPLACED, not the text that replaced it',
    `the entry says ${JSON.stringify(rows[0]?.description)} — history is keeping the new text, ` +
      'so every description written before an edit is unrecoverable',
  )
  chk(
    (await A(`/tasks/${task.id}`)).data?.description === SECOND,
    'while the task itself carries the new one',
    'the task description did not change',
  )
  chk(
    // The identity, not merely "an editor object is present" — a history that
    // cannot say who changed something is an audit trail with the audit removed.
    rows[0]?.editor?.email === ME.email,
    'and it names who replaced it',
    `the entry's editor was ${JSON.stringify(rows[0]?.editor ?? null)}, expected ${ME.email}`,
  )

  console.log('\n▶ edits by one person in quick succession are one entry')
  await setDescription(`A third pass ${stamp}`)
  await setDescription(`A fourth pass ${stamp}`)
  rows = (await history()).data ?? []
  chk(
    rows.length === 1,
    'three quick edits by the same person stay one entry',
    `the history has ${rows.length} entries — a history with a row per keystroke is a history nobody scrolls`,
  )
  chk(
    rows[0]?.description === ORIGINAL,
    'and the entry kept is the OLDEST text, not the most recent one',
    `the newest entry says ${JSON.stringify(rows[0]?.description)}, not the original — either coalescing ` +
      'overwrote the older text with a newer one, or it did not coalesce and each save left its own row',
  )

  console.log('\n▶ clearing a description is a change, not an absence')
  // Wait out the coalescing window would be slow; a different value is enough
  // to prove the null is stored, since the row above is the one being kept.
  const beforeClear = (await A(`/tasks/${task.id}`)).data?.description
  await setDescription(null)
  chk(
    (await A(`/tasks/${task.id}`)).data?.description == null,
    'the description can be emptied',
    'clearing the description did nothing',
  )
  chk(
    beforeClear != null,
    'and there was something there to lose',
    'the description was already empty, so clearing it proves nothing',
  )

  console.log('\n▶ restoring is an edit, so it can be undone')
  rows = (await history()).data ?? []
  const originalRow = rows.find((r) => r.description === ORIGINAL)
  chk(!!originalRow, 'the original brief is still in the history',
    `the history holds ${JSON.stringify(rows.map((r) => r.description))}`)
  /*
   * Guarded rather than assumed. When the storage design is wrong the original
   * is not in here at all, and reaching straight for `.id` throws — which stops
   * the run and hides the restore and cross-task checks behind a stack trace
   * instead of reporting them. Falling back to the newest row keeps the rest of
   * the suite meaningful while the check above carries the real failure.
   */
  const rowToRestore = originalRow ?? rows[0]
  if (!rowToRestore) throw new Error('no revision at all to restore from')
  const restored = await A(`/tasks/${task.id}/description-history/${rowToRestore.id}/restore`, { method: 'POST' })
  chk(
    restored.status === 200 || restored.status === 201,
    'it can be restored',
    `restore returned ${restored.status} ${JSON.stringify(restored.error)}`,
  )
  chk(
    (await A(`/tasks/${task.id}`)).data?.description === rowToRestore.description,
    'and the task says what it used to say',
    `the description is now ${JSON.stringify((await A(`/tasks/${task.id}`)).data?.description)}`,
  )

  /*
   * A revision id from another task must not restore into this one. Without the
   * ownership check the endpoint would let anyone who can edit a task paste in
   * the description of a task they cannot even read.
   */
  const other = (await A('/tasks', {
    method: 'POST',
    body: { listId, title: `Other history ${stamp}`, description: 'SECRET brief' },
  })).data
  await A(`/tasks/${other.id}`, { method: 'PATCH', body: { description: 'changed' } })
  const foreignRow = ((await A(`/tasks/${other.id}/description-history`)).data ?? [])[0]
  const cross = await A(`/tasks/${task.id}/description-history/${foreignRow.id}/restore`, { method: 'POST' })
  chk(
    cross.status === 404,
    "and a revision belonging to another task cannot be restored into this one",
    `restoring a foreign revision returned ${cross.status} — it would paste another task's text in here`,
  )

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ frame `15:32` — reaching it from the task menu')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`, {
    waitUntil: 'domcontentloaded',
  })

  await openTaskMenu(page)
  await page.getByTestId('task-menu-description-history').click({ timeout: 10000 })
  const opened = await waitUntil(
    () => page.getByTestId('description-history-dialog').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(opened, 'the menu opens description history', 'the menu item did not open anything')

  const listed = await waitUntil(
    async () => (await page.getByTestId('description-revision').count()) > 0,
    { timeoutMs: 10_000 },
  )
  chk(listed, 'and the entries are there',
    'the dialog opened empty on a task with a history')

  // The text is behind Show, so a long description does not fill the dialog.
  await page.getByTestId('description-revision-toggle').first().click()
  const shown = await waitUntil(
    async () => (await page.getByTestId('description-revision-body').count()) > 0,
    { timeoutMs: 10_000 },
  )
  const body = await page.getByTestId('description-revision-body').first().innerText().catch(() => '')
  chk(
    shown && body.trim().length > 0,
    'and an entry can be read, not just dated',
    `the entry's body was ${JSON.stringify(body.slice(0, 80))} — a history you cannot read is a list of timestamps`,
  )

  // ── Print, frame `15:32` ─────────────────────────────────────────────────
  console.log('\n\u25b6 \u00a7V2-08 `[15:32]` \u2014 "Aap task ko PRINT bhi kar sakte hain"')

  /*
   * `window.print()` is stubbed rather than driven: headless Chromium cannot
   * open a print dialog, and asserting "print was called" would prove nothing
   * about what lands on the paper — a stylesheet that hides everything would
   * pass it. So the stub records the call AND the checks read the printable
   * document that was built for it.
   */
  await page.evaluate(() => {
    window.__printCalls = 0
    /*
     * The stub FIRES `afterprint`, because a real browser does — that event is
     * how the app knows the dialog closed and puts itself back. A stub that
     * only counted calls left the printable copy mounted for the rest of the
     * run, which kept the menu's popper repositioning and made every later
     * click fail with "element is not stable". The test artifact looked
     * exactly like a broken menu.
     */
    window.print = () => {
      window.__printCalls += 1
      // Snapshot what the printer would receive, at the moment it would
      // receive it. Reading the document afterwards is impossible now that the
      // app puts itself back — and this is the more faithful question anyway.
      const root = document.getElementById('task-print-root')
      window.__printed = root ? { text: root.innerText, id: root.querySelector('[data-testid="task-print-id"]')?.textContent ?? '', display: getComputedStyle(root).display } : null
      window.dispatchEvent(new Event('afterprint'))
    }
  })

  await page.keyboard.press('Escape').catch(() => {})
  await openTaskMenu(page)
  await page.getByTestId('task-menu-print').click({ timeout: 10000 })

  const printCalled = await waitUntil(
    async () => (await page.evaluate(() => window.__printCalls)) > 0,
    { timeoutMs: 10_000 },
  )
  chk(printCalled, 'Print asks the browser to print', 'the Print item did nothing')

  const printed = await page.evaluate(() => window.__printed)
  chk(
    !!printed,
    'and it builds a document to print, rather than printing the app',
    'there was no printable document when print was called — the dialog would have captured the slide-over panel',
  )

  /*
   * WHAT IS ON THE PAPER. These are the checks that a print stylesheet hiding
   * everything would fail. The description is the one that matters most: it is
   * the reason to print a task at all.
   */
  const paper = printed?.text ?? ''
  chk(paper.includes(ORIGINAL), 'the description is on it',
    `the printed page reads ${JSON.stringify(paper.slice(0, 160))}`)
  chk(paper.includes(`History check ${stamp}`), 'and the title',
    'the printed page has no title on it')
  chk(
    (printed?.id ?? '').includes(task.id),
    'and the id, so a printed task can be found again',
    'the printed page does not say which task it is',
  )

  /*
   * The app must be hidden on paper and the document hidden on screen. Both
   * halves matter: without the first the task prints twice, without the second
   * a copy of it sits under the app in the browser.
   */
  chk(
    printed?.display === 'none',
    'the printable copy is invisible on screen',
    `it was rendered with display: ${printed?.display} — a second copy of the task sitting under the app`,
  )

  /*
   * And the app comes back. A person who cancels the print dialog must not be
   * left looking at a page that is still in print mode — this is the check that
   * would have caught the recorder-style bug of a state nothing clears.
   */
  const appRestored = await waitUntil(
    async () => (await page.getByTestId('task-print-root').count()) === 0,
    { timeoutMs: 10_000 },
  )
  chk(
    appRestored,
    'and the app puts itself back when the dialog closes',
    'the printable copy is still mounted after printing — cancelling the dialog would strand the page in print mode',
  )

  const printRules = await page.evaluate(() => {
    const found = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules
      try { rules = Array.from(sheet.cssRules) } catch { continue }
      for (const rule of rules) {
        if (rule.media && String(rule.media).includes('print')) {
          for (const inner of Array.from(rule.cssRules ?? [])) found.push(inner.cssText)
        }
      }
    }
    return found
  })
  chk(
    printRules.some((r) => r.includes('#root') && r.includes('none')),
    'and the app itself is hidden on paper',
    `the print rules are ${JSON.stringify(printRules).slice(0, 200)} — without hiding the app, the task prints twice`,
  )

  // ── The rest of the menu ─────────────────────────────────────────────────
  console.log('\n\u25b6 the menu carries what had no home before')

  /*
   * No Escape here, deliberately. Clicking a menu item already closes the menu,
   * and pressing Escape with nothing open closes the SHEET — after which the
   * click below still lands on a button that is tearing down, so it succeeds
   * and every lookup afterwards finds an empty document. That failure reads as
   * "the menu items do not exist", which is what it looked like the first time.
   */
  chk(await openTaskMenu(page), 'the task menu opens', 'the task menu would not open')
  for (const [id, what] of [
    ['task-menu-copy-link', 'Copy link'],
    ['task-menu-copy-id', 'Copy ID'],
    ['task-menu-new-tab', 'New tab'],
    ['task-menu-convert', 'Convert to'],
    ['task-menu-email', 'Send email to task'],
  ]) {
    chk(
      await page.getByTestId(id).isVisible().catch(() => false),
      `${what} is in the menu`,
      `${what} is not in the menu — frame \`15:32\` has it and Rundesk had nowhere to put it`,
    )
  }

  /*
   * §V2-08 `[15:38]` — Convert to. The picker must not offer choices the API
   * refuses: itself, or a task that is already a subtask. Offering them would
   * make most of the list an error waiting to happen.
   */
  console.log('\n\u25b6 `[15:38]` \u2014 "task ko CONVERT bhi kar sakte ho"')
  /*
   * FROM A FRESH PAGE, deliberately. By this point the page has been through a
   * dialog, a print and several menu cycles, and Playwright's click starts
   * losing races against the menu's remount — "element is not stable", then
   * "detached from the DOM". That is an artifact of a long accumulated session
   * rather than a defect (the same open-and-click cycle works repeatedly from a
   * clean page), but a check that fails for that reason tells you nothing about
   * Convert. So this block starts where a person would: on the task.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openTaskMenu(page)
  await page.getByTestId('task-menu-convert').click({ timeout: 10000 })
  const converter = await waitUntil(
    () => page.getByTestId('task-convert-dialog').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(converter, 'Convert to opens a parent picker', 'Convert to opened nothing')

  await page.getByTestId('task-convert-search').fill(`History check ${stamp}`)
  const offersItself = await page.getByTestId('task-convert-candidate').count()
  chk(
    offersItself === 0,
    'and it does not offer the task itself as its own parent',
    `searching for the task's own title offered ${offersItself} candidate(s) — one of them is itself`,
  )

  // A real conversion, driven from the picker, and read back from the API.
  await page.getByTestId('task-convert-search').fill(`Other history ${stamp}`)
  const hasTarget = await waitUntil(
    async () => (await page.getByTestId('task-convert-candidate').count()) > 0,
    { timeoutMs: 10_000 },
  )
  chk(hasTarget, 'and it offers a task that can be a parent',
    'the picker had nothing to convert into')
  await page.getByTestId('task-convert-candidate').first().click()
  const nested = await waitUntil(
    async () => (await A(`/tasks/${task.id}`)).data?.parentTaskId === other.id,
    { timeoutMs: 10_000 },
  )
  chk(
    nested,
    'and choosing one really makes it a subtask',
    `after choosing a parent the task's parentTaskId is ` +
      `${JSON.stringify((await A(`/tasks/${task.id}`)).data?.parentTaskId)} — the picker changed nothing`,
  )
  // Put it back, so the checks after this run against a top-level task.
  await A(`/tasks/${task.id}`, { method: 'PATCH', body: { parentTaskId: null } })

  /*
   * §V2-08 — "Send email to task". The address is composed on the SERVER, and
   * this asserts its shape rather than merely that a dialog opened: the
   * `+task-<id>` tag is what `parseRecipient` routes on, so an address without
   * it would file the mail as a new task in the list instead of a comment here.
   */
  console.log('\n\u25b6 "Send email to task" \u2014 an address that already worked')
  /*
   * BOTH BRANCHES ARE EXERCISED, and the order matters. A seeded list has no
   * inbound alias, so asking first proves the endpoint admits that rather than
   * inventing an address that bounces. Then one is created and the real address
   * is checked — otherwise the assertion that matters (the `+task-` tag) never
   * runs at all, and the suite would pass on a list with no alias forever.
   */
  const before = (await A(`/tasks/${task.id}/email-address`)).data
  const hadAlias = !!before?.address
  chk(
    hadAlias || before?.address === null,
    'without an alias it says so, rather than inventing an address that bounces',
    `it returned ${JSON.stringify(before)}`,
  )

  await A(`/lists/${listId}/inbound-email`, { method: 'POST', body: {} })
  const emailed = (await A(`/tasks/${task.id}/email-address`)).data
  chk(
    (emailed?.address ?? '').includes(`+task-${task.id}@`),
    'and with one, the address carries the task tag the inbound router reads',
    `the address is ${JSON.stringify(emailed?.address)} — without +task-<id> the mail becomes a NEW task ` +
      'in the list rather than a comment on this one',
  )
  chk(
    (emailed?.address ?? '').startsWith('list-'),
    'and the list prefix it routes on',
    `the address is ${JSON.stringify(emailed?.address)} — parseRecipient would not recognise it`,
  )
  // Left as it was found: an alias this suite minted must not persist into
  // whatever runs next against the same list.
  if (!hadAlias) await A(`/lists/${listId}/inbound-email`, { method: 'DELETE' }).catch(() => {})

  await A(`/tasks/${task.id}`, { method: 'DELETE' }).catch(() => {})
  await A(`/tasks/${other.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
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
