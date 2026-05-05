import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { organizations, organizationMembers, workspaces, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findById(id: string) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, id))
    return org ?? null
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

  async updateMemberRole(organizationId: string, userId: string, role: 'owner' | 'admin' | 'billing' | 'member') {
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
