/**
 * §G03-6 [04:00–04:04] — the two sort modes her Sort menu has and ours did not:
 * "Trending In Workspace" and "Trending For You".
 *
 * Trending is a claim about what people are OPENING, and nothing recorded that.
 * It could not be faked from data already on hand — `updatedAt` tells you what
 * was EDITED, which is a different and much smaller group of people than the
 * ones reading it — so this needed telemetry before it could need a sort.
 *
 * Which makes the shape of these checks the important part: the sort is only
 * real if opening something CHANGES the order. So each check does the opening
 * itself and compares against what relevance returned a moment earlier, rather
 * than asserting the option exists.
 *
 *   node test/e2e/trending-sort.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 6

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
const split = (hitId) => {
  const at = hitId.indexOf('-')
  return { entityType: hitId.slice(0, at), entityId: hitId.slice(at + 1) }
}

try {
  const mine = await loginAs(ME)
  const theirs = await loginAs(PEER)
  const A = apiAs(mine.accessToken)
  const B = apiAs(theirs.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  /*
   * Its own list of tasks, all matching one nonsense word.
   *
   * Using whatever the workspace already contains would mean the "least
   * relevant hit" is different every run, and any engagement left by an earlier
   * run would already be scoring it. A fresh word nobody has opened is the only
   * way the before/after comparison means anything.
   */
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const lists = (await A(`/lists/project/${p.id}`)).data ?? []
      if (lists[0]?.id) { listId = lists[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make tasks in')

  const word = `zephyrine${stamp}`
  const made = []
  for (let i = 0; i < 4; i += 1) {
    const t = await A('/tasks', { method: 'POST', body: { listId, title: `${word} candidate ${i}` } })
    if (t.data?.id) made.push(`task-${t.data.id}`)
  }
  chk(made.length === 4, 'there are several hits to order', `only made ${made.length}`)
  await new Promise((r) => setTimeout(r, 1500))

  console.log('\n▶ §G03-6 — trending is about what people open')

  const baseline = ((await A(`/search/${workspaceId}?q=${word}`)).data ?? []).map((h) => h.id)
  chk(baseline.length >= 3, 'and relevance returns them in some order',
    `search returned ${baseline.length} hits for a fresh word`)

  /*
   * Open the one relevance put LAST. If trending were quietly falling back to
   * relevance — the way an unrecognised sort does — the order would not move,
   * and picking the last one is what makes that visible.
   */
  const underdog = baseline[baseline.length - 1]
  for (let i = 0; i < 5; i += 1) {
    await A(`/search/${workspaceId}/opened`, { method: 'POST', body: split(underdog) })
  }
  const trending = ((await A(`/search/${workspaceId}?q=${word}&sort=trending`)).data ?? []).map((h) => h.id)
  chk(
    trending[0] === underdog,
    'opening the least relevant hit five times puts it first',
    `trending led with ${trending[0]}, expected ${underdog}`,
  )

  /*
   * And everything else keeps the order relevance gave it. Without a tiebreak
   * the unopened tail would come back shuffled — a sort that reorders the top
   * and randomises the rest, which is worse than no sort at all.
   */
  const restAfter = trending.filter((id) => id !== underdog)
  const restBefore = baseline.filter((id) => id !== underdog)
  chk(
    restAfter.join(',') === restBefore.join(','),
    'and leaves the rest exactly as relevance had them',
    `tail was ${restBefore.join(',')}, became ${restAfter.join(',')}`,
  )

  /*
   * "Trending For You" is a different question from "Trending In Workspace".
   * A colleague opening something must move the workspace list and NOT my own —
   * if both read the same rows, one of the two menu entries is decoration.
   */
  const theirPick = restBefore[0]
  for (let i = 0; i < 9; i += 1) {
    await B(`/search/${workspaceId}/opened`, { method: 'POST', body: split(theirPick) })
  }
  const workspaceTrend = ((await A(`/search/${workspaceId}?q=${word}&sort=trending`)).data ?? []).map((h) => h.id)
  chk(
    workspaceTrend[0] === theirPick,
    "a colleague's opens move the workspace list",
    `workspace trending led with ${workspaceTrend[0]}, expected ${theirPick}`,
  )
  const myTrend = ((await A(`/search/${workspaceId}?q=${word}&sort=trending_me`)).data ?? []).map((h) => h.id)
  chk(
    myTrend[0] === underdog,
    'and leave mine alone — "for you" is my opens, not everybody\'s',
    `my trending led with ${myTrend[0]}, expected ${underdog}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
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
