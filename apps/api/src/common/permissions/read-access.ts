import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { goals, lists, projects, spaces, taskAssignees, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { isUuid } from '../validation/uuid'
import { checkContainerAccess, containerVisibilityFilter, spaceVisibilityFilter } from './container-access.guard-helper'
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

/**
 * The list, with the caller's role in its workspace, when `actor` may open it
 * in `workspaceId`, else null: membership, the container rule, and the
 * private-list rule — what `ResourceMemberGuard` asks of a list, for a route
 * that names its list in the body, where the guard never looks (a meeting's
 * action items, `found-24-sep/meeting-action-items-into-any-list`).
 */
export async function readableList(
  db: Db,
  workspaceId: string,
  listId: string,
  actor: ReadActor,
): Promise<{ listId: string; spaceId: string; role: string } | null> {
  if (!isUuid(listId)) return null
  const [row] = await db
    .select({
      listId: lists.id,
      listVisibility: lists.visibility,
      listCreatedById: lists.createdById,
      projectId: projects.id,
      projectVisibility: projects.visibility,
      spaceId: spaces.id,
      spaceVisibility: spaces.visibility,
    })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(and(eq(lists.id, listId), eq(spaces.workspaceId, workspaceId)))
    .limit(1)
  if (!row) return null
  if (actor.role === 'super_admin') return { listId: row.listId, spaceId: row.spaceId, role: 'super_admin' }
  const role = await workspaceRole(db, workspaceId, actor.id)
  if (!role) return null
  const inContainer = await checkContainerAccess(
    db,
    { spaceId: row.spaceId, spaceVisibility: row.spaceVisibility, projectId: row.projectId, projectVisibility: row.projectVisibility },
    { userId: actor.id, workspaceRole: role },
  )
  if (!inContainer) return null
  if (!canSeePrivateItem({ visibility: row.listVisibility, createdById: row.listCreatedById }, { userId: actor.id, isManager: isManagerRole(role) })) return null
  return { listId: row.listId, spaceId: row.spaceId, role }
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

/*
 * A GOAL IS READ BY THE RULE OF THE SPACE IT IS FILED IN, and by every member
 * of its workspace when it is filed in none. That is ClickUp's rule: goals are
 * public to the workspace unless their location is private, and a private
 * location is its members'. A guest reads none — in ClickUp a guest sees only
 * the goals shared with them, and goals are not shared here.
 *
 * Nothing applied it: every member read, edited and deleted the goals of a
 * private space, a guest did too, and a user of another organisation edited and
 * deleted any workspace's key results through a goal of their own
 * (`found-24-sep/goals-open-across-workspaces`).
 */

/** How `actor` reads the goals of `workspaceId`: all of them, by the space rule, or none (a stranger, a guest). */
export async function goalReach(db: Db, workspaceId: string, actor: ReadActor): Promise<'all' | 'spaces' | 'none'> {
  if (actor.role === 'super_admin') return 'all'
  const role = await workspaceRole(db, workspaceId, actor.id)
  if (!role || role === 'guest') return 'none'
  return isManagerRole(role) ? 'all' : 'spaces'
}

/** Whether `actor` may read a goal filed at `at` — its workspace, and its space if it has one. */
export async function mayReadGoalAt(
  db: Db,
  at: { workspaceId: string; spaceId: string | null; spaceVisibility: string | null },
  actor: ReadActor,
): Promise<boolean> {
  const reach = await goalReach(db, at.workspaceId, actor)
  if (reach === 'none') return false
  if (reach === 'all' || !at.spaceId) return true
  return checkContainerAccess(db, { spaceId: at.spaceId, spaceVisibility: at.spaceVisibility }, { userId: actor.id })
}

/** The goal's workspace and space when `actor` may read it, else null. */
export async function readableGoal(
  db: Db,
  goalId: string,
  actor: ReadActor,
): Promise<{ id: string; workspaceId: string; spaceId: string | null; spaceVisibility: string | null } | null> {
  if (!isUuid(goalId)) return null
  const [row] = await db
    .select({ id: goals.id, workspaceId: goals.workspaceId, spaceId: goals.spaceId, spaceVisibility: spaces.visibility })
    .from(goals)
    .leftJoin(spaces, eq(spaces.id, goals.spaceId))
    .where(eq(goals.id, goalId))
    .limit(1)
  if (!row) return null
  return (await mayReadGoalAt(db, row, actor)) ? row : null
}

/**
 * `mayReadGoalAt` for a list, as a WHERE fragment over `goals`, for a reader
 * whose reach is `'spaces'`: goals filed in no space, and goals of the spaces
 * they may read. The same rule twice, kept side by side on purpose.
 */
export function goalVisibilityFilter(db: Db, actorId: string): SQL | undefined {
  const readableSpaces = db.select({ id: spaces.id }).from(spaces).where(spaceVisibilityFilter(db, actorId, false))
  return or(isNull(goals.spaceId), inArray(goals.spaceId, readableSpaces))
}
