import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaces, taskAssignees, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { readableTask } from './read-access'
import { assertSpaceLevel, resolveSpaceLevel, spaceLevelReaches, type WithinStep } from './space-default-permission'

/*
 * MAY THIS PERSON CHANGE THIS TASK — the write rule, stated once for every
 * service that changes one. It lived in `TasksService`, and a module that
 * `TasksService` itself depends on could not ask it: custom fields asked the
 * read rule instead, and a member in a view-only space set a task's field
 * values (`found-25-sep/field-values-written-by-readers`). As `read-access.ts`
 * states the read rule for services, this states the write rule.
 */

/**
 * A task in the bin is not an editable task.
 *
 * Found by the third video1 pass, which deleted a task and then kept writing
 * to it: `PATCH /tasks/:id` answered 200 and `POST /tasks/:id/comments`
 * answered 201, on a row that no list, no search and no deep link would show
 * you. Deleting is a soft delete — `isArchived` — and every *read* path
 * filtered on it. The write paths never did.
 *
 * The exposure was never a UI one: nothing in the app can reach a binned
 * task, so this is a stale tab, a queued request, a script, an integration
 * holding an id from before the delete. That is exactly the population that
 * cannot see the bin, which is what makes silence the wrong answer — the
 * edit appears to succeed, and then the row is purged out from under it
 * thirty days later along with whatever was written.
 *
 * 409 rather than 404: the task is really there and the caller may well be
 * entitled to it. What is wrong is its state, and "restore it first" is a
 * thing they can actually do.
 */
export function assertTaskNotInBin(isArchived: boolean | null | undefined) {
  if (isArchived) {
    throw new ConflictException('This task is in the bin. Restore it before editing.')
  }
}

export type TaskWriteContext = {
  taskId: string
  listId: string
  createdById: string | null
  isArchived: boolean | null
  workspaceId: string
  spaceId: string
  projectId: string
  folderId: string | null
}

/**
 * @param opts.allowArchived — for the two operations whose whole purpose is a
 *   task already in the bin. Everything else is refused; see assertTaskNotInBin.
 * @param opts.level — "comment" for a change of status or assignees, which an
 *   assignee may make at that level; "edit" otherwise; "full" — Full edit —
 *   to delete the task (`found-25-sep/full-edit-enforced-nowhere`).
 */
export async function assertTaskWritable(
  db: Db,
  taskId: string,
  actorId: string,
  opts: { allowArchived?: boolean; level?: 'comment' | 'edit' | 'full' } = {},
): Promise<TaskWriteContext> {
  const [ctx] = await db
    .select({
      taskId: tasks.id,
      listId: tasks.listId,
      createdById: tasks.createdById,
      isArchived: tasks.isArchived,
      workspaceId: spaces.workspaceId,
      spaceId: spaces.id,
      projectId: projects.id,
      folderId: projects.folderId,
    })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!ctx) throw new NotFoundException('Task not found')
  if (!opts.allowArchived) assertTaskNotInBin(ctx.isArchived)

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
    .limit(1)
  if (!membership) throw new NotFoundException('Workspace not found')

  if (['workspace_admin', 'manager', 'super_admin'].includes(membership.role)) return ctx
  if (membership.role === 'guest') throw new ForbiddenException('Guests cannot edit tasks')

  /*
   * THE SPACE'S LEVEL DECIDES, AS IN CLICKUP — not who made the task or is on
   * it (`found-24-sep/task-edits-narrower-than-clickup`). "Edit" there lets a
   * person change every task in the location, status, assignees, title and
   * archiving, and Full edit adds deleting (below); "comment" lets an assignee change their task's
   * status and assignees; "view" nothing. Only the creator, an assignee or a
   * manager could change a task, so a member with "edit" on a space could
   * not touch a colleague's task in it.
   *
   * READ FIRST. Being its creator or on it meant, nearly always, being able
   * to open it; without that, a task in a private list, project or folder
   * this person is not in is refused here as it is to every read — its
   * space's level is no leave to change what they cannot see.
   */
  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) {
    throw new NotFoundException('Task not found')
  }
  const [assignee] = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, actorId)))
    .limit(1)
  await assertSpaceAllowsTaskWrite(db, ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee, [
    { type: 'task', id: taskId },
    { type: 'list', id: ctx.listId },
    { type: 'project', id: ctx.projectId },
    ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),
  ])
  return ctx
}

/**
 * WHAT A SPACE LETS A MEMBER DO TO ITS TASKS — its default permission, or
 * their own grant on it, read for tasks as it is read for containers. It was
 * asked of lists, projects and folders (`assertCanManageContainer`) and, since
 * `found-24-sep/task-makers-skip-the-list-rule`, of making a task; not of
 * changing one. Measured: in a "view only" space a member changed the status
 * of their assigned task (200) (`found-24-sep/view-only-spaces-take-comments-and-edits`).
 *
 * ClickUp's levels (help.clickup.com "Permissions in detail"):
 *   - "edit" and above — whatever the item rule allows;
 *   - "comment" — on a task ASSIGNED to them, a change of status or of
 *     assignees ("comment with task assigned"); nothing else;
 *   - "view" — nothing.
 * A manager is never narrowed (`resolveSpaceLevel` answers "admin").
 */
async function assertSpaceAllowsTaskWrite(
  db: Db,
  spaceId: string,
  actorId: string,
  wanted: 'comment' | 'edit' | 'full',
  isAssignee: boolean,
  /** The task and the containers above it: a grant on any of them decides first (`WithinStep`). */
  within: WithinStep[],
) {
  const resolved = await resolveSpaceLevel(db, { spaceId, actorId, within })
  if (!resolved) return
  /*
   * DELETING IS FULL EDIT. ClickUp's Edit changes a task and archives it and
   * does not delete it; Full edit adds deleting, and the share panel says it is
   * "the only level that may delete the item". Nothing asked it, so an Edit
   * grant — a share, a space or project role — sent tasks to the Trash
   * (`found-25-sep/full-edit-enforced-nowhere`).
   */
  if (wanted === 'full') {
    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'deleting its' })
    return
  }
  if (wanted === 'comment' && isAssignee && spaceLevelReaches(resolved.level, 'comment')) return
  await assertSpaceLevel(db, { spaceId, actorId, required: 'edit', kind: 'tasks', within })
}
