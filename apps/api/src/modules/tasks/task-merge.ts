/**
 * §V2-08 — "Merge", frame `15:32`.
 *
 * She never narrates it. It is in the menu at `15:32` and she moves on, so it
 * is the largest job in this item and the least asked for. That ordering is
 * recorded in the audit rather than guessed at.
 *
 * WHAT MERGING HAS TO GUARANTEE, and it is one thing: NOTHING IS LOST
 * SILENTLY. Two people file the same bug, somebody merges the duplicates, and
 * the comment that actually explained the reproduction was on the one that
 * disappeared. That is the failure this whole file is arranged around — which
 * is why the plan below is explicit about every table that points at a task,
 * including the ones deliberately left behind, and why the merge reports what
 * it moved rather than returning `{ ok: true }`.
 *
 * WHICH WAY ROUND. The task you are looking at is merged INTO the one you pick:
 * "merge this into that". The one you picked survives and keeps its own title,
 * status and dates; the one you were looking at goes to the bin.
 *
 * THE SOURCE IS BINNED, NOT DELETED. Deleting is the one operation nobody can
 * undo, and a merge is exactly when somebody discovers they picked the wrong
 * direction. `is_archived` is the product's existing reversible delete, and it
 * keeps links to the old task resolving instead of 404ing.
 */

/**
 * What moves, and what stays.
 *
 * MOVED, because it is work: comments and their attachments, checklists,
 * subtasks, assignees, watchers, time entries, dependencies, labels, linked
 * docs, external links, sprint membership, reminders and planner blocks. And
 * custom field values, of the fields both tasks have — the source's where it
 * is now, and the survivor's (`fieldIsOnTask`) — where the survivor holds no
 * value of its own (`TasksService.moveFieldValues`), or only an emptied one,
 * which takes the source's value in its place (`TasksService.fillEmptiedValue`).
 *
 * LEFT ON THE SOURCE, because it is a record of what happened TO the source and
 * moving it would rewrite history: its activity log, its description history,
 * and its provenance rows (the email that created it, the form that submitted
 * it, the calendar event it came from). Those stay readable on the binned task.
 *
 * And three kinds of custom field value, which stay as they were: the value
 * of a field the survivor lacks, which the binned task still shows; a value
 * the source itself no longer showed; and one where the survivor holds its own
 * that holds something (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
 * A survivor's emptied value — cleared, an empty text or list — holds nothing,
 * and the source's takes its place (`holdsNoInformation`). ClickUp asks before
 * such a merge whether to add the field to the survivor (help centre, "Merge
 * tasks"); whether this one should is the owner's to decide.
 */
export const MERGE_MOVES = [
  'comments',
  'attachments',
  'checklists',
  'subtasks',
  'assignees',
  'watchers',
  'timeEntries',
  'dependencies',
  'labels',
  'customFields',
  'docLinks',
  'externalLinks',
  'sprints',
  'reminders',
  'timeBlocks',
] as const

export type MergeMoved = Record<(typeof MERGE_MOVES)[number], number>

export function emptyMergeTally(): MergeMoved {
  return Object.fromEntries(MERGE_MOVES.map((k) => [k, 0])) as MergeMoved
}

export type MergeSubject = {
  id: string
  listId: string
  /** The workspace the task is in, by its list's project's space. */
  workspaceId: string
  parentTaskId: string | null
  description: string | null
  isArchived: boolean | null
}

export type MergeRefusal =
  | 'same-task'
  | 'source-missing'
  | 'target-missing'
  | 'other-workspace'
  | 'would-nest-twice'
  | 'already-binned'

/**
 * Whether this merge may go ahead, and if not, which rule stops it.
 *
 * Pure, and separate from the writing, because these are the cases that are
 * easy to get wrong and expensive to discover in production — a merge that
 * creates a cycle leaves two tasks each claiming to be the other's parent, and
 * nothing in the product reads that gracefully.
 *
 * Merging a task into its own subtask is refused by the nesting rule below:
 * such a target always has a parent, and the source always has a subtask.
 */
export function mergeRefusal(
  source: MergeSubject | null,
  target: MergeSubject | null,
  sourceHasSubtasks: boolean,
): MergeRefusal | null {
  if (!source) return 'source-missing'
  if (!target) return 'target-missing'
  /*
   * ONE WORKSPACE. Nothing asked it: someone who may write in two workspaces
   * merged a task of one into a task of the other (201), and its comment then
   * sat in the other workspace (read by SQL, lane 7,
   * `found-6-oct/merge-moves-work-across-workspaces`) — across organisations,
   * one's comments, files and time moved into another's. ClickUp: "Workspaces
   * are independent, so it's not possible to transfer information between
   * separate ones" (help centre, "Create a new Workspace", read through search
   * excerpts). Asked before anything else of the target.
   *
   * REFUSED WITH ITS REASON (400, as this rule's other refusals are), in the
   * words a list or a project moved to another workspace is refused in ("A
   * list can only be moved within its own workspace"). It was first answered
   * as a target that is not there (404 "The task to merge into was not
   * found"), to a caller who could open that task (200), and to one whose own
   * task was the target; a refusal says why it is one, and "not found" is for
   * an id naming nothing (the owner's decision of 1 October).
   */
  if (source.workspaceId !== target.workspaceId) return 'other-workspace'
  if (source.id === target.id) return 'same-task'
  if (source.isArchived) return 'already-binned'
  /*
   * A SUBTASK MERGED INTO ITS OWN PARENT IS ALLOWED (`commit-log/log-b7ee313-1`).
   *
   * It was refused as "a decision not taken": the rule's first comment gave a
   * reason that described the opposite merge, and nothing points into the bin
   * when a subtask is merged into its parent — its comments, files and the rest
   * land on the parent, and the binned subtask was the parent's child anyway.
   * ClickUp merges subtasks into another task from the parent's own subtask
   * toolbar (help centre, "Manage subtasks in a task window using the Bulk
   * Action Toolbar" and "Work with subtasks from tasks", through search
   * summaries) and names no exception for the parent. So neither does this.
   */
  /*
   * Subtasks nest one level only — the rule `updateTask` already enforces. If
   * the source has children and the target is itself a subtask, moving those
   * children under the target would make grandchildren. Refused rather than
   * silently flattened, because flattening loses the grouping somebody built.
   */
  if (sourceHasSubtasks && target.parentTaskId) return 'would-nest-twice'
  return null
}

/** The sentence a person reads when a merge is refused. */
export const MERGE_REFUSAL_MESSAGE: Record<MergeRefusal, string> = {
  'same-task': 'A task cannot be merged into itself',
  'source-missing': 'Task not found',
  'target-missing': 'The task to merge into was not found',
  'other-workspace': 'A task can only be merged into a task of its own workspace',
  'would-nest-twice': 'This task has subtasks, and the task you picked is itself a subtask. Subtasks only nest one level deep.',
  'already-binned': 'A task in the bin cannot be merged',
}

/**
 * Whether a custom-field value holds nothing: cleared (null), an empty text, or
 * an empty list (Labels, People, Files, Tasks, votes). ClickUp's merge adds the
 * merged task's value "only … if task B doesn't have any information in the
 * same Custom Field" (help centre, "Merge tasks", read through search
 * excerpts); a survivor's emptied value was kept as if it were information, and
 * the merged task's value stayed in the bin (lane 7,
 * `found-6-oct/merge-drops-a-value-beside-an-emptied-one`).
 */
export function holdsNoInformation(value: { v?: unknown } | null | undefined): boolean {
  const v = value?.v
  return v == null || v === '' || (Array.isArray(v) && v.length === 0)
}

/**
 * The description the surviving task ends up with.
 *
 * APPENDED, NOT DISCARDED, and not overwritten either. The target's own
 * description is what somebody wrote about the work that continues, so it comes
 * first; the source's is evidence that would otherwise be readable only in the
 * bin. Separated by a rule and a heading so nobody later mistakes the two
 * halves for one person's text.
 *
 * Returns null when there is nothing to add, so the caller can skip the write
 * entirely rather than touching the description — and therefore not create a
 * description-history entry for a merge that changed nothing.
 */
export function mergedDescription(
  targetDescription: string | null,
  sourceDescription: string | null,
  sourceTitle: string,
): string | null {
  const incoming = (sourceDescription ?? '').trim()
  if (!incoming) return null
  const existing = (targetDescription ?? '').trim()
  const banner = `--- merged from "${sourceTitle}" ---`
  return existing ? `${existing}\n\n${banner}\n${incoming}` : `${banner}\n${incoming}`
}
