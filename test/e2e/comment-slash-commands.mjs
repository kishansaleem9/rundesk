/**
 * §V2-S05c — SLASH COMMANDS IN THE COMMENT COMPOSER, frame `04:50`.
 *
 * The frame's "+" menu lists "Slash commands" first, and the composer prints a
 * hint about them under the box. The description editor has had them since
 * §G15 `[22:28]`; the composer did not, and the previous item deliberately left
 * the "+" menu's entry out rather than ship a label over nothing.
 *
 * THE PREREQUISITE, which is why this is one item and not two. Comment bodies
 * rendered as PLAIN TEXT — `MentionText` with `whitespace-pre-wrap`. A slash
 * command inserting `## ` into that box would have left two hashes on screen
 * for ever. So slash commands in a comment are worth nothing until comments
 * render markdown, and this suite checks the pair together: the block is
 * inserted, and the posted comment shows it as a block.
 *
 * WHY EXISTING COMMENTS ARE SAFE. Rendering is gated on `hasBlockMarkdown`, the
 * same test chat uses: a comment containing no list, quote, table or fence
 * takes the inline path and looks exactly as it did before. There is a check
 * for that here too, because "we upgraded the renderer" is precisely the change
 * that quietly re-interprets everything anybody has already written.
 *
 * AND WHERE A SLASH MUST NOT OPEN A MENU. "and/or", and any URL, contain
 * slashes. A composer that popped a block menu mid-word is one people stop
 * typing slashes into.
 *
 *   node test/e2e/comment-slash-commands.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 10

const REPO = path.resolve(import.meta.dirname, '../..')
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-slash-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite seeds a plain comment to protect')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Slash subject ${TAG}`}) returning id`

  /*
   * A COMMENT WRITTEN BEFORE ANY OF THIS, with inline punctuation that a
   * careless markdown upgrade would eat: underscores, asterisks and a slash in
   * the middle of a word.
   */
  const me = (await A('/users/me')).data
  const PLAIN = `see the and/or case, file_name_here and 2 * 3 ${TAG}`
  await sql`
    insert into task_comments (task_id, author_id, body)
    values (${task.id}, ${me.id}, ${PLAIN})`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.getByTestId('task-tab-comments').click({ timeout: 25_000 })
  await settleCookies()

  const box = page.getByTestId('comment-input')

  // -------------------------------------------------------------------------
  console.log('\n▶ the comment already there is untouched')

  /*
   * FIRST, before anything is typed. A renderer upgrade is exactly the change
   * that re-interprets an existing corpus, and this comment has the punctuation
   * to prove it: `file_name_here` must not become italic and `and/or` must stay
   * one word.
   */
  const existing = await waitUntil(
    async () => (await readText(page.locator('ol, div').filter({ hasText: TAG }).first())).includes(TAG),
    { timeoutMs: 20_000 },
  )
  chk(existing, 'the seeded comment is on screen', 'the comment never rendered at all')
  const shown = await readText(page.locator(`text=/and\\/or/`).first())
  chk(
    shown.includes('and/or') && shown.includes('file_name_here'),
    'and reads exactly as it was written — underscores and slashes survive',
    `it rendered as "${shown}" — the markdown upgrade re-interpreted an existing comment`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `04:50` — "/" opens the block menu')

  await box.click()
  await box.pressSequentially('/quo', { delay: 30 })
  chk(
    await waitUntil(() => page.getByTestId('comment-slash-menu').isVisible().catch(() => false), {
      timeoutMs: 10_000,
    }),
    'typing "/" opens the slash menu',
    'no menu — the composer has no slash commands, and the "+" item would be a label',
  )
  chk(
    await page.getByTestId('comment-slash-quote').isVisible().catch(() => false),
    'and what follows the slash narrows it to Quote',
    `"/quo" did not narrow to the quote block`,
  )

  await page.getByTestId('comment-slash-quote').click()
  chk(
    await waitUntil(async () => {
      const v = await box.inputValue()
      return v.includes('> ') && !v.includes('/quo')
    }, { timeoutMs: 10_000 }),
    'choosing it inserts the block AND removes the /query',
    `the box holds "${await box.inputValue()}" — leaving "/quo" above the quote is the ` +
      'bug this replaced in the description editor',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the posted comment SHOWS it as a block')

  /*
   * THE LOAD-BEARING CHECK. Inserting markdown into a box that renders plain
   * text is worse than no slash menu: the person gets "> " in their comment for
   * ever. So the block has to survive the round trip and come back laid out.
   */
  const QUOTED = `quoted line ${TAG}`
  await box.fill(`> ${QUOTED}`)
  await page.getByTestId('comment-post').click()

  chk(
    await waitUntil(async () => {
      const rows = await sql`
        select body from task_comments where task_id = ${task.id} and body like ${`%${QUOTED}%`}`
      return (rows[0]?.body ?? '').startsWith('> ')
    }, { timeoutMs: 20_000 }),
    'the comment is stored with its markdown',
    'the block was stripped before it was saved',
  )
  chk(
    await waitUntil(
      async () => (await page.locator('blockquote').count()) > 0,
      { timeoutMs: 15_000 },
    ),
    'and comes back rendered as a quote, not as "> "',
    'the comment shows its own syntax — which is what makes a slash menu in a ' +
      'plain-text box worse than none',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a slash mid-word does NOT open the menu')

  await box.fill('')
  await box.pressSequentially('and/or', { delay: 30 })
  const opened = await waitUntil(
    () => page.getByTestId('comment-slash-menu').isVisible().catch(() => false),
    { timeoutMs: 1_500 },
  )
  chk(
    !opened,
    'typing "and/or" leaves the menu closed',
    'a slash inside a word opened the block menu — which is how people learn to ' +
      'stop typing slashes',
  )

  const URL_TEXT = 'see https://example.com/docs/thing'
  await box.fill('')
  await box.pressSequentially(URL_TEXT, { delay: 15 })
  chk(
    !(await page.getByTestId('comment-slash-menu').isVisible().catch(() => false)),
    'and neither does pasting a URL',
    'a URL opened the block menu',
  )
  chk(
    (await box.inputValue()) === URL_TEXT,
    'and every character of it arrives',
    `the box holds "${await box.inputValue()}" instead of "${URL_TEXT}"`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
