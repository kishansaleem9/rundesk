"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WS_MANAGER_ROLES = void 0;
exports.isManagerRole = isManagerRole;
exports.resolveIsManager = resolveIsManager;
exports.taskVisibilityFilter = taskVisibilityFilter;
exports.listVisibilityFilter = listVisibilityFilter;
exports.folderVisibilityFilter = folderVisibilityFilter;
exports.canSeePrivateItem = canSeePrivateItem;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
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
exports.WS_MANAGER_ROLES = ['workspace_admin', 'manager', 'super_admin'];
function isManagerRole(role) {
    return !!role && exports.WS_MANAGER_ROLES.includes(role);
}
/**
 * Resolve whether an actor sees everything in a workspace (super_admin, or a
 * workspace_admin/manager member). Self-contained so read paths compute it
 * themselves rather than trusting a caller to pass the right flag.
 */
async function resolveIsManager(db, workspaceId, userId, globalRole) {
    if (globalRole === 'super_admin')
        return true;
    const [wm] = await db
        .select({ role: db_1.workspaceMembers.role })
        .from(db_1.workspaceMembers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
        .limit(1);
    return isManagerRole(wm?.role);
}
/**
 * WHERE fragment keeping only tasks the actor may see. Returns `undefined` for
 * managers (no restriction) so callers can `and(...conds, taskVisibilityFilter())`
 * — drizzle's `and` ignores undefined. Uses a drizzle subquery (not raw SQL) so
 * `tasks.id` binds correctly in both the query builder and the relational query
 * API (which aliases the table).
 */
function taskVisibilityFilter(db, actorId, isManager) {
    if (isManager)
        return undefined;
    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.ne)(db_1.tasks.visibility, 'private'), (0, drizzle_orm_1.eq)(db_1.tasks.createdById, actorId), (0, drizzle_orm_1.inArray)(db_1.tasks.id, db.select({ id: db_1.taskAssignees.taskId }).from(db_1.taskAssignees).where((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, actorId))));
}
/** WHERE fragment keeping only lists the actor may see (unaliased `lists`). */
function listVisibilityFilter(actorId, isManager) {
    if (isManager)
        return undefined;
    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.ne)(db_1.lists.visibility, 'private'), (0, drizzle_orm_1.eq)(db_1.lists.createdById, actorId));
}
/** WHERE fragment keeping only folders the actor may see (unaliased `folders`). */
function folderVisibilityFilter(actorId, isManager) {
    if (isManager)
        return undefined;
    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.ne)(db_1.folders.visibility, 'private'), (0, drizzle_orm_1.eq)(db_1.folders.createdById, actorId));
}
/**
 * In-memory equivalent of the filters above, for guards / single rows already
 * fetched. `isAssignee` only matters for tasks.
 */
function canSeePrivateItem(item, actor) {
    if (item.visibility !== 'private')
        return true;
    if (actor.isManager)
        return true;
    if (item.createdById && item.createdById === actor.userId)
        return true;
    return !!actor.isAssignee;
}
//# sourceMappingURL=item-visibility.js.map