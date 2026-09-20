/**
 * A reusable single-task template scoped to a workspace.
 *
 * Captures everything you'd want to clone when creating a new task
 * from a recipe: title, description, priority, time estimate,
 * date offsets (relative to instantiation), labels (by name so the
 * template survives label renames), checklists with items, one level
 * of subtasks, and custom-field values keyed by field name (resolved
 * to the target project's field definitions at instantiate time).
 *
 * Status is intentionally NOT captured — each list owns its own
 * custom statuses, so instantiation picks the first 'open' status
 * of the target list to stay portable across pipelines.
 */
export declare const taskTemplates: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_templates";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_templates";
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
            tableName: "task_templates";
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
            tableName: "task_templates";
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
        description: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "task_templates";
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
        icon: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "icon";
            tableName: "task_templates";
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
        payload: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "payload";
            tableName: "task_templates";
            dataType: "json";
            columnType: "PgJsonb";
            data: TaskTemplatePayload;
            driverParam: unknown;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: TaskTemplatePayload;
        }>;
        usageCount: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "usage_count";
            tableName: "task_templates";
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
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "task_templates";
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
            tableName: "task_templates";
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
            tableName: "task_templates";
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
export declare const taskTemplatesRelations: import("node_modules/drizzle-orm").Relations<"task_templates", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    createdBy: import("node_modules/drizzle-orm").One<"users", false>;
}>;
/**
 * Authoritative shape for `taskTemplates.payload`. Re-exported from
 * task-templates.service.ts is the source of truth; this re-declaration
 * lives in the schema only so Drizzle's `$type<>` can type the column.
 * Keep the two in sync.
 */
export type TaskTemplatePayload = {
    title: string;
    description: string | null;
    priority: 'urgent' | 'high' | 'normal' | 'low';
    timeEstimate: number | null;
    startDateOffsetDays: number | null;
    dueDateOffsetDays: number | null;
    labels: string[];
    checklists: Array<{
        title: string;
        items: Array<{
            content: string;
        }>;
    }>;
    subtasks: Array<{
        title: string;
        description: string | null;
        priority: 'urgent' | 'high' | 'normal' | 'low';
        timeEstimate: number | null;
        dueDateOffsetDays: number | null;
    }>;
    customFieldValues: Array<{
        fieldName: string;
        value: string | number | boolean | string[] | null;
    }>;
};
