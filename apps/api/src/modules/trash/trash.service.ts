import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, lt, isNotNull, sql } from 'drizzle-orm'
import { spaces, folders, projects, lists, tasks, docs, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isAdminRole } from '../../common/permissions/workspace-roles'
import { SecurityService } from '../security/security.service'
import { SearchService } from '../search/search.service'

/** Item kinds the workspace Trash can hold. */
export const TRASH_TYPES = ['space', 'folder', 'project', 'list', 'task', 'doc'] as const
export type TrashType = (typeof TRASH_TYPES)[number]

/** Deleted items are kept this long before the nightly purge removes them. */
export const TRASH_RETENTION_DAYS = 30

export interface TrashItem {
  id: string
  type: TrashType
  name: string
  /** Human breadcrumb of where the item used to live, e.g. "Product › Website Redesign". */
  location: string
  deletedAt: string | null
  deletedBy: { id: string; name: string; avatarUrl: string | null } | null
}

export interface TrashQuery {
  types?: TrashType[]
  /** Restrict to items deleted by these users (the "Deleted by" filter). */
  deletedByIds?: string[]
  search?: string
}

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
    private search: SearchService,
  ) {}

  // ─── permissions ────────────────────────────────────────────────────────────

  /**
   * Workspace admins/managers (and super admins) administer the whole Trash.
   * A regular member still gets a Trash, but only of the items they deleted
   * themselves — so one member can undo their own mistake without being handed
   * everyone else's deleted work.
   */
  private async resolveScope(workspaceId: string, actor: { id: string; role?: string }) {
    if (actor.role === 'super_admin') return { isAdmin: true }
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('Not a member of this workspace')
    /*
     * AN ADMIN'S TRASH IS THE WORKSPACE'S; EVERYONE ELSE'S IS THEIR OWN.
     * ClickUp ("Restore items from the Trash"): "The Workspace owner and admins
     * can see, restore, or permanently delete any public items. Members and
     * guests can only see and restore items they have deleted." A manager was
     * counted as an admin here — listing, restoring and purging everybody's —
     * and nothing said so anywhere else (`found-28-sep/trash-deletes-for-good-wider-than-clickup`).
     */
    return { isAdmin: isAdminRole(member.role) }
  }

  private async assertAdmin(workspaceId: string, actor: { id: string; role?: string }) {
    const { isAdmin } = await this.resolveScope(workspaceId, actor)
    if (!isAdmin) throw new ForbiddenException('Only a workspace admin deletes from the Trash for good')
  }

  // ─── listing ────────────────────────────────────────────────────────────────

  async list(workspaceId: string, actor: { id: string; role?: string }, query: TrashQuery = {}): Promise<TrashItem[]> {
    const { isAdmin } = await this.resolveScope(workspaceId, actor)
    const wanted = new Set<TrashType>(query.types?.length ? query.types : [...TRASH_TYPES])
    // A non-admin only ever sees what they deleted; an explicit "Deleted by"
    // filter narrows further (never widens).
    const restrictTo = isAdmin ? query.deletedByIds ?? null : [actor.id]
    const term = query.search?.trim().toLowerCase() || null

    const rows: TrashItem[] = []
    const deleter = (r: { byId: string | null; byName: string | null; byAvatar: string | null }) =>
      r.byId ? { id: r.byId, name: r.byName ?? 'Unknown', avatarUrl: r.byAvatar } : null
    const stamp = (d: Date | null) => (d ? new Date(d).toISOString() : null)

    if (wanted.has('space')) {
      const res = await this.db
        .select({
          id: spaces.id, name: spaces.name, at: spaces.archivedAt,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(spaces)
        .leftJoin(users, eq(users.id, spaces.archivedById))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'space', name: r.name, location: '', deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    if (wanted.has('folder')) {
      const res = await this.db
        .select({
          id: folders.id, name: folders.name, at: folders.archivedAt, spaceName: spaces.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(folders)
        .innerJoin(spaces, eq(spaces.id, folders.spaceId))
        .leftJoin(users, eq(users.id, folders.archivedById))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(folders.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'folder', name: r.name, location: r.spaceName, deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    if (wanted.has('project')) {
      const res = await this.db
        .select({
          id: projects.id, name: projects.name, at: projects.archivedAt, spaceName: spaces.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .leftJoin(users, eq(users.id, projects.archivedById))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(projects.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'project', name: r.name, location: r.spaceName, deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    if (wanted.has('list')) {
      const res = await this.db
        .select({
          id: lists.id, name: lists.name, at: lists.archivedAt, spaceName: spaces.name, projectName: projects.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .leftJoin(users, eq(users.id, lists.archivedById))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(lists.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'list', name: r.name, location: `${r.spaceName} › ${r.projectName}`, deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    /*
     * §V2-08 frame `15:32` — TASKS COME IN ON `deletedAt`, NOT `isArchived`.
     *
     * The frame's menu draws Archive and Delete as two rows and this query used
     * to make them one: it listed every archived task, so archiving a task put
     * it in the Trash with a thirty-day clock on it and there was no way to
     * delete one at all. `deletedAt` is set only by `POST /tasks/:id/trash`, so
     * an archived task is never listed here and is never purged, and everything
     * listed here really was deleted.
     */
    if (wanted.has('task')) {
      const res = await this.db
        .select({
          id: tasks.id, name: tasks.title, at: tasks.deletedAt,
          spaceName: spaces.name, projectName: projects.name, listName: lists.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .leftJoin(users, eq(users.id, tasks.deletedById))
        .where(and(eq(spaces.workspaceId, workspaceId), isNotNull(tasks.deletedAt)))
      for (const r of res) rows.push({ id: r.id, type: 'task', name: r.name, location: `${r.spaceName} › ${r.projectName} › ${r.listName}`, deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    if (wanted.has('doc')) {
      const res = await this.db
        .select({
          id: docs.id, name: docs.title, at: docs.archivedAt, spaceName: spaces.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(docs)
        // The doc's own workspace's space only — see DocsService.assertDocSpace.
        .leftJoin(spaces, and(eq(spaces.id, docs.spaceId), eq(spaces.workspaceId, docs.workspaceId)))
        .leftJoin(users, eq(users.id, docs.archivedById))
        .where(and(eq(docs.workspaceId, workspaceId), eq(docs.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'doc', name: r.name, location: r.spaceName ?? '', deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    const filtered = rows.filter((r) => {
      if (restrictTo && !(r.deletedBy && restrictTo.includes(r.deletedBy.id))) return false
      if (term && !r.name.toLowerCase().includes(term) && !r.location.toLowerCase().includes(term)) return false
      return true
    })
    // Newest deletion first; unknown timestamps (legacy rows) sink to the bottom.
    filtered.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
    return filtered
  }

  /** Distinct users who have deleted something here — powers the "Deleted by" filter. */
  async deleters(workspaceId: string, actor: { id: string; role?: string }) {
    const items = await this.list(workspaceId, actor)
    const seen = new Map<string, { id: string; name: string; avatarUrl: string | null }>()
    for (const i of items) if (i.deletedBy && !seen.has(i.deletedBy.id)) seen.set(i.deletedBy.id, i.deletedBy)
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  // ─── ownership check for a single item ──────────────────────────────────────

  /**
   * Resolve the item's workspace, who deleted it, and WHETHER IT IS ACTUALLY IN
   * THE TRASH, or throw.
   *
   * That last part was missing. `locate` looked the row up by id alone, so
   * `DELETE /workspaces/:id/trash/task/:taskId` would hard-delete a task that
   * had never been deleted — an admin, or the person who happened to have
   * archived it, could destroy a live task through an endpoint whose whole
   * contract is "this thing is already in the bin". Both callers
   * (`restore`, `deleteForever`) go through here, and restore on a live item
   * was silently a no-op reported as success.
   */
  private async locate(workspaceId: string, type: TrashType, id: string) {
    const q = {
      space: () => this.db.select({ name: spaces.name, by: spaces.archivedById, ws: spaces.workspaceId, trashed: spaces.isArchived })
        .from(spaces).where(eq(spaces.id, id)).limit(1),
      folder: () => this.db.select({ name: folders.name, by: folders.archivedById, ws: spaces.workspaceId, trashed: folders.isArchived })
        .from(folders).innerJoin(spaces, eq(spaces.id, folders.spaceId)).where(eq(folders.id, id)).limit(1),
      project: () => this.db.select({ name: projects.name, by: projects.archivedById, ws: spaces.workspaceId, trashed: projects.isArchived })
        .from(projects).innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(projects.id, id)).limit(1),
      list: () => this.db.select({ name: lists.name, by: lists.archivedById, ws: spaces.workspaceId, trashed: lists.isArchived })
        .from(lists).innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(lists.id, id)).limit(1),
      // A task is in the trash when it was DELETED. Archived is a different
      // state with a different surface, and restoring or purging one from here
      // would be acting on something the Trash never showed.
      task: () => this.db.select({ name: tasks.title, by: tasks.deletedById, ws: spaces.workspaceId, trashed: sql<boolean>`${tasks.deletedAt} is not null` })
        .from(tasks).innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(tasks.id, id)).limit(1),
      doc: () => this.db.select({ name: docs.title, by: docs.archivedById, ws: docs.workspaceId, trashed: docs.isArchived })
        .from(docs).where(eq(docs.id, id)).limit(1),
    }[type]
    const [row] = await q()
    if (!row || row.ws !== workspaceId) throw new NotFoundException('Item not found in this workspace trash')
    if (!row.trashed) throw new NotFoundException(`This ${type} is not in the trash`)
    return row
  }

  /** Admins act on anything; a member may only act on what they deleted. */
  private async assertMayAct(workspaceId: string, actor: { id: string; role?: string }, type: TrashType, id: string) {
    const { isAdmin } = await this.resolveScope(workspaceId, actor)
    const row = await this.locate(workspaceId, type, id)
    if (!isAdmin && row.by !== actor.id) throw new ForbiddenException('You can only manage items you deleted')
    return row
  }

  private assertType(type: string): TrashType {
    if (!(TRASH_TYPES as readonly string[]).includes(type)) throw new BadRequestException(`Unknown trash type "${type}"`)
    return type as TrashType
  }

  // ─── restore ────────────────────────────────────────────────────────────────

  /**
   * Un-archive the item **and its ancestors** — restoring a task whose list was
   * also deleted must actually make the task reachable again, otherwise the
   * restore silently appears to do nothing.
   */
  async restore(workspaceId: string, rawType: string, id: string, actor: { id: string; role?: string }, ip?: string) {
    const type = this.assertType(rawType)
    const row = await this.assertMayAct(workspaceId, actor, type, id)
    const clear = { isArchived: false, archivedAt: null, archivedById: null, updatedAt: new Date() }

    if (type === 'space') {
      await this.db.update(spaces).set(clear).where(eq(spaces.id, id))
    } else if (type === 'folder') {
      const [f] = await this.db.select({ spaceId: folders.spaceId }).from(folders).where(eq(folders.id, id)).limit(1)
      await this.db.update(folders).set(clear).where(eq(folders.id, id))
      if (f) await this.db.update(spaces).set(clear).where(eq(spaces.id, f.spaceId))
    } else if (type === 'project') {
      const [p] = await this.db.select({ spaceId: projects.spaceId }).from(projects).where(eq(projects.id, id)).limit(1)
      await this.db.update(projects).set(clear).where(eq(projects.id, id))
      if (p) await this.db.update(spaces).set(clear).where(eq(spaces.id, p.spaceId))
    } else if (type === 'list') {
      const [l] = await this.db
        .select({ projectId: lists.projectId, spaceId: projects.spaceId })
        .from(lists).innerJoin(projects, eq(projects.id, lists.projectId)).where(eq(lists.id, id)).limit(1)
      await this.db.update(lists).set(clear).where(eq(lists.id, id))
      if (l) {
        await this.db.update(projects).set(clear).where(eq(projects.id, l.projectId))
        await this.db.update(spaces).set(clear).where(eq(spaces.id, l.spaceId))
      }
    } else if (type === 'task') {
      const [tk] = await this.db
        .select({ listId: tasks.listId, projectId: lists.projectId, spaceId: projects.spaceId })
        .from(tasks).innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId)).where(eq(tasks.id, id)).limit(1)
      /*
       * A task carries BOTH flags while it is in the bin: `deletedAt` is what
       * put it here, `isArchived` is what hides it from every list, search and
       * report. Restoring has to clear both — clearing only `deletedAt` would
       * take the task out of the Trash and leave it invisible everywhere, which
       * is the worst of the two states.
       *
       * `archivedAt`/`archivedById` go too: if the task had been archived
       * before it was deleted, leaving them set would put it straight back into
       * Archived tasks after a restore that said it was bringing it back.
       */
      await this.db
        .update(tasks)
        .set({ ...clear, deletedAt: null, deletedById: null })
        .where(eq(tasks.id, id))
      if (tk) {
        await this.db.update(lists).set(clear).where(eq(lists.id, tk.listId))
        await this.db.update(projects).set(clear).where(eq(projects.id, tk.projectId))
        await this.db.update(spaces).set(clear).where(eq(spaces.id, tk.spaceId))
      }
    } else {
      await this.db.update(docs).set(clear).where(eq(docs.id, id))
    }

    /*
     * Binning a task took it out of the search index (`binTask` →
     * `search.removeTask`), so restoring has to put it back. Without this a
     * restored task looks fine everywhere except search, where it is
     * permanently unfindable — the same bug `restoreTask` fixed on the archive
     * side, which this door bypasses.
     */
    if (type === 'task') void this.reindexTask(id).catch(() => undefined)

    await this.security.logAuditEvent({
      workspaceId, actorId: actor.id, action: 'trash.restored', resourceType: type, resourceId: id,
      description: `Restored ${type} "${row.name}" from trash`, ipAddress: ip,
    })
    return { ok: true }
  }

  /** Re-index one restored task — the ids the index needs are a join away. */
  private async reindexTask(taskId: string) {
    const [row] = await this.db
      .select({
        id: tasks.id, title: tasks.title, description: tasks.description, listId: tasks.listId,
        createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
        projectId: lists.projectId, spaceId: projects.spaceId, workspaceId: spaces.workspaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) return
    await this.search.indexTask(row, row.workspaceId, row.spaceId, row.projectId)
  }

  // ─── permanent delete ───────────────────────────────────────────────────────

  /** Hard-delete a single trashed item. Children cascade via FKs. */
  async deleteForever(workspaceId: string, rawType: string, id: string, actor: { id: string; role?: string }, ip?: string) {
    const type = this.assertType(rawType)
    // For good is an admin's alone — even for what the caller deleted themselves.
    await this.assertAdmin(workspaceId, actor)
    const row = await this.assertMayAct(workspaceId, actor, type, id)

    if (type === 'space') await this.db.delete(spaces).where(eq(spaces.id, id))
    else if (type === 'folder') await this.db.delete(folders).where(eq(folders.id, id))
    else if (type === 'project') await this.db.delete(projects).where(eq(projects.id, id))
    else if (type === 'list') await this.db.delete(lists).where(eq(lists.id, id))
    else if (type === 'task') {
      await this.db.delete(tasks).where(eq(tasks.id, id))
      /*
       * The nightly purge has always de-indexed what it removed; this path —
       * the one a person presses — never did, so "Delete forever" destroyed the
       * row and left its title in search for good, pointing at an id that no
       * longer resolves. Same removal, same reason.
       */
      await this.search.removeTask(id).catch(() => undefined)
    }
    else await this.db.delete(docs).where(eq(docs.id, id))

    await this.security.logAuditEvent({
      workspaceId, actorId: actor.id, action: 'trash.purged', resourceType: type, resourceId: id,
      description: `Permanently deleted ${type} "${row.name}"`, ipAddress: ip,
    })
    return { ok: true }
  }

  /** Empty the whole workspace trash — admin only. */
  async clearAll(workspaceId: string, actor: { id: string; role?: string }, ip?: string) {
    await this.assertAdmin(workspaceId, actor)
    const items = await this.list(workspaceId, actor)
    for (const item of items) {
      try {
        await this.deleteForever(workspaceId, item.type, item.id, actor)
      } catch {
        // A parent purge may already have cascaded this row away — keep going.
      }
    }
    await this.security.logAuditEvent({
      workspaceId, actorId: actor.id, action: 'trash.cleared', resourceType: 'workspace', resourceId: workspaceId,
      description: `Emptied the trash (${items.length} item(s))`, ipAddress: ip,
    })
    return { ok: true, removed: items.length }
  }

  // ─── retention ──────────────────────────────────────────────────────────────

  /**
   * Items sit in the Trash for TRASH_RETENTION_DAYS and are then removed for
   * good, matching the "deleted forever after 30 days" promise in the UI.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'trash-purge-expired' })
  async purgeExpired() {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const table = { space: spaces, folder: folders, project: projects, list: lists, doc: docs } as const
    let total = 0
    for (const type of TRASH_TYPES) {
      /*
       * TASKS PURGE ON `deletedAt`, and only on `deletedAt`.
       *
       * They used to purge on `archivedAt`, which meant archiving a task was a
       * thirty-day countdown to it being destroyed — the one state a person
       * archives a task to avoid. An archived task is now kept until somebody
       * deletes it; only a task that was actually deleted has a clock.
       */
      if (type === 'task') {
        const gone = await this.db
          .delete(tasks)
          .where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)))
          .returning({ id: tasks.id })
        // Binning a task takes it out of the search index, so anything reaching
        // here should already be gone from it. This is the sweep for the ones
        // that are not: any task that reached the bin by a cascade rather than
        // through `binTask`. Without it those documents outlive the row.
        for (const row of gone) await this.search.removeTask(row.id)
        total += gone.length
        continue
      }
      const t = table[type]
      const gone = await this.db
        .delete(t)
        .where(and(eq(t.isArchived, true), isNotNull(t.archivedAt), lt(t.archivedAt, cutoff)))
        .returning({ id: t.id })
      total += gone.length
    }
    if (total > 0) this.logger.log(`Trash purge removed ${total} item(s) older than ${TRASH_RETENTION_DAYS} days`)
    return { removed: total }
  }
}
