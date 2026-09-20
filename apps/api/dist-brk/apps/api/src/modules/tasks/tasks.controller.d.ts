import { TasksService } from './tasks.service';
import { PlansService } from '../plans/plans.service';
import { EmailToTaskService } from '../email-to-task/email-to-task.service';
import { CreateTaskDto, AddAttachmentDto } from './dto/task.dto';
import type { CurrentUserPayload } from './types';
export declare class TasksController {
    private tasks;
    private emailToTask;
    private plans;
    constructor(tasks: TasksService, emailToTask: EmailToTaskService, plans: PlansService);
    /**
     * §V2-13, frames `09:26` / `10:42` — REFUSE, don't hide.
     *
     * A paywall the browser draws is not a paywall; it is a `display:none` with a
     * price on it. Both gated surfaces below therefore run this first, and the
     * client's modal is the courtesy, not the control.
     *
     * Fails OPEN on a list whose workspace cannot be resolved, matching
     * `PlanFeatureGuard`: gating must never break a read that used to work, and a
     * list with no workspace is a database problem, not an entitlement one.
     */
    private assertPlanFeature;
    /**
     * §V2-13, frame `09:26` — the rows Team View draws, and the 403 it gets
     * instead when the workspace's plan does not include it.
     */
    getTeamView(listId: string, user: CurrentUserPayload, includeArchived?: string, unassignedLabel?: string): Promise<{
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
    getTimeline(workspaceId: string, user: CurrentUserPayload, projectId?: string): Promise<{
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
    getWorkspaceTasks(workspaceId: string, user: CurrentUserPayload, limit?: string, assigneeId?: string): Promise<{
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
    getMemberTasks(workspaceId: string, userId: string): Promise<{
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
     * §V2-07 — "Customize → Export view → Download".
     *
     * `ResourceMemberGuard`, not `WorkspaceAdminGuard`. The existing export is
     * admin-only and dumps the whole workspace, so the person actually looking at
     * a list — usually not an admin — had no way to download it. Exporting the
     * list you can already read gives away nothing you could not read.
     */
    exportList(listId: string, user: CurrentUserPayload, res: any, columns?: string, fields?: string, format?: string, dateFormat?: string, timeFormat?: string, includeArchived?: string, includeClosed?: string, view?: string): Promise<void>;
    getByList(listId: string, user: CurrentUserPayload, includeSubtasks?: string, includeArchived?: string): Promise<{
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
    getOne(taskId: string): Promise<{
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
    getSubtasks(taskId: string, user: CurrentUserPayload): Promise<{
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
    getTaskNavigation(taskId: string): Promise<{
        workspaceId: string;
        spaceId: string;
        projectId: string;
        listId: string;
        taskId: string;
        url: string;
    }>;
    create(user: CurrentUserPayload, body: CreateTaskDto): Promise<{
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
    update(taskId: string, user: CurrentUserPayload, body: Partial<{
        title: string;
        description: string | null;
        priority: 'urgent' | 'high' | 'normal' | 'low';
        status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
        startDate: string | null;
        dueDate: string | null;
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
    bulkUpdate(user: CurrentUserPayload, body: {
        taskIds: string[];
        patch: Partial<{
            priority: 'urgent' | 'high' | 'normal' | 'low';
            status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
            startDate: string | null;
            dueDate: string | null;
            timeEstimate: number | null;
            isArchived: boolean;
            listId: string;
            assigneeIdsAdd: string[];
            assigneeIdsRemove: string[];
            labelIdsAdd: string[];
            labelIdsRemove: string[];
            dependenciesAdd: Array<{
                relatedTaskId: string;
                type: 'blocks' | 'blocked_by' | 'related_to';
            }>;
            dependenciesRemove: Array<{
                relatedTaskId: string;
                type: 'blocks' | 'blocked_by' | 'related_to';
            }>;
        }>;
    }): Promise<{
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
    createNextRecurring(taskId: string, user: CurrentUserPayload, body: {
        cadenceDays?: number;
        recurrenceRule?: {
            mode: 'daily' | 'weekly' | 'monthly';
            interval?: number;
            weekdays?: number[];
            dayOfMonth?: number;
            skipWeekends?: boolean;
        };
        preserveAssignees?: boolean;
    }): Promise<{
        sourceTaskId: string;
        nextTaskId: string;
        cadenceDays: number | null;
        recurrenceRule: {
            mode: "daily" | "weekly" | "monthly";
            interval?: number;
            weekdays?: number[];
            dayOfMonth?: number;
            skipWeekends?: boolean;
        } | null;
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
    setRecurrence(taskId: string, user: CurrentUserPayload, body: {
        cadenceDays?: number | null;
        rule?: {
            mode: 'daily' | 'weekly' | 'monthly';
            interval?: number;
            weekdays?: number[];
            dayOfMonth?: number;
            skipWeekends?: boolean;
        } | null;
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
    move(taskId: string, user: CurrentUserPayload, body: {
        listId: string;
        position: number;
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
     * §V2-08 `[15:27]` — "yahan par aap ko HISTORY wagera sab cheezein show hoti
     * hain". What this task's description used to say.
     */
    /**
     * §V2-08, frame `15:32` — Merge.
     *
     * `:taskId` is the task being merged AWAY and `targetTaskId` the survivor:
     * "merge this into that", which is the direction the menu item reads in.
     * Both ids go through `ResourceMemberGuard` — the param one here, the body
     * one inside the service, which also checks write access to it. Merging is a
     * write to the target as much as to the source.
     */
    merge(taskId: string, user: CurrentUserPayload, body: {
        targetTaskId: string;
    }): Promise<{
        ok: boolean;
        targetTaskId: string;
        moved: import("./task-merge").MergeMoved;
    }>;
    /**
     * §V2-08, frame `15:32` — "Send email to task". The address that turns an
     * email into a comment on this task. It has worked since email-to-task was
     * written; nothing has ever told anybody it exists.
     */
    emailAddress(taskId: string): Promise<{
        address: string | null;
        listId: string | null;
    }>;
    descriptionHistory(taskId: string): Promise<{
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
    restoreDescription(taskId: string, revisionId: string, user: CurrentUserPayload): Promise<{
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
     * ARCHIVE. Reversible, kept for good, listed under
     * `GET /workspaces/:id/archived-tasks`. The verb is historical — see
     * `deleteTask` — and the menu row that fires this says "Archive".
     */
    delete(taskId: string, user: CurrentUserPayload, ip: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §V2-08 frame `15:32` — **DELETE**, the row under Archive.
     *
     * POST rather than a second DELETE because `DELETE /tasks/:id` is taken by
     * archiving, and overloading it on a query flag is how a destructive action
     * ends up one typo away from the reversible one.
     *
     * Moves the task into the workspace Trash: restorable from there via
     * `POST /workspaces/:id/trash/task/:taskId/restore`, permanently removed by
     * `DELETE /workspaces/:id/trash/task/:taskId`, and purged automatically after
     * the retention window the response reports.
     */
    moveToTrash(taskId: string, user: CurrentUserPayload, ip: string): Promise<{
        ok: boolean;
        deletedAt: string;
        retentionDays: number;
    }>;
    /** Un-archive. Refuses a task that is in the Trash — that restore is the trash one. */
    restore(taskId: string, user: CurrentUserPayload): Promise<{
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
    addAssignee(taskId: string, user: CurrentUserPayload, body: {
        userId: string;
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
    removeAssignee(taskId: string, userId: string, actor: CurrentUserPayload): Promise<{
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
    addLabel(taskId: string, labelId: string, user: CurrentUserPayload): Promise<{
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
    removeLabel(taskId: string, labelId: string, user: CurrentUserPayload): Promise<{
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
    listLinkedDocs(taskId: string, user: CurrentUserPayload): Promise<{
        id: string;
        docId: string;
        title: string;
        icon: string | null;
        isArchived: boolean;
        linkedAt: Date;
    }[]>;
    linkDoc(taskId: string, user: CurrentUserPayload, body: {
        docId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        taskId: string;
        docId: string;
    }>;
    unlinkDoc(taskId: string, docId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    addWatcher(taskId: string, body: {
        userId: string;
    }, user: CurrentUserPayload): Promise<{
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
    removeWatcher(taskId: string, userId: string, user: CurrentUserPayload): Promise<{
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
    listAttachments(taskId: string, user: CurrentUserPayload): Promise<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedBy: string | null;
        createdAt: Date;
        storageKey: string;
        url: string;
    }[]>;
    addAttachment(taskId: string, user: CurrentUserPayload, body: AddAttachmentDto): Promise<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedBy: string | null;
        createdAt: Date;
        storageKey: string;
        url: string;
    }>;
    presignAttachmentUpload(taskId: string, user: CurrentUserPayload, body: {
        fileName: string;
        contentType?: string;
        sizeBytes?: number;
    }): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    removeAttachment(taskId: string, attachmentId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
