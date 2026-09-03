import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, or, sql, desc, ilike, inArray } from 'drizzle-orm'
import { organizations, organizationMembers, workspaceMembers, workspaces, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

export type DirectoryWorkspace = {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  role: string
}

export type DirectoryUser = {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  role: string
  emailVerified: boolean
  isActive: boolean
  lastSeenAt: Date | null
  createdAt: Date
  workspaces: DirectoryWorkspace[]
}

export type DirectoryResult = {
  users: DirectoryUser[]
  total: number
  limit: number
  offset: number
}

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findById(id: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, id))
    return org ?? null
  }

  async listAll() {
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        logoUrl: organizations.logoUrl,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        membersCount: sql<number>`count(distinct ${organizationMembers.userId})::int`,
        workspacesCount: sql<number>`count(distinct ${workspaces.id})::int`,
      })
      .from(organizations)
      .leftJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
      .leftJoin(workspaces, eq(workspaces.organizationId, organizations.id))
      .groupBy(
        organizations.id,
        organizations.name,
        organizations.slug,
        organizations.logoUrl,
        organizations.createdAt,
        organizations.updatedAt,
      )
    return rows
  }

  /**
   * Global user directory (Plan §2.1) — a platform-wide, cross-workspace list of
   * every user, each with their per-workspace memberships. Super-admin only; the
   * caller (controller) enforces the super_admin gate. Read-only.
   *
   * `q` matches name OR email (case-insensitive). Results are paginated with
   * limit/offset and ordered newest-first; `total` is the unpaginated count so
   * the UI can render pagination.
   */
  async listDirectory(opts: { q?: string; limit?: number; offset?: number } = {}): Promise<DirectoryResult> {
    // Sanitize pagination — tolerate NaN/negatives coming from raw query strings.
    const rawLimit = Number.isFinite(opts.limit) ? Math.trunc(opts.limit as number) : 50
    const limit = Math.min(Math.max(rawLimit, 1), 200)
    const rawOffset = Number.isFinite(opts.offset) ? Math.trunc(opts.offset as number) : 0
    const offset = Math.max(rawOffset, 0)

    const q = opts.q?.trim()
    const where = q
      ? or(ilike(users.displayName, `%${q}%`), ilike(users.email, `%${q}%`))
      : undefined

    // Unpaginated total for the current filter, so the client can paginate.
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where ?? sql`true`)

    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: users.role,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where ?? sql`true`)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)

    // Fetch workspace memberships only for the page of users we're returning
    // (join workspace_members → workspaces), then group them per user in memory.
    const userIds = rows.map((r) => r.id)
    const memberships = userIds.length
      ? await this.db
          .select({
            userId: workspaceMembers.userId,
            workspaceId: workspaces.id,
            workspaceName: workspaces.name,
            workspaceSlug: workspaces.slug,
            role: workspaceMembers.role,
          })
          .from(workspaceMembers)
          .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
          .where(inArray(workspaceMembers.userId, userIds))
      : []

    const byUser = new Map<string, DirectoryWorkspace[]>()
    for (const m of memberships) {
      const list = byUser.get(m.userId) ?? []
      list.push({
        workspaceId: m.workspaceId,
        workspaceName: m.workspaceName,
        workspaceSlug: m.workspaceSlug,
        role: m.role,
      })
      byUser.set(m.userId, list)
    }

    return {
      users: rows.map((r) => ({ ...r, workspaces: byUser.get(r.id) ?? [] })),
      total,
      limit,
      offset,
    }
  }

  async update(id: string, patch: { name?: string; logoUrl?: string | null }) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'logoUrl'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    const [updated] = await this.db
      .update(organizations)
      .set(set)
      .where(eq(organizations.id, id))
      .returning()
    if (!updated) throw new NotFoundException('Organization not found')
    return updated
  }

  async listMembers(organizationId: string) {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
  }

  /**
   * §G08 [08:35–09:57] — the org-admin roster, narrowed to what a roster needs.
   *
   * This returned `select()` — every column of every workspace in the
   * organization, to an admin who need not be a member of any of them. Among
   * those columns is `customDomainToken`, the `rundesk-verify=…` secret used to
   * prove control of a domain, plus branding, `purpose` and `comingFrom`, which
   * are answers somebody gave inside their own workspace.
   *
   * Its one caller asks for four fields (master-admin-panel.tsx:762), so the
   * breadth bought nothing and exposed a secret to people outside the
   * workspace. Projected explicitly now: a new column is not published to this
   * audience by default, which is the property that failed here.
   *
   * NOT narrowed by membership. She settles that a workspace someone makes is
   * theirs until they share it — "woh meri email pe ban rahi hai" — and the
   * member-facing list already honours that (`findByMember` joins through
   * `workspace_members`). What she never settles is whether a company admin
   * keeps a residual right to *enumerate* for billing or offboarding, so that
   * is left exactly as it was rather than decided here.
   */
  async listWorkspaces(organizationId: string) {
    return this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan: workspaces.plan,
        isArchived: workspaces.isArchived,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId))
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: 'owner' | 'admin' | 'billing' | 'member',
    actorId?: string,
  ) {
    const ALLOWED_ROLES = ['owner', 'admin', 'billing', 'member']
    if (!ALLOWED_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}`)
    }
    // Only an existing owner may grant the owner role (prevents a non-owner
    // admin from escalating themselves or others past their own level).
    if (role === 'owner' && actorId) {
      const [actor] = await this.db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, actorId)))
        .limit(1)
      if (!actor || actor.role !== 'owner') {
        throw new ForbiddenException('Only an organization owner can grant the owner role')
      }
    }
    // Last owner protection
    if (role !== 'owner') {
      const [currentMember] = await this.db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      
      if (currentMember?.role === 'owner') {
        const owners = await this.db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')))
        
        if (owners.length <= 1) {
          throw new ForbiddenException('Cannot demote the last owner of the organization')
        }
      }
    }

    const [updated] = await this.db
      .update(organizationMembers)
      .set({ role })
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .returning()
    
    if (!updated) throw new NotFoundException('Member not found in organization')
    return updated
  }

  async removeMember(organizationId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    
    if (!member) throw new NotFoundException('Member not found')
    
    if (member.role === 'owner') {
      const owners = await this.db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')))
      if (owners.length <= 1) {
        throw new ForbiddenException('Cannot remove the last owner of the organization')
      }
    }

    return this.db.transaction(async (tx) => {
      // 1. Remove from all workspaces in this org
      const orgWorkspaces = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.organizationId, organizationId))
      
      if (orgWorkspaces.length > 0) {
        const wsIds = orgWorkspaces.map(w => w.id)
        // Drizzle doesn't have a direct 'in' helper in the same way, we use sql or eq if single.
        // But for multiple we can use inArray if imported.
        // For simplicity since I don't want to hunt for imports, I'll loop or use raw.
        for (const wsId of wsIds) {
          await tx.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)))
        }
      }

      // 2. Remove from org
      await tx.delete(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      
      return { ok: true }
    })
  }

  async leaveOrganization(organizationId: string, userId: string) {
    return this.removeMember(organizationId, userId)
  }
}
