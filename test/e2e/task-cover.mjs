/**
 * §V2-09 — the cover on a task.
 *
 * `[03:04]` "task ke ooper COVER bhi add ho sakta hai". Frame `03:10` shows the
 * picker — Gallery | Upload | Link | Search | Attachments, with Remove — and
 * the banner then offering Reposition and Change cover.
 *
 * Rundesk had `cover_color` and a picker whose other three tabs were
 * decoration: a "Photos" search box wired to nothing over six CSS gradients
 * labelled "Mountains" and "Ocean", an "AI" tab whose Generate button did
 * nothing, and an Upload tab that was a dashed rectangle with no file input.
 *
 * WHAT THIS ASSERTS, and the one that matters most:
 *
 * A LINKED image must come back BYTE-FOR-BYTE. Task attachments already got
 * this wrong — a hyperlink is written into `storage_key` and read back through
 * `r2.getObjectUrl`, producing `${CDN}/https://…` or a presigned key named
 * after somebody's URL. The cover stores the two kinds in separate columns
 * precisely so that cannot happen here, and the check is that the URL survives
 * the round trip unchanged rather than merely being non-empty.
 *
 *   node test/e2e/task-cover.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { storeBase } from './lib/store.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * "0 failed" is not "it ran", and `<` is not "it ran" either: with `<`, a
 * branch that quietly skipped becomes a shorter run that still passes. Exact,
 * so a skipped branch is a failure.
 */
const EXPECTED_CHECKS = 42

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}
const appears = async (loc, ms = 12000) => {
  await loc.waitFor({ state: 'visible', timeout: ms }).catch(() => {})
  return loc.isVisible().catch(() => false)
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

  // A task of this suite's own, so a cover set here is never somebody's task.
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
  const task = (await A('/tasks', { method: 'POST', body: { listId, title: `Cover check ${stamp}` } })).data
  if (!task?.id) throw new Error('could not make a task')
  const T = () => A(`/tasks/${task.id}`)
  const setCover = (body) => A(`/tasks/${task.id}`, { method: 'PATCH', body })
  // A one-pixel PNG: small enough to compare byte for byte after a round trip.
  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=',
    'base64',
  )

  console.log('\n▶ §V2-09 — a colour cover')
  const colour = 'linear-gradient(135deg, hsl(268 88% 60%), hsl(330 88% 65%))'
  await setCover({ coverColor: colour, coverStorageKey: null, coverImageUrl: null })
  let row = (await T()).data
  chk(row?.coverColor === colour, 'a colour is stored as a colour',
    `coverColor came back ${JSON.stringify(row?.coverColor)}`)
  chk(row?.coverUrl == null, 'and it is not mistaken for an image',
    `coverUrl was ${JSON.stringify(row?.coverUrl)} for a colour cover`)

  /*
   * The one this design exists for. A linked image is not ours to serve, so it
   * has to come back exactly as given — no CDN prefix, no presigning, no
   * normalising. That is the bug task attachments still have.
   */
  console.log('\n▶ a linked image survives the round trip untouched')
  const link = `https://images.example.com/photo-${stamp}.jpg?w=1600&fit=crop`
  await setCover({ coverColor: null, coverStorageKey: null, coverImageUrl: link })
  row = (await T()).data
  chk(row?.coverUrl === link, 'the link comes back byte for byte',
    `expected ${link}\n         got      ${JSON.stringify(row?.coverUrl)}`)
  chk(row?.coverColor == null, 'and choosing an image cleared the colour',
    `coverColor survived at ${JSON.stringify(row?.coverColor)}`)

  console.log('\n▶ what a cover may not be')
  const xss = await setCover({ coverImageUrl: 'javascript:alert(1)' })
  chk(xss.status === 400, 'a javascript: cover is refused',
    `PATCH with a javascript: URL returned ${xss.status} — that renders on every viewer of the task`)
  const badOffset = await setCover({ coverOffsetY: 400 })
  chk(badOffset.status === 400, 'and a position outside the banner is refused',
    `coverOffsetY 400 returned ${badOffset.status}`)
  // The refusals must not have taken the cover with them.
  row = (await T()).data
  chk(row?.coverUrl === link, 'and a refused change leaves the cover alone',
    `the cover is now ${JSON.stringify(row?.coverUrl)}`)

  console.log('\n▶ reposition, and remove')
  await setCover({ coverOffsetY: 20 })
  row = (await T()).data
  chk(row?.coverOffsetY === 20, 'the banner remembers where the image sits',
    `coverOffsetY came back ${JSON.stringify(row?.coverOffsetY)}`)
  await setCover({ coverColor: null, coverStorageKey: null, coverImageUrl: null })
  row = (await T()).data
  chk(
    row?.coverUrl == null && row?.coverColor == null,
    'and Remove clears both kinds at once',
    `after remove: colour ${JSON.stringify(row?.coverColor)}, url ${JSON.stringify(row?.coverUrl)}`,
  )

  // ── The picker on screen ──────────────────────────────────────────────────
  console.log('\n▶ the picker offers what it can actually do')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${task.id}`, {
    waitUntil: 'domcontentloaded',
  })

  chk(await appears(page.getByTestId('task-cover')), 'the task has a cover band', 'no cover band on the task')
  await page.getByTestId('cover-change').click({ timeout: 8000 }).catch(() => {})
  chk(await appears(page.getByTestId('cover-tab-link')), 'the picker opens with a Link tab',
    'no Link tab — the picker cannot take an image address')
  chk(
    await page.getByTestId('cover-tab-attachments').isVisible().catch(() => false),
    'and an Attachments tab, to reuse a file already here',
    'no Attachments tab',
  )

  /*
   * The facade check, stated as an absence.
   *
   * A tab named after something it cannot do is worse than no tab: the person
   * searching for a mountain gets a gradient and no way to know why. This fails
   * if either dead tab comes back.
   */
  /*
   * AN ABSENCE IS A CLAIM ONLY WHERE THE THING COULD HAVE BEEN (`lib/fixture.mjs`
   * states it). This read `[role="tablist"]` first and caught a failed read to
   * '', so a missing tab strip passed both absence checks below — and "first"
   * could as well have been some other tab strip on the page. The strip read
   * is the picker's own, the one holding its Link tab, and it has to have been
   * found and read before what is missing from it counts.
   */
  const coverTabs = page.locator('[role="tablist"]').filter({ has: page.getByTestId('cover-tab-link') })
  const tabStrips = await coverTabs.count()
  const tabsText = tabStrips === 1 ? await coverTabs.innerText().catch(() => '') : ''
  const sawTabs = tabStrips === 1 && tabsText.trim().length > 0
  const unseen = `no tab strip holding the picker's Link tab was read (${tabStrips} found), so what it lacks says nothing`
  chk(
    sawTabs && !/photos/i.test(tabsText) && !/\bAI\b/.test(tabsText),
    'and nothing that only pretends to work',
    sawTabs ? `the picker still offers: ${JSON.stringify(tabsText.replace(/\s+/g, ' '))}` : unseen,
  )

  /*
   * §V2-09 — THE RECORDED DECISION, kept honest.
   *
   * Frame `03:07` has five tabs and this picker has four. The fifth, Search,
   * searches a stock photo library, and `cover-image-picker.tsx` says so in a
   * comment that was RE-CHECKED rather than trusted: one grep across `apps`,
   * `packages` and `.env*` for every provider name still finds nothing but the
   * comment itself, and `modules/search/sources.ts` scopes search to rundesk /
   * drive / gmail / sharepoint — none of which returns a photograph.
   *
   * So this is the absence, asserted as an absence: if a Search tab ever
   * appears it is either backed by a provider (and this check is updated along
   * with the comment) or it is the "Photos" box over nothing that this file
   * deleted once already. Either way the suite should be the thing that asks.
   */
  chk(
    sawTabs && !/search/i.test(tabsText),
    'the Search tab stays absent, and the comment that says why has been re-checked',
    sawTabs
      ? `the picker now offers a Search tab (${JSON.stringify(tabsText.replace(/\s+/g, ' '))}) — ` +
          'if it searches a real provider, update the decision in cover-image-picker.tsx; ' +
          'if it does not, it is a search box over nothing'
      : unseen,
  )

  // Setting a colour from the Gallery has to actually reach the task.
  await page.getByTestId('cover-gallery-swatch').first().click()
  await page.waitForTimeout(1500)
  const afterPick = (await T()).data
  chk(
    !!afterPick?.coverColor,
    'picking from the Gallery sets the cover on the task',
    `after clicking a swatch the task's coverColor is ${JSON.stringify(afterPick?.coverColor)}`,
  )

  /*
   * ── The Gallery's Custom swatch, frame `03:07` ───────────────────────────
   *
   * The frame's Gallery is "Colors" — eight fixed swatches — and then a
   * bordered ninth cell with an eyedropper reading **Custom**. Eight colours
   * is a palette; the ninth is the one that makes it a picker.
   *
   * THE CHECK THAT DECIDES IT IS THE VALUE, NOT THE CLICK. A Custom cell wired
   * to a constant would open, look right, close, and set a cover — and pass
   * any "the cover changed" assertion. So a colour is chosen that nothing else
   * in this file or in the product uses, and the task is read back and
   * required to hold exactly that colour.
   */
  console.log('\n▶ the Gallery has a Custom swatch, and it commits the colour you chose')
  // Bounded for `task-cover-1-nocustom`, whose hidden Custom cell leaves this
  // reopen with nothing to press once the section above has failed.
  await page.getByTestId('cover-change').click({ timeout: 8000 }).catch(() => {})
  chk(
    await appears(page.getByTestId('cover-gallery-custom')),
    'the Gallery offers Custom beside the fixed swatches',
    'no Custom cell in the Gallery — the palette is eight colours and nothing else',
  )
  await page.getByTestId('cover-gallery-custom').click({ timeout: 8000 }).catch(() => {})
  chk(
    await appears(page.getByTestId('cover-custom-input'), 6000),
    'and opening it reveals a colour chooser',
    'clicking Custom revealed no colour input — the cell is a label with nothing behind it',
  )

  const chosen = '#1f9d55'
  await page.getByTestId('cover-custom-input').fill(chosen, { timeout: 8000 }).catch(() => {})
  /*
   * BOUNDED AND CAUGHT — RULE ONE'S SHAPE, DISPLACED BY ONE ELEMENT. The check
   * above is allowed to find the colour chooser absent, and when it is absent
   * this Apply button cannot exist either: `task-cover-1-nocustom` hides the
   * Custom cell, nothing opened, and this press waited out the default thirty
   * seconds and ended the run at 18 of 32 — under a row crediting the patch
   * with exactly the one check it claims. The two steps in front of it were
   * already bounded for the same patch; this one was missed because the rule
   * pairs a press with the testid of the check directly above it, and these
   * are `cover-custom-input` and `cover-custom-apply` — one dialog, two names.
   *
   * Catching it changes no verdict: the check below reads the colour back off
   * the task, so a press that never landed fails it.
   */
  await page.getByTestId('cover-custom-apply').click({ timeout: 8000 }).catch(() => {})
  const landed = await waitUntil(async () => ((await T()).data?.coverColor ?? '') === chosen, {
    timeoutMs: 8000,
  })
  const customRow = (await T()).data
  chk(
    landed && customRow?.coverColor === chosen,
    `the chosen colour reaches the task byte for byte (${chosen})`,
    `after choosing ${chosen} the task's coverColor is ${JSON.stringify(customRow?.coverColor)} — ` +
      'a Custom cell that commits a constant passes every check but this one',
  )

  /*
   * ── The Link tab, frame `03:15` ────────────────────────────────────
   *
   * *"Paste image link…"* with a **Submit** and *"Works with any image from the
   * web"* under it. The tab was asserted to EXIST three sections above and
   * nothing on it was ever touched: of this picker's eighteen testids the suite
   * named five, and `cover-link-input`, `cover-link-apply` and
   * `cover-link-error` were three of the thirteen it did not. A tab checked for
   * its own presence, with the feature behind it unmeasured, is the facade
   * defect inside the audit rather than inside the product.
   *
   * Found by asking a different question: which of the 115 frame observations
   * are named nowhere in a suite or in the ledger? Fourteen, of which this is
   * one, and it is the one that turned out to be a real hole — the rest are
   * covered under an adjacent timestamp.
   *
   * THE VALUE IS READ BACK FROM THE SERVER, for the reason the Custom swatch
   * carries: a Use-link button wired to a constant, or to nothing, opens and
   * closes exactly like one that works.
   */
  console.log('\n▶ the Link tab takes an address, refuses one that is not, and commits the rest')
  // Bounded for `task-cover-1-nocustom`, whose hidden Custom cell leaves this
  // reopen with nothing to press once the section above has failed.
  await page.getByTestId('cover-change').click({ timeout: 8000 }).catch(() => {})
  chk(
    await appears(page.getByTestId('cover-tab-link'), 6000),
    'the picker still opens on something that can reach the Link tab',
    'no Link tab to open',
  )
  await page.getByTestId('cover-tab-link').click({ timeout: 10_000 }).catch(() => {})
  const linkBox = page.getByTestId('cover-link-input')
  chk(
    await appears(linkBox, 6000),
    'the Link tab carries an address box',
    'the Link tab opened onto nothing that takes an address',
  )

  // A refusal FIRST, because a box that accepts anything is the one that draws
  // a broken banner on the task and says nothing about why.
  const before = (await T()).data
  // Bounded and caught for the same reason as the presses: the check above is
  // allowed to find no address box, and a fill on one that is not there would
  // end the section instead of letting the four checks below report.
  await linkBox.fill('mountains.jpg', { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-link-apply').click({ timeout: 10_000 }).catch(() => {})
  const refused = await appears(page.getByTestId('cover-link-error'), 6000)
  const afterRefusal = (await T()).data
  chk(
    refused &&
      (afterRefusal?.coverImageUrl ?? null) === (before?.coverImageUrl ?? null),
    'a bare filename is refused, in words, and nothing is written to the task',
    `the picker ${refused ? 'said so' : 'said nothing'} and the task now holds ` +
      `coverImageUrl=${JSON.stringify(afterRefusal?.coverImageUrl ?? null)}`,
  )

  // And typing again clears it: an error that outlives its cause accuses the
  // next address of a problem it does not have.
  await linkBox.fill('https://example.com/a-real-looking-image.png', { timeout: 10_000 }).catch(() => {})
  chk(
    (await page.getByTestId('cover-link-error').count()) === 0,
    'and the refusal clears as soon as the address changes',
    'the refusal is still on screen under an address it is not about',
  )

  const LINKED = `https://example.com/cover-${stamp}.png`
  await linkBox.fill(LINKED, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-link-apply').click({ timeout: 10_000 }).catch(() => {})
  const linkLanded = await waitUntil(
    async () => ((await T()).data?.coverImageUrl ?? '') === LINKED,
    { timeoutMs: 8000 },
  )
  const linkedRow = (await T()).data
  chk(
    linkLanded && linkedRow?.coverImageUrl === LINKED,
    'an http address becomes the task\'s cover, byte for byte',
    `after submitting ${LINKED} the task holds coverImageUrl=` +
      `${JSON.stringify(linkedRow?.coverImageUrl ?? null)}`,
  )
  chk(
    (linkedRow?.coverColor ?? null) === null && (linkedRow?.coverStorageKey ?? null) === null,
    'and it replaces the colour rather than sitting behind it',
    `the task holds coverColor=${JSON.stringify(linkedRow?.coverColor ?? null)} and ` +
      `coverStorageKey=${JSON.stringify(linkedRow?.coverStorageKey ?? null)} beside the link — ` +
      'two covers set at once is one of them drawn and the other a surprise later',
  )

  /*
   * ── The Attachments tab, frame `03:10` ───────────────────────────────
   *
   * *"the Attachments tab offers files already on the task as a cover"*. The tab
   * was asserted to EXIST four sections above and nothing in it was ever
   * listed — and it could not have been: the picker filtered the task's
   * attachments on `contentType`, which the API does not return. It answers
   * `mimeType`, every other reader in the app takes `mimeType`, and this one
   * compared `undefined` to `image/` for every row. The tab drew its empty
   * state on every task, however many images were on it.
   *
   * Found by asking which product testids no suite names: 342 of 1063, and
   * `cover-attachment-option` was one of the nine in this component.
   */
  console.log('\n▶ the Attachments tab offers the task\'s own images, and one becomes the cover')
  await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-tab-attachments').click({ timeout: 10_000 }).catch(() => {})
  chk(
    await appears(page.getByTestId('cover-attachments-empty'), 6000),
    'with nothing on the task it says so, rather than drawing an empty grid',
    'the Attachments tab on a task with no files drew neither an option nor an explanation',
  )

  // An image the API itself accepts, added the product's own second way — by
  // URL rather than by upload, which `task-attachments.mjs` seeds the same way.
  const IMAGE = `https://example.invalid/cover-${stamp}.png`
  const added = await A(`/tasks/${task.id}/attachments`, {
    method: 'POST',
    body: { fileName: `cover-${stamp}.png`, url: IMAGE, contentType: 'image/png', sizeBytes: 64 },
  })
  chk(
    added.status < 400,
    'the suite can put an image on the task to offer',
    `POST /tasks/:id/attachments answered ${added.status}`,
  )
  /*
   * A FRESH VISIT, because the list is fetched once per one. The picker clears
   * `attachments` when the dialog closes and fetches again on the next open,
   * which is right — and my first version of this check switched tabs inside the
   * SAME visit, read the `[]` cached from the empty-state check above, and
   * reported the product broken after I had just fixed it.
   */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-tab-attachments').click({ timeout: 10_000 }).catch(() => {})
  const option = page.getByTestId('cover-attachment-option')
  chk(
    await waitUntil(async () => (await option.count()) === 1, { timeoutMs: 8000 }),
    'once one is there it is offered, exactly once',
    `the tab offered ${await option.count()} option(s) for one image attachment, and an empty ` +
      `state is on screen ${await page.getByTestId('cover-attachments-empty').count()} time(s)`,
  )
  await option.first().click({ timeout: 10_000 }).catch(() => {})
  /*
   * A LINKED IMAGE BECOMES THE COVER'S LINK. This asserted `coverStorageKey ===
   * IMAGE` — the URL in the KEY column — which was the attachments' own bug
   * carried into the cover: the key column is signed on read, so that cover
   * was served as `${CDN}/https://…` and never drew, while the check passed on
   * the stored field. It went red, rightly, when the server started refusing
   * any stored cover that is not one of the task's own objects. What matters
   * is what the task SERVES: the image, byte for byte, from the link column.
   */
  const fromLink = await waitUntil(
    async () => ((await T()).data?.coverImageUrl ?? '') === IMAGE,
    { timeoutMs: 8000 },
  )
  const storedRow = (await T()).data
  chk(
    fromLink && storedRow?.coverUrl === IMAGE && storedRow?.coverStorageKey == null,
    'and choosing it makes that image the cover — served as it was linked, not signed as a key',
    `after choosing the only option the task holds coverImageUrl=${JSON.stringify(storedRow?.coverImageUrl ?? null)} ` +
      `and coverStorageKey=${JSON.stringify(storedRow?.coverStorageKey ?? null)}, and serves ` +
      `coverUrl=${JSON.stringify(storedRow?.coverUrl ?? null)} — expected the link ${JSON.stringify(IMAGE)}`,
  )

  /*
   * AND AN UPLOADED IMAGE BECOMES THE STORED COVER — the other branch of the
   * same click, so a picker that sent every attachment as a link fails here
   * rather than nowhere. Uploaded the product's own way (presign, PUT, record),
   * so its key is exactly what the server's cover rule has to accept, and the
   * cover is fetched back to prove it was signed rather than echoed.
   */
  const FILE_NAME = `file-cover-${stamp}.png`
  const pre = await A(`/tasks/${task.id}/attachments/presign`, {
    method: 'POST',
    body: { fileName: FILE_NAME, contentType: 'image/png', sizeBytes: TINY_PNG.length },
  })
  const FILE_KEY = pre.data?.storageKey ?? null
  const put = pre.data?.uploadUrl
    ? await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY_PNG })
        .then((r) => r.status, () => 0)
    : 0
  const recorded = FILE_KEY
    ? await A(`/tasks/${task.id}/attachments`, {
        method: 'POST',
        body: { fileName: FILE_NAME, storageKey: FILE_KEY, contentType: 'image/png', sizeBytes: TINY_PNG.length },
      })
    : { status: 0 }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-tab-attachments').click({ timeout: 10_000 }).catch(() => {})
  await option.filter({ hasText: FILE_NAME }).first().click({ timeout: 10_000 }).catch(() => {})
  const fromFile = await waitUntil(
    async () => FILE_KEY !== null && ((await T()).data?.coverStorageKey ?? '') === FILE_KEY,
    { timeoutMs: 8000 },
  )
  const fileRow = (await T()).data
  const served = typeof fileRow?.coverUrl === 'string' && fileRow.coverUrl !== FILE_KEY
    ? await fetch(fileRow.coverUrl).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null), () => null)
    : null
  chk(
    fromFile && fileRow?.coverImageUrl == null && served !== null && served.equals(TINY_PNG),
    'and an uploaded image chosen the same way becomes the stored cover, served signed, with its own bytes',
    `presign answered ${pre.status}, the PUT ${put}, recording it ${recorded.status}; after choosing it the task ` +
      `holds coverStorageKey=${JSON.stringify(fileRow?.coverStorageKey ?? null)} (wanted ${JSON.stringify(FILE_KEY)}), ` +
      `coverImageUrl=${JSON.stringify(fileRow?.coverImageUrl ?? null)}, and its coverUrl ` +
      `${served === null ? 'fetched nothing' : `fetched ${served.length} byte(s) that are not the file`}`,
  )

  /*
   * ── Remove, which frame `03:05` draws as the sixth tab ─────────────────
   *
   * ALL THREE FIELDS, not "the cover went". A task can carry a colour, a stored
   * file and a link, and a Remove that clears the one currently drawn leaves the
   * other two to surface the next time something reads the row — a template, an
   * export, or a board card.
   */
  console.log('\n▶ Remove takes the cover off, in every way a cover can be set')
  await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-remove').click({ timeout: 10_000 }).catch(() => {})
  const gone = await waitUntil(
    async () => {
      const r = (await T()).data
      return !r?.coverColor && !r?.coverStorageKey && !r?.coverImageUrl
    },
    { timeoutMs: 8000 },
  )
  const bare = (await T()).data
  chk(
    gone,
    'pressing Remove clears the colour, the stored file and the link together',
    `the task still holds coverColor=${JSON.stringify(bare?.coverColor ?? null)}, ` +
      `coverStorageKey=${JSON.stringify(bare?.coverStorageKey ?? null)}, ` +
      `coverImageUrl=${JSON.stringify(bare?.coverImageUrl ?? null)}`,
  )

  /*
   * ── The Upload tab, frame `03:05`'s second tab ───────────────────────────
   *
   * THIS USED TO MEASURE THE REFUSAL, and the reason it gave was wrong.
   *
   * What stood here said the happy path "cannot run without credentials this
   * repository does not hold", and recorded the tab as half-measured on that
   * basis. `R2Service` reads `R2_ENDPOINT` and sets `forcePathStyle: true` — it
   * speaks plain S3 — so what was missing was never credentials, it was
   * somewhere to PUT to. `scripts/e2e-lanes/s3-stub.mjs` is that somewhere,
   * every lane now starts one, and the whole path runs with NO product change:
   * presign, PUT, commit the storage key, serve it back signed.
   *
   * SO THIS SECTION ASSERTS THE BYTES, not the words about the bytes. The file
   * chosen in the browser has to arrive in storage and come back out of the
   * cover's own URL identical. That is the only version of this check a facade
   * cannot pass: a handler that sets a plausible key without uploading anything
   * fails on the round trip.
   *
   * AND THE REFUSAL IS STILL MEASURED, because it is still the thing
   * `cover-image-picker.tsx`'s own comment describes as having shipped broken —
   * "no handler at all, so a failed upload and a successful one looked the same:
   * nothing happened either way". It is no longer measured by starving the
   * environment, which would have retired the behaviour along with the reason:
   * the store is ASKED to refuse one PUT, so a genuine failure is arranged
   * against working storage.
   *
   * THE STORE IS A COUNTED PRECONDITION, not a silent one. A lane without one
   * comes up with R2 unconfigured, every upload takes the refusal path, and a
   * suite that branched on that would report the same sentences while measuring
   * something else entirely. So its presence is its own check: no store, one
   * failure that names it, and the rest report what they actually found.
   */
  console.log('\n▶ the Upload tab really uploads — presign, PUT, and the bytes back out')
  await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('cover-tab-upload').click({ timeout: 10_000 }).catch(() => {})
  const chooser = page.getByTestId('cover-upload-input')
  chk(
    (await page.getByTestId('cover-upload-button').count()) === 1 && (await chooser.count()) === 1,
    'the Upload tab offers a way to choose a file',
    'the Upload tab drew no way to choose anything — a tab named after an action that cannot start',
  )

  // Lane k runs its API on 302k and its store on 91k, so one follows from the
  // other (`lib/store.mjs`); `--store` overrides for a lane laid out
  // differently, and CI sets `E2E_STORE_PORT`.
  const STORE = storeBase(API_PORT, argOf('--store', undefined))
  /*
   * DISARMED AT THE START, not trusted to have been cleaned up at the end of
   * the last run. The store outlives any one run of this suite, and an
   * arranged failure that was armed but never fired stays armed: a run did
   * exactly that, and the NEXT run's first upload came back 500 with nothing
   * in that run to explain it. Asking at the start costs one request and makes
   * this section's starting state something the section itself establishes.
   */
  const storeUp = await fetch(`${STORE}/__control/reset`, { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
  chk(
    storeUp,
    'the lane has an object store, so this section measures the upload and not its refusal',
    `nothing answered on ${STORE} — without a store every check below takes the "Storage is not ` +
      'configured" path while printing sentences about uploading, which is the one outcome worth refusing',
  )

  // A real file, because `setInputFiles` dispatches a change event whatever the
  // input held and the handler reads `files[0]`. `TINY_PNG` is declared at the
  // top: the Attachments tab's check above uploads it too.
  const pngPath = path.join(tmpdir(), `cover-upload-${stamp}.png`)
  writeFileSync(pngPath, TINY_PNG)

  /*
   * RESPONSES, NOT REQUESTS. A request leaving says the code ran; a response
   * says the exchange landed. `folder-dialog` learnt this the expensive way —
   * a check that a POST was SENT stayed green through a patch that made the
   * server reject every one of them.
   */
  const presigns = []
  const puts = []
  page.on('response', (res) => {
    const req = res.request()
    if (req.method() === 'POST' && /\/attachments\/presign$/.test(res.url()))
      presigns.push(res.status())
    if (req.method() === 'PUT' && res.url().startsWith(STORE)) puts.push(res.status())
  })

  const beforeUpload = (await T()).data
  await chooser.setInputFiles(pngPath, { timeout: 8000 }).catch(() => {})
  const keyArrived = await waitUntil(
    async () => ((await T()).data?.coverStorageKey ?? null) !== (beforeUpload?.coverStorageKey ?? null),
    { timeoutMs: 20_000 },
  )
  const uploaded = (await T()).data

  chk(
    presigns.length > 0 && presigns.every((s) => s < 300),
    'choosing a file asks the server to presign, and the server answers',
    `the presign responses were ${JSON.stringify(presigns)} — nothing under 300 means the upload ` +
      'never got a URL to send to',
  )
  chk(
    puts.length > 0 && puts.at(-1) < 300,
    'and the file itself is PUT to the URL that came back',
    `the PUTs to the store answered ${JSON.stringify(puts)} — a presign nobody uploads to is the ` +
      'facade this tab shipped as',
  )
  chk(
    keyArrived && typeof uploaded?.coverStorageKey === 'string' && uploaded.coverStorageKey.length > 0,
    'and the cover becomes a STORED key, not a link to somewhere else',
    `the cover ended as coverStorageKey=${JSON.stringify(uploaded?.coverStorageKey ?? null)}, ` +
      `coverImageUrl=${JSON.stringify(uploaded?.coverImageUrl ?? null)}`,
  )
  /*
   * THE ROUND TRIP, which is the check a facade cannot pass. Everything above
   * can be faked by a handler that writes a plausible key; only the bytes
   * coming back out of the cover's OWN url — signed by the product, served by
   * the store — say the file that was chosen is the file that is there.
   */
  const servedBytes = uploaded?.coverUrl
    ? await fetch(uploaded.coverUrl)
        .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
        .catch(() => null)
    : null
  chk(
    servedBytes !== null && servedBytes.equals(TINY_PNG),
    'and the cover serves back the very bytes that were chosen, not a plausible key',
    servedBytes === null
      ? `the cover url ${JSON.stringify(uploaded?.coverUrl ?? null)} served nothing`
      : `the cover served ${servedBytes.length} bytes against the file's ${TINY_PNG.length}`,
  )

  /*
   * NOW THE REFUSAL, arranged rather than starved. One PUT is refused by the
   * store; the product has to say so and leave the cover alone. This is the
   * behaviour `task-cover-11-upload-fails-silently` reddens, and it survives
   * storage being configured because failure is no longer a property of the
   * environment.
   */
  const armed = await fetch(`${STORE}/__control/fail-next-put`, { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
  /*
   * REOPENED ONLY IF IT IS SHUT, and the condition is the whole lesson.
   *
   * A successful commit CLOSES the picker, so after the upload above there is
   * nothing to choose a file in — reusing the chooser typed into a detached
   * input and the check read "the tab reported nothing at all" as a product
   * defect. But `cover-change` is a TOGGLE: pressing it unconditionally shut a
   * picker that a FAILED upload had correctly left open, and the same check
   * failed again for the opposite reason. Ask first.
   */
  /*
   * ASKED OF THE BUTTON, NOT THE INPUT. `cover-upload-input` carries
   * `className="hidden"` — it is the file input the visible button opens — so
   * `isVisible()` on it is false whether the picker is open or shut, and a
   * condition written on it never fires. The tab's visible half is the button.
   */
  const uploadTabOpen = () => page.getByTestId('cover-upload-button').isVisible().catch(() => false)
  if (!(await uploadTabOpen())) {
    await page.getByTestId('cover-change').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('cover-tab-upload').click({ timeout: 10_000 }).catch(() => {})
  }
  const reopened = await appears(page.getByTestId('cover-upload-button'), 8000)
  const beforeRefused = (await T()).data
  const secondPng = path.join(tmpdir(), `cover-upload-refused-${stamp}.png`)
  writeFileSync(secondPng, Buffer.concat([TINY_PNG, Buffer.from('second')]))
  await chooser.setInputFiles(secondPng, { timeout: 8000 }).catch(() => {})
  const said = await waitUntil(
    async () => (await page.getByTestId('cover-upload-error').count()) === 1,
    { timeoutMs: 15_000 },
  )
  const errText = said
    ? (await page.getByTestId('cover-upload-error').innerText({ timeout: 6000 }).catch(() => '')).trim()
    : ''
  chk(
    armed && reopened && said && errText.length > 0,
    'an upload that FAILS says so in words, rather than doing nothing visible',
    !armed
      ? 'the store would not arrange a failure, so nothing here was a failing upload'
      : !reopened
        ? 'the picker did not reopen, so no file was chosen and there was no upload to fail'
        : `the tab reported ${said ? JSON.stringify(errText) : 'nothing at all'} — a failed upload and ` +
          'a successful one looking the same is the state this tab shipped in',
  )
  const afterRefused = (await T()).data
  chk(
    (afterRefused?.coverStorageKey ?? null) === (beforeRefused?.coverStorageKey ?? null) &&
      (afterRefused?.coverImageUrl ?? null) === (beforeRefused?.coverImageUrl ?? null),
    'and the cover is left exactly as it was',
    `the cover moved to coverStorageKey=${JSON.stringify(afterRefused?.coverStorageKey ?? null)}, ` +
      `coverImageUrl=${JSON.stringify(afterRefused?.coverImageUrl ?? null)} on an upload that failed`,
  )

  /*
   * ── A cover picked from an attachment goes with the attachment ─────────
   *
   * `product-siblings/cover-dangles-after-attachment-delete`. The Attachments
   * tab makes an image attachment the cover by its key, and removing that
   * attachment deleted the object and left the key on the task, so the banner
   * and the board card went on signing a key with nothing behind it: a broken
   * image behind a live-looking URL. In ClickUp a card's cover is the first
   * image attached or one pinned from the attachments, so it IS that
   * attachment, and deleting the attachment takes the cover with it.
   *
   * Paired: deleting a DIFFERENT attachment leaves the cover where it was, and
   * still drawn. Read through the task and through the list the board draws.
   */
  console.log('\n▶ deleting the attachment a cover was picked from takes the cover with it')
  const uploadImage = async (name) => {
    const pre = await A(`/tasks/${task.id}/attachments/presign`, {
      method: 'POST',
      body: { fileName: name, contentType: 'image/png', sizeBytes: TINY_PNG.length },
    })
    const key = pre.data?.storageKey ?? null
    const put = pre.data?.uploadUrl
      ? await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY_PNG })
          .then((r) => r.status, () => 0)
      : 0
    const rec = key
      ? await A(`/tasks/${task.id}/attachments`, {
          method: 'POST',
          body: { fileName: name, storageKey: key, contentType: 'image/png', sizeBytes: TINY_PNG.length },
        })
      : { status: 0 }
    return { key, id: rec.data?.id ?? null, said: `presign ${pre.status}, PUT ${put}, record ${rec.status}` }
  }
  const bytesOf = (url) =>
    typeof url === 'string' && /^https?:\/\//.test(url)
      ? fetch(url).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null), () => null)
      : Promise.resolve(null)
  const onBoard = async () => ((await A(`/tasks/list/${listId}`)).data ?? []).find((r) => r.id === task.id) ?? null

  const pinnedImage = await uploadImage(`pinned-${stamp}.png`)
  const otherImage = await uploadImage(`other-${stamp}.png`)
  const pinned = pinnedImage.key
    ? await setCover({ coverStorageKey: pinnedImage.key, coverImageUrl: null, coverColor: null })
    : { status: 0 }
  const otherGone = otherImage.id
    ? await A(`/tasks/${task.id}/attachments/${otherImage.id}`, { method: 'DELETE' })
    : { status: 0 }
  const keptRow = (await T()).data
  const keptBytes = await bytesOf(keptRow?.coverUrl)
  chk(
    pinned.status < 300 && otherGone.status < 300 && keptRow?.coverStorageKey === pinnedImage.key &&
      keptBytes !== null && keptBytes.equals(TINY_PNG),
    'deleting another attachment leaves the cover where it was, still drawn',
    `the pinned image: ${pinnedImage.said}; the other: ${otherImage.said}; setting the cover answered ${pinned.status}, ` +
      `deleting the other ${otherGone.status}; the task now holds coverStorageKey=${JSON.stringify(keptRow?.coverStorageKey ?? null)} ` +
      `and its coverUrl ${keptBytes === null ? 'serves nothing' : 'serves other bytes'}`,
  )

  const pinnedGone = pinnedImage.id
    ? await A(`/tasks/${task.id}/attachments/${pinnedImage.id}`, { method: 'DELETE' })
    : { status: 0 }
  const coverless = (await T()).data
  const card = await onBoard()
  chk(
    pinnedGone.status < 300 && coverless?.coverStorageKey == null && coverless?.coverUrl == null &&
      card !== null && card.coverUrl == null,
    'deleting the attachment the cover was picked from takes the cover off — the banner and the board card draw none',
    `deleting it answered ${pinnedGone.status}; the task still holds coverStorageKey=${JSON.stringify(coverless?.coverStorageKey ?? null)}, ` +
      `coverUrl=${JSON.stringify(coverless?.coverUrl ?? null).slice(0, 90)} (serving ${(await bytesOf(coverless?.coverUrl)) === null ? 'nothing' : 'bytes'}); ` +
      `the board card's coverUrl=${JSON.stringify(card?.coverUrl ?? null).slice(0, 90)}`,
  )

  /*
   * AND ON SCREEN, where the other half of it was. The sheet removes an
   * attachment and refetches the TASK, so its banner follows the server. The
   * board card behind the sheet draws the LIST, which nothing refetched, so it
   * went on drawing the URL it already had until something reloaded the page.
   * Removed here the way a person removes it, through the sheet, over the
   * Board view.
   */
  console.log('\n▶ and the board card behind the sheet stops drawing it, with no reload')
  const shown = await uploadImage(`shown-${stamp}.png`)
  const shownPinned = shown.key
    ? await setCover({ coverStorageKey: shown.key, coverImageUrl: null, coverColor: null })
    : { status: 0 }
  // `?view=` names a SAVED view, not a view type, so the Board is chosen the
  // way a person chooses it, and the sheet is opened from the card itself.
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-board').click({ timeout: 15_000 }).catch(() => {})
  const boardCard = page.locator(`[data-testid="board-task-card"][data-task-id="${task.id}"]`)
  const cardImage = boardCard.locator('[data-testid="board-card-cover"][data-cover-kind="image"] img')
  const drawnBefore = await waitUntil(async () => (await cardImage.count()) > 0, { timeoutMs: 25_000 })
  /*
   * AND A SECOND BOARD, open at the same time, where nobody touches a sheet.
   * The first board also hears the TASK's event, through the sheet's own
   * subscription, so it cannot tell whether the list was told: a patch that
   * dropped the list's event reddened nothing (`task-cover-19`, 41/41). A
   * teammate's board hears only the list, which is who that event is for.
   */
  const teammate = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await teammate.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await teammate.fill('input[type=email]', ME.email)
  await teammate.fill('input[type=password]', ME.password)
  await teammate.click('button[type=submit]')
  await teammate.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {})
  await teammate.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}`, { waitUntil: 'domcontentloaded' })
  await teammate.getByTestId('work-view-tab-type-board').click({ timeout: 15_000 }).catch(() => {})
  const teammateImage = teammate.locator(
    `[data-testid="board-task-card"][data-task-id="${task.id}"] [data-testid="board-card-cover"][data-cover-kind="image"] img`,
  )
  const teammateDrawnBefore = await waitUntil(async () => (await teammateImage.count()) > 0, { timeoutMs: 25_000 })
  await boardCard.click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('task-tab-attachments').click({ timeout: 15_000 }).catch(() => {})
  await page.locator(`[data-testid="attachment-more"][data-attachment-id="${shown.id}"]`).click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('attachment-remove').click({ timeout: 10_000 }).catch(() => {})
  const removedInSheet = await waitUntil(
    async () => !((await A(`/tasks/${task.id}/attachments`)).data ?? []).some((a) => a.id === shown.id),
    { timeoutMs: 15_000 },
  )
  const cardCleared = removedInSheet && (await waitUntil(async () => (await cardImage.count()) === 0, { timeoutMs: 10_000 }))
  chk(
    shownPinned.status < 300 && drawnBefore && removedInSheet && cardCleared,
    'removing that attachment in the sheet takes the cover off the board card behind it, with no reload',
    !drawnBefore
      ? `the board card never drew the cover (${shown.said}, cover set ${shownPinned.status}), so there was nothing to take off`
      : !removedInSheet
        ? 'the sheet never removed the attachment'
        : 'the card still draws an image, and its URL is to an object that was deleted',
  )
  const teammateCleared = removedInSheet && (await waitUntil(async () => (await teammateImage.count()) === 0, { timeoutMs: 10_000 }))
  chk(
    teammateDrawnBefore && removedInSheet && teammateCleared,
    'and so does a second board open at the same time, where nobody touched the sheet',
    !teammateDrawnBefore
      ? 'the second board never drew the cover, so there was nothing to take off'
      : 'the second board still draws the image: nothing told the list',
  )
  await teammate.context().close().catch(() => {})

  await A(`/tasks/${task.id}`, { method: 'DELETE' })
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run did not run the suite, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
