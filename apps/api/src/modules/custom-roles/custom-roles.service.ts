import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import {
  customRoles,
  customRolePermissions,
  workspaceMembers,
  workspaceMemberCustomRoles,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import { roleRank } from '../../common/permissions/workspace-roles'
import {
  effectiveCascade,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  ROLE_RANK,
  isKnownPermission,
  type LegacyWorkspaceRole,
  type Permission,
} from './permission-catalog'

const RESERVED_NAMES = new Set(['admin', 'workspace admin', 'manager', 'member', 'guest', 'super admin'])
const NAME_MAX = 60
const DESCRIPTION_MAX = 240
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

type LegacyRole = LegacyWorkspaceRole

export interface RoleView {
  id: string
  workspaceId: string
  name: string
  description: string | null
  color: string
  isLocked: boolean
  position: number
  permissions: Permission[]
  memberCount: number
  createdAt: Date
  updatedAt: Date
}

export interface PermissionResolution {
  permissions: Permission[]
  legacyRole: LegacyRole
  customRoleIds: string[]
}

@Injectable()
export class CustomRolesService {
  /**
   * Tiny in-process cache of resolved permission sets keyed by
   * `workspaceMemberId`. Invalidated on any role / assignment mutation
   * for that member. Sized small and intentionally not LRU — this is a
   * hot read path for permission checks and we'd rather rebuild than
   * over-engineer eviction.
   */
  private readonly permissionCache = new Map<string, PermissionResolution>()
  private static readonly CACHE_MAX = 500

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly security: SecurityService,
  ) {}

  // -------------------------------------------------------------- CRUD

  async list(workspaceId: string): Promise<RoleView[]> {
    const rows = await this.db
      .select()
      .from(customRoles)
      .where(eq(customRoles.workspaceId, workspaceId))
      .orderBy(asc(customRoles.position), asc(customRoles.createdAt))
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const [perms, counts] = await Promise.all([
      this.db
        .select()
        .from(customRolePermissions)
        .where(inArray(customRolePermissions.roleId, ids)),
      this.db
        .select({ roleId: workspaceMemberCustomRoles.roleId })
        .from(workspaceMemberCustomRoles)
        .where(inArray(workspaceMemberCustomRoles.roleId, ids)),
    ])

    const permsByRole = new Map<string, Permission[]>()
    for (const p of perms) {
      if (!isKnownPermission(p.permission)) continue
      const list = permsByRole.get(p.roleId) ?? []
      list.push(p.permission)
      permsByRole.set(p.roleId, list)
    }
    const countByRole = new Map<string, number>()
    for (const c of counts) countByRole.set(c.roleId, (countByRole.get(c.roleId) ?? 0) + 1)

    return rows.map((r) => this.toView(r, permsByRole.get(r.id) ?? [], countByRole.get(r.id) ?? 0))
  }

  async getById(workspaceId: string, roleId: string): Promise<RoleView> {
    const role = await this.requireRole(workspaceId, roleId)
    const [perms, assignments] = await Promise.all([
      this.db
        .select()
        .from(customRolePermissions)
        .where(eq(customRolePermissions.roleId, roleId)),
      this.db
        .select({ id: workspaceMemberCustomRoles.id })
        .from(workspaceMemberCustomRoles)
        .where(eq(workspaceMemberCustomRoles.roleId, roleId)),
    ])
    return this.toView(
      role,
      perms.map((p) => p.permission).filter(isKnownPermission),
      assignments.length,
    )
  }

  async create(
    workspaceId: string,
    input: { name: string; description?: string | null; color?: string; permissions?: string[] },
    actor: { id: string; email?: string; role?: string | null },
  ): Promise<RoleView> {
    const name = this.normaliseName(input.name)
    const description = this.normaliseDescription(input.description ?? null)
    const color = this.normaliseColor(input.color)
    const permissions = this.normalisePermissions(input.permissions ?? [])
    await this.assertMayGive(workspaceId, actor, permissions)

    await this.assertNameAvailable(workspaceId, name)

    const [highest] = await this.db
      .select({ position: customRoles.position })
      .from(customRoles)
      .where(eq(customRoles.workspaceId, workspaceId))
      .orderBy(desc(customRoles.position))
      .limit(1)
    const nextPos = highest ? highest.position + 1 : 0

    const [created] = await this.db
      .insert(customRoles)
      .values({
        workspaceId,
        name,
        description,
        color,
        position: nextPos,
        createdById: actor.id,
      })
      .returning()
    if (!created) throw new Error('Failed to create role')

    if (permissions.length > 0) {
      await this.db
        .insert(customRolePermissions)
        .values(permissions.map((permission) => ({ roleId: created.id, permission })))
    }

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'role.created',
      resourceType: 'custom_role',
      resourceId: created.id,
      description: `Custom role "${name}" created`,
      metadata: { name, permissions: permissions.length },
    })

    return this.toView(created, permissions, 0)
  }

  async update(
    workspaceId: string,
    roleId: string,
    patch: { name?: string; description?: string | null; color?: string; permissions?: string[] },
    actor: { id: string; email?: string; role?: string | null },
  ): Promise<RoleView> {
    const existing = await this.requireRole(workspaceId, roleId)
    // What the role gives now, and what it would: nobody edits a role past
    // the permissions they hold themselves, either way.
    await this.assertMayGive(workspaceId, actor, [
      ...(await this.permissionsOfRole(roleId)),
      ...(patch.permissions !== undefined ? this.normalisePermissions(patch.permissions) : []),
    ])

    const next: Partial<typeof customRoles.$inferInsert> = {}
    if (patch.name !== undefined) {
      if (existing.isLocked) throw new BadRequestException('Locked roles cannot be renamed')
      const name = this.normaliseName(patch.name)
      if (name !== existing.name) await this.assertNameAvailable(workspaceId, name)
      next.name = name
    }
    if (patch.description !== undefined) next.description = this.normaliseDescription(patch.description)
    if (patch.color !== undefined) next.color = this.normaliseColor(patch.color)

    if (Object.keys(next).length > 0) {
      next.updatedAt = new Date()
      await this.db.update(customRoles).set(next).where(eq(customRoles.id, roleId))
    }

    if (patch.permissions !== undefined) {
      const permissions = this.normalisePermissions(patch.permissions)
      await this.db.delete(customRolePermissions).where(eq(customRolePermissions.roleId, roleId))
      if (permissions.length > 0) {
        await this.db
          .insert(customRolePermissions)
          .values(permissions.map((permission) => ({ roleId, permission })))
      }
    }

    this.invalidateAfterRoleChange()

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'role.updated',
      resourceType: 'custom_role',
      resourceId: roleId,
      description: `Custom role "${next.name ?? existing.name}" updated`,
    })

    return this.getById(workspaceId, roleId)
  }

  async remove(workspaceId: string, roleId: string, actor: { id: string; email?: string; role?: string | null }) {
    const existing = await this.requireRole(workspaceId, roleId)
    if (existing.isLocked) throw new BadRequestException('Locked roles cannot be deleted')
    await this.assertMayGive(workspaceId, actor, await this.permissionsOfRole(roleId))

    await this.db.delete(customRoles).where(eq(customRoles.id, roleId))
    this.invalidateAfterRoleChange()

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'role.deleted',
      resourceType: 'custom_role',
      resourceId: roleId,
      description: `Custom role "${existing.name}" deleted`,
    })
  }

  // -------------------------------------------------------- assignments

  async listAssignees(workspaceId: string, roleId: string): Promise<string[]> {
    await this.requireRole(workspaceId, roleId)
    const rows = await this.db
      .select({ memberId: workspaceMemberCustomRoles.workspaceMemberId })
      .from(workspaceMemberCustomRoles)
      .where(eq(workspaceMemberCustomRoles.roleId, roleId))
    return rows.map((r) => r.memberId)
  }

  async listForMember(workspaceId: string, workspaceMemberId: string): Promise<RoleView[]> {
    const rows = await this.db
      .select({
        role:        customRoles,
        assignment:  workspaceMemberCustomRoles,
      })
      .from(workspaceMemberCustomRoles)
      .innerJoin(customRoles, eq(customRoles.id, workspaceMemberCustomRoles.roleId))
      .where(
        and(
          eq(workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId),
          eq(customRoles.workspaceId, workspaceId),
        ),
      )

    if (rows.length === 0) return []
    const ids = rows.map((r) => r.role.id)
    const perms = await this.db
      .select()
      .from(customRolePermissions)
      .where(inArray(customRolePermissions.roleId, ids))
    const permsByRole = new Map<string, Permission[]>()
    for (const p of perms) {
      if (!isKnownPermission(p.permission)) continue
      const list = permsByRole.get(p.roleId) ?? []
      list.push(p.permission)
      permsByRole.set(p.roleId, list)
    }
    return rows.map(({ role }) => this.toView(role, permsByRole.get(role.id) ?? [], 0))
  }

  async assign(
    workspaceId: string,
    workspaceMemberId: string,
    roleId: string,
    actor: { id: string; email?: string; role?: string | null },
  ) {
    const role = await this.requireRole(workspaceId, roleId)
    await this.requireMember(workspaceId, workspaceMemberId)
    await this.assertMayGive(workspaceId, actor, await this.permissionsOfRole(roleId))

    try {
      await this.db.insert(workspaceMemberCustomRoles).values({
        workspaceMemberId,
        roleId,
        assignedById: actor.id,
      })
    } catch (err) {
      // Idempotent — re-assigning the same role is a no-op.
      if (!String(err).includes('uq_workspace_member_custom_roles_member_role')) throw err
    }
    this.permissionCache.delete(workspaceMemberId)

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'role.assigned',
      resourceType: 'workspace_member',
      resourceId: workspaceMemberId,
      description: `Assigned role "${role.name}" to member`,
      metadata: { roleId },
    })
  }

  async unassign(
    workspaceId: string,
    workspaceMemberId: string,
    roleId: string,
    actor: { id: string; email?: string; role?: string | null },
  ) {
    const role = await this.requireRole(workspaceId, roleId)
    await this.assertMayGive(workspaceId, actor, await this.permissionsOfRole(roleId))
    await this.db
      .delete(workspaceMemberCustomRoles)
      .where(
        and(
          eq(workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId),
          eq(workspaceMemberCustomRoles.roleId, roleId),
        ),
      )
    this.permissionCache.delete(workspaceMemberId)

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'role.unassigned',
      resourceType: 'workspace_member',
      resourceId: workspaceMemberId,
      description: `Removed role "${role.name}" from member`,
      metadata: { roleId },
    })
  }

  // ------------------------------------------------------ permission API

  /**
   * Resolve the effective permission set for a user within a workspace,
   * unioning the legacy-role grant with every assigned custom role.
   * Returns null if the user is not a member of the workspace.
   */
  async resolveForUser(workspaceId: string, userId: string): Promise<PermissionResolution | null> {
    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    if (!membership) return null
    return this.resolveForMember(membership.id, membership.role as LegacyRole)
  }

  async resolveForMember(workspaceMemberId: string, legacyRole: LegacyRole): Promise<PermissionResolution> {
    const cached = this.permissionCache.get(workspaceMemberId)
    if (cached && cached.legacyRole === legacyRole) return cached

    const assignments = await this.db
      .select({ roleId: workspaceMemberCustomRoles.roleId })
      .from(workspaceMemberCustomRoles)
      .where(eq(workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId))

    const customRoleIds = assignments.map((a) => a.roleId)
    const customPerms = customRoleIds.length
      ? await this.db
          .select()
          .from(customRolePermissions)
          .where(inArray(customRolePermissions.roleId, customRoleIds))
      : []

    const merged = new Set<Permission>(effectiveCascade(legacyRole))
    for (const p of customPerms) {
      if (isKnownPermission(p.permission)) merged.add(p.permission)
    }

    const resolution: PermissionResolution = {
      permissions: Array.from(merged).sort(),
      legacyRole,
      customRoleIds,
    }

    if (this.permissionCache.size >= CustomRolesService.CACHE_MAX) {
      // Cheap eviction: drop one arbitrary entry. The set is small enough
      // that occasional rebuilds are fine.
      const firstKey = this.permissionCache.keys().next().value
      if (firstKey) this.permissionCache.delete(firstKey)
    }
    this.permissionCache.set(workspaceMemberId, resolution)
    return resolution
  }

  /**
   * Convenience helper for callers that already know the workspaceId
   * and userId (e.g. controllers). Returns `false` if the user is not
   * a member of the workspace at all.
   */
  async hasPermission(workspaceId: string, userId: string, permission: Permission): Promise<boolean> {
    const resolution = await this.resolveForUser(workspaceId, userId)
    if (!resolution) return false
    return resolution.permissions.includes(permission)
  }

  /**
   * Every member of the workspace who holds `permission`: by their base role's
   * defaults, or by a custom role — `hasPermission` for a whole workspace, for
   * a caller that tells the holders something (who approves a timesheet).
   */
  async holdersOf(workspaceId: string, permission: Permission): Promise<string[]> {
    const byDefault = (Object.keys(ROLE_RANK) as LegacyRole[]).filter((r) => effectiveCascade(r).includes(permission))
    const [byRole, byGrant] = await Promise.all([
      byDefault.length > 0
        ? this.db
            .select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.role, byDefault)))
        : Promise.resolve([] as { userId: string }[]),
      this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(workspaceMemberCustomRoles, eq(workspaceMemberCustomRoles.workspaceMemberId, workspaceMembers.id))
        .innerJoin(customRolePermissions, eq(customRolePermissions.roleId, workspaceMemberCustomRoles.roleId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(customRolePermissions.permission, permission))),
    ])
    return [...new Set([...byRole, ...byGrant].map((r) => r.userId))]
  }

  // ----------------------------------------------------------- helpers

  /**
   * What `actor` holds in the workspace: every key of their base role's
   * defaults and their custom roles, and their base role's rank. A platform
   * admin holds every key and outranks every workspace role. Null when they
   * are not a member.
   */
  async grantsOf(
    workspaceId: string,
    actor: { id: string; role?: string | null },
  ): Promise<{ permissions: ReadonlySet<string>; rank: number } | null> {
    if (actor.role === 'super_admin') return { permissions: PERMISSION_KEYS, rank: roleRank('super_admin') }
    const [membership] = await this.db
      .select({ id: workspaceMembers.id, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (!membership) return null
    const resolved = await this.resolveForMember(membership.id, membership.role as LegacyRole)
    return { permissions: new Set(resolved.permissions), rank: roleRank(membership.role) }
  }

  /**
   * NOBODY GIVES A PERMISSION THEY DO NOT HOLD (`managers-grant-themselves-admin`).
   *
   * A role is made, edited, deleted, assigned or taken away only within the
   * actor's own permissions: otherwise `roles.manage` is every other key, since
   * its holder writes a role with all of them and takes it. An admin holds
   * every key by default, so this refuses them nothing.
   */
  async assertMayGive(workspaceId: string, actor: { id: string; role?: string | null }, permissions: readonly string[]): Promise<void> {
    const grants = await this.grantsOf(workspaceId, actor)
    if (!grants) throw new ForbiddenException('Not a workspace member')
    const beyond = [...new Set(permissions)].filter((p) => !grants.permissions.has(p))
    if (beyond.length > 0) {
      throw new ForbiddenException(`You cannot give or take away a permission you do not hold: ${beyond.join(', ')}`)
    }
  }

  private async permissionsOfRole(roleId: string): Promise<string[]> {
    const rows = await this.db
      .select({ permission: customRolePermissions.permission })
      .from(customRolePermissions)
      .where(eq(customRolePermissions.roleId, roleId))
    return rows.map((r) => r.permission)
  }

  private async requireRole(workspaceId: string, roleId: string) {
    const [role] = await this.db
      .select()
      .from(customRoles)
      .where(and(eq(customRoles.id, roleId), eq(customRoles.workspaceId, workspaceId)))
    if (!role) throw new NotFoundException('Role not found')
    return role
  }

  private async requireMember(workspaceId: string, workspaceMemberId: string) {
    const [member] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, workspaceMemberId), eq(workspaceMembers.workspaceId, workspaceId)))
    if (!member) throw new NotFoundException('Member not found')
    return member
  }

  private async assertNameAvailable(workspaceId: string, name: string) {
    const [existing] = await this.db
      .select({ id: customRoles.id })
      .from(customRoles)
      .where(and(eq(customRoles.workspaceId, workspaceId), eq(customRoles.name, name)))
    if (existing) throw new ConflictException('A role with that name already exists')
  }

  private invalidateAfterRoleChange() {
    // Any member with this role might now have a stale resolution.
    // We don't know which ones without an extra query, so just nuke
    // the whole cache. It's small.
    this.permissionCache.clear()
  }

  private normaliseName(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) throw new BadRequestException('Name is required')
    if (trimmed.length > NAME_MAX) throw new BadRequestException(`Name must be ${NAME_MAX} characters or fewer`)
    if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
      throw new BadRequestException(`"${trimmed}" is reserved — pick a different name`)
    }
    return trimmed
  }

  private normaliseDescription(raw: string | null): string | null {
    if (raw === null) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.length > DESCRIPTION_MAX) {
      throw new BadRequestException(`Description must be ${DESCRIPTION_MAX} characters or fewer`)
    }
    return trimmed
  }

  private normaliseColor(raw: string | undefined): string {
    if (!raw) return '#64748b'
    if (!COLOR_RE.test(raw)) throw new BadRequestException('Color must be a #RRGGBB hex value')
    return raw.toLowerCase()
  }

  private normalisePermissions(raw: unknown): Permission[] {
    const seen = new Set<Permission>()
    // Guard non-array input (e.g. permissions:{}) — otherwise `for…of` on a
    // non-iterable threw and surfaced as a 500 instead of a clean 400.
    if (!Array.isArray(raw)) {
      throw new BadRequestException('permissions must be an array of permission keys')
    }
    for (const candidate of raw) {
      if (typeof candidate !== 'string') continue
      const trimmed = candidate.trim()
      if (!trimmed) continue
      if (!isKnownPermission(trimmed)) {
        throw new BadRequestException(`Unknown permission: ${trimmed}`)
      }
      seen.add(trimmed)
    }
    return Array.from(seen).sort()
  }

  private toView(
    row: typeof customRoles.$inferSelect,
    permissions: Permission[],
    memberCount: number,
  ): RoleView {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      color: row.color,
      isLocked: row.isLocked,
      position: row.position,
      permissions,
      memberCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  /**
   * Static export of the catalog so the controller can serve it without
   * needing to inject the service in a request scope. Lives here so
   * future filtering by feature flag stays in one place.
   */
  getCatalog() {
    return PERMISSION_CATALOG
  }
}
