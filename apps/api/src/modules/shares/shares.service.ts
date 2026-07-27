import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  objectShares, users, workspaceMembers,
  spaces, folders, projects, lists, tasks, docs,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

/** Everything that can be shared. */
export const SHARE_TYPES = ['space', 'folder', 'project', 'list', 'task', 'doc'] as const
export type ShareType = (typeof SHARE_TYPES)[number]

/**
 * Access levels, weakest → strongest. Mirrors ClickUp:
 *   view < comment < edit < admin ("full edit")
 * `edit` may change the item but NOT delete it; `admin` may delete.
 */
export const SHARE_LEVELS = ['view', 'comment', 'edit', 'admin'] as const
export type ShareLevel = (typeof SHARE_LEVELS)[number]
const RANK: Record<ShareLevel, number> = { view: 0, comment: 1, edit: 2, admin: 3 }

export interface ShareRow {
  id: string
  level: ShareLevel
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null
  /** Set instead of `user` while an invited outsider has not signed up yet. */
  invitedEmail: string | null
  createdAt: string
}

@Injectable()
export class SharesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  assertType(t: string): ShareType {
    if (!(SHARE_TYPES as readonly string[]).includes(t)) throw new BadRequestException(`Unknown object type "${t}"`)
    return t as ShareType
  }
  private assertLevel(l: string): ShareLevel {
    if (!(SHARE_LEVELS as readonly string[]).includes(l)) throw new BadRequestException(`Unknown permission level "${l}"`)
    return l as ShareLevel
  }

  // ─── locating an object + its ancestor chain ────────────────────────────────

  /**
   * Resolve an object to its workspace, creator and ancestor chain, ordered
   * MOST specific first. Permission resolution walks this list and stops at the
   * first explicit grant — task beats list beats project beats folder beats space.
   */
  private async locate(type: ShareType, id: string): Promise<{
    workspaceId: string
    createdById: string | null
    name: string
    chain: Array<{ type: ShareType; id: string }>
  }> {
    if (type === 'space') {
      const [r] = await this.db.select({ ws: spaces.workspaceId, by: spaces.createdById, name: spaces.name })
        .from(spaces).where(eq(spaces.id, id)).limit(1)
      if (!r) throw new NotFoundException('Space not found')
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'space', id }] }
    }
    if (type === 'folder') {
      const [r] = await this.db.select({ ws: spaces.workspaceId, by: folders.createdById, name: folders.name, spaceId: folders.spaceId })
        .from(folders).innerJoin(spaces, eq(spaces.id, folders.spaceId)).where(eq(folders.id, id)).limit(1)
      if (!r) throw new NotFoundException('Folder not found')
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'folder', id }, { type: 'space', id: r.spaceId }] }
    }
    if (type === 'project') {
      const [r] = await this.db.select({ ws: spaces.workspaceId, by: projects.createdById, name: projects.name, spaceId: projects.spaceId, folderId: projects.folderId })
        .from(projects).innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(projects.id, id)).limit(1)
      if (!r) throw new NotFoundException('Project not found')
      const chain: Array<{ type: ShareType; id: string }> = [{ type: 'project', id }]
      if (r.folderId) chain.push({ type: 'folder', id: r.folderId })
      chain.push({ type: 'space', id: r.spaceId })
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
    }
    if (type === 'list') {
      const [r] = await this.db.select({ ws: spaces.workspaceId, by: lists.createdById, name: lists.name, projectId: lists.projectId, folderId: projects.folderId, spaceId: projects.spaceId })
        .from(lists).innerJoin(projects, eq(projects.id, lists.projectId)).innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(lists.id, id)).limit(1)
      if (!r) throw new NotFoundException('List not found')
      const chain: Array<{ type: ShareType; id: string }> = [{ type: 'list', id }, { type: 'project', id: r.projectId }]
      if (r.folderId) chain.push({ type: 'folder', id: r.folderId })
      chain.push({ type: 'space', id: r.spaceId })
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
    }
    if (type === 'task') {
      const [r] = await this.db.select({ ws: spaces.workspaceId, by: tasks.createdById, name: tasks.title, listId: tasks.listId, projectId: lists.projectId, folderId: projects.folderId, spaceId: projects.spaceId })
        .from(tasks).innerJoin(lists, eq(lists.id, tasks.listId)).innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId)).where(eq(tasks.id, id)).limit(1)
      if (!r) throw new NotFoundException('Task not found')
      const chain: Array<{ type: ShareType; id: string }> = [
        { type: 'task', id }, { type: 'list', id: r.listId }, { type: 'project', id: r.projectId },
      ]
      if (r.folderId) chain.push({ type: 'folder', id: r.folderId })
      chain.push({ type: 'space', id: r.spaceId })
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
    }
    const [r] = await this.db.select({ ws: docs.workspaceId, by: docs.createdById, name: docs.title, spaceId: docs.spaceId })
      .from(docs).where(eq(docs.id, id)).limit(1)
    if (!r) throw new NotFoundException('Doc not found')
    const chain: Array<{ type: ShareType; id: string }> = [{ type: 'doc', id }]
    if (r.spaceId) chain.push({ type: 'space', id: r.spaceId })
    return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
  }

  // ─── who may share ─────────────────────────────────────────────────────────

  private async workspaceRole(workspaceId: string, userId: string) {
    const [m] = await this.db.select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return m?.role ?? null
  }

  /**
   * Sharing rights are a function of (level, user type) — not level alone.
   * A member with edit+ on the object may share it; a GUEST may never share,
   * even with edit. Admins/managers and the object's creator may always share.
   */
  async canShare(type: ShareType, id: string, actor: { id: string; role?: string }) {
    const loc = await this.locate(type, id)
    if (actor.role === 'super_admin') return { allowed: true, loc }
    const wsRole = await this.workspaceRole(loc.workspaceId, actor.id)
    if (!wsRole) return { allowed: false, loc }
    if (wsRole === 'guest') return { allowed: false, loc }
    if (wsRole === 'workspace_admin' || wsRole === 'manager') return { allowed: true, loc }
    if (loc.createdById && loc.createdById === actor.id) return { allowed: true, loc }
    const level = await this.resolveLevel(type, id, actor.id)
    return { allowed: level != null && RANK[level] >= RANK.edit, loc }
  }

  private async assertCanShare(type: ShareType, id: string, actor: { id: string; role?: string }) {
    const { allowed, loc } = await this.canShare(type, id, actor)
    if (!allowed) throw new ForbiddenException('You do not have permission to share this item')
    return loc
  }

  // ─── resolution ────────────────────────────────────────────────────────────

  /**
   * The level a user has on an object, or null if nothing was granted anywhere
   * up the chain. Most specific wins: the first ancestor with an explicit grant
   * decides, so a task-level grant overrides a broader space-level one.
   */
  async resolveLevel(type: ShareType, id: string, userId: string): Promise<ShareLevel | null> {
    const { chain } = await this.locate(type, id)
    const rows = await this.db
      .select({ objectType: objectShares.objectType, objectId: objectShares.objectId, level: objectShares.level })
      .from(objectShares)
      .where(and(eq(objectShares.userId, userId), inArray(objectShares.objectId, chain.map((c) => c.id))))
    if (rows.length === 0) return null
    for (const step of chain) {
      const hit = rows.find((r) => r.objectType === step.type && r.objectId === step.id)
      if (hit) return hit.level as ShareLevel
    }
    return null
  }

  /** True when the level permits deleting the object itself (edit must not). */
  canDelete(level: ShareLevel | null) {
    return level === 'admin'
  }

  // ─── read / write grants ───────────────────────────────────────────────────

  async list(type: ShareType, id: string, actor: { id: string; role?: string }): Promise<ShareRow[]> {
    const loc = await this.locate(type, id)
    if (actor.role !== 'super_admin' && !(await this.workspaceRole(loc.workspaceId, actor.id))) {
      throw new ForbiddenException('Not a member of this workspace')
    }
    const rows = await this.db
      .select({
        id: objectShares.id, level: objectShares.level, invitedEmail: objectShares.invitedEmail,
        createdAt: objectShares.createdAt,
        uid: users.id, uname: users.displayName, uemail: users.email, uavatar: users.avatarUrl,
      })
      .from(objectShares)
      .leftJoin(users, eq(users.id, objectShares.userId))
      .where(and(eq(objectShares.objectType, type), eq(objectShares.objectId, id)))
    return rows.map((r) => ({
      id: r.id,
      level: r.level as ShareLevel,
      // leftJoin makes the user columns nullable even when uid is present.
      user: r.uid ? { id: r.uid, name: r.uname ?? '', email: r.uemail ?? '', avatarUrl: r.uavatar } : null,
      invitedEmail: r.invitedEmail,
      createdAt: new Date(r.createdAt).toISOString(),
    }))
  }

  /**
   * Grant access by user id OR by email. An email that matches an existing
   * workspace user is bound straight to that user; anything else is stored as a
   * pending invite so an OUTSIDER can be shared with before they sign up.
   */
  async share(
    type: ShareType,
    id: string,
    actor: { id: string; role?: string },
    input: { userId?: string; email?: string; level?: string },
    ip?: string,
  ) {
    const loc = await this.assertCanShare(type, id, actor)
    const level = this.assertLevel(input.level ?? 'view')

    let userId = input.userId ?? null
    let invitedEmail: string | null = null
    if (!userId) {
      const email = (input.email ?? '').trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('A userId or a valid email is required')
      }
      const [existing] = await this.db.select({ id: users.id }).from(users)
        .where(sql`lower(${users.email}) = ${email}`).limit(1)
      if (existing) userId = existing.id
      else invitedEmail = email
    }

    // Re-sharing with the same principal updates the level rather than erroring.
    if (userId) {
      const [dupe] = await this.db.select({ id: objectShares.id }).from(objectShares)
        .where(and(eq(objectShares.objectType, type), eq(objectShares.objectId, id), eq(objectShares.userId, userId)))
        .limit(1)
      if (dupe) {
        await this.db.update(objectShares).set({ level, updatedAt: new Date() }).where(eq(objectShares.id, dupe.id))
        return { ok: true, updated: true }
      }
    } else if (invitedEmail) {
      const [dupe] = await this.db.select({ id: objectShares.id }).from(objectShares)
        .where(and(eq(objectShares.objectType, type), eq(objectShares.objectId, id),
          sql`lower(${objectShares.invitedEmail}) = ${invitedEmail}`))
        .limit(1)
      if (dupe) {
        await this.db.update(objectShares).set({ level, updatedAt: new Date() }).where(eq(objectShares.id, dupe.id))
        return { ok: true, updated: true }
      }
    }

    const [row] = await this.db.insert(objectShares).values({
      workspaceId: loc.workspaceId, objectType: type, objectId: id,
      userId, invitedEmail, level, createdById: actor.id,
    }).returning({ id: objectShares.id })

    await this.security.logAuditEvent({
      workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.granted',
      resourceType: type, resourceId: id,
      description: `Shared ${type} "${loc.name}" with ${invitedEmail ?? userId} (${level})`,
      ipAddress: ip, metadata: { level, invitedEmail, userId },
    })
    return { ok: true, id: row.id }
  }

  async updateLevel(type: ShareType, id: string, shareId: string, actor: { id: string; role?: string }, level: string, ip?: string) {
    const loc = await this.assertCanShare(type, id, actor)
    const lvl = this.assertLevel(level)
    const [row] = await this.db.update(objectShares).set({ level: lvl, updatedAt: new Date() })
      .where(and(eq(objectShares.id, shareId), eq(objectShares.objectType, type), eq(objectShares.objectId, id)))
      .returning({ id: objectShares.id })
    if (!row) throw new NotFoundException('Share not found')
    await this.security.logAuditEvent({
      workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.level_changed',
      resourceType: type, resourceId: id, description: `Changed a share on "${loc.name}" to ${lvl}`, ipAddress: ip,
    })
    return { ok: true }
  }

  async revoke(type: ShareType, id: string, shareId: string, actor: { id: string; role?: string }, ip?: string) {
    const loc = await this.assertCanShare(type, id, actor)
    const [row] = await this.db.delete(objectShares)
      .where(and(eq(objectShares.id, shareId), eq(objectShares.objectType, type), eq(objectShares.objectId, id)))
      .returning({ id: objectShares.id })
    if (!row) throw new NotFoundException('Share not found')
    await this.security.logAuditEvent({
      workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.revoked',
      resourceType: type, resourceId: id, description: `Removed a share from "${loc.name}"`, ipAddress: ip,
    })
    return { ok: true }
  }

  /**
   * Bind pending email invites to a user once they exist (call on signup /
   * accept), so an outsider who was shared with before signing up lands with
   * their access already in place.
   */
  async claimInvites(userId: string, email: string) {
    const claimed = await this.db.update(objectShares)
      .set({ userId, invitedEmail: null, updatedAt: new Date() })
      .where(sql`lower(${objectShares.invitedEmail}) = ${email.trim().toLowerCase()}`)
      .returning({ id: objectShares.id })
    return { claimed: claimed.length }
  }
}
