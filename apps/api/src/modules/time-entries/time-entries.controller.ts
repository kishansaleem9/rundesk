import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
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
    @Query('until') until?: string,
  ) {
    // Members may only see their own time logs; admins can filter by anyone.
    const everyone = await this.time.seesEveryonesTime(workspaceId, actor)
    return this.time.listForWorkspace(workspaceId, {
      userId: everyone ? userId : actor.id,
      since: parseInstant(since, 'since'),
      until: parseInstant(until, 'until'),
      actorId: actor.id,
      actorRole: actor.role,
    })
  }

  // Edit / delete a time log. The service enforces that only the entry's
  // owner can modify it (404 if missing, 403 if it belongs to someone else).
  @Patch('time-entries/:entryId')
  async update(
    @Param('entryId') entryId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body() body: { durationSec?: number; description?: string | null; isBillable?: boolean; startedAt?: string },
  ) {
    return this.time.update(entryId, actor.id, {
      durationSec: body.durationSec,
      description: body.description,
      isBillable: body.isBillable,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
    })
  }

  @Delete('time-entries/:entryId')
  async remove(@Param('entryId') entryId: string, @CurrentUser() actor: CurrentUserPayload) {
    return this.time.remove(entryId, actor.id)
  }

  @Get('workspaces/:workspaceId/time-monthly')
  @UseGuards(WorkspaceMemberGuard)
  async monthly(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Query('months') months?: string,
  ) {
    const rows = await this.time.getMonthlyTimesheet(workspaceId, months ? parseInt(months, 10) : 6)
    const everyone = await this.time.seesEveryonesTime(workspaceId, actor)
    // Members see only their own monthly rows.
    return everyone ? rows : rows.filter((r) => r.userId === actor.id)
  }

  // A5.14 — the team timesheet grid: one row per person, seven weekday columns.
  @Get('workspaces/:workspaceId/time-team-week')
  @UseGuards(WorkspaceMemberGuard)
  async teamWeek(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Query('weekStart') weekStart?: string,
  ) {
    const rows = await this.time.getTeamWeek(workspaceId, this.time.parseWeekStart(weekStart))
    const everyone = await this.time.seesEveryonesTime(workspaceId, actor)
    // Same rule as the monthly rollup: members see only their own row.
    return everyone ? rows : rows.filter((r) => r.userId === actor.id)
  }

  @Get('workspaces/:workspaceId/time-approvals')
  @UseGuards(WorkspaceMemberGuard)
  async listApprovals(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Query('status') status?: 'pending' | 'submitted' | 'approved' | 'rejected',
  ) {
    const [canModerate, seesEveryone] = await Promise.all([
      this.time.mayApprove(workspaceId, actor),
      this.time.seesEveryonesTime(workspaceId, actor),
    ])
    return {
      // Whether this person approves (`time.approval.manage`), and whether the
      // Time page's team and monthly views are everyone's to them (the admins').
      canModerate,
      seesEveryone,
      // An approver is shown every member's timesheets; anyone else, their own.
      items: await this.time.listApprovals(workspaceId, actor, { status, only: canModerate ? undefined : actor.id }),
    }
  }

  @Post('workspaces/:workspaceId/time-approvals/submit')
  @UseGuards(WorkspaceMemberGuard)
  submitTimesheet(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body() body: { weekStart: string },
  ) {
    return this.time.submitTimesheet(workspaceId, actor.id, body.weekStart)
  }

  @Post('workspaces/:workspaceId/time-approvals/:userId/:weekStart/approve')
  // `time.approval.manage`, as the catalog says: managers by default, and whoever
  // an admin grants it. `WorkspaceAdminGuard` admitted managers and refused the
  // grant (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('time.approval.manage')
  approveTimesheet(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Param('weekStart') weekStart: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.time.setApprovalStatus(workspaceId, userId, weekStart, actor.id, { status: 'approved' })
  }

  @Post('workspaces/:workspaceId/time-approvals/:userId/:weekStart/reject')
  // `time.approval.manage`, as approving does.
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('time.approval.manage')
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

/**
 * A window bound from the query string. An unparseable one is refused by name:
 * `new Date('nonsense')` is an Invalid Date, which Postgres rejects deep inside
 * the query as a 500 that names nothing the caller sent.
 */
function parseInstant(value: string | undefined, name: string): Date | undefined {
  if (value === undefined || value === '') return undefined
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) throw new BadRequestException(`${name} must be a date or an ISO instant`)
  return at
}
