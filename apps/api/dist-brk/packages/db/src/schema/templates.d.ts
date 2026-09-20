/**
 * §V2-13 / frame `12:14` — the Template Center's browse facets.
 *
 * These four arrays ARE the vocabulary and ARE the order the rail draws them
 * in. They live here, once, because the frame's rail is a list that would
 * otherwise get written out in the seed, the service, the API contract and the
 * page — four copies, three of which drift (see "the duplicated list"). The
 * server sends the values with their counts and the web app renders what it was
 * sent; it holds labels, not a second vocabulary.
 *
 * `TEMPLATE_TARGET_TYPES` is deliberately THREE of the frame's seven. Space,
 * Folder and List are the three a project template can genuinely BE, and
 * `apply` honours all three. Task and Doc templates are separate tables with
 * their own surfaces (`task_templates`, `doc_templates`); View and Whiteboard
 * templates do not exist in Rundesk at all. Offering those four here would be
 * four checkboxes that can only ever return nothing — a facade with a count
 * beside it.
 */
export declare const TEMPLATE_TARGET_TYPES: readonly ["space", "folder", "list"];
export type TemplateTargetType = (typeof TEMPLATE_TARGET_TYPES)[number];
export declare const TEMPLATE_COMPLEXITIES: readonly ["beginner", "intermediate", "advanced"];
export type TemplateComplexity = (typeof TEMPLATE_COMPLEXITIES)[number];
/** The body sections the gallery groups into (frame: "Marketing", "PMO …"). */
export declare const TEMPLATE_CATEGORIES: readonly ["engineering", "marketing", "operations", "product"];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
/** The job a template does — the frame's top-bar "Use Cases" dropdown. */
export declare const TEMPLATE_USE_CASES: readonly ["planning", "launch", "onboarding", "support"];
export type TemplateUseCase = (typeof TEMPLATE_USE_CASES)[number];
/**
 * Project templates — a reusable scaffold of (project + lists + task stubs)
 * that an admin can save once and re-apply when starting new work.
 *
 * The full structure is denormalized into `payload` so that template
 * application is a pure read of a single row plus a tx of inserts —
 * no risk of drift from later edits to the original project.
 */
export declare const projectTemplates: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "project_templates";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "project_templates";
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
            tableName: "project_templates";
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
            tableName: "project_templates";
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
            tableName: "project_templates";
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
            tableName: "project_templates";
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
            tableName: "project_templates";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                lists: Array<{
                    name: string;
                    position?: number;
                    tasks: Array<{
                        title: string;
                        description?: string | null;
                        priority?: "urgent" | "high" | "normal" | "low";
                        status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                    }>;
                }>;
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
                lists: Array<{
                    name: string;
                    position?: number;
                    tasks: Array<{
                        title: string;
                        description?: string | null;
                        priority?: "urgent" | "high" | "normal" | "low";
                        status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";
                    }>;
                }>;
            };
        }>;
        isBuiltIn: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_built_in";
            tableName: "project_templates";
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
        targetType: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "target_type";
            tableName: "project_templates";
            dataType: "string";
            columnType: "PgText";
            data: "list" | "space" | "folder";
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
            $type: "list" | "space" | "folder";
        }>;
        complexity: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "complexity";
            tableName: "project_templates";
            dataType: "string";
            columnType: "PgText";
            data: "beginner" | "intermediate" | "advanced";
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
            $type: "beginner" | "intermediate" | "advanced";
        }>;
        category: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "category";
            tableName: "project_templates";
            dataType: "string";
            columnType: "PgText";
            data: "engineering" | "marketing" | "operations" | "product";
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
            $type: "engineering" | "marketing" | "operations" | "product";
        }>;
        useCase: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "use_case";
            tableName: "project_templates";
            dataType: "string";
            columnType: "PgText";
            data: "planning" | "launch" | "onboarding" | "support";
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
            $type: "planning" | "launch" | "onboarding" | "support";
        }>;
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "project_templates";
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
            tableName: "project_templates";
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
            tableName: "project_templates";
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
export declare const projectTemplatesRelations: import("node_modules/drizzle-orm").Relations<"project_templates", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", false>;
    createdBy: import("node_modules/drizzle-orm").One<"users", false>;
}>;
