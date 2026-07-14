import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'

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

    return result[0]
  }

  async getProjectsBySpace(spaceId: string) {
    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isArchived, false)))
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
    data: Partial<{ name: string; description: string; color: string; icon: string; folderId: string | null }>,
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
