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
  await page.waitForURL(/\/app\//, { timeout: 30000 })
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
      await page.route('**/assets/*docs.lazy-*', async (route) => {
        await new Promise((r) => setTimeout(r, 4000))
        return route.continue()
      })
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
      await page.unroute('**/assets/*docs.lazy-*')
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
