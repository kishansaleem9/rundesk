/**
 * A LIST'S EMAIL ADDRESS IS FOR THOSE WHO MAY ADD TASKS TO IT, AND A TASK'S
 * ADDRESS DOES NOT GIVE IT AWAY.
 *
 * NOT A FRAME ROW: `found-25-sep/list-address-read-by-those-who-may-not-add`,
 * found closing `inbound-hooks-made-where-their-maker-cannot-add`. Mail to a
 * list's address makes a task for whoever sends it — ClickUp's Email to List,
 * whose address is the permission (help centre: a guest "can create tasks via
 * email if the address is shared with them", and cannot see it in ClickUp).
 * Measured on lane 3: a guest with a view share and a member of a view-only
 * space each read the address (200), and each mailed a task into a list that
 * refuses them one (403). A task's address was `list-<the list's alias>+task-<id>`,
 * so everybody given a task's address — in the task menu, and as the Reply-To
 * of every notification — could cut the task off and hold the list's.
 *
 * And a list deleted into the trash, which takes no task
 * (`found-5-oct/default-list-files-into-an-archived-list`), found by the
 * review: mail to its address went on making tasks in it — mail inserts its
 * task itself, past `createTask` and its gate — while its address, refused by
 * that gate as a plain no, could no longer be read, rotated or switched off by
 * the admin who had made it (403 each).
 *
 * What is mailed, and what it made, are read back by SQL.
 *
 *   node test/e2e/list-address-readers.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeRow } from './lib/fixture.mjs'

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
const TAG = `lar${stamp}`
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
  if (!sql) throw new Error('no DATABASE_URL — what mail makes is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'ListAddress@12345!'
    const signed = await signUpApi(API, { fullName: `Address ${who}`, email, password, organizationName: `Address ${who} ${stamp}`, organizationSlug: `address-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { email, password, api: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')

  /** A space at `level` (or the default, Full edit), a list of the admin's with an address, and a task in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (!list.ok || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(project)} ${said(list)}`)
    const alias = await A(`/lists/${list.data.id}/inbound-email`, { method: 'POST' })
    if (!alias.ok || !alias.data?.address) throw new Error(`could not give the ${name} list an address: ${said(alias)}`)
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name} task` } })
    if (!task.ok) throw new Error(`could not make the ${name} task: ${said(task)}`)
    return { name, list: list.data.id, task: task.data.id, address: alias.data.address, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}` }
  }
  const VIEW = await place('view', 'view')
  const FULL = await place('full edit')
  const shared = await A(`/shares/list/${FULL.list}`, { method: 'POST', body: { email: guest.email, level: 'view' } })
  if (!shared.ok) throw new Error(`could not share the list with the guest: ${said(shared)}`)

  // ══ 1. WHO READS THE ADDRESS ═════════════════════════════════════════════
  console.log('\n▶ the list’s address, asked for by a member at View and at Full edit, and by a guest')
  const read = async (who, p) => {
    const r = await who.api(`/lists/${p.list}/inbound-email`)
    return { status: r.status, holds: JSON.stringify(r.data ?? null).includes(p.address.split('@')[0]) }
  }
  const mv = await read(member, VIEW)
  const mf = await read(member, FULL)
  const gf = await read(guest, FULL)
  chk(
    mv.status === 403 && !mv.holds && gf.status === 403 && !gf.holds && mf.status === 200 && mf.holds,
    'a list’s address is read by those who may add tasks to it: refused to a member of a view-only space and to a guest with a view share (403, no address in either answer), given to a member at Full edit',
    `view-only member ${JSON.stringify(mv)}; guest ${JSON.stringify(gf)}; Full edit member ${JSON.stringify(mf)}`,
  )

  /*
   * And by `POST`, the Email panel's "Show address", which mints an address or
   * hands back the one there is: measured on lane 6, it gave the view-only
   * member the address `GET` refused them (201), and their mail to it made a
   * task in the list, by them (`found-6-oct/list-address-given-by-post-to-those-who-may-not-add`).
   */
  console.log('\n▶ the list’s address, asked for by POST, as the Email panel’s Show address does')
  const ask = async (who, p) => {
    const r = await who.api(`/lists/${p.list}/inbound-email`, { method: 'POST' })
    return { status: r.status, holds: JSON.stringify(r.data ?? null).includes(p.address.split('@')[0]), said: r.error?.message ?? null }
  }
  const postedView = await ask(member, VIEW)
  const postedGuest = await ask(guest, FULL)
  const postedFull = await ask(member, FULL)
  const [keptAlias] = await sql`select local_part, revoked_at from list_email_aliases where list_id = ${VIEW.list}`
  chk(
    postedView.status === 403 && !postedView.holds && postedGuest.status === 403 && !postedGuest.holds && postedFull.status === 201 && postedFull.holds &&
      keptAlias?.local_part === VIEW.address.split('@')[0].replace(/^list-/, '') && keptAlias?.revoked_at === null,
    'asked for by POST, a list’s address goes as it is read: refused to a member of a view-only space and to a guest with a view share (403, no address in either answer), and the address there is handed to a member at Full edit — none minted afresh',
    `view-only member ${JSON.stringify(postedView)}; guest ${JSON.stringify(postedGuest)}; Full edit member ${JSON.stringify(postedFull)}; the view-only list’s address now ${JSON.stringify(keptAlias ?? null)}`,
  )

  // ══ 2. A TASK'S ADDRESS ══════════════════════════════════════════════════
  console.log('\n▶ a task’s address: what it holds, where mail to it goes, and what is left when its task is cut off')
  const taskAddr = (await member.api(`/tasks/${VIEW.task}/email-address`)).data?.address ?? ''
  const listPart = VIEW.address.split('@')[0]
  let mailN = 0
  const mail = async (from, to, subject) => {
    mailN += 1
    const messageId = `<${TAG}-${mailN}@mail.example.test>`
    const res = await fetch(`${API}/inbound/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, fromAddress: from, recipient: to, subject, textBody: `${TAG} ${subject}` }),
    }).catch(() => null)
    // What the mail left on record, registered by its message id: mail to a task's address cut from its
    // task names no task, no list and no address of a list, and nothing else takes it when the run ends.
    for (const row of await sql`select id::text as id from inbound_email_messages where message_id = ${messageId}`) madeRow('inbound_email_messages', row.id)
    return res?.status ?? 0
  }
  const [adminRow] = await sql`select email from users where email = ${ADMIN.email}`
  await mail(adminRow.email, taskAddr, 'a comment by mail')
  const [comment] = await sql`select id from task_comments where task_id = ${VIEW.task} and body like ${`%${TAG} a comment by mail%`}`
  // An address given out before tags carried the alias itself; mail answering one still lands.
  const oldForm = `${listPart}+task-${VIEW.task}@${VIEW.address.split('@')[1]}`
  await mail(adminRow.email, oldForm, 'a reply to an old address')
  const [oldComment] = await sql`select id from task_comments where task_id = ${VIEW.task} and body like ${`%${TAG} a reply to an old address%`}`
  const cut = taskAddr.includes('+task-') ? `${taskAddr.split('+task-')[0]}@${taskAddr.split('@')[1]}` : ''
  if (cut) await mail(adminRow.email, cut, `${TAG} made from a cut address`)
  const [fromCut] = await sql`select id from tasks where list_id = ${VIEW.list} and title like ${`%made from a cut address%`}`
  chk(
    taskAddr.includes(`+task-${VIEW.task}`) && !taskAddr.includes(listPart.replace(/^list-/, '')) && Boolean(comment) && Boolean(oldComment) && Boolean(cut) && !fromCut,
    'a task’s address holds no part of its list’s address: mail to it still comments on the task, as mail to an address given out before does, and with its task cut off it makes nothing',
    `the task's address ${taskAddr}; the list's ${VIEW.address}; the comment ${Boolean(comment)}; by the old address ${Boolean(oldComment)}; a task from the cut address ${Boolean(fromCut)}`,
  )

  // ══ 3. THE EMAIL PANEL ═══════════════════════════════════════════════════
  console.log('\n▶ the Email panel, for the member in the view-only list and in the Full edit one')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', member.email)
  await page.fill('input[type=password]', member.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const panel = async (p) => {
    await page.goto(`${B}${p.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('list-email-button').click({ timeout: 20_000 }).catch(() => {})
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    // The address is drawn in a read-only box, whose value no text read sees.
    const shown = await dialog.locator('input[readonly]').evaluateAll((els) => els.map((e) => e.value)).catch(() => [])
    return {
      open: await dialog.count().catch(() => -1),
      address: shown.includes(p.address),
      generate: await dialog.getByRole('button', { name: /^Generate address$/ }).count().catch(() => -1),
      withheld: await page.getByTestId('list-email-address-withheld').count().catch(() => -1),
    }
  }
  const pv = await panel(VIEW)
  const pf = await panel(FULL)
  chk(
    pv.open === 1 && !pv.address && pv.generate === 0 && pv.withheld === 1 && pf.address && pf.withheld === 0,
    'the Email panel shows the address only to those who may add: in the view-only list it says why there is none, with nothing to generate, and at Full edit it shows it',
    `view-only ${JSON.stringify(pv)}; Full edit ${JSON.stringify(pf)}`,
  )

  // ══ 4. MAIL TO A DELETED LIST ════════════════════════════════════════════
  console.log('\n▶ a list with an address, deleted into the trash, and mailed')
  const DELETED = await place('deleted')
  const binned = await A(`/lists/${DELETED.list}`, { method: 'DELETE' })
  if (!binned.ok) throw new Error(`could not delete the list: ${said(binned)}`)
  const SUBJECT = `${TAG} mailed into the deleted list`
  const mailed = await mail(adminRow.email, DELETED.address, SUBJECT)
  const [{ n: mailedTasks }] = await sql`select count(*)::int as n from tasks where list_id = ${DELETED.list} and title like ${`%${SUBJECT}%`}`
  const [record] = await sql`select outcome, reason from inbound_email_messages where subject = ${SUBJECT}`
  chk(
    mailed === 201 && mailedTasks === 0 && record?.outcome === 'rejected_not_allowed' && record?.reason === 'the list is in the trash',
    'mail to the address of a list in the trash makes no task in it — the message is recorded as refused, saying the list is in the trash',
    `mailed ${mailed}; tasks made ${mailedTasks}; recorded ${JSON.stringify(record ?? null)}`,
  )

  // ══ 5. ITS ADDRESS, STILL ITS OWN ════════════════════════════════════════
  console.log('\n▶ the deleted list’s address: read, rotated and switched off by the admin who made it')
  const readTrash = await A(`/lists/${DELETED.list}/inbound-email`)
  const rotated = await A(`/lists/${DELETED.list}/inbound-email/rotate`, { method: 'POST' })
  const revoked = await A(`/lists/${DELETED.list}/inbound-email`, { method: 'DELETE' })
  const [aliasRow] = await sql`select revoked_at is not null as revoked from list_email_aliases where list_id = ${DELETED.list}`
  chk(
    readTrash.status === 200 && readTrash.data?.address === DELETED.address
      && rotated.ok && !!rotated.data?.address && rotated.data.address !== DELETED.address
      && revoked.ok && aliasRow?.revoked === true,
    'and the deleted list’s address is still read, rotated and switched off by those who may add tasks to the list — the trash refuses tasks, not the address',
    `read ${said(readTrash)}; rotated ${said(rotated)}; switched off ${said(revoked)}, revoked ${JSON.stringify(aliasRow?.revoked ?? null)}`,
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
