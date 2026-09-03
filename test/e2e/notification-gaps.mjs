/**
 * §G10-6 / §G10-7 — two things that happened to a task and told nobody.
 *
 * Both are the same shape: the gesture exists on one surface and notifies, and
 * exists on another and does not.
 *
 *   · Reacting to a CHAT message tells its author. Reacting to a task COMMENT
 *     told nobody, so the "reactions" kind she turns off in the Primary
 *     customiser could never have been produced by half the product.
 *   · Being assigned notifies you; being removed notifies you; and everybody
 *     WATCHING the task — who it is for — was told about status, priority, due
 *     date, title and description, but never about who it moved to. The single
 *     most consequential change on a task was the one watchers found out about
 *     by noticing.
 *
 * API-level on purpose. Neither of these is visible on a screen at the moment
 * they happen: they are rows arriving in somebody else's inbox, and driving a
 * browser to observe them would test the inbox rather than the fan-out.
 *
 *   node test/e2e/notification-gaps.mjs --api 3011
 */
import path from 'node:path'
import { signInApi } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 7

const API = `http://127.0.0.1:${Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PEER = {
  email: process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal',
  password: process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const loginAs = (who) => signInApi(API, who.email, who.password)
const settle = () => new Promise((r) => setTimeout(r, 2000))

try {
  const mine = await loginAs(ME)
  const theirs = await loginAs(PEER)
  const A = apiAs(mine.accessToken)
  const B = apiAs(theirs.accessToken)
  const myId = mine.user?.id ?? mine.id
  const theirId = theirs.user?.id ?? theirs.id

  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const lists = (await A(`/lists/project/${p.id}`)).data ?? []
      if (lists[0]?.id) { listId = lists[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to work in')
  const stamp = Date.now()

  // ── §G10-7 — a reaction on a task comment ─────────────────────────────────
  console.log('\n▶ §G10-7 — reacting to a comment is the same gesture as reacting to a message')
  const task = await A('/tasks', { method: 'POST', body: { listId, title: `Reaction task ${stamp}` } })
  const taskId = task.data?.id
  // MY comment, THEIR reaction — a reaction to your own comment tells you
  // nothing, so it has to be somebody else's.
  const comment = await A(`/tasks/${taskId}/comments`, {
    method: 'POST',
    body: { body: `Comment to react to ${stamp}` },
  })
  const commentId = comment.data?.id
  chk(!!taskId && !!commentId, 'there is a comment to react to',
    `task ${task.status}, comment ${comment.status}: ${JSON.stringify(comment.error)}`)

  const before = ((await A('/notifications')).data ?? []).filter((n) => n.type === 'message_reaction').length
  const reacted = await B(`/tasks/${taskId}/comments/${commentId}/reactions`, {
    method: 'POST',
    body: { emoji: '🔥' },
  })
  chk(reacted.status < 400, 'a teammate can react to it', `reaction returned ${reacted.status}: ${JSON.stringify(reacted.error)}`)
  await settle()
  const mineNow = (await A('/notifications')).data ?? []
  const reactionRows = mineNow.filter((n) => n.type === 'message_reaction')
  chk(
    reactionRows.length > before && reactionRows.some((n) => n.target?.entityId === taskId),
    'and the author is told, exactly as they would be in chat',
    `message_reaction rows went ${before} → ${reactionRows.length}, none naming ${taskId}`,
  )

  /*
   * And reacting to your OWN comment notifies nobody.
   *
   * Break-testing found this missing: removing the `authorId !== userId` guard
   * left every check passing, because the fixture only ever had somebody else
   * react. A notification telling you what you just did is noise you cannot
   * turn off without turning off the useful ones too.
   */
  const selfBefore = ((await A('/notifications')).data ?? []).filter(
    (n) => n.type === 'message_reaction' && n.target?.entityId === taskId,
  ).length
  await A(`/tasks/${taskId}/comments/${commentId}/reactions`, { method: 'POST', body: { emoji: '👍' } })
  await settle()
  const selfAfter = ((await A('/notifications')).data ?? []).filter(
    (n) => n.type === 'message_reaction' && n.target?.entityId === taskId,
  ).length
  chk(
    selfAfter === selfBefore,
    'but reacting to your own comment tells you nothing',
    `reacting to my own comment added ${selfAfter - selfBefore} notification(s) for me`,
  )

  // ── §G10-6 — watchers learn who a task moved to ───────────────────────────
  console.log('\n▶ §G10-6 — the people watching learn who it moved to')
  const watched = await A('/tasks', { method: 'POST', body: { listId, title: `Handover ${stamp}` } })
  const watchedId = watched.data?.id
  // THEY watch it; I move it to myself. They are neither actor nor assignee, so
  // the only reason they would hear about it is the watcher fan-out under test.
  const watch = await B(`/tasks/${watchedId}/watchers`, { method: 'POST', body: { userId: theirId } })
  chk(watch.status < 400, 'a teammate is watching a task',
    `watch returned ${watch.status}: ${JSON.stringify(watch.error)}`)

  const theirBefore = ((await B('/notifications')).data ?? []).length
  await A(`/tasks/${watchedId}/assignees`, { method: 'POST', body: { userId: myId } })
  await settle()
  const theirRows = (await B('/notifications')).data ?? []
  const aboutIt = theirRows.filter((n) => n.target?.entityId === watchedId)
  chk(
    aboutIt.length > 0,
    'and hears about it when it is assigned',
    `their inbox went ${theirBefore} → ${theirRows.length} with nothing naming ${watchedId}`,
  )
  /*
   * "Updated." would be true and useless. The whole complaint is not knowing
   * WHO it went to, so the body has to name them.
   */
  chk(
    aboutIt.some((n) => typeof n.body === 'string' && /assigned to/i.test(n.body)),
    'and the notification says who, not just that something changed',
    `bodies: ${JSON.stringify(aboutIt.map((n) => n.body))}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
void REPO
