import { isAdminRole } from './workspace-roles'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, spaceMembers, spaces, projects } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { assertSpaceLevel, type WithinStep } from './space-default-permission'
import { checkContainerAccess } from './container-access.guard-helper'


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
 *
 * §V2-06 frame `06:52`: when a `spaceId` is given, the owning space's
 * **Default permission** is consulted FIRST and can only narrow — see the
 * comment on that branch, and `space-default-permission.ts` for what the
 * column means. The opening sentence above is therefore now "…and only in a
 * space whose default permission (or the actor's explicit grant on it) reaches
 * `edit`".
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
    /** The container and those above it: a grant on any of them decides before the space (`WithinStep`). */
    within?: WithinStep[]
  },
): Promise<void> {
  const action = params.action ?? 'manage'

  /*
   * §V2-06 frame `06:52` — the space's Default permission, honoured.
   *
   * BEFORE the creator short-circuit on purpose. A space set to "View only"
   * means its members may not change what is in it, and "I made this list
   * myself" is not an exception to that — it is the commonest way the rule
   * would be avoided. The space's own creator is unaffected: `createSpace`
   * seeds them as a `space_members` admin, which `resolveSpaceLevel` treats as
   * the explicit grant it is.
   *
   * `edit` to manage, `admin` — Full edit — to delete. ClickUp's Edit changes
   * a location and archives it; Full edit adds deleting it, and the share
   * panel has always said so (`found-25-sep/full-edit-enforced-nowhere`).
   * This asked `edit` for both, because every space's default was `edit` and
   * asking more would have quietly refused deletes it had always allowed; the
   * default is Full edit now, and migration 0164 moved every `edit` default to
   * it, openly, so nothing a space's default allowed has changed.
   *
   * Only runs when the caller told us which space this container lives in.
   * `lists`, `projects` and `folders` already pass `spaceId` (they need it for
   * the manager own-space rule below) and `spaces` passes its own id; a caller
   * that passes none gets exactly the behaviour it had, rather than a gate
   * that silently guesses.
   */
  if (params.spaceId) {
    await assertSpaceLevel(db, {
      spaceId: params.spaceId,
      actorId: params.actorId,
      required: action === 'delete' ? 'admin' : 'edit',
      kind: params.kind,
      within: params.within,
      ...(action === 'delete' ? { act: 'deleting this' } : {}),
    })
  }

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
  if (isAdminRole(role)) return

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

/**
 * §V2-06 frame `06:52` — the same gate, on the way IN.
 *
 * THE HOLE THIS CLOSES. `assertCanManageContainer` above consults the space's
 * Default permission before every edit and delete, and **creation consulted
 * nothing at all**. `createList`, `createProject` and `FoldersService.create`
 * each took an `actorId`, wrote the row, and returned it. So in a space set to
 * "View only" a member could not rename a list, could not delete a list, and
 * could freely make a new one — and, being its creator, could then edit that
 * one too, because the creator short-circuit sits below the space gate only
 * for containers that already exist.
 *
 * That is not a gap in a rule, it is a door around it. "View only" means the
 * shape of this space is not yours to change, and adding to it is a change of
 * shape. The frame's own wording is about what members may *do* in the space,
 * not about which verbs happen to be guarded.
 *
 * DELIBERATELY THE SAME RESOLVER, not a second copy of the rule. One
 * `resolveSpaceLevel` means the create gate and the manage gate cannot drift
 * apart, which is the duplicated-list defect this audit keeps finding — and it
 * means an explicit `space_members` grant raises both at once, so a person
 * given `edit` on a view-only space can still create.
 *
 * `admin` — Full edit. ClickUp's Edit changes what is in a location and adds
 * nothing to it; Full edit adds creating, as it adds deleting (help centre,
 * "Permissions in detail"; `found-25-sep/full-edit-enforced-nowhere`). A
 * space's default is Full edit, so its members add to it as they always did.
 *
 * A caller with no actor is an internal one (a seeder, a template expansion)
 * and is left alone, exactly as `assertCanManageContainer` leaves it alone.
 */
export async function assertCanCreateInSpace(
  db: Db,
  params: {
    spaceId: string | null | undefined
    actorId: string | null | undefined
    kind: string
    /** Where inside the space it is made (a project, its folder), for a guest's own shares there. */
    within?: WithinStep[]
  },
): Promise<void> {
  if (!params.spaceId || !params.actorId) return
  await assertSpaceLevel(db, {
    spaceId: params.spaceId,
    actorId: params.actorId,
    required: 'admin',
    kind: params.kind,
    within: params.within,
    act: 'adding a',
  })
}

/**
 * PUTTING A CONTAINER SOMEWHERE — by creating it there, moving it there, or
 * applying a template there — needs the same two things of the DESTINATION:
 * the space's create gate (`assertCanCreateInSpace`), and a container the
 * actor can see at all (`checkContainerAccess`).
 *
 * Creating checked the first. Moving a list, a project or a folder checked
 * neither: each asked whether the actor could manage the thing being moved
 * and whether the target was in the same workspace, and not whether the
 * target was a "View only" space or a private project they are not in.
 * Applying a template checked neither either. Every one of them is the same
 * side door onto a space whose default permission says no.
 *
 * `projectId` when the destination is a project (a list moving into it); the
 * space's visibility and the project's are both part of what the actor must
 * be able to see. No actor, no check — the system paths that pass none.
 */
export async function assertCanPlaceIn(
  db: Db,
  params: { spaceId: string; projectId?: string | null; actorId: string | null | undefined; kind: string },
): Promise<void> {
  if (!params.actorId) return
  const [space] = await db
    .select({ workspaceId: spaces.workspaceId, visibility: spaces.visibility })
    .from(spaces)
    .where(eq(spaces.id, params.spaceId))
    .limit(1)
  if (!space) throw new NotFoundException('Space not found')
  let projectVisibility: string | null = null
  if (params.projectId) {
    const [project] = await db
      .select({ visibility: projects.visibility })
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1)
    projectVisibility = project?.visibility ?? null
  }
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, space.workspaceId), eq(workspaceMembers.userId, params.actorId)))
    .limit(1)
  const reachable = await checkContainerAccess(
    db,
    { spaceId: params.spaceId, spaceVisibility: space.visibility, projectId: params.projectId ?? null, projectVisibility },
    { userId: params.actorId, workspaceRole: member?.role },
  )
  if (!reachable) throw new ForbiddenException(`You do not have access to where this ${params.kind} would go`)
  await assertCanCreateInSpace(db, { spaceId: params.spaceId, actorId: params.actorId, kind: params.kind })
}
