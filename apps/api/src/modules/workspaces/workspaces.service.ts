import { ConflictException, Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { organizationMembers, organizations, workspaces, workspaceMembers, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { SecurityService } from '../security/security.service'

const BASE_SLUG_FALLBACK = 'workspace'

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || BASE_SLUG_FALLBACK
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
  ) {}

  async findByMember(userId: string) {
    return this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
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
    patch: { name?: string; logoUrl?: string | null; primaryColor?: string | null; customDomain?: string | null },
    actor?: { id: string; email?: string },
  ) {
    const [row] = await this.db
      .update(workspaces)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Workspace settings updated`,
      metadata: {
        name: patch.name ?? null,
        logoUrl: patch.logoUrl ?? null,
        primaryColor: patch.primaryColor ?? null,
        customDomain: patch.customDomain ?? null,
      },
    })
    return row
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
    actor?: { id: string; email?: string },
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    if (!user) throw new BadRequestException(`No user with email ${email}`)
    const existing = await this.getMembership(workspaceId, user.id)
    if (existing) throw new ConflictException('User is already a member')
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
      action: 'member.invited',
      resourceType: 'user',
      resourceId: user.id,
      description: `Added ${email} to workspace as ${role}`,
      metadata: { email, role },
    })
    return { ok: true, userId: user.id }
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: string,
    actor?: { id: string; email?: string },
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
    actor?: { id: string; email?: string },
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
      action: 'member.capacity_updated',
      resourceType: 'user',
      resourceId: userId,
      description: `Weekly capacity set to ${rounded}h`,
      metadata: { from: previous.weeklyCapacityHours ?? null, to: rounded },
    })
    return { ok: true, weeklyCapacityHours: rounded }
  }

  async removeMember(workspaceId: string, userId: string, actor?: { id: string; email?: string }) {
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
      action: 'member.removed',
      resourceType: 'user',
      resourceId: userId,
      description: `Removed member from workspace`,
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
}
