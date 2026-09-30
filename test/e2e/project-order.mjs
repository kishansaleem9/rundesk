/**
 * A SPACE'S PROJECTS COME BACK IN THE ORDER THEY WERE PUT IN.
 *
 * NOT A FRAME ROW: `ledger-rows/defect-projects-position-unordered`. The
 * sidebar sorts by `position` itself, and the fourteen other surfaces that
 * read a space's projects (the Move dialog, the palette's Location filter,
 * every project picker) took `GET /projects/space/:id` as it came: it had no
 * ORDER BY, so a dragged order held in the sidebar only, and the rest showed
 * whatever order the database answered in.
 *
 * Positions are planted by SQL, the reverse of the order the projects were
 * made in, with two sharing a position so the tie is broken by age.
 *
 *   node test/e2e/project-order.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 1

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `por-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the positions are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  if (!space) throw new Error('could not make the space')
  const names = ['first made', 'second made', 'third made', 'fourth made']
  const ids = []
  for (const n of names) {
    const p = await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} ${n}` } })
    if (p.status >= 300 || !p.data?.id) throw new Error(`could not make the project "${n}": ${said(p)}`)
    ids.push(p.data.id)
    await new Promise((r) => setTimeout(r, 30))
  }
  // Dragged into the reverse of the order they were made in, the middle two
  // sharing a place, so the older of those two comes first.
  const positions = [3, 1, 1, 0]
  for (let i = 0; i < ids.length; i++) await sql`update projects set position = ${positions[i]} where id = ${ids[i]}`
  const expected = [ids[3], ids[1], ids[2], ids[0]]

  console.log('\n▶ the space’s projects, as every picker reads them')
  const listed = await A(`/projects/space/${space}`)
  const order = (listed.data ?? []).map((p) => p.id).filter((id) => ids.includes(id))
  chk(
    listed.status === 200 && JSON.stringify(order) === JSON.stringify(expected),
    'a space’s projects come back in their dragged order, a shared place kept by age',
    `${said(listed)}; came back as ${JSON.stringify(order.map((id) => names[ids.indexOf(id)]))}, expected ${JSON.stringify(expected.map((id) => names[ids.indexOf(id)]))}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
