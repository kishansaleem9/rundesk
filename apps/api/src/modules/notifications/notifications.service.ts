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
  | 'task_updated'
  | 'chat_message'
  | 'doc_mentioned'
  | 'doc_commented'

type NotificationEventKey =
  | 'mention'
  | 'assigned'
  | 'comment'
  | 'due'
  | 'status'
  | 'doc'
  | 'chat'
  | 'activity'

type NotificationChannelMatrix = Record<'inApp' | 'web' | 'mobile' | 'email', boolean>

type NotificationPreferences = {
  channels: {
    webEnabled: boolean
    mobileEnabled: boolean
    dndOn: boolean
    dndStart: string
    dndEnd: string
    muteSounds: boolean
  }
  events: Record<NotificationEventKey, NotificationChannelMatrix>
}

type NotificationPreferencesPatch = {
  channels?: Partial<NotificationPreferences['channels']>
  events?: Partial<Record<NotificationEventKey, Partial<NotificationChannelMatrix>>>
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: {
    webEnabled: true,
    mobileEnabled: false,
    dndOn: false,
    dndStart: '21:00',
    dndEnd: '08:00',
    muteSounds: false,
  },
  events: {
    mention: { inApp: true, web: true, mobile: false, email: true },
    assigned: { inApp: true, web: true, mobile: false, email: true },
    comment: { inApp: true, web: true, mobile: false, email: true },
    due: { inApp: true, web: true, mobile: false, email: true },
    status: { inApp: true, web: true, mobile: false, email: true },
    doc: { inApp: true, web: true, mobile: false, email: true },
    chat: { inApp: true, web: true, mobile: false, email: true },
    activity: { inApp: true, web: true, mobile: false, email: true },
  },
}

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
    const { prefs, timezone } = await this.getUserNotificationContext(data.userId)
    const eventKey = this.mapTypeToEventKey(data.type)
    const matrix = prefs.events[eventKey]
    const inQuietHours = this.isInQuietHours(prefs, timezone)
    const canWebOrMobile = !inQuietHours

    if (!matrix.inApp && !matrix.web && !matrix.email && !matrix.mobile) {
      return null
    }

    let row: any = null
    if (matrix.inApp || matrix.web || matrix.mobile) {
      ;[row] = await this.db
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

      if (matrix.inApp || (matrix.web && canWebOrMobile) || (matrix.mobile && canWebOrMobile)) {
      // Push real-time event for bell/tray/toast listeners even when in-app feed is disabled.
        this.realtime.emitToUser(data.userId, {
          type: 'notification.created',
          userId: data.userId,
          notification: row,
        })
      }
    }

    if (matrix.email && !inQuietHours) {
      // Best-effort email — do not await, never throws
      this.sendEmail(data).catch(() => undefined)
    }

    return row
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.getUserPreferences(userId)
  }

  async updatePreferences(userId: string, patch: NotificationPreferencesPatch) {
    const merged = this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, patch)
    const [row] = await this.db
      .update(users)
      .set({ notificationPreferences: merged, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ notificationPreferences: users.notificationPreferences })
    return (row?.notificationPreferences as NotificationPreferences | undefined) ?? merged
  }

  list(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = opts.unreadOnly
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId)
    return this.db
      .select()
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit ?? 50)
      .then((rows) =>
        rows.map((row: any) => ({
          ...(row.notifications ?? row),
          actor:
            row.users && row.users.id
              ? { id: row.users.id, displayName: row.users.displayName, email: row.users.email }
              : null,
        })),
      )
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

      case 'task_status_changed':
      case 'task_updated':
      case 'chat_message':
      case 'doc_mentioned':
      case 'doc_commented':
        await this.email.sendActivity({
          to: recipient.email,
          recipientName: recipient.displayName,
          actorName,
          title: data.title,
          body: data.body,
          taskUrl,
          workspaceName,
        })
        break

      default:
        await this.email.sendActivity({
          to: recipient.email,
          recipientName: recipient.displayName,
          actorName,
          title: data.title,
          body: data.body,
          taskUrl,
          workspaceName,
        })
        break
    }
  }

  private mapTypeToEventKey(type: NotificationType): NotificationEventKey {
    switch (type) {
      case 'task_mentioned':
        return 'mention'
      case 'task_assigned':
        return 'assigned'
      case 'task_commented':
        return 'comment'
      case 'task_due_soon':
      case 'task_overdue':
        return 'due'
      case 'task_status_changed':
        return 'status'
      case 'doc_mentioned':
      case 'doc_commented':
        return 'doc'
      case 'chat_message':
        return 'chat'
      case 'task_updated':
      default:
        return 'activity'
    }
  }

  private mergePreferences(
    base: NotificationPreferences,
    patch?: NotificationPreferencesPatch | Partial<NotificationPreferences>,
  ): NotificationPreferences {
    if (!patch) return base
    return {
      channels: {
        ...base.channels,
        ...(patch.channels ?? {}),
      },
      events: {
        mention: { ...base.events.mention, ...(patch.events?.mention ?? {}) },
        assigned: { ...base.events.assigned, ...(patch.events?.assigned ?? {}) },
        comment: { ...base.events.comment, ...(patch.events?.comment ?? {}) },
        due: { ...base.events.due, ...(patch.events?.due ?? {}) },
        status: { ...base.events.status, ...(patch.events?.status ?? {}) },
        doc: { ...base.events.doc, ...(patch.events?.doc ?? {}) },
        chat: { ...base.events.chat, ...(patch.events?.chat ?? {}) },
        activity: { ...base.events.activity, ...(patch.events?.activity ?? {}) },
      },
    }
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    const [row] = await this.db
      .select({ notificationPreferences: users.notificationPreferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const saved = row?.notificationPreferences as Partial<NotificationPreferences> | undefined
    return this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, saved)
  }

  private async getUserNotificationContext(userId: string): Promise<{
    prefs: NotificationPreferences
    timezone: string
  }> {
    const [row] = await this.db
      .select({
        notificationPreferences: users.notificationPreferences,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const saved = row?.notificationPreferences as Partial<NotificationPreferences> | undefined
    return {
      prefs: this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, saved),
      timezone: row?.timezone || 'UTC',
    }
  }

  private isInQuietHours(prefs: NotificationPreferences, timezone: string): boolean {
    if (!prefs.channels.dndOn) return false
    const start = this.toMinutes(prefs.channels.dndStart)
    const end = this.toMinutes(prefs.channels.dndEnd)
    if (start === null || end === null) return false
    const current = this.currentMinutesInTimezone(timezone)
    if (start === end) return true
    if (start < end) return current >= start && current < end
    return current >= start || current < end
  }

  private toMinutes(hhmm: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
    if (!match) return null
    const h = Number(match[1])
    const m = Number(match[2])
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
    return h * 60 + m
  }

  private currentMinutesInTimezone(timezone: string): number {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date())
      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
      const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
      return hour * 60 + minute
    } catch {
      const d = new Date()
      return d.getHours() * 60 + d.getMinutes()
    }
  }
}
