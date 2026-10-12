/**
 * A TASK'S EMAIL FROM THE WRITER'S OWN MAILBOX, AS CLICKUP'S EMAIL CLICKAPP
 * SENDS IT (`found-9-oct/task-email-sends-from-the-server`).
 *
 * ClickUp (help centre, "Use Email in ClickUp", "Schedule comments and
 * emails"; read through search excerpts, 9 and 12 October): the comment box's
 * From links an email account — Gmail or Outlook, signed in at the provider —
 * under a sender name, and its owner chooses the teammates who may send from
 * it too; the email goes from that mailbox and its answers are read from it
 * into the task; on Business and above a person keeps signatures and the
 * workspace templates; Free has one account of 100 uses, Unlimited (Pro here)
 * one with no cap and scheduling, Business two; the arrow beside Send sends
 * later, and the task shows it until then, to be sent now or cancelled.
 *
 * Measured before it was built (12 October, wt-b35 at 8490475, lane 8): no
 * route answered `POST /workspaces/:id/email-accounts/connect/gmail` (404) and
 * an email went from the server's address alone.
 *
 * A workspace of this run's own, on Business: its owner (the admin), Mia and
 * Max, members, and a guest. The mailboxes are the lane's stub
 * (`calendar-stub.mjs`), a bearer token each, through the product's own
 * consent flow; what is kept is read back by SQL, and that the server's own
 * mail sent nothing, from the lane's mail stub.
 *
 *   node test/e2e/task-email-accounts.mjs --api 3028 --dist /tmp/claude-0/dist-8
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'
import { mailBase, mailTo, resetMailTo } from './lib/mail.mjs'
import { calendarBase, seedConsentCode, seedMailbox, readMailbox, answerInMailbox, failMailbox } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 19

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const MAIL = mailBase(API_PORT, argOf('--mail', undefined))
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
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

// The API's own words (`email-plan.ts`, `email-accounts.service.ts`, `integration-connections.service.ts`).
const SAID = {
  guest: 'Guests cannot send email from a task',
  notAMailbox: 'Only Gmail or Outlook is linked to send email',
  pro: 'Pro includes one email account, and this workspace has linked it. Remove one, or upgrade, to link another.',
  notYours: 'Only whoever linked this email account changes it',
  mayNotSend: 'You may not send from this email account: whoever linked it chooses who may',
  uses: 'This email account has used its 100 emails on Free. Upgrade to keep sending from it.',
  scheduling: 'Scheduling an email is on Pro and above; Free sends it now.',
  signatures: 'Email signatures and templates are on Business and above, not Pro.',
  notYourTemplate: 'Only whoever made this template, or an owner or admin, changes it',
}

const stamp = Date.now()
const TAG = `tea${stamp}`
const PASSWORD = 'TaskEmail@12345!'
const OLGA_GM = `${TAG}-olga-gmail`
const OLGA_ADDRESS = `olga-${TAG}@gmail.test`
const MIA_OL = `${TAG}-mia-outlook`
const MIA_ADDRESS = `mia-${TAG}@outlook.test`
const CLIENT = `client-${TAG}@example.com`
const PARTNER = `partner-${TAG}@example.com`
const QUIET = `quiet-${TAG}@example.com`
const FILE = Buffer.from(`Quote for ${TAG}\nTwo lines of it.\n`)

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const words = (res) => String(res?.message ?? res?.error?.message ?? '')

let sql = null
let WS = null
let A = null
let browser = null
let codes = 0

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what an email leaves behind is read back by SQL')
  for (const a of [CLIENT, PARTNER, QUIET]) await resetMailTo(MAIL, a)
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Mailboxes ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  const [olga] = await sql`select id, display_name from users where email = ${ADMIN.email}`
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const on = await A('/feature-flags/tasks.email', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  if (!on.ok) throw new Error(`could not turn the Email ClickApp on: ${said(on)}`)

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Mail ${who} ${stamp}`, email, password: PASSWORD, organizationName: `Mail ${who} ${stamp}`, organizationSlug: `tea-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, email, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const gus = await person('gus', 'guest')
  const M = mia.api
  const X = max.api

  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (!list.ok) throw new Error(`could not make the list: ${said(list)}`)
  const task = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `Lease ${TAG}` } })
  if (!task.ok || !task.data?.id) throw new Error(`could not make the task: ${said(task)}`)
  const TASK = task.data.id
  const presign = await A(`/tasks/${TASK}/attachments/presign`, { method: 'POST', body: { fileName: `quote-${TAG}.txt`, contentType: 'text/plain', sizeBytes: FILE.length } })
  const put = presign.data?.uploadUrl ? await fetch(presign.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: FILE }).then((r) => r.status, () => 0) : 0
  const file = presign.data?.storageKey
    ? await A(`/tasks/${TASK}/attachments`, { method: 'POST', body: { fileName: `quote-${TAG}.txt`, storageKey: presign.data.storageKey, contentType: 'text/plain', sizeBytes: FILE.length } })
    : { ok: false }
  if (put !== 200 || !file.ok) throw new Error(`could not put a file on the task: PUT ${put}, ${said(file)}`)
  const FILE_ID = file.data.id
  const emailRoute = `/tasks/${TASK}/comments/email`
  const accountRow = (address) => sql`select id, owner_id, provider, address, sender_name, status, access_token, uses, last_error from email_accounts where workspace_id = ${WS} and address = ${address}`.then((r) => r[0] ?? null)
  const emailRows = () => sql`select e.direction, e.from_address, e.to_addresses, e.subject, e.account_id, e.provider_thread_id, e.provider_message_id, c.id as comment_id, c.parent_comment_id, c.body, c.author_id from task_comment_emails e join task_comments c on c.id = e.comment_id where c.task_id = ${TASK} order by e.created_at`

  /** A mailbox linked through the product's own consent flow: its start, the provider's code, its callback. */
  const link = async (who, provider, { token, address, name }) => {
    const start = await who(`/workspaces/${WS}/email-accounts/connect/${provider}`, { method: 'POST' })
    const authUrl = start.data?.authUrl ? new URL(start.data.authUrl) : null
    const state = authUrl?.searchParams.get('state') ?? null
    const code = `${token}-code-${(codes += 1)}`
    await seedConsentCode(STUB, { code, accessToken: token, refreshToken: `${token}-refresh`, email: address, sub: `${token}-sub`, scopes: (authUrl?.searchParams.get('scope') ?? '').split(' '), provider: provider === 'outlook' ? 'outlook' : undefined, name })
    await seedMailbox(STUB, { token, provider, address, name, refreshToken: `${token}-refresh` })
    const back = state ? await fetch(`${API}/integrations/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
    return { start, scope: authUrl?.searchParams.get('scope') ?? '', back: back?.status ?? 0, landed: (back?.headers.get('location') ?? '').replace(/^https?:\/\/[^/]+/, '') }
  }

  // ══ 1. A MAILBOX LINKED THROUGH ITS PROVIDER'S CONSENT ═══════════════════════
  console.log('\n▶ the owner links their Gmail, Mia her Outlook')
  const olgaLink = await link(A, 'gmail', { token: OLGA_GM, address: OLGA_ADDRESS, name: 'Olga Gmail' })
  const olgaRow = await accountRow(OLGA_ADDRESS)
  const olgaName = (olga.display_name ?? '').trim() || ADMIN.email.split('@')[0]
  chk(
    olgaLink.start.ok && /gmail\.send/.test(olgaLink.scope) && /gmail\.readonly/.test(olgaLink.scope) && olgaLink.back === 302 && olgaLink.landed.startsWith(`/app/${WS}/email?`) && olgaLink.landed.includes('connected=gmail')
      && olgaRow?.provider === 'gmail' && olgaRow.owner_id === olga.id && olgaRow.status === 'connected' && olgaRow.access_token === OLGA_GM && olgaRow.sender_name === olgaName,
    'a Gmail is linked through Google’s consent, asked to send and read mail, and comes back to the Email settings — kept as the owner’s, under their name (read by SQL)',
    JSON.stringify({ start: said(olgaLink.start), scope: olgaLink.scope, back: olgaLink.back, landed: olgaLink.landed, row: olgaRow && { ...olgaRow, access_token: olgaRow.access_token === OLGA_GM } }),
  )

  // Pro has room for one mailbox: the second is refused before the provider is asked.
  await sql`update workspaces set plan = 'pro' where id = ${WS}`
  const proStart = await M(`/workspaces/${WS}/email-accounts/connect/outlook`, { method: 'POST' })
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const miaLink = await link(M, 'outlook', { token: MIA_OL, address: MIA_ADDRESS, name: 'Mia Outlook' })
  const miaRow = await accountRow(MIA_ADDRESS)
  chk(
    proStart.status === 403 && words(proStart) === SAID.pro
      && miaLink.start.ok && /Mail\.Send/.test(miaLink.scope) && /Mail\.ReadWrite/.test(miaLink.scope) && miaLink.back === 302 && miaLink.landed.includes('connected=outlook')
      && miaRow?.provider === 'outlook' && miaRow.owner_id === mia.id && miaRow.status === 'connected',
    'on Pro, which has one mailbox, a second is refused in words before Microsoft is asked; on Business, Mia links her Outlook through Microsoft’s consent, as hers (read by SQL)',
    JSON.stringify({ pro: said(proStart), start: said(miaLink.start), scope: miaLink.scope, back: miaLink.back, landed: miaLink.landed, row: miaRow && { ...miaRow, access_token: undefined } }),
  )

  const gusStart = await gus.api(`/workspaces/${WS}/email-accounts/connect/gmail`, { method: 'POST' })
  const driveStart = await A(`/workspaces/${WS}/email-accounts/connect/google-drive`, { method: 'POST' })
  const gusSetup = await gus.api(`/workspaces/${WS}/email-accounts`)
  chk(
    gusStart.status === 403 && words(gusStart) === SAID.guest && gusSetup.status === 403 && driveStart.status === 400 && words(driveStart) === SAID.notAMailbox,
    'a guest links no mailbox and reads no Email settings (403, in words), and only Gmail or Outlook is linked to send from (400)',
    JSON.stringify({ gus: said(gusStart), gusSetup: said(gusSetup), drive: said(driveStart) }),
  )

  // ══ 2. WHO SENDS FROM WHICH ══════════════════════════════════════════════════
  console.log('\n▶ From offers one’s own mailboxes, and those shared with one')
  const fromOf = async (who) => ((await who(emailRoute)).data?.accounts ?? []).map((a) => a.address).sort()
  const miaBefore = await fromOf(M)
  const olgaFrom = await A(emailRoute)
  const notYours = await M(`/workspaces/${WS}/email-accounts/${olgaRow?.id}`, { method: 'PATCH', body: { senders: [mia.id] } })
  const shared = await A(`/workspaces/${WS}/email-accounts/${olgaRow?.id}`, { method: 'PATCH', body: { senders: [mia.id] } })
  const miaAfter = await fromOf(M)
  const maxFrom = await fromOf(X)
  chk(
    (olgaFrom.data?.accounts ?? []).some((a) => a.address === OLGA_ADDRESS && a.mine) && !!olgaFrom.data?.server
      && miaBefore.join() === MIA_ADDRESS && notYours.status === 403 && words(notYours) === SAID.notYours
      && shared.ok && miaAfter.join() === [MIA_ADDRESS, OLGA_ADDRESS].sort().join() && maxFrom.length === 0,
    'From offers the owner their Gmail and the server’s address; Mia her Outlook alone, until the owner lets her send from the Gmail — which only its owner may (403) — and Max neither',
    JSON.stringify({ olga: (olgaFrom.data?.accounts ?? []).map((a) => a.address), server: olgaFrom.data?.server ?? null, miaBefore, notYours: said(notYours), shared: said(shared), miaAfter, maxFrom }),
  )

  // ══ 3. SENT FROM GMAIL, ANSWERED THERE ════════════════════════════════════════
  console.log('\n▶ an email sent from the Gmail, and its answer read back')
  const sentGm = await A(emailRoute, {
    method: 'POST',
    body: { to: [CLIENT], cc: [PARTNER], bcc: [QUIET], subject: `Lease terms ${TAG}`, body: `Here are the terms, ${TAG}.`, attachmentIds: [FILE_ID], accountId: olgaRow?.id },
  })
  const olgaBox = await readMailbox(STUB, OLGA_GM)
  const gmSent = (olgaBox?.messages ?? []).filter((m) => m.direction === 'sent')
  const smtp = await mailTo(MAIL, CLIENT)
  const rows1 = await emailRows()
  const out1 = rows1.find((r) => r.direction === 'out')
  // `?? null` on every id read off an answer: an undefined one is postgres.js's UNDEFINED_VALUE, a throw
  // that ends the run, where a refused or missing row should fail the check that reads it.
  const [uses1] = await sql`select uses from email_accounts where id = ${olgaRow?.id ?? null}`
  chk(
    sentGm.ok && gmSent.length === 1 && gmSent[0].from === OLGA_ADDRESS && gmSent[0].to.join() === CLIENT && gmSent[0].cc.join() === PARTNER && gmSent[0].bcc.join() === QUIET
      && gmSent[0].subject === `Lease terms ${TAG}` && gmSent[0].text === `Here are the terms, ${TAG}.` && gmSent[0].attachments?.[0]?.name === `quote-${TAG}.txt` && gmSent[0].attachments[0].size === FILE.length
      && smtp.length === 0 && out1?.account_id === olgaRow?.id && out1.provider_thread_id === gmSent[0].threadId && out1.from_address === OLGA_ADDRESS && uses1?.uses === 1,
    'sent from the Gmail, as the Gmail: its people, subject, words and file went through Google, not the server’s mail; kept as the task’s email with the mailbox and its thread, one use taken (read by SQL)',
    JSON.stringify({ sent: said(sentGm), gmail: gmSent.map((m) => ({ from: m.from, to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject, text: m.text, files: m.attachments })), smtp: smtp.length, row: out1 ?? null, uses: uses1?.uses }),
  )

  const answer = await answerInMailbox(STUB, { token: OLGA_GM, threadId: gmSent[0]?.threadId, from: CLIENT, fromName: 'The Client', text: `Agreed, ${TAG}.\n\nOn Mon, 12 Oct 2026, Olga wrote:\n> Here are the terms.` })
  const landed = await waitUntil(async () => (await emailRows()).some((r) => r.direction === 'in'), { timeoutMs: 15_000 })
  // Two more reads of the thread: the answer lands once.
  await new Promise((r) => setTimeout(r, 5000))
  const rows2 = await emailRows()
  const ins = rows2.filter((r) => r.direction === 'in')
  chk(
    landed && ins.length === 1 && ins[0].from_address === CLIENT && ins[0].body === `Agreed, ${TAG}.` && ins[0].parent_comment_id === out1?.comment_id && ins[0].author_id === olga.id
      && ins[0].account_id === olgaRow?.id && ins[0].provider_message_id === answer.id,
    'the client’s answer, read from the Gmail, lands in the task once, under the email, without the quote of what it answers (read by SQL)',
    JSON.stringify({ landed, ins }),
  )

  const answerBack = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `Signed, ${TAG}.`, parentCommentId: ins[0]?.comment_id, accountId: olgaRow?.id } })
  const olgaBox2 = await readMailbox(STUB, OLGA_GM)
  const reply = (olgaBox2?.messages ?? []).filter((m) => m.direction === 'sent').slice(-1)[0]
  const rows3 = await emailRows()
  const out2 = rows3.filter((r) => r.direction === 'out').slice(-1)[0]
  chk(
    answerBack.ok && reply?.threadId === gmSent[0]?.threadId && reply.inReplyTo === answer.internetMessageId && /^Re: Lease terms/.test(reply.subject)
      && out2?.provider_thread_id === gmSent[0]?.threadId && out2.parent_comment_id === out1?.comment_id,
    'answering it by email goes from the Gmail in the same thread, naming the answer it answers, and is kept under the same email (read by SQL)',
    JSON.stringify({ sent: said(answerBack), reply: reply && { threadId: reply.threadId, inReplyTo: reply.inReplyTo, subject: reply.subject }, row: out2 ?? null }),
  )

  // ══ 4. SENT FROM OUTLOOK, ANSWERED THERE ═══════════════════════════════════════
  console.log('\n▶ Mia sends from her Outlook')
  const sentOl = await M(emailRoute, { method: 'POST', body: { to: [PARTNER], subject: `Keys ${TAG}`, body: `The keys are ready, ${TAG}.`, attachmentIds: [FILE_ID], accountId: miaRow?.id } })
  const miaBox = await readMailbox(STUB, MIA_OL)
  const olSent = (miaBox?.messages ?? []).filter((m) => m.direction === 'sent' && !m.isDraft)
  const olAnswer = olSent[0] ? await answerInMailbox(STUB, { token: MIA_OL, threadId: olSent[0].threadId, from: PARTNER, text: `Collecting at five, ${TAG}.` }) : null
  const olLanded = await waitUntil(async () => (await emailRows()).some((r) => r.direction === 'in' && r.account_id === miaRow?.id), { timeoutMs: 15_000 })
  const rows4 = await emailRows()
  const olOut = rows4.find((r) => r.direction === 'out' && r.account_id === miaRow?.id)
  const olIn = rows4.find((r) => r.direction === 'in' && r.account_id === miaRow?.id)
  chk(
    sentOl.ok && olSent.length === 1 && olSent[0].from === MIA_ADDRESS && olSent[0].to.join() === PARTNER && olSent[0].attachments?.[0]?.name === `quote-${TAG}.txt`
      && olOut?.provider_thread_id === olSent[0].threadId && olLanded && olIn?.parent_comment_id === olOut?.comment_id && olIn.body === `Collecting at five, ${TAG}.` && olIn.author_id === mia.id,
    'Mia’s email goes through Graph as a draft sent from her Outlook, file and all; the answer is read from that conversation into the task, under hers (read by SQL)',
    JSON.stringify({ sent: said(sentOl), outlook: olSent.map((m) => ({ from: m.from, to: m.to, files: m.attachments, thread: m.threadId })), answer: olAnswer?.id ?? null, landed: olLanded, out: olOut ?? null, in: olIn ?? null }),
  )

  const olReply = await M(emailRoute, { method: 'POST', body: { to: [PARTNER], body: `See you then, ${TAG}.`, parentCommentId: olIn?.comment_id, accountId: miaRow?.id } })
  const miaBox2 = await readMailbox(STUB, MIA_OL)
  const olBack = (miaBox2?.messages ?? []).filter((m) => m.direction === 'sent' && !m.isDraft).slice(-1)[0]
  chk(
    olReply.ok && olBack?.threadId === olSent[0]?.threadId && olBack.inReplyTo === olAnswer?.internetMessageId && /^RE: Keys/i.test(olBack.subject),
    'answered by email from Outlook, it is made as Graph’s reply to the answer, in the same conversation',
    JSON.stringify({ sent: said(olReply), back: olBack && { threadId: olBack.threadId, inReplyTo: olBack.inReplyTo, subject: olBack.subject } }),
  )

  // ══ 5. WHAT IS REFUSED ═══════════════════════════════════════════════════════
  console.log('\n▶ refused: a mailbox not shared, a grant revoked, uses spent')
  const before5 = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).length
  const maxSend = await X(emailRoute, { method: 'POST', body: { to: [CLIENT], body: 'not mine', accountId: olgaRow?.id } })
  const otherWs = await A('/workspaces', { method: 'POST', body: { name: `Other mailboxes ${TAG}` } })
  if (otherWs.data?.id) madeWorkspace(otherWs.data.id)
  const [foreign] = otherWs.data?.id
    ? await sql`insert into email_accounts (workspace_id, owner_id, provider, address, sender_name, access_token) values (${otherWs.data.id}, ${olga.id}, 'gmail', ${`foreign-${TAG}@gmail.test`}, 'Foreign', ${OLGA_GM}) returning id`
    : [null]
  const foreignSend = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: 'from elsewhere', accountId: foreign?.id } })
  const after5 = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).length
  chk(
    maxSend.status === 403 && words(maxSend) === SAID.mayNotSend && foreignSend.status === 404 && after5 === before5,
    'Max, whom the Gmail is not shared with, is refused sending from it (403, in words), and a mailbox of another workspace is none here (404) — nothing sent',
    JSON.stringify({ max: said(maxSend), foreign: said(foreignSend), before: before5, after: after5 }),
  )

  // The send's refusal, not a poll's: the answers are read every two seconds, and a poll that met the refusal first
  // marked the mailbox, so the send was refused 409 before Google was asked (measured once in batch 35's sweep).
  await failMailbox(STUB, OLGA_GM, 401, 1, 'write')
  const revoked = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `revoked ${TAG}`, accountId: olgaRow?.id } })
  const afterRevoke = await accountRow(OLGA_ADDRESS)
  const setupRevoked = await A(emailRoute)
  const relinked = await link(A, 'gmail', { token: OLGA_GM, address: OLGA_ADDRESS, name: 'Olga Gmail' })
  const afterRelink = await accountRow(OLGA_ADDRESS)
  chk(
    revoked.status === 502 && /Gmail refused it \(401\)/.test(words(revoked)) && afterRevoke?.status === 'needs_reconnect' && /401/.test(afterRevoke.last_error ?? '')
      && (setupRevoked.data?.accounts ?? []).find((a) => a.id === olgaRow?.id)?.status === 'needs_reconnect'
      && relinked.back === 302 && afterRelink?.status === 'connected' && afterRelink.id === olgaRow?.id && afterRelink.uses === afterRevoke.uses,
    'a grant Google refuses is said in its words (502), and the mailbox is marked to link again — linked again, it is the same mailbox, connected (read by SQL)',
    JSON.stringify({ revoked: said(revoked), after: afterRevoke && { status: afterRevoke.status, error: afterRevoke.last_error }, relinked: relinked.back, again: afterRelink && { id: afterRelink.id === olgaRow?.id, status: afterRelink.status } }),
  )

  await sql`update workspaces set plan = 'free' where id = ${WS}`
  await sql`update email_accounts set uses = 100 where id = ${olgaRow?.id ?? null}`
  const spentBefore = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).length
  const spent = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `spent ${TAG}`, accountId: olgaRow?.id } })
  const lateFree = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `later ${TAG}`, accountId: miaRow?.id, sendAt: new Date(Date.now() + 3_600_000).toISOString() } })
  const spentAfter = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).length
  await sql`update email_accounts set uses = 3 where id = ${olgaRow?.id ?? null}`
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  chk(
    spent.status === 403 && words(spent) === SAID.uses && spentAfter === spentBefore && lateFree.status === 403 && words(lateFree) === SAID.scheduling,
    'on Free a mailbox sends its 100 emails and then is refused in words, nothing sent; and Free does not schedule (403)',
    JSON.stringify({ spent: said(spent), late: said(lateFree), before: spentBefore, after: spentAfter }),
  )

  // ══ 6. SIGNATURES AND TEMPLATES ═════════════════════════════════════════════
  console.log('\n▶ signatures and templates, Business and above')
  const sig1 = await A(`/workspaces/${WS}/email-signatures`, { method: 'POST', body: { name: 'Short', body: `Olga\n${TAG}`, isDefault: true } })
  const sig2 = await A(`/workspaces/${WS}/email-signatures`, { method: 'POST', body: { name: 'Long', body: `Olga Owner\nRundesk ${TAG}`, isDefault: true } })
  const sigRows = await sql`select name, is_default from email_signatures where workspace_id = ${WS} and user_id = ${olga.id} order by created_at`
  await sql`update workspaces set plan = 'pro' where id = ${WS}`
  const sigPro = await M(`/workspaces/${WS}/email-signatures`, { method: 'POST', body: { name: 'Mine', body: 'Mia' } })
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const miaSigs = (await M(emailRoute)).data?.signatures ?? []
  chk(
    sig1.ok && sig2.ok && sigRows.length === 2 && sigRows.filter((r) => r.is_default).map((r) => r.name).join() === 'Long'
      && sigPro.status === 403 && words(sigPro) === SAID.signatures && miaSigs.length === 0,
    'a person keeps signatures, one of them the default — made the default, the other is not (read by SQL); they are theirs alone, and on Pro there are none (403, in words)',
    JSON.stringify({ sig1: said(sig1), sig2: said(sig2), rows: sigRows, pro: said(sigPro), mia: miaSigs.length }),
  )

  const shareTpl = await A(`/workspaces/${WS}/email-templates`, { method: 'POST', body: { name: `Welcome ${TAG}`, subject: `Welcome aboard ${TAG}`, body: `Welcome, ${TAG}.`, shared: true } })
  const ownTpl = await A(`/workspaces/${WS}/email-templates`, { method: 'POST', body: { name: `Private ${TAG}`, body: `Only mine, ${TAG}.` } })
  const miaTpls = ((await M(emailRoute)).data?.templates ?? []).map((t) => t.name)
  const miaDelete = await M(`/workspaces/${WS}/email-templates/${shareTpl.data?.id}`, { method: 'DELETE' })
  chk(
    shareTpl.ok && ownTpl.ok && miaTpls.join() === `Welcome ${TAG}` && miaDelete.status === 403 && words(miaDelete) === SAID.notYourTemplate,
    'a template shared with everybody is offered to Mia, the owner’s own is not, and Mia may not delete the owner’s (403, in words)',
    JSON.stringify({ shared: said(shareTpl), own: said(ownTpl), mia: miaTpls, delete: said(miaDelete) }),
  )

  // ══ 7. SEND LATER ══════════════════════════════════════════════════════════
  console.log('\n▶ sent later, at its time; cancelled; sent now')
  const boxCount = async () => ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).filter((m) => m.direction === 'sent').length
  const sentBefore = await boxCount()
  const later = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], subject: `Reminder ${TAG}`, body: `Rent is due, ${TAG}.`, accountId: olgaRow?.id, sendAt: new Date(Date.now() + 3_600_000).toISOString() } })
  const waiting = (await A(`${emailRoute}/scheduled`)).data ?? []
  const notYet = await boxCount()
  const miaSees = (await M(`${emailRoute}/scheduled`)).data ?? []
  // Its time comes: moved to now by SQL, rather than waiting an hour.
  await sql`update scheduled_task_emails set send_at = now() where id = ${later.data?.scheduled?.id ?? null}`
  const went = await waitUntil(async () => (await sql`select status from scheduled_task_emails where id = ${later.data?.scheduled?.id ?? null}`)[0]?.status === 'sent', { timeoutMs: 15_000 })
  const [laterRow] = await sql`select status, comment_id from scheduled_task_emails where id = ${later.data?.scheduled?.id ?? null}`
  const [laterComment] = laterRow?.comment_id ? await sql`select c.author_id, e.account_id, e.subject from task_comments c join task_comment_emails e on e.comment_id = c.id where c.id = ${laterRow.comment_id}` : [null]
  chk(
    later.ok && !!later.data?.scheduled?.id && waiting.length === 1 && waiting[0].subject === `Reminder ${TAG}` && notYet === sentBefore && miaSees.length === 0
      && went && (await boxCount()) === sentBefore + 1 && laterComment?.author_id === olga.id && laterComment.account_id === olgaRow?.id && laterComment.subject === `Reminder ${TAG}`,
    'an email set for later is kept, not sent, and listed on the task for its writer alone; when its time comes it goes from the Gmail as them and is the task’s email (read by SQL)',
    JSON.stringify({ later: said(later), waiting: waiting.length, notYet, sentBefore, mia: miaSees.length, went, row: laterRow ?? null, comment: laterComment ?? null }),
  )

  const toCancel = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `cancel me ${TAG}`, accountId: olgaRow?.id, sendAt: new Date(Date.now() + 3_600_000).toISOString() } })
  const cancelled = await A(`${emailRoute}/scheduled/${toCancel.data?.scheduled?.id}`, { method: 'DELETE' })
  await sql`update scheduled_task_emails set send_at = now() - interval '1 minute' where id = ${toCancel.data?.scheduled?.id ?? null}`
  const toNow = await A(emailRoute, { method: 'POST', body: { to: [CLIENT], body: `now please ${TAG}`, accountId: olgaRow?.id, sendAt: new Date(Date.now() + 3_600_000).toISOString() } })
  const beforeNow = await boxCount()
  const now = await A(`${emailRoute}/scheduled/${toNow.data?.scheduled?.id}/send`, { method: 'POST' })
  await new Promise((r) => setTimeout(r, 3000))
  const [cancelRow] = await sql`select status from scheduled_task_emails where id = ${toCancel.data?.scheduled?.id ?? null}`
  const [nowRow] = await sql`select status, comment_id from scheduled_task_emails where id = ${toNow.data?.scheduled?.id ?? null}`
  const sentTexts = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).map((m) => m.text)
  chk(
    cancelled.ok && cancelRow?.status === 'cancelled' && !sentTexts.includes(`cancel me ${TAG}`)
      && now.ok && nowRow?.status === 'sent' && !!nowRow.comment_id && (await boxCount()) === beforeNow + 1 && sentTexts.includes(`now please ${TAG}`),
    'one cancelled is never sent, even past its time; one sent now goes at once and is the task’s email (read by SQL)',
    JSON.stringify({ cancelled: said(cancelled), cancelRow, now: said(now), nowRow, sent: sentTexts.filter((t) => t.includes(TAG)) }),
  )

  // ══ 8. THE COMPOSER AND THE EMAIL SETTINGS ════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // A step that cannot happen fails in seconds rather than waiting for ever.
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  console.log('\n▶ the composer: From, a template, the signature, Send')
  const openTask = async () => {
    await page.goto(`${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-tab-comments').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('comment-input').waitFor({ state: 'visible', timeout: 15_000 })
  }
  /*
   * Comment ▾ › Email, once its row is offered. The row is disabled while the
   * server is asked whether this person may send, and under a break run's load
   * a menu opened as the sheet settled was left where the trigger had been, its
   * row "outside of the viewport": 4 of 26 runs threw here and ended the run,
   * and the check they were measuring never printed. So the row is waited for,
   * a press that cannot land closes the menu and opens it again, once, and what
   * still fails is the section's check, not the run.
   */
  const chooseEmail = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByTestId('comment-mode-trigger').click({ timeout: 10_000 }).catch(() => {})
      const row = page.getByTestId('comment-mode-item-email').filter({ visible: true })
      await waitUntil(async () => (await row.getAttribute('data-available').catch(() => null)) === 'yes', { timeoutMs: 10_000 })
      if (await row.click({ timeout: 5000 }).then(() => true, () => false)) {
        return page.getByTestId('comment-email-form').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)
      }
      await page.keyboard.press('Escape').catch(() => {})
    }
    return false
  }
  await openTask()
  const emailOpened = await chooseEmail()
  const fromSelect = page.getByTestId('comment-email-from-select').filter({ visible: true })
  await fromSelect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  // The picker's options, off the drawn picker: an <option>'s words are its textContent.
  const fromOptions = await fromSelect.evaluate((sel) => [...sel.options].map((o) => ({ value: o.value, text: o.textContent }))).catch(() => [])
  const fromChosen = await fromSelect.inputValue().catch(() => '')
  // The default signature is put under the words as Email opens.
  await waitUntil(async () => (await page.getByTestId('comment-input').inputValue().catch(() => '')).includes(TAG), { timeoutMs: 8000 })
  const draftText = await page.getByTestId('comment-input').inputValue().catch(() => '')
  await page.getByTestId('comment-email-templates').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId(`comment-email-template-${shareTpl.data?.id}`).click({ timeout: 8000 }).catch(() => {})
  const subjectAfter = await page.getByTestId('comment-email-subject').inputValue().catch(() => '')
  const textAfter = await page.getByTestId('comment-input').inputValue().catch(() => '')
  await page.getByTestId('comment-email-to-input').fill(CLIENT)
  await page.getByTestId('comment-email-to-input').press('Enter')
  const uiBefore = await boxCount()
  await page.getByTestId('comment-email-send').click({ timeout: 8000 }).catch(() => {})
  const uiSent = await waitUntil(async () => (await boxCount()) === uiBefore + 1, { timeoutMs: 15_000 })
  const uiMail = ((await readMailbox(STUB, OLGA_GM))?.messages ?? []).filter((m) => m.direction === 'sent').slice(-1)[0]
  chk(
    fromOptions.some((o) => o.value === olgaRow?.id && o.text.includes(OLGA_ADDRESS)) && fromOptions.some((o) => o.value === 'server') && fromChosen === olgaRow?.id
      && draftText.includes('Rundesk ' + TAG) && subjectAfter === `Welcome aboard ${TAG}` && textAfter.startsWith(`Welcome, ${TAG}.`)
      && uiSent && uiMail?.from === OLGA_ADDRESS && uiMail.subject === `Welcome aboard ${TAG}` && uiMail.to.join() === CLIENT && emailOpened,
    'Email opens From the owner’s Gmail, the server’s address offered beside it, the default signature under the words; a template fills the subject and words; Send sends it from the Gmail',
    JSON.stringify({ emailOpened, fromOptions, fromChosen, draftText, subjectAfter, textAfter, uiSent, uiMail: uiMail && { from: uiMail.from, subject: uiMail.subject, to: uiMail.to } }),
  )

  console.log('\n▶ the arrow beside Send: later, listed on the task, cancelled there')
  const laterOpened = await chooseEmail()
  await page.getByTestId('comment-email-to-input').fill(PARTNER, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-to-input').press('Enter', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-input').fill(`Later from the box ${TAG}`)
  await page.getByTestId('comment-email-schedule').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('comment-email-schedule-hour').click({ timeout: 8000 }).catch(() => {})
  const listed = page.getByTestId('comment-email-scheduled-row').filter({ hasText: PARTNER })
  const listedOk = await listed.first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
  const [boxRow] = await sql`select id, status, send_at, to_addresses from scheduled_task_emails where task_id = ${TASK} and body = ${`Later from the box ${TAG}`}`
  await listed.first().getByTestId('comment-email-scheduled-cancel').click({ timeout: 8000 }).catch(() => {})
  const gone = await waitUntil(async () => (await sql`select status from scheduled_task_emails where id = ${boxRow?.id ?? null}`)[0]?.status === 'cancelled', { timeoutMs: 10_000 })
  const hidden = await waitUntil(async () => (await listed.count()) === 0, { timeoutMs: 10_000 })
  const hourAhead = boxRow ? new Date(boxRow.send_at).getTime() - Date.now() : 0
  chk(
    laterOpened && listedOk && boxRow?.status === 'scheduled' && boxRow.to_addresses.join() === PARTNER && hourAhead > 50 * 60_000 && hourAhead < 61 * 60_000 && gone && hidden,
    '“In 1 hour” keeps the email for an hour, listed on the task with whom it goes to; Cancel there cancels it (read by SQL) and it leaves the list',
    JSON.stringify({ laterOpened, listedOk, row: boxRow ?? null, hourAhead, gone, hidden }),
  )

  console.log('\n▶ the Email settings page')
  await page.goto(`${B}/app/${WS}/email`, { waitUntil: 'domcontentloaded' })
  const rowLoc = page.locator(`[data-testid="email-account-row"][data-account-id="${olgaRow?.id}"]`)
  await rowLoc.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const listedAccounts = await page.getByTestId('email-account-address').filter({ visible: true }).allInnerTexts().catch(() => [])
  await rowLoc.getByTestId('email-account-sender-name').fill(`Olga at Lease ${TAG}`)
  await rowLoc.getByTestId('email-account-save').click({ timeout: 8000 }).catch(() => {})
  const renamed = await waitUntil(async () => (await accountRow(OLGA_ADDRESS))?.sender_name === `Olga at Lease ${TAG}`, { timeoutMs: 10_000 })
  // The consent page is Google's: the link is caught on its way there, with what it asks.
  let consentUrl = null
  await page.route('https://accounts.google.com/**', (route) => {
    consentUrl = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>consent</p>' })
  })
  await page.getByTestId('email-link-gmail').click({ timeout: 8000 }).catch(() => {})
  await waitUntil(() => consentUrl !== null, { timeoutMs: 10_000 })
  // Let the way to the consent page finish: opened before it does, the next page is cut off by it.
  await page.waitForURL(/^https:\/\/accounts\.google\.com\//, { waitUntil: 'commit', timeout: 10_000 }).catch(() => {})
  const consent = consentUrl ? new URL(consentUrl) : null
  await page.goto(`${B}/app/${WS}/email?connectError=${encodeURIComponent('Google said: access_denied')}`, { waitUntil: 'domcontentloaded' })
  const errorShown = await page.getByTestId('email-settings-connect-error').filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => '')
  chk(
    listedAccounts.includes(OLGA_ADDRESS) && listedAccounts.includes(MIA_ADDRESS) && renamed
      && /gmail\.send/.test(consent?.searchParams.get('scope') ?? '') && !!consent?.searchParams.get('state') && errorShown.includes('Google said: access_denied'),
    'the Email settings list the workspace’s mailboxes to its owner, and the sender name is changed there (read by SQL); Link Gmail goes to Google’s consent asking to send, and a refused consent is said on return',
    JSON.stringify({ listedAccounts, renamed, consent: consent ? { host: consent.host, scope: consent.searchParams.get('scope'), state: !!consent.searchParams.get('state') } : null, errorShown }),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${err?.stack ?? err}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    if (WS) await sql`delete from workspaces where id = ${WS}`.catch(() => {})
    await sql`delete from workspaces where name = ${`Other mailboxes ${TAG}`}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  // `close`: the stack has no `stop` (`found-12-oct/suites-stop-a-stack-with-no-stop`).
  stack.close()
}

const ran = passed + failed
if (ran !== EXPECTED_CHECKS) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${ran} checks, expected exactly ${EXPECTED_CHECKS}`)
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed > 0 ? 1 : 0
