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
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CalendarSyncService, type CalendarProvider } from './calendar-sync.service'
import { CalendarAccountsService } from './calendar-accounts.service'
import { CalendarSyncRulesService } from './calendar-sync-rules.service'

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
    private readonly rules: CalendarSyncRulesService,
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

  /*
   * ClickUp's "Sync tasks to calendar" (`ledger-rows/row-1962`): a person's own
   * syncs, each a place they may open and one of their own calendars. Scoped
   * to the caller as the accounts are — a sync names somebody's calendar, and a
   * colleague's are not theirs to read, add to or remove.
   */
  @Get('rules')
  listRules(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.rules.listRules(workspaceId, user.id)
  }

  /** The places the caller may sync: the spaces, folders, projects and lists they may open, in the sidebar's order. */
  @Get('places')
  places(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.rules.places(workspaceId, user.id)
  }

  @Post('rules')
  addRule(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Body() body: { scopeType?: unknown; scopeId?: unknown; accountId?: unknown; assignedOnly?: unknown },
  ) {
    return this.rules.addRule(workspaceId, user.id, body ?? {})
  }

  /** The planner's Sync now (frame `14:36`): the caller's syncs written through again, into their own calendars. */
  @Post('sync-now')
  syncNow(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.rules.syncNow(workspaceId, user.id)
  }

  @Delete('rules/:ruleId')
  removeRule(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.rules.removeRule(workspaceId, user.id, ruleId)
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

  /*
   * The WORKSPACE's calendar, pulled: its connection is an account somebody
   * connected under `integrations.manage`, and a pull uses it — creates tasks
   * in its inbox list and overwrites every task linked to one of its events.
   * So pulling asks what connecting and disconnecting ask. It asked only for
   * membership, and a member or a guest set the admin's token to work
   * (`calendar-pull-for-any-member`). ClickUp's calendar integration is
   * private: nobody else in a workspace reaches a person's calendar through it.
   * A person's OWN calendar is `accounts` above, and theirs alone.
   */
  @Post(':provider/pull')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
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
    @CurrentUser() user: { id: string; role?: string | null },
  ) {
    return this.sync.pushTaskAs(taskId, workspaceId, { id: user.id, role: user.role })
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
