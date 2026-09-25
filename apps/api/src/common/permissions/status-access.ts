import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { assertSpaceLevel, type WithinStep } from './space-default-permission'
import { isUuid } from '../validation/uuid'

/** What owns a set of statuses: a space, a project, or a list of its own. */
export type StatusOwner = 'space' | 'project' | 'list'

/**
 * WHO MAY SHAPE A CONTAINER'S STATUSES — make, rename, delete or reorder them,
 * or choose whose a list uses: somebody who may add to its space (the create
 * gate's rung, `edit`), and never a guest.
 *
 * The status routes asked only whether the caller could READ the container
 * (`ResourceMemberGuard`). Measured on lane 5: a guest with one list shared
 * with them to view passed through its project, and made, renamed and DELETED
 * its statuses — and a delete moves every task in that status; a member of a
 * view-only space made statuses on it, its project and its list, and switched
 * a list onto its project's statuses (`found-25-sep/statuses-written-by-readers`).
 *
 * ClickUp's rule (help centre, search snippets): owners, admins and members
 * manage statuses by default, because a location's default permission is Full
 * edit; guests do so only where an advanced permission allows it. This asks
 * `edit`, which a space's default — Full edit, since 0164 — reaches, so a
 * member of an ordinary space manages statuses as before, as does one in an
 * Edit space (ClickUp's articles do not say whether Edit alone reaches this);
 * a view-only or comment-only space refuses them, and a guest is refused
 * whatever is shared with them. The list page asks this for its Statuses
 * (`TasksService.listCapabilities`).
 *
 * Not found when the owner does not exist; a super-admin, who holds no
 * membership, passes as every create gate lets them.
 */
export async function assertMayShapeStatuses(
  db: Db,
  params: { owner: StatusOwner; ownerId: string; actorId: string },
): Promise<void> {
  const place = isUuid(params.ownerId) ? await locate(db, params.owner, params.ownerId) : null
  if (!place) throw new NotFoundException(`${params.owner[0].toUpperCase()}${params.owner.slice(1)} not found`)
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, place.workspaceId), eq(workspaceMembers.userId, params.actorId)))
    .limit(1)
  if (membership?.role === 'guest') {
    throw new ForbiddenException('Guests do not change statuses')
  }
  // A grant on the list or project that owns them decides before the space (`WithinStep`).
  await assertSpaceLevel(db, { spaceId: place.spaceId, actorId: params.actorId, required: 'edit', kind: 'statuses', within: place.within })
}

/** The space (and its workspace) a status owner lives in, and the owner with the containers above it. */
async function locate(
  db: Db,
  owner: StatusOwner,
  ownerId: string,
): Promise<{ spaceId: string; workspaceId: string; within: WithinStep[] } | null> {
  if (owner === 'space') {
    const [row] = await db
      .select({ spaceId: spaces.id, workspaceId: spaces.workspaceId })
      .from(spaces)
      .where(eq(spaces.id, ownerId))
      .limit(1)
    return row ? { ...row, within: [] } : null
  }
  if (owner === 'project') {
    const [row] = await db
      .select({ spaceId: spaces.id, workspaceId: spaces.workspaceId, folderId: projects.folderId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, ownerId))
      .limit(1)
    return row
      ? { spaceId: row.spaceId, workspaceId: row.workspaceId, within: [{ type: 'project', id: ownerId }, ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : [])] }
      : null
  }
  const [row] = await db
    .select({ spaceId: spaces.id, workspaceId: spaces.workspaceId, projectId: projects.id, folderId: projects.folderId })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(eq(lists.id, ownerId))
    .limit(1)
  return row
    ? {
        spaceId: row.spaceId,
        workspaceId: row.workspaceId,
        within: [
          { type: 'list', id: ownerId },
          { type: 'project', id: row.projectId },
          ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
        ],
      }
    : null
}
