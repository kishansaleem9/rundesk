import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { eq, and, ne, asc, sql, type SQL } from 'drizzle-orm'
import { lists, listStatuses, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { resolveIsManager, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { SecurityService } from '../security/security.service'
import { DEFAULT_LIST_STATUSES, seedListStatuses } from './list-statuses.defaults'

/*
 * The pipeline moved to `./list-statuses.defaults.ts`. It lived here, private,
 * while six other places inserted into `lists` without it — see that file for
 * the list and for what a status-less list actually does to a task marked done.
 */
export { DEFAULT_LIST_STATUSES, seedListStatuses }

@Injectable()
export class ListsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  /**
   * §G15 [22:07] — "yeh pooch raha ke PRIVATE karni hai ke nahi."
   *
   * Visibility is settable at creation, not only afterwards. The column and the
   * update path have always carried it; this endpoint dropped it on the floor,
   * so the only way to get a private list was to create a public one and then
   * change it — which is a window, however short, in which the wrong people
   * can see it. Omitted still means public, exactly as before.
   */
  /**
   * §G15-10 [21:49–21:54] — the container that makes "a List in a Space" work.
   *
   * Resolved, then created if absent. `project_id` on a list is NOT NULL and
   * stays that way: 114 inner joins across 34 files reach a list's workspace
   * through its project — the resource guard among them — so a list with no
   * project would 404 for everybody while quietly disappearing from search,
   * the knowledge index, notifications and reminders. The hierarchy the person
   * sees is Space → List; this is what carries it.
   *
   * The insert races safely. Two people creating a list in the same empty space
   * at once both find nothing and both insert; the partial unique index in
   * migration 0129 lets exactly one win, and the loser re-reads rather than
   * failing — which is why this is written as insert-then-reread and not as a
   * check-then-act.
   */
  async defaultContainerForSpace(spaceId: string, actorId?: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true)))
      .limit(1)
    if (existing) return existing.id

    const [space] = await this.db
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1)
    if (!space) throw new NotFoundException('Space not found')

    const [made] = await this.db
      .insert(projects)
      .values({
        spaceId,
        // Never shown. Named rather than blank so anybody reading the table
        // directly can tell what it is and why it is not in the tree.
        name: 'Lists',
        isDefaultContainer: true,
        createdById: actorId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: projects.id })
    if (made) return made.id

    const [won] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true)))
      .limit(1)
    if (!won) throw new BadRequestException('could not resolve the space container')
    return won.id
  }

  /**
   * §G15-10 — the lists that live directly in a space.
   *
   * Everything in the space's hidden container, which is exactly the set that
   * was created by choosing a Space and nothing else.
   */
  async getListsBySpace(spaceId: string, actor?: { id: string; role?: string }) {
    const [container] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true)))
      .limit(1)
    // No container means nobody has made a space-level list here yet, which is
    // an empty list and not an error.
    if (!container) return []
    return this.getListsByProject(container.id, actor)
  }

  /**
   * §V2-S11 frame `08:50` — "List name taken".
   *
   * The constraint lives in the database (migration 0147, a partial
   * case-insensitive unique index) so two requests racing cannot both win. This
   * check exists so the ANSWER is a 409 with the frame's words rather than a
   * bare Postgres unique-violation surfacing as a 500 — the person typed a
   * name, and what they need back is that the name is taken.
   *
   * Archived lists are excluded, matching the index: a name in the bin does not
   * reserve itself forever.
   */
  private async assertListNameFree(projectId: string, name: string, exceptListId?: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const clash = await this.db
      .select({ id: lists.id })
      .from(lists)
      .where(
        and(
          eq(lists.projectId, projectId),
          eq(lists.isArchived, false),
          sql`lower(${lists.name}) = lower(${trimmed})`,
          exceptListId ? ne(lists.id, exceptListId) : undefined,
        ),
      )
      .limit(1)
    if (clash.length > 0) throw new ConflictException('List name taken')
  }

  async createList(
    projectId: string,
    data: { name: string; description?: string; visibility?: 'public' | 'private' },
    actorId?: string,
  ) {
    await this.assertListNameFree(projectId, data.name)
    const result = await this.db
      .insert(lists)
      .values({
        projectId,
        name: data.name,
        description: data.description,
        visibility: data.visibility ?? 'public',
        createdById: actorId ?? null,
      })
      .returning()

    const list = result[0]
    // Seed the default status pipeline so the list is immediately usable.
    await seedListStatuses(this.db, list.id)

    return list
  }

  async getListsByProject(projectId: string, actor?: { id: string; role?: string }) {
    // §2 per-item privacy: hide private lists the actor may not see.
    let visFilter: SQL | undefined
    if (actor) {
      const [ctx] = await this.db
        .select({ workspaceId: spaces.workspaceId })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(projects.id, projectId))
        .limit(1)
      if (ctx) {
        const isManager = await resolveIsManager(this.db, ctx.workspaceId, actor.id, actor.role)
        visFilter = listVisibilityFilter(actor.id, isManager)
      }
    }
    return this.db
      .select()
      .from(lists)
      .where(and(eq(lists.projectId, projectId), eq(lists.isArchived, false), visFilter))
      .orderBy(asc(lists.position), asc(lists.createdAt))
  }

  /**
   * §V2-02 — every list in a workspace the actor may see.
   *
   * Added for the Planner's "Default list for new tasks" picker (frame
   * `14:10`), which needs to offer the whole workspace. Lists were reachable
   * only per-project and per-space, so a workspace-wide picker would have had
   * to walk every space from the browser — one request per space, and a
   * different visibility answer than the server would give.
   *
   * The same `listVisibilityFilter` the per-project read uses, resolved once
   * for the workspace rather than once per project: a private list you cannot
   * open must not be offerable as the place your tasks land.
   */
  async getListsByWorkspace(workspaceId: string, actor?: { id: string; role?: string }) {
    let visFilter: SQL | undefined
    if (actor) {
      const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)
      visFilter = listVisibilityFilter(actor.id, isManager)
    }
    return this.db
      .select({ id: lists.id, name: lists.name, projectId: lists.projectId, spaceId: projects.spaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(lists.isArchived, false), visFilter))
      .orderBy(asc(lists.name))
  }

  /** Reorder lists within a project; writes each list's position to its index. */
  async reorderLists(projectId: string, orderedIds: string[], actorId?: string) {
    const all = await this.getListsByProject(projectId)
    const validIds = new Set(all.map((l) => l.id))
    const missing = orderedIds.filter((id) => !validIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`These ids are not lists of this project: ${missing.join(', ')}`)
    }
    if (orderedIds.length !== all.length) {
      throw new BadRequestException('orderedIds must contain every list of the project exactly once')
    }
    if (actorId && all[0]) await this.assertManageable(all[0].id, actorId)
    await Promise.all(
      orderedIds.map((id, position) =>
        this.db.update(lists).set({ position, updatedAt: new Date() }).where(eq(lists.id, id)),
      ),
    )
    return this.getListsByProject(projectId)
  }

  async getList(listId: string) {
    const [list] = await this.db
      .select()
      .from(lists)
      .where(eq(lists.id, listId))
    return list ?? null
  }

  async updateList(
    listId: string,
    data: Partial<{ name: string; description: string; visibility: 'public' | 'private' }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(listId, actorId)
    if (data.visibility !== undefined && data.visibility !== 'public' && data.visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    // Whitelist updatable columns rather than spreading the untyped body — a
    // stray `position: true` would otherwise hit the integer column and 500.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'description', 'visibility'] as const) {
      if (data[key] !== undefined) set[key] = data[key]
    }
    // Renaming obeys the same rule as creating, or the constraint is half a
    // rule: blocked at the front door and open at the side.
    if (data.name !== undefined) {
      const [owner] = await this.db
        .select({ projectId: lists.projectId })
        .from(lists)
        .where(eq(lists.id, listId))
        .limit(1)
      if (owner) await this.assertListNameFree(owner.projectId, data.name, listId)
    }
    const result = await this.db
      .update(lists)
      .set(set)
      .where(eq(lists.id, listId))
      .returning()

    return result[0]
  }

  async deleteList(listId: string, actorId?: string, ipAddress?: string) {
    const ctx = actorId ? await this.assertManageable(listId, actorId, 'delete') : null
    await this.db
      .update(lists)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(lists.id, listId))
    if (actorId && ctx) {
      // §13.3 — audit the container deletion (list archival).
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'list.deleted',
        resourceType: 'list',
        resourceId: listId,
        description: `Archived list "${ctx.name}"`,
        ipAddress,
      })
    }
  }

  /**
   * Move a list into another project (its tasks follow). The destination must
   * be in the same workspace and not archived.
   */
  async moveList(listId: string, targetProjectId: string, actorId?: string, ipAddress?: string) {
    const src = actorId
      ? await this.assertManageable(listId, actorId)
      : (await this.db
          .select({ name: lists.name, workspaceId: spaces.workspaceId, spaceId: projects.spaceId })
          .from(lists)
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(eq(lists.id, listId))
          .limit(1))[0]
    if (!src) throw new NotFoundException('List not found')

    const [dest] = await this.db
      .select({ name: projects.name, workspaceId: spaces.workspaceId, isArchived: projects.isArchived })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, targetProjectId))
      .limit(1)
    if (!dest) throw new NotFoundException('Target project not found')
    if (dest.workspaceId !== src.workspaceId) {
      throw new BadRequestException('A list can only be moved within its own workspace')
    }
    if (dest.isArchived) throw new BadRequestException('Cannot move into a deleted project')

    const [row] = await this.db
      .update(lists)
      .set({ projectId: targetProjectId, updatedAt: new Date() })
      .where(eq(lists.id, listId))
      .returning()

    if (actorId) {
      await this.security.logAuditEvent({
        workspaceId: src.workspaceId,
        actorId,
        action: 'list.moved',
        resourceType: 'list',
        resourceId: listId,
        description: `Moved list "${src.name}" to project "${dest.name}"`,
        ipAddress,
        metadata: { toProjectId: targetProjectId },
      })
    }
    return row
  }

  private async assertManageable(listId: string, actorId: string, action: 'manage' | 'delete' = 'manage') {
    const [row] = await this.db
      .select({
        createdById: lists.createdById,
        workspaceId: spaces.workspaceId,
        name: lists.name,
        spaceId: projects.spaceId,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!row) throw new NotFoundException('List not found')
    await assertCanManageContainer(this.db, {
      workspaceId: row.workspaceId,
      createdById: row.createdById,
      actorId,
      kind: 'list',
      action,
      // Managers may delete a list only within a space they belong to.
      spaceId: row.spaceId,
    })
    return row
  }
}
