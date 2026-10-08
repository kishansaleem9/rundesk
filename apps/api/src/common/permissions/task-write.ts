import { isManagerRole } from './workspace-roles'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaces, taskAssignees, tasks, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { READ_REFUSALS, readableTask, taskReadAnswer } from './read-access'
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
  opts: { allowArchived?: boolean; level?: 'comment' | 'edit' | 'full' | 'subtask' } = {},
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
  /*
   * REFUSED IN THE READ'S WORDS (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
   * A task its caller may not open answered its read 403 with the reason and its
   * change or move 404 — "Workspace not found" to somebody of another
   * workspace, "Task not found" to a member refused it — as an id naming
   * nothing does. The owner's rule of 1 October answers a refusal 403 with its
   * reason and an id naming nothing 404, and a write is refused as its read is:
   * the same sentence (`READ_REFUSALS`), and the same 404 for no task at all.
   * A platform super_admin who is no member is refused here too, as they are
   * refused making a task where they are no member (`assertCanCreateTaskIn`).
   */
  if (!membership) throw new ForbiddenException(READ_REFUSALS.notMember)

  if (isManagerRole(membership.role)) return ctx
  /*
   * A GUEST CHANGES WHAT IS SHARED WITH THEM, AT ITS LEVEL — by the same rule,
   * not a refusal of their own (`found-25-sep/guests-edit-no-shared-task`).
   * Every guest was refused here before any share was read, so a task or list
   * shared with one to edit was read-only to them, while the create and comment
   * gates read the same shares. ClickUp gives a guest the level of the share:
   * Edit changes a task, Comment comments and completes one assigned to them,
   * View nothing. The read rule below keeps a guest to what is shared with them
   * (not found otherwise), and `resolveSpaceLevel` reads their shares.
   */

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
   *
   * ASKED WITH THE ACCOUNT'S ROLE, as the read rule's every caller asks it
   * (`readableTask`: "`actor.role` is the account-wide role") — the guard,
   * `GET /tasks/:id` and the create gate. It was handed the WORKSPACE role,
   * which is never "super_admin", so a super_admin who is a plain member made a
   * task in a private space's list (201), opened it (200) and commented on it
   * (201), and every change of it answered 404 "Task not found"
   * (`found-5-oct/super-admin-cannot-write-a-task-it-reads`). The space's level
   * below is asked of them as of any member, as the create gate asks it.
   */
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
  const read = await taskReadAnswer(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role })
  if (!read) throw new NotFoundException('Task not found')
  if ('refused' in read) throw new ForbiddenException(read.refused)
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
  wanted: 'comment' | 'edit' | 'full' | 'subtask',
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
  /*
   * AND SO IS ADDING A SUBTASK, as ClickUp's Edit "cannot create … subtasks"
   * and Full edit "creates tasks and subtasks" — said as what it is: a member
   * at Edit adding a subtask was refused "…which does not allow deleting its
   * tasks" (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
   */
  if (wanted === 'subtask') {
    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'adding subtasks to its' })
    return
  }
  if (wanted === 'comment' && isAssignee && spaceLevelReaches(resolved.level, 'comment')) return
  await assertSpaceLevel(db, { spaceId, actorId, required: 'edit', kind: 'tasks', within })
}

/**
 * MAY THIS PERSON COMMENT ON THIS TASK — for a path with no route guard in
 * front of it: a comment sent by mail (`found-25-sep/inbound-email-comments-skip-the-comment-rule`).
 * The app's comment route has the guard's read rule and then the service's
 * (`TasksService.assertMayComment`): not in the bin, and the comment level
 * along the task's chain. Mail asked none of them — a view-only member, a
 * guest with nothing shared, and a stranger (put down as a member of the
 * workspace) each commented by mail. This asks all three, and answers rather
 * than throws: the mail path records a refusal, it has nobody to answer 403.
 *
 * The chain — task, list, project, folder — is the one `assertTaskWritable`
 * and the service's comment rule walk.
 */
export async function taskCommentAllowed(db: Db, taskId: string, actorId: string): Promise<boolean> {
  const [ctx] = await db
    .select({
      isArchived: tasks.isArchived,
      listId: tasks.listId,
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
  if (!ctx || ctx.isArchived) return false
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, actorId)))
    .limit(1)
  if (!membership) return false
  // With the account's role, as the write rule asks it (`assertTaskWritable`): a
  // super_admin who is a plain member commented on a private space's task in the
  // app (201) and was refused the same comment by mail, `rejected_not_allowed`
  // (`found-6-oct/mail-comments-read-the-workspace-role`).
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: account?.role }))) return false
  const resolved = await resolveSpaceLevel(db, {
    spaceId: ctx.spaceId,
    actorId,
    within: [
      { type: 'task', id: taskId },
      { type: 'list', id: ctx.listId },
      { type: 'project', id: ctx.projectId },
      ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),
    ],
  })
  return !resolved || spaceLevelReaches(resolved.level, 'comment')
}

/**
 * THE COMMENT RULE, ANSWERED IN ITS WORDS — what `TasksService.assertMayComment`
 * asks behind the comment route's read rule: not in the bin, and the comment
 * level along the task's chain. For a service outside the tasks module that
 * reports a refusal rather than answering one: the ClickUp enrichment, which
 * imports a task's comments from the ClickUp API
 * (`clickup-import/import-access.ts`, `enrichmentRefusals`), and asks the read
 * rule first itself. `taskCommentAllowed`, above, asks the same of mail as a
 * yes or a no, the read rule with it.
 */
export async function assertTaskCommentable(db: Db, taskId: string, actorId: string): Promise<void> {
  const [ctx] = await db
    .select({
      isArchived: tasks.isArchived,
      listId: tasks.listId,
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
  assertTaskNotInBin(ctx.isArchived)
  await assertSpaceLevel(db, {
    spaceId: ctx.spaceId,
    actorId,
    required: 'comment',
    kind: 'comments',
    within: [
      { type: 'task', id: taskId },
      { type: 'list', id: ctx.listId },
      { type: 'project', id: ctx.projectId },
      ...(ctx.folderId ? [{ type: 'folder' as const, id: ctx.folderId }] : []),
    ],
  })
}
