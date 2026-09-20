import type { Db } from '@rundesk/db';
/** True if the user holds a manager-tier role in the workspace. */
export declare function isWorkspaceManager(db: Db, workspaceId: string, userId: string): Promise<boolean>;
/**
 * Visibility context for the container chain owning a resource.
 * `spaceVisibility` is 'public' | 'private'; `projectVisibility` is
 * 'public' | 'private' | null (null = inherit from the space).
 */
export type ContainerAccessContext = {
    spaceId: string;
    spaceVisibility: string | null;
    projectId?: string | null;
    projectVisibility?: string | null;
};
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
export declare function checkContainerAccess(db: Db, ctx: ContainerAccessContext, actor: {
    userId: string;
    workspaceRole?: string;
}): Promise<boolean>;
