import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { MeetingsService } from './meetings.service'

/**
 * Meeting records. Membership is checked in the service on every route — the
 * collection hangs off a workspace, but a meeting is also reachable by its own
 * id, so no single guard covers both shapes.
 */
@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get('workspaces/:workspaceId/meetings')
  @ApiOperation({ summary: 'Meetings in a workspace, newest first' })
  list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query('taskId') taskId?: string,
    /** §A6 [19:16–19:20] — the "Tags:" chips in the meeting-notes toolbar. */
    @Query('tag') tag?: string,
  ) {
    return this.meetings.list(workspaceId, user.id, { taskId, tag })
  }

  @Post('workspaces/:workspaceId/meetings')
  @ApiOperation({ summary: 'Record a meeting' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: {
      title: string
      startsAt?: string | null
      endsAt?: string | null
      provider?: 'zoom' | 'google_meet' | 'manual'
      joinUrl?: string | null
      recordingUrl?: string | null
      notes?: string | null
      taskId?: string | null
      attendeeIds?: string[]
      tags?: string[]
    },
  ) {
    return this.meetings.create(workspaceId, user.id, body)
  }

  @Post('workspaces/:workspaceId/meetings/ask')
  @ApiOperation({ summary: '§2.8 — ask about your meetings, answered from their records' })
  ask(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { question?: string },
  ) {
    return this.meetings.ask(workspaceId, user.id, body?.question ?? '')
  }

  @Get('workspaces/:workspaceId/meetings/tags')
  @ApiOperation({ summary: '§A6 — the tags in use on the workspace’s meetings, one per word whatever its case' })
  tags(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.meetings.tags(workspaceId, user.id)
  }

  @Get('workspaces/:workspaceId/meetings/upcoming')
  @ApiOperation({ summary: '§2.8 — meetings still to come, soonest first' })
  upcoming(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.meetings.upcoming(workspaceId, user.id)
  }

  @Get('workspaces/:workspaceId/meetings/:meetingId')
  @ApiOperation({ summary: 'One meeting with its attendees' })
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.meetings.get(workspaceId, meetingId, user.id)
  }

  @Patch('workspaces/:workspaceId/meetings/:meetingId')
  @ApiOperation({ summary: 'Update notes, transcript, recording or timing' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: { id: string },
    @Body() body: {
      title?: string
      notes?: string | null
      transcript?: string | null
      recordingUrl?: string | null
      startsAt?: string | null
      endsAt?: string | null
      tags?: string[]
    },
  ) {
    return this.meetings.update(workspaceId, meetingId, user.id, body)
  }

  @Delete('workspaces/:workspaceId/meetings/:meetingId')
  @ApiOperation({ summary: 'Delete a meeting record' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.meetings.remove(workspaceId, meetingId, user.id)
  }

  @Post('workspaces/:workspaceId/meetings/:meetingId/attendees')
  @ApiOperation({ summary: 'Add an attendee — a member by id, or an outsider by email' })
  addAttendee(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { userId?: string; email?: string; name?: string },
  ) {
    return this.meetings.addAttendee(workspaceId, meetingId, user.id, body)
  }

  @Delete('workspaces/:workspaceId/meetings/:meetingId/attendees/:attendeeId')
  @ApiOperation({ summary: 'Remove an attendee' })
  removeAttendee(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @Param('attendeeId') attendeeId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.meetings.removeAttendee(workspaceId, meetingId, attendeeId, user.id)
  }

  @Get('workspaces/:workspaceId/people/:userId/shared')
  @ApiOperation({ summary: 'Meetings and open tasks two people share — the DM Calendar and Tasks tabs' })
  shared(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') otherUserId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.meetings.sharedWith(workspaceId, otherUserId, user.id)
  }

  @Post('workspaces/:workspaceId/meetings/:meetingId/action-items')
  @ApiOperation({ summary: "Extract action items from this meeting's notes, optionally creating them as tasks" })
  actionItems(
    @Param('workspaceId') workspaceId: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { createIn?: string },
  ) {
    return this.meetings.extractActionItems(workspaceId, meetingId, user.id, { createIn: body?.createIn })
  }
}
