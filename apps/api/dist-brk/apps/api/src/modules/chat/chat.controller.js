"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const chat_service_1 = require("./chat.service");
let ChatController = class ChatController {
    constructor(chat) {
        this.chat = chat;
    }
    async list(workspaceId, user) {
        await this.chat.ensureGeneralChannel(workspaceId, user.id);
        return this.chat.listChannels(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.chat.createChannel({
            workspaceId,
            name: body.name,
            description: body.description,
            icon: body.icon,
            isPrivate: body.isPrivate,
            spaceId: body.spaceId,
            createdById: user.id,
            memberIds: body.memberIds,
        });
    }
    listArchived(workspaceId, user) {
        return this.chat.listArchivedChannels(workspaceId, user.id);
    }
    updateChannel(channelId, user, body) {
        return this.chat.updateChannel(channelId, user.id, body);
    }
    listChannelGroups(workspaceId, user) {
        return this.chat.listChannelGroups(workspaceId, user.id);
    }
    createChannelGroup(workspaceId, user, body) {
        return this.chat.createChannelGroup(workspaceId, user.id, body.name);
    }
    updateChannelGroup(groupId, user, body) {
        return this.chat.updateChannelGroup(groupId, user.id, body);
    }
    deleteChannelGroup(groupId, user) {
        return this.chat.deleteChannelGroup(groupId, user.id);
    }
    addChannelToGroup(groupId, user, body) {
        return this.chat.addChannelToGroup(groupId, user.id, body.channelId);
    }
    removeChannelFromGroup(groupId, channelId, user) {
        return this.chat.removeChannelFromGroup(groupId, user.id, channelId);
    }
    archiveChannel(channelId, user) {
        return this.chat.setChannelArchived(channelId, user.id, true);
    }
    unarchiveChannel(channelId, user) {
        return this.chat.setChannelArchived(channelId, user.id, false);
    }
    createDm(workspaceId, user, body) {
        return this.chat.ensureDmChannel(workspaceId, user.id, body.peerUserId);
    }
    createGroupDm(workspaceId, user, body) {
        return this.chat.createGroupDm(workspaceId, user.id, body.peerUserIds ?? []);
    }
    unread(workspaceId, user) {
        return this.chat.unreadSummary(workspaceId, user.id);
    }
    getMemberActivity(workspaceId, memberUserId, user, limit) {
        return this.chat.getMemberActivity(workspaceId, user.id, memberUserId, limit ? Number(limit) : 30);
    }
    join(channelId, user) {
        return this.chat.joinChannel(channelId, user.id);
    }
    leave(channelId, user) {
        return this.chat.leaveChannel(channelId, user.id);
    }
    markRead(channelId, user) {
        return this.chat.markChannelRead(channelId, user.id);
    }
    markUnread(channelId, user, body = {}) {
        return this.chat.markChannelUnread(channelId, user.id, body.messageId);
    }
    markDelivered(channelId, user) {
        return this.chat.markChannelDelivered(channelId, user.id);
    }
    setNotificationLevel(channelId, user, body) {
        return this.chat.setChannelNotificationLevel(channelId, user.id, body.level);
    }
    channelMembers(channelId, user) {
        return this.chat.listChannelMembers(channelId, user.id);
    }
    channelReceipts(channelId, user) {
        return this.chat.getChannelReceipts(channelId, user.id);
    }
    unfurl(url) {
        // Best-effort link preview (Plan §6.3). JWT-guarded (class-level). SSRF-safe:
        // the service validates the URL and returns {} for anything disallowed.
        return this.chat.unfurl(url);
    }
    listCustomEmoji(workspaceId, user) {
        return this.chat.listCustomEmoji(workspaceId, user.id);
    }
    presignCustomEmoji(workspaceId, user, body) {
        return this.chat.createCustomEmojiUploadUrl(workspaceId, user.id, body);
    }
    addCustomEmoji(workspaceId, user, body) {
        return this.chat.addCustomEmoji(workspaceId, user.id, body.shortcode, body.imageUrl ?? '', body.storageKey);
    }
    deleteCustomEmoji(emojiId, user) {
        return this.chat.deleteCustomEmoji(emojiId, user.id);
    }
    createTaskFromMessage(messageId, user, body) {
        return this.chat.createTaskFromMessage(messageId, user.id, body.listId, body.title, {
            assigneeId: body.assigneeId,
            dueAt: body.dueAt,
        });
    }
    addChannelMembers(channelId, user, body) {
        return this.chat.addChannelMembers(channelId, user.id, body.userIds ?? []);
    }
    removeChannelMember(channelId, userId, user) {
        return this.chat.removeChannelMember(channelId, user.id, userId);
    }
    listMessages(channelId, user, limit, before) {
        return this.chat.listMessages(channelId, user.id, { limit: limit ? Number(limit) : undefined, before });
    }
    post(channelId, user, body) {
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
        });
    }
    presignAttachment(channelId, user, body) {
        return this.chat.createAttachmentUploadUrl(channelId, user.id, body);
    }
    recordAttachment(channelId, user, body) {
        return this.chat.recordAttachment(channelId, user.id, body);
    }
    edit(messageId, user, body) {
        return this.chat.editMessage(messageId, user.id, body.body);
    }
    getMessage(messageId, user) {
        return this.chat.getMessageById(messageId, user.id);
    }
    getMessageEdits(messageId, user) {
        return this.chat.getMessageEdits(messageId, user.id);
    }
    runCommand(channelId, user, body) {
        return this.chat.runCommand(channelId, user.id, body.command, body.text);
    }
    getThread(messageId, user, limit) {
        return this.chat.getThread(messageId, user.id, limit ? Number(limit) : 100);
    }
    remove(messageId, user) {
        return this.chat.deleteMessage(messageId, user.id);
    }
    react(messageId, user, body) {
        return this.chat.toggleReaction(messageId, user.id, body.emoji);
    }
    listPinned(channelId, user) {
        return this.chat.listPinned(channelId, user.id);
    }
    pin(messageId, user) {
        return this.chat.setPinned(messageId, user.id, true);
    }
    unpin(messageId, user) {
        return this.chat.setPinned(messageId, user.id, false);
    }
    listSaved(workspaceId, user, tag, q) {
        return this.chat.listSaved(workspaceId, user.id, { tag, q });
    }
    listFiles(workspaceId, user, q, type, channelId) {
        return this.chat.listWorkspaceFiles(workspaceId, user.id, { q, type, channelId });
    }
    search(workspaceId, user, q, channelId, senderId, after, before, fileType) {
        return this.chat.searchMessages(workspaceId, user.id, { q, channelId, senderId, after, before, fileType });
    }
    save(messageId, user, body = {}) {
        return this.chat.setSaved(messageId, user.id, true, body.tags);
    }
    unsave(messageId, user) {
        return this.chat.setSaved(messageId, user.id, false);
    }
    updateSavedTags(messageId, user, body) {
        return this.chat.updateSavedTags(messageId, user.id, body.tags);
    }
    // §G11 [15:36] — assign a message to somebody as an action item.
    assign(messageId, user, body) {
        return this.chat.assignMessage(messageId, user.id, body.assigneeId, body.dueAt ?? null);
    }
    unassign(messageId, assigneeId, user) {
        return this.chat.unassignMessage(messageId, user.id, assigneeId);
    }
    /** Mark an assignment done, or re-open it. */
    resolveAssignment(messageId, assigneeId, user, body) {
        return this.chat.resolveMessageAssignment(messageId, user.id, assigneeId, body.resolved !== false);
    }
    /** Everything still assigned to the caller across this workspace. */
    assignedToMe(workspaceId, user) {
        return this.chat.listMyAssignments(workspaceId, user.id);
    }
    // §G12 [17:13] — follow or mute one thread without leaving the channel.
    getThreadFollow(messageId, user) {
        return this.chat.getThreadFollow(messageId, user.id);
    }
    setThreadFollow(messageId, user, body) {
        return this.chat.setThreadFollow(messageId, user.id, body.state ?? null);
    }
    // §G11 [15:19] — "Set reminder" on a message you saved.
    remind(messageId, user, body) {
        return this.chat.remindAboutMessage(messageId, user.id, body.remindAt, body.note);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/channels'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/chat/channels'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/channels/archived'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listArchived", null);
__decorate([
    (0, common_1.Patch)('chat/channels/:channelId'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "updateChannel", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/channel-groups'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listChannelGroups", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/chat/channel-groups'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createChannelGroup", null);
__decorate([
    (0, common_1.Patch)('chat/channel-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "updateChannelGroup", null);
__decorate([
    (0, common_1.Delete)('chat/channel-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "deleteChannelGroup", null);
__decorate([
    (0, common_1.Post)('chat/channel-groups/:groupId/channels'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "addChannelToGroup", null);
__decorate([
    (0, common_1.Delete)('chat/channel-groups/:groupId/channels/:channelId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Param)('channelId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "removeChannelFromGroup", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/archive'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "archiveChannel", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/unarchive'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unarchiveChannel", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/chat/dms'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createDm", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/chat/group-dms'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createGroupDm", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/unread'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unread", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/members/:memberUserId/activity'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('memberUserId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getMemberActivity", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/join'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "join", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/leave'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "leave", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/read'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markRead", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/unread'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markUnread", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/delivered'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markDelivered", null);
__decorate([
    (0, common_1.Patch)('chat/channels/:channelId/notifications'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "setNotificationLevel", null);
__decorate([
    (0, common_1.Get)('chat/channels/:channelId/members'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "channelMembers", null);
__decorate([
    (0, common_1.Get)('chat/channels/:channelId/receipts'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "channelReceipts", null);
__decorate([
    (0, common_1.Get)('chat/unfurl'),
    __param(0, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unfurl", null);
__decorate([
    (0, common_1.Get)('chat/workspaces/:workspaceId/custom-emoji'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listCustomEmoji", null);
__decorate([
    (0, common_1.Post)('chat/workspaces/:workspaceId/custom-emoji/presign'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "presignCustomEmoji", null);
__decorate([
    (0, common_1.Post)('chat/workspaces/:workspaceId/custom-emoji'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "addCustomEmoji", null);
__decorate([
    (0, common_1.Delete)('chat/custom-emoji/:emojiId'),
    __param(0, (0, common_1.Param)('emojiId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "deleteCustomEmoji", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/create-task'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "createTaskFromMessage", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/members'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "addChannelMembers", null);
__decorate([
    (0, common_1.Delete)('chat/channels/:channelId/members/:userId'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "removeChannelMember", null);
__decorate([
    (0, common_1.Get)('chat/channels/:channelId/messages'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('before')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listMessages", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/messages'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "post", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/attachments/presign'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "presignAttachment", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/attachments'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "recordAttachment", null);
__decorate([
    (0, common_1.Patch)('chat/messages/:messageId'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "edit", null);
__decorate([
    (0, common_1.Get)('chat/messages/:messageId'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getMessage", null);
__decorate([
    (0, common_1.Get)('chat/messages/:messageId/edits'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getMessageEdits", null);
__decorate([
    (0, common_1.Post)('chat/channels/:channelId/commands'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "runCommand", null);
__decorate([
    (0, common_1.Get)('chat/messages/:messageId/thread'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getThread", null);
__decorate([
    (0, common_1.Delete)('chat/messages/:messageId'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/reactions'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "react", null);
__decorate([
    (0, common_1.Get)('chat/channels/:channelId/pinned'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listPinned", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/pin'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "pin", null);
__decorate([
    (0, common_1.Delete)('chat/messages/:messageId/pin'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unpin", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/saved'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('tag')),
    __param(3, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listSaved", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/files'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('q')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listFiles", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/search'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('q')),
    __param(3, (0, common_1.Query)('channelId')),
    __param(4, (0, common_1.Query)('senderId')),
    __param(5, (0, common_1.Query)('after')),
    __param(6, (0, common_1.Query)('before')),
    __param(7, (0, common_1.Query)('fileType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/save'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)('chat/messages/:messageId/save'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unsave", null);
__decorate([
    (0, common_1.Patch)('chat/saves/:messageId/tags'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "updateSavedTags", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/assign'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "assign", null);
__decorate([
    (0, common_1.Delete)('chat/messages/:messageId/assign/:assigneeId'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, common_1.Param)('assigneeId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "unassign", null);
__decorate([
    (0, common_1.Patch)('chat/messages/:messageId/assign/:assigneeId'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, common_1.Param)('assigneeId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "resolveAssignment", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/chat/assigned-to-me'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "assignedToMe", null);
__decorate([
    (0, common_1.Get)('chat/messages/:messageId/thread-follow'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getThreadFollow", null);
__decorate([
    (0, common_1.Put)('chat/messages/:messageId/thread-follow'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "setThreadFollow", null);
__decorate([
    (0, common_1.Post)('chat/messages/:messageId/remind'),
    __param(0, (0, common_1.Param)('messageId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "remind", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chat'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)()
    // Backend feature-flag enforcement (defense-in-depth alongside the frontend
    // gate): if a workspace disables Chat, its API 404s. CHAT is default-enabled,
    // so existing workspaces are unaffected. FeatureFlagGuard runs after
    // JwtAuthGuard so request.user (→ workspace/role context) is populated.
    ,
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.CHAT),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map