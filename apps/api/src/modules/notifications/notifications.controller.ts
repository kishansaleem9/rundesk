import { BadRequestException, Body, Controller, Get, Headers, Post, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import {
  NotificationsService,
  INBOX_PAGE_MAX,
  INBOX_VIEWS,
  NOTIFICATION_TYPES,
  type InboxScope,
  type InboxView,
} from './notifications.service'
import type { CurrentUserPayload } from '../tasks/types'

/** Longest a notification may be parked in Later — a year of snoozes is a bug, not a wish. */
const MAX_SNOOZE_MS = 365 * 24 * 3600_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `?workspaceId=` and `?types=`, read the same way by every route that takes
 * them.
 *
 * Refused when malformed rather than ignored. Ignoring a bad `workspaceId`
 * answers with every workspace — the very thing the parameter exists to stop
 * — and an unknown type would reach Postgres as an enum it cannot parse.
 * `types` is comma-separated; present but empty means "none of them".
 */
function parseScope(workspaceId: string | undefined, types: string | undefined): InboxScope {
  const scope: InboxScope = {}
  if (workspaceId !== undefined) {
    if (!UUID.test(workspaceId)) throw new BadRequestException('workspaceId must be a workspace id')
    scope.workspaceId = workspaceId
  }
  if (types !== undefined) {
    const named = types.split(',').map((t) => t.trim()).filter(Boolean)
    const unknown = named.filter((t) => !NOTIFICATION_TYPES.includes(t))
    if (unknown.length) throw new BadRequestException(`Unknown notification type: ${unknown.join(', ')}`)
    scope.types = named
  }
  return scope
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  /**
   * One page of the caller's notifications, newest first.
   *
   * `before` is the id of the last row of the previous page, `limit` is at
   * most {@link INBOX_PAGE_MAX}. A caller asking for one more row than it
   * shows learns whether there is another page without a second request.
   */
  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('readOnly') readOnly?: string,
    @Query('view') view?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('types') types?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    if (before !== undefined && !UUID.test(before)) {
      throw new BadRequestException('before must be the id of a notification')
    }
    let pageSize: number | undefined
    if (limit !== undefined) {
      pageSize = Number(limit)
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > INBOX_PAGE_MAX) {
        throw new BadRequestException(`limit must be a whole number from 1 to ${INBOX_PAGE_MAX}`)
      }
    }
    return this.notifications.list(user.id, {
      unreadOnly: unreadOnly === 'true',
      readOnly: readOnly === 'true',
      view: parseView(view),
      ...parseScope(workspaceId, types),
      before,
      limit: pageSize,
    })
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUser() user: CurrentUserPayload,
    @Query('workspaceId') workspaceId?: string,
    @Query('types') types?: string,
    @Query('view') view?: string,
  ) {
    return this.notifications.unreadCount(user.id, parseScope(workspaceId, types), parseView(view))
  }

  @Get('unread-by-workspace')
  unreadByWorkspace(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.unreadByWorkspace(user.id)
  }

  @Get('counts')
  triageCounts(
    @CurrentUser() user: CurrentUserPayload,
    @Query('workspaceId') workspaceId?: string,
    @Query('types') types?: string,
  ) {
    return this.notifications.triageCounts(user.id, parseScope(workspaceId, types))
  }

  @Get('digest/preview')
  digestPreview(
    @CurrentUser() user: CurrentUserPayload,
    @Query('frequency') frequency?: string,
  ) {
    const freq = frequency === 'weekly' ? 'weekly' : 'daily'
    return this.notifications.buildDigest(user.id, freq)
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.getPreferences(user.id)
  }

  @Post('preferences')
  updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      channels?: {
        webEnabled?: boolean
        mobileEnabled?: boolean
        dndOn?: boolean
        dndStart?: string
        dndEnd?: string
        muteSounds?: boolean
      }
      events?: Record<string, Partial<Record<'inApp' | 'web' | 'mobile' | 'email', boolean>>>
      digest?: { enabled?: boolean; frequency?: 'daily' | 'weekly'; hour?: number }
      briefing?: { enabled?: boolean; hour?: number }
      reminderLeadDays?: number[]
      /** §2.2 — which types the Inbox's Primary chip shows. */
      primaryTypes?: string[]
      /** §2.2 — the Customize Inbox drawer: grouping, order and density. */
      inboxView?: { groupByDate?: boolean; sortNewestFirst?: boolean; density?: 'comfortable' | 'compact' }
    },
  ) {
    return this.notifications.updatePreferences(user.id, body)
  }

  /**
   * §G06 [06:53] — mute for a length of time.
   *
   * "NOTIFICATIONS, Mute ka option hai" — the row in the frames carries a "›",
   * i.e. a submenu of durations. Ours was a switch that stayed flipped until
   * somebody remembered to flip it back, so muting for one meeting muted you
   * for days.
   *
   * `minutes: null` (or 0) clears it. The scheduled quiet hours in preferences
   * are a separate control and are untouched by this.
   */
  @Post('mute')
  muteFor(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { minutes?: number | null },
  ) {
    return this.notifications.setTimedMute(user.id, body?.minutes ?? null)
  }

  @Get('mute')
  getMute(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.getTimedMute(user.id)
  }

  @Get('web-push/public-key')
  webPushPublicKey() {
    return this.notifications.getWebPushPublicKey()
  }

  @Post('web-push/subscribe')
  subscribeWebPush(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      subscription: {
        endpoint: string
        keys?: { p256dh?: string; auth?: string }
      }
    },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.subscribeWebPush(user.id, body.subscription, userAgent)
  }

  @Post('web-push/unsubscribe')
  unsubscribeWebPush(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { endpoint: string },
  ) {
    return this.notifications.unsubscribeWebPush(user.id, body.endpoint)
  }

  @Post(':notificationId/read')
  markRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.markRead(user.id, notificationId)
  }

  /** §G12 [16:56] — put a row back the way it was before you opened it. */
  @Post(':notificationId/unread')
  markUnread(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.markUnread(user.id, notificationId)
  }

  @Post('mark-all-read')
  markAllRead(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body?: { workspaceId?: string },
  ) {
    const { workspaceId } = parseScope(bodyString(body?.workspaceId, 'workspaceId'), undefined)
    return this.notifications.markAllRead(user.id, { workspaceId })
  }

  /**
   * §2.5 — clear everything in the Inbox at once. `types` narrows it to what
   * the Primary chip is showing, so clearing while filtered does not also bin
   * what the filter was hiding.
   */
  @Post('clear-all')
  clearAll(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body?: { types?: string[]; workspaceId?: string },
  ) {
    const types = Array.isArray(body?.types)
      ? body.types.filter((t): t is string => typeof t === 'string')
      : undefined
    const { workspaceId } = parseScope(bodyString(body?.workspaceId, 'workspaceId'), undefined)
    return this.notifications.clearAll(user.id, { types, workspaceId })
  }

  @Post(':notificationId/clear')
  clear(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.clear(user.id, notificationId)
  }

  @Post(':notificationId/unclear')
  unclear(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.unclear(user.id, notificationId)
  }

  @Post(':notificationId/snooze')
  snooze(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { until?: string; hours?: number },
  ) {
    const until = resolveSnoozeUntil(body)
    if (!until) throw new BadRequestException('until must be a future timestamp within a year')
    return this.notifications.snooze(user.id, notificationId, until)
  }

  @Post(':notificationId/unsnooze')
  unsnooze(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.unsnooze(user.id, notificationId)
  }

  @Post('test')
  sendTest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { workspaceId?: string },
  ) {
    return this.notifications.sendTest(user.id, body?.workspaceId ?? null)
  }
}

/**
 * `?view=`, when it is given, has to be one of the buckets. An unknown one was
 * served as the Inbox, so a caller that misspelt `cleared` was shown the
 * Inbox and told nothing.
 */
function parseView(view: string | undefined): InboxView | undefined {
  if (view === undefined) return undefined
  if (!(INBOX_VIEWS as string[]).includes(view)) {
    throw new BadRequestException(`view must be one of: ${INBOX_VIEWS.join(', ')}`)
  }
  return view as InboxView
}

/** A body field that must be a string when it is there at all. */
function bodyString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be a string`)
  return value
}

/**
 * Accept either an explicit timestamp or a relative hour offset, and reject
 * anything in the past or absurdly far out — a bad `until` would otherwise park
 * a notification in Later with no way back except un-snoozing it by hand.
 */
function resolveSnoozeUntil(body: { until?: string; hours?: number }): Date | null {
  const now = Date.now()
  let ms: number | null = null
  if (typeof body?.hours === 'number' && Number.isFinite(body.hours)) {
    ms = now + body.hours * 3600_000
  } else if (typeof body?.until === 'string') {
    const parsed = new Date(body.until).getTime()
    if (Number.isFinite(parsed)) ms = parsed
  }
  if (ms === null || ms <= now || ms > now + MAX_SNOOZE_MS) return null
  return new Date(ms)
}
