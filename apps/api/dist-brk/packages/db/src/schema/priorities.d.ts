/**
 * §G06 [05:54] — "meri PRIORITIES kya hain — yaani ke aaj ke din mein mere
 * kaun se important task hain jo karne hain."
 *
 * The one thing on that profile panel that is a *decision* rather than a
 * derived list. Everything else there — assigned to me, today and overdue,
 * recent activity — is the app telling you what it already knows. This is the
 * person saying "out of all of that, these are the ones that matter today",
 * and nothing in the product could hold that answer.
 *
 * Favourites are the nearest existing thing and are not it: a favourite pins a
 * task into the sidebar rail permanently. That is a bookmark. This is a short,
 * ordered, disposable list you rewrite most mornings.
 *
 * Two kinds of row on purpose. A priority can point at a task you already have
 * — which keeps it live, so its title and status follow the task — or it can be
 * a line you typed, because "call the accountant" is a real priority that does
 * not deserve a task with a list and a status behind it. Requiring a task
 * first would make the fast case slow, which is how a daily list stops being
 * used by the second week.
 *
 * Deliberately NOT cleared at midnight. "Today's" describes what it is for,
 * not a retention policy — and a list that empties itself overnight loses work
 * somebody did on purpose. Ticking things off is how it clears.
 */
export declare const userPriorities: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "user_priorities";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "user_priorities";
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
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "user_priorities";
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
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "user_priorities";
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
            tableName: "user_priorities";
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
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "user_priorities";
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
        position: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "position";
            tableName: "user_priorities";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
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
        doneAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "done_at";
            tableName: "user_priorities";
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
            tableName: "user_priorities";
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
export declare const userPrioritiesRelations: import("node_modules/drizzle-orm").Relations<"user_priorities", {
    user: import("node_modules/drizzle-orm").One<"users", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    task: import("node_modules/drizzle-orm").One<"tasks", false>;
}>;
