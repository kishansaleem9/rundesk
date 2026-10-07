/**
 * Enough of a workspace for a sweep to have something to sweep.
 *
 * `ui-sweep` and `video-regression` were written against a long-lived
 * workspace with real content in it, addressed by a hardcoded UUID. That is
 * why they were never in CI: pointed at a freshly seeded database they find an
 * empty list, and an empty list fails almost every check they make — not
 * because the feature is broken but because there is nothing on screen to
 * group, filter, or open. "Title vanished: []" is what a grid with no rows
 * looks like from the outside.
 *
 * So the fixture is stated rather than assumed. This creates the minimum a
 * sweep needs and returns where it put it:
 *
 *   - several tasks in one list, so the grid renders at all
 *   - more than one *status*, so "group by status" has buckets to make
 *   - more than one *priority*, so regrouping visibly changes them
 *   - at least one assignee, so "group by assignee" is not a single bucket
 *
 * Only used when the caller has not been told where to look. A run against a
 * real deployment passes `E2E_WS` and `E2E_LIST_PATH` and this never fires —
 * nothing is created in a workspace somebody actually uses.
 */

import { signInApi } from './signin.mjs'
import { madeWorkspace, madeSpace, madeRow } from './made.mjs'

/*
 * WHAT A RUN MAKES, REGISTERED FOR REMOVAL (`made.mjs`, which says how and
 * why). Here so a suite imports its fixtures and its cleanup from one place.
 */
export { madeAccount, madeWorkspace, madeSpace, madeRow } from './made.mjs'

/*
 * THE ROUTES WHOSE ANSWER IS A NEW ROW, by path: `apiAs` registers what they
 * made, so every suite that makes its own workspace (155 did, 136 of them
 * archiving it at the end and none deleting it) or a space or list in the
 * shared one has it removed when the run ends, without a line of its own
 * (`found-30-sep/suite-runs-leave-accounts-behind`). `DELETE /lists/:id`, like
 * the space's, only archives: `list-filters`, `view-visibility` and
 * `planner-blocks` left a list in Main Workspace a run. An invitation belongs
 * to the organization, which for the admin's is never the run's, and
 * `DELETE /invitations/:id` only revokes it: `auth-route-limits` left three a
 * run.
 *
 * AND WHAT A SUITE MAKES IN THE SHARED WORKSPACE (`found-30-sep/suite-leftovers-unmeasured`).
 * After the lanes were brought to pristine's hierarchy, a sweep of the 268
 * suites left 559 rows there, from 53 suites: tasks above all (`person-panel`
 * left 34 a run, deleted through the product, which only bins them, with 103
 * rows of their activity), then the comments, messages, channels, projects,
 * docs and meetings they made. Tasks were left out of this on purpose:
 * `ensureSweepFixture` and `ensureShared` kept theirs from run to run, for a
 * suite beside this one to read. No suite runs beside another on a database
 * now (a lane runs one at a time, and CI one after another), so they make
 * their own each run, as everything else here does.
 *
 * A route here answers with the row it made, or, for a direct message, the
 * one it found: a row older than the run is not the run's, and the sweep keeps
 * it (`made-sweep.mjs`). A route that answers with another row than the one it
 * made (the task an assignee joined) is not here.
 */
const UUID_IN_PATH = '[0-9a-fA-F-]{36}'
const ROW_ID = /^[0-9a-f-]{36}$/i
const MADE_BY_POST = [
  // And its organization: the admin is in none, so a workspace the admin makes comes with one of its own.
  ['/workspaces', (id, made) => {
    if (!ROW_ID.test(String(id ?? ''))) return
    madeWorkspace(id)
    if (ROW_ID.test(String(made?.organizationId ?? ''))) madeRow('organizations', made.organizationId)
  }],
  ['/spaces', (id) => ROW_ID.test(String(id ?? '')) && madeSpace(id)],
  ['/lists', 'lists'],
  ['/invitations', 'invitations'],
  ['/projects', 'projects'],
  ['/tasks', 'tasks'],
  ['/tasks/:id/comments', 'task_comments'],
  ['/tasks/:id/checklists', 'task_checklists'],
  ['/workspaces/:id/chat/channels', 'chat_channels'],
  ['/workspaces/:id/chat/dms', 'chat_channels'],
  ['/workspaces/:id/chat/group-dms', 'chat_channels'],
  ['/chat/messages/:id/create-task', 'tasks'],
  ['/chat/channels/:id/messages', 'chat_messages'],
  ['/workspaces/:id/docs', 'docs'],
  ['/workspaces/:id/docs/import', 'docs'],
  ['/workspaces/:id/labels', 'labels'],
  ['/support/tickets', 'support_tickets'],
  ['/workspaces/:id/meetings', 'meetings'],
  ['/workspaces/:id/calls', 'calls'],
  ['/workspaces/:id/forms', 'forms'],
  ['/workspaces/:id/bookmarks', 'workspace_bookmarks'],
  ['/workspaces/:id/announcements', 'announcements'],
  ['/workspaces/:id/ai-chats', 'ai_chat_threads'],
  ['/workspaces/:id/canvases', 'workspace_canvases'],
  ['/workspaces/:id/projects/:id/custom-fields', 'custom_field_definitions'],
  // A call that ends — by its End, or as its last person leaves — files a meeting, which the answer names.
  ['/workspaces/:id/calls/:id/end', (id, made) => ROW_ID.test(String(made?.meetingId ?? '')) && madeRow('meetings', made.meetingId)],
  ['/workspaces/:id/calls/:id/leave', (id, made) => ROW_ID.test(String(made?.meetingId ?? '')) && madeRow('meetings', made.meetingId)],
  ['/workspaces/:id/reminders', 'reminders'],
  // A list's email address: its DELETE turns it off and keeps the row.
  ['/lists/:id/inbound-email', 'list_email_aliases'],
  ['/lists/:id/views', 'task_views'],
  ['/lists/:id/filters', 'list_filter_presets'],
].map(([route, made]) => [
  new RegExp(`^${route.replace(/:id/g, UUID_IN_PATH)}$`),
  typeof made === 'string' ? (id) => ROW_ID.test(String(id ?? '')) && madeRow(made, id) : made,
])
/** What `route` makes, registered as made, when it answers with a new row's id. */
const madeBy = (route) => MADE_BY_POST.find(([path]) => path.test(route.split('?')[0]))?.[1] ?? null

/*
 * WHAT A PAGE MAKES, REGISTERED AS `apiAs` REGISTERS IT (`found-30-sep/suite-leftovers-unmeasured`).
 * A suite drives the product through its pages as much as through the client,
 * and a page makes rows by the same routes: the AI dock its threads, the space
 * wizard its space, the meeting form its meeting, the list's add row its task.
 * After the client registered its own, 21 suites still left rows, most of them
 * made so. So every answer a browser's page gets from one of `MADE_BY_POST`'s
 * routes is registered too. `lib/playwright.mjs` watches every browser it
 * launches; a suite that launches one itself watches it with this.
 */
export function watchMade(browser) {
  if (!browser || typeof browser.newContext !== 'function' || browser.__madeWatched) return browser
  browser.__madeWatched = true
  const watch = (context) => {
    if (context && typeof context.on === 'function' && !context.__madeWatched) {
      context.__madeWatched = true
      context.on('response', (res) => void registerAnswer(res))
    }
    return context
  }
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (...args) => watch(await newContext(...args))
  if (typeof browser.newPage === 'function') {
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => {
      const page = await newPage(...args)
      watch(page.context())
      return page
    }
  }
  return browser
}

/** A page's answer from a route that makes a row, registered by the id it answered with. */
async function registerAnswer(res) {
  try {
    if (res.request().method() !== 'POST' || res.status() < 200 || res.status() >= 300) return
    const { pathname } = new URL(res.url())
    const at = pathname.indexOf('/api/v1/')
    const made = at < 0 ? null : madeBy(pathname.slice(at + '/api/v1'.length))
    if (!made) return
    const data = (await res.json())?.data
    if (data && typeof data === 'object') made(data.id, data)
  } catch {
    /* an answer no longer readable (the page closed, the body streamed) names nothing */
  }
}

/**
 * THE API CLIENT, ONCE (`suite-hygiene/apiAs-duplicated-62`).
 *
 * `apiAs(base)(token)` is a client of the API at `base` (`…/api/v1`), signed in
 * as `token`. `await A(route, { method, body })` answers
 *
 *     { status, ok, data, error, message, text, type }
 *
 * for EVERY HTTP status: a 403 or a 500 comes back like a 200, so a caller
 * reads `status` (or `ok`), and a `.catch()` on a call has nothing to catch
 * (`suite-hygiene/inert-catches`). `data` and `error` are the envelope's, which
 * the API puts round every JSON answer (its response interceptor, and its
 * exception filter's `{ data: null, error }`). `message` is what the server
 * said, as one string: a list of validation messages joined with '; ', and ''
 * when it said nothing. `text` is the body as sent and `type` its content type,
 * so a CSV, a PDF or a page can be read as well.
 *
 * 172 suites carried a copy of this, in 21 variants once comments and spacing
 * are set aside, and none of them was the fixture's. They differed in what a
 * caller would not think to ask: whether a null token sent `Bearer null`, what
 * came back when nothing answered, whether the body was parsed as text, which
 * fields came back. Each was right for its suite, and a new suite copied
 * whichever it was nearest. The rules they now share:
 *
 *   · A null, undefined or empty token sends NO Authorization header. An
 *     anonymous call is anonymous; `Bearer null` is a malformed token, which a
 *     route is free to refuse differently from none.
 *   · A JSON content type only with a body. Fastify refuses an empty body that
 *     claims to be JSON, which is what a bodyless DELETE used to send (five
 *     teardowns answered 400 for it, `suite-hygiene/inert-catches`).
 *   · When nothing answers (the API is down, the connection dropped), a status
 *     of 0: `{ status: 0, ok: false, data: null, error: { message: 'no answer',
 *     cause } }`. A setup reads it as a refusal; `must` below names it.
 *   · A row it is answered with a new id of, from a route that makes one
 *     (`POST /workspaces`, `/spaces`, `/lists`, `/tasks` and the rest of
 *     `MADE_BY_POST`, 2xx), is registered with `made.mjs`, and removed for
 *     good when the run ends.
 *
 * WHAT A SUITE MAY STILL ASK FOR, where its own copy did something else and a
 * check stood on it. Each is an option, so the difference is written where the
 * suite binds the client instead of hidden in a copy:
 *
 *   · `noAnswer: 'throw'` — reject, naming the call, when nothing answers,
 *     instead of answering 0. 67 copies, the 14 helpers that were the same
 *     client under other names (`call`, `A`, `api`) and `apiClient` rejected,
 *     and their suites' checks were written against that: `status < 300` alone,
 *     which a 0 would pass. There a dead API has to stop the run, not read as
 *     success.
 *   · `emptyBodyOn: ['POST', …]` — send `{}` on these methods when the caller
 *     gave no body: a route that reads a body refuses a request without one.
 *   · `dataOrBody: true` — `data` is the whole parsed body when it carries no
 *     `data`, so a refusal's `{ data: null, error }` reads as `data.error`.
 */
export function apiAs(base, { noAnswer = 'status', emptyBodyOn = [], dataOrBody = false } = {}) {
  return (token) => async (route, init = {}) => {
    const body = init.body ?? (emptyBodyOn.includes(init.method) ? {} : undefined)
    const headers = token ? { authorization: `Bearer ${token}` } : {}
    if (body) headers['content-type'] = 'application/json'
    let res
    try {
      res = await fetch(`${base}${route}`, { ...init, headers, body: body ? JSON.stringify(body) : undefined })
    } catch (err) {
      // undici says `fetch failed` and puts the reason (ECONNREFUSED, a reset) in `cause`.
      const cause = String(err?.cause?.code ?? err?.cause?.message ?? err?.message ?? err)
      if (noAnswer === 'throw') throw new Error(`no answer from ${init.method ?? 'GET'} ${route}: ${cause}`, { cause: err })
      return { status: 0, ok: false, data: null, error: { message: 'no answer', cause }, message: '', text: '', type: '' }
    }
    const type = res.headers.get('content-type') ?? ''
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* not JSON: a CSV, a PDF, a page, or no body at all */
    }
    const said = json?.message ?? json?.error?.message
    const made = init.method === 'POST' && res.status >= 200 && res.status < 300 ? madeBy(route) : null
    if (made && json?.data && typeof json.data === 'object') made(json.data.id, json.data)
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data: dataOrBody ? (json?.data ?? json) : json?.data,
      error: json?.error,
      message: Array.isArray(said) ? said.join('; ') : String(said ?? ''),
      text,
      type,
    }
  }
}

/**
 * The answer's `data` when the API said yes (2xx); otherwise a throw that names
 * what could not be done and what the API said, or that nothing answered.
 *
 * For a read or a write that what follows cannot do without:
 * `must(await A('/workspaces', { method: 'POST', body }), 'make the workspace').id`
 * says "could not make the workspace: answered 403 …" where `(await A(…)).data.id`
 * says "Cannot read properties of undefined", about nothing in particular
 * (`suite-hygiene/unguarded-derefs`).
 */
export function must(res, what) {
  const status = res?.status
  if (status >= 200 && status < 300) return res.data
  const said = status
    ? `answered ${status} ${JSON.stringify(res?.error?.message ?? null)}`
    : `got no answer${res?.error?.cause ? ` (${res.error.cause})` : ''}`
  throw new Error(`could not ${what}: ${said}`)
}

/**
 * `apiAs(base)(token)`, for the callers written before it. It rejected when
 * nothing answered, and those callers' checks were written against that, so it
 * still does.
 */
export function apiClient(base, token) {
  return apiAs(base, { noAnswer: 'throw' })(token)
}

/**
 * Sign in over HTTP.
 *
 * One line, because the interesting part — the login route's 10-a-minute limit,
 * which the suites collectively exceed in CI — is handled in one place for
 * every suite. See `signin.mjs`.
 */
export const login = signInApi

/**
 * The first list of `workspaceId` a sweep can use, walking its spaces, their
 * projects and their lists in order: `{ spaceId, projectId, listId }`, or null.
 *
 * ONE WALK, for picking a workspace and for building in it. They were two:
 * `pickWorkspace` accepted a workspace when ANY space had a project with a
 * list, and `ensureSweepFixture` then took `spaces[0]` whatever it held. On
 * lane 4 a space left empty by an interrupted run came first, and nine suites
 * died on "space has no projects" before their first check
 * (`found-25-sep/fixture-builds-in-a-space-it-did-not-check`). A leftover empty
 * space is passed over now, by both.
 */
export async function firstSweepList(api, workspaceId) {
  const spaces = (await api(`/spaces/workspace/${workspaceId}`)).data ?? []
  for (const space of spaces) {
    const projects = (await api(`/projects/space/${space.id}`)).data ?? []
    for (const project of projects) {
      const lists = (await api(`/lists/project/${project.id}`)).data ?? []
      if (lists.length) return { spaceId: space.id, projectId: project.id, listId: lists[0].id }
    }
  }
  return null
}

/**
 * The workspace a sweep should run against.
 *
 * Not simply `workspaces[0]`: an account can carry throwaway workspaces from
 * other runs, and picking the first one by chance means the suite sweeps an
 * empty shell and reports it as the product being broken. Prefer one that
 * actually has a list to look at, and fall back to the first only if none do.
 */
export async function pickWorkspace(api) {
  const rows = (await api('/workspaces')).data ?? []
  const candidates = rows.map((r) => r.workspace ?? r).filter((w) => w?.id)
  if (!candidates.length) throw new Error('this account can see no workspace')
  for (const ws of candidates) {
    if (await firstSweepList(api, ws.id)) return ws
  }
  return candidates[0]
}

/**
 * Make sure `workspaceId` has a list with enough in it to sweep.
 *
 * @returns {{ spaceId, projectId, listId, listPath, created: number }}
 */
export async function ensureSweepFixture(api, workspaceId, { minTasks = 6 } = {}) {
  const found = await firstSweepList(api, workspaceId)
  if (!found) throw new Error('no space of this workspace has a project with a list — nothing to build a fixture in')
  const { spaceId, projectId, listId } = found

  const existing = (await api(`/tasks/list/${listId}`)).data ?? []
  const already = Array.isArray(existing) ? existing : (existing.tasks ?? [])
  const listPath = `${spaceId}/${projectId}/${listId}`
  if (already.length >= minTasks) return { spaceId, projectId, listId, listPath, created: 0 }

  /*
   * Statuses come from the list rather than from a guess. A list carries its
   * own set (the default one, or a custom scope), and inventing "In progress"
   * when this list calls it something else produces tasks that all land in the
   * same bucket — which looks exactly like the grouping being broken.
   */
  const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
  const statusKeys = statuses.map((s) => s.key).filter(Boolean)

  const members = (await api(`/workspaces/${workspaceId}/members`)).data ?? []
  const memberIds = (Array.isArray(members) ? members : []).map((m) => m.userId).filter(Boolean)

  const priorities = ['urgent', 'high', 'normal', 'low']
  const stamp = Date.now()
  let created = 0
  for (let i = already.length; i < minTasks; i++) {
    const body = {
      listId,
      title: `sweep fixture ${stamp}-${i}`,
      priority: priorities[i % priorities.length],
    }
    // Spread across whatever statuses this list actually has.
    if (statusKeys.length) body.status = statusKeys[i % statusKeys.length]
    const task = (await api('/tasks', { method: 'POST', body })).data
    if (!task?.id) continue
    created++
    // Leave some unassigned on purpose: "no assignee" is a bucket too, and a
    // grouping that only ever sees one value cannot be shown to regroup.
    if (memberIds.length && i % 2 === 0) {
      await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId: memberIds[i % memberIds.length] } })
    }
  }

  return { spaceId, projectId, listId, listPath, created }
}

/**
 * Make sure the signed-in person has a DM to look at.
 *
 * The DM tab strip — Chat / Calendar / Tasks over a conversation — can only be
 * checked against a conversation that exists, and a freshly seeded workspace
 * has none. `ensureDmChannel` is idempotent, so this is safe to call on every
 * run; it returns null when the workspace has nobody else in it, which is a
 * legitimate state the caller should skip rather than fail on.
 */
export async function ensureDm(api, workspaceId, myUserId) {
  const members = (await api(`/workspaces/${workspaceId}/members`)).data ?? []
  const peer = (Array.isArray(members) ? members : []).find((m) => m.userId && m.userId !== myUserId)
  if (!peer) return null
  const dm = await api(`/workspaces/${workspaceId}/chat/dms`, {
    method: 'POST',
    body: { peerUserId: peer.userId },
  })
  if (dm.status >= 300) return null
  // The name matters as much as the channel: a suite looking for this DM in the
  // sidebar has to know what it will be called, and hardcoding one workspace's
  // colleague is how these suites got pinned to one database in the first place.
  return { channel: dm.data ?? null, peer, name: peer.displayName || peer.email || '' }
}

/**
 * Make sure the signed-in person has at least one notification.
 *
 * Some inbox controls only exist when there is something to act on — "Clear
 * all" is rendered on `notifs.length > 0`, which is right, and which means a
 * suite checking for it against a freshly seeded inbox is checking an empty
 * screen. Nothing a person can do to themselves reliably notifies them, so
 * this borrows a second account and has *them* assign you something.
 *
 * Optional by construction: without usable peer credentials it returns null
 * and the caller should say it skipped rather than quietly pass.
 */
export async function ensureNotification(api, apiBase, workspaceId, myUserId, listId, peerCreds) {
  const existing = (await api('/notifications')).data
  const count = Array.isArray(existing) ? existing.length : (existing?.items?.length ?? 0)
  if (count > 0) return { created: 0, had: count }

  const email = peerCreds?.email ?? process.env.E2E_PEER_EMAIL ?? 'org-admin@rundesk.internal'
  const password = peerCreds?.password ?? process.env.E2E_PEER_PASSWORD ?? 'OrgAdmin@123!'
  let peerAuth
  try {
    peerAuth = await login(apiBase, email, password)
  } catch {
    return null
  }
  const peerApi = apiClient(apiBase, peerAuth.accessToken)
  const task = (await peerApi('/tasks', {
    method: 'POST',
    body: { listId, title: `notify fixture ${Date.now()}` },
  })).data
  if (!task?.id) return null
  const assigned = await peerApi(`/tasks/${task.id}/assignees`, {
    method: 'POST',
    body: { userId: myUserId },
  })
  return assigned.status < 300 ? { created: 1, had: 0 } : null
}

/**
 * A task and a meeting that BOTH people share.
 *
 * The DM tab strip's whole claim is "here is what you two have in common" —
 * open tasks with them, meetings with them. Checking that against a workspace
 * where nothing is shared reads as the feature being broken, which is what
 * `A39 open task for the pair` and `A39 Sprint sync with colleague` were for:
 * two rows that existed in one database and nowhere else.
 *
 * Found by title within a run; what it makes is registered (`apiAs`) and goes
 * when the run ends, so runs do not pile up rows.
 */
export async function ensureShared(
  api,
  workspaceId,
  listId,
  myUserId,
  peerUserId,
  { taskTitle, meetingTitle, closedTaskTitle, soloMeetingTitle },
) {
  /*
   * EVERY WRITE HERE IS READ. This client never throws on a status, so a write
   * that was refused used to leave the row missing and the check that needed
   * it passing or failing about something else (`resume-defects/resume-3`).
   * A refused write now stops the suite, naming what could not be staged:
   * `must` above, the one this file exports, where this function once had its
   * own with the arguments the other way round.
   */
  const existing = (await api(`/tasks/list/${listId}`)).data ?? []
  const tasks = Array.isArray(existing) ? existing : (existing.tasks ?? [])
  let task = tasks.find((t) => t.title === taskTitle)
  if (!task) task = must(await api('/tasks', { method: 'POST', body: { listId, title: taskTitle } }), 'make the shared task')
  // Assigned to both, because "open tasks with them" means exactly that — a
  // task only one of you is on is not shared. On EVERY run, not only when the
  // task is made: the peer is whoever `ensureDm` picks, which is the first
  // other member and moves as members come and go, so a task found by its
  // title can be shared with somebody else (an assignee already there is a
  // no-op, and this client never throws).
  if (task?.id) {
    for (const userId of [myUserId, peerUserId]) {
      if (userId) must(await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId } }), 'assign the shared task')
    }
  }

  /*
   * THE ROWS THE NEGATIVE CHECKS NEED, and their absence made two checks
   * vacuous for as long as they existed.
   *
   * `a39-dm-tabs` asserts that a CLOSED task is not under "open tasks" and
   * that a meeting only one person attended is not under "meetings with
   * them" — and nothing created either row, so both assertions were about
   * strings no build would ever render. `a39-3-finished-work-is-shared-work`
   * deletes the `statusCategory` filter outright and ran GREEN.
   *
   * An absence is a claim only when the thing could have been present. So the
   * closed task is assigned to BOTH and then closed, and the solo meeting has
   * exactly one attendee — each one qualifying for its tab in every respect
   * except the one under test.
   */
  if (closedTaskTitle && !tasks.some((t) => t.title === closedTaskTitle)) {
    // Closed by the LIST'S own closed status: a list whose statuses were
    // renamed has no `done`, and a PATCH to a key it lacks is refused.
    const statuses = (await api(`/lists/${listId}/statuses`)).data ?? []
    const closedKey = (Array.isArray(statuses) ? statuses : []).find((s) => s.category === 'closed')?.key
    if (!closedKey) throw new Error(`ensureShared could not close a task: the list has no closed status (${JSON.stringify(statuses)})`)
    const closed = must(await api('/tasks', {
      method: 'POST',
      body: { listId, title: closedTaskTitle },
    }), 'make the closed task')
    for (const userId of [myUserId, peerUserId]) {
      if (userId) must(await api(`/tasks/${closed.id}/assignees`, { method: 'POST', body: { userId } }), 'assign the closed task')
    }
    must(await api(`/tasks/${closed.id}`, { method: 'PATCH', body: { status: closedKey } }), `close the closed task (${closedKey})`)
  }

  const meetings = (await api(`/workspaces/${workspaceId}/meetings`)).data ?? []
  const list = Array.isArray(meetings) ? meetings : (meetings.items ?? [])
  /*
   * FOUND BY ITS TITLE AND ITS TWO PEOPLE, not by its title alone. The peer is
   * the first other member (`ensureDm`), and that moves: on lane 1 a suite had
   * left "Zoya Outsider" in the workspace, the DM became hers, and the meeting
   * found by title was still the one with the member before — so "the meeting
   * both attended is listed" failed about a meeting she never attended
   * (`found-24-sep/a39-shared-meeting-keyed-by-title`).
   */
  const attends = (m, userId) => (m.attendees ?? []).some((a) => (a.user?.id ?? a.userId) === userId)
  let meeting = list.find((m) => m.title === meetingTitle && attends(m, myUserId) && attends(m, peerUserId))
  if (!meeting) {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    meeting = must(await api(`/workspaces/${workspaceId}/meetings`, {
      method: 'POST',
      body: {
        title: meetingTitle,
        startsAt,
        endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        provider: 'manual',
        attendeeIds: [myUserId, peerUserId].filter(Boolean),
      },
    }), 'make the shared meeting')
  }

  /* The solo one: same workspace, same shape, one attendee. */
  if (soloMeetingTitle && !list.some((m) => m.title === soloMeetingTitle)) {
    // The negative check's row: if this is refused, "a meeting only one of you
    // attended is not listed" would pass about a meeting that does not exist.
    must(await api(`/workspaces/${workspaceId}/meetings`, {
      method: 'POST',
      body: {
        title: soloMeetingTitle,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
        provider: 'manual',
        attendeeIds: [myUserId].filter(Boolean),
      },
    }), 'make the solo meeting')
  }
  return { task, meeting }
}
