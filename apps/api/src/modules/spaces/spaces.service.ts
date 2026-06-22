import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'

@Injectable()
export class SpacesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async createSpace(
    workspaceId: string,
    data: { name: string; description?: string; color?: string; icon?: string },
    actorId?: string,
  ) {
    const result = await this.db
      .insert(spaces)
      .values({
        workspaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
        createdById: actorId ?? null,
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

  async updateSpace(
    spaceId: string,
    data: Partial<{ name: string; description: string; color: string; icon: string }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(spaceId, actorId)
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

  async deleteSpace(spaceId: string, actorId?: string) {
    if (actorId) await this.assertManageable(spaceId, actorId)
    await this.db.update(spaces).set({ isArchived: true }).where(eq(spaces.id, spaceId))
  }

  private async assertManageable(spaceId: string, actorId: string) {
    const space = await this.getSpace(spaceId)
    if (!space) throw new NotFoundException('Space not found')
    await assertCanManageContainer(this.db, {
      workspaceId: space.workspaceId,
      createdById: space.createdById,
      actorId,
      kind: 'space',
    })
  }
}
