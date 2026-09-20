/**
 * §V2-02 — the Planner's time blocks.
 *
 * `[14:52]` "Yahan pe jo mujhe task add hote hain, main un ko bhi apne planner
 * mein add kar sakti hoon DRAG AND DROP se." Frame `13:08` is the grid they
 * land on — a week, an all-day row, an hour gutter, a red now-line.
 *
 * Before this, `grep -ri "time.block"` across `apps/` and `packages/` returned
 * zero files. Rundesk's calendar was a list VIEW TYPE and a read-only strip on
 * the person panel; there was nowhere to record "I will work on this from 2 to
 * 4 on Thursday".
 *
 * THE TWO CHECKS THAT ARE NOT ABOUT THE FEATURE.
 *
 * A block is personal — `[14:56]` "yeh MERI planner pe show honge" — so a
 * second member must not be able to read or delete one. And the label is
 * RESOLVED, not stored: renaming a task has to rename every block pointing at
 * it, or last week's grid describes a task by a name it no longer has.
 *
 *   node test/e2e/planner-blocks.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 19

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
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
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

/** Fixed instants, so "which week does this land in" is an exact question. */
const MON = '2026-08-03T09:00:00.000Z'
const MON_END = '2026-08-03T11:00:00.000Z'
const WEEK1_FROM = '2026-08-03T00:00:00.000Z'
const WEEK1_TO = '2026-08-10T00:00:00.000Z'
const WEEK2_TO = '2026-08-17T00:00:00.000Z'
/** Exactly the boundary between week one and week two. */
const BOUNDARY = '2026-08-10T00:00:00.000Z'

const cleanup = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  const spaceId = spaces[0]?.id
  if (!spaceId) throw new Error('no space')
  const list = (await A('/lists', { method: 'POST', body: { spaceId, name: `Planner list ${stamp}` } })).data
  if (!list?.id) throw new Error('could not make a list')
  cleanup.push(() => A(`/lists/${list.id}`, { method: 'DELETE' }))
  const task = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Plan me ${stamp}` } })).data
  if (!task?.id) throw new Error('could not make a task')

  console.log('\n▶ a task can be dropped onto the grid `[14:52]`')
  const made = await A(`/planner/${workspaceId}/blocks`, {
    method: 'POST', body: { taskId: task.id, startsAt: MON, endsAt: MON_END },
  })
  chk(made.status < 400 && !!made.data?.id, 'a block is created from a task',
    `POST returned ${made.status} ${JSON.stringify(made.error)}`)

  const week1 = (await A(`/planner/${workspaceId}/blocks?from=${WEEK1_FROM}&to=${WEEK1_TO}`)).data ?? []
  const mine = week1.find((b) => b.id === made.data?.id)
  chk(!!mine, 'and it appears in that week', `the week returned ${week1.length} block(s), none of them this one`)
  chk(
    mine?.label === `Plan me ${stamp}`,
    'labelled from the task',
    `the label was ${JSON.stringify(mine?.label)}`,
  )
  chk(mine?.taskStatus != null && mine?.taskPriority != null,
    'and carrying the task\'s status and priority, so the grid can colour it',
    `taskStatus=${JSON.stringify(mine?.taskStatus)} taskPriority=${JSON.stringify(mine?.taskPriority)}`)

  console.log('\n▶ the label follows the task, because it is resolved not stored')
  await A(`/tasks/${task.id}`, { method: 'PATCH', body: { title: `Renamed ${stamp}` } })
  const afterRename = (await A(`/planner/${workspaceId}/blocks?from=${WEEK1_FROM}&to=${WEEK1_TO}`)).data ?? []
  chk(
    afterRename.find((b) => b.id === made.data?.id)?.label === `Renamed ${stamp}`,
    'renaming the task renames the block',
    'the block kept the old title — a stored copy leaves last week describing a task by a name it lost',
  )

  console.log('\n▶ the week range is half-open, so two weeks never double-count')
  const edge = await A(`/planner/${workspaceId}/blocks`, {
    method: 'POST', body: { title: `Edge ${stamp}`, startsAt: BOUNDARY, endsAt: '2026-08-10T01:00:00.000Z' },
  })
  chk(edge.status < 400, 'a block can be a typed line with no task at all',
    `POST returned ${edge.status} ${JSON.stringify(edge.error)}`)
  const w1 = (await A(`/planner/${workspaceId}/blocks?from=${WEEK1_FROM}&to=${WEEK1_TO}`)).data ?? []
  const w2 = (await A(`/planner/${workspaceId}/blocks?from=${WEEK1_TO}&to=${WEEK2_TO}`)).data ?? []
  const inW1 = w1.some((b) => b.id === edge.data?.id)
  const inW2 = w2.some((b) => b.id === edge.data?.id)
  chk(
    inW1 !== inW2,
    'a block exactly on the boundary is in one week, not both',
    `it was in week1=${inW1} week2=${inW2} — a closed range double-counts every midnight block`,
  )
  chk(inW2, 'and it belongs to the later one, which is the week it starts in',
    'the boundary block landed in the week it ends, not the week it starts')

  console.log('\n▶ what a block will not accept')
  const backwards = await A(`/planner/${workspaceId}/blocks`, {
    method: 'POST', body: { title: 'nope', startsAt: MON_END, endsAt: MON },
  })
  /*
   * The MESSAGE, not just the status.
   *
   * This invariant has two enforcers: the service checks it, and a CHECK
   * constraint on the table refuses it. The first version of this check
   * asserted only `status === 400`, and the break test that deleted the
   * service check still passed — because the database caught it and a global
   * filter turned it into 400 "A value failed a database constraint".
   *
   * Which is a real difference. The row is rejected either way; what changes
   * is whether the person is told what they did or told that a database was
   * unhappy. Asserting the sentence is what makes the service's check
   * load-bearing rather than decorative.
   */
  chk(
    backwards.status === 400 && /end after it starts/i.test(backwards.error?.message ?? ''),
    'a block cannot end before it starts, and is told so in words',
    `it returned ${backwards.status} ${JSON.stringify(backwards.error?.message)} — the constraint refuses the row either way, so this is about the sentence`,
  )
  const naked = await A(`/planner/${workspaceId}/blocks`, { method: 'POST', body: { startsAt: MON } })
  chk(naked.status === 400, 'and cannot be neither a task nor a label',
    `an empty block was accepted (${naked.status}) — the grid would draw a rectangle with nothing in it`)
  const huge = await A(`/planner/${workspaceId}/blocks?from=2026-01-01T00:00:00.000Z&to=2027-01-01T00:00:00.000Z`)
  chk(huge.status === 400, 'and a year-long range is refused rather than served',
    `a 365-day range returned ${huge.status}`)

  console.log('\n▶ the default duration is the person\'s own `[frame 14:10]`')
  await A(`/planner/${workspaceId}/settings`, { method: 'PATCH', body: { defaultDurationMinutes: 30 } })
  const dropped = await A(`/planner/${workspaceId}/blocks`, {
    method: 'POST', body: { title: `Dropped ${stamp}`, startsAt: MON },
  })
  const mins = dropped.data
    ? (new Date(dropped.data.endsAt) - new Date(dropped.data.startsAt)) / 60000
    : null
  chk(mins === 30, 'dropping a task with no end uses the configured duration',
    `the block came out ${mins} minutes long — dragging onto the grid does not ask for a length`)
  const badDuration = await A(`/planner/${workspaceId}/settings`, {
    method: 'PATCH', body: { defaultDurationMinutes: 4000 },
  })
  chk(badDuration.status === 400, 'and a duration longer than a day is refused',
    `a ${4000}-minute default was accepted (${badDuration.status})`)
  const badList = await A(`/planner/${workspaceId}/settings`, {
    method: 'PATCH', body: { defaultListId: '00000000-0000-4000-8000-000000000000' },
  })
  chk(
    badList.status === 400,
    'a default list that does not exist is refused',
    `it was accepted (${badList.status}) — every task made from a message would then fail somewhere nobody sees`,
  )
  const settings = (await A(`/planner/${workspaceId}/settings`)).data
  chk(settings?.defaultDurationMinutes === 30, 'and the settings round-trip',
    `settings read back as ${JSON.stringify(settings)}`)

  console.log('\n▶ a planner is one person\'s')
  const peer = { email: `plannerpeer-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Planner Peer ${stamp}`,
      email: peer.email,
      password: peer.password,
      organizationName: `PlannerPeer ${stamp}`,
      organizationSlug: `plannerpeer-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  const peerId = signup.data.user?.id
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST', body: { email: peer.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status} — nothing below this means anything`)
  cleanup.push(() => A(`/workspaces/${workspaceId}/members/${peerId}`, { method: 'DELETE' }))
  const B = apiAs(signup.data.accessToken)

  const theirs = (await B(`/planner/${workspaceId}/blocks?from=${WEEK1_FROM}&to=${WEEK1_TO}`)).data ?? []
  chk(
    Array.isArray(theirs) && theirs.length === 0,
    'another member of the same workspace sees none of my blocks',
    `they saw ${theirs.length} — a planner is a person's day, not their work`,
  )
  const theirDelete = await B(`/planner/${workspaceId}/blocks/${made.data.id}`, { method: 'DELETE' })
  chk(theirDelete.status === 404, 'and cannot delete one — 404, not 403',
    `deleting somebody else's block returned ${theirDelete.status}`)

  const mineGone = await A(`/planner/${workspaceId}/blocks/${made.data.id}`, { method: 'DELETE' })
  chk(mineGone.status < 400, 'while I can delete my own', `deleting my own returned ${mineGone.status}`)
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) await fn().catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
