/**
 * A TASK'S EMAIL FROM A MAILBOX LINKED OVER IMAP, AS CLICKUP'S "SIGN IN WITH
 * IMAP" LINKS ONE (`found-12-oct/task-email-imap-unbuilt`).
 *
 * ClickUp (help centre, "Connect an email with IMAP", read through search
 * excerpts, 13 October): the comment box's From → "Link an email" → "Sign in
 * with IMAP" asks for the email, the password (an app password where the
 * provider wants one), the IMAP server and port, the SMTP server and port, and
 * whether SSL is required — Yahoo's imap.mail.yahoo.com:993 and
 * smtp.mail.yahoo.com:465 its example — and then who may send from it, as for
 * Gmail and Outlook; Free has one account of 100 uses, Business two.
 *
 * Measured before it was built (13 October, lane 9 at 7d3a718): no route
 * answered `POST /workspaces/:id/email-accounts/imap` (404), and
 * `email-accounts/connect/imap` was refused "Only Gmail or Outlook is linked
 * to send email" (400).
 *
 * A workspace of this run's own, on Business: its owner (the admin), Mia and
 * Max, members, and a guest. The mailboxes are the lane's mailbox stub
 * (`mailbox-stub.mjs`), which speaks IMAP and SMTP with STARTTLS on a
 * certificate the lane's API trusts by `MAILBOX_TLS_CA_FILE`, and which the
 * operator's `MAILBOX_PRIVATE_SERVERS` lets the API reach on loopback. What is
 * kept is read back by SQL; what was sent, signed in and fetched, from the stub.
 *
 *   node test/e2e/task-email-imap.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'
import { mailBase, mailTo, resetMailTo } from './lib/mail.mjs'
import { deliverTo, fetchesOf, folderOf, forgetMailbox, loginsOf, mailboxServer, makeMailbox, sentFrom } from './lib/mailbox.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 14

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const MAIL = mailBase(API_PORT, argOf('--mail', undefined))
const BOX = mailboxServer(API_PORT)
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

// The API's own words (`email-accounts.service.ts`, `email-plan.ts`, `integration-connections.service.ts`).
const SAID = {
  guest: 'Guests cannot send email from a task',
  pro: 'Pro includes one email account, and this workspace has linked it. Remove one, or upgrade, to link another.',
  address: 'An email address is needed, as name@domain',
  password: 'A password is needed, 1,000 characters at most',
  imapHost: 'The IMAP server is a name such as imap.example.com, or an address',
  smtpPort: 'The SMTP port is a whole number from 1 to 65535',
  ssl: 'Say whether the servers require SSL',
  mayNotSend: 'You may not send from this email account: whoever linked it chooses who may',
  needsReconnect: 'This email account has to be linked again before it sends',
  unreadable: 'The password kept for this mailbox no longer opens on this server: link it again',
}

const stamp = Date.now()
const TAG = `tei${stamp}`
const PASSWORD = 'TaskEmail@12345!'
const OLGA_ADDR = `olga-${TAG}@mail.test`
const OLGA_PW = `Olga ${TAG} pässwörd`
const MIA_ADDR = `mia-${TAG}@mail.test`
const MIA_PW = `mia-${TAG}-app-password`
const WRONG_ADDR = `nobody-${TAG}@mail.test`
const UI_ADDR = `desk-${TAG}@mail.test`
const UI_PW = `desk-${TAG}-pw`
const CLIENT = `client-${TAG}@example.com`
const PARTNER = `partner-${TAG}@example.com`
const QUIET = `quiet-${TAG}@example.com`
const MADE = [OLGA_ADDR, MIA_ADDR, WRONG_ADDR, UI_ADDR]

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const words = (res) => String(res?.message ?? res?.error?.message ?? '')

let sql = null
let WS = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a mailbox leaves behind is read back by SQL')
  for (const a of [CLIENT, PARTNER, QUIET]) await resetMailTo(MAIL, a)
  for (const a of MADE) await forgetMailbox(BOX.base, a)
  await makeMailbox(BOX.base, OLGA_ADDR, OLGA_PW)
  await makeMailbox(BOX.base, MIA_ADDR, MIA_PW)
  await makeMailbox(BOX.base, WRONG_ADDR, 'the-right-one')
  await makeMailbox(BOX.base, UI_ADDR, UI_PW)

  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `IMAP mailboxes ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  const [olga] = await sql`select id, display_name from users where email = ${ADMIN.email}`
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const on = await A('/feature-flags/tasks.email', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  if (!on.ok) throw new Error(`could not turn the Email ClickApp on: ${said(on)}`)

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Imap ${who} ${stamp}`, email, password: PASSWORD, organizationName: `Imap ${who} ${stamp}`, organizationSlug: `tei-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const gus = await person('gus', 'guest')

  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (!list.ok) throw new Error(`could not make the list: ${said(list)}`)
  const task = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `Lease ${TAG}` } })
  if (!task.ok || !task.data?.id) throw new Error(`could not make the task: ${said(task)}`)
  const TASK = task.data.id
  const emailRoute = `/tasks/${TASK}/comments/email`
  const linkImap = (who, over = {}) =>
    who(`/workspaces/${WS}/email-accounts/imap`, {
      method: 'POST',
      body: { address: OLGA_ADDR, password: OLGA_PW, imapHost: '127.0.0.1', imapPort: BOX.imapPort, smtpHost: '127.0.0.1', smtpPort: BOX.smtpPort, useSsl: true, ...over },
    })
  const accountRow = (address) =>
    sql`select id, owner_id, provider, address, sender_name, status, last_error, uses, imap_host, imap_port, smtp_host, smtp_port, use_ssl, password_sealed, access_token from email_accounts where workspace_id = ${WS} and address = ${address}`.then((r) => r[0] ?? null)
  const emailRows = () =>
    sql`select e.direction, e.from_address, e.subject, e.account_id, e.provider_thread_id, e.provider_message_id, e.message_id, c.id as comment_id, c.parent_comment_id, c.body, c.author_id from task_comment_emails e join task_comments c on c.id = e.comment_id where c.task_id = ${TASK} order by e.created_at`

  // ══ 1. A MAILBOX LINKED BY ITS SERVERS ═══════════════════════════════════════
  console.log('\n▶ Olga links her mailbox over IMAP, SSL required')
  const linked = await linkImap(A)
  const olgaRow = await accountRow(OLGA_ADDR)
  const olgaLogins = await loginsOf(BOX.base, OLGA_ADDR)
  const olgaName = (olga.display_name ?? '').trim() || ADMIN.email.split('@')[0]
  const answered = JSON.stringify(linked.data ?? null)
  chk(
    linked.ok && linked.data?.provider === 'imap' && linked.data.address === OLGA_ADDR && linked.data.servers?.imapPort === BOX.imapPort && linked.data.servers.useSsl === true
      && !answered.includes(OLGA_PW) && !answered.includes('assword')
      && olgaRow?.provider === 'imap' && olgaRow.owner_id === olga.id && olgaRow.status === 'connected' && olgaRow.sender_name === olgaName
      && olgaRow.imap_host === '127.0.0.1' && olgaRow.imap_port === BOX.imapPort && olgaRow.smtp_port === BOX.smtpPort && olgaRow.use_ssl === true
      && /^v1:/.test(olgaRow.password_sealed ?? '') && !String(olgaRow.password_sealed).includes(OLGA_PW) && olgaRow.access_token === null
      && olgaLogins.some((l) => l.protocol === 'imap' && l.ok && l.tls) && olgaLogins.some((l) => l.protocol === 'smtp' && l.ok && l.tls),
    'Sign in with IMAP links a mailbox once it has signed in to its IMAP and SMTP servers, over TLS as asked; it is kept as its linker’s, under their name, its password sealed and given back to nobody (read by SQL and from the server’s sign-ins)',
    JSON.stringify({ linked: said(linked), answered, row: olgaRow && { ...olgaRow, password_sealed: (olgaRow.password_sealed ?? '').slice(0, 3) }, logins: olgaLogins }),
  )

  const wrong = await linkImap(A, { address: WRONG_ADDR, password: 'not-the-password' })
  const hidden = await linkImap(A, { address: `hidden-${TAG}@mail.test`, imapPort: 5432 })
  const [{ n: keptWrong }] = await sql`select count(*)::int as n from email_accounts where workspace_id = ${WS} and address in (${WRONG_ADDR}, ${`hidden-${TAG}@mail.test`})`
  chk(
    wrong.status === 400 && /^The IMAP server refused the sign-in: \[AUTHENTICATIONFAILED\] Invalid credentials/.test(words(wrong))
      && hidden.status === 400 && words(hidden) === "127.0.0.1 is on a private network: Rundesk reaches mail servers on the internet, or those this server's operator names"
      && keptWrong === 0,
    'a password the server refuses is said in its words, and a server on a private network nobody named is refused before a password goes to it; neither leaves a mailbox (read by SQL)',
    JSON.stringify({ wrong: said(wrong), hidden: said(hidden), kept: keptWrong }),
  )

  const bad = {
    address: await linkImap(A, { address: 'not an address' }),
    password: await linkImap(A, { password: '' }),
    host: await linkImap(A, { imapHost: 'imap example.com' }),
    port: await linkImap(A, { smtpPort: 0 }),
    ssl: await linkImap(A, { useSsl: 'yes' }),
  }
  chk(
    bad.address.status === 400 && words(bad.address) === SAID.address && bad.password.status === 400 && words(bad.password) === SAID.password
      && bad.host.status === 400 && words(bad.host) === SAID.imapHost && bad.port.status === 400 && words(bad.port) === SAID.smtpPort
      && bad.ssl.status === 400 && words(bad.ssl) === SAID.ssl,
    'the form is refused field by field, in words: the address, the password, each server and port, and whether SSL is required (400)',
    JSON.stringify(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, said(v)]))),
  )

  // Pro has room for one mailbox, and Olga's is it: Mia's is refused before any server is asked.
  const gusLink = await linkImap(gus.api, { address: MIA_ADDR, password: MIA_PW })
  await sql`update workspaces set plan = 'pro' where id = ${WS}`
  const proLink = await linkImap(mia.api, { address: MIA_ADDR, password: MIA_PW })
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const miaAsked = await loginsOf(BOX.base, MIA_ADDR)
  chk(
    gusLink.status === 403 && words(gusLink) === SAID.guest && proLink.status === 403 && words(proLink) === SAID.pro && miaAsked.length === 0,
    'a guest links no mailbox (403, in words); on Pro, whose one mailbox is linked, another is refused in words before any server is asked',
    JSON.stringify({ guest: said(gusLink), pro: said(proLink), asked: miaAsked.length }),
  )

  // ══ 2. SENT THROUGH ITS SMTP SERVER, ANSWERED IN ITS INBOX ═══════════════════
  console.log('\n▶ an email sent from the IMAP mailbox, and its answer read back')
  const sent1 = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], cc: [PARTNER], bcc: [QUIET], subject: `Lease terms ${TAG}`, body: `Here are the terms, ${TAG}.`, accountId: olgaRow?.id } })
  const out = await sentFrom(BOX.base, OLGA_ADDR)
  const m1 = out[0]
  const serverMail = await mailTo(MAIL, CLIENT)
  const rows1 = await emailRows()
  const out1 = rows1.find((r) => r.direction === 'out')
  const [uses1] = await sql`select uses from email_accounts where id = ${olgaRow?.id ?? null}`
  chk(
    sent1.ok && out.length === 1 && m1.tls === true && m1.envelope.from === OLGA_ADDR && [CLIENT, PARTNER, QUIET].every((a) => m1.envelope.to.includes(a))
      && m1.headers.bcc === null && (m1.headers.from ?? '').includes(OLGA_ADDR) && m1.headers.to === CLIENT && m1.headers.cc === PARTNER
      && m1.headers.subject === `Lease terms ${TAG}` && m1.text === `Here are the terms, ${TAG}.` && /^<rd\.[0-9a-f-]+@mail\.test>$/.test(m1.headers.messageId ?? '')
      && serverMail.length === 0 && out1?.account_id === olgaRow?.id && out1.provider_thread_id === m1.headers.messageId && out1.message_id === m1.headers.messageId && uses1?.uses === 1,
    'sent from the IMAP mailbox through its own SMTP server, signed in as it over TLS: its people, subject and words, the Bcc in the envelope and in no header; the server’s own mail sent nothing; kept as the task’s email with its Message-ID as the thread, one use taken (read by SQL and from what the server was sent)',
    JSON.stringify({ sent: said(sent1), out: out.map((m) => ({ tls: m.tls, envelope: m.envelope, headers: m.headers, text: m.text })), serverMail: serverMail.length, row: out1 ?? null, uses: uses1?.uses }),
  )

  const delivered = await deliverTo(BOX.base, {
    to: OLGA_ADDR,
    from: `The Client <${CLIENT}>`,
    subject: `Re: Lease terms ${TAG}`,
    text: `Agreed, ${TAG}.\n\nOn Tue, 13 Oct 2026, Olga wrote:\n> Here are the terms.`,
    inReplyTo: m1?.headers.messageId ?? '<none@x>',
    references: [m1?.headers.messageId ?? '<none@x>'],
  })
  const landed = await waitUntil(async () => (await emailRows()).some((r) => r.direction === 'in'), { timeoutMs: 15_000 })
  // Three more reads of the inbox: the answer lands once, and is not fetched whole again.
  await new Promise((r) => setTimeout(r, 6000))
  const ins = (await emailRows()).filter((r) => r.direction === 'in')
  const fetched = (await fetchesOf(BOX.base, OLGA_ADDR)).filter((f) => f.uid === delivered.uid)
  chk(
    landed && ins.length === 1 && ins[0].from_address === CLIENT && ins[0].body === `Agreed, ${TAG}.` && ins[0].parent_comment_id === out1?.comment_id
      && ins[0].author_id === olga.id && ins[0].account_id === olgaRow?.id && ins[0].provider_message_id === `imap:${delivered.messageId}` && fetched.length === 1,
    'the client’s answer, delivered to the inbox naming the email it answers, lands in the task once, under the email, without its quote — and later reads do not fetch it again (read by SQL and from the server’s fetches)',
    JSON.stringify({ landed, ins, fetched: fetched.length }),
  )

  const answerBack = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `Signed, ${TAG}.`, parentCommentId: ins[0]?.comment_id, accountId: olgaRow?.id } })
  const m2 = (await sentFrom(BOX.base, OLGA_ADDR))[1]
  const out2 = (await emailRows()).filter((r) => r.direction === 'out').slice(-1)[0]
  chk(
    answerBack.ok && m2?.headers.inReplyTo === delivered.messageId && (m2.headers.references ?? '').includes(m1?.headers.messageId ?? '-') && (m2.headers.references ?? '').includes(delivered.messageId)
      && /^Re: Lease terms/.test(m2.headers.subject ?? '') && out2?.provider_thread_id === m1?.headers.messageId && out2.parent_comment_id === out1?.comment_id,
    'answering it by email goes through the same SMTP server in the same thread: In-Reply-To the answer, References the thread’s first email, kept under the same email (read by SQL)',
    JSON.stringify({ sent: said(answerBack), reply: m2 && m2.headers, row: out2 ?? null }),
  )

  // ══ 3. IN THE CLEAR ONLY WHEN CHOSEN; SENT FOR WHOM ITS LINKER LETS ═══════════
  console.log('\n▶ Mia links hers without SSL; Max sends from Olga’s once she lets him')
  const miaLink = await linkImap(mia.api, { address: MIA_ADDR, password: MIA_PW, useSsl: false })
  const miaLogins = await loginsOf(BOX.base, MIA_ADDR)
  const olgaAll = await loginsOf(BOX.base, OLGA_ADDR)
  chk(
    miaLink.ok && miaLink.data?.servers?.useSsl === false && miaLogins.length >= 2 && miaLogins.every((l) => l.ok && l.tls === false)
      && olgaAll.filter((l) => l.ok).length >= 3 && olgaAll.filter((l) => l.ok).every((l) => l.tls === true),
    'a mailbox linked without SSL is signed in to in the clear, as its linker chose; one that requires it never sends its password in the clear (read from the server’s sign-ins)',
    JSON.stringify({ mia: said(miaLink), miaLogins, olga: olgaAll.map((l) => `${l.protocol}:${l.tls}:${l.ok}`) }),
  )

  const maxBefore = await max.api(emailRoute, { method: 'POST', body: { to: [PARTNER], body: `From Max ${TAG}`, accountId: olgaRow?.id } })
  const shared = await A(`/workspaces/${WS}/email-accounts/${olgaRow?.id}`, { method: 'PATCH', body: { senders: [max.id] } })
  const maxAfter = await max.api(emailRoute, { method: 'POST', body: { to: [PARTNER], subject: `Keys ${TAG}`, body: `From Max ${TAG}`, accountId: olgaRow?.id } })
  const m3 = (await sentFrom(BOX.base, OLGA_ADDR)).slice(-1)[0]
  chk(
    maxBefore.status === 403 && words(maxBefore) === SAID.mayNotSend && shared.ok && maxAfter.ok && m3?.headers.subject === `Keys ${TAG}` && m3.envelope.from === OLGA_ADDR && m3.text === `From Max ${TAG}`,
    'the mailbox sends for whom its linker lets it: Max is refused (403, in words) until Olga lets him, and then his email goes from her mailbox',
    JSON.stringify({ before: said(maxBefore), shared: said(shared), after: said(maxAfter), sent: m3 && { subject: m3.headers.subject, from: m3.envelope.from } }),
  )

  // ══ 4. WHEN THE PASSWORD STOPS OPENING IT ═══════════════════════════════════
  console.log('\n▶ the password changed at the provider, and a sealed password moved to another row')
  await makeMailbox(BOX.base, OLGA_ADDR, `${OLGA_PW} new`)
  const marked = await waitUntil(async () => (await accountRow(OLGA_ADDR))?.status === 'needs_reconnect', { timeoutMs: 20_000 })
  const markedRow = await accountRow(OLGA_ADDR)
  const refusedSend = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `while refused ${TAG}`, accountId: olgaRow?.id } })
  const relinked = await linkImap(A, { password: `${OLGA_PW} new` })
  const relinkedRow = await accountRow(OLGA_ADDR)
  chk(
    marked && /refused the sign-in: \[AUTHENTICATIONFAILED\]/.test(markedRow?.last_error ?? '') && refusedSend.status === 409 && words(refusedSend).startsWith(SAID.needsReconnect)
      && relinked.ok && relinkedRow?.id === olgaRow?.id && relinkedRow.status === 'connected' && relinkedRow.last_error === null,
    'when the provider stops taking the password, the next read of the inbox marks the mailbox to link again in the server’s words, and From refuses it (409); linked again with the new password, it is the same mailbox, connected (read by SQL)',
    JSON.stringify({ marked, row: markedRow && { status: markedRow.status, last_error: markedRow.last_error }, send: said(refusedSend), relinked: said(relinked), after: relinkedRow && { id: relinkedRow.id === olgaRow?.id, status: relinkedRow.status } }),
  )

  const miaRow = await accountRow(MIA_ADDR)
  await sql`update email_accounts set password_sealed = ${miaRow?.password_sealed ?? 'v1:x:x:x'} where id = ${olgaRow?.id ?? null}`
  const moved = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `moved ${TAG}`, accountId: olgaRow?.id } })
  const movedRow = await accountRow(OLGA_ADDR)
  const sentCount = (await sentFrom(BOX.base, OLGA_ADDR)).length
  chk(
    moved.status === 502 && words(moved) === SAID.unreadable && movedRow?.status === 'needs_reconnect' && movedRow.last_error === SAID.unreadable && sentCount === 3,
    'a password sealed for another mailbox does not open in this one: the send is refused in words (502, not 500), nothing is sent, and the mailbox is marked to link again (read by SQL)',
    JSON.stringify({ send: said(moved), row: movedRow && { status: movedRow.status, last_error: movedRow.last_error }, sent: sentCount }),
  )
  await linkImap(A, { password: `${OLGA_PW} new` })

  // ══ 5. THE AI'S DRAFT, LEFT IN ITS DRAFTS ═══════════════════════════════════
  console.log('\n▶ a draft the AI leaves in the IMAP mailbox')
  const draftRes = await A('/ai/command/execute', {
    method: 'POST',
    body: { workspaceId: WS, actions: [{ tool: 'draft_email', args: { workspaceId: WS, accountId: olgaRow?.id, to: [CLIENT], subject: `Draft ${TAG}`, body: `Draft words, ${TAG}.` }, humanLabel: `Save a draft “Draft ${TAG}”` }] },
  })
  const r = draftRes.data?.results?.[0]
  const drafts = (await folderOf(BOX.base, OLGA_ADDR, 'Drafts')) ?? []
  const theDraft = drafts.find((d) => d.headers.subject === `Draft ${TAG}`)
  chk(
    r?.status === 'succeeded' && r.external?.kind === 'draft' && r.external.provider === 'imap' && r.external.where === OLGA_ADDR
      && theDraft?.flags.includes('\\Draft') && theDraft.headers.to === CLIENT && theDraft.text === `Draft words, ${TAG}.` && (await sentFrom(BOX.base, OLGA_ADDR)).length === 3,
    'the AI’s draft is left in the IMAP mailbox’s Drafts, flagged a draft, and sent to nobody',
    JSON.stringify({ result: r ?? said(draftRes), drafts: drafts.map((d) => ({ subject: d.headers.subject, flags: d.flags })) }),
  )

  // ══ 6. THE COMPOSER AND THE EMAIL SETTINGS ═══════════════════════════════════
  await sql`update workspaces set plan = 'enterprise' where id = ${WS}`
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  console.log('\n▶ From › Link an email › Sign in with IMAP, then Send')
  await page.goto(`${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-comments').click({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('comment-input').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  // Comment ▾ › Email, once its row is offered; a press that cannot land closes the menu and tries once more.
  let emailOpened = false
  for (let attempt = 0; attempt < 2 && !emailOpened; attempt++) {
    await page.getByTestId('comment-mode-trigger').click({ timeout: 10_000 }).catch(() => {})
    const row = page.getByTestId('comment-mode-item-email').filter({ visible: true })
    await waitUntil(async () => (await row.getAttribute('data-available').catch(() => null)) === 'yes', { timeoutMs: 10_000 })
    if (await row.click({ timeout: 5000 }).then(() => true, () => false)) {
      emailOpened = await page.getByTestId('comment-email-form').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }
  await page.getByTestId('comment-email-link').filter({ visible: true }).click({ timeout: 8000 }).catch(() => {})
  const imapOffered = await page.getByTestId('comment-email-link-imap').filter({ visible: true }).innerText({ timeout: 8000 }).catch(() => '')
  await page.getByTestId('comment-email-link-imap').filter({ visible: true }).click({ timeout: 8000 }).catch(() => {})
  const dialog = page.getByTestId('imap-link-dialog').filter({ visible: true })
  await dialog.waitFor({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-address').fill(UI_ADDR, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-password').fill(UI_PW, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-imap-host').fill('127.0.0.1', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-imap-port').fill(String(BOX.imapPort), { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-smtp-host').fill('127.0.0.1', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-smtp-port').fill(String(BOX.smtpPort), { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-link').click({ timeout: 8000 }).catch(() => {})
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
  const uiRow = await accountRow(UI_ADDR)
  const fromSelect = page.getByTestId('comment-email-from-select').filter({ visible: true })
  await waitUntil(async () => (await fromSelect.inputValue().catch(() => '')) === uiRow?.id, { timeoutMs: 10_000 })
  const fromChosen = await fromSelect.inputValue().catch(() => '')
  await page.getByTestId('comment-email-to-input').fill(CLIENT, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-to-input').press('Enter', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-subject').fill(`From the box ${TAG}`, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-input').fill(`Sent from the box, ${TAG}.`, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-send').click({ timeout: 8000 }).catch(() => {})
  const uiSent = await waitUntil(async () => (await sentFrom(BOX.base, UI_ADDR)).length === 1, { timeoutMs: 15_000 })
  const uiMail = (await sentFrom(BOX.base, UI_ADDR))[0]
  chk(
    emailOpened && /Sign in with IMAP/.test(imapOffered) && uiRow?.provider === 'imap' && uiRow.owner_id === olga.id && uiRow.use_ssl === true && fromChosen === uiRow.id
      && uiSent && uiMail?.headers.subject === `From the box ${TAG}` && uiMail.envelope.to.includes(CLIENT) && uiMail.tls === true,
    'From’s Link an email offers Sign in with IMAP; its form links the mailbox, From chooses it at once, and Send sends from it over TLS',
    JSON.stringify({ emailOpened, imapOffered, row: uiRow && { provider: uiRow.provider, ssl: uiRow.use_ssl, id: uiRow.id }, fromChosen, uiSent, mail: uiMail && { subject: uiMail.headers.subject, to: uiMail.envelope.to, tls: uiMail.tls } }),
  )

  console.log('\n▶ the Email settings name the IMAP mailbox, link it again from its servers, and say a refusal')
  await sql`update email_accounts set status = 'needs_reconnect', last_error = 'staged' where id = ${olgaRow?.id ?? null}`
  await page.goto(`${B}/app/${WS}/email`, { waitUntil: 'domcontentloaded' })
  const olgaSettings = page.locator(`[data-testid="email-account-row"][data-account-id="${olgaRow?.id}"]`)
  await olgaSettings.waitFor({ timeout: 15_000 }).catch(() => {})
  const providerShown = await olgaSettings.getByTestId('email-account-provider').filter({ visible: true }).innerText().catch(() => '')
  const serversShown = await olgaSettings.getByTestId('email-account-servers').filter({ visible: true }).innerText().catch(() => '')
  await olgaSettings.getByTestId('email-account-relink').click({ timeout: 8000 }).catch(() => {})
  const again = page.getByTestId('imap-link-dialog').filter({ visible: true })
  await again.waitFor({ timeout: 8000 }).catch(() => {})
  const startedFrom = {
    address: await page.getByTestId('imap-address').inputValue().catch(() => null),
    password: await page.getByTestId('imap-password').inputValue().catch(() => null),
    imapPort: await page.getByTestId('imap-imap-port').inputValue().catch(() => null),
    smtpPort: await page.getByTestId('imap-smtp-port').inputValue().catch(() => null),
  }
  await page.getByTestId('imap-password').fill('not-the-password', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('imap-link').click({ timeout: 8000 }).catch(() => {})
  const refusal = await page.getByTestId('imap-refusal').filter({ visible: true }).innerText({ timeout: 15_000 }).catch(() => '')
  chk(
    providerShown === 'IMAP' && serversShown === `IMAP 127.0.0.1:${BOX.imapPort} · SMTP 127.0.0.1:${BOX.smtpPort}`
      && startedFrom.address === OLGA_ADDR && startedFrom.password === '' && startedFrom.imapPort === String(BOX.imapPort) && startedFrom.smtpPort === String(BOX.smtpPort)
      && /refused the sign-in: \[AUTHENTICATIONFAILED\]/.test(refusal),
    'the Email settings name an IMAP mailbox by its servers; Link it again opens its form started from them, the password left blank; a password the server refuses is said in the form, in its words',
    JSON.stringify({ providerShown, serversShown, startedFrom, refusal }),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${err?.stack ?? err}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    if (WS) await sql`delete from workspaces where id = ${WS}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  for (const a of MADE) await forgetMailbox(BOX.base, a).catch(() => {})
  for (const a of [CLIENT, PARTNER, QUIET]) await resetMailTo(MAIL, a).catch(() => {})
  stack.close()
}

const ran = passed + failed
if (ran !== EXPECTED_CHECKS) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${ran} checks, expected exactly ${EXPECTED_CHECKS}`)
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed > 0 ? 1 : 0
