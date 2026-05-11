import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { announcementDismissals, announcements } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(workspaceId: string) {
    return this.db
      .select()
      .from(announcements)
      .where(eq(announcements.workspaceId, workspaceId))
      .orderBy(desc(announcements.createdAt))
  }

  async listActive(workspaceId: string, userId: string) {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.workspaceId, workspaceId),
          eq(announcements.isActive, true),
          or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
        ),
      )
      .orderBy(desc(announcements.createdAt))
    const dismissed = await this.db
      .select({ announcementId: announcementDismissals.announcementId })
      .from(announcementDismissals)
      .where(eq(announcementDismissals.userId, userId))
    const dismissedSet = new Set(dismissed.map((d) => d.announcementId))
    return rows.filter((row) => !dismissedSet.has(row.id))
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { title: string; body?: string; tone?: 'info' | 'celebrate' | 'warn'; expiresAt?: string | null; isActive?: boolean },
  ) {
    const [created] = await this.db
      .insert(announcements)
      .values({
        workspaceId,
        createdById: userId,
        title: input.title.trim(),
        body: input.body?.trim() ?? '',
        tone: input.tone ?? 'info',
        isActive: input.isActive ?? true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning()
    return created
  }

  async update(
    workspaceId: string,
    announcementId: string,
    patch: Partial<{ title: string; body: string; tone: 'info' | 'celebrate' | 'warn'; isActive: boolean; expiresAt: string | null }>,
  ) {
    const [updated] = await this.db
      .update(announcements)
      .set({
        title: patch.title?.trim(),
        body: patch.body?.trim(),
        tone: patch.tone,
        isActive: patch.isActive,
        expiresAt: patch.expiresAt === undefined ? undefined : patch.expiresAt ? new Date(patch.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .returning()
    if (!updated) throw new NotFoundException('Announcement not found')
    return updated
  }

  async remove(workspaceId: string, announcementId: string) {
    const [deleted] = await this.db
      .delete(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .returning({ id: announcements.id })
    if (!deleted) throw new NotFoundException('Announcement not found')
    return { ok: true }
  }

  async trackView(workspaceId: string, announcementId: string) {
    const [existing] = await this.db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .limit(1)
    if (!existing) throw new NotFoundException('Announcement not found')
    const [updated] = await this.db
      .update(announcements)
      .set({ views: (existing.views ?? 0) + 1, updatedAt: new Date() })
      .where(eq(announcements.id, announcementId))
      .returning()
    return updated
  }

  async dismiss(workspaceId: string, announcementId: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .limit(1)
    if (!existing) throw new NotFoundException('Announcement not found')
    const [alreadyDismissed] = await this.db
      .select({ id: announcementDismissals.id })
      .from(announcementDismissals)
      .where(
        and(
          eq(announcementDismissals.announcementId, announcementId),
          eq(announcementDismissals.userId, userId),
        ),
      )
      .limit(1)
    if (!alreadyDismissed) {
      await this.db.insert(announcementDismissals).values({ announcementId, userId })
    }
    const [updated] = await this.db
      .update(announcements)
      .set({
        dismisses: (existing.dismisses ?? 0) + (alreadyDismissed ? 0 : 1),
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, announcementId))
      .returning()
    return updated
  }
}
