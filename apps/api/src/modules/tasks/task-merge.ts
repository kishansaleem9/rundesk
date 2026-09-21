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
 * subtasks, assignees, watchers, time entries, dependencies, labels, custom
 * field values, linked docs, external links, sprint membership, reminders and
 * planner blocks.
 *
 * LEFT ON THE SOURCE, because it is a record of what happened TO the source and
 * moving it would rewrite history: its activity log, its description history,
 * and its provenance rows (the email that created it, the form that submitted
 * it, the calendar event it came from). Those stay readable on the binned task.
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
  parentTaskId: string | null
  description: string | null
  isArchived: boolean | null
}

export type MergeRefusal =
  | 'same-task'
  | 'source-missing'
  | 'target-missing'
  | 'source-is-descendant'
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
 * `targetChildIds` is the ids of the TARGET's subtasks, needed for the cycle
 * test: merging a task into its own subtask would make it the child of its own
 * child.
 */
export function mergeRefusal(
  source: MergeSubject | null,
  target: MergeSubject | null,
  sourceHasSubtasks: boolean,
  targetChildIds: ReadonlySet<string>,
): MergeRefusal | null {
  if (!source) return 'source-missing'
  if (!target) return 'target-missing'
  if (source.id === target.id) return 'same-task'
  if (source.isArchived) return 'already-binned'
  /*
   * MERGING A SUBTASK INTO ITS OWN PARENT.
   *
   * `targetChildIds` is the TARGET's children, so this fires when the SOURCE is
   * one of them — the source is the descendant, not the target.
   *
   * It was called `target-is-descendant` and its comment read "merging into
   * your own subtask: the survivor would be a child of the task being binned,
   * and the parent chain would point into the bin." That is the opposite
   * relationship, and the message a person got said so: merging a subtask into
   * its parent answered *"A task cannot be merged into its own subtask"*.
   * Probed against a live API on 21 September:
   *
   *   subtask → parent   400  "A task cannot be merged into its own subtask"
   *   parent  → subtask  400  "…Subtasks only nest one level deep."
   *
   * So the case the comment described is caught by `would-nest-twice` below —
   * always, because a target that is the source's child means the source has a
   * subtask and the target has a parent — and this rule has only ever caught
   * the other direction while describing this one. The unit test agreed with
   * it, under a title naming the case it does not test.
   *
   * Found by a break patch deleting this line and the suite staying green:
   * `would-nest-twice` was quietly covering for it, and the e2e check asserted
   * a 4xx without reading the sentence.
   *
   * THE BEHAVIOUR IS UNCHANGED AND THE WORDS NOW MATCH IT. Whether a subtask
   * SHOULD be refused a merge into its parent is a product question nobody has
   * asked: nothing points into the bin when it happens, so the stated reason
   * never applied to it. Recorded as a decision not taken rather than settled
   * quietly here.
   */
  if (targetChildIds.has(source.id)) return 'source-is-descendant'
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
  'source-is-descendant': 'A subtask cannot be merged into its own parent',
  'would-nest-twice': 'This task has subtasks, and the task you picked is itself a subtask. Subtasks only nest one level deep.',
  'already-binned': 'A task in the bin cannot be merged',
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
