import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'
import { NotetakerService } from './notetaker.service'

/**
 * THE AI NOTETAKER (`commit-log/log-39863ff-1`): what the Meetings page's AI
 * Notetaker panel asks. Every route is the caller's own — their visits, their
 * calendars — and a guest has none.
 */
@ApiTags('notetaker')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/notetaker')
export class NotetakerController {
  constructor(private readonly notetaker: NotetakerService) {}

  @Get()
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Whether the AI Notetaker is set up, your calendars it joins, and your notetaker’s visits' })
  overview(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notetaker.overview(workspaceId, user.id)
  }

  @Post('runs')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Send the AI Notetaker to a Zoom, Google Meet or Teams meeting by its link' })
  send(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload, @Body() body: { meetingUrl?: string; title?: string }) {
    return this.notetaker.send(workspaceId, user.id, body ?? {})
  }

  @Delete('runs/:runId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Call the AI Notetaker back from a meeting' })
  cancel(@Param('workspaceId') workspaceId: string, @Param('runId') runId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notetaker.cancel(workspaceId, user.id, runId)
  }

  @Patch('calendars/:accountId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: '“Join all meetings for” one of your calendars, on or off' })
  setCalendar(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { joins?: boolean },
  ) {
    return this.notetaker.setCalendarJoins(workspaceId, user.id, accountId, body?.joins)
  }
}
