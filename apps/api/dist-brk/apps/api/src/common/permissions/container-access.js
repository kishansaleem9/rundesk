"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCanManageContainer = assertCanManageContainer;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);
/**
 * Container (space / project / list) mutations are allowed only for the creator
 * or a workspace admin/manager. Plain members may create containers but must not
 * edit or delete ones they don't own. Throws ForbiddenException when not allowed.
 *
 * `action: 'delete'` applies the stricter rules the permission catalog + plan §3
 * ("Delete Items — Admin any, Manager own space, Member own tasks") require for
 * *deleting* a container. Edits keep the looser manage rule (a manager may edit
 * any container in the workspace) so this change never narrows edit access:
 *   - `adminOnlyDelete` (spaces): `space.delete` is admin-only in the catalog
 *     (not in MANAGER_DELTA), so a manager may NOT delete an entire space — only
 *     its creator or a workspace admin / super-admin can.
 *   - otherwise (project / list, both manager-grantable): a manager may delete
 *     only within a space they belong to ("own space"), mirroring the task
 *     delete-scope check (`spaceMembers` membership). Admins keep delete-any.
 */
async function assertCanManageContainer(db, params) {
    const action = params.action ?? 'manage';
    // The creator may always manage / delete their own container.
    if (params.createdById && params.createdById === params.actorId)
        return;
    const [membership] = await db
        .select({ role: db_1.workspaceMembers.role })
        .from(db_1.workspaceMembers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, params.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, params.actorId)))
        .limit(1);
    const role = membership?.role;
    // Workspace admins / super-admins may always manage + delete any container.
    if (role && ADMIN_ROLES.has(role))
        return;
    if (role === 'manager') {
        if (action !== 'delete')
            return; // edits: a manager may manage any container
        // Deleting an entire space is admin-only (space.delete not in MANAGER_DELTA).
        if (params.adminOnlyDelete) {
            throw new common_1.ForbiddenException(`Only the creator or a workspace admin can delete this ${params.kind}`);
        }
        // Otherwise a manager may delete a project/list only in a space they belong to.
        if (params.spaceId) {
            const [member] = await db
                .select({ userId: db_1.spaceMembers.userId })
                .from(db_1.spaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, params.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, params.actorId)))
                .limit(1);
            if (!member)
                throw new common_1.ForbiddenException(`Managers can only delete ${params.kind}s in their own spaces`);
        }
        return;
    }
    throw new common_1.ForbiddenException(`Only the creator or a workspace admin can modify this ${params.kind}`);
}
//# sourceMappingURL=container-access.js.map