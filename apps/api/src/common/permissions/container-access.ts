import { ForbiddenException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

const MANAGE_ROLES = new Set(['super_admin', 'workspace_admin', 'manager'])

/**
 * Container (space / project / list) mutations are allowed only for the creator
 * or a workspace admin/manager. Plain members may create containers but must not
 * edit or delete ones they don't own. Throws ForbiddenException when not allowed.
 */
export async function assertCanManageContainer(
  db: Db,
  params: { workspaceId: string; createdById: string | null | undefined; actorId: string; kind: string },
): Promise<void> {
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
  if (membership && MANAGE_ROLES.has(membership.role)) return
  throw new ForbiddenException(`Only the creator or a workspace admin can modify this ${params.kind}`)
}
