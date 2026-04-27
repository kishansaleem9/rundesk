import { ConflictException, Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { organizations, workspaces, workspaceMembers, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'

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
  constructor(@Inject(DB_TOKEN) private db: Db) {}

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
  ) {
    const [row] = await this.db
      .update(workspaces)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    return row
  }

  async listMembers(workspaceId: string) {
    return this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
  }

  async addMember(workspaceId: string, email: string, role: string = 'member') {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    if (!user) throw new BadRequestException(`No user with email ${email}`)
    const existing = await this.getMembership(workspaceId, user.id)
    if (existing) throw new ConflictException('User is already a member')
    await this.db.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: role as any,
    })
    return { ok: true, userId: user.id }
  }

  async updateMemberRole(workspaceId: string, userId: string, role: string) {
    await this.db
      .update(workspaceMembers)
      .set({ role: role as any })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    return { ok: true }
  }

  async removeMember(workspaceId: string, userId: string) {
    await this.db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    return { ok: true }
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const requestedSlug = slugify(dto.slug ?? dto.name)
    const finalSlug = await this.reserveUniqueSlug(requestedSlug)

    return this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: dto.name, slug: finalSlug })
        .returning()

      const [workspace] = await tx
        .insert(workspaces)
        .values({
          organizationId: org.id,
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
