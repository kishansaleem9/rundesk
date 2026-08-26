import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
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

  // The one POST here that can genuinely create something, so the one that
  // keeps 201. Every other route below acts on a call that already exists, and
  // 201 there claims a resource was created at a URI it never returns.
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
  @HttpCode(HttpStatus.OK)
  join(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.join(callId, user.id)
  }

  @Post(':callId/leave')
  @HttpCode(HttpStatus.OK)
  leave(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.leave(callId, user.id)
  }

  @Post(':callId/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.end(callId, user.id)
  }

  @Post(':callId/recording')
  @HttpCode(HttpStatus.OK)
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

  /**
   * §2.8 gap 10 — the transcript, as it is being said.
   *
   * Over HTTP rather than the socket, unlike signalling: a line of speech is
   * something that must be KEPT, and a fire-and-forget socket emit gives the
   * client no way to know whether it landed. It is also the surface that
   * refuses to record while the banner is down, which is not a decision to make
   * on a channel with no reply.
   */
  @Post(':callId/transcript')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '§2.8 — append one line of what was said (only while recording)' })
  transcript(
    @Param('callId') callId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { text?: string; replacesPrevious?: boolean },
  ) {
    return this.svc.appendTranscript(callId, user.id, body?.text ?? '', body?.replacesPrevious === true)
  }

  @Get(':callId/transcript')
  @ApiOperation({ summary: '§2.8 — the call so far, attributed' })
  readTranscript(@Param('callId') callId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.liveTranscript(callId, user.id)
  }

  @Post(':callId/recording/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '§2.8 — where to PUT the recording; the media never passes through here' })
  recordingUploadUrl(
    @Param('callId') callId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { contentType?: string },
  ) {
    return this.svc.recordingUploadUrl(callId, user.id, body?.contentType ?? 'audio/webm')
  }

  @Post(':callId/recording/attach')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '§2.8 — the upload finished; remember where it landed' })
  attachRecording(
    @Param('callId') callId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { storageKey?: string },
  ) {
    return this.svc.attachRecording(callId, user.id, body?.storageKey ?? '')
  }
}
