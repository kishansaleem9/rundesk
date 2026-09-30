/**
 * A PUBLIC DOC'S LINK DRAWS THE DOC (`found-30-sep/public-doc-page-reads-the-envelope`).
 *
 * `/d/<slug>` read the API's answer as the doc itself, but every answer comes
 * wrapped as `{ data, meta, error }`. So a doc shared publicly opened to no
 * title, "last updated Invalid Date" and an empty page, and nothing said so:
 * `doc-boundaries` reads the public route through the API, and no suite
 * opened the page.
 *
 * ClickUp, from the help centre ("Share locations and items with a public
 * link", "Share Docs"; read through search results): anyone with a Doc's
 * public link "can view the item on a web browser and they do not need a
 * ClickUp account"; "publicly shared items are view only"; turning "Share link
 * with anyone" off stops the link. So a visitor who is signed in nowhere reads
 * the doc as it was written and cannot change it, and a link that was turned
 * off, or a doc that was archived, says so.
 *
 * AGAINST THE REAL API, in a browser signed in nowhere. One check makes the
 * API fail on purpose, by answering the page's request in the browser with a
 * 500: nothing else makes a healthy API fail, and a failure is not a revoked
 * link.
 *
 *   node test/e2e/public-doc-page.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the copy, it answers status 0 when nothing answers. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`
/** What the public route answers a visitor with no account, for a slug. */
const anonymous = apiAs(null)
const publicStatus = async (slug) => (await anonymous(`/public/docs/${encodeURIComponent(slug)}`)).status

const TAG = `e2e-pubdoc-${Date.now()}`
const TITLE = `Launch brief ${TAG}`
const ICON = '📘'
const HEADING = 'What the client reads first'
const PARAGRAPH = `Everything in this brief is agreed, ${TAG}.`
const TODO = 'Brief signed off'
const CELLS = ['Week', 'Deliverable', '1', 'Kick-off deck']
const CALLOUT = 'Rates are fixed until March.'
const EMBEDDED_LIST = `Launch tasks ${TAG}`
const text = (t) => ({ type: 'text', text: t })
const para = (t) => ({ type: 'paragraph', content: [text(t)] })
const cell = (type, t) => ({ type, content: [para(t)] })
/**
 * The doc as its editor writes it: every block the public page registers
 * (A5.8). The embed names a real list, as one embedded from the editor does:
 * a view that reads the list (the signed-in one) then asks the API for it,
 * and one that names no list asks for nothing (pdp-13 went unproven so).
 */
const contentFor = (listId) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text(HEADING)] },
    para(PARAGRAPH),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(TODO)] }] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', CELLS[0]), cell('tableHeader', CELLS[1])] },
        { type: 'tableRow', content: [cell('tableCell', CELLS[2]), cell('tableCell', CELLS[3])] },
      ],
    },
    { type: 'callout', content: [para(CALLOUT)] },
    { type: 'listEmbed', attrs: { listId, listName: EMBEDDED_LIST } },
  ],
})

/**
 * What the page draws of the doc, read in the page: each block's text, only
 * where the block is drawn (`checkVisibility()` on the element read), and
 * whether the editor takes typing.
 */
const drawnDoc = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="public-doc-content"]')
    const editable = root?.querySelector('.ProseMirror')?.getAttribute('contenteditable') ?? null
    const all = (selector) => Array.from(root?.querySelectorAll(selector) ?? [])
    const shown = (selector) => all(selector).filter((el) => el.checkVisibility()).map((el) => el.innerText.trim())
    return {
      headings: shown('h2'),
      paragraphs: shown('.ProseMirror > p'),
      ticked: shown('li[data-checked="true"]'),
      cells: shown('th, td'),
      callouts: shown('[data-callout]'),
      embeds: shown('[data-list-embed]'),
      editable,
    }
  }).catch(() => ({ headings: [], paragraphs: [], ticked: [], cells: [], callouts: [], embeds: [], editable: null }))

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
let A = null
/** Made here and taken back in `finally`, each read by its status. */
const workspacesMade = []
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite dates its doc in the past, to tell the doc’s time from the visitor’s now')

  /* A WORKSPACE OF ITS OWN, so no other suite's docs or sharing change under it. */
  const madeWs = await A('/workspaces', { method: 'POST', body: { name: `Public doc page ${TAG}` } })
  if (!madeWs.ok || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  const WS = madeWs.data.id
  workspacesMade.push(WS)

  /* The list the doc embeds, in the suite's own workspace. */
  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${EMBEDDED_LIST}) returning id`
  const CONTENT = contentFor(list.id)

  const madeDoc = await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: TITLE, icon: ICON } })
  if (!madeDoc.ok || !madeDoc.data?.id) throw new Error(`could not make the doc: ${said(madeDoc)}`)
  const D = madeDoc.data.id
  const wrote = await A(`/docs/${D}`, { method: 'PATCH', body: { content: CONTENT } })
  if (!wrote.ok) throw new Error(`could not write the doc: ${said(wrote)}`)
  const shared = await A(`/docs/${D}/share`, { method: 'POST' })
  const SLUG = shared.data?.publicShareId
  if (!shared.ok || !SLUG) throw new Error(`could not share the doc: ${said(shared)}`)
  /*
   * DATED IN THE PAST, so the time the page draws cannot be the visitor's own
   * clock by chance: the doc was written a moment ago, and a page that draws
   * "now" drew the same second (pdp-3 went unreddened that way). The column
   * is written directly; no route sets a doc's time.
   */
  await sql`update docs set updated_at = ${new Date('2026-03-14T09:26:53.000Z')} where id = ${D}`
  /* When the doc last changed, as the server holds it. */
  const readBack = await A(`/docs/${D}`)
  const UPDATED_AT = readBack.data?.updatedAt ?? null
  if (!UPDATED_AT) throw new Error(`could not read the doc back: ${said(readBack)}`)

  /* SIGNED IN NOWHERE: a context with no session, as a link pasted to a client opens. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const titleEl = page.getByTestId('public-doc-title').filter({ visible: true })
  const notFound = page.getByRole('heading', { name: 'Doc not found' }).filter({ visible: true })
  const openLink = async (slug) => {
    await page.goto(`${stack.base}/d/${slug}`, { waitUntil: 'domcontentloaded' })
    await waitUntil(async () => !(await page.getByText('Loading…').filter({ visible: true }).count()), { timeoutMs: 15000 })
  }

  console.log('\n— a public doc, opened by somebody signed in nowhere')
  /* Every answer the page is refused while it opens the doc, from the API. */
  const refused = []
  const onResponse = (res) => {
    if (new URL(res.url()).pathname.startsWith('/api/') && res.status() >= 400) refused.push(`${res.status()} ${new URL(res.url()).pathname}`)
  }
  page.on('response', onResponse)
  await openLink(SLUG)
  await waitUntil(async () => (await readText(titleEl, { timeoutMs: 1000 })) === TITLE, { timeoutMs: 15000 })
  const shownTitle = await readText(titleEl, { timeoutMs: 2000 })
  const landedOn = new URL(page.url()).pathname
  const firstHeading = await readText(page.locator('main h1'), { timeoutMs: 1000 })
  chk(
    shownTitle === TITLE && landedOn === `/d/${SLUG}`,
    'anybody holding the link reads the doc’s title, signed in nowhere, at /d/<slug>',
    `the page is at ${landedOn} and its title reads ${JSON.stringify(shownTitle)} (the first heading reads ${JSON.stringify(firstHeading)}), for ${JSON.stringify(TITLE)}`,
  )

  const updatedEl = page.getByTestId('public-doc-updated').filter({ visible: true })
  const updatedAttr = await updatedEl.getAttribute('datetime', { timeout: 2000 }).catch(() => null)
  const updatedShown = await readText(updatedEl, { timeoutMs: 2000 })
  const updatedExpected = await page.evaluate((iso) => new Date(iso).toLocaleString(), UPDATED_AT).catch(() => null)
  const updatedLine = await readText(page.locator('main header p'), { timeoutMs: 1000 })
  chk(
    updatedAttr === UPDATED_AT && updatedShown === updatedExpected && !/Invalid Date/.test(updatedShown),
    'it says when the doc last changed, the time the server holds, in the visitor’s own format',
    `the line reads ${JSON.stringify(updatedLine)}; its time is ${JSON.stringify(updatedAttr)} drawn as ${JSON.stringify(updatedShown)}, for ${UPDATED_AT} drawn as ${JSON.stringify(updatedExpected)}`,
  )

  const iconShown = await readText(page.getByTestId('public-doc-icon').filter({ visible: true }), { timeoutMs: 2000 })
  chk(iconShown === ICON, 'the doc’s icon is drawn beside its title', `the icon reads ${JSON.stringify(iconShown)}, for ${ICON}`)

  await waitUntil(async () => (await drawnDoc(page)).paragraphs.includes(PARAGRAPH), { timeoutMs: 8000 })
  const drawn = await drawnDoc(page)
  chk(
    drawn.headings.includes(HEADING) && drawn.paragraphs.includes(PARAGRAPH),
    'the doc’s words are drawn: its heading and its paragraph',
    `drawn: headings ${JSON.stringify(drawn.headings)}, paragraphs ${JSON.stringify(drawn.paragraphs)}`,
  )
  chk(
    drawn.ticked.includes(TODO) &&
      CELLS.every((c) => drawn.cells.includes(c)) &&
      drawn.callouts.some((t) => t.includes(CALLOUT)) &&
      drawn.embeds.some((t) => t.includes(EMBEDDED_LIST)),
    'the blocks it was written with are kept: a ticked to-do, a table, a callout and an embedded list’s name',
    `drawn: ticked ${JSON.stringify(drawn.ticked)}, cells ${JSON.stringify(drawn.cells)}, callouts ${JSON.stringify(drawn.callouts)}, embeds ${JSON.stringify(drawn.embeds)}`,
  )

  /* A visitor types into the paragraph and clicks the ticked to-do. */
  await page.getByText(PARAGRAPH).click({ timeout: 3000 }).catch(() => {})
  await page.keyboard.type(' typed by a visitor')
  await page.locator('li[data-checked="true"] input[type="checkbox"]').first().click({ timeout: 3000 }).catch(() => {})
  const afterTyping = await drawnDoc(page)
  chk(
    drawn.ticked.includes(TODO) &&
      afterTyping.editable === 'false' &&
      afterTyping.paragraphs.includes(PARAGRAPH) &&
      !afterTyping.paragraphs.some((t) => t.includes('typed by a visitor')) &&
      afterTyping.ticked.includes(TODO),
    'the page is read-only: typing changes nothing and the ticked to-do stays ticked',
    `the editor’s contenteditable is ${JSON.stringify(afterTyping.editable)}; paragraphs ${JSON.stringify(afterTyping.paragraphs)}; ticked ${JSON.stringify(afterTyping.ticked)}`,
  )

  /*
   * READ LAST IN THE SECTION, once the network has gone quiet: a block drawn
   * by a view of its own asks the API after the doc is drawn, and under load
   * that answer came back after an earlier read (pdp-13 went unproven so).
   */
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  page.off('response', onResponse)
  chk(
    refused.length === 0,
    'opening the link asks the API for nothing it refuses a visitor',
    `refused: ${JSON.stringify(refused)}`,
  )

  console.log('\n— links that do not open, and one that failed')
  /* Asked while the doc is still shared, so a lookup that ignores the slug would open it. */
  const UNKNOWN = randomBytes(12).toString('base64url')
  await openLink(UNKNOWN)
  const unknownSays = await waitUntil(async () => (await notFound.count()) > 0, { timeoutMs: 15000 })
  const unknownTitles = await titleEl.count()
  const unknownApi = await publicStatus(UNKNOWN)
  chk(
    unknownSays && unknownTitles === 0 && unknownApi === 404,
    'a link that was never made says “Doc not found”, while the doc’s own link is live',
    `“Doc not found” ${unknownSays ? 'is' : 'is not'} shown; ${unknownTitles} title(s) drawn; the API answers ${unknownApi}`,
  )

  const revoked = await A(`/docs/${D}/share`, { method: 'DELETE' })
  await openLink(SLUG)
  const revokedSays = await waitUntil(async () => (await notFound.count()) > 0, { timeoutMs: 15000 })
  const revokedTitles = await titleEl.count()
  const revokedApi = await publicStatus(SLUG)
  chk(
    revoked.ok && revokedSays && revokedTitles === 0 && revokedApi === 404,
    'a link turned off says “Doc not found” and draws nothing of the doc',
    `turning it off answered ${said(revoked)}; “Doc not found” ${revokedSays ? 'is' : 'is not'} shown; ${revokedTitles} title(s) drawn; the API answers ${revokedApi}`,
  )

  const reshared = await A(`/docs/${D}/share`, { method: 'POST' })
  const NEW_SLUG = reshared.data?.publicShareId ?? null
  await openLink(SLUG)
  const oldStillClosed = await waitUntil(async () => (await notFound.count()) > 0, { timeoutMs: 15000 })
  const oldApi = await publicStatus(SLUG)
  const newApi = NEW_SLUG ? await publicStatus(NEW_SLUG) : 0
  chk(
    reshared.ok && NEW_SLUG !== null && NEW_SLUG !== SLUG && oldStillClosed && oldApi === 404 && newApi === 200,
    'sharing it again makes a new link, and the one turned off stays closed',
    `sharing again answered ${said(reshared)}, the link ${NEW_SLUG === SLUG ? 'is the old one' : 'is new'}; the old link’s page ${oldStillClosed ? 'says' : 'does not say'} “Doc not found” and the API answers it ${oldApi}; the new one ${newApi}`,
  )

  const archived = await A(`/docs/${D}`, { method: 'PATCH', body: { isArchived: true } })
  await openLink(NEW_SLUG ?? SLUG)
  const archivedSays = await waitUntil(async () => (await notFound.count()) > 0, { timeoutMs: 15000 })
  const archivedApi = NEW_SLUG ? await publicStatus(NEW_SLUG) : 0
  chk(
    archived.ok && archivedSays && archivedApi === 404,
    'archiving the doc closes its link: the page says “Doc not found”',
    `archiving answered ${said(archived)}; “Doc not found” ${archivedSays ? 'is' : 'is not'} shown; the API answers ${archivedApi}`,
  )

  /* The API fails on purpose: the browser answers the page's request with a 500. */
  await page.route('**/api/v1/public/docs/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: null, meta: null, error: { message: 'Internal server error' } }) }),
  )
  await openLink(UNKNOWN)
  const failedHeading = page.getByRole('heading', { name: 'This doc could not be loaded' }).filter({ visible: true })
  const failureSays = await waitUntil(async () => (await failedHeading.count()) > 0, { timeoutMs: 15000 })
  const failureCallsItGone = await notFound.count()
  await page.unroute('**/api/v1/public/docs/**').catch(() => {})
  chk(
    failureSays && failureCallsItGone === 0,
    'a failure that is not a 404 says the doc could not be loaded, not that its link was turned off',
    `“This doc could not be loaded” ${failureSays ? 'is' : 'is not'} shown; “Doc not found” is shown ${failureCallsItGone} time(s)`,
  )
  await ctx.close().catch(() => {})
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('public-doc-page.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (A) {
    for (const id of workspacesMade) {
      const gone = await A(`/workspaces/${id}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
    }
  }
  if (sql) {
    await sql`delete from docs where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
