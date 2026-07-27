import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, lt, isNotNull } from 'drizzle-orm'
import { spaces, folders, projects, lists, tasks, docs, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

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
    return { isAdmin: member.role === 'workspace_admin' || member.role === 'manager' }
  }

  private async assertAdmin(workspaceId: string, actor: { id: string; role?: string }) {
    const { isAdmin } = await this.resolveScope(workspaceId, actor)
    if (!isAdmin) throw new ForbiddenException('Workspace admin or manager required')
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

    if (wanted.has('task')) {
      const res = await this.db
        .select({
          id: tasks.id, name: tasks.title, at: tasks.archivedAt,
          spaceName: spaces.name, projectName: projects.name, listName: lists.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .leftJoin(users, eq(users.id, tasks.archivedById))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, true)))
      for (const r of res) rows.push({ id: r.id, type: 'task', name: r.name, location: `${r.spaceName} › ${r.projectName} › ${r.listName}`, deletedAt: stamp(r.at), deletedBy: deleter(r) })
    }

    if (wanted.has('doc')) {
      const res = await this.db
        .select({
          id: docs.id, name: docs.title, at: docs.archivedAt, spaceName: spaces.name,
          byId: users.id, byName: users.displayName, byAvatar: users.avatarUrl,
        })
        .from(docs)
        .leftJoin(spaces, eq(spaces.id, docs.spaceId))
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

  /** Resolve the item's workspace + who deleted it, or throw if it isn't in this workspace's trash. */
  private async locate(workspaceId: string, type: TrashType, id: string) {
    const q = {
      space: () => this.db.select({ name: spaces.name, by: spaces.archivedById, ws: spaces.workspaceId })
        .from(spaces).where(eq(spaces.id, id)).limit(1),
      folder: () => this.db.select({ name: folders.name, by: folders.archivedById, ws: spaces.workspaceId })
        .from(folders).innerJoin(spaces, eq(spaces.id, folders.spaceId)).where(eq(folders.id, id)).limit(1),
      project: () => this.db.select({ name: projects.name, by: projects.archivedById, ws: spaces.workspaceId })
        .from(projects).innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(projects.id, id)).limit(1),
      list: () => this.db.select({ name: lists.name, by: lists.archivedById, ws: spaces.workspaceId })
        .from(lists).innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(lists.id, id)).limit(1),
      task: () => this.db.select({ name: tasks.title, by: tasks.archivedById, ws: spaces.workspaceId })
        .from(tasks).innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(tasks.id, id)).limit(1),
      doc: () => this.db.select({ name: docs.title, by: docs.archivedById, ws: docs.workspaceId })
        .from(docs).where(eq(docs.id, id)).limit(1),
    }[type]
    const [row] = await q()
    if (!row || row.ws !== workspaceId) throw new NotFoundException('Item not found in this workspace trash')
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
      await this.db.update(tasks).set(clear).where(eq(tasks.id, id))
      if (tk) {
        await this.db.update(lists).set(clear).where(eq(lists.id, tk.listId))
        await this.db.update(projects).set(clear).where(eq(projects.id, tk.projectId))
        await this.db.update(spaces).set(clear).where(eq(spaces.id, tk.spaceId))
      }
    } else {
      await this.db.update(docs).set(clear).where(eq(docs.id, id))
    }

    await this.security.logAuditEvent({
      workspaceId, actorId: actor.id, action: 'trash.restored', resourceType: type, resourceId: id,
      description: `Restored ${type} "${row.name}" from trash`, ipAddress: ip,
    })
    return { ok: true }
  }

  // ─── permanent delete ───────────────────────────────────────────────────────

  /** Hard-delete a single trashed item. Children cascade via FKs. */
  async deleteForever(workspaceId: string, rawType: string, id: string, actor: { id: string; role?: string }, ip?: string) {
    const type = this.assertType(rawType)
    const row = await this.assertMayAct(workspaceId, actor, type, id)

    if (type === 'space') await this.db.delete(spaces).where(eq(spaces.id, id))
    else if (type === 'folder') await this.db.delete(folders).where(eq(folders.id, id))
    else if (type === 'project') await this.db.delete(projects).where(eq(projects.id, id))
    else if (type === 'list') await this.db.delete(lists).where(eq(lists.id, id))
    else if (type === 'task') await this.db.delete(tasks).where(eq(tasks.id, id))
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
    const table = { space: spaces, folder: folders, project: projects, list: lists, task: tasks, doc: docs } as const
    let total = 0
    for (const type of TRASH_TYPES) {
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
