import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ChatService } from './chat.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('workspaces/:workspaceId/chat/channels')
  @UseGuards(WorkspaceMemberGuard)
  async list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.chat.ensureGeneralChannel(workspaceId, user.id)
    return this.chat.listChannels(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/chat/channels')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; description?: string; isPrivate?: boolean },
  ) {
    return this.chat.createChannel({
      workspaceId,
      name: body.name,
      description: body.description,
      isPrivate: body.isPrivate,
      createdById: user.id,
    })
  }

  @Post('workspaces/:workspaceId/chat/dms')
  @UseGuards(WorkspaceMemberGuard)
  createDm(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { peerUserId: string },
  ) {
    return this.chat.ensureDmChannel(workspaceId, user.id, body.peerUserId)
  }

  @Get('workspaces/:workspaceId/chat/members/:memberUserId/activity')
  @UseGuards(WorkspaceMemberGuard)
  getMemberActivity(
    @Param('workspaceId') workspaceId: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    return this.chat.getMemberActivity(workspaceId, user.id, memberUserId, limit ? Number(limit) : 30)
  }

  @Post('chat/channels/:channelId/join')
  join(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.joinChannel(channelId, user.id)
  }

  @Post('chat/channels/:channelId/leave')
  leave(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.leaveChannel(channelId, user.id)
  }

  @Get('chat/channels/:channelId/messages')
  listMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chat.listMessages(channelId, user.id, { limit: limit ? Number(limit) : undefined, before })
  }

  @Post('chat/channels/:channelId/messages')
  post(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body: string; parentMessageId?: string | null; mentions?: Array<{ userId: string; offset?: number; length?: number }> },
  ) {
    return this.chat.postMessage({
      channelId,
      authorId: user.id,
      body: body.body,
      parentMessageId: body.parentMessageId,
      mentions: body.mentions,
    })
  }

  @Patch('chat/messages/:messageId')
  edit(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body: string },
  ) {
    return this.chat.editMessage(messageId, user.id, body.body)
  }

  @Get('chat/messages/:messageId')
  getMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.getMessageById(messageId, user.id)
  }

  @Get('chat/messages/:messageId/thread')
  getThread(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    return this.chat.getThread(messageId, user.id, limit ? Number(limit) : 100)
  }

  @Delete('chat/messages/:messageId')
  remove(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.deleteMessage(messageId, user.id)
  }

  @Post('chat/messages/:messageId/reactions')
  react(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { emoji: string },
  ) {
    return this.chat.toggleReaction(messageId, user.id, body.emoji)
  }

  @Get('chat/channels/:channelId/pinned')
  listPinned(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listPinned(channelId, user.id)
  }

  @Post('chat/messages/:messageId/pin')
  pin(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setPinned(messageId, user.id, true)
  }

  @Delete('chat/messages/:messageId/pin')
  unpin(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setPinned(messageId, user.id, false)
  }
}
