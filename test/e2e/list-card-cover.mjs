/**
 * §V2-S13 frame `10:35` — "Card size  Medium ›" and "Card cover  Image ›", the
 * two rows the Customize view panel leads with, and the cover the list payload
 * never carried.
 *
 * THE DEFECT, which is *its mirror* rather than an absence:
 *
 *   `tasks.cover_storage_key` and `tasks.cover_image_url` are written by a
 *   shipped, tested picker (`cover-image-picker.tsx`, `task-cover.mjs`), and
 *   `tasks.service.ts` resolved them into one renderable `coverUrl` in exactly
 *   ONE place — `getTask`, the single-task read behind the detail sheet.
 *   `getTasksByList` handed back the raw columns, which a card cannot use: a
 *   storage key is not an image address. So a cover set by a person was
 *   visible on exactly the surface that set it, and the database was evidence
 *   for a feature that did not exist anywhere else.
 *
 * SO THE CHECK THAT MATTERS IS THE LIST ENDPOINT, NOT THE SINGLE-TASK ONE.
 * `task-cover.mjs` already proves `GET /tasks/:id` carries the cover and would
 * keep passing with this bug in place, which is how the bug survived. The
 * first four checks below read `GET /tasks/list/:id` and require the cover to
 * be there, byte for byte, and require the task WITHOUT one to come back with
 * nothing rather than with its neighbour's.
 *
 * And the card is MEASURED. "Card size" with three options that draw the same
 * card is a picker that demos perfectly; the only thing that tells the
 * difference is `getBoundingClientRect`, so every size claim here is a
 * comparison of measured heights, in strict order.
 *
 *   node test/e2e/list-card-cover.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Exact, with `!==`: a branch that skipped must not read as a shorter pass. */
const EXPECTED_CHECKS = 26

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `lcc-${Date.now()}`
/*
 * A LINKED cover, not an uploaded one, and deliberately: object storage is not
 * configured on every runner, and a check that needs R2 would be a check that
 * skips. A link also exercises the half that must NOT be presigned — the URL
 * has to survive the list read exactly as given, which is the bug task
 * attachments still have (`${CDN}/https://…`).
 */
const COVER_LINK = `https://images.example.com/cover-${TAG}.jpg?w=1600&fit=crop`
const COVER_COLOUR = 'linear-gradient(135deg, hsl(268 88% 60%), hsl(330 88% 65%))'

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id
const fixture = await ensureSweepFixture(api, WS)

/*
 * A list of this run's own. The board draws one column per status and the
 * three cards below have to be side by side in the SAME column for their
 * heights to be comparable, which is not something that can be arranged in a
 * list other suites are writing to. `apiClient` never throws, so the status is
 * read rather than caught.
 */
const madeList = await api('/lists', {
  method: 'POST',
  body: { projectId: fixture.projectId, name: `Card cover ${TAG}` },
})
if (madeList.status >= 300 || !madeList.data?.id) {
  throw new Error(`could not make this suite's own list: ${madeList.status} ${JSON.stringify(madeList.error)}`)
}
const listId = madeList.data.id
const listPath = `${fixture.spaceId}/${fixture.projectId}/${listId}`
const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
const lane = (statuses.find((s) => s.category === 'open') ?? statuses[0])?.key

const made = {}
for (const kind of ['image', 'colour', 'plain']) {
  const res = await api('/tasks', {
    method: 'POST',
    body: { listId, title: `cover ${kind} ${TAG}`, ...(lane ? { status: lane } : {}) },
  })
  if (res.status >= 300 || !res.data?.id) {
    throw new Error(`seeding the ${kind} task returned ${res.status} ${JSON.stringify(res.error)}`)
  }
  made[kind] = res.data.id
}
const setImage = await api(`/tasks/${made.image}`, {
  method: 'PATCH',
  body: { coverColor: null, coverStorageKey: null, coverImageUrl: COVER_LINK },
})
const setColour = await api(`/tasks/${made.colour}`, {
  method: 'PATCH',
  body: { coverColor: COVER_COLOUR, coverStorageKey: null, coverImageUrl: null },
})
if (setImage.status >= 300 || setColour.status >= 300) {
  throw new Error(`setting the covers returned ${setImage.status} / ${setColour.status}`)
}

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
const page = await ctx.newPage()

/** Every saved-view write this page makes, with its body. */
const viewWrites = []
page.on('request', (r) => {
  if (/\/views(\/|\?|$)/.test(r.url()) && (r.method() === 'POST' || r.method() === 'PATCH')) {
    try { viewWrites.push(JSON.parse(r.postData() ?? '{}')) } catch { viewWrites.push({}) }
  }
})

const cardFor = (id) => page.locator(`[data-testid="board-task-card"][data-task-id="${id}"]`)
const coverIn = (id) => cardFor(id).locator('[data-testid="board-card-cover"]')
const heightOf = async (id) => (await cardFor(id).boundingBox())?.height ?? 0
const openCustomize = async () => {
  const panel = page.getByTestId('list-customize')
  if (!(await panel.evaluate((el) => el.open))) await panel.locator('summary').first().click()
  await page.waitForTimeout(250)
}
const closeCustomize = async () => {
  await page.getByTestId('list-customize').evaluate((el) => { el.open = false })
  await page.waitForTimeout(250)
}
const chooseCard = async (row, option) => {
  await openCustomize()
  await page.getByTestId(row).locator('summary').first().click()
  await page.getByTestId(`${row}-${option}`).click()
  await page.waitForTimeout(600)
}
/**
 * What a Customize row SAYS it is set to, read where a person would read it.
 *
 * The panel is opened first, because a closed `<details>` renders only its
 * `<summary>` and everything inside it is `display: none` — `innerText` on a
 * hidden node is `''`, which reads exactly like a readout wired to nothing.
 * Every readout assertion in this file goes through here so that trap cannot
 * come back one check at a time.
 */
const readout = async (row) => {
  await openCustomize()
  return page.getByTestId(`${row}-value`).innerText().catch(() => '')
}

try {
  // ── The list endpoint, which is the half that was dead ────────────────────
  console.log('\n▶ the cover reaches the LIST, not only the task it was set on')
  const listRead = await api(`/tasks/list/${listId}`)
  chk(listRead.status === 200, 'the list endpoint answers',
    `GET /tasks/list/${listId} returned ${listRead.status} ${JSON.stringify(listRead.error)}`)
  const byId = new Map((listRead.data ?? []).map((row) => [row.id, row]))
  const imageRow = byId.get(made.image)
  const colourRow = byId.get(made.colour)
  const plainRow = byId.get(made.plain)
  chk(
    imageRow?.coverUrl === COVER_LINK,
    'a linked cover comes back from the list read byte for byte',
    `the list row carried coverUrl=${JSON.stringify(imageRow?.coverUrl)}, expected ${COVER_LINK} — ` +
      'a cover the list cannot read is a cover no card can draw',
  )
  chk(
    colourRow?.coverColor === COVER_COLOUR && colourRow?.coverUrl == null,
    'a colour cover comes back as a colour, and is not mistaken for an image',
    `the colour row carried colour=${JSON.stringify(colourRow?.coverColor)} url=${JSON.stringify(colourRow?.coverUrl)}`,
  )
  chk(
    plainRow != null && plainRow.coverUrl == null && plainRow.coverColor == null,
    'and a task with no cover comes back with none — not its neighbour\'s',
    `the coverless row carried url=${JSON.stringify(plainRow?.coverUrl)} colour=${JSON.stringify(plainRow?.coverColor)}`,
  )
  const single = await api(`/tasks/${made.image}`)
  chk(single.status === 200 && single.data?.coverUrl === COVER_LINK,
    'and the single-task read still carries it, unchanged',
    `GET /tasks/:id returned ${single.status} with coverUrl=${JSON.stringify(single.data?.coverUrl)}`)

  // ── The card ──────────────────────────────────────────────────────────────
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/${listPath}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="list-task-search"]', { timeout: 25_000 })
  await page.getByTestId('work-view-tab-type-board').click()
  await page.waitForTimeout(1500)

  console.log('\n▶ and it is drawn on the card, where the frame draws it')
  const drawn = await waitUntil(() => cardFor(made.image).count().then((n) => n === 1), { timeoutMs: 15_000 })
  chk(drawn, 'the covered task has a card on the board',
    `the board drew ${await cardFor(made.image).count()} cards for it`)
  chk(await coverIn(made.image).count() === 1, 'the card carries a cover band',
    'the board card draws no cover — the picker writes a column nothing reads')
  chk((await coverIn(made.image).getAttribute('data-cover-kind').catch(() => null)) === 'image',
    'and knows it is an image rather than a colour',
    `the band reported kind=${JSON.stringify(
      await coverIn(made.image).getAttribute('data-cover-kind').catch(() => null),
    )}`)
  /*
   * The src, not merely "an img exists". A card that drew a placeholder, or
   * the first cover in the payload, would satisfy every check above and this
   * is the one it fails.
   */
  chk(
    (await coverIn(made.image).locator('img').getAttribute('src').catch(() => null)) === COVER_LINK,
    'the image it draws is the one that was set, byte for byte',
    `the <img> src was ${JSON.stringify(
      await coverIn(made.image).locator('img').getAttribute('src').catch(() => null),
    )}`,
  )
  chk(await coverIn(made.colour).getAttribute('data-cover-kind') === 'color',
    'the colour-covered card draws a colour band',
    `the colour card's band reported ${JSON.stringify(await coverIn(made.colour).getAttribute('data-cover-kind'))}`)
  chk(await coverIn(made.plain).count() === 0,
    'and the coverless card draws nothing',
    'a task with no cover was given a cover band anyway')

  console.log('\n▶ measured, because a band of zero height would pass every check above')
  const bandBox = await coverIn(made.image).boundingBox()
  chk((bandBox?.height ?? 0) >= 40, 'the band at Medium is a band, not a hairline',
    `the cover band measured ${Math.round(bandBox?.height ?? 0)}px tall`)
  const mediumCovered = await heightOf(made.image)
  const mediumPlain = await heightOf(made.plain)
  chk(mediumCovered - mediumPlain >= 40,
    'and the covered card is taller than the coverless one by about the band',
    `covered ${Math.round(mediumCovered)}px vs coverless ${Math.round(mediumPlain)}px`)

  // ── The Customize rows, and whether they do anything ──────────────────────
  console.log('\n▶ the panel leads with Card size and Card cover, each naming its value')
  await openCustomize()
  chk(await page.getByTestId('list-card-size').count() === 1, 'the panel has a Card size row',
    'no Card size row in the Customize panel')
  chk((await readout('list-card-size')).trim() === 'Medium',
    'which reads "Medium" on arrival, as the frame shows',
    `it read ${JSON.stringify((await readout('list-card-size')).trim())}`)
  chk((await readout('list-card-cover')).trim() === 'Image',
    'and Card cover reads "Image", as the frame shows',
    `it read ${JSON.stringify((await readout('list-card-cover')).trim())}`)
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('list-card-size').locator('summary').first().click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(250)
  const sizeOptions = await page.locator('[data-testid^="list-card-size-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')).filter((id) => id !== 'list-card-size-value').sort(),
  )
  chk(
    JSON.stringify(sizeOptions) === JSON.stringify(['list-card-size-large', 'list-card-size-medium', 'list-card-size-small']),
    'Card size offers exactly three densities',
    `it offered ${JSON.stringify(sizeOptions)}`,
  )
  await closeCustomize()

  /*
   * ── THE CHECKS THE DENSITY EXISTS FOR ────────────────────────────────────
   *
   * Three options that draw the same card is the facade this row is most
   * likely to become, and nothing but measured geometry can tell the
   * difference. Strict ordering across all three, on BOTH a covered and a
   * coverless card — a "card size" that only resized the cover would be a
   * cover size wearing the wrong label.
   */
  console.log('\n▶ the three sizes draw three different cards')
  await chooseCard('list-card-size', 'large')
  /*
   * READ WHILE THE PANEL IS OPEN, and the order matters.
   *
   * A closed `<details>` renders nothing but its `<summary>`, so once
   * `list-customize` is shut every row inside it — including this readout —
   * is `display: none` and `innerText` comes back `''`. That is a fact about
   * where this suite's cursor is, not about the control, and reading it here
   * once said the row was blank while `data-value` said `large`.
   *
   * `textContent` would have papered over it by reading hidden text. Hidden
   * text is not what a person reads, so the readout is asserted where a person
   * would see it and the panel is shut afterwards, before anything is
   * measured. AND rather than OR, because with `||` a readout frozen on a
   * constant still passes through the attribute.
   */
  const sizeReadout = async () => (await readout('list-card-size')).trim()
  chk((await sizeReadout()) === 'Large' &&
      (await page.getByTestId('list-card-size').getAttribute('data-value')) === 'large',
    'choosing Large changes what the row says it is set to',
    `with the panel open the row reads ${JSON.stringify(await sizeReadout())} ` +
      `and reports ${JSON.stringify(await page.getByTestId('list-card-size').getAttribute('data-value'))}`)
  await closeCustomize()
  const largeCovered = await heightOf(made.image)
  const largePlain = await heightOf(made.plain)
  await chooseCard('list-card-size', 'small')
  await closeCustomize()
  const smallCovered = await heightOf(made.image)
  const smallPlain = await heightOf(made.plain)
  chk(
    smallCovered < mediumCovered && mediumCovered < largeCovered,
    `the covered card grows with the size (${Math.round(smallCovered)} < ${Math.round(mediumCovered)} < ${Math.round(largeCovered)})`,
    `covered heights were small=${Math.round(smallCovered)} medium=${Math.round(mediumCovered)} large=${Math.round(largeCovered)} — ` +
      'three options drawing the same card is a picker that demos perfectly',
  )
  chk(
    smallPlain < mediumPlain && mediumPlain < largePlain,
    `and so does a card with no cover (${Math.round(smallPlain)} < ${Math.round(mediumPlain)} < ${Math.round(largePlain)})`,
    `coverless heights were small=${Math.round(smallPlain)} medium=${Math.round(mediumPlain)} large=${Math.round(largePlain)} — ` +
      'a "card size" that only resizes the cover is a cover size with the wrong label',
  )
  await chooseCard('list-card-size', 'medium')
  await closeCustomize()

  console.log('\n▶ Card cover → None takes the cover off the card')
  await chooseCard('list-card-cover', 'off')
  await closeCustomize()
  chk(await coverIn(made.image).count() === 0, 'the image band is gone',
    'switching Card cover off left the cover on the card')
  chk(await coverIn(made.colour).count() === 0, 'and so is the colour one',
    'the colour band survived Card cover being switched off')
  const offCovered = await heightOf(made.image)
  chk(
    Math.abs(offCovered - mediumPlain) <= 4,
    'and the card collapses to the height of one with no cover',
    `it measured ${Math.round(offCovered)}px against a coverless ${Math.round(mediumPlain)}px — ` +
      'the band is hidden rather than removed, so the column still scrolls as if it were there',
  )
  await openCustomize()
  chk((await readout('list-card-cover')).trim() === 'None',
    'and the row says so',
    `the Card cover row reads ${JSON.stringify((await readout('list-card-cover')).trim())}`)
  await chooseCard('list-card-cover', 'image')
  await closeCustomize()

  /*
   * ── They belong to the VIEW ──────────────────────────────────────────────
   *
   * A density held only in component state is a setting that resets on every
   * reload, which is the quiet way a control becomes decoration. The Save-view
   * chip appearing proves it is inside `currentViewConfig`; the POST body
   * proves it is what gets written.
   */
  console.log('\n▶ and they are part of the view, not of this page load')
  await chooseCard('list-card-size', 'large')
  await closeCustomize()
  chk(await waitUntil(() => page.getByTestId('list-save-view').isVisible().catch(() => false), { timeoutMs: 8_000 }),
    'changing Card size marks the view unsaved',
    'the Save view chip never appeared — Card size is not part of the view config')
  await page.evaluate(() => { window.prompt = () => 'card size view' })
  const before = viewWrites.length
  await page.getByTestId('list-save-view').click({ timeout: 10_000 }).catch(() => {})
  const wrote = await waitUntil(
    () => viewWrites.slice(before).some((b) => b?.config?.cardSize === 'large'),
    { timeoutMs: 10_000 },
  )
  chk(
    wrote,
    'and saving the view writes cardSize with it',
    `the view writes carried ${JSON.stringify(viewWrites.slice(before).map((b) => b?.config?.cardSize))}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/list-card-cover-fail.png', fullPage: true }).catch(() => {})
} finally {
  for (const id of Object.values(made)) await api(`/tasks/${id}`, { method: 'DELETE' })
  await api(`/lists/${listId}`, { method: 'DELETE' })
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected exactly ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
