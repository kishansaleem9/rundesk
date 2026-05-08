import { Body, Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { NotificationsService } from './notifications.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(user.id, { unreadOnly: unreadOnly === 'true' })
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.unreadCount(user.id)
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
    },
  ) {
    return this.notifications.updatePreferences(user.id, body)
  }

  @Post(':notificationId/read')
  markRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notifications.markRead(user.id, notificationId)
  }

  @Post('mark-all-read')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.id)
  }
}
