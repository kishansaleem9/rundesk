import { Injectable, Inject } from '@nestjs/common'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { notifications, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'

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
  private readonly appUrl: string

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private email: EmailService,
    private config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:5173'
  }

  async create(data: {
    userId: string
    workspaceId?: string | null
    actorId?: string | null
    type: NotificationType
    title: string
    body?: string
    target?: { entityType: string; entityId: string; url?: string }
    /** Extra context needed to generate a good email — not stored */
    emailContext?: {
      workspaceName?: string
      taskTitle?: string
      commentSnippet?: string
      dueDateLabel?: string
    }
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

    // Push real-time notification
    this.realtime.emitToUser(data.userId, {
      type: 'notification.created',
      userId: data.userId,
      notification: row,
    })

    // Best-effort email — do not await, never throws
    this.sendEmail(data).catch(() => undefined)

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

  // ---------------------------------------------------------------------------
  // Private — email dispatch
  // ---------------------------------------------------------------------------

  private async sendEmail(data: Parameters<typeof this.create>[0]) {
    // Resolve recipient user
    const [recipient] = await this.db
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1)
    if (!recipient) return

    // Resolve actor display name
    let actorName = 'Someone'
    if (data.actorId) {
      const [actor] = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, data.actorId))
        .limit(1)
      if (actor) actorName = actor.displayName
    }

    const taskUrl = data.target?.url
      ? (data.target.url.startsWith('http') ? data.target.url : `${this.appUrl}${data.target.url}`)
      : this.appUrl

    const ctx = data.emailContext ?? {}
    const taskTitle = ctx.taskTitle ?? data.title
    const workspaceName = ctx.workspaceName ?? 'your workspace'

    switch (data.type) {
      case 'task_assigned':
        await this.email.sendTaskAssigned({
          to: recipient.email,
          recipientName: recipient.displayName,
          actorName,
          taskTitle,
          taskUrl,
          workspaceName,
        })
        break

      case 'task_mentioned':
        await this.email.sendMention({
          to: recipient.email,
          recipientName: recipient.displayName,
          actorName,
          context: 'in a comment',
          taskTitle,
          taskUrl,
          workspaceName,
        })
        break

      case 'task_commented':
        await this.email.sendComment({
          to: recipient.email,
          recipientName: recipient.displayName,
          actorName,
          taskTitle,
          taskUrl,
          commentSnippet: ctx.commentSnippet ?? '(view in app)',
          workspaceName,
        })
        break

      case 'task_due_soon':
        await this.email.sendDueSoon({
          to: recipient.email,
          recipientName: recipient.displayName,
          taskTitle,
          taskUrl,
          dueDateLabel: ctx.dueDateLabel ?? 'soon',
          workspaceName,
        })
        break

      case 'task_overdue':
        await this.email.sendOverdue({
          to: recipient.email,
          recipientName: recipient.displayName,
          taskTitle,
          taskUrl,
          workspaceName,
        })
        break

      default:
        // No email template for status changes, doc events, etc. yet
        break
    }
  }
}
