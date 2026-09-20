"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWorkspaceManager = isWorkspaceManager;
exports.checkContainerAccess = checkContainerAccess;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const WS_MANAGER_ROLE_SET = ['workspace_admin', 'manager', 'super_admin'];
/** True if the user holds a manager-tier role in the workspace. */
async function isWorkspaceManager(db, workspaceId, userId) {
    const [wm] = await db
        .select({ role: db_1.workspaceMembers.role })
        .from(db_1.workspaceMembers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
        .limit(1);
    return !!wm && WS_MANAGER_ROLE_SET.includes(wm.role);
}
/**
 * Decide whether `actor` may access a resource inside the given container
 * chain, enforcing private-container membership:
 *   - Workspace managers/admins/super_admins see everything.
 *   - A private space requires the actor to be a space member.
 *   - An explicitly-private project requires the actor to be a project member
 *     (or an admin of the owning space). A project that inherits (null) is
 *     covered by the space check.
 * Public containers (the default) always pass. Returns true/false — the caller
 * turns false into a 403.
 */
async function checkContainerAccess(db, ctx, actor) {
    if (actor.workspaceRole && WS_MANAGER_ROLE_SET.includes(actor.workspaceRole))
        return true;
    const spacePrivate = ctx.spaceVisibility === 'private';
    if (spacePrivate) {
        const [sm] = await db
            .select({ userId: db_1.spaceMembers.userId })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actor.userId)))
            .limit(1);
        if (!sm)
            return false;
    }
    const projectPrivate = ctx.projectVisibility === 'private';
    if (projectPrivate && ctx.projectId) {
        const [pm] = await db
            .select({ userId: db_1.projectMembers.userId })
            .from(db_1.projectMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, ctx.projectId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, actor.userId)))
            .limit(1);
        if (pm)
            return true;
        // An admin of the owning space can reach the space's private projects.
        const [sadm] = await db
            .select({ role: db_1.spaceMembers.role })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actor.userId)))
            .limit(1);
        return sadm?.role === 'admin';
    }
    return true;
}
//# sourceMappingURL=container-access.guard-helper.js.map