export declare const customFieldTypeEnum: import("node_modules/drizzle-orm/pg-core").PgEnum<["text", "number", "dropdown", "date", "checkbox", "url", "email", "phone", "money", "rating", "progress_auto", "long_text", "labels", "people", "location", "tshirt_size", "progress_manual", "files", "voting"]>;
/**
 * A custom-field DEFINITION lives at the project level. It can optionally
 * be limited to a specific list (listId not null) but typically applies
 * to every list inside the project.
 */
export declare const customFieldDefinitions: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "custom_field_definitions";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "custom_field_definitions";
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
        projectId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "project_id";
            tableName: "custom_field_definitions";
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
        listId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "list_id";
            tableName: "custom_field_definitions";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "custom_field_definitions";
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
        type: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "type";
            tableName: "custom_field_definitions";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["text", "number", "dropdown", "date", "checkbox", "url", "email", "phone", "money", "rating", "progress_auto", "long_text", "labels", "people", "location", "tshirt_size", "progress_manual", "files", "voting"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        isRequired: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_required";
            tableName: "custom_field_definitions";
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
        position: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "position";
            tableName: "custom_field_definitions";
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
        options: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "options";
            tableName: "custom_field_definitions";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                label: string;
                value: string;
                color?: string;
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
                label: string;
                value: string;
                color?: string;
            }[];
        }>;
        config: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "config";
            tableName: "custom_field_definitions";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
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
            $type: Record<string, unknown>;
        }>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "custom_field_definitions";
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
            tableName: "custom_field_definitions";
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
 * Per-task value for a given custom field. Stored as JSON for type
 * flexibility; the service layer enforces type → JSON shape.
 */
export declare const customFieldValues: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "custom_field_values";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "custom_field_values";
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
            tableName: "custom_field_values";
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
        fieldId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "field_id";
            tableName: "custom_field_values";
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
        value: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "value";
            tableName: "custom_field_values";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                v: string | number | boolean | string[] | null;
            };
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
            $type: {
                v: string | number | boolean | string[] | null;
            };
        }>;
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "custom_field_values";
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
export declare const customFieldDefinitionsRelations: import("node_modules/drizzle-orm").Relations<"custom_field_definitions", {
    project: import("node_modules/drizzle-orm").One<"projects", true>;
    list: import("node_modules/drizzle-orm").One<"lists", false>;
    values: import("node_modules/drizzle-orm").Many<"custom_field_values">;
}>;
export declare const customFieldValuesRelations: import("node_modules/drizzle-orm").Relations<"custom_field_values", {
    task: import("node_modules/drizzle-orm").One<"tasks", true>;
    definition: import("node_modules/drizzle-orm").One<"custom_field_definitions", true>;
}>;
