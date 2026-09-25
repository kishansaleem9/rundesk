/**
 * A COMMENT SENT BY MAIL IS ITS SENDER'S, TO A TASK'S OWN ADDRESS, AND ASKS
 * WHAT THE APP ASKS.
 *
 * NOT A FRAME ROW: `found-25-sep/inbound-email-comments-skip-the-comment-rule`.
 * Measured on lane 5: `POST /inbound/email` to `list-<anything>+task-<id>@…`
 * commented on any task whose id somebody had — the list's alias, the secret
 * half of the address, was never compared; a stranger's mail was put down as a
 * member's comment (the author fell back to the workspace's owner, or its first
 * member); and a view-only member and a guest with nothing shared each
 * commented by mail where the app refuses them (403).
 *
 * A task's reply address is `list-<its list's alias>+task-<id>` and nothing
 * else; the sender is somebody who may comment on the task (read it, and hold
 * "comment" where it lives); anybody else's mail is refused and the refusal
 * recorded — no comment is written in somebody else's name. The mail here is
 * posted as the provider posts it, unsigned on a lane with no secret set.
 *
 *   node test/e2e/mail-comments-by-level.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `mcl${stamp}`
let sql = null
let WS = null
let A = null
let mailN = 0

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what mail writes, and what it is refused, is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    await signUpApi(API, { fullName: `Mail ${who}`, email, password: 'Mails@12345!', organizationName: `Mail ${who} ${stamp}`, organizationSlug: `mail-${who}-${stamp}` })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    const [u] = await sql`select id from users where email = ${email}`
    return { id: u.id, email }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const sharedGuest = await person('sharedguest', 'guest')
  const stranger = await person('stranger', null)
  const adminEmail = ADMIN.email

  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} task` } })
    if (task.status >= 300 || !task.data?.id) throw new Error(`could not make the ${name} task: ${said(space)} ${said(project)} ${said(list)} ${said(task)}`)
    const alias = await A(`/lists/${list.data.id}/inbound-email`, { method: 'POST' })
    if (alias.status >= 300) throw new Error(`could not give the ${name} list an address: ${said(alias)}`)
    const address = await A(`/tasks/${task.data.id}/email-address`)
    const reply = address.data?.address ?? address.data?.replyAddress ?? address.data
    if (typeof reply !== 'string' || !reply.includes('+task-')) throw new Error(`the ${name} task has no reply address: ${JSON.stringify(address.data)}`)
    return { list: list.data.id, task: task.data.id, reply, localPart: reply.split('@')[0].replace(/^list-/, '').split('+task-')[0] }
  }
  const OPEN = await place('open')
  const VIEW = await place('view', 'view')
  const OTHER = await place('other open list')
  const domain = OPEN.reply.split('@')[1]
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'task', ${OPEN.task}, ${sharedGuest.id}, 'comment')`

  /** Post a mail as the provider would, and read back what it did. */
  const mail = async ({ from, to, text, inReplyTo }) => {
    mailN += 1
    const messageId = `<${TAG}-${mailN}@mail.example.test>`
    const res = await fetch(`${API}/inbound/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, fromAddress: from, recipient: to, subject: 'Re: the task', textBody: `${TAG} ${text}`, ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}) }),
    }).catch(() => null)
    const answer = res ? (await res.json().catch(() => null))?.data : null
    const [c] = await sql`select c.author_id, u.email from task_comments c left join users u on u.id = c.author_id where c.body like ${`%${TAG} ${text}%`}`
    const [rec] = await sql`select outcome from inbound_email_messages where message_id = ${messageId} limit 1`
    return { status: res?.status ?? 0, outcome: answer?.outcome ?? rec?.outcome ?? null, recorded: rec?.outcome ?? null, author: c?.email ?? null }
  }

  // ══ 1. THE ONES WHO MAY ══════════════════════════════════════════════════
  console.log('\n▶ the admin and a member, to the open task’s own address')
  const a1 = await mail({ from: adminEmail, to: OPEN.reply, text: 'from the admin' })
  const m1 = await mail({ from: member.email, to: OPEN.reply, text: 'from the member' })
  chk(
    a1.outcome === 'comment_added' && a1.author === adminEmail && m1.outcome === 'comment_added' && m1.author === member.email,
    'a comment mailed to a task’s own address by somebody who may comment there lands as theirs — the admin’s, and a member’s in the open space',
    `the admin ${JSON.stringify(a1)}; the member ${JSON.stringify(m1)}`,
  )

  // ══ 2. AN ADDRESS THAT IS NOT THE TASK'S ═════════════════════════════════
  console.log('\n▶ the open task’s id under another list’s alias, and under a made-up one')
  const x1 = await mail({ from: adminEmail, to: `list-${OTHER.localPart}+task-${OPEN.task}@${domain}`, text: 'under the other list' })
  const x2 = await mail({ from: adminEmail, to: `list-madeup${stamp}+task-${OPEN.task}@${domain}`, text: 'under a made-up alias' })
  chk(
    x1.outcome !== 'comment_added' && x1.author === null && x2.outcome !== 'comment_added' && x2.author === null,
    'a task’s address is its list’s: its id under another list’s alias, or a made-up one, lands no comment — even from somebody who may comment on it',
    `another list's alias ${JSON.stringify(x1)}; a made-up one ${JSON.stringify(x2)}`,
  )

  // ══ 3. A STRANGER ════════════════════════════════════════════════════════
  console.log('\n▶ somebody outside the workspace, to the open task’s own address')
  const s1 = await mail({ from: stranger.email, to: OPEN.reply, text: 'from a stranger' })
  const s2 = await mail({ from: `nobody-${stamp}@elsewhere.example`, to: OPEN.reply, text: 'from nobody at all' })
  chk(
    s1.outcome === 'rejected_not_allowed' && s1.author === null && s1.recorded === 'rejected_not_allowed'
      && s2.outcome === 'rejected_not_allowed' && s2.author === null,
    'mail from somebody outside the workspace lands no comment, and nobody is put down as its author — the refusal is recorded',
    `an account elsewhere ${JSON.stringify(s1)}; an address with no account ${JSON.stringify(s2)}`,
  )

  // ══ 4. WHO THE APP REFUSES ═══════════════════════════════════════════════
  console.log('\n▶ a member in the view-only space; a guest with nothing shared; a guest with the task shared to comment')
  const v1 = await mail({ from: member.email, to: VIEW.reply, text: 'from the view-only member' })
  const g1 = await mail({ from: guest.email, to: OPEN.reply, text: 'from the guest with nothing shared' })
  const g2 = await mail({ from: sharedGuest.email, to: OPEN.reply, text: 'from the guest it is shared with' })
  chk(
    v1.outcome === 'rejected_not_allowed' && v1.author === null && g1.outcome === 'rejected_not_allowed' && g1.author === null
      && g2.outcome === 'comment_added' && g2.author === sharedGuest.email,
    'mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app',
    `view-only ${JSON.stringify(v1)}; guest, nothing shared ${JSON.stringify(g1)}; guest, shared to comment ${JSON.stringify(g2)}`,
  )

  // ══ 5. A REPLY TO A NOTIFICATION ═════════════════════════════════════════
  console.log('\n▶ replies to a notification about the view-only task, from the view-only member and from the admin')
  const sentId = `<notification-${stamp}@rundesk.invalid>`
  await sql`insert into outbound_email_messages (message_id, task_id, list_id, recipient) values (${sentId}, ${VIEW.task}, ${VIEW.list}, ${member.email})`
  const r1 = await mail({ from: member.email, to: `notifications@${domain}`, text: 'a reply from the view-only member', inReplyTo: sentId })
  const r2 = await mail({ from: adminEmail, to: `notifications@${domain}`, text: 'a reply from the admin', inReplyTo: sentId })
  chk(
    r1.outcome === 'rejected_not_allowed' && r1.author === null && r2.outcome === 'comment_added' && r2.author === adminEmail,
    'a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs',
    `the view-only member ${JSON.stringify(r1)}; the admin ${JSON.stringify(r2)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
