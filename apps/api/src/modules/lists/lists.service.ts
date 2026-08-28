import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, asc, type SQL } from 'drizzle-orm'
import { lists, listStatuses, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { resolveIsManager, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { SecurityService } from '../security/security.service'

/**
 * Default status pipeline seeded on every new list. Existing lists were
 * back-filled with the same rows in migration `0020_custom_list_statuses.sql`.
 */
const DEFAULT_LIST_STATUSES = [
  { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,         position: 0 },
  { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,         position: 1 },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const,  position: 2 },
  { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const,  position: 3 },
  { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,       position: 4 },
  { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,       position: 5 },
]

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
  async createList(
    projectId: string,
    data: { name: string; description?: string; visibility?: 'public' | 'private' },
    actorId?: string,
  ) {
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
    await this.db
      .insert(listStatuses)
      .values(DEFAULT_LIST_STATUSES.map((s) => ({ listId: list.id, ...s })))
      .onConflictDoNothing()

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
