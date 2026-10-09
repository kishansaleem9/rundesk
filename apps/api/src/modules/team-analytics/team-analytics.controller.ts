import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TeamAnalyticsService, readAnalyticsRange } from './team-analytics.service'

/**
 * The Teams hub's Analytics (`ledger-rows/section3-team-analytics`). Read by
 * the workspace's members as its audience allows — never its guests — and
 * answering `enabled: false` while the ClickApp is off, so the tab can say so
 * and offer it to those who may turn it on. The audience is set by those who
 * hold `workspace.clickapps.manage`, as the ClickApp itself is.
 */
@ApiTags('teams')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/analytics')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TeamAnalyticsController {
  constructor(private analytics: TeamAnalyticsService) {}

  @Get()
  get(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { id: string; role?: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = readAnalyticsRange(from, to)
    if (!range.ok) throw new BadRequestException(range.reason)
    return this.analytics.getAnalytics(workspaceId, { id: user.id, role: user.role }, range)
  }

  @Patch('settings')
  setAudience(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { id: string; role?: string },
    @Body() body: unknown,
  ) {
    return this.analytics.setAudience(workspaceId, { id: user.id, role: user.role }, body)
  }
}
