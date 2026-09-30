/**
 * THE TRASH, AS CLICKUP KEEPS IT: EVERYONE RESTORES WHAT THEY DELETED; ONLY AN
 * ADMIN DELETES FOR GOOD.
 *
 * NOT A FRAME ROW: `found-28-sep/trash-deletes-for-good-wider-than-clickup`,
 * found by the deletion research. The Trash counted a manager as an admin (every
 * deleted item listed, restored and purged) and let a member delete for good
 * whatever they had deleted.
 *
 * ClickUp (help centre "Restore items from the Trash", search snippet): "The
 * Workspace owner and admins can see, restore, or permanently delete any public
 * items. Members and guests can only see and restore items they have deleted."
 * Guests cannot permanently delete or empty the Trash.
 *
 *   node test/e2e/trash-rules.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `trr${stamp}`
const PASSWORD = 'TrashRules@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what the Trash holds is read back by SQL')
  A = apiAs((await signInApi(API, ADMIN.email, ADMIN.password)).accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Trash ${key}`, email, password: PASSWORD, organizationName: `Trash ${key} ${stamp}`, organizationSlug: `trash-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const as = apiAs(signed.accessToken)
    as.id = signed.user?.id
    return as
  }
  const M = await person('member', 'member')
  const G = await person('manager', 'manager')
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  // The manager belongs to the space: a manager deletes only in their own spaces.
  const joined = await A(`/spaces/${space.data?.id}/members`, { method: 'POST', body: { userId: G.id, role: 'edit' } })
  if (joined.status >= 300) throw new Error(`could not add the manager to the space: ${said(joined)}`)
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the list: ${said(space)} ${said(project)} ${said(list)}`)
  const trashed = async (who, name) => {
    const t = await who('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${name}` } })
    if (t.status >= 300 || !t.data?.id) throw new Error(`could not make the ${name} task: ${said(t)}`)
    const d = await who(`/tasks/${t.data.id}/trash`, { method: 'POST' })
    if (d.status >= 300) throw new Error(`could not delete the ${name} task: ${said(d)}`)
    return t.data.id
  }
  const MINE = await trashed(M, 'the member deleted')
  const MINE2 = await trashed(M, 'the member deleted too')
  const HERS = await trashed(G, 'the manager deleted')
  const ADMINS = await trashed(A, 'the admin deleted')
  const ADMINS2 = await trashed(A, 'the admin deleted too')
  const listed = async (who) => {
    const r = await who(`/workspaces/${WS}/trash?types=task`)
    return new Set((r.data?.items ?? r.data ?? []).map((i) => i.id))
  }
  const state = async (id) => {
    const [row] = await sql`select deleted_at from tasks where id = ${id}`
    return row ? (row.deleted_at ? 'trash' : 'live') : 'gone'
  }

  console.log('\n▶ a member')
  const mSees = await listed(M)
  const mRestore = await M(`/workspaces/${WS}/trash/task/${MINE}/restore`, { method: 'POST' })
  const mPurgeOwn = await M(`/workspaces/${WS}/trash/task/${MINE2}`, { method: 'DELETE' })
  const mPurgeAdmins = await M(`/workspaces/${WS}/trash/task/${ADMINS}`, { method: 'DELETE' })
  chk(
    mSees.has(MINE) && mSees.has(MINE2) && !mSees.has(ADMINS) && !mSees.has(HERS),
    'a member’s Trash lists what they deleted and nothing anyone else did',
    `listed: theirs ${mSees.has(MINE) && mSees.has(MINE2)}, the admin’s ${mSees.has(ADMINS)}, the manager’s ${mSees.has(HERS)}`,
  )
  chk(
    mRestore.ok && (await state(MINE)) === 'live'
      && mPurgeOwn.status === 403 && (await state(MINE2)) === 'trash'
      && mPurgeAdmins.status === 403 && (await state(ADMINS)) === 'trash',
    'a member restores what they deleted, and deletes nothing for good — not even their own (403, it stays in the Trash)',
    `restore ${said(mRestore)} → ${await state(MINE)}; purge their own ${said(mPurgeOwn)} → ${await state(MINE2)}; purge the admin’s ${said(mPurgeAdmins)} → ${await state(ADMINS)}`,
  )

  console.log('\n▶ a manager')
  const gSees = await listed(G)
  const gPurge = await G(`/workspaces/${WS}/trash/task/${ADMINS}`, { method: 'DELETE' })
  const gRestore = await G(`/workspaces/${WS}/trash/task/${ADMINS2}/restore`, { method: 'POST' })
  const gEmpty = await G(`/workspaces/${WS}/trash`, { method: 'DELETE' })
  chk(
    gSees.has(HERS) && !gSees.has(ADMINS) && !gSees.has(MINE2)
      && gPurge.status === 403 && gRestore.status === 403 && gEmpty.status === 403
      && (await state(ADMINS)) === 'trash' && (await state(ADMINS2)) === 'trash',
    'a manager’s Trash is a member’s: their own deletions only, and no one else’s restored, purged or emptied (403 each)',
    `listed: theirs ${gSees.has(HERS)}, the admin’s ${gSees.has(ADMINS)}, the member’s ${gSees.has(MINE2)}; purge ${said(gPurge)}, restore ${said(gRestore)}, empty ${said(gEmpty)}; the admin’s two: ${await state(ADMINS)}, ${await state(ADMINS2)}`,
  )

  console.log('\n▶ the admin')
  const aSees = await listed(A)
  const aPurge = await A(`/workspaces/${WS}/trash/task/${MINE2}`, { method: 'DELETE' })
  const aEmpty = await A(`/workspaces/${WS}/trash`, { method: 'DELETE' })
  chk(
    aSees.has(MINE2) && aSees.has(HERS) && aSees.has(ADMINS)
      && aPurge.ok && (await state(MINE2)) === 'gone'
      && aEmpty.ok && (await state(ADMINS)) === 'gone' && (await state(HERS)) === 'gone',
    'an admin sees every deletion, deletes one for good, and empties the Trash',
    `listed all ${aSees.has(MINE2) && aSees.has(HERS) && aSees.has(ADMINS)}; purge ${said(aPurge)} → ${await state(MINE2)}; empty ${said(aEmpty)} → ${await state(ADMINS)}, ${await state(HERS)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
