import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import { taskViews, taskViewPrefs, lists, projects, spaces, workspaceMembers, objectShares } from '@rundesk/db'
import type { Db, SpaceDefaultPermission, ViewVisibility } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isManagerRole } from '../../common/permissions/item-visibility'
import { assertSpaceLevel, resolveSpaceLevel, spaceLevelReaches, type WithinStep } from '../../common/permissions/space-default-permission'
import {
  SHARED_VIEW_DELETE_LEVEL, SHARED_VIEW_LEVEL, levelOnView, viewOffers, viewWriteBar,
  type ViewActor, type ViewWriteFacts,
} from './view-write'

type ViewType = 'list' | 'board' | 'calendar' | 'gantt' | 'table'

const VISIBILITIES: readonly ViewVisibility[] = ['everyone', 'private', 'protected']

type ViewsTx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * ONE WRITER OF A LIST'S DEFAULT AT A TIME. Making a view (the list's first
 * shared one becomes its default) and Make default each read the list's views
 * and then write them; side by side, each read what the other had not yet
 * written, and a list was left with several defaults — six requests at once
 * on an empty list left four and six, three Make defaults at once left three
 * (lane 6, 5 October). The lock is the transaction's, released when it ends.
 */
function lockListViews(tx: ViewsTx, listId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`task-views:${listId}`}))`)
}


/** A view `config` is a keyed object — reject a string/array/primitive so a
 *  reader that reaches into `config.columns` etc. never meets a wrong type. */
function assertConfigObject(config: unknown) {
  if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
    throw new BadRequestException('View "config" must be an object')
  }
}

export type { ViewActor }

@Injectable()
export class ViewsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** The list's space, and the list with the containers above it, for the level its shared views ask. */
  private async listPlace(listId: string): Promise<{ spaceId: string; within: WithinStep[] } | null> {
    const [row] = await this.db
      .select({ spaceId: spaces.id, projectId: projects.id, folderId: projects.folderId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!row) return null
    return {
      spaceId: row.spaceId,
      within: [
        { type: 'list', id: listId },
        { type: 'project', id: row.projectId },
        ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
      ],
    }
  }

  /**
   * REFUSE A WRITE TO THE LIST'S SHARED VIEWS BELOW ITS LEVEL, in the level's
   * own words (`assertSpaceLevel`): "This space's default permission is "View
   * only", which does not allow changing its shared views", or a guest's "What
   * is shared with you here is …". See `view-write.ts` for the rule and
   * ClickUp's.
   *
   * `viewId` asks the level ON THAT VIEW: a share on the view itself decides
   * before the list's (`levelOnView`). Without it, the level on the list — for
   * a view not made yet, and for the list's default. `required` is Edit unless
   * said: deleting asks Full edit (`SHARED_VIEW_DELETE_LEVEL`).
   */
  private async assertSharedViewLevel(
    listId: string,
    actor: ViewActor,
    words: { kind: string; act?: string },
    on: { viewId?: string; required?: SpaceDefaultPermission } = {},
  ) {
    if (actor.role === 'super_admin') return
    const place = await this.listPlace(listId)
    if (!place) throw new NotFoundException('List not found')
    await assertSpaceLevel(this.db, {
      spaceId: place.spaceId,
      actorId: actor.id,
      required: on.required ?? SHARED_VIEW_LEVEL,
      kind: words.kind,
      within: on.viewId ? [{ type: 'view', id: on.viewId }, ...place.within] : place.within,
      ...(words.act ? { act: words.act } : {}),
    })
  }

  /**
   * What the write rule needs to know of this actor on each of a list's views,
   * asked once for them all: the level on the list (`resolveSpaceLevel`), the
   * actor's own shares on these views (one query), and whether a protected view
   * answers to them as a manager. Each view's level is then `levelOnView`, as a
   * write to it asks it (`assertSharedViewLevel` with its `viewId`).
   */
  private async writeFacts(listId: string, actor: ViewActor, viewIds: string[]): Promise<(viewId: string) => ViewWriteFacts> {
    if (actor.role === 'super_admin') {
      return () => ({ reachesLevel: true, reachesDelete: true, listReachesLevel: true, manager: true })
    }
    const place = await this.listPlace(listId)
    const onList = place
      ? await resolveSpaceLevel(this.db, { spaceId: place.spaceId, actorId: actor.id, within: place.within })
      : null
    const shares = viewIds.length
      ? await this.db
          .select({ viewId: objectShares.objectId, level: objectShares.level })
          .from(objectShares)
          .where(and(eq(objectShares.userId, actor.id), eq(objectShares.objectType, 'view'), inArray(objectShares.objectId, viewIds)))
      : []
    const shareOn = new Map(shares.map((s) => [s.viewId, s.level as SpaceDefaultPermission]))
    // Every view is on this one list, so any of them names its workspace for the managers' question.
    const manager = viewIds.length ? await this.isManagerOfViewsWorkspace(viewIds[0], actor) : false
    // Nothing resolved is somebody no space setting narrows, as every rule reads it.
    const reaches = (level: SpaceDefaultPermission | null, required: SpaceDefaultPermission) =>
      !!place && (level === null || spaceLevelReaches(level, required))
    const listReachesLevel = reaches(onList?.level ?? null, SHARED_VIEW_LEVEL)
    return (viewId) => {
      const level = levelOnView(onList, shareOn.get(viewId) ?? null)
      return {
        reachesLevel: reaches(level, SHARED_VIEW_LEVEL),
        reachesDelete: reaches(level, SHARED_VIEW_DELETE_LEVEL),
        listReachesLevel,
        manager,
      }
    }
  }

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
   *
   * So do `mayChange`, `mayDelete`, `mayMakeDefault`, `mayChangeVisibility`
   * and `mayMakePrivate`: what the write routes below would answer this actor
   * on each view (`viewOffers`), so the view menu and the Customize panel offer
   * only that. They offered Update, Rename, Make default and Delete on every
   * view to everybody (`found-5-oct/readers-change-shared-views`).
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
    if (rows.length === 0) return rows
    const factsOf = await this.writeFacts(listId, actor, rows.map((row) => row.id))
    return rows.map((row) => ({ ...row, ...viewOffers(row, actor, factsOf(row.id)) }))
  }

  /**
   * Make a view. A PRIVATE one is anybody's who reads the list: it is theirs
   * alone. A SHARED one — "everyone" or "protected", and "everyone" when none
   * is said — goes into every reader's strip, so it asks the list's level, as
   * ClickUp's "create views" does (`view-write.ts`); a member of a view-only
   * space and a guest with a view share were given 201.
   *
   * The list's first SHARED view becomes its default, as the first view always
   * has. A private one never does — the default is what everybody lands on, and
   * `update` refuses a private default — and private views are not counted, so
   * a reader's own view does not decide whether the next shared one is the
   * default. A reader's first view on an empty list became the list's default,
   * shared, and the admin's list then opened on it.
   *
   * ONE DEFAULT. Counting and making are one transaction under the list's lock
   * (`lockListViews`): made side by side, each counted none and each became the
   * default. And a private view this rule made the default before it counted
   * only shared ones gives the default up to the first shared view, which
   * otherwise became a second default beside it.
   */
  async create(
    data: {
      listId: string
      name: string
      type: ViewType
      config?: Record<string, unknown>
      visibility?: ViewVisibility
      createdById: string
    },
    actor: ViewActor,
  ) {
    assertConfigObject(data.config)
    if (data.visibility !== undefined && !VISIBILITIES.includes(data.visibility)) {
      throw new BadRequestException(`Unknown view visibility "${data.visibility}"`)
    }
    const visibility = data.visibility ?? 'everyone'
    if (visibility !== 'private') {
      await this.assertSharedViewLevel(data.listId, actor, { kind: 'shared view', act: 'adding a' })
    }
    return this.db.transaction(async (tx) => {
      await lockListViews(tx, data.listId)
      const shared = await tx
        .select({ id: taskViews.id })
        .from(taskViews)
        .where(and(eq(taskViews.listId, data.listId), ne(taskViews.visibility, 'private')))
      const isDefault = visibility !== 'private' && shared.length === 0
      if (isDefault) {
        await tx
          .update(taskViews)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(taskViews.listId, data.listId), eq(taskViews.isDefault, true)))
      }
      const [row] = await tx
        .insert(taskViews)
        .values({
          listId: data.listId,
          name: data.name,
          type: data.type,
          config: data.config ?? {},
          visibility,
          isDefault,
          createdById: data.createdById,
        })
        .returning()
      return row
    })
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
   * Who may change a view (`viewWriteBar`, `view-write.ts`).
   *
   *   private    its creator, and nobody else, at any level — they are the
   *              only one who can see it, so it changes nothing anybody else
   *              sees. (Behind `loadVisible`, which answers anybody else
   *              404 first.)
   *   everyone   whoever's level on the view reaches Edit — a share on the
   *              view itself, then the list's chain — and Full edit to delete
   *              it. This said "anyone who can open the list", and a member of
   *              a view-only space and a guest with a view share renamed,
   *              reconfigured, re-defaulted and deleted the views everybody
   *              works in (`found-5-oct/readers-change-shared-views`).
   *   protected  the same, and then only its creator and the workspace's
   *              managers. This is the switch's entire purpose.
   *
   * The level is asked first, and refused in its own words: "changing its
   * shared views", or "deleting its shared views".
   */
  private async assertMayWrite(row: typeof taskViews.$inferSelect, actor: ViewActor, act: 'change' | 'delete' = 'change') {
    if (row.visibility !== 'private') {
      await this.assertSharedViewLevel(
        row.listId,
        actor,
        { kind: 'shared views', act: act === 'delete' ? 'deleting its' : 'changing its' },
        { viewId: row.id, required: act === 'delete' ? SHARED_VIEW_DELETE_LEVEL : SHARED_VIEW_LEVEL },
      )
    }
    const bar = viewWriteBar(row, actor, {
      // Asked just above, where a refusal has its words.
      reachesLevel: true,
      reachesDelete: true,
      listReachesLevel: true,
      manager:
        row.visibility === 'protected' && row.createdById !== actor.id && actor.role !== 'super_admin'
          ? await this.isManagerOfViewsWorkspace(row.id, actor)
          : false,
    }, act)
    if (bar === 'private') {
      throw new ForbiddenException('This view is private — only the person who made it can change it')
    }
    if (bar === 'protected') {
      throw new ForbiddenException('This view is protected — only its owner or a workspace manager can change it')
    }
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
    const nextVisibility = patch.visibility ?? existing.visibility

    /*
     * Making a private view shared puts it in everybody's strip: a shared view
     * made, and asked as making one is. Its owner may change a private view at
     * any level, so the check above does not ask it.
     */
    if (existing.visibility === 'private' && nextVisibility !== 'private') {
      await this.assertSharedViewLevel(existing.listId, actor, { kind: 'shared view', act: 'adding a' })
    }

    /*
     * Changing the visibility itself is the owner's and the managers' call
     * only — an `everyone` view that anybody could flip to `private` would let
     * one member hide a view the whole team works in, and the check above lets
     * anybody whose level on the view reaches Edit edit an `everyone` view.
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
    const nextDefault = patch.isDefault ?? existing.isDefault
    if (nextVisibility === 'private' && nextDefault) {
      throw new BadRequestException('A private view cannot be the default view for the list')
    }

    /*
     * The list's default is the LIST's: which view everybody lands on, and the
     * view it was taken from. So beside the view's own level (above), it asks
     * the list's, and a share on one view does not choose what the whole list
     * opens on.
     */
    if (patch.isDefault !== undefined && patch.isDefault !== existing.isDefault) {
      await this.assertSharedViewLevel(existing.listId, actor, { kind: 'default view', act: 'changing its' })
    }

    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'config', 'position', 'isDefault', 'isPinned', 'visibility'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    // One default per list: the others give it up in the same transaction,
    // under the list's lock, so two Make defaults at once leave one (`lockListViews`).
    const row = await this.db.transaction(async (tx) => {
      if (patch.isDefault === true) {
        await lockListViews(tx, existing.listId)
        await tx
          .update(taskViews)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(taskViews.listId, existing.listId), eq(taskViews.isDefault, true), ne(taskViews.id, viewId)))
      }
      const [written] = await tx
        .update(taskViews)
        .set(set)
        .where(eq(taskViews.id, viewId))
        .returning()
      return written
    })
    if (!row) throw new NotFoundException('View not found')
    return row
  }

  async delete(viewId: string, actor: ViewActor) {
    const existing = await this.loadVisible(viewId, actor)
    await this.assertMayWrite(existing, actor, 'delete')
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
