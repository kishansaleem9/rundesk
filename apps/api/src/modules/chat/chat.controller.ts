import { Controller, Get, Post, Patch, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ChatService } from './chat.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
// Backend feature-flag enforcement (defense-in-depth alongside the frontend
// gate): if a workspace disables Chat, its API 404s. CHAT is default-enabled,
// so existing workspaces are unaffected. FeatureFlagGuard runs after
// JwtAuthGuard so request.user (→ workspace/role context) is populated.
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.CHAT)
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
    @Body() body: { name?: string; topic?: string | null; description?: string | null; icon?: string | null },
  ) {
    return this.chat.updateChannel(channelId, user.id, body)
  }

  @Get('workspaces/:workspaceId/chat/channel-groups')
  @UseGuards(WorkspaceMemberGuard)
  listChannelGroups(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listChannelGroups(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/chat/channel-groups')
  @UseGuards(WorkspaceMemberGuard)
  createChannelGroup(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string },
  ) {
    return this.chat.createChannelGroup(workspaceId, user.id, body.name)
  }

  @Patch('chat/channel-groups/:groupId')
  updateChannelGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string; isCollapsed?: boolean; position?: number },
  ) {
    return this.chat.updateChannelGroup(groupId, user.id, body)
  }

  @Delete('chat/channel-groups/:groupId')
  deleteChannelGroup(@Param('groupId') groupId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.deleteChannelGroup(groupId, user.id)
  }

  @Post('chat/channel-groups/:groupId/channels')
  addChannelToGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { channelId: string },
  ) {
    return this.chat.addChannelToGroup(groupId, user.id, body.channelId)
  }

  @Delete('chat/channel-groups/:groupId/channels/:channelId')
  removeChannelFromGroup(
    @Param('groupId') groupId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.removeChannelFromGroup(groupId, user.id, channelId)
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

  @Post('chat/channels/:channelId/unread')
  markUnread(
    @Param('channelId') channelId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { messageId?: string } = {},
  ) {
    return this.chat.markChannelUnread(channelId, user.id, body.messageId)
  }

  @Post('chat/channels/:channelId/delivered')
  markDelivered(@Param('channelId') channelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.markChannelDelivered(channelId, user.id)
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

  @Get('chat/unfurl')
  unfurl(@Query('url') url?: string) {
    // Best-effort link preview (Plan §6.3). JWT-guarded (class-level). SSRF-safe:
    // the service validates the URL and returns {} for anything disallowed.
    return this.chat.unfurl(url)
  }

  @Get('chat/workspaces/:workspaceId/custom-emoji')
  listCustomEmoji(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.listCustomEmoji(workspaceId, user.id)
  }

  @Post('chat/workspaces/:workspaceId/custom-emoji/presign')
  presignCustomEmoji(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    return this.chat.createCustomEmojiUploadUrl(workspaceId, user.id, body)
  }

  @Post('chat/workspaces/:workspaceId/custom-emoji')
  addCustomEmoji(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { shortcode: string; imageUrl?: string; storageKey?: string },
  ) {
    return this.chat.addCustomEmoji(workspaceId, user.id, body.shortcode, body.imageUrl ?? '', body.storageKey)
  }

  @Delete('chat/custom-emoji/:emojiId')
  deleteCustomEmoji(@Param('emojiId') emojiId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.deleteCustomEmoji(emojiId, user.id)
  }

  @Post('chat/messages/:messageId/create-task')
  createTaskFromMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { listId: string; title?: string; assigneeId?: string | null; dueAt?: string | null },
  ) {
    return this.chat.createTaskFromMessage(messageId, user.id, body.listId, body.title, {
      assigneeId: body.assigneeId,
      dueAt: body.dueAt,
    })
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
    @Body() body: { body: string; parentMessageId?: string | null; mentions?: Array<{ userId: string; offset?: number; length?: number }>; attachmentIds?: string[]; forwardedFromId?: string | null },
  ) {
    return this.chat.postMessage({
      channelId,
      authorId: user.id,
      body: body.body,
      parentMessageId: body.parentMessageId,
      // §12 — forwarded from, if this is a forward. Access-checked in the
      // service against the sender before it is recorded.
      forwardedFromId: body.forwardedFromId,
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
  listSaved(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    return this.chat.listSaved(workspaceId, user.id, { tag, q })
  }

  @Get('workspaces/:workspaceId/chat/files')
  @UseGuards(WorkspaceMemberGuard)
  listFiles(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.chat.listWorkspaceFiles(workspaceId, user.id, { q, type, channelId })
  }

  @Get('workspaces/:workspaceId/chat/search')
  @UseGuards(WorkspaceMemberGuard)
  search(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
    @Query('senderId') senderId?: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('fileType') fileType?: string,
  ) {
    return this.chat.searchMessages(workspaceId, user.id, { q, channelId, senderId, after, before, fileType })
  }

  @Post('chat/messages/:messageId/save')
  save(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { tags?: string[] } = {},
  ) {
    return this.chat.setSaved(messageId, user.id, true, body.tags)
  }

  @Delete('chat/messages/:messageId/save')
  unsave(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.setSaved(messageId, user.id, false)
  }

  @Patch('chat/saves/:messageId/tags')
  updateSavedTags(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { tags?: string[] },
  ) {
    return this.chat.updateSavedTags(messageId, user.id, body.tags)
  }

  // §G11 [15:36] — assign a message to somebody as an action item.
  @Post('chat/messages/:messageId/assign')
  assign(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { assigneeId: string; dueAt?: string | null },
  ) {
    return this.chat.assignMessage(messageId, user.id, body.assigneeId, body.dueAt ?? null)
  }

  @Delete('chat/messages/:messageId/assign/:assigneeId')
  unassign(
    @Param('messageId') messageId: string,
    @Param('assigneeId') assigneeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.unassignMessage(messageId, user.id, assigneeId)
  }

  /** Mark an assignment done, or re-open it. */
  @Patch('chat/messages/:messageId/assign/:assigneeId')
  resolveAssignment(
    @Param('messageId') messageId: string,
    @Param('assigneeId') assigneeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { resolved?: boolean },
  ) {
    return this.chat.resolveMessageAssignment(messageId, user.id, assigneeId, body.resolved !== false)
  }

  /** Everything still assigned to the caller across this workspace. */
  @Get('workspaces/:workspaceId/chat/assigned-to-me')
  assignedToMe(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chat.listMyAssignments(workspaceId, user.id)
  }

  // §G12 [17:13] — follow or mute one thread without leaving the channel.
  @Get('chat/messages/:messageId/thread-follow')
  getThreadFollow(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chat.getThreadFollow(messageId, user.id)
  }

  @Put('chat/messages/:messageId/thread-follow')
  setThreadFollow(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { state: 'following' | 'muted' | null },
  ) {
    return this.chat.setThreadFollow(messageId, user.id, body.state ?? null)
  }

  // §G11 [15:19] — "Set reminder" on a message you saved.
  @Post('chat/messages/:messageId/remind')
  remind(
    @Param('messageId') messageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { remindAt: string; note?: string },
  ) {
    return this.chat.remindAboutMessage(messageId, user.id, body.remindAt, body.note)
  }
}
