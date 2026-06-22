import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { organizations, organizationMembers, workspaceMembers, workspaces, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

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

  async update(id: string, patch: { name?: string; logoUrl?: string | null }) {
    const [updated] = await this.db
      .update(organizations)
      .set({ ...patch, updatedAt: new Date() })
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

  async listWorkspaces(organizationId: string) {
    return this.db
      .select()
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
