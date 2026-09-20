import type { Db } from '@rundesk/db';
import { type DateFormat, type TimeFormat } from '../../common/export/datetime';
/** `[10:57]` "CSV chahiye, Excel chahiye" — frame `10:58` shows exactly these two. */
export type ExportFormat = 'csv' | 'xlsx';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SearchService } from '../search/search.service';
import { AutomationsService } from '../automations/automations.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SlackService } from '../integrations/slack/slack.service';
import { NotificationsService } from '../notifications/notifications.service';
import { R2Service } from '../../common/storage/r2.service';
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service';
import { SecurityService } from '../security/security.service';
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
type TaskStatus = string;
/**
 * §A2.8 — render a status/priority key for a notification body. Status keys are
 * per-list slugs (`in_review`), so there is no catalogue to look them up in;
 * de-slugging is what the rest of the product does with them too.
 */
export declare function humanizeFieldValue(value: string): string;
type DependencyType = 'blocks' | 'blocked_by' | 'related_to';
/** Hard cap on a single task/comment attachment (Plan §4). */
export declare const MAX_ATTACHMENT_BYTES: number;
type RecurrenceRule = {
    mode: 'daily' | 'weekly' | 'monthly';
    interval?: number;
    weekdays?: number[];
    dayOfMonth?: number;
    skipWeekends?: boolean;
};
export declare class TasksService {
    private db;
    private realtime;
    private search;
    private automations;
    private webhooks;
    private slack;
    private notifications;
    private r2;
    private calendarSync;
    private security;
    constructor(db: Db, realtime: RealtimeGateway, search: SearchService, automations: AutomationsService, webhooks: WebhooksService, slack: SlackService, notifications: NotificationsService, r2: R2Service, calendarSync: CalendarSyncService, security: SecurityService);
    /**
     * Best-effort push of a task to every connected calendar in its workspace.
     * Swallowed errors keep task writes fast; failures surface via the
     * connection's status field on the next sync poll.
     */
    private fireCalendarPush;
    /**
     * Best-effort fan-out of a task event to automations + webhooks.
     * Errors are logged but never propagated — task ops must not break
     * because a webhook URL is down.
     */
    private fireTaskEvent;
    private formatSlackMessage;
    private resolveWorkspaceForList;
    /**
     * §V2-13 — the workspace a list belongs to, for callers outside this service.
     *
     * The paywall is enforced in the controller (where PlansService is injected,
     * so the ten unit tests that construct this service positionally keep
     * working), and a plan is a property of the WORKSPACE, not of the list. This
     * is the one fact the controller is missing.
     */
    workspaceIdForList(listId: string): Promise<string | null>;
    private resolveWorkspaceName;
    private buildTaskUrl;
    /**
     * G10-11 [12:38–12:41] — a subtask appeared under a task you are on.
     *
     * The audience is the PARENT's watchers and assignees, which is the only
     * honest one available: her list pairs this with "Task created", which fires
     * to people following a List, and there is no list-follow concept here. So
     * this ships and that one waits, rather than adding a notification kind with
     * nothing behind it.
     *
     * Off by default (see DEFAULT_PRIMARY_TYPES) — worth being able to turn on,
     * not worth interrupting anybody who did not ask.
     */
    private notifySubtaskCreated;
    private notifyTaskUpdate;
    /**
     * §4.4 — notify a task's assignees + watchers (minus the actor) when a newly
     * added blocking dependency leaves it blocked. Best-effort: swallows errors so
     * a notification failure never breaks the dependency write.
     */
    private notifyTaskBlocked;
    private indexTaskInSearch;
    private indexAttachmentInSearch;
    private extractMentionIds;
    private logActivity;
    /**
     * A task in the bin is not an editable task.
     *
     * Found by the third video1 pass, which deleted a task and then kept writing
     * to it: `PATCH /tasks/:id` answered 200 and `POST /tasks/:id/comments`
     * answered 201, on a row that no list, no search and no deep link would show
     * you. Deleting is a soft delete — `isArchived` — and every *read* path
     * filtered on it. The write paths never did.
     *
     * The exposure was never a UI one: nothing in the app can reach a binned
     * task, so this is a stale tab, a queued request, a script, an integration
     * holding an id from before the delete. That is exactly the population that
     * cannot see the bin, which is what makes silence the wrong answer — the
     * edit appears to succeed, and then the row is purged out from under it
     * thirty days later along with whatever was written.
     *
     * 409 rather than 404: the task is really there and the caller may well be
     * entitled to it. What is wrong is its state, and "restore it first" is a
     * thing they can actually do.
     */
    private assertNotInBin;
    private getListIdOrThrow;
    /**
     * @param opts.allowArchived — for the two operations whose whole purpose is a
     *   task already in the bin. Everything else is refused; see assertNotInBin.
     */
    private assertTaskWriteAccess;
    /**
     * Read-access gate for a task. Unlike assertTaskWriteAccess this does NOT
     * require the caller to be a creator/assignee: ANY workspace member who can
     * reach the task's container may view it (comment-/view-only roles and guests
     * included), matching how the GET routes are authorized by ResourceMemberGuard
     * (workspace membership + `checkContainerAccess`). It still blocks
     * cross-workspace / non-member callers and outsiders to a private space or
     * project. Used by read paths that hand back sensitive data (e.g. signed R2
     * attachment URLs) as a service-layer defense-in-depth behind the route guard.
     */
    private assertTaskReadAccess;
    /**
     * §3.3 Delete Items — a workspace `manager` (not workspace_admin/super_admin)
     * may only archive/delete a task whose Space they belong to (space_members).
     * Admins & super_admins keep delete-any; plain members are already limited to
     * their own tasks by assertTaskWriteAccess. This is deliberately scoped to the
     * DELETE path (it does NOT loosen or touch assertTaskWriteAccess's other
     * callers) so a manager's non-delete writes stay unrestricted.
     */
    private assertManagerDeleteScope;
    private sanitizeFileName;
    /**
     * §4.5 — enforce the declared attachment size on the presign/create paths.
     * A valid, positive `sizeBytes` is now MANDATORY: reject when it is missing,
     * non-finite, ≤ 0, or over the hard cap. This turns the client-declared size
     * into a real gate instead of an advisory value that silently stored 0.
     *
     * NOTE: R2 presigned PUT URLs (see R2Service.presignPutObject) sign only the
     * object key + content-type — they cannot express a content-length-range
     * condition the way a presigned POST policy can. Byte-exact enforcement of the
     * *actual* uploaded bytes therefore requires a storage-side upload policy;
     * until that exists this declared-size gate is the mandatory guard.
     */
    private assertAttachmentSize;
    private clampRecurrenceInterval;
    private shiftByRecurrenceRule;
    getOpenBlockers(taskId: string): Promise<{
        id: string;
        status: string;
        title: string;
    }[]>;
    private hasBlockingPath;
    createAttachmentUploadUrl(taskId: string, actorId: string, body: {
        fileName: string;
        contentType: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    /** Docs linked to a task, most-recent first. Requires task read access. */
    listLinkedDocs(taskId: string, userId: string): Promise<{
        id: string;
        docId: string;
        title: string;
        icon: string | null;
        isArchived: boolean;
        linkedAt: Date;
    }[]>;
    /** Link a doc to a task. Both must live in the same workspace. */
    linkDoc(taskId: string, docId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        taskId: string;
        docId: string;
    }>;
    /** Remove a task↔doc link. */
    unlinkDoc(taskId: string, docId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /** External links attached to a task, most-recent first. Requires task access. */
    listExternalLinks(taskId: string, userId: string): Promise<{
        id: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        commentId: string | null;
        createdAt: Date;
    }[]>;
    /**
     * §12.6 — external links attached to one specific comment on a task
     * (e.g. Dropbox files shared in a comment), most-recent first. Requires task
     * access. Task-level links (comment_id null) are excluded.
     */
    listExternalLinksForComment(taskId: string, commentId: string, userId: string): Promise<{
        id: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        commentId: string | null;
        createdAt: Date;
    }[]>;
    /** Link an external URL (GitHub/GitLab commit·PR·issue, Drive file, or plain link). */
    addExternalLink(taskId: string, userId: string, input: {
        url: string;
        provider?: string;
        commentId?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        title: string | null;
        status: string | null;
        taskId: string;
        commentId: string | null;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        metadata: Record<string, unknown> | null;
    }>;
    /** Re-fetch live state for one link (env-gated behind the provider connection). */
    refreshExternalLink(taskId: string, linkId: string, userId: string): Promise<{
        id: string;
        taskId: string;
        commentId: string | null;
        workspaceId: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        createdById: string | null;
        createdAt: Date;
    }>;
    /** Remove a task↔external link. */
    removeExternalLink(taskId: string, linkId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Read-only reuse of `integration-connections`: the stored OAuth token for a
     * provider in a workspace, or null when the provider isn't connected. Kept
     * minimal (single token lookup) rather than pulling in the whole service.
     */
    private getProviderToken;
    /**
     * Env-gated live provider fetch. Returns the fields to persist (status/title/
     * metadata) or null when the provider isn't connected, the kind is
     * un-fetchable, or the remote call fails — so linking always degrades to a
     * plain "linked" badge instead of erroring.
     */
    private fetchProviderState;
    private fetchGithubState;
    /**
     * Hosts the GitLab refresh may send the workspace OAuth token to: gitlab.com
     * plus any operator-approved self-hosted hosts from GITLAB_ALLOWED_HOSTS
     * (comma-separated, default none). Read per-call so operators can change the
     * allowlist without a code change; lowercased for case-insensitive matching.
     */
    private gitlabAllowedHosts;
    private fetchGitlabState;
    private fetchDriveFile;
    private fetchDropboxFile;
    /** Create a Zoom or Google Meet meeting for a task and store the join link. */
    createTaskMeeting(taskId: string, userId: string, provider: 'zoom' | 'google_meet'): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        title: string | null;
        status: string | null;
        taskId: string;
        commentId: string | null;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        metadata: Record<string, unknown> | null;
    }>;
    /** Attach a post-meeting recording link to an existing meeting link. */
    attachMeetingRecording(taskId: string, linkId: string, userId: string, url: string): Promise<{
        id: string;
        taskId: string;
        commentId: string | null;
        workspaceId: string;
        provider: string;
        kind: string;
        url: string;
        externalId: string | null;
        title: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        createdById: string | null;
        createdAt: Date;
    }>;
    /**
     * Load a connected integration connection (with tokens) for a provider, or
     * null when the provider isn't connected / has no stored access token.
     */
    private loadIntegrationConnection;
    private createZoomMeeting;
    private createGoogleMeet;
    /**
     * Return a usable access token for a meeting-provider connection, refreshing
     * via the refresh_token grant when expired/near-expiry (60s buffer). Zoom
     * authenticates the refresh via HTTP Basic; Google via body params. Failures
     * fall back to the stored token so a flaky refresh doesn't block creation.
     */
    private ensureMeetingToken;
    /**
     * Resolve a status key against the list's `list_statuses` rows and return
     * the canonical key + category bucket. Falls back to the list's first
     * "open" status if no key is provided and to the very first status if
     * none are marked open. Throws BadRequest if the caller passed a key
     * that isn't defined for the list.
     */
    /**
     * The workspace's nominated default task type, if it has one. Returns null
     * when types are not in use, which is the state every existing workspace
     * starts in — so this stays a no-op until someone opts in.
     */
    /**
     * Is this type one the list's own workspace defines?
     *
     * The PATCH path has always checked (task-types.service.ts:169 —
     * `byId(workspaceId, typeId)`), but when taskTypeId was opened up on create
     * it was passed straight through, so a caller could type a task with an id
     * belonging to somebody else's workspace. Same question, asked the same way,
     * on both paths.
     */
    private taskTypeBelongsToList;
    /**
     * §1.1 — does this type make its tasks milestones?
     *
     * tasks.isMilestone is what the timeline, list badges, subtask rows and the
     * client portal all render from, and the type is what a person now sets. This
     * is the one question that keeps the two from contradicting each other.
     */
    private typeIsMilestone;
    /** The milestone type of the workspace this list belongs to, if it has one. */
    private milestoneTypeForList;
    private defaultTaskTypeForList;
    private resolveStatusForList;
    /** Guests may view/comment but not create tasks (Plan §3.3). */
    private assertNotGuestInList;
    createTask(data: {
        listId: string;
        title: string;
        description?: string;
        priority?: TaskPriority;
        status?: TaskStatus;
        position?: number;
        startDate?: Date;
        dueDate?: Date;
        timeEstimate?: number;
        parentTaskId?: string;
        assigneeIds?: string[];
        labelIds?: string[];
        isMilestone?: boolean;
        taskTypeId?: string | null;
        createdById: string;
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
    /**
     * All tasks across the workspace that have a start or due date — used by
     * the Gantt / timeline view. Returns shape suitable for direct render.
     */
    getTimelineForWorkspace(workspaceId: string, opts?: {
        from?: Date;
        to?: Date;
        projectId?: string;
        actor?: {
            id: string;
            role?: string;
        };
    }): Promise<{
        id: string;
        title: string;
        startDate: Date | null;
        dueDate: Date | null;
        status: string;
        priority: "urgent" | "high" | "normal" | "low";
        isMilestone: boolean;
        listId: string;
        listName: string;
        projectId: string;
        projectName: string;
        spaceId: string;
        spaceName: string;
    }[]>;
    getTasksForMember(workspaceId: string, userId: string): Promise<{
        id: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        priority: "urgent" | "high" | "normal" | "low";
        dueDate: Date | null;
        updatedAt: Date;
        listId: string;
        listName: string;
        projectId: string;
        projectName: string;
        spaceId: string;
        spaceName: string;
    }[]>;
    /**
     * Flat list of every task in a workspace with denormalised
     * space/project/list context. Used by the dashboard, timeline, and
     * any other view that previously had to fan out
     * spaces → projects → lists → tasks (N+1+N+M+L+T HTTP requests).
     *
     * Returns up to `limit` rows ordered by updatedAt desc. When
     * `includeAssignees` is true (default true), each row carries a
     * compact `assignees` array — fetched in one extra batched query
     * keyed on the returned task ids — so the client can filter
     * "tasks assigned to me" without another round trip.
     */
    /**
     * Filter denormalised workspace-task rows down to those the actor may see,
     * enforcing private-container membership. Mirrors `checkContainerAccess`'s rule
     * but batched (two membership queries, not one per row): a manager-tier actor
     * (or super_admin) sees everything; a private space requires space membership;
     * an explicitly-private project requires project membership or admin of the
     * owning space. Rows must carry spaceId/spaceVisibility/projectId/projectVisibility.
     */
    private filterTasksByContainerAccess;
    getTasksForWorkspace(workspaceId: string, limit?: number, opts?: {
        includeAssignees?: boolean;
        actorId?: string;
        actorRole?: string;
        /**
         * Narrow to one person's tasks IN SQL, before the limit.
         *
         * The dashboard used to ask for 500 workspace rows and then keep the
         * viewer's in JavaScript. Those 500 are everyone's, ordered by
         * `updatedAt desc`, so in a busy workspace one person's slice of them is
         * a handful of rows or none — and overdue work is hit hardest, because a
         * task is overdue precisely when nobody has touched it, which is what
         * sorts it out of a recently-updated window. The card then reported
         * "Overdue: 0" as a fact.
         */
        assigneeId?: string;
    }): Promise<{
        assignees: {
            userId: string;
            displayName: string | null;
            avatarUrl: string | null;
        }[];
        id: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        priority: "urgent" | "high" | "normal" | "low";
        isMilestone: boolean;
        listId: string;
        listName: string;
        projectId: string;
        projectName: string;
        spaceId: string;
        spaceName: string;
        startDate: Date | null;
        dueDate: Date | null;
        completedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /** §2 per-item task-visibility WHERE fragment for reads scoped to one list.
     *  undefined = no restriction (manager, or internal/system call). */
    private taskVisibilityFilterForList;
    /** §2 per-item task-visibility WHERE fragment for workspace-wide task reads. */
    private taskVisibilityFilterForWorkspace;
    getTasksByList(listId: string, opts?: {
        includeSubtasks?: boolean;
        includeArchived?: boolean;
    }, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        labels: {
            id: string;
            workspaceId: string;
            name: string;
            color: string;
            createdAt: Date;
        }[];
        openBlockerCount: number;
        blocksOpenCount: number;
        blockedBy: string[];
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
        taskType: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            workspaceId: string;
            color: string | null;
            icon: string | null;
            position: number;
            isMilestone: boolean;
            isDefault: boolean;
            origin: string | null;
        } | null;
    }[]>;
    listSubtasks(taskId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        assignees: {
            userId: string;
            displayName: string | null;
            email: string | null;
        }[];
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
    }[]>;
    /**
     * §V2-07 — download the list you are looking at.
     *
     * `[10:53]`–`[11:09]` "Customize pe aap click karoge — ab yeh dekh rahe ho:
     * EXPORT VIEW … aur aap is ko download kar lo … woh aap ko COLUMN mein list
     * de dega, har cheez." Frame `10:57` shows the panel: a file format, a "What
     * to export" choice of Visible columns / Task Names only / All columns, and
     * Download.
     *
     * What existed was `GET /export/csv/tasks`: the WHOLE WORKSPACE, seven fixed
     * columns, behind `WorkspaceAdminGuard`. A member standing on a list could
     * not download it at all, and an admin who did got every task in every list
     * regardless of the view, its filters, or its sort.
     *
     * Built on `getTasksByList` rather than its own query, deliberately: the
     * export is then the same read the list itself performs, including the
     * per-item visibility filter. A separate query would be free to drift, and
     * the way it would drift is by exporting rows the person cannot see on
     * screen.
     *
     * `includeArchived` and `includeClosed` are here for the same reason. The
     * toolbar has an "Archived" filter and a "Closed" toggle (`[11:32]`, `[11:37]`),
     * and an export that ignored them would hand back a different set of rows
     * than the screen it was launched from — which is the one thing this endpoint
     * exists not to do.
     */
    exportListView(listId: string, actor: {
        id: string;
        role?: string;
    }, opts?: {
        columns?: 'names' | 'visible' | 'all';
        fields?: string[];
        includeSubtasks?: boolean;
        includeArchived?: boolean;
        includeClosed?: boolean;
        format?: ExportFormat;
        dateFormat?: DateFormat;
        timeFormat?: TimeFormat;
        /**
         * §V2-07 / §V2-13 `[10:42]`–`[10:49]` — WHICH view is being downloaded.
         *
         * `'board'` is a different artifact, not the same rows with a different
         * name on the button: the sheet leads with the board column each task is
         * sitting in and the rows come out column by column, which is what makes
         * "board view download" worth having and worth paying for. `'list'` (the
         * default, and anything unrecognised) is the free export that has always
         * been here and must keep working untouched.
         */
        view?: 'list' | 'board';
    }): Promise<{
        name: string;
        count: number;
        format: ExportFormat;
        extension: string;
        contentType: string;
        body: string | Buffer<ArrayBufferLike>;
    }>;
    /**
     * §V2-13, frame `09:26` — TEAM VIEW's rollup, computed on the SERVER.
     *
     *   `[09:26]` "Is ke baad TEAM VIEW — yeh cheez ke liye humein of course BUY
     *   karna parega."
     *
     * This exists so the paywall is a paywall. Team View used to be arithmetic
     * the browser did over rows it already had, which means every possible gate
     * on it was a gate on a `<div>` — switch the flag off in devtools and the
     * feature is back. A blocked workspace now gets a 403 from here and there is
     * nothing on the client to un-hide.
     *
     * A task with several assignees is on EACH of their plates, so the rows
     * deliberately do not sum to the list: the question a workload board answers
     * is "what is on this person's plate", and shared work is on both.
     */
    getTeamRollup(listId: string, actor: {
        id: string;
        role?: string;
    }, opts?: {
        includeArchived?: boolean;
        unassignedLabel?: string;
    }): Promise<{
        id: string;
        name: string;
        done: number;
        total: number;
        pct: number;
        tasks: {
            id: string;
            title: string;
        }[];
    }[]>;
    getTask(taskId: string): Promise<{
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
    listAttachments(taskId: string, actorId: string): Promise<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedBy: string | null;
        createdAt: Date;
        storageKey: string;
        url: string;
    }[]>;
    addAttachment(taskId: string, actorId: string, data: {
        fileName: string;
        url?: string;
        storageKey?: string;
        contentType?: string;
        sizeBytes?: number;
    }): Promise<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedBy: string | null;
        createdAt: Date;
        storageKey: string;
        url: string;
    }>;
    removeAttachment(taskId: string, attachmentId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    updateTask(taskId: string, actorId: string, patch: Partial<{
        title: string;
        description: string | null;
        priority: TaskPriority;
        status: TaskStatus;
        startDate: Date | null;
        dueDate: Date | null;
        position: number;
        timeEstimate: number | null;
        coverColor: string | null;
        coverStorageKey: string | null;
        coverImageUrl: string | null;
        coverOffsetY: number;
        isArchived: boolean;
        isMilestone: boolean;
        visibility: 'public' | 'private';
        parentTaskId: string | null;
    }>): Promise<{
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
    bulkUpdateTasks(taskIds: string[], actorId: string, patch: Partial<{
        priority: TaskPriority;
        status: TaskStatus;
        startDate: Date | null;
        dueDate: Date | null;
        timeEstimate: number | null;
        isArchived: boolean;
        listId: string;
        assigneeIdsAdd: string[];
        assigneeIdsRemove: string[];
        labelIdsAdd: string[];
        labelIdsRemove: string[];
        dependenciesAdd: Array<{
            relatedTaskId: string;
            type: DependencyType;
        }>;
        dependenciesRemove: Array<{
            relatedTaskId: string;
            type: DependencyType;
        }>;
    }>): Promise<{
        requested: number;
        updatedCount: number;
        failedCount: number;
        updated: ({
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
        } | null)[];
        failed: {
            taskId: string;
            reason: string;
        }[];
    }>;
    /**
     * Persist (or clear) a task's recurrence config. Once set, completing the
     * task auto-creates the next occurrence (see updateTask). Pass null to stop
     * the task recurring.
     */
    setRecurrence(taskId: string, actorId: string, config: {
        cadenceDays?: number | null;
        rule?: RecurrenceRule | null;
    } | null): Promise<{
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
    }>;
    createNextRecurringOccurrence(taskId: string, actorId: string, cadenceDays: number | null, recurrenceRule?: RecurrenceRule | null, preserveAssignees?: boolean): Promise<{
        sourceTaskId: string;
        nextTaskId: string;
        cadenceDays: number | null;
        recurrenceRule: RecurrenceRule | null;
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
        };
    }>;
    /**
     * ARCHIVE. The name is `deleteTask` and the route is `DELETE /tasks/:id`
     * because that is what they have always been; what the method does is archive
     * — `isArchived`, `archivedAt`, activity `archived`, listed under
     * `GET /workspaces/:id/archived-tasks`, restored by `POST /tasks/:id/restore`,
     * and kept for good. The frame's other row, Delete, is `binTask` below.
     */
    deleteTask(taskId: string, actorId: string, ipAddress?: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §V2-08 frame `15:32` — **DELETE**, the red row under Archive.
     *
     * Not `deleteTask` with a different label. `deleteTask` archives: the task
     * keeps living under Settings → Archived tasks, for good, and nothing ever
     * removes it. This puts the task in the workspace **Trash**, the same surface
     * that already holds deleted spaces, folders, projects, lists and docs, where
     * it can be restored for `TRASH_RETENTION_DAYS` and is then hard-deleted by
     * the same nightly purge — or at once with "Delete forever".
     *
     * The two states are told apart by `deletedAt` and nothing else: the Trash
     * selects tasks on `deletedAt IS NOT NULL`, so archiving can never put a task
     * there and can never get one purged.
     *
     * `isArchived` goes true for both, deliberately. Every read path in the
     * product — lists, search, reports, planner, AI, calendar sync — hides a task
     * on that one flag, so a delete that left it false would take the task out of
     * nothing. What stays empty here is `archivedAt`/`archivedById`: those belong
     * to the other action, and the Trash's "Deleted by" column reads
     * `deletedById`, so filling both would make one deletion look like two.
     */
    binTask(taskId: string, actorId: string, ipAddress?: string): Promise<{
        ok: boolean;
        deletedAt: string;
        retentionDays: number;
    }>;
    /** Restore an archived (soft-deleted) task (Plan §13.4). */
    restoreTask(taskId: string, actorId: string): Promise<{
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
    }>;
    moveTask(taskId: string, actorId: string, targetListId: string, position: number): Promise<{
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
    addAssignee(taskId: string, userId: string, actorId: string): Promise<{
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
    /**
     * §G10-6 [12:21] — watchers learn WHO a task moved to, or off.
     *
     * `notifyTaskUpdate` covers status, priority, due date, title and
     * description, and never had an assignee branch — so the single most
     * consequential change on a task, the one that decides whose problem it is,
     * was the one nobody watching was told about. Being assigned notified you;
     * being removed notified you; everybody else found out by noticing.
     *
     * Deliberately NOT folded into `notifyTaskUpdate`: that reads a `before`
     * snapshot of scalar columns, and assignees are rows in another table. Wiring
     * them through it would mean loading assignees on every patch that touches a
     * title.
     *
     * The assignee and the actor are both excluded — each already has a
     * notification of their own, and two for one event reads as a bug.
     */
    private notifyWatchersOfAssigneeChange;
    removeAssignee(taskId: string, userId: string, actorId: string): Promise<{
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
    addLabel(taskId: string, labelId: string, actorId: string): Promise<{
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
    removeLabel(taskId: string, labelId: string, actorId: string): Promise<{
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
    addWatcher(taskId: string, userId: string, actorId?: string): Promise<{
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
    /** §2.2 — tell a task's assignees that its follower list moved. */
    private notifyFollowerChanged;
    removeWatcher(taskId: string, userId: string, actorId?: string): Promise<{
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
    /**
     * §V2-05, frame `04:00` — who can be @-mentioned on this task, and who would
     * be notified about something they cannot open.
     *
     * The workspace's members, each carrying `hasAccess`. The rule is evaluated by
     * `canReachTask`, which mirrors `ResourceMemberGuard` step for step; the
     * memberships it needs are fetched here once as sets rather than once per
     * candidate, so a fifty-person workspace costs a handful of queries and not a
     * hundred.
     *
     * `hasAccess` is only ever FALSE for a real reason, never as a default: a
     * picker that greys people out when it is merely unsure teaches everyone to
     * ignore the warning, which loses the one case it was built for.
     */
    listMentionCandidates(taskId: string): Promise<{
        userId: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        hasAccess: boolean;
    }[]>;
    /**
     * §V2-08 — merge this task into another one.
     *
     * The task named by `taskId` is the one being merged AWAY; `targetTaskId`
     * survives. See `task-merge.ts` for which tables move and which deliberately
     * do not.
     *
     * NOT WRAPPED IN A TRANSACTION, and that is a compromise worth naming. The
     * moves are `UPDATE ... SET task_id` statements against a dozen tables; a
     * failure part-way leaves work split across two tasks, both of which are
     * still readable and neither of which has lost anything, because nothing is
     * deleted here. The source is binned LAST, so a failure before that leaves a
     * merge that can simply be run again. If this file ever gains a delete, it
     * gains a transaction on the same commit.
     *
     * Every move is counted and returned. A merge that reports what it moved is a
     * merge somebody can check; `{ ok: true }` is a merge you have to take on
     * faith, and this is the operation where faith is least warranted.
     */
    mergeTask(taskId: string, targetTaskId: string, actorId: string): Promise<{
        ok: boolean;
        targetTaskId: string;
        moved: import("./task-merge").MergeMoved;
    }>;
    /**
     * Move rows one at a time, dropping any the target already has.
     *
     * Every join table here is unique on (task, something), so a bulk UPDATE
     * throws as soon as the two tasks share a label or an assignee — which is
     * the normal case for duplicates, not an edge case. Dropping rather than
     * failing is right because the row carried nothing the target lacks.
     */
    private moveOrDrop;
    /**
     * Dependencies, in both directions, without creating self-links.
     *
     * A dependency row names two tasks, and the merged task can be on either
     * side. Rewriting it blindly turns "A blocks B" into "B blocks B" when B is
     * the survivor. Those rows are dropped: a task cannot block itself, and a
     * reader that finds one has to invent a meaning for it.
     */
    private moveDependencies;
    /**
     * §V2-08 — keep what the description said until now.
     *
     * COALESCED, so a person tidying a paragraph does not leave eight rows. If
     * the same editor already replaced this description inside the window, the
     * row they wrote is the OLDER text and therefore the better one — so this
     * does nothing rather than overwriting it. `doc_revisions` overwrites in the
     * same situation, which is right for it: it stores the NEW text, where newer
     * is better. Here newer is worse.
     */
    private recordDescriptionRevision;
    /**
     * What this description used to say, newest first.
     *
     * The task's CURRENT description is deliberately not in here — it is on the
     * task, and listing it as a revision would offer somebody a "restore" that
     * changes nothing.
     */
    listDescriptionRevisions(taskId: string): Promise<{
        id: string;
        description: string | null;
        taskId: string;
        editorId: string | null;
        replacedAt: Date;
        editor: {
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
    }[]>;
    /**
     * Put an old description back.
     *
     * Routed through `updateTask` rather than writing the column directly, so
     * restoring is itself an edit: it records what the description said before
     * the restore, fires the same activity and realtime events, and can be undone
     * by restoring again. A restore that bypassed all that would be the one
     * description change in the product with no history — in the history feature.
     */
    restoreDescriptionRevision(taskId: string, revisionId: string, actorId: string): Promise<{
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
    /**
     * `viewerId` is only for the per-person bits of a comment — right now that is
     * §V2-S06's `savedByMe`. It is optional so the handful of internal callers
     * that just want the bodies keep working; a missing viewer means "nobody has
     * saved anything", never "everything is saved".
     */
    listComments(taskId: string, viewerId?: string): Promise<{
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
     * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
     *
     * A private bookmark on somebody else's sentence. Deliberately NOT gated on
     * `assertTaskWriteAccess` the way resolve and assign are: saving is a reading
     * act, and a viewer who can open the task can put one of its comments aside.
     * `assertTaskReadAccess` is the gate, and it is the same one the task itself
     * uses — one implementation, not a second copy of the visibility rules.
     *
     * THE COMMENT IS CHECKED AGAINST THE TASK IN THE PATH. A comment id is not a
     * capability: without this, `/tasks/<a task I can read>/comments/<a comment
     * on a task I cannot>/save` would sail past the route guard.
     */
    setCommentSaved(taskId: string, commentId: string, userId: string, saved: boolean): Promise<{
        commentId: string;
        saved: boolean;
    }>;
    /**
     * The saved comments the Inbox's Later tab lists, newest save first.
     *
     * Where they surface is not a free choice: §2.2 already put saved chat
     * messages in Later ("Later mein SAVED messages show hote hain"), and
     * ClickUp's own answer for a saved comment is the same tab. So this is the
     * second section of a bucket that already exists rather than a new panel.
     *
     * ACCESS IS RE-CHECKED, not assumed from the save. You saved a comment you
     * could read; being removed from a private Space afterwards must drop it out
     * of your Later tab, not keep serving you its body. `assertTaskReadAccess` is
     * reused per distinct task — a handful of queries for a list of this size,
     * and no second copy of the rules to drift.
     *
     * Archived tasks are left out: a row that opens the bin is a dead end.
     */
    listSavedComments(workspaceId: string, userId: string): Promise<{
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
    createComment(taskId: string, authorId: string, body: string, parentCommentId?: string, mentions?: Array<{
        userId: string;
        offset: number;
        length: number;
    }>, attachmentIds?: string[]): Promise<{
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
    private notifyComment;
    updateComment(commentId: string, authorId: string, body: string): Promise<{
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
    assignComment(commentId: string, actorId: string, userId: string | null): Promise<{
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
    resolveComment(commentId: string, actorId: string, resolved: boolean): Promise<{
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
    private notifyCommentResolved;
    deleteComment(commentId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    /** True if the actor is a workspace_admin / manager / super_admin over the task's workspace. */
    private isTaskWorkspaceModerator;
    toggleReaction(commentId: string, userId: string, emoji: string): Promise<{
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
    createChecklist(taskId: string, title: string, actorId: string): Promise<{
        items: never[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
        title: string;
        taskId: string;
    }>;
    updateChecklist(checklistId: string, patch: {
        title?: string;
        position?: number;
    }): Promise<{
        id: string;
        taskId: string;
        title: string;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteChecklist(checklistId: string): Promise<{
        ok: boolean;
    }>;
    addChecklistItem(checklistId: string, content: string, assigneeId?: string | null, dueDate?: Date | null, actorId?: string | null): Promise<{
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
    }>;
    updateChecklistItem(itemId: string, actorId: string, patch: {
        content?: string;
        isDone?: boolean;
        position?: number;
        dueDate?: Date | null;
        assigneeId?: string | null;
    }): Promise<{
        id: string;
        checklistId: string;
        assigneeId: string | null;
        content: string;
        isDone: boolean;
        position: number;
        dueDate: Date | null;
        completedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteChecklistItem(itemId: string): Promise<{
        ok: boolean;
    }>;
    getDependencyGraph(taskId: string, depth?: number): Promise<{
        rootTaskId: string;
        depth: number;
        metrics: {
            nodeCount: number;
            edgeCount: number;
            blockedByOpenCount: number;
            blocksOpenCount: number;
            longestBlockedByChainDepth: number;
            longestBlocksChainDepth: number;
        };
        nodes: {
            id: string;
            title: string;
            status: string;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            isArchived: boolean;
        }[];
        edges: {
            taskId: string;
            relatedTaskId: string;
            type: DependencyType;
        }[];
    }>;
    addDependency(taskId: string, relatedTaskId: string, type: DependencyType, actorId: string): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        taskId: string;
        type: "blocks" | "blocked_by" | "related_to";
        relatedTaskId: string;
    }>;
    removeDependency(depId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    listActivity(taskId: string, limit?: number): Promise<{
        id: string;
        createdAt: Date;
        taskId: string;
        actorId: string | null;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        actor: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            passwordHash: string | null;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        } | null;
    }[]>;
    /** Aggregated activity across every task in a project (Plan §4 timeline). */
    listProjectActivity(projectId: string, limit?: number, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        id: string;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        createdAt: Date;
        taskId: string;
        taskTitle: string;
        actor: {
            id: string;
            displayName: string | null;
            email: string | null;
        } | null;
    }[]>;
    /**
     * Resolve the billable default for a task's project (§8.3 "set billable
     * default per project"). New timer/manual entries inherit this when the
     * caller doesn't set `isBillable` explicitly.
     */
    private projectDefaultBillable;
    startTimer(taskId: string, userId: string, description?: string, isBillable?: boolean): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
    stopTimer(entryId: string, userId: string): Promise<{
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    addManualTimeEntry(data: {
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date;
        description?: string;
        isBillable?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
    /** Fire the outgoing 'time.logged' webhook (Plan §12), best-effort. */
    private fireTimeLogged;
    listTimeEntries(taskId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
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
    }[]>;
    getActiveTimer(userId: string): Promise<{
        id: string;
        taskId: string;
        userId: string;
        description: string | null;
        startedAt: Date;
        isBillable: boolean;
        taskTitle: string;
        workspaceId: string;
        spaceId: string;
        projectId: string;
        listId: string;
    }>;
    resolveTaskContext(taskId: string): Promise<{
        task: {
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
        list: {
            id: string;
            projectId: string;
            spaceId: string | null;
            name: string;
            description: string | null;
            position: number;
            statusScope: "list" | "project" | "space";
            createdById: string | null;
            isArchived: boolean;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private";
            createdAt: Date;
            updatedAt: Date;
        };
        project: {
            id: string;
            spaceId: string;
            name: string;
            description: string | null;
            color: string | null;
            icon: string | null;
            folderId: string | null;
            clientId: string | null;
            position: number;
            createdById: string | null;
            isArchived: boolean;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private" | null;
            defaultBillable: boolean;
            isDefaultContainer: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        space: {
            id: string;
            workspaceId: string;
            name: string;
            description: string | null;
            color: string | null;
            icon: string | null;
            createdById: string | null;
            isArchived: boolean;
            archivedAt: Date | null;
            archivedById: string | null;
            visibility: "public" | "private";
            viewConfig: {
                defaultView?: string;
                enabledViews?: string[];
            } | null;
            defaultPermission: import("@rundesk/db").SpaceDefaultPermission;
            features: Record<string, boolean> | null;
            presetKey: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    getTaskNavigation(taskId: string): Promise<{
        workspaceId: string;
        spaceId: string;
        projectId: string;
        listId: string;
        taskId: string;
        url: string;
    }>;
}
export {};
