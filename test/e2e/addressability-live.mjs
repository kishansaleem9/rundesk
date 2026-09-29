/**
 * Every fix from the addressability audit, exercised as a person would.
 *
 * The per-fix suites assert the mechanism. This one drives the whole set
 * against a real API, a real Postgres and a real Meilisearch, in one session,
 * doing what a user does: type into the palette, click a channel, open a task,
 * switch a tab, follow a link out of the workspace and come back. It exists to
 * catch the thing that unit-shaped checks cannot — one fix breaking another.
 *
 *   node test/e2e/addressability-live.mjs --api 3011 --dist apps/web/dist
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const API_PORT = Number(process.env.API_HOST_PORT) || Number(argOf('--api', '')) || 3011
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

let chromium
for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
  try {
    ;({ chromium } = require_(id))
  } catch { /* next */ }
  if (chromium) break
}
if (!chromium) {
  for (const dir of [process.env.PLAYWRIGHT_DIR, '/opt/rundesk-pw/node_modules'].filter(Boolean)) {
    for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
      const file = `${dir}/${entry}`
      if (!fs.existsSync(file)) continue
      try {
        ;({ chromium } = await import(pathToFileURL(file).href))
      } catch { /* next */ }
      if (chromium) break
    }
    if (chromium) break
  }
}
if (!chromium) {
  console.error('✗ playwright is not installed anywhere this script can see.')
  process.exit(2)
}

const CHROME = process.env.CHROME || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = {
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
}

let passed = 0
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}
const say = (s) => console.log(`\n▶ ${s}`)

/** Raise when checks are added — a suite that quietly shrinks reads as green. */
const EXPECTED_CHECKS = 28

const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

let browser
let stack
const done = async () => {
  await browser?.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early.`)
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

try {
  const ping = await fetch(`${API}/health`).catch(() => null)
  if (!ping?.ok) {
    console.error(`✗ no API on 127.0.0.1:${API_PORT}`)
    process.exit(2)
  }

  const admin = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(admin.accessToken)
  const WS = admin.workspaces[0].id

  const spaces = await A(`/spaces/workspace/${WS}`)
  const projects = await A(`/projects/space/${spaces.data[0].id}`)
  const lists = await A(`/lists/project/${projects.data[0].id}`)
  const listId = lists.data?.[0]?.id
  if (!listId) throw new Error('no list in the seeded workspace')
  const listPath = `${WS}/${spaces.data[0].id}/${projects.data[0].id}/${listId}`

  stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
  const origin = stack.base

  browser = await chromium.launch(LAUNCH)
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })

  // ── 1. ⌘K finds a word that lives only in a description ──────────────────
  say('⌘K finds what the server found, not just what the title says')
  const NEEDLE = `zqx${Date.now().toString(36)}`
  const bodyTask = await A('/tasks', {
    method: 'POST',
    body: { listId, title: 'Quarterly planning', description: `we must migrate the ${NEEDLE} cluster` },
  })
  /*
   * WAITED FOR, NOT SLEPT (`found-24-sep/three-suites-fail-under-a-full-sweep`).
   * This was 2.5 fixed seconds after the create, then 2.5 more after typing, and
   * under a sweep's load neither was enough: the palette was read showing only
   * its quick actions, which it draws the moment there is a query — the search's
   * answer had not arrived. So: the index is asked the palette's own question
   * until it finds the task (the palette asks once per query, so a search run
   * before the index had the task would never be repeated), and the palette is
   * read once its list holds the answer. Both are bounded; when the task never
   * comes, the checks below fail as they always did.
   */
  await waitUntil(async () => {
    const hits = (await A(`/search/${WS}?q=${encodeURIComponent(NEEDLE)}`)).data ?? []
    return hits.some((h) => String(h?.id ?? '').endsWith(bodyTask.data?.id) || (h?.url ?? '').includes(`task=${bodyTask.data?.id}`))
  }, { timeoutMs: 20_000, stepMs: 400 })
  await page.goto(`${origin}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.keyboard.press('Control+k')
  await page.locator('[cmdk-input]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.locator('[cmdk-input]').first().fill(NEEDLE)
  await waitUntil(
    async () => (await page.locator('[cmdk-list]').first().innerText({ timeout: 2000 })).includes('Quarterly planning'),
    { timeoutMs: 20_000 },
  )
  const paletteText = (await page.locator('[cmdk-list]').first().innerText()).replace(/\s+/g, ' ')
  check(
    paletteText.includes('Quarterly planning'),
    'a task whose TITLE does not contain the word is still shown',
    paletteText.slice(0, 140),
  )
  check(!/No matches/i.test(paletteText), 'and the palette does not claim "no matches"', paletteText.slice(0, 90))

  /*
   * G03-9 — her Status submenu (frames 047/052) reads "All ✓ / Active /
   * Closed". All is a VISIBLE, checked default; clearing a filter should not
   * mean clicking the active chip again and hoping. Type already had this and
   * Status and Priority did not.
   */
  for (const group of ['status', 'priority']) {
    const all = page.locator(`[data-testid="palette-${group}-all"]`)
    const present = await all.count()
    // Two checks per group whichever way it goes — see the note on the back
    // link above. A missing All chip used to shorten the run by one rather
    // than failing the claim that it starts selected.
    check(present > 0, `the ${group} filter offers an explicit All`, `no All chip in the ${group} group`)
    if (present === 0) {
      check(
        false,
        `and All is the state it starts in for ${group}`,
        'skipped: there was no All chip to read the state off',
      )
    } else {
      check(
        (await all.getAttribute('aria-pressed')) === 'true' ||
          (await all.getAttribute('data-active')) === 'true' ||
          /bg-|text-foreground/.test((await all.getAttribute('class')) ?? ''),
        `and All is the state it starts in for ${group}`,
        'All is offered but does not read as selected with nothing filtered',
      )
    }
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // ── 2. leaving the workspace tree, and getting back ──────────────────────
  say('The inbox settings gear is no longer a one-way trip')
  await page.goto(`${origin}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const gear = page.locator('a[href*="/app/profile"]').first()
  check((await gear.count()) > 0, 'the inbox offers delivery settings')
  await gear.click()
  await page.waitForTimeout(3000)
  check(/\/app\/profile/.test(page.url()), 'which lands on the profile page', page.url())
  const escape = page.locator('[data-testid="sidebar-no-workspace"]')
  check((await escape.count()) > 0, 'and the sidebar offers a way back')
  const backLink = escape.locator(`a[href="/app/${WS}"]`).first()
  const haveBackLink = (await backLink.count()) > 0
  check(haveBackLink, 'naming the workspace you came from')
  /*
   * THE `if` USED TO HAVE NO `else`, which made a missing back link a SHORTER
   * RUN rather than two failures. `EXPECTED_CHECKS` is compared with `!==`, so
   * the suite then reports `✗ 27 of 28 checks ran` — a headline that reads as
   * the harness breaking rather than as the escape hatch being gone. Third
   * suite in this audit with this shape; the rule is that every branch reports
   * the same number of checks.
   */
  if (haveBackLink) {
    await backLink.click()
    await page.waitForTimeout(2500)
    check(page.url().endsWith(`/app/${WS}`), 'and clicking it returns there', page.url())
  } else {
    check(false, 'and clicking it returns there', 'skipped: there was no back link to click')
  }

  // ── 3. the profile tab is an address ─────────────────────────────────────
  say('The profile tab is an address')
  await page.goto(`${origin}/app/profile`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const secTab = page.getByRole('button', { name: /security/i }).first()
  if ((await secTab.count()) === 0) {
    check(false, 'no Security tab to click')
  } else {
    await secTab.click()
    await page.waitForTimeout(1500)
    check(/[?&]tab=security/.test(page.url()), 'choosing Security puts it in the address', page.url())
  }

  // ── 4. a task opened from the list has an address ────────────────────────
  say('A task you open is a task you can send')
  await page.goto(`${origin}/app/${listPath}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  check(!/[?&]task=/.test(page.url()), 'the list starts with no task named', page.url())
  await page.getByText('Quarterly planning', { exact: true }).first().click()
  await page.waitForTimeout(2000)
  const taskUrl = page.url()
  check(taskUrl.includes(`task=${bodyTask.data?.id}`), 'opening one names it in the address', taskUrl)
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  /*
   * THE SHEET, NOT THE TITLE ANYWHERE ON THE PAGE.
   *
   * This read `body.innerText().includes('Quarterly planning')`, and the list
   * grid behind the sheet renders that title in a row — so the check passed
   * whether or not the address reopened anything. A patch that drops `task=`
   * from the URL entirely leaves the bare list URL, which still shows the row,
   * which still contains the words. Naming only what should be there, when the
   * claim is that a specific thing OPENED.
   *
   * The tab strip only exists inside the detail sheet, so its presence is the
   * sheet being open; the title is then read from the sheet rather than from
   * the document.
   */
  const sheet = page.getByTestId('task-sheet').first()
  const sheetOpen = await sheet
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  // Read off the sheet's own root, not off an ancestor found by `closest` from
  // a tab button — the first version of this walked up to `[role="dialog"],
  // aside, section` and got back an empty string, and the harness refused the
  // whole set on a red baseline rather than letting it pass as a result.
  const sheetText = sheetOpen ? await sheet.innerText().catch(() => '') : ''
  check(
    sheetOpen && sheetText.includes('Quarterly planning'),
    'and that address reopens the same task',
    sheetOpen ? `the sheet opened on ${JSON.stringify(sheetText.slice(0, 80))}` : 'no task sheet opened at all',
  )

  // ── 5. sprints is reachable ──────────────────────────────────────────────
  say('Sprints can be reached from the sidebar')
  await page.goto(`${origin}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const sprint = page.locator('[data-testid="workspace-sidebar"] a[href$="/sprints"]').first()
  const haveSprint = (await sprint.count()) > 0
  check(haveSprint, 'the sidebar carries a Sprints entry')
  if (haveSprint) {
    await sprint.click()
    await page.waitForTimeout(2800)
    check(/\/sprints$/.test(new URL(page.url()).pathname), 'and it opens the sprints page', page.url())
  } else {
    // Reported, not skipped — see the note on the back link above.
    check(false, 'and it opens the sprints page', 'skipped: there was no Sprints entry to click')
  }

  // ── 6. chat: channel and thread ──────────────────────────────────────────
  say('The channel you are in is the channel you can send')
  await page.goto(`${origin}/app/${WS}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  check(/[?&]channel=/.test(page.url()), 'landing on chat names the channel it chose', page.url())

  // ── 7. docs ──────────────────────────────────────────────────────────────
  say('The doc you are writing is the doc you can send')
  /*
   * A second doc, deliberately. The seed ships exactly one, and with one doc
   * "coming back reopens the same one" is true however broken the addressing
   * is — the auto-select would land on it regardless. Switching to a doc that
   * is NOT the default is what makes the check mean something.
   */
  const SECOND_DOC = `live probe doc ${Date.now()}`
  const secondDoc = await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: SECOND_DOC } })
  await page.goto(`${origin}/app/${WS}/docs`, { waitUntil: 'domcontentloaded' })
  // The address is written once the docs list has answered and one is opened —
  // read then, not four fixed seconds after landing, which a sweep's load outran.
  await waitUntil(() => /[?&]doc=/.test(page.url()), { timeoutMs: 20_000 })
  check(/[?&]doc=/.test(page.url()), 'landing on docs names the doc it opened', page.url())
  if (!secondDoc.data?.id) {
    // Two checks, not one — see the note on the back link above. Without the
    // second doc neither claim can be made, and saying so twice keeps the run
    // the same length as one that could.
    check(false, 'switching doc changes the address', 'skipped: no second doc could be created')
    check(
      false,
      'and coming back to that address reopens THAT doc, not the first one',
      'skipped: no second doc could be created',
    )
  } else {
    await page.getByTestId(`docs-tree-item-${secondDoc.data.id}`).first().click()
    await page.waitForTimeout(2000)
    const docUrl = page.url()
    check(docUrl.includes(`doc=${secondDoc.data.id}`), 'switching doc changes the address', docUrl)
    await page.goto(`${origin}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.goto(docUrl, { waitUntil: 'domcontentloaded' })
    // The title is drawn once the docs have answered; read it when it names the
    // doc (bounded — a page that reopens another doc still fails, naming it).
    await waitUntil(
      async () => (await page.getByTestId('docs-active-title').innerText({ timeout: 2000 })).includes(SECOND_DOC),
      { timeoutMs: 20_000 },
    )
    const reopened = await page.getByTestId('docs-active-title').innerText().catch(() => '')
    check(
      reopened.includes(SECOND_DOC),
      'and coming back to that address reopens THAT doc, not the first one',
      `reopened "${reopened.trim()}"`,
    )
    await A(`/docs/${secondDoc.data.id}`, { method: 'DELETE' }).catch(() => {})
  }

  // ── 8. dashboard: mode in the address, and counts that are the caller's ──
  say('The dashboard tab is an address, and its counts are yours')
  await page.goto(`${origin}/app/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  check(!/[?&]mode=/.test(page.url()), 'the dashboard starts on Overview with a clean address', page.url())
  const custom = page.getByText('Custom', { exact: false }).first()
  if ((await custom.count()) > 0) {
    await custom.click()
    await page.waitForTimeout(2000)
    check(/[?&]mode=custom/.test(page.url()), 'switching to Custom puts it in the address', page.url())
  } else {
    check(false, 'no Custom tab to switch to')
  }
  // The server-side half: the scoped listing agrees with the member endpoint.
  // That endpoint is OPEN work only since `home-today-overdue-includes-closed`
  // (it is Home's Assigned to me), while the listing still carries closed
  // tasks, so the two are compared on open work, row by row. Counting all of
  // one against the other failed 13 against 9 on lane 1: four closed tasks.
  // One open task of the admin's of its own, so the comparison is never of two
  // empty lists — a fresh database assigns the admin nothing.
  const mineOpen = await A('/tasks', { method: 'POST', body: { listId, title: 'Assigned to me, open', assigneeIds: [admin.user.id] } })
  const scoped = await A(`/tasks/workspace/${WS}?limit=500&assigneeId=me`)
  const member = await A(`/tasks/workspace/${WS}/members/${admin.user.id}`)
  const memberIds = new Set((member.data ?? []).map((t) => t.id))
  const openScoped = (scoped.data ?? []).filter((t) => t.statusCategory !== 'closed')
  const strays = openScoped.filter((t) => !memberIds.has(t.id))
  check(
    Array.isArray(scoped.data) && Array.isArray(member.data) && openScoped.some((t) => t.id === mineOpen.data?.id) &&
      strays.length === 0,
    'assigneeId=me agrees with the member endpoint: every open task it lists is one the member endpoint lists',
    `${openScoped.length} open of ${scoped.data?.length} listed (this suite's own among them: ${openScoped.some((t) => t.id === mineOpen.data?.id)}), ` +
      `${member.data?.length} from the member endpoint, ${strays.length} not in it`,
  )
  if (mineOpen.data?.id) await A(`/tasks/${mineOpen.data.id}`, { method: 'DELETE' }).catch(() => {})
  const leaked = await A(`/tasks/workspace/${WS}?limit=5&assigneeId=00000000-0000-4000-8000-000000000000`)
  const unfiltered = await A(`/tasks/workspace/${WS}?limit=5`)
  check(
    leaked.data?.length === unfiltered.data?.length,
    'and an arbitrary assigneeId is ignored rather than honoured',
  )

  // ── 9. workspace settings tab ────────────────────────────────────────────
  say('The settings tab you are on is the address you can send')
  await page.goto(`${origin}/app/${WS}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const trash = page.getByTestId('settings-tab-trash')
  if ((await trash.count()) === 0) {
    check(false, 'no Trash tab to move to')
  } else {
    await trash.first().click()
    await page.waitForTimeout(2000)
    check(
      /[?&]tab=trash/.test(page.url()) && !/tab=members/.test(page.url()),
      'moving to Trash replaces Members in the address',
      page.url(),
    )
  }

  // ── 10. the type picker, which needs the seeded task types ───────────────
  say('A fresh install has task types, so the picker is not hidden')
  const types = await A(`/workspaces/${WS}/task-types`)
  check(
    Array.isArray(types.data) && types.data.some((x) => /milestone/i.test(x?.name ?? '')),
    `the workspace has task types (${(types.data ?? []).map((x) => x?.name).join(', ') || 'none'})`,
  )

  // ── 11. nothing broke on the way ─────────────────────────────────────────
  say('Nothing threw while doing all of that')
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${origin}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  check(errors.length === 0, 'the workspace home renders without a page error', errors.slice(0, 2).join(' | '))

  if (bodyTask.data?.id) await A(`/tasks/${bodyTask.data.id}`, { method: 'DELETE' })
  await done()
} catch (err) {
  console.error(`\n✗ ${err?.stack ?? err}`)
  failed++
  await done()
}
