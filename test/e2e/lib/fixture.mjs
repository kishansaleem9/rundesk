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

/** A tiny API client bound to one token, shaped like the ones in the suites. */
export function apiClient(base, token) {
  return async (route, init = {}) => {
    const headers = { authorization: `Bearer ${token}` }
    if (init.body) headers['content-type'] = 'application/json'
    const res = await fetch(`${base}${route}`, {
      ...init,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
    return { status: res.status, data: json?.data, error: json?.error }
  }
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
    const spaces = (await api(`/spaces/workspace/${ws.id}`)).data ?? []
    for (const space of spaces) {
      const projects = (await api(`/projects/space/${space.id}`)).data ?? []
      for (const project of projects) {
        const lists = (await api(`/lists/project/${project.id}`)).data ?? []
        if (lists.length) return ws
      }
    }
  }
  return candidates[0]
}

/**
 * Make sure `workspaceId` has a list with enough in it to sweep.
 *
 * @returns {{ spaceId, projectId, listId, listPath, created: number }}
 */
export async function ensureSweepFixture(api, workspaceId, { minTasks = 6 } = {}) {
  const spaces = (await api(`/spaces/workspace/${workspaceId}`)).data ?? []
  if (!spaces.length) throw new Error('workspace has no spaces — nothing to build a fixture in')
  const spaceId = spaces[0].id

  const projects = (await api(`/projects/space/${spaceId}`)).data ?? []
  if (!projects.length) throw new Error('space has no projects')
  const projectId = projects[0].id

  const lists = (await api(`/lists/project/${projectId}`)).data ?? []
  if (!lists.length) throw new Error('project has no lists')
  const listId = lists[0].id

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
 * Idempotent by title, so repeated runs do not pile up rows.
 */
export async function ensureShared(
  api,
  workspaceId,
  listId,
  myUserId,
  peerUserId,
  { taskTitle, meetingTitle, closedTaskTitle, soloMeetingTitle },
) {
  const existing = (await api(`/tasks/list/${listId}`)).data ?? []
  const tasks = Array.isArray(existing) ? existing : (existing.tasks ?? [])
  let task = tasks.find((t) => t.title === taskTitle)
  if (!task) {
    task = (await api('/tasks', { method: 'POST', body: { listId, title: taskTitle } })).data
    // Assigned to both, because "open tasks with them" means exactly that —
    // a task only one of you is on is not shared.
    for (const userId of [myUserId, peerUserId]) {
      if (userId) await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId } })
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
    const closed = (await api('/tasks', {
      method: 'POST',
      body: { listId, title: closedTaskTitle },
    })).data
    if (closed?.id) {
      for (const userId of [myUserId, peerUserId]) {
        if (userId) await api(`/tasks/${closed.id}/assignees`, { method: 'POST', body: { userId } })
      }
      await api(`/tasks/${closed.id}`, { method: 'PATCH', body: { status: 'done' } })
    }
  }

  const meetings = (await api(`/workspaces/${workspaceId}/meetings`)).data ?? []
  const list = Array.isArray(meetings) ? meetings : (meetings.items ?? [])
  let meeting = list.find((m) => m.title === meetingTitle)
  if (!meeting) {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    meeting = (await api(`/workspaces/${workspaceId}/meetings`, {
      method: 'POST',
      body: {
        title: meetingTitle,
        startsAt,
        endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        provider: 'manual',
        attendeeIds: [myUserId, peerUserId].filter(Boolean),
      },
    })).data
  }

  /* The solo one: same workspace, same shape, one attendee. */
  if (soloMeetingTitle && !list.some((m) => m.title === soloMeetingTitle)) {
    await api(`/workspaces/${workspaceId}/meetings`, {
      method: 'POST',
      body: {
        title: soloMeetingTitle,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
        provider: 'manual',
        attendeeIds: [myUserId].filter(Boolean),
      },
    })
  }
  return { task, meeting }
}
