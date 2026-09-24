import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import {
  favorites,
  spaces,
  projects,
  lists,
  tasks,
  docs,
  chatChannels,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { resolveIsManager, taskVisibilityFilter, listVisibilityFilter } from '../../common/permissions/item-visibility'
import { containerVisibilityFilter, spaceVisibilityFilter } from '../../common/permissions/container-access.guard-helper'
import { hiddenDocIds } from '../../common/permissions/doc-access'
import { readableChannelsFilter } from '../chat/channel-read-filter'

export type FavoriteEntityType = 'space' | 'list' | 'task' | 'doc' | 'channel'
const ENTITY_TYPES: FavoriteEntityType[] = ['space', 'list', 'task', 'doc', 'channel']

type ResolvedEntity = {
  entityType: FavoriteEntityType
  entityId: string
  label: string
  url: string
}

@Injectable()
export class FavoritesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private assertType(entityType: string): asserts entityType is FavoriteEntityType {
    if (!ENTITY_TYPES.includes(entityType as FavoriteEntityType)) {
      throw new BadRequestException(`Unsupported favorite type: ${entityType}`)
    }
  }

  /**
   * Resolve display metadata for a batch of entity ids of one type, scoped to
   * the workspace AND to what the actor may open. Ids that don't exist, moved
   * out of the workspace, or are out of the actor's reach are absent from the
   * returned map, which drives dangling-row pruning — and refuses `toggle`.
   *
   * Each type takes the rule its own reads take. A space, a doc and a channel
   * took none and a list or a task only its private flag, so a favourite was a
   * way to read the name of anything by id: measured on lane 1, a member
   * refused a private space favourited its space, list, task, doc and channel,
   * and a private channel they were not in, and the list named every one.
   */
  private async resolveBatch(
    workspaceId: string,
    entityType: FavoriteEntityType,
    ids: string[],
    actor: { id: string; isManager: boolean },
  ): Promise<Map<string, ResolvedEntity>> {
    const out = new Map<string, ResolvedEntity>()
    if (ids.length === 0) return out

    if (entityType === 'space') {
      const rows = await this.db
        .select({ id: spaces.id, name: spaces.name })
        .from(spaces)
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(spaces.id, ids), spaceVisibilityFilter(this.db, actor.id, actor.isManager)))
      for (const r of rows) {
        out.set(r.id, { entityType, entityId: r.id, label: r.name, url: `/app/${workspaceId}/${r.id}` })
      }
    } else if (entityType === 'list') {
      const rows = await this.db
        .select({ id: lists.id, name: lists.name, projectId: projects.id, spaceId: spaces.id })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(spaces.workspaceId, workspaceId),
            inArray(lists.id, ids),
            containerVisibilityFilter(this.db, actor.id, actor.isManager),
            listVisibilityFilter(actor.id, actor.isManager),
          ),
        )
      for (const r of rows) {
        out.set(r.id, {
          entityType,
          entityId: r.id,
          label: r.name,
          url: `/app/${workspaceId}/${r.spaceId}/${r.projectId}/${r.id}`,
        })
      }
    } else if (entityType === 'task') {
      const rows = await this.db
        .select({ id: tasks.id, title: tasks.title, listId: lists.id, projectId: projects.id, spaceId: spaces.id })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(
          and(
            eq(spaces.workspaceId, workspaceId),
            inArray(tasks.id, ids),
            containerVisibilityFilter(this.db, actor.id, actor.isManager),
            taskVisibilityFilter(this.db, actor.id, actor.isManager),
          ),
        )
      for (const r of rows) {
        out.set(r.id, {
          entityType,
          entityId: r.id,
          label: r.title,
          url: `/app/${workspaceId}/${r.spaceId}/${r.projectId}/${r.listId}?task=${r.id}`,
        })
      }
    } else if (entityType === 'doc') {
      const hidden = await hiddenDocIds(this.db, workspaceId, actor.id, actor.isManager)
      const rows = await this.db
        .select({ id: docs.id, title: docs.title })
        .from(docs)
        .where(and(eq(docs.workspaceId, workspaceId), inArray(docs.id, ids), hidden.length ? notInArray(docs.id, hidden) : undefined))
      for (const r of rows) {
        out.set(r.id, { entityType, entityId: r.id, label: r.title, url: `/app/${workspaceId}/docs?doc=${r.id}` })
      }
    } else if (entityType === 'channel') {
      const rows = await this.db
        .select({ id: chatChannels.id, name: chatChannels.name })
        .from(chatChannels)
        .where(and(eq(chatChannels.workspaceId, workspaceId), inArray(chatChannels.id, ids), readableChannelsFilter(this.db, actor.id, workspaceId)))
      for (const r of rows) {
        out.set(r.id, { entityType, entityId: r.id, label: `#${r.name}`, url: `/app/${workspaceId}/chat?channel=${r.id}` })
      }
    }
    return out
  }

  /** List a user's favorites in a workspace, hydrated + pruned of dangling rows. */
  async list(workspaceId: string, userId: string, actorRole?: string) {
    const rows = await this.db
      .select()
      .from(favorites)
      .where(and(eq(favorites.workspaceId, workspaceId), eq(favorites.userId, userId)))

    // §2 per-item privacy: the favorites owner is the actor — hide private
    // tasks/lists they may not see (creator/assignee/manager only).
    const isManager = await resolveIsManager(this.db, workspaceId, userId, actorRole)
    const actor = { id: userId, isManager }

    // Group ids by type, resolve each type in one query.
    const byType = new Map<FavoriteEntityType, string[]>()
    for (const r of rows) {
      const list = byType.get(r.entityType) ?? []
      list.push(r.entityId)
      byType.set(r.entityType, list)
    }
    const resolved = new Map<string, ResolvedEntity>() // key: `${type}:${id}`
    for (const [type, ids] of byType) {
      const map = await this.resolveBatch(workspaceId, type, ids, actor)
      for (const [id, meta] of map) resolved.set(`${type}:${id}`, meta)
    }

    const hydrated: Array<{ id: string; entityType: FavoriteEntityType; entityId: string; label: string; url: string; createdAt: Date }> = []
    const stale: string[] = []
    for (const r of rows) {
      const meta = resolved.get(`${r.entityType}:${r.entityId}`)
      if (!meta) {
        stale.push(r.id)
        continue
      }
      hydrated.push({ id: r.id, entityType: r.entityType, entityId: r.entityId, label: meta.label, url: meta.url, createdAt: r.createdAt })
    }

    // Prune favorites whose target no longer exists / left the workspace.
    if (stale.length > 0) {
      await this.db.delete(favorites).where(inArray(favorites.id, stale))
    }

    // Newest first.
    hydrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return hydrated
  }

  /** Add or remove a favorite; returns the new favorited state. */
  async toggle(workspaceId: string, userId: string, entityType: string, entityId: string, actorRole?: string) {
    this.assertType(entityType)
    if (!entityId) throw new BadRequestException('entityId is required')

    // The target must exist, belong to this workspace, and be visible to the
    // caller — you cannot favorite a private task/list you may not see (§2).
    const isManager = await resolveIsManager(this.db, workspaceId, userId, actorRole)
    const resolved = await this.resolveBatch(workspaceId, entityType, [entityId], { id: userId, isManager })
    if (!resolved.has(entityId)) throw new NotFoundException('That item does not exist in this workspace')

    const [existing] = await this.db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)))
      .limit(1)

    if (existing) {
      await this.db.delete(favorites).where(eq(favorites.id, existing.id))
      return { favorited: false, entityType, entityId }
    }

    await this.db
      .insert(favorites)
      .values({ workspaceId, userId, entityType, entityId })
      .onConflictDoNothing()
    return { favorited: true, entityType, entityId }
  }

  /** Remove a favorite (idempotent). */
  async remove(workspaceId: string, userId: string, entityType: string, entityId: string) {
    this.assertType(entityType)
    await this.db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)))
    return { favorited: false, entityType, entityId }
  }
}
