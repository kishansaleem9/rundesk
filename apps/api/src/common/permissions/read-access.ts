import { and, eq, inArray } from 'drizzle-orm'
import { lists, projects, spaces, taskAssignees, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { checkContainerAccess, containerVisibilityFilter } from './container-access.guard-helper'
import { canSeePrivateItem, isManagerRole, resolveIsManager, taskVisibilityFilter } from './item-visibility'

/*
 * MAY THIS PERSON OPEN THIS PROJECT, THIS TASK — for a service whose route
 * cannot use `ResourceMemberGuard`: that guard takes the FIRST id a route
 * carries, and a route under `workspaces/:workspaceId/...` hands it the
 * workspace, so it checks membership and nothing about the project or task
 * the route is really about. `custom-fields` is such a module, and a member
 * refused a private space read, overwrote, defined, renamed and deleted its
 * fields (`found-24-sep/custom-fields-open-to-any-member`).
 *
 * The rule is the guard's own, row for row: workspace membership, the
 * container rule (`checkContainerAccess`), and for a task the private-list and
 * private-task rules (`canSeePrivateItem`). The project or task must also be
 * in the workspace the route names. Each answers null when the person may not
 * open it, which the caller turns into the not-found a foreign id gets.
 *
 * `actor.role` is the account-wide role: a super_admin passes, as in every guard.
 */
export type ReadActor = { id: string; role?: string | null }

async function workspaceRole(db: Db, workspaceId: string, userId: string): Promise<string | null> {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return (m?.role as string | undefined) ?? null
}

/** The project's id and creator when `actor` may open it in `workspaceId`, else null. */
export async function readableProject(
  db: Db,
  workspaceId: string,
  projectId: string,
  actor: ReadActor,
): Promise<{ id: string; spaceId: string; createdById: string | null } | null> {
  const [row] = await db
    .select({
      id: projects.id,
      createdById: projects.createdById,
      spaceId: spaces.id,
      spaceVisibility: spaces.visibility,
      projectVisibility: projects.visibility,
    })
    .from(projects)
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId)))
    .limit(1)
  if (!row) return null
  if (actor.role === 'super_admin') return { id: row.id, spaceId: row.spaceId, createdById: row.createdById }
  const role = await workspaceRole(db, workspaceId, actor.id)
  if (!role) return null
  const ok = await checkContainerAccess(
    db,
    { spaceId: row.spaceId, spaceVisibility: row.spaceVisibility, projectId: row.id, projectVisibility: row.projectVisibility },
    { userId: actor.id, workspaceRole: role },
  )
  return ok ? { id: row.id, spaceId: row.spaceId, createdById: row.createdById } : null
}

/** The task's list and project when `actor` may open it in `workspaceId`, else null. */
export async function readableTask(
  db: Db,
  workspaceId: string,
  taskId: string,
  actor: ReadActor,
): Promise<{ taskId: string; listId: string; projectId: string } | null> {
  const [row] = await db
    .select({
      taskId: tasks.id,
      listId: tasks.listId,
      taskVisibility: tasks.visibility,
      taskCreatedById: tasks.createdById,
      listVisibility: lists.visibility,
      listCreatedById: lists.createdById,
      projectId: projects.id,
      projectVisibility: projects.visibility,
      spaceId: spaces.id,
      spaceVisibility: spaces.visibility,
    })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
    .limit(1)
  if (!row) return null
  const found = { taskId: row.taskId, listId: row.listId, projectId: row.projectId }
  if (actor.role === 'super_admin') return found
  const role = await workspaceRole(db, workspaceId, actor.id)
  if (!role) return null
  const inContainer = await checkContainerAccess(
    db,
    { spaceId: row.spaceId, spaceVisibility: row.spaceVisibility, projectId: row.projectId, projectVisibility: row.projectVisibility },
    { userId: actor.id, workspaceRole: role },
  )
  if (!inContainer) return null
  const isManager = isManagerRole(role)
  if (!canSeePrivateItem({ visibility: row.listVisibility, createdById: row.listCreatedById }, { userId: actor.id, isManager })) return null
  if (row.taskVisibility === 'private' && !isManager && row.taskCreatedById !== actor.id) {
    const [assigned] = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, actor.id)))
      .limit(1)
    if (!canSeePrivateItem(
      { visibility: row.taskVisibility, createdById: row.taskCreatedById },
      { userId: actor.id, isManager, isAssignee: !!assigned },
    )) return null
  }
  return found
}

/**
 * Of these task ids, the ones in `workspaceId` that this person may open — the
 * container rule and the private-item rule in one query, for a caller holding
 * many ids at once (a planner grid, a list of blockers, a notice's recipients).
 */
export async function readableTaskIds(
  db: Db,
  workspaceId: string,
  userId: string,
  taskIds: string[],
  role?: string | null,
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set()
  const isManager = await resolveIsManager(db, workspaceId, userId, role)
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(
      and(
        inArray(tasks.id, [...new Set(taskIds)]),
        eq(spaces.workspaceId, workspaceId),
        containerVisibilityFilter(db, userId, isManager),
        taskVisibilityFilter(db, userId, isManager),
      ),
    )
  return new Set(rows.map((r) => r.id))
}
