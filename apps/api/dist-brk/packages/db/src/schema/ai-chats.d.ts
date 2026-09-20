/**
 * §15 — AI chats that outlive the panel.
 *
 * Frames `296_1817` → `297_1820` → `301_1836`: a conversation starts as
 * "New Chat", renames itself from its own content to "Skill Definition and
 * Ideas", and is still listed in the sidebar at `304_1907` after the panel has
 * been closed.
 *
 * Rundesk's AI panel held its messages in React state, so closing it threw the
 * conversation away — including, in the flow this section is about, the one
 * where you and the assistant worked out what a skill should be.
 */
export declare const aiChatThreads: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "ai_chat_threads";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "ai_chat_threads";
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
            tableName: "ai_chat_threads";
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
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        titleIsAuto: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title_is_auto";
            tableName: "ai_chat_threads";
            dataType: "string";
            columnType: "PgText";
            data: "yes" | "no";
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
        }, {}, {
            $type: "yes" | "no";
        }>;
        skillId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
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
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
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
    };
    dialect: "pg";
}>;
export declare const aiChatMessages: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "ai_chat_messages";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "ai_chat_messages";
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
        threadId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "thread_id";
            tableName: "ai_chat_messages";
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
        role: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "role";
            tableName: "ai_chat_messages";
            dataType: "string";
            columnType: "PgText";
            data: "user" | "assistant";
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
        }, {}, {
            $type: "user" | "assistant";
        }>;
        content: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "content";
            tableName: "ai_chat_messages";
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
        feedback: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "feedback";
            tableName: "ai_chat_messages";
            dataType: "string";
            columnType: "PgText";
            data: "up" | "down";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: "up" | "down";
        }>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "ai_chat_messages";
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
export declare const aiChatThreadsRelations: import("node_modules/drizzle-orm").Relations<"ai_chat_threads", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
    skill: import("node_modules/drizzle-orm").One<"skills", false>;
    messages: import("node_modules/drizzle-orm").Many<"ai_chat_messages">;
}>;
export declare const aiChatMessagesRelations: import("node_modules/drizzle-orm").Relations<"ai_chat_messages", {
    thread: import("node_modules/drizzle-orm").One<"ai_chat_threads", true>;
}>;
