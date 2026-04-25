import { Injectable, Inject } from '@nestjs/common'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { notifications } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'

type NotificationType =
  | 'task_assigned'
  | 'task_mentioned'
  | 'task_commented'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_status_changed'
  | 'doc_mentioned'
  | 'doc_commented'

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
  ) {}

  async create(data: {
    userId: string
    workspaceId?: string | null
    actorId?: string | null
    type: NotificationType
    title: string
    body?: string
    target?: { entityType: string; entityId: string; url?: string }
  }) {
    const [row] = await this.db
      .insert(notifications)
      .values({
        userId: data.userId,
        workspaceId: data.workspaceId ?? null,
        actorId: data.actorId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
        target: data.target,
      })
      .returning()
    this.realtime.emitToUser(data.userId, { type: 'notification.created', userId: data.userId, notification: row })
    return row
  }

  list(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = opts.unreadOnly
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId)
    return this.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit ?? 50)
  }

  async markRead(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true }
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    return { ok: true }
  }

  async unreadCount(userId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    return { count: row?.count ?? 0 }
  }
}
