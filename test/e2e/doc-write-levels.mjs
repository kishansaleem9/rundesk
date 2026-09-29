/**
 * A DOC IS WRITTEN AT THE LEVEL ITS WRITER HOLDS ON IT.
 *
 * NOT A FRAME ROW: `found-24-sep/doc-writes-are-the-read-rule`. Every doc
 * write asked the read rule and nothing more. Measured on lane 1 before the
 * fix: a member whose only access to a private space's doc was a VIEW share
 * renamed it, commented on it and made it public; a guest renamed a doc of an
 * open space; a member in a space whose default is "view only" made, renamed
 * and deleted docs there.
 *
 * ClickUp's rule: a doc inherits its location's permission (view, comment,
 * edit, full edit), a share on the doc overrides it, and a guest edits only
 * where given edit. Each level is tried beside the next one up, every refusal
 * read back from the row. Docs and shares are planted by SQL.
 *
 *   node test/e2e/doc-write-levels.mjs --api 3021
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
const TAG = `dwl-${stamp}`
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
      fullName: `Writer ${who}`, email, password: 'Member@12345!',
      organizationName: `Writer ${who} ${stamp}`, organizationSlug: `writer-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as

  const space = async (name, extra) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...extra } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the ${name} space: ${said(res)}`)
    return res.data.id
  }
  const PRIVATE = await space('private', { visibility: 'private' })
  const OPEN = await space('open', {})
  const VIEW = await space('view only', { defaultPermission: 'view' })
  const doc = async (spaceId, title) =>
    (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${spaceId}, ${title}, ${adminId}) returning id`)[0].id
  const shareDoc = (docId, userId, level) =>
    sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'doc', ${docId}, ${userId}, ${level})`
  const titleOf = async (id) => (await sql`select title, public_share_id, is_archived from docs where id = ${id}`)[0]
  const commentsOn = async (id) => (await sql`select count(*)::int as n from doc_comments where doc_id = ${id}`)[0].n
  const rename = (C, id, title) => C(`/docs/${id}`, { method: 'PATCH', body: { title } })

  // ══ 1. A VIEW SHARE, AND AN EDIT SHARE ═══════════════════════════════════
  console.log('\n▶ a private space’s doc, shared with the member')
  const viewed = await doc(PRIVATE, `${TAG} shared to view`)
  await shareDoc(viewed, member.id, 'view')
  const vRename = await rename(M, viewed, `${TAG} renamed through a view share`)
  const vComment = await M(`/docs/${viewed}/comments`, { method: 'POST', body: { body: `${TAG} said through a view share` } })
  const vPublic = await M(`/docs/${viewed}/share`, { method: 'POST', body: {} })
  const vAfter = await titleOf(viewed)
  const edited = await doc(PRIVATE, `${TAG} shared to edit`)
  await shareDoc(edited, member.id, 'edit')
  const eRename = await rename(M, edited, `${TAG} renamed through an edit share`)
  chk(
    vRename.status === 403 && vComment.status === 403 && vPublic.status === 403 &&
      vAfter.title === `${TAG} shared to view` && !vAfter.public_share_id && (await commentsOn(viewed)) === 0 &&
      eRename.status === 200 && (await titleOf(edited)).title === `${TAG} renamed through an edit share`,
    'a VIEW share reads and does not rename, comment or make public (403 each, all unchanged) — an EDIT share renames',
    `view: rename ${said(vRename)}, comment ${said(vComment)}, public ${said(vPublic)}; edit: rename ${said(eRename)}`,
  )
  const commented = await doc(PRIVATE, `${TAG} shared to comment`)
  await shareDoc(commented, member.id, 'comment')
  const cComment = await M(`/docs/${commented}/comments`, { method: 'POST', body: { body: `${TAG} said through a comment share` } })
  const cRename = await rename(M, commented, `${TAG} renamed through a comment share`)
  chk(
    cComment.status < 300 && (await commentsOn(commented)) === 1 && cRename.status === 403 && (await titleOf(commented)).title === `${TAG} shared to comment`,
    'a COMMENT share comments and does not rename (403, unchanged)',
    `comment ${said(cComment)}, rename ${said(cRename)}`,
  )

  // ══ 2. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest, on an open space’s doc')
  const open = await doc(OPEN, `${TAG} open doc`)
  const gRename = await rename(G, open, `${TAG} renamed by a guest`)
  const gAfter = await titleOf(open)
  const openShared = await doc(OPEN, `${TAG} open doc, shared with the guest`)
  await shareDoc(openShared, guest.id, 'edit')
  const gShared = await rename(G, openShared, `${TAG} renamed by the guest it was shared with`)
  // Refused as not found since a guest reads only what is shared with them
  // (`found-24-sep/guests-read-every-open-space`): the doc is not theirs to see.
  chk(
    (gRename.status === 403 || gRename.status === 404) && gAfter.title === `${TAG} open doc` && gShared.status === 200,
    'a guest does not rename an open space’s doc (refused, unchanged) — a doc shared with them to edit, they do',
    `unshared ${said(gRename)}; shared to edit ${said(gShared)}`,
  )

  // ══ 3. A "VIEW ONLY" SPACE ═══════════════════════════════════════════════
  console.log('\n▶ a “view only” space')
  const inView = await doc(VIEW, `${TAG} in view only`)
  const vsRename = await rename(M, inView, `${TAG} renamed in view only`)
  const vsDelete = await M(`/docs/${inView}`, { method: 'DELETE' })
  const vsMake = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} made in view only`, spaceId: VIEW } })
  const [{ n: madeInView }] = await sql`select count(*)::int as n from docs where space_id = ${VIEW} and title = ${`${TAG} made in view only`}`
  const inViewAfter = await titleOf(inView)
  const osMake = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} made in the open`, spaceId: OPEN } })
  chk(
    vsRename.status === 403 && vsDelete.status === 403 && vsMake.status === 403 && madeInView === 0 &&
      inViewAfter.title === `${TAG} in view only` && !inViewAfter.is_archived && osMake.status === 201,
    'in a “view only” space a member neither renames, deletes nor makes a doc (403 each, unchanged, none made) — in an open space they make one',
    `rename ${said(vsRename)}, delete ${said(vsDelete)}, make ${said(vsMake)}; in the open ${said(osMake)}`,
  )

  // ══ 4. A DOC OF NO SPACE ═════════════════════════════════════════════════
  console.log('\n▶ a doc of no space')
  const gLoose = await G(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} the guest's loose doc` } })
  const mLoose = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} the member's loose doc` } })
  const [{ n: guestLoose }] = await sql`select count(*)::int as n from docs where workspace_id = ${WS} and title = ${`${TAG} the guest's loose doc`}`
  chk(
    gLoose.status === 403 && guestLoose === 0 && mLoose.status === 201,
    'a guest makes no workspace-wide doc (403, none made) — a member makes one',
    `the guest ${said(gLoose)}; the member ${said(mLoose)}`,
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
