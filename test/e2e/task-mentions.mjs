/**
 * §V2-05 frames `04:00` and `04:11` — THE @ PICKER'S SIX SECTIONS, THE KEYBOARD
 * HINT FOOTER, AND THE `Comment ▾` MODE SWITCH.
 *
 * Frame `04:00` draws the picker with six tabs —
 * **People | Tasks | Docs | Whiteboards | Locations | Channels** — and a footer
 * of per-type keyboard hints:
 *
 *     '@' People | '@@' Tasks | '@@@' Docs | '@@@@' Whiteboards |
 *     '@/' Locations | '#' Channels
 *
 * Rundesk had the first three tabs and no footer at all.
 *
 * THE DEFECT CLASS THIS ROW IS MADE OF. A picker section is the easiest facade
 * in the product to build: render a tab, render "no matches", and it photographs
 * as complete for ever. So every new section here is checked against a row THIS
 * RUN SEEDED — a whiteboard, a list and a channel carrying this run's tag — and
 * the check is "it found mine", never "it rendered something".
 *
 * And a hint is a promise about a keystroke. The footer prints `@@@@` for
 * Whiteboards, so the suite TYPES `@@@@` and asserts the tab moved: a hint
 * beside a shortcut that does not work is the Priorities-rail defect (an
 * instruction printed on a surface that cannot follow it) in a smaller box.
 *
 * Frame `04:11`'s split button is a MODE SWITCH — Comment carries the tick,
 * Email sits under it. Rundesk cannot send mail out (`email-to-task.ts` runs the
 * other way and no endpoint posts a composed body anywhere), so the suite's job
 * is to prove the menu SAYS that rather than offering a mode that silently does
 * nothing when chosen.
 *
 *   node test/e2e/task-mentions.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 17

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

/* `apiClient` never throws — it resolves `{status, data, error}`. Judged on
 * `status`, every time. */
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

/*
 * One nonsense word per run, and every fixture wears it. The e2e database is
 * shared: "the Locations tab found three rows" is a claim about everybody
 * else's spaces as well, and a suite that makes it is asserting on data it did
 * not create.
 */
const TAG = `zqx${Date.now().toString(36)}`

/*
 * EVERY CLICK IN THIS SUITE IS BOUNDED. A control one of this suite's own break
 * patches removes is a failing check below; an unqualified `.click()` is instead
 * thirty seconds and a run that ends where it stood, with the checks after it
 * never reported. Eleven patches across nine suites did exactly that before this
 * was applied ahead of the runs rather than after them.
 */
try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  const list = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List ${TAG}` } })).data
  const task = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Subject ${TAG}` } })).data
  if (!task?.id) throw new Error('could not make a task')

  const board = (await A(`/workspaces/${workspaceId}/canvases`, {
    method: 'POST',
    body: { type: 'whiteboard', title: `Board ${TAG}`, data: { items: [] } },
  })).data
  const channel = (await A(`/workspaces/${workspaceId}/chat/channels`, {
    method: 'POST',
    body: { name: `chan-${TAG}` },
  })).data

  // -------------------------------------------------------------------------
  console.log('\n▶ each new section has something REAL behind it')

  const boards = await A(`/workspaces/${workspaceId}/canvases?type=whiteboard`)
  chk(
    boards.status === 200 && (boards.data ?? []).some((b) => b.id === board?.id),
    'Whiteboards resolve: GET /workspaces/:ws/canvases?type=whiteboard returns the board this run made',
    `it answered ${boards.status} with ${(boards.data ?? []).length} boards and mine was not among them — ` +
      'a tab over an endpoint that cannot return your own whiteboard is a tab that can only say "no matches"',
  )

  const locations = await A(`/search/${workspaceId}?q=${TAG}&types=space,folder,list&limit=20`)
  const locRows = locations.data?.results ?? locations.data ?? []
  const locTypes = [...new Set(locRows.map((r) => r.entityType))]
  chk(
    locations.status === 200
      && locRows.some((r) => (r.title ?? '').includes(TAG))
      && locTypes.length > 0
      && locTypes.every((ty) => ['space', 'folder', 'list'].includes(ty)),
    `Locations resolve: the search returns this run's own containers and only location types (${locTypes.join(', ')})`,
    locRows.length === 0
      ? `the search answered ${locations.status} with nothing — "every row is a location" would have been ` +
        'vacuously true over an empty list, so this check asserts the list is non-empty first'
      : `it returned types [${locTypes.join(', ')}] — the types filter is not narrowing, and picking ` +
        'Locations would offer tasks and docs under a Location label',
  )

  const channels = await A(`/workspaces/${workspaceId}/chat/channels`)
  chk(
    channels.status === 200 && (channels.data ?? []).some((c) => (c.name ?? '').includes(TAG)),
    'Channels resolve: the chat channel list carries the channel this run made',
    `it answered ${channels.status} without this run's channel`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the picker, frame `04:00`')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (r) => requests.push(r.url()))

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.getByTestId('cookie-accept').first()
    if (await accept.isVisible().catch(() => false)) { await accept.click().catch(() => {}); return }
    const fallback = page.locator('button:has-text("Accept")').first()
    if (await fallback.isVisible().catch(() => false)) await fallback.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never mounted')
  }
  await page.getByTestId('task-tab-comments').click({ timeout: 8000 }).catch(() => {})
  const input = page.getByTestId('comment-input')
  if (!(await waitUntil(() => input.isVisible().catch(() => false), { timeoutMs: 20_000 }))) {
    throw new Error('the comment composer never mounted')
  }

  const picker = page.getByTestId('comment-mention-picker')
  // GUARDED ON BOTH LINES. The press was bounded and the typing under it was
  // not, which only moves the thirty seconds along — the shape that has turned
  // up five times in this sweep (ledger §10).
  await input.click({ timeout: 8000 }).catch(() => {})
  await input.fill('@', { timeout: 8000 }).catch(() => {})
  if (!(await waitUntil(() => picker.isVisible().catch(() => false), { timeoutMs: 15_000 }))) {
    throw new Error('the @ picker never opened')
  }

  const tabIds = await page.locator('[data-testid^="mention-tab-"]').evaluateAll((els) =>
    // `?? ''` because a tab without the attribute would throw a TypeError
    // INSIDE the page, which arrives as an unhelpful evaluation error rather
    // than a failing check.
    els.map((el) => (el.getAttribute('data-testid') ?? '').replace('mention-tab-', '')),
  )
  chk(
    tabIds.join(',') === 'people,tasks,docs,whiteboards,locations,channels',
    'the picker draws all six of the frame\'s tabs, in the frame\'s order',
    `it draws [${tabIds.join(', ')}] — the frame names six`,
  )

  /*
   * The footer, read as TEXT. It is the thing a person follows, so the check is
   * on what it printed — and `textContent`, because a `<code>` in it is not
   * transformed and this suite should say which it means.
   */
  const footer = page.getByTestId('mention-hints')
  /* `mention-hints` for the container and `mention-hint-<tab>` for each hint, so
   * this prefix query counts the hints and not the box they sit in. */
  const hints = await page.locator('[data-testid^="mention-hint-"]').allTextContents()
  const hintLine = hints.map((h) => h.replace(/\s+/g, ' ').trim()).join(' | ')
  chk(
    (await footer.isVisible().catch(() => false))
      && hints.length === 6
      && ['@@@@', '@@@', '@@', '@/', '@#'].every((p) => hintLine.includes(p)),
    `the footer prints one hint per @ type: ${hintLine}`,
    `the footer printed ${hints.length} hints (${hintLine}) — the frame's footer names all six`,
  )

  /** Which section is showing, read off the picker itself rather than guessed. */
  // `.catch` because `tmn-5-picker-gated-on-people` gates the picker away, and
  // this read then waited out the default timeout and ended the run at 8 of 17.
  const tabNow = () => picker.getAttribute('data-tab').catch(() => null)

  await input.fill('@@@@')
  const onBoards = await waitUntil(async () => (await tabNow()) === 'whiteboards', { timeoutMs: 10_000 })
  chk(
    onBoards,
    'typing the footer\'s own `@@@@` moves the picker to Whiteboards — the hint is followable',
    `the picker is on "${await tabNow()}" after typing the prefix its own footer prints for Whiteboards`,
  )

  await input.fill(`@@@@${TAG}`)
  const boardRows = page.getByTestId('mention-whiteboards-row')
  const foundBoard = await waitUntil(async () => (await boardRows.count()) === 1, { timeoutMs: 15_000 })
  chk(
    foundBoard && ((await boardRows.first().textContent()) ?? '').includes(TAG),
    'and narrowing to this run\'s tag leaves exactly the whiteboard this run made',
    `${await boardRows.count()} whiteboard rows matched a word only one board in the database contains`,
  )

  /*
   * A CACHE MISS BY CONSTRUCTION. `lib/query.ts` sets a 30-second `staleTime`,
   * so a key fetched seconds ago fires no request and a request check becomes a
   * race. `mentionQuery` is part of the Locations key and this tag has never
   * been searched for, so the request has to go out.
   */
  requests.length = 0
  await input.fill(`@/${TAG}`)
  const onLocations = await waitUntil(async () => (await tabNow()) === 'locations', { timeoutMs: 10_000 })
  const locRowsUi = page.getByTestId('mention-locations-row')
  const foundLoc = await waitUntil(async () => (await locRowsUi.count()) > 0, { timeoutMs: 15_000 })
  chk(
    onLocations && foundLoc
      && (await locRowsUi.allTextContents()).every((txt) => txt.includes(TAG)),
    `typing \`@/\` moves to Locations and every row shown (${await locRowsUi.count()}) is one of this run's containers`,
    onLocations
      ? `${await locRowsUi.count()} rows came back and not all of them are this run's — the section is not narrowing`
      : `the picker is on "${await tabNow()}" after the Locations prefix`,
  )

  /*
   * READ THE REQUEST, DO NOT PATTERN-MATCH ITS SPELLING.
   *
   * This row used to be `u.includes('types=space%2Cfolder%2Clist')` and could
   * not pass however right the product was: a comma is a sub-delim (RFC 3986
   * §2.2), so a browser leaves it alone in a query string and `request.url()`
   * reports the real wire form `types=space,folder,list`. The percent-encoded
   * spelling is what `URLSearchParams` happens to emit — one of two legal ways
   * to write the same filter — so the check was asserting a STRING-BUILDING
   * STYLE rather than the protection. It would also have gone green for a
   * client-side filter the day someone switched the fetch to `URLSearchParams`
   * for unrelated reasons, which is the worse half of the mistake.
   *
   * So the URL is PARSED, and the invariant is stated whole: a request left the
   * page for `/search/`, carrying THE WORD JUST TYPED, narrowed to exactly the
   * three location types. That is "the browser cannot hold the space tree, so
   * the server has to narrow it" in the only form the wire can show it, and it
   * holds in either encoding because `searchParams` decodes before comparing.
   */
  const LOCATION_TYPES = 'folder,list,space' // sorted, so the order sent is not the assertion
  const searchCalls = requests.filter((u) => {
    try { return new URL(u).pathname.includes('/search/') } catch { return false }
  })
  const locationCalls = searchCalls.filter((u) => {
    const q = new URL(u).searchParams
    const sent = [...new Set((q.get('types') ?? '').split(',').map((t) => t.trim()).filter(Boolean))]
    return sent.sort().join(',') === LOCATION_TYPES
      && (q.get('q') ?? '').toLowerCase() === TAG.toLowerCase()
  })
  chk(
    locationCalls.length > 0,
    'and the narrowing went to the SERVER carrying `types=space,folder,list` and this run\'s own word',
    searchCalls.length === 0
      ? 'no request carried the location types, so whatever narrowed was a list already in the browser — which is ' +
        'the whole space tree, and cannot be one'
      : `the only search that went out was \`${new URL(searchCalls[0]).search}\` — it reached the server but not as ` +
        `q=${TAG} over space,folder,list, so the rows on screen are not a location search for what was typed`,
  )

  await input.fill(`@#${TAG}`)
  const onChannels = await waitUntil(async () => (await tabNow()) === 'channels', { timeoutMs: 10_000 })
  const chanRows = page.getByTestId('mention-channels-row')
  const foundChan = await waitUntil(async () => (await chanRows.count()) === 1, { timeoutMs: 15_000 })
  chk(
    onChannels && foundChan,
    'typing `@#` moves to Channels and finds exactly the channel this run made',
    onChannels
      ? `${await chanRows.count()} channel rows matched this run's tag`
      : `the picker is on "${await tabNow()}" after the Channels prefix`,
  )

  /*
   * THE FOUR-@ CUT. `@@@@` is four characters and the old insert cut back to
   * `lastIndexOf('@')`, which would have left three of them in the comment. The
   * check reads the whole field rather than "it contains the title".
   */
  await input.fill(`@@@@${TAG}`)
  await waitUntil(async () => (await boardRows.count()) === 1, { timeoutMs: 15_000 })
  await boardRows.first().click({ timeout: 8000 }).catch(() => {})
  const inserted = await waitUntil(async () => !(await input.inputValue()).includes('@'), { timeoutMs: 10_000 })
  const value = await input.inputValue({ timeout: 5000 }).catch(() => '')
  chk(
    inserted && value.trim() === `Whiteboard:Board ${TAG}`,
    `choosing it writes exactly "${value.trim()}" — the whole prefix is cut, not just its last character`,
    `the composer reads "${value}" — leftover @s, or the wrong label`,
  )

  /*
   * THE DEFECT THIS ROW TURNED UP. The picker used to render only while the
   * PEOPLE list had a match, whatever tab was showing — so narrowing a
   * non-People section to a word no colleague's name contains made the whole
   * picker disappear mid-search. This tag matches no person by construction.
   */
  await input.fill(`@@@@${TAG}`)
  const survived = await waitUntil(() => picker.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const peopleForTag = await page.getByTestId('mention-candidate').count()
  const boardsStillThere = await boardRows.count()
  chk(
    survived && peopleForTag === 0 && boardsStillThere === 1,
    `and the picker stays up on Whiteboards (1 row) while the People list has ${peopleForTag} matches for the same word`,
    'the picker vanished while a Whiteboards search was narrowed to a word no colleague is called — the tab strip ' +
      'went with it, so the section could not be used at all',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the `Comment ▾` split button, frame `04:11` — a MODE switch')

  await input.fill('')
  const trigger = page.getByTestId('comment-mode-trigger')
  chk(
    await trigger.isVisible().catch(() => false),
    'the composer footer carries the split button the frame draws',
    'no `Comment ▾` control on the composer',
  )

  await trigger.click({ timeout: 8000 }).catch(() => {})
  const commentItem = page.getByTestId('comment-mode-item-comment')
  const emailItem = page.getByTestId('comment-mode-item-email')
  const opened = await waitUntil(() => emailItem.isVisible().catch(() => false), { timeoutMs: 10_000 })
  /* The ITEMS have their own prefix; the trigger and the reason line do not sit
   * under it, so this counts menu rows rather than everything mode-shaped. */
  const itemCount = await page.locator('[data-testid^="comment-mode-item-"]').count()
  chk(
    opened && itemCount === 2,
    'it opens on exactly the frame\'s two modes, Comment and Email — no more, no fewer',
    `the menu holds ${itemCount} items; the frame draws two`,
  )

  chk(
    (await commentItem.getAttribute('data-selected').catch(() => null)) === 'yes'
      && (await emailItem.getAttribute('data-available').catch(() => null)) === 'no',
    'Comment carries the tick and Email is not selectable',
    `Comment is marked "${await commentItem.getAttribute('data-selected').catch(() => null)}" and ` +
      `Email is marked "${await emailItem.getAttribute('data-available').catch(() => null)}" — an ` +
      'Email mode you can choose is a mode that cannot post',
  )

  // Bounded and caught: nothing short-circuits a standalone assignment, so an
  // absent element spends Playwright's default thirty seconds here and ends
  // the section. The consumer below already treats the caught value as a
  // miss, so absence reports rather than throws.
  const reason =
    (await page.getByTestId('comment-mode-reason-email').textContent({ timeout: 8000 }).catch(() => null)) ?? ''
  chk(
    reason.toLowerCase().includes('email') && reason.trim().length > 30,
    `and the row itself says why: "${reason.trim().slice(0, 80)}…"`,
    reason.trim().length === 0
      ? 'Email is greyed out and says nothing — a disabled row with no reason sends the reader looking for a setting ' +
        'that does not exist'
      : `the reason reads "${reason.trim()}"`,
  )

  /*
   * Pressing it must not move the mode. A disabled item that still fires would
   * leave the composer in a state it cannot post from, which is worse than the
   * absence this row started as.
   */
  await emailItem.click({ force: true }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  /*
   * A chk message is built whether the check passes or fails, so read the mode
   * once up here, bounded and caught — `trigger` is a locator held in a variable,
   * the shape rule six could not see until it learnt to track locator variables.
   * A trigger that is gone reads null, which fails the check rather than hanging.
   */
  const composerMode = await trigger.getAttribute('data-mode', { timeout: 8000 }).catch(() => null)
  chk(
    composerMode === 'comment',
    'and pressing Email leaves the composer in Comment mode rather than a mode with no send behind it',
    `the composer is now in ${JSON.stringify(composerMode)} mode`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-mentions.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  sql = await openDb().catch(() => null)
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from canvases where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from chat_channels where name like ${'%' + TAG}`.catch(() => {})
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
