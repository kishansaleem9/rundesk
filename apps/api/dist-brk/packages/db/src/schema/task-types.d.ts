/**
 * What a task *is* — Task, Milestone, Campaign, Invoice. ClickUp calls these
 * Task Types. Workspace-scoped, because the vocabulary a team works in is a
 * property of that team.
 *
 * A task keeps its own row when a type is deleted (`SET NULL`): losing the
 * label must never lose the work.
 */
export declare const taskTypes: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_types";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_types";
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
            tableName: "task_types";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "task_types";
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
        icon: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "icon";
            tableName: "task_types";
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
        color: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "color";
            tableName: "task_types";
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
        isDefault: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_default";
            tableName: "task_types";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        isMilestone: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_milestone";
            tableName: "task_types";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        origin: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "origin";
            tableName: "task_types";
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
            tableName: "task_types";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_types";
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
            tableName: "task_types";
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
export declare const taskTypesRelations: import("node_modules/drizzle-orm").Relations<"task_types", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
}>;
/**
 * §1.1 — what a workspace starts with.
 *
 * Lives beside the table rather than in one service because workspaces are
 * created from two places: workspaces.service.create() and, for the very first
 * workspace of a new account, auth.service.signUp() which inserts the row
 * itself. Seeding only the first left every account created through signup with
 * no types at all — and all three type controls hide themselves when a
 * workspace has none, so the feature was invisible on exactly the path most
 * workspaces are born on.
 *
 * Migration 0093 backfills the same pair into workspaces that predate this.
 */
export declare const DEFAULT_TASK_TYPES: readonly [{
    readonly name: "Task";
    readonly icon: "✓";
    readonly isDefault: true;
    readonly isMilestone: false;
    readonly origin: null;
    readonly position: 0;
}, {
    readonly name: "Milestone";
    readonly icon: "◆";
    readonly isDefault: false;
    readonly isMilestone: true;
    readonly origin: null;
    readonly position: 1;
}, {
    readonly name: "Form Response";
    readonly icon: "▤";
    readonly isDefault: false;
    readonly isMilestone: false;
    readonly origin: "form";
    readonly position: 2;
}, {
    readonly name: "Meeting Note";
    readonly icon: "✎";
    readonly isDefault: false;
    readonly isMilestone: false;
    readonly origin: "meeting";
    readonly position: 3;
}];
