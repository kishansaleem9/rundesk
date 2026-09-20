import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskRemindersService } from '../reminders/task-reminders.service';
import { PresenceService } from '../presence/presence.service';
import { AiService } from '../ai/ai.service';
import { SharesService } from '../shares/shares.service';
import { SkillsService } from '../skills/skills.service';
import { type UnfurlResult } from './link-unfurl';
/** Hard cap on a single chat attachment (Plan §6.8) — mirrors task attachments. */
export declare const MAX_CHAT_ATTACHMENT_BYTES: number;
/** Hard cap on an uploaded custom-emoji image (§A3.8) — emoji render at ~20px. */
export declare const MAX_CUSTOM_EMOJI_BYTES: number;
/** Max members in a group DM incl. the creator (Plan §6.2). */
export declare const MAX_GROUP_DM_MEMBERS = 8;
/**
 * Per-message delivery status for the author (Plan §6.2). Given a message's
 * createdAt and the read/delivery receipts of the *other* channel members,
 * a message is "seen" once any other member has read it (lastReadAt >=
 * createdAt), else "delivered" once any other member's client acknowledged it
 * (lastDeliveredAt >= createdAt), else just "sent". Seen supersedes Delivered.
 */
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'seen';
export declare function computeDeliveryStatus(createdAt: Date, otherMembers: Array<{
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
}>): MessageDeliveryStatus;
/** Normalize user-supplied bookmark tags (Plan §6.7): trim, lowercase, dedupe,
 *  drop empties, cap count + length so the Saved panel stays tidy. */
export declare function normalizeSaveTags(tags: unknown): string[];
export declare class ChatService {
    private db;
    private realtime;
    private notifications;
    private tasks;
    private ai;
    private r2;
    private reminders;
    private presence;
    private shares;
    private skills;
    private aiUserId;
    /** In-memory unfurl cache (Plan §6.3): url → { fetchedAt, metadata }. */
    private unfurlCache;
    constructor(db: Db, realtime: RealtimeGateway, notifications: NotificationsService, tasks: TasksService, ai: AiService, r2: R2Service, reminders: TaskRemindersService, presence: PresenceService, shares: SharesService, skills: SkillsService);
    private sanitizeFileName;
    /**
     * §6.8 — enforce the declared attachment size on the presign/record paths.
     * A valid, positive `sizeBytes` is mandatory (reject missing/≤0/over cap). The
     * declared-size gate is authoritative because R2 presigned PUT URLs cannot
     * bound the actual uploaded bytes (see R2Service.presignPutObject).
     */
    private assertAttachmentSize;
    /**
     * Presign a direct-to-R2 upload for a chat attachment (Plan §6.8). The caller
     * PUTs the bytes to `uploadUrl`, then calls recordAttachment with the returned
     * storageKey. Membership is enforced up-front via assertChannelAccess.
     */
    createAttachmentUploadUrl(channelId: string, userId: string, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    /**
     * Record an uploaded attachment (message_id null until the message is posted).
     * Returns the row plus a short-lived download URL so the composer can preview it.
     */
    recordAttachment(channelId: string, userId: string, data: {
        fileName: string;
        contentType: string;
        sizeBytes: number;
        storageKey: string;
    }): Promise<{
        id: string;
        fileName: string;
        contentType: string;
        sizeBytes: number;
        storageKey: string;
        url: string;
    }>;
    /** Ensure a system "Rundesk AI" user exists to author @Rundesk replies. */
    private ensureAiUser;
    /** If a message mentions @Rundesk, generate + post an AI reply (§7.6). */
    private maybeAnswerAiMention;
    private extractMentionIds;
    /**
     * Detect the broadcast mentions @here / @channel (Plan §6.9). `@channel`
     * targets every channel member; `@here` targets only the currently-present
     * members. Word-boundaried + case-insensitive so "@channel," or "@Here" match
     * but an email like "a@channel.com" does not (the trailing `.` isn't allowed).
     */
    private extractSpecialMentions;
    /**
     * §A4.3 — pull out candidate team handles. Deliberately loose: anything that
     * looks like a handle is collected here and only becomes a mention if a team
     * in this workspace actually answers to it, so `@here` or a stray `@word`
     * costs one lookup and notifies nobody.
     */
    private extractAliasCandidates;
    /**
     * Expand @team handles into the member ids they stand for. A team mention is
     * a shorthand for its people: everyone in the group gets the same mention
     * ping they would have got had they been named individually.
     */
    private resolveTeamMentionTargets;
    /**
     * Resolve the member ids a @here / @channel broadcast should notify. @channel
     * is every member; @here narrows to members the presence service reports as
     * online, falling back to all members if presence is unavailable or nobody
     * registers as present. Excludes the author.
     */
    private resolveBroadcastTargets;
    private assertChannelAccess;
    /** Read-only visitors (view level) may not write into a channel. */
    private assertCanPost;
    /**
     * Someone inside a private channel purely because it was shared with them.
     *
     * They must never acquire a chat_channel_members row: membership outlives the
     * grant, so revoking the share would leave them with access anyway. Their
     * read/delivery markers go untracked, which is a fair trade for revocation
     * that actually revokes.
     */
    private isShareOnlyVisitor;
    listChannels(workspaceId: string, userId: string): Promise<{
        joined: boolean;
        unreadCount: number;
        lastReadAt: Date | null;
        notificationLevel: "mentions" | "all" | "none";
        accessLevel: "view" | "comment" | "edit" | "admin";
        id: string;
        name: string;
        description: string | null;
        topic: string | null;
        icon: string | null;
        spaceId: string | null;
        isPrivate: boolean;
        isDm: boolean;
        createdById: string | null;
        createdAt: Date;
    }[]>;
    /** Mark a channel read up to now for the user (upserts their member row). */
    markChannelRead(channelId: string, userId: string): Promise<{
        ok: boolean;
        lastReadAt: Date;
    }>;
    /** Mark the channel's messages delivered to the caller (Plan §6.2). Mirrors
     *  markChannelRead but only advances the delivery marker — the client calls
     *  this when it receives/opens a channel's messages, so senders can see
     *  "Delivered" before the recipient actually reads. */
    markChannelDelivered(channelId: string, userId: string): Promise<{
        ok: boolean;
        lastDeliveredAt: Date;
    }>;
    /**
     * Rewind the caller's read cursor so a channel comes back unread (§A3.3).
     * With a messageId the cursor lands 1ms before that message, so the stream's
     * unread divider sits exactly above it; without one it lands before the most
     * recent message someone else wrote, which is what "mark this channel unread"
     * means from the sidebar.
     */
    markChannelUnread(channelId: string, userId: string, messageId?: string): Promise<{
        ok: boolean;
        lastReadAt: Date | null;
    }>;
    /** Set the caller's notification level for a channel ('all' | 'mentions' | 'none'). */
    setChannelNotificationLevel(channelId: string, userId: string, level: string): Promise<{
        ok: boolean;
        notificationLevel: string;
        level?: undefined;
    } | {
        ok: boolean;
        level: string;
        notificationLevel?: undefined;
    }>;
    /** Total + per-channel unread counts across the user's channels in a workspace. */
    unreadSummary(workspaceId: string, userId: string): Promise<{
        total: number;
        byChannel: Record<string, number>;
    }>;
    ensureDmChannel(workspaceId: string, currentUserId: string, peerUserId: string): Promise<{
        id: string;
    }>;
    /**
     * Create (or reuse) a group DM among the current user and 2+ peers (Plan §6.2).
     * A group DM is an isDm channel with 3+ members; dedup is by the exact member
     * set so re-opening the same group returns the existing channel. A single peer
     * falls back to the 1:1 ensureDmChannel path.
     */
    createGroupDm(workspaceId: string, currentUserId: string, peerUserIds: string[]): Promise<{
        id: string;
    }>;
    createChannel(data: {
        workspaceId: string;
        name: string;
        description?: string;
        icon?: string;
        isPrivate?: boolean;
        spaceId?: string | null;
        createdById: string;
        memberIds?: string[];
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        spaceId: string | null;
        topic: string | null;
        isPrivate: boolean;
        isDm: boolean;
    }>;
    /**
     * Edit a channel's name / topic / description / icon (Plan §6.1, §A3.7).
     * Moderator-gated (channel creator or workspace admin) via canModerateChannel.
     * DMs aren't editable this way. Only provided fields are changed.
     */
    updateChannel(channelId: string, userId: string, patch: {
        name?: string;
        topic?: string | null;
        description?: string | null;
        icon?: string | null;
    }): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        topic: string | null;
        icon: string | null;
        isPrivate: boolean;
        isDm: boolean;
        createdById: string | null;
        archivedAt: Date | null;
        createdAt: Date;
    }>;
    /**
     * Archive / unarchive a channel (Plan §6.1). Writes archivedAt; archived
     * channels drop out of the normal list. Moderator-gated; DMs excluded.
     */
    setChannelArchived(channelId: string, userId: string, archived: boolean): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        topic: string | null;
        icon: string | null;
        isPrivate: boolean;
        isDm: boolean;
        createdById: string | null;
        archivedAt: Date | null;
        createdAt: Date;
    }>;
    /**
     * List a workspace's archived channels (Plan §6.1) so members can review /
     * unarchive them. Mirrors listChannels' visibility: private channels only
     * show to their members. DMs are never archived here, so excluded.
     */
    listArchivedChannels(workspaceId: string, userId: string): Promise<{
        joined: boolean;
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        spaceId: string | null;
        isPrivate: boolean;
        isDm: boolean;
        createdById: string | null;
        archivedAt: Date | null;
        createdAt: Date;
    }[]>;
    /**
     * The caller's channel groups for a workspace (§A3.4), each with the channels
     * they've filed into it. Space-derived grouping stays as the fallback in the
     * sidebar for anything that isn't in a group.
     */
    listChannelGroups(workspaceId: string, userId: string): Promise<{
        channelIds: string[];
        id: string;
        name: string;
        position: number;
        isCollapsed: boolean;
    }[]>;
    private normalizeGroupName;
    /** The caller's own group, or 404. Groups are private to their owner. */
    private assertOwnGroup;
    createChannelGroup(workspaceId: string, userId: string, name: string): Promise<{
        channelIds: string[];
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        position: number;
        userId: string;
        isCollapsed: boolean;
    }>;
    updateChannelGroup(groupId: string, userId: string, patch: {
        name?: string;
        isCollapsed?: boolean;
        position?: number;
    }): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        name: string;
        position: number;
        isCollapsed: boolean;
        createdAt: Date;
    }>;
    /** Delete a group. Its channels fall back to space-derived grouping. */
    deleteChannelGroup(groupId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * File a channel into one of the caller's groups (§A3.4). A channel lives in
     * at most one group per user, so this clears any previous placement first —
     * otherwise the rail would render the channel under two headings.
     */
    addChannelToGroup(groupId: string, userId: string, channelId: string): Promise<{
        ok: boolean;
    }>;
    removeChannelFromGroup(groupId: string, userId: string, channelId: string): Promise<{
        ok: boolean;
    }>;
    joinChannel(channelId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /** Add other workspace members to a channel (enables group conversations). */
    addChannelMembers(channelId: string, actorId: string, userIds: string[]): Promise<{
        ok: boolean;
        added: number;
    }>;
    listChannelMembers(channelId: string, userId: string): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        joinedAt: Date;
    }[]>;
    /**
     * Read state per channel member (Plan §6 read receipts). A member has "seen"
     * a message when their lastReadAt (set on opening the channel) is at/after the
     * message's createdAt — so the client can render "Seen by …" per message
     * without a per-message receipts table.
     */
    getChannelReceipts(channelId: string, userId: string): Promise<{
        userId: string;
        displayName: string;
        lastReadAt: Date | null;
        lastDeliveredAt: Date | null;
    }[]>;
    leaveChannel(channelId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    private assertWorkspaceRole;
    listCustomEmoji(workspaceId: string, userId: string): Promise<{
        imageUrl: string;
        id: string;
        shortcode: string;
        createdById: string | null;
    }[]>;
    /**
     * Presign a direct-to-R2 upload for a custom emoji image (§A3.8). Mirrors the
     * attachment presign path so emoji can be uploaded instead of only linked.
     */
    createCustomEmojiUploadUrl(workspaceId: string, userId: string, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    addCustomEmoji(workspaceId: string, userId: string, shortcode: string, imageUrl: string, storageKey?: string): Promise<{
        imageUrl: string;
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        storageKey: string | null;
        shortcode: string;
    }>;
    deleteCustomEmoji(emojiId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /** Remove another member from a channel (Plan §6). Only the channel creator
     *  or a workspace admin may do this; the creator can't be removed. */
    removeChannelMember(channelId: string, actorId: string, targetUserId: string): Promise<{
        ok: boolean;
    }>;
    listMessages(channelId: string, userId: string, opts?: {
        limit?: number;
        before?: string;
    }): Promise<{
        id: string;
        channelId: string;
        authorId: string;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        pinnedById: string | null;
        deletedAt: Date | null;
        createdAt: Date;
        authorName: string | null;
        authorAvatarUrl: string | null;
        forwardedFromId: string | null;
        callId: string | null;
    }[]>;
    getMemberActivity(workspaceId: string, requesterId: string, memberUserId: string, limit?: number): Promise<{
        id: string;
        channelId: string;
        channelName: string;
        body: string;
        parentMessageId: string | null;
        createdAt: Date;
    }[]>;
    getMessageById(messageId: string, userId: string): Promise<{
        reactions: {
            emoji: string;
            count: number;
            reacted: boolean;
            users: {
                id: string;
                name: string;
            }[];
        }[];
        threadFollowState: "following" | "muted";
        id: string;
        channelId: string;
        authorId: string;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        parentMessageId: string | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        createdAt: Date;
        authorName: string | null;
        authorAvatarUrl: string | null;
    }>;
    getThread(messageId: string, userId: string, limit?: number): Promise<{
        parent: {
            reactions: {
                emoji: string;
                count: number;
                reacted: boolean;
                users: {
                    id: string;
                    name: string;
                }[];
            }[];
            threadFollowState: "following" | "muted";
            id: string;
            channelId: string;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            parentMessageId: string | null;
            editedAt: Date | null;
            pinnedAt: Date | null;
            createdAt: Date;
            authorName: string | null;
            authorAvatarUrl: string | null;
        };
        replies: {
            id: string;
            channelId: string;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            parentMessageId: string | null;
            editedAt: Date | null;
            pinnedAt: Date | null;
            createdAt: Date;
            authorName: string | null;
            authorAvatarUrl: string | null;
        }[];
    }>;
    postMessage(data: {
        channelId: string;
        authorId: string;
        body: string;
        parentMessageId?: string | null;
        mentions?: Array<{
            userId: string;
            offset?: number;
            length?: number;
        }>;
        attachmentIds?: string[];
        /** §12 — the message this one is a forward of. */
        forwardedFromId?: string | null;
    }): Promise<{
        authorName: string;
        authorAvatarUrl: string | null;
        attachments: {
            id: string;
            fileName: string;
            contentType: string;
            sizeBytes: number;
            storageKey: string;
            url: string;
        }[];
        reactions: Array<{
            emoji: string;
            count: number;
            reacted: boolean;
        }>;
        id: string;
        createdAt: Date;
        deletedAt: Date | null;
        authorId: string;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        channelId: string;
        parentMessageId: string | null;
        forwardedFromId: string | null;
        callId: string | null;
        pinnedAt: Date | null;
        pinnedById: string | null;
    }>;
    /**
     * Create a task from a chat message (Plan §6.10, §A3.5). Title defaults to the
     * message's first line; the full message becomes the description. An optional
     * assignee and due date turn it into a real action item rather than an
     * unowned, undated task nobody picks up.
     */
    createTaskFromMessage(messageId: string, userId: string, listId: string, title?: string, opts?: {
        assigneeId?: string | null;
        dueAt?: string | null;
    }): Promise<{
        coverUrl: string | null;
        parent: {
            id: string;
            title: string;
        };
        taskType: {
            id: string;
            name: string;
            icon: string | null;
            color: string | null;
        };
        defaultBillable: boolean;
        labels: {
            id: string;
            workspaceId: string;
            name: string;
            color: string;
            createdAt: Date;
        }[];
        watchers: {
            user: {
                readonly id: string;
                readonly email: string;
                readonly displayName: string;
                readonly avatarUrl: string | null;
                readonly bio: string | null;
                readonly timezone: string;
                readonly role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                readonly lastSeenAt: Date | null;
                readonly presenceStatus: "online" | "away" | "busy" | "offline" | null;
            };
            id: string;
            taskId: string;
            userId: string;
            addedAt: Date;
        }[];
        checklists: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            position: number;
            title: string;
            taskId: string;
            items: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                position: number;
                dueDate: Date | null;
                completedAt: Date | null;
                content: string;
                checklistId: string;
                assigneeId: string | null;
                isDone: boolean;
            }[];
        }[];
        dependencies: {
            dep: {
                id: string;
                taskId: string;
                relatedTaskId: string;
                type: "blocks" | "blocked_by" | "related_to";
                createdById: string | null;
                createdAt: Date;
            };
            related: {
                id: string;
                listId: string;
                parentTaskId: string | null;
                createdById: string | null;
                title: string;
                description: string | null;
                priority: "urgent" | "high" | "normal" | "low";
                status: string;
                statusCategory: import("@rundesk/db").StatusCategory;
                position: number;
                startDate: Date | null;
                dueDate: Date | null;
                completedAt: Date | null;
                timeEstimate: number | null;
                coverColor: string | null;
                coverStorageKey: string | null;
                coverImageUrl: string | null;
                coverOffsetY: number;
                isMilestone: boolean;
                taskTypeId: string | null;
                recurrence: {
                    cadenceDays?: number | null;
                    rule?: {
                        mode: "daily" | "weekly" | "monthly";
                        interval?: number;
                        weekdays?: number[];
                        dayOfMonth?: number;
                        skipWeekends?: boolean;
                    } | null;
                } | null;
                isArchived: boolean;
                archivedAt: Date | null;
                archivedById: string | null;
                deletedAt: Date | null;
                deletedById: string | null;
                visibility: "public" | "private";
                createdAt: Date;
                updatedAt: Date;
            };
        }[];
        attachments: {
            id: string;
            taskId: string;
            commentId: string | null;
            uploadedById: string | null;
            fileName: string;
            contentType: string;
            sizeBytes: number;
            storageKey: string;
            createdAt: Date;
        }[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        description: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        position: number;
        listId: string;
        parentTaskId: string | null;
        title: string;
        priority: "urgent" | "high" | "normal" | "low";
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        startDate: Date | null;
        dueDate: Date | null;
        completedAt: Date | null;
        timeEstimate: number | null;
        coverColor: string | null;
        coverStorageKey: string | null;
        coverImageUrl: string | null;
        coverOffsetY: number;
        isMilestone: boolean;
        taskTypeId: string | null;
        recurrence: {
            cadenceDays?: number | null;
            rule?: {
                mode: "daily" | "weekly" | "monthly";
                interval?: number;
                weekdays?: number[];
                dayOfMonth?: number;
                skipWeekends?: boolean;
            } | null;
        } | null;
        deletedAt: Date | null;
        deletedById: string | null;
        creator: {
            id: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
        } | null;
        subtasks: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            isArchived: boolean;
            description: string | null;
            createdById: string | null;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private";
            position: number;
            listId: string;
            parentTaskId: string | null;
            title: string;
            priority: "urgent" | "high" | "normal" | "low";
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            startDate: Date | null;
            dueDate: Date | null;
            completedAt: Date | null;
            timeEstimate: number | null;
            coverColor: string | null;
            coverStorageKey: string | null;
            coverImageUrl: string | null;
            coverOffsetY: number;
            isMilestone: boolean;
            taskTypeId: string | null;
            recurrence: {
                cadenceDays?: number | null;
                rule?: {
                    mode: "daily" | "weekly" | "monthly";
                    interval?: number;
                    weekdays?: number[];
                    dayOfMonth?: number;
                    skipWeekends?: boolean;
                } | null;
            } | null;
            deletedAt: Date | null;
            deletedById: string | null;
        }[];
        assignees: {
            id: string;
            taskId: string;
            userId: string;
            assignedAt: Date;
            user: {
                id: string;
                email: string;
                displayName: string;
                avatarUrl: string | null;
                bio: string | null;
                timezone: string;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                lastSeenAt: Date | null;
                presenceStatus: "online" | "away" | "busy" | "offline" | null;
            };
        }[];
    } | null>;
    /** First usable (non-archived) list in a workspace — the default target for a
     *  slash command's task/reminder. Null when the workspace has no list yet. */
    private resolveDefaultList;
    /**
     * Parse the "<when> <what>" tail of a `/remind` command into an absolute time
     * plus the reminder note (Plan §6.3). Understands a leading "me", relative
     * phrases ("in 20 minutes", "in 2 hours", "in 3 days", "tomorrow", "tonight")
     * and clock times ("at 3pm", "at 14:30"). Falls back to +1 hour when no time
     * phrase is recognised so the command always yields a real reminder.
     */
    parseReminderWhen(input: string, now?: Date): {
        when: Date;
        note: string;
        phrase: string;
    };
    /**
     * Run a leading slash command from the composer (Plan §6.3). `/task <text>`
     * creates a task from the text; `/remind <when> <text>` schedules a reminder.
     * Either way a confirmation message is posted to the channel instead of the
     * literal command.
     */
    runCommand(channelId: string, userId: string, command: string, text: string): Promise<{
        kind: "task";
        task: {
            coverUrl: string | null;
            parent: {
                id: string;
                title: string;
            };
            taskType: {
                id: string;
                name: string;
                icon: string | null;
                color: string | null;
            };
            defaultBillable: boolean;
            labels: {
                id: string;
                workspaceId: string;
                name: string;
                color: string;
                createdAt: Date;
            }[];
            watchers: {
                user: {
                    readonly id: string;
                    readonly email: string;
                    readonly displayName: string;
                    readonly avatarUrl: string | null;
                    readonly bio: string | null;
                    readonly timezone: string;
                    readonly role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                    readonly lastSeenAt: Date | null;
                    readonly presenceStatus: "online" | "away" | "busy" | "offline" | null;
                };
                id: string;
                taskId: string;
                userId: string;
                addedAt: Date;
            }[];
            checklists: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                position: number;
                title: string;
                taskId: string;
                items: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    position: number;
                    dueDate: Date | null;
                    completedAt: Date | null;
                    content: string;
                    checklistId: string;
                    assigneeId: string | null;
                    isDone: boolean;
                }[];
            }[];
            dependencies: {
                dep: {
                    id: string;
                    taskId: string;
                    relatedTaskId: string;
                    type: "blocks" | "blocked_by" | "related_to";
                    createdById: string | null;
                    createdAt: Date;
                };
                related: {
                    id: string;
                    listId: string;
                    parentTaskId: string | null;
                    createdById: string | null;
                    title: string;
                    description: string | null;
                    priority: "urgent" | "high" | "normal" | "low";
                    status: string;
                    statusCategory: import("@rundesk/db").StatusCategory;
                    position: number;
                    startDate: Date | null;
                    dueDate: Date | null;
                    completedAt: Date | null;
                    timeEstimate: number | null;
                    coverColor: string | null;
                    coverStorageKey: string | null;
                    coverImageUrl: string | null;
                    coverOffsetY: number;
                    isMilestone: boolean;
                    taskTypeId: string | null;
                    recurrence: {
                        cadenceDays?: number | null;
                        rule?: {
                            mode: "daily" | "weekly" | "monthly";
                            interval?: number;
                            weekdays?: number[];
                            dayOfMonth?: number;
                            skipWeekends?: boolean;
                        } | null;
                    } | null;
                    isArchived: boolean;
                    archivedAt: Date | null;
                    archivedById: string | null;
                    deletedAt: Date | null;
                    deletedById: string | null;
                    visibility: "public" | "private";
                    createdAt: Date;
                    updatedAt: Date;
                };
            }[];
            attachments: {
                id: string;
                taskId: string;
                commentId: string | null;
                uploadedById: string | null;
                fileName: string;
                contentType: string;
                sizeBytes: number;
                storageKey: string;
                createdAt: Date;
            }[];
            id: string;
            createdAt: Date;
            updatedAt: Date;
            isArchived: boolean;
            description: string | null;
            createdById: string | null;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private";
            position: number;
            listId: string;
            parentTaskId: string | null;
            title: string;
            priority: "urgent" | "high" | "normal" | "low";
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            startDate: Date | null;
            dueDate: Date | null;
            completedAt: Date | null;
            timeEstimate: number | null;
            coverColor: string | null;
            coverStorageKey: string | null;
            coverImageUrl: string | null;
            coverOffsetY: number;
            isMilestone: boolean;
            taskTypeId: string | null;
            recurrence: {
                cadenceDays?: number | null;
                rule?: {
                    mode: "daily" | "weekly" | "monthly";
                    interval?: number;
                    weekdays?: number[];
                    dayOfMonth?: number;
                    skipWeekends?: boolean;
                } | null;
            } | null;
            deletedAt: Date | null;
            deletedById: string | null;
            creator: {
                id: string;
                email: string;
                displayName: string;
                avatarUrl: string | null;
                bio: string | null;
                timezone: string;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                lastSeenAt: Date | null;
                presenceStatus: "online" | "away" | "busy" | "offline" | null;
            } | null;
            subtasks: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                isArchived: boolean;
                description: string | null;
                createdById: string | null;
                archivedAt: Date | null;
                archivedById: string | null;
                visibility: "public" | "private";
                position: number;
                listId: string;
                parentTaskId: string | null;
                title: string;
                priority: "urgent" | "high" | "normal" | "low";
                status: string;
                statusCategory: import("@rundesk/db").StatusCategory;
                startDate: Date | null;
                dueDate: Date | null;
                completedAt: Date | null;
                timeEstimate: number | null;
                coverColor: string | null;
                coverStorageKey: string | null;
                coverImageUrl: string | null;
                coverOffsetY: number;
                isMilestone: boolean;
                taskTypeId: string | null;
                recurrence: {
                    cadenceDays?: number | null;
                    rule?: {
                        mode: "daily" | "weekly" | "monthly";
                        interval?: number;
                        weekdays?: number[];
                        dayOfMonth?: number;
                        skipWeekends?: boolean;
                    } | null;
                } | null;
                deletedAt: Date | null;
                deletedById: string | null;
            }[];
            assignees: {
                id: string;
                taskId: string;
                userId: string;
                assignedAt: Date;
                user: {
                    id: string;
                    email: string;
                    displayName: string;
                    avatarUrl: string | null;
                    bio: string | null;
                    timezone: string;
                    role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
                    lastSeenAt: Date | null;
                    presenceStatus: "online" | "away" | "busy" | "offline" | null;
                };
            }[];
        } | null;
        message: {
            authorName: string;
            authorAvatarUrl: string | null;
            attachments: {
                id: string;
                fileName: string;
                contentType: string;
                sizeBytes: number;
                storageKey: string;
                url: string;
            }[];
            reactions: Array<{
                emoji: string;
                count: number;
                reacted: boolean;
            }>;
            id: string;
            createdAt: Date;
            deletedAt: Date | null;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            editedAt: Date | null;
            channelId: string;
            parentMessageId: string | null;
            forwardedFromId: string | null;
            callId: string | null;
            pinnedAt: Date | null;
            pinnedById: string | null;
        };
        reminder?: undefined;
        skill?: undefined;
        reply?: undefined;
    } | {
        kind: "remind";
        reminder: {
            id: string;
            createdAt: Date;
            workspaceId: string;
            taskId: string | null;
            userId: string;
            messageId: string | null;
            note: string | null;
            remindAt: Date;
            notifiedAt: Date | null;
        };
        message: {
            authorName: string;
            authorAvatarUrl: string | null;
            attachments: {
                id: string;
                fileName: string;
                contentType: string;
                sizeBytes: number;
                storageKey: string;
                url: string;
            }[];
            reactions: Array<{
                emoji: string;
                count: number;
                reacted: boolean;
            }>;
            id: string;
            createdAt: Date;
            deletedAt: Date | null;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            editedAt: Date | null;
            channelId: string;
            parentMessageId: string | null;
            forwardedFromId: string | null;
            callId: string | null;
            pinnedAt: Date | null;
            pinnedById: string | null;
        };
        task?: undefined;
        skill?: undefined;
        reply?: undefined;
    } | {
        kind: "skill";
        skill: {
            id: string;
            name: string;
        };
        message: {
            authorName: string;
            authorAvatarUrl: string | null;
            attachments: {
                id: string;
                fileName: string;
                contentType: string;
                sizeBytes: number;
                storageKey: string;
                url: string;
            }[];
            reactions: Array<{
                emoji: string;
                count: number;
                reacted: boolean;
            }>;
            id: string;
            createdAt: Date;
            deletedAt: Date | null;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            editedAt: Date | null;
            channelId: string;
            parentMessageId: string | null;
            forwardedFromId: string | null;
            callId: string | null;
            pinnedAt: Date | null;
            pinnedById: string | null;
        };
        reply: {
            id: string;
            createdAt: Date;
            deletedAt: Date | null;
            authorId: string;
            body: string;
            mentions: {
                userId: string;
            }[] | null;
            editedAt: Date | null;
            channelId: string;
            parentMessageId: string | null;
            forwardedFromId: string | null;
            callId: string | null;
            pinnedAt: Date | null;
            pinnedById: string | null;
        };
        task?: undefined;
        reminder?: undefined;
    }>;
    editMessage(messageId: string, userId: string, body: string): Promise<{
        id: string;
        channelId: string;
        authorId: string;
        parentMessageId: string | null;
        forwardedFromId: string | null;
        callId: string | null;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        pinnedById: string | null;
        deletedAt: Date | null;
        createdAt: Date;
    }>;
    /**
     * The edit history of a message (Plan §6.3) — the prior bodies newest-first,
     * plus the message's current body as the live version. Channel-access gated.
     */
    getMessageEdits(messageId: string, userId: string): Promise<{
        messageId: string;
        current: {
            body: string;
            editedAt: Date | null;
        };
        edits: {
            id: string;
            previousBody: string;
            editedAt: Date;
        }[];
    }>;
    setPinned(messageId: string, userId: string, pinned: boolean): Promise<{
        id: string;
        channelId: string;
        authorId: string;
        parentMessageId: string | null;
        forwardedFromId: string | null;
        callId: string | null;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        pinnedById: string | null;
        deletedAt: Date | null;
        createdAt: Date;
    }>;
    listPinned(channelId: string, userId: string): Promise<{
        pinnedByName: string | null;
        id: string;
        channelId: string;
        authorId: string;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        pinnedById: string | null;
        createdAt: Date;
        authorName: string | null;
        authorAvatarUrl: string | null;
    }[]>;
    setSaved(messageId: string, userId: string, saved: boolean, tags?: unknown): Promise<{
        messageId: string;
        saved: true;
        tags: string[];
    } | {
        messageId: string;
        saved: false;
        tags?: undefined;
    }>;
    /**
     * §G11 [15:36] — assign a message to somebody as an action item.
     *
     * "aap us ko ASSIGN bhi kar sakte ho." Deliberately *not* a task: creating a
     * task is a different button that already works, and it moves the work away
     * from the conversation that explains it. This asks one person about one line
     * and leaves both where they are.
     *
     * The assignee must be able to read the channel. Assigning a private
     * conversation to somebody who is not in it would notify them with a body
     * quote and a link they cannot open — a leak with a "you can't see this"
     * screen at the end of it.
     */
    assignMessage(messageId: string, actorId: string, assigneeId: string, dueAt?: string | Date | null): Promise<{
        assigneeName: string;
        assigneeAvatarUrl: string | null;
        id: string;
        createdAt: Date;
        resolvedAt: Date | null;
        assigneeId: string;
        resolvedById: string | null;
        messageId: string;
        assignedById: string | null;
        dueAt: Date | null;
    }>;
    /** Take an assignment back off somebody. Idempotent. */
    unassignMessage(messageId: string, actorId: string, assigneeId: string): Promise<{
        messageId: string;
        assigneeId: string;
        assigned: boolean;
    }>;
    /**
     * Mark an assignment done, or re-open it.
     *
     * Resolving stamps rather than deletes: "I did that" and "that was never
     * mine" are different answers, and an assignment that disappears on
     * completion takes the record of who did it with it. Either the assignee or
     * whoever asked can resolve — the assigner watching it land is as common as
     * the assignee reporting it.
     */
    resolveMessageAssignment(messageId: string, actorId: string, assigneeId: string, resolved: boolean): Promise<{
        id: string;
        messageId: string;
        assigneeId: string;
        assignedById: string | null;
        dueAt: Date | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
        createdAt: Date;
    }>;
    /**
     * Everything still assigned to the caller in this workspace, oldest first.
     *
     * Oldest first on purpose: an action item nobody has picked up in a week is
     * the one worth surfacing, and newest-first buries exactly that row.
     */
    listMyAssignments(workspaceId: string, userId: string): Promise<{
        id: string;
        messageId: string;
        channelId: string;
        channelName: string;
        isDm: boolean;
        body: string;
        authorId: string;
        authorName: string | null;
        assignedById: string | null;
        dueAt: Date | null;
        resolvedAt: Date | null;
        createdAt: Date;
    }[]>;
    /**
     * §G12 [17:13] — follow or mute one thread.
     *
     * Three states, and `null` is one of them: not having said is different from
     * having said "normal", because what "normal" means depends on whether you
     * ever replied. Clearing the row puts you back on the default rather than
     * freezing today's answer to it.
     */
    setThreadFollow(parentMessageId: string, userId: string, state: 'following' | 'muted' | null): Promise<{
        parentMessageId: string;
        state: null;
    } | {
        parentMessageId: string;
        state: "following" | "muted";
    }>;
    /** The caller's stance on one thread: 'following' | 'muted' | null. */
    getThreadFollow(parentMessageId: string, userId: string): Promise<{
        parentMessageId: string;
        state: "following" | "muted";
    }>;
    /**
     * §G11 [15:19] — "Set reminder" on a saved message.
     *
     * The reminder points at the message, so the notification lands you back on
     * the line you wanted to remember rather than on a task invented to hold it.
     */
    remindAboutMessage(messageId: string, userId: string, remindAt: string | Date, note?: string): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        taskId: string | null;
        userId: string;
        messageId: string | null;
        note: string | null;
        remindAt: Date;
        notifiedAt: Date | null;
    }>;
    /** Replace the tags on an already-saved message (Plan §6.7). */
    updateSavedTags(messageId: string, userId: string, tags: unknown): Promise<{
        messageId: string;
        tags: string[];
    }>;
    listSaved(workspaceId: string, userId: string, opts?: {
        tag?: string;
        q?: string;
    }): Promise<{
        id: string;
        channelId: string;
        channelName: string;
        authorId: string;
        body: string;
        mentions: {
            userId: string;
        }[] | null;
        editedAt: Date | null;
        pinnedAt: Date | null;
        createdAt: Date;
        savedAt: Date;
        tags: string[];
        authorName: string | null;
        authorAvatarUrl: string | null;
    }[]>;
    /**
     * Channel ids in a workspace the requester can actually read (Plan §6.8/§6.11).
     * A bulk equivalent of assertChannelAccess used to scope the file library and
     * message search: excludes channels in a private space the user isn't a member
     * of, and private / DM channels they haven't joined. Archived channels are left
     * out so a search hit always deep-links to a channel still shown in the sidebar.
     */
    private accessibleChannelIds;
    /** Escape LIKE wildcards so a user's query is matched literally. */
    private escapeLike;
    /**
     * Translate a coarse file-type filter (Plan §6.8/§6.11) into a content-type
     * ILIKE pattern. 'image' | 'video' | 'audio' → the MIME top-level; 'pdf' → any
     * pdf; anything else is a literal content-type substring. Null means "no type
     * constraint" (empty / any / all).
     */
    private contentTypePattern;
    /**
     * Workspace file library (Plan §6.8): every attachment posted in a channel the
     * user can read, newest first, with a fresh signed download URL. Optional
     * filename search (`q`), coarse content-type filter (`type`) and channel scope
     * (`channelId`, §A3.7 — the panel opens on the channel you're reading).
     * Attachments on unsent drafts (message_id null) or deleted messages are
     * excluded.
     */
    listWorkspaceFiles(workspaceId: string, userId: string, opts?: {
        q?: string;
        type?: string;
        channelId?: string;
    }): Promise<{
        id: string;
        fileName: string;
        contentType: string;
        sizeBytes: number;
        channelId: string;
        channelName: string;
        messageId: string | null;
        uploadedById: string | null;
        uploaderName: string | null;
        createdAt: Date;
        url: string;
    }[]>;
    /**
     * Full message search across the workspace (Plan §6.11). Searches message
     * bodies (thread replies included) in every channel the user can read, with
     * optional channel / sender / date-range / has-file(type) filters. Each hit
     * carries channelId + messageId so the client can deep-link + highlight.
     */
    searchMessages(workspaceId: string, userId: string, opts?: {
        q?: string;
        channelId?: string;
        senderId?: string;
        after?: string;
        before?: string;
        fileType?: string;
    }): Promise<{
        id: string;
        channelId: string;
        channelName: string;
        parentMessageId: string | null;
        authorId: string;
        authorName: string | null;
        body: string;
        createdAt: Date;
    }[]>;
    /** Channel creator or a workspace admin/super_admin may moderate (Plan §6). */
    private canModerateChannel;
    deleteMessage(messageId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    toggleReaction(messageId: string, userId: string, emoji: string): Promise<{
        ok: boolean;
        removed: boolean;
        added?: undefined;
    } | {
        ok: boolean;
        added: boolean;
        removed?: undefined;
    }>;
    ensureGeneralChannel(workspaceId: string, userId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        description: string | null;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        spaceId: string | null;
        topic: string | null;
        isPrivate: boolean;
        isDm: boolean;
    }>;
    /**
     * Fetch Open-Graph / Twitter-card metadata for a pasted link so the client can
     * render an inline preview (Plan §6.3). SSRF-hardened and best-effort: any
     * disallowed URL, timeout, or fetch error resolves to `{}` — we never throw to
     * the client and never surface an internal error. Results (including empty
     * ones, to avoid hammering a bad URL) are cached briefly in memory.
     */
    unfurl(rawUrl: unknown): Promise<UnfurlResult>;
}
