import { and, eq, inArray, isNull, ne, notInArray, or, type SQL } from 'drizzle-orm'
import { spaceMembers, projectMembers, workspaceMembers, spaces, projects, lists, tasks, folders } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { isManagerRole, listVisibilityFilter } from './item-visibility'
import { guestProjectFilter, guestSpaceFilter } from './guest-reach'

/** True if the user holds a manager-tier role in the workspace. */
export async function isWorkspaceManager(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const [wm] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return !!wm && isManagerRole(wm.role as string)
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
  return (await containerRefusal(db, ctx, actor)) === null
}

/** Which container refuses the actor — its space, its folder or its project — or null when none does. */
export type ContainerRefusal = 'space' | 'folder' | 'project'

/**
 * `checkContainerAccess`, saying WHICH container refused: the one statement of
 * the rule, for the callers that answer each refusal in its own words (the
 * task service's read check). That check kept a copy of the rule to keep its
 * messages, and a copy is the rule twice (`found-23-sep/container-read-rule-twice`).
 */
export async function containerRefusal(
  db: Db,
  ctx: ContainerAccessContext,
  actor: { userId: string; workspaceRole?: string },
): Promise<ContainerRefusal | null> {
  if (isManagerRole(actor.workspaceRole)) return null

  const spacePrivate = ctx.spaceVisibility === 'private'
  if (spacePrivate) {
    const [sm] = await db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actor.userId)))
      .limit(1)
    if (!sm) return 'space'
  }

  /*
   * A PRIVATE FOLDER IS ITS MAKER'S (and the managers', who returned above), as
   * `folderVisibilityFilter` keeps it from the folder listing. Nothing below a
   * folder asked it, so a member it refused read its projects, their lists and
   * tasks, the workspace list and search (`found-24-sep/private-folders-unenforced`).
   */
  if (ctx.projectId) {
    const [folder] = await db
      .select({ visibility: folders.visibility, createdById: folders.createdById })
      .from(projects)
      .innerJoin(folders, eq(folders.id, projects.folderId))
      .where(eq(projects.id, ctx.projectId))
      .limit(1)
    if (folder?.visibility === 'private' && folder.createdById !== actor.userId) return 'folder'
  }

  const projectPrivate = ctx.projectVisibility === 'private'
  if (projectPrivate && ctx.projectId) {
    const [pm] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, ctx.projectId), eq(projectMembers.userId, actor.userId)))
      .limit(1)
    if (pm) return null
    // An admin of the owning space can reach the space's private projects.
    const [sadm] = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actor.userId)))
      .limit(1)
    return sadm?.role === 'admin' ? null : 'project'
  }

  return null
}

/**
 * The SPACE half of the rule below, for a query that reads spaces without
 * their projects: a private space is its members' (managers see all). Unaliased
 * `spaces`; `undefined` for a manager.
 *
 * It exists because the AI context listed every space by name, private ones
 * included, to a member refused them, and a space-only query had no filter
 * that did not need `projects` joined.
 */
export function spaceVisibilityFilter(db: Db, actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return undefined
  const memberSpaces = db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, actorId))
  // A guest sees a space granted them, or one on the way to what is (`guest-reach.ts`).
  return and(or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)), guestSpaceFilter(db, actorId))
}

/**
 * `checkContainerAccess` as a WHERE fragment, for a query that lists rows from
 * many containers at once — the same rule, row for row: a manager sees every
 * container; a private space needs space membership; a private project needs
 * project membership or admin of its space. Joins `spaces` and `projects`
 * unaliased. `undefined` for a manager, so `and(...)` drops it.
 *
 * FOR SPACES AND PROJECTS ONLY. A read of TASKS takes `taskInReachFilter`
 * below, which adds a private list's own rule: every task read that took this
 * one named a private list's tasks to members it refuses
 * (`found-24-sep/private-lists-skipped-by-task-reads`).
 *
 * Written beside the per-row check on purpose: two statements of one rule are
 * only safe while they sit where a change to one is seen next to the other.
 */
export function containerVisibilityFilter(db: Db, actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return undefined
  const adminSpaces = db
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.userId, actorId), eq(spaceMembers.role, 'admin')))
  const memberProjects = db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId))
  // A private folder is its maker's: no project in it is reached (`containerRefusal`).
  const hiddenFolders = db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.visibility, 'private'), or(isNull(folders.createdById), ne(folders.createdById, actorId))))
  return and(
    spaceVisibilityFilter(db, actorId, false),
    or(isNull(projects.folderId), notInArray(projects.folderId, hiddenFolders)),
    or(
      isNull(projects.visibility),
      ne(projects.visibility, 'private'),
      inArray(projects.id, memberProjects),
      inArray(projects.spaceId, adminSpaces),
    ),
    // A guest sees a project in reach, or on the way to what is (`guest-reach.ts`).
    // That is the WAY, not the content: a read of tasks takes `taskInReachFilter`.
    guestProjectFilter(db, actorId),
  )
}

/**
 * The container rule for a query that has `tasks` in scope and NOT its project
 * and space: `tasks.list_id` in the lists this person may reach in this
 * workspace. Self-contained — its subquery joins its own lists, projects and
 * spaces, so it works in a left join's ON clause, before the outer joins, and
 * where the outer query never joins them at all (a report of time entries or
 * sprint tasks). `undefined` for a manager.
 *
 * "Reach" includes the LIST's own privacy — a private list is its maker's —
 * as `ResourceMemberGuard` has it for a list. It first stopped at the space
 * and the project, and a member refused a private list in an open space had
 * its tasks counted in the overview and named in the activity feed (measured;
 * `found-24-sep/reach-skipped-private-lists`).
 */
export function taskInReachFilter(db: Db, workspaceId: string, actorId: string, isManager: boolean): SQL | undefined {
  if (isManager) return undefined
  const reachable = db
    .select({ id: lists.id })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(db, actorId, false), listVisibilityFilter(actorId, false)))
  // A guest's tasks are narrowed by the private-task filter, which every read of
  // tasks asks beside this one (`taskVisibilityFilter` → `guestTaskFilter`): a
  // second copy here was shadowed by it in every read, and measured nothing.
  return inArray(tasks.listId, reachable)
}
