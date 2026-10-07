/**
 * A REPLY TO A COMMENT NOTIFICATION LANDS ON ITS TASK.
 *
 * NOT A FRAME ROW: `resume-defects/resume-8-reply-routing`. The inbound mail
 * handler says replies to notification emails are routed by their
 * `In-Reply-To` / `References` headers, and they were not: it matched those
 * headers against inbound mail only, and the notification mail this server
 * sends carried no Message-ID it kept, and no Reply-To. A reply went to the
 * sender address and matched nothing.
 *
 * A watcher is notified of a comment. The server keeps the notification's
 * Message-ID; a reply naming it (the way a mail client sends one) is posted to
 * the inbound webhook and must land as the watcher's comment, while a reply
 * naming an id this server never sent must not. And where the task's list
 * takes email, the notification's Reply-To is the task's own address.
 *
 * AND EVERY OTHER MAIL ABOUT THE TASK (`resume-defects/resume-8`). Only the
 * comment notification carried a thread: the mail that told somebody they were
 * mentioned, or that the task was now theirs, had no Message-ID, nothing was
 * kept, and a reply to it reached no task. Somebody who does not watch the task
 * is mentioned, and the watcher is assigned it; a reply to each mail must land
 * on the task as its sender's comment.
 *
 *   node test/e2e/email-reply-routing.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

const stamp = Date.now()
const TAG = `err-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the kept Message-ID is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  WS = await make('/workspaces', { name: TAG }, 'the workspace')
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  const TASK = await make('/tasks', { listId: LIST, title: `${TAG} the task` }, 'the task')
  const email = `${TAG}-watcher@rundesk.invalid`
  const watcher = await signUpApi(API, {
    fullName: 'Reply watcher', email, password: 'Watcher@12345!',
    organizationName: `Reply ${stamp}`, organizationSlug: `reply-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the watcher: ${added.status}`)
  const watch = await A(`/tasks/${TASK}/watchers`, { method: 'POST', body: { userId: watcher.user.id } })
  if (watch.status >= 300) throw new Error(`could not make them watch the task: ${watch.status}`)
  // Somebody the task is not watched by: only a mention tells them of it.
  const mentionedEmail = `${TAG}-mentioned@rundesk.invalid`
  const mentioned = await signUpApi(API, {
    fullName: 'Reply mentioned', email: mentionedEmail, password: 'Mentioned@12345!',
    organizationName: `Mentioned ${stamp}`, organizationSlug: `mentioned-${stamp}`,
  })
  const joined = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: mentionedEmail, role: 'member' } })
  if (joined.status >= 300) throw new Error(`could not add the person to mention: ${joined.status}`)

  // Nothing kept, or nowhere to keep it (a build before the table), reads null.
  const kept = async (after, to = email) => {
    const rows = await sql`
      select message_id, reply_to from outbound_email_messages
      where task_id = ${TASK} and recipient = ${to} and sent_at > ${after}
      order by sent_at desc limit 1`.catch(() => [])
    return rows[0] ?? null
  }

  // ══ 1. THE NOTIFICATION ══════════════════════════════════════════════════
  console.log('\n▶ the admin comments; the watcher is emailed')
  const firstAt = new Date(Date.now() - 1000)
  const comment = await A(`/tasks/${TASK}/comments`, { method: 'POST', body: { body: `${TAG} a comment to be answered` } })
  if (comment.status >= 300) throw new Error(`could not comment: ${comment.status}`)
  let sent = null
  await waitUntil(async () => (sent = await kept(firstAt)) !== null, { timeoutMs: 10_000 })
  chk(
    !!sent?.message_id && /^<[^<>@\s]+@[^<>@\s]+>$/.test(sent.message_id),
    'the comment notification is sent with a Message-ID the server keeps, for the task it is about',
    `kept for this task and watcher: ${JSON.stringify(sent)}`,
  )

  // ══ 2. THE REPLY ═════════════════════════════════════════════════════════
  console.log('\n▶ the watcher replies from their mail client')
  const REPLY = `${TAG} answered by mail`
  const inbound = (inReplyTo, text, n, from = email) => fetch(`${API}/inbound/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messageId: `<reply-${stamp}-${n}@mail.example.test>`,
      fromAddress: from,
      fromName: 'Reply watcher',
      // The address the notification came FROM: not a list's, so only the
      // reply's headers can say which task it answers.
      recipient: 'notifications@rundesk.invalid',
      subject: `Re: New comment on "${TAG} the task"`,
      textBody: text,
      inReplyTo,
      references: inReplyTo,
    }),
  }).then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.data })).catch(() => ({ status: 0, data: null }))
  const reply = await inbound(sent?.message_id ?? '<none@none>', REPLY, 1)
  const comments = async () => ((await A(`/tasks/${TASK}/comments`)).data ?? [])
  let landed = null
  await waitUntil(async () => (landed = (await comments()).find((c) => (c.body ?? '').includes(REPLY)) ?? null) !== null, { timeoutMs: 8000 })
  chk(
    reply.data?.outcome === 'comment_added' && !!landed && (landed.authorId ?? landed.author?.id) === watcher.user.id,
    'a reply naming that Message-ID lands on the task as the watcher’s comment',
    `the webhook answered ${reply.status} ${JSON.stringify(reply.data)}; the comment ${landed ? `landed, by ${landed.authorId ?? landed.author?.id}` : 'is not on the task'}`,
  )

  // ══ 3. A REPLY TO SOMETHING THIS SERVER NEVER SENT ═══════════════════════
  console.log('\n▶ a reply naming a Message-ID this server never sent')
  const STRAY = `${TAG} answering nothing`
  const stray = await inbound(`<not-ours-${stamp}@elsewhere.example.test>`, STRAY, 2)
  await new Promise((r) => setTimeout(r, 1000))
  const strayLanded = (await comments()).some((c) => (c.body ?? '').includes(STRAY))
  chk(
    stray.data?.outcome !== 'comment_added' && !strayLanded,
    'and a reply naming a Message-ID this server never sent lands nowhere',
    `the webhook answered ${stray.status} ${JSON.stringify(stray.data)}; the comment ${strayLanded ? 'LANDED' : 'is not on the task'}`,
  )

  // ══ 4. REPLY-TO ══════════════════════════════════════════════════════════
  console.log('\n▶ the list takes email now; another comment is notified')
  const alias = await A(`/lists/${LIST}/inbound-email`, { method: 'POST', body: {} })
  const address = (await A(`/tasks/${TASK}/email-address`)).data?.address ?? null
  const secondAt = new Date(Date.now() - 1000)
  await A(`/tasks/${TASK}/comments`, { method: 'POST', body: { body: `${TAG} a second comment` } })
  let again = null
  await waitUntil(async () => (again = await kept(secondAt)) !== null && again.message_id !== sent?.message_id, { timeoutMs: 10_000 })
  chk(
    alias.status < 300 && !!address && again?.reply_to === address,
    'where the task’s list takes email, the notification’s Reply-To is the task’s own address',
    `the alias answered ${alias.status}; the task's address is ${JSON.stringify(address)}; the notification's Reply-To ${JSON.stringify(again?.reply_to ?? null)}`,
  )

  // Each of the next two reads a reply into the task from the mail that told
  // its sender, by the thread that mail was sent with.
  const answeredBy = async (thread, text, n, from, who) => {
    const answer = thread ? await inbound(thread.message_id, text, n, from) : { status: 0, data: null }
    let landed = null
    if (thread) {
      await waitUntil(async () => (landed = (await comments()).find((c) => (c.body ?? '').includes(text)) ?? null) !== null, { timeoutMs: 8000 })
    }
    return {
      ok: !!thread?.message_id && thread.reply_to === address && answer.data?.outcome === 'comment_added'
        && (landed?.authorId ?? landed?.author?.id) === who,
      said: `kept for them: ${JSON.stringify(thread)}; the webhook answered ${answer.status} ${JSON.stringify(answer.data)}; `
        + `the reply ${landed ? `landed, by ${landed.authorId ?? landed.author?.id}` : 'is not on the task'}`,
    }
  }

  // ══ 5. A MENTION ═════════════════════════════════════════════════════════
  console.log('\n▶ the admin mentions somebody who does not watch the task; they answer that mail')
  const thirdAt = new Date(Date.now() - 1000)
  const NAME = '@Reply mentioned'
  const mentioning = await A(`/tasks/${TASK}/comments`, {
    method: 'POST',
    body: { body: `${NAME} ${TAG} a question for you`, mentions: [{ userId: mentioned.user.id, offset: 0, length: NAME.length }] },
  })
  if (mentioning.status >= 300) throw new Error(`could not mention them: ${mentioning.status}`)
  let told = null
  await waitUntil(async () => (told = await kept(thirdAt, mentionedEmail)) !== null, { timeoutMs: 10_000 })
  const toMention = await answeredBy(told, `${TAG} the mention answered by mail`, 3, mentionedEmail, mentioned.user.id)
  chk(
    toMention.ok,
    'the mail that tells somebody they were mentioned is sent with a Message-ID the server keeps and the task’s own Reply-To, and a reply naming it lands on the task as their comment',
    toMention.said,
  )

  // ══ 6. AN ASSIGNMENT ═════════════════════════════════════════════════════
  console.log('\n▶ the admin gives the task to the watcher; they answer that mail')
  // The watcher's mail about the mention's comment is kept first, so what
  // follows is the assignment's.
  await waitUntil(async () => (await kept(thirdAt)) !== null, { timeoutMs: 10_000 })
  const fourthAt = new Date()
  const assigning = await A(`/tasks/${TASK}/assignees`, { method: 'POST', body: { userId: watcher.user.id } })
  if (assigning.status >= 300) throw new Error(`could not assign them: ${assigning.status}`)
  let given = null
  await waitUntil(async () => (given = await kept(fourthAt)) !== null, { timeoutMs: 10_000 })
  const toAssignee = await answeredBy(given, `${TAG} the assignment answered by mail`, 4, email, watcher.user.id)
  chk(
    toAssignee.ok,
    'and the mail that tells somebody the task is theirs is answered on the task the same way',
    toAssignee.said,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    try {
      const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE /workspaces/${WS} got no answer (${err?.message ?? err})`)
    }
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
