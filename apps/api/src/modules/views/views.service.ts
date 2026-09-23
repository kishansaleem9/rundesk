import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm'
import { taskViews, taskViewPrefs, lists, projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db, ViewVisibility } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isManagerRole } from '../../common/permissions/item-visibility'

type ViewType = 'list' | 'board' | 'calendar' | 'gantt' | 'table'

const VISIBILITIES: readonly ViewVisibility[] = ['everyone', 'private', 'protected']


/** A view `config` is a keyed object — reject a string/array/primitive so a
 *  reader that reaches into `config.columns` etc. never meets a wrong type. */
function assertConfigObject(config: unknown) {
  if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
    throw new BadRequestException('View "config" must be an object')
  }
}

export type ViewActor = { id: string; role?: string }

@Injectable()
export class ViewsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * Is this actor a manager of the workspace the view's list belongs to?
   *
   * Resolved from the view rather than passed in, because the caller that
   * matters (`PATCH /views/:viewId`) knows a view id and nothing else — a
   * workspace id it took from the request body would be the caller's claim
   * about which workspace to check, which is not a check.
   */
  private async isManagerOfViewsWorkspace(viewId: string, actor: ViewActor): Promise<boolean> {
    if (actor.role === 'super_admin') return true
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(taskViews)
      .innerJoin(lists, eq(lists.id, taskViews.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, spaces.workspaceId),
          eq(workspaceMembers.userId, actor.id),
        ),
      )
      .where(eq(taskViews.id, viewId))
      .limit(1)
    // `isManagerRole`, not a list of its own: the copy that was here read
    // `owner`, `admin` and `manager` — two roles no workspace member has —
    // so a manager could change a protected view and a workspace admin could not.
    return !!row && isManagerRole(row.role)
  }

  /**
   * The views on a list that this actor may see, pinned ones first.
   *
   * A private view belonging to somebody else is not in the result. Not
   * greyed out, not listed as "private" — absent, because the NAME of a
   * private view is part of what makes it private.
   *
   * `autosave` rides along per row: it is this actor's own flag, so the tab
   * strip can render the switch without a second round trip per view.
   */
  async listByList(listId: string, actor: ViewActor) {
    const rows = await this.db
      .select({
        id: taskViews.id,
        listId: taskViews.listId,
        createdById: taskViews.createdById,
        name: taskViews.name,
        type: taskViews.type,
        isDefault: taskViews.isDefault,
        isPinned: taskViews.isPinned,
        visibility: taskViews.visibility,
        position: taskViews.position,
        config: taskViews.config,
        createdAt: taskViews.createdAt,
        updatedAt: taskViews.updatedAt,
        autosave: sql<boolean>`coalesce(${taskViewPrefs.autosave}, false)`.as('autosave'),
      })
      .from(taskViews)
      .leftJoin(
        taskViewPrefs,
        and(eq(taskViewPrefs.viewId, taskViews.id), eq(taskViewPrefs.userId, actor.id)),
      )
      .where(
        and(
          eq(taskViews.listId, listId),
          actor.role === 'super_admin'
            ? undefined
            : or(ne(taskViews.visibility, 'private'), eq(taskViews.createdById, actor.id)),
        ),
      )
      // Pinned first `[frame 10:36 "Pin view"]`, then the order the list was
      // arranged in. `desc` on a boolean puts true first in Postgres.
      .orderBy(desc(taskViews.isPinned), asc(taskViews.position), asc(taskViews.createdAt))
    return rows
  }

  async create(data: {
    listId: string
    name: string
    type: ViewType
    config?: Record<string, unknown>
    visibility?: ViewVisibility
    createdById: string
  }) {
    assertConfigObject(data.config)
    if (data.visibility !== undefined && !VISIBILITIES.includes(data.visibility)) {
      throw new BadRequestException(`Unknown view visibility "${data.visibility}"`)
    }
    const existing = await this.db
      .select({ id: taskViews.id })
      .from(taskViews)
      .where(eq(taskViews.listId, data.listId))
    const [row] = await this.db
      .insert(taskViews)
      .values({
        listId: data.listId,
        name: data.name,
        type: data.type,
        config: data.config ?? {},
        visibility: data.visibility ?? 'everyone',
        isDefault: existing.length === 0,
        createdById: data.createdById,
      })
      .returning()
    return row
  }

  /**
   * Read one view, or 404 — the single place that decides whether this actor
   * is allowed to know a view exists.
   */
  private async loadVisible(viewId: string, actor: ViewActor) {
    const [row] = await this.db.select().from(taskViews).where(eq(taskViews.id, viewId)).limit(1)
    if (!row) throw new NotFoundException('View not found')
    const mine = row.createdById === actor.id
    if (row.visibility === 'private' && !mine && actor.role !== 'super_admin') {
      // 404, not 403: "you may not see this" tells you it is there.
      throw new NotFoundException('View not found')
    }
    return row
  }

  async getOne(viewId: string, actor: ViewActor) {
    return this.loadVisible(viewId, actor)
  }

  /**
   * Who may change a view.
   *
   *   private    its creator, and nobody else — they are the only one who can
   *              see it, so there is nobody else to ask.
   *   protected  its creator and the workspace's managers. This is the switch's
   *              entire purpose.
   *   everyone   anyone who can open the list, which is what every view was
   *              before this existed, and what ClickUp does with an unprotected
   *              view. Protect view is how you opt out of it.
   */
  private async assertMayWrite(row: typeof taskViews.$inferSelect, actor: ViewActor) {
    if (row.createdById === actor.id || actor.role === 'super_admin') return
    if (row.visibility === 'everyone') return
    if (await this.isManagerOfViewsWorkspace(row.id, actor)) return
    throw new ForbiddenException(
      row.visibility === 'protected'
        ? 'This view is protected — only its owner or a workspace manager can change it'
        : 'View not found',
    )
  }

  async update(
    viewId: string,
    patch: {
      name?: string
      config?: Record<string, unknown>
      position?: number
      isDefault?: boolean
      isPinned?: boolean
      visibility?: ViewVisibility
    },
    actor: ViewActor,
  ) {
    assertConfigObject(patch.config)
    if (patch.position !== undefined && (typeof patch.position !== 'number' || !Number.isInteger(patch.position))) {
      throw new BadRequestException('View position must be an integer')
    }
    if (patch.visibility !== undefined && !VISIBILITIES.includes(patch.visibility)) {
      throw new BadRequestException(`Unknown view visibility "${patch.visibility}"`)
    }
    const existing = await this.loadVisible(viewId, actor)
    await this.assertMayWrite(existing, actor)

    /*
     * Changing the visibility itself is the owner's and the managers' call
     * only — an `everyone` view that anybody could flip to `private` would let
     * one member hide a view the whole team works in, and the check above lets
     * anybody edit an `everyone` view.
     */
    if (patch.visibility !== undefined && patch.visibility !== existing.visibility) {
      const owner = existing.createdById === actor.id || actor.role === 'super_admin'
      if (!owner && !(await this.isManagerOfViewsWorkspace(viewId, actor))) {
        throw new ForbiddenException('Only the view\'s owner or a workspace manager can change who can see it')
      }
    }

    /*
     * A private view cannot be the list's default: the default is what
     * everyone lands on, and nobody else can open this one. Refused rather
     * than silently un-defaulted, because a switch that quietly undoes another
     * switch is worse than one that says no.
     */
    const nextVisibility = patch.visibility ?? existing.visibility
    const nextDefault = patch.isDefault ?? existing.isDefault
    if (nextVisibility === 'private' && nextDefault) {
      throw new BadRequestException('A private view cannot be the default view for the list')
    }

    if (patch.isDefault === true) {
      await this.db
        .update(taskViews)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(taskViews.listId, existing.listId))
    }
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'config', 'position', 'isDefault', 'isPinned', 'visibility'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    const [row] = await this.db
      .update(taskViews)
      .set(set)
      .where(eq(taskViews.id, viewId))
      .returning()
    if (!row) throw new NotFoundException('View not found')
    return row
  }

  async delete(viewId: string, actor: ViewActor) {
    const existing = await this.loadVisible(viewId, actor)
    await this.assertMayWrite(existing, actor)
    const [row] = await this.db.delete(taskViews).where(eq(taskViews.id, viewId)).returning()
    if (!row) throw new NotFoundException('View not found')
    return { ok: true }
  }

  /**
   * "Autosave for me" — per user, by the tooltip in frame `10:36`. Reading a
   * view you may see is enough to set your own flag on it; you are not
   * changing the view.
   */
  async setAutosave(viewId: string, actor: ViewActor, autosave: boolean) {
    await this.loadVisible(viewId, actor)
    await this.db
      .insert(taskViewPrefs)
      .values({ viewId, userId: actor.id, autosave })
      .onConflictDoUpdate({
        target: [taskViewPrefs.viewId, taskViewPrefs.userId],
        set: { autosave, updatedAt: new Date() },
      })
    return { viewId, autosave }
  }
}
