import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class SpacesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async createSpace(workspaceId: string, data: { name: string; description?: string; color?: string; icon?: string }) {
    const result = await this.db
      .insert(spaces)
      .values({
        workspaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
      })
      .returning()

    return result[0]
  }

  async getSpacesByWorkspace(workspaceId: string) {
    return this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false)))
  }

  async getSpace(spaceId: string) {
    const [space] = await this.db
      .select()
      .from(spaces)
      .where(eq(spaces.id, spaceId))
    return space ?? null
  }

  async updateSpace(spaceId: string, data: Partial<{ name: string; description: string; color: string; icon: string }>) {
    const result = await this.db
      .update(spaces)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(spaces.id, spaceId))
      .returning()

    return result[0]
  }

  async deleteSpace(spaceId: string) {
    await this.db.update(spaces).set({ isArchived: true }).where(eq(spaces.id, spaceId))
  }
}
