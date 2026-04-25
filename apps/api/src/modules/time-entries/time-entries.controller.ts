import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TimeEntriesService } from './time-entries.service'

@ApiTags('time-entries')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class WorkspaceTimeEntriesController {
  constructor(private time: TimeEntriesService) {}

  @Get('workspaces/:workspaceId/time-entries')
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
}
