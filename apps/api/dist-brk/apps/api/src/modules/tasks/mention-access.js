"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canReachTask = canReachTask;
const item_visibility_1 = require("../../common/permissions/item-visibility");
function canReachTask(ctx, actor) {
    // 1. Managers and admins see everything in the workspace, container privacy
    //    included — the first line of `checkContainerAccess`.
    if ((0, item_visibility_1.isManagerRole)(actor.workspaceRole))
        return true;
    // 2. Container privacy, mirroring `checkContainerAccess`. A private space is
    //    a wall: not being in it ends the question.
    if (ctx.spaceVisibility === 'private' && !ctx.spaceMemberIds.has(actor.userId))
        return false;
    if (ctx.projectVisibility === 'private' && ctx.projectId) {
        const inProject = ctx.projectMemberIds.has(actor.userId);
        // An admin of the owning space reaches that space's private projects.
        if (!inProject && !ctx.spaceAdminIds.has(actor.userId))
            return false;
    }
    // 3 & 4. Per-item privacy, using the guard's own predicate rather than a copy
    //        of it.
    if (!(0, item_visibility_1.canSeePrivateItem)({ visibility: ctx.listVisibility, createdById: ctx.listCreatedById }, { userId: actor.userId, isManager: false }))
        return false;
    return (0, item_visibility_1.canSeePrivateItem)({ visibility: ctx.taskVisibility, createdById: ctx.taskCreatedById }, { userId: actor.userId, isManager: false, isAssignee: ctx.assigneeIds.has(actor.userId) });
}
//# sourceMappingURL=mention-access.js.map