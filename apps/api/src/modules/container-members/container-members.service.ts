import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { spaceMembers, projectMembers, spaces, projects, workspaceMembers, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type ContainerRole = 'admin' | 'edit' | 'comment' | 'view'
const CONTAINER_ROLES: ContainerRole[] = ['admin', 'edit', 'comment', 'view']
const WS_MANAGE_ROLES = ['workspace_admin', 'manager', 'super_admin']

function assertRole(role: string): asserts role is ContainerRole {
  if (!CONTAINER_ROLES.includes(role as ContainerRole)) throw new BadRequestException('Invalid role')
}

@Injectable()
export class ContainerMembersService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private async isWorkspaceManager(workspaceId: string, userId: string) {
    const [wm] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return !!wm && WS_MANAGE_ROLES.includes(wm.role as string)
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────

  private async spaceCtx(spaceId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, visibility: spaces.visibility })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1)
    if (!row) throw new NotFoundException('Space not found')
    return row
  }

  private async assertCanManageSpace(spaceId: string, actorId: string) {
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    if (sm?.role === 'admin') return
    const ctx = await this.spaceCtx(spaceId)
    if (await this.isWorkspaceManager(ctx.workspaceId, actorId)) return
    throw new ForbiddenException('Only a space admin or workspace manager can manage this space')
  }

  async listSpaceMembers(spaceId: string) {
    await this.spaceCtx(spaceId)
    return this.db
      .select({
        userId: spaceMembers.userId,
        role: spaceMembers.role,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(spaceMembers)
      .innerJoin(users, eq(users.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, spaceId))
  }

  async addSpaceMember(spaceId: string, actorId: string, userId: string, role: string = 'edit') {
    assertRole(role)
    await this.assertCanManageSpace(spaceId, actorId)
    await this.db
      .insert(spaceMembers)
      .values({ spaceId, userId, role, addedById: actorId })
      .onConflictDoNothing()
    return { ok: true }
  }

  async updateSpaceMemberRole(spaceId: string, actorId: string, userId: string, role: string) {
    assertRole(role)
    await this.assertCanManageSpace(spaceId, actorId)
    const [row] = await this.db
      .update(spaceMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Member not found')
    return row
  }

  async removeSpaceMember(spaceId: string, actorId: string, userId: string) {
    await this.assertCanManageSpace(spaceId, actorId)
    await this.db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    return { ok: true }
  }

  async setSpaceVisibility(spaceId: string, actorId: string, visibility: string) {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    await this.assertCanManageSpace(spaceId, actorId)
    const [row] = await this.db
      .update(spaces)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(spaces.id, spaceId))
      .returning()
    return row
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  private async projectCtx(projectId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, spaceId: projects.spaceId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found')
    return row
  }

  private async assertCanManageProject(projectId: string, actorId: string) {
    const [pm] = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId)))
      .limit(1)
    if (pm?.role === 'admin') return
    const ctx = await this.projectCtx(projectId)
    // A space admin (of the owning space) can manage its projects too.
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    if (sm?.role === 'admin') return
    if (await this.isWorkspaceManager(ctx.workspaceId, actorId)) return
    throw new ForbiddenException('Only a project/space admin or workspace manager can manage this project')
  }

  async listProjectMembers(projectId: string) {
    await this.projectCtx(projectId)
    return this.db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
  }

  async addProjectMember(projectId: string, actorId: string, userId: string, role: string = 'edit') {
    assertRole(role)
    await this.assertCanManageProject(projectId, actorId)
    await this.db
      .insert(projectMembers)
      .values({ projectId, userId, role, addedById: actorId })
      .onConflictDoNothing()
    return { ok: true }
  }

  async updateProjectMemberRole(projectId: string, actorId: string, userId: string, role: string) {
    assertRole(role)
    await this.assertCanManageProject(projectId, actorId)
    const [row] = await this.db
      .update(projectMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Member not found')
    return row
  }

  async removeProjectMember(projectId: string, actorId: string, userId: string) {
    await this.assertCanManageProject(projectId, actorId)
    await this.db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    return { ok: true }
  }

  async setProjectVisibility(projectId: string, actorId: string, visibility: string | null) {
    if (visibility !== null && visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException('visibility must be public, private or null (inherit)')
    }
    await this.assertCanManageProject(projectId, actorId)
    const [row] = await this.db
      .update(projects)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
    return row
  }
}
