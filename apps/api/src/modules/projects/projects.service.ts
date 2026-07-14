import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or, inArray, sql } from 'drizzle-orm'
import { projects, spaces, projectMembers, spaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async createProject(
    spaceId: string,
    data: { name: string; description?: string; color?: string; icon?: string; folderId?: string },
    actorId?: string,
  ) {
    const result = await this.db
      .insert(projects)
      .values({
        spaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
        folderId: data.folderId ?? null,
        createdById: actorId ?? null,
      })
      .returning()

    const project = result[0]
    // Seed the creator as an admin member (mirrors the 0035 backfill).
    if (actorId && project) {
      await this.db
        .insert(projectMembers)
        .values({ projectId: project.id, userId: actorId, role: 'admin', addedById: actorId })
        .onConflictDoNothing()
    }
    return project
  }

  /** List only the archived projects of a space (for the restore UI). */
  async getArchivedProjectsBySpace(spaceId: string) {
    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isArchived, true)))
  }

  async getProjectsBySpace(spaceId: string, actorId?: string) {
    const base = and(eq(projects.spaceId, spaceId), eq(projects.isArchived, false))
    if (!actorId || (await this.canSeeAllProjects(spaceId, actorId))) {
      return this.db.select().from(projects).where(base)
    }
    // Otherwise: non-private projects (public/inherit) plus the private ones the
    // caller is a member of.
    return this.db
      .select()
      .from(projects)
      .where(
        and(
          base,
          or(
            sql`${projects.visibility} is distinct from 'private'`,
            inArray(
              projects.id,
              this.db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId)),
            ),
          ),
        ),
      )
  }

  /** Managers and admins of the owning space see every project in it. */
  private async canSeeAllProjects(spaceId: string, actorId: string): Promise<boolean> {
    const [sp] = await this.db.select({ workspaceId: spaces.workspaceId }).from(spaces).where(eq(spaces.id, spaceId)).limit(1)
    if (sp && (await isWorkspaceManager(this.db, sp.workspaceId, actorId))) return true
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    return sm?.role === 'admin'
  }

  async getProject(projectId: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
    return project ?? null
  }

  async updateProject(
    projectId: string,
    data: Partial<{ name: string; description: string; color: string; icon: string; folderId: string | null; defaultBillable: boolean; clientId: string | null }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(projectId, actorId)
    const result = await this.db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning()

    return result[0]
  }

  async deleteProject(projectId: string, actorId?: string) {
    if (actorId) await this.assertManageable(projectId, actorId)
    await this.db.update(projects).set({ isArchived: true }).where(eq(projects.id, projectId))
  }

  /** Restore an archived project (Plan §2.4 / §13.4). */
  async restoreProject(projectId: string, actorId?: string) {
    if (actorId) await this.assertManageable(projectId, actorId)
    const [row] = await this.db
      .update(projects)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
    if (!row) throw new NotFoundException('Project not found')
    return row
  }

  private async assertManageable(projectId: string, actorId: string) {
    const [row] = await this.db
      .select({ createdById: projects.createdById, workspaceId: spaces.workspaceId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found')
    await assertCanManageContainer(this.db, {
      workspaceId: row.workspaceId,
      createdById: row.createdById,
      actorId,
      kind: 'project',
    })
  }
}
