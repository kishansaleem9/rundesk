export declare const taskWatchers: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_watchers";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_watchers";
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
            tableName: "task_watchers";
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
            tableName: "task_watchers";
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
        addedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "added_at";
            tableName: "task_watchers";
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
export declare const taskWatchersRelations: import("node_modules/drizzle-orm").Relations<"task_watchers", {
    task: import("node_modules/drizzle-orm").One<"tasks", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
