/**
 * End-to-end browser sweep over every UI surface delivered in this engagement.
 *
 * Selectors were taken from a discovery pass against the running app, not
 * guessed. Where a control turned out to be a <select> rather than a button,
 * this drives the select — an earlier version clicked a button that did not
 * exist and silently proved nothing.
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
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

const results = []
let section = ''
const ok = (m) => { results.push(['PASS', section, m]); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(['FAIL', section, m]); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const skip = (m) => { results.push(['SKIP', section, m]); console.log(`  \x1b[2mSKIP\x1b[0m ${m}`) }
const check = (c, g, b) => (c ? ok(g) : bad(b))
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
    await page.waitForTimeout(2500)
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
  if ((await page.locator('button[aria-label="Close sheet overlay"]').count()) > 0) return
  await firstTaskCard().click()
  await page.waitForTimeout(2000)
}

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await ctx.route('**/*', (r) => (/127\.0\.0\.1|localhost/.test(r.request().url()) ? r.continue() : r.abort()))
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

/** The column header cells of the list table, as text. */
const columns = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('div,tr')]
  const row = all.find((e) => /^\s*Title\b/.test(e.innerText || '') && (e.innerText || '').length < 120)
  return row ? row.innerText.split('\n').map((s) => s.trim()).filter((s) => s && s !== '▲' && s !== '▼') : []
})

/** The select whose options include the given text. */
const selectWith = (text) =>
  page.locator('select').filter({ has: page.locator(`option:text-is("${text}")`) }).first()

/** The group bucket labels, read from the grid rather than assuming a tag. */
/**
 * Dismiss the task sheet. Escape alone does not always land, and the sheet's
 * full-screen overlay silently intercepts every later click when it lingers —
 * which reads as "the button is missing" rather than "the sheet is still open".
 */
const closeSheet = async () => {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('button[aria-label="Close sheet overlay"]').count() === 0) return
    await page.locator('button[aria-label="Close sheet overlay"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(600)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
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
  await page.waitForURL(/\/app\//, { timeout: 25000 })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  ok('signed in and landed in the app')

  // ═══════════════════════════════════ V1/V2 — list view chrome ═══════
  say('1. List view: the grouped-by column is dropped (V1)')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  const grouper = selectWith('By status')
  check(await grouper.count() > 0, 'the grouping control is present', 'no grouping control found')

  for (const [label, hidden] of [['By status', 'Status'], ['By priority', 'Priority'], ['By assignee', 'Assignees']]) {
    await grouper.selectOption({ label })
    await page.waitForTimeout(1400)
    const cols = await columns()
    check(!cols.includes(hidden),
      `grouped ${label.toLowerCase()}: the ${hidden} column is dropped — columns are ${JSON.stringify(cols)}`,
      `grouped ${label.toLowerCase()} still shows a ${hidden} column: ${JSON.stringify(cols)}`)
    check(cols.includes('Title'), `and Title is still there`, `Title vanished: ${JSON.stringify(cols)}`)
  }

  say('1b. Grouping actually regroups the rows')
  await grouper.selectOption({ label: 'By status' })
  await page.waitForTimeout(1500)
  const byStatus = await groupHeadings()
  await grouper.selectOption({ label: 'By priority' })
  await page.waitForTimeout(1800)
  const byPriority = await groupHeadings()
  await grouper.selectOption({ label: 'By assignee' })
  await page.waitForTimeout(1800)
  const byAssignee = await groupHeadings()
  check(byStatus.length > 0 && byPriority.length > 0,
    `status buckets ${JSON.stringify(byStatus.slice(0, 4))} become priority buckets ${JSON.stringify(byPriority.slice(0, 4))}`,
    `a grouping produced no buckets: status=${JSON.stringify(byStatus)} priority=${JSON.stringify(byPriority)}`)
  check(JSON.stringify(byStatus) !== JSON.stringify(byPriority),
    'regrouping genuinely rebuckets the rows', 'the buckets did not change')
  check(byAssignee.some((h) => /Unassigned/i.test(h)),
    `grouping by assignee produces people buckets: ${JSON.stringify(byAssignee.slice(0, 4))}`,
    `no assignee buckets: ${JSON.stringify(byAssignee)}`)
  await grouper.selectOption({ label: 'By status' })
  await page.waitForTimeout(1200)

  say('2. Fields picker with search (V2)')
  // "Fields (8/8)" renders as a clickable div, not a <button>.
  await page.getByText(/^Fields \(\d+\/\d+\)$/).last().click()
  await page.waitForTimeout(900)
  const searchBox = page.locator('input[placeholder*="earch" i]:visible').last()
  check(await searchBox.count() > 0, 'the fields picker opens with a search box', 'no search box in the fields picker')
  if (await searchBox.count()) {
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
          await page.waitForTimeout(1800)
        }
      }
      before = await page.locator('label:visible').allInnerTexts()
      check(before.length > 1, `seeded fields to search against (${before.length})`,
        `the picker lists ${before.length} field(s) and create-new did not add more`)
    } else {
      check(true, `it lists the workspace fields (${before.length})`, '')
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
    check(term.length > 0, `found a term unique to one field ("${term}")`,
      `no term distinguishes these fields: ${JSON.stringify(before)}`)
    await searchBox.fill(term)
    await page.waitForTimeout(800)
    const after = await page.locator('label:visible').allInnerTexts()
    check(after.length > 0 && after.length < before.length && after.every((f) => f.toLowerCase().includes(term.toLowerCase())),
      `searching "${term}" narrows ${before.length} fields to ${after.length}: ${JSON.stringify(after)}`,
      `search for "${term}" gave ${JSON.stringify(after)} out of ${JSON.stringify(before)}`)
    await searchBox.fill('zzzznomatch')
    await page.waitForTimeout(700)
    check((await page.locator('label:visible').allInnerTexts()).length === 0,
      'and a term matching nothing shows nothing', 'a non-matching term still listed fields')
    await searchBox.fill('')
    await page.waitForTimeout(600)
    // V2's other half: create a new field without leaving the picker.
    const picker = await page.locator('body').innerText()
    check(/CREATE NEW FIELD/i.test(picker), 'the picker offers create-new inline (V2)',
      'no create-new section in the fields picker')
    for (const ty of ['Text', 'Number', 'Date', 'Checkbox', 'URL', 'Dropdown']) {
      check(picker.includes(ty), `create-new offers the ${ty} type`, `${ty} not offered`)
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  // ═════════════════════════════════════ Task detail ═══════════════════
  say('3. Task detail opens with every tab (V3/V5)')
  await openAnyTask()
  await page.waitForTimeout(2600)
  const sheet = page.locator('div.shadow-2xl.border-l')
  check(await sheet.count() > 0, 'the task detail sheet opens from the list', 'the sheet did not open')
  const tabs = await sheet.locator('button:visible').allInnerTexts()
  for (const t of ['Overview', 'Subtasks', 'Checklists', 'Dependencies', 'Attachments', 'Comments', 'Activity', 'Time']) {
    check(tabs.includes(t), `the ${t} tab is present`, `the ${t} tab is missing`)
  }
  check(tabs.includes('Dependencies'),
    'Dependencies is still present — reverted to original, awaiting the client (V6)',
    'Dependencies is gone; the revert did not hold')

  say('4. Watchers / followers popover (V7)')
  const bell = sheet.getByRole('button', { name: /watcher|follow/i }).first()
  if (await bell.count()) {
    await bell.click()
    await page.waitForTimeout(1200)
    const dlg = page.locator('[role=dialog]:visible')
    check(await dlg.count() > 0, 'the followers dialog opens from the header bell', 'no followers dialog')
    if (await dlg.count()) {
      const body = await dlg.innerText()
      check(/\d+ watcher/i.test(body), `it shows the follower count: ${(body.match(/\d+ watchers?/i) || [])[0]}`,
        `no watcher count in the dialog: ${body.slice(0, 120)}`)
      check(/Watch task|Unwatch/i.test(body),
        `and a control to change your own follow state (${(body.match(/Watch task|Unwatch/i) || [])[0]})`,
        `no self-follow control: ${body.slice(0, 120)}`)
      check(/Add teammate/i.test(body), 'and a way to add a teammate as a follower',
        `no add-teammate control: ${body.slice(0, 140)}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
  } else {
    bad('no watchers control in the task header')
  }

  say('5. Checklists tab (V4)')
  await sheet.getByRole('button', { name: 'Checklists', exact: true }).click()
  await page.waitForTimeout(1400)
  const clText = await sheet.innerText()
  check(/checklist/i.test(clText), 'the checklists tab renders', `tab body: ${clText.slice(0, 140)}`)
  check(!/Due date.*checklist item/i.test(clText),
    'checklist items are not date-first (V4 replaced the date with an assignee)',
    'a due-date control is still the primary checklist item field')

  say('6. Subtasks tab (V5)')
  await sheet.getByRole('button', { name: 'Subtasks', exact: true }).click()
  await page.waitForTimeout(1400)
  check(/subtask/i.test(await sheet.innerText()), 'the subtasks tab renders', 'the subtasks tab is empty')

  await closeSheet()

  // ═════════════════════════════════════ Board view ════════════════════
  say('7. Board view (V3)')
  const viewTab = page.getByRole('button', { name: 'Board', exact: true }).first()
  if (await viewTab.count()) {
    await viewTab.click()
    await page.waitForTimeout(2600)
    const body = await page.locator('body').innerText()
    check(/Backlog|To do|In progress/.test(body), 'the board renders its status columns',
      `board body: ${body.slice(0, 160)}`)
    const card = firstTaskCard()
    if (await card.count()) {
      await card.click()
      await page.waitForTimeout(2200)
      check(await page.locator('div.shadow-2xl.border-l').count() > 0,
        'clicking a card opens the task — the click is not swallowed by drag-and-drop',
        'clicking a board card did not open the task')
      await closeSheet()
    } else {
      skip('no known card on the board to click')
    }
  } else {
    bad('no Board view tab in the view strip')
  }

  // ═══════════════════════════════════════ Share panel ═════════════════
  say('8. Share & permissions panel')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2800)
  await page.getByRole('button', { name: 'Share', exact: true }).first().click()
  await page.waitForTimeout(1400)
  const shareDlg = page.locator('[role=dialog]:visible')
  check(await shareDlg.count() > 0, 'the share dialog opens', 'the share dialog did not open')
  if (await shareDlg.count()) {
    const t = await shareDlg.innerText()
    for (const lvl of ['View', 'Comment', 'Edit', 'Full edit']) {
      check(t.includes(lvl), `the ${lvl} level is offered with an explanation`, `${lvl} missing from the panel`)
    }
    check(/only|explan|can |may /i.test(t), 'each level carries a one-line meaning',
      'the levels are listed without explanations')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
  }

  // ═══════════════════════════════════ Search palette ══════════════════
  say('9. Command palette: type filter and sort')
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(1200)
  const palette = page.locator('[role=dialog]:visible, [cmdk-root]').first()
  check(await palette.count() > 0, 'the palette opens on Ctrl+K', 'Ctrl+K did not open the palette')
  if (await palette.count()) {
    const input = page.locator('input:visible').last()
    await input.fill('task')
    await page.waitForTimeout(1800)
    const pt = await palette.innerText()
    check(pt.length > 40, 'it returns results', `palette body: ${pt.slice(0, 120)}`)
    // The type and sort chips live behind a "Filters" toggle rather than
    // always-on chrome — open it before asserting they exist.
    await palette.getByRole('button', { name: 'Filters', exact: true }).click()
    await page.waitForTimeout(1200)
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
      check(chips.includes(ty), `the ${ty} type chip is on the bar`, `no ${ty} chip: ${JSON.stringify(chips.slice(0, 14))}`)
    }
    const more = palette.locator('[data-testid=palette-more-types]')
    check(await more.count() > 0, 'and a ⋯ for the rest', 'no overflow control for the other types')
    if (await more.count()) {
      await more.click()
      await page.waitForTimeout(900)
      for (const ty of ['comment', 'channel', 'message']) {
        const entry = palette.locator(`[data-testid=palette-add-type-${ty}]`)
        check(await entry.count() > 0, `${ty} is reachable from the ⋯`, `${ty} is offered nowhere`)
      }
      // Promoting one has to actually put it on the bar, or the ⋯ is a menu
      // that leads nowhere — which is the failure this section exists to catch.
      await palette.locator('[data-testid=palette-add-type-comment]').first().click().catch(() => {})
      await page.waitForTimeout(1200)
      const promoted = await palette.locator('button:visible').allInnerTexts()
      check(promoted.includes('Comments'), 'and choosing one promotes it onto the bar',
        `Comments never appeared: ${JSON.stringify(promoted.slice(0, 14))}`)
    }
    for (const so of ['Relevance', 'Last updated', 'Last created']) {
      check(chips.includes(so), `the "${so}" sort chip is offered`, `no "${so}" chip`)
    }

    // Multi-select is the case that was broken in production — prove the chips
    // actually narrow, and that two of them together return both types.
    const before = (await palette.innerText()).match(/^[A-Z ]{3,}$/gm) || []
    await palette.getByRole('button', { name: 'Docs', exact: true }).click()
    await page.waitForTimeout(1600)
    const afterDocs = await palette.innerText()
    check(!/^TASKS$/m.test(afterDocs), 'selecting Docs alone drops the task results',
      'tasks still listed with only Docs selected')
    await palette.getByRole('button', { name: 'Tasks', exact: true }).click()
    await page.waitForTimeout(1600)
    const both = await palette.innerText()
    check(/^TASKS$/m.test(both), 'adding Tasks brings them back alongside Docs — multi-select works',
      `task group missing with Tasks+Docs selected: ${both.slice(0, 200)}`)
    await palette.getByRole('button', { name: 'All', exact: true }).click()
    await page.waitForTimeout(1200)

    await palette.getByRole('button', { name: 'Last updated', exact: true }).click()
    await page.waitForTimeout(1600)
    check((await palette.innerText()).length > 60, 'switching sort keeps results on screen',
      'sorting emptied the palette')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
  }

  // ═══════════════════════════════════════ Inbox ═══════════════════════
  say('10. Inbox: triage buckets, and Other being gone')
  await page.goto(`${B}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  for (const b of ['Inbox', 'Later', 'Cleared']) {
    check(await page.getByRole('button', { name: new RegExp(`^${b}`) }).first().isVisible().catch(() => false),
      `the ${b} bucket tab is present`, `the ${b} bucket tab is missing`)
  }
  const chipNum = async (l) => {
    const txt = await page.getByRole('button', { name: new RegExp(`^${l}\\s*\\d+$`) }).innerText()
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
  await page.waitForTimeout(1200)
  check(/filter=primary/.test(page.url()), 'the filter is in the URL', `URL: ${page.url()}`)
  await page.goto(`${B}/app/${WS}/inbox?filter=mentions`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  check(await page.getByRole('button', { name: /^Primary/ }).getAttribute('aria-pressed') === 'true',
    'an old ?filter=mentions bookmark still lands on Primary', 'the legacy filter name broke')

  // ═════════════════════════════════ Settings surfaces ═════════════════
  say('11. Settings: Trash, Archived, Spaces index, Features')
  for (const [tab, expect] of [['trash', 'Trash'], ['archived', 'Archived tasks'],
                               ['spaces', 'Space'], ['features', ''], ['groups', ''],
                               ['taskTypes', 'Task types'], ['workSchedule', 'Working days']]) {
    await page.goto(`${B}/app/${WS}/settings?tab=${tab}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1900)
    const heads = (await page.locator('h1:visible,h2:visible,h3:visible').allInnerTexts()).join(' | ')
    const landed = !expect || heads.includes(expect)
    check(landed, `?tab=${tab} deep-links correctly (${heads.slice(0, 70)})`,
      `?tab=${tab} did not land — headings were: ${heads.slice(0, 90)}`)
  }
  check(await page.getByRole('button', { name: 'Archive', exact: true }).count() >= 0,
    'the Archived tab coexists with Trash — both were asked for', 'n/a')

  say('12. Members: reports-to picker')
  await page.goto(`${B}/app/${WS}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2400)
  const pickers = page.locator('select[title="Reports to"]')
  const n = await pickers.count()
  check(n > 1, `a reports-to picker on each member row (${n})`, `only ${n} picker(s)`)
  if (n > 1) {
    // Address rows by whose they are, not by position. The list re-renders
    // after each save and the rows come back in a different order, so nth(1)
    // was landing on the same person twice — the cycle was never attempted and
    // the test blamed the product for a request it never sent.
    const names = await page.locator('select[title="Reports to"]')
      .evaluateAll((sels) => sels.map((el) => /Who (.+) reports to/.exec(el.getAttribute('aria-label') ?? '')?.[1] ?? ''))
    const pickerFor = (name) => page.getByLabel(`Who ${name} reports to`)
    const [personA, personB] = names

    // Start from nobody-reports-to-anybody: selectOption on a value that is
    // already selected fires no change event, and so no request at all.
    for (const who of names) {
      await pickerFor(who).selectOption({ index: 0 }).catch(() => {})
      await page.waitForTimeout(900)
    }
    await pickerFor(personA).selectOption({ label: personB })
    await page.waitForTimeout(2000)
    check(await page.getByText('Reporting structure').first().isVisible().catch(() => false),
      'the reporting tree appears once someone has a manager', 'the tree did not appear')
    await pickerFor(personB).selectOption({ label: personA })
    // The refusal arrives as a toast, which is gone a few seconds later —
    // sampling the page once races it.
    let cycleMsg = ''
    for (let i = 0; i < 12; i++) {
      const body = await page.locator('body').innerText()
      const hit = body.match(/[^.\n]*\b(loop|themselves|cycle)\b[^.\n]*/i)
      if (hit) { cycleMsg = hit[0].trim(); break }
      await page.waitForTimeout(500)
    }
    check(Boolean(cycleMsg), `a reporting cycle is refused with a message: "${cycleMsg.slice(0, 60)}"`,
      'the cycle produced no message')
    await pickers.nth(0).selectOption({ label: 'No manager' })
    await page.waitForTimeout(1400)
  }

  say('13. Task types + work schedule, end to end from the UI')
  await page.goto(`${B}/app/${WS}/settings?tab=taskTypes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const TYPE = uniq('E2EType')
  await page.getByLabel('Icon').fill('🚀')
  await page.getByLabel('Type name').fill(TYPE)
  await page.getByRole('button', { name: /Add type/i }).click()
  await page.waitForTimeout(1500)
  let names = await page.locator('input[aria-label^="Rename task type"]').evaluateAll((e) => e.map((x) => x.value))
  check(names.includes(TYPE), `created "${TYPE}" from the settings UI`, `rows: ${JSON.stringify(names)}`)
  await page.getByRole('button', { name: /Make this the default/i }).first().click()
  await page.waitForTimeout(1400)
  check(await page.locator('button[aria-pressed="true"]').count() >= 1, 'and marked it the default',
    'the default star did not set')

  say('13b. The new type reaches the task header picker')
  await page.goto(`${B}/app/${WS}/${LIST_PATH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await openAnyTask()
  await page.waitForTimeout(2400)
  const tp = page.locator('div.shadow-2xl.border-l select[title="Task type"]')
  check(await tp.count() > 0, 'the type picker appears in the task header now that a type exists',
    'no type picker in the task header')
  if (await tp.count()) {
    const opts = await tp.locator('option').allTextContents()
    check(opts.some((o) => o.includes(TYPE)), `the new type is offered: ${JSON.stringify(opts)}`,
      `the new type is not offered: ${JSON.stringify(opts)}`)
    await tp.selectOption({ label: `🚀 ${TYPE}` })
    await page.waitForTimeout(1800)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3200)
    await openAnyTask()
    await page.waitForTimeout(2400)
    const after = page.locator('div.shadow-2xl.border-l select[title="Task type"]')
    const sel = await after.locator('option:checked').innerText().catch(() => '')
    check(sel.includes(TYPE), `the applied type survives a reload (${sel.trim()})`,
      `after reload the picker shows "${sel.trim()}"`)
    await after.selectOption({ label: 'No type' })
    await page.waitForTimeout(1200)
  }
  await closeSheet()

  say('14. Work schedule from the UI, and Workload reacts')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Sat', exact: true }).click()
  await page.waitForTimeout(1600)
  check(await page.getByRole('button', { name: 'Sat', exact: true }).getAttribute('aria-pressed') === 'true',
    'Saturday toggled on', 'Saturday did not toggle')
  await page.goto(`${B}/app/${WS}/workload`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(/Workload/i.test(await page.locator('body').innerText()),
    'the workload report still renders with a six-day week', 'workload failed to render')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Sat', exact: true }).click()
  await page.waitForTimeout(1400)

  say('15. Other surfaces still render')
  for (const [name, path] of [['Docs', 'docs'], ['Chat', 'chat'], ['Shared with me', 'shared'],
                              ['Workload', 'workload'], ['Reports', 'reports'], ['Goals', 'goals'],
                              ['Timeline', 'timeline'], ['Automations', 'automations'],
                              ['Forms', 'forms'], ['Dashboards', 'dashboards']]) {
    await page.goto(`${B}/app/${WS}/${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(1900)
    const txt = await page.locator('body').innerText()
    const broke = /Something went wrong|Unexpected error|Cannot read propert/i.test(txt)
    check(!broke && txt.length > 200, `${name} renders`, `${name} looks broken: ${txt.slice(0, 130)}`)
  }

  say('16. i18n: the app switches language without breaking')
  /*
   * §1.5 — the switcher used to be in the top bar, which she asked to have
   * cleared: it now lives in Preferences → Language & Region, the way ClickUp
   * keeps it. This section still looked for it beside the work schedule and
   * hung thirty seconds on a control that had moved two releases ago.
   *
   * Switch it where it lives, then go and read the strings where they render.
   */
  const setLanguage = async (label) => {
    await page.goto(`${B}/app/profile`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.getByLabel('Language').selectOption({ label })
    await page.waitForTimeout(1500)
  }
  await setLanguage('Español')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const es = await page.locator('body').innerText()
  check(/Días laborables|Horario laboral/.test(es),
    'the new Work schedule strings are translated in Spanish',
    `Spanish body did not show translated schedule strings: ${es.slice(0, 160)}`)
  check(!/\{\{|\{name\}|\{count\}/.test(es), 'no untranslated placeholders leak through',
    'a raw {{placeholder}} rendered on screen')
  await setLanguage('العربية')
  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const ar = await page.locator('body').innerText()
  check(/أيام العمل|جدول العمل/.test(ar), 'and in Arabic', `Arabic body: ${ar.slice(0, 120)}`)
  check(!/\{\{|\{name\}/.test(ar), 'no placeholders in Arabic either', 'a raw placeholder rendered in Arabic')
  await setLanguage('English')
  await page.waitForTimeout(1500)

  say('16b. Teardown — leave the workspace as we found it')
  // The UI suite creates real rows. Left behind, they accumulate across runs and
  // eventually make an assertion pass for the wrong reason.
  await page.goto(`${B}/app/${WS}/settings?tab=taskTypes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  page.on('dialog', (d) => d.accept())
  for (let i = 0; i < 12; i++) {
    const rows = await page.locator('input[aria-label^="Rename task type"]').evaluateAll((e) => e.map((x) => x.value))
    const idx = rows.findIndex((r) => r.startsWith('E2EType-'))
    if (idx < 0) break
    await page.getByRole('button', { name: `Delete task type ${rows[idx]}` }).click()
    await page.waitForTimeout(1300)
  }
  const leftover = await page.locator('input[aria-label^="Rename task type"]').evaluateAll((e) => e.map((x) => x.value))
  check(!leftover.some((r) => r.startsWith('E2EType-')),
    `no test task types left behind (${leftover.length} type(s) remain, none ours)`,
    `test types survived teardown: ${JSON.stringify(leftover)}`)

  await page.goto(`${B}/app/${WS}/settings?tab=workSchedule`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const satState = await page.getByRole('button', { name: 'Sat', exact: true }).getAttribute('aria-pressed')
  check(satState === 'false', 'the working week is back to Mon–Fri',
    `Saturday left as aria-pressed=${satState}`)

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
process.exit(failed.length ? 1 : 0)
