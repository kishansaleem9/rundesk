/**
 * THE FIELDS `PATCH /tasks/:id` MAY CHANGE — one list, read by the route AND
 * by `TasksService.updateTask`.
 *
 * WHY IT EXISTS. The route's `@Body()` is an inline TypeScript type, which is
 * erased at runtime, and both the controller and the service spread what
 * arrived: the controller built `{ ...body }` and the service wrote
 * `{ ...patch, updatedAt }` straight into the `tasks` row. So every column was
 * writable through that one JSON body — `listId`, `createdById`,
 * `completedAt`, `statusCategory`, `taskTypeId`, `recurrence`, the primary
 * key — by anybody the write check lets through, which includes any assignee.
 *
 * The worst of it, each reachable by an assignee with an ordinary token:
 *   · `listId` moved the task into a list in ANOTHER WORKSPACE — one the
 *     caller did not even belong to — skipping every check `moveTask` and the
 *     bulk path make;
 *   · `createdById` made the caller the creator, which is itself a grant of
 *     write access;
 *   · `coverStorageKey` accepted any key and `getTask` signed it: a working
 *     URL to any object in the bucket.
 *
 * `projects.service.ts` and `spaces.service.ts` had already fixed this shape
 * for their own updates, in words that describe it exactly — "any real column
 * could be mass-assigned". Tasks were the one container left spreading.
 *
 * ONE LIST, TWO READERS, ON PURPOSE. The route REFUSES an unknown field by
 * name, so a client that sends `listId` expecting a move is told to use the
 * move route instead of getting a 200 and no move. The service DROPS anything
 * else, as defence in depth for the five internal callers, which are typed. If
 * the two kept their own copies, the day somebody added a field to one of them
 * it would be accepted and silently discarded — the duplicated list this audit
 * has found six times.
 */
export const TASK_UPDATABLE_FIELDS = [
  'title',
  'description',
  'priority',
  'status',
  'startDate',
  'dueDate',
  // Whether each carries a time of day (`taskDateTimeFlags`).
  'startDateHasTime',
  'dueDateHasTime',
  'position',
  'timeEstimate',
  'coverColor',
  'coverStorageKey',
  'coverImageUrl',
  'coverOffsetY',
  'isArchived',
  'isMilestone',
  'visibility',
  'parentTaskId',
] as const

export type TaskUpdatableField = (typeof TASK_UPDATABLE_FIELDS)[number]

const UPDATABLE = new Set<string>(TASK_UPDATABLE_FIELDS)

/** The keys of `body` this route will not change, in the order they arrived. */
export function unknownUpdateFields(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  return Object.keys(body).filter((key) => !UPDATABLE.has(key))
}

/** A copy of `patch` holding only fields the update may write. */
export function pickUpdatable<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (UPDATABLE.has(key as string)) out[key] = patch[key]
  }
  return out
}
