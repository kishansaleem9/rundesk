import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CallsService } from './calls.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §2.8 SyncUp — the call's lifecycle.
 *
 * Signalling does NOT go through here: offers, answers and ICE candidates are
 * relayed by the realtime gateway, because they are per-peer and constant.
 * This is the part that has to be true for everyone — who is in, and whether
 * it is being recorded.
 */
@ApiTags('calls')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/calls')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class CallsController {
  constructor(private svc: CallsService) {}

  @Get('live')
  @ApiOperation({ summary: 'The live call in a channel, if there is one' })
  live(
    @Param('workspaceId') _workspaceId: string,
    @Query('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!channelId) return null
    return this.svc.liveInChannel(channelId, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Start a call — or join the one already running here' })
  start(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { channelId?: string; title?: string },
  ) {
    return this.svc.start(workspaceId, user.id, body ?? {})
  }

  @Post(':callId/join')
  join(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.join(callId, user.id)
  }

  @Post(':callId/leave')
  leave(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.leave(callId, user.id)
  }

  @Post(':callId/end')
  end(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.end(callId, user.id)
  }

  @Post(':callId/recording')
  @ApiOperation({
    summary: '§2.8 — start/stop recording; everyone in the call is told in the same breath',
  })
  recording(
    @Param('callId') callId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { recording?: boolean },
  ) {
    return this.svc.setRecording(callId, user.id, body?.recording === true)
  }
}
