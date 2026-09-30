/**
 * §V2-07 "Saved filters" — frame `11:41`, top right of the Filters panel.
 *
 * `[11:13]` "Ab yahan pe FILTERS hain — aap filters add kar sakte ho agar aap
 * us Customize wale option pe click karte ho." The frame's panel has a
 * **Saved filters ▾** beside the rules, so a set of rules can be named and
 * come back.
 *
 * The rules THEMSELVES are evaluated in the browser and are tested there —
 * `apps/web/src/lib/task-filters.test.ts` asks the evaluator directly whether
 * `urgent and (mine or unassigned)` matches a row. What is tested here is the
 * half that crosses the wire: that a preset is per person, that saving under a
 * name you already used replaces it rather than making a second one, and that
 * the endpoint refuses a shape the panel could never have built.
 *
 *   node test/e2e/list-filters.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'
import { makeChain } from './lib/chain.mjs'
import { apiAs as apiAsAt, madeAccount } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 12

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}
// A check whose fixture is missing fails with the reason — `lib/chain.mjs`.
const chain = makeChain(chk)

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

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
  const list = (await A('/lists', { method: 'POST', body: { spaceId, name: `Filters list ${stamp}` } })).data
  if (!list?.id) throw new Error('could not make a list')
  cleanup.push(() => A(`/lists/${list.id}`, { method: 'DELETE' }))

  /* The tree the panel builds for "urgent and (mine or unassigned)". */
  const NESTED = [
    { id: 'r1', field: 'priority', op: 'is', value: 'urgent' },
    {
      id: 'g1',
      conjunction: 'or',
      rules: [
        { id: 'r2', field: 'assignee', op: 'is', value: 'someone' },
        { id: 'r3', field: 'assignee', op: 'is', value: '__unassigned__' },
      ],
    },
  ]

  console.log('\n▶ a set of rules can be named and come back')
  const saved = await A(`/lists/${list.id}/filters`, {
    method: 'POST', body: { name: `Urgent mine ${stamp}`, rules: NESTED },
  })
  chk(saved.status < 400 && !!saved.data?.id, 'a filter saves',
    `save returned ${saved.status} ${JSON.stringify(saved.error)}`)

  const listed = (await A(`/lists/${list.id}/filters`)).data ?? []
  const back = listed.find((f) => f.id === saved.data?.id)
  /*
   * Compared by content, not by `JSON.stringify`. The first version of this
   * check did the latter and failed on a correct round trip: Postgres stores
   * jsonb with its object keys reordered, so `{id,field,op,value}` comes back
   * as `{id,op,field,value}`. That assertion was testing Postgres's key
   * ordering, which is not a property of this feature.
   */
  const sameShape = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
        a.every((item, i) => sameShape(item, b[i]))
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a).sort()
      const kb = Object.keys(b).sort()
      return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameShape(a[k], b[k]))
    }
    return a === b
  }
  chk(
    sameShape(back?.rules, NESTED),
    'and comes back with its nested group intact',
    `what came back was ${JSON.stringify(back?.rules)}`,
  )

  console.log('\n▶ saving under a name you already used replaces it')
  const again = await A(`/lists/${list.id}/filters`, {
    method: 'POST',
    body: { name: `Urgent mine ${stamp}`, rules: [{ id: 'r9', field: 'status', op: 'is', value: 'done' }] },
  })
  const afterReplace = (await A(`/lists/${list.id}/filters`)).data ?? []
  chk(again.data?.id === saved.data?.id, 'the same row is updated, not a second one made',
    `a second id came back: ${again.data?.id} vs ${saved.data?.id}`)
  chk(
    afterReplace.filter((f) => f.name === `Urgent mine ${stamp}`).length === 1,
    'so there is still exactly one filter by that name',
    `there are now ${afterReplace.filter((f) => f.name === `Urgent mine ${stamp}`).length}`,
  )
  /*
   * AND THE RULES ARE THE NEW ONES, which neither check above asks.
   *
   * `lf-1-saving-makes-a-second-row` turns the upsert into
   * `onConflictDoNothing`, so the second save is silently DROPPED — one row by
   * that name, exactly as the check above requires, holding the rules from the
   * first save. It only tripped the id check by accident, because `returning()`
   * gives nothing for a dropped insert. An upsert that kept the id and forgot
   * to `set` the rules would have passed both.
   *
   * "Replaces it" is a claim about the CONTENTS, so the contents are read back.
   */
  const replaced = afterReplace.find((f) => f.id === saved.data?.id)
  chk(
    sameShape(replaced?.rules, [{ id: 'r9', field: 'status', op: 'is', value: 'done' }]),
    'and it holds the rules that were saved second, not the first set',
    `the stored rules are ${JSON.stringify(replaced?.rules)} — a save that keeps the ` +
      'row and discards the edit is the same loss as one that never happened',
  )

  console.log('\n▶ and the endpoint refuses shapes the panel could not have built')
  const notArray = await A(`/lists/${list.id}/filters`, {
    method: 'POST', body: { name: `Bad ${stamp}`, rules: { field: 'status' } },
  })
  chk(notArray.status === 400, 'rules must be an array', `an object was accepted (${notArray.status})`)
  const tooDeep = await A(`/lists/${list.id}/filters`, {
    method: 'POST',
    body: {
      name: `Deep ${stamp}`,
      rules: [{ id: 'g', conjunction: 'or', rules: [{ id: 'g2', conjunction: 'and', rules: [] }] }],
    },
  })
  chk(
    tooDeep.status === 400,
    'and a bracket inside a bracket is refused — the panel has no control for it',
    `a two-level nest was accepted (${tooDeep.status}), and nothing can render it`,
  )
  const noName = await A(`/lists/${list.id}/filters`, { method: 'POST', body: { name: '   ', rules: [] } })
  chk(noName.status === 400, 'a filter needs a name', `a blank name was accepted (${noName.status})`)

  console.log('\n▶ a saved filter is yours')
  const peer = { email: `filterpeer-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  // Registered, so the account is removed when the run ends (`lib/made.mjs`).
  madeAccount({ email: peer.email })
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Filter Peer ${stamp}`,
      email: peer.email,
      password: peer.password,
      organizationName: `FilterPeer ${stamp}`,
      organizationSlug: `filterpeer-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  const peerId = signup.data.user?.id
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST', body: { email: peer.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status} — nothing below this line means anything`)
  cleanup.push(() => A(`/workspaces/${workspaceId}/members/${peerId}`, { method: 'DELETE' }))
  const B = apiAs(signup.data.accessToken)

  const theirs = (await B(`/lists/${list.id}/filters`)).data ?? []
  chk(
    Array.isArray(theirs) && theirs.length === 0,
    'another member on the same list sees none of yours',
    `they saw ${JSON.stringify(theirs.map((f) => f.name))}`,
  )
  /*
   * THE ID IS READ OPTIONALLY. "A filter saves" is a check that may fail, and
   * `saved.data.id` then threw here, ending the run two checks short. The two
   * deletes need the filter, so they fail naming it instead.
   */
  const savedId = saved.data?.id
  const deletes = chain('and cannot delete one', 'while you can delete your own')
  if (!savedId) {
    deletes.rest(`skipped: the filter was never saved (POST answered ${saved.status}), so there was none to delete`)
  } else {
    const theirDelete = await B(`/lists/${list.id}/filters/${savedId}`, { method: 'DELETE' })
    deletes.step(theirDelete.status === 404,
      `deleting somebody else's saved filter returned ${theirDelete.status}`)

    const mineGone = await A(`/lists/${list.id}/filters/${savedId}`, { method: 'DELETE' })
    deletes.step(mineGone.status < 400, `deleting your own returned ${mineGone.status}`)
  }
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Each is a DELETE: gone, or already gone (404), is fine; anything else is
  // left behind, and said above the totals by the call that did not do it.
  for (const fn of cleanup.reverse()) {
    const what = String(fn).replace(/^\(\) => /, '')
    try {
      const res = await fn()
      if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: ${what} answered ${res.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: ${what} got no answer (${err?.message ?? err})`)
    }
  }
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
