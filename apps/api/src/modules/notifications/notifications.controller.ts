import { BadRequestException, Body, Controller, Get, Headers, Post, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { NotificationsService, INBOX_VIEWS, type InboxView } from './notifications.service'
import type { CurrentUserPayload } from '../tasks/types'

/** Longest a notification may be parked in Later — a year of snoozes is a bug, not a wish. */
const MAX_SNOOZE_MS = 365 * 24 * 3600_000

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('view') view?: string,
  ) {
    return this.notifications.list(user.id, {
      unreadOnly: unreadOnly === 'true',
      view: (INBOX_VIEWS as string[]).includes(view ?? '') ? (view as InboxView) : undefined,
    })
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.unreadCount(user.id)
  }

  @Get('unread-by-workspace')
  unreadByWorkspace(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.unreadByWorkspace(user.id)
  }

  @Get('counts')
  triageCounts(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.triageCounts(user.id)
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
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.id)
  }

  /**
   * §2.5 — clear everything in the Inbox at once. `types` narrows it to what
   * the Primary chip is showing, so clearing while filtered does not also bin
   * what the filter was hiding.
   */
  @Post('clear-all')
  clearAll(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body?: { types?: string[] },
  ) {
    const types = Array.isArray(body?.types)
      ? body.types.filter((t): t is string => typeof t === 'string')
      : undefined
    return this.notifications.clearAll(user.id, { types })
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
