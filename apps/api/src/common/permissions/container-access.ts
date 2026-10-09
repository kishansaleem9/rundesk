import { isManagerRole } from './workspace-roles'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, spaceMembers, spaces, projects } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { CustomRolesService } from '../../modules/custom-roles/custom-roles.service'
import { assertSpaceLevel, type WithinStep } from './space-default-permission'
import { checkContainerAccess } from './container-access.guard-helper'

/** Who holds which permission: `CustomRolesService`, or a stand-in for it in a unit test. */
export type PermissionAsker = Pick<CustomRolesService, 'hasPermission'>

/**
 * THE KEY FOR DELETING A CONTAINER SOMEBODY ELSE MADE, by its kind — asked of
 * the actor's base role's defaults and their custom roles. One call per key,
 * each written out, so `check-permission-keys-asked.mjs` finds the key asked.
 * A kind with no key of its own (a folder) answers null: its rule is the base
 * roles', below.
 */
function askDeleteKey(roles: PermissionAsker, workspaceId: string, actorId: string, kind: string): Promise<boolean> | null {
  if (kind === 'space') return roles.hasPermission(workspaceId, actorId, 'space.delete')
  if (kind === 'project') return roles.hasPermission(workspaceId, actorId, 'project.delete')
  if (kind === 'list') return roles.hasPermission(workspaceId, actorId, 'list.delete')
  return null
}

/**
 * THE PERSONAL SPACE IS NOBODY'S TO SHAPE (`found-24-sep/planner-default-list-read-by-nothing`).
 * Everybody's Personal List lives in the workspace's personal space, which
 * ClickUp keeps "not part of the Workspace hierarchy": it is not renamed,
 * moved, archived or deleted — renaming it is still asked for on ClickUp's
 * feedback board, 9 October — and nothing but tasks is made in it. Its space,
 * its container and each list in it are made by `ensurePersonalList` alone,
 * which writes past these gates.
 */
export const PERSONAL_PLACE_REFUSAL = 'A Personal List keeps its name and its place: it cannot be renamed, moved or deleted'
export const PERSONAL_PLACE_HOLDS_TASKS = 'A Personal List holds tasks: nothing else can be made in it'

async function isPersonalSpace(db: Db, spaceId: string): Promise<boolean> {
  const [row] = await db.select({ isPersonal: spaces.isPersonal }).from(spaces).where(eq(spaces.id, spaceId)).limit(1)
  return row?.isPersonal === true
}

/** For a caller that passed no `roles`: a keyed delete cannot be decided without them, and says so. */
const NO_ROLES: PermissionAsker = {
  hasPermission: async () => {
    throw new Error('Deleting a space, a project or a list somebody else made asks its key: pass `roles` (CustomRolesService)')
  },
}

/**
 * Container (space / project / list / folder) mutations. Plain members may
 * create containers; changing one somebody else made is its creator's, a
 * workspace admin's or a manager's. Throws ForbiddenException when not allowed.
 *
 * `action: 'delete'` — DELETING WHAT SOMEBODY ELSE MADE ASKS ITS KEY
 * (`role-editor-offers-unenforced-permissions`, the deletion keys):
 * `space.delete`, `project.delete` or `list.delete` by the kind, from the
 * actor's base role's defaults and their custom roles (`roles`). The keys
 * replace role tests that said the same for the base roles — a space an
 * admin's (`space.delete` is in no lower tier), a project or a list a
 * manager's too — so no base role gains or loses anything, and a custom role
 * that grants a key is honoured, where it was saved and ignored. ClickUp:
 * deleting follows the location's level, so a key never reaches past it — the
 * level is asked first, below, and the key after.
 *   - A MANAGER'S LEVEL IS THEIR ROLE (`resolveSpaceLevel` answers Full edit
 *     everywhere), so a manager deletes only in a space they belong to
 *     ("own space"), as the task delete-scope check does (`spaceMembers`).
 *   - A folder has no key: an admin deletes one, and a manager in their own
 *     space, as before.
 * Changing one (`manage`, the default) is unchanged: its creator, an admin, or
 * any manager.
 *
 * §V2-06 frame `06:52`: when a `spaceId` is given, the owning space's
 * **Default permission** is consulted FIRST and can only narrow — see the
 * comment on that branch, and `space-default-permission.ts` for what the
 * column means. So each rule above holds only in a space whose default
 * permission (or the actor's explicit grant on it) reaches Edit to change it,
 * and Full edit to delete it.
 */
export async function assertCanManageContainer(
  db: Db,
  params: {
    workspaceId: string
    createdById: string | null | undefined
    actorId: string
    kind: string
    /** 'delete' asks Full edit and, of somebody else's container, its key; 'manage' (default) keeps edit behaviour. */
    action?: 'manage' | 'delete'
    /** Owning space: self for a space, parent space for a project/list. Enables manager own-space delete scoping. */
    spaceId?: string | null
    /** The container and those above it: a grant on any of them decides before the space (`WithinStep`). */
    within?: WithinStep[]
    /**
     * Who holds which permission (`CustomRolesService`), for deleting a space,
     * a project or a list somebody else made. Every caller that deletes one
     * passes it; changing one, or deleting a folder, asks no key.
     */
    roles?: PermissionAsker
  },
): Promise<void> {
  const action = params.action ?? 'manage'

  // Whoever asks, its owner and an admin among them: the personal space, its container and its lists stay as they are.
  if (params.spaceId && (await isPersonalSpace(db, params.spaceId))) throw new ForbiddenException(PERSONAL_PLACE_REFUSAL)

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

  if (action === 'delete') {
    // A GUEST NEVER DELETES A SPACE, whatever a custom role grants and whatever
    // level a share gives: ClickUp ("Archive or restore Spaces"): "Guests cannot
    // archive, unarchive, and delete any Space."
    if (params.kind === 'space' && role === 'guest') {
      throw new ForbiddenException('A guest cannot delete a space')
    }
    // Somebody else's space, project or list: its key. A folder, which has none: an admin's or a manager's.
    const asked = askDeleteKey(params.roles ?? NO_ROLES, params.workspaceId, params.actorId, params.kind)
    const held = asked ? await asked : isManagerRole(role)
    if (!held) {
      throw new ForbiddenException(
        asked
          ? `Only the creator, or someone granted "Delete ${params.kind}s", can delete this ${params.kind}`
          : `Only the creator or a workspace admin can modify this ${params.kind}`,
      )
    }
    // A manager's level is their role, so a manager deletes only in a space they belong to.
    if (role === 'manager' && params.spaceId) {
      const [member] = await db
        .select({ userId: spaceMembers.userId })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, params.spaceId), eq(spaceMembers.userId, params.actorId)))
        .limit(1)
      if (!member) throw new ForbiddenException(`Managers can only delete ${params.kind}s in their own spaces`)
    }
    return
  }

  // Changing it: workspace admins, managers and platform admins may change any container.
  if (isManagerRole(role)) return
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
  // A task goes in a Personal List, by its owner (the list's read rule decides who); nothing else is made there.
  if (params.kind !== 'task' && (await isPersonalSpace(db, params.spaceId))) throw new ForbiddenException(PERSONAL_PLACE_HOLDS_TASKS)
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
