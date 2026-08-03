import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { and, eq, inArray, ilike, sql } from 'drizzle-orm'
import { workspaceGroups, workspaceGroupMembers, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

export type GroupCreateInput = {
  name: string
  description?: string | null
  externalId?: string | null
  alias?: string | null
  memberIds?: string[]
}

export type GroupUpdateInput = {
  name?: string
  description?: string | null
  externalId?: string | null
  alias?: string | null
}

/**
 * §A4.3 — an @-handle has to survive being typed by a human mid-sentence, so it
 * is reduced to the character set a mention parser can bound: lowercase
 * alphanumerics plus `-`/`_`. Returns null when nothing usable survives, which
 * leaves the team un-mentionable rather than reachable under a mangled handle.
 */
export function normalizeGroupAlias(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32)
  return cleaned.length >= 2 ? cleaned : null
}

@Injectable()
export class WorkspaceGroupsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  async list(workspaceId: string, opts: { search?: string } = {}) {
    const where = opts.search
      ? and(eq(workspaceGroups.workspaceId, workspaceId), ilike(workspaceGroups.name, `%${opts.search}%`))
      : eq(workspaceGroups.workspaceId, workspaceId)
    const groups = await this.db.select().from(workspaceGroups).where(where).orderBy(workspaceGroups.name)
    if (groups.length === 0) return []

    const ids = groups.map((g) => g.id)
    const memberRows = await this.db
      .select({
        groupId: workspaceGroupMembers.groupId,
        userId: workspaceGroupMembers.userId,
        email: users.email,
        displayName: users.displayName,
      })
      .from(workspaceGroupMembers)
      .innerJoin(users, eq(users.id, workspaceGroupMembers.userId))
      .where(inArray(workspaceGroupMembers.groupId, ids))

    const grouped = new Map<string, typeof memberRows>()
    for (const row of memberRows) {
      if (!grouped.has(row.groupId)) grouped.set(row.groupId, [])
      grouped.get(row.groupId)!.push(row)
    }

    return groups.map((g) => ({
      ...g,
      members: (grouped.get(g.id) ?? []).map((r) => ({
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
      })),
      memberCount: grouped.get(g.id)?.length ?? 0,
    }))
  }

  async get(workspaceId: string, groupId: string) {
    const [group] = await this.db
      .select()
      .from(workspaceGroups)
      .where(and(eq(workspaceGroups.id, groupId), eq(workspaceGroups.workspaceId, workspaceId)))
      .limit(1)
    if (!group) throw new NotFoundException(`Group ${groupId} not found`)
    const members = await this.db
      .select({
        userId: workspaceGroupMembers.userId,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(workspaceGroupMembers)
      .innerJoin(users, eq(users.id, workspaceGroupMembers.userId))
      .where(eq(workspaceGroupMembers.groupId, groupId))
    return { ...group, members }
  }

  /** Resolve a group by SCIM externalId or by id, scoped to workspace. */
  async findByIdOrExternal(workspaceId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(workspaceGroups)
      .where(
        and(
          eq(workspaceGroups.workspaceId, workspaceId),
          sql`(${workspaceGroups.id}::text = ${key} OR ${workspaceGroups.externalId} = ${key})`,
        ),
      )
      .limit(1)
    return row ?? null
  }

  async create(workspaceId: string, actorId: string | null, input: GroupCreateInput) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new BadRequestException('Group name is required')
    // Coerce a non-array memberIds (e.g. a stray string) to empty — otherwise
    // `.length`/`.map` on a non-array threw and surfaced as a 500.
    const memberIds = Array.isArray(input.memberIds) ? input.memberIds : []
    if (memberIds.length > 0) await this.assertMembersOfWorkspace(workspaceId, memberIds)

    // §A4.3 — every team gets a handle, derived from its name when the caller
    // does not supply one, so a group created by SCIM is mentionable too.
    const alias = await this.resolveAlias(workspaceId, normalizeGroupAlias(input.alias) ?? input.name)

    try {
      const [created] = await this.db
        .insert(workspaceGroups)
        .values({
          workspaceId,
          name: input.name.trim(),
          description: input.description ?? null,
          externalId: input.externalId ?? null,
          alias,
          createdById: actorId,
        })
        .returning()

      if (memberIds.length > 0) {
        await this.db
          .insert(workspaceGroupMembers)
          .values(memberIds.map((userId) => ({ groupId: created.id, userId })))
          .onConflictDoNothing()
      }

      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'group.created',
        resourceType: 'workspace_group',
        resourceId: created.id,
        description: `Created group "${created.name}"`,
        metadata: { name: created.name, memberCount: memberIds.length },
      })

      return this.get(workspaceId, created.id)
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`A group named "${input.name}" already exists`)
      }
      throw err
    }
  }

  async update(workspaceId: string, groupId: string, actorId: string | null, input: GroupUpdateInput) {
    const existing = await this.get(workspaceId, groupId)
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== existing.name) {
      patch.name = input.name.trim()
    }
    if (input.description !== undefined) patch.description = input.description
    if (input.externalId !== undefined) patch.externalId = input.externalId
    if (input.alias !== undefined) {
      const desired = normalizeGroupAlias(input.alias)
      // An explicitly blank alias removes the handle; anything else is claimed,
      // suffixed if a sibling team already answers to it.
      patch.alias = desired ? await this.resolveAlias(workspaceId, desired, groupId) : null
    }

    if (Object.keys(patch).length > 1) {
      await this.db.update(workspaceGroups).set(patch).where(eq(workspaceGroups.id, groupId))
      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'group.updated',
        resourceType: 'workspace_group',
        resourceId: groupId,
        description: `Updated group "${existing.name}"`,
        metadata: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') },
      })
    }

    return this.get(workspaceId, groupId)
  }

  async remove(workspaceId: string, groupId: string, actorId: string | null) {
    const existing = await this.get(workspaceId, groupId)
    await this.db.delete(workspaceGroups).where(eq(workspaceGroups.id, groupId))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.deleted',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Deleted group "${existing.name}"`,
    })
    return { ok: true }
  }

  async addMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]) {
    const existing = await this.get(workspaceId, groupId)
    if (userIds.length === 0) return existing
    await this.assertMembersOfWorkspace(workspaceId, userIds)
    await this.db
      .insert(workspaceGroupMembers)
      .values(userIds.map((userId) => ({ groupId, userId })))
      .onConflictDoNothing()
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.members_added',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Added ${userIds.length} member${userIds.length === 1 ? '' : 's'} to "${existing.name}"`,
      metadata: { count: userIds.length },
    })
    return this.get(workspaceId, groupId)
  }

  async removeMember(workspaceId: string, groupId: string, actorId: string | null, userId: string) {
    const existing = await this.get(workspaceId, groupId)
    await this.db
      .delete(workspaceGroupMembers)
      .where(and(eq(workspaceGroupMembers.groupId, groupId), eq(workspaceGroupMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.member_removed',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Removed member from "${existing.name}"`,
      metadata: { userId },
    })
    return this.get(workspaceId, groupId)
  }

  /**
   * Replace the entire member set. Used by SCIM PUT and by admin bulk edits.
   * Returns the refreshed group payload.
   */
  async replaceMembers(workspaceId: string, groupId: string, actorId: string | null, userIds: string[]) {
    const existing = await this.get(workspaceId, groupId)
    if (userIds.length > 0) await this.assertMembersOfWorkspace(workspaceId, userIds)

    await this.db.transaction(async (tx) => {
      await tx.delete(workspaceGroupMembers).where(eq(workspaceGroupMembers.groupId, groupId))
      if (userIds.length > 0) {
        await tx
          .insert(workspaceGroupMembers)
          .values(userIds.map((userId) => ({ groupId, userId })))
          .onConflictDoNothing()
      }
    })

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'group.members_replaced',
      resourceType: 'workspace_group',
      resourceId: groupId,
      description: `Replaced member set on "${existing.name}" (${userIds.length} members)`,
      metadata: { count: userIds.length },
    })
    return this.get(workspaceId, groupId)
  }

  /**
   * Claim a free handle in this workspace, suffixing `-2`, `-3`… on collision.
   * The unique index is still the authority; this only keeps the common case
   * from surfacing as a 409 the admin has to resolve by hand.
   */
  private async resolveAlias(
    workspaceId: string,
    desired: string | null | undefined,
    excludeGroupId?: string,
  ): Promise<string | null> {
    const base = normalizeGroupAlias(desired)
    if (!base) return null
    const taken = await this.db
      .select({ alias: workspaceGroups.alias, id: workspaceGroups.id })
      .from(workspaceGroups)
      .where(eq(workspaceGroups.workspaceId, workspaceId))
    const used = new Set(
      taken.filter((r) => r.id !== excludeGroupId && r.alias).map((r) => r.alias!.toLowerCase()),
    )
    if (!used.has(base)) return base
    for (let n = 2; n < 100; n++) {
      const candidate = `${base.slice(0, 29)}-${n}`
      if (!used.has(candidate)) return candidate
    }
    return null
  }

  private async assertMembersOfWorkspace(workspaceId: string, userIds: string[]) {
    const valid = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, userIds)))
    const validSet = new Set(valid.map((v) => v.userId))
    const missing = userIds.filter((id) => !validSet.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `These users are not workspace members and cannot be added to a group: ${missing.join(', ')}`,
      )
    }
  }
}
