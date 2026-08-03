import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TimeOffService, type TimeOffInput } from './time-off.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('time-off')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/time-off')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TimeOffController {
  constructor(
    private readonly timeOff: TimeOffService,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Time off overlapping a date range (§A4.10)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timeOff.list(workspaceId, { from, to })
  }

  @Post()
  @ApiOperation({ summary: 'Record time off for yourself, or for anyone if you manage the workspace' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: TimeOffInput,
  ) {
    return this.timeOff.create(workspaceId, await this.actor(workspaceId, user.id), body)
  }

  @Delete(':entryId')
  @ApiOperation({ summary: 'Remove a time off entry' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.timeOff.remove(workspaceId, entryId, await this.actor(workspaceId, user.id))
  }

  private async actor(workspaceId: string, userId: string) {
    return { id: userId, isManager: await isWorkspaceManager(this.db, workspaceId, userId) }
  }
}
