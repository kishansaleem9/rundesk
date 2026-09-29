/**
 * ⌘K must show the results the server found.
 *
 * The palette rendered search hits inside a cmdk `<Command>` that still had its
 * own fuzzy filter switched on. cmdk scores an item by its `value` string, and
 * a hit's value was `${entityType}-${id}-${title}` — the title and nothing
 * else. The server searches titles AND bodies, so every hit that matched on a
 * description, a doc body, a comment or a chat message scored 0 and cmdk
 * unmounted it. The user saw "no matches" over results the browser was already
 * holding, with the matching snippet rendered underneath the title.
 *
 * Chat messages could never appear at all: the server titles them the literal
 * string "Chat message" (search.service.ts) and puts the body in `content`, so
 * the words the user typed are never in the string being scored.
 *
 *   node test/e2e/command-palette.mjs [--dist <dir>]
 *
 * The instrument is the stub: every hit below matches ONLY on content. If the
 * palette filters by title again, every assertion here fails.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { makeChain } from './lib/chain.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const WEB = path.join(REPO, 'apps/web')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const { chromium } = (() => {
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return require_(id)
    } catch {
      /* next */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] }

const argOf = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : null
}

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}

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

/*
 * The query is "kubernetes". It appears in NO title — only in bodies. That is
 * the whole point: under the old filter every one of these scored 0.
 */
const QUERY = 'kubernetes'
/*
 * §G02 — a SECOND query that also finds results, used once at the very end.
 *
 * It has to be a query the palette has never asked the assistant about. The
 * answer cache is keyed on the query text and holds for five minutes, so
 * re-typing QUERY there would be served from cache and make no request — and
 * "it did not ask" would then be true of a palette that asks on every single
 * search. Break-testing caught exactly that.
 */
const QUERY_WITH_HITS = 'kubernetes-rollout'
/** §G03-5 — an absolute URL into another product, as the Drive proxy returns. */
const DRIVE_URL = 'https://drive.google.com/file/d/1AbCdEf/view'
const HITS = [
  {
    id: 'task-11111111-1111-4111-8111-111111111111',
    entityType: 'task',
    title: 'Q3 Finance Plan',
    content: 'we should migrate the kubernetes cluster before the freeze',
    url: `/app/${WS}/s1/p1/l1?task=11111111-1111-4111-8111-111111111111`,
  },
  {
    id: 'doc-22222222-2222-4222-8222-222222222222',
    entityType: 'doc',
    title: 'Onboarding',
    content: 'day two: get kubernetes access from platform',
    url: `/app/${WS}/docs?doc=22222222-2222-4222-8222-222222222222`,
  },
  {
    // The one that could NEVER render: the server hardcodes this title.
    id: 'message-33333333-3333-4333-8333-333333333333',
    entityType: 'message',
    title: 'Chat message',
    content: 'anyone know why kubernetes is throttling us',
    url: `/app/${WS}/chat?channel=c1&message=33333333-3333-4333-8333-333333333333`,
  },
  {
    id: 'comment-44444444-4444-4444-8444-444444444444',
    entityType: 'comment',
    title: 'Comment on “Q3 Finance Plan”',
    content: 'the kubernetes bill is the line item to watch',
    url: `/app/${WS}/s1/p1/l1?task=11111111-1111-4111-8111-111111111111`,
  },
  {
    /*
     * §G03-5 — a federated hit. Its URL points at another product, which is
     * precisely what the palette's navigation used to drop on the floor.
     */
    id: 'drive-1AbCdEf',
    entityType: 'drive',
    title: 'Kubernetes runbook.pdf',
    content: 'Google Drive',
    url: DRIVE_URL,
  },
]

/*
 * "0 FAILED" IS NOT "IT RAN", AND THIS SUITE HAD NO WAY TO TELL THE DIFFERENCE.
 *
 * It exited on `failed.length` alone. A run that stopped early — a throw
 * swallowed somewhere, a branch skipped because an element was missing —
 * reported the checks it had reached, called them all passes, and exited 0.
 * Every other suite in this directory carries an exact `EXPECTED_CHECKS`
 * compared with `!==` for exactly this reason, and the largest of them did
 * not. Found while adding check 43, by noticing the file had no such constant
 * to bump.
 */
const EXPECTED_CHECKS = 43

const results = []
const ok = (m) => { results.push([true, m]); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push([false, m]); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))

const chain = makeChain(chk)

const browser = await chromium.launch(LAUNCH)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })

// Every response goes back in the API's `{data,error}` envelope — lib/api.ts
// returns `parsed.data`, so a bare array arrives as undefined and renders
// nothing, which looks exactly like the bug this file is testing for.
const envelope = (data) => JSON.stringify({ data, error: null })

/*
 * G02-7 — the workspace this palette is filtering. Two people share a first
 * name deliberately: "type Hamda and pick the right one" is the case a native
 * <select> could not serve, and it is the reason the picker searches email as
 * well as display name.
 */
const MEMBERS = [
  { userId: 'u1', displayName: 'Admin', email: 'admin@rundesk.test' },
  { userId: 'u2', displayName: 'Hamda Tahir', email: 'hamda@rundesk.test' },
  { userId: 'u3', displayName: 'Hamda Raza', email: 'raza@rundesk.test' },
  { userId: 'u4', displayName: 'Suleman', email: 'suleman@rundesk.test' },
]

/** Every /search request this run made, so the filters can be read off the wire. */
const searchCalls = []
/** §G02 — every /ai/knowledge request, so "asked once" can be read off the wire. */
const knowledgeStubCalls = []
const AI_ANSWER = 'Nothing matched, but the closest thing is the Q3 Finance Plan.'
/** §G02 — the cited sources the answer is grounded in. */
const AI_SOURCE_TITLE = 'Q3 Finance Plan'
/** §G02 — every thumbs PATCH, so a rating can be read off the wire. */
const feedbackStubCalls = []

await ctx.route('**/api/**', async (route) => {
  const url = route.request().url()
  let data = []
  if (url.includes('/users/me')) data = USER
  else if (/\/workspaces\/[^/]+\/members(\?|$)/.test(url)) data = MEMBERS
  else if (url.includes('/ai/knowledge')) {
    /*
     * §G02 — the assistant's answer for a query that matched nothing.
     *
     * Stubbed deterministically so the check can assert the exact text reaches
     * the screen. Without this the route falls through to `[]`, the block
     * renders with nothing in it, and "the answer appeared" would be true of an
     * empty box — which is the shape this suite exists to catch.
     */
    if (route.request().method() === 'PATCH') {
      /*
       * §G02 — the thumbs. Recorded rather than merely allowed, because the
       * question this check has to answer is not "did the button move" but
       * "did an opinion reach the server", and only the request says that.
       */
      feedbackStubCalls.push(JSON.parse(route.request().postData() || '{}'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ feedback: feedbackStubCalls[feedbackStubCalls.length - 1].feedback }),
      })
    }
    knowledgeStubCalls.push(url)
    data = {
      answer: AI_ANSWER,
      sources: [{ type: 'task', title: AI_SOURCE_TITLE, url: `/app/${WS}/s1/p1/l1?task=11111111-1111-4111-8111-111111111111` }],
      feedback: null,
    }
  }
  else if (/\/search\/[^/?]+\?/.test(url)) {
    searchCalls.push(url)
    // Answer only the query under test, so an unrelated prefetch cannot
    // populate the list and make this pass for the wrong reason.
    const q = new URL(url).searchParams.get('q')
    data = q === QUERY || q === QUERY_WITH_HITS ? HITS : []
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
})

const page = await ctx.newPage()
// DBG=1 surfaces page errors. Worth keeping: the first draft of this file
// stubbed bare arrays, every api() call threw on the missing {data,error}
// envelope, and the only visible symptom was an empty result list — which is
// indistinguishable from the bug under test.
page.on('console', (m) => {
  if (process.env.DBG && m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200))
})
page.on('pageerror', (e) => {
  if (process.env.DBG) console.log('PAGEERROR', String(e).slice(0, 300))
})
await page.addInitScript(
  ([k, v]) => window.localStorage.setItem(k, v),
  ['rundesk.auth', JSON.stringify(SESSION)],
)

try {
  /*
   * Inbox, not Home. The palette is mounted in the /app shell so any route
   * exercises it, and Home derives a space/project tree from several endpoints
   * at once — stubbing all of those faithfully would make this file a fixture
   * for a page it is not testing.
   */
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  await page.keyboard.press('Control+k')
  await page.waitForTimeout(800)
  const input = page.locator('[cmdk-input]').first()
  chk((await input.count()) > 0, 'the palette opens on ⌘K', 'the palette did not open')

  await input.fill(QUERY)
  await page.waitForTimeout(1500)

  // Caught: filtered to what is drawn, a hidden list waits out the timeout and would throw.
  const seen = (await page.locator('[cmdk-list]').first().filter({ visible: true }).innerText().catch(() => '')).replace(/\s+/g, ' ')

  // Each hit is checked by its TITLE, which does not contain the query — so a
  // title-scoring filter cannot let these through.
  for (const [label, title] of [
    ['a task that matched in its description', 'Q3 Finance Plan'],
    ['a doc that matched in its body', 'Onboarding'],
    ['a chat message (title is always "Chat message")', 'Chat message'],
    ['a comment that matched in its body', 'Comment on'],
  ]) {
    chk(seen.includes(title), `${label} is shown`, `${label} was dropped — the palette is filtering by title again`)
  }

  // The snippet is what tells the user WHY a row matched.
  chk(
    /throttling us|migrate the kubernetes/i.test(seen),
    'and the matching snippet is rendered with it',
    'the row rendered without the snippet that justifies it',
  )

  // "No matches" over results the browser is holding was the visible symptom.
  // Asked of the element cmdk draws for it — `[cmdk-empty]`, which exists only
  // while its list holds nothing — inside a list that is on screen, rather
  // than of today's wording, which any rewording of the empty state passed.
  const paletteLists = await page.locator('[cmdk-list]').count()
  const paletteEmpty = await page.locator('[cmdk-list] [cmdk-empty]').count()
  chk(
    paletteLists > 0 && paletteEmpty === 0,
    'the palette does not claim "no matches" while holding results',
    paletteLists ? 'the palette says "no matches" over results it has' : 'no palette list was on screen to read',
  )

  /*
   * Server order must survive. cmdk re-sorts by its own score when filtering,
   * so leaving the filter on silently discarded the ranking the search engine
   * had just computed. Tasks come first in ENTITY_ORDER, so the task group
   * must appear above the doc group.
   */
  chk(
    seen.indexOf('Q3 Finance Plan') < seen.indexOf('Onboarding'),
    'and the server’s ordering is preserved, not re-scored',
    'the results were re-ordered by the client',
  )

  // Command mode does its own filtering; turning cmdk's off must not break it.
  await input.fill('/')
  await page.waitForTimeout(600)
  const allCommands = (await page.locator('[cmdk-item]').count())
  await input.fill('/doc')
  await page.waitForTimeout(600)
  const narrowed = (await page.locator('[cmdk-item]').count())
  chk(
    allCommands > 0 && narrowed > 0 && narrowed < allCommands,
    `/ still narrows commands itself (${allCommands} -> ${narrowed})`,
    `command mode no longer filters (${allCommands} -> ${narrowed})`,
  )

  /*
   * ── G02-7 [02:14] — Assignee and Creator as people pickers ────────────────
   *
   * > "yeh kisi aur ko assign hai, ya phir is ka creator kaun hai … CREATOR ka
   * > matlab hai jis ne woh cheez banayi ho, aur ASSIGNEE ka matlab hai jis
   * > bande ko woh cheez di gayi ho."
   *
   * Both filters already worked; both were a native <select> of every member,
   * with no type-ahead and no avatars. Her frame 040_0225 shows the parent row
   * carrying the value inline ("Assignee · Anyone ›") over a submenu with a
   * "Search…" box and avatar rows.
   *
   * The swap is the risk: a picker that looks right and no longer reaches the
   * server is a worse state than the <select> it replaced, so the last checks
   * here read the outgoing request rather than the screen.
   */
  console.log('\n▶ G02-7 [02:14] — Assignee and Creator are searchable people pickers')

  await input.fill(QUERY)
  await page.waitForTimeout(1200)
  const palette = page.locator('[role=dialog]:visible, [cmdk-root]').first()
  await palette.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.waitForTimeout(800)

  const assignee = page.getByTestId('palette-assignee')
  chk(
    (await assignee.count()) > 0,
    'Assignee is a picker, not a bare dropdown',
    'the Assignee picker is not rendered',
  )
  chk(
    (await page.locator('[data-testid="palette-assignee-value"]').filter({ visible: true }).innerText().catch(() => '')).trim() ===
      'Anyone',
    'and it says "Anyone" inline, the way her frame does',
    'the current value is not shown on the row',
  )

  await assignee.click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)
  const search = page.getByTestId('palette-assignee-search')
  chk((await search.count()) > 0, 'opening it gives a search box', 'the picker has no search box')
  chk(
    (await page.locator('[data-testid^="palette-assignee-option-"]').count()) === MEMBERS.length,
    `every member is offered (${MEMBERS.length})`,
    'the picker does not list the workspace members',
  )

  // Type-ahead: the whole reason for the change.
  await search.fill('Hamda', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(400)
  chk(
    (await page.locator('[data-testid^="palette-assignee-option-"]').count()) === 2,
    'typing a name narrows the list',
    'typing did not narrow the list — the picker is a list, not a search',
  )

  // The case a name alone cannot settle.
  await search.fill('raza@', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(400)
  chk(
    (await page.getByTestId('palette-assignee-option-u3').count()) === 1 &&
      (await page.locator('[data-testid^="palette-assignee-option-"]').count()) === 1,
    'and an email address separates two people with the same first name',
    'searching by email does not find the person',
  )

  const beforePick = searchCalls.length
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('palette-assignee-option-u3').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  chk(
    (await page.locator('[data-testid="palette-assignee-value"]').filter({ visible: true }).innerText().catch(() => '')).trim() ===
      'Hamda Raza',
    'choosing somebody puts their name on the row',
    'the row still says "Anyone" after choosing a person',
  )
  chk(
    (await page.getByTestId('palette-assignee-menu').count()) === 0,
    'and the menu closes behind the choice',
    'the picker menu stays open after choosing',
  )

  // The check that matters: the picker still filters.
  const afterPick = searchCalls.slice(beforePick)
  chk(
    afterPick.some((u) => new URL(u).searchParams.get('assigneeId') === 'u3'),
    'and the choice reaches the server as assigneeId',
    `no search carried assigneeId=u3 (${afterPick.length} requests since)`,
  )

  // Creator is a second, independent question about the same people.
  await page.getByTestId('palette-creator').click()
  await page.waitForTimeout(500)
  const beforeCreator = searchCalls.length
  await page.getByTestId('palette-creator-option-u4').click()
  await page.waitForTimeout(1500)
  const afterCreator = searchCalls.slice(beforeCreator)
  chk(
    afterCreator.some((u) => {
      const p = new URL(u).searchParams
      return p.get('creatorId') === 'u4' && p.get('assigneeId') === 'u3'
    }),
    'Creator filters independently, and does not clear Assignee',
    'creator and assignee do not survive together',
  )

  // Clearing has to be reachable, which is what "Anyone" is for.
  await page.getByTestId('palette-assignee').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(400)
  const beforeClear = searchCalls.length
  await page.getByTestId('palette-assignee-anyone').click()
  await page.waitForTimeout(1500)
  chk(
    searchCalls.slice(beforeClear).some((u) => !new URL(u).searchParams.get('assigneeId')),
    '"Anyone" clears the filter again',
    'choosing "Anyone" does not clear assigneeId',
  )

  // A picker with no match must say so rather than look broken.
  await page.getByTestId('palette-creator').click()
  await page.waitForTimeout(400)
  await page.getByTestId('palette-creator-search').fill('zzzzz')
  await page.waitForTimeout(400)
  chk(
    (await page.getByTestId('palette-creator-empty').count()) > 0,
    'and a search that matches nobody says so',
    'an empty people search renders a blank panel',
  )

  /*
   * §A2.4 — "Clear filters" clears the filters it is counting.
   *
   * The badge counted seventeen controls and the button reset twelve. The five
   * left behind were the date pair and the space/folder/list pickers, so
   * narrowing a search to one Space and pressing Clear left the badge lit and
   * the results still narrowed, with no way out but closing the palette.
   *
   * palette-filters.test.ts keeps the two lists in step by reading the source.
   * This is the other half: that pressing the button in a real browser
   * actually puts the count back to zero. A source guard cannot tell you the
   * control is wired to anything.
   */
  console.log('\n▶ §A2.4 — Clear filters clears every filter it counts')
  /*
   * Reopened from scratch. The block above leaves the Creator submenu open,
   * and that popover covers the header row — including its own trigger, so it
   * cannot be clicked shut. Fighting an overlay would mean measuring the
   * overlay; a fresh palette is both cleaner and closer to how somebody
   * actually arrives at this button.
   */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(700)
  await page.locator('[cmdk-input]').first().fill(QUERY)
  await page.waitForTimeout(900)
  await page
    .locator('[role=dialog]:visible, [cmdk-root]')
    .first()
    .getByRole('button', { name: /Filters/ })
    .click()
  await page.waitForTimeout(700)

  const toggle = page.getByTestId('palette-filters-toggle')
  const countNow = async () => Number(await toggle.getAttribute('data-active-filters', { timeout: 5000 }).catch(() => null)) || 0

  /*
   * Driven with the created-after/created-before pair rather than the Space
   * picker. Both are among the five that were left behind, and both are always
   * rendered — the Space select is gated on `spacesQuery.data.length > 0`
   * (command-palette.tsx:811), so a workspace with no spaces would have made
   * this check pass by not running, which is the failure mode this suite
   * exists to catch.
   */
  await page.getByTestId('palette-created-after').fill('2020-01-01')
  await page.getByTestId('palette-created-before').fill('2030-01-01')
  await page.waitForTimeout(600)

  const before = await countNow()
  chk(before >= 2, `the two date filters count toward the badge (${before})`, `the badge reads ${before}`)

  const clear = page.getByTestId('palette-clear-filters')
  chk(await clear.isVisible().catch(() => false), 'Clear filters is on screen', 'the Clear filters button is not visible')
  /*
   * Reported rather than swallowed: a button that cannot be clicked is its own
   * defect, and the check below would otherwise blame the handler. Reported IN
   * that check, though, not beside it — a `bad()` in the `.catch` was a 44th
   * check that existed only when the click failed, so the path that found the
   * defect printed "44 of 43 checks ran" over it.
   */
  const unclicked = await clear.click({ timeout: 5000 }).then(() => null, (e) => e)
  await page.waitForTimeout(600)

  const after = await countNow()
  chk(
    !unclicked && after === 0,
    'Clear filters puts the count back to zero',
    unclicked
      ? `the Clear filters button could not be clicked (${String(unclicked.message).split('\n')[0]}), and the badge reads ${after}`
      : `the badge still reads ${after} after clearing`,
  )
  chk(
    (await page.getByTestId('palette-created-after').inputValue().catch(() => 'x')) === '',
    'and the date field is actually empty again',
    'created-after still holds its value after Clear filters',
  )

  /*
   * §G02 [03:52 / 04:32], frames 061_0352 / 071_0432 — "No exact matches found,
   * but here's a relevant answer from ✨ Brain".
   *
   * Two things are checked, and the second is the expensive one to get wrong:
   * the answer appears when search finds nothing, and the assistant is NOT
   * asked when it finds something. An LLM call per keystroke, or on every
   * successful search, is a cost nobody sees until the bill.
   */
  console.log('\n▶ §G02 — an answer instead of a dead end')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(700)
  const nonsense = `zzqqxx-no-such-thing-${Date.now()}`
  /*
   * Typed a character at a time, deliberately. `fill()` sets the value in one
   * shot, so a palette that asked the assistant on EVERY keystroke would still
   * make exactly one call and the "asked once" check below would be worth
   * nothing. Typing is what the user does and what the debounce exists for.
   */
  await page.locator('[cmdk-input]').first().pressSequentially(nonsense, { delay: 40 })
  // Longer than the 700ms debounce plus the round trip.
  await page.waitForTimeout(7000)

  chk(
    await page.getByTestId('palette-ai-answer').isVisible().catch(() => false),
    'a query that matches nothing gets an answer rather than a dead end',
    'no AI answer on a zero-result query',
  )
  const answerText = (await page.getByTestId('palette-ai-text').filter({ visible: true }).innerText().catch(() => '')).trim()
  chk(answerText === AI_ANSWER, 'and the answer it renders is the one the server sent',
    `rendered ${JSON.stringify(answerText)}`)
  chk(knowledgeStubCalls.length === 1, `asked the assistant once, not per keystroke (${knowledgeStubCalls.length})`,
    `${knowledgeStubCalls.length} calls to /ai/knowledge for one query`)

  /*
   * §G02 controls, frames 020_0124–035_0203 — copy, thumbs, and a way out.
   *
   * An answer with no way to keep it, disagree with it, or carry it into a
   * conversation is a paragraph in a dropdown. Each control is checked for the
   * thing it DOES, not for its presence: the thumb has to reach the server, the
   * source has to navigate, Continue has to hand the question over.
   */
  chk(
    await page.getByTestId('palette-ai-copy').isVisible().catch(() => false),
    'the answer can be copied',
    'no copy control under the answer',
  )
  const sourceLabel = (await page.getByTestId('palette-ai-source').first().filter({ visible: true }).innerText().catch(() => '')).trim()
  chk(sourceLabel === AI_SOURCE_TITLE, 'and it cites the source it was grounded in',
    `source chip read ${JSON.stringify(sourceLabel)}`)

  // The thumb: pressed once it reaches the server as 'up' and lights.
  await page.getByTestId('palette-ai-up').click()
  await page.waitForTimeout(800)
  chk(
    feedbackStubCalls.length === 1 && feedbackStubCalls[0].feedback === 'up',
    'a thumbs up reaches the server as an opinion, not just a colour change',
    `feedback calls: ${JSON.stringify(feedbackStubCalls)}`,
  )
  // This read opens the condition, so nothing stands in front of it to
  // short-circuit: a missing thumb would sit out the default timeout and take
  // the rest of the run down with it. Read it once, bounded, and let a missing
  // thumb come back null — compared against 'true' that reads as a failure,
  // which is exactly what an absent thumb is.
  const upThumbActive = await page
    .getByTestId('palette-ai-up')
    .getAttribute('data-active', { timeout: 8000 })
    .catch(() => null)
  chk(
    upThumbActive === 'true',
    'and the thumb it pressed is the one that lights up',
    'thumb did not report itself active',
  )
  // Pressing the lit thumb again clears it, matching the AI chat's convention.
  await page.getByTestId('palette-ai-up').click()
  await page.waitForTimeout(800)
  chk(
    feedbackStubCalls.length === 2 && feedbackStubCalls[1].feedback === null,
    'pressing the same thumb again clears the opinion',
    `second feedback call: ${JSON.stringify(feedbackStubCalls[1])}`,
  )

  chk(
    await page.getByTestId('palette-ai-continue').isVisible().catch(() => false),
    'and there is a way to continue the conversation with the assistant',
    'no "continue" control under the answer',
  )

  // A query that DOES find something must not spend a model call. Uses the
  // second hit-producing query so a cached answer cannot stand in for restraint.
  const beforeHits = knowledgeStubCalls.length
  await page.locator('[cmdk-input]').first().fill(QUERY_WITH_HITS)
  await page.waitForTimeout(7000)
  chk(
    knowledgeStubCalls.length === beforeHits,
    'and a search that finds results does not ask at all',
    `${knowledgeStubCalls.length - beforeHits} extra call(s) when results existed`,
  )

  /*
   * Continue LAST, because it closes the palette: run earlier it would strand
   * every check after it, and a check that cannot run is not a check that
   * passes.
   *
   * Asserted on what it produces — the palette gone and the assistant open —
   * rather than on the click landing. A button that closes the palette and
   * opens nothing is the dead end wearing a different hat.
   */
  await page.locator('[cmdk-input]').first().fill(nonsense)
  await page.waitForTimeout(7000)
  await page.getByTestId('palette-ai-continue').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  chk(
    !(await page.locator('[cmdk-input]').first().isVisible().catch(() => false)),
    'continuing closes the palette rather than stacking two surfaces',
    'palette still open after Continue',
  )
  chk(
    await page.locator('[data-testid="ai-model-tier"], [data-testid="ai-trace"]').first()
      .isVisible().catch(() => false),
    'and it opens the assistant, carrying the question out of the dead end',
    'assistant did not open after Continue',
  )

  /*
   * ── §G03-5 [04:20] — a Google Drive result has to actually open ───────────
   *
   * The whole federated chain worked up to the last inch: the API queries
   * Drive, the row renders under its own heading, and selecting it did
   * NOTHING. `go()` navigated only when the URL began "/app/", and a Drive hit
   * carries "https://drive.google.com/…", so the palette closed and the file
   * never appeared. Built, labelled, and unreachable.
   *
   * window.open is patched rather than followed: this run has no network to
   * Google, and what is being checked is that the app tries to open the URL it
   * was given — not that Google answers.
   */
  /*
   * ── §G02-6 [02:01] — a promoted chip stays promoted ───────────────────────
   *
   * > "yeh 3 DOTS dekh rahe hain? … to folders yahan pe appear ho jayega."
   *
   * The palette is mounted only while it is open, so `revealedTypes` started
   * empty on every ⌘K and the chip you promoted was gone the next time. The
   * control worked exactly once and then undid itself, which is worse than not
   * offering it — you learn it does nothing.
   *
   * The reopen is the whole check. Asserting the chip appears after the click
   * would have passed the entire time it was broken.
   */
  console.log('\n▶ §G02-6 — the ⋯ menu remembers what you promoted')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(900)
  chk(
    !(await page.getByTestId('palette-type-folder').isVisible().catch(() => false)),
    'Folders starts behind the ⋯, not on the bar',
    'the Folders chip is already on the bar, so promoting it proves nothing',
  )
  await page.getByTestId('palette-more-types').click()
  await page.waitForTimeout(600)

  /*
   * ESCAPE DISMISSES THE MENU WITHOUT TAKING THE PALETTE WITH IT.
   *
   * The menu ships a `fixed inset-0 z-40` click-catcher and nothing listened
   * for Escape — the same defect found the same afternoon on the planner's
   * calendar picker, where it left the header unusable. Here it is milder and
   * still real: the menu sits inside a Radix dialog whose own Escape shuts the
   * whole palette, so a keyboard user was never trapped, they were simply
   * given no way to dismiss the menu **without losing the query they had
   * typed**.
   *
   * BOTH HALVES ARE THE CHECK. "the menu closed" alone would pass on a handler
   * that let the keypress through to the dialog and closed everything, which
   * is the behaviour this replaces — so the palette still being open is what
   * distinguishes a fix from the bug.
   */
  const typed = 'zzq-escape-probe'
  await page.locator('[cmdk-input]').first().fill(typed)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const menuGone = !(await page.getByTestId('palette-more-types-menu').isVisible().catch(() => false))
  const paletteStill = await page.locator('[cmdk-input]').first().isVisible().catch(() => false)
  const queryKept = paletteStill
    ? await page.locator('[cmdk-input]').first().inputValue().catch(() => '')
    : ''
  chk(
    menuGone && paletteStill && queryKept === typed,
    'Escape closes the ⋯ menu and leaves the palette, and the query, alone',
    `menu ${menuGone ? 'closed' : 'STAYED OPEN'}, palette ` +
      `${paletteStill ? 'still open' : 'CLOSED TOO'}, query ${JSON.stringify(queryKept)} ` +
      `(typed ${JSON.stringify(typed)}) — a catcher with no Escape handler leaves no way to ` +
      'dismiss the menu except losing what you were searching for',
  )
  /*
   * THE PALETTE MAY BE GONE BY NOW, AND EVERY LINE BELOW ASSUMED IT WAS NOT.
   *
   * The check above is that Escape closes the ⋯ menu WITHOUT closing the
   * palette. `cp-43-more-types-escape-closes-all` makes it close both — and
   * then `[cmdk-input]').fill('')` spent thirty seconds on an input that no
   * longer exists, threw, and the run ended on `38 passed, 2 failed` with
   * `✗ 40 of 43 checks ran`. Three checks did not run, under a headline about
   * the harness.
   *
   * Re-opened if it went, and the two promotion checks report either way. The
   * failure above is the one that names the defect; these two say plainly that
   * they could not be evaluated on a palette that had to be re-opened by the
   * test.
   */
  const promo = chain(
    'choosing Folders puts it on the bar',
    'and it is still there the next time the palette opens',
  )
  const paletteGone = !(await page.locator('[cmdk-input]').first().isVisible().catch(() => false))
  if (paletteGone) {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(1200)
  }
  const backUp = await page.locator('[cmdk-input]').first().isVisible().catch(() => false)
  if (!backUp) {
    promo.rest('skipped: the palette was closed and would not re-open')
  } else {
    await page.locator('[cmdk-input]').first().fill('')
    await page.getByTestId('palette-more-types').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(600)

    await page.getByTestId('palette-add-type-folder').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(600)
    promo.step(
      await page.getByTestId('palette-type-folder').isVisible().catch(() => false),
      paletteGone
        ? 'the palette had closed and the promotion could not be driven from where the frame drives it'
        : 'the promoted type never appeared as a chip',
    )

    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(1200)
    promo.step(
      await page.getByTestId('palette-type-folder').isVisible().catch(() => false),
      'the promoted chip was forgotten as soon as the palette closed',
    )
  }

  console.log('\n▶ §G03-5 — a Drive result opens instead of doing nothing')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    window.__opened = []
    window.open = (url) => { window.__opened.push(String(url)); return null }
  })
  await page.locator('[cmdk-input]').first().fill(QUERY)
  await page.waitForTimeout(2500)
  const driveRow = page.locator('[cmdk-item]', { hasText: 'Kubernetes runbook.pdf' }).first()
  chk(
    await driveRow.isVisible().catch(() => false),
    'the Drive result is on screen',
    'no Drive row rendered for a query that returns one',
  )
  await driveRow.click()
  await page.waitForTimeout(1200)
  const DRIVE_URL_CHECK = DRIVE_URL
  const opened = await page.evaluate(() => window.__opened ?? [])
  chk(
    opened.includes(DRIVE_URL_CHECK),
    'and selecting it opens the file rather than silently closing the palette',
    `window.open received ${JSON.stringify(opened)}`,
  )

  await page.keyboard.press('Escape')
} catch (e) {
  bad(`threw: ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/command-palette-fail.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter(([p]) => !p)
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
if (results.length !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${results.length} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped ` +
      'early, so the count above describes the part it reached and nothing else.',
  )
  process.exit(1)
}
process.exit(failed.length ? 1 : 0)
