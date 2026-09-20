export declare const taskComments: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_comments";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_comments";
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
        taskId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "task_id";
            tableName: "task_comments";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        authorId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "author_id";
            tableName: "task_comments";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        assignedToUserId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "assigned_to_user_id";
            tableName: "task_comments";
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
        resolvedByUserId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "resolved_by_user_id";
            tableName: "task_comments";
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
        resolvedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "resolved_at";
            tableName: "task_comments";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        parentCommentId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "parent_comment_id";
            tableName: "task_comments";
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
        body: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "body";
            tableName: "task_comments";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        mentions: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "mentions";
            tableName: "task_comments";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                userId: string;
                offset: number;
                length: number;
            }[];
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: {
                userId: string;
                offset: number;
                length: number;
            }[];
        }>;
        editedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "edited_at";
            tableName: "task_comments";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_comments";
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
    };
    dialect: "pg";
}>;
export declare const taskCommentReactions: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_comment_reactions";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_comment_reactions";
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
        commentId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "comment_id";
            tableName: "task_comment_reactions";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "task_comment_reactions";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        emoji: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "emoji";
            tableName: "task_comment_reactions";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_comment_reactions";
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
    };
    dialect: "pg";
}>;
/**
 * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
 *
 * The save on a comment is the same gesture as the save on a chat message, so
 * it is the same shape: one private row per person per comment, no shared
 * state. `chat_message_saves` is the sibling, and the reason this is a table
 * rather than a flag on the comment is the same reason it is there — two people
 * saving the same comment must not see each other's bookmark.
 *
 * NO TAGS COLUMN, deliberately. `chat_message_saves.tags` exists because chat's
 * Saved panel filters by tag; nothing in the frames tags a saved comment, and a
 * column no reader honours is this codebase's named defect.
 *
 * Where they surface: the Inbox's **Later** tab, beside the saved messages
 * §2.2 put there — which is also where ClickUp puts them ("hover over the
 * comment … it will be added to the Later tab in your Inbox").
 */
export declare const taskCommentSaves: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_comment_saves";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_comment_saves";
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
        commentId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "comment_id";
            tableName: "task_comment_saves";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "task_comment_saves";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_comment_saves";
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
    };
    dialect: "pg";
}>;
export declare const taskCommentSavesRelations: import("node_modules/drizzle-orm").Relations<"task_comment_saves", {
    comment: import("node_modules/drizzle-orm").One<"task_comments", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
export declare const taskCommentsRelations: import("node_modules/drizzle-orm").Relations<"task_comments", {
    task: import("node_modules/drizzle-orm").One<"tasks", true>;
    author: import("node_modules/drizzle-orm").One<"users", true>;
    assignee: import("node_modules/drizzle-orm").One<"users", false>;
    resolver: import("node_modules/drizzle-orm").One<"users", false>;
    parent: import("node_modules/drizzle-orm").One<"task_comments", false>;
    replies: import("node_modules/drizzle-orm").Many<"task_comments">;
    reactions: import("node_modules/drizzle-orm").Many<"task_comment_reactions">;
}>;
export declare const taskCommentReactionsRelations: import("node_modules/drizzle-orm").Relations<"task_comment_reactions", {
    comment: import("node_modules/drizzle-orm").One<"task_comments", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
