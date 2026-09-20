import { TasksService } from './tasks.service';
import { CreateCommentDto } from './dto/comment.dto';
import type { CurrentUserPayload } from './types';
export declare class TaskCommentsController {
    private tasks;
    constructor(tasks: TasksService);
    list(taskId: string, user: CurrentUserPayload): Promise<{
        id: string;
        createdAt: Date;
        taskId: string;
        authorId: string;
        assignedToUserId: string | null;
        resolvedByUserId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        editedAt: Date | null;
        author: {
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
        assignee: {
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
        resolver: {
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
        reactions: {
            id: string;
            createdAt: Date;
            commentId: string;
            userId: string;
            emoji: string;
        }[];
    }[] | {
        attachments: Record<string, unknown>[];
        savedByMe: boolean;
        id: string;
    }[]>;
    /**
     * §V2-05, frame `04:00` — the @ picker's people, each flagged with whether
     * they can actually open this task.
     *
     * It hangs off the comments controller because that is the guard it needs:
     * `ResourceMemberGuard` resolves `:taskId` and refuses anyone who cannot
     * reach the task themselves, so a person cannot use this to learn the
     * membership of a task they have no business seeing.
     */
    mentionCandidates(taskId: string): Promise<{
        userId: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        hasAccess: boolean;
    }[]>;
    create(taskId: string, user: CurrentUserPayload, body: CreateCommentDto): Promise<{
        id: string;
        createdAt: Date;
        taskId: string;
        authorId: string;
        assignedToUserId: string | null;
        resolvedByUserId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        editedAt: Date | null;
        author: {
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
        assignee: {
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
        resolver: {
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
        reactions: {
            id: string;
            createdAt: Date;
            commentId: string;
            userId: string;
            emoji: string;
        }[];
    } | undefined>;
    update(commentId: string, user: CurrentUserPayload, body: {
        body: string;
    }): Promise<{
        id: string;
        taskId: string;
        authorId: string;
        assignedToUserId: string | null;
        resolvedByUserId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        editedAt: Date | null;
        createdAt: Date;
    }>;
    delete(commentId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    toggleReaction(commentId: string, user: CurrentUserPayload, body: {
        emoji: string;
    }): Promise<{
        removed: boolean;
        added?: undefined;
        reaction?: undefined;
    } | {
        added: boolean;
        reaction: {
            id: string;
            createdAt: Date;
            commentId: string;
            userId: string;
            emoji: string;
        };
        removed?: undefined;
    }>;
    assign(commentId: string, user: CurrentUserPayload, body: {
        userId: string | null;
    }): Promise<{
        id: string;
        taskId: string;
        authorId: string;
        assignedToUserId: string | null;
        resolvedByUserId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        editedAt: Date | null;
        createdAt: Date;
    }>;
    resolve(commentId: string, user: CurrentUserPayload, body: {
        resolved: boolean;
    }): Promise<{
        id: string;
        taskId: string;
        authorId: string;
        assignedToUserId: string | null;
        resolvedByUserId: string | null;
        resolvedAt: Date | null;
        parentCommentId: string | null;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        editedAt: Date | null;
        createdAt: Date;
    }>;
    /**
     * §V2-S06 frame `05:55` — save a comment for later. Mirrors chat's
     * `POST /chat/messages/:messageId/save` down to the shape of the response, so
     * the two saves in the product are the same thing twice and not two things.
     */
    save(taskId: string, commentId: string, user: CurrentUserPayload): Promise<{
        commentId: string;
        saved: boolean;
    }>;
    unsave(taskId: string, commentId: string, user: CurrentUserPayload): Promise<{
        commentId: string;
        saved: boolean;
    }>;
}
/**
 * The workspace-wide read of §V2-S06's saves, for the Inbox's Later tab.
 *
 * A separate controller because it needs a different guard: `ResourceMemberGuard`
 * above resolves `:taskId`, and this route has no task — it is "everything I
 * saved in this workspace". Membership of the workspace is the gate; the
 * service re-checks per-task visibility on top, because being able to open a
 * workspace is not being able to read every private Space in it.
 */
export declare class SavedCommentsController {
    private tasks;
    constructor(tasks: TasksService);
    listSaved(workspaceId: string, user: CurrentUserPayload): Promise<{
        url: string;
        id: string;
        body: string;
        mentions: {
            userId: string;
            offset: number;
            length: number;
        }[] | null;
        createdAt: Date;
        savedAt: Date;
        taskId: string;
        taskTitle: string;
        listId: string;
        projectId: string;
        spaceId: string;
        authorId: string;
        authorName: string | null;
        authorAvatarUrl: string | null;
    }[]>;
}
