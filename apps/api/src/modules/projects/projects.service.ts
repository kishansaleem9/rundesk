import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { projects } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async createProject(spaceId: string, data: { name: string; description?: string; color?: string; icon?: string }) {
    const result = await this.db
      .insert(projects)
      .values({
        spaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
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

  async updateProject(projectId: string, data: Partial<{ name: string; description: string; color: string; icon: string }>) {
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

  async deleteProject(projectId: string) {
    await this.db.update(projects).set({ isArchived: true }).where(eq(projects.id, projectId))
  }
}
