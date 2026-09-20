import { ChatService } from './chat.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class ChatController {
    private chat;
    constructor(chat: ChatService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
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
    create(workspaceId: string, user: CurrentUserPayload, body: {
        name: string;
        description?: string;
        icon?: string;
        isPrivate?: boolean;
        spaceId?: string | null;
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
    listArchived(workspaceId: string, user: CurrentUserPayload): Promise<{
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
    updateChannel(channelId: string, user: CurrentUserPayload, body: {
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
    listChannelGroups(workspaceId: string, user: CurrentUserPayload): Promise<{
        channelIds: string[];
        id: string;
        name: string;
        position: number;
        isCollapsed: boolean;
    }[]>;
    createChannelGroup(workspaceId: string, user: CurrentUserPayload, body: {
        name: string;
    }): Promise<{
        channelIds: string[];
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        position: number;
        userId: string;
        isCollapsed: boolean;
    }>;
    updateChannelGroup(groupId: string, user: CurrentUserPayload, body: {
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
    deleteChannelGroup(groupId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    addChannelToGroup(groupId: string, user: CurrentUserPayload, body: {
        channelId: string;
    }): Promise<{
        ok: boolean;
    }>;
    removeChannelFromGroup(groupId: string, channelId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    archiveChannel(channelId: string, user: CurrentUserPayload): Promise<{
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
    unarchiveChannel(channelId: string, user: CurrentUserPayload): Promise<{
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
    createDm(workspaceId: string, user: CurrentUserPayload, body: {
        peerUserId: string;
    }): Promise<{
        id: string;
    }>;
    createGroupDm(workspaceId: string, user: CurrentUserPayload, body: {
        peerUserIds: string[];
    }): Promise<{
        id: string;
    }>;
    unread(workspaceId: string, user: CurrentUserPayload): Promise<{
        total: number;
        byChannel: Record<string, number>;
    }>;
    getMemberActivity(workspaceId: string, memberUserId: string, user: CurrentUserPayload, limit?: string): Promise<{
        id: string;
        channelId: string;
        channelName: string;
        body: string;
        parentMessageId: string | null;
        createdAt: Date;
    }[]>;
    join(channelId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    leave(channelId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    markRead(channelId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        lastReadAt: Date;
    }>;
    markUnread(channelId: string, user: CurrentUserPayload, body?: {
        messageId?: string;
    }): Promise<{
        ok: boolean;
        lastReadAt: Date | null;
    }>;
    markDelivered(channelId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        lastDeliveredAt: Date;
    }>;
    setNotificationLevel(channelId: string, user: CurrentUserPayload, body: {
        level: string;
    }): Promise<{
        ok: boolean;
        notificationLevel: string;
        level?: undefined;
    } | {
        ok: boolean;
        level: string;
        notificationLevel?: undefined;
    }>;
    channelMembers(channelId: string, user: CurrentUserPayload): Promise<{
        userId: string;
        displayName: string;
        email: string;
        avatarUrl: string | null;
        joinedAt: Date;
    }[]>;
    channelReceipts(channelId: string, user: CurrentUserPayload): Promise<{
        userId: string;
        displayName: string;
        lastReadAt: Date | null;
        lastDeliveredAt: Date | null;
    }[]>;
    unfurl(url?: string): Promise<import("./link-unfurl").UnfurlResult>;
    listCustomEmoji(workspaceId: string, user: CurrentUserPayload): Promise<{
        imageUrl: string;
        id: string;
        shortcode: string;
        createdById: string | null;
    }[]>;
    presignCustomEmoji(workspaceId: string, user: CurrentUserPayload, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    addCustomEmoji(workspaceId: string, user: CurrentUserPayload, body: {
        shortcode: string;
        imageUrl?: string;
        storageKey?: string;
    }): Promise<{
        imageUrl: string;
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        storageKey: string | null;
        shortcode: string;
    }>;
    deleteCustomEmoji(emojiId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    createTaskFromMessage(messageId: string, user: CurrentUserPayload, body: {
        listId: string;
        title?: string;
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
    addChannelMembers(channelId: string, user: CurrentUserPayload, body: {
        userIds: string[];
    }): Promise<{
        ok: boolean;
        added: number;
    }>;
    removeChannelMember(channelId: string, userId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    listMessages(channelId: string, user: CurrentUserPayload, limit?: string, before?: string): Promise<{
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
    post(channelId: string, user: CurrentUserPayload, body: {
        body: string;
        parentMessageId?: string | null;
        mentions?: Array<{
            userId: string;
            offset?: number;
            length?: number;
        }>;
        attachmentIds?: string[];
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
        reactions: {
            emoji: string;
            count: number;
            reacted: boolean;
        }[];
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
    presignAttachment(channelId: string, user: CurrentUserPayload, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    recordAttachment(channelId: string, user: CurrentUserPayload, body: {
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
    edit(messageId: string, user: CurrentUserPayload, body: {
        body: string;
    }): Promise<{
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
    getMessage(messageId: string, user: CurrentUserPayload): Promise<{
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
    getMessageEdits(messageId: string, user: CurrentUserPayload): Promise<{
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
    runCommand(channelId: string, user: CurrentUserPayload, body: {
        command: string;
        text: string;
    }): Promise<{
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
            reactions: {
                emoji: string;
                count: number;
                reacted: boolean;
            }[];
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
            reactions: {
                emoji: string;
                count: number;
                reacted: boolean;
            }[];
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
            reactions: {
                emoji: string;
                count: number;
                reacted: boolean;
            }[];
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
    getThread(messageId: string, user: CurrentUserPayload, limit?: string): Promise<{
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
    remove(messageId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    react(messageId: string, user: CurrentUserPayload, body: {
        emoji: string;
    }): Promise<{
        ok: boolean;
        removed: boolean;
        added?: undefined;
    } | {
        ok: boolean;
        added: boolean;
        removed?: undefined;
    }>;
    listPinned(channelId: string, user: CurrentUserPayload): Promise<{
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
    pin(messageId: string, user: CurrentUserPayload): Promise<{
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
    unpin(messageId: string, user: CurrentUserPayload): Promise<{
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
    listSaved(workspaceId: string, user: CurrentUserPayload, tag?: string, q?: string): Promise<{
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
    listFiles(workspaceId: string, user: CurrentUserPayload, q?: string, type?: string, channelId?: string): Promise<{
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
    search(workspaceId: string, user: CurrentUserPayload, q?: string, channelId?: string, senderId?: string, after?: string, before?: string, fileType?: string): Promise<{
        id: string;
        channelId: string;
        channelName: string;
        parentMessageId: string | null;
        authorId: string;
        authorName: string | null;
        body: string;
        createdAt: Date;
    }[]>;
    save(messageId: string, user: CurrentUserPayload, body?: {
        tags?: string[];
    }): Promise<{
        messageId: string;
        saved: true;
        tags: string[];
    } | {
        messageId: string;
        saved: false;
        tags?: undefined;
    }>;
    unsave(messageId: string, user: CurrentUserPayload): Promise<{
        messageId: string;
        saved: true;
        tags: string[];
    } | {
        messageId: string;
        saved: false;
        tags?: undefined;
    }>;
    updateSavedTags(messageId: string, user: CurrentUserPayload, body: {
        tags?: string[];
    }): Promise<{
        messageId: string;
        tags: string[];
    }>;
    assign(messageId: string, user: CurrentUserPayload, body: {
        assigneeId: string;
        dueAt?: string | null;
    }): Promise<{
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
    unassign(messageId: string, assigneeId: string, user: CurrentUserPayload): Promise<{
        messageId: string;
        assigneeId: string;
        assigned: boolean;
    }>;
    /** Mark an assignment done, or re-open it. */
    resolveAssignment(messageId: string, assigneeId: string, user: CurrentUserPayload, body: {
        resolved?: boolean;
    }): Promise<{
        id: string;
        messageId: string;
        assigneeId: string;
        assignedById: string | null;
        dueAt: Date | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
        createdAt: Date;
    }>;
    /** Everything still assigned to the caller across this workspace. */
    assignedToMe(workspaceId: string, user: CurrentUserPayload): Promise<{
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
    getThreadFollow(messageId: string, user: CurrentUserPayload): Promise<{
        parentMessageId: string;
        state: "following" | "muted";
    }>;
    setThreadFollow(messageId: string, user: CurrentUserPayload, body: {
        state: 'following' | 'muted' | null;
    }): Promise<{
        parentMessageId: string;
        state: null;
    } | {
        parentMessageId: string;
        state: "following" | "muted";
    }>;
    remind(messageId: string, user: CurrentUserPayload, body: {
        remindAt: string;
        note?: string;
    }): Promise<{
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
}
