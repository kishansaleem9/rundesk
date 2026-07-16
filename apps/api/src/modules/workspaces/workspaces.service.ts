import { ConflictException, Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import * as crypto from 'crypto'
import { randomBytes } from 'node:crypto'
import * as dns from 'dns'
import { organizationMembers, organizations, workspaces, workspaceMembers, users, tasks, lists, projects, spaces, aiUsage } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { SecurityService } from '../security/security.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { PlansService } from '../plans/plans.service'

const BASE_SLUG_FALLBACK = 'workspace'

/** Actor context threaded into audit events. `ip` is captured best-effort. */
type AuditActor = { id: string; email?: string; ip?: string }

/** Image content types accepted for a workspace logo upload (Plan §13.5). */
const LOGO_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** Hard cap on an uploaded workspace logo. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5 MB

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || BASE_SLUG_FALLBACK
}

/**
 * Guided-onboarding checklist (Plan §14.3). Raw counts of the workspace's core
 * objects, plus whether the AI assistant has been used and how many members it
 * has. Each is cheap to compute and drives a checklist step's "done" state.
 */
export type OnboardingCounts = {
  spaces: number
  projects: number
  tasks: number
  members: number
  aiEvents: number
}

/** Per-step done-state for the onboarding checklist. Verifiable from real data. */
export type OnboardingSteps = {
  /** ≥1 space created. */
  space: boolean
  /** ≥1 project created (in any space). */
  project: boolean
  /** ≥1 task created (in any list). */
  task: boolean
  /** ≥2 workspace members — i.e. at least one teammate beyond the creator. */
  invite: boolean
  /** The AI assistant has been used at least once in this workspace. */
  ai: boolean
}

/**
 * Pure done-state computation for the onboarding checklist — kept side-effect
 * free so it is unit-testable without a database. A step is "done" the moment
 * the workspace has real data proving it, so steps auto-check as the user works.
 */
export function computeOnboardingSteps(counts: OnboardingCounts): OnboardingSteps {
  return {
    space: counts.spaces > 0,
    project: counts.projects > 0,
    task: counts.tasks > 0,
    // The workspace creator is always a member; a second member means an
    // invite was accepted (or a member added), so "invite a teammate" is done.
    invite: counts.members > 1,
    ai: counts.aiEvents > 0,
  }
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
    private readonly webhooks: WebhooksService,
    private readonly r2: R2Service,
    private readonly plans: PlansService,
  ) {}

  /**
   * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
   * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
   * a downed webhook can never break a membership mutation.
   */
  private async fireWebhook(workspaceId: string, event: string, payload: Record<string, unknown>) {
    try {
      await this.webhooks.fire(workspaceId, event, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${event} failed:`, e)
    }
  }

  async findByMember(userId: string) {
    return this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
  }

  /** Soft-delete (archive) a workspace so it disappears from members' lists. */
  async archiveWorkspace(workspaceId: string, actor?: AuditActor) {
    const [row] = await this.db
      .update(workspaces)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.archived',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Workspace archived (soft-deleted)',
    })
    return row
  }

  async restoreWorkspace(workspaceId: string, actor?: AuditActor) {
    const [row] = await this.db
      .update(workspaces)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.restored',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Workspace restored from archive',
    })
    return row
  }

  /**
   * Archived workspaces the user still belongs to (Plan §13.4). The regular
   * `/workspaces` list hides these; the settings "Archived" area surfaces them
   * so an admin can restore one. Restore itself is admin-guarded.
   */
  async listArchivedWorkspaces(userId: string) {
    return this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, true)))
      .orderBy(desc(workspaces.updatedAt))
  }

  /**
   * Archived (soft-deleted) tasks across a workspace (Plan §13.4). Joined up the
   * task → list → project → space tree so we can scope by workspace and show the
   * list/project a task belongs to. Restore uses the existing task-restore route.
   */
  async listArchivedTasks(workspaceId: string) {
    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        listId: tasks.listId,
        listName: lists.name,
        projectName: projects.name,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(projects, eq(lists.projectId, projects.id))
      .innerJoin(spaces, eq(projects.spaceId, spaces.id))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, true)))
      .orderBy(desc(tasks.updatedAt))
      .limit(200)
  }

  /**
   * Presign a direct-to-R2 PUT for a workspace logo (Plan §13.5). Mirrors the
   * avatar/clip presign flow: validate image type + size, return a short-lived
   * upload URL plus the public URL the client persists via PATCH /workspaces/:id
   * (logoUrl). Keys live under `workspace-logos/<workspaceId>-<rand>.<ext>`.
   */
  async createLogoUploadUrl(workspaceId: string, body: { contentType: string; sizeBytes?: number }) {
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    const contentType = (body.contentType || '').toLowerCase()
    const ext = LOGO_CONTENT_TYPES[contentType]
    if (!ext) {
      throw new BadRequestException('Only image files (PNG, JPEG, WebP, GIF, or SVG) are allowed')
    }
    if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > MAX_LOGO_BYTES) {
      const mb = Math.round(MAX_LOGO_BYTES / (1024 * 1024))
      throw new BadRequestException(`Logo image exceeds the ${mb} MB limit`)
    }
    const key = `workspace-logos/${workspaceId}-${randomBytes(8).toString('hex')}.${ext}`
    const uploadUrl = await this.r2.presignPutObject(key, contentType, { workspaceid: workspaceId })
    const publicUrl = await this.r2.getObjectUrl(key)
    return { uploadUrl, publicUrl, storageKey: key }
  }

  async findById(id: string) {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, id))
    return ws ?? null
  }

  async getMembership(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    return row ?? null
  }

  async update(
    workspaceId: string,
    patch: { name?: string; logoUrl?: string | null; primaryColor?: string | null; accentColor?: string | null; customDomain?: string | null },
    actor?: AuditActor,
  ) {
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    // Changing the custom domain (re)mints a verification token and resets the
    // verified flag (Plan §13).
    if ('customDomain' in patch) {
      const [current] = await this.db
        .select({ customDomain: workspaces.customDomain })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
      const nextDomain = (patch.customDomain ?? '').trim() || null
      set.customDomain = nextDomain
      if ((current?.customDomain ?? null) !== nextDomain) {
        set.customDomainToken = nextDomain ? `rundesk-verify=${crypto.randomBytes(16).toString('hex')}` : null
        set.customDomainVerified = false
      }
    }
    const [row] = await this.db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Workspace settings updated`,
      metadata: {
        name: patch.name ?? null,
        logoUrl: patch.logoUrl ?? null,
        primaryColor: patch.primaryColor ?? null,
        accentColor: patch.accentColor ?? null,
        customDomain: patch.customDomain ?? null,
      },
    })
    return row
  }

  /**
   * Verify a workspace's custom domain by looking for the verification token in
   * a TXT record at _rundesk-verify.<domain> (Plan §13).
   */
  async verifyCustomDomain(workspaceId: string) {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    if (!ws.customDomain || !ws.customDomainToken) {
      throw new BadRequestException('Set a custom domain first')
    }
    const host = `_rundesk-verify.${ws.customDomain}`
    let verified = false
    try {
      const records = await dns.promises.resolveTxt(host)
      verified = records.some((chunks) => chunks.join('').includes(ws.customDomainToken!))
    } catch {
      verified = false
    }
    await this.db
      .update(workspaces)
      .set({ customDomainVerified: verified, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
    return { verified, host, expectedTxt: ws.customDomainToken }
  }

  async listMembers(workspaceId: string) {
    return this.db
      .select({
        userId: users.id,
        workspaceMemberId: workspaceMembers.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        weeklyCapacityHours: workspaceMembers.weeklyCapacityHours,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
  }

  async addMember(
    workspaceId: string,
    email: string,
    role: string = 'member',
    actor?: AuditActor,
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    if (!user) throw new BadRequestException(`No user with email ${email}`)
    const existing = await this.getMembership(workspaceId, user.id)
    if (existing) throw new ConflictException('User is already a member')
    // Plan §14.1: enforce the plan's member cap. No-op for enterprise (unlimited),
    // which is every existing workspace by default.
    await this.plans.assertCanAddMembers(workspaceId)
    await this.db.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: role as any,
    })
    // Keep the org directory consistent: any workspace member is also an org
    // member — the invariant the single-org tenant model relies on.
    const [ws] = await this.db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (ws) {
      await this.db
        .insert(organizationMembers)
        .values({ organizationId: ws.organizationId, userId: user.id, role: 'member' })
        .onConflictDoNothing()
    }
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.invited',
      resourceType: 'user',
      resourceId: user.id,
      description: `Added ${email} to workspace as ${role}`,
      metadata: { email, role },
    })
    // A direct add joins the member immediately (Plan §12.4). Best effort.
    void this.fireWebhook(workspaceId, 'member.joined', {
      workspaceId,
      userId: user.id,
      email,
      role,
      actorId: actor?.id ?? null,
    })
    return { ok: true, userId: user.id }
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: string,
    actor?: AuditActor,
  ) {
    // Only these roles may be assigned to a workspace member. Crucially this
    // excludes `super_admin` (a platform-level role in the same enum) — without
    // this allowlist any workspace admin could self-promote to god-mode.
    const ASSIGNABLE_ROLES = ['workspace_admin', 'manager', 'member', 'guest']
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`)
    }
    const previous = await this.getMembership(workspaceId, userId)
    // Never let the last workspace admin be demoted out of the workspace.
    if (previous?.role === 'workspace_admin' && role !== 'workspace_admin') {
      const admins = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'workspace_admin' as any)))
      if (admins.length <= 1) {
        throw new BadRequestException('Cannot demote the last workspace admin')
      }
    }
    await this.db
      .update(workspaceMembers)
      .set({ role: role as any })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'role.changed',
      resourceType: 'user',
      resourceId: userId,
      description: `Member role changed to ${role}`,
      metadata: { from: previous?.role ?? null, to: role },
    })
    return { ok: true }
  }

  async updateMemberCapacity(
    workspaceId: string,
    userId: string,
    weeklyCapacityHours: number,
    actor?: AuditActor,
  ) {
    if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours < 0 || weeklyCapacityHours > 168) {
      throw new BadRequestException('weeklyCapacityHours must be between 0 and 168')
    }
    const rounded = Math.round(weeklyCapacityHours)
    const previous = await this.getMembership(workspaceId, userId)
    if (!previous) throw new NotFoundException('Member not found')
    await this.db
      .update(workspaceMembers)
      .set({ weeklyCapacityHours: rounded })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.capacity_updated',
      resourceType: 'user',
      resourceId: userId,
      description: `Weekly capacity set to ${rounded}h`,
      metadata: { from: previous.weeklyCapacityHours ?? null, to: rounded },
    })
    return { ok: true, weeklyCapacityHours: rounded }
  }

  async removeMember(workspaceId: string, userId: string, actor?: AuditActor) {
    const member = await this.getMembership(workspaceId, userId)
    if (member?.role === 'workspace_admin') {
      const admins = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'workspace_admin' as any)))
      if (admins.length <= 1) {
        throw new BadRequestException('Cannot remove the last workspace admin')
      }
    }
    await this.db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.removed',
      resourceType: 'user',
      resourceId: userId,
      description: `Removed member from workspace`,
    })
    void this.fireWebhook(workspaceId, 'member.removed', {
      workspaceId,
      userId,
      actorId: actor?.id ?? null,
    })
    return { ok: true }
  }

  async create(userId: string, dto: CreateWorkspaceDto & { organizationId?: string }) {
    const requestedSlug = slugify(dto.slug ?? dto.name)
    const finalSlug = await this.reserveUniqueSlug(requestedSlug)

    return this.db.transaction(async (tx) => {
      let orgId = dto.organizationId

      if (orgId) {
        // Verify the caller belongs to the target organization.
        const [member] = await tx
          .select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(
            and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)),
          )
          .limit(1)
        if (!member) throw new ForbiddenException('Not a member of that organization')
      } else {
        // Attach the new workspace to the caller's existing organization — one
        // top-level org per tenant — rather than spawning a fresh org for every
        // workspace (the previous behaviour). Only create an org when the caller
        // genuinely has none (first-workspace path, mirroring signUp).
        const [existing] = await tx
          .select({ organizationId: organizationMembers.organizationId })
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, userId))
          .orderBy(asc(organizationMembers.joinedAt))
          .limit(1)
        if (existing) {
          orgId = existing.organizationId
        } else {
          const [org] = await tx
            .insert(organizations)
            .values({ name: dto.name, slug: finalSlug })
            .returning()
          orgId = org.id
          await tx.insert(organizationMembers).values({
            organizationId: org.id,
            userId,
            role: 'owner',
          })
        }
      }

      const [workspace] = await tx
        .insert(workspaces)
        .values({
          organizationId: orgId,
          name: dto.name,
          slug: finalSlug,
          logoUrl: dto.logoUrl,
          primaryColor: dto.primaryColor,
        })
        .returning()

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId,
        role: 'workspace_admin',
      })

      return workspace
    })
  }

  async createPersonalWorkspace(userId: string, displayName: string) {
    const name = `${displayName.split(' ')[0] || 'My'}'s Workspace`
    try {
      return await this.create(userId, { name })
    } catch (err) {
      if (err instanceof ConflictException) {
        return this.create(userId, { name, slug: slugify(`${name}-${userId.slice(0, 6)}`) })
      }
      throw err
    }
  }

  private async reserveUniqueSlug(base: string): Promise<string> {
    let candidate = base
    let attempt = 0
    while (await this.slugTaken(candidate)) {
      attempt += 1
      if (attempt > 50) {
        throw new ConflictException('Could not allocate a unique workspace slug')
      }
      candidate = `${base}-${attempt}`
    }
    return candidate
  }

  private async slugTaken(slug: string): Promise<boolean> {
    const [orgHit] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
    if (orgHit) return true
    const [wsHit] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1)
    return Boolean(wsHit)
  }

  // --- Guided onboarding checklist (Plan §14.3) ------------------------------

  private async count(query: Promise<Array<{ c: number }>>): Promise<number> {
    const [row] = await query
    return row?.c ?? 0
  }

  /**
   * Compute the onboarding checklist for a member of `workspaceId`: each step's
   * done-state is derived from real workspace data (counts of spaces, projects,
   * tasks, members and AI usage), and `dismissed` reflects the per-user flag
   * persisted on the notification-preferences jsonb. The widget hides once every
   * step is done OR the user has dismissed it.
   */
  async getOnboardingStatus(workspaceId: string, userId: string) {
    const cnt = sql<number>`count(*)::int`

    const spacesCount = await this.count(
      this.db.select({ c: cnt }).from(spaces).where(eq(spaces.workspaceId, workspaceId)),
    )
    const projectsCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(spaces.workspaceId, workspaceId)),
    )
    const tasksCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(spaces.workspaceId, workspaceId)),
    )
    const membersCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId)),
    )
    const aiCount = await this.count(
      this.db.select({ c: cnt }).from(aiUsage).where(eq(aiUsage.workspaceId, workspaceId)),
    )

    const [userRow] = await this.db
      .select({ prefs: users.notificationPreferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const dismissed =
      (userRow?.prefs as { onboarding?: { dismissed?: boolean } } | undefined)?.onboarding
        ?.dismissed === true

    const counts: OnboardingCounts = {
      spaces: spacesCount,
      projects: projectsCount,
      tasks: tasksCount,
      members: membersCount,
      aiEvents: aiCount,
    }
    return { dismissed, counts, steps: computeOnboardingSteps(counts) }
  }

  /**
   * Persist the per-user "onboarding dismissed" flag. Uses a JSONB concat merge
   * so it only sets the `onboarding` key and never clobbers other notification
   * preferences — no migration, no new column.
   */
  async dismissOnboarding(userId: string) {
    await this.db
      .update(users)
      .set({
        notificationPreferences: sql`coalesce(${users.notificationPreferences}, '{}'::jsonb) || '{"onboarding":{"dismissed":true}}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    return { dismissed: true }
  }
}
