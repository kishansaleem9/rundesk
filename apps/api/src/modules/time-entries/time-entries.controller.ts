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
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Query('userId') userId?: string,
    @Query('since') since?: string,
  ) {
    // Members may only see their own time logs; admins can filter by anyone.
    const canModerate = await this.time.canModerateApprovals(workspaceId, actor.id)
    return this.time.listForWorkspace(workspaceId, {
      userId: canModerate ? userId : actor.id,
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
    ]).then(([canModerate, items]) => ({
      canModerate,
      // Non-moderators only see their own timesheet rows.
      items: canModerate ? items : items.filter((i) => i.userId === actor.id),
    }))
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
