/**
 * One row per Claude API call (Plan §7.15). Token counts drive per-user and
 * per-workspace usage + estimated-cost reporting. workspace_id/user_id are
 * nullable (SET NULL on delete) so historical usage survives member removal.
 *
 * §V2-11, frame `19:05` — THE TABLE NOW RECORDS FAILURES TOO, and that is the
 * whole reason a Status filter can exist. Until migration 0150 `recordUsage`
 * fired only on the success path, so every row in here was a success and a
 * "Status" control would have been a dropdown with one reachable value — the
 * facade this audit exists to catch. `status` has no default of convenience:
 * every writer states which one it is.
 */
export declare const aiUsage: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "ai_usage";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "ai_usage";
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
            tableName: "ai_usage";
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
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "ai_usage";
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
        feature: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "feature";
            tableName: "ai_usage";
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
        model: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "model";
            tableName: "ai_usage";
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
        inputTokens: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "input_tokens";
            tableName: "ai_usage";
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
        outputTokens: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "output_tokens";
            tableName: "ai_usage";
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
        status: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "ai_usage";
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
        errorCode: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "error_code";
            tableName: "ai_usage";
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
        errorMessage: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "error_message";
            tableName: "ai_usage";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "ai_usage";
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
export declare const aiUsageRelations: import("node_modules/drizzle-orm").Relations<"ai_usage", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", false>;
    user: import("node_modules/drizzle-orm").One<"users", false>;
}>;
/**
 * §V2-S18 `[17:28]`–`[17:32]` — "apna [preferred] AI bhi set down karna hai."
 *
 * WHY THIS TABLE EXISTS AT ALL. The composer's model picker has had a
 * preference since §15, and it lived in `localStorage` under `rundesk.aiTier`.
 * That is not a preference, it is a per-browser habit: sign in from a second
 * machine, or from a private window, and the choice you "set" is gone. The
 * frame calls it *setting your preferred AI*, and a preferred anything has to
 * follow the person.
 *
 * PER WORKSPACE, NOT PER ACCOUNT. Somebody can reasonably want the cheap fast
 * tier in a busy shared workspace and the deep one where they do the thinking,
 * and a single account-wide value cannot express that. `(user_id, workspace_id)`
 * is unique, so the write is an idempotent upsert rather than a read-then-write.
 *
 * DELIBERATELY CO-LOCATED with `ai_usage` rather than given its own file: the
 * schema barrel re-exports this module already, and this audit runs several
 * agents over one tree, so a new file would mean editing a shared index for one
 * line. The table is AI-domain state either way.
 */
export declare const aiModelPreferences: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "ai_model_preferences";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "ai_model_preferences";
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
            tableName: "ai_model_preferences";
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
            tableName: "ai_model_preferences";
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
        preferredTier: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "preferred_tier";
            tableName: "ai_model_preferences";
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
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "ai_model_preferences";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "ai_model_preferences";
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
export declare const aiModelPreferencesRelations: import("node_modules/drizzle-orm").Relations<"ai_model_preferences", {
    user: import("node_modules/drizzle-orm").One<"users", true>;
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
}>;
