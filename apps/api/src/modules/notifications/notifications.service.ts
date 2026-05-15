import { Injectable, Inject } from '@nestjs/common'
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm'
import { notifications, users, webPushSubscriptions } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'
import webpush from 'web-push'
import { extractMentionUserIds, formatMentionsInText } from '../../common/utils/mentions'

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
  private readonly webPushPublicKey: string | null
  private readonly webPushEnabled: boolean

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private email: EmailService,
    private config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:5173'
    const subject = this.config.get<string>('WEB_PUSH_SUBJECT') ?? 'mailto:admin@rundesk.internal'
    const publicKey = this.config.get<string>('WEB_PUSH_PUBLIC_KEY') ?? null
    const privateKey = this.config.get<string>('WEB_PUSH_PRIVATE_KEY') ?? null
    this.webPushPublicKey = publicKey
    this.webPushEnabled = !!(publicKey && privateKey)
    if (this.webPushEnabled && publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey)
    }
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
      /** When set, task_commented emails use the "resolved" template instead of "new comment". */
      commentVariant?: 'created' | 'resolved'
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

    const formattedBody = data.body
      ? await this.formatMentionBody(data.body)
      : data.body

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
          body: formattedBody,
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
      this.sendEmail({ ...data, body: formattedBody }).catch(() => undefined)
    }
    if (matrix.web && !inQuietHours) {
      this.sendWebPush(data.userId, {
        title: data.title,
        body: formattedBody,
        url: data.target?.url ? (data.target.url.startsWith('http') ? data.target.url : `${this.appUrl}${data.target.url}`) : this.appUrl,
      }).catch(() => undefined)
    }

    return row
  }

  async getWebPushPublicKey() {
    return { publicKey: this.webPushPublicKey, enabled: this.webPushEnabled }
  }

  async subscribeWebPush(userId: string, subscription: {
    endpoint: string
    keys?: { p256dh?: string; auth?: string }
  }, userAgent?: string) {
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return { ok: false, reason: 'invalid_subscription' as const }
    }
    await this.db
      .insert(webPushSubscriptions)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: userAgent ?? null,
          updatedAt: new Date(),
        },
      })
    return { ok: true }
  }

  async unsubscribeWebPush(userId: string, endpoint: string) {
    await this.db
      .delete(webPushSubscriptions)
      .where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.endpoint, endpoint)))
    return { ok: true }
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

  async list(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = opts.unreadOnly
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId)
    const rows = await this.db
      .select()
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit ?? 50)

    const mapped = rows.map((row: any) => ({
      ...(row.notifications ?? row),
      actor:
        row.users && row.users.id
          ? { id: row.users.id, displayName: row.users.displayName, email: row.users.email }
          : null,
    }))

    const mentionIds = new Set<string>()
    for (const n of mapped) {
      if (typeof n.body === 'string') {
        for (const id of extractMentionUserIds(n.body)) mentionIds.add(id)
      }
    }
    const namesById = await this.resolveMentionDisplayNames([...mentionIds])

    return mapped.map((n) => ({
      ...n,
      body:
        typeof n.body === 'string' && n.body.length > 0
          ? formatMentionsInText(n.body, namesById)
          : n.body,
    }))
  }

  private async formatMentionBody(body: string): Promise<string> {
    const ids = extractMentionUserIds(body)
    if (ids.length === 0) return body
    const namesById = await this.resolveMentionDisplayNames(ids)
    return formatMentionsInText(body, namesById)
  }

  private async resolveMentionDisplayNames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {}
    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds))
    return Object.fromEntries(
      rows.map((r) => [r.id, (r.displayName?.trim() || r.email?.trim() || 'teammate') as string]),
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
        if (ctx.commentVariant === 'resolved') {
          await this.email.sendCommentResolved({
            to: recipient.email,
            recipientName: recipient.displayName,
            actorName,
            taskTitle,
            taskUrl,
            commentSnippet: ctx.commentSnippet ?? '(view in app)',
            workspaceName,
          })
        } else {
          await this.email.sendComment({
            to: recipient.email,
            recipientName: recipient.displayName,
            actorName,
            taskTitle,
            taskUrl,
            commentSnippet: ctx.commentSnippet ?? '(view in app)',
            workspaceName,
          })
        }
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

  private async sendWebPush(userId: string, payload: { title: string; body?: string; url?: string }) {
    if (!this.webPushEnabled) return
    const rows = await this.db
      .select()
      .from(webPushSubscriptions)
      .where(eq(webPushSubscriptions.userId, userId))
    if (rows.length === 0) return

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? this.appUrl,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `rundesk-${Date.now()}`,
    })

    await Promise.all(rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
        )
      } catch (err: any) {
        const status = Number(err?.statusCode ?? 0)
        if (status === 404 || status === 410) {
          await this.db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.id, row.id))
        }
      }
    }))
  }
}
