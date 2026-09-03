/**
 * Video 1 — acceptance walk.
 *
 * The per-feature suites prove each change in isolation. This does the thing
 * they cannot: ONE session, one workspace, one browser, touching every
 * user-visible surface of the release in the order a person would meet them.
 *
 * Isolation is where features look correct and interactions hide. A source
 * strip that quietly breaks the type chips, a call dock that vanishes when the
 * palette opens, a freshness control that fights the list's own polling — none
 * of those can fail in a suite that only ever exercises one of the pair.
 *
 * So this asserts PRESENCE and CO-EXISTENCE rather than re-deriving each
 * feature's internals: the suites own correctness, this owns "they are all
 * really there, together, in one running product".
 *
 *   node test/e2e/video1-acceptance.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 17

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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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
/** Wait for a thing rather than sleeping: CI is slower than this machine. */
const appears = async (loc, ms = 12000) => {
  await loc.waitFor({ state: 'visible', timeout: ms }).catch(() => {})
  return loc.isVisible().catch(() => false)
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const login = await signInApi(API, ME.email, ME.password)
  const A = apiAs(login.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: 30000 })

  // ── The Overview ──────────────────────────────────────────────────────────
  console.log('\n▶ the Overview a person lands on')
  await page.goto(`${stack.base}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  chk(await appears(page.getByTestId('home-bookmarks')), '§G01-9 Bookmarks card is on the Overview',
    'no bookmarks card')

  // Saving an external URL from the card, then finding it still there after a
  // full reload — a card that only holds what this render put in it is a card
  // that loses your work.
  await page.getByTestId('bookmark-add-open').click()
  await page.getByTestId('bookmark-url').fill(`https://example.com/acceptance-${stamp}`)
  await page.getByTestId('bookmark-title').fill(`Acceptance ${stamp}`)
  await page.getByTestId('bookmark-save').click()
  await page.waitForTimeout(2000)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const kept = await appears(page.getByTestId('bookmarks-list'))
  const listed = kept ? await page.getByTestId('bookmarks-list').innerText() : ''
  chk(listed.includes(`Acceptance ${stamp}`), 'and a bookmark saved there survives a reload',
    'the bookmark did not come back')

  // ── The palette, where most of the release lives ───────────────────────────
  console.log('\n▶ the command palette')
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.keyboard.press('Control+k')
  chk(await appears(page.getByTestId('palette-sources')), '§G02-9 the source strip is under the query',
    'no source strip')
  chk(await appears(page.getByTestId('palette-type-all')), 'and the type chips are still there beside it',
    'the source strip displaced the type chips')

  /*
   * The interaction a per-feature suite cannot see: choosing a source must not
   * break the chips that scope Rundesk's own results. They answer different
   * questions and both have to survive the other existing.
   */
  await page.getByTestId('palette-source-gmail').click()
  chk(await appears(page.getByTestId('palette-source-disconnected')),
    'choosing an unconnected source explains itself', 'an unconnected source went silent')
  await page.getByTestId('palette-source-all').click()
  await page.waitForTimeout(800)
  chk(
    await page.getByTestId('palette-type-all').isVisible().catch(() => false),
    'and going back to All leaves the type chips intact',
    'the chips did not survive a round trip through a source',
  )

  /*
   * The sort modes are CHIPS inside the collapsed filters panel, not a select.
   *
   * The first version of this check read `<option>` elements and picked up a
   * labels dropdown instead — reporting "blocked, bug, chore" as sort modes.
   * Worth keeping as a note: the trending modes are two clicks away, behind
   * "Filters", which is where the existing sorts live too.
   */
  await page.getByTestId('palette-filters-toggle').click()
  await page.waitForTimeout(800)
  const panelText = await page.locator('[cmdk-root], [role="dialog"]').first().innerText().catch(() => '')
  chk(
    /trending in workspace/i.test(panelText) && /trending for you/i.test(panelText),
    '§G03-6 the filters panel offers both trending modes',
    `panel did not name them: ${JSON.stringify(panelText.replace(/\s+/g, ' ').slice(0, 160))}`,
  )

  // The zero-result answer, with its controls.
  await page.locator('[cmdk-input]').first().pressSequentially(`zqq-nothing-${stamp}`, { delay: 30 })
  const answered = await appears(page.getByTestId('palette-ai-answer'), 20000)
  chk(answered, '§G02 a query that matches nothing gets an answer', 'the dead end is still a dead end')
  chk(
    answered && (await page.getByTestId('palette-ai-continue').isVisible().catch(() => false)),
    'and offers a way to continue with the assistant',
    'the answer has no way forward',
  )
  await page.keyboard.press('Escape')

  // ── A list, where the day is actually spent ────────────────────────────────
  console.log('\n▶ a list')
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let spaceId = null, projectId = null, listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { spaceId = s.id; projectId = p.id; listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to walk')
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}`, {
    waitUntil: 'domcontentloaded',
  })
  chk(await appears(page.getByTestId('freshness-controls')), '§G01-8 the list says how old it is',
    'no freshness controls on the list')
  chk(
    (await page.getByTestId('freshness-updated').innerText().catch(() => '')).trim().length > 0,
    'and names when the data arrived',
    'the age line is empty',
  )

  // ── The tree, where the hierarchy shows ────────────────────────────────────
  console.log('\n▶ the sidebar tree')
  const listUnderSpace = await A('/lists', {
    method: 'POST',
    body: { spaceId, name: `Acceptance space list ${stamp}` },
  })
  chk(listUnderSpace.status < 400, '§G15-10 a List can be made from a Space alone',
    `POST /lists with only a spaceId returned ${listUnderSpace.status}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.getByTestId(`space-toggle-${spaceId}`).click().catch(() => {})
  await page.waitForTimeout(2000)
  const treeText = await page.locator('aside, nav').first().innerText().catch(() => '')
  chk(
    treeText.includes(`Acceptance space list ${stamp}`),
    'and it appears in the tree under its Space',
    'the space-level list is not in the tree',
  )
  chk(
    !/(^|\n)\s*Lists\s*(\n|$)/.test(treeText),
    'without exposing the container that carries it',
    'the hidden container leaked into the tree',
  )

  // ── Meetings, searchable this release ──────────────────────────────────────
  console.log('\n▶ meetings')
  const phrase = `acceptance${stamp}`
  const meeting = (await A(`/workspaces/${workspaceId}/meetings`, {
    method: 'POST',
    body: { title: 'Acceptance sync', notes: `We agreed the ${phrase} plan.` },
  })).data
  await new Promise((r) => setTimeout(r, 1500))
  const hits = (await A(`/search/${workspaceId}?q=${phrase}`)).data ?? []
  const hit = hits.find((h) => h.entityType === 'meeting')
  chk(!!hit, '§G14-15 a meeting is findable by what its notes say',
    `search returned ${JSON.stringify(hits.map((h) => h.entityType))}`)
  if (hit?.url) {
    await page.goto(`${stack.base}${hit.url}`, { waitUntil: 'domcontentloaded' })
    chk(
      (await page.getByTestId(`meeting-${meeting.id}`).getAttribute('data-highlighted').catch(() => null)) === 'true',
      'and the result lands on that meeting, not just the page',
      'the linked meeting is not distinguished',
    )
  } else {
    chk(false, 'and the result lands on that meeting, not just the page', 'no hit to follow')
  }

  // ── The inbox ─────────────────────────────────────────────────────────────
  console.log('\n▶ the inbox')
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const notifs = (await A('/notifications')).data ?? []
  if (notifs.length > 0) {
    await A('/notifications/mark-all-read', { method: 'POST' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    chk(
      await appears(page.getByTestId('inbox-clear-all')),
      '§G10-12 Clear all is there even with nothing unread',
      'Clear all vanished once everything was read',
    )
    for (const n of notifs.filter((n) => !n.readAt)) {
      await A(`/notifications/${n.id}/unread`, { method: 'POST' }).catch(() => {})
    }
  } else {
    chk(false, '§G10-12 Clear all is there even with nothing unread', 'no notifications to work with')
  }
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
