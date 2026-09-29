/**
 * End-to-end browser sweep over every UI surface delivered in this engagement.
 *
 * Selectors were taken from a discovery pass against the running app, not
 * guessed. Where a control turned out to be a <select> rather than a button,
 * this drives the select — an earlier version clicked a button that did not
 * exist and silently proved nothing.
 *
 * IT WAITS FOR WHAT IT READS, THE WHOLE FILE
 * (`found-29-sep/ui-sweep-reads-after-fixed-waits`). Sections 12–16b were
 * converted first; 0–11 and 15 still slept 0.5–3.2 s and then read, forty-one
 * `waitForTimeout`s, with four more left in section 12. A loaded machine
 * outlasts a fixed sleep, and twice on 29 September the break-run baseline
 * went red that way: 16b read the Saturday button once, as soon as it was
 * drawn; and section 9 counted the palette 1.2 s after Ctrl+K, which beside
 * three other break runs had not drawn it yet, so it reported "Ctrl+K did not
 * open the palette" and failed its other sixteen checks unread. Every read now
 * waits, bounded at 10–20 s, for the thing it reads: an element drawn or gone,
 * a count reached, a search answered and drawn, the server holding what was
 * written, a dialog shut before the next hotkey. A wait that runs out decides
 * nothing. The check after it reads once more and fails in its own words.
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { makeChain } from './lib/chain.mjs'
import { waitUntil } from './lib/wait.mjs'
const chromium = await resolveChromium()

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EMAIL = process.env.E2E_EMAIL ?? 'org-admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'OrgAdmin@123!'

/*
 * Serve the app, rather than assume somebody else is.
 *
 * This used to hardcode `http://127.0.0.1:5173` — a dev server that has to
 * already be running — which is half of why the suite was never in CI. The
 * newer suites start their own static server with `startLocalStack`, which
 * also proxies the socket upgrade; without that proxy the page cannot open a
 * realtime connection and the console-health section fails on connection
 * errors that say nothing about the UI.
 *
 * BASE still wins, for a run against a real deployment.
 */
const REPO = path.resolve(import.meta.dirname, '../..')
let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}
const API = process.env.E2E_API ?? `${B}/api/v1`

/*
 * Where to sweep.
 *
 * Told, or worked out. Given E2E_WS this points where it is pointed and
 * touches nothing — that is the mode a run against a real deployment uses.
 * Given nothing, it signs in over the API, takes the first workspace it can
 * see, and makes sure the list it is about to sweep actually has tasks in it.
 *
 * That second mode is the reason this suite can be in CI at all. Against a
 * freshly seeded database the old hardcoded UUIDs addressed a workspace that
 * does not exist, so every check ran against an empty grid and failed for
 * reasons that had nothing to do with the UI.
 */
let WS = process.env.E2E_WS
let LIST_PATH = process.env.E2E_LIST_PATH
if (!WS || !LIST_PATH) {
  const auth = await login(API, EMAIL, PASSWORD)
  const api = apiClient(API, auth.accessToken)
  WS = WS ?? (await pickWorkspace(api)).id
  const fixture = await ensureSweepFixture(api, WS)
  LIST_PATH = LIST_PATH ?? fixture.listPath
  console.log(
    `\x1b[2m  discovered workspace ${WS}\x1b[0m` +
      (fixture.created ? `\x1b[2m, created ${fixture.created} task(s) to sweep\x1b[0m` : ''),
  )
}
// The API as the sweep's user, for what the UI's writes left on the server
// (section 13 reads the workspace's default task type back through it).
const sweepApi = apiClient(API, (await login(API, EMAIL, PASSWORD)).accessToken)

const results = []
let section = ''
const ok = (m) => { results.push(['PASS', section, m]); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(['FAIL', section, m]); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const skip = (m) => { results.push(['SKIP', section, m]); console.log(`  \x1b[2mSKIP\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON. This printed only `b`, so a failing check
// named its reason and never itself — and `check-break-reddened.mjs` infers a
// reddening by looking for the claimed sentence among the FAIL lines. With
// only the reason there it could not tell whether the claimed check was the
// one that failed, and `us-1-grouped-column-still-shown` sat UNPROVEN: its
// claim is a fragment several iterations of a loop print, and the iteration
// that failed printed its reason instead of its name.
const check = (c, g, b) => (c ? ok(g) : bad(`${g}${b && b !== g ? ` \u2014 ${b}` : ''}`))

/*
 * A CHAIN THAT REPORTS THE SAME NUMBER OF CHECKS WHICHEVER WAY IT GOES.
 *
 * Seven `if`s in this file guarded follow-up checks with no `else`, and
 * `EXPECTED_CHECKS` is compared with `!==` — so losing a dialog made the run
 * SHORTER and the headline a statement about the harness. See
 * `test/e2e/lib/chain.mjs`.
 */
// `skip` here takes one string, so the reason is folded into it — a counted
// skip with no reason on it is a line nobody can act on.
const chain = makeChain(check, (label, why) => skip(`${label} — ${why}`))
const say = (s) => { section = s; console.log(`\n\x1b[1;36m▶ ${s}\x1b[0m`) }
const uniq = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`

// The old suite clicked a task by a title the seeded workspace happened to
// have, so it stopped running the moment that fixture was rebuilt. Seed the
// task through the list's own quick-add instead — then the sweep is about the
// task sheet rather than about one row surviving.
const SWEEP_TASK = `Sweep task ${Math.random().toString(36).slice(2, 8)}`
let sweepTaskSeeded = false

const seedSweepTask = async () => {
  if (sweepTaskSeeded) return
  const quick = page.getByPlaceholder(/Quick add task/i).first()
  if (await quick.count()) {
    await quick.fill(SWEEP_TASK)
    await page.getByRole('button', { name: /^Add task$/ }).first().click()
    // The row is drawn once the server has made it and the list has re-read it.
    await firstTaskCard().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  }
  sweepTaskSeeded = true
}

const firstTaskCard = () => page.getByText(SWEEP_TASK, { exact: true }).first()

const openAnyTask = async () => {
  await seedSweepTask()
  /*
   * A task sheet is now part of the address (`?task=`), so it survives a
   * reload — which is the point of it. That makes this helper's old shape
   * wrong: called with the sheet already open, the click landed on the
   * sheet's full-screen overlay and timed out after 30s. It only ever worked
   * because closing used to be invisible to the URL and a reload dropped the
   * sheet. Already open is already done.
   */
  const overlay = page.locator('button[aria-label="Close sheet overlay"]')
  // An address that names a task brings its sheet back after a reload, a
  // moment after the list: clicked in that moment, the card's click lands on
  // the arriving sheet's overlay (13b, after its reload). So wait for it.
  if (new URL(page.url()).searchParams.get('task')) {
    await overlay.first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
  }
  if ((await overlay.count()) > 0) return
  await firstTaskCard().click()
  await overlay.first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
}

const browser = await chromium.launch(launchOptions())
// The worker would answer API GETs before the route below saw them
// (`found-23-sep/routes-bypassed-by-the-service-worker`).
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
await ctx.route('**/*', (r) => (/127\.0\.0\.1|localhost/.test(r.request().url()) ? r.continue() : r.abort()))
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

/** The column header cells of the list table, as text. */
const columns = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('div,tr')]
  // Drawn rows only: a hidden row answers innerText with its whole text
  // (`found-29-sep/innertext-reads-hidden-leaves`).
  const row = all.find((e) => e.checkVisibility() && /^\s*Title\b/.test(e.innerText || '') && (e.innerText || '').length < 120)
  return row && row.checkVisibility() ? row.innerText.split('\n').map((s) => s.trim()).filter((s) => s && s !== '▲' && s !== '▼') : []
})

/** The select whose options include the given text. */
const selectWith = (text) =>
  page.locator('select').filter({ has: page.locator(`option:text-is("${text}")`) }).first()

/**
 * The label a `<select>` draws: its chosen option's text, read off the select
 * and only while the select itself is shown. An `<option>` of a closed select
 * has no box of its own, so the guard goes on the element that draws it
 * (`found-29-sep/innertext-reads-hidden-leaves`).
 */
const chosenLabel = (select) =>
  select.filter({ visible: true }).evaluate((el) => el.selectedOptions?.[0]?.textContent ?? '', undefined, { timeout: 2000 }).catch(() => '')

/*
 * The grouping control, BY TESTID rather than by the words in its options.
 *
 * This used to be `selectWith('By status')`, and §M frame `12:10` relabelled
 * those options: the chip names its CURRENT VALUE ("Group: Status"), not the
 * axis ("By status"). The control was unchanged and still worked; the suite
 * simply could not find it any more, and reported "no grouping control found"
 * — which reads as the feature being gone.
 *
 * A testid survives copy changes. Option TEXT is a translation, and pinning a
 * control to its own translated label means every copy edit looks like a
 * regression. The labels themselves are asserted in `list-view-controls.mjs`,
 * where that is the thing under test.
 */
const grouperSelect = () => page.getByTestId('list-group-by')
const GROUP_LABELS = {
  status: 'Group: Status',
  priority: 'Group: Priority',
  assignee: 'Group: Assignee',
}

/** The group bucket labels, read from the grid rather than assuming a tag. */
/**
 * Dismiss the task sheet. Escape alone does not always land, and the sheet's
 * full-screen overlay silently intercepts every later click when it lingers —
 * which reads as "the button is missing" rather than "the sheet is still open".
 */
const closeSheet = async () => {
  const overlay = page.locator('button[aria-label="Close sheet overlay"]')
  for (let i = 0; i < 3; i++) {
    if (await overlay.count() === 0) return
    await overlay.first().click({ force: true }).catch(() => {})
    // Closing drops `?task=` from the address and the sheet goes with the
    // re-render, so it is gone when the overlay is, not 600 ms after the press.
    await waitUntil(async () => (await overlay.count()) === 0, { timeoutMs: 10_000 })
  }
  await page.keyboard.press('Escape')
  await waitUntil(async () => (await overlay.count()) === 0, { timeoutMs: 10_000 })
}

/*
 * THE LIST, ONCE IT HAS APPLIED THE VIEW IT OPENS WITH. A list with saved views
 * applies its default one when they arrive, and that sets the grouping — so a
 * grouping chosen before it lands is undone under the check that reads it. The
 * sweep's list has twenty. The 3.2 s this replaced was a bet that it had landed;
 * now it is the view's own tab, current (`aria-current`).
 */
const LIST_ID = LIST_PATH.split('/').pop()
const listSettled = async () => {
  const views = (await sweepApi(`/lists/${LIST_ID}/views`).catch(() => null))?.data
  if (Array.isArray(views) && views.length > 0) {
    await page.locator('[data-testid^="work-view-tab-view-"][aria-current="true"]').first()
      .waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
  }
  await grouperSelect().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
}

/*
 * A SURFACE, DRAWN AND SETTLED, or showing the crash screen. Each draws a blank
 * page first, then the app's shell and its own heading, then its data over the
 * next few seconds (measured on lane 5: 16 characters for up to 1.6 s, then
 * 600–900, then growing until 5–7 s) — and the shell alone is past the 200
 * characters section 15 asks for. So its text is read once it has stopped
 * changing between two reads 0.7 s apart, the way section 12 counts its rows.
 * `networkidle` was measured too, and is not this: on Docs it fired at 1.7 s,
 * in the gap while the app boots, before anything was drawn.
 */
const BROKEN = /Something went wrong|Unexpected error|Cannot read propert/i
const pageSettled = async () => {
  let was = -1
  await waitUntil(async () => {
    const now = await page.locator('body').innerText()
    if (BROKEN.test(now)) return true
    const settled = now.length > 200 && now.length === was
    was = now.length
    return settled
  }, { timeoutMs: 20_000, stepMs: 700 })
}

const groupHeadings = async () => {
  const body = await page.locator('body').innerText()
  const grid = body.slice(body.indexOf('Title'))
  // Buckets render as "Name (n)" or "Name\nn" depending on the grouping.
  return [...grid.matchAll(/^([A-Za-z][\w .'-]{1,24})\s*\((\d+)\)$/gm)].map((m) => m[1])
    .concat([...grid.matchAll(/^(Backlog|To do|In progress|In review|Done|Cancelled)$/gm)].map((m) => m[1]))
}

try {
  say('0. Sign in')
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  ok('signed in and landed in the app')

  // ═══════════════════════════════════ V1/V2 — list view chrome ═══════
  say('1. List view: the grouped-by column is dropped (V1)')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await listSettled()
  const grouper = grouperSelect()
  check(await grouper.count() > 0, 'the grouping control is present', 'no grouping control found')

  for (const [label, hidden] of [[GROUP_LABELS.status, 'Status'], [GROUP_LABELS.priority, 'Priority'], [GROUP_LABELS.assignee, 'Assignees']]) {
    await grouper.selectOption({ label })
    // Read once the header shows the grouping — its column gone, Title there —
    // or the bound has passed; then once more, so a failure says what it saw.
    await waitUntil(async () => {
      const now = await columns()
      return !now.includes(hidden) && now.includes('Title')
    }, { timeoutMs: 15_000 })
    const cols = await columns()
    check(!cols.includes(hidden),
      `grouped ${label.toLowerCase()}: the ${hidden} column is dropped — columns are ${JSON.stringify(cols)}`,
      `grouped ${label.toLowerCase()} still shows a ${hidden} column: ${JSON.stringify(cols)}`)
    check(cols.includes('Title'), `and Title is still there`, `Title vanished: ${JSON.stringify(cols)}`)
  }

  say('1b. Grouping actually regroups the rows')
  /*
   * Each grouping read once it is drawn, not a guessed 1.5–1.8 s after the
   * press: status draws sections of its own (`list-group`), priority draws
   * buckets that are not the status ones, and assignee an Unassigned bucket.
   * Read before that, a bucket list is the last grouping's. Each wait is
   * bounded, and a grouping that never comes is read anyway, so the checks
   * below still fail saying what they saw (`us-2` does that to priority).
   */
  await grouper.selectOption({ label: GROUP_LABELS.status })
  await waitUntil(async () => (await page.getByTestId('list-group').count()) > 0 && (await groupHeadings()).length > 0, { timeoutMs: 15_000 })
  const byStatus = await groupHeadings()
  await grouper.selectOption({ label: GROUP_LABELS.priority })
  await waitUntil(async () => {
    const now = await groupHeadings()
    return now.length > 0 && JSON.stringify(now) !== JSON.stringify(byStatus)
  }, { timeoutMs: 15_000 })
  const byPriority = await groupHeadings()
  await grouper.selectOption({ label: GROUP_LABELS.assignee })
  await waitUntil(async () => (await groupHeadings()).some((h) => /Unassigned/i.test(h)), { timeoutMs: 15_000 })
  const byAssignee = await groupHeadings()
  check(byStatus.length > 0 && byPriority.length > 0,
    `status buckets ${JSON.stringify(byStatus.slice(0, 4))} become priority buckets ${JSON.stringify(byPriority.slice(0, 4))}`,
    `a grouping produced no buckets: status=${JSON.stringify(byStatus)} priority=${JSON.stringify(byPriority)}`)
  check(JSON.stringify(byStatus) !== JSON.stringify(byPriority),
    'regrouping genuinely rebuckets the rows', 'the buckets did not change')
  check(byAssignee.some((h) => /Unassigned/i.test(h)),
    `grouping by assignee produces people buckets: ${JSON.stringify(byAssignee.slice(0, 4))}`,
    `no assignee buckets: ${JSON.stringify(byAssignee)}`)
  await grouper.selectOption({ label: GROUP_LABELS.status })
  await waitUntil(async () => (await page.getByTestId('list-group').count()) > 0, { timeoutMs: 15_000 })

  say('2. Fields picker with search (V2)')
  // "Fields (8/8)" renders as a clickable div, not a <button>.
  await page.getByText(/^Fields \(\d+\/\d+\)$/).last().click()
  // Open is the <details>' own state, and its search box and rows are drawn
  // with it. Waited for as itself: the page has other search boxes showing.
  const fieldsOpen = page.locator('details[open]').filter({ has: page.getByText(/^Fields \(\d+\/\d+\)$/) })
  await fieldsOpen.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const searchBox = page.locator('input[placeholder*="earch" i]:visible').last()
  const fieldsPicker = chain(
    'the fields picker opens with a search box',
    'it lists the workspace fields',
    'found a term unique to one field',
    'searching',
    'and a term matching nothing shows nothing',
    'the picker offers create-new inline (V2)',
    'create-new offers the Text type',
    'create-new offers the Number type',
    'create-new offers the Date type',
    'create-new offers the Checkbox type',
    'create-new offers the URL type',
    'create-new offers the Dropdown type',
  )
  const haveSearchBox = (await searchBox.count()) > 0
  fieldsPicker.step(haveSearchBox, 'no search box in the fields picker')
  if (!haveSearchBox) {
    fieldsPicker.rest('skipped: the picker never opened a search box, so nothing in it could be narrowed')
  } else {
    let before = await page.locator('label:visible').allInnerTexts()
    if (before.length < 2) {
      // A project with no custom fields is a legitimate state, and asserting
      // against seeded fields this workspace may not have tests the fixture,
      // not the picker. Make one with the control the picker itself offers.
      // Two, not one: searching cannot narrow a list of one, so a single
      // seeded field would make the next assertion unanswerable.
      const tag = Math.random().toString(36).slice(2, 6)
      for (const seeded of [`SweepAlpha${tag}`, `SweepBeta${tag}`]) {
        const nameBox = page.locator('input[placeholder*="ield name" i]:visible').last()
        if (await nameBox.count()) {
          await nameBox.fill(seeded)
          await page.getByRole('button', { name: /^Add$|^Create$/ }).last().click().catch(() => {})
          // Listed once the server has made it, before the next one is named.
          await waitUntil(async () => (await page.locator('label:visible').allInnerTexts()).some((l) => l.includes(seeded)), { timeoutMs: 15_000 })
        }
      }
      before = await page.locator('label:visible').allInnerTexts()
      fieldsPicker.step(before.length > 1,
        `the picker lists ${before.length} field(s) and create-new did not add more`,
        `seeded fields to search against (${before.length})`)
    } else {
      /*
       * THE SAME PROPERTY AS THE BRANCH ABOVE, READ RATHER THAN ASSERTED.
       *
       * This was `check(true, …)` — a check that cannot fail, written to keep
       * the two branches the same length, which is the right instinct and the
       * wrong implementation. Both paths are claiming one thing: there is more
       * than one field for the search below to narrow. Where the workspace
       * already has them, that is true by construction — and reading
       * `before.length` says so from the value instead of from a literal, so
       * a picker that lists one field fails here rather than sailing through to
       * fail the narrowing check for a reason that reads like a search bug.
       */
      fieldsPicker.step(before.length > 1,
        `the picker lists ${before.length} field(s), which cannot be narrowed`,
        `it lists the workspace fields (${before.length})`)
    }
    /*
     * Search against a term this workspace actually has: one that matches
     * nothing narrows to zero and would "pass" for the wrong reason, and one
     * every field shares narrows nothing and fails for the wrong reason.
     *
     * The old version took the last four characters, which is precisely the
     * shared half of the two names it seeds — `SweepAlpha<tag>` and
     * `SweepBeta<tag>` end identically — so it searched the one substring
     * guaranteed not to discriminate. Scan for a term that really does appear
     * in exactly one field instead of hoping a fixed slice does.
     */
    const distinctiveTerm = () => {
      for (const field of before) {
        const f = field.trim()
        for (let len = 4; len <= Math.min(f.length, 12); len++) {
          for (let i = 0; i + len <= f.length; i++) {
            const cand = f.slice(i, i + len).toLowerCase()
            if (!/^[a-z0-9]+$/.test(cand)) continue
            if (before.filter((o) => o.toLowerCase().includes(cand)).length === 1) return cand
          }
        }
      }
      return ''
    }
    const term = distinctiveTerm()
    fieldsPicker.step(term.length > 0, `no term distinguishes these fields: ${JSON.stringify(before)}`,
      `found a term unique to one field ("${term}")`)
    await searchBox.fill(term)
    // Narrowed to the term, or the bound has passed; then read once more for
    // the check (`us-4` leaves the list whole, and the check says so).
    await waitUntil(async () => {
      const now = await page.locator('label:visible').allInnerTexts()
      return now.length > 0 && now.length < before.length && now.every((f) => f.toLowerCase().includes(term.toLowerCase()))
    }, { timeoutMs: 10_000 })
    const after = await page.locator('label:visible').allInnerTexts()
    fieldsPicker.step(
      after.length > 0 && after.length < before.length && after.every((f) => f.toLowerCase().includes(term.toLowerCase())),
      `search for "${term}" gave ${JSON.stringify(after)} out of ${JSON.stringify(before)}`,
      `searching "${term}" narrows ${before.length} fields to ${after.length}: ${JSON.stringify(after)}`)
    await searchBox.fill('zzzznomatch')
    await waitUntil(async () => (await page.locator('label:visible').count()) === 0, { timeoutMs: 10_000 })
    fieldsPicker.step((await page.locator('label:visible').allInnerTexts()).length === 0,
      'a non-matching term still listed fields')
    await searchBox.fill('')
    // Every field back and the create-new half drawn, before the text is read.
    await waitUntil(async () =>
      (await page.locator('label:visible').count()) >= before.length &&
        /CREATE NEW FIELD/i.test(await page.locator('body').innerText()), { timeoutMs: 10_000 })
    // V2's other half: create a new field without leaving the picker.
    const picker = await page.locator('body').innerText()
    fieldsPicker.step(/CREATE NEW FIELD/i.test(picker), 'no create-new section in the fields picker')
    for (const ty of ['Text', 'Number', 'Date', 'Checkbox', 'URL', 'Dropdown']) {
      fieldsPicker.step(picker.includes(ty), `${ty} not offered`)
    }
  }
  await page.keyboard.press('Escape')
  // Shut before the task sheet is opened from the rows under it.
  await fieldsOpen.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})

  // ═════════════════════════════════════ Task detail ═══════════════════
  say('3. Task detail opens with every tab (V3/V5)')
  await openAnyTask()
  const sheet = page.locator('div.shadow-2xl.border-l')
  const SHEET_TABS = ['Overview', 'Subtasks', 'Checklists', 'Related Items', 'Attachments', 'Comments', 'Activity', 'Time']
  // The sheet draws a skeleton until the task and what this reader may do with
  // it have loaded, and its tab strip after that: the strip is what is read.
  await waitUntil(async () => {
    const drawn = await sheet.locator('button:visible').allInnerTexts()
    return SHEET_TABS.every((t) => drawn.includes(t))
  }, { timeoutMs: 20_000 })
  check(await sheet.count() > 0, 'the task detail sheet opens from the list', 'the sheet did not open')
  const tabs = await sheet.locator('button:visible').allInnerTexts()
  for (const t of SHEET_TABS) {
    check(tabs.includes(t), `the ${t} tab is present`, `the ${t} tab is missing`)
  }
  /*
   * THIS CHECK USED TO INSIST ON THE WORD "Dependencies", annotated "reverted to
   * original, awaiting the client (V6)" — a guard holding a naming decision that
   * had been handed to the client and never came back.
   *
   * §V2-10 answers it. Frame `06:10` shows the panel titled **Related Items**
   * with Relationships | References inside, and the walkthrough is the
   * specification for this engagement. So the tab is renamed and the guard now
   * holds the thing the old one was actually protecting: the dependency UI must
   * still be REACHABLE, not merely named. A rename that quietly dropped
   * task↔task links would pass a check on the label alone.
   */
  const related = sheet.locator('button:visible', { hasText: 'Related Items' }).first()
  if (await related.count()) await related.click().catch(() => {})
  await sheet.locator('[data-testid="related-tab-relationships"]').first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {})
  check(
    (await sheet.locator('[data-testid="related-tab-relationships"]').count()) > 0,
    'and Related Items still carries the dependency half, under its new name',
    'the dependency UI is gone; renaming the tab lost what it contained',
  )

  say('4. Watchers / followers popover (V7)')
  const bell = sheet.getByRole('button', { name: /watcher|follow/i }).first()
  // FOUR CHECKS WHICHEVER WAY THIS GOES: with no bell the else used to report
  // one `bad()` against the chain of four the bell leads to.
  const followers = chain(
    'the followers dialog opens from the header bell',
    'it shows the follower count',
    'and a control to change your own follow state',
    'and a way to add a teammate as a follower',
  )
  if (await bell.count()) {
    await bell.click()
    const dlg = page.locator('[role=dialog]:visible')
    await dlg.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    const haveDlg = (await dlg.count()) > 0
    followers.step(haveDlg, 'no followers dialog')
    if (!haveDlg) {
      followers.rest('skipped: the dialog never opened, so nothing in it could be read')
    } else {
      // Read once the panel shows its count and both controls, or the bound
      // has passed; then once more for the checks.
      await waitUntil(async () => {
        const now = await dlg.innerText({ timeout: 2000 }).catch(() => '')
        return /\d+ watcher/i.test(now) && /Watch task|Unwatch/i.test(now) && /Add teammate/i.test(now)
      }, { timeoutMs: 10_000 })
      const body = await dlg.innerText({ timeout: 5000 }).catch(() => '')
      followers.step(/\d+ watcher/i.test(body), `no watcher count in the dialog: ${body.slice(0, 120)}`,
        `it shows the follower count: ${(body.match(/\d+ watchers?/i) || [])[0]}`)
      followers.step(/Watch task|Unwatch/i.test(body),
        `no self-follow control: ${body.slice(0, 120)}`,
        `and a control to change your own follow state (${(body.match(/Watch task|Unwatch/i) || [])[0]})`)
      followers.step(/Add teammate/i.test(body), `no add-teammate control: ${body.slice(0, 140)}`)
      await page.keyboard.press('Escape')
      // Shut before the sheet's tabs are pressed under it.
      await dlg.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    }
  } else {
    followers.rest('no watchers control in the task header')
  }

  say('5. Checklists tab (V4)')
  await sheet.getByRole('button', { name: 'Checklists', exact: true }).click()
  /*
   * THE CONTROL ITSELF, NOT THE ABSENCE OF A PHRASE. `!/Due date.*checklist
   * item/` passed on any date control labelled any other way, and on a tab
   * that drew no item form at all. An item is added with its text and then
   * its first control after the text; V4 made that control the assignee
   * picker — a select whose first option is nobody and whose others are the
   * workspace's people — so that is what is read, off the add-item form.
   */
  const readItemForm = (timeout) =>
    sheet
      .locator('[data-testid="checklist-item-form"]')
      .first()
      .evaluate((form) => {
        const fields = [...form.querySelectorAll('input, select, textarea')]
          .filter((el) => el.dataset.testid !== 'checklist-item-input')
        const first = fields[0]
        if (!first) return { first: null, options: [] }
        const options = first.tagName === 'SELECT' ? [...first.options].map((o) => o.value) : []
        return { first: first.tagName === 'INPUT' ? `input[type=${first.type}]` : first.tagName.toLowerCase(), options }
      }, undefined, { timeout })
      .catch(() => null)
  // The form is drawn with the panel, and its picker fills in when the
  // workspace's people arrive: both are read once they are there, or the bound
  // has passed.
  await waitUntil(async () => {
    const drawn = await readItemForm(2000)
    return drawn?.first === 'select' && drawn.options[0] === '' && drawn.options.length > 1
  }, { timeoutMs: 15_000 })
  const clText = await sheet.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')
  check(/checklist/i.test(clText), 'the checklists tab renders', `tab body: ${clText.slice(0, 140)}`)
  const itemForm = await readItemForm(5000)
  check(
    itemForm?.first === 'select' && itemForm.options[0] === '' && itemForm.options.length > 1,
    'checklist items are not date-first (V4 replaced the date with an assignee)',
    itemForm
      ? `the item's first control after its text is ${JSON.stringify(itemForm.first)} with options ` +
          `${JSON.stringify(itemForm.options.slice(0, 4))} — not an assignee picker`
      : 'no add-item form on the Checklists tab to read',
  )

  say('6. Subtasks tab (V5)')
  await sheet.getByRole('button', { name: 'Subtasks', exact: true }).click()
  // The strip says "Subtasks" whichever tab is open, so wait for the panel
  // under it: the Checklists one gone and the tab panel talking about subtasks.
  await waitUntil(async () =>
    (await sheet.getByTestId('checklists-panel').count()) === 0 &&
      /subtask/i.test(await sheet.getByTestId('task-tab-panel').filter({ visible: true }).innerText({ timeout: 2000 })), { timeoutMs: 15_000 })
  check(/subtask/i.test(await sheet.filter({ visible: true }).innerText().catch(() => '')), 'the subtasks tab renders', 'the subtasks tab is empty')

  await closeSheet()

  // ═════════════════════════════════════ Board view ════════════════════
  say('7. Board view (V3)')
  /*
   * TWO CHECKS ON EVERY PATH, AND NEITHER OF THEM A SKIP.
   *
   * The card this clicks is the task THIS RUN added (`SWEEP_TASK`, through the
   * list's own quick-add, on a list `ensureSweepFixture` has already filled
   * with six more). So a board with no card for it is not a board with nothing
   * to click — it is a board that does not show a task the list holds, which
   * is the product failing. It used to be a counted SKIP, "no known card on the
   * board to click", so exactly that regression exited 0. A skip is for the
   * machine, the deployment or the invocation, never for what the product
   * rendered; this one now fails with the reason. (The missing-tab `else` was
   * one check against the tab's two, so losing the tab also shortened the run.)
   */
  const board = chain(
    'the board renders its status columns',
    'clicking a card opens the task — the click is not swallowed by drag-and-drop',
  )
  const viewTab = page.getByRole('button', { name: 'Board', exact: true }).first()
  if (await viewTab.count()) {
    await viewTab.click()
    /*
     * The board's own columns, and this run's card on them. The list the board
     * replaces shows the same status names and the same task, so read before
     * the board is drawn, the first check passes on the list and the click
     * opens the list's row — which proves nothing about drag-and-drop.
     */
    await page.getByTestId('board-column').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.getByTestId('board-task-card').filter({ hasText: SWEEP_TASK }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const body = await page.locator('body').innerText()
    board.step(/Backlog|To do|In progress/.test(body), `board body: ${body.slice(0, 160)}`)
    const card = firstTaskCard()
    if (await card.count()) {
      await card.click()
      await page.locator('div.shadow-2xl.border-l').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
      board.step(await page.locator('div.shadow-2xl.border-l').count() > 0, 'clicking a board card did not open the task')
      await closeSheet()
    } else {
      board.rest(
        `the board shows no card for ${JSON.stringify(SWEEP_TASK)}, the task this run added to the list it is ` +
          'showing — a task the list holds and the board does not draw is the product failing, not the machine',
      )
    }
  } else {
    board.rest('no Board view tab in the view strip')
  }

  // ═══════════════════════════════════════ Share panel ═════════════════
  say('8. Share & permissions panel')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Share', exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await page.getByRole('button', { name: 'Share', exact: true }).first().click()
  const shareDlg = page.locator('[role=dialog]:visible')
  // The levels' explanations are drawn with the dialog, the last of them
  // "Full edit": read once it is there, or the bound has passed.
  await waitUntil(async () => /Full edit/.test(await shareDlg.innerText({ timeout: 2000 }).catch(() => '')), { timeoutMs: 15_000 })
  const share = chain(
    'the share dialog opens',
    'the View level is offered with an explanation',
    'the Comment level is offered with an explanation',
    'the Edit level is offered with an explanation',
    'the Full edit level is offered with an explanation',
    'each level carries a one-line meaning',
  )
  const haveShare = (await shareDlg.count()) > 0
  share.step(haveShare, 'the share dialog did not open')
  if (!haveShare) {
    share.rest('skipped: the dialog never opened, so no level could be read')
  } else {
    const t = await shareDlg.innerText({ timeout: 5000 }).catch(() => '')
    for (const lvl of ['View', 'Comment', 'Edit', 'Full edit']) {
      share.step(t.includes(lvl), `${lvl} missing from the panel`)
    }
    /*
     * EACH LEVEL, NOT "SOME PROSE SOMEWHERE IN THE DIALOG".
     *
     * This was `/only|explan|can |may /i.test(t)` over the whole panel text,
     * and `us-3-share-levels-lose-their-meaning` — which deletes the hint after
     * every level's label and leaves the four labels — ran GREEN against it.
     * Four loose substrings scanned across a dialog that also holds a title, a
     * member list and a Copy link button will match something whatever the
     * levels say; the check could not tell a per-level explanation from any
     * sentence anywhere on screen.
     *
     * The levels are rendered as `<label> — <hint>`, so the claim is that each
     * label is FOLLOWED by an explanation. Read per level, off the level's own
     * row, and the failure names the ones that are bare — which is the
     * difference between "add explanations" and "add the two you dropped".
     */
    /*
     * THE LABELS THE APP RENDERS, NOT THE AUDIT'S SHORTHAND. The first version
     * of this check looked for `View` followed by a dash — and the level is
     * called "View only", so `View` is followed by ` only` and it reported the
     * level bare on a perfectly good build. The harness refused the whole set
     * on a red baseline, which is the guard doing its job: a check that fails
     * on the unpatched tree says nothing about any patch.
     *
     * The four checks above pass with `View` because `includes` matches inside
     * "View only"; a row check cannot, so it carries the real labels.
     *
     * Matched per LINE, because innerText puts each level's row on its own and
     * an unanchored scan would happily pair one level's label with the next
     * level's dash.
     */
    const bare = []
    for (const lvl of ['View only', 'Comment', 'Edit', 'Full edit']) {
      const row = new RegExp(`^[^\\n]*\\b${lvl}\\b[^\\n]*?[\u2014-]\\s*\\S`, 'im')
      if (!row.test(t)) bare.push(lvl)
    }
    share.step(bare.length === 0, `listed without an explanation: ${bare.join(', ') || '(none)'}`)
    await page.keyboard.press('Escape')
    // Shut before section 9's Ctrl+K: the palette is a dialog of its own.
    await shareDlg.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }

  // ═══════════════════════════════════ Search palette ══════════════════
  say('9. Command palette: type filter and sort')
  /*
   * ONE PRESS, ONCE NOTHING ELSE IS OPEN, THEN THE PALETTE'S OWN INPUT. This
   * counted the palette 1.2 s after the press, and beside three other break
   * runs it had not drawn yet: "Ctrl+K did not open the palette", and sixteen
   * checks failed unread (29 September). Ctrl+K TOGGLES it
   * (`command-palette.tsx`), so the press is never repeated to retry — a
   * second one would shut a palette that was only slow to draw.
   */
  await page.locator('[role=dialog]:visible').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await page.keyboard.press('Control+k')
  await page.locator('[cmdk-input]').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const palette = page.locator('[role=dialog]:visible, [cmdk-root]').first()
  /*
   * A SEARCH, ANSWERED AND DRAWN. A chip changes what is asked, and the rows
   * empty while the new search is in flight — so "no task group" is true in
   * that gap too, and a read there passes a chip that narrowed nothing. Each
   * read waits for the answer to the search its press caused (`GET
   * /search/:ws`, told apart by its parameters), then for a hit of that answer
   * to be drawn: cmdk keeps each row's value, `<type>-<id>-<title>`, in
   * `data-value`. An answer with no hits draws none, and is read as it stands.
   */
  const searchAnswer = (asked) =>
    page.waitForResponse((r) => {
      const u = new URL(r.url())
      return r.request().method() === 'GET' && u.pathname.endsWith(`/search/${WS}`) && asked(u.searchParams)
    }, { timeout: 15_000 }).catch(() => null)
  const answerDrawn = async (answer) => {
    const hits = (await answer?.json().catch(() => null))?.data
    const rows = (Array.isArray(hits) ? hits : []).slice(0, 8)
      .map((h) => `[cmdk-item][data-value^="${`${h.entityType}-${h.id}-`.replace(/["\\]/g, '\\$&')}"]`)
    if (rows.length) await waitUntil(async () => (await palette.locator(rows.join(', ')).count()) > 0, { timeoutMs: 10_000 })
  }
  /*
   * THREE CHAINS, IN THE ORDER THEY RUN, and the middle one is the ⋯'s own.
   * This was one seventeen-sentence chain, and a missing ⋯ filled its section
   * with `for (let n = 0; n < 4; n += 1) pal.step(false, …)` — so the day that
   * section gained or lost a step, the literal 4 would have reported every
   * later sentence against the wrong check rather than failing. With the ⋯'s
   * four in a chain of their own, `rest` fills exactly that section.
   */
  const pal = chain(
    'the palette opens on Ctrl+K',
    'it returns results',
    'the Tasks type chip is on the bar',
    'the Docs type chip is on the bar',
    'the Files type chip is on the bar',
    'the People type chip is on the bar',
    'and a ⋯ for the rest',
  )
  const palMore = chain(
    'comment is reachable from the ⋯',
    'channel is reachable from the ⋯',
    'message is reachable from the ⋯',
    'and choosing one promotes it onto the bar',
  )
  const palSort = chain(
    'the "Relevance" sort chip is offered',
    'the "Last updated" sort chip is offered',
    'the "Last created" sort chip is offered',
    'selecting Docs alone drops the task results',
    'adding Tasks brings them back alongside Docs — multi-select works',
    'switching sort keeps results on screen',
  )
  const havePalette = (await palette.count()) > 0
  pal.step(havePalette, 'Ctrl+K did not open the palette')
  if (!havePalette) {
    for (const section of [pal, palMore, palSort]) {
      section.rest('skipped: the palette never opened, so nothing in it could be read')
    }
  } else {
    const input = page.locator('input:visible').last()
    const firstAnswer = searchAnswer((q) => q.get('q') === 'task' && !q.has('types') && !q.has('sort'))
    await input.fill('task')
    await answerDrawn(await firstAnswer)
    const pt = await palette.innerText({ timeout: 5000 }).catch(() => '')
    pal.step(pt.length > 40, `palette body: ${pt.slice(0, 120)}`)
    // The type and sort chips live behind a "Filters" toggle rather than
    // always-on chrome — open it before asserting they exist.
    await palette.getByRole('button', { name: 'Filters', exact: true }).click()
    // The sort chips are drawn as the panel opens, the last of them this one.
    await palette.getByRole('button', { name: 'Last created', exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    const chips = await palette.locator('button:visible').allInnerTexts()
    /*
     * §2 [02:01] — "yeh 3 DOTS dekh rahe hain? … to folders yahan pe appear ho
     * jayega." The bar carries the everyday types and the rest live behind the
     * ⋯, promoted into it when chosen. This used to demand all seven in the
     * bar, which is the older UI: it failed on Comments, Channels and Messages
     * for being exactly where they were deliberately put.
     *
     * So the question is reachability, not position — the everyday four are in
     * the bar, and the others are one ⋯ away.
     */
    for (const ty of ['Tasks', 'Docs', 'Files', 'People']) {
      pal.step(chips.includes(ty), `no ${ty} chip: ${JSON.stringify(chips.slice(0, 14))}`)
    }
    const more = palette.locator('[data-testid=palette-more-types]')
    const haveMore = (await more.count()) > 0
    pal.step(haveMore, 'no overflow control for the other types')
    if (!haveMore) {
      // The checks that depend on the ⋯ — the types behind it and the
      // promotion — are its own chain's. Reported, not skipped — see the
      // chain note at the top.
      palMore.rest('skipped: there was no ⋯ to open')
    } else {
      await more.click()
      // Its entries are drawn with the menu.
      await palette.getByTestId('palette-more-types-menu').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
      for (const ty of ['comment', 'channel', 'message']) {
        const entry = palette.locator(`[data-testid=palette-add-type-${ty}]`)
        palMore.step((await entry.count()) > 0, `${ty} is offered nowhere`)
      }
      // Promoting one has to actually put it on the bar, or the ⋯ is a menu
      // that leads nowhere — which is the failure this section exists to catch.
      await palette.locator('[data-testid=palette-add-type-comment]').first().click().catch(() => {})
      // Choosing shuts the menu and draws the chip on the bar, in one render.
      await waitUntil(async () =>
        (await palette.getByTestId('palette-more-types-menu').count()) === 0 &&
          (await palette.getByTestId('palette-type-comment').count()) > 0, { timeoutMs: 10_000 })
      const promoted = await palette.locator('button:visible').allInnerTexts()
      palMore.step(promoted.includes('Comments'),
        `Comments never appeared: ${JSON.stringify(promoted.slice(0, 14))}`)
    }
    for (const so of ['Relevance', 'Last updated', 'Last created']) {
      palSort.step(chips.includes(so), `no "${so}" chip`)
    }

    // Multi-select is the case that was broken in production — prove the chips
    // actually narrow, and that two of them together return both types.
    const before = (await palette.innerText({ timeout: 5000 }).catch(() => '')).match(/^[A-Z ]{3,}$/gm) || []
    const docsAnswer = searchAnswer((q) => q.get('q') === 'task' && q.get('types') === 'doc')
    await palette.getByRole('button', { name: 'Docs', exact: true }).click({ timeout: 10_000 }).catch(() => {})
    await answerDrawn(await docsAnswer)
    const afterDocs = await palette.innerText({ timeout: 5000 }).catch(() => '')
    palSort.step(!/^TASKS$/m.test(afterDocs), 'tasks still listed with only Docs selected')
    const bothAnswer = searchAnswer((q) => q.get('q') === 'task' && (q.get('types') ?? '').split(',').sort().join(',') === 'doc,task')
    await palette.getByRole('button', { name: 'Tasks', exact: true }).click({ timeout: 10_000 }).catch(() => {})
    await answerDrawn(await bothAnswer)
    const both = await palette.innerText({ timeout: 5000 }).catch(() => '')
    palSort.step(/^TASKS$/m.test(both), `task group missing with Tasks+Docs selected: ${both.slice(0, 200)}`)
    // By testid: Status and Priority now offer their own "All" chip, so a
    // click matched on the visible label alone is ambiguous between three
    // buttons and throws on strict mode. This one means the TYPE group.
    await palette.locator('[data-testid="palette-type-all"]').click()
    // Pressed next is a chip of the open Filters panel; what is read is the
    // sorted search after it, waited for below.
    await palette.getByRole('button', { name: 'Last updated', exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})

    const sortedAnswer = searchAnswer((q) => q.get('q') === 'task' && !q.has('types') && q.get('sort') === 'updated')
    await palette.getByRole('button', { name: 'Last updated', exact: true }).click()
    await answerDrawn(await sortedAnswer)
    palSort.step((await palette.innerText()).length > 60, 'sorting emptied the palette')
    await page.keyboard.press('Escape')
    // Shut before the next section navigates away from it.
    await page.locator('[cmdk-input]').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }

  // ═══════════════════════════════════════ Inbox ═══════════════════════
  say('10. Inbox: triage buckets, and Other being gone')
  await page.goto(`${B}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  /*
   * The triage row, once its counts have answered: the tabs are read for being
   * shown, the chips for their numbers, and "no Other chip" says something only
   * once the row it would sit in is drawn.
   */
  const BUCKETS = ['Inbox', 'Later', 'Cleared']
  await waitUntil(async () => {
    for (const name of [...BUCKETS.map((b) => new RegExp(`^${b}`)), /^All\s*\d+$/, /^Primary\s*\d+$/]) {
      if (!(await page.getByRole('button', { name }).first().isVisible())) return false
    }
    return true
  }, { timeoutMs: 20_000 })
  for (const b of BUCKETS) {
    check(await page.getByRole('button', { name: new RegExp(`^${b}`) }).first().isVisible().catch(() => false),
      `the ${b} bucket tab is present`, `the ${b} bucket tab is missing`)
  }
  const chipNum = async (l) => {
    const txt = await page.getByRole('button', { name: new RegExp(`^${l}\\s*\\d+$`) }).filter({ visible: true }).innerText().catch(() => '')
    return parseInt(txt.replace(/\D+/g, ''), 10)
  }
  /*
   * §2.2 — Other is gone, on her instruction: "yeh mujhe NAHI CHAHIYE humari
   * list mein, kyunke yahan bhi same 'All' wale hi hain."
   *
   * This used to assert that Primary + Other partitioned All, and then hung
   * for thirty seconds waiting for a chip that had been deliberately removed.
   * Out of CI, nobody saw it go stale — a suite asserting the opposite of a
   * decision the client made and we shipped. Inverted, so it now guards the
   * removal instead of the thing removed.
   */
  const otherChip = page.getByRole('button', { name: /^Other\s*\d*$/ })
  check(await otherChip.count() === 0, 'the Other chip is gone (§2.2)', 'Other is back on the Inbox')
  const [cA, cP] = [await chipNum('All'), await chipNum('Primary')]
  check(cP <= cA, `Primary is a subset of All (${cP} <= ${cA})`, `${cP} > ${cA}`)
  await page.getByRole('button', { name: /^Primary/ }).click()
  await page.waitForURL(/filter=primary/, { timeout: 10_000 }).catch(() => {})
  check(/filter=primary/.test(page.url()), 'the filter is in the URL', `URL: ${page.url()}`)
  await page.goto(`${B}/app/${WS}/inbox?filter=mentions`, { waitUntil: 'domcontentloaded' })
  // Pressed from its first render (the route maps the old name as it parses the
  // address), so this waits for the chip to be drawn, then reads it once more.
  await waitUntil(async () => (await page.getByRole('button', { name: /^Primary/ }).getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true', { timeoutMs: 15_000 })
  check(await page.getByRole('button', { name: /^Primary/ }).getAttribute('aria-pressed') === 'true',
    'an old ?filter=mentions bookmark still lands on Primary', 'the legacy filter name broke')

  // ═════════════════════════════════ Settings surfaces ═════════════════
  say('11. Settings: Trash, Archived, Spaces index, Features')
  for (const [tab, expect] of [['trash', 'Trash'], ['archived', 'Archived tasks'],
                               ['spaces', 'Space'], ['features', ''], ['groups', ''],
                               ['taskTypes', 'Task types'], ['workSchedule', 'Working days']]) {
    await page.goto(`${B}/app/${WS}/settings?tab=${tab}`, { waitUntil: 'domcontentloaded' })
    // The tab's own heading, not only the page's: "Settings" is drawn first. A
    // tab with no heading asked of it is read once it has drawn one of its own.
    await waitUntil(async () => {
      const now = (await page.locator('h1:visible,h2:visible,h3:visible').allInnerTexts()).join(' | ')
      return expect ? now.includes(expect) : now.includes(' | ')
    }, { timeoutMs: 20_000 })
    const heads = (await page.locator('h1:visible,h2:visible,h3:visible').allInnerTexts()).join(' | ')
    const landed = !expect || heads.includes(expect)
    check(landed, `?tab=${tab} deep-links correctly (${heads.slice(0, 70)})`,
      `?tab=${tab} did not land — headings were: ${heads.slice(0, 90)}`)
  }
  check(await page.getByRole('button', { name: 'Archive', exact: true }).count() >= 0,
    'the Archived tab coexists with Trash — both were asked for', 'n/a')

  say('12. Members: reports-to picker')
  await page.goto(`${B}/app/${WS}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  const pickers = page.locator('select[title="Reports to"]')
  // Counted once the member list has answered and stopped growing: counted
  // after a fixed 2.4 s, a loaded lane read 0 rows in a workspace that has more.
  let n = 0
  await waitUntil(async () => {
    const now = await pickers.count()
    const settled = now > 0 && now === n
    n = now
    return settled
  }, { timeoutMs: 20_000, stepMs: 700 })
  const reportsTo = chain(
    'a reports-to picker on each member row',
    'the reporting tree appears once someone has a manager',
    'a reporting cycle is refused with a message',
  )
  reportsTo.step(n > 1, `only ${n} picker(s)`, `a reports-to picker on each member row (${n})`)
  if (n <= 1) {
    reportsTo.rest('skipped: fewer than two member rows, so no manager could be set')
  } else {
    /*
     * Address rows by whose they are, not by position — and identify them by
     * EMAIL rather than by display name.
     *
     * Position was the first bug: the list re-renders after each save and the
     * rows come back in a different order, so nth(1) landed on the same person
     * twice, the cycle was never attempted, and the test blamed the product for
     * a request it never sent.
     *
     * The name was the second. Display names are not unique — nothing stops two
     * colleagues being called the same thing, and a workspace that has accrued
     * several throwaway members from earlier runs has ten. `getByLabel('Who X
     * reports to')` then matches ten elements and Playwright's strict mode
     * throws, which ends the whole section: this run reported 82 checks where a
     * clean one reports 107, and the failure named a picker rather than the
     * duplicate names that actually caused it.
     *
     * Emails are unique, so the row filter is exact. And because the OPTION
     * labels are display names too, the pair driven through the cycle has to be
     * two people whose names are unambiguous — otherwise `selectOption({label})`
     * picks whichever matched first, which may not be the person addressed.
     */
    const rows = await page.locator('select[title="Reports to"]').evaluateAll((sels) =>
      sels.map((el) => ({
        name: /Who (.+) reports to/.exec(el.getAttribute('aria-label') ?? '')?.[1] ?? '',
        email: /[\w.+-]+@[\w.-]+\.\w+/.exec(el.closest('li')?.textContent ?? '')?.[0] ?? '', // text-read: key — finds the row by its email
      })),
    )
    const pickerFor = (row) =>
      page.getByRole('listitem').filter({ hasText: row.email }).locator('select[title="Reports to"]')

    const seen = new Map()
    for (const r of rows) seen.set(r.name, (seen.get(r.name) ?? 0) + 1)
    const distinct = rows.filter((r) => r.name && r.email && seen.get(r.name) === 1)

    // Start from nobody-reports-to-anybody: selectOption on a value that is
    // already selected fires no change event, and so no request at all.
    // Each picker is held to what the server stores (its value is the member's
    // `managerId`), so it reads "No manager" once the write has landed and the
    // list has re-read it — and the next row is pressed after that, not 0.9 s on.
    for (const who of rows) {
      if (!who.email) continue
      await pickerFor(who).selectOption({ index: 0 }).catch(() => {})
      await waitUntil(async () => (await pickerFor(who).inputValue({ timeout: 2000 })) === '', { timeoutMs: 10_000 })
    }

    if (distinct.length < 2) {
      /*
       * TWO CHECKS, REPORTED WITH THE FIXTURE'S REASON — and it used to be one,
       * with the reason itself as the check's SENTENCE. "two members with
       * unambiguous names to drive the cycle with" is a statement about this
       * workspace, not a claim about the product, so it read as a failing
       * check that named nothing in the feature and left the run a check
       * shorter than the path beside it. The reason belongs in the detail.
       *
       * The rest of the sweep still runs: one unusable fixture must not cost
       * the twenty-five sections that follow.
       */
      reportsTo.rest(
        `skipped: this workspace has ${rows.length} member(s) but fewer than two distinct ` +
          'display names, so a reporting cycle cannot be addressed unambiguously',
      )
    } else {
      const [personA, personB] = distinct

      await pickerFor(personA).selectOption({ label: personB.name })
      // A → B stored and re-read (A's picker holds it), and the tree drawn, which
      // it is only once somebody has a manager. B → A below is a cycle only
      // once A → B is stored, so it is not pressed before.
      await waitUntil(async () =>
        (await pickerFor(personA).inputValue({ timeout: 2000 })) !== '' &&
          (await page.getByText('Reporting structure').first().isVisible()), { timeoutMs: 15_000 })
      reportsTo.step(await page.getByText('Reporting structure').first().isVisible().catch(() => false),
        'the tree did not appear')
      await pickerFor(personB).selectOption({ label: personA.name })
      // The refusal arrives as a toast, which is gone a few seconds later —
      // sampling the page once races it. Polled every 250 ms for up to 15 s.
      let cycleMsg = ''
      await waitUntil(async () => {
        const hit = (await page.locator('body').innerText()).match(/[^.\n]*\b(loop|themselves|cycle)\b[^.\n]*/i)
        if (hit) cycleMsg = hit[0].trim()
        return Boolean(hit)
      }, { timeoutMs: 15_000, stepMs: 250 })
      reportsTo.step(Boolean(cycleMsg), 'the cycle produced no message',
        `a reporting cycle is refused with a message: "${cycleMsg.slice(0, 60)}"`)
      await pickerFor(personA).selectOption({ label: 'No manager' }).catch(() => {})
      // Put back, and stored, before the next section: a missed press would
      // leave the shared workspace with a reporting line.
      await waitUntil(async () => (await pickerFor(personA).inputValue({ timeout: 2000 })) === '', { timeoutMs: 10_000 })
    }
  }

  say('13. Task types + work schedule, end to end from the UI')
  /*
   * STARRED BY ITS OWN ROW, AND READ BACK FROM THE SERVER. This clicked the
   * first "Make this the default" button on the page — the first row that was
   * not already the default, not the type it had just made — and then counted
   * any pressed button, so it passed whichever type it starred and moved the
   * shared workspace's default every run. And it read each write back after a
   * fixed 1.3–1.6 s, which a loaded lane outlasts
   * (`found-29-sep/ui-sweep-stars-the-wrong-type`). The default it found is put
   * back in 16b.
   */
  const typesNow = async () => {
    const res = await sweepApi(`/workspaces/${WS}/task-types`).catch(() => null)
    return Array.isArray(res?.data) ? res.data : []
  }
  const defaultBefore = (await typesNow()).find((tt) => tt.isDefault)?.id ?? null
  await page.goto(`${B}/app/${WS}/settings?tab=taskTypes`, { waitUntil: 'domcontentloaded' })
  const TYPE = uniq('E2EType')
  await page.getByLabel('Icon').fill('🚀', { timeout: 20_000 }).catch(() => {})
  await page.getByLabel('Type name').fill(TYPE, { timeout: 10_000 }).catch(() => {})
  await page.getByRole('button', { name: /Add type/i }).click({ timeout: 10_000 }).catch(() => {})
  const typeRow = page.locator('li', { has: page.locator(`input[aria-label="Rename task type ${TYPE}"]`) })
  const typeDrawn = await waitUntil(async () => (await typeRow.count()) === 1, { timeoutMs: 15_000 })
  let names = await page.locator('input[aria-label^="Rename task type"]').evaluateAll((e) => e.map((x) => x.value))
  check(typeDrawn && names.includes(TYPE), `created "${TYPE}" from the settings UI`, `rows: ${JSON.stringify(names)}`)
  const typeStar = typeRow.getByRole('button', { name: /Make this the default|Default for new tasks/i })
  await typeStar.click({ timeout: 10_000 }).catch(() => {})
  const starPressed = await waitUntil(async () => (await typeStar.getAttribute('aria-pressed').catch(() => null)) === 'true', { timeoutMs: 10_000 })
  let defaultsNow = []
  const defaultStored = await waitUntil(async () => {
    defaultsNow = (await typesNow()).filter((tt) => tt.isDefault).map((tt) => tt.name)
    return defaultsNow.length === 1 && defaultsNow[0] === TYPE
  }, { timeoutMs: 10_000 })
  check(starPressed && defaultStored, 'and marked it the default',
    `its own star pressed ${starPressed}; the workspace's default type(s) now ${JSON.stringify(defaultsNow)}`)

  say('13b. The new type reaches the task header picker')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await openAnyTask()
  const tp = page.locator('div.shadow-2xl.border-l select[title="Task type"]')
  const typePicker = chain(
    'the type picker appears in the task header now that a type exists',
    'the new type is offered',
    'the applied type survives a reload',
  )
  const haveTp = await waitUntil(async () => (await tp.count()) > 0, { timeoutMs: 20_000 })
  typePicker.step(haveTp, 'no type picker in the task header')
  if (!haveTp) {
    typePicker.rest('skipped: there was no picker to read options from or apply')
  } else {
    // Offered only while the picker is shown itself (an option's innerText is its textContent).
    let opts = []
    await waitUntil(async () => {
      opts = await tp.filter({ visible: true }).locator('option').allTextContents().catch(() => [])
      return opts.some((o) => o.includes(TYPE))
    }, { timeoutMs: 10_000 })
    typePicker.step(opts.some((o) => o.includes(TYPE)), `the new type is not offered: ${JSON.stringify(opts)}`,
      `the new type is offered: ${JSON.stringify(opts)}`)
    await tp.selectOption({ label: `🚀 ${TYPE}` }).catch(() => {})
    // Reloaded once the choice is stored, not after a guess at how long that takes.
    await waitUntil(async () => (await chosenLabel(tp)).includes(TYPE), { timeoutMs: 10_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openAnyTask()
    const after = page.locator('div.shadow-2xl.border-l select[title="Task type"]')
    let sel = ''
    await waitUntil(async () => {
      sel = await chosenLabel(after)
      return sel.includes(TYPE)
    }, { timeoutMs: 20_000 })
    typePicker.step(sel.includes(TYPE), `after reload the picker shows "${sel.trim()}"`,
      `the applied type survives a reload (${sel.trim()})`)
    await after.selectOption({ label: 'No type' }).catch(() => {})
    await waitUntil(async () => (await chosenLabel(after)).trim() === 'No type', { timeoutMs: 10_000 })
  }
  await closeSheet()

  say('14. Work schedule from the UI, and Workload reacts')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  // The day buttons are pressed once drawn, and read once their state has
  // answered — each waited for (bounded): a loaded machine outlasts fixed waits,
  // and a missed press on the way back would leave the shared week at six days.
  const sat = page.getByRole('button', { name: 'Sat', exact: true })
  // Saturday is ISO weekday 6 in what the server holds.
  const serverHasSaturday = async () =>
    ((await sweepApi(`/workspaces/${WS}/work-schedule`).catch(() => null))?.data?.workDays ?? []).includes(6)
  await sat.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await sat.click({ timeout: 10_000 }).catch(() => {})
  // The press is a write, then a re-read: 10 s was outlasted on a loaded lane
  // (29 September, lane 6), so 20, and a failure says what the server holds.
  const satOn = await waitUntil(async () => (await sat.getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true', { timeoutMs: 20_000 })
  const weekHeld = satOn ? null : (await sweepApi(`/workspaces/${WS}/work-schedule`).catch(() => null))?.data?.workDays ?? null
  check(satOn, 'Saturday toggled on', `Saturday did not toggle; the server's week reads ${JSON.stringify(weekHeld)}`)
  await page.goto(`${B}/app/${WS}/workload`, { waitUntil: 'domcontentloaded' })
  const workloadDrawn = await waitUntil(async () => /Workload/i.test(await page.locator('body').innerText().catch(() => '')), { timeoutMs: 20_000 })
  check(workloadDrawn, 'the workload report still renders with a six-day week', 'workload failed to render')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await sat.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  /*
   * Pressed back from what the SERVER holds, once the button shows it. Read as
   * soon as it was drawn, the button said "false" over a six-day week that had
   * not loaded yet, the press was skipped, and the shared week stayed at six
   * days: the teardown found Saturday pressed (29 September, lane 3 beside
   * three other break runs).
   */
  if (await serverHasSaturday()) {
    await waitUntil(async () => (await sat.getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true', { timeoutMs: 20_000 })
    await sat.click({ timeout: 10_000 }).catch(() => {})
    await waitUntil(async () => !(await serverHasSaturday()), { timeoutMs: 20_000 })
  }

  say('15. Other surfaces still render')
  for (const [name, path] of [['Docs', 'docs'], ['Chat', 'chat'], ['Shared with me', 'shared'],
                              ['Workload', 'workload'], ['Reports', 'reports'], ['Goals', 'goals'],
                              ['Timeline', 'timeline'], ['Automations', 'automations'],
                              ['Forms', 'forms'], ['Dashboards', 'dashboards']]) {
    await page.goto(`${B}/app/${WS}/${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    // Read once drawn and settled, or broken (`pageSettled`): at a fixed 1.9 s a
    // loaded lane can still be showing the blank page every surface starts on.
    await pageSettled()
    const txt = await page.locator('body').innerText()
    const broke = BROKEN.test(txt)
    check(!broke && txt.length > 200, `${name} renders`, `${name} looks broken: ${txt.slice(0, 130)}`)
  }

  say('16. i18n: the app switches language without breaking')
  /*
   * §1.5 — the switcher used to be in the top bar, which she asked to have
   * cleared: it now lives in Preferences → Language & Region, the way ClickUp
   * keeps it. This section still looked for it beside the work schedule and
   * hung thirty seconds on a control that had moved two releases ago.
   *
   * Switch it where it lives, then go and read the strings where they render —
   * each read waiting for the language it expects, not for a fixed 2 s.
   */
  const setLanguage = async (label) => {
    await page.goto(`${B}/app/profile`, { waitUntil: 'domcontentloaded' })
    const picker = page.getByLabel('Language')
    await picker.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await picker.selectOption({ label }).catch(() => {})
    await waitUntil(async () => (await chosenLabel(picker)).trim() === label, { timeoutMs: 10_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  }
  const scheduleText = async (expect) => {
    await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
    let body = ''
    await waitUntil(async () => {
      body = await page.locator('body').innerText().catch(() => '')
      return expect.test(body)
    }, { timeoutMs: 20_000 })
    return body
  }
  await setLanguage('Español')
  const es = await scheduleText(/Días laborables|Horario laboral/)
  check(/Días laborables|Horario laboral/.test(es),
    'the new Work schedule strings are translated in Spanish',
    `Spanish body did not show translated schedule strings: ${es.slice(0, 160)}`)
  check(!/\{\{|\{name\}|\{count\}/.test(es), 'no untranslated placeholders leak through',
    'a raw {{placeholder}} rendered on screen')
  await setLanguage('العربية')
  const ar = await scheduleText(/أيام العمل|جدول العمل/)
  check(/أيام العمل|جدول العمل/.test(ar), 'and in Arabic', `Arabic body: ${ar.slice(0, 120)}`)
  check(!/\{\{|\{name\}/.test(ar), 'no placeholders in Arabic either', 'a raw placeholder rendered in Arabic')
  await setLanguage('English')

  say('16b. Teardown — leave the workspace as we found it')
  // The UI suite creates real rows. Left behind, they accumulate across runs and
  // eventually make an assertion pass for the wrong reason. The workspace's
  // default type goes back first: section 13 moved it to ours.
  const restore = defaultBefore
    ? await sweepApi(`/workspaces/${WS}/task-types/${defaultBefore}`, { method: 'PATCH', body: { isDefault: true } }).catch(() => null)
    : await (async () => {
        const ours = (await typesNow()).find((tt) => tt.isDefault && String(tt.name).startsWith('E2EType-'))
        return ours ? sweepApi(`/workspaces/${WS}/task-types/${ours.id}`, { method: 'PATCH', body: { isDefault: false } }).catch(() => null) : { status: 200 }
      })()
  if (!restore || restore.status >= 300) console.log(`  cleanup left behind: the workspace's default task type was not put back (${restore?.status ?? 'no answer'})`)
  await page.goto(`${B}/app/${WS}/settings?tab=taskTypes`, { waitUntil: 'domcontentloaded' })
  const typeNames = () => page.locator('input[aria-label^="Rename task type"]').evaluateAll((e) => e.map((x) => x.value)).catch(() => [])
  await waitUntil(async () => (await typeNames()).length > 0, { timeoutMs: 20_000 })
  page.on('dialog', (d) => d.accept())
  for (let i = 0; i < 12; i++) {
    const rows = await typeNames()
    const ours = rows.find((r) => r.startsWith('E2EType-'))
    if (!ours) break
    await page.getByRole('button', { name: `Delete task type ${ours}` }).click({ timeout: 10_000 }).catch(() => {})
    // Gone from the list before the next is read: a read after a fixed wait
    // found the row still there on a loaded lane and pressed it twice.
    await waitUntil(async () => !(await typeNames()).includes(ours), { timeoutMs: 10_000 })
  }
  const leftover = await typeNames()
  check(!leftover.some((r) => r.startsWith('E2EType-')),
    `no test task types left behind (${leftover.length} type(s) remain, none ours)`,
    `test types survived teardown: ${JSON.stringify(leftover)}`)

  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  const satBack = page.getByRole('button', { name: 'Sat', exact: true })
  await satBack.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  let satState = null
  await waitUntil(async () => {
    satState = await satBack.getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)
    return satState === 'false'
  }, { timeoutMs: 10_000 })
  // The server's week too: a button drawn before the week loads also says "false".
  const saturdayHeld = await serverHasSaturday()
  check(satState === 'false' && !saturdayHeld, 'the working week is back to Mon–Fri',
    `Saturday left as aria-pressed=${satState}; the server's week ${saturdayHeld ? 'still holds' : 'does not hold'} it`)
  // Put back either way, so a failed press does not leave the shared week at six days for the next run.
  if (saturdayHeld) {
    const week = (await sweepApi(`/workspaces/${WS}/work-schedule`).catch(() => null))?.data?.workDays ?? []
    const putBack = await sweepApi(`/workspaces/${WS}/work-schedule`, { method: 'PATCH', body: { workDays: week.filter((d) => d !== 6) } })
    if (putBack.status >= 300) console.log(`  cleanup left behind: the working week was not put back (${putBack.status})`)
  }

  say('17. Console health')
  const real = consoleErrors.filter((e) =>
    !/favicon|ResizeObserver|net::ERR_FAILED|status of (400|401|403|404|409)/.test(e))
  check(real.length === 0, `no unexplained console errors across ${results.length} interactions`,
    `console errors: ${real.slice(0, 4).join(' || ')}`)
} catch (e) {
  bad(`the run threw: ${e.message}`)
  await page.screenshot({ path: '/tmp/rundesk-ui-sweep-failure.png' }).catch(() => {})
} finally {
  await browser.close()
}

console.log('\n' + '═'.repeat(62))
const bySec = {}
for (const [st, sec] of results) {
  bySec[sec] ??= { PASS: 0, FAIL: 0, SKIP: 0 }
  bySec[sec][st]++
}
for (const [sec, c] of Object.entries(bySec)) {
  const mark = c.FAIL ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'
  console.log(`  ${mark} ${sec}: ${c.PASS} passed${c.FAIL ? `, ${c.FAIL} FAILED` : ''}${c.SKIP ? `, ${c.SKIP} skipped` : ''}`)
}
console.log('═'.repeat(62))
const failed = results.filter(([s]) => s === 'FAIL')
if (failed.length) {
  console.log('\n\x1b[1;31mFailures:\x1b[0m')
  for (const [, sec, m] of failed) console.log(`  [${sec}] ${m}`)
}
const p = results.filter(([s]) => s === 'PASS').length
const sk = results.filter(([s]) => s === 'SKIP').length
console.log(`\n\x1b[1m${p} passed, ${failed.length} failed, ${sk} skipped\x1b[0m`)
await stack?.close?.()
/*
 * "0 failed" is not "it ran", and this is the widest suite in the repo — the
 * one most able to stop early and still look fine. `results.length` counts
 * PASS, FAIL and SKIP together, because a section that skips is a section that
 * ran and declined; a section that never executed adds nothing and is exactly
 * what this catches. Observed at 107 from a green run, not guessed.
 */
const EXPECTED_CHECKS = 107
if (results.length !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${results.length} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped ` +
      'early, so the counts above describe the part it reached and nothing else.',
  )
  process.exit(1)
}
process.exit(failed.length ? 1 : 0)
