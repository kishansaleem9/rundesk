/**
 * A DOC IS ARCHIVED AND DELETED AT EDIT, THROUGH EITHER ROUTE, AND LANDS IN THE
 * TRASH OF WHOEVER DID IT.
 *
 * NOT A FRAME ROW: `found-28-sep/doc-archive-and-delete-at-two-levels`, found by
 * the deletion research. `PATCH /docs/:id {isArchived: true}` was allowed at
 * Edit and `DELETE /docs/:id` asked Full edit, for the same result: the doc in
 * the Trash. And the PATCH wrote the flag alone, with no date and no deleter,
 * so the doc sat in the Trash as nobody's — not in the Trash of the member who
 * archived it, who could not restore it.
 *
 * ClickUp (help centre, from search snippets): "Anyone, including guests, with
 * Edit permissions can archive and unarchive Docs", and "Guests with edit
 * permissions can edit and delete Docs and pages". Docs are the exception to
 * the location rule, where Edit changes and Full edit deletes. Docs and shares
 * are planted by SQL and every answer is read back from the row.
 *
 *   node test/e2e/doc-trash-level.mjs --api 3027
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `dtl${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — docs and shares are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Archiver ${who}`, email, password: 'Member@12345!',
      organizationName: `Archiver ${who} ${stamp}`, organizationSlug: `archiver-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  if (!member.id || !guest.id || !adminId) throw new Error('a sign-up answered with no user id')

  const PRIVATE = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} private`, visibility: 'private' } })).data?.id
  if (!PRIVATE) throw new Error('could not make the private space')
  const doc = async (title) =>
    (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${PRIVATE}, ${title}, ${adminId}) returning id`)[0].id
  const share = (docId, userId, level) =>
    sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'doc', ${docId}, ${userId}, ${level})`
  const row = async (id) => (await sql`select is_archived, archived_at, archived_by_id from docs where id = ${id}`)[0]
  /** The doc as `who`'s own Trash lists it: deleted by them, with a date. */
  const inTrashOf = async (who, id) => {
    const res = await who.as(`/workspaces/${WS}/trash?types=doc`)
    const item = (res.data?.items ?? []).find((i) => i.id === id && i.type === 'doc')
    return !!item && item.deletedBy?.id === who.id && !!item.deletedAt
  }

  // ══ 1. EDIT DELETES ══════════════════════════════════════════════════════
  console.log('\n▶ a member with an Edit share deletes the doc')
  const deleted = await doc(`${TAG} deleted at edit`)
  await share(deleted, member.id, 'edit')
  const d = await member.as(`/docs/${deleted}`, { method: 'DELETE' })
  const dRow = await row(deleted)
  const dTrash = await inTrashOf(member, deleted)
  chk(
    d.status < 300 && dRow?.is_archived === true && dTrash,
    'a member with an Edit share deletes a doc (200), and it is in their own Trash as deleted by them — ClickUp: Edit deletes a Doc',
    `${said(d)}; archived ${dRow?.is_archived}; in their Trash ${dTrash}`,
  )

  // ══ 2. EDIT ARCHIVES, AND THE ARCHIVE IS THEIRS ══════════════════════════
  console.log('\n▶ the same member archives another through the doc itself')
  const archived = await doc(`${TAG} archived at edit`)
  await share(archived, member.id, 'edit')
  const a = await member.as(`/docs/${archived}`, { method: 'PATCH', body: { isArchived: true } })
  const aRow = await row(archived)
  const aTrash = await inTrashOf(member, archived)
  chk(
    a.status < 300 && aRow?.is_archived === true && aRow?.archived_by_id === member.id && !!aRow?.archived_at && aTrash,
    'archiving a doc through the doc itself records who archived it and when, as deleting does, so it is in their own Trash',
    `${said(a)}; ${JSON.stringify({ archived: aRow?.is_archived, by: aRow?.archived_by_id === member.id, at: !!aRow?.archived_at })}; in their Trash ${aTrash}`,
  )

  // ══ 3. AND UNARCHIVES ═════════════════════════════════════════════════════
  console.log('\n▶ and brings it back')
  const u = await member.as(`/docs/${archived}`, { method: 'PATCH', body: { isArchived: false } })
  const uRow = await row(archived)
  const uTrash = await inTrashOf(member, archived)
  chk(
    u.status < 300 && uRow?.is_archived === false && uRow?.archived_by_id === null && uRow?.archived_at === null && !uTrash,
    'unarchiving it at Edit brings it back and clears who archived it and when, and it leaves their Trash',
    `${said(u)}; ${JSON.stringify({ archived: uRow?.is_archived, by: uRow?.archived_by_id, at: uRow?.archived_at })}; in their Trash ${uTrash}`,
  )

  // ══ 4. COMMENT DOES NEITHER ══════════════════════════════════════════════
  console.log('\n▶ a Comment share')
  const commented = await doc(`${TAG} at comment`)
  await share(commented, member.id, 'comment')
  const cd = await member.as(`/docs/${commented}`, { method: 'DELETE' })
  const ca = await member.as(`/docs/${commented}`, { method: 'PATCH', body: { isArchived: true } })
  const cRow = await row(commented)
  chk(
    cd.status === 403 && ca.status === 403 && cRow?.is_archived === false,
    'a Comment share neither deletes nor archives the doc (403 each), and it stays',
    `delete ${said(cd)}; archive ${said(ca)}; archived ${cRow?.is_archived}`,
  )

  // ══ 5. A GUEST WITH EDIT ═════════════════════════════════════════════════
  console.log('\n▶ a guest with an Edit share')
  const guests = await doc(`${TAG} shared with the guest`)
  await share(guests, guest.id, 'edit')
  const g = await guest.as(`/docs/${guests}`, { method: 'DELETE' })
  const gRow = await row(guests)
  const gTrash = await inTrashOf(guest, guests)
  chk(
    g.status < 300 && gRow?.is_archived === true && gTrash,
    'a guest with an Edit share deletes the doc (200), and it is in their own Trash — ClickUp: guests with edit permissions delete Docs',
    `${said(g)}; archived ${gRow?.is_archived}; in their Trash ${gTrash}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
