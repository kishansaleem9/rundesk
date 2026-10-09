import { canSeePrivateItem, isManagerRole } from '../../common/permissions/item-visibility'

/**
 * §V2-05 — "Does not have access to task".
 *
 * Frame `04:00`: the @ picker lists a person greyed out with that warning
 * beside them. It is a small label carrying a large promise — that the product
 * knows, before you send it, that this person will not be able to open what you
 * are pointing them at. A mention that notifies somebody about a task they then
 * cannot see is worse than no mention: they get an alert, follow it, and are
 * told they are not allowed.
 *
 * SO THIS MUST AGREE WITH THE GUARD, EXACTLY. `ResourceMemberGuard` is what
 * actually decides whether a person can open a task, in four steps: workspace
 * membership, container privacy, the list's per-item privacy, the task's. This
 * function is the same four steps evaluated for somebody OTHER than the caller,
 * which the guard cannot do because it only ever asks about the request's own
 * user.
 *
 * It is pure, and it takes the membership as sets rather than querying, for two
 * reasons. The first is cost: asking the database once per candidate turns a
 * picker into fifty round trips. The second is that a pure rule can be tested
 * against the guard's own helpers — `canSeePrivateItem` is imported here rather
 * than restated, so the two cannot drift on the half that is shared, and the
 * half that is not (container privacy) is checked end-to-end in
 * `test/e2e/comment-recording.mjs` by comparing this answer against what the
 * guard actually does when that person opens the task.
 */

export type TaskAccessContext = {
  spaceVisibility: string | null
  projectId: string | null
  projectVisibility: string | null
  listVisibility: string | null
  listCreatedById: string | null
  /** Whose Personal List the task is in, if any: theirs alone, a manager's reach included. */
  listPersonalOf?: string | null
  taskVisibility: string | null
  taskCreatedById: string | null
  /** Members of the task's space, when that space is private. */
  spaceMemberIds: ReadonlySet<string>
  /** Space members whose space role is `admin` — they reach private projects. */
  spaceAdminIds: ReadonlySet<string>
  /** Members of the task's project, when that project is private. */
  projectMemberIds: ReadonlySet<string>
  /** Assignees of the task — they see it even when it is private. */
  assigneeIds: ReadonlySet<string>
}

export type Candidate = {
  userId: string
  /** Their role in the workspace. A manager or admin sees everything. */
  workspaceRole: string | null
}

export function canReachTask(ctx: TaskAccessContext, actor: Candidate): boolean {
  // 0. Somebody's Personal List is theirs alone, before anybody's role is asked (`canSeePrivateItem`).
  if (ctx.listPersonalOf) return ctx.listPersonalOf === actor.userId
  // 1. Managers and admins see everything in the workspace, container privacy
  //    included — the first line of `checkContainerAccess`.
  if (isManagerRole(actor.workspaceRole)) return true

  // 2. Container privacy, mirroring `checkContainerAccess`. A private space is
  //    a wall: not being in it ends the question.
  if (ctx.spaceVisibility === 'private' && !ctx.spaceMemberIds.has(actor.userId)) return false
  if (ctx.projectVisibility === 'private' && ctx.projectId) {
    const inProject = ctx.projectMemberIds.has(actor.userId)
    // An admin of the owning space reaches that space's private projects.
    if (!inProject && !ctx.spaceAdminIds.has(actor.userId)) return false
  }

  // 3 & 4. Per-item privacy, using the guard's own predicate rather than a copy
  //        of it.
  if (!canSeePrivateItem(
    { visibility: ctx.listVisibility, createdById: ctx.listCreatedById },
    { userId: actor.userId, isManager: false },
  )) return false

  return canSeePrivateItem(
    { visibility: ctx.taskVisibility, createdById: ctx.taskCreatedById },
    { userId: actor.userId, isManager: false, isAssignee: ctx.assigneeIds.has(actor.userId) },
  )
}
