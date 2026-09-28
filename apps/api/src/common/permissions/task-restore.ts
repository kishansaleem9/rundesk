import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaceMembers, spaces, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { assertTaskWritable } from './task-write'

/*
 * WHO RESTORES AN ARCHIVED TASK — the two rules `POST /tasks/:id/restore`
 * asks, stated beside the write rule so the archived-tasks listing can ask
 * them too (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
 * ClickUp: unarchiving a task needs Edit on its location.
 */

/**
 * §3.3 Delete Items — a workspace `manager` (not an admin, not a platform
 * admin) archives, deletes and restores a task only in a Space they belong to
 * (`space_members`). Everybody else is already held to the write rule, which
 * the caller runs first. It lived privately in `TasksService`, which now asks
 * it here.
 */
export async function assertManagerTaskScope(db: Db, taskId: string, actorId: string): Promise<void> {
  const [ctx] = await db
    .select({ spaceId: spaces.id, workspaceId: spaces.workspaceId })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!ctx) throw new NotFoundException('Task not found')

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
    .limit(1)
  // Only managers are further restricted here. workspace_admin / super_admin
  // keep delete-any; members/guests were already gated by the write rule.
  if (membership?.role !== 'manager') return

  const [member] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actorId)))
    .limit(1)
  if (!member) throw new ForbiddenException('Managers can only delete tasks in their own spaces')
}

/**
 * WOULD `POST /tasks/:id/restore` ACCEPT THIS TASK FROM THIS PERSON — the
 * write rule at Edit, archived tasks allowed, and a manager's own-spaces scope,
 * answered rather than thrown, so Settings → Archived offers Restore exactly
 * where it will be accepted and says "view only" elsewhere. A failure that is
 * not a refusal is not swallowed.
 */
export async function taskRestorable(db: Db, taskId: string, actorId: string): Promise<boolean> {
  try {
    await assertTaskWritable(db, taskId, actorId, { allowArchived: true })
    await assertManagerTaskScope(db, taskId, actorId)
    return true
  } catch (err) {
    if (err instanceof HttpException && (err.getStatus() === 403 || err.getStatus() === 404)) return false
    throw err
  }
}
