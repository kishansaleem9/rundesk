/**
 * User-created reminders (Plan §4/§10) — "remind me about this at <time>". A
 * background tick fires each due reminder once (notified_at is stamped) and
 * delivers it through the normal notification pipeline. Distinct from the
 * automated due-soon/overdue reminders in RemindersService.
 *
 * §G11 [15:19] — the subject became optional and polymorphic.
 *
 * It used to be `task_id NOT NULL`, which meant a reminder could only hang off
 * a task. Two things paid for that. A reminder on a saved message was
 * impossible, which is what she asked for. And `/remind in 2 hours call Ali`
 * had to invent a task to carry the text — so it littered the list with
 * phantom tasks, and refused outright in a workspace with no list yet, which is
 * an odd thing for an egg-timer to need.
 *
 * Both columns nullable, at most one set: a task, a message, or neither for a
 * plain note. The CHECK is what keeps "polymorphic" from meaning
 * "unconstrained".
 */
export declare const reminders: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "reminders";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "reminders";
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
            tableName: "reminders";
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
            tableName: "reminders";
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
        taskId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "task_id";
            tableName: "reminders";
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
        messageId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "message_id";
            tableName: "reminders";
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
        note: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "note";
            tableName: "reminders";
            dataType: "string";
            columnType: "PgText";
            data: string;
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
        }, {}, {}>;
        remindAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "remind_at";
            tableName: "reminders";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
        notifiedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "notified_at";
            tableName: "reminders";
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
            tableName: "reminders";
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
export declare const remindersRelations: import("node_modules/drizzle-orm").Relations<"reminders", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
    task: import("node_modules/drizzle-orm").One<"tasks", false>;
    message: import("node_modules/drizzle-orm").One<"chat_messages", false>;
}>;
