/**
 * WHAT A TASK MAY BE POINTED AT — the workspace boundary on every route that
 * takes a reference.
 *
 * NOT A FRAME ROW. This is a security defect the open-work inventory found
 * (`docs/open-work.md`, product-siblings), and three more found beside it while
 * fixing it. `PATCH /tasks/:id` spread its JSON body into the row twice — in
 * the route and in the service — so every column was writable by anyone the
 * write check lets through, which includes any ASSIGNEE:
 *
 *   · `listId` moved the task into a list in another workspace;
 *   · `createdById` made the caller the creator, itself a grant of write;
 *   · `coverStorageKey` took any key, and `getTask` signed it for the reader.
 *
 * And beside it: `parentTaskId` (update AND create) never asked where the
 * parent lived; `POST /tasks/:id/move` checked the task and nothing about the
 * target; `addAttachment`'s `startsWith` prefix check is walked through by `..`
 * on a public-CDN deployment, because `getObjectUrl` returns the key unencoded
 * and a browser collapses dot segments.
 *
 * EVERY REFUSAL IS ASSERTED TWICE, by status AND by the row. A route that
 * answers 400 and writes anyway passes a status-only check, and the row in
 * Postgres is the only witness that cannot be talked round. Every guard has a
 * POSITIVE twin — the same route, a legitimate value, accepted and stored — so
 * a fix that refuses everything reddens as surely as one that refuses nothing.
 *
 * THE ATTACKER IS A MEMBER OF TWO WORKSPACES, and that is what makes the
 * workspace rule measurable. A caller who belonged only to workspace A would be
 * stopped from moving a task into workspace B by membership alone, so a patch
 * deleting the same-workspace rule would redden nothing. A member of both is
 * stopped by that rule and by nothing else. The cover and attachment keys come
 * from a THIRD workspace they never join, because those are cross-tenant READS,
 * and the realistic caller is somebody with no business seeing the object.
 *
 * THE TWO SIGNING CHECKS NEED A STORE, and say so. "The foreign cover is not
 * signed" is vacuously true where nothing can be signed, so each is paired
 * with this task's OWN cover being signed in the same check. On a lane without
 * an object store that half fails, loudly, rather than the pair passing on
 * nothing.
 *
 *   node test/e2e/task-boundaries.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 19

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
const TAG = `tb-${stamp}`
/*
 * CLEANUP THAT SAYS WHEN IT FAILED. Each entry returns the response and a
 * non-2xx is printed, because a `.catch(() => {})` on this client catches
 * nothing and a teardown that silently does not tear down leaves three
 * workspaces in the shared database for every run.
 */
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
  const space = (workspaceId, label, defaultPermission = 'edit') =>
    make('/spaces', { workspaceId, name: `${TAG} ${label}`, defaultPermission }, `space ${label}`)
  const project = (spaceId, label) => make('/projects', { spaceId, name: `${TAG} ${label}` }, `project ${label}`)
  const list = (projectId, label) => make('/lists', { projectId, name: `${TAG} ${label}` }, `list ${label}`)

  const WA = await workspace('A')
  const WB = await workspace('B')
  const WC = await workspace('C')

  const SE = await space(WA, 'edit')
  const SV = await space(WA, 'view-only', 'view')
  const PE = await project(SE, 'P-edit')
  const PP = await project(SE, 'P-private')
  const PV = await project(SV, 'P-view')
  const LE1 = await list(PE, 'L1')
  const LE2 = await list(PE, 'L2')
  const LP = await list(PP, 'L-private')
  const LV = await list(PV, 'L-view')
  // Private by SQL: no route sets project privacy, and what is under test is
  // the move's visibility check, not how privacy gets set.
  await sql`update projects set visibility = 'private' where id = ${PP}`

  const LB = await list(await project(await space(WB, 'B'), 'P-B'), 'L-B')
  const TB = await make('/tasks', { listId: LB, title: `${TAG} parent in B` }, 'the task in B')
  const LC = await list(await project(await space(WC, 'C'), 'P-C'), 'L-C')
  const TC = await make('/tasks', { listId: LC, title: `${TAG} victim in C` }, 'the task in C')
  // A key of C's own, in exactly the shape its presign would mint.
  const KC = `workspaces/${WC}/tasks/${TC}/attachments/${stamp}-secret.pdf`

  // The attacker: a plain member of A AND B, never of C.
  const member = { email: `tb-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Boundary ${stamp}`,
      email: member.email,
      password: member.password,
      organizationName: `Boundary ${stamp}`,
      organizationSlug: `boundary-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${said(signup)}`)
  const M = apiAs(signup.data.accessToken)
  const memberId = signup.data.user?.id ?? signup.data.id
  if (!memberId) throw new Error('signup returned no user id')
  for (const ws of [WA, WB]) {
    const added = await A(`/workspaces/${ws}/members`, { method: 'POST', body: { email: member.email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the member to ${ws}: ${said(added)}`)
  }

  // T: the member's own task (creator → write). T2: the admin's, with the
  // member only an ASSIGNEE — the case where rewriting createdById is an
  // escalation rather than a no-op. T3: the admin's, for the read-side check.
  const T = (await M('/tasks', { method: 'POST', body: { listId: LE1, title: `${TAG} mine` } })).data?.id
  if (!T) throw new Error('the member could not create a task in a space they may edit')
  const T2 = await make('/tasks', { listId: LE1, title: `${TAG} assigned` }, 'the assigned task')
  const assigned = await A(`/tasks/${T2}/assignees`, { method: 'POST', body: { userId: memberId } })
  if (assigned.status >= 300) throw new Error(`could not assign the member: ${said(assigned)}`)
  const T3 = await make('/tasks', { listId: LE1, title: `${TAG} poisoned` }, 'the read-side task')

  const row = async (id) =>
    (await sql`
      select list_id, created_by_id, completed_at, status_category, title, cover_storage_key, parent_task_id
      from tasks where id = ${id}`)[0] ?? null
  const refused = (res, status) => res.status === status

  // ══ 1. THE WHITELIST ═════════════════════════════════════════════════════
  console.log('\n▶ PATCH /tasks/:id changes the fields it names, and refuses every other column by name')

  const viaPatch = await M(`/tasks/${T}`, { method: 'PATCH', body: { listId: LB } })
  const afterListPatch = await row(T)
  chk(
    refused(viaPatch, 400) && /move/i.test(String(viaPatch.error?.message ?? viaPatch.error ?? '')) && afterListPatch?.list_id === LE1,
    'listId is refused — with the move route named — and the task stays in its list',
    `it answered ${said(viaPatch)} and the row's list is ${afterListPatch?.list_id} (was ${LE1}); a 200 here moved ` +
      'a task into another tenant’s list past every check the move route makes',
  )

  const asCreator = await M(`/tasks/${T2}`, { method: 'PATCH', body: { createdById: memberId } })
  const afterCreator = await row(T2)
  chk(
    refused(asCreator, 400) && afterCreator?.created_by_id === admin.id,
    'an assignee cannot make themselves the creator — which is itself a grant of write access',
    `it answered ${said(asCreator)} and created_by_id is ${afterCreator?.created_by_id} (the admin is ${admin.id})`,
  )

  const beforeClose = await row(T)
  const asClosed = await M(`/tasks/${T}`, {
    method: 'PATCH',
    body: { completedAt: '2020-01-01T00:00:00.000Z', statusCategory: 'closed' },
  })
  const afterClose = await row(T)
  chk(
    refused(asClosed, 400) && afterClose?.completed_at === null && afterClose?.status_category === beforeClose?.status_category,
    'columns the status machine owns are not writable by hand',
    `it answered ${said(asClosed)}; completed_at=${afterClose?.completed_at}, status_category ` +
      `${beforeClose?.status_category} → ${afterClose?.status_category}`,
  )

  const retitled = await M(`/tasks/${T}`, { method: 'PATCH', body: { title: `${TAG} renamed` } })
  chk(
    retitled.status === 200 && (await row(T))?.title === `${TAG} renamed`,
    'and an ordinary edit still goes through — the whitelist is a list, not a wall',
    `renaming answered ${said(retitled)}`,
  )

  // ══ 2. THE COVER ═════════════════════════════════════════════════════════
  console.log('\n▶ a stored cover is one of this task’s own objects')

  const foreignCover = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: KC } })
  chk(
    refused(foreignCover, 400) && (await row(T))?.cover_storage_key === null,
    'a key from a workspace the caller does not belong to is refused and not stored',
    `it answered ${said(foreignCover)}; a stored foreign key is signed for whoever opens the task — a working URL ` +
      'to another tenant’s file',
  )

  const traversal = `workspaces/${WA}/tasks/${T}/attachments/../../../../workspaces/${WC}/tasks/${TC}/attachments/${stamp}-secret.pdf`
  const walked = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: traversal } })
  chk(
    refused(walked, 400) && (await row(T))?.cover_storage_key === null,
    'and so is one that starts with this task’s own prefix and walks out of it with ..',
    `it answered ${said(walked)}; a public-CDN URL collapses the dots and lands on workspace C`,
  )

  const OWN = `workspaces/${WA}/tasks/${T}/attachments/${stamp}-cover.png`
  const ownCover = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: OWN } })
  chk(
    ownCover.status === 200 && (await row(T))?.cover_storage_key === OWN,
    'while this task’s own upload is accepted and stored — the Upload tab still works',
    `it answered ${said(ownCover)} and stored ${JSON.stringify((await row(T))?.cover_storage_key)}`,
  )

  const INBOUND = `inbound-email/${T}/${stamp}-photo.jpg`
  const inboundCover = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: INBOUND } })
  chk(
    inboundCover.status === 200 && (await row(T))?.cover_storage_key === INBOUND,
    'and so is its own inbound-email attachment, which the Attachments tab also offers',
    `it answered ${said(inboundCover)} — a mailed-in image is the task’s own object in its other shape`,
  )
  // Back to the upload, so the read-side check below has a key of T's to sign.
  const reset = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: OWN } })
  if (reset.status !== 200) console.log(`  \x1b[33mnote\x1b[0m could not put T's own cover back: ${said(reset)}`)

  // A row poisoned from outside the route — before the fix, or by any path
  // added later. The read side must not turn it into a URL.
  await sql`update tasks set cover_storage_key = ${KC} where id = ${T3}`
  const ownRead = (await A(`/tasks/${T}`)).data?.coverUrl ?? null
  const poisonedRead = await A(`/tasks/${T3}`)
  chk(
    typeof ownRead === 'string' && ownRead.length > 0 && poisonedRead.status === 200 && poisonedRead.data?.coverUrl === null,
    'reading a task signs its own cover and refuses to sign a foreign key already sitting in the row',
    typeof ownRead !== 'string'
      ? `this task's OWN cover was not signed either (${JSON.stringify(ownRead)}), so the lane cannot sign at ` +
        'all and "the foreign key was not signed" would be true of nothing — this check needs an object store'
      : `the poisoned task answered ${poisonedRead.status} with coverUrl ${JSON.stringify(poisonedRead.data?.coverUrl ?? null).slice(0, 120)}`,
  )
  const listRows = await A(`/tasks/list/${LE1}`)
  const rowsById = new Map((listRows.data ?? []).map((t) => [t.id, t]))
  chk(
    listRows.status === 200 &&
      typeof rowsById.get(T)?.coverUrl === 'string' &&
      rowsById.has(T3) &&
      rowsById.get(T3)?.coverUrl === null,
    'and the list rows do the same — the second place a cover is signed',
    `GET /tasks/list answered ${listRows.status}; T's coverUrl ${JSON.stringify(rowsById.get(T)?.coverUrl ?? null).slice(0, 60)}, ` +
      `the poisoned row's ${JSON.stringify(rowsById.get(T3)?.coverUrl ?? null).slice(0, 120)}`,
  )

  // ══ 3. THE PARENT ════════════════════════════════════════════════════════
  console.log('\n▶ a subtask’s parent lives in the same workspace')

  const foreignParent = await M(`/tasks/${T}`, { method: 'PATCH', body: { parentTaskId: TB } })
  const readBack = (await M(`/tasks/${T}`)).data
  chk(
    refused(foreignParent, 404) && (await row(T))?.parent_task_id === null && readBack?.parent === null,
    'a parent in another workspace answers NOT FOUND, is not stored, and its details are not handed back',
    `it answered ${said(foreignParent)}; the row's parent is ${(await row(T))?.parent_task_id} and the read gave ` +
      `parent ${JSON.stringify(readBack?.parent ?? null).slice(0, 120)}`,
  )

  const CHILD = `${TAG} created under B`
  const createdUnder = await M('/tasks', { method: 'POST', body: { listId: LE1, title: CHILD, parentTaskId: TB } })
  const strays = await sql`select id from tasks where title = ${CHILD}`
  chk(
    refused(createdUnder, 404) && strays.length === 0,
    'and creating a subtask under one is refused the same way, with nothing written',
    `it answered ${said(createdUnder)} and ${strays.length} row(s) titled "${CHILD}" exist — workspace B would have ` +
      'gained a subtask it never made',
  )

  const localParent = await M(`/tasks/${T}`, { method: 'PATCH', body: { parentTaskId: T2 } })
  chk(
    localParent.status === 200 && (await row(T))?.parent_task_id === T2,
    'while a parent in the same workspace is accepted and stored',
    `it answered ${said(localParent)}`,
  )
  const unparent = await M(`/tasks/${T}`, { method: 'PATCH', body: { parentTaskId: null } })
  if (unparent.status !== 200) console.log(`  \x1b[33mnote\x1b[0m could not detach T again: ${said(unparent)}`)

  // ══ 4. THE MOVE ══════════════════════════════════════════════════════════
  console.log('\n▶ POST /tasks/:id/move checks where the task is going, not only where it is')

  const moveOut = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LB } })
  chk(
    refused(moveOut, 404) && (await row(T))?.list_id === LE1,
    'a list in another workspace is NOT FOUND — even for a caller who belongs to both',
    `it answered ${said(moveOut)}; the task is in ${(await row(T))?.list_id}`,
  )

  const moveView = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LV } })
  chk(
    refused(moveView, 403) && (await row(T))?.list_id === LE1,
    'a list in a view-only space is refused — the same gate creating a task there faces',
    `it answered ${said(moveView)}; the task is in ${(await row(T))?.list_id}`,
  )

  const movePrivate = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LP } })
  chk(
    refused(movePrivate, 403) && (await row(T))?.list_id === LE1,
    'and so is a list in a private project the caller cannot see, in a space they may otherwise edit',
    `it answered ${said(movePrivate)}; the task is in ${(await row(T))?.list_id}`,
  )

  const moveHome = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LE2 } })
  chk(
    moveHome.status < 300 && (await row(T))?.list_id === LE2,
    'while an ordinary move within the workspace still lands',
    `it answered ${said(moveHome)}; the task is in ${(await row(T))?.list_id} (wanted ${LE2})`,
  )

  // ══ 5. THE ATTACHMENT ════════════════════════════════════════════════════
  console.log('\n▶ addAttachment registers this task’s own uploads, by shape')

  const walkedIn = await M(`/tasks/${T}/attachments`, {
    method: 'POST',
    body: { fileName: 'secret.pdf', storageKey: traversal, contentType: 'application/pdf', sizeBytes: 1024 },
  })
  const walkedRows = await sql`select id from task_attachments where task_id = ${T} and storage_key = ${traversal}`
  chk(
    refused(walkedIn, 400) && walkedRows.length === 0,
    'a key that walks out of the task’s prefix with .. is refused — the prefix check this replaced let it in',
    `it answered ${said(walkedIn)} and ${walkedRows.length} attachment row(s) hold the walking key`,
  )

  const ATTACH = `workspaces/${WA}/tasks/${T}/attachments/${stamp}-notes.txt`
  const attached = await M(`/tasks/${T}/attachments`, {
    method: 'POST',
    body: { fileName: 'notes.txt', storageKey: ATTACH, contentType: 'text/plain', sizeBytes: 64 },
  })
  const attachedRows = await sql`select id from task_attachments where task_id = ${T} and storage_key = ${ATTACH}`
  chk(
    attached.status < 300 && attachedRows.length === 1,
    'while an upload in the task’s own shape is registered',
    `it answered ${said(attached)} and ${attachedRows.length} row(s) hold it`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const fn of cleanup.reverse()) {
    // This catch CAN fire — `fetch` rejects when the API is unreachable, which
    // is the one failure the client does not turn into a status.
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
