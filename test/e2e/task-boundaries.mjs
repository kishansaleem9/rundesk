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
 * AND THE PEOPLE, LABELS AND DEPENDENCIES PUT ON A TASK (sections 6–10), found
 * while closing the four above. `POST /tasks/:id/watchers` had no access check
 * at all — an account sharing no workspace with the task followed it by id and
 * was answered with the whole task, title and description, from a route whose
 * GET twin refuses it. `addAssignee` asked nothing about the person, `addLabel`
 * nothing about the label, `addDependency` nothing about the other task (and
 * `getTask` hands that task back whole), `removeDependency` took an id alone.
 * `createTask`'s `assigneeIds` and `labelIds` were written unchecked. And the
 * service's read check ignored item privacy, which the route guard enforces.
 * Section 10 poisons rows from outside the routes and requires every read of
 * a task — parent, subtasks, dependencies, labels, graph — to stop at its
 * workspace, each paired with a neighbour that belongs and must still show.
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
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 45

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
  // Full edit unless told otherwise, as a space is: Edit changes and archives
  // and makes nothing (`found-25-sep/full-edit-enforced-nowhere`).
  const space = (workspaceId, label, defaultPermission = 'admin') =>
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
  /*
   * THE MEMBER IS PUT ON T2 BY SQL — the row `POST /tasks/:id/assignees`
   * writes — and not through that route, because §8 is ABOUT that route. A
   * patch that breaks assignment ended this run right here: `tb-30` reddened
   * its own check's precondition, 1 of 45 checks ran, and its evidence was
   * unreadable. A fixture built through the thing under test measures the test.
   */
  await sql`insert into task_assignees (task_id, user_id) values (${T2}, ${memberId}) on conflict do nothing`
  const T3 = await make('/tasks', { listId: LE1, title: `${TAG} poisoned` }, 'the read-side task')
  // T3V: the admin's, in the view-only space — the task the member may only
  // READ. A task's level is its space's now, not whether they made it or are
  // on it (`found-24-sep/task-edits-narrower-than-clickup`), so T3, in a
  // space the member may edit, is no longer one they only read.
  const T3V = await make('/tasks', { listId: LV, title: `${TAG} read-only` }, 'the task the member only reads')

  const row = async (id) =>
    (await sql`
      select list_id, created_by_id, completed_at, status_category, title, cover_storage_key, parent_task_id
      from tasks where id = ${id}`)[0] ?? null
  const refused = (res, status) => res.status === status
  /*
   * EVERY ATTACK IS PUT BACK BEFORE THE NEXT CHECK. Under a break the attack
   * lands — that is what its check is there to see — and a task left in
   * workspace B, or in the view-only list, then fails every later check for
   * that reason instead of its own. The first break run showed it: removing
   * both layers of the whitelist reddened twelve checks, nine of them only
   * because T had been moved into B by the first. So once a check has read the
   * row, the columns its attack could have written go back by SQL, and each
   * check starts from the fixtures — a patch reddens what it breaks.
   */
  const putBack = (id, cols) => sql`update tasks set ${sql(cols)} where id = ${id}`

  // ── fixtures for sections 6–10 ─────────────────────────────────────────────
  /*
   * TWO MORE ACCOUNTS, each a different distance from the work. A STRANGER
   * shares no workspace with it — the account `POST /tasks/:id/watchers`
   * answered with the whole task. A PEER is a plain member of A, so there is
   * somebody for the member to try to put on a task they may only read.
   */
  const signUp = async (label) => {
    const email = `tb-${label}-${stamp}@rundesk.invalid`
    const res = await apiAs(null)('/auth/signup', {
      method: 'POST',
      body: {
        fullName: `Boundary ${label} ${stamp}`,
        email,
        password: 'Member@12345!',
        organizationName: `Boundary ${label} ${stamp}`,
        organizationSlug: `boundary-${label}-${stamp}`,
      },
    })
    const id = res.data?.user?.id ?? res.data?.id
    if (!res.data?.accessToken || !id) throw new Error(`signup of the ${label} failed: ${said(res)}`)
    return { token: res.data.accessToken, id, email }
  }
  const stranger = await signUp('stranger')
  const S = apiAs(stranger.token)
  const peer = await signUp('peer')
  const addedPeer = await A(`/workspaces/${WA}/members`, { method: 'POST', body: { email: peer.email, role: 'member' } })
  if (addedPeer.status >= 300) throw new Error(`could not add the peer to A: ${said(addedPeer)}`)

  // TP: in the private project the member is not in. TPRIV: a PRIVATE task in
  // a list the member can see — item privacy, the rule the service skipped.
  const TP = await make('/tasks', { listId: LP, title: `${TAG} in the private project` }, 'the private-project task')
  const TPRIV = await make('/tasks', { listId: LE1, title: `${TAG} private task` }, 'the private task')
  const madePrivate = await A(`/tasks/${TPRIV}`, { method: 'PATCH', body: { visibility: 'private' } })
  if (madePrivate.status !== 200) throw new Error(`could not make TPRIV private: ${said(madePrivate)}`)

  const newLabel = async (ws, what) => {
    const res = await A(`/workspaces/${ws}/labels`, { method: 'POST', body: { name: `${TAG} ${what}`, color: '#7c5cff' } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the ${what} label: ${said(res)}`)
    return res.data.id
  }
  const LABEL_A = await newLabel(WA, 'A label')
  const LABEL_B = await newLabel(WB, 'B label')

  // A dependency wholly inside B, for the member to try to delete through a
  // task of their own in A.
  const TB2 = await make('/tasks', { listId: LB, title: `${TAG} second in B` }, 'the second task in B')
  // By SQL for the reason T2's assignee is: §9 is about the dependency route,
  // and `tb-37` ended the run here. The same row the put-back below restores.
  const [depInB] = await sql`
    insert into task_dependencies (task_id, related_task_id, type, created_by_id)
    values (${TB}, ${TB2}, 'related_to', ${admin.id}) returning id`
  const DEP_B = depInB.id

  /** Whether `table` holds a row tying `taskId` to `value` in column `col`. */
  const holds = async (table, taskId, col, value) =>
    (await sql`select 1 from ${sql(table)} where task_id = ${taskId} and ${sql(col)} = ${value}`).length > 0

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
  await putBack(T, { list_id: LE1 })

  const asCreator = await M(`/tasks/${T2}`, { method: 'PATCH', body: { createdById: memberId } })
  const afterCreator = await row(T2)
  chk(
    refused(asCreator, 400) && afterCreator?.created_by_id === admin.id,
    'an assignee cannot make themselves the creator — which is itself a grant of write access',
    `it answered ${said(asCreator)} and created_by_id is ${afterCreator?.created_by_id} (the admin is ${admin.id})`,
  )
  await putBack(T2, { created_by_id: admin.id })

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
  await putBack(T, { completed_at: null, status_category: beforeClose?.status_category })

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
  await putBack(T, { cover_storage_key: null })

  const traversal = `workspaces/${WA}/tasks/${T}/attachments/../../../../workspaces/${WC}/tasks/${TC}/attachments/${stamp}-secret.pdf`
  const walked = await M(`/tasks/${T}`, { method: 'PATCH', body: { coverStorageKey: traversal } })
  chk(
    refused(walked, 400) && (await row(T))?.cover_storage_key === null,
    'and so is one that starts with this task’s own prefix and walks out of it with ..',
    `it answered ${said(walked)}; a public-CDN URL collapses the dots and lands on workspace C`,
  )
  await putBack(T, { cover_storage_key: null })

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
  // Back to the upload, so the read-side checks below have a key of T's to
  // sign. By SQL, not the route: writing a cover is checked just above, and a
  // break that refuses the write should redden those checks — not the two
  // signing checks as well, which are about reading.
  await putBack(T, { cover_storage_key: OWN })

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
  await putBack(T, { parent_task_id: null })

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
  await putBack(T, { parent_task_id: null })

  // ══ 4. THE MOVE ══════════════════════════════════════════════════════════
  console.log('\n▶ POST /tasks/:id/move checks where the task is going, not only where it is')

  const moveOut = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LB } })
  chk(
    refused(moveOut, 404) && (await row(T))?.list_id === LE1,
    'a list in another workspace is NOT FOUND — even for a caller who belongs to both',
    `it answered ${said(moveOut)}; the task is in ${(await row(T))?.list_id}`,
  )
  await putBack(T, { list_id: LE1 })

  const moveView = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LV } })
  chk(
    refused(moveView, 403) && (await row(T))?.list_id === LE1,
    'a list in a view-only space is refused — the same gate creating a task there faces',
    `it answered ${said(moveView)}; the task is in ${(await row(T))?.list_id}`,
  )
  await putBack(T, { list_id: LE1 })

  const movePrivate = await M(`/tasks/${T}/move`, { method: 'POST', body: { listId: LP } })
  chk(
    refused(movePrivate, 403) && (await row(T))?.list_id === LE1,
    'and so is a list in a private project the caller cannot see, in a space they may otherwise edit',
    `it answered ${said(movePrivate)}; the task is in ${(await row(T))?.list_id}`,
  )
  await putBack(T, { list_id: LE1 })

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

  // ══ 6. WHO FOLLOWS A TASK ════════════════════════════════════════════════
  console.log('\n▶ following a task needs to see it; putting somebody else on it needs to edit it')

  const strangerFollows = await S(`/tasks/${T}/watchers`, { method: 'POST', body: { userId: stranger.id } })
  const strangerWatching = await holds('task_watchers', T, 'user_id', stranger.id)
  chk(
    strangerFollows.status >= 400 && !strangerWatching && !strangerFollows.data?.title,
    'an account that shares no workspace with a task cannot follow it by id — nor is it handed the task in the answer',
    `it answered ${said(strangerFollows)}; the watcher row was ${strangerWatching ? '' : 'not '}written — before this ` +
      'the answer was 201 with the whole task, title and description, from a route whose GET refuses the same account',
  )
  await sql`delete from task_watchers where task_id = ${T} and user_id = ${stranger.id}`

  const selfFollow = await M(`/tasks/${T3V}/watchers`, { method: 'POST', body: { userId: memberId } })
  chk(
    selfFollow.status < 300 && (await holds('task_watchers', T3V, 'user_id', memberId)),
    'while a member who can see a task follows it themselves — reading it is enough for that',
    `it answered ${said(selfFollow)}`,
  )

  const putsPeerOn = await M(`/tasks/${T3V}/watchers`, { method: 'POST', body: { userId: peer.id } })
  const peerOn = await holds('task_watchers', T3V, 'user_id', peer.id)
  chk(
    putsPeerOn.status >= 400 && !peerOn,
    'but putting somebody else on it is an edit, refused to a member who may only read the task',
    `it answered ${said(putsPeerOn)} and the peer is ${peerOn ? '' : 'not '}following`,
  )
  await sql`delete from task_watchers where task_id = ${T3V} and user_id = ${peer.id}`

  const adminPutsPeerOn = await A(`/tasks/${T3V}/watchers`, { method: 'POST', body: { userId: peer.id } })
  chk(
    adminPutsPeerOn.status < 300 && (await holds('task_watchers', T3V, 'user_id', peer.id)),
    'which somebody who may edit the task can do',
    `it answered ${said(adminPutsPeerOn)}`,
  )

  const strangerMadeToFollow = await A(`/tasks/${T}/watchers`, { method: 'POST', body: { userId: stranger.id } })
  const strangerMade = await holds('task_watchers', T, 'user_id', stranger.id)
  chk(
    refused(strangerMadeToFollow, 400) && !strangerMade,
    'nobody can be made to follow a task they cannot see — an outsider would be told about it from then on',
    `it answered ${said(strangerMadeToFollow)} and the stranger is ${strangerMade ? '' : 'not '}following`,
  )
  await sql`delete from task_watchers where task_id = ${T} and user_id = ${stranger.id}`

  const memberOnPrivate = await A(`/tasks/${TPRIV}/watchers`, { method: 'POST', body: { userId: memberId } })
  const memberOnPrivateRow = await holds('task_watchers', TPRIV, 'user_id', memberId)
  chk(
    refused(memberOnPrivate, 400) && !memberOnPrivateRow,
    'including a PRIVATE task in a list they can otherwise see — the rule the route’s guard applied and the service did not',
    `it answered ${said(memberOnPrivate)} and the member is ${memberOnPrivateRow ? '' : 'not '}following it`,
  )
  await sql`delete from task_watchers where task_id = ${TPRIV} and user_id = ${memberId}`

  const takesPeerOff = await M(`/tasks/${T3V}/watchers/${peer.id}`, { method: 'DELETE' })
  const peerStillOn = await holds('task_watchers', T3V, 'user_id', peer.id)
  chk(
    takesPeerOff.status >= 400 && peerStillOn,
    'and taking somebody else off needs the same edit access',
    `it answered ${said(takesPeerOff)} and the peer is ${peerStillOn ? 'still' : 'no longer'} following`,
  )
  await sql`insert into task_watchers (task_id, user_id) values (${T3V}, ${peer.id}) on conflict do nothing`

  const unfollows = await M(`/tasks/${T3V}/watchers/${memberId}`, { method: 'DELETE' })
  chk(
    unfollows.status < 300 && !(await holds('task_watchers', T3V, 'user_id', memberId)),
    'while stopping following it yourself needs only to see it',
    `it answered ${said(unfollows)}`,
  )

  // ══ 7. WHO A TASK IS ASSIGNED TO ═════════════════════════════════════════
  console.log('\n▶ an assignee can see what they are assigned')

  const assignStranger = await A(`/tasks/${T}/assignees`, { method: 'POST', body: { userId: stranger.id } })
  const strangerAssigned = await holds('task_assignees', T, 'user_id', stranger.id)
  chk(
    refused(assignStranger, 400) && !strangerAssigned,
    'a task cannot be assigned to an account outside its workspace',
    `it answered ${said(assignStranger)} and the stranger is ${strangerAssigned ? '' : 'not '}assigned — the ` +
      'notification alone would tell them the title of another tenant’s work',
  )
  await sql`delete from task_assignees where task_id = ${T} and user_id = ${stranger.id}`

  const assignHidden = await A(`/tasks/${TP}/assignees`, { method: 'POST', body: { userId: memberId } })
  const hiddenAssigned = await holds('task_assignees', TP, 'user_id', memberId)
  chk(
    refused(assignHidden, 400) && !hiddenAssigned,
    'nor to a member who cannot see it — here, a task in a private project they are not in',
    `it answered ${said(assignHidden)} and the member is ${hiddenAssigned ? '' : 'not '}assigned`,
  )
  await sql`delete from task_assignees where task_id = ${TP} and user_id = ${memberId}`

  /*
   * A PRIVATE TASK IS SHARED BY ASSIGNING IT. Its creator, its assignees and
   * the managers see it, so an assignee who could not open it before being
   * assigned can open it after — the flow `comment-recording` draws. The
   * first version of the rule refused this, and the regression run caught it.
   */
  const sharePrivate = await A(`/tasks/${TPRIV}/assignees`, { method: 'POST', body: { userId: memberId } })
  const opensNow = await M(`/tasks/${TPRIV}`)
  chk(
    sharePrivate.status < 300 && (await holds('task_assignees', TPRIV, 'user_id', memberId)) && opensNow.status === 200,
    'but a PRIVATE task is shared by assigning it — the member it could not be shown to opens it once assigned',
    `assigning answered ${said(sharePrivate)} and the member's GET answered ${opensNow.status}`,
  )
  await sql`delete from task_assignees where task_id = ${TPRIV} and user_id = ${memberId}`

  const assignVisible = await A(`/tasks/${T3}/assignees`, { method: 'POST', body: { userId: memberId } })
  chk(
    assignVisible.status < 300 && (await holds('task_assignees', T3, 'user_id', memberId)),
    'while assigning a member who can see the task still works',
    `it answered ${said(assignVisible)}`,
  )
  // Put back: T3 is the admin's, with nobody on it, for the checks below.
  await sql`delete from task_assignees where task_id = ${T3} and user_id = ${memberId}`

  const BORN_OUT = `${TAG} born assigned outside`
  const bornOut = await A('/tasks', { method: 'POST', body: { listId: LE1, title: BORN_OUT, assigneeIds: [stranger.id] } })
  const bornOutRows = await sql`select id from tasks where title = ${BORN_OUT}`
  chk(
    refused(bornOut, 400) && bornOutRows.length === 0,
    'and a task cannot be BORN assigned to somebody it could not be assigned to later — nothing is written',
    `it answered ${said(bornOut)} and ${bornOutRows.length} task(s) titled "${BORN_OUT}" exist`,
  )

  const BORN_IN = `${TAG} born assigned inside`
  const bornIn = await A('/tasks', { method: 'POST', body: { listId: LE1, title: BORN_IN, assigneeIds: [memberId] } })
  const bornInAssigned = bornIn.data?.id ? await holds('task_assignees', bornIn.data.id, 'user_id', memberId) : false
  chk(
    bornIn.status < 300 && bornInAssigned,
    'while one born assigned to a member who can see it is made, assigned',
    `it answered ${said(bornIn)}`,
  )

  // ══ 8. WHICH LABELS A TASK WEARS ═════════════════════════════════════════
  console.log('\n▶ a task wears its own workspace’s labels')

  const foreignLabel = await M(`/tasks/${T}/labels/${LABEL_B}`, { method: 'POST' })
  const foreignLabelOn = await holds('task_label_assignments', T, 'label_id', LABEL_B)
  chk(
    refused(foreignLabel, 404) && !foreignLabelOn,
    'a label from another workspace cannot be put on a task — even by a member of both',
    `it answered ${said(foreignLabel)} and the label is ${foreignLabelOn ? '' : 'not '}on the task`,
  )
  await sql`delete from task_label_assignments where task_id = ${T} and label_id = ${LABEL_B}`

  const ownLabel = await M(`/tasks/${T}/labels/${LABEL_A}`, { method: 'POST' })
  chk(
    ownLabel.status < 300 && (await holds('task_label_assignments', T, 'label_id', LABEL_A)),
    'while the workspace’s own label goes on',
    `it answered ${said(ownLabel)}`,
  )

  const BORN_LABEL = `${TAG} born with B's label`
  const bornLabel = await A('/tasks', { method: 'POST', body: { listId: LE1, title: BORN_LABEL, labelIds: [LABEL_B] } })
  const bornLabelRows = await sql`select id from tasks where title = ${BORN_LABEL}`
  chk(
    refused(bornLabel, 404) && bornLabelRows.length === 0,
    'and a task cannot be born wearing another workspace’s label',
    `it answered ${said(bornLabel)} and ${bornLabelRows.length} task(s) titled "${BORN_LABEL}" exist`,
  )

  // ══ 9. WHAT A TASK DEPENDS ON ════════════════════════════════════════════
  console.log('\n▶ a dependency stays inside the workspace, and is removed through its own task')

  const depOut = await M(`/tasks/${T}/dependencies`, { method: 'POST', body: { relatedTaskId: TB, type: 'related_to' } })
  const depOutRows = await sql`select id from task_dependencies where task_id = ${T} and related_task_id = ${TB}`
  chk(
    refused(depOut, 404) && depOutRows.length === 0,
    'a dependency on a task in another workspace is NOT FOUND — the task’s own read hands back the related task whole',
    `it answered ${said(depOut)} and ${depOutRows.length} dependency row(s) point from T into B`,
  )
  await sql`delete from task_dependencies where task_id = ${T} and related_task_id = ${TB}`

  const depIn = await M(`/tasks/${T}/dependencies`, { method: 'POST', body: { relatedTaskId: T2, type: 'related_to' } })
  const depInRows = await sql`select id from task_dependencies where task_id = ${T} and related_task_id = ${T2}`
  chk(
    depIn.status < 300 && depInRows.length === 1,
    'while one on a task in the same workspace is made',
    `it answered ${said(depIn)} and ${depInRows.length} row(s) hold it`,
  )

  const deleteForeign = await M(`/tasks/${T}/dependencies/${DEP_B}`, { method: 'DELETE' })
  const depBStill = (await sql`select 1 from task_dependencies where id = ${DEP_B}`).length === 1
  chk(
    deleteForeign.status >= 400 && depBStill,
    'and a dependency in another workspace cannot be deleted through a task of your own — the route took its id alone',
    `it answered ${said(deleteForeign)} and B's dependency is ${depBStill ? 'still there' : 'gone'}`,
  )
  if (!depBStill) {
    await sql`insert into task_dependencies (id, task_id, related_task_id, type, created_by_id)
      values (${DEP_B}, ${TB}, ${TB2}, 'related_to', ${admin.id}) on conflict do nothing`
  }

  const OWN_DEP = depInRows[0]?.id ?? null
  const deleteOwn = OWN_DEP ? await M(`/tasks/${T}/dependencies/${OWN_DEP}`, { method: 'DELETE' }) : { status: 0 }
  const ownDepGone = OWN_DEP ? (await sql`select 1 from task_dependencies where id = ${OWN_DEP}`).length === 0 : false
  chk(
    deleteOwn.ok && ownDepGone,
    'while the task’s own dependency is removed through it',
    `it answered ${said(deleteOwn)} and the dependency is ${ownDepGone ? 'gone' : 'still there'}`,
  )

  // ══ 10. WHAT A TASK SHOWS FROM ELSEWHERE ═════════════════════════════════
  console.log('\n▶ a task shows nothing from another workspace, however the row came to point there')

  /*
   * ROWS POISONED FROM OUTSIDE THE ROUTES — before the checks above existed,
   * or by any path added later. Each read check is paired with a neighbour
   * that DOES belong, made through the routes, so a filter that hid
   * everything fails as surely as one that hid nothing.
   */
  const TC2 = await make('/tasks', { listId: LC, title: `${TAG} C's task hung under A` }, 'a second task in C')
  const T4 = await make('/tasks', { listId: LE1, title: `${TAG} parent poisoned` }, 'the task with a poisoned parent')
  const ownChild = await A('/tasks', { method: 'POST', body: { listId: LE1, title: `${TAG} own child`, parentTaskId: T3 } })
  const legitDep = await A(`/tasks/${T3}/dependencies`, { method: 'POST', body: { relatedTaskId: T2, type: 'related_to' } })
  const legitLabel = await A(`/tasks/${T3}/labels/${LABEL_A}`, { method: 'POST' })
  if (ownChild.status >= 300 || legitDep.status >= 300 || legitLabel.status >= 300) {
    console.log(`  \x1b[33mnote\x1b[0m a legitimate neighbour was not made: child ${ownChild.status}, dependency ${legitDep.status}, label ${legitLabel.status}`)
  }
  await sql`update tasks set parent_task_id = ${TC} where id = ${T4}`
  await sql`update tasks set parent_task_id = ${T3} where id = ${TC2}`
  await sql`insert into task_dependencies (task_id, related_task_id, type, created_by_id) values (${T3}, ${TC}, 'related_to', ${admin.id})`
  await sql`insert into task_label_assignments (task_id, label_id) values (${T3}, ${LABEL_B}) on conflict do nothing`

  const readT4 = (await A(`/tasks/${T4}`)).data
  const readChild = ownChild.data?.id ? (await A(`/tasks/${ownChild.data.id}`)).data : null
  chk(
    readT4 !== undefined && readT4?.parent == null && readChild?.parent?.id === T3,
    'a task whose parent row points into another workspace shows no parent — while one whose parent is its own does',
    `the poisoned task shows parent ${JSON.stringify(readT4?.parent ?? null).slice(0, 120)}; the legitimate child shows ` +
      `${JSON.stringify(readChild?.parent ?? null).slice(0, 80)}`,
  )

  const read3 = (await A(`/tasks/${T3}`)).data
  const subIds = (read3?.subtasks ?? []).map((t) => t.id)
  chk(
    subIds.includes(ownChild.data?.id) && !subIds.includes(TC2),
    'its subtasks are its own workspace’s only',
    `the subtasks are ${JSON.stringify(subIds)}; C's task is ${TC2}, the legitimate child ${ownChild.data?.id}`,
  )

  const depIds = (read3?.dependencies ?? []).map((d) => d.related?.id ?? d.dep?.relatedTaskId)
  chk(
    depIds.includes(T2) && !depIds.includes(TC),
    'and so are its dependencies — the related task is handed back whole, so a foreign one was a read of it',
    `the dependencies relate to ${JSON.stringify(depIds)}; C's task is ${TC}`,
  )

  const labelIds = (read3?.labels ?? []).map((l) => l.id)
  chk(
    labelIds.includes(LABEL_A) && !labelIds.includes(LABEL_B),
    'and its labels',
    `the labels are ${JSON.stringify(labelIds)}; B's label is ${LABEL_B}`,
  )

  const graph = (await A(`/tasks/${T3}/dependencies/graph`)).data
  const nodeIds = (graph?.nodes ?? []).map((n) => n.id)
  const edgeEnds = (graph?.edges ?? []).flatMap((e) => [e.taskId, e.relatedTaskId])
  chk(
    nodeIds.includes(T2) && !nodeIds.includes(TC) && !edgeEnds.includes(TC),
    'and the dependency graph stops at the workspace’s edge',
    `the graph's nodes are ${JSON.stringify(nodeIds)} and its edges touch ${JSON.stringify([...new Set(edgeEnds)])}`,
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
