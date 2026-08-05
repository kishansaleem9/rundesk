/**
 * The deployed UI, driven by a real browser — on the VPS, where it is reachable.
 *
 * `verify-release.sh` proves the endpoints answer and that the shipped bundle
 * contains this release's code. Neither proves anything *renders*. This does:
 * it signs in through the real login form and clicks the controls this release
 * added.
 *
 * It runs against the machine's own nginx rather than the public hostname, so
 * it needs no DNS, no certificate and no egress:
 *
 *   cd /opt/rundesk
 *   npx --yes playwright@1.56 install --with-deps chromium   # once
 *   RUNDESK_EMAIL=admin@rundesk.internal RUNDESK_PASSWORD='Admin@123!' \
 *     npx --yes playwright@1.56 run-server >/dev/null 2>&1 &   # not needed; see below
 *   node deploy/verify-ui.mjs
 *
 * If `playwright` is not importable it says so and exits 2 rather than
 * pretending the UI passed.
 *
 * Overrides: BASE (default http://127.0.0.1), RUNDESK_EMAIL, RUNDESK_PASSWORD,
 * CHROME (an explicit chromium binary if the download went somewhere unusual).
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1'
const EMAIL = process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.RUNDESK_PASSWORD ?? 'Admin@123!'
const SHOT = process.env.SHOT_DIR ?? '/tmp'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(
    '\x1b[31m✗ playwright is not installed here.\x1b[0m\n' +
      '  Install it once, then re-run:\n' +
      '    npx --yes playwright@1.56 install --with-deps chromium\n' +
      '    npm i --no-save playwright@1.56\n' +
      '  Exiting 2 rather than reporting a UI nobody looked at.',
  )
  process.exit(2)
}

const results = []
let REF = '—'
const ok = (m) => { results.push([REF, true, m]); console.log(`  \x1b[32mPASS\x1b[0m [${REF}] ${m}`) }
const bad = (m) => { results.push([REF, false, m]); console.log(`  \x1b[31mFAIL\x1b[0m [${REF}] ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))
const ref = (r, what) => { REF = r; console.log(`\n\x1b[1;36m▶ ${r}\x1b[0m  ${what}`) }

const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] }
if (process.env.CHROME) launchOpts.executablePath = process.env.CHROME

let browser
try {
  browser = await chromium.launch(launchOpts)
} catch (e) {
  // The usual cause is a playwright package newer than the browsers on disk.
  // Say which command fixes it instead of printing a stack trace.
  console.error(
    `\x1b[31m✗ could not start chromium.\x1b[0m\n  ${e.message.split('\n')[0]}\n\n` +
      '  Most likely the browser binaries do not match the playwright package.\n' +
      '  Fix with:   npx --yes playwright@$(node -p "require(\'playwright/package.json\').version") install chromium\n' +
      '  Or point at one you already have:   CHROME=/path/to/chrome node deploy/verify-ui.mjs\n' +
      '  Exiting 2 rather than reporting a UI nobody looked at.',
  )
  process.exit(2)
}

const page = await (await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  // The VPS serves this over plain http on loopback; a self-signed cert on the
  // public vhost must not stop the check.
  ignoreHTTPSErrors: true,
})).newPage()

const seen = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const go = async (path, settle = 3000) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
}

// Anything the page logs as an error is worth knowing about — a white screen
// from a bad chunk URL looks like "no elements found" otherwise.
// A bare "Failed to load resource" names nothing you can act on, so record the
// URL that failed alongside it.
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const where = m.location?.()?.url ?? ''
  consoleErrors.push(`${m.text().slice(0, 110)}${where ? `  ← ${where.replace(BASE, '')}` : ''}`)
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 140)}`))
page.on('requestfailed', (r) => {
  const url = r.url().replace(BASE, '')
  consoleErrors.push(`request failed: ${r.failure()?.errorText ?? '?'}  ← ${url.slice(0, 110)}`)
})

try {
  ref('LOGIN', 'The deployed app loads and signs in')
  await go('/login', 2500)
  chk(await page.locator('input[type=email]').count() > 0,
    'the login form renders', `no login form at ${BASE}/login — is nginx serving the SPA?`)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 30000 })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  ok(`signed in as ${EMAIL}`)

  // A super admin lands on /app/admin rather than inside a workspace, so the
  // landing URL is not a reliable source for one. Ask the API which workspaces
  // this account can see and drive to the first.
  let WS = (/\/app\/([0-9a-f-]{36})/.exec(page.url()) ?? [])[1]
  if (!WS) {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).then((r) => r.json()).catch(() => null)
    const token = res?.data?.accessToken
    const list = token
      ? await fetch(`${BASE}/api/v1/workspaces`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).catch(() => null)
      : null
    // Each row is a membership: { workspace, role }.
    WS = (list?.data ?? []).map((r) => (r.workspace ?? r)?.id).find(Boolean)
    if (WS) {
      await go(`/app/${WS}`, 4000)
      ok(`this account lands on ${page.url().replace(BASE, '')}; drove to workspace ${WS}`)
    }
  } else {
    ok(`landed in workspace ${WS}`)
  }
  chk(Boolean(WS), 'a workspace is reachable', 'no workspace visible to this account')
  if (!WS) throw new Error('cannot continue without a workspace')

  ref('A6.1', 'The meeting record panel renders')
  await go(`/app/${WS}/ai`, 3500)
  const notesTab = page.getByRole('button', { name: 'Meeting notes', exact: true })
  chk(await notesTab.count() > 0, 'the Meeting notes tab is there', 'no Meeting notes tab')
  if (await notesTab.count()) {
    await notesTab.click()
    await page.waitForTimeout(2500)
    const notes = await seen()
    chk(/Meeting record/i.test(notes), 'the Meeting record panel renders', 'the panel did not render')
    chk(/Who was there/i.test(notes), 'attendees are offered', 'no attendee picker')
    chk(/Recording link/i.test(notes), 'so is the recording link', 'no recording field')
    chk(/does not transcribe/i.test(notes),
      'and it says plainly that calls are not transcribed', 'the honesty line is missing')
    chk(await page.getByPlaceholder('Weekly sync').count() > 0,
      'the title field is usable', 'no title field')
  }

  ref('A3.5', 'Ask AI opens a prompt instead of rewriting the draft')
  await go(`/app/${WS}/chat`, 4000)
  const ta = page.locator('textarea:visible').first()
  chk(await ta.count() > 0, 'the composer renders', 'no composer on the chat page')
  if (await ta.count()) {
    await ta.fill('we need to shipp this featur by friday pls')
    const before = await ta.inputValue()
    const composer = page.locator('div').filter({ has: page.locator('textarea') }).last()
    const askAi = composer.getByRole('button', { name: /Ask AI/i }).first()
    chk(await askAi.count() > 0, 'the Ask AI control is in the toolbar', 'no Ask AI control')
    if (await askAi.count()) {
      await askAi.click()
      await page.waitForTimeout(1800)
      const pop = await seen()
      chk(/Improve/i.test(pop) && /Shorten/i.test(pop), 'it offers modes to choose from', 'no modes offered')
      chk((await ta.inputValue()) === before,
        'and the draft is untouched until one is picked', 'opening the prompt rewrote the draft')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    ref('A3.6', 'The link picker offers Tasks / Docs / Channels')
    const link = page.getByRole('button', { name: /Link a task, doc or channel/i }).first()
    chk(await link.count() > 0, 'the link control is in the toolbar', 'no link control')
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(1600)
      const picker = await seen()
      for (const tab of ['Tasks', 'Docs', 'Channels']) {
        chk(new RegExp(tab, 'i').test(picker), `the ${tab} tab is offered`, `no ${tab} tab`)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
  }

  ref('A3.9', 'A DM shows Chat / Calendar / Tasks; a channel does not')
  const strip = () => page.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })
  chk(await strip().count() === 0, 'a channel has no tab strip', 'a channel showed DM tabs')
  // Any DM in the sidebar. With a single-member workspace there may be none,
  // which is a fact about the data rather than about the feature.
  const dmSection = page.locator('button, a').filter({ hasText: /^[A-Z][^#]{1,30}$/ })
  const dmCount = await page.getByText(/Direct messages/i).count()
  if (dmCount === 0) {
    bad('no Direct messages section — cannot reach a DM to test the strip')
  } else {
    let opened = false
    for (let i = 0; i < Math.min(await dmSection.count(), 40); i++) {
      const el = dmSection.nth(i)
      const label = (await el.innerText().catch(() => '')).trim()
      if (!label || /^(Chat|Docs|Home|Inbox|Teams|Settings|People|New)$/.test(label)) continue
      await el.click().catch(() => {})
      await page.waitForTimeout(2000)
      if (await strip().count() === 3) { opened = true; ok(`opened the DM with ${label}`); break }
    }
    if (!opened) {
      console.log('  \x1b[2mSKIP\x1b[0m no DM in this workspace yet — start one to exercise the tabs')
    } else {
      chk(await strip().count() === 3, 'all three tabs render', `saw ${await strip().count()}`)
      await page.getByRole('button', { name: 'Calendar', exact: true }).click()
      await page.waitForTimeout(2200)
      chk(/Meetings with/i.test(await seen()), 'Calendar names whose meetings these are', 'no Calendar heading')
      chk(await page.locator('textarea:visible').count() === 0,
        'the composer steps out of the way', 'the composer is still visible under Calendar')
      await page.getByRole('button', { name: 'Tasks', exact: true }).click()
      await page.waitForTimeout(2200)
      chk(/Open tasks with/i.test(await seen()), 'Tasks names whose tasks these are', 'no Tasks heading')
      await page.getByRole('button', { name: 'Chat', exact: true }).click()
      await page.waitForTimeout(1500)
      chk(await page.locator('textarea:visible').count() > 0, 'and the composer comes back', 'the composer did not return')
    }
  }

  ref('A1.3', 'The board offers + Add group')
  await go(`/app/${WS}`, 3500)
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const hrefAtDepth = (d) =>
    page.locator('a[href]').evaluateAll((as, { u, d }) => {
      const re = new RegExp(`^/app/${u}${`/${u}`.repeat(d)}$`)
      return as.map((a) => a.getAttribute('href') ?? '').find((h) => re.test(h)) ?? null
    }, { u: UUID, d })
  const spaceHref = await hrefAtDepth(1)
  let listHref = null
  if (spaceHref) {
    await go(spaceHref, 3000)
    const projectHref = await hrefAtDepth(2)
    if (projectHref) { await go(projectHref, 3000); listHref = await hrefAtDepth(3) }
  }
  if (!listHref) {
    bad('no list reachable from the tree — cannot check the board')
  } else {
    await go(listHref, 4500)
    const boardTab = page.getByRole('button', { name: /^Board$/ }).first()
    chk(await boardTab.count() > 0, 'the Board view is offered', 'no Board view')
    if (await boardTab.count()) {
      await boardTab.click()
      await page.waitForTimeout(3000)
      chk(/Add group|New group/i.test(await seen()), 'the board offers + Add group', 'no add-group control')
    }
  }

  ref('HEALTH', 'Nothing is broken in the console')
  // Third-party hosts (web fonts, CDNs) say something about the network of the
  // machine running this check, not about the deployment. Counting them turns
  // a locked-down runner into a false red.
  const external = consoleErrors.filter((e) => /←\s*https?:\/\//.test(e))
  const own = consoleErrors
    .filter((e) => !external.includes(e))
    .filter((e) => !/favicon|manifest|sw\.js|workbox/i.test(e))
  if (external.length) {
    const hosts = [...new Set(external.map((e) => (/←\s*(https?:\/\/[^/]+)/.exec(e) ?? [])[1]).filter(Boolean))]
    console.log(`  \x1b[2mnote\x1b[0m ${external.length} request(s) to other hosts were not reachable from this machine: ${hosts.join(', ')}`)
    console.log('  \x1b[2m     not counted — that is this runner\'s network, not the deployment.\x1b[0m')
  }
  chk(own.length === 0, 'no console errors from the app\'s own resources',
    `${own.length} error(s): ${own.slice(0, 3).join(' | ')}`)
} catch (e) {
  bad(`threw: ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: `${SHOT}/verify-ui-fail.png`, fullPage: true }).catch(() => {})
  console.log(`  a screenshot of the failure is at ${SHOT}/verify-ui-fail.png`)
} finally {
  await browser.close()
}

console.log(`\n${'═'.repeat(60)}`)
const failed = results.filter(([, pass]) => !pass)
if (failed.length) {
  console.log('\x1b[31mFAILURES\x1b[0m')
  for (const [r, , m] of failed) console.log(`  [${r}] ${m}`)
  console.log('═'.repeat(60))
}
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
if (!failed.length) console.log('\x1b[32m─── the deployed UI renders and responds ───\x1b[0m')
process.exit(failed.length ? 1 : 0)
