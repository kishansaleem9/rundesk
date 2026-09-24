/**
 * A CHANNEL'S WHOLE HISTORY IS REACHABLE, A THREAD SHOWS ITS NEWEST REPLIES,
 * AND A LINK TO AN OLD MESSAGE ARRIVES.
 *
 * NOT A FRAME ROW: the open-work item `chat-history-unreachable`. The chat page
 * read `messages?limit=100` — the newest hundred root messages — and nothing
 * else, though the server had a `before` cursor all along; so everything older
 * was unreachable, and a link to an older message opened a channel that did
 * not contain it and did nothing. A thread read its replies OLDEST first with
 * a limit of 100, so a thread past a hundred never showed the replies being
 * written now. The server's cursor compared a millisecond Date against a
 * microsecond column and ignored ties, so rows at a page boundary fell between
 * pages; and a cursor naming no message was ignored, answering with the newest
 * page again.
 *
 * THE FIXTURE: a channel of 230 root messages, `m001` oldest to `m230` newest —
 * three pages of 100 on screen — and a thread of 130 replies under `m230`.
 * Two page boundaries are staged in Postgres, the only thing here that is: the
 * order of rows written a millisecond apart is not something the API can be
 * asked for.
 *
 *   node test/e2e/chat-history.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 14

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `chx-${stamp}`
const ROOTS = 230
const REPLIES = 130
const label = (i) => `${TAG} m${String(i).padStart(3, '0')}`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null
let api = null
let sql = null
let WS = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the page boundaries are staged in Postgres and cannot be skipped')
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const channel = async (name) => {
    const res = await api(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make channel ${name}: ${res.status}`)
    return res.data.id
  }
  const CH = await channel(`history-${stamp}`)
  const OTHER = await channel(`elsewhere-${stamp}`)
  const post = async (ch, body, parentMessageId) => {
    const res = await api(`/chat/channels/${ch}/messages`, { method: 'POST', body: { body, parentMessageId } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not post "${body}": ${res.status}`)
    return res.data.id
  }
  const ids = []
  for (let i = 1; i <= ROOTS; i++) ids.push(await post(CH, label(i)))
  const elsewhere = await post(OTHER, `${TAG} in another channel`)
  const PARENT = ids[ROOTS - 1]
  for (let i = 1; i <= REPLIES; i++) await post(CH, `${TAG} r${String(i).padStart(3, '0')}`, PARENT)
  const page = (params) => api(`/chat/channels/${CH}/messages?${params}`)

  // ══ 1. THE CURSOR ════════════════════════════════════════════════════════
  console.log('\n▶ every root message is on exactly one page')

  const walk = async (size) => {
    const seen = []
    let before = null
    for (let n = 0; n < 10; n++) {
      const res = await page(`limit=${size}${before ? `&before=${before}` : ''}`)
      const rows = res.data ?? []
      if (!rows.length) break
      seen.unshift(...rows.map((m) => m.id))
      before = rows[0].id
      if (rows.length < size) break
    }
    return seen
  }
  const all = await walk(100)
  chk(
    all.length === ROOTS && new Set(all).size === ROOTS && all.every((id, i) => id === ids[i]),
    'paging back 100 at a time reaches all 230, each once, in order',
    `${all.length} ids, ${new Set(all).size} distinct`,
  )

  // The 100th and 101st newest — the last of page one and the first of page
  // two — put into one millisecond, 400µs apart, the rest one second apart.
  const newest = [...ids].reverse()
  await sql`
    with ordered as (
      select id, row_number() over (order by created_at desc, id desc) as rn
      from chat_messages where channel_id = ${CH} and parent_message_id is null
    )
    update chat_messages c
       set created_at = timestamptz '2026-01-01 12:00:00+00' - (o.rn * interval '1 second')
      from ordered o where c.id = o.id`
  await sql`update chat_messages set created_at = timestamptz '2026-01-01 11:58:20.000700+00' where id = ${newest[99]}`
  await sql`update chat_messages set created_at = timestamptz '2026-01-01 11:58:20.000300+00' where id = ${newest[100]}`
  const one = (await page('limit=100')).data ?? []
  const two = (await page(`limit=100&before=${one[0]?.id}`)).data ?? []
  chk(
    one[0]?.id === newest[99] && two[two.length - 1]?.id === newest[100],
    'the message a few hundred microseconds older than the last of page one ends page two',
    `page one starts ${one[0]?.id === newest[99] ? 'right' : one[0]?.id}; page two ends ${two[two.length - 1]?.id} (expected ${newest[100]})`,
  )
  await sql`update chat_messages set created_at = timestamptz '2026-01-01 11:58:20.000500+00' where id in (${newest[99]}, ${newest[100]})`
  const tiedOne = (await page('limit=100')).data ?? []
  const tiedTwo = (await page(`limit=100&before=${tiedOne[0]?.id}`)).data ?? []
  const tiedAll = new Set([...tiedOne, ...tiedTwo].map((m) => m.id))
  chk(
    tiedAll.size === 200 && tiedAll.has(newest[99]) && tiedAll.has(newest[100]),
    'and two messages at one instant are both shown, one on each side of the boundary',
    `${tiedAll.size} distinct across two pages; both tied rows present: ${tiedAll.has(newest[99]) && tiedAll.has(newest[100])}`,
  )
  const foreign = await page(`limit=100&before=${elsewhere}`)
  const tooMany = await page('limit=500')
  chk(
    foreign.status === 400 && foreign.data == null && tooMany.status === 400 && tooMany.data == null,
    'a cursor from another channel, and a page of 500, are refused with nothing listed',
    `foreign cursor ${foreign.status} with ${(foreign.data ?? []).length} rows; limit=500 ${tooMany.status}`,
  )

  // ══ 2. THE THREAD ════════════════════════════════════════════════════════
  console.log('\n▶ a thread shows its newest replies, and the rest on request')

  const thread = await api(`/chat/messages/${PARENT}/thread`)
  const shown = (thread.data?.replies ?? []).map((r) => r.body)
  const older = thread.data?.replies?.[0]
    ? await api(`/chat/messages/${PARENT}/thread?before=${thread.data.replies[0].id}`)
    : { data: null }
  chk(
    shown.length === 100 &&
      shown[99] === `${TAG} r130` &&
      !shown.includes(`${TAG} r001`) &&
      thread.data?.hasOlder === true &&
      (older.data?.replies ?? []).length === 30 &&
      older.data?.hasOlder === false,
    'the first page is the newest hundred, r130 last; the thirty before them come on request',
    `first page ${shown.length} ending ${JSON.stringify(shown[99])}, hasOlder ${thread.data?.hasOlder}; then ${(older.data?.replies ?? []).length}, hasOlder ${older.data?.hasOlder}`,
  )

  // ══ 3. THE CHANNEL, ON SCREEN ════════════════════════════════════════════
  console.log('\n▶ the channel pages back as you scroll up, and keeps your place')

  browser = await chromium.launch(launchOptions())
  // Service workers blocked: the held first page below is a ROUTE, and a route
  // never sees a request the worker answers (routes-bypassed-by-the-service-worker).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const tab = await ctx.newPage()
  await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await tab.fill('input[type=email]', EMAIL)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // The first page is HELD until this has looked — not for a fixed time: on a
  // loaded machine the app can take longer than any fixed hold to ask for it,
  // and a check that looks after the answer has landed proves nothing.
  let release
  const gate = new Promise((r) => { release = r })
  const MESSAGES = `**/chat/channels/${CH}/messages**`
  /*
   * The handler catches its own error, and the route is taken down only once
   * the rows have arrived: taking it down straight after `release()` let
   * Playwright settle the held request first, and the handler's late
   * `continue()` threw "Route is already handled!", killing the run.
   */
  let held = false
  await tab.route(MESSAGES, async (route) => {
    held = true
    await gate
    await route.continue().catch(() => {})
  })
  await tab.goto(`${B}/app/${WS}/chat?channel=${CH}`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await tab.getByTestId('chat-messages-loading').count()) > 0, { timeoutMs: 30_000 })
  const welcomeWhileLoading = await tab.getByText('This is the start of', { exact: false }).count().catch(() => 0)
  chk(
    held && (await tab.getByTestId('chat-messages-loading').count()) > 0 && welcomeWhileLoading === 0,
    'while the first page loads the list is shapes — not "the start of the conversation"',
    `${held ? 'the first page was held' : 'the route never held the first page'}; loading shapes ` +
      `${await tab.getByTestId('chat-messages-loading').count()}, welcome text ${welcomeWhileLoading}`,
  )
  release()

  const rows = tab.locator('[data-testid^="message-row-"]')
  await waitUntil(async () => (await rows.count()) >= 100, { timeoutMs: 20_000 })
  await tab.unroute(MESSAGES).catch(() => {})
  await tab.waitForTimeout(800)
  const firstCount = await rows.count()
  const newestVisible = await tab.getByTestId(`message-row-${newest[0]}`).isVisible().catch(() => false)
  chk(
    firstCount === 100 && newestVisible,
    'the channel opens on its newest hundred, the newest message in view',
    `${firstCount} rows on open; newest in view ${newestVisible}`,
  )

  const scroller = tab.locator('[data-testid^="message-row-"]').first().locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]')
  const topmost = (await rows.first().getAttribute('data-testid', { timeout: 5000 }).catch(() => null)) ?? 'message-row-none'
  await scroller.evaluate((el) => { el.scrollTop = 0 })
  await waitUntil(async () => (await rows.count()) >= 200, { timeoutMs: 15_000 })
  await tab.waitForTimeout(500)
  const kept = await tab.getByTestId(topmost).evaluate((el) => {
    const box = el.getBoundingClientRect()
    const list = el.closest('.overflow-y-auto')
    if (!list) return false
    const view = list.getBoundingClientRect()
    return box.bottom > view.top && box.top < view.bottom
  }, undefined, { timeout: 5000 }).catch(() => false)
  chk(
    (await rows.count()) === 200 && kept,
    'scrolling to the top loads the next hundred — and the message that was at the top is still in view',
    `${await rows.count()} rows; the previous top row still in view: ${kept}`,
  )

  await scroller.evaluate((el) => { el.scrollTop = 0 })
  await waitUntil(async () => (await rows.count()) === ROOTS, { timeoutMs: 15_000 })
  await tab.waitForTimeout(400)
  chk(
    (await rows.count()) === ROOTS && (await tab.getByTestId('chat-load-older').count()) === 0,
    'and the last scroll reaches m001, after which there is nothing older to offer',
    `${await rows.count()} rows; load-older controls left: ${await tab.getByTestId('chat-load-older').count()}`,
  )

  // Live, three pages up: an edit to the OLDEST message, and a new one at the end.
  const edited = await api(`/chat/messages/${ids[0]}`, { method: 'PATCH', body: { body: `${TAG} m001 edited` } })
  const arrived = await post(CH, `${TAG} arrived live`)
  const oldRow = tab.getByTestId(`message-row-${ids[0]}`)
  await waitUntil(async () => ((await oldRow.textContent().catch(() => '')) ?? '').includes('m001 edited'), { timeoutMs: 10_000 })
  await waitUntil(async () => (await tab.getByTestId(`message-row-${arrived}`).count()) === 1, { timeoutMs: 10_000 })
  chk(
    edited.status < 300 &&
      ((await oldRow.textContent().catch(() => '')) ?? '').includes('m001 edited') &&
      (await tab.getByTestId(`message-row-${arrived}`).count()) === 1,
    'an edit to the oldest message, three pages up, shows live — and a new message lands at the end',
    `edit answered ${edited.status}; old row reads ${JSON.stringify(((await oldRow.textContent().catch(() => '')) ?? '').slice(0, 80))}; new row present ${(await tab.getByTestId(`message-row-${arrived}`).count()) === 1}`,
  )

  // ══ 4. LINKS TO OLD MESSAGES ═════════════════════════════════════════════
  console.log('\n▶ a link to an old message pages back to it')

  const target = ids[4]
  await tab.goto(`${B}/app/${WS}/chat?channel=${CH}&message=${target}`, { waitUntil: 'domcontentloaded' })
  const linked = tab.getByTestId(`message-row-${target}`)
  await waitUntil(async () => (await linked.getAttribute('data-highlighted').catch(() => null)) === 'true', { timeoutMs: 20_000 })
  chk(
    (await linked.getAttribute('data-highlighted').catch(() => null)) === 'true',
    'a link to m005 — two pages back — loads them, and m005 arrives highlighted',
    `m005's row: ${(await linked.count()) ? `highlighted=${await linked.getAttribute('data-highlighted').catch(() => null)}` : 'never loaded'}`,
  )

  await tab.goto(`${B}/app/${WS}/chat?channel=${CH}&message=${elsewhere}`, { waitUntil: 'domcontentloaded' })
  const toast = tab.locator('[data-sonner-toast]')
  await waitUntil(async () => ((await toast.allTextContents().catch(() => [])).join(' ')).includes('isn’t in this channel'), { timeoutMs: 20_000 })
  chk(
    ((await toast.allTextContents().catch(() => [])).join(' ')).includes('isn’t in this channel'),
    'and a link to a message this channel does not hold says so, after looking',
    `toasts: ${JSON.stringify((await toast.allTextContents().catch(() => [])).join(' | ').slice(0, 160))}`,
  )

  // ══ 5. THE THREAD PANEL ══════════════════════════════════════════════════
  console.log('\n▶ the thread panel opens on its newest replies')

  await tab.goto(`${B}/app/${WS}/chat?channel=${CH}&thread=${PARENT}`, { waitUntil: 'domcontentloaded' })
  const panel = tab.getByTestId('chat-thread-panel')
  await waitUntil(async () => ((await panel.textContent().catch(() => '')) ?? '').includes(`${TAG} r130`), { timeoutMs: 20_000 })
  const panelText = (await panel.textContent().catch(() => '')) ?? ''
  chk(
    panelText.includes(`${TAG} r130`) && !panelText.includes(`${TAG} r001`) && (await tab.getByTestId('thread-load-older').count()) === 1,
    'the thread panel shows r130, not r001, with "Load earlier replies" above them',
    `r130 ${panelText.includes(`${TAG} r130`)}, r001 ${panelText.includes(`${TAG} r001`)}, load control ${await tab.getByTestId('thread-load-older').count()}`,
  )
  await tab.getByTestId('thread-load-older').click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => ((await panel.textContent().catch(() => '')) ?? '').includes(`${TAG} r001`), { timeoutMs: 10_000 })
  chk(
    ((await panel.textContent().catch(() => '')) ?? '').includes(`${TAG} r001`) && (await tab.getByTestId('thread-load-older').count()) === 0,
    'and asking for them brings the first thirty, after which nothing earlier is offered',
    `r001 present ${((await panel.textContent().catch(() => '')) ?? '').includes(`${TAG} r001`)}, load control ${await tab.getByTestId('thread-load-older').count()}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
