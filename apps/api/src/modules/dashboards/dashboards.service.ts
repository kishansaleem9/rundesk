import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { dashboardPresets, userDockConfigs } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto'

@Injectable()
export class DashboardsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // --- Dashboard Presets ---------------------------------------------------
  async listPresets(userId: string, workspaceId: string) {
    return this.db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.userId, userId),
          eq(dashboardPresets.workspaceId, workspaceId)
        )
      )
  }

  async createPreset(userId: string, dto: CreateDashboardPresetDto) {
    if (dto.isDefault) {
      await this.clearDefaultPreset(userId, dto.workspaceId)
    }

    const [preset] = await this.db
      .insert(dashboardPresets)
      .values({
        userId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        layout: dto.layout,
        isDefault: dto.isDefault ?? false,
      })
      .returning()
    return preset
  }

  async updatePreset(userId: string, id: string, dto: UpdateDashboardPresetDto) {
    const [existing] = await this.db
      .select()
      .from(dashboardPresets)
      .where(and(eq(dashboardPresets.id, id), eq(dashboardPresets.userId, userId)))
    
    if (!existing) throw new NotFoundException('Preset not found')

    if (dto.isDefault && !existing.isDefault) {
      await this.clearDefaultPreset(userId, existing.workspaceId)
    }

    const [updated] = await this.db
      .update(dashboardPresets)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(dashboardPresets.id, id))
      .returning()
    return updated
  }

  async deletePreset(userId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(dashboardPresets)
      .where(and(eq(dashboardPresets.id, id), eq(dashboardPresets.userId, userId)))
    
    if (!existing) throw new NotFoundException('Preset not found')

    await this.db.delete(dashboardPresets).where(eq(dashboardPresets.id, id))
    return { ok: true }
  }

  private async clearDefaultPreset(userId: string, workspaceId: string) {
    await this.db
      .update(dashboardPresets)
      .set({ isDefault: false })
      .where(
        and(
          eq(dashboardPresets.userId, userId),
          eq(dashboardPresets.workspaceId, workspaceId)
        )
      )
  }

  // --- User Dock Config ----------------------------------------------------
  async getDockConfig(userId: string, workspaceId: string) {
    const [config] = await this.db
      .select()
      .from(userDockConfigs)
      .where(
        and(
          eq(userDockConfigs.userId, userId),
          eq(userDockConfigs.workspaceId, workspaceId)
        )
      )
    return config ?? null
  }

  async updateDockConfig(userId: string, workspaceId: string, patch: { pinnedLinks?: any[], appearance?: any }) {
    const existing = await this.getDockConfig(userId, workspaceId)

    if (existing) {
      const [updated] = await this.db
        .update(userDockConfigs)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(userDockConfigs.id, existing.id))
        .returning()
      return updated
    } else {
      const [created] = await this.db
        .insert(userDockConfigs)
        .values({
          userId,
          workspaceId,
          pinnedLinks: patch.pinnedLinks ?? [],
          appearance: patch.appearance ?? { size: 'md', opacity: 0.8, theme: 'system' },
        })
        .returning()
      return created
    }
  }
}
