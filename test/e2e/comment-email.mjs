/**
 * A TASK'S COMMENT BOX SENDS EMAIL, AS CLICKUP'S EMAIL CLICKAPP DOES
 * (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`,
 * `suite-hygiene/task-mentions-pins-unbuilt-email-mode`).
 *
 * ClickUp (help centre, "Use Email in ClickUp", through search excerpts, 9
 * October): an owner or admin turns the Email ClickApp on, and guests may not
 * use it; in a task's comment box, Comment ▾ → Email; From, To, CC and BCC —
 * contacts and the task's Email field suggested as one types — a subject, the
 * message and its files; Send. The email is kept in the task's activity, and
 * the answers of the people it went to land there, under it; one that came in
 * is answered as a comment or by email.
 *
 * Measured before it was built (9 October, batch 28's build): Email was listed
 * in the menu, disabled, with "Rundesk cannot send a comment as email"; no
 * route answered `POST /tasks/:id/comments/email` (404), a comment had no
 * channel, and the lanes had no mail server at all.
 *
 * A workspace of this run's own: the admin, a member and a guest; a task with
 * an Email field. The mail is read back from the lane's mail server
 * (`scripts/e2e-lanes/mail-stub.mjs`, through `lib/mail.mjs`) by this run's own
 * addresses, and what is kept is read back by SQL.
 *
 *   node test/e2e/comment-email.mjs --api 3011 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { createHash } from 'node:crypto'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { mailBase, mailTo, failMailTo, resetMailTo } from './lib/mail.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 18

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const MAIL = mailBase(API_PORT, argOf('--mail', undefined))
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

// The API's own words (`comment-email.ts`), and the menu's, in English.
const REFUSED = {
  off: 'Email is off in this workspace: an owner or admin turns it on in Settings → ClickApps',
  guest: 'Guests cannot send email from a task',
  noRecipient: 'An email needs somebody to go to',
  notAnAddress: '“not an address” is not an email address',
  edit: 'An email cannot be edited once it is sent',
}
const MENU_OFF = 'Email is off in this workspace. An owner or admin turns it on in Settings → ClickApps.'

const stamp = Date.now()
const TAG = `cem${stamp}`
const PASSWORD = 'CommentMail@12345!'
// Addresses of this run's own: the stub is the lane's, and every suite's mail goes there.
const CLIENT = `client-${TAG}@example.com`
const PARTNER = `partner-${TAG}@example.com`
const QUIET = `quiet-${TAG}@example.com`
const STRANGER = `stranger-${TAG}@example.com`
const REFUSER = `refuse-${TAG}@example.com`
const ADDRESSES = [CLIENT, PARTNER, QUIET, STRANGER, REFUSER]
const FILE = { name: `quote-${TAG}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Quote for ${TAG}\nTwo lines of it.\n`) }
const FILE_SHA1 = createHash('sha1').update(FILE.buffer).digest('hex')

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what an email leaves behind is read back by SQL')
  for (const a of ADDRESSES) await resetMailTo(MAIL, a)
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Email ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  const [adminRow] = await sql`select display_name from users where email = ${ADMIN.email}`
  const adminName = (adminRow?.display_name ?? '').trim() || ADMIN.email.split('@')[0]

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Mail ${who} ${stamp}`, email, password: PASSWORD, organizationName: `Mail ${who} ${stamp}`, organizationSlug: `mail-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { email, api: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')

  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (!list.ok) throw new Error(`could not make the list: ${said(list)}`)
  const title = `Quote the lease ${TAG}`
  const made1 = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title } })
  if (!made1.ok || !made1.data?.id) throw new Error(`could not make the task: ${said(made1)}`)
  const TASK = made1.data.id
  // The task's Email field, whose address the To box suggests (ClickUp suggests a task's Email field).
  const [field] = await sql`insert into custom_field_definitions (project_id, name, type) values (${project.data.id}, ${'Client email'}, ${'email'}) returning id`
  await sql`insert into custom_field_values (task_id, field_id, value) values (${TASK}, ${field.id}, ${sql.json({ v: CLIENT })})`
  // Shared with the guest to comment on: the comment box is theirs, and Email still is not.
  const shared = await A(`/shares/task/${TASK}`, { method: 'POST', body: { email: guest.email, level: 'comment' } })
  if (!shared.ok) throw new Error(`could not share the task with the guest: ${said(shared)}`)
  const emailRoute = `/tasks/${TASK}/comments/email`
  const emailComments = () => sql`select id, body, parent_comment_id from task_comments where task_id = ${TASK} and channel = 'email' order by created_at`

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  const openComments = async () => {
    await page.goto(`${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-tab-comments').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('comment-input').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  }
  /** The Email row of Comment ▾, read with the menu open, then the menu closed. */
  const readEmailRow = async () => {
    await page.getByTestId('comment-mode-trigger').click({ timeout: 10_000 }).catch(() => {})
    const row = page.getByTestId('comment-mode-item-email').filter({ visible: true })
    await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    // Settled: until the server has answered whether email may be sent, the row says it is checking.
    await waitUntil(async () => {
      if ((await row.getAttribute('data-available').catch(() => null)) === 'yes') return true
      const why = (await readText(page.getByTestId('comment-mode-reason-email').filter({ visible: true }), { timeoutMs: 500 })).trim()
      return why !== '' && !why.startsWith('Checking')
    }, { timeoutMs: 8000 })
    const out = {
      available: await row.getAttribute('data-available').catch(() => null),
      reason: (await readText(page.getByTestId('comment-mode-reason-email').filter({ visible: true }), { timeoutMs: 1000 })).trim(),
    }
    await page.keyboard.press('Escape')
    return out
  }
  const chooseEmail = async () => {
    await page.getByTestId('comment-mode-trigger').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('comment-mode-item-email').click({ timeout: 8000 }).catch(() => {})
    await page.getByTestId('comment-email-form').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }
  const chips = (field) => page.getByTestId(`comment-email-${field}`).locator('[data-testid="comment-email-chip"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-address'))).catch(() => [])

  // ══ 1. OFF UNTIL TURNED ON ═════════════════════════════════════════════════
  console.log('\n▶ before the ClickApp is turned on')
  const offSetup = await A(emailRoute)
  const offSend = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: 'Not yet' } })
  chk(
    offSetup.status === 200 && offSetup.data?.available === false && offSetup.data?.reason === 'off'
      && offSend.status === 403 && offSend.message === REFUSED.off
      && (await mailTo(MAIL, CLIENT)).length === 0 && (await emailComments()).length === 0,
    'Email is off until an owner or admin turns it on: the box is told so, a send is refused in words (403), and nothing is sent or kept',
    JSON.stringify({ setup: offSetup.data ?? offSetup.status, send: said(offSend) }),
  )
  await openComments()
  const offRow = await readEmailRow()
  chk(
    offRow.available === 'no' && offRow.reason === MENU_OFF,
    'Comment ▾ lists Email disabled, saying it is off and who turns it on',
    JSON.stringify(offRow),
  )

  // ══ 2. TURNED ON IN SETTINGS → CLICKAPPS ═══════════════════════════════════
  console.log('\n▶ the admin turns Email on among the ClickApps')
  await page.goto(`${B}/app/${WS}/settings?tab=features`, { waitUntil: 'domcontentloaded' })
  const sw = page.getByRole('switch', { name: 'Email', exact: true })
  await sw.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => !(await sw.isDisabled().catch(() => true)), { timeoutMs: 10_000 })
  const before = await sw.getAttribute('aria-checked').catch(() => null)
  await sw.click({ timeout: 5000 }).catch(() => {})
  const turnedOn = await waitUntil(async () => (await sw.getAttribute('aria-checked').catch(() => null)) === 'true', { timeoutMs: 10_000 })
  const [flagRow] = await sql`select enabled from feature_flags where flag_key = 'tasks.email' and workspace_id = ${WS} and scope = 'workspace'`
  await openComments()
  const onRow = await readEmailRow()
  chk(
    before === 'false' && turnedOn && flagRow?.enabled === true && onRow.available === 'yes' && onRow.reason === '',
    'Settings → ClickApps lists Email, off; switched on, it is kept for the workspace (read by SQL) and Comment ▾ offers Email',
    JSON.stringify({ before, turnedOn, flag: flagRow ?? null, row: onRow }),
  )

  // ══ 3. THE BOX BECOMES AN EMAIL ════════════════════════════════════════════
  console.log('\n▶ Comment ▾ → Email')
  await chooseEmail()
  /*
   * From is a picker since a person's own mailbox can be linked (`found-9-oct/task-email-sends-from-the-server`):
   * with none linked it holds the server's address alone, chosen. The line it replaced is drawn only while the
   * picker's list is loading, so the address is read off the picker's chosen option, waited for, and off the line
   * where the picker is not drawn.
   */
  const fromPicker = page.getByTestId('comment-email-from-select').filter({ visible: true })
  const pickerDrawn = await fromPicker.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)
  const fromLine = pickerDrawn
    ? ((await fromPicker.evaluate((sel) => sel.selectedOptions[0]?.textContent ?? '').catch(() => '')) ?? '').trim()
    : (await readText(page.getByTestId('comment-email-from').filter({ visible: true }), { timeoutMs: 5000 })).trim()
  const mode = await page.getByTestId('comment-mode-trigger').getAttribute('data-mode').catch(() => null)
  const subjectHint = await page.getByTestId('comment-email-subject').getAttribute('placeholder').catch(() => null)
  const sendShown = await page.getByTestId('comment-email-send').isVisible().catch(() => false)
  chk(
    mode === 'email' && new RegExp(`^${adminName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} via Rundesk <[^>]+@[^>]+>$`).test(fromLine) && subjectHint === title && sendShown,
    'the box becomes an email: From the writer “via Rundesk”, To, a subject that is the task’s title until one is typed, and Send',
    JSON.stringify({ mode, fromLine, subjectHint, sendShown }),
  )
  await page.getByTestId('comment-email-to-input').fill('client', { timeout: 5000 }).catch(() => {})
  const fieldSuggestion = page.getByTestId(`comment-email-suggestion-${CLIENT}`)
  const suggested = await waitUntil(() => fieldSuggestion.isVisible().catch(() => false), { timeoutMs: 8000 })
  const fieldSource = (await readText(fieldSuggestion.filter({ visible: true }), { timeoutMs: 2000 })).trim()
  await fieldSuggestion.click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-to-input').fill(`${TAG}-mem`, { timeout: 5000 }).catch(() => {})
  const memberSuggestion = page.getByTestId(`comment-email-suggestion-${member.email}`)
  const memberSuggested = await waitUntil(() => memberSuggestion.isVisible().catch(() => false), { timeoutMs: 8000 })
  await page.getByTestId('comment-email-to-input').fill('', { timeout: 5000 }).catch(() => {})
  chk(
    suggested && fieldSource.endsWith('Email field') && memberSuggested && JSON.stringify(await chips('to')) === JSON.stringify([CLIENT]),
    'typing in To suggests the task’s Email field and the workspace’s members, and a suggestion chosen is an address in To',
    JSON.stringify({ suggested, fieldSource, memberSuggested, to: await chips('to') }),
  )

  // ══ 4. SENT, AS AN EMAIL ═══════════════════════════════════════════════════
  console.log('\n▶ To, Cc, Bcc, a subject, the words and a file — Send')
  await page.getByTestId('comment-email-show-cc').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-cc-input').fill(PARTNER, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-cc-input').press('Enter').catch(() => {})
  await page.getByTestId('comment-email-show-bcc').click({ timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-bcc-input').fill(QUIET, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-bcc-input').press('Enter').catch(() => {})
  const subject = `Quote ${TAG}`
  const words = `Hello Bea,\nThe quote is attached.\nAna`
  await page.getByTestId('comment-email-subject').fill(subject, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-input').fill(words, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-file-input').setInputFiles(FILE).catch(() => {})
  await page.getByTestId('comment-email-send').click({ timeout: 5000 }).catch(() => {})
  const arrived = await waitUntil(async () => (await mailTo(MAIL, CLIENT)).length === 1, { timeoutMs: 20_000 })
  const [m] = await mailTo(MAIL, CLIENT)
  // A name with a dot or a hyphen in it goes out quoted ("Ana-María via Rundesk"); read as a mail client shows it.
  const fromShown = (m?.headers.from ?? '').replace(/^"(.*)"(?= <)/, '$1')
  chk(
    arrived && JSON.stringify([...(m?.envelope.to ?? [])].sort()) === JSON.stringify([CLIENT, PARTNER, QUIET].sort())
      && fromShown === `${adminName} via Rundesk <${m?.envelope.from}>` && m?.headers.to === CLIENT && m?.headers.cc === PARTNER && m?.headers.bcc === null
      && /^reply-[0-9a-f-]{36}@/.test(m?.headers.replyTo ?? '') && /^<task-email\.[0-9a-f-]{36}@[^>]+>$/.test(m?.headers.messageId ?? '') && m?.headers.subject === subject,
    'the mail server takes one email: to the three, the blind copy in no header, from the writer “via Rundesk”, with its own address to answer to and its own Message-ID',
    JSON.stringify({ arrived, envelope: m?.envelope, headers: m?.headers }),
  )
  chk(
    m?.text === words && JSON.stringify(m?.attachments) === JSON.stringify([{ filename: FILE.name, contentType: 'text/plain', size: FILE.buffer.length, sha1: FILE_SHA1 }]),
    'its words are the box’s, and its file is the one attached, byte for byte',
    JSON.stringify({ text: m?.text, attachments: m?.attachments }),
  )

  // ══ 5. KEPT IN THE TASK ════════════════════════════════════════════════════
  console.log('\n▶ the email, kept in the task with its envelope')
  /*
   * The mail server has the email before the API has kept it — the send, then the comment, then the row its
   * answers are routed by — so the row is waited for before any of it is read, not read once
   * (`found-12-oct/comment-email-reads-the-answer-row-before-it-is-written`).
   */
  const replyId = /^reply-([0-9a-f-]{36})@/.exec(m?.headers.replyTo ?? '')?.[1] ?? null
  let outbound = null
  if (replyId) {
    await waitUntil(async () => {
      ;[outbound] = await sql`select message_id, comment_id from outbound_email_messages where id = ${replyId}`
      return !!outbound
    }, { timeoutMs: 10_000 })
  }
  const [kept] = await emailComments()
  const [envelope] = kept ? await sql`select direction, to_addresses, cc_addresses, bcc_addresses, subject, message_id from task_comment_emails where comment_id = ${kept.id}` : []
  const [file] = kept ? await sql`select file_name from task_attachments where comment_id = ${kept.id}` : []
  chk(
    kept?.body === words && kept?.parent_comment_id === null && envelope?.direction === 'out'
      && JSON.stringify([envelope?.to_addresses, envelope?.cc_addresses, envelope?.bcc_addresses]) === JSON.stringify([[CLIENT], [PARTNER], [QUIET]])
      && envelope?.subject === subject && envelope?.message_id === m?.headers.messageId
      && outbound?.message_id === m?.headers.messageId && outbound?.comment_id === kept?.id && file?.file_name === FILE.name,
    'it is the task’s email comment: its words, its envelope, its file, and the address its answers come back to — all read by SQL',
    JSON.stringify({ kept, envelope, outbound: outbound ?? null, file: file ?? null }),
  )
  const drawn = page.getByTestId(`comment-email-${kept?.id}`)
  const shownSent = await waitUntil(() => drawn.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const lines = {
    to: (await readText(page.getByTestId(`comment-email-${kept?.id}-to`).filter({ visible: true }), { timeoutMs: 2000 })).trim(),
    cc: (await readText(page.getByTestId(`comment-email-${kept?.id}-cc`).filter({ visible: true }), { timeoutMs: 2000 })).trim(),
    bcc: (await readText(page.getByTestId(`comment-email-${kept?.id}-bcc`).filter({ visible: true }), { timeoutMs: 2000 })).trim(),
    subject: (await readText(page.getByTestId(`comment-email-${kept?.id}-subject`).filter({ visible: true }), { timeoutMs: 2000 })).trim(),
  }
  const backToComment = await page.getByTestId('comment-mode-trigger').getAttribute('data-mode').catch(() => null)
  chk(
    shownSent && (await drawn.getAttribute('data-direction').catch(() => null)) === 'out'
      && lines.to === `To: ${CLIENT}` && lines.cc === `Cc: ${PARTNER}` && lines.bcc === `Bcc: ${QUIET}` && lines.subject === `Subject: ${subject}` && backToComment === 'comment',
    'the thread draws it as an email — whom it went to, copied and blind-copied, and its subject — and the box is a comment box again',
    JSON.stringify({ shownSent, lines, backToComment }),
  )
  const asAdmin = (await A(`/tasks/${TASK}/comments`)).data?.find?.((c) => c.id === kept?.id)?.email
  const asMember = (await member.api(`/tasks/${TASK}/comments`)).data?.find?.((c) => c.id === kept?.id)?.email
  chk(
    JSON.stringify(asAdmin?.bcc) === JSON.stringify([QUIET]) && JSON.stringify(asMember?.bcc) === JSON.stringify([]) && JSON.stringify(asMember?.cc) === JSON.stringify([PARTNER]),
    'its blind copies are its writer’s to read: a member reading the task is told whom it went to and copied to, not whom it was blind-copied to',
    JSON.stringify({ admin: asAdmin ?? null, member: asMember ?? null }),
  )

  // ══ 6. THE ANSWERS LAND UNDER IT ═══════════════════════════════════════════
  console.log('\n▶ an answer from somebody it went to, and one from a stranger')
  // The mail provider's webhook: no one signed in, the shared client with no token.
  const provider = apiAs(null)
  const inbound = (body) => provider('/inbound/email', { method: 'POST', body })
  const answerId = `<answer.${TAG}@example.com>`
  const answer = await inbound({
    MessageID: answerId,
    From: `Bea Client <${CLIENT}>`,
    To: m?.headers.replyTo ?? '',
    Subject: `Re: ${subject}`,
    TextBody: 'Thanks, that works for us.\n\nOn Thu, Ana via Rundesk wrote:\n> Hello Bea,',
    InReplyTo: m?.headers.messageId ?? '',
  })
  const answered = answer.data?.commentId ? (await sql`select body, parent_comment_id, channel from task_comments where id = ${answer.data.commentId}`)[0] : null
  const [answerEnvelope] = answer.data?.commentId ? await sql`select direction, from_address from task_comment_emails where comment_id = ${answer.data.commentId}` : []
  chk(
    answer.data?.outcome === 'comment_added' && answered?.body === 'Thanks, that works for us.' && answered?.parent_comment_id === kept?.id && answered?.channel === 'email'
      && answerEnvelope?.direction === 'in' && answerEnvelope?.from_address === CLIENT,
    'an answer from somebody it went to lands in the task, under the email, as an email that came in from them (read by SQL)',
    JSON.stringify({ answer, answered, envelope: answerEnvelope ?? null }),
  )
  const commentsBefore = (await sql`select count(*)::int as n from task_comments where task_id = ${TASK}`)[0].n
  const stranger = await inbound({ MessageID: `<stranger.${TAG}@example.com>`, From: STRANGER, To: m?.headers.replyTo ?? '', Subject: `Re: ${subject}`, TextBody: 'Let me in.' })
  const commentsAfter = (await sql`select count(*)::int as n from task_comments where task_id = ${TASK}`)[0].n
  chk(
    stranger.data?.outcome === 'rejected_not_allowed' && commentsAfter === commentsBefore,
    'a stranger who writes to the same address is refused, and nothing is written in anybody’s name',
    JSON.stringify({ stranger, commentsBefore, commentsAfter }),
  )

  // ══ 7. ANSWERED BY EMAIL ═══════════════════════════════════════════════════
  console.log('\n▶ the answer, answered by email from the thread')
  await openComments()
  const answerDrawn = page.getByTestId(`comment-email-${answer.data?.commentId}`)
  const inShown = await waitUntil(() => answerDrawn.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const inBadge = (await readText(answerDrawn.filter({ visible: true }), { timeoutMs: 2000 })).trim()
  await page.getByTestId(`comment-email-answer-${answer.data?.commentId}`).click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-form').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const prefilled = { to: await chips('to'), subject: await page.getByTestId('comment-email-subject').inputValue().catch(() => null) }
  await page.getByTestId('comment-input').fill('Glad to hear it. Signing tomorrow.', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-send').click({ timeout: 5000 }).catch(() => {})
  const second = await waitUntil(async () => (await mailTo(MAIL, CLIENT)).length === 2, { timeoutMs: 20_000 })
  const m2 = (await mailTo(MAIL, CLIENT))[1]
  const latest = (await emailComments()).at(-1)
  chk(
    inShown && inBadge.includes(`Email from ${CLIENT}`) && JSON.stringify(prefilled) === JSON.stringify({ to: [CLIENT], subject: `Re: ${subject}` })
      && second && m2?.headers.inReplyTo === answerId && m2?.headers.subject === `Re: ${subject}` && m2?.text === 'Glad to hear it. Signing tomorrow.'
      && latest?.parent_comment_id === kept?.id,
    'the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread',
    JSON.stringify({ inShown, inBadge, prefilled, second, headers: m2?.headers ?? null, latest }),
  )

  // ══ 8. A REFUSAL IS SAID ═══════════════════════════════════════════════════
  console.log('\n▶ the mail server refuses one')
  await failMailTo(MAIL, REFUSER, 554, 1)
  const countBefore = (await emailComments()).length
  await chooseEmail()
  await page.getByTestId('comment-email-to-input').fill(REFUSER, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-to-input').press('Enter').catch(() => {})
  await page.getByTestId('comment-input').fill(`This one bounces ${TAG}`, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('comment-email-send').click({ timeout: 5000 }).catch(() => {})
  const errorShown = await waitUntil(() => page.getByTestId('comment-email-error').isVisible().catch(() => false), { timeoutMs: 15_000 })
  const errorText = (await readText(page.getByTestId('comment-email-error').filter({ visible: true }), { timeoutMs: 2000 })).trim()
  const kept2 = { to: await chips('to'), words: await page.getByTestId('comment-input').inputValue().catch(() => null) }
  chk(
    errorShown && errorText.startsWith('The mail server did not take it: 554 5.7.1') && JSON.stringify(kept2) === JSON.stringify({ to: [REFUSER], words: `This one bounces ${TAG}` })
      && (await emailComments()).length === countBefore && (await mailTo(MAIL, REFUSER)).length === 0,
    'refused by the mail server, the box says what it said, keeps everything typed, and nothing is kept as sent',
    JSON.stringify({ errorShown, errorText, kept: kept2 }),
  )

  // ══ 9. WHO MAY NOT, AND WHAT IS NOT AN EMAIL ═══════════════════════════════
  console.log('\n▶ a guest, an address that is not one, and an edit')
  const guestSetup = await guest.api(emailRoute)
  const guestSend = await guest.api(emailRoute, { method: 'POST', body: { to: [CLIENT], body: 'From a guest' } })
  chk(
    guestSetup.status === 200 && guestSetup.data?.available === false && guestSetup.data?.reason === 'guest' && guestSend.status === 403 && guestSend.message === REFUSED.guest,
    'a guest who may comment on the task is told Email is not for guests, and a send is refused in words (403)',
    JSON.stringify({ setup: guestSetup.data ?? guestSetup.status, send: said(guestSend) }),
  )
  const notAnAddress = await A(emailRoute, { method: 'POST', body: { to: ['not an address'], body: 'x' } })
  const nobody = await A(emailRoute, { method: 'POST', body: { to: [], cc: [PARTNER], body: 'x' } })
  chk(
    notAnAddress.status === 400 && notAnAddress.message === REFUSED.notAnAddress && nobody.status === 400 && nobody.message === REFUSED.noRecipient,
    'an address that is not one is named in the refusal, and an email with nobody in To is refused (400)',
    `${said(notAnAddress)}; ${said(nobody)}`,
  )
  const edited = await A(`/tasks/${TASK}/comments/${kept?.id}`, { method: 'PATCH', body: { body: 'Rewritten' } })
  const [still] = kept ? await sql`select body from task_comments where id = ${kept.id}` : []
  await openComments()
  const editOffered = await page.locator(`li[data-comment-id="${kept?.id}"]`).getByRole('button', { name: 'Edit', exact: true }).count().catch(() => -1)
  chk(
    edited.status === 400 && edited.message === REFUSED.edit && still?.body === words && editOffered === 0,
    'what an email said is what went: an edit is refused in words (400), and the thread offers none',
    JSON.stringify({ edited: said(edited), still: still ?? null, editOffered }),
  )
  const off = await A(`/feature-flags/tasks.email`, { method: 'PUT', body: { enabled: false, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  const offAgain = await A(emailRoute)
  chk(
    off.status === 200 && offAgain.data?.available === false && offAgain.data?.reason === 'off',
    'turned off again, Email is off again',
    JSON.stringify({ off: said(off), setup: offAgain.data ?? offAgain.status }),
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
  for (const a of ADDRESSES) await resetMailTo(MAIL, a).catch((e) => console.log(`  cleanup left the mail to ${a}: ${e.message}`))
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
