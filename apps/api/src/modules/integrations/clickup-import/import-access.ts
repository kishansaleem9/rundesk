import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaces, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { taskInReachFilter } from '../../../common/permissions/container-access.guard-helper'
import { resolveIsManager, taskVisibilityFilter } from '../../../common/permissions/item-visibility'
import { readableTask } from '../../../common/permissions/read-access'
import { assertTaskCommentable, assertTaskWritable } from '../../../common/permissions/task-write'
import { dupKey } from './clickup-csv.util'

/**
 * WHO MAY IMPORT, WHICH TASKS AN IMPORT MAY MATCH, AND WHICH IT MAY MERGE
 * INTO — the rules both importers (spreadsheet and ClickUp CSV) ask of the
 * person importing, beside `assertImportTarget`, which asks where.
 */

/** Who imports: their id, and their account-wide role (a platform super admin reads everything, as in every read rule). */
export type Importer = { id: string; role?: string | null }

/**
 * A GUEST DOES NOT IMPORT, WHATEVER A CUSTOM ROLE GRANTS THEM
 * (`found-6-oct/a-guest-who-may-import-makes-a-space`).
 *
 * The routes ask `workspace.import`, and a custom role can grant it to a guest:
 * a guest so granted, whose own `POST /spaces` and `POST /projects` answered
 * 403, imported a file naming no space and left a new public space, made by
 * nobody, holding their project and tasks (measured on lane 4, both
 * importers). ClickUp: "Free Forever guests, View only guests, Permission
 * controlled guests, Limited members, and Limited members view only cannot
 * import data into a Workspace" (help centre, "Import and export feature
 * availability and limits", read through search excerpts) — custom role
 * permissions are given to members, owners and admins there.
 *
 * Refused with the reason, before anything is read or written.
 */
export const GUESTS_CANNOT_IMPORT = 'Guests cannot import data into a workspace'

export async function assertMayImport(db: Db, params: { workspaceId: string; actorId: string }): Promise<void> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, params.workspaceId), eq(workspaceMembers.userId, params.actorId)))
    .limit(1)
  if (member?.role === 'guest') throw new ForbiddenException(GUESTS_CANNOT_IMPORT)
}

/**
 * THE TASKS AN IMPORT MAY MATCH ITS ROWS TO — those its importer may open,
 * keyed as the importers key a row: `dupKey(list name, title)`.
 *
 * The index was built over every task of the workspace (or of the target
 * space), whoever asked. So both previews told any member or guest whether a
 * task with a given list and title existed in a private space or list — a
 * duplicate counted 1 where `GET` of that task answered 403
 * (`found-6-oct/import-previews-tell-what-private-places-hold`); and a merge
 * matched, and rewrote, a private list's task and a private space's task its
 * importer could not open, with or without a space named
 * (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
 *
 * Now the index holds only what the read rule lets the importer open — the
 * container rule and the private-list rule (`taskInReachFilter`), and the
 * private-task rule (`taskVisibilityFilter`) — as every list of tasks is read.
 * A row whose list and title name only a task they may not open is not a
 * duplicate of anything they can see: it is counted and imported as a new
 * task, which says nothing of the one they cannot see.
 */
export async function matchableTaskIndex(
  db: Db,
  params: { workspaceId: string; targetSpaceId?: string; importer: Importer },
): Promise<Map<string, string>> {
  const { workspaceId, targetSpaceId, importer } = params
  const isManager = await resolveIsManager(db, workspaceId, importer.id, importer.role)
  const rows = await db
    .select({ id: tasks.id, listName: lists.name, title: tasks.title })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(
      and(
        eq(spaces.workspaceId, workspaceId),
        targetSpaceId ? eq(spaces.id, targetSpaceId) : undefined,
        taskInReachFilter(db, workspaceId, importer.id, isManager),
        taskVisibilityFilter(db, importer.id, isManager),
      ),
    )
  const index = new Map<string, string>()
  for (const r of rows) {
    const key = dupKey(r.listName, r.title)
    if (!index.has(key)) index.set(key, r.id)
  }
  return index
}

/**
 * WHAT A MERGE ASKS OF THE TASK IT WRITES — the task write rule
 * (`assertTaskWritable`), at the level the routes that make the same changes
 * one by one ask: a change of status alone, or of assignees, is what a
 * "comment" location lets a task's assignee make (`PATCH /tasks/:id` with a
 * status alone, the assignee routes); any other field, a tag among them,
 * needs "edit". `fields` names what the merge writes: its columns, and
 * `assignees`, `tags` or `customFields` when it adds those.
 *
 * A merge asked nothing of the task it rewrote: a member granted
 * `workspace.import` whose `PATCH` of a view-only space's task answered 403
 * set it Done and Low by a merge (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
 * What the rule refuses is the row's answer, in the rule's words, and nothing
 * of that row is written.
 */
const COMMENT_LEVEL_FIELDS = new Set(['status', 'statusCategory', 'assignees'])

export function mergeLevel(fields: Iterable<string>): 'comment' | 'edit' {
  for (const field of fields) if (!COMMENT_LEVEL_FIELDS.has(field)) return 'edit'
  return 'comment'
}

export async function assertMayMerge(
  db: Db,
  params: { taskId: string; actorId: string; fields: Iterable<string> },
  /** The write rule — `assertTaskWritable`; a unit test answers for it, to read the level it is asked. */
  writable: typeof assertTaskWritable = assertTaskWritable,
): Promise<void> {
  await writable(db, params.taskId, params.actorId, { level: mergeLevel(params.fields) })
}

/** The columns a merge's `set` writes: a key whose value is undefined is left out of the update, so it writes nothing. */
export function writtenFields(set: Record<string, unknown>): string[] {
  return Object.keys(set).filter((key) => set[key] !== undefined)
}

/**
 * A SUBTASK LINK THE CLICKUP IMPORT MAKES, ASKED AS THE ROUTES ASK IT — for a
 * row whose Parent ID names another row of the file (`processImport`'s second
 * pass). The pass took every row it had created OR MERGED, and asked nothing:
 * a member granted workspace.import, at Comment on a space and assigned there,
 * merged a status into their task and with it put that task under a new task
 * of the import, which their `PATCH` of its parent was refused; and put a new
 * task under a task in an Edit space, which their `POST /tasks` under it was
 * refused, Full edit being asked. A task with subtasks went under another, and
 * a task under a subtask, two deep where both routes refuse it; and two rows of
 * one list and title, one naming the other its parent, made that task its own
 * parent (measured on lane 4).
 *
 * So a link asks what `PATCH /tasks/:id {parentTaskId}` and `POST /tasks
 * {parentTaskId}` ask, in their words:
 *   · of a child that was already there — merged, not made by this run — the
 *     write rule at "edit": a change of parent is not a change of status;
 *   · that a task is not its own parent, that the parent is not itself a
 *     subtask, and that the child has none: one level, as the import's own
 *     pass says and the routes keep;
 *   · of a parent that was already there, the write rule at Full edit, which
 *     the routes ask of a task given a subtask (`assertParentInWorkspace`; a
 *     subtask is part of its parent, which ClickUp's help centre puts as
 *     "Subtasks and nested subtasks inherit their primary parent task's
 *     permissions", "Create nested subtasks", read through search excerpts).
 * A task this run made is its importer's own: no level is asked of it, as the
 * links between the run's own tasks never asked one.
 */
export async function assertMayLinkSubtask(
  db: Db,
  params: { childId: string; parentId: string; actorId: string; childWasThere: boolean; parentWasThere: boolean },
  /** The write rule — `assertTaskWritable`; a unit test answers for it, to read what it is asked. */
  writable: typeof assertTaskWritable = assertTaskWritable,
): Promise<void> {
  const { childId, parentId, actorId } = params
  if (params.childWasThere) await writable(db, childId, actorId, { level: 'edit' })
  if (childId === parentId) throw new BadRequestException('A task cannot be its own parent')
  const [parent] = await db.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, parentId)).limit(1)
  if (parent?.parentTaskId) throw new BadRequestException('Subtasks can only be nested one level deep')
  const [child] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, childId)).limit(1)
  if (child) throw new BadRequestException('A task with subtasks cannot become a subtask itself')
  if (params.parentWasThere) await writable(db, parentId, actorId, { level: 'subtask' })
}

/**
 * The words an enrichment's refusal of a task its importer may not open is
 * reported in: the sentence the routes that read a task by the read rule
 * alone answer (`AiService.assertTaskReadable`).
 */
export const MAY_NOT_OPEN = 'You do not have access to this task'

/**
 * WHAT THE CLICKUP ENRICHMENT ASKS OF A TASK BEFORE IT WRITES INTO IT — the
 * comments and files it imports from the ClickUp API (`enrichTasks`), into the
 * tasks a run made or merged, or into those a mapping sent to `POST
 * import/clickup/jobs/:jobId/enrich` names.
 *
 * It asked only that each was in the workspace: a member granted
 * workspace.import named a private space's task they are refused (`GET` and
 * a comment, 403 "This space or project is private") and a view-only space's
 * task, whose comments they are refused, and the route answered 201 with both
 * enriched; given ClickUp's answer, each took a comment (measured on lane 4,
 * at the service, as ClickUp is not reached from there).
 *
 * Now each write asks what the route that makes it one at a time asks:
 *   · the task, the read rule (`readableTask`): one its importer may not open
 *     takes nothing, `MAY_NOT_OPEN`;
 *   · a comment, the comment rule — not in the bin, and the comment level
 *     along the task's chain (`assertTaskCommentable`) — as `POST
 *     /tasks/:id/comments` asks behind the read rule;
 *   · a file, the write rule at "edit" (`assertTaskWritable`), as `POST
 *     /tasks/:id/attachments` asks.
 * Each answer is null when that may be written, or the refusal in the rule's
 * words, which the enrichment reports — before it asks ClickUp for anything.
 */
export type EnrichmentRefusals = { task: string | null; comments: string | null; attachments: string | null }

export async function enrichmentRefusals(
  db: Db,
  params: { workspaceId: string; taskId: string; importer: Importer },
  /** The three rules; a unit test answers for them, to read what each is asked. */
  rules: { readable: typeof readableTask; commentable: typeof assertTaskCommentable; writable: typeof assertTaskWritable } = {
    readable: readableTask,
    commentable: assertTaskCommentable,
    writable: assertTaskWritable,
  },
): Promise<EnrichmentRefusals> {
  const { workspaceId, taskId, importer } = params
  if (!(await rules.readable(db, workspaceId, taskId, importer))) {
    return { task: MAY_NOT_OPEN, comments: MAY_NOT_OPEN, attachments: MAY_NOT_OPEN }
  }
  /** A rule's refusal, in its words; null when it lets the write through. A failure that is no refusal is thrown on. */
  const refusal = (ask: Promise<unknown>) =>
    ask.then(
      () => null,
      (e: unknown) => {
        if (e instanceof HttpException) return e.message
        throw e
      },
    )
  return {
    task: null,
    comments: await refusal(rules.commentable(db, taskId, importer.id)),
    attachments: await refusal(rules.writable(db, taskId, importer.id, { level: 'edit' })),
  }
}

/** The rules above, as the importers hold them: a field of each service, so a unit test can answer for them. */
export type ImportAccess = {
  assertMayImport: typeof assertMayImport
  matchableTaskIndex: typeof matchableTaskIndex
  assertMayMerge: typeof assertMayMerge
  assertMayLinkSubtask: typeof assertMayLinkSubtask
  enrichmentRefusals: typeof enrichmentRefusals
}

export const IMPORT_ACCESS: ImportAccess = { assertMayImport, matchableTaskIndex, assertMayMerge, assertMayLinkSubtask, enrichmentRefusals }
