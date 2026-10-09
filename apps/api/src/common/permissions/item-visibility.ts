import { WS_MANAGER_ROLES, isManagerRole } from './workspace-roles'
import { and, or, eq, ne, inArray, isNull, isNotNull, notInArray, type SQL } from 'drizzle-orm'
import { tasks, lists, folders, taskAssignees, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { guestTaskFilter } from './guest-reach'

/**
 * Per-item privacy (§2) for tasks / lists / folders. A row whose `visibility`
 * is 'private' is only visible to:
 *   - workspace managers / admins / super_admins (they see everything), and
 *   - the row's creator (createdById), and
 *   - for TASKS additionally: any of its assignees.
 * Public rows (the default) are always visible.
 *
 * This lives on top of the space/project container privacy — a private
 * space/project already hides everything nested inside it; these filters add a
 * finer, per-item restriction WITHIN a container the caller can otherwise see.
 *
 * Every collection read that returns tasks/lists/folders to a user must AND the
 * relevant filter into its WHERE clause, or a private item leaks. Single-item
 * (by-id) reads are gated by ResourceMemberGuard, which enforces the same rule.
 */

// The list lives in `workspace-roles.ts`, once; re-exported for the modules
// that have always imported it from here.
export { WS_MANAGER_ROLES, isManagerRole }

/**
 * Resolve whether an actor sees everything in a workspace (super_admin, or a
 * workspace_admin/manager member). Self-contained so read paths compute it
 * themselves rather than trusting a caller to pass the right flag.
 */
export async function resolveIsManager(
  db: Db,
  workspaceId: string,
  userId: string,
  globalRole?: string | null,
): Promise<boolean> {
  if (globalRole === 'super_admin') return true
  const [wm] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return isManagerRole(wm?.role)
}

/**
 * WHERE fragment keeping only tasks the actor may see. Returns `undefined` for
 * managers (no restriction) so callers can `and(...conds, taskVisibilityFilter())`
 * — drizzle's `and` ignores undefined. Uses a drizzle subquery (not raw SQL) so
 * `tasks.id` binds correctly in both the query builder and the relational query
 * API (which aliases the table).
 */
export function taskVisibilityFilter(db: Db, actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return notInOthersPersonalList(db, actorId)
  return and(
    notInOthersPersonalList(db, actorId),
    or(
      ne(tasks.visibility, 'private'),
      eq(tasks.createdById, actorId),
      inArray(
        tasks.id,
        db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, actorId)),
      ),
    ),
    // A guest reads only the tasks in their reach (`guest-reach.ts`): a list of
    // tasks, any list, is filtered to them wherever this rule is asked.
    guestTaskFilter(db, actorId),
  )
}

/**
 * A PERSONAL LIST IS ITS OWNER'S ALONE (`found-24-sep/planner-default-list-read-by-nothing`):
 * ClickUp's is private to the person and hidden from "other Workspace members",
 * so it is passed over by every read of anybody else — a manager's too, who
 * otherwise sees every private list. In the filters below as in
 * `canSeePrivateItem`, so no read that asks one of them can show it.
 */
export const personalListOpenTo = (actorId: string): SQL => or(isNull(lists.personalOf), eq(lists.personalOf, actorId)) as SQL

/** Tasks in somebody else's Personal List, kept out: a subquery, as `tasks` may be aliased. */
function notInOthersPersonalList(db: Db, actorId: string): SQL {
  return notInArray(
    tasks.listId,
    db.select({ id: lists.id }).from(lists).where(and(isNotNull(lists.personalOf), ne(lists.personalOf, actorId))),
  )
}

/** WHERE fragment keeping only lists the actor may see (unaliased `lists`). */
export function listVisibilityFilter(actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return personalListOpenTo(actorId)
  return and(or(ne(lists.visibility, 'private'), eq(lists.createdById, actorId)), personalListOpenTo(actorId))
}

/** WHERE fragment keeping only folders the actor may see (unaliased `folders`). */
export function folderVisibilityFilter(actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return undefined
  return or(ne(folders.visibility, 'private'), eq(folders.createdById, actorId))
}

/**
 * In-memory equivalent of the filters above, for guards / single rows already
 * fetched. `isAssignee` only matters for tasks.
 */
export function canSeePrivateItem(
  item: { visibility?: string | null; createdById?: string | null; personalOf?: string | null },
  actor: { userId: string; isManager: boolean; isAssignee?: boolean },
): boolean {
  // Somebody's Personal List: theirs, and nobody else's, managers included.
  if (item.personalOf) return item.personalOf === actor.userId
  if (item.visibility !== 'private') return true
  if (actor.isManager) return true
  if (item.createdById && item.createdById === actor.userId) return true
  return !!actor.isAssignee
}
