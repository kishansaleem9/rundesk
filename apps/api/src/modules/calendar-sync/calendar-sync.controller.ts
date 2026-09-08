import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CalendarSyncService, type CalendarProvider } from './calendar-sync.service'
import { CalendarAccountsService } from './calendar-accounts.service'

/**
 * Authenticated controller: iCal token mint/revoke + manual pull triggers.
 */
@ApiTags('calendar-sync')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/calendar-sync')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class CalendarSyncController {
  constructor(
    private readonly sync: CalendarSyncService,
    private readonly accounts: CalendarAccountsService,
  ) {}

  /**
   * §V2-14, frame `13:50` — "Accounts: Manage your accounts".
   *
   * Everything here is scoped to the CALLER, never to a userId in the path.
   * These rows hold OAuth refresh tokens for somebody's personal calendar, so
   * "whose account is this" is answered by the session and by nothing else.
   */
  @Get('accounts')
  listAccounts(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.accounts.list(user.id, workspaceId)
  }

  /** "Default calendar" — where new events are written. */
  @Post('accounts/:accountId/default')
  setDefaultAccount(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.accounts.setDefault(user.id, workspaceId, accountId)
  }

  /** "Busy calendars" — whether this one is read when working out free time. */
  @Patch('accounts/:accountId/busy')
  setAccountBusy(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
    @Body() body: { countsAsBusy: boolean },
  ) {
    return this.accounts.setCountsAsBusy(user.id, workspaceId, accountId, body.countsAsBusy === true)
  }

  @Delete('accounts/:accountId')
  removeAccount(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.accounts.remove(user.id, workspaceId, accountId)
  }

  @Get('ical-token')
  async getToken(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    // Read (or first-time mint) without rotating an existing subscription URL.
    return this.sync.getOrCreateIcalToken(user.id, workspaceId)
  }

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
  async pushTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.sync.pushTask(taskId, workspaceId)
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
