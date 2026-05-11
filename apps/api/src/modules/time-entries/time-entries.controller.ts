import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { TimeEntriesService } from './time-entries.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('time-entries')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class WorkspaceTimeEntriesController {
  constructor(private time: TimeEntriesService) {}

  @Get('workspaces/:workspaceId/time-entries')
  @UseGuards(WorkspaceMemberGuard)
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId?: string,
    @Query('since') since?: string,
  ) {
    return this.time.listForWorkspace(workspaceId, {
      userId,
      since: since ? new Date(since) : undefined,
    })
  }

  @Get('workspaces/:workspaceId/time-approvals')
  @UseGuards(WorkspaceMemberGuard)
  listApprovals(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
  ) {
    return Promise.all([
      this.time.canModerateApprovals(workspaceId, actor.id),
      this.time.listApprovals(workspaceId, status),
    ]).then(([canModerate, items]) => ({ canModerate, items }))
  }

  @Post('workspaces/:workspaceId/time-approvals/:userId/:weekStart/approve')
  @UseGuards(WorkspaceMemberGuard, WorkspaceAdminGuard)
  approveTimesheet(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Param('weekStart') weekStart: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.time.setApprovalStatus(workspaceId, userId, weekStart, actor.id, { status: 'approved' })
  }

  @Post('workspaces/:workspaceId/time-approvals/:userId/:weekStart/reject')
  @UseGuards(WorkspaceMemberGuard, WorkspaceAdminGuard)
  rejectTimesheet(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Param('weekStart') weekStart: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body() body: { reason?: string },
  ) {
    return this.time.setApprovalStatus(workspaceId, userId, weekStart, actor.id, {
      status: 'rejected',
      reason: body?.reason ?? null,
    })
  }
}
