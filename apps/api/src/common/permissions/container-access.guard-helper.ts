import { and, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm'
import { spaceMembers, projectMembers, workspaceMembers, spaces, projects } from '@rundesk/db'
import type { Db } from '@rundesk/db'

const WS_MANAGER_ROLE_SET = ['workspace_admin', 'manager', 'super_admin']

/** True if the user holds a manager-tier role in the workspace. */
export async function isWorkspaceManager(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const [wm] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return !!wm && WS_MANAGER_ROLE_SET.includes(wm.role as string)
}

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
  if (actor.workspaceRole && WS_MANAGER_ROLE_SET.includes(actor.workspaceRole)) return true

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

/**
 * `checkContainerAccess` as a WHERE fragment, for a query that lists rows from
 * many containers at once — the same rule, row for row: a manager sees every
 * container; a private space needs space membership; a private project needs
 * project membership or admin of its space. Joins `spaces` and `projects`
 * unaliased. `undefined` for a manager, so `and(...)` drops it.
 *
 * Written beside the per-row check on purpose: two statements of one rule are
 * only safe while they sit where a change to one is seen next to the other.
 */
export function containerVisibilityFilter(db: Db, actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return undefined
  const memberSpaces = db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, actorId))
  const adminSpaces = db
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.userId, actorId), eq(spaceMembers.role, 'admin')))
  const memberProjects = db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId))
  return and(
    or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)),
    or(
      isNull(projects.visibility),
      ne(projects.visibility, 'private'),
      inArray(projects.id, memberProjects),
      inArray(projects.spaceId, adminSpaces),
    ),
  )
}
