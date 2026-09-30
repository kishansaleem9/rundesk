/**
 * A HOOK IS MADE BY SOMEBODY WHO MAY ADD WHAT IT ADDS.
 *
 * NOT A FRAME ROW: `found-25-sep/inbound-hooks-made-where-their-maker-cannot-add`,
 * found closing `list-page-offers-refused-edits`. An inbound webhook adds tasks
 * to its list as the person who made it, and every delivery asks the create
 * gate for them (`createTask`). Making one asked only that they were not a
 * guest: measured on lane 3, a member of a view-only, a comment-only and an
 * Edit space each made a hook on the admin's list there (201), and every
 * delivery to it was refused (403) — a hook dead from the start, and the Email
 * panel offering it to them.
 *
 * Adding a task takes Full edit (`full-edit-enforced-nowhere`), so making a hook
 * does too. The hooks and tasks are read back by SQL.
 *
 *   node test/e2e/inbound-hook-makers.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `ihm${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the hooks and tasks are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const Anyone = apiAs(null)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'HookMakers@12345!'
  const signed = await signUpApi(API, { fullName: 'Hook maker', email, password, organizationName: `Hooks ${stamp}`, organizationSlug: `hooks-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  /** A space at `level` (or the default, Full edit), and a list of the admin's in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    return { name, list: list.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const VIEW = await place('view', 'view')
  const COMMENT = await place('comment', 'comment')
  const EDIT = await place('edit', 'edit')
  const FULL = await place('full edit')
  const hooksOf = async (p) => (await sql`select count(*)::int as n from inbound_webhooks where list_id = ${p.list} and created_by_id = ${me.id}`)[0].n

  // ══ 1. WHERE THEY MAY NOT ADD ════════════════════════════════════════════
  console.log('\n▶ a hook asked for where the member may not add a task')
  const refused = {}
  for (const p of [VIEW, COMMENT, EDIT]) {
    const r = await M(`/lists/${p.list}/inbound-webhooks`, { method: 'POST', body: { name: `${TAG} ${p.name}` } })
    refused[p.name] = { status: r.status, stored: await hooksOf(p) }
  }
  chk(
    Object.values(refused).every((x) => x.status === 403 && x.stored === 0),
    'a member who may not add tasks to a list makes no hook on it — refused in a view-only, a comment-only and an Edit space (403), and none is stored',
    JSON.stringify(refused),
  )

  // ══ 2. WHERE THEY MAY ═════════════════════════════════════════════════════
  console.log('\n▶ a hook made at Full edit, and a delivery to it')
  const hook = await M(`/lists/${FULL.list}/inbound-webhooks`, { method: 'POST', body: { name: `${TAG} full` } })
  const title = `${TAG} delivered`
  const delivered = hook.data?.token ? await Anyone(`/inbound/webhook/${hook.data.token}`, { method: 'POST', body: { title } }) : { status: 0 }
  const [task] = await sql`select list_id, created_by_id from tasks where title = ${title}`
  chk(
    hook.status < 300 && (await hooksOf(FULL)) === 1 && delivered.status < 300 && task?.list_id === FULL.list && task?.created_by_id === me.id,
    'where they may add — Full edit — a member makes a hook, and a delivery to its address adds a task to the list, as them',
    `made ${said(hook)}; delivered ${said(delivered)}; the task ${JSON.stringify(task ?? null)}`,
  )

  // ══ 3. THE EMAIL PANEL ═══════════════════════════════════════════════════
  console.log('\n▶ the Email panel, in the view-only, the Edit and the Full edit lists')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const offered = async (p) => {
    await page.goto(`${B}${p.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('list-email-button').click({ timeout: 20_000 }).catch(() => {})
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    return { open: await dialog.count().catch(() => -1), newHook: await page.getByTestId('inbound-webhook-new').count().catch(() => -1) }
  }
  const pv = await offered(VIEW)
  const pe = await offered(EDIT)
  const pf = await offered(FULL)
  chk(
    pv.open === 1 && pv.newHook === 0 && pe.open === 1 && pe.newHook === 0 && pf.newHook === 1,
    'the Email panel offers a new webhook only where the reader may add: not in the view-only list, not in the Edit one, and in the Full edit one',
    `view-only ${JSON.stringify(pv)}; Edit ${JSON.stringify(pe)}; Full edit ${JSON.stringify(pf)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
