import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ReportsService } from './reports.service'

/**
 * A LIST'S WORKLOAD VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * A view of the list, so it asks what the list asks — may this reader open it
 * (`ResourceMemberGuard`) — and not the reports permission the workspace page
 * needs: ClickUp's Workload is a view any member of the location adds.
 */
@ApiTags('lists')
@ApiBearerAuth()
@Controller('lists/:listId/workload')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListWorkloadController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: "A list's workload: rows per assignee over days, by estimate, task count or sprint points" })
  workload(
    @Param('listId') listId: string,
    @CurrentUser() user: { id: string; role?: string },
    @Query('days') days?: string,
    @Query('start') start?: string,
    @Query('measure') measure?: string,
  ) {
    const n = days ? Number.parseInt(days, 10) : 14
    return this.reports.getListWorkload(listId, { days: Number.isFinite(n) ? n : 14, start, measure }, { id: user.id, role: user.role })
  }
}
