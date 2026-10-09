/**
 * A COVER'S SEARCH TAB SEARCHES A LIBRARY OF FREE PHOTOS, AND ONE CHOSEN IS
 * THE COVER (`commit-log/log-601eacc-1`, `ledger-rows/row-739`).
 *
 * Frame `03:07` draws the cover picker's five tabs; ClickUp's covers have
 * "Search images", a large library of free stock photos (its help centre,
 * through search excerpts). This picker had four: no library was configured,
 * and a Search box over nothing had been taken out once already. The library
 * is Unsplash's now, which the lanes and CI reach through
 * `scripts/e2e-lanes/media-stub.mjs` — the same fixed photos everywhere, so
 * this can say how many "mountain" holds and what page two is.
 *
 * Every check reads the page and the server: the results drawn are the
 * library's, a photo chosen is on the task as the server holds it, and the
 * library was told it was used, as Unsplash asks. And what is said when it
 * cannot: no photos, and a library that did not answer.
 *
 *   node test/e2e/cover-photo-search.mjs --api 3028 --dist /tmp/claude-0/dist-8
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { mediaBase, photoDownloads, failPhotos, resetPhotos } from './lib/media.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const MEDIA = mediaBase(API_PORT, argOf('--media', undefined))

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cps${stamp}`
const PASSWORD = 'CoverPhotos@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
let sql = null
let browser = null
let A = null
/** Each workspace made, with the session that may delete it. */
const workspacesMade = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the task is made by SQL')
  await resetPhotos(MEDIA)
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Cover photos ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  const WS = made.data.id
  workspacesMade.push({ id: WS, as: A })

  // Somebody of another workspace, for whom this one's library is not open.
  const outsider = await signUpApi(API, {
    fullName: `Outsider ${TAG}`, email: `${TAG}-outsider@rundesk.invalid`, password: PASSWORD,
    organizationName: `Outsider ${stamp}`, organizationSlug: `outsider-${stamp}`,
  })
  const O = apiAs(outsider.accessToken)
  if (outsider.workspaces?.[0]?.id) workspacesMade.push({ id: outsider.workspaces[0].id, as: O })

  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`insert into tasks (list_id, title, cover_color) values (${list.id}, ${`A task to cover ${TAG}`}, ${'#334155'}) returning id`

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const TASK_URL = `${B}/app/${WS}/${space.id}/${project.id}/${list.id}?task=${task.id}`

  const openSearch = async () => {
    await page.getByTestId('cover-change').click({ timeout: 15_000 }).catch(() => {})
    await page.getByTestId('cover-tab-search').click({ timeout: 10_000 }).catch(() => {})
    return waitUntil(async () => (await page.getByTestId('cover-search-input').count()) === 1, { timeoutMs: 10_000 })
  }
  const results = () => page.locator('[data-testid="cover-search-result"]')
  const search = async (words) => {
    await page.getByTestId('cover-search-input').fill(words, { timeout: 5000 }).catch(() => {})
  }

  // ══ 1. THE TAB ═════════════════════════════════════════════════════════════
  console.log('\n▶ the picker’s Search tab')
  await page.goto(TASK_URL, { waitUntil: 'domcontentloaded' })
  const opened = await openSearch()
  const hint = opened ? await page.getByTestId('cover-search-hint').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '') : ''
  chk(
    opened && /unsplash/i.test(hint),
    'the cover picker has a Search tab, which asks what to search Unsplash’s library of free photos for',
    `opened ${opened}; it says ${JSON.stringify(hint)}`,
  )

  // ══ 2. A SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ mountains')
  await search('mountain')
  const firstPage = await waitUntil(async () => (await results().count()) === 24, { timeoutMs: 15_000 })
  const drawn = await results().evaluateAll((els) =>
    els.map((el) => {
      const img = el.querySelector('img')
      return { id: el.getAttribute('data-photo-id'), loaded: !!img && img.complete && img.naturalWidth > 0, alt: img?.getAttribute('alt') ?? '' }
    }),
  ).catch(() => [])
  const credits = await page.locator('[data-testid="cover-search-credit"]').evaluateAll((els) =>
    els.map((el) => ({
      author: el.querySelector('[data-testid="cover-search-author"]')?.getAttribute('href') ?? '',
      site: el.querySelector('[data-testid="cover-search-site"]')?.getAttribute('href') ?? '',
      // What the credit reads as drawn, asked of the credit itself.
      text: el.checkVisibility() ? el.innerText : '',
    })),
  ).catch(() => [])
  await waitUntil(async () => {
    const all = await results().evaluateAll((els) => els.every((el) => { const i = el.querySelector('img'); return !!i && i.complete && i.naturalWidth > 0 }))
    return all
  }, { timeoutMs: 10_000 })
  const loadedNow = await results().evaluateAll((els) => els.filter((el) => { const i = el.querySelector('img'); return !!i && i.complete && i.naturalWidth > 0 }).length).catch(() => 0)
  chk(
    firstPage && drawn.every((d) => /mountain/i.test(d.alt)) && loadedNow === 24 &&
      credits.length === 24 && credits.every((c) => /^Photo by .+ on Unsplash$/.test(c.text.trim()) && /^https:\/\/unsplash\.com\/@.+utm_source=rundesk/.test(c.author) && /^https:\/\/unsplash\.com\/.*utm_source=rundesk/.test(c.site)),
    '“mountain” draws the library’s first page of mountain photos — twenty-four, each picture loaded — each crediting its photographer and Unsplash, with links that carry the referral',
    `drawn ${drawn.length} (${drawn.filter((d) => /mountain/i.test(d.alt)).length} of mountains), ${loadedNow} loaded; first credit ${JSON.stringify(credits[0] ?? null)}`,
  )

  // ══ 3. MORE ════════════════════════════════════════════════════════════════
  console.log('\n▶ the second page')
  await page.getByTestId('cover-search-more').click({ timeout: 5000 }).catch(() => {})
  const all = await waitUntil(async () => (await results().count()) === 30, { timeoutMs: 15_000 })
  const ids = await results().evaluateAll((els) => els.map((el) => el.getAttribute('data-photo-id'))).catch(() => [])
  const moreLeft = await page.getByTestId('cover-search-more').count()
  chk(
    all && new Set(ids).size === 30 && moreLeft === 0,
    '“More photos” adds the second page — thirty in all, none twice — and is gone once the library has no more',
    `${ids.length} drawn, ${new Set(ids).size} different; More still offered ${moreLeft}`,
  )

  // ══ 4. CHOSEN ══════════════════════════════════════════════════════════════
  console.log('\n▶ one of them chosen')
  const chosenId = ids[25]
  const regular = `${MEDIA}/unsplash/img/${chosenId}.svg?w=1080`
  await results().nth(25).click({ timeout: 5000 }).catch(() => {})
  const setOnTask = await waitUntil(async () => (await A(`/tasks/${task.id}`)).data?.coverUrl === regular, { timeoutMs: 10_000 })
  // The band draws an image cover as its background (`task-detail-sheet.tsx`), so its style is what holds the address.
  const band = page.getByTestId('task-cover')
  const shown = await waitUntil(async () => {
    const kind = await band.getAttribute('data-cover-kind').catch(() => null)
    const style = await band.getAttribute('style').catch(() => '')
    return kind === 'image' && (style ?? '').includes(`/unsplash/img/${chosenId}.svg`)
  }, { timeoutMs: 10_000 })
  const counted = await waitUntil(async () => (await photoDownloads(MEDIA)).some((d) => d.id === chosenId), { timeoutMs: 8000 })
  const after = (await A(`/tasks/${task.id}`)).data
  chk(
    setOnTask && shown && counted && after?.coverColor == null,
    'choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks',
    `on the task ${JSON.stringify(after?.coverUrl)} (want ${regular}), colour ${JSON.stringify(after?.coverColor)}; drawn ${shown}; reported used ${counted}`,
  )

  // ══ 5. NOTHING ═════════════════════════════════════════════════════════════
  console.log('\n▶ words no photo holds')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openSearch()
  await search('zebra crossing')
  const none = await waitUntil(async () => (await page.getByTestId('cover-search-empty').count()) === 1, { timeoutMs: 10_000 })
  const noneText = none ? await page.getByTestId('cover-search-empty').filter({ visible: true }).innerText().catch(() => '') : ''
  chk(
    none && noneText.includes('zebra crossing') && (await results().count()) === 0,
    'words no photo holds say there are no photos for them, and draw none',
    `said ${JSON.stringify(noneText)}; ${await results().count()} drawn`,
  )

  // ══ 6. THE LIBRARY FAILS ═══════════════════════════════════════════════════
  console.log('\n▶ the library answering 500, then 403 (Unsplash’s rate limit)')
  await failPhotos(MEDIA, 500, 1)
  await search('ocean')
  const failedSaid = await waitUntil(async () => (await page.getByTestId('cover-search-error').count()) === 1, { timeoutMs: 10_000 })
  const failedText = failedSaid ? await page.getByTestId('cover-search-error').filter({ visible: true }).innerText().catch(() => '') : ''
  await failPhotos(MEDIA, 403, 1)
  await search('city')
  const limitSaid = await waitUntil(async () => /too many searches/i.test(await page.getByTestId('cover-search-error').filter({ visible: true }).innerText().catch(() => '')), { timeoutMs: 10_000 })
  chk(
    failedSaid && /did not answer/i.test(failedText) && limitSaid,
    'a library that fails is said to have not answered, and its rate limit as too many searches — never an empty grid',
    `said ${JSON.stringify(failedText)}; the rate limit said ${limitSaid}`,
  )

  // ══ 7. BACK AGAIN ══════════════════════════════════════════════════════════
  await search('forest')
  const back = await waitUntil(async () => (await results().count()) === 6, { timeoutMs: 10_000 })
  chk(back, 'and the next search, the library answering again, draws its photos', `${await results().count()} drawn for “forest”`)

  // ══ 8. THE ROUTES ══════════════════════════════════════════════════════════
  console.log('\n▶ the API: whose library, and what it takes')
  // Its own calls: a failure staged above that no search took is not this check's.
  await resetPhotos(MEDIA)
  const outsiderAsks = await O(`/workspaces/${WS}/cover-photos?q=mountain`)
  const noWords = await A(`/workspaces/${WS}/cover-photos?q=%20`)
  const farPage = await A(`/workspaces/${WS}/cover-photos?q=mountain&page=99`)
  const badId = await A(`/workspaces/${WS}/cover-photos/${encodeURIComponent('../x')}/use`, { method: 'POST' })
  const unknownId = await A(`/workspaces/${WS}/cover-photos/AAAAAAAAAAA/use`, { method: 'POST' })
  chk(
    // Somebody outside is told the workspace is not there, as `WorkspaceMemberGuard` tells every route of it.
    outsiderAsks.status === 404 && noWords.status === 400 && farPage.status === 400 && [400, 404].includes(badId.status) && unknownId.status === 400,
    'the library is searched for the workspace’s own members; a blank search, a page past fifty, and a photo the library does not hold are refused',
    `outsider ${said(outsiderAsks)}; blank ${said(noWords)}; page 99 ${said(farPage)}; bad id ${said(badId)}; unknown ${said(unknownId)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  await resetPhotos(MEDIA).catch(() => {})
  const leftBehind = []
  for (const { id, as } of workspacesMade) {
    const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
