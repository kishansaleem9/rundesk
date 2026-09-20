/**
 * A malformed id is turned away before it reaches the database.
 *
 * Every id in this schema addresses a `uuid` column, and Postgres does not
 * treat a non-UUID as a value that matches nothing — it refuses the query and
 * answers with an error. So any route that passed an unchecked id into a
 * `where` clause turned a bad request into a database failure.
 *
 * Both halves of that were live. `ResourceMemberGuard` resolved `p.spaceId`
 * straight into a lookup, and the CI Postgres log carried pages of
 * `invalid input syntax for type uuid: "dashboards"` from a sweep whose URL had
 * fallen through to a route it never meant to match. And `GET /calls/live`
 * guarded with `if (!channelId)`, which the string "null" walks straight past —
 * so a client that interpolated a missing id into its query string reached
 * `where channel_id = 'null'`.
 *
 * WHAT THIS ASSERTS, and why it is not the status code:
 *
 * Both the old behaviour and the new one answer 400, so the status proves
 * nothing. What separates them is WHO produced it. A query Postgres refused
 * comes back through the exception filter as the generic
 * "A value has an invalid format"; a request rejected on the way in names what
 * was wrong with it. So the check is "not the database's answer", rather than
 * any particular wording of ours — rephrasing our own message must not turn
 * this green when the validation is gone.
 *
 *   node test/e2e/malformed-ids.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

/** The message the exception filter produces when Postgres rejected the query. */
const DATABASE_REFUSED = 'A value has an invalid format'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route) => {
  const res = await fetch(`${API}${route}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace to work in')

  /*
   * The literal that started this: a sweep asked for `/app/<ws>/dashboards`,
   * there is no such route, and it fell through to `$spaceId`. Whatever the
   * page then asked the API for, none of it should have reached Postgres.
   */
  console.log('\n▶ a path param that cannot be an id')
  for (const route of [
    `/spaces/dashboards`,
    `/projects/space/dashboards`,
    `/lists/space/dashboards`,
  ]) {
    const r = await A(route)
    chk(
      r.status === 400 && r.error?.message !== DATABASE_REFUSED,
      `${route} is turned away before the database`,
      `${route} -> ${r.status} ${JSON.stringify(r.error?.message)}`,
    )
  }

  console.log('\n▶ a query param that cannot be an id')
  const live = await A(`/workspaces/${workspaceId}/calls/live?channelId=null`)
  chk(
    live.status === 400 && live.error?.message !== DATABASE_REFUSED,
    'the live-call lookup rejects "null" rather than asking about it',
    `-> ${live.status} ${JSON.stringify(live.error?.message)}`,
  )

  // Absent is a different thing from malformed, and still means "no call".
  const absent = await A(`/workspaces/${workspaceId}/calls/live`)
  chk(
    absent.status < 400,
    'and no channel at all is still simply no call',
    `omitting channelId returned ${absent.status}`,
  )

  /*
   * The control, without which every check above passes under a build that
   * answers 400 to everything: an id of the right SHAPE has to be handled
   * normally, whether it exists or not.
   */
  console.log('\n▶ a well-formed id is unaffected')
  const nowhere = '00000000-0000-4000-8000-000000000000'
  const missingSpace = await A(`/projects/space/${nowhere}`)
  chk(
    missingSpace.status !== 400,
    'a well-formed id that matches nothing is not a malformed one',
    `/projects/space/<valid uuid> -> ${missingSpace.status}, same as a malformed id`,
  )
  const noCall = await A(`/workspaces/${workspaceId}/calls/live?channelId=${nowhere}`)
  chk(
    noCall.status < 400,
    'and a well-formed channelId is answered, not rejected',
    `/calls/live?channelId=<valid uuid> -> ${noCall.status}`,
  )

  const real = await A(`/spaces/workspace/${workspaceId}`)
  chk(
    real.status < 400 && Array.isArray(real.data),
    'while the ordinary space listing still works',
    `/spaces/workspace/<id> -> ${real.status}`,
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
