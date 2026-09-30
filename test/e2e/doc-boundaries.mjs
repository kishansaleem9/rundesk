/**
 * WHAT A DOC MAY BE WRITTEN AS, AND POINTED AT — the workspace boundary on
 * every doc route that takes a field or a reference.
 *
 * NOT A FRAME ROW. The open-work inventory's `docs-patch-mass-assign-public-
 * share` item, proven on lane 1 on 23 September before anything changed, as a
 * member of two workspaces:
 *
 *   · `PATCH /docs/:id` spread its body into the row, so `workspaceId` MOVED
 *     the doc into the other workspace, `createdById` rewrote who made it, and
 *     `publicShareId` minted an anonymous link that answered 200 — in a
 *     workspace whose `blockPublicSharing` refuses exactly that on the share
 *     route;
 *   · create, import and create-from-template took any `spaceId`, and the doc
 *     list joins it: a doc filed under workspace B's space put B's space NAME
 *     in A's list;
 *   · `parentDocId` took any doc, in any workspace, including the doc's own
 *     child — a loop a tree walk never leaves.
 *
 * EVERY REFUSAL IS ASSERTED TWICE, by status AND by the row, and every rule
 * has a POSITIVE twin, so a fix that refuses everything reddens as surely as
 * one that refuses nothing. Each attack is put back before the next check, so
 * under a break a check fails for its own reason and not an earlier one's.
 *
 * THE MEMBER BELONGS TO BOTH WORKSPACES, so the workspace rule is the only
 * thing that can stop a reference into B — membership alone would stop a
 * member of A only, and a patch deleting the rule would redden nothing.
 *
 *   node test/e2e/doc-boundaries.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 17

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
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the copy, it throws when nothing answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`

const stamp = Date.now()
const TAG = `db-${stamp}`
const cleanup = []
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal here is checked against the row, not the status alone')

  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const admin = (await A('/users/me')).data
  if (!admin?.id) throw new Error('could not read the admin account')

  // ── fixtures ─────────────────────────────────────────────────────────────
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const workspace = async (label) => {
    const id = await make('/workspaces', { name: `${TAG} ${label}` }, `workspace ${label}`)
    cleanup.push(() => A(`/workspaces/${id}`, { method: 'DELETE' }))
    return id
  }
  const WA = await workspace('A')
  const WB = await workspace('B')
  const SA = await make('/spaces', { workspaceId: WA, name: `${TAG} A space` }, 'the space in A')
  const SAP = await make('/spaces', { workspaceId: WA, name: `${TAG} A private space` }, 'the private space in A')
  const SB_NAME = `${TAG} B's space`
  const SB = await make('/spaces', { workspaceId: WB, name: SB_NAME }, 'the space in B')
  // Private by SQL: what is under test is the doc's space rule, not how a
  // space is made private.
  await sql`update spaces set visibility = 'private' where id = ${SAP}`
  // Blocked by SQL for the same reason: the rule under test is that PATCH
  // cannot mint a link the share route refuses, not how the block is set.
  await sql`update workspaces set block_public_sharing = true where id = ${WA}`

  const member = { email: `db-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Doc boundary ${stamp}`,
      email: member.email,
      password: member.password,
      organizationName: `Doc boundary ${stamp}`,
      organizationSlug: `doc-boundary-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${said(signup)}`)
  const M = apiAs(signup.data.accessToken)
  const memberId = signup.data.user?.id ?? signup.data.id
  for (const ws of [WA, WB]) {
    const added = await A(`/workspaces/${ws}/members`, { method: 'POST', body: { email: member.email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the member to ${ws}: ${said(added)}`)
  }

  const docIn = async (ws, as, title, extra = {}) => {
    const res = await as(`/workspaces/${ws}/docs`, { method: 'POST', body: { title, ...extra } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the doc "${title}": ${said(res)}`)
    return res.data.id
  }
  const D = await docIn(WA, M, `${TAG} mine`)
  const OTHER = await docIn(WA, M, `${TAG} another in A`)
  const DB = await docIn(WB, A, `${TAG} in B`)

  const row = async (id) =>
    (await sql`select workspace_id, created_by_id, public_share_id, space_id, parent_doc_id, title from docs where id = ${id}`)[0] ?? null
  const docsTitled = async (title) => (await sql`select id from docs where title = ${title}`).length
  const putBack = (id, cols) => sql`update docs set ${sql(cols)} where id = ${id}`
  const fixture = await row(D)

  // ══ 1. THE WHITELIST ═════════════════════════════════════════════════════
  console.log('\n▶ PATCH /docs/:id changes the fields it names, and refuses every other column by name')

  const SLUG = `${TAG}-slug`
  const viaPatch = await M(`/docs/${D}`, { method: 'PATCH', body: { publicShareId: SLUG } })
  const afterShare = await row(D)
  const anonymous = await apiAs(null)(`/public/docs/${SLUG}`)
  chk(
    viaPatch.status === 400 && /share/i.test(String(viaPatch.error?.message ?? '')) &&
      afterShare?.public_share_id === null && anonymous.status === 404,
    'a public link cannot be minted through PATCH — refused with the share route named, and the link does not answer',
    `it answered ${said(viaPatch)}; public_share_id is ${JSON.stringify(afterShare?.public_share_id)} and the ` +
      `anonymous link answered ${anonymous.status} — in a workspace whose share route refuses public links`,
  )
  await putBack(D, { public_share_id: null, public_share_enabled_at: null })

  const moved = await M(`/docs/${D}`, { method: 'PATCH', body: { workspaceId: WB } })
  const afterMove = await row(D)
  chk(
    moved.status === 400 && afterMove?.workspace_id === WA,
    'a doc cannot be moved into another workspace by naming it',
    `it answered ${said(moved)} and the doc's workspace is ${afterMove?.workspace_id === WB ? 'B' : 'A'}`,
  )
  await putBack(D, { workspace_id: WA })

  const asCreator = await M(`/docs/${D}`, { method: 'PATCH', body: { createdById: admin.id } })
  const afterCreator = await row(D)
  chk(
    asCreator.status === 400 && afterCreator?.created_by_id === fixture?.created_by_id,
    'nor can who made it be rewritten',
    `it answered ${said(asCreator)} and created_by_id is ${afterCreator?.created_by_id} (was ${fixture?.created_by_id})`,
  )
  await putBack(D, { created_by_id: fixture?.created_by_id })

  // The version check rides along with an edit: accepted, compared, not stored.
  const current = (await M(`/docs/${D}`)).data
  const retitled = await M(`/docs/${D}`, {
    method: 'PATCH',
    body: { title: `${TAG} renamed`, expectedUpdatedAt: current?.updatedAt },
  })
  chk(
    retitled.status === 200 && (await row(D))?.title === `${TAG} renamed`,
    'while an ordinary edit, with the editor’s version check, still goes through',
    `renaming answered ${said(retitled)}`,
  )

  // ══ 2. THE SPACE ═════════════════════════════════════════════════════════
  console.log('\n▶ a doc lives in a space of its own workspace that its author can reach')

  const FOREIGN = `${TAG} filed under B`
  const foreignSpace = await M(`/workspaces/${WA}/docs`, { method: 'POST', body: { title: FOREIGN, spaceId: SB } })
  const listA = (await M(`/workspaces/${WA}/docs`)).data ?? []
  chk(
    foreignSpace.status === 404 && (await docsTitled(FOREIGN)) === 0 &&
      !JSON.stringify(listA).includes(SB_NAME),
    'a doc cannot be created under another workspace’s space — and that space’s name never reaches this workspace’s list',
    `it answered ${said(foreignSpace)}; ${await docsTitled(FOREIGN)} doc(s) were written and the list ` +
      `${JSON.stringify(listA).includes(SB_NAME) ? 'names' : 'does not name'} B's space`,
  )

  const HIDDEN = `${TAG} filed in a private space`
  const privateSpace = await M(`/workspaces/${WA}/docs`, { method: 'POST', body: { title: HIDDEN, spaceId: SAP } })
  chk(
    privateSpace.status === 404 && (await docsTitled(HIDDEN)) === 0,
    'nor under a private space of its own workspace that its author is not in',
    `it answered ${said(privateSpace)} and ${await docsTitled(HIDDEN)} doc(s) were written`,
  )

  const OWN = `${TAG} filed in A`
  const ownSpace = await M(`/workspaces/${WA}/docs`, { method: 'POST', body: { title: OWN, spaceId: SA } })
  const ownRow = ownSpace.data?.id ? await row(ownSpace.data.id) : null
  const listed = ((await M(`/workspaces/${WA}/docs`)).data ?? []).find((d) => d.id === ownSpace.data?.id)
  chk(
    ownSpace.status < 300 && ownRow?.space_id === SA && listed?.spaceName === `${TAG} A space`,
    'while one filed under a space it can reach is made there, and listed with that space’s name',
    `it answered ${said(ownSpace)}; the row's space is ${ownRow?.space_id} and the list says ${JSON.stringify(listed?.spaceName ?? null)}`,
  )

  const IMPORTED = `${TAG} imported under B`
  const imported = await M(`/workspaces/${WA}/docs/import`, {
    method: 'POST',
    body: { fileName: 'b.md', markdown: `# ${IMPORTED}\n\nbody\n`, spaceId: SB },
  })
  chk(
    imported.status === 404 && (await docsTitled(IMPORTED)) === 0,
    'and the importer obeys the same rule',
    `it answered ${said(imported)} and ${await docsTitled(IMPORTED)} doc(s) were written`,
  )

  const template = await M(`/workspaces/${WA}/doc-templates`, { method: 'POST', body: { docId: OTHER, name: `${TAG} template` } })
  const FROM_TEMPLATE = `${TAG} from a template under B`
  const fromTemplate = template.data?.id
    ? await M(`/workspaces/${WA}/doc-templates/${template.data.id}/create-doc`, {
        method: 'POST',
        body: { title: FROM_TEMPLATE, spaceId: SB },
      })
    : { status: 0 }
  chk(
    fromTemplate.status === 404 && (await docsTitled(FROM_TEMPLATE)) === 0,
    'and so does creating one from a template',
    template.data?.id
      ? `it answered ${said(fromTemplate)} and ${await docsTitled(FROM_TEMPLATE)} doc(s) were written`
      : `the template could not be made: ${said(template)}`,
  )

  const refiled = await M(`/docs/${D}`, { method: 'PATCH', body: { spaceId: SB } })
  const afterRefile = await row(D)
  chk(
    refiled.status === 404 && afterRefile?.space_id === fixture?.space_id,
    'and so does moving a doc between spaces',
    `it answered ${said(refiled)} and the row's space is ${afterRefile?.space_id}`,
  )
  await putBack(D, { space_id: fixture?.space_id ?? null })

  // ══ 3. THE PARENT ════════════════════════════════════════════════════════
  console.log('\n▶ a doc’s parent is a doc of its own workspace, and never one of its descendants')

  const UNDER_B = `${TAG} created under B's doc`
  const createdUnder = await M(`/workspaces/${WA}/docs`, { method: 'POST', body: { title: UNDER_B, parentDocId: DB } })
  chk(
    createdUnder.status === 404 && (await docsTitled(UNDER_B)) === 0,
    'a doc cannot be created under a doc in another workspace',
    `it answered ${said(createdUnder)} and ${await docsTitled(UNDER_B)} doc(s) were written`,
  )

  // Made by the route, not the fixtures: a rule that refuses every parent
  // must fail THIS check, not stop the run before any check is asked.
  const madeChild = await M(`/workspaces/${WA}/docs`, { method: 'POST', body: { title: `${TAG} my child`, parentDocId: D } })
  const CHILD = madeChild.data?.id ?? null
  chk(
    madeChild.status < 300 && CHILD !== null && (await row(CHILD))?.parent_doc_id === D,
    'while one is created under a doc of its own workspace',
    `it answered ${said(madeChild)}`,
  )

  const reparented = await M(`/docs/${OTHER}`, { method: 'PATCH', body: { parentDocId: DB } })
  const afterReparent = await row(OTHER)
  chk(
    reparented.status === 404 && afterReparent?.parent_doc_id === null,
    'nor moved under one',
    `it answered ${said(reparented)} and the parent is ${afterReparent?.parent_doc_id}`,
  )
  await putBack(OTHER, { parent_doc_id: null })

  const intoChild = CHILD ? await M(`/docs/${D}`, { method: 'PATCH', body: { parentDocId: CHILD } }) : { status: 0 }
  const afterLoop = await row(D)
  chk(
    intoChild.status === 400 && afterLoop?.parent_doc_id === null,
    'nor moved inside its own child — a loop no tree walk leaves',
    `it answered ${said(intoChild)} and the doc's parent is ${afterLoop?.parent_doc_id}`,
  )
  await putBack(D, { parent_doc_id: null })

  const nested = await M(`/docs/${OTHER}`, { method: 'PATCH', body: { parentDocId: D } })
  chk(
    nested.status === 200 && (await row(OTHER))?.parent_doc_id === D,
    'while moving it under another doc of its own workspace works',
    `it answered ${said(nested)}`,
  )
  await putBack(OTHER, { parent_doc_id: null })

  // ══ 4. WHAT THE LISTS SHOW ═══════════════════════════════════════════════
  console.log('\n▶ a doc filed under a foreign space before the rule existed still names nothing of that workspace')

  /*
   * A ROW POISONED FROM OUTSIDE THE ROUTES — written before the checks above
   * existed, or by any path added later. Both places that name a doc's space
   * must join only a space of the doc's own workspace. The legitimate doc
   * filed in A (§2) is the twin: its space must still be named.
   */
  const POISONED = await docIn(WA, M, `${TAG} poisoned`)
  await sql`update docs set space_id = ${SB} where id = ${POISONED}`
  const list = (await M(`/workspaces/${WA}/docs`)).data ?? []
  const poisonedListed = list.find((d) => d.id === POISONED)
  const ownListed = list.find((d) => d.id === ownSpace.data?.id)
  chk(
    poisonedListed !== undefined && poisonedListed.spaceName == null && ownListed?.spaceName === `${TAG} A space`,
    'the doc list names no space of another workspace — and still names its own',
    `the poisoned doc lists spaceName ${JSON.stringify(poisonedListed?.spaceName ?? null)}; the legitimate one ` +
      `${JSON.stringify(ownListed?.spaceName ?? null)}`,
  )

  await sql`update docs set is_archived = true, archived_at = now() where id in ${sql([POISONED, ownSpace.data?.id].filter(Boolean))}`
  const trash = (await A(`/workspaces/${WA}/trash?types=doc`)).data
  const trashItems = trash?.items ?? []
  const poisonedTrashed = trashItems.find((t) => t.id === POISONED)
  const ownTrashed = trashItems.find((t) => t.id === ownSpace.data?.id)
  chk(
    poisonedTrashed !== undefined && !String(poisonedTrashed.location ?? '').includes(SB_NAME) &&
      ownTrashed?.location === `${TAG} A space`,
    'and neither does the trash',
    `the poisoned doc's trash location is ${JSON.stringify(poisonedTrashed?.location ?? null)}; the legitimate ` +
      `one's ${JSON.stringify(ownTrashed?.location ?? null)}`,
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
