"use strict";
/**
 * §7 — who may create a workspace.
 *
 * > "Workspace ka option jo hai humein SELECT DOWN karna hai: ke agar member
 * >  hai woh create kar sakta hai; admin to obviously create kar sakta hai;
 * >  lekin jo GUEST hai sirf woh create NAHI kar sakta, aur agar koi VIEWER
 * >  side pe hai to woh bhi nahi — baaqi sab create kar sakte hain." [09:13]
 *
 * And the reason, stated plainly a few seconds later: "WORKSPACE IS A FEATURE
 * jo ke har member kar sakta hai — it's not necessary ke humare paas kuch admin
 * hi aaye jo kar sake" [09:29]. Creating a workspace was Super-Admin-only, on a
 * reading of the plan that predates her saying this.
 *
 * On "viewer": she is describing ClickUp's roles. Rundesk has no viewer
 * identity — its user roles are super_admin, workspace_admin, manager, member
 * and guest, and read-only access is granted per container ('view' on a space
 * or list) rather than being a kind of person. So her two exclusions collapse
 * to one here. If a viewer role is ever introduced, it belongs in the set
 * below, and the test named for it will start mattering.
 *
 * Stated as a deny-list on purpose. An allow-list would silently exclude any
 * role added later — a new role would arrive unable to create a workspace, for
 * no reason anyone chose, and the failure would look like a permissions bug
 * rather than a missing line here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLES_WITHOUT_WORKSPACE_CREATION = void 0;
exports.canCreateWorkspace = canCreateWorkspace;
/** Roles that may not create a workspace. */
exports.ROLES_WITHOUT_WORKSPACE_CREATION = ['guest', 'viewer'];
function canCreateWorkspace(role) {
    // No role at all is not a licence. Every authenticated caller has one, so
    // this is a malformed token or a user row mid-migration — neither is someone
    // to hand a new workspace to.
    if (!role)
        return false;
    return !exports.ROLES_WITHOUT_WORKSPACE_CREATION.includes(role);
}
//# sourceMappingURL=workspace-creation-policy.js.map