import { WS_ADMIN_ROLES } from '../../common/permissions/workspace-roles'
import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import {
  objectShares, users, workspaceMembers, contentAccessRequests,
  spaces, folders, projects, lists, tasks, docs, chatChannels, dashboardPresets, taskViews,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isUuid } from '../../common/validation/uuid'
import { SecurityService } from '../security/security.service'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'
import { NotificationsService } from '../notifications/notifications.service'
import { resolveSpaceLevel, type WithinStep } from '../../common/permissions/space-default-permission'

/** Everything that can be shared. */
export const SHARE_TYPES = ['space', 'folder', 'project', 'list', 'task', 'doc', 'channel', 'dashboard', 'view'] as const
export type ShareType = (typeof SHARE_TYPES)[number]

/**
 * Access levels, weakest → strongest. Mirrors ClickUp:
 *   view < comment < edit < admin ("full edit")
 * `edit` may change the item but NOT delete it; `admin` may delete.
 */
export const SHARE_LEVELS = ['view', 'comment', 'edit', 'admin'] as const
export type ShareLevel = (typeof SHARE_LEVELS)[number]
const RANK: Record<ShareLevel, number> = { view: 0, comment: 1, edit: 2, admin: 3 }
/** The places a space's levels reach, and so what a member holds on them without a share of their own. */
const LOCATION_TYPES: ReadonlySet<ShareType> = new Set<ShareType>(['space', 'folder', 'project', 'list', 'task', 'view'])
const WITHIN_TYPES: ReadonlySet<string> = new Set(['task', 'list', 'project', 'folder'])
/** Human wording used in the notification email. */
const LEVEL_LABEL: Record<ShareLevel, string> = {
  view: 'view only', comment: 'comment', edit: 'edit', admin: 'full edit',
}

export interface ShareRow {
  id: string
  level: ShareLevel
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null
  /** Set instead of `user` while an invited outsider has not signed up yet. */
  invitedEmail: string | null
  createdAt: string
}

/** One hit of the reverse "everything shared with me" lookup (A1.7). */
export interface SharedWithMeItem {
  id: string
  objectType: ShareType
  objectId: string
  level: ShareLevel
  name: string
  /** In-app deep link. */
  url: string
  /** Where it lives, for telling two same-named lists apart. */
  context: string | null
  sharedAt: string
  sharedBy: { id: string; name: string; avatarUrl: string | null } | null
}

/** Display metadata resolved for a shared object, keyed by object id. */
type SharedObjectMeta = { name: string; url: string; context: string | null }

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
    private email: EmailService,
    private config: ConfigService,
    private notifications: NotificationsService,
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
    if (type === 'view') {
      /*
       * §V2-07 "Sharing & Permissions" on a saved view. A view inherits from
       * its list the same way a task does — someone with access to the list
       * already has access to what the view is a lens onto — so the chain is
       * the list's chain with the view in front of it.
       */
      const [r] = await this.db.select({
        ws: spaces.workspaceId, by: taskViews.createdById, name: taskViews.name,
        listId: taskViews.listId, projectId: lists.projectId,
        folderId: projects.folderId, spaceId: projects.spaceId,
      })
        .from(taskViews).innerJoin(lists, eq(lists.id, taskViews.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(taskViews.id, id)).limit(1)
      if (!r) throw new NotFoundException('View not found')
      const chain: Array<{ type: ShareType; id: string }> = [
        { type: 'view', id }, { type: 'list', id: r.listId }, { type: 'project', id: r.projectId },
      ]
      if (r.folderId) chain.push({ type: 'folder', id: r.folderId })
      chain.push({ type: 'space', id: r.spaceId })
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
    }
    if (type === 'dashboard') {
      // A5.11 — a preset's owner IS its creator (`dashboard_presets.userId`), so
      // sharing reuses this table rather than a second model. Presets are flat:
      // nothing to inherit from, hence a single-step chain.
      const [r] = await this.db.select({ ws: dashboardPresets.workspaceId, by: dashboardPresets.userId, name: dashboardPresets.name })
        .from(dashboardPresets).where(eq(dashboardPresets.id, id)).limit(1)
      if (!r) throw new NotFoundException('Dashboard not found')
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'dashboard', id }] }
    }
    if (type === 'channel') {
      const [r] = await this.db.select({
        ws: chatChannels.workspaceId, by: chatChannels.createdById,
        name: chatChannels.name, spaceId: chatChannels.spaceId, isDm: chatChannels.isDm,
      }).from(chatChannels).where(eq(chatChannels.id, id)).limit(1)
      if (!r) throw new NotFoundException('Channel not found')
      // A DM is between its participants — there is no one to share it with.
      if (r.isDm) throw new BadRequestException('Direct messages cannot be shared')
      const chain: Array<{ type: ShareType; id: string }> = [{ type: 'channel', id }]
      if (r.spaceId) chain.push({ type: 'space', id: r.spaceId })
      return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
    }
    const [r] = await this.db.select({ ws: docs.workspaceId, by: docs.createdById, name: docs.title, spaceId: docs.spaceId })
      .from(docs).where(eq(docs.id, id)).limit(1)
    if (!r) throw new NotFoundException('Doc not found')
    const chain: Array<{ type: ShareType; id: string }> = [{ type: 'doc', id }]
    if (r.spaceId) chain.push({ type: 'space', id: r.spaceId })
    return { workspaceId: r.ws, createdById: r.by, name: r.name, chain }
  }

  /**
   * The grant on EXACTLY this object, ignoring ancestors.
   *
   * `resolveLevel` deliberately inherits down the chain, which is right for
   * containers but wrong for a private chat channel: a space-level grant must
   * not quietly open every private channel inside that space. Callers guarding
   * private things ask for the direct grant instead.
   */
  async directLevel(type: ShareType, id: string, userId: string): Promise<ShareLevel | null> {
    const [row] = await this.db.select({ level: objectShares.level }).from(objectShares)
      .where(and(
        eq(objectShares.objectType, type),
        eq(objectShares.objectId, id),
        eq(objectShares.userId, userId),
      )).limit(1)
    return (row?.level as ShareLevel | undefined) ?? null
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
   * THE LEVEL THIS PERSON HOLDS ON THE OBJECT — their own grant on it or the
   * nearest thing above it; for a place in a space without one, what the space
   * gives them (its default, their grant on it, a project role: the level every
   * write rule reads, `resolveSpaceLevel`); Full edit for a manager; and, for a
   * doc, a channel or a dashboard, Full edit for its maker. Null for nobody.
   *
   * Sharing read the grants alone, so a member who held Full edit by the
   * space's default — every ordinary member — could not share the admin's
   * list, where ClickUp's edit permissions share
   * (`found-25-sep/sharing-asks-the-maker-not-the-level`).
   */
  private async actorLevel(
    type: ShareType,
    id: string,
    actor: { id: string; role?: string },
    loc: { workspaceId: string; createdById: string | null; chain: Array<{ type: ShareType; id: string }> },
  ): Promise<ShareLevel | null> {
    if (actor.role === 'super_admin') return 'admin'
    const wsRole = await this.workspaceRole(loc.workspaceId, actor.id)
    if (!wsRole) return null
    if (wsRole === 'workspace_admin' || wsRole === 'manager') return 'admin'
    const granted = await this.resolveLevel(type, id, actor.id)
    if (granted) return granted
    if (!LOCATION_TYPES.has(type)) return loc.createdById === actor.id ? 'admin' : null
    const space = loc.chain.find((step) => step.type === 'space')
    if (!space) return null
    const within = loc.chain.filter((step) => WITHIN_TYPES.has(step.type)) as WithinStep[]
    const resolved = await resolveSpaceLevel(this.db, { spaceId: space.id, actorId: actor.id, within })
    return (resolved?.level as ShareLevel | undefined) ?? null
  }

  /**
   * Sharing rights are a function of (level, user type) — not level alone.
   * A member with edit+ on the object may share it (ClickUp: "the edit
   * permissions on a Folder allow members to share that Folder"); a GUEST may
   * never share, even with edit. Admins and managers may always share.
   */
  async canShare(type: ShareType, id: string, actor: { id: string; role?: string }) {
    const loc = await this.locate(type, id)
    if (actor.role !== 'super_admin' && (await this.workspaceRole(loc.workspaceId, actor.id)) === 'guest') {
      return { allowed: false, loc, level: null as ShareLevel | null }
    }
    const level = await this.actorLevel(type, id, actor, loc)
    return { allowed: level != null && RANK[level] >= RANK.edit, loc, level }
  }

  private async assertCanShare(type: ShareType, id: string, actor: { id: string; role?: string }) {
    const { allowed, loc, level } = await this.canShare(type, id, actor)
    if (!allowed || !level) throw new ForbiddenException('You do not have permission to share this item')
    return { ...loc, actorLevel: level }
  }

  /**
   * NOBODY GIVES, CHANGES OR REMOVES MORE THAN THEY HOLD — their own share
   * included, which is how a raise was made. Nothing compared the level given
   * with the giver's: measured on lane 3, a member with a list shared to them
   * at Edit, refused a task in it (403), shared it with themselves at Full edit
   * (201), made the task (201), gave Full edit to another member too, and
   * lowered and then removed a Full edit share the admin had given
   * (`found-25-sep/sharers-raise-their-own-level`).
   */
  private assertWithinOwnLevel(mine: ShareLevel, ...levels: ShareLevel[]) {
    if (levels.some((l) => RANK[l] > RANK[mine])) {
      throw new ForbiddenException('You can give, change or remove access only up to your own')
    }
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

  /** The address to notify for a grant made against a known user. */
  private async emailOf(userId: string): Promise<string | null> {
    const [u] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    return u?.email ?? null
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

  // ─── reverse lookup: everything shared with me ─────────────────────────────

  /**
   * Names + deep links for one batch of same-typed shared objects.
   *
   * Deliberately does NOT apply the per-item visibility filters
   * (`item-visibility.ts`): those hide private rows from everyone but the
   * creator and managers, and an explicit share grant is precisely the
   * exception they don't know about. Reaching this code already means the
   * caller holds a row in `object_shares` naming them.
   */
  private async resolveSharedBatch(
    workspaceId: string,
    type: ShareType,
    ids: string[],
  ): Promise<Map<string, SharedObjectMeta>> {
    const out = new Map<string, SharedObjectMeta>()
    if (ids.length === 0) return out
    const base = `/app/${workspaceId}`

    if (type === 'space') {
      const rows = await this.db.select({ id: spaces.id, name: spaces.name })
        .from(spaces).where(and(eq(spaces.workspaceId, workspaceId), inArray(spaces.id, ids)))
      for (const r of rows) out.set(r.id, { name: r.name, url: `${base}/${r.id}`, context: null })
      return out
    }
    if (type === 'folder') {
      // Folders have no route of their own — they render on their space page.
      const rows = await this.db
        .select({ id: folders.id, name: folders.name, spaceId: spaces.id, spaceName: spaces.name })
        .from(folders).innerJoin(spaces, eq(spaces.id, folders.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(folders.id, ids)))
      for (const r of rows) out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}`, context: r.spaceName })
      return out
    }
    if (type === 'project') {
      const rows = await this.db
        .select({ id: projects.id, name: projects.name, spaceId: spaces.id, spaceName: spaces.name })
        .from(projects).innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(projects.id, ids)))
      for (const r of rows) out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}/${r.id}`, context: r.spaceName })
      return out
    }
    if (type === 'list') {
      const rows = await this.db
        .select({ id: lists.id, name: lists.name, projectId: projects.id, projectName: projects.name, spaceId: spaces.id })
        .from(lists).innerJoin(projects, eq(projects.id, lists.projectId)).innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(lists.id, ids)))
      for (const r of rows) {
        out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}/${r.projectId}/${r.id}`, context: r.projectName })
      }
      return out
    }
    if (type === 'task') {
      const rows = await this.db
        .select({ id: tasks.id, title: tasks.title, listId: lists.id, listName: lists.name, projectId: projects.id, spaceId: spaces.id })
        .from(tasks).innerJoin(lists, eq(lists.id, tasks.listId)).innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(tasks.id, ids)))
      for (const r of rows) {
        out.set(r.id, {
          name: r.title,
          url: `${base}/${r.spaceId}/${r.projectId}/${r.listId}?task=${r.id}`,
          context: r.listName,
        })
      }
      return out
    }
    if (type === 'view') {
      // A view has no route of its own; it is the list route with ?view=<id>,
      // which is exactly what "Copy link to view" puts on the clipboard.
      const rows = await this.db
        .select({
          id: taskViews.id, name: taskViews.name, listId: lists.id, listName: lists.name,
          projectId: projects.id, spaceId: spaces.id,
        })
        .from(taskViews).innerJoin(lists, eq(lists.id, taskViews.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId)).innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskViews.id, ids)))
      for (const r of rows) {
        out.set(r.id, {
          name: r.name,
          url: `${base}/${r.spaceId}/${r.projectId}/${r.listId}?view=${r.id}`,
          context: r.listName,
        })
      }
      return out
    }
    if (type === 'channel') {
      const rows = await this.db.select({ id: chatChannels.id, name: chatChannels.name })
        .from(chatChannels).where(and(eq(chatChannels.workspaceId, workspaceId), inArray(chatChannels.id, ids)))
      for (const r of rows) out.set(r.id, { name: `#${r.name}`, url: `${base}/chat?channel=${r.id}`, context: null })
      return out
    }
    if (type === 'dashboard') {
      const rows = await this.db
        .select({ id: dashboardPresets.id, name: dashboardPresets.name, ownerName: users.displayName })
        .from(dashboardPresets)
        .leftJoin(users, eq(users.id, dashboardPresets.userId))
        .where(and(eq(dashboardPresets.workspaceId, workspaceId), inArray(dashboardPresets.id, ids)))
      for (const r of rows) {
        out.set(r.id, { name: r.name, url: `${base}/dashboard?preset=${r.id}`, context: r.ownerName })
      }
      return out
    }
    const rows = await this.db.select({ id: docs.id, title: docs.title })
      .from(docs).where(and(eq(docs.workspaceId, workspaceId), inArray(docs.id, ids)))
    for (const r of rows) out.set(r.id, { name: r.title, url: `${base}/docs?doc=${r.id}`, context: null })
    return out
  }

  /**
   * Everything in a workspace someone has shared *with* the caller — the
   * reverse of the object-keyed routes, and the only way to find a privately
   * shared item without being sent a link. Newest grant first.
   *
   * Grants whose object has since been deleted are skipped rather than
   * reported: `object_shares.object_id` is polymorphic, so no foreign key
   * cleans them up.
   */
  async listSharedWithMe(workspaceId: string, userId: string): Promise<SharedWithMeItem[]> {
    const rows = await this.db
      .select({
        id: objectShares.id, objectType: objectShares.objectType, objectId: objectShares.objectId,
        level: objectShares.level, createdAt: objectShares.createdAt, createdById: objectShares.createdById,
      })
      .from(objectShares)
      .where(and(eq(objectShares.workspaceId, workspaceId), eq(objectShares.userId, userId)))
      .orderBy(desc(objectShares.createdAt))
    if (rows.length === 0) return []

    const byType = new Map<ShareType, string[]>()
    for (const r of rows) {
      const ids = byType.get(r.objectType) ?? []
      ids.push(r.objectId)
      byType.set(r.objectType, ids)
    }
    const meta = new Map<string, SharedObjectMeta>() // key: `${type}:${id}`
    for (const [type, ids] of byType) {
      const resolved = await this.resolveSharedBatch(workspaceId, type, ids)
      for (const [id, m] of resolved) meta.set(`${type}:${id}`, m)
    }

    const sharerIds = [...new Set(rows.map((r) => r.createdById).filter((id): id is string => !!id))]
    const sharers = sharerIds.length
      ? await this.db.select({ id: users.id, name: users.displayName, avatarUrl: users.avatarUrl })
          .from(users).where(inArray(users.id, sharerIds))
      : []
    const sharerById = new Map(sharers.map((u) => [u.id, u]))

    const out: SharedWithMeItem[] = []
    for (const r of rows) {
      const m = meta.get(`${r.objectType}:${r.objectId}`)
      if (!m) continue
      const sharer = r.createdById ? sharerById.get(r.createdById) : undefined
      out.push({
        id: r.id,
        objectType: r.objectType,
        objectId: r.objectId,
        level: r.level as ShareLevel,
        name: m.name,
        url: m.url,
        context: m.context,
        sharedAt: new Date(r.createdAt).toISOString(),
        sharedBy: sharer ? { id: sharer.id, name: sharer.name ?? '', avatarUrl: sharer.avatarUrl } : null,
      })
    }
    return out
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
    this.assertWithinOwnLevel(loc.actorLevel, level)

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
        const [held] = await this.db.select({ level: objectShares.level }).from(objectShares).where(eq(objectShares.id, dupe.id)).limit(1)
        this.assertWithinOwnLevel(loc.actorLevel, held.level as ShareLevel)
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

    // §2.2 — "[shared with] mujhe na show ho" is a choice she makes in the
    // Primary customiser, and it can only be offered if the type exists. An
    // email already goes out below; this is the in-app half, which is what the
    // Inbox filters over. Only for an existing member — an invited address has
    // no account to notify yet.
    if (userId && userId !== actor.id) {
      await this.notifications
        .create({
          userId,
          workspaceId: loc.workspaceId,
          actorId: actor.id,
          type: 'shared_with_me',
          title: loc.name,
          target: { entityType: type, entityId: id },
        })
        .catch(() => undefined)
    }

    // Tell the person they were given access. Never let a mail failure undo a
    // grant that is already committed — the share stands either way.
    const notifyAddress = invitedEmail ?? (await this.emailOf(userId!))
    if (notifyAddress) {
      try {
        const [inviter] = await this.db.select({ name: users.displayName }).from(users)
          .where(eq(users.id, actor.id)).limit(1)
        const base = (this.config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
        await this.email.sendShareInviteEmail({
          to: notifyAddress,
          inviter: inviter?.name ?? 'A teammate',
          objectType: type,
          objectName: loc.name,
          level: LEVEL_LABEL[level],
          url: invitedEmail ? `${base}/register?email=${encodeURIComponent(invitedEmail)}` : base,
          isOutsider: !!invitedEmail,
        })
      } catch (err) {
        this.logger.warn(`Share succeeded but the notification email failed: ${(err as Error).message}`)
      }
    }
    return { ok: true, id: row.id }
  }

  async updateLevel(type: ShareType, id: string, shareId: string, actor: { id: string; role?: string }, level: string, ip?: string) {
    const loc = await this.assertCanShare(type, id, actor)
    const lvl = this.assertLevel(level)
    const [held] = await this.db.select({ level: objectShares.level }).from(objectShares)
      .where(and(eq(objectShares.id, shareId), eq(objectShares.objectType, type), eq(objectShares.objectId, id))).limit(1)
    if (!held) throw new NotFoundException('Share not found')
    this.assertWithinOwnLevel(loc.actorLevel, lvl, held.level as ShareLevel)
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
    const [held] = await this.db.select({ level: objectShares.level }).from(objectShares)
      .where(and(eq(objectShares.id, shareId), eq(objectShares.objectType, type), eq(objectShares.objectId, id))).limit(1)
    if (!held) throw new NotFoundException('Share not found')
    this.assertWithinOwnLevel(loc.actorLevel, held.level as ShareLevel)
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

  /**
   * §G10 [12:16–12:20] — "someone asked for access to something".
   *
   * The `access_requested` notification kind has existed since the enum was
   * written and was only ever emitted for FEATURE requests. Somebody who hit a
   * doc, list or space they could not see had no way to ask for it — the wall
   * was the end of the road.
   *
   * Modelled on the feature-flag request flow rather than reinvented, because
   * that one already learned two things the hard way, and both apply here.
   */
  async requestAccess(
    workspaceId: string,
    type: ShareType,
    objectId: string,
    requester: { id: string; name?: string | null; email?: string | null },
  ): Promise<{ status: 'sent' | 'already_asked' | 'no_owners'; notified: number }> {
    if (!SHARE_TYPES.includes(type)) throw new BadRequestException('unknown object type')
    // An id that cannot be one names nothing, and would fail the uuid column below.
    if (!isUuid(objectId)) throw new BadRequestException('Malformed object id')

    /*
     * Who can actually grant it: whoever holds admin on the object itself, plus
     * the workspace's admins. Anyone below admin on the object cannot widen it,
     * so telling them would be noise they can do nothing about.
     */
    const objectAdmins = await this.db
      .select({ userId: objectShares.userId })
      .from(objectShares)
      .where(
        and(
          eq(objectShares.workspaceId, workspaceId),
          eq(objectShares.objectType, type),
          eq(objectShares.objectId, objectId),
          eq(objectShares.level, 'admin'),
        ),
      )
    const wsAdmins = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role, [...WS_ADMIN_ROLES]),
        ),
      )
    const recipients = [
      ...new Set([...objectAdmins.map((a) => a.userId), ...wsAdmins.map((a) => a.userId)]),
    ].filter((id): id is string => !!id && id !== requester.id)
    if (recipients.length === 0) return { status: 'no_owners', notified: 0 }

    /*
     * One ask per person per object per day, read from the ASKS rather than
     * from the notifications they produced. A notification row only exists for
     * a recipient with in-app switched on, so counting rows let an email-only
     * owner be re-mailed on every press — the exact bug the feature-flag flow
     * hit and documented.
     */
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [recent] = await this.db
      .select({ id: contentAccessRequests.id })
      .from(contentAccessRequests)
      .where(
        and(
          eq(contentAccessRequests.workspaceId, workspaceId),
          eq(contentAccessRequests.requesterId, requester.id),
          eq(contentAccessRequests.objectType, type),
          eq(contentAccessRequests.objectId, objectId),
          gte(contentAccessRequests.createdAt, since),
        ),
      )
      .limit(1)
    if (recent) return { status: 'already_asked', notified: 0 }

    // Recorded BEFORE the fan-out, so a request that dies partway through is
    // still an ask that happened rather than one that can be repeated at will.
    await this.db
      .insert(contentAccessRequests)
      .values({ workspaceId, objectType: type, objectId, requesterId: requester.id })
      .catch(() => undefined)

    /*
     * AN ID THAT NAMES NOTHING HERE IS ASKED ABOUT, AND CARRIED TO NOBODY
     * (`found-30-sep/private-task-reads-say-403`). The task sheet offers the ask
     * on its "not found", which is now the answer for a task the reader may not
     * open AND for one that is not there — so the ask is recorded and answered
     * alike for both, and only one that names an object of this kind in this
     * workspace reaches the people who could grant it. Without this a link to a
     * deleted task sent every admin "… asked for access to this task", with no
     * task to give.
     */
    const meta = (await this.resolveSharedBatch(workspaceId, type, [objectId])).get(objectId)
    if (!meta) return { status: 'sent', notified: 0 }
    const what = meta.name
    const who = requester.name?.trim() || requester.email || 'Someone'

    let notified = 0
    for (const userId of recipients) {
      const outcome = await this.notifications.createWithOutcome({
        userId,
        workspaceId,
        actorId: requester.id,
        type: 'access_requested',
        title: `${who} asked for access to ${what}`,
        body: `${who} tried to open ${what} and could not. You can give them access from its Share panel.`,
        target: { entityType: type, entityId: objectId, url: meta.url },
      })
      // Delivery, not the row — see the de-dup note above. Somebody who took
      // the email and not the bell was told.
      if (outcome?.delivered) notified += 1
    }
    return { status: 'sent', notified }
  }

}
