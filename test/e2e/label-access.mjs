/**
 * A GUEST USES THE WORKSPACE'S TAGS, AND MAKES, RENAMES AND DELETES NONE.
 *
 * NOT A FRAME ROW: `found-23-sep/labels-editable-by-any-member`, whose policy
 * question is answered by ClickUp's help (search snippets; the pages cannot be
 * fetched here): members may create, edit and delete tags — "permissions for
 * tags" is a standing feature request there — and guests "can't create, edit,
 * or delete tags", though they may add and remove them on tasks. Measured on
 * lane 1 before the fix: a guest created a tag (201), renamed the admin's
 * (200) and deleted it (200).
 *
 * Every refusal is read back from the row, beside the member doing the same.
 *
 *   node test/e2e/label-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json?.data, error: json?.error, text }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `lab-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — tags are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Tag ${who}`, email, password: 'Member@12345!',
      organizationName: `Tag ${who} ${stamp}`, organizationSlug: `tag-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return apiAs(signed.accessToken)
  }
  const M = await person('member', 'member')
  const G = await person('guest', 'guest')
  // The tags under test are planted by SQL, not made through the route under test.
  const plant = async (name) => (await sql`insert into labels (workspace_id, name, color) values (${WS}, ${name}, '#3366ff') returning id`)[0].id
  const byName = async (name) => (await sql`select count(*)::int as n from labels where workspace_id = ${WS} and name = ${name}`)[0].n
  const nameOf = async (id) => (await sql`select name from labels where id = ${id}`)[0]?.name ?? null
  const existing = `${TAG} existing`
  await plant(existing)

  // ══ 1. MAKING ONE ════════════════════════════════════════════════════════
  console.log('\n▶ typing a tag')
  const gNew = await G(`/workspaces/${WS}/labels`, { method: 'POST', body: { name: `${TAG} the guest's`, color: '#ff0000' } })
  const gFound = await G(`/workspaces/${WS}/labels`, { method: 'POST', body: { name: existing, color: '#ff0000' } })
  const mNew = await M(`/workspaces/${WS}/labels`, { method: 'POST', body: { name: `${TAG} the member's`, color: '#ff0000' } })
  chk(
    gNew.status === 403 && (await byName(`${TAG} the guest's`)) === 0 && gFound.status < 300 && gFound.data?.name === existing &&
      mNew.status === 201 && (await byName(`${TAG} the member's`)) === 1,
    'a guest makes no new tag (403, none made), though typing an existing one finds it — a member makes one',
    `the guest's new tag ${said(gNew)}; typing the existing one ${said(gFound)}; the member's ${said(mNew)}`,
  )

  // ══ 2. RENAMING ONE ══════════════════════════════════════════════════════
  console.log('\n▶ renaming')
  const target = await plant(`${TAG} to rename`)
  const gRename = await G(`/labels/${target}`, { method: 'PATCH', body: { name: `${TAG} renamed by the guest` } })
  const afterGuest = await nameOf(target)
  const mRename = await M(`/labels/${target}`, { method: 'PATCH', body: { name: `${TAG} renamed by the member` } })
  chk(
    gRename.status === 403 && afterGuest === `${TAG} to rename` && mRename.status === 200 && (await nameOf(target)) === `${TAG} renamed by the member`,
    'a guest cannot rename a tag (403, unchanged) — a member can',
    `the guest ${said(gRename)}, the name then "${afterGuest}"; the member ${said(mRename)}`,
  )

  // ══ 3. DELETING ONE ══════════════════════════════════════════════════════
  console.log('\n▶ deleting')
  const doomed = await plant(`${TAG} to delete`)
  const gDelete = await G(`/labels/${doomed}`, { method: 'DELETE' })
  const survived = (await nameOf(doomed)) !== null
  const mDelete = await M(`/labels/${doomed}`, { method: 'DELETE' })
  chk(
    gDelete.status === 403 && survived && mDelete.status === 200 && (await nameOf(doomed)) === null,
    'a guest cannot delete a tag (403, it stays) — a member can',
    `the guest ${said(gDelete)}, the tag ${survived ? 'stayed' : 'WENT'}; the member ${said(mDelete)}`,
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
