/**
 * WHAT A READ SHOWS DEPENDS ON WHO IS READING — the privacy rules on the lists
 * that gather work from across a workspace.
 *
 * NOT A FRAME ROW. The open-work item `teams-work-preview-ignores-privacy`:
 * `GET /workspaces/:ws/teams/work-preview` listed every member's open tasks
 * with no viewer at all, so a member kept out of a private space, a private
 * project or a private list — or off a private task — read its title and due
 * date from a teammate's card on the Teams page.
 *
 * FIVE TASKS, ONE PERSON, FOUR WAYS TO BE HIDDEN. The teammate is assigned one
 * public task and one in each private container, plus one private task. A plain
 * member must see exactly the public one, and the count on the card must count
 * only what is shown — "5 open" beside one visible title says four more exist.
 * The positive twins are the manager, who sees all five, and the teammate, who
 * sees all five of their own: a filter that hid everything fails as surely as
 * one that hid nothing.
 *
 *   node test/e2e/read-visibility.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 8

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
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`

const stamp = Date.now()
const TAG = `rv-${stamp}`
const cleanup = []
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — containers are made private by SQL')

  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)

  const make = async (as, route, body, what) => {
    const res = await as(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const WA = await make(A, '/workspaces', { name: `${TAG}` }, 'the workspace')
  cleanup.push(() => A(`/workspaces/${WA}`, { method: 'DELETE' }))

  const account = async (label) => {
    const email = `rv-${label}-${stamp}@rundesk.invalid`
    const res = await apiAs(null)('/auth/signup', {
      method: 'POST',
      body: {
        fullName: `Reader ${label} ${stamp}`, email, password: 'Member@12345!',
        organizationName: `Reader ${label} ${stamp}`, organizationSlug: `reader-${label}-${stamp}`,
      },
    })
    const id = res.data?.user?.id ?? res.data?.id
    if (!res.data?.accessToken || !id) throw new Error(`signup of the ${label} failed: ${said(res)}`)
    const added = await A(`/workspaces/${WA}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${label}: ${said(added)}`)
    return { id, as: apiAs(res.data.accessToken) }
  }
  const viewer = await account('viewer')
  const mate = await account('teammate')

  // ── the containers ──────────────────────────────────────────────────────
  const SPUB = await make(A, '/spaces', { workspaceId: WA, name: `${TAG} public` }, 'the public space')
  const PPUB = await make(A, '/projects', { spaceId: SPUB, name: `${TAG} public project` }, 'the public project')
  const LPUB = await make(A, '/lists', { projectId: PPUB, name: `${TAG} public list` }, 'the public list')
  const PPRIV = await make(A, '/projects', { spaceId: SPUB, name: `${TAG} private project` }, 'the private project')
  const LPP = await make(A, '/lists', { projectId: PPRIV, name: `${TAG} in the private project` }, 'its list')
  const SPRIV = await make(A, '/spaces', { workspaceId: WA, name: `${TAG} private space` }, 'the private space')
  const PPS = await make(A, '/projects', { spaceId: SPRIV, name: `${TAG} project in the private space` }, 'its project')
  const LPS = await make(A, '/lists', { projectId: PPS, name: `${TAG} in the private space` }, 'its list')
  // Private by SQL — what is under test is who READS, not how privacy is set.
  // The teammate is IN each private container, so assigning them work there
  // is legitimate; the viewer is in none of them.
  await sql`update projects set visibility = 'private' where id = ${PPRIV}`
  await sql`update spaces set visibility = 'private' where id = ${SPRIV}`
  await sql`insert into project_members (project_id, user_id) values (${PPRIV}, ${mate.id}) on conflict do nothing`
  await sql`insert into space_members (space_id, user_id) values (${SPRIV}, ${mate.id}) on conflict do nothing`
  // A private list is its creator's: the teammate makes it, so their own work
  // can live in it.
  const LPL = await make(mate.as, '/lists', { projectId: PPUB, name: `${TAG} private list` }, 'the private list')
  await sql`update lists set visibility = 'private' where id = ${LPL}`

  // ── the teammate's five open tasks ──────────────────────────────────────
  const task = async (listId, title, as = A) =>
    make(as, '/tasks', { listId, title, assigneeIds: [mate.id] }, `the task "${title}"`)
  const T_PUB = await task(LPUB, `${TAG} public`)
  const T_PP = await task(LPP, `${TAG} in a private project`)
  const T_PS = await task(LPS, `${TAG} in a private space`)
  const T_PL = await task(LPL, `${TAG} in a private list`, mate.as)
  const T_PT = await task(LPUB, `${TAG} private task`)
  const madePrivate = await A(`/tasks/${T_PT}`, { method: 'PATCH', body: { visibility: 'private' } })
  if (madePrivate.status !== 200) throw new Error(`could not make the task private: ${said(madePrivate)}`)
  const ALL = [T_PUB, T_PP, T_PS, T_PL, T_PT]

  const cardFor = async (as) => {
    const res = await as(`/workspaces/${WA}/teams/work-preview?perPerson=10`)
    const card = (res.data ?? []).find((p) => p.userId === mate.id)
    return { status: res.status, card, ids: (card?.items ?? []).map((i) => i.id) }
  }

  // ══ THE TEAMS PREVIEW ════════════════════════════════════════════════════
  console.log('\n▶ a teammate’s card shows the viewer what the viewer may see')

  const seen = await cardFor(viewer.as)
  chk(
    seen.status === 200 && seen.ids.includes(T_PUB),
    'a member sees the teammate’s public work on their card',
    `the preview answered ${seen.status} and the card lists ${JSON.stringify(seen.ids)}`,
  )
  chk(
    !seen.ids.includes(T_PS),
    'but not a task in a private space the member is not in',
    `the card lists it: ${JSON.stringify(seen.ids)}`,
  )
  chk(
    !seen.ids.includes(T_PP),
    'nor one in a private project they are not in',
    `the card lists it: ${JSON.stringify(seen.ids)}`,
  )
  chk(
    !seen.ids.includes(T_PL),
    'nor one in somebody else’s private list',
    `the card lists it: ${JSON.stringify(seen.ids)}`,
  )
  chk(
    !seen.ids.includes(T_PT),
    'nor a private task they neither made nor are assigned',
    `the card lists it: ${JSON.stringify(seen.ids)}`,
  )
  chk(
    seen.card?.openCount === seen.ids.length,
    'and the card’s count is of what it shows — a count of hidden work says it exists',
    `the card says ${seen.card?.openCount} open beside ${seen.ids.length} shown`,
  )

  const managed = await cardFor(A)
  chk(
    ALL.every((id) => managed.ids.includes(id)) && managed.card?.openCount === 5,
    'while a manager sees all five',
    `the manager's card lists ${managed.ids.length} of 5 and says ${managed.card?.openCount} open`,
  )

  const own = await cardFor(mate.as)
  chk(
    ALL.every((id) => own.ids.includes(id)) && own.card?.openCount === 5,
    'and the teammate sees all five of their own',
    `their own card lists ${own.ids.length} of 5 and says ${own.card?.openCount} open`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) {
    const res = await fn().catch((e) => ({ status: 0, error: String(e?.message ?? e) }))
    if (res.status === 0 || res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${said(res)}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
