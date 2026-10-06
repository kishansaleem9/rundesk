import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { eq, and, isNull, isNotNull, or, desc, sql, inArray, gte, gt, lte } from 'drizzle-orm'
import {
  listEmailAliases,
  notifications,
  notificationTypeEnum,
  outboundEmailMessages,
  tasks,
  users,
  webPushSubscriptions,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'
import webpush from 'web-push'
import { extractMentionUserIds, formatMentionsInText } from '../../common/utils/mentions'
import { inboundDomain, taskReplyAddress } from '../email-to-task/task-address'
import { mayBeToldAbout } from './notification-reach'
import { randomUUID } from 'node:crypto'

// --- Reminder lead time (§10.4) --------------------------------------------
// Per-user "remind me N days before a task is due" offsets. Stored on the
// notification_preferences jsonb. The UI exposes 1 day / 2 days / 1 week.
export const ALLOWED_REMINDER_LEAD_DAYS = [1, 2, 7] as const
export const DEFAULT_REMINDER_LEAD_DAYS: number[] = [1, 2]

/**
 * Sanitize a stored/submitted lead-days value into a clean, sorted, de-duped
 * array drawn from {@link ALLOWED_REMINDER_LEAD_DAYS}.
 *
 * - Absent/invalid input (not an array) → the default `[1, 2]`.
 * - An explicit empty array is respected (→ `[]`, meaning "overdue only").
 * - Out-of-set or non-integer entries are dropped.
 */
export function normalizeReminderLeadDays(input: unknown): number[] {
  if (!Array.isArray(input)) return [...DEFAULT_REMINDER_LEAD_DAYS]
  const allowed = new Set<number>(ALLOWED_REMINDER_LEAD_DAYS)
  const picked = new Set<number>()
  for (const raw of input) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isInteger(n) && allowed.has(n)) picked.add(n)
  }
  return [...picked].sort((a, b) => a - b)
}

/**
 * §7.11 — sanitize a stored/submitted daily-briefing preference: coerce
 * `enabled` to a boolean and clamp `hour` to an integer 0–23 (default 8). Pure
 * so the profile patch path and the cron's due-hour selection agree exactly.
 */
export function normalizeBriefingPrefs(input: unknown): { enabled: boolean; hour: number } {
  const obj = (input ?? {}) as { enabled?: unknown; hour?: unknown }
  const enabled = obj.enabled === true
  let hour = 8
  if (obj.hour !== undefined && obj.hour !== null) {
    const h = Math.trunc(Number(obj.hour))
    if (Number.isFinite(h)) hour = Math.min(23, Math.max(0, h))
  }
  return { enabled, hour }
}

/** Human label for a due-soon reminder fired `diffDays` before the due date. */
export function reminderLeadLabel(diffDays: number): string {
  if (diffDays <= 1) return 'tomorrow'
  if (diffDays === 7) return 'in 1 week'
  return `in ${diffDays} days`
}

/** Loose shape of the deep-link target persisted on a notification row. */
type NotificationTargetLike =
  | { entityType?: string | null; entityId?: string | null; url?: string | null }
  | null
  | undefined

/**
 * §10.1 — resolve a click-through URL for a notification so the web app can
 * jump straight to the relevant item when the notification is clicked. Pure so
 * both the list serializer and the realtime payload agree on the same link.
 *
 * Resolution order:
 *  1. The deep-link stored on the row's `target.url` at creation time. Every
 *     first-party creation site sets this — task → its board route with
 *     `?task=`, chat_message → channel deep link, approval_needed → time
 *     approvals, doc → docs with `?doc=`, briefing/workload → insights.
 *  2. A best-effort route rebuilt from `target.entityType` + `entityId` and the
 *     notification's own `workspaceId`, for legacy rows that recorded an entity
 *     reference but no url.
 *  3. `null` when the notification carries no resolvable target — the caller
 *     renders it as non-navigable rather than crashing.
 */
export function resolveNotificationUrl(row: {
  workspaceId?: string | null
  target?: NotificationTargetLike
}): string | null {
  const target = row?.target ?? null
  const storedUrl = typeof target?.url === 'string' ? target.url.trim() : ''
  if (storedUrl.length > 0) return storedUrl

  const entityType = target?.entityType ?? null
  const entityId = target?.entityId ?? null
  const workspaceId = row?.workspaceId ?? null
  if (!entityType || !entityId || !workspaceId) return null

  switch (entityType) {
    case 'task':
      return `/app/${workspaceId}/tasks/${entityId}`
    case 'doc':
      return `/app/${workspaceId}/docs?doc=${entityId}`
    // Channel id isn't recoverable from the message id alone, so land on the
    // workspace chat root as a best effort (the stored url carries the channel).
    case 'chat_message':
      return `/app/${workspaceId}/chat`
    case 'timesheet':
      return `/app/${workspaceId}/time/approvals`
    case 'insights':
    case 'workload':
      return `/app/${workspaceId}/insights`
    case 'billing':
      return `/app/${workspaceId}/settings`
    default:
      return null
  }
}

/**
 * §A4.7 — the verdict of one push attempt. Push is the channel that fails
 * quietly: an unset VAPID key, a browser that never subscribed, or an endpoint
 * the vendor has retired all look identical from the app. Naming each outcome is
 * what makes the test send worth pressing.
 */
export type PushDelivery =
  | { status: 'not_configured' }
  | { status: 'no_subscriptions' }
  | { status: 'channel_off' }
  | { status: 'quiet_hours' }
  | { status: 'sent'; sent: number; failed: number }

/**
 * §A2.6 — the three inbox buckets. They partition the same table on two
 * timestamps rather than a status column, so a snooze that lapses returns the
 * row to `inbox` with no sweeper job: `later` is defined as "snoozed until a
 * moment still in the future".
 */
export type InboxView = 'inbox' | 'later' | 'cleared' | 'all'

export const INBOX_VIEWS: InboxView[] = ['inbox', 'later', 'cleared', 'all']

/** Every notification type there is — what a `types` filter may name. */
export const NOTIFICATION_TYPES: readonly string[] = notificationTypeEnum.enumValues

/**
 * The most rows one `GET /notifications` returns. The route used to take no
 * page size and the service read 50, full stop — so the Inbox showed the
 * newest fifty and then said "You're all caught up" about the rest.
 */
export const INBOX_PAGE_MAX = 100

/**
 * Which of a person's notifications a read or a bulk verb is about.
 *
 * `workspaceId` narrows to that workspace's rows AND the rows that belong to
 * no workspace at all: the Inbox is per workspace, as ClickUp's is, and an
 * account-level notification has no other workspace to be shown in. Absent,
 * it means every workspace — the view outside any workspace.
 *
 * `types` narrows to those types; an empty list means none of them, never
 * "no filter", for the reason `clearAll` gives.
 */
export type InboxScope = { workspaceId?: string; types?: string[] }

/** Snooze presets the inbox offers, in hours from now. */
export const SNOOZE_PRESET_HOURS = [1, 4, 24, 24 * 7] as const

type NotificationType =
  | 'task_assigned'
  | 'task_mentioned'
  | 'task_commented'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_status_changed'
  | 'task_updated'
  | 'chat_message'
  // §14 — a reply into a chat thread, so the Replies page can find it.
  | 'chat_reply'
  | 'doc_mentioned'
  | 'doc_commented'
  | 'approval_needed'
  | 'task_blocked'
  | 'ai_briefing'
  | 'workload_alert'
  | 'test_notification'
  // §2.2 — five kinds she named in the Primary customiser that had no type at
  // all, so the customiser could not have offered them however good it was.
  // "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar diya to
  // mujhe woh cheez show ho" / "FOLLOWER CHANGE" / "neeche se REACTIONS" /
  // "[shared with]" / "agar ACCESS REQUEST".
  | 'task_unassigned'
  | 'task_follower_changed'
  | 'message_reaction'
  | 'shared_with_me'
  | 'access_requested'
  // §2.8 [19:25] — "aap ko notification aa raha hoga ke CALL ka option aaya".
  | 'call_started'
  // §G11 [15:36] — a chat message assigned to you as an action item. Not
  // task_assigned: nothing was created, and the link has to open the message.
  | 'message_assigned'
  // §G11 [15:19] — a reminder you set on a message coming due.
  | 'message_reminder'
  // G10-10 [12:21–12:24] — "kisi ne mujhe comment/assign kiya to mujhe show
  // ho". Both fired already, wearing someone else's type: an assigned comment
  // arrived as task_assigned, a resolved one as task_commented. Separate types
  // are what let the customiser offer them as separate rows, which is the
  // granularity she is pointing at — a resolved comment is routine, an
  // assigned one is somebody asking you to act.
  | 'comment_assigned'
  | 'comment_resolved'
  // G10-11 [12:38–12:41] — a subtask appearing under a task you are on.
  | 'subtask_created'

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

/**
 * §2.2 — every notification type the Primary customiser may offer. Kept as a
 * value rather than only a type so the API can reject anything else: this ends
 * up in a jsonb column straight from the client.
 */
export const PRIMARY_SELECTABLE_TYPES = [
  // §2.8 [19:25] — a call starting is exactly the kind of thing somebody
  // working out of Primary needs to see. Absent from this list it could never
  // appear there, and the customiser could not offer to turn it on however
  // good the picker was.
  'call_started',
  'task_mentioned',
  'doc_mentioned',
  'task_commented',
  'doc_commented',
  'task_assigned',
  'chat_message',
  // §14 — a reply in a thread, distinct from a new channel message.
  'chat_reply',
  'task_due_soon',
  'task_overdue',
  'task_status_changed',
  'task_updated',
  'task_blocked',
  'approval_needed',
  'ai_briefing',
  'workload_alert',
  'task_unassigned',
  'task_follower_changed',
  'message_reaction',
  'shared_with_me',
  'access_requested',
  // G10-10 / G10-11 — offerable as their own rows, which is the entire reason
  // they needed their own types.
  'comment_assigned',
  'comment_resolved',
  'subtask_created',
] as const

/** What Primary shows for someone who has never opened the customiser. */
export const DEFAULT_PRIMARY_TYPES: string[] = [
  // ON by default: a call happening now is the most time-sensitive thing the
  // Inbox carries, and one you cannot act on later.
  'call_started',
  'task_mentioned',
  'doc_mentioned',
  'task_commented',
  'doc_commented',
  'task_assigned',
  'chat_message',
  // On by default because she asked for them by name: "kisi ne mera hi task
  // kisi aur ko de diya aur mujhe REMOVE kar diya to mujhe woh cheez show ho",
  // "FOLLOWER CHANGE", "agar ACCESS REQUEST … to mujhe show ho".
  'task_unassigned',
  'task_follower_changed',
  'access_requested',
  // G10-10 — an assigned comment is somebody asking you to do something, so it
  // defaults on alongside the other "you are being asked" kinds.
  'comment_assigned',
  // Offered but off, because she said so: "Ab neeche se REACTIONS mujhe na show
  // hon, [shared with] mujhe na show ho."
  //
  // Off too, and deliberately: `comment_resolved` and `subtask_created` are the
  // "Not Important" half of her panel — worth being able to turn on, not worth
  // interrupting anybody by default.
]

function normalizePrimaryTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_PRIMARY_TYPES
  const allowed = new Set<string>(PRIMARY_SELECTABLE_TYPES)
  const chosen = [...new Set(value.filter((v): v is string => typeof v === 'string'))].filter((v) =>
    allowed.has(v),
  )
  // An empty Primary is a legitimate choice — it means "show me nothing here" —
  // but an array of nothing but junk is a malformed request, not that choice.
  return value.length > 0 && chosen.length === 0 ? DEFAULT_PRIMARY_TYPES : chosen
}

/**
 * §2.2 — how the Inbox is laid out, from the gear on the Primary tab.
 *
 * Her frame calls this drawer "Customize Inbox" and shows Group by date, Sort
 * by newest first, and a display mode alongside the importance list we already
 * had. These are per-user view settings, so they live beside `primaryTypes`
 * rather than in localStorage: an inbox arranged on one machine that comes back
 * unarranged on the next is the same complaint as the sidebar favourites.
 *
 * Clamped rather than trusted. An unknown density is not a reason to render an
 * inbox with no class on it.
 */
const INBOX_DENSITIES = ['comfortable', 'compact'] as const
type InboxDensity = (typeof INBOX_DENSITIES)[number]
type InboxViewPrefs = { groupByDate: boolean; sortNewestFirst: boolean; density: InboxDensity }

const DEFAULT_INBOX_VIEW: InboxViewPrefs = {
  // The behaviour before this was a choice: day buckets, newest first.
  groupByDate: true,
  sortNewestFirst: true,
  density: 'comfortable',
}

function normalizeInboxView(value: unknown): InboxViewPrefs {
  const v = (value ?? {}) as Partial<InboxViewPrefs>
  return {
    groupByDate: typeof v.groupByDate === 'boolean' ? v.groupByDate : DEFAULT_INBOX_VIEW.groupByDate,
    sortNewestFirst:
      typeof v.sortNewestFirst === 'boolean' ? v.sortNewestFirst : DEFAULT_INBOX_VIEW.sortNewestFirst,
    density: (INBOX_DENSITIES as readonly string[]).includes(v.density as string)
      ? (v.density as InboxDensity)
      : DEFAULT_INBOX_VIEW.density,
  }
}

type DigestFrequency = 'daily' | 'weekly'

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
  digest: {
    enabled: boolean
    frequency: DigestFrequency
    /** Hour of day (0–23, server time) the digest is sent. */
    hour: number
  }
  /** §7.11 — daily AI briefing delivered in-app at a chosen hour. */
  briefing: {
    enabled: boolean
    /** Hour of day (0–23, server time) the briefing is delivered. */
    hour: number
  }
  /** §10.4 — lead days for due-date reminders (subset of {1,2,7}). */
  reminderLeadDays: number[]
  /**
   * §2.2 — which notification types the Inbox's Primary chip shows.
   *
   * > "Primary pe yeh setting ka option hai; is par main click karti hoon to
   * >  yeh mujh se poochta hai ke mujhe kya cheezein show karwani hain … Phir
   * >  aap ko Primary mein sirf wohi notifications show honge jo aap chahte
   * >  hain."
   *
   * Distinct from `events` above, which decides whether a notification is
   * *delivered* and over which channel. This decides what the Primary view
   * shows once it has arrived — "don't put this in Primary" is not the same
   * request as "never tell me".
   *
   * Absent means the default set, so an account that has never opened the
   * customiser keeps behaving exactly as before.
   */
  primaryTypes?: string[]
  /** §2.2 — the Customize Inbox drawer: grouping, order and density. */
  inboxView?: InboxViewPrefs
  /**
   * §A4.7 — whether creating, being assigned to, or commenting on a task
   * subscribes you to it. The behaviour has always been on and invisible; this
   * makes it a choice. Off means only an explicit Watch adds you.
   */
  autoFollow: boolean
  /**
   * §14.3 — guided-onboarding widget state. Written by WorkspacesService via a
   * JSONB concat merge; preserved here so a notification-prefs write never drops
   * the dismissed flag.
   */
  onboarding?: { dismissed?: boolean }
}

type NotificationPreferencesPatch = {
  channels?: Partial<NotificationPreferences['channels']>
  events?: Partial<Record<NotificationEventKey, Partial<NotificationChannelMatrix>>>
  digest?: Partial<NotificationPreferences['digest']>
  briefing?: Partial<NotificationPreferences['briefing']>
  reminderLeadDays?: number[]
  autoFollow?: boolean
  /** §2.2 — which types the Inbox's Primary chip shows. */
  primaryTypes?: string[]
  /** §2.2 — the Customize Inbox drawer. */
  inboxView?: Partial<InboxViewPrefs>
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  primaryTypes: DEFAULT_PRIMARY_TYPES,
  inboxView: DEFAULT_INBOX_VIEW,
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
  digest: {
    enabled: false,
    frequency: 'daily',
    hour: 8,
  },
  briefing: {
    enabled: false,
    hour: 8,
  },
  reminderLeadDays: [...DEFAULT_REMINDER_LEAD_DAYS],
  autoFollow: true,
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
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

  /**
   * Write a notification, and report whether it reached the person AT ALL.
   *
   * `create()` returns the in-app row, which is null when a recipient has
   * turned the in-app channel off and left email on — a supported combination.
   * Callers that count what they returned therefore counted an admin who got
   * the email as nobody, and told the requester nothing had been sent while
   * every admin had the mail.
   *
   * The row and the delivery are different facts. This returns both; `create`
   * keeps returning just the row, so no existing caller changes.
   */
  async createWithOutcome(data: {
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
    /**
     * §A4.7 — the test send awaits push itself so it can report the outcome;
     * everything else keeps the fire-and-forget dispatch below.
     */
    deferPush?: boolean
  }) {
    const { prefs, timezone, dndUntil, role } = await this.getUserNotificationContext(data.userId)
    const eventKey = this.mapTypeToEventKey(data.type)
    const matrix = prefs.events[eventKey]
    /*
     * §G06 [06:53] — a timed mute suppresses the interrupting channels.
     *
     * Same effect as quiet hours and deliberately so: the notification is
     * still written, so the Inbox has it when they come back, and only the
     * things that buzz are held. Muting for a meeting should not cost you the
     * record of what happened during it.
     */
    const inQuietHours =
      this.isInQuietHours(prefs, timezone) || NotificationsService.isTimedMuteActive(dndUntil)
    const canWebOrMobile = !inQuietHours

    // Every channel off is the only case where nothing at all happens.
    if (!matrix.inApp && !matrix.web && !matrix.email && !matrix.mobile) {
      return { row: null as any, delivered: false }
    }

    // Nor is anything written, sent or mailed about an item its recipient may
    // not read now (`notification-reach.ts`): their access may have ended since
    // they began following it (`found-6-oct/an-open-socket-outlives-its-access`).
    if (!(await this.recipientMayRead(data, role))) {
      return { row: null as any, delivered: false }
    }

    const formattedBody = data.body
      ? await this.formatMentionBody(data.body)
      : data.body

    /*
     * §2.2 — DELIVERED means something actually went out.
     *
     * Read off the channel matrix alone this was true for anyone with a single
     * channel switched on, whether or not that channel then fired. Quiet hours
     * gate email and push separately below, so an admin with in-app off, email
     * on and DND running got no row, no mail and no push — and was still
     * counted as told. The requester was then shown "we told them" and refused
     * a second ask for a message that was never sent.
     *
     * Set where each channel actually dispatches, so it cannot drift from them
     * again.
     */
    let delivered = false
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
      // A row in the feed is delivery: it is durable and it is read later,
      // which is exactly what a notification is for.
      delivered = Boolean(row)

      if (matrix.inApp || (matrix.web && canWebOrMobile) || (matrix.mobile && canWebOrMobile)) {
      // Push real-time event for bell/tray/toast listeners even when in-app feed is disabled.
        this.realtime.emitToUser(data.userId, {
          type: 'notification.created',
          userId: data.userId,
          // §10.1 — surface the same click-through url the list serializer adds
          // so a live toast can navigate straight to the item.
          notification: { ...row, url: resolveNotificationUrl(row) },
        })
      }
    }

    if (matrix.email && !inQuietHours) {
      delivered = true
      // Best-effort email — do not await, never throws
      this.sendEmail({ ...data, body: formattedBody }).catch(() => undefined)
    }
    // §6.9 / §10.2 — Mobile push delivery. Rundesk is a PWA, so the `mobile`
    // notification channel is served by the very same Web Push (VAPID) transport
    // that backs the `web` channel: an installed / home-screen PWA receives Web
    // Push exactly as a desktop browser does. Native FCM/APNs would require
    // shipping a dedicated native app; until then Web Push IS the mobile
    // transport. We therefore fire a single sendWebPush when EITHER channel is
    // enabled — and because sendWebPush fans out to each of the user's
    // subscriptions exactly once, a user with BOTH `web` and `mobile` toggled on
    // is never double-delivered to the same subscription (dedupe by design).
    if ((matrix.web || matrix.mobile) && !inQuietHours && !data.deferPush) {
      delivered = true
      void this.sendWebPush(data.userId, {
        title: data.title,
        body: formattedBody,
        url: data.target?.url ? (data.target.url.startsWith('http') ? data.target.url : `${this.appUrl}${data.target.url}`) : this.appUrl,
      }).catch(() => undefined)
    }

    return { row, delivered }
  }

  /** The row, for the callers that only ever wanted that. */
  /** Whether the recipient may read the item the notification is about (`mayBeToldAbout`); a seam the service's tests answer. */
  private recipientMayRead(
    data: { userId: string; workspaceId?: string | null; target?: { entityType: string; entityId: string } },
    role: string | null,
  ): Promise<boolean> {
    return mayBeToldAbout(this.db, { id: data.userId, role }, data.workspaceId, data.target)
  }

  async create(data: Parameters<NotificationsService['createWithOutcome']>[0]) {
    return (await this.createWithOutcome(data)).row
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

  /**
   * §G06 [06:53] — mute for N minutes, or clear it.
   *
   * A duration rather than a moment, because a duration is what somebody
   * picking "for 1 hour" means, and letting the client compute the timestamp
   * puts the answer at the mercy of a wrong clock.
   */
  async setTimedMute(userId: string, minutes: number | null) {
    if (minutes === null || minutes === 0) {
      await this.db.update(users).set({ dndUntil: null }).where(eq(users.id, userId))
      return { mutedUntil: null }
    }
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new BadRequestException('minutes must be a positive number, 0, or null')
    }
    // A week. Past that it is not "mute for a while", it is a preference, and
    // the channel switches in Preferences are where that belongs.
    const MAX_MINUTES = 7 * 24 * 60
    if (minutes > MAX_MINUTES) {
      throw new BadRequestException('Mute for at most a week — beyond that, switch the channel off')
    }
    const until = new Date(Date.now() + minutes * 60_000)
    await this.db.update(users).set({ dndUntil: until }).where(eq(users.id, userId))
    return { mutedUntil: until.toISOString() }
  }

  /** The caller's timed mute, or null once it has run out. */
  async getTimedMute(userId: string) {
    const [row] = await this.db
      .select({ dndUntil: users.dndUntil })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    // Expired reads as absent — the row is left alone rather than swept, so a
    // read never has to write.
    return {
      mutedUntil: NotificationsService.isTimedMuteActive(row?.dndUntil)
        ? (row!.dndUntil as Date).toISOString()
        : null,
    }
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.getUserPreferences(userId)
  }

  /**
   * §A4.7 — does this user want to be auto-subscribed to what they touch?
   * Consulted by the task write paths before they add a watcher, so turning the
   * toggle off actually stops the subscription rather than only hiding it.
   */
  async autoFollowEnabled(userId: string): Promise<boolean> {
    const prefs = await this.getUserPreferences(userId)
    return prefs.autoFollow !== false
  }

  async updatePreferences(userId: string, patch: NotificationPreferencesPatch) {
    // Merge onto the user's *current* preferences (defaults filled in) so a
    // partial patch — e.g. only `reminderLeadDays` from the profile page — never
    // clobbers unrelated settings back to defaults.
    const current = await this.getUserPreferences(userId)
    const merged = this.mergePreferences(current, patch)
    const [row] = await this.db
      .update(users)
      .set({ notificationPreferences: merged, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ notificationPreferences: users.notificationPreferences })
    return (row?.notificationPreferences as NotificationPreferences | undefined) ?? merged
  }

  /**
   * Predicate for one inbox bucket (§A2.6). `now` is threaded in so a caller
   * computing several buckets at once partitions them against a single instant.
   */
  private viewCondition(view: InboxView, now: Date) {
    switch (view) {
      case 'later':
        return and(isNull(notifications.dismissedAt), gt(notifications.snoozedUntil, now))
      case 'cleared':
        return isNotNull(notifications.dismissedAt)
      case 'all':
        return undefined
      case 'inbox':
      default:
        return and(
          isNull(notifications.dismissedAt),
          or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
        )
    }
  }

  /** The rows `scope` is about — see {@link InboxScope}. */
  private scopeCondition(scope: InboxScope) {
    return and(
      scope.workspaceId
        ? or(eq(notifications.workspaceId, scope.workspaceId), isNull(notifications.workspaceId))
        : undefined,
      scope.types?.length ? inArray(notifications.type, scope.types as never) : undefined,
    )
  }

  /**
   * Rows that come after `anchorId` in the Inbox's order: newest first, ties
   * broken by id, so a page boundary can neither repeat a row nor drop one.
   *
   * Compared in the database, against the anchor's own stored timestamp, and
   * not against a timestamp the client sends back: `created_at` holds
   * microseconds and JSON carries milliseconds, so two notifications written
   * in the same millisecond would straddle a page boundary and the older one
   * would never be shown.
   */
  private olderThan(anchorId: string) {
    return sql`(${notifications.createdAt}, ${notifications.id}) < (select a.created_at, a.id from ${notifications} a where a.id = ${anchorId})`
  }

  /**
   * A cursor has to be one of the caller's own notifications. Anyone else's id
   * would still page — and paging would tell them when that notification was
   * written.
   */
  private async assertOwnAnchor(userId: string, anchorId: string) {
    const [row] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, anchorId), eq(notifications.userId, userId)))
      .limit(1)
    if (!row) throw new BadRequestException('before must be the id of one of your own notifications')
  }

  async list(
    userId: string,
    opts: {
      unreadOnly?: boolean
      readOnly?: boolean
      limit?: number
      view?: InboxView
      before?: string
    } & InboxScope = {},
  ) {
    if (opts.types && opts.types.length === 0) return []
    if (opts.unreadOnly && opts.readOnly) return []
    if (opts.before) await this.assertOwnAnchor(userId, opts.before)
    const where = and(
      eq(notifications.userId, userId),
      opts.unreadOnly ? isNull(notifications.readAt) : undefined,
      opts.readOnly ? isNotNull(notifications.readAt) : undefined,
      // Default to the Inbox bucket: the bell and the workspace home both call
      // this bare, and a cleared notification must not resurface there.
      this.viewCondition(opts.view ?? 'inbox', new Date()),
      this.scopeCondition(opts),
      opts.before ? this.olderThan(opts.before) : undefined,
    )
    const rows = await this.db
      .select()
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(Math.min(opts.limit ?? 50, INBOX_PAGE_MAX))

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
      // §10.1 — computed click-through link so the frontend can navigate to the
      // relevant item directly (task board, chat channel, time approvals, …).
      // Falls back to null for notifications with no resolvable target.
      url: resolveNotificationUrl(n),
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

  /**
   * §G12 [16:56] — "mark unread", the way you would in an email client.
   *
   * The Inbox could mark a row read, mark them all read, clear one and clear
   * all — and had no way back. Opening a notification to see what it was
   * therefore destroyed the only signal that you had not dealt with it yet,
   * which is exactly what "I'll come back to this" needs.
   *
   * Scoped by userId like every sibling: a notification id is not a
   * capability, and this must not let one person un-read another's row.
   */
  async markUnread(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true }
  }

  /**
   * `workspaceId` keeps "Mark all read" in one workspace's Inbox from reading
   * another's: that Inbox only shows its own rows, so the others were being
   * marked read without ever having been on screen.
   */
  async markAllRead(userId: string, scope: Pick<InboxScope, 'workspaceId'> = {}) {
    const now = new Date()
    // Scoped to the Inbox bucket so a snoozed row comes back unread when its
    // Later window lapses — that is the whole point of saving it for later.
    await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          this.viewCondition('inbox', now),
          this.scopeCondition(scope),
        ),
      )
    return { ok: true }
  }

  /**
   * §2.5 — "mere paas jitne bhi notifications hain main yahan se clear kar
   * sakti hoon. Maine sab clear kiye — woh yahan pe chale jayenge."
   *
   * Clearing was per-row only, which is not what she did on screen. Scoped to
   * the Inbox bucket exactly as markAllRead is: a row saved for Later is not
   * something you meant to clear, and a row already cleared is not something to
   * re-stamp — re-stamping would silently restart its 30-day retention.
   *
   * `types` honours the Primary/All chip. Without it, clearing while filtered
   * to Primary would also bin everything the filter was hiding, which is a
   * surprise you cannot see happening.
   */
  async clearAll(userId: string, opts: InboxScope = {}) {
    const now = new Date()
    // An explicit empty list means "none of these", not "no filter". Omitting
    // `types` is how a caller asks to clear the whole bucket; treating `[]` the
    // same way turns "clear what the chip shows" into "clear everything" the
    // moment the chip is showing nothing.
    if (opts.types && opts.types.length === 0) return { ok: true, cleared: 0 }
    const rows = await this.db
      .update(notifications)
      .set({ dismissedAt: now, snoozedUntil: null })
      .where(
        and(
          eq(notifications.userId, userId),
          this.viewCondition('inbox', now),
          this.scopeCondition(opts),
        ),
      )
      .returning({ id: notifications.id })
    return { ok: true, cleared: rows.length }
  }

  /**
   * `view` is the bucket counted — the Inbox unless a page lists another. The
   * Replies page lists every bucket, and its badge has to count what it lists.
   */
  async unreadCount(userId: string, scope: InboxScope = {}, view: InboxView = 'inbox') {
    if (scope.types && scope.types.length === 0) return { count: 0 }
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          this.viewCondition(view, new Date()),
          this.scopeCondition(scope),
        ),
      )
    return { count: row?.count ?? 0 }
  }

  /**
   * §G08 `[08:37]` — unread, split by workspace, for the switcher's dot.
   *
   * `unreadCount` answers "how many altogether", which is the wrong question
   * for somebody deciding WHICH workspace to open. Grouped in the database
   * rather than by asking each workspace in turn: the switcher lists every
   * workspace a person belongs to, and one request that returns all of them
   * beats N requests fired when a menu opens.
   *
   * Same predicate as `unreadCount` on purpose — unread here and unread in the
   * bell disagreeing by a different definition would be worse than no dot.
   */
  async unreadByWorkspace(userId: string) {
    const rows = await this.db
      .select({
        workspaceId: notifications.workspaceId,
        count: sql<number>`count(*)::int`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          isNotNull(notifications.workspaceId),
          this.viewCondition('inbox', new Date()),
        ),
      )
      .groupBy(notifications.workspaceId)

    const byWorkspace: Record<string, number> = {}
    for (const row of rows) {
      if (row.workspaceId) byWorkspace[row.workspaceId] = row.count
    }
    return byWorkspace
  }

  /**
   * Per-tab tallies for the inbox tab strip (§A2.6). One scan, four filtered
   * counts; `now()` rather than a bound timestamp so all four agree on the same
   * instant without a parameter round-trip.
   */
  async triageCounts(userId: string, scope: InboxScope = {}) {
    if (scope.types && scope.types.length === 0) return { inbox: 0, later: 0, cleared: 0, unread: 0 }
    const [row] = await this.db
      .select({
        inbox: sql<number>`count(*) filter (where ${notifications.dismissedAt} is null and (${notifications.snoozedUntil} is null or ${notifications.snoozedUntil} <= now()))::int`,
        later: sql<number>`count(*) filter (where ${notifications.dismissedAt} is null and ${notifications.snoozedUntil} > now())::int`,
        cleared: sql<number>`count(*) filter (where ${notifications.dismissedAt} is not null)::int`,
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null and ${notifications.dismissedAt} is null and (${notifications.snoozedUntil} is null or ${notifications.snoozedUntil} <= now()))::int`,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), this.scopeCondition(scope)))
    return {
      inbox: row?.inbox ?? 0,
      later: row?.later ?? 0,
      cleared: row?.cleared ?? 0,
      unread: row?.unread ?? 0,
    }
  }

  /**
   * §A2.6 — Clear moves a row to the Cleared tab. `readAt` is deliberately left
   * alone so Unclear restores exactly what the user cleared, unread tint included.
   */
  async clear(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ dismissedAt: new Date(), snoozedUntil: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true }
  }

  /** The Unclear undo — puts a cleared row back in the Inbox. */
  async unclear(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ dismissedAt: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true }
  }

  /**
   * §A2.6c — save-for-later. Parks the row in the Later tab until `until`;
   * clearing `dismissedAt` at the same time means snoozing something you had
   * already cleared brings it back rather than leaving it in two buckets.
   */
  async snooze(userId: string, notificationId: string, until: Date) {
    await this.db
      .update(notifications)
      .set({ snoozedUntil: until, dismissedAt: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true, snoozedUntil: until.toISOString() }
  }

  async unsnooze(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ snoozedUntil: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true }
  }

  /**
   * §A2.11 — deliver a notification to the caller through their own preferences,
   * so "why am I not getting these?" is answerable without waiting for real
   * activity. Runs the normal create() path: a muted channel stays muted, and
   * quiet hours still suppress push/email.
   */
  async sendTest(userId: string, workspaceId?: string | null) {
    const { prefs, timezone, dndUntil } = await this.getUserNotificationContext(userId)
    const matrix = prefs.events[this.mapTypeToEventKey('test_notification')]
    // The test send has to report the truth, including "you are muted until
    // 3pm" — that is the whole point of pressing it.
    const inQuietHours =
      this.isInQuietHours(prefs, timezone) || NotificationsService.isTimedMuteActive(dndUntil)

    const row = await this.create({
      userId,
      workspaceId: workspaceId ?? null,
      type: 'test_notification',
      title: 'Test notification',
      body: 'If you can see this, in-app delivery is working. Push and email follow the same preferences.',
      target: workspaceId ? { entityType: 'insights', entityId: workspaceId, url: `/app/${workspaceId}/inbox` } : undefined,
      deferPush: true,
    })

    // §A4.7 — push is sent here rather than inside create() so its verdict can
    // be returned. Without this the button reported "sent" whenever the in-app
    // row was written, which is precisely the case where push silently isn't.
    let push: PushDelivery
    if (!matrix.web && !matrix.mobile) push = { status: 'channel_off' }
    else if (inQuietHours) push = { status: 'quiet_hours' }
    else {
      push = await this.sendWebPush(userId, {
        title: 'Test notification',
        body: 'Push delivery is working.',
        url: workspaceId ? `${this.appUrl}/app/${workspaceId}/inbox` : this.appUrl,
      }).catch((): PushDelivery => ({ status: 'sent', sent: 0, failed: 1 }))
    }

    return {
      ok: true,
      delivered: Boolean(row),
      inApp: matrix.inApp,
      email: matrix.email && !inQuietHours,
      quietHours: inQuietHours,
      push,
    }
  }

  // ---------------------------------------------------------------------------
  // Digest
  // ---------------------------------------------------------------------------

  /**
   * Aggregate a user's unread notifications from the current digest window
   * (last 24h daily / 7d weekly) into per-type groups. Pure read — used by the
   * preview endpoint and the scheduled digest sender.
   */
  async buildDigest(
    userId: string,
    frequency: DigestFrequency = 'daily',
    now: Date = new Date(),
  ): Promise<{
    userId: string
    frequency: DigestFrequency
    since: string
    until: string
    total: number
    groups: Array<{ type: string; count: number; items: Array<{ title: string; body: string | null; url: string | null; createdAt: string }> }>
  }> {
    const windowMs = frequency === 'weekly' ? 7 * 24 * 3600_000 : 24 * 3600_000
    const since = new Date(now.getTime() - windowMs)

    const rows = await this.db
      .select({
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        target: notifications.target,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          gte(notifications.createdAt, since),
        ),
      )
      .orderBy(desc(notifications.createdAt))

    const ITEMS_PER_GROUP = 6
    const byType = new Map<string, { count: number; items: any[] }>()
    for (const r of rows) {
      const g = byType.get(r.type) ?? { count: 0, items: [] }
      g.count += 1
      if (g.items.length < ITEMS_PER_GROUP) {
        g.items.push({
          title: r.title,
          body: r.body,
          url: (r.target as any)?.url ?? null,
          createdAt: (r.createdAt as Date).toISOString(),
        })
      }
      byType.set(r.type, g)
    }

    const groups = [...byType.entries()]
      .map(([type, g]) => ({ type, count: g.count, items: g.items }))
      .sort((a, b) => b.count - a.count)

    return {
      userId,
      frequency,
      since: since.toISOString(),
      until: now.toISOString(),
      total: rows.length,
      groups,
    }
  }

  /**
   * Recipients whose digest is enabled, with the metadata the scheduler needs
   * to decide whether to send this hour.
   */
  async listDigestRecipients(): Promise<
    Array<{ userId: string; email: string; displayName: string | null; frequency: DigestFrequency; hour: number }>
  > {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        prefs: users.notificationPreferences,
      })
      .from(users)
      .where(sql`(${users.notificationPreferences} -> 'digest' ->> 'enabled')::boolean = true`)

    return rows
      .map((r) => {
        const d = (r.prefs as Partial<NotificationPreferences> | undefined)?.digest
        return {
          userId: r.userId,
          email: r.email,
          displayName: r.displayName,
          frequency: (d?.frequency ?? 'daily') as DigestFrequency,
          hour: typeof d?.hour === 'number' ? d.hour : 8,
        }
      })
      .filter((r) => Boolean(r.email))
  }

  /**
   * §7.11 — users who enabled the daily AI briefing, with the delivery hour the
   * briefing cron gates on. Mirrors listDigestRecipients; the jsonb predicate
   * keeps the scan to opted-in users.
   */
  async listBriefingRecipients(): Promise<
    Array<{ userId: string; email: string; displayName: string | null; enabled: boolean; hour: number }>
  > {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        prefs: users.notificationPreferences,
      })
      .from(users)
      .where(sql`(${users.notificationPreferences} -> 'briefing' ->> 'enabled')::boolean = true`)

    return rows.map((r) => {
      const b = normalizeBriefingPrefs((r.prefs as Partial<NotificationPreferences> | undefined)?.briefing)
      return {
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
        enabled: b.enabled,
        hour: b.hour,
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Private — email dispatch
  // ---------------------------------------------------------------------------

  /**
   * WHAT A REPLY TO A COMMENT NOTIFICATION FINDS ITS TASK BY. The mail gets a
   * Message-ID of its own, kept with the task (`outbound_email_messages`), so
   * a reply's `In-Reply-To` names it; and, where the task's list takes email,
   * a Reply-To of the task's own address. Neither was set, and the inbound
   * handler, which says replies route by header, matched only inbound mail
   * (`resume-defects/resume-8-reply-routing`). The id is random, so knowing a
   * task does not let anybody guess one.
   */
  private async replyThread(taskId: string, recipient: string): Promise<{ messageId: string; replyTo: string | null } | null> {
    const [task] = await this.db.select({ listId: tasks.listId }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (!task) return null
    const [alias] = await this.db
      .select({ localPart: listEmailAliases.localPart })
      .from(listEmailAliases)
      .where(and(eq(listEmailAliases.listId, task.listId), isNull(listEmailAliases.revokedAt)))
      .limit(1)
    const replyTo = alias ? taskReplyAddress(alias.localPart, taskId) : null
    const messageId = `<notify.${randomUUID()}@${inboundDomain()}>`
    await this.db.insert(outboundEmailMessages).values({ messageId, taskId, listId: task.listId, recipient, replyTo })
    return { messageId, replyTo }
  }

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
          const thread = data.target?.entityType === 'task'
            ? await this.replyThread(data.target.entityId, recipient.email)
            : null
          await this.email.sendComment({
            to: recipient.email,
            recipientName: recipient.displayName,
            actorName,
            taskTitle,
            taskUrl,
            commentSnippet: ctx.commentSnippet ?? '(view in app)',
            workspaceName,
            messageId: thread?.messageId,
            replyTo: thread?.replyTo ?? undefined,
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
      // §G11 [15:36] — being asked to act on a message is being assigned
      // something. Somebody who muted "assigned" meant both.
      //
      // G10-10 — and an assigned comment for the same reason: it is somebody
      // asking you to do something, whatever it is attached to.
      case 'task_assigned':
      case 'message_assigned':
      case 'comment_assigned':
        return 'assigned'
      // G10-10 — a resolved comment is comment traffic; muting comments must
      // mute it too, or splitting it into its own type becomes a way to
      // receive MORE than before rather than to tell two things apart.
      case 'task_commented':
      case 'comment_resolved':
        return 'comment'
      // §G11 [15:19] — a reminder you set yourself is a deadline arriving,
      // whatever it is about, so it rides the same channel as a due date.
      case 'task_due_soon':
      case 'task_overdue':
      case 'message_reminder':
        return 'due'
      // A task becoming blocked is a workflow/state change — route it with
      // status notifications so muting status also mutes blocked alerts.
      case 'task_status_changed':
      case 'task_blocked':
        return 'status'
      case 'doc_mentioned':
      case 'doc_commented':
        return 'doc'
      // §2.8 [19:25] — a call starting in a channel is chat activity, and rides
      // the chat channel deliberately: somebody who has muted a channel's
      // messages has not asked to be called from it either.
      case 'chat_message':
      case 'call_started':
        return 'chat'
      // §7.11 — the daily AI briefing rides the general activity channel so a
      // user who mutes activity also mutes their briefing.
      // §7.12 — proactive workload alerts ride the general activity channel too.
      // §A2.11 — so does the test send, which is the point: it proves the
      // channels the user has actually left on.
      case 'task_updated':
      case 'ai_briefing':
      case 'workload_alert':
      case 'test_notification':
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
      digest: {
        ...base.digest,
        ...(patch.digest ?? {}),
      },
      briefing: normalizeBriefingPrefs({ ...base.briefing, ...(patch.briefing ?? {}) }),
      reminderLeadDays: normalizeReminderLeadDays(patch.reminderLeadDays ?? base.reminderLeadDays),
    primaryTypes: normalizePrimaryTypes(patch.primaryTypes ?? base.primaryTypes),
      inboxView: normalizeInboxView({ ...(base.inboxView ?? DEFAULT_INBOX_VIEW), ...(patch.inboxView ?? {}) }),
      autoFollow: patch.autoFollow ?? base.autoFollow,
      // §14.3 — carry through the onboarding-dismissed flag untouched (set out of
      // band by WorkspacesService) so editing notification prefs never resets it.
      ...((patch as Partial<NotificationPreferences>).onboarding
        ? { onboarding: (patch as Partial<NotificationPreferences>).onboarding }
        : {}),
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
    dndUntil: Date | null
    /** The account's role: a super_admin reads every item, as in every guard (`notification-reach.ts`). */
    role: string | null
  }> {
    const [row] = await this.db
      .select({
        notificationPreferences: users.notificationPreferences,
        timezone: users.timezone,
        // §G06 [06:53] — "muted until 3pm" is a different fact from the
        // scheduled quiet hours in the prefs blob, and both can be true.
        dndUntil: users.dndUntil,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const saved = row?.notificationPreferences as Partial<NotificationPreferences> | undefined
    return {
      prefs: this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, saved),
      timezone: row?.timezone || 'UTC',
      dndUntil: row?.dndUntil ?? null,
      role: (row?.role as string | undefined) ?? null,
    }
  }

  /**
   * §G06 [06:53] — muted until a moment, and not a minute longer.
   *
   * Read rather than swept, for the same reason a custom status expires on
   * read: a job that un-mutes people is a job that can be down, and staying
   * muted past the meeting is the exact failure this replaced.
   */
  static isTimedMuteActive(dndUntil: Date | string | null | undefined, now: Date = new Date()): boolean {
    if (!dndUntil) return false
    const until = dndUntil instanceof Date ? dndUntil : new Date(dndUntil)
    if (Number.isNaN(until.getTime())) return false
    return until.getTime() > now.getTime()
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

  private async sendWebPush(
    userId: string,
    payload: { title: string; body?: string; url?: string },
  ): Promise<PushDelivery> {
    if (!this.webPushEnabled) return { status: 'not_configured' }
    const rows = await this.db
      .select()
      .from(webPushSubscriptions)
      .where(eq(webPushSubscriptions.userId, userId))
    if (rows.length === 0) return { status: 'no_subscriptions' }

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? this.appUrl,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `rundesk-${Date.now()}`,
    })

    const results = await Promise.all(rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
        )
        return true
      } catch (err: any) {
        const status = Number(err?.statusCode ?? 0)
        if (status === 404 || status === 410) {
          // The vendor has retired this endpoint — dropping it is the fix, not a
          // failure worth reporting.
          await this.db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.id, row.id))
        } else {
          // §A4.7 — a rejected push used to vanish here, which is exactly why
          // "I never get notifications" was unanswerable.
          this.logger.warn(`Web push to ${userId} failed (${status || 'unknown'}): ${err?.message ?? err}`)
        }
        return false
      }
    }))

    const sent = results.filter(Boolean).length
    return { status: 'sent', sent, failed: results.length - sent }
  }
}
