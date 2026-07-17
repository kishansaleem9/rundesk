import { ForbiddenException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, spaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin'])

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
export async function assertCanManageContainer(
  db: Db,
  params: {
    workspaceId: string
    createdById: string | null | undefined
    actorId: string
    kind: string
    /** 'delete' applies the stricter own-space / admin-only rules; 'manage' (default) keeps edit behaviour. */
    action?: 'manage' | 'delete'
    /** Owning space: self for a space, parent space for a project/list. Enables manager own-space delete scoping. */
    spaceId?: string | null
    /** When true, deletion is admin-only regardless of role (space.delete is admin-only in the catalog). */
    adminOnlyDelete?: boolean
  },
): Promise<void> {
  const action = params.action ?? 'manage'
  // The creator may always manage / delete their own container.
  if (params.createdById && params.createdById === params.actorId) return

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, params.workspaceId),
        eq(workspaceMembers.userId, params.actorId),
      ),
    )
    .limit(1)
  const role = membership?.role
  // Workspace admins / super-admins may always manage + delete any container.
  if (role && ADMIN_ROLES.has(role)) return

  if (role === 'manager') {
    if (action !== 'delete') return // edits: a manager may manage any container
    // Deleting an entire space is admin-only (space.delete not in MANAGER_DELTA).
    if (params.adminOnlyDelete) {
      throw new ForbiddenException(`Only the creator or a workspace admin can delete this ${params.kind}`)
    }
    // Otherwise a manager may delete a project/list only in a space they belong to.
    if (params.spaceId) {
      const [member] = await db
        .select({ userId: spaceMembers.userId })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, params.spaceId), eq(spaceMembers.userId, params.actorId)))
        .limit(1)
      if (!member) throw new ForbiddenException(`Managers can only delete ${params.kind}s in their own spaces`)
    }
    return
  }

  throw new ForbiddenException(`Only the creator or a workspace admin can modify this ${params.kind}`)
}
