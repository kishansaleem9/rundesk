import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { announcementDismissals, announcementViews, announcements } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import type { AnnouncementTone } from './dto/announcement.dto'

/**
 * A title, trimmed, or a 400. The DTO refuses an empty one on the way in; this
 * holds for every other caller, so `input.title.trim()` on no title is never
 * again a 500.
 */
function titleOf(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title) throw new BadRequestException('An announcement needs a title')
  return title
}

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
  ) {}

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
    input: { title: string; body?: string; tone?: AnnouncementTone; expiresAt?: string | null; isActive?: boolean },
  ) {
    const title = titleOf(input.title)
    const [created] = await this.db
      .insert(announcements)
      .values({
        workspaceId,
        createdById: userId,
        title,
        body: input.body?.trim() ?? '',
        tone: input.tone ?? 'info',
        isActive: input.isActive ?? true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'announcement.created',
      resourceType: 'announcement',
      resourceId: created.id,
      description: `Created announcement "${created.title}"`,
      metadata: { tone: created.tone, isActive: created.isActive },
    })
    return created
  }

  async update(
    workspaceId: string,
    announcementId: string,
    patch: Partial<{ title: string | null; body: string; tone: AnnouncementTone; isActive: boolean; expiresAt: string | null }>,
    actorId?: string,
  ) {
    // A title sent is a title: "" or null would blank a live banner, so it is refused.
    const title = patch.title === undefined ? undefined : titleOf(patch.title)
    const [updated] = await this.db
      .update(announcements)
      .set({
        title,
        body: patch.body?.trim(),
        tone: patch.tone,
        isActive: patch.isActive,
        expiresAt: patch.expiresAt === undefined ? undefined : patch.expiresAt ? new Date(patch.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .returning()
    if (!updated) throw new NotFoundException('Announcement not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'announcement.updated',
      resourceType: 'announcement',
      resourceId: announcementId,
      description: `Updated announcement "${updated.title}"`,
      metadata: {
        title: patch.title ?? null,
        tone: patch.tone ?? null,
        isActive: patch.isActive ?? null,
      },
    })
    return updated
  }

  async remove(workspaceId: string, announcementId: string, actorId?: string) {
    const [deleted] = await this.db
      .delete(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.workspaceId, workspaceId)))
      .returning({ id: announcements.id, title: announcements.title })
    if (!deleted) throw new NotFoundException('Announcement not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'announcement.removed',
      resourceType: 'announcement',
      resourceId: announcementId,
      description: `Removed announcement "${deleted.title}"`,
    })
    return { ok: true }
  }

  /**
   * THE ANNOUNCEMENT, IF IT IS LIVE — published, not paused, not expired — or a
   * 404: a paused or expired one is shown to nobody, so nobody views or
   * dismisses it (`found-28-sep/announcement-views-counted-per-click`). `view`
   * and `dismiss` checked the workspace and the id alone.
   */
  private async live(workspaceId: string, announcementId: string) {
    const [row] = await this.db
      .select({ id: announcements.id })
      .from(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.workspaceId, workspaceId),
          eq(announcements.isActive, true),
          or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date())),
        ),
      )
      .limit(1)
    if (!row) throw new NotFoundException('Announcement not found')
    return row
  }

  /**
   * ONE VIEW PER PERSON. A view is a row per person (`announcement_views`), and
   * the count moves only when the row is new — it added 1 per call, and the
   * home page's Mark seen called it on every click. The web records a view when
   * it shows the announcement. `counted` says whether this call was the first.
   */
  async trackView(workspaceId: string, announcementId: string, userId: string) {
    await this.live(workspaceId, announcementId)
    return { counted: await this.recordView(announcementId, userId) }
  }

  private async recordView(announcementId: string, userId: string): Promise<boolean> {
    const inserted = await this.db
      .insert(announcementViews)
      .values({ announcementId, userId })
      .onConflictDoNothing()
      .returning({ id: announcementViews.id })
    if (inserted.length === 0) return false
    await this.db
      .update(announcements)
      .set({ views: sql`${announcements.views} + 1` })
      .where(eq(announcements.id, announcementId))
    return true
  }

  /**
   * ONE DISMISSAL PER PERSON, and a dismissal is a view: nobody dismisses what
   * they were not shown. The row and the count are written as the view's are,
   * so two dismissals at once are one, not a unique-index 500.
   */
  async dismiss(workspaceId: string, announcementId: string, userId: string) {
    await this.live(workspaceId, announcementId)
    await this.recordView(announcementId, userId)
    const inserted = await this.db
      .insert(announcementDismissals)
      .values({ announcementId, userId })
      .onConflictDoNothing()
      .returning({ id: announcementDismissals.id })
    if (inserted.length > 0) {
      await this.db
        .update(announcements)
        .set({ dismisses: sql`${announcements.dismisses} + 1` })
        .where(eq(announcements.id, announcementId))
    }
    return { dismissed: true }
  }
}
