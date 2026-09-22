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
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

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
const EXPECTED_CHECKS = 18

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
  await page.getByTestId('cover-change').click()
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
  const tabsText = await page.locator('[role="tablist"]').first().innerText().catch(() => '')
  chk(
    !/photos/i.test(tabsText) && !/\bAI\b/.test(tabsText),
    'and nothing that only pretends to work',
    `the picker still offers: ${JSON.stringify(tabsText.replace(/\s+/g, ' '))}`,
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
    !/search/i.test(tabsText),
    'the Search tab stays absent, and the comment that says why has been re-checked',
    `the picker now offers a Search tab (${JSON.stringify(tabsText.replace(/\s+/g, ' '))}) — ` +
      'if it searches a real provider, update the decision in cover-image-picker.tsx; ' +
      'if it does not, it is a search box over nothing',
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
  await page.getByTestId('cover-change').click()
  chk(
    await appears(page.getByTestId('cover-gallery-custom')),
    'the Gallery offers Custom beside the fixed swatches',
    'no Custom cell in the Gallery — the palette is eight colours and nothing else',
  )
  await page.getByTestId('cover-gallery-custom').click()
  chk(
    await appears(page.getByTestId('cover-custom-input'), 6000),
    'and opening it reveals a colour chooser',
    'clicking Custom revealed no colour input — the cell is a label with nothing behind it',
  )

  const chosen = '#1f9d55'
  await page.getByTestId('cover-custom-input').fill(chosen)
  await page.getByTestId('cover-custom-apply').click()
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
