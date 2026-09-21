/**
 * A page you can reach must be a page you can leave.
 *
 * /app/profile and /app/help live inside the /app shell but outside the
 * workspace tree, so they have no $workspaceId param. The sidebar builds its
 * entire nav from that id and rendered nothing without it: no Home, no Inbox,
 * no My Tasks. Neither page has a back link of its own — app-help-page.tsx is
 * 470 lines with zero Link and zero useNavigate. The Inbox settings gear links
 * straight to /app/profile?tab=notifications, so asking "why am I getting this
 * notification?" cost you your place in the app, and the browser Back button
 * was the only way out.
 *
 * The escape that did exist was the workspace switcher, which lists the auth
 * store's workspaces — seeded at sign-in. This file pins that too: the second
 * context signs in with a session whose `workspaces` array does NOT contain
 * the workspace being visited, which is the state a real account was observed
 * in (the sidebar header read "Select workspace" while inside a named
 * workspace, and the switcher could not offer it either). Under that session
 * there was no way out at all.
 *
 *   node test/e2e/no-dead-ends.mjs [--dist <dir>]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

/*
 * "0 failed" is not "it ran". Compared with `!==` and never `<`: with `<`, a
 * branch that silently skipped becomes a shorter run that still reports zero
 * failures and exits 0. This suite had no such constant at all until the count
 * was observed from a green run and written here.
 */
const EXPECTED_CHECKS = 15

const REPO = path.resolve(import.meta.dirname, '../..')
const WEB = path.join(REPO, 'apps/web')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const { chromium } = (() => {
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return require_(id)
    } catch {
      /* next */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] }

const argOf = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : null
}

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const WS_NAME = 'Rundesk Main'
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }

/** A normal session: the workspace is in the login payload. */
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: WS_NAME, slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

/**
 * The session that produced the reported bug: signed in, inside WS, but the
 * login payload never carried it. Everything that reads the auth store comes
 * up empty; everything that reads the API is fine.
 */
const STALE_SESSION = {
  state: { user: USER, organizations: [], workspaces: [] },
  version: 0,
}

const envelope = (data) => JSON.stringify({ data, error: null })
const results = []
const ok = (m) => { results.push([true, m]); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push([false, m]); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))

const browser = await chromium.launch(LAUNCH)

async function tab(session) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  await ctx.route('**/api/**', async (route) => {
    const url = route.request().url()
    let data = []
    if (url.includes('/users/me')) data = USER
    // The live workspace read — the one the header should fall back to.
    else if (/\/workspaces\/[0-9a-f-]{36}(\?|$)/i.test(url)) data = { id: WS, name: WS_NAME, logoUrl: null }
    else if (/\/workspaces\/[0-9a-f-]{36}\/plan/i.test(url)) data = { label: 'Enterprise', usage: { members: 1 } }
    return route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    if (process.env.DBG) console.log('PAGEERROR', String(e).slice(0, 300))
  })
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(session)],
  )
  return { ctx, page }
}

const sidebarText = async (page) =>
  (await page.locator('[data-testid="workspace-sidebar"]').innerText()).replace(/\s+/g, ' ')

try {
  // ── 1. the ordinary path: visit a workspace, then leave the tree ──────────
  {
    const { ctx, page } = await tab(SESSION)
    await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    chk(
      (await sidebarText(page)).includes(WS_NAME),
      'the sidebar names the workspace you are in',
      'the sidebar does not name the workspace',
    )

    /*
     * The exact link the Inbox settings gear uses — and deliberately with the
     * notifications preferences endpoint answering `[]`, which is what every
     * un-stubbed endpoint here returns. That shape used to reach
     * `.channels.webEnabled` and throw, taking the whole page to the error
     * boundary: the worst kind of dead end, with no sidebar at all.
     */
    await page.goto(`${BASE}/app/profile?tab=notifications`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="workspace-sidebar"]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)

    chk(
      !/Something went wrong/i.test(await page.locator('body').innerText()),
      'a malformed notification-preferences payload does not crash the page',
      'the notifications tab still dies on an unexpected payload shape',
    )

    const escape = page.locator('[data-testid="sidebar-no-workspace"]')
    chk(
      (await escape.count()) > 0,
      'the profile page offers a way back in the sidebar',
      'the profile page is still a dead end — the sidebar has no way out',
    )
    chk(
      (await escape.locator('a[href="/app"]').count()) > 0,
      'and "Your workspaces" is always offered as a fallback',
      'there is no workspace-picker fallback',
    )

    // Clicking back must land in the workspace we came from, not the picker.
    const back = escape.locator(`a[href="/app/${WS}"]`).first()
    if ((await back.count()) === 0) {
      bad('no "Back to workspace" link — the breadcrumb was not remembered')
    } else {
      await back.click()
      await page.waitForTimeout(2000)
      chk(
        page.url().endsWith(`/app/${WS}`),
        'and it returns to the workspace you were last in',
        `back went to ${page.url()}`,
      )
    }

    await page.goto(`${BASE}/app/help`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="workspace-sidebar"]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    chk(
      (await page.locator('[data-testid="sidebar-no-workspace"]').count()) > 0,
      'the help page offers the same way back',
      'the help page is still a dead end',
    )
    await ctx.close()
  }

  // ── 2. the account the bug was reported on ───────────────────────────────
  {
    const { ctx, page } = await tab(STALE_SESSION)
    await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    const seen = await sidebarText(page)
    chk(
      seen.includes(WS_NAME),
      'a workspace missing from the login payload is still named from the live read',
      'the sidebar falls back to the literal word "Workspace" while inside a named one',
    )
    chk(
      !/Select workspace/i.test(seen),
      'and the header does not say "Select workspace" while standing in one',
      'the header still says "Select workspace" inside a workspace',
    )

    await page.goto(`${BASE}/app/profile`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="workspace-sidebar"]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    chk(
      (await page.locator('[data-testid="sidebar-no-workspace"]').count()) > 0,
      'and this account is not stranded on /app/profile either',
      'the account whose switcher is empty has no way out at all',
    )
    await ctx.close()
  }

  /*
   * ── 3. G01-6 [00:18] — the invitation screen ─────────────────────────────
   *
   * The one screen in the product reached by somebody with no account, which
   * makes it the one screen where the in-app SupportWidget does not exist. Her
   * frame 008 puts a small "Need help?" link near the bottom of the join page.
   *
   * The dead end this closes is the second half: a bad or expired token used
   * to toast and redirect to /login — sending the person who cannot get in to
   * a sign-in form for an account they do not have, with the explanation
   * already fading out of the corner. No session is set here: this is
   * deliberately the signed-out case, because that is who follows an invite.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()

    // (a) a good invitation still renders, and now carries the help link.
    let previewOk = true
    await ctx.route('**/api/**', async (route) => {
      if (route.request().url().includes('/invitations/preview')) {
        if (!previewOk) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ data: null, error: { message: 'This invitation has expired' } }),
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: envelope({
            orgName: 'Aura',
            inviterName: 'Suleman',
            email: 'invitee@example.com',
            expiresAt: new Date(Date.now() + 6 * 86400000).toISOString(),
            requiresAccountCreation: true,
          }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: envelope([]) })
    })

    await page.goto(`${BASE}/accept-invite?token=good`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="invite-decline"]', { timeout: 15000 }).catch(() => {})

    const help = page.locator('[data-testid="invite-help"]')
    chk(
      (await help.count()) > 0,
      'the invitation screen offers a way to reach a human',
      'the invitation screen has no help link — an invitee who is stuck has nowhere to go',
    )
    // A link that goes nowhere is the failure this is meant to catch, so the
    // href is read rather than the presence of an <a>.
    const href = (await help.count()) ? await help.first().getAttribute('href') : ''
    chk(
      /^mailto:.+@.+\?.*subject=/.test(href ?? ''),
      'and it is addressed, with the reason already in the subject',
      `the help link goes to ${href || '(nothing)'}`,
    )

    // (b) the broken invitation — the case that used to redirect away.
    previewOk = false
    await page.goto(`${BASE}/accept-invite?token=expired`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    chk(
      page.url().includes('/accept-invite'),
      'a broken invitation stays on the invitation screen',
      `a broken invitation still bounces away — landed on ${page.url()}`,
    )
    chk(
      (await page.locator('[data-testid="invite-unusable"]').count()) > 0,
      'and says so on the page rather than in a toast that fades',
      'nothing on the page explains why the invitation did not open',
    )
    chk(
      (await page.locator('[data-testid="invite-unusable-reason"]').innerText().catch(() => ''))
        .includes('expired'),
      'and it keeps the reason the server gave',
      'the server’s reason is swallowed',
    )
    chk(
      (await page.locator('[data-testid="invite-help"]').count()) > 0,
      'and the person who most needs help can still reach it',
      'the broken-invitation screen has no help link',
    )
    await ctx.close()
  }
} catch (e) {
  bad(`threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter(([p]) => !p)
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
if (results.length !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗ ${results.length} of ${EXPECTED_CHECKS} checks ran\x1b[0m — this run stopped early, so ` +
      'the count above describes the part it reached and nothing else.',
  )
  process.exit(1)
}
process.exit(failed.length ? 1 : 0)
