import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
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
  async list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.chat.ensureGeneralChannel(workspaceId, user.id)
    return this.chat.listChannels(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/chat/channels')
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
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chat.listMessages(channelId, { limit: limit ? Number(limit) : undefined, before })
  }

  @Post('chat/channels/:channelId/messages')
  post(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body: string; parentMessageId?: string | null },
  ) {
    return this.chat.postMessage({
      channelId,
      authorId: user.id,
      body: body.body,
      parentMessageId: body.parentMessageId,
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
}
