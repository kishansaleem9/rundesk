/**
 * AN ID NAMES ONLY WHAT THE ASKER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`, its
 * lookups. Several routes take an item's id and answer with its name: pinning
 * it, favouriting it, linking it. Each is a way to read a title, so each must
 * refuse an id the asker may not open, and must not name one they have lost.
 *
 * Measured on lane 1 before the fix, as a member refused a private space:
 * favouriting that space, its list, its task, its doc and a channel of it —
 * and a private channel the member is not in — each answered 201, and the
 * member's favourites then listed every one of them by name. A member of one
 * workspace (404 on another) put a planner block on the other's task, and on
 * the refused space's, and read both titles back off the grid (§2); and the
 * same through a sprint of their own, which listed and counted both (§3).
 * An AI answer's references resolved the refused space's task and list (§4).
 *
 *   node test/e2e/lookup-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
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
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`

const stamp = Date.now()
const TAG = `lra-${stamp}`
let sql = null
let WS = null
let WS2 = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the favourites made before access was lost are written by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Lookup member', email, password: 'Member@12345!',
    organizationName: `Lookup member ${stamp}`, organizationSlug: `lookup-member-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const memberId = signed.user?.id

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  /** One of each thing a favourite can name, in a space of the given visibility. */
  const plant = async (side, visibility) => {
    const space = await make('/spaces', { workspaceId: WS, name: `${TAG} ${side} space`, ...(visibility ? { visibility } : {}) }, `the ${side} space`)
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${side} project` }, `the ${side} project`)
    const list = await make('/lists', { projectId: project, name: `${TAG} ${side} list` }, `the ${side} list`)
    const task = await make('/tasks', { listId: list, title: `${TAG} ${side} task` }, `the ${side} task`)
    const doc = await make(`/workspaces/${WS}/docs`, { title: `${TAG} ${side} doc`, spaceId: space }, `the ${side} doc`)
    const channel = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-${side}-channel`, spaceId: space }, `the ${side} channel`)
    return { space, list, task, doc, channel }
  }
  const hidden = await plant('hidden', 'private')
  const open = await plant('open')
  // And a private channel of the open space, which the member is not in.
  const closedChannel = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-closed-channel`, isPrivate: true }, 'the closed channel')
  const refused = await M(`/tasks/list/${hidden.list}`)
  if (refused.status !== 403) throw new Error(`the member was not refused the hidden list (${said(refused)}), so nothing here would mean anything`)

  const HIDDEN = [
    ['space', hidden.space], ['list', hidden.list], ['task', hidden.task], ['doc', hidden.doc],
    ['channel', hidden.channel], ['channel', closedChannel],
  ]
  const OPEN = [['space', open.space], ['list', open.list], ['task', open.task], ['doc', open.doc], ['channel', open.channel]]
  const label = ([type, id]) => `${type} ${[...Object.values(hidden), closedChannel].includes(id) ? (id === closedChannel ? 'closed' : 'hidden') : 'open'}`

  // ══ 1. FAVOURITES ════════════════════════════════════════════════════════
  console.log('\n▶ a favourite names only what its owner may open')

  const toggle = (C, [entityType, entityId]) => C(`/workspaces/${WS}/favorites/toggle`, { method: 'POST', body: { entityType, entityId } })
  const hiddenToggles = []
  for (const item of HIDDEN) hiddenToggles.push(await toggle(M, item))
  const openToggles = []
  for (const item of OPEN) openToggles.push(await toggle(M, item))
  const [{ n: strayFavourites }] = await sql`
    select count(*)::int as n from favorites where user_id = ${memberId} and entity_id in ${sql(HIDDEN.map(([, id]) => id))}`
  chk(
    hiddenToggles.every((r) => r.status === 404) && strayFavourites === 0 && openToggles.every((r) => r.status < 300),
    'a member cannot favourite anything of a space they are refused, nor a channel closed to them (404 each, no row) — while they favourite the open ones',
    `the refused ones answered ${HIDDEN.map((item, i) => `${label(item)} ${hiddenToggles[i].status}`).join(', ')}, rows made ${strayFavourites}; ` +
      `the open ones ${OPEN.map((item, i) => `${label(item)} ${openToggles[i].status}`).join(', ')}`,
  )

  // Favourites made while the member could see them: the list must not name them now.
  await sql`
    insert into favorites (workspace_id, user_id, entity_type, entity_id)
    select ${WS}::uuid, ${memberId}::uuid, t.type, t.id::uuid
    from unnest(${sql.array(HIDDEN.map(([type]) => type))}::text[], ${sql.array(HIDDEN.map(([, id]) => id))}::text[]) as t(type, id)
    on conflict do nothing`
  const memberList = await M(`/workspaces/${WS}/favorites`)
  const labels = (res) => (res.data ?? []).map((f) => f.label)
  const namesHidden = (res) => labels(res).filter((l) => l.includes(`${TAG} hidden`) || l.includes(`${TAG}-hidden`) || l.includes(`${TAG}-closed`))
  const namesOpen = (res) => labels(res).filter((l) => l.includes(`${TAG} open`) || l.includes(`${TAG}-open`))
  chk(
    memberList.status === 200 && namesHidden(memberList).length === 0 && namesOpen(memberList).length === OPEN.length,
    'and a favourite of something they can no longer open is not named in their list — while every open one is',
    `the member's list (${memberList.status}) names ${JSON.stringify(labels(memberList).map((l) => l.replace(`${TAG} `, '').replace(`#${TAG}-`, '#')))}`,
  )

  // The admin, who may open everything, favourites and reads all of it.
  const adminToggles = []
  for (const item of HIDDEN) adminToggles.push(await toggle(A, item))
  const adminList = await A(`/workspaces/${WS}/favorites`)
  chk(
    adminToggles.every((r) => r.status < 300) && namesHidden(adminList).length === HIDDEN.length,
    'while the admin favourites every one of them and reads each by name',
    `the admin's toggles answered ${adminToggles.map((r) => r.status).join(', ')}; the list names ${namesHidden(adminList).length} of ${HIDDEN.length}`,
  )

  // ══ 2. PLANNER BLOCKS ════════════════════════════════════════════════════
  console.log('\n▶ a planner block renders its task only if its owner may open the task')

  /*
   * A task-backed block stores no title and renders the task's. Measured on
   * lane 1 before the fix: a member of one workspace, 404 on another, put a
   * block on a task of the other and read its title back; and the same for a
   * task of a space they were refused. The create path's comment said the task
   * "must be in this workspace", and its query never asked.
   */
  const other = await A('/workspaces', { method: 'POST', body: { name: `${TAG} other` } })
  if (other.status >= 300 || !other.data?.id) throw new Error(`could not make the other workspace: ${said(other)}`)
  WS2 = other.data.id
  const otherSpace = await make('/spaces', { workspaceId: WS2, name: `${TAG} other space` }, 'the other workspace’s space')
  const otherProject = await make('/projects', { spaceId: otherSpace, name: `${TAG} other project` }, 'the other project')
  const otherList = await make('/lists', { projectId: otherProject, name: `${TAG} other list` }, 'the other list')
  const FOREIGN = await make('/tasks', { listId: otherList, title: `${TAG} foreign task` }, 'the other workspace’s task')
  const outsider = await M(`/workspaces/${WS2}`)
  if (outsider.status < 400) throw new Error(`the member could read the other workspace (${said(outsider)}), so nothing here would mean anything`)

  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const block = (taskId) => M(`/planner/${WS}/blocks`, { method: 'POST', body: { taskId, startsAt } })
  const onForeign = await block(FOREIGN)
  const onHidden = await block(hidden.task)
  const onOpen = await block(open.task)
  const [{ n: strayBlocks }] = await sql`
    select count(*)::int as n from task_time_blocks where user_id = ${memberId} and task_id in (${FOREIGN}, ${hidden.task})`
  chk(
    onForeign.status === 404 && onHidden.status === 404 && strayBlocks === 0 && onOpen.status < 300,
    'a planner block cannot point at a task of another workspace, nor of a space the member is refused (404 each, no block) — while it points at an open task',
    `on the other workspace's task ${said(onForeign)}, on the refused one ${said(onHidden)}, blocks made ${strayBlocks}; on the open task ${said(onOpen)}`,
  )

  // Blocks already pointing there — made before the check existed — show no title.
  await sql`
    insert into task_time_blocks (workspace_id, user_id, task_id, starts_at, ends_at)
    values (${WS}, ${memberId}, ${FOREIGN}, now() + interval '2 hours', now() + interval '3 hours'),
           (${WS}, ${memberId}, ${hidden.task}, now() + interval '4 hours', now() + interval '5 hours')`
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const to = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
  const grid = await M(`/planner/${WS}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  const gridText = JSON.stringify(grid.data ?? null)
  const openBlock = (grid.data ?? []).find((b) => b.taskId === open.task)
  chk(
    grid.status === 200 && !gridText.includes(`${TAG} foreign task`) && !gridText.includes(`${TAG} hidden task`) &&
      (grid.data ?? []).length === 3 && openBlock?.label === `${TAG} open task`,
    'and a block already on such a task shows no title of it — while the open task’s block shows its own',
    `the grid (${grid.status}) has ${(grid.data ?? []).length} block(s): ${JSON.stringify((grid.data ?? []).map((b) => b.label ?? null))}`,
  )

  // ══ 3. SPRINTS ═══════════════════════════════════════════════════════════
  console.log('\n▶ a sprint holds, lists and counts only its own workspace’s tasks, as the reader may see them')

  /*
   * Measured on lane 1 before the fix: the same member added the other
   * workspace's task and the refused one to a sprint of their own (201 each),
   * and the sprint listed both titles and counted both. Adding took any id;
   * the listing applied only the private-item rule and never asked which
   * workspace the task was in.
   */
  const sprintMade = await M(`/workspaces/${WS}/sprints`, {
    method: 'POST',
    body: { name: `${TAG} sprint`, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() },
  })
  const SPRINT = sprintMade.data?.id
  if (!SPRINT) throw new Error(`the member could not make a sprint: ${said(sprintMade)}`)
  const addToSprint = (taskId) => M(`/sprints/${SPRINT}/tasks`, { method: 'POST', body: { taskId } })
  const sprintForeign = await addToSprint(FOREIGN)
  const sprintHidden = await addToSprint(hidden.task)
  const sprintOpen = await addToSprint(open.task)
  const [{ n: straySprintRows }] = await sql`
    select count(*)::int as n from sprint_tasks where sprint_id = ${SPRINT} and task_id in (${FOREIGN}, ${hidden.task})`
  chk(
    sprintForeign.status === 404 && sprintHidden.status === 404 && straySprintRows === 0 && sprintOpen.status < 300,
    'a sprint cannot take a task of another workspace, nor of a space the member is refused (404 each, not added) — while it takes an open task',
    `adding the other workspace's task answered ${said(sprintForeign)}, the refused one ${said(sprintHidden)}, rows made ${straySprintRows}; the open one ${said(sprintOpen)}`,
  )

  // Rows already there, from before the check: the member sees and counts the
  // open task alone; the admin also the refused one, and nobody the foreign one.
  await sql`insert into sprint_tasks (sprint_id, task_id) values (${SPRINT}, ${FOREIGN}), (${SPRINT}, ${hidden.task}) on conflict do nothing`
  const sprintTitles = (res) => (res.data ?? []).map((t) => t.title)
  const memberSprint = await M(`/sprints/${SPRINT}/tasks`)
  const adminSprint = await A(`/sprints/${SPRINT}/tasks`)
  const memberCount = ((await M(`/workspaces/${WS}/sprints`)).data ?? []).find((s) => s.id === SPRINT)?.taskCount
  chk(
    memberSprint.status === 200 && JSON.stringify(sprintTitles(memberSprint)) === JSON.stringify([`${TAG} open task`]) && memberCount === 1 &&
      sprintTitles(adminSprint).includes(`${TAG} hidden task`) && !sprintTitles(adminSprint).includes(`${TAG} foreign task`),
    'and a sprint already holding such tasks lists and counts, for the member, only the open one — the admin’s has the refused one too, and nobody’s the other workspace’s',
    `the member's (${memberSprint.status}) lists ${JSON.stringify(sprintTitles(memberSprint).map((t) => t.replace(`${TAG} `, '')))} and counts ${memberCount}; ` +
      `the admin's ${JSON.stringify(sprintTitles(adminSprint).map((t) => t.replace(`${TAG} `, '')))}`,
  )

  // ══ 4. AN AI ANSWER'S REFERENCES ═════════════════════════════════════════
  console.log('\n▶ an AI answer’s task and list chips resolve only what the reader may open')

  /*
   * `[[task:id]]` and `[[list:id]]` in an answer are hydrated by id. The
   * resolver said "ids the caller may not see simply do not come back", and
   * applied only the private-item and private-list rules: a refused space's
   * task and list came back by name (measured on lane 1 before the fix).
   */
  const refs = (C) => C('/ai/refs', {
    method: 'POST',
    body: { workspaceId: WS, taskIds: [hidden.task, open.task], listIds: [hidden.list, open.list] },
  })
  const memberRefs = await refs(M)
  const adminRefs = await refs(A)
  const refIds = (res) => [...(res.data?.tasks ?? []), ...(res.data?.lists ?? [])].map((r) => r.id)
  chk(
    memberRefs.status === 200 && !refIds(memberRefs).includes(hidden.task) && !refIds(memberRefs).includes(hidden.list) &&
      refIds(memberRefs).includes(open.task) && refIds(memberRefs).includes(open.list) &&
      refIds(adminRefs).includes(hidden.task) && refIds(adminRefs).includes(hidden.list),
    'an AI answer’s references resolve no task or list of a space the member is refused — while the open ones resolve, and the admin’s resolve all four',
    `the member's (${memberRefs.status}) resolved ${JSON.stringify(refIds(memberRefs).map((id) => (id === hidden.task ? 'hidden task' : id === hidden.list ? 'hidden list' : id === open.task ? 'open task' : 'open list')))}; ` +
      `the admin's ${refIds(adminRefs).length} of 4`,
  )
  void adminId
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const id of [WS, WS2]) {
    if (!id || !A) continue
    const gone = await A(`/workspaces/${id}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
