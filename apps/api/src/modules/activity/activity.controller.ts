import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { ActivityService } from './activity.service'

/**
 * §V2-S07 — the Activity panel's magnifier and filter.
 *
 * Mounted beside `TaskActivityController` (`tasks/:taskId/activity`) rather
 * than replacing it: `GET /tasks/:id/activity` is what the older callers use
 * and it keeps meaning "the last hundred entries". The two routes here are the
 * narrowing ones, and both do their narrowing in the database — see the
 * service for why a client-side filter over the loaded page is a defect rather
 * than a shortcut.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/activity')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskActivitySearchController {
  constructor(private activity: ActivityService) {}

  @Get('search')
  @ApiOperation({ summary: 'A task activity feed narrowed by free text and/or action' })
  search(
    @Param('taskId') taskId: string,
    @Query('q') q?: string,
    @Query('action') action?: string | string[],
    @Query('limit') limit?: string,
  ) {
    return this.activity.search(taskId, {
      q,
      actions: ActivityService.normalizeActions(action),
      limit: ActivityService.normalizeLimit(limit),
    })
  }

  @Get('actions')
  @ApiOperation({ summary: 'Every action recorded on this task, with its count' })
  actions(@Param('taskId') taskId: string) {
    return this.activity.actions(taskId)
  }
}
