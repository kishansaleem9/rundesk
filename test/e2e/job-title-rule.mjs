/**
 * A JOB TITLE IS YOURS TO SET, OR ANYBODY'S AT OR BELOW YOUR ROLE WHEN YOU MAY
 * SET MEMBER PROFILES — AND THE PAGE OFFERS WHAT THE API ALLOWS, AND SAYS SO
 * WHEN A SAVE FAILS.
 *
 * NOT A FRAME ROW: `found-28-sep/job-title-rule-and-message-disagree`, found by
 * the user-group research. Changing somebody else's title asked the manager
 * role while its refusal said "Only a workspace admin may change somebody
 * else's job title", a member granted the profile permission was refused, a
 * manager retitled an admin, and the Teams page offered the pencil only on
 * your own card, so an admin, whom the API allowed, could not do it from the
 * page. A failed save said nothing. Beside it in the same service: a team
 * search for "50%" matched every name with "50" in it (the query went into
 * ILIKE as a pattern), and removing somebody who was not in a team wrote a
 * "removed" line to the audit log.
 *
 * ClickUp (help centre "Intro to profiles", from search snippets): "You can add
 * and update your own title on your profile", and "the Workspace owner and
 * admins can edit everyone's titles", from "Add description" under the
 * person's name. RunDesk's rule for another member's profile is the
 * `members.profile.manage` permission, which capacity and reports-to already
 * ask — an admin's and a manager's by default, grantable by a custom role —
 * with the rank rule they ask too: nobody sets the profile of somebody above
 * their own role.
 *
 *   node test/e2e/job-title-rule.mjs --api 3027 --dist /tmp/claude-0/dist-7
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
const EXPECTED_CHECKS = 11

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
const TAG = `jtr${stamp}`
const PASSWORD = 'JobTitles@12345!'
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
  if (!sql) throw new Error('no DATABASE_URL — titles and the audit log are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = auth.user?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  /** A person in the workspace at `role`, granted `keys` by a custom role of their own. */
  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Titled ${key}`, email, password: PASSWORD, organizationName: `Titled ${key} ${stamp}`, organizationSlug: `titled-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    let granted = keys.length === 0
    if (keys.length > 0) {
      const r = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = r.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${r.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      granted = given.status > 0 && given.status < 300
      if (!granted) console.log(`    (the ${key} was not granted ${keys.join(', ')}: ${said(r)})`)
    }
    return { key, id: signed.user?.id, email, granted, as: apiAs(signed.accessToken) }
  }
  const plain = await person('plain', 'member')
  const colleague = await person('colleague', 'member')
  const profiler = await person('profiler', 'member', ['members.profile.manage'])
  const manager = await person('manager', 'manager')
  const peer = await person('peer', 'manager')
  if (!plain.id || !colleague.id || !manager.id || !adminId) throw new Error('a sign-up answered with no user id')

  const titleOf = async (userId) =>
    (await sql`select job_title from workspace_member_profiles where workspace_id = ${WS} and user_id = ${userId}`)[0]?.job_title ?? null
  const setTitle = (who, userId, jobTitle) => who(`/workspaces/${WS}/teams/people/${userId}/title`, { method: 'PUT', body: { jobTitle } })

  // ══ 1. YOUR OWN ══════════════════════════════════════════════════════════
  console.log('\n▶ your own title')
  const own = await setTitle(plain.as, plain.id, 'Copywriter')
  const ownAfter = await titleOf(plain.id)
  chk(
    own.status < 300 && ownAfter === 'Copywriter',
    'a plain member sets their own job title (200) and it is saved',
    `${said(own)}; saved ${JSON.stringify(ownAfter)}`,
  )

  // ══ 2. A COLLEAGUE'S, WITHOUT THE PERMISSION ══════════════════════════════
  console.log('\n▶ a plain member, on a colleague’s title')
  await setTitle(A, colleague.id, 'Analyst')
  const theirs = await setTitle(plain.as, colleague.id, 'Renamed by a colleague')
  const theirsAfter = await titleOf(colleague.id)
  const message = String(theirs.error?.message ?? '')
  chk(
    theirs.status === 403 && /member profiles/i.test(message) && !/only a workspace admin/i.test(message) && theirsAfter === 'Analyst',
    'a plain member is refused a colleague’s job title (403), the refusal names the permission it takes rather than saying only an admin may, and the title stays',
    `${said(theirs)}; saved ${JSON.stringify(theirsAfter)}`,
  )

  // ══ 3. WITH THE PERMISSION, BY A CUSTOM ROLE ══════════════════════════════
  console.log('\n▶ a member granted members.profile.manage')
  const granted = await setTitle(profiler.as, colleague.id, 'Senior analyst')
  const grantedAfter = await titleOf(colleague.id)
  chk(
    profiler.granted && granted.status < 300 && grantedAfter === 'Senior analyst',
    'a member granted members.profile.manage sets a colleague’s job title (200) and it is saved',
    `granted ${profiler.granted}; ${said(granted)}; saved ${JSON.stringify(grantedAfter)}`,
  )

  // ══ 4. A MANAGER, WITHIN RANK ═════════════════════════════════════════════
  console.log('\n▶ a manager, on a member, a fellow manager and an admin')
  await setTitle(A, adminId, 'Head of operations')
  const mm = await setTitle(manager.as, colleague.id, 'Lead analyst')
  const mp = await setTitle(manager.as, peer.id, 'Delivery manager')
  const ma = await setTitle(manager.as, adminId, 'Retitled by a manager')
  const after4 = { member: await titleOf(colleague.id), peer: await titleOf(peer.id), admin: await titleOf(adminId) }
  chk(
    mm.status < 300 && mp.status < 300 && after4.member === 'Lead analyst' && after4.peer === 'Delivery manager'
      && ma.status === 403 && after4.admin === 'Head of operations',
    'a manager sets a member’s and a fellow manager’s job title, and is refused an admin’s (403), which stays — nobody sets the profile of somebody above their own role',
    `member ${said(mm)}; manager ${said(mp)}; admin ${said(ma)}; saved ${JSON.stringify(after4)}`,
  )

  // ══ 5. AN ADMIN, ANYBODY'S ═══════════════════════════════════════════════
  console.log('\n▶ an admin')
  const am = await setTitle(A, manager.id, 'Studio manager')
  const amAfter = await titleOf(manager.id)
  chk(
    am.status < 300 && amAfter === 'Studio manager',
    'an admin sets a manager’s job title (200) — ClickUp: owners and admins edit everyone’s titles',
    `${said(am)}; saved ${JSON.stringify(amAfter)}`,
  )

  // ══ 6–9. THE TEAMS PAGE ══════════════════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const pageAs = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.goto(`${B}/app/${WS}/teams`, { waitUntil: 'domcontentloaded' })
    await waitUntil(() => page.getByTestId('teams-tab-people').isVisible().catch(() => false), { timeoutMs: 15_000 })
    await page.getByTestId('teams-tab-people').click({ timeout: 8000 }).catch(() => {})
    // Every card drawn, and the permissions read, before anything is counted.
    await waitUntil(async () => (await page.locator('[data-testid="teams-person"]').count()) >= 6, { timeoutMs: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return page
  }
  const cardOf = (page, id) => page.locator(`[data-testid="teams-person"][data-user-id="${id}"]`)
  const pencilOn = async (page, id) => (await cardOf(page, id).getByTestId('teams-person-title-edit').count()) > 0

  console.log('\n▶ the Teams page, as the admin')
  const adminPage = await pageAs(ADMIN.email, ADMIN.password)
  const adminOffered = await pencilOn(adminPage, colleague.id)
  let adminSaved = null
  if (adminOffered) {
    await cardOf(adminPage, colleague.id).getByTestId('teams-person-title-edit').click({ timeout: 5000 }).catch(() => {})
    await cardOf(adminPage, colleague.id).getByTestId('teams-person-title-input').fill('Principal analyst', { timeout: 5000 }).catch(() => {})
    await cardOf(adminPage, colleague.id).getByTestId('teams-person-title-save').click({ timeout: 5000 }).catch(() => {})
    await waitUntil(async () => (await titleOf(colleague.id)) === 'Principal analyst', { timeoutMs: 10_000 })
    adminSaved = await titleOf(colleague.id)
  }
  const shownAfter = adminOffered
    ? await waitUntil(async () => (await cardOf(adminPage, colleague.id).getByTestId('teams-person-title').filter({ visible: true }).innerText().catch(() => '')).trim() === 'Principal analyst', { timeoutMs: 10_000 })
    : false
  chk(
    adminOffered && adminSaved === 'Principal analyst' && shownAfter,
    'the Teams page offers an admin the pencil on a colleague’s card, and the title typed there is saved and shown on the card',
    `offered ${adminOffered}; saved ${JSON.stringify(adminSaved)}; shown ${shownAfter}`,
  )

  console.log('\n▶ the Teams page, as a plain member')
  const plainPage = await pageAs(plain.email, PASSWORD)
  const plainOwn = await pencilOn(plainPage, plain.id)
  const plainOthers = await pencilOn(plainPage, colleague.id)
  chk(
    plainOwn && !plainOthers,
    'the Teams page offers a plain member the pencil on their own card and not on a colleague’s',
    `own ${plainOwn}; a colleague’s ${plainOthers}`,
  )

  console.log('\n▶ the Teams page, as a manager')
  const managerPage = await pageAs(manager.email, PASSWORD)
  const onMember = await pencilOn(managerPage, colleague.id)
  const onAdmin = await pencilOn(managerPage, adminId)
  chk(
    onMember && !onAdmin,
    'the Teams page offers a manager the pencil on a member’s card and not on an admin’s, as the API answers',
    `a member’s ${onMember}; an admin’s ${onAdmin}`,
  )

  console.log('\n▶ a save that fails, on the plain member’s own card')
  await plainPage.route('**/teams/people/*/title', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'boom' } }) }))
  await cardOf(plainPage, plain.id).getByTestId('teams-person-title-edit').click({ timeout: 5000 }).catch(() => {})
  await cardOf(plainPage, plain.id).getByTestId('teams-person-title-input').fill('Never saved', { timeout: 5000 }).catch(() => {})
  await cardOf(plainPage, plain.id).getByTestId('teams-person-title-save').click({ timeout: 5000 }).catch(() => {})
  const errorShown = await waitUntil(
    async () => (await cardOf(plainPage, plain.id).getByTestId('teams-person-title-error').count()) > 0,
    { timeoutMs: 8000 },
  )
  const errorText = errorShown ? (await cardOf(plainPage, plain.id).getByTestId('teams-person-title-error').filter({ visible: true }).innerText().catch(() => '')).trim() : ''
  const stillEditing = (await cardOf(plainPage, plain.id).getByTestId('teams-person-title-input').count()) > 0
  chk(
    errorShown && errorText.length > 0 && stillEditing && (await titleOf(plain.id)) === 'Copywriter',
    'a job title that fails to save says so on the card and keeps the draft open, and the saved title is unchanged',
    `error ${JSON.stringify(errorText)}; still editing ${stillEditing}`,
  )

  // ══ 10. A TEAM SEARCH IS LITERAL ═════════════════════════════════════════
  console.log('\n▶ searching teams for a name with % or _ in it')
  const team = async (name) => {
    const r = await A(`/workspaces/${WS}/groups`, { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make the team "${name}": ${said(r)}`)
    return r.data.id
  }
  await team('cut 50% now')
  await team('cut 500 now')
  await team('a_b')
  await team('axb')
  const names = async (q) => ((await A(`/workspaces/${WS}/groups?search=${encodeURIComponent(q)}`)).data ?? []).map((g) => g.name).sort()
  const percent = await names('50%')
  const under = await names('a_b')
  chk(
    JSON.stringify(percent) === JSON.stringify([`${TAG} cut 50% now`]) && JSON.stringify(under) === JSON.stringify([`${TAG} a_b`]),
    'a team search matches what was typed: ‘50%’ finds only the team with 50% in its name, and ‘a_b’ only the one with a_b',
    `"50%" found ${JSON.stringify(percent)}; "a_b" found ${JSON.stringify(under)}`,
  )

  // ══ 11. A REMOVAL THAT REMOVED NOBODY IS NOT AUDITED ═════════════════════
  console.log('\n▶ removing somebody from a team, and somebody who is not in it')
  const crew = await team('crew')
  const joined = await A(`/workspaces/${WS}/groups/${crew}/members`, { method: 'POST', body: { userIds: [plain.id] } })
  if (joined.status >= 300) throw new Error(`could not add to the team: ${said(joined)}`)
  const audited = async () => (await sql`select count(*)::int as n from audit_logs where workspace_id = ${WS} and action = 'group.member_removed' and resource_id = ${crew}`)[0].n
  const nobody = await A(`/workspaces/${WS}/groups/${crew}/members/${colleague.id}`, { method: 'DELETE' })
  const afterNobody = await audited()
  const somebody = await A(`/workspaces/${WS}/groups/${crew}/members/${plain.id}`, { method: 'DELETE' })
  const afterSomebody = await audited()
  chk(
    nobody.status < 300 && afterNobody === 0 && somebody.status < 300 && afterSomebody === 1,
    'removing somebody who is not in a team writes nothing to the audit log, and removing a member writes one line',
    `not in it ${said(nobody)}, ${afterNobody} line(s); a member ${said(somebody)}, ${afterSomebody} line(s)`,
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
