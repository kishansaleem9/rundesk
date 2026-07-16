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
    @Body() body: { name: string; description?: string; icon?: string; isPrivate?: boolean; spaceId?: string | null; memberIds?: string[] },
  ) {
    return this.chat.createChannel({
      workspaceId,
      name: body.name,
      description: body.description,
      icon: body.icon,
      isPrivate: body.isPrivate,
      spaceId: body.spaceId,
      createdById: user.id,
      memberIds: body.memberIds,
    })
  }

  @Get('workspaces/:workspaceId/chat/channels/archived')
  @UseGuards(WorkspaceMemberGuard)
  listArchived(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listArchivedChannels(workspaceId, user.id)
  }

  @Patch('chat/channels/:channelId')
  updateChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string; description?: string | null; icon?: string | null },
  ) {
    return this.chat.updateChannel(channelId, user.id, body)
  }

  @Post('chat/channels/:channelId/archive')
  archiveChannel(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setChannelArchived(channelId, user.id, true)
  }

  @Post('chat/channels/:channelId/unarchive')
  unarchiveChannel(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setChannelArchived(channelId, user.id, false)
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

  @Post('workspaces/:workspaceId/chat/group-dms')
  @UseGuards(WorkspaceMemberGuard)
  createGroupDm(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { peerUserIds: string[] },
  ) {
    return this.chat.createGroupDm(workspaceId, user.id, body.peerUserIds ?? [])
  }

  @Get('workspaces/:workspaceId/chat/unread')
  @UseGuards(WorkspaceMemberGuard)
  unread(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.unreadSummary(workspaceId, user.id)
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

  @Post('chat/channels/:channelId/read')
  markRead(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.markChannelRead(channelId, user.id)
  }

  @Patch('chat/channels/:channelId/notifications')
  setNotificationLevel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { level: string },
  ) {
    return this.chat.setChannelNotificationLevel(channelId, user.id, body.level)
  }

  @Get('chat/channels/:channelId/members')
  channelMembers(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listChannelMembers(channelId, user.id)
  }

  @Get('chat/channels/:channelId/receipts')
  channelReceipts(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.getChannelReceipts(channelId, user.id)
  }

  @Get('chat/workspaces/:workspaceId/custom-emoji')
  listCustomEmoji(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listCustomEmoji(workspaceId, user.id)
  }

  @Post('chat/workspaces/:workspaceId/custom-emoji')
  addCustomEmoji(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { shortcode: string; imageUrl: string },
  ) {
    return this.chat.addCustomEmoji(workspaceId, user.id, body.shortcode, body.imageUrl)
  }

  @Delete('chat/custom-emoji/:emojiId')
  deleteCustomEmoji(@Param('emojiId') emojiId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.deleteCustomEmoji(emojiId, user.id)
  }

  @Post('chat/messages/:messageId/create-task')
  createTaskFromMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { listId: string; title?: string },
  ) {
    return this.chat.createTaskFromMessage(messageId, user.id, body.listId, body.title)
  }

  @Post('chat/channels/:channelId/members')
  addChannelMembers(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { userIds: string[] },
  ) {
    return this.chat.addChannelMembers(channelId, user.id, body.userIds ?? [])
  }

  @Delete('chat/channels/:channelId/members/:userId')
  removeChannelMember(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.removeChannelMember(channelId, user.id, userId)
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
    @Body() body: { body: string; parentMessageId?: string | null; mentions?: Array<{ userId: string; offset?: number; length?: number }>; attachmentIds?: string[] },
  ) {
    return this.chat.postMessage({
      channelId,
      authorId: user.id,
      body: body.body,
      parentMessageId: body.parentMessageId,
      mentions: body.mentions,
      attachmentIds: body.attachmentIds,
    })
  }

  @Post('chat/channels/:channelId/attachments/presign')
  presignAttachment(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    return this.chat.createAttachmentUploadUrl(channelId, user.id, body)
  }

  @Post('chat/channels/:channelId/attachments')
  recordAttachment(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName: string; contentType: string; sizeBytes: number; storageKey: string },
  ) {
    return this.chat.recordAttachment(channelId, user.id, body)
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

  @Get('chat/messages/:messageId/edits')
  getMessageEdits(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.getMessageEdits(messageId, user.id)
  }

  @Post('chat/channels/:channelId/commands')
  runCommand(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { command: string; text: string },
  ) {
    return this.chat.runCommand(channelId, user.id, body.command, body.text)
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

  @Get('workspaces/:workspaceId/chat/saved')
  @UseGuards(WorkspaceMemberGuard)
  listSaved(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listSaved(workspaceId, user.id)
  }

  @Post('chat/messages/:messageId/save')
  save(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setSaved(messageId, user.id, true)
  }

  @Delete('chat/messages/:messageId/save')
  unsave(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setSaved(messageId, user.id, false)
  }
}
