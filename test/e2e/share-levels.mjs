/**
 * WHO SHARES, AND HOW FAR: A MEMBER WHO MAY EDIT A PLACE SHARES IT, UP TO THEIR
 * OWN LEVEL, AND NEVER RAISES THEMSELVES.
 *
 * NOT A FRAME ROW: `found-25-sep/sharers-raise-their-own-level` (security) and
 * `found-25-sep/sharing-asks-the-maker-not-the-level`, found closing
 * `list-page-offers-refused-edits`. Measured on lane 3:
 *   - a member with a list shared to them at Edit, refused a task in it (403),
 *     shared it with themselves at Full edit (201) and made the task (201), and
 *     gave Full edit to another member too;
 *   - a member with Full edit by the space's default — every ordinary member —
 *     was refused sharing the admin's list (403), and giving it an email
 *     address (403); each worked on a list they had made.
 *
 * ClickUp (help centre, "Share Spaces, Folders, Subfolders, Lists, and tasks",
 * search snippets): edit permissions on a location let a member share it; a
 * guest shares nothing, at any level. The shares are read back by SQL.
 *
 *   node test/e2e/share-levels.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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
const TAG = `shl${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the shares are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'ShareLevels@12345!'
    const signed = await signUpApi(API, { fullName: `Share ${who}`, email, password, organizationName: `Share ${who} ${stamp}`, organizationSlug: `share-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { email, password, id: row.id, api: apiAs(signed.accessToken) }
  }
  const M = await person('member', 'member')
  const O = await person('other', 'member')
  const G = await person('guest', 'guest')

  /** A space at `level` (or the default, Full edit) and a list of the admin's in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    return { name, list: list.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const SHARED = await place('view, shared at edit', 'view')
  const VIEW = await place('view', 'view')
  const EDIT = await place('edit', 'edit')
  const FULL = await place('full edit')
  const levelOf = async (p, userId) => (await sql`select level from object_shares where object_type = 'list' and object_id = ${p.list} and user_id = ${userId}`)[0]?.level ?? null
  const shareRowOf = async (p, userId) => (await sql`select id from object_shares where object_type = 'list' and object_id = ${p.list} and user_id = ${userId}`)[0]?.id ?? null
  const granted = await A(`/shares/list/${SHARED.list}`, { method: 'POST', body: { email: M.email, level: 'edit' } })
  if (granted.status >= 300) throw new Error(`could not share the list with the member: ${said(granted)}`)

  // ══ 1. NOT THEMSELVES ════════════════════════════════════════════════════
  console.log('\n▶ a member shared a list at Edit, raising themselves')
  const selfShare = await M.api(`/shares/list/${SHARED.list}`, { method: 'POST', body: { email: M.email, level: 'admin' } })
  const selfPatch = await M.api(`/shares/list/${SHARED.list}/${await shareRowOf(SHARED, M.id)}`, { method: 'PATCH', body: { level: 'admin' } })
  const stillEdit = await levelOf(SHARED, M.id)
  const add = await M.api('/tasks', { method: 'POST', body: { listId: SHARED.list, title: `${TAG} after raising` } })
  chk(
    selfShare.status === 403 && selfPatch.status === 403 && stillEdit === 'edit' && add.status === 403,
    'a member shared a list at Edit may not raise themselves — sharing it with themselves at Full edit and changing their own share are refused, the share stays Edit, and adding a task is still refused',
    `share to self ${said(selfShare)}; change own ${said(selfPatch)}; their share ${stillEdit}; add ${add.status}`,
  )

  // ══ 2. NOT ABOVE THEMSELVES ══════════════════════════════════════════════
  console.log('\n▶ the same member, sharing the list with another')
  const toFull = await M.api(`/shares/list/${SHARED.list}`, { method: 'POST', body: { email: O.email, level: 'admin' } })
  const afterFull = await levelOf(SHARED, O.id)
  const toEdit = await M.api(`/shares/list/${SHARED.list}`, { method: 'POST', body: { email: O.email, level: 'edit' } })
  const afterEdit = await levelOf(SHARED, O.id)
  chk(
    toFull.status === 403 && afterFull === null && toEdit.status < 300 && afterEdit === 'edit',
    'nor gives more than they hold: Full edit for another member is refused and nothing is shared, Edit is given',
    `Full edit ${said(toFull)} (share ${afterFull}); Edit ${said(toEdit)} (share ${afterEdit})`,
  )

  // ══ 3. NOT ABOVE THEM IN THE LIST ════════════════════════════════════════
  console.log('\n▶ the admin raises the other member; the member changes and removes that share')
  const raised = await A(`/shares/list/${SHARED.list}/${await shareRowOf(SHARED, O.id)}`, { method: 'PATCH', body: { level: 'admin' } })
  const lower = await M.api(`/shares/list/${SHARED.list}/${await shareRowOf(SHARED, O.id)}`, { method: 'PATCH', body: { level: 'view' } })
  const reshare = await M.api(`/shares/list/${SHARED.list}`, { method: 'POST', body: { email: O.email, level: 'view' } })
  const remove = await M.api(`/shares/list/${SHARED.list}/${await shareRowOf(SHARED, O.id)}`, { method: 'DELETE' })
  const held = await levelOf(SHARED, O.id)
  chk(
    raised.status < 300 && lower.status === 403 && reshare.status === 403 && remove.status === 403 && held === 'admin',
    'nor changes or removes a share above their own — by changing it, sharing over it, or removing it: the admin’s Full edit share for another member stays as it was',
    `admin raised ${raised.status}; member lowers ${said(lower)}, shares over it ${said(reshare)}, removes ${said(remove)}; the share ${held}`,
  )

  // ══ 4. BY THE LEVEL, AS CLICKUP ══════════════════════════════════════════
  console.log('\n▶ sharing the admin’s lists by the space’s default: Full edit, Edit, View — and a guest')
  const full = await M.api(`/shares/list/${FULL.list}`, { method: 'POST', body: { email: O.email, level: 'admin' } })
  const editAtEdit = await M.api(`/shares/list/${EDIT.list}`, { method: 'POST', body: { email: O.email, level: 'edit' } })
  const fullAtEdit = await M.api(`/shares/list/${EDIT.list}`, { method: 'POST', body: { email: G.email, level: 'admin' } })
  const view = await M.api(`/shares/list/${VIEW.list}`, { method: 'POST', body: { email: O.email, level: 'view' } })
  await A(`/shares/list/${FULL.list}`, { method: 'POST', body: { email: G.email, level: 'edit' } })
  // To somebody new — an outsider's address — so no cap on a share already
  // there can be what refuses them: only their being a guest.
  const outsider = `${TAG}-outsider@rundesk.invalid`
  const guest = await G.api(`/shares/list/${FULL.list}`, { method: 'POST', body: { email: outsider, level: 'view' } })
  const [invited] = await sql`select count(*)::int as n from object_shares where object_id = ${FULL.list} and invited_email = ${outsider}`
  const levels = { full: await levelOf(FULL, O.id), edit: await levelOf(EDIT, O.id), view: await levelOf(VIEW, O.id) }
  chk(
    full.status < 300 && levels.full === 'admin' && editAtEdit.status < 300 && levels.edit === 'edit' && fullAtEdit.status === 403
      && view.status === 403 && levels.view === null && guest.status === 403 && invited.n === 0,
    'a member shares by the level the space gives them, as ClickUp’s edit permissions do: at Full edit the admin’s list up to Full edit, at Edit up to Edit, at View not at all — and a guest shares nothing, even with Edit',
    `Full edit ${said(full)}; Edit at Edit ${said(editAtEdit)}, Full edit at Edit ${said(fullAtEdit)}; View ${said(view)}; guest ${said(guest)} (${invited.n} invited); shares ${JSON.stringify(levels)}`,
  )

  // ══ 5. THE LIST'S ADDRESS ════════════════════════════════════════════════
  console.log('\n▶ the admin’s lists’ addresses, given and rotated by the member')
  const giveFull = await M.api(`/lists/${FULL.list}/inbound-email`, { method: 'POST' })
  const rotateFull = await M.api(`/lists/${FULL.list}/inbound-email/rotate`, { method: 'POST' })
  const giveEdit = await M.api(`/lists/${EDIT.list}/inbound-email`, { method: 'POST' })
  const [addr] = await sql`select count(*)::int as n from list_email_aliases where list_id = ${EDIT.list}`
  chk(
    giveFull.status < 300 && Boolean(giveFull.data?.address) && rotateFull.status < 300 && giveEdit.status === 403 && addr.n === 0,
    'a list’s address is given and rotated by whoever may add tasks to it — a member at Full edit, on the admin’s list — and not by a member at Edit (403, none made)',
    `Full edit: give ${said(giveFull)}, rotate ${said(rotateFull)}; Edit: give ${said(giveEdit)}, ${addr.n} made`,
  )

  // ══ 6. THE SHARE PANEL ═══════════════════════════════════════════════════
  console.log('\n▶ the list’s Share panel, for the member in the Edit list and the view-only one')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', M.email)
  await page.fill('input[type=password]', M.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const panel = async (p) => {
    await page.goto(`${B}${p.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Share$/ }).first().click({ timeout: 20_000 }).catch(() => {})
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const invite = await dialog.getByPlaceholder('Invite by email…').count().catch(() => -1)
    const offered = invite > 0
      ? await dialog.locator('form select option').evaluateAll((os) => os.map((o) => o.value)).catch(() => [])
      : []
    return {
      invite,
      offered,
      readOnly: await dialog.getByText('only people with edit rights can change sharing', { exact: false }).count().catch(() => -1),
    }
  }
  const pe = await panel(EDIT)
  const pv = await panel(VIEW)
  chk(
    pe.invite === 1 && pe.offered.join(',') === 'view,comment,edit' && pe.readOnly === 0 && pv.invite === 0 && pv.readOnly === 1,
    'the Share panel offers a member at Edit the levels up to Edit and not Full edit, and tells a view-only member they cannot share',
    `Edit ${JSON.stringify(pe)}; view-only ${JSON.stringify(pv)}`,
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
