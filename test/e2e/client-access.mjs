/**
 * THE WORKSPACE'S CLIENTS ARE MADE AND DELETED BY WHOEVER HOLDS `client.manage`
 * — A MANAGER'S AND AN ADMIN'S BY DEFAULT, GRANTABLE TO A MEMBER — AND READ BY
 * EVERY MEMBER, NOT BY A GUEST.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its clients slice. A client is the name a project's time is billed to (the
 * project page's Time tracking section, the time report's Client column, an
 * invoice, a portal). Making one and deleting one stood behind
 * `WorkspaceAdminGuard`, which admits managers, while no key could hand either
 * to anyone; the project page offered "+ New client name" to everybody and its
 * client picker to everybody, and the API then refused a plain member both.
 * The list answered every member, a guest included, with each client's
 * contact address.
 *
 * ClickUp has no clients object. The closest is a workspace-wide shared
 * library of the things tasks and locations are labelled with — the Custom
 * Field Manager (search snippets, help centre "Intro to Custom Field Manager",
 * "Custom Field permissions", "Default user role permissions"): owners, admins
 * and whoever holds the Manage Custom Fields custom role permission manage it,
 * a custom role can grant it to members, and a guest creates none. RunDesk's
 * manager tier, which ClickUp lacks, already holds `template.manage`, the key
 * for the other workspace-wide library a project is set up from, and a
 * manager sets up projects and approves their time. So one key, the
 * manager's by default: a manager keeps it, a plain member is refused, and a
 * member granted it makes and deletes clients.
 *
 *   node test/e2e/client-access.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cla${stamp}`
const PASSWORD = 'ClientAccess@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is written is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Client ${key}`, email, password: PASSWORD, organizationName: `Client ${key} ${stamp}`, organizationSlug: `client-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${key}: ${said(added)}`)
    let granted = keys.length === 0
    if (keys.length > 0) {
      // A key the catalog does not know is refused (400): recorded, so the checks say so.
      const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { email, password: PASSWORD, granted, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const member = await person('member', 'member')
  const keyholder = await person('keyholder', 'member', ['client.manage'])
  const guest = await person('guest', 'guest')
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  const SPACE = space.data?.id
  const PROJECT_NAME = `${TAG} project`
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: PROJECT_NAME } })
  const PROJECT = project.data?.id
  if (!SPACE || !PROJECT) throw new Error(`could not make the space and project: ${said(space)}, ${said(project)}`)
  const clientNamed = async (name) => (await sql`select id from clients where workspace_id = ${WS} and name = ${name}`)[0]?.id ?? null

  // ══ 1. MAKING A CLIENT ═══════════════════════════════════════════════════
  console.log('\n▶ making a client: the admin, the manager, a plain member, the member granted client.manage')
  const make = async (who, key) => {
    const name = `${TAG} ${key} client`
    const res = await who(`/workspaces/${WS}/clients`, { method: 'POST', body: { name, contactEmail: `${key}@client.invalid` } })
    return { status: res.status, row: await clientNamed(name) }
  }
  const adminMakes = await make(A, 'admin')
  const managerMakes = await make(manager.as, 'manager')
  const memberMakes = await make(member.as, 'member')
  const keyholderMakes = await make(keyholder.as, 'keyholder')
  chk(
    memberMakes.status === 403 && memberMakes.row === null
      && managerMakes.status === 201 && managerMakes.row !== null
      && keyholder.granted && keyholderMakes.status === 201 && keyholderMakes.row !== null
      && adminMakes.status === 201 && adminMakes.row !== null,
    'a plain member makes no client (403, nothing written) — the manager and a member granted client.manage each make one, and so does the admin',
    `admin ${JSON.stringify(adminMakes)}; manager ${JSON.stringify(managerMakes)}; member ${JSON.stringify(memberMakes)}; keyholder ${keyholder.granted ? JSON.stringify(keyholderMakes) : 'NOT GRANTED'}`,
  )

  // ══ 2. DELETING A CLIENT ═════════════════════════════════════════════════
  console.log('\n▶ deleting a client the admin made: a plain member, the manager, the member granted client.manage')
  const target = async (key) => {
    const r = await A(`/workspaces/${WS}/clients`, { method: 'POST', body: { name: `${TAG} ${key} target` } })
    if (!r.ok || !r.data?.id) throw new Error(`could not make the client to delete: ${said(r)}`)
    return r.data.id
  }
  const remove = async (who, id) => {
    const res = await who(`/workspaces/${WS}/clients/${id}`, { method: 'DELETE' })
    const [row] = await sql`select id from clients where id = ${id}`
    return { status: res.status, stays: !!row }
  }
  const memberRemoves = await remove(member.as, await target('member'))
  const managerRemoves = await remove(manager.as, await target('manager'))
  const keyholderRemoves = await remove(keyholder.as, await target('keyholder'))
  const ok = (s) => s >= 200 && s < 300
  chk(
    memberRemoves.status === 403 && memberRemoves.stays
      && ok(managerRemoves.status) && !managerRemoves.stays
      && keyholder.granted && ok(keyholderRemoves.status) && !keyholderRemoves.stays,
    'a plain member deletes no client (403, the row stays) — the manager and a member granted client.manage each delete one',
    `member ${JSON.stringify(memberRemoves)}; manager ${JSON.stringify(managerRemoves)}; keyholder ${keyholder.granted ? JSON.stringify(keyholderRemoves) : 'NOT GRANTED'}`,
  )

  // ══ 3. READING THE LIST ══════════════════════════════════════════════════
  // Every project page reads it for its picker, so a member keeps it; a guest reads
  // only what is shared with them, and a workspace's client book is not.
  console.log('\n▶ listing the clients: a plain member, a guest')
  const memberLists = await member.as(`/workspaces/${WS}/clients`)
  const guestLists = await guest.as(`/workspaces/${WS}/clients`)
  const names = (res) => (Array.isArray(res.data) ? res.data.map((c) => c.name) : [])
  chk(
    memberLists.status === 200 && names(memberLists).includes(`${TAG} admin client`)
      && (guestLists.status === 403 || guestLists.status === 404) && names(guestLists).length === 0,
    'a plain member still lists the workspace’s clients, the admin’s among them, for the project’s picker — a guest lists none (403)',
    `member ${said(memberLists)} ${JSON.stringify(names(memberLists))}; guest ${said(guestLists)} ${JSON.stringify(names(guestLists))}`,
  )

  // ══ 4–6. THE PROJECT PAGE'S CLIENT SECTION ═══════════════════════════════
  browser = await (await resolveChromium()).launch(launchOptions())
  const clientSection = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: PROJECT_NAME, exact: true }).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const picker = page.locator('select').filter({ has: page.locator('option', { hasText: /^No client$/ }) })
    const addField = page.getByPlaceholder('+ New client name')
    const notYours = page.getByTestId('project-client-add-not-yours')
    await waitUntil(async () => (await picker.count()) > 0, { timeoutMs: 15_000 })
    // The page decides by this person's keys and the project's answer: wait until it has said.
    await waitUntil(async () => (await addField.count()) > 0 || (await notYours.count()) > 0, { timeoutMs: 8000 })
    await page.waitForTimeout(1500)
    const seen = {
      picker: await picker.count(),
      pickerDisabled: (await picker.count()) > 0 ? await picker.first().isDisabled() : null,
      add: await addField.count(),
      addButton: await page.getByRole('button', { name: 'Add', exact: true }).count(),
      notYours: await notYours.count(),
      // Offered by the DRAWN picker: Playwright counts no <option> as visible, so the
      // guard is on the select (`found-29-sep/innertext-reads-hidden-leaves`).
      pickerOptions: (await picker.count()) > 0 ? await picker.first().filter({ visible: true }).locator('option').allInnerTexts() : [],
      // The switch beside "Billable by default", in the same section and by the same rule.
      billable: await page.locator('label', { hasText: 'Billable by default' }).getByRole('switch').count(),
      billableDisabled: await page.locator('label', { hasText: 'Billable by default' }).getByRole('switch').first().isDisabled().catch(() => null),
    }
    await ctx.close().catch(() => {})
    return seen
  }
  const keyholderSees = await clientSection(keyholder)
  const managerSees = await clientSection(manager)
  const memberSees = await clientSection(member)

  console.log('\n▶ the project page offers "+ New client name": the member granted client.manage, the manager')
  chk(
    keyholder.granted && keyholderSees.add === 1 && keyholderSees.addButton >= 1 && keyholderSees.notYours === 0
      && managerSees.add === 1 && managerSees.addButton >= 1 && managerSees.notYours === 0,
    'the project page’s Client section offers the “+ New client name” form to a member granted client.manage and to the manager',
    `keyholder ${keyholder.granted ? JSON.stringify(keyholderSees) : 'NOT GRANTED'}; manager ${JSON.stringify(managerSees)}`,
  )

  console.log('\n▶ …and to a plain member, none — saying so')
  chk(
    memberSees.picker === 1 && memberSees.add === 0 && memberSees.notYours === 1,
    'the project page’s Client section offers a plain member no “+ New client name” form, and says adding a client is for those who manage clients',
    `member ${JSON.stringify(memberSees)}`,
  )

  console.log('\n▶ the project\'s client picker: the manager, who may change the project; a plain member, who may not')
  chk(
    managerSees.picker === 1 && managerSees.pickerDisabled === false
      && memberSees.picker === 1 && memberSees.pickerDisabled === true
      && memberSees.pickerOptions.some((o) => o.includes(`${TAG} admin client`)),
    'the project’s client picker is live for the manager, who may change the project, and disabled — still naming its clients — for a plain member, who may not',
    `manager ${JSON.stringify({ picker: managerSees.picker, disabled: managerSees.pickerDisabled })}; member ${JSON.stringify({ picker: memberSees.picker, disabled: memberSees.pickerDisabled, options: memberSees.pickerOptions })}`,
  )
  // `found-28-sep/billable-switch-offered-to-readers`: the switch changes the
  // project, so it follows the project's edit rule as the picker does; the
  // member's press was refused (403) and the switch flipped back.
  chk(
    managerSees.billable === 1 && managerSees.billableDisabled === false
      && memberSees.billable === 1 && memberSees.billableDisabled === true,
    'the Billable by default switch is live for the manager, who may change the project, and disabled for the plain member, who may not',
    `manager ${JSON.stringify({ switch: managerSees.billable, disabled: managerSees.billableDisabled })}; member ${JSON.stringify({ switch: memberSees.billable, disabled: memberSees.billableDisabled })}`,
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
