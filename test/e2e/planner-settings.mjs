/**
 * §V2-02 — the Planner's settings, frame `14:10`.
 *
 * `[14:08]`–`[14:26]`: "yahan se ACCOUNTS aap add kar sakte ho. Yeh SIDEBAR
 * option hai ke aap ko kya kya cheezein yahan par chahiye … TIME BLOCK aap
 * chaho to kar sakte ho."
 *
 * WHAT THIS WATCHES FOR. A settings page is the easiest thing in a product to
 * fake: a switch that flips, saves, reads back, and changes nothing. So every
 * check here is a BEFORE/AFTER on the calendar itself — turn the setting on,
 * reload, and look at the grid. None of them assert that the switch moved.
 *
 * FIVE PAGES, NOT SEVEN — it was three until §V2-14, four until §V2-02e.
 *
 * AI Notetaker and Automations are still deliberately absent, and both are
 * RECORDED DECISIONS rather than gaps: the notetaker needs a meeting bot the
 * client has not decided whether to build or buy, and Automations is parked at
 * the client's own instruction (`[14:32]` "yeh aap ko baad mein bataoongi, end
 * mein" — and the video ends without coming back).
 *
 * TWO PAGES HAVE MOVED OFF THAT LIST, AND FOR THE SAME REASON BOTH TIMES: the
 * recorded reason had gone stale, which the process doc lists as its own defect
 * class because a stale reason suppresses exactly the investigation that would
 * find the bug.
 *
 *   · ACCOUNTS was excluded because a page here "would be a read-only copy" of
 *     the workspace integration. The workspace connection was one for
 *     everybody, unique on (workspace, provider), and a second Google account
 *     overwrote the first. §V2-14 gives a person their own accounts.
 *   · UPCOMING MEETING was excluded because it is "mostly a desktop menubar"
 *     and "two of its three switches would toggle nothing". The countdown and
 *     the Join pill are not a menubar — they are on the Meetings page and have
 *     been since §2.8, with nothing able to turn either off. §V2-02e gives all
 *     three switches a reader; `planner-upcoming-meeting.mjs` proves it.
 *
 * The count is still asserted, because the rule has not changed: a nav page
 * that toggles nothing is a facade. Only the number of real ones has. THE
 * ORDER is asserted too, now, because the frame lists them top to bottom and a
 * nav is the one place a reordering goes unnoticed.
 *
 * AND THE FOOTER. Frame `14:10` draws What's new · Report a problem · Feature
 * requests under the nav. Each of the three has to reach something that
 * exists — the dead-control defect is not less dead for being in small type.
 *
 *   node test/e2e/planner-settings.mjs --dist apps/web/dist
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 20

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'apps/web')

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

const chromium = await resolveChromium()
const LAUNCH = launchOptions()

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}
if (!path.isAbsolute(DIST)) DIST = path.join(ROOT, DIST)

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

const now = new Date()
const at = (hour) => { const d = new Date(now); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const BLOCKS = [{
  id: 'b1', taskId: 't1', label: 'A task', startsAt: at(10), endsAt: at(11),
  isAllDay: false, taskStatus: 'todo', taskPriority: 'urgent',
}]

/*
 * §V2-02d — assigned work for the two Time-blocking switches to act on.
 *
 * THE ABSENCE OF THIS FIXTURE IS WHY THEY WENT DEAD. The assigned-tasks call
 * answered with an empty list, so the Backlog was empty and nothing overdue
 * existed; a switch controlling which of nothing is shown looks identical
 * whether it is wired or not. Both toggles saved, read back, and were asserted
 * by nobody.
 *
 * AND THE REASON IT ANSWERED EMPTY WAS NOT "no fixture". It was a 404: the page
 * requested `/tasks/workspace/:ws/member/:id` and the API serves `/members/`.
 * This stub was written to match the CLIENT's spelling, which made the symptom
 * go away here and left the product broken — the rail is empty in the running
 * app no matter what these toggles say. `planner-rail.mjs` checks the real
 * request against the real API, which is the only place that mistake shows up.
 */
const dayOffset = (n) => {
  const d = new Date(now)
  d.setDate(d.getDate() + n)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
const ASSIGNED = [
  { id: 't-late', title: 'Late thing', dueDate: dayOffset(-3) },
  { id: 't-soon', title: 'Soon thing', dueDate: dayOffset(3) },
]

/*
 * A MUTABLE stub. The whole point of these checks is that saving a setting
 * changes what the grid draws, so the stub has to actually apply the PATCH —
 * a stub that accepts a write and keeps answering with the old value is the
 * second failure mode `lib/wait.mjs` was written about.
 */
let settings = {}

/*
 * §V2-02e — what the footer's three links have to reach.
 *
 * "What's new" reads the workspace's own announcements, the same endpoint the
 * app-shell banner reads. Two of them, with distinguishable titles, because a
 * check that only counts rows passes on a pane that renders the same row
 * twice.
 */
const NEWS = [
  { id: 'a1', title: 'Planner settings', body: 'Five pages now.' },
  { id: 'a2', title: 'Recurring blocks', body: 'Next occurrences on the grid.' },
]
/** Every ticket the dialog filed, in order, with the body it sent. */
const tickets = []

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/planner/') && url.includes('/settings')) {
      if (req.method() === 'PATCH') {
        settings = { ...settings, ...JSON.parse(req.postData() ?? '{}') }
        return reply(settings)
      }
      return reply(settings)
    }
    if (url.includes('/planner/') && url.includes('/blocks')) return reply(BLOCKS)
    if (url.includes('/lists/workspace/')) return reply([{ id: 'l1', name: 'Inbox list' }])
    if (url.includes('/priorities')) return reply([])
    /*
     * `/tasks/workspace/:ws/members/:userId` — PLURAL, and matched in full.
     *
     * This stub used to match `/member/`, singular: a path the client asked for
     * and the API answered 404 to, so every check below passed against a route
     * that did not exist. Matched in full rather than on the word `members`,
     * which also appears in the workspace-members list.
     */
    if (/\/tasks\/workspace\/[^/]+\/members\//.test(url)) return reply(ASSIGNED)
    /* The footer's three destinations. */
    if (url.includes('/announcements/active')) return reply(NEWS)
    if (url.includes('/support/tickets')) {
      if (req.method() === 'POST') {
        let body = null
        try { body = JSON.parse(req.postData() ?? '{}') } catch { body = { parseFailed: true } }
        tickets.push(body)
        return reply({ id: `tkt-${tickets.length}-abcdef` })
      }
      return reply([])
    }
    return reply([])
  })

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })

  console.log('\n▶ the gear opens the settings `[frame 14:10]`')
  await page.locator('[data-testid="planner-settings"]').click()
  await page.waitForSelector('[data-testid="planner-settings-dialog"]', { timeout: 10_000 })
  const navIds = await page
    .locator('[data-testid^="planner-settings-nav-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  chk(
    navIds.length === 5,
    'the nav offers exactly the five pages that do something',
    `the nav had ${navIds.length} pages — the frame shows seven, and two of them are recorded ` +
      'decisions rather than gaps (AI Notetaker needs a meeting bot; Automations is parked at `[14:32]`)',
  )
  /*
   * THE ORDER, not just the count. The frame lists them top to bottom and a
   * count alone passes on a nav that has been shuffled — which is a change
   * nobody would notice and everybody would feel.
   */
  chk(
    JSON.stringify(navIds) ===
      JSON.stringify([
        'planner-settings-nav-appearance',
        'planner-settings-nav-accounts',
        'planner-settings-nav-sidebar',
        'planner-settings-nav-upcomingMeeting',
        'planner-settings-nav-timeBlocking',
      ]),
    "and in the frame's own order, Appearance → Accounts → Sidebar → Upcoming meeting → Time blocking",
    `the nav read ${JSON.stringify(navIds)}`,
  )

  console.log('\n▶ Appearance changes the grid, not just the switch')
  const weekendsBefore = await page.locator('[data-testid="planner-day-column"]').count()
  await page.locator('[data-testid="planner-show-weekends"]').click()
  const shrank = await waitUntil(
    async () => (await page.locator('[data-testid="planner-day-column"]').count()) === weekendsBefore - 2,
    { timeoutMs: 8000 },
  )
  chk(
    shrank,
    'turning weekends off removes two columns from the week',
    `the grid still has ${await page.locator('[data-testid="planner-day-column"]').count()} columns of ${weekendsBefore}`,
  )
  await page.locator('[data-testid="planner-show-weekends"]').click()
  await waitUntil(async () => (await page.locator('[data-testid="planner-day-column"]').count()) === weekendsBefore)

  /*
   * Colour-by. The block points at an URGENT task, so switching from "nothing"
   * to "priority" has to change the class the block is drawn with.
   */
  // Bounded and caught: nothing short-circuits a standalone assignment, so an
  // absent element spends Playwright's default thirty seconds here and ends
  // the section. The consumer below already treats the caught value as a
  // miss, so absence reports rather than throws.
  const toneBefore = await page
    .locator('[data-testid="planner-block"]')
    .first()
    .getAttribute('class', { timeout: 8000 })
    .catch(() => null)
  await page.locator('[data-testid="planner-color-by"]').selectOption('priority')
  const recoloured = await waitUntil(async () => {
    const c = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
    return c !== toneBefore
  }, { timeoutMs: 8000 })
  chk(
    recoloured,
    'colouring tasks by priority actually recolours an urgent block',
    'the block kept its class — the setting saved and the grid ignored it',
  )
  // Bounded and caught: nothing short-circuits a standalone assignment, so an
  // absent element spends Playwright's default thirty seconds here and ends
  // the section. The consumer below already treats the caught value as a
  // miss, so absence reports rather than throws.
  const urgentTone = await page
    .locator('[data-testid="planner-block"]')
    .first()
    .getAttribute('class', { timeout: 8000 })
    .catch(() => null)
  chk(
    /rose/.test(urgentTone ?? ''),
    'and an urgent task is drawn in the urgent colour',
    `the block was drawn as ${JSON.stringify(urgentTone)}`,
  )

  await page.locator('[data-testid="planner-style-solid"]').click()
  const wentSolid = await waitUntil(async () => {
    const c = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
    return (c ?? '').includes('bg-rose-500')
  }, { timeoutMs: 8000 })
  chk(wentSolid, 'and the Solid event style fills the block instead of tinting it',
    'switching to Solid changed nothing on the grid')

  console.log('\n▶ Sidebar decides what the rail shows')
  await page.locator('[data-testid="planner-settings-nav-sidebar"]').click()
  await page.waitForSelector('[data-testid="planner-settings-sidebar"]', { timeout: 10_000 })
  chk(
    (await page.locator('[data-testid="planner-priorities"]').count()) === 1,
    'Priorities is on the rail to begin with',
    'the control section was not there before it was turned off, so turning it off proves nothing',
  )
  await page.locator('[data-testid="planner-rail-priorities"]').click()
  const railShrank = await waitUntil(
    async () => (await page.locator('[data-testid="planner-priorities"]').count()) === 0,
    { timeoutMs: 8000 },
  )
  chk(railShrank, 'turning it off takes it off the rail',
    'the section was still on the rail after being switched off')

  console.log('\n▶ Time blocking holds the answer video 1 left open')
  await page.locator('[data-testid="planner-settings-nav-timeBlocking"]').click()
  await page.waitForSelector('[data-testid="planner-settings-time-blocking"]', { timeout: 10_000 })
  /*
   * Polled, not sampled. The lists query only fires when this page opens, so
   * reading the options the instant after the click reads them before the
   * request has landed — which is the same mistake this suite's siblings keep
   * being fixed for.
   */
  const gotLists = await waitUntil(async () => {
    const opts = await page.locator('[data-testid="planner-default-list"] option').allInnerTexts()
    return opts.some((o) => o.includes('Inbox list'))
  }, { timeoutMs: 8000 })
  const options = await page.locator('[data-testid="planner-default-list"] option').allInnerTexts()
  chk(
    gotLists,
    "the default-list picker offers the workspace's lists",
    `it offered ${JSON.stringify(options)} — a picker that can only say "personal" is a picker with one answer`,
  )
  await page.locator('[data-testid="planner-block-prefix"]').fill('Focus on')
  await page.locator('[data-testid="planner-block-prefix"]').blur()
  const reprefixed = await waitUntil(async () => {
    const texts = await page.locator('[data-testid="planner-block"]').allInnerTexts()
    return texts.some((x) => x.startsWith('Focus on '))
  }, { timeoutMs: 8000 })
  chk(
    reprefixed,
    'and changing the prefix re-titles the blocks already on the grid',
    'the blocks kept saying "Work on" — the prefix would be frozen at the moment of each drag',
  )

  /*
   * §V2-02d — the two switches that were saving and doing nothing.
   *
   * Both were declared in the settings dialog's type, drawn (one of them), and
   * written to the database. NOTHING READ THEM: the planner page's own copy of
   * the settings type did not list them, so it could not, and no compiler ever
   * complained because the two hand-written types never meet. They are checked
   * here the way every other setting on this page is — before and after, on the
   * CALENDAR, never on the switch.
   */
  console.log('\n▶ the switches that were saving and changing nothing')
  const backlogTitles = () =>
    page.locator('[data-testid="planner-backlog-item"]').allInnerTexts()
  const overdueCount = () => page.locator('[data-testid="planner-overdue"]').count()

  chk(
    (await overdueCount()) > 0,
    'an overdue assigned task is rolled into today’s column',
    'nothing overdue was drawn — frame `14:20` rolls overdue work into today, and this ' +
      'switch used to control a behaviour that did not exist',
  )

  await page.locator('[data-testid="planner-show-overdue"]').click()
  const overdueGone = await waitUntil(async () => (await overdueCount()) === 0, { timeoutMs: 8000 })
  chk(
    overdueGone,
    'and turning "show overdue" off really takes it off the grid',
    'the overdue marker stayed after the switch was turned off — the setting saves and ' +
      'changes nothing, which is what it did before this item',
  )
  chk(
    (await backlogTitles()).length > 0,
    'while the Backlog is untouched — the two switches are not the same switch',
    'turning overdue off also emptied the Backlog',
  )

  await page.locator('[data-testid="planner-show-assigned"]').click()
  const backlogGone = await waitUntil(async () => (await backlogTitles()).length === 0, { timeoutMs: 8000 })
  chk(
    backlogGone,
    'and turning "show assigned" off empties the Backlog rail',
    `the Backlog still listed ${JSON.stringify(await backlogTitles())} — this switch had no ` +
      'control at all until now, and nothing read the value it stored',
  )

  console.log('\n▶ Timezone, which the server has always accepted and nothing could set')
  await page.locator('[data-testid="planner-settings-nav-appearance"]').click()
  const zonePresent = await waitUntil(
    () => page.getByTestId('planner-timezone').isVisible().catch(() => false),
    { timeoutMs: 8000 },
  )
  chk(
    zonePresent,
    'the Appearance page offers a timezone',
    'there is no timezone control — the API has validated `timezone` since this page shipped, ' +
      'and the file even carried a comment claiming the page edits it',
  )
  if (zonePresent) {
    await page.locator('[data-testid="planner-timezone"]').selectOption('Asia/Karachi')
    const zoneSaved = await waitUntil(() => settings.timezone === 'Asia/Karachi', { timeoutMs: 8000 })
    chk(
      zoneSaved,
      'and choosing one sends it to the account, not just to this dialog',
      `the settings the page saved were ${JSON.stringify(settings)}`,
    )
  } else {
    chk(false, 'and choosing one sends it to the account', 'skipped — no control to choose from')
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * §V2-02e — the footer of frame `14:10`.
   *
   * Three links under the nav. Each check below is about what the link REACHES
   * — rows that came from the server, a request that went out — and not about
   * the link being on screen, because a dead control is on screen too.
   */
  console.log("\n▶ the footer: What's new · Report a problem · Feature requests")
  const footerIds = await page
    .locator('[data-testid^="planner-settings-footer-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  chk(
    JSON.stringify(footerIds) ===
      JSON.stringify([
        'planner-settings-footer-whatsNew',
        'planner-settings-footer-reportProblem',
        'planner-settings-footer-featureRequest',
      ]),
    'the footer draws the frame’s three links, in the frame’s order',
    `the footer read ${JSON.stringify(footerIds)}`,
  )

  await page.locator('[data-testid="planner-settings-footer-whatsNew"]').click()
  const newsArrived = await waitUntil(
    async () => (await page.locator('[data-testid="planner-whats-new-item"]').count()) === NEWS.length,
    { timeoutMs: 8000 },
  )
  const newsTitles = await page.locator('[data-testid="planner-whats-new-item"]').allInnerTexts()
  chk(
    newsArrived && NEWS.every((n) => newsTitles.some((text) => text.includes(n.title))),
    "\"What's new\" lists what the workspace actually published, both of them",
    `it listed ${JSON.stringify(newsTitles)} for ${NEWS.length} announcements — a link that ` +
      'opens an empty pane is the dead control with an extra step',
  )

  /*
   * The two tickets. Asserted on the REQUEST, not on the receipt: a pane that
   * printed a ticket id it made up would look identical, and the subject and
   * priority are the two fields that route a ticket to a human.
   */
  await page.locator('[data-testid="planner-settings-footer-reportProblem"]').click()
  await page.locator('[data-testid="planner-support-body"]').fill('The grid stopped drawing blocks.')
  await page.locator('[data-testid="planner-support-send"]').click()
  const problemFiled = await waitUntil(() => tickets.length === 1, { timeoutMs: 8000 })
  chk(
    problemFiled &&
      tickets[0]?.subject === 'Problem report: Planner' &&
      tickets[0]?.priority === 'high' &&
      tickets[0]?.body === 'The grid stopped drawing blocks.',
    '"Report a problem" files a real support ticket, with what was typed in it',
    `the dialog sent ${JSON.stringify(tickets[0] ?? null)}`,
  )

  await page.locator('[data-testid="planner-settings-footer-featureRequest"]').click()
  await page.locator('[data-testid="planner-support-body"]').fill('Let me colour blocks by list.')
  await page.locator('[data-testid="planner-support-send"]').click()
  const featureFiled = await waitUntil(() => tickets.length === 2, { timeoutMs: 8000 })
  chk(
    featureFiled &&
      tickets[1]?.subject === 'Feature request: Planner' &&
      tickets[1]?.priority === 'low' &&
      tickets[1]?.subject !== tickets[0]?.subject,
    'and "Feature requests" files a DIFFERENT one — a wish is not an outage',
    `the two tickets were ${JSON.stringify(tickets)}`,
  )

  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  server.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  /*
   * EXACT, not `>=`. With `<` a branch that silently stopped running turned
   * into a shorter run that still passed; with `!==` a skipped branch and an
   * accidentally duplicated one are both failures, which is what an expected
   * count is for.
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} checks ran, ${EXPECTED_CHECKS} expected — this run did not do what it says, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
