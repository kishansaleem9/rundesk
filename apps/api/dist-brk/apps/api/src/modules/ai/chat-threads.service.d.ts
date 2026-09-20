import type { Db } from '@rundesk/db';
import { AiService } from './ai.service';
import { TasksService } from '../tasks/tasks.service';
import { DocsService } from '../docs/docs.service';
/**
 * §15 — AI chats that outlive the panel, and name themselves.
 *
 * Frames `296_1817` → `297_1820` → `304_1907`: "New Chat" becomes "Skill
 * Definition and Ideas" and is still in the sidebar after the panel closes.
 *
 * A thread belongs to one person. These are working notes, often half-formed —
 * making them workspace-visible would publish thinking nobody chose to share.
 */
export declare class ChatThreadsService {
    private db;
    private ai;
    private tasks;
    private docs;
    constructor(db: Db, ai: AiService, tasks: TasksService, docs: DocsService);
    list(workspaceId: string, userId: string): Omit<import("drizzle-orm/pg-core").PgSelectBase<"ai_chat_threads", {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        skillId: import("drizzle-orm/pg-core").PgColumn<{
            name: "skill_id";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "ai_chat_threads";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        /**
         * Written out rather than interpolated. Inside a `.select({})`
         * projection drizzle renders a column reference UNQUALIFIED, so
         * `${aiChatMessages.threadId} = ${aiChatThreads.id}` came out as
         * `where "thread_id" = "id"` — a message's own two columns compared to
         * each other. It matches nothing, returns 0 for every thread, and
         * raises no error at all. Caught by the count check against real
         * Postgres; nothing about the TypeScript looked wrong.
         */
        messageCount: import("drizzle-orm").SQL<number>;
    }, "partial", Record<"ai_chat_threads", "not-null">, false, "where" | "orderBy" | "limit", {
        id: string;
        title: string;
        skillId: string | null;
        updatedAt: Date;
        messageCount: number;
    }[], {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        skillId: import("drizzle-orm/pg-core").PgColumn<{
            name: "skill_id";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "ai_chat_threads";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        messageCount: import("drizzle-orm").DrizzleTypeError<"You cannot reference this field without assigning it an alias first - use `.as(<alias>)`">;
    }>, "where" | "orderBy" | "limit">;
    /**
     * 404 rather than 403 on someone else's thread — the same rule as skills, and
     * for the same reason: a 403 confirms the id names a real conversation.
     */
    private own;
    get(workspaceId: string, userId: string, threadId: string): Promise<{
        messages: {
            id: string;
            threadId: string;
            role: "user" | "assistant";
            content: string;
            feedback: "up" | "down" | null;
            createdAt: Date;
        }[];
        id: string;
        workspaceId: string;
        userId: string;
        title: string;
        titleIsAuto: "yes" | "no";
        skillId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(workspaceId: string, userId: string, skillId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        title: string;
        userId: string;
        skillId: string | null;
        titleIsAuto: "yes" | "no";
    }>;
    /**
     * Append a turn, then name the thread if this is the exchange that made it
     * about something.
     *
     * Naming is best-effort and deliberately never fails the append: losing the
     * message because the title could not be generated would trade the thing
     * being stored for the label on it.
     */
    append(workspaceId: string, userId: string, threadId: string, turn: {
        role: 'user' | 'assistant';
        content: string;
    }): Promise<{
        message: {
            id: string;
            createdAt: Date;
            role: "user" | "assistant";
            content: string;
            threadId: string;
            feedback: "up" | "down" | null;
        };
        title: string | undefined;
    }>;
    private maybeTitle;
    /**
     * Fetch one message, having proved the caller owns its thread.
     *
     * Every action below goes through this rather than reading by message id:
     * a message id alone names nothing the caller has been shown to own, and
     * three separate access checks is three chances to write one wrong.
     */
    private ownMessage;
    /** The oldest live list in the workspace — the same rule `/task` in chat uses. */
    private defaultList;
    /** "Create task from this" — the second icon. */
    createTaskFrom(workspaceId: string, userId: string, threadId: string, messageId: string): Promise<{
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
    }>;
    /** "Save to doc" — the third icon. */
    saveToDoc(workspaceId: string, userId: string, threadId: string, messageId: string): Promise<{
        doc: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            isArchived: boolean;
            workspaceId: string;
            icon: string | null;
            createdById: string | null;
            archivedAt: Date | null;
            archivedById: string | null;
            spaceId: string | null;
            position: number;
            title: string;
            coverImageUrl: string | null;
            parentDocId: string | null;
            content: Record<string, unknown>;
            plaintext: string;
            publicShareId: string | null;
            publicShareEnabledAt: Date | null;
        };
    }>;
    /** Thumbs up / down — the last two icons. Pressing the same one again clears it. */
    setFeedback(workspaceId: string, userId: string, threadId: string, messageId: string, feedback: 'up' | 'down' | null): Promise<{
        id: string;
        threadId: string;
        role: "user" | "assistant";
        content: string;
        feedback: "up" | "down" | null;
        createdAt: Date;
    }>;
    /** A person renaming their own thread turns the automatic naming off for good. */
    rename(workspaceId: string, userId: string, threadId: string, title: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        title: string;
        titleIsAuto: "yes" | "no";
        skillId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, userId: string, threadId: string): Promise<{
        ok: boolean;
    }>;
}
