/**
 * The deployed UI, driven by a real browser — on the VPS, where it is reachable.
 *
 * `verify-release.sh` proves the endpoints answer and that the shipped bundle
 * contains this release's code. Neither proves anything *renders*. This does:
 * it signs in through the real login form and clicks the controls this release
 * added.
 *
 * It uses the site's real hostname but resolves it to loopback, so the request
 * carries the Host header nginx's vhost is keyed on while never leaving the
 * machine. Asking for http://127.0.0.1 directly does not work: the Host does
 * not match `server_name`, nginx serves its default vhost, and the SPA is
 * nowhere to be found.
 *
 *   cd /opt/rundesk
 *   node deploy/verify-ui.mjs
 *
 * If playwright is not importable it says so and exits 2 rather than
 * pretending the UI passed. See deploy/README.md for the one-time install.
 *
 * One thing this deliberately cannot cover: it always opens a *fresh* page, so
 * it always fetches the current manifest and can never see a chunk that a
 * deploy has deleted out from under an already-open tab — the crash in the
 * 7 Aug review video. That needs two releases staged side by side, which is
 * what test/e2e/stale-chunk-recovery.mjs does (and CI runs).
 *
 * Overrides: BASE (default: APP_URL from .env), RUNDESK_EMAIL,
 * RUNDESK_PASSWORD, API_PORT, CHROME, PLAYWRIGHT_DIR, NO_HOST_MAP=1 to resolve
 * the hostname normally instead of pinning it to loopback.
 */
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const REPO = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

/** A value from the deploy's own .env — the same file docker-compose reads. */
function fromEnvFile(key) {
  try {
    const txt = readFileSync(resolvePath(REPO, '.env'), 'utf8')
    const m = new RegExp(`^${key}=(.*)$`, 'm').exec(txt)
    return m?.[1].trim().replace(/^["']|["']$/g, '') || null
  } catch {
    return null
  }
}

const BASE = (process.env.BASE ?? fromEnvFile('APP_URL') ?? 'http://127.0.0.1').replace(/\/$/, '')
const HOST = new URL(BASE).hostname
const IS_LOOPBACK = /^(127\.|localhost$|::1$|0\.0\.0\.0$)/.test(HOST)
// The browser talks to nginx; this script's own fetches go straight to the API
// container, which needs no vhost and no TLS.
const API_PORT = process.env.API_PORT ?? fromEnvFile('API_HOST_PORT') ?? '3010'
const API = IS_LOOPBACK ? `${BASE}/api/v1` : `http://127.0.0.1:${API_PORT}/api/v1`
const EMAIL = process.env.RUNDESK_EMAIL ?? fromEnvFile('RUNDESK_EMAIL') ?? 'admin@rundesk.internal'
const PASSWORD = process.env.RUNDESK_PASSWORD ?? fromEnvFile('RUNDESK_PASSWORD') ?? 'Admin@123!'
const SHOT = process.env.SHOT_DIR ?? '/tmp'

// Resolving playwright is fiddlier than it looks. This repo is a pnpm
// workspace using the `link:` protocol, so `npm i playwright` inside it fails
// outright (EUNSUPPORTEDPROTOCOL) — it has to live somewhere else. And ESM
// ignores NODE_PATH, so a bare import cannot see it there either. Hence an
// explicit search of a few sane locations.
const PW_DIRS = [
  process.env.PLAYWRIGHT_DIR,
  '/opt/rundesk-pw/node_modules',
  `${process.env.HOME ?? '/root'}/.rundesk-pw/node_modules`,
  '/usr/lib/node_modules',
].filter(Boolean)

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  for (const dir of PW_DIRS) {
    for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
      const file = `${dir}/${entry}`
      if (!existsSync(file)) continue
      try {
        ;({ chromium } = await import(pathToFileURL(file).href))
      } catch { /* try the next candidate */ }
      if (chromium) break
    }
    if (chromium) break
  }
}

if (!chromium) {
  console.error(
    '\x1b[31m✗ playwright is not installed anywhere this script can see.\x1b[0m\n\n' +
      '  Install it OUTSIDE the repo — `npm i` inside this pnpm workspace fails on\n' +
      '  the link: protocol it uses for internal packages:\n\n' +
      '    mkdir -p /opt/rundesk-pw && cd /opt/rundesk-pw\n' +
      '    npm init -y >/dev/null && npm i playwright@1.56\n' +
      '    npx playwright install --with-deps chromium\n\n' +
      '  Then, from the repo:\n' +
      '    node deploy/verify-ui.mjs\n\n' +
      `  Searched: ${PW_DIRS.join(', ')}\n` +
      '  (or set PLAYWRIGHT_DIR to the node_modules holding it)\n' +
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

/**
 * A stray rejection must not be able to end the run.
 *
 * Every section already runs inside its own try/catch, but that only catches
 * what a section AWAITS. A promise created inside a section and left running —
 * a route handler still asleep, a navigation nobody waited on — rejects later,
 * outside any of them, and Node's default is to kill the process. When that
 * happens mid-run the summary never prints and every section after it silently
 * never ran, which reads as "the check stopped" rather than "the check failed".
 *
 * It happened on 25 Aug: §2.9a's route handler continued a route that had been
 * unrouted while it slept, and took §15 with it. That specific bug is fixed
 * above; this is the guard that keeps the next one to a single FAIL.
 */
process.on('unhandledRejection', (err) => {
  const message = err instanceof Error ? err.message.split('\n')[0] : String(err)
  bad(`unhandled rejection: ${message}`)
})

const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] }
if (process.env.CHROME) launchOpts.executablePath = process.env.CHROME
// Pin the site's hostname to loopback. This is what lets the request carry the
// Host header nginx keys its vhost on while still never leaving the machine —
// no public DNS, no hairpin NAT, no egress.
if (!IS_LOOPBACK && !process.env.NO_HOST_MAP) {
  launchOpts.args.push(`--host-resolver-rules=MAP ${HOST} 127.0.0.1`)
}

console.log(`  driving ${BASE}${IS_LOOPBACK ? '' : `  (${HOST} pinned to 127.0.0.1)`}`)
console.log(`  api     ${API}`)

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

/**
 * One section, in its own guard.
 *
 * A locator that times out used to abort the whole file, so a single bad
 * selector silently took every check below it with it — a run that reported
 * "40 passed, 1 failed" had in fact never looked at §2.5, §1.3, §1.1 or the
 * health sweep at all. A partial run that reads as a near-complete one is
 * worse than a failing one.
 *
 * Sections are independent by construction: only the sign-in block's bindings
 * (WS, apiGet, until, …) are shared, and it stays outside this wrapper because
 * nothing below it can mean anything if it fails.
 */
const section = async (r, what, fn) => {
  ref(r, what)
  try {
    await fn()
  } catch (e) {
    bad(`threw: ${e.message.split('\n')[0]}`)
    const shot = `${SHOT}/verify-ui-fail-${r.replace(/[^\w]+/g, '') || 'x'}.png`
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log(`  \x1b[2m     screenshot: ${shot}\x1b[0m`)
  }
}

// What counts as "broken" needs care. A 404 from the custom-domain probe is the
// app asking a question and getting a legitimate no; a 401 before sign-in is
// the same. Counting those reports a healthy deployment as broken — which an
// earlier version of this file did.
//
// Broken is: an uncaught exception, a document/script/stylesheet that would not
// load (a white screen from a stale chunk looks like "no elements found"
// otherwise), or the server erroring outright.
const broken = []
const noted = []
const short = (u) => u.replace(BASE, '').slice(0, 110)
const external = (u) => { try { return new URL(u).host !== new URL(BASE).host } catch { return false } }

page.on('pageerror', (e) => broken.push(`uncaught: ${e.message.slice(0, 140)}`))
page.on('requestfailed', (r) => {
  const url = r.url()
  const line = `${r.failure()?.errorText ?? 'failed'}  ← ${short(url)}`
  if (external(url)) noted.push(line)
  // Vite's HMR socket only exists in dev; it is not part of a deployment.
  else if (/\/@vite\/|__vite|\bws:\/\//.test(url)) noted.push(line)
  else if (['document', 'script', 'stylesheet'].includes(r.resourceType())) broken.push(line)
  else noted.push(line)
})
page.on('response', (r) => {
  if (r.status() < 500) return
  if (external(r.url())) return
  broken.push(`HTTP ${r.status()}  ← ${short(r.url())}`)
})

try {
  ref('LOGIN', 'The deployed app loads and signs in')

  // Wait for the API to answer before driving a browser at it.
  //
  // `deploy.sh rebuild` recreates the API container and this check is usually
  // the next thing run, so the first request can land while Nest is still
  // booting. The failure then looks nothing like a warm-up: the login form
  // renders (nginx serves static files fine), the submit POST fails, the URL
  // never changes, and the run dies on `waitForURL: Timeout 30000ms` — which
  // reads as "login is broken" rather than "the server was not up yet".
  //
  // That happened on 25 Aug and cost a round trip to work out. The repo already
  // learned this once for the Playwright suite ("the first spec ran ~0.5s after
  // deploy.sh rebuild recreated the API container and hit 502s"); this is the
  // same lesson applied to the check that runs straight after a deploy.
  {
    // Bounded by env so the stub-driven isolation test (which points at a dead
    // port on purpose) does not sit here for a minute per run.
    const budget = Number(process.env.API_READY_MS ?? 90000)
    const deadline = Date.now() + budget
    let last = 'no response'
    let attempts = 0
    if (budget > 0) {
      process.stdout.write(`  \x1b[2m     waiting for ${API}/health \x1b[0m`)
    }
    for (;;) {
      attempts++
      const status = await fetch(`${API}/health`, {
        method: 'GET',
        // WITHOUT THIS THE WHOLE RUN HANGS FOREVER. A connection that is
        // accepted and then never answered — nginx up, Nest still booting —
        // leaves fetch awaiting with no timeout of its own, so the deadline
        // below is never even evaluated. On 25 Aug that looked exactly like a
        // frozen check: no output, no error, no end.
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => r.status)
        .catch(() => 0)
      if (status && status < 500) { last = `HTTP ${status}`; break }
      last = status ? `HTTP ${status}` : 'no answer yet'
      if (Date.now() > deadline) {
        if (budget > 0) console.log('')
        bad(`the API never became ready after ${attempts} attempt(s) (${last}) — nothing below this is meaningful`)
        console.log('  \x1b[2m     try: docker logs rundesk-api --tail 50\x1b[0m')
        break
      }
      // A dot per attempt, so waiting never looks like hanging. Silence and a
      // hang are indistinguishable from the outside, which is the whole reason
      // this was reported as "it's stuck".
      process.stdout.write('.')
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (budget > 0) console.log('')
    console.log(`  \x1b[2m     api ready: ${last} (${attempts} attempt(s))\x1b[0m`)
  }

  await go('/login', 2500)
  const hasForm = await page.locator('input[type=email]').count() > 0
  if (!hasForm) {
    const body = (await seen()).slice(0, 160)
    bad(`no login form at ${BASE}/login — nginx served: "${body}"`)
    console.log('    Most likely the Host header does not match a server_name in')
    console.log('    deploy/nginx/*.conf, so nginx answered with its default vhost.')
    console.log(`    Check APP_URL in .env (currently ${fromEnvFile('APP_URL') ?? 'unset'}).`)
    throw new Error('the SPA is not being served for this hostname')
  }
  ok('the login form renders')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  // One retry: the API can answer /health while a first real request still
  // races a cold connection pool. Re-submitting is cheap and turns a flaky
  // "login is broken" into a passing run.
  await page.waitForURL(/\/app\//, { timeout: 20000 }).catch(async () => {
    console.log('  \x1b[2m     first sign-in did not navigate; submitting once more\x1b[0m')
    await page.fill('input[type=email]', EMAIL).catch(() => {})
    await page.fill('input[type=password]', PASSWORD).catch(() => {})
    await page.click('button[type=submit]').catch(() => {})
    await page.waitForURL(/\/app\//, { timeout: 20000 })
  })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  ok(`signed in as ${EMAIL}`)

  // A super admin lands on /app/admin rather than inside a workspace, so the
  // landing URL is not a reliable source for one. Ask the API which workspaces
  // this account can see and drive to the first.
  // A token of our own, so the script can ask the API what it should be
  // looking at rather than inferring it from the DOM.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json()).catch(() => null)
  const token = login?.data?.accessToken
  const apiGet = (path) =>
    token
      ? fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).then((j) => j?.data).catch(() => null)
      : Promise.resolve(null)
  const apiPost = (path, body) =>
    token
      ? fetch(`${API}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        }).then((r) => r.json()).then((j) => j?.data).catch(() => null)
      : Promise.resolve(null)
  // apiGet swallows the status, so a 404 and an empty list look identical. Some
  // checks below turn on exactly that difference.
  const apiRead = (path) =>
    token
      ? fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.data }))
          .catch(() => ({ status: 0, data: null }))
      : Promise.resolve({ status: 0, data: null })

  /**
   * Poll until it is true, or give up and say so. A fixed sleep is a guess about
   * how long something takes; this is a claim about whether it happened, and it
   * is the difference between a flaky check and a real one.
   */
  const until = async (fn, ms = 8000, step = 250) => {
    const deadline = Date.now() + ms
    for (;;) {
      const v = await fn().catch(() => null)
      if (v) return v
      if (Date.now() > deadline) return null
      await new Promise((r) => setTimeout(r, step))
    }
  }

  let WS = (/\/app\/([0-9a-f-]{36})/.exec(page.url()) ?? [])[1]
  if (!WS) {
    // Each row is a membership: { workspace, role }.
    WS = ((await apiGet('/workspaces')) ?? []).map((r) => (r.workspace ?? r)?.id).find(Boolean)
    if (WS) {
      await go(`/app/${WS}`, 4000)
      ok(`this account lands on ${page.url().replace(BASE, '')}; drove to workspace ${WS}`)
    }
  } else {
    ok(`landed in workspace ${WS}`)
  }
  chk(Boolean(WS), 'a workspace is reachable', 'no workspace visible to this account')
  if (!WS) throw new Error('cannot continue without a workspace')

  await section('A6.1', 'The meeting record panel renders', async () => {
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
  })

  await section('A3.5', 'Ask AI opens a prompt instead of rewriting the draft', async () => {
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
  })

  await section('A3.9', 'A DM shows Chat / Calendar / Tasks; a channel does not', async () => {
    const strip = () => page.locator('button[aria-pressed]').filter({ hasText: /^(Chat|Calendar|Tasks)$/ })
    chk(await strip().count() === 0, 'a channel has no tab strip', 'a channel showed DM tabs')
    // Which DM to click comes from the API, not from scanning the sidebar. A row
    // is an avatar plus a name, so matching its text is fragile — an earlier
    // version skipped a DM that was plainly there.
    const channels = (await apiGet(`/workspaces/${WS}/chat/channels`)) ?? []
    const dm = channels.find((c) => c.isDm)
    const dmName = dm?.dmLabel ?? dm?.dmPeerName ?? null
    if (!dm) {
      console.log('  \x1b[2mSKIP\x1b[0m no DM exists in this workspace — the API lists none.')
      console.log('  \x1b[2m     Start one (or run deploy/make-dm.sh) to exercise the tabs.\x1b[0m')
    } else if (!dmName) {
      bad(`a DM exists (${dm.id}) but carries no name to click`)
    } else {
      await page.getByText(dmName, { exact: true }).first().click().catch(() => {})
      await page.waitForTimeout(2500)
      const opened = await strip().count() === 3
      chk(opened, `opened the DM with ${dmName}`, `clicking "${dmName}" did not open the DM`)
      if (opened) {
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
  })

  await section('A1.3', 'The board offers + Add group', async () => {
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

    // -------------------------------------------------------------------------
    // The video1 fast items, on the deployed instance. They are covered against a
    // local build by test/e2e/video1-fast-items.mjs; this is the same claims
    // against the thing users actually load.
    // -------------------------------------------------------------------------
  })

  await section('§1.5', 'The language switcher is out of the top bar', async () => {
    await go(`/app/${WS}`, 3500)
    {
      const header = page.locator('header').first()
      const topbar = (await header.innerText().catch(() => '')).replace(/\s+/g, ' ')
      chk(
        !/english|urdu|espa\u00f1ol|\u0627\u0644\u0639\u0631\u0628\u064a\u0629/i.test(topbar),
        'no language control in the top bar',
        `top bar still offers a language: ${topbar.slice(0, 90)}`,
      )
      await go('/app/profile', 3500)
      chk(
        /language/i.test(await seen()),
        'it is in personal settings instead — a move, not a deletion',
        'the language control is nowhere to be found',
      )
    }
  })

  await section('§2.2', 'The Inbox "Other" chip is gone, Later stays', async () => {
    await go(`/app/${WS}/inbox`, 4000)
    {
      const labels = (await page.locator('header button').allInnerTexts())
        .map((t) => t.split('\n')[0].trim())
        .filter(Boolean)
      chk(
        !labels.some((l) => /^other$/i.test(l)),
        `no Other control in the header (${labels.join(', ')})`,
        `Other is still there: ${labels.join(', ')}`,
      )
      chk(labels.some((l) => /^later$/i.test(l)), 'Later is still there', 'Later went missing too')
      await go(`/app/${WS}/inbox?filter=other`, 3500)
      const body = await seen()
      chk(
        !/something went wrong/i.test(body),
        'an old ?filter=other link still lands on a working inbox',
        'the removed filter breaks old links',
      )
    }
  })

  await section('§2.2b', 'Primary is customisable, and Later holds saved messages', async () => {
    await go(`/app/${WS}/inbox?filter=primary`, 4000)
    {
      const customise = page.locator('[data-testid="primary-customise"]')
      if ((await customise.count()) === 0) {
        bad('no customise control on the Primary chip')
      } else {
        await customise.click()
        await page.waitForTimeout(1200)
        const boxes = await page
          .locator('[data-testid="primary-customise-panel"] input[type="checkbox"]')
          .count()
        chk(boxes >= 10, `the customiser offers ${boxes} kinds`, `only ${boxes} offered`)
        // The five she named that had no type until this release.
        for (const type of [
          'task_unassigned',
          'task_follower_changed',
          'message_reaction',
          'shared_with_me',
          'access_requested',
        ]) {
          chk(
            (await page.locator(`[data-testid="primary-type-${type}"]`).count()) > 0,
            `${type} is offered`,
            `${type} is missing from the customiser`,
          )
        }

        /*
         * A rendered checkbox proves nothing about whether ticking it is
         * remembered, and "remembered" is the whole feature — she is choosing
         * once, not every visit. So tick one for real and ask the API, which is
         * the only witness that cannot be fooled by local component state. The
         * unit tests for this ran against a stubbed db; this is the deployed one.
         */
        const box = page.locator('[data-testid="primary-type-message_reaction"]')
        const typesNow = async () =>
          new Set((await apiGet('/notifications/preferences'))?.primaryTypes ?? [])
        if ((await box.count()) === 0) {
          // Already reported missing above; clicking it would throw and take the
          // rest of the run down with it.
          bad('cannot check that a choice persists: the checkbox is not there')
        } else {
          const was = (await typesNow()).has('message_reaction')
          await box.click()
          const landed = await until(async () =>
            (await typesNow()).has('message_reaction') === !was ? true : null,
          )
          chk(
            landed,
            `ticking a kind is saved (message_reaction -> ${!was ? 'on' : 'off'})`,
            'the tick never reached the API, so the choice dies with the tab',
          )
          // Leave the account as we found it: this is someone's real Primary. The
          // second click sends whatever the component currently holds, so wait for
          // the invalidated query to land first — clicking on stale state would
          // re-send the set we are trying to undo.
          await until(async () => ((await box.isChecked()) === !was ? true : null))
          await box.click()
          const restored = await until(async () =>
            (await typesNow()).has('message_reaction') === was ? true : null,
          )
          chk(restored, 'and untickable again', 'could not restore the original choice')
        }

        /*
         * Close it the way the source says people expect to — "a popover that
         * only closes via its own button strands people who expect anywhere-else
         * to dismiss it". Not by clicking the gear again: the click-away layer is
         * `fixed inset-0 z-40` and the gear sits under it, so playwright refuses
         * the click as intercepted. A person clicking there still closes the
         * panel (they hit the layer, which is exactly what it is for), so this is
         * a quirk of strict actionability rather than a bug — but it does mean
         * the gear is not the affordance under test. The layer is.
         */
        await page.mouse.click(20, 300)
        chk(
          (await until(async () =>
            (await page.locator('[data-testid="primary-customise-panel"]').count()) === 0
              ? true
              : null,
          4000)),
          'and clicking away closes it',
          'the panel stays open when you click outside it',
        )
      }
    }
    {
      // Saved messages need a starred message to show, and this account may have
      // none. The claim that survives either way is that the endpoint the tab
      // depends on exists on *this* build — a 404 here is the tab permanently
      // empty, which looks identical to "nothing saved" from the screenshot.
      const saved = await apiRead(`/workspaces/${WS}/chat/saved`)
      chk(
        saved.status === 200,
        `the saved-messages endpoint answers (${Array.isArray(saved.data) ? saved.data.length : 0} saved)`,
        `Later's saved-messages source answered ${saved.status}`,
      )
      await go(`/app/${WS}/inbox?view=later`, 4000)
      chk(
        !/something went wrong/i.test(await seen()),
        'the Later tab renders',
        'the Later tab threw',
      )
      if (Array.isArray(saved.data) && saved.data.length > 0) {
        chk(
          (await page.locator('[data-testid="later-saved-messages"]').count()) > 0,
          `and shows the ${saved.data.length} saved message(s) — the tab she goes looking in`,
          'saved messages exist but Later does not show them',
        )
      } else {
        ok('nothing is starred on this account, so the saved section is correctly absent')
      }
    }
  })

  await section('§2.5', 'Clear all, and the retention clock', async () => {
    {
      /*
       * Both controls here are conditional on there being something to act on:
       * Clear all renders only with unread rows, and the countdown only attaches
       * to a cleared one. Checking them against whatever the account happens to
       * hold makes a green run mean "the inbox was empty" as often as it means
       * "the feature works". So seed the precondition and check the real thing.
       */
      const seeded = await apiPost('/notifications/test', { workspaceId: WS })
      const counts = (await apiGet('/notifications/counts')) ?? {}
      chk(
        seeded !== null && (counts.inbox ?? 0) > 0,
        'seeded a notification to clear',
        'could not seed a notification, so the checks below would prove nothing',
      )

      await go(`/app/${WS}/inbox`, 4000)
      const clearAll = page.locator('[data-testid="inbox-clear-all"]')
      chk(
        (await clearAll.count()) > 0,
        'the Inbox offers Clear all',
        'no bulk clear — the thing she actually did on screen',
      )

      // Clicking it bins everything in the bucket. That is fine when the only
      // thing there is ours, and not ours to do otherwise: RUNDESK_EMAIL may well
      // be a person. When it is, clear just the seeded row and say the click was
      // skipped rather than passing silently on a weaker check.
      const mine = ((await apiGet('/notifications?view=inbox')) ?? []).filter(
        (n) => n.type === 'test_notification',
      )
      const onlyOurs = (counts.inbox ?? 0) === 1 && mine.length >= 1
      if (onlyOurs && (await clearAll.count()) > 0) {
        await clearAll.click()
        const emptied = await until(async () =>
          ((await apiGet('/notifications/counts')) ?? {}).inbox === 0 ? true : null,
        )
        chk(emptied, 'clicking it empties the Inbox', 'Clear all did not clear the Inbox')
      } else {
        for (const n of mine) await apiPost(`/notifications/${n.id}/clear`)
        ok(
          `clicked nothing: this account holds ${counts.inbox} live notifications, ` +
            'so only the seeded row was cleared (the button is checked above)',
        )
      }

      await go(`/app/${WS}/inbox?view=cleared`, 4000)
      const rows = await page.locator('[data-testid="retention-countdown"]').count()
      chk(
        rows > 0,
        `${rows} cleared row(s) show how long is left before deletion`,
        'a row was just cleared, but nothing says when it goes — clearing reads as archiving',
      )
      chk(
        /30 days/i.test(await seen()),
        'and the tab states the 30-day policy',
        'the Cleared tab never mentions the 30 days',
      )
    }
  })

  await section('§1.3', 'The sidebar collapses to icons', async () => {
    await go(`/app/${WS}`, 4000)
    {
      const sidebar = page.locator('[data-testid="workspace-sidebar"]')
      const toggle = page.locator('[data-testid="sidebar-toggle"]').first()
      const width = async () => (await sidebar.boundingBox().catch(() => null))?.width ?? 0
      const expanded = await width()
      if ((await toggle.count()) === 0) {
        bad('no collapse control on the sidebar')
      } else {
        await toggle.click()
        await page.waitForTimeout(1200)
        const collapsed = await width()
        chk(
          expanded > 200 && collapsed > 0 && collapsed < 90,
          `collapses ${Math.round(expanded)}px -> ${Math.round(collapsed)}px`,
          `width went ${Math.round(expanded)} -> ${Math.round(collapsed)}`,
        )
        chk(
          (await sidebar.locator('a').count()) >= 5,
          'the destinations are still reachable as icons',
          'the rail has no links',
        )
        // The floating dock lives inside this component; as an early return the
        // collapsed branch never reached it, so collapsing deleted it.
        const dockAlive = await page.evaluate(
          () =>
            [...document.querySelectorAll('div')].some(
              (el) =>
                getComputedStyle(el).position === 'fixed' && !!el.querySelector('a[href*="/app/"]'),
            ),
        )
        chk(dockAlive, 'and the floating dock survives collapsing', 'collapsing removed the dock')
        // Put it back — this runs against the real account and should not leave
        // the sidebar collapsed for whoever logs in next.
        await page.locator('[data-testid="sidebar-toggle"]').first().click()
        await page.waitForTimeout(1200)
        chk((await width()) > 200, 'and expands again', 'it would not expand back')
      }
    }
  })

  await section('§G15', 'My Tasks is a place you can go, not a tab you have to find', async () => {
    /*
     * [21:22] — "MY TASKS … ASSIGNED TO ME, TODAY, aur PERSONAL LIST".
     *
     * All three used to be buttons inside Home's left card, driven by component
     * state. That is why "I have no idea where tasks are going" was a fair
     * complaint: there was no address for my tasks, so a task you had just made
     * had nowhere you could go and look for it, and nobody could send you a
     * link to it either.
     *
     * So the check is not "are the three labels on the page" — they always
     * were. It is: does the sidebar carry them, does clicking one put it in the
     * URL, and does arriving at that URL cold render that section.
     */
    await go(`/app/${WS}`, 4000)
    const group = page.locator('[data-testid="sidebar-my-tasks"]')
    if ((await group.count()) === 0) {
      bad('the sidebar has no My Tasks group — the three sections are buried in Home again')
    } else {
      const links = await group.locator('a').count()
      chk(links === 3, `the sidebar carries all three My Tasks links`, `the group has ${links} links, not 3`)

      const today = page.locator('[data-testid="sidebar-my-tasks-today-overdue"]')
      await today.click()
      await page.waitForTimeout(1200)
      const url = page.url()
      const inUrl = /[?&]section=today-overdue\b/.test(url)
      const rendered = (await page.locator('[data-testid="home-section-today-overdue"]').count()) > 0
      chk(
        inUrl && rendered,
        'clicking Today & Overdue puts it in the URL, so it can be bookmarked or sent',
        inUrl
          ? 'the URL changed but the section did not open'
          : `clicking it left the address at ${short(url)}`,
      )

      /*
       * The one that actually proves the URL drives the page rather than
       * merely recording it: land on the deep link cold, from a different
       * route, and look for something only Personal List renders.
       */
      await go(`/app/${WS}/inbox`, 2500)
      await go(`/app/${WS}?section=personal-list`, 4000)
      /*
       * Anchored on a testid, not on visible text: production can be running in
       * any of the four languages, and a check that reads English copy would
       * report a working page as broken the day somebody switches locale.
       */
      chk(
        (await page.locator('[data-testid="home-section-personal-list"]').count()) > 0,
        'a cold visit to ?section=personal-list opens Personal List, not the Inbox',
        'the deep link fell back to the default section — the URL is not the source of truth',
      )

      // A section nobody knows about must not blank the page; it falls back.
      await go(`/app/${WS}?section=not-a-real-section`, 3500)
      const alive = (await page.locator('[data-testid="sidebar-my-tasks"]').count()) > 0
      const stuck = (await page.locator('[data-testid="home-section-personal-list"]').count()) > 0
      chk(
        alive && !stuck,
        'and an unknown section falls back to Home instead of erroring',
        alive ? 'a bogus ?section left the previous section on screen' : 'an unrecognised ?section value broke the page',
      )
    }
  })

  await section('§ADDR', 'The things you look at have addresses you can send', async () => {
    /*
     * The addressability audit fixed nine things whose common shape was: the
     * app knows what you are looking at and the URL does not. Each has its own
     * CI suite, and every one of those runs against a FRESH install. None of
     * them look at the deployed instance — which is exactly the gap that let
     * My Tasks sit green in CI while nothing confirmed it on the running
     * server. These are the deployed-side checks.
     *
     * Written to survive a workspace with real data in it: nothing here
     * depends on a particular task, channel or doc existing, only on the
     * app naming whatever it chose.
     */

    // ── ⌘K shows what the server found, not just what the title says ───────
    {
      /*
       * A task whose TITLE cannot match, so only the body can. cmdk used to
       * re-filter server hits on the title alone and unmount everything that
       * matched on content — the user saw "No matches" over results the
       * browser was holding.
       */
      const needle = `zqxaddr${Date.now().toString(36)}`
      /*
       * Reached through space → project → list, like the task check below.
       * A flat `/workspaces/:id/lists` does not exist, and asking for it
       * returned nothing — which sent this straight to its "nothing to do"
       * branch and reported a PASS for a check that never ran.
       */
      const sp = (await apiGet(`/spaces/workspace/${WS}`)) ?? []
      const pr = sp[0] ? (await apiGet(`/projects/space/${sp[0].id}`)) ?? [] : []
      const ls = pr[0] ? (await apiGet(`/lists/project/${pr[0].id}`)) ?? [] : []
      const listId = ls[0]?.id
      const made = listId
        ? await apiPost('/tasks', {
            listId,
            title: 'Addressability probe',
            description: `body only: ${needle}`,
          })
        : null
      if (!made?.id) {
        ok('no list to seed a body-only search probe in, so ⌘K was not exercised here')
      } else {
        await new Promise((r) => setTimeout(r, 2500))
        await go(`/app/${WS}/inbox`, 3000)
        await page.keyboard.press('Control+k')
        await page.waitForTimeout(900)
        const input = page.locator('[cmdk-input]').first()
        if ((await input.count()) === 0) {
          bad('⌘K did not open')
        } else {
          await input.fill(needle)
          await page.waitForTimeout(2500)
          const list = (await page.locator('[cmdk-list]').first().innerText()).replace(/\s+/g, ' ')
          chk(
            list.includes('Addressability probe'),
            'a result that matched only in its body is shown in ⌘K',
            `the palette hid it: ${list.slice(0, 120)}`,
          )
          await page.keyboard.press('Escape')
          await page.waitForTimeout(400)
        }
        await fetch(`${API}/tasks/${made.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
      }
    }

    // ── a page you can reach is a page you can leave ───────────────────────
    {
      await go(`/app/${WS}/inbox`, 2500)
      // The exact link the Inbox settings gear uses.
      await go('/app/profile?tab=notifications', 3500)
      chk(
        !/Something went wrong/i.test(await seen()),
        'the notifications tab renders rather than dying on its payload',
        'the profile page is on the error boundary',
      )
      const escape = page.locator('[data-testid="sidebar-no-workspace"]')
      chk(
        (await escape.count()) > 0,
        'a route outside the workspace tree still offers a way back',
        'the profile page is a dead end again — the sidebar has no way out',
      )
      chk(
        (await escape.locator('a[href="/app"]').count()) > 0,
        'and the workspace picker is always offered as a fallback',
        'no picker fallback on a workspace-less route',
      )
      const back = escape.locator(`a[href="/app/${WS}"]`).first()
      if ((await back.count()) === 0) {
        bad('no "Back to workspace" link — the breadcrumb was not remembered')
      } else {
        await back.click()
        await page.waitForTimeout(2500)
        chk(page.url().endsWith(`/app/${WS}`), 'which returns to the workspace you came from', page.url())
      }
    }

    // ── the sidebar names the workspace it is standing in ──────────────────
    {
      await go(`/app/${WS}`, 3000)
      const sidebar = (await page.locator('[data-testid="workspace-sidebar"]').innerText()).replace(/\s+/g, ' ')
      chk(
        !/Select workspace/i.test(sidebar),
        'the sidebar does not say "Select workspace" while you are in one',
        `header reads: ${sidebar.slice(0, 90)}`,
      )
    }

    // ── Sprints is reachable ───────────────────────────────────────────────
    {
      const link = page.locator('[data-testid="workspace-sidebar"] a[href$="/sprints"]')
      chk(
        (await link.count()) > 0,
        'Sprints is reachable from the sidebar',
        'Sprints is built and nothing links to it again',
      )
    }

    // ── opening a task names it ────────────────────────────────────────────
    {
      const spaces = (await apiGet(`/spaces/workspace/${WS}`)) ?? []
      const projects = spaces[0] ? (await apiGet(`/projects/space/${spaces[0].id}`)) ?? [] : []
      const lists = projects[0] ? (await apiGet(`/lists/project/${projects[0].id}`)) ?? [] : []
      const listId = lists[0]?.id
      if (!listId) {
        ok('no list on this deployment, so the task address was not exercised')
      } else {
        const title = `addr probe ${Date.now()}`
        const made = await apiPost('/tasks', { listId, title })
        await go(`/app/${WS}/${spaces[0].id}/${projects[0].id}/${listId}`, 3500)
        const row = page.getByText(title, { exact: true }).first()
        if ((await row.count()) === 0) {
          bad('the seeded task never rendered, so the address check proves nothing')
        } else {
          await row.click()
          await page.waitForTimeout(2000)
          chk(
            made?.id ? page.url().includes(`task=${made.id}`) : /[?&]task=/.test(page.url()),
            'opening a task puts it in the address',
            page.url(),
          )
        }
        if (made?.id) {
          await fetch(`${API}/tasks/${made.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {})
        }
      }
    }

    // ── chat and docs name what they opened ────────────────────────────────
    {
      await go(`/app/${WS}/chat`, 4000)
      chk(
        /[?&]channel=/.test(page.url()),
        'landing on chat names the channel it chose',
        page.url(),
      )
      await go(`/app/${WS}/docs`, 4000)
      chk(/[?&]doc=/.test(page.url()), 'landing on docs names the doc it opened', page.url())
    }

    // ── the dashboard tab, and a tab that is not the default ───────────────
    {
      await go(`/app/${WS}/dashboard`, 3500)
      chk(
        !/[?&]mode=/.test(page.url()),
        'the dashboard opens on Overview without a parameter that says nothing',
        page.url(),
      )
      /*
       * The line above is true of a build with no search schema at all, so on
       * its own it proves nothing. Switching tabs is the half that only passes
       * once the tab is actually in the address.
       */
      const custom = page.getByText('Custom', { exact: false }).first()
      if ((await custom.count()) === 0) {
        bad('no Custom tab on the dashboard to switch to')
      } else {
        await custom.click()
        await page.waitForTimeout(2000)
        chk(
          /[?&]mode=custom/.test(page.url()),
          'and switching to Custom puts that in the address',
          page.url(),
        )
      }
      await go(`/app/${WS}/settings?tab=members`, 3000)
      const trash = page.getByTestId('settings-tab-trash')
      if ((await trash.count()) === 0) {
        // Not an excuse: this account reached workspace settings, so the tab
        // strip should be there. Reporting a PASS here would hide exactly the
        // case where the build predates the fix.
        bad('no Trash tab in workspace settings to move to')
      } else {
        await trash.first().click()
        await page.waitForTimeout(2000)
        chk(
          /[?&]tab=trash/.test(page.url()) && !/tab=members/.test(page.url()),
          'moving between settings tabs replaces the old one in the address',
          page.url(),
        )
      }
    }

    // ── the dashboard's own counts come from the server ────────────────────
    {
      const mine = await apiRead(`/tasks/workspace/${WS}?limit=500&assigneeId=me`)
      chk(
        mine.status === 200 && Array.isArray(mine.data),
        'the workspace listing can be narrowed to the caller in SQL',
        `assigneeId=me answered ${mine.status}`,
      )
      const spoof = await apiRead(
        `/tasks/workspace/${WS}?limit=5&assigneeId=00000000-0000-4000-8000-000000000000`,
      )
      const plain = await apiRead(`/tasks/workspace/${WS}?limit=5`)
      chk(
        (spoof.data?.length ?? -1) === (plain.data?.length ?? -2),
        'and an arbitrary assigneeId is ignored rather than honoured',
        `${spoof.data?.length} rows vs ${plain.data?.length} unfiltered`,
      )
    }
  })

  await section('§1.1', 'Task type at create time and in search', async () => {
    {
      // The picker hides itself when a workspace has no types, so this is not a
      // skippable precondition — it *is* the feature. Production had zero until
      // migration 0093 backfilled Task and Milestone.
      const types = (await apiGet(`/workspaces/${WS}/task-types`)) ?? []
      chk(
        Array.isArray(types) && types.some((t) => /milestone/i.test(t?.name ?? '')),
        `the workspace has task types (${(types ?? []).map((t) => t?.name).join(', ') || 'none'})`,
        'the workspace has no Milestone type, so the picker stays hidden',
      )
      if (!Array.isArray(types) || types.length === 0) {
        bad('nothing to check the picker against')
      } else {
        await go(`/app/${WS}`, 3500)
        const newBtn = page.getByRole('button', { name: /^new$/i }).first()
        if ((await newBtn.count()) === 0) {
          bad('no New button to open the create modal')
        } else {
          await newBtn.click()
          await page.waitForTimeout(1500)
          chk(
            (await page.locator('[data-testid="quick-create-task-type"]').count()) > 0,
            'the create modal offers a task type',
            'the create modal still has no type control',
          )
          await page.keyboard.press('Escape')
          await page.waitForTimeout(600)
        }
        await page.getByRole('textbox', { name: /search/i }).first().click().catch(() => {})
        await page.waitForTimeout(2500)
        const filterToggle = page.getByRole('button', { name: /filter/i }).first()
        if ((await filterToggle.count()) > 0) await filterToggle.click().catch(() => {})
        await page.waitForTimeout(1000)
        chk(
          (await page.locator('[data-testid="palette-task-type-filter"]').count()) > 0,
          'search offers a Task type filter',
          'no task-type filter in the palette',
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(600)
      }
    }
  })

  await section('§2', 'The search bar she walked through', async () => {
    await go(`/app/${WS}`, 3500)
    await page.getByRole('textbox', { name: /search/i }).first().click().catch(() => {})
    await page.waitForTimeout(2500)

    /*
     * Checked before the Filters toggle is touched, which this section used not
     * to do. She reaches for a type immediately — "main 'Task' par click
     * karoongi na" [01:33] — and the row used to live inside the collapsible
     * panel, so the first thing anyone does cost a click to discover. Clicking
     * Filters first would pass either way and prove nothing.
     */
    chk(
      (await page.locator('[data-testid="palette-type-task"]').count()) > 0,
      'the type chips are on the bar without opening Filters',
      'the type chips are still behind the Filters toggle',
    )

    const filters = page.getByRole('button', { name: /filter/i }).first()
    if ((await filters.count()) > 0) await filters.click().catch(() => {})
    await page.waitForTimeout(1200)
    /*
     * Order matters here, and the first version of this section had it wrong.
     *
     * The ⋯ menu closes by click-away, not by Escape — so an Escape aimed at it
     * reaches the palette dialog behind it and closes the whole thing. These two
     * assertions then ran against an unmounted palette and reported the filters
     * missing from the deployed build. They were there the whole time; the test
     * had shut the door before looking.
     *
     * So: everything that is simply *present* is checked first, and the ⋯ —
     * which changes state — goes last.
     */
    // [02:35] Location, and [04:00] created dates.
    // Location only renders once the workspace's spaces have loaded, so this
    // waits for it rather than sampling once — a slow query is not the same
    // fact as a missing filter, and sampling cannot tell them apart.
    chk(
      await until(async () =>
        (await page.locator('[data-testid="palette-space-filter"]').count()) > 0 ? true : null,
      6000),
      'Location narrows by space',
      'no Location filter',
    )
    chk(
      (await page.locator('[data-testid="palette-created-after"]').count()) > 0,
      'and there is a created-date filter, distinct from due dates',
      'no created-date filter',
    )

    // [02:01] the ⋯, and Folders behind it. Last, because opening it puts a
    // click-away layer over the panel.
    const more = page.locator('[data-testid="palette-more-types"]')
    if ((await more.count()) === 0) {
      bad('no ⋯ for the types that are not on the bar')
    } else {
      await more.click()
      await page.waitForTimeout(700)
      chk(
        (await page.locator('[data-testid="palette-add-type-folder"]').count()) > 0,
        'Folders is offered behind the ⋯ — "mujhe FOLDERS mein search karna hai"',
        'Folders is not offered',
      )
    }

    // The containers are searchable at all — asked of the API directly, since a
    // workspace may genuinely have nothing matching a given word.
    const res = await apiRead(`/search/${WS}?q=a&types=folder,list,space&limit=5`)
    chk(
      res.status === 200,
      `the API accepts the container types (${Array.isArray(res.data) ? res.data.length : 0} hit(s))`,
      `searching folders/lists/spaces answered ${res.status}`,
    )
    /*
     * …and narrowing *to* a folder, the half the frame pass caught.
     *
     * `types=task` is load-bearing, and its absence is why the first version of
     * this failed against a correct server. folderId reaches a task through
     * list → project → folderId, so it constrains the task branch and nothing
     * else; searchExtras still answers with the people, channels, messages and
     * containers whose names contain "a", and it never sees the filter. Five
     * hits was the right answer to the question I actually asked.
     *
     * Scoped to tasks, an impossible folder must match nothing — so a non-empty
     * result here really does mean folderId was ignored.
     */
    const scoped = await apiRead(
      `/search/${WS}?q=a&types=task&folderId=00000000-0000-0000-0000-000000000000&limit=5`,
    )
    chk(
      scoped.status === 200 && Array.isArray(scoped.data) && scoped.data.length === 0,
      'and scopes tasks to a folder — an unknown one matches no task, so the filter applied',
      `answered ${scoped.status} with ${
        Array.isArray(scoped.data) ? scoped.data.length : '?'
      } task hit(s); a task from a folder that does not exist means folderId was ignored`,
    )
    // The control for the line above: same query without the folder does find
    // tasks, so an empty result there is the filter working rather than the
    // workspace simply having no task matching "a".
    const unscoped = await apiRead(`/search/${WS}?q=a&types=task&limit=5`)
    chk(
      unscoped.status === 200 && Array.isArray(unscoped.data) && unscoped.data.length > 0,
      `and there were ${Array.isArray(unscoped.data) ? unscoped.data.length : 0} task(s) to exclude`,
      'no tasks match "a" at all, so the check above proves nothing either way',
    )
  })

  await section('§6b', 'Tools can be pinned from the avatar menu', async () => {
    // §6 [07:48] — "Jab apni profile pe click karti hoon, yahan pe TOOLS hai."
    // The picker existed only in profile settings, two navigations from here.
    await go(`/app/${WS}`, 3500)
    const menu = page.locator('[data-testid="user-menu"]')
    if ((await menu.count()) === 0) {
      bad('no user menu to open')
    } else {
      await menu.click()
      await page.waitForTimeout(900)
      chk(
        (await page.locator('[data-testid="menu-pin-docs"]').count()) > 0,
        'the avatar menu carries a Tools section',
        'pinning is still only in profile settings',
      )
      // Read-only: this is somebody's real top bar. §2.2b already proves a
      // preference toggle round-trips to the server on this instance.
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
    }
  })

  await section('§7b', 'New Workspace opens the stepped flow', async () => {
    await go(`/app/${WS}`, 3500)
    const switcher = page.locator('[data-testid="workspace-switcher"]')
    if ((await switcher.count()) === 0) {
      bad('no workspace switcher')
      return
    }
    await switcher.click()
    await page.waitForTimeout(900)
    const newWs = page.locator('[data-testid="new-workspace"]')
    if ((await newWs.count()) === 0) {
      bad('no New Workspace control')
      return
    }
    await newWs.click()
    await page.waitForTimeout(1200)
    chk(
      (await page.locator('[data-testid="create-workspace-flow"]').count()) > 0,
      'it opens the flow, not a bare name dialog',
      'still a single-field dialog',
    )
    chk(
      (await page.locator('[data-testid="workspace-name"]').count()) > 0,
      'and asks for the name first',
      'no name field in the flow',
    )
    /*
     * Stops here deliberately. Finishing would create a real workspace on a
     * real account, and the steps after this one are covered by the browser
     * suite against a stub. What only the instance can tell us is that the
     * flow opens at all, which is what changed.
     */
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(500)
  })

  await section('§14b', 'Chat replies reach the Replies page', async () => {
    // §14 [16:41] — the page filtered on task and doc comments only, so a chat
    // thread reply was the one thing the replies surface never showed.
    await go(`/app/${WS}/replies`, 4000)
    const body = await seen()
    chk(!/something went wrong/i.test(body), 'the Replies page renders', 'Replies threw')
    const res = await apiRead('/notifications?view=all')
    const kinds = new Set(
      (Array.isArray(res.data) ? res.data : []).map((n) => n?.type).filter(Boolean),
    )
    chk(
      res.status === 200,
      `notifications read back (${kinds.size} kind(s) present)`,
      `notifications answered ${res.status}`,
    )
    // Said plainly rather than asserted: this account may simply have no chat
    // replies yet, and an empty set is not evidence either way.
    ok(
      kinds.has('chat_reply')
        ? 'and a chat_reply is among them'
        : 'no chat_reply on this account yet, so there is nothing to file here',
    )
  })

  await section('§6', 'The tools she pins are offered', async () => {
    await go('/app/profile', 3500)
    // [07:55]–[08:03] — "yeh document ka, yeh Loom ka, yeh voice recordings ka,
    // yeh whiteboards ka, aur yeh dashboard ka option hai."
    for (const tool of ['docs', 'clips', 'recordings', 'whiteboards', 'dashboards']) {
      chk(
        (await page.locator(`[data-testid="topbar-toggle-${tool}"]`).count()) > 0,
        `${tool} can be pinned`,
        `${tool} is not offered, but she names it`,
      )
    }
    // Read-only on purpose: this is somebody's real top bar, and §2.2b already
    // proves a preference toggle round-trips to the server on this instance.
  })

  await section('§7', 'A workspace can be created from the switcher', async () => {
    await go(`/app/${WS}`, 3500)
    const switcher = page.locator('[data-testid="workspace-switcher"]')
    if ((await switcher.count()) === 0) {
      bad('no workspace switcher to open')
    } else {
      await switcher.click()
      await page.waitForTimeout(900)
      chk(
        (await page.locator('[data-testid="new-workspace"]').count()) > 0,
        'New Workspace is offered — "har member kar sakta hai"',
        'no New Workspace control',
      )
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
    }
    // Not checked here: that a guest is refused. This account is an admin and
    // there is no way to become a guest without editing a real member's role.
    // The policy and its guest case are covered by the API's own tests.
  })

  await section('§14', 'Unread is visible without opening the chat', async () => {
    await go(`/app/${WS}/inbox`, 4500)
    const rows = page.locator('[data-testid^="notif-"]')
    const count = await rows.count()
    chk(count > 0, `the Inbox has ${count} row(s) to judge`, 'no notifications to check against')
    if (count > 0) {
      const states = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="notif-"]')].map((el) => ({
          unread: el.getAttribute('data-unread'),
          bg: getComputedStyle(el).backgroundColor,
          border: getComputedStyle(el).borderLeftWidth,
        })),
      )
      const unread = states.filter((r) => r.unread === 'true')
      const read = states.filter((r) => r.unread === 'false')
      chk(unread.length > 0, `${unread.length} unread row(s) are marked as such`, 'nothing is marked unread')
      if (unread.length > 0 && read.length > 0) {
        const differs =
          unread[0].bg !== read[0].bg || unread[0].border !== read[0].border
        chk(differs, 'and unread rows are painted differently from read ones',
          `unread ${JSON.stringify(unread[0])} vs read ${JSON.stringify(read[0])}`)
      } else {
        // Everything on screen is in the same state, so there is nothing to
        // contrast — said out loud rather than passing on a comparison that
        // never happened.
        ok(`only ${unread.length ? 'unread' : 'read'} rows are present, so no contrast to check here`)
      }
    }
  })

  await section('§2.9a', 'A slow route shows shapes, not a blank screen', async () => {
    {
      // Hold one route chunk and look at the screen while it is outstanding. This
      // is the only way to see a waiting state — which is exactly why every
      // previous pass over this deployment missed that they were blank.
      //
      // The worker has to go first. On the deployed site it is registered and
      // serves /assets/ CacheFirst, and a request the worker makes is not
      // intercepted by page.route — the delay below would silently not apply and
      // this would report a blank screen that was never blank.
      await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
        }
        if (typeof caches !== 'undefined') {
          const names = await caches.keys()
          await Promise.all(names.map((n) => caches.delete(n).catch(() => false)))
        }
      }).catch(() => {})
      // The handler outlives the assertions on purpose — it is asleep holding
      // the chunk while the screen is inspected. So it must survive being
      // unrouted mid-sleep: `unroute` does not cancel an in-flight handler, and
      // continuing a route Playwright has already released throws "Route is
      // already handled!" from a promise nobody is awaiting, which kills the
      // whole process. That is exactly what happened on 25 Aug: §2.9a used to
      // be the last section, so the run exited before the timer landed; adding
      // §15 after it gave the rejection time to surface and took out every
      // section that followed.
      let holdingChunk = true
      const slowChunk = async (route) => {
        await new Promise((r) => setTimeout(r, Number(process.env.CHUNK_HOLD_MS ?? 4000)))
        if (!holdingChunk) return
        await route.continue().catch(() => {})
      }
      await page.route('**/assets/*docs.lazy-*', slowChunk)
      await go(`/app/${WS}/inbox`, 3500)
      const docsLink = page.locator(`a[href$="/${WS}/docs"]`).first()
      if ((await docsLink.count()) === 0) {
        bad('no Docs link to navigate to')
      } else {
        await docsLink.click()
        await page.waitForTimeout(1200)
        const shapes = await page.locator('.animate-shimmer').count()
        const busy = await page.locator('[aria-busy="true"]').count()
        chk(shapes >= 4, `the wait is drawn as shapes (${shapes})`, 'the content area was blank')
        chk(busy > 0, 'and announced to assistive tech', 'nothing marked aria-busy')
      }
      holdingChunk = false
      await page.unroute('**/assets/*docs.lazy-*', slowChunk).catch(() => {})
    }
  })

  await section('§15', 'Skills exist, and a skill is more than a row', async () => {
    // [17:38] "yeh ek ClickUp ka NEW FEATURE hai"; [19:12] a SKILL, not a
    // feature. Before this branch there was no `skill` anywhere in the app.
    await go(`/app/${WS}/skills`, 4000)
    chk(
      (await page.locator('[data-testid="skills-page"]').count()) > 0,
      'the Skills hub renders at /skills',
      'no Skills hub — the route did not resolve',
    )
    chk(
      (await page.locator('[data-testid="new-skill"]').count()) > 0,
      'her "+ New Skill" is the primary action',
      'no New Skill button',
    )
    // Her carousel, from frame 285_1743. Served from the server's catalogue,
    // so this is also a check that the templates endpoint answered.
    for (const archetype of ['delegate_like_me', 'brand_voice', 'triage_like_me']) {
      chk(
        (await page.locator(`[data-testid="skill-starter-${archetype}"]`).count()) > 0,
        `the ${archetype} starter card is offered`,
        `${archetype} is missing from the carousel`,
      )
    }
    for (const tab of ['all', 'enabled', 'mine']) {
      chk(
        (await page.locator(`[data-testid="skills-tab-${tab}"]`).count()) > 0,
        `the ${tab} tab is present`,
        `the ${tab} tab is missing`,
      )
    }
  })

  await section('§15b', 'A skill keeps what it is told, and what it may reach', async () => {
    // The full round trip against the real server, because three of this
    // branch's genuine bugs only ever showed up here.
    const created = await apiPost(`/workspaces/${WS}/skills`, {
      name: `verify-ui skill ${Date.now()}`,
      description: 'created by verify-ui',
      archetype: 'brand_voice',
    })
    if (!created?.id) {
      bad('could not create a skill through the API')
      return
    }

    // The template seeded the playbook — otherwise "create from Brand Voice"
    // creates an empty skill and the card was decoration.
    chk(
      typeof created.instructions === 'string' && created.instructions.includes('our voice'),
      'creating from a template seeds its playbook',
      `the skill came back with no seeded instructions (${JSON.stringify(created.instructions)?.slice(0, 60)})`,
    )
    chk(created.visibility === 'private', 'a new skill is private until published', `new skill was ${created.visibility}`)

    // [18:42] MEMORY.
    const memory = await apiPost(`/workspaces/${WS}/skills/${created.id}/memories`, {
      content: 'verify-ui: the audience is technical founders',
      source: 'manual',
    })
    chk(!!memory?.id, 'a skill remembers what it is told', 'the memory was not stored')
    const memories = (await apiGet(`/workspaces/${WS}/skills/${created.id}/memories`)) ?? []
    chk(
      memories.some((m) => m.content?.includes('technical founders')),
      'and reads it back',
      'the memory did not come back from the list',
    )

    // [18:58] CONNECTIONS — a provider the workspace has not granted is a
    // real state ("waiting on an admin"), not an error.
    const binding = await apiPost(`/workspaces/${WS}/skills/${created.id}/connections`, {
      provider: 'github',
    })
    chk(!!binding?.id, 'a skill can name a system it may draw on', 'the connection was refused')
    const bindings = (await apiGet(`/workspaces/${WS}/skills/${created.id}/connections`)) ?? []
    const github = bindings.find((b) => b.provider === 'github')
    chk(!!github, 'and the binding is listed', 'the binding did not come back')
    chk(
      github ? !('accessToken' in github) && !('refreshToken' in github) : false,
      'without carrying a credential of its own',
      'a token leaked into the skill connection payload',
    )

    // §15 — "browse, install, and manage". Enabled is the set THIS person
    // installed, so writing a skill opts you into it and removing it empties
    // the tab without touching the library.
    const enabledNow = (await apiGet(`/workspaces/${WS}/skills?tab=enabled`)) ?? []
    chk(
      enabledNow.some((s) => s.id === created.id),
      'creating a skill puts it in your Enabled tab',
      'the author was not opted into their own skill',
    )
    await fetch(`${API}/workspaces/${WS}/skills/${created.id}/install`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    const afterRemove = (await apiGet(`/workspaces/${WS}/skills?tab=enabled`)) ?? []
    chk(
      !afterRemove.some((s) => s.id === created.id),
      'removing it takes it off your list',
      'an uninstalled skill is still listed as enabled',
    )
    const stillThere = (await apiGet(`/workspaces/${WS}/skills?tab=all`)) ?? []
    chk(
      stillThere.some((s) => s.id === created.id),
      'but leaves it in the library',
      'uninstalling deleted the skill itself',
    )
    await apiPost(`/workspaces/${WS}/skills/${created.id}/install`, {})

    // A disabled skill cannot be invoked — that is the AUTHOR's switch, and a
    // different thing from whether you installed it.
    await fetch(`${API}/workspaces/${WS}/skills/${created.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }).catch(() => null)
    const refused = await fetch(`${API}/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
        workspaceId: WS,
        skillId: created.id,
      }),
    }).then((r) => r.status).catch(() => 0)
    // 503 means this instance has no ANTHROPIC_API_KEY, which is a legitimate
    // answer and not a failure of the skill gate — say which happened rather
    // than passing on a technicality.
    if (refused === 503) {
      ok('AI is not configured on this instance, so the chat gate could not be exercised')
    } else {
      chk(
        refused >= 400 && refused < 500,
        `a disabled skill is refused rather than silently answered as the generic assistant (${refused})`,
        `a disabled skill was accepted by /ai/chat (${refused})`,
      )
    }

    // The detail page renders all three sections for a real skill.
    await go(`/app/${WS}/skills/${created.id}`, 4000)
    for (const part of ['skill-detail', 'skill-memory', 'skill-connections']) {
      chk(
        (await page.locator(`[data-testid="${part}"]`).count()) > 0,
        `${part} renders`,
        `${part} is missing from the skill page`,
      )
    }
    chk(
      (await page.locator('[data-testid="skill-memory-list"]').count()) > 0,
      'the memory it was told is on the page',
      'the memory section rendered empty despite a stored memory',
    )

    // Put the instance back the way it was found.
    await fetch(`${API}/workspaces/${WS}/skills/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    const gone = await apiRead(`/workspaces/${WS}/skills/${created.id}`)
    chk(gone.status === 404, 'and the check cleans up after itself', `the skill survived deletion (${gone.status})`)
  })

  await section('§15c', 'A skill can be drafted for you, and nothing is written until you say so', async () => {
    // [18:17]-[18:42] "main is ko sab cheezein batati jaoongi… phir woh meri
    // poori ki poori SKILL create karega". The starter cards are her EXAMPLES
    // [18:03]; this is the mechanism.
    await go(`/app/${WS}/skills`, 4000)
    const before = ((await apiGet(`/workspaces/${WS}/skills?tab=all`)) ?? []).length

    const build = page.locator('[data-testid="build-with-ai"]')
    chk((await build.count()) > 0, 'the hub offers to build one for you', 'no way to ask the AI for a skill')
    if ((await build.count()) > 0) {
      await build.click()
      await page.waitForTimeout(700)
      chk(
        (await page.locator('[data-testid="skill-author"]').count()) > 0,
        'the authoring panel opens beside the hub',
        'the authoring panel did not open',
      )
      chk(
        (await page.locator('[data-testid="skill-followup"]').count()) >= 3,
        'with openers to click instead of typing',
        'no openers offered',
      )
      // The hub must stay visible — frame t1122 reflows rather than covering.
      chk(
        (await page.locator('[data-testid="skills-page"]').isVisible().catch(() => false)),
        'and the hub is still on screen beside it',
        'the panel covered the hub instead of reflowing',
      )
    }

    // The proposal itself, through the real endpoint: steps first, then a draft.
    const sse = await fetch(`${API}/ai/skills/propose`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WS, request: 'create a personal task organizer skill' }),
    }).catch(() => null)
    if (!sse || !sse.ok) {
      // 402/403 means the plan gate refused AI on this workspace — a legitimate
      // answer, and not the same thing as the drafting being broken.
      chk(
        !!sse && [402, 403, 503].includes(sse.status),
        `AI drafting is gated on this instance (${sse?.status}), so the draft could not be exercised`,
        `the propose endpoint failed with ${sse?.status}`,
      )
    } else {
      const body = await sse.text().catch(() => '')
      const events = body
        .split('\n')
        .filter((l) => l.startsWith('data: ') && l.slice(6) !== '[DONE]')
        .map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
        .filter(Boolean)
      const steps = events.filter((e) => e.step)
      const draft = events.find((e) => e.proposal)
      chk(steps.length >= 3, `it says what it read first (${steps.length} step(s))`, 'no steps were streamed before the answer')
      chk(
        steps.findIndex((e) => e.step) < events.findIndex((e) => e.proposal),
        'and the steps arrive before the conclusion, not after it',
        'the steps were sent after the proposal, which defeats the point',
      )
      chk(!!draft?.proposal?.name && !!draft?.proposal?.instructions, 'a whole skill comes back', 'the draft was missing a name or instructions')
      chk(
        typeof draft?.message === 'string' &&
          draft.message.includes("Approve this approach and I'll create it"),
        'ending on her question rather than a fait accompli',
        'the approval gate is missing from the rendered proposal',
      )
      const after = ((await apiGet(`/workspaces/${WS}/skills?tab=all`)) ?? []).length
      chk(after === before, 'and NOTHING was written by asking', `asking created ${after - before} skill(s)`)

      // Now approve it, which is the only thing that writes.
      const created = await apiPost(`/workspaces/${WS}/skills/from-proposal`, {
        name: `${draft.proposal.name} ${Date.now()}`,
        description: draft.proposal.description,
        instructions: draft.proposal.instructions,
        memories: draft.proposal.memories ?? [],
      })
      chk(!!created?.id, 'approving it does', 'approving the draft did not create a skill')
      if (created?.id) {
        chk(
          created.memoriesCreated === (draft.proposal.memories ?? []).length,
          'with the memory it was approved with',
          `expected ${(draft.proposal.memories ?? []).length} memories, got ${created.memoriesCreated}`,
        )
        await fetch(`${API}/workspaces/${WS}/skills/${created.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)
      }
    }
  })

  await section('§15d', 'The two functional starter cards do something', async () => {
    // Frame `285_1743`: "Skills Miner / Turn repeat work into skills → Find my
    // Skills" and "For your team / Discover team skills → Scan my workspace".
    // Both rendered and did nothing until now.
    await go(`/app/${WS}/skills`, 4000)
    chk(
      (await page.locator('[data-testid="skill-starter-miner"]').count()) > 0,
      'the Skills Miner card is on the carousel',
      'no Skills Miner card',
    )
    chk(
      (await page.locator('[data-testid="skill-starter-team"]').count()) > 0,
      'so is the team-discovery card',
      'no team-discovery card',
    )

    const team = page.locator('[data-testid="skill-starter-team"] button')
    if ((await team.count()) > 0) {
      await team.click()
      await page.waitForTimeout(900)
      chk(
        (await page.locator('[data-testid="skill-discovery-team"]').count()) > 0,
        '"Scan my workspace" opens the discovery panel',
        'the team card did nothing',
      )
      // Either a list or an honest empty state — never a blank panel.
      const listed = await page.locator('[data-testid="skill-discover-list"]').count()
      const empty = await page.locator('[data-testid="skill-discover-empty"]').count()
      chk(listed + empty > 0, `it answers (${listed ? 'a list' : 'nothing to pick up'})`, 'the panel rendered blank')
      await page.locator('[data-testid="skill-discovery-close"]').click().catch(() => {})
      await page.waitForTimeout(400)
    }

    const miner = page.locator('[data-testid="skill-starter-miner"] button')
    if ((await miner.count()) > 0) {
      await miner.click()
      await page.waitForTimeout(900)
      chk(
        (await page.locator('[data-testid="skill-discovery-mine"]').count()) > 0,
        '"Find my Skills" opens the miner',
        'the miner card did nothing',
      )
      chk(
        (await page.locator('[data-testid="skill-miner-run"]').count()) > 0,
        'and offers to scan',
        'no scan control',
      )
    }

    // The scan itself, through the real endpoint. Nothing must be written by
    // looking — that is the same rule as the drafter and worth its own check.
    const before = ((await apiGet(`/workspaces/${WS}/skills?tab=all`)) ?? []).length
    const res = await fetch(`${API}/ai/skills/mine`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WS }),
    }).catch(() => null)
    if (!res || !res.ok) {
      chk(
        !!res && [402, 403, 503].includes(res.status),
        `mining is gated on this instance (${res?.status})`,
        `the mine endpoint failed with ${res?.status}`,
      )
    } else {
      const body = await res.text().catch(() => '')
      const events = body
        .split('\n')
        .filter((l) => l.startsWith('data: ') && l.slice(6) !== '[DONE]')
        .map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
        .filter(Boolean)
      const steps = events.filter((e) => e.step)
      const result = events.find((e) => Array.isArray(e.skills))
      chk(steps.length >= 3, `it says what it read (${steps.length} scan(s))`, 'the miner reported no scans')
      chk(!!result, 'and comes back with an answer', 'the miner never returned a result')
      // Every suggestion must carry the lines that produced it: the card's
      // claim is that it read your work, and evidence is what backs that.
      const unevidenced = (result?.skills ?? []).filter((s) => !(s.evidence?.length > 0))
      chk(unevidenced.length === 0, 'every suggestion carries its evidence', `${unevidenced.length} suggestion(s) had none`)
      // An empty result must SAY it read something, or "nothing found" and
      // "the button is broken" look identical.
      if ((result?.skills ?? []).length === 0) {
        chk(
          typeof result?.message === 'string' && result.message.length > 20,
          'and an empty scan explains itself rather than going quiet',
          'the miner found nothing and said nothing',
        )
      }
      const after = ((await apiGet(`/workspaces/${WS}/skills?tab=all`)) ?? []).length
      chk(after === before, 'and scanning wrote nothing', `the scan created ${after - before} skill(s)`)
    }
  })

  await section('§15e', 'An AI chat outlives the panel, and names itself', async () => {
    // Frames 296_1817 → 297_1820 → 304_1907. Before this, the panel held its
    // messages in React state: closing it discarded the conversation.
    const thread = await apiPost(`/workspaces/${WS}/ai-chats`, {})
    if (!thread?.id) {
      bad('could not start an AI chat')
      return
    }
    chk(thread.title === 'New Chat', 'a new chat starts as "New Chat"', `started as "${thread.title}"`)

    await apiPost(`/workspaces/${WS}/ai-chats/${thread.id}/messages`, {
      role: 'user',
      content: 'Help me create a skill',
    })
    const midway = await apiGet(`/workspaces/${WS}/ai-chats/${thread.id}`)
    chk(
      midway?.title === 'New Chat',
      'and stays that way until there is an exchange to name',
      `renamed from a single message: "${midway?.title}"`,
    )

    const second = await apiPost(`/workspaces/${WS}/ai-chats/${thread.id}/messages`, {
      role: 'assistant',
      content: 'Skills are reusable playbooks that teach the assistant how you work.',
    })
    const named = await apiGet(`/workspaces/${WS}/ai-chats/${thread.id}`)
    chk(
      named?.title && named.title !== 'New Chat',
      `then names itself — "${named?.title}"`,
      'the chat never got a name',
    )
    void second

    // The thing the frames are actually about: it is still there afterwards.
    const listed = (await apiGet(`/workspaces/${WS}/ai-chats`)) ?? []
    const row = listed.find((x) => x.id === thread.id)
    chk(!!row, 'and is listed in the sidebar', 'the chat was not listed')
    chk(row?.messageCount === 2, 'with its message count', `count was ${row?.messageCount}`)
    chk((named?.messages ?? []).length === 2, 'and reopens with the conversation intact', `got ${(named?.messages ?? []).length} message(s)`)

    // A name someone chose is never replaced.
    await fetch(`${API}/workspaces/${WS}/ai-chats/${thread.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My planning notes' }),
    }).catch(() => null)
    await apiPost(`/workspaces/${WS}/ai-chats/${thread.id}/messages`, { role: 'user', content: 'something else' })
    await apiPost(`/workspaces/${WS}/ai-chats/${thread.id}/messages`, { role: 'assistant', content: 'noted' })
    const afterRename = await apiGet(`/workspaces/${WS}/ai-chats/${thread.id}`)
    chk(
      afterRename?.title === 'My planning notes',
      'a name you chose survives what is said after it',
      `your title was replaced with "${afterRename?.title}"`,
    )

    // It shows up in the sidebar for real, not just in the API.
    await go(`/app/${WS}`, 4000)
    const section = page.locator('[data-testid="ai-chats-section"]')
    chk(
      (await section.count()) > 0,
      'the sidebar carries an AI Chats section',
      'no AI Chats section in the sidebar',
    )
    if ((await section.count()) > 0) {
      chk(
        (await page.locator(`[data-testid="ai-chat-${thread.id}"]`).count()) > 0,
        'and the chat is in it',
        'the chat was not listed in the sidebar',
      )
    }

    await fetch(`${API}/workspaces/${WS}/ai-chats/${thread.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    const gone = await apiRead(`/workspaces/${WS}/ai-chats/${thread.id}`)
    chk(gone.status === 404, 'and the check cleans up after itself', `the chat survived deletion (${gone.status})`)
  })

  await section('§2.8', 'Meetings have a page — "yahan pe aap ko show hongi meetings"', async () => {
    // [19:16]. The whole meetings API already existed — list, get, attendees,
    // action items — with no page and no route: an endpoint with no button.
    await go(`/app/${WS}/meetings`, 4000)
    chk(
      (await page.locator('[data-testid="meetings-page"]').count()) > 0,
      'the Meetings hub renders at /meetings',
      'no Meetings hub — the route did not resolve',
    )
    chk(
      (await page.locator('[data-testid="meetings-upcoming"]').count()) > 0,
      'with an Upcoming Meetings block',
      'no Upcoming Meetings block',
    )
    // Either meetings, or the Connect Calendar door — never a blank space.
    const upcomingRows = await page.locator('[data-testid^="meeting-upcoming-"]').count()
    const connect = await page.locator('[data-testid="meetings-connect-calendar"]').count()
    chk(
      upcomingRows + connect > 0,
      upcomingRows ? `${upcomingRows} upcoming` : 'and a Connect Calendar prompt when there are none',
      'the upcoming block rendered blank',
    )

    chk(
      (await page.locator('[data-testid="meetings-ask"]').count()) > 0,
      'the meetings ask-box is on the page',
      'no ask-box',
    )
    chk(
      (await page.locator('[data-testid="meetings-ask-starters"] button').count()) >= 4,
      'with her four starter prompts',
      'fewer than four starter prompts',
    )
    chk(
      (await page.locator('[data-testid="meetings-search"]').count()) > 0 &&
        (await page.locator('[data-testid="meetings-mine"]').count()) > 0,
      'and the notes list has My notes and Search',
      'the notes toolbar is missing controls',
    )

    // A list, or an honest empty state saying where meetings come from.
    const rows = await page.locator('[data-testid^="meeting-"]').count()
    const empty = await page.locator('[data-testid="meetings-empty"]').count()
    chk(rows + empty > 0, rows ? `${rows} meeting row(s)` : 'and says so when there are none', 'the notes list rendered blank')

    // The sidebar entry, which is how anyone would find this.
    await go(`/app/${WS}`, 3500)
    chk(
      (await page.locator('a[href$="/meetings"]').count()) > 0,
      'and the sidebar has a Meetings entry',
      'Meetings is not reachable from the sidebar',
    )

    // The ask endpoint answers, and says whether it read anything.
    const asked = await apiPost(`/workspaces/${WS}/meetings/ask`, { question: 'Summarize my recent meetings' })
    if (asked) {
      chk(typeof asked.answer === 'string' && asked.answer.length > 0, 'asking about meetings answers', 'the ask returned nothing')
      chk(
        typeof asked.grounded === 'boolean',
        `and says whether it read any records (grounded: ${asked.grounded})`,
        'the answer does not say whether it was grounded',
      )
    } else {
      ok('the meetings ask is gated on this instance, so it could not be exercised')
    }
  })

  await section('§2.8b', 'A SyncUp can be started, and leaves a record', async () => {
    // [19:40] "Start SyncUp — Jump on a voice call". The media is peer-to-peer,
    // so a single browser cannot exercise the connection itself; what IS
    // checkable here is the lifecycle everyone shares — who is in, whether it
    // is being recorded, and what it leaves behind.
    const channels = (await apiGet(`/workspaces/${WS}/chat/channels`)) ?? []
    const channel = channels.find((c) => !c.isDm)
    if (!channel) {
      ok('no non-DM channel on this account, so a call could not be started here')
    } else {
      await go(`/app/${WS}/chat?channel=${channel.id}`, 4500)
      const control = page.locator('[data-testid="call-start-button"], [data-testid="call-join-button"]')
      chk((await control.count()) > 0, 'the channel header offers SyncUp', 'no call control in the channel header')

      const call = await apiPost(`/workspaces/${WS}/calls`, { channelId: channel.id })
      if (!call?.id) {
        bad('could not start a call through the API')
      } else {
        chk(call.endedAt === null, 'a started call is live', `the call came back ended`)
        chk(
          (call.participants ?? []).some((p) => !p.leftAt),
          'with whoever started it already in it',
          'the starter was not a participant',
        )
        // Recording is OFF until somebody turns it on, and turning it on is
        // what the consent gate is in front of.
        chk(call.recording === false, 'and not recording', 'a new call started out recording')

        // Pressing start again in the same channel must JOIN, not fork.
        const second = await apiPost(`/workspaces/${WS}/calls`, { channelId: channel.id })
        chk(
          second?.id === call.id,
          'starting again in the same channel joins the one running',
          `a second call was created (${second?.id})`,
        )

        const live = await apiGet(`/workspaces/${WS}/calls/live?channelId=${channel.id}`)
        chk(live?.id === call.id, 'and the channel reports it as live', 'the live lookup did not find it')

        // Recording marks everyone present, so "was I recorded" has an answer.
        const rec = await apiPost(`/workspaces/${WS}/calls/${call.id}/recording`, { recording: true })
        if (rec) {
          const recording = await apiGet(`/workspaces/${WS}/calls/live?channelId=${channel.id}`)
          chk(recording?.recording === true, 'recording can be turned on', 'recording did not turn on')
          chk(
            (recording?.participants ?? []).every((p) => p.leftAt || p.wasRecorded),
            'and marks everyone who was in the room',
            'somebody in the call was not marked as recorded',
          )
          await apiPost(`/workspaces/${WS}/calls/${call.id}/recording`, { recording: false })
        }

        // Ending leaves a meeting record — the thing that makes a call
        // findable next week rather than gone the moment it stops.
        const ended = await apiPost(`/workspaces/${WS}/calls/${call.id}/end`, {})
        chk(!!ended?.meetingId, 'ending it leaves a meeting record behind', 'the call left no record')
        const afterEnd = await apiGet(`/workspaces/${WS}/calls/live?channelId=${channel.id}`)
        chk(!afterEnd, 'and the channel stops offering a dead call', 'the ended call is still reported live')

        if (ended?.meetingId) {
          const meetings = (await apiGet(`/workspaces/${WS}/meetings`)) ?? []
          chk(
            meetings.some((m) => m.id === ended.meetingId),
            'which shows up on the Meetings page',
            'the record was not on the meetings list',
          )
          await fetch(`${API}/workspaces/${WS}/meetings/${ended.meetingId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null)
        }
      }
    }
  })

  await section('§2.8e', 'A call announces itself to the channel', async () => {
    // [19:25] "aap ko notification aa raha hoga ke CALL ka option aaya… aap
    // chaho to wahan se direct call join ho jaoge". A call nobody is told
    // about is a call nobody joins.
    const channels = (await apiGet(`/workspaces/${WS}/chat/channels`)) ?? []
    const channel = channels.find((c) => !c.isDm)
    if (!channel) {
      ok('no non-DM channel on this account, so a call could not be announced')
    } else {
      const call = await apiPost(`/workspaces/${WS}/calls`, { channelId: channel.id })
      if (!call?.id) {
        bad('could not start a call through the API')
      } else {
        // The card. Polled, because the announcement is deliberately
        // best-effort and runs after the call row is returned.
        const card = await until(async () => {
          const msgs = (await apiGet(`/chat/channels/${channel.id}/messages?limit=50`)) ?? []
          return msgs.find((m) => m.callId === call.id) ?? null
        }, 8000)
        chk(!!card, 'starting a call posts a card into the channel', 'no call card appeared')

        if (card) {
          chk(
            !!card.call && card.call.id === call.id,
            'the card carries the call’s live state',
            'the card has no call state, so it cannot say which of the three things it is',
          )
          chk(
            card.call?.youArePresent === true,
            'and knows the reader is in it',
            'the card does not know the reader is in the call',
          )
          chk(
            typeof card.body === 'string' && card.body.length > 0,
            'with readable words for clients that do not draw cards',
            'the card message has an empty body',
          )

          // After it ends, the same card must say so — the state is live, not
          // frozen at the moment it was posted.
          await apiPost(`/workspaces/${WS}/calls/${call.id}/end`, {})
          const ended = await until(async () => {
            const msgs = (await apiGet(`/chat/channels/${channel.id}/messages?limit=50`)) ?? []
            const again = msgs.find((m) => m.id === card.id)
            return again?.call?.endedAt ? again : null
          }, 8000)
          chk(
            !!ended,
            'and the same card reports the call as ended afterwards',
            'the card still shows a live call after it ended — its Join button would drop people into a closed room',
          )
          chk(
            (ended?.call?.joinedCount ?? 0) >= 1,
            `saying how many joined (${ended?.call?.joinedCount ?? 0})`,
            'the ended card lost the headcount',
          )
        } else {
          await apiPost(`/workspaces/${WS}/calls/${call.id}/end`, {})
        }
      }
    }
  })

  await section('§2.8c', 'The emoji picker is the whole library, searchable', async () => {
    // [20:22] "poori ki poori emoji icons ki list". Rundesk's picker was twelve
    // hard-coded emoji. The list itself loads as its own chunk on first open,
    // so this also proves that chunk actually arrives on the deployed build —
    // a dynamic import that 404s looks exactly like an empty picker.
    const channels = (await apiGet(`/workspaces/${WS}/chat/channels`)) ?? []
    const channel = channels[0]
    if (!channel) {
      ok('no channel on this account, so the composer could not be opened')
    } else {
      await go(`/app/${WS}/chat?channel=${channel.id}`, 4500)
      // The composer's emoji button is the one whose popover carries the picker.
      await page.locator('button[title*="moji" i]').first().click({ timeout: 5000 }).catch(() => {})
      const picker = page.locator('[data-testid="emoji-picker"]')
      const opened = await picker.count()
      chk(opened > 0, 'the composer opens an emoji picker', 'the emoji button opened nothing')

      if (opened > 0) {
        chk(
          (await page.locator('[data-testid="emoji-search"]').count()) > 0,
          'with a Search field',
          'the picker has no search field',
        )
        chk(
          (await page.locator('[data-testid="emoji-tone"]').count()) > 0,
          'a skin-tone control',
          'no skin-tone control',
        )
        chk(
          (await page.locator('[data-testid="emoji-add-custom"]').count()) > 0,
          'and a + for a custom one',
          'no + to add a custom emoji',
        )
        const tabs = await page.locator('[data-testid="emoji-tabs"] button').count()
        chk(tabs >= 9, `a category strip of ${tabs}`, `only ${tabs} category tabs`)
        chk(
          (await page.locator('[data-testid="emoji-section-frequent"]').count()) > 0,
          'Frequently Used at the top',
          'no Frequently Used section',
        )

        // The list arrived. Twelve was the old picker; the People section alone
        // is in the hundreds.
        await page.waitForSelector('[data-testid="emoji-section-people"] button', { timeout: 8000 }).catch(() => {})
        const people = await page.locator('[data-testid="emoji-section-people"] button').count()
        chk(people > 300, `and ${people} emoji under Smiles & People`, `only ${people} — the emoji chunk did not load`)

        // Search, on the deployed build, over the real list.
        await page.fill('[data-testid="emoji-search"]', 'tada')
        await page.waitForTimeout(250)
        const hit = await page.locator('[data-testid="emoji-scroll"] button[data-emoji]').first().textContent().catch(() => '')
        chk(
          (hit ?? '').includes('🎉'),
          'searching "tada" finds 🎉 — a word Unicode never uses',
          `searching "tada" gave ${hit || 'nothing'}`,
        )

        await page.fill('[data-testid="emoji-search"]', 'zzzqqq')
        await page.waitForTimeout(250)
        chk(
          (await page.locator('[data-testid="emoji-no-results"]').count()) > 0,
          'and says so when nothing matches',
          'a search with no matches showed no message',
        )
        await page.keyboard.press('Escape').catch(() => {})
      }
    }
  })

  await section('§2.8f', 'AI Notes: what is said is kept, and only while it is announced', async () => {
    // [20:42] "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega
    // aur poori ki poori RECORDING bhi karega — poori call hi ki."
    //
    // The consent rule is the one that matters and cannot be checked by
    // looking: nothing may be transcribed while the recording banner is down.
    const channels = (await apiGet(`/workspaces/${WS}/chat/channels`)) ?? []
    const channel = channels.find((c) => !c.isDm)
    if (!channel) {
      ok('no non-DM channel on this account, so a recorded call could not be run')
    } else {
      const call = await apiPost(`/workspaces/${WS}/calls`, { channelId: channel.id })
      if (!call?.id) {
        bad('could not start a call through the API')
      } else {
        const post = (path, body) =>
          fetch(`${API}${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
          })
            .then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.data }))
            .catch(() => ({ status: 0, data: null }))

        // Recording is OFF. Nothing may be kept.
        const refused = await post(`/workspaces/${WS}/calls/${call.id}/transcript`, {
          text: 'this must not be stored',
        })
        chk(
          refused.data?.ok === false && refused.data?.reason === 'not_recording',
          'a line sent while recording is off is refused',
          `it was accepted: ${JSON.stringify(refused.data)}`,
        )

        // Turn it on — which announces itself — and now it is kept.
        await apiPost(`/workspaces/${WS}/calls/${call.id}/recording`, { recording: true })
        const kept = await post(`/workspaces/${WS}/calls/${call.id}/transcript`, {
          text: 'we should ship the meetings page on Friday',
        })
        chk(kept.data?.ok === true, 'and kept once the banner is up', `it was refused: ${JSON.stringify(kept.data)}`)

        const read = await apiGet(`/workspaces/${WS}/calls/${call.id}/transcript`)
        chk(
          typeof read?.transcript === 'string' && read.transcript.includes('ship the meetings page'),
          'the transcript reads back',
          'the line was accepted but is not in the transcript',
        )
        chk(
          /^[^:\n]+: /.test(read?.transcript ?? ''),
          'attributed to whoever said it',
          `the transcript has no speaker: ${JSON.stringify((read?.transcript ?? '').slice(0, 80))}`,
        )

        // The recording's upload URL is handed out, and the media never comes
        // through the API on its way to storage.
        const upload = await post(`/workspaces/${WS}/calls/${call.id}/recording/upload-url`, {
          contentType: 'audio/webm',
        })
        if (upload.status === 200) {
          chk(
            typeof upload.data?.uploadUrl === 'string' && upload.data.uploadUrl.startsWith('http'),
            'a pre-signed upload URL is issued for the recording',
            'no upload URL came back',
          )
          chk(
            String(upload.data?.storageKey ?? '').startsWith(`calls/${WS}/${call.id}/`),
            'under a key scoped to this call',
            `the key is not scoped to the call: ${upload.data?.storageKey}`,
          )
          const foreign = await post(`/workspaces/${WS}/calls/${call.id}/recording/attach`, {
            storageKey: `calls/${WS}/00000000-0000-0000-0000-000000000000/rec.webm`,
          })
          chk(
            foreign.status === 400,
            'and a key from another call is refused',
            `attaching a foreign recording came back ${foreign.status}`,
          )
        } else {
          ok('R2 storage is not configured on this instance, so the upload URL could not be issued')
        }

        // Ending writes the record: transcript, and notes if a model is here.
        const ended = await apiPost(`/workspaces/${WS}/calls/${call.id}/end`, {})
        chk(!!ended?.meetingId, 'ending the call leaves a meeting record', 'the call left no record')
        if (ended?.meetingId) {
          const meeting = await apiGet(`/workspaces/${WS}/meetings/${ended.meetingId}`)
          chk(
            typeof meeting?.transcript === 'string' && meeting.transcript.includes('ship the meetings page'),
            'carrying the transcript',
            'the meeting record lost the transcript',
          )
          if (meeting?.notes) {
            chk(meeting.notes.length > 0, 'and notes written from it', 'the notes are empty')
          } else {
            ok('no model configured on this instance, so the notes were not written (the record still stands)')
          }
          await fetch(`${API}/workspaces/${WS}/meetings/${ended.meetingId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null)
        }
      }
    }
  })

  await section('§2.8d', 'A switched-off feature explains itself', async () => {
    // [20:45] recording "back end se on karna parta hai". The gap was that a
    // gated feature did not render at all — no modal, no reason, nothing to
    // press. "Contact your admin" is now a request that lands somewhere.
    const post = (path, body) =>
      fetch(`${API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
        .then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.data }))
        .catch(() => ({ status: 0, data: null }))

    const bogus = await post('/feature-flags/request/not.a.real.flag', { workspaceId: WS })
    chk(
      bogus.status === 400,
      'asking for a feature that does not exist is refused',
      `an unknown flag came back ${bogus.status}`,
    )

    const asked = await post('/feature-flags/request/ai.meeting_notes', { workspaceId: WS })
    chk(asked.status === 200, 'the request endpoint answers', `it came back ${asked.status}`)
    const status = asked.data?.status
    chk(
      ['sent', 'already_enabled', 'already_asked', 'no_admins'].includes(status),
      `and says what happened (${status})`,
      `it did not say what happened: ${JSON.stringify(asked.data)}`,
    )

    // The two outcomes that matter are told apart. On an instance where the
    // flag is on there is nothing to ask for, and saying "we told your admins"
    // would send somebody waiting for an answer that is never coming.
    if (status === 'already_enabled') {
      chk(asked.data?.notified === 0, 'and asks nobody for something already on', 'it notified admins anyway')
    } else if (status === 'sent') {
      chk(
        typeof asked.data?.notified === 'number',
        `and counts who was actually told (${asked.data?.notified})`,
        'a send with no count',
      )
      // Pressing twice is one request, not two.
      const again = await post('/feature-flags/request/ai.meeting_notes', { workspaceId: WS })
      chk(
        again.data?.status === 'already_asked',
        'and a second press the same day sends nothing more',
        `a repeat press came back ${again.data?.status}`,
      )
    } else {
      ok(`nothing to ask for on this instance (${status})`)
    }
  })

  await section('HEALTH', 'Nothing is actually broken', async () => {
    if (noted.length) {
      console.log(`  \x1b[2mnote\x1b[0m ${noted.length} request(s) not counted — other hosts, dev-only sockets,`)
      console.log('  \x1b[2m     and API calls that answered 4xx (a probe getting a legitimate no).\x1b[0m')
      for (const n of noted.slice(0, 3)) console.log(`  \x1b[2m     ${n}\x1b[0m`)
    }
    chk(broken.length === 0,
      'no uncaught exceptions, no asset failed to load, no 5xx',
      `${broken.length}: ${broken.slice(0, 4).join(' | ')}`)
  })
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
