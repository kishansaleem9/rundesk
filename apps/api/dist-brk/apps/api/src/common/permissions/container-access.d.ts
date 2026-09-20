import type { Db } from '@rundesk/db';
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
export declare function assertCanManageContainer(db: Db, params: {
    workspaceId: string;
    createdById: string | null | undefined;
    actorId: string;
    kind: string;
    /** 'delete' applies the stricter own-space / admin-only rules; 'manage' (default) keeps edit behaviour. */
    action?: 'manage' | 'delete';
    /** Owning space: self for a space, parent space for a project/list. Enables manager own-space delete scoping. */
    spaceId?: string | null;
    /** When true, deletion is admin-only regardless of role (space.delete is admin-only in the catalog). */
    adminOnlyDelete?: boolean;
}): Promise<void>;
