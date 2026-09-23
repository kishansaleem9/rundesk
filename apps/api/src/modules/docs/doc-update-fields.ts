/**
 * THE FIELDS `PATCH /docs/:id` MAY CHANGE — one list, read by the route AND by
 * `DocsService.update`. The same repair `task-update-fields.ts` made for tasks,
 * for the same defect.
 *
 * The route's `@Body()` is an inline TypeScript type, erased at runtime, and
 * the service wrote `{ ...patch, updatedAt }` into the `docs` row. So every
 * column was writable by any member of the doc's workspace. Proven on lane 1
 * on 23 September, as a member of two workspaces:
 *
 *   · `workspaceId` MOVED the doc into the other workspace;
 *   · `publicShareId` minted an anonymous link that answered 200, in a
 *     workspace whose `blockPublicSharing` refuses exactly that on the share
 *     route;
 *   · `createdById` rewrote who made it.
 *
 * `expectedUpdatedAt` is not a column. It is the caller's claim about the
 * version they edited, which the update compares and never writes, so the
 * route accepts it and the service drops it.
 */
export const DOC_UPDATABLE_FIELDS = [
  'title',
  'icon',
  'coverImageUrl',
  'content',
  'parentDocId',
  'spaceId',
  'position',
  'isArchived',
] as const

const UPDATABLE = new Set<string>(DOC_UPDATABLE_FIELDS)
const CONTROLS = new Set<string>(['expectedUpdatedAt'])

/** The keys of `body` this route will not change, in the order they arrived. */
export function unknownDocUpdateFields(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  return Object.keys(body).filter((key) => !UPDATABLE.has(key) && !CONTROLS.has(key))
}

/** A copy of `patch` holding only the columns the update may write. */
export function pickDocUpdatable<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (UPDATABLE.has(key as string)) out[key] = patch[key]
  }
  return out
}
