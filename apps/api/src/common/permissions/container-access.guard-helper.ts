import { and, eq } from 'drizzle-orm'
import { spaceMembers, projectMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/**
 * Visibility context for the container chain owning a resource.
 * `spaceVisibility` is 'public' | 'private'; `projectVisibility` is
 * 'public' | 'private' | null (null = inherit from the space).
 */
export type ContainerAccessContext = {
  spaceId: string
  spaceVisibility: string | null
  projectId?: string | null
  projectVisibility?: string | null
}

const WS_MANAGER_ROLES = ['workspace_admin', 'manager', 'super_admin']

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
export async function checkContainerAccess(
  db: Db,
  ctx: ContainerAccessContext,
  actor: { userId: string; workspaceRole?: string },
): Promise<boolean> {
  if (actor.workspaceRole && WS_MANAGER_ROLES.includes(actor.workspaceRole)) return true

  const spacePrivate = ctx.spaceVisibility === 'private'
  if (spacePrivate) {
    const [sm] = await db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actor.userId)))
      .limit(1)
    if (!sm) return false
  }

  const projectPrivate = ctx.projectVisibility === 'private'
  if (projectPrivate && ctx.projectId) {
    const [pm] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, ctx.projectId), eq(projectMembers.userId, actor.userId)))
      .limit(1)
    if (pm) return true
    // An admin of the owning space can reach the space's private projects.
    const [sadm] = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actor.userId)))
      .limit(1)
    return sadm?.role === 'admin'
  }

  return true
}
