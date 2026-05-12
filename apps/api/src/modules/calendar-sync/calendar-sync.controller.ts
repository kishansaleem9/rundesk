import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CalendarSyncService, type CalendarProvider } from './calendar-sync.service'

/**
 * Authenticated controller: iCal token mint/revoke + manual pull triggers.
 */
@ApiTags('calendar-sync')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/calendar-sync')
@UseGuards(JwtAuthGuard)
export class CalendarSyncController {
  constructor(private readonly sync: CalendarSyncService) {}

  @Post('ical-token')
  async mintToken(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.sync.mintIcalToken(user.id, workspaceId)
  }

  @Delete('ical-token')
  async revokeToken(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    await this.sync.revokeIcalToken(user.id, workspaceId)
    return { ok: true }
  }

  @Post(':provider/pull')
  async pull(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: CalendarProvider,
  ) {
    return this.sync.pullEvents(workspaceId, provider)
  }

  @Post('tasks/:taskId/push')
  async pushTask(@Param('taskId') taskId: string) {
    return this.sync.pushTask(taskId)
  }
}

/**
 * Unauthenticated controller: serves the public iCal feed. Authorization
 * is by the URL token (mint/revoke via the authenticated controller).
 */
@ApiTags('calendar-sync')
@Controller('ical')
export class IcalFeedController {
  constructor(private readonly sync: CalendarSyncService) {}

  @Get(':token.ics')
  async serve(@Param('token') token: string, @Res() res: any) {
    const ctx = await this.sync.resolveIcalToken(token)
    if (!ctx) {
      res.status(404).send('Not found')
      return
    }
    const ics = await this.sync.buildIcalFeed(ctx.userId, ctx.workspaceId)
    res
      .status(200)
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'private, no-cache, max-age=60')
      .send(ics)
  }
}
